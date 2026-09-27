use std::ffi::{CStr, c_char, c_void};
use std::ptr::{self, null, null_mut};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, Ordering};

use clap_sys::audio_buffer::clap_audio_buffer;
use clap_sys::events::{
    CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_PARAM_VALUE, clap_event_param_value, clap_input_events,
    clap_output_events,
};
use clap_sys::ext::params::{CLAP_EXT_PARAMS, CLAP_PARAM_RESCAN_VALUES, clap_host_params};
use clap_sys::host::clap_host;
use clap_sys::plugin::{clap_plugin, clap_plugin_descriptor};
use clap_sys::process::{
    CLAP_PROCESS_CONTINUE, CLAP_PROCESS_ERROR, clap_process, clap_process_status,
};
use clap_sys::stream::{clap_istream, clap_ostream};
use manifold_native::DEFAULT_TYPE_PARAMETERS;
use manifold_native::host_buffers::{HostBuffers, RawHostBlock};
use manifold_native::parameters::{HOST_SLOT_BASE, TimedAutomation};
use manifold_native::project::{NativeProject, PreparedNativeProject};

use crate::{DEFAULTS, SOURCE_PROJECT, TYPE_LABELS};

const MAX_STATE_BYTES: usize = 45 * 1024 * 1024;
const MAX_EVENTS: usize = 1024;

struct Runtime {
    prepared: PreparedNativeProject,
    buffers: HostBuffers,
    automation: Vec<TimedAutomation>,
}

pub(crate) struct Instance {
    pub plugin: clap_plugin,
    host: *const clap_host,
    current: AtomicPtr<Runtime>,
    pending: AtomicPtr<Runtime>,
    retired: AtomicPtr<Runtime>,
    active: AtomicBool,
    rescan_needed: AtomicBool,
    sample_rate: Mutex<Option<(f32, usize)>>,
    state: Mutex<Vec<u8>>,
    values: [AtomicU32; 7],
    type_values: [[AtomicU32; 5]; 21],
    type_values_valid: AtomicBool,
}

// CLAP serializes process calls per instance. Its state extension runs on the
// main thread; Runtime is exclusively owned by the audio callback while active.
unsafe impl Sync for Instance {}

impl Instance {
    pub fn new(
        host: *const clap_host,
        descriptor: *const clap_plugin_descriptor,
        extension: unsafe extern "C" fn(*const clap_plugin, *const c_char) -> *const c_void,
    ) -> Box<Self> {
        let mut instance = Box::new(Self {
            plugin: clap_plugin {
                desc: descriptor,
                plugin_data: null_mut(),
                init: Some(plugin_init),
                destroy: Some(plugin_destroy),
                activate: Some(plugin_activate),
                deactivate: Some(plugin_deactivate),
                start_processing: Some(plugin_start),
                stop_processing: Some(plugin_stop),
                reset: Some(plugin_reset),
                process: Some(plugin_process),
                get_extension: Some(extension),
                on_main_thread: Some(plugin_main_thread),
            },
            host,
            current: AtomicPtr::new(null_mut()),
            pending: AtomicPtr::new(null_mut()),
            retired: AtomicPtr::new(null_mut()),
            active: AtomicBool::new(false),
            rescan_needed: AtomicBool::new(false),
            sample_rate: Mutex::new(None),
            state: Mutex::new(SOURCE_PROJECT.to_vec()),
            values: DEFAULTS.map(|value| AtomicU32::new(value.to_bits())),
            type_values: DEFAULT_TYPE_PARAMETERS
                .map(|row| row.map(|value| AtomicU32::new(value.to_bits()))),
            type_values_valid: AtomicBool::new(true),
        });
        instance.plugin.plugin_data = &mut *instance as *mut Self as *mut c_void;
        instance
    }

    fn value(&self, index: usize) -> f32 {
        f32::from_bits(self.values[index].load(Ordering::Acquire))
    }

    fn capture_state(&self) -> Option<Vec<u8>> {
        let state = self.state.lock().ok()?;
        let mut doc: serde_json::Value = serde_json::from_slice(&state).ok()?;
        let entries = doc["signal"]["initialParameters"].as_array_mut()?;
        for index in 0..7 {
            if let Some(entry) = entries
                .iter_mut()
                .find(|entry| entry["nodeId"] == 2 && entry["id"] == index)
            {
                entry["value"] = serde_json::Value::from(self.value(index));
            } else {
                entries.push(
                    serde_json::json!({"nodeId": 2, "id": index, "value": self.value(index)}),
                );
            }
        }
        if self.type_values_valid.load(Ordering::Acquire) {
            let mut table = serde_json::Map::new();
            for effect_type in 0..21 {
                let values: [f32; 5] = std::array::from_fn(|index| {
                    f32::from_bits(self.type_values[effect_type][index].load(Ordering::Acquire))
                });
                table.insert(effect_type.to_string(), serde_json::json!(values));
            }
            let selected = self.value(0) as usize;
            if selected < 21 {
                table.insert(
                    selected.to_string(),
                    serde_json::json!(
                        std::array::from_fn::<_, 5, _>(|index| self.value(index + 2))
                    ),
                );
            }
            doc["typeParameters"] = serde_json::Value::Object(table);
        }
        serde_json::to_vec(&doc)
            .ok()
            .filter(|bytes| bytes.len() <= MAX_STATE_BYTES)
    }

    fn prepared(&self, bytes: &[u8], sample_rate: f32, max_frames: usize) -> Option<Box<Runtime>> {
        let parsed = NativeProject::parse_fx_module(bytes).ok()?;
        let prepared = parsed.prepare_with_state(sample_rate, max_frames).ok()?;
        Some(Box::new(Runtime {
            prepared,
            buffers: HostBuffers::prepare(max_frames),
            automation: Vec::with_capacity(MAX_EVENTS),
        }))
    }

    fn retire_old(&self) {
        let old = self.retired.swap(null_mut(), Ordering::AcqRel);
        if !old.is_null() {
            // SAFETY: Only the main thread retires a published old runtime.
            unsafe {
                drop(Box::from_raw(old));
            }
        }
    }

    fn deactivate(&self) {
        self.active.store(false, Ordering::Release);
        for pointer in [&self.current, &self.pending, &self.retired] {
            let old = pointer.swap(null_mut(), Ordering::AcqRel);
            if !old.is_null() {
                // SAFETY: CLAP deactivation follows stopping this instance's callback.
                unsafe {
                    drop(Box::from_raw(old));
                }
            }
        }
        if let Ok(mut configuration) = self.sample_rate.lock() {
            *configuration = None;
        }
    }
}

unsafe fn instance<'a>(plugin: *const clap_plugin) -> Option<&'a Instance> {
    if plugin.is_null() {
        return None;
    }
    let data = unsafe { (*plugin).plugin_data as *const Instance };
    if data.is_null() {
        None
    } else {
        Some(unsafe { &*data })
    }
}

unsafe extern "C" fn plugin_init(plugin: *const clap_plugin) -> bool {
    unsafe { instance(plugin).is_some() }
}
unsafe extern "C" fn plugin_destroy(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { instance(plugin) } {
        instance.deactivate();
        // SAFETY: The factory allocated this Box and transfers it here.
        unsafe {
            drop(Box::from_raw(instance as *const Instance as *mut Instance));
        }
    }
}
unsafe extern "C" fn plugin_activate(
    plugin: *const clap_plugin,
    rate: f64,
    _min: u32,
    max: u32,
) -> bool {
    let Some(instance) = (unsafe { instance(plugin) }) else {
        return false;
    };
    if !rate.is_finite()
        || !(1_000. ..=768_000.).contains(&rate)
        || max == 0
        || max > 65_536
        || instance.active.load(Ordering::Acquire)
    {
        return false;
    }
    let Some(state) = instance.capture_state() else {
        return false;
    };
    let Some(runtime) = instance.prepared(&state, rate as f32, max as usize) else {
        return false;
    };
    publish_processor_snapshot(instance, &runtime, false);
    instance
        .current
        .store(Box::into_raw(runtime), Ordering::Release);
    if let Ok(mut configuration) = instance.sample_rate.lock() {
        *configuration = Some((rate as f32, max as usize));
    } else {
        instance.deactivate();
        return false;
    }
    instance.active.store(true, Ordering::Release);
    true
}
unsafe extern "C" fn plugin_deactivate(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { instance(plugin) } {
        instance.deactivate();
    }
}
unsafe extern "C" fn plugin_start(plugin: *const clap_plugin) -> bool {
    unsafe { instance(plugin) }.is_some_and(|instance| instance.active.load(Ordering::Acquire))
}
unsafe extern "C" fn plugin_stop(_plugin: *const clap_plugin) {}
unsafe extern "C" fn plugin_reset(plugin: *const clap_plugin) {
    let Some(instance) = (unsafe { instance(plugin) }) else {
        return;
    };
    let runtime = instance.current.load(Ordering::Acquire);
    if !runtime.is_null() {
        // CLAP serializes reset with this instance's process callback.
        unsafe { &mut *runtime }
            .prepared
            .processor
            .reset_effect_slot(2_u32.into());
    }
}

fn physical(index: usize, value: f64) -> Option<f32> {
    if !value.is_finite() {
        return None;
    }
    if index == 0 {
        if !(0. ..=20.).contains(&value) {
            return None;
        }
        Some(value.round() as f32)
    } else if (0. ..=1.).contains(&value) {
        Some(value as f32)
    } else {
        None
    }
}

unsafe fn append_events(
    list: *const clap_input_events,
    frames: usize,
    output: &mut Vec<TimedAutomation>,
) -> bool {
    output.clear();
    if list.is_null() {
        return true;
    }
    let Some(size) = (unsafe { (*list).size }) else {
        return false;
    };
    let Some(get) = (unsafe { (*list).get }) else {
        return false;
    };
    let count = unsafe { size(list) };
    if count as usize > MAX_EVENTS * 4 {
        return false;
    }
    for index in 0..count {
        let header = unsafe { get(list, index) };
        if header.is_null() {
            return false;
        }
        let header = unsafe { &*header };
        if header.space_id != CLAP_CORE_EVENT_SPACE_ID || header.type_ != CLAP_EVENT_PARAM_VALUE {
            continue;
        }
        if header.size < std::mem::size_of::<clap_event_param_value>() as u32 {
            return false;
        }
        let event = unsafe { &*(header as *const _ as *const clap_event_param_value) };
        let id = event.param_id as usize;
        if id >= 7
            || (frames > 0 && event.header.time as usize >= frames)
            || (frames == 0 && event.header.time != 0)
            || output.len() == MAX_EVENTS
        {
            return false;
        }
        if event.note_id != -1 || event.port_index != -1 || event.channel != -1 || event.key != -1 {
            continue;
        }
        let Some(value) = physical(id, event.value) else {
            return false;
        };
        if output
            .last()
            .is_some_and(|last| last.offset > event.header.time as usize)
        {
            return false;
        }
        output.push(TimedAutomation {
            offset: event.header.time as usize,
            id: HOST_SLOT_BASE + id as u32,
            normalized: if id == 0 { value / 20. } else { value },
        });
    }
    true
}

fn publish_inactive_values(instance: &Instance, automation: &[TimedAutomation]) -> bool {
    let mut type_changed = false;
    for point in automation {
        let index = (point.id - HOST_SLOT_BASE) as usize;
        let value = if index == 0 {
            (point.normalized * 20.).round()
        } else {
            point.normalized
        };
        if index == 0 {
            let selected = value as usize;
            for control in 0..5 {
                let remembered = instance.type_values[selected][control].load(Ordering::Acquire);
                instance.values[control + 2].store(remembered, Ordering::Release);
            }
            type_changed = true;
        } else if index >= 2 {
            let selected = instance.value(0) as usize;
            if selected < 21 {
                instance.type_values[selected][index - 2].store(value.to_bits(), Ordering::Release);
            }
        }
        instance.values[index].store(value.to_bits(), Ordering::Release);
    }
    type_changed
}

fn publish_processor_snapshot(instance: &Instance, runtime: &Runtime, rescan: bool) {
    for (descriptor, value) in runtime
        .prepared
        .processor
        .host_parameters()
        .iter()
        .zip(runtime.prepared.processor.current_parameter_values())
    {
        if descriptor.node == 2 && descriptor.local_id < 7 {
            instance.values[descriptor.local_id as usize].store(value.to_bits(), Ordering::Release);
        }
    }
    for effect_type in 0..21 {
        if let Some(values) = runtime
            .prepared
            .processor
            .effect_slot_params(2_u32.into(), effect_type)
        {
            for (index, value) in values.into_iter().enumerate() {
                instance.type_values[effect_type as usize][index]
                    .store(value.to_bits(), Ordering::Release);
            }
        }
    }
    instance.type_values_valid.store(true, Ordering::Release);
    if rescan && !instance.host.is_null() {
        instance.rescan_needed.store(true, Ordering::Release);
        if let Some(request) = unsafe { (*instance.host).request_callback } {
            unsafe { request(instance.host) };
        }
    }
}

fn type_changed(automation: &[TimedAutomation]) -> bool {
    automation.iter().any(|point| point.id == HOST_SLOT_BASE)
}

fn publish_pending(instance: &Instance) {
    if !instance.retired.load(Ordering::Acquire).is_null() {
        return;
    }
    let pending = instance.pending.swap(null_mut(), Ordering::AcqRel);
    if !pending.is_null() {
        let old = instance.current.swap(pending, Ordering::AcqRel);
        publish_processor_snapshot(instance, unsafe { &*pending }, true);
        if !old.is_null() {
            instance.retired.store(old, Ordering::Release);
            if !instance.host.is_null() {
                // CLAP permits request_callback from the audio thread. Runtime
                // destruction then happens in on_main_thread, never here.
                if let Some(request) = unsafe { (*instance.host).request_callback } {
                    unsafe {
                        request(instance.host);
                    }
                }
            }
        }
    }
}

unsafe fn input_channels(buffers: *const clap_audio_buffer, count: u32) -> Option<[*const f32; 2]> {
    if count == 0 || buffers.is_null() {
        return Some([null(); 2]);
    }
    let port = unsafe { &*buffers };
    if port.data32.is_null() {
        return None;
    }
    let mut channels = [null(); 2];
    for (index, channel) in channels
        .iter_mut()
        .enumerate()
        .take((port.channel_count as usize).min(2))
    {
        *channel = unsafe { *port.data32.add(index) };
    }
    Some(channels)
}
unsafe fn output_channels(buffers: *mut clap_audio_buffer, count: u32) -> Option<[*mut f32; 2]> {
    if count == 0 || buffers.is_null() {
        return Some([null_mut(); 2]);
    }
    let port = unsafe { &*buffers };
    if port.data32.is_null() {
        return None;
    }
    let mut channels = [null_mut(); 2];
    for (index, channel) in channels
        .iter_mut()
        .enumerate()
        .take((port.channel_count as usize).min(2))
    {
        *channel = unsafe { *port.data32.add(index) };
    }
    Some(channels)
}

unsafe extern "C" fn plugin_process(
    plugin: *const clap_plugin,
    process: *const clap_process,
) -> clap_process_status {
    let Some(instance) = (unsafe { instance(plugin) }) else {
        return CLAP_PROCESS_ERROR;
    };
    if process.is_null() {
        return CLAP_PROCESS_ERROR;
    }
    let process = unsafe { &*process };
    publish_pending(instance);
    let runtime = instance.current.load(Ordering::Acquire);
    if runtime.is_null() {
        return CLAP_PROCESS_ERROR;
    }
    // SAFETY: CLAP does not call process concurrently for one instance.
    let runtime = unsafe { &mut *runtime };
    if !unsafe {
        append_events(
            process.in_events,
            process.frames_count as usize,
            &mut runtime.automation,
        )
    } {
        return CLAP_PROCESS_ERROR;
    }
    let Some(main) = (unsafe { input_channels(process.audio_inputs, process.audio_inputs_count) })
    else {
        return CLAP_PROCESS_ERROR;
    };
    let Some(output) =
        (unsafe { output_channels(process.audio_outputs, process.audio_outputs_count) })
    else {
        return CLAP_PROCESS_ERROR;
    };
    let block = RawHostBlock {
        frames: process.frames_count as usize,
        main,
        sidechain: [null(); 2],
        output,
        events: &[],
        automation: &runtime.automation,
    };
    if unsafe {
        runtime
            .buffers
            .render(&mut runtime.prepared.processor, block)
    }
    .is_err()
    {
        return CLAP_PROCESS_ERROR;
    }
    if !runtime.automation.is_empty() {
        publish_processor_snapshot(instance, runtime, type_changed(&runtime.automation));
    }
    CLAP_PROCESS_CONTINUE
}

unsafe extern "C" fn plugin_main_thread(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { instance(plugin) } {
        instance.retire_old();
        if instance.rescan_needed.swap(false, Ordering::AcqRel) {
            rescan_host_values(instance);
        }
    }
}

fn rescan_host_values(instance: &Instance) {
    if instance.host.is_null() {
        return;
    }
    if let Some(get) = unsafe { (*instance.host).get_extension } {
        let extension = unsafe { get(instance.host, CLAP_EXT_PARAMS.as_ptr()) };
        if !extension.is_null() {
            let params = unsafe { &*(extension as *const clap_host_params) };
            if let Some(rescan) = params.rescan {
                unsafe { rescan(instance.host, CLAP_PARAM_RESCAN_VALUES) };
            }
        }
    }
}

pub(crate) unsafe extern "C" fn param_value(
    plugin: *const clap_plugin,
    id: u32,
    output: *mut f64,
) -> bool {
    let Some(instance) = (unsafe { instance(plugin) }) else {
        return false;
    };
    if id >= 7 || output.is_null() {
        return false;
    }
    unsafe {
        *output = instance.value(id as usize) as f64;
    }
    true
}

unsafe fn write_text(text: &str, output: *mut c_char, capacity: u32) -> bool {
    if output.is_null() || capacity == 0 || text.len() + 1 > capacity as usize {
        return false;
    }
    unsafe {
        ptr::copy_nonoverlapping(text.as_ptr(), output as *mut u8, text.len());
        *output.add(text.len()) = 0;
    }
    true
}
pub(crate) unsafe extern "C" fn param_to_text(
    _plugin: *const clap_plugin,
    id: u32,
    value: f64,
    output: *mut c_char,
    capacity: u32,
) -> bool {
    if id >= 7 {
        return false;
    }
    let Some(value) = physical(id as usize, value) else {
        return false;
    };
    let text = if id == 0 {
        TYPE_LABELS[value as usize].to_owned()
    } else {
        format!("{value:.2}")
    };
    unsafe { write_text(&text, output, capacity) }
}
pub(crate) unsafe extern "C" fn text_to_param(
    _plugin: *const clap_plugin,
    id: u32,
    text: *const c_char,
    output: *mut f64,
) -> bool {
    if id >= 7 || text.is_null() || output.is_null() {
        return false;
    }
    let Ok(text) = (unsafe { CStr::from_ptr(text) }).to_str() else {
        return false;
    };
    let parsed = if id == 0 {
        TYPE_LABELS
            .iter()
            .position(|name| name.eq_ignore_ascii_case(text))
            .map(|value| value as f64)
            .or_else(|| text.parse::<f64>().ok())
    } else {
        text.parse::<f64>().ok()
    };
    let Some(value) = parsed.and_then(|value| physical(id as usize, value)) else {
        return false;
    };
    unsafe {
        *output = value as f64;
    }
    true
}

pub(crate) unsafe extern "C" fn param_flush(
    plugin: *const clap_plugin,
    events: *const clap_input_events,
    _out: *const clap_output_events,
) {
    let Some(instance) = (unsafe { instance(plugin) }) else {
        return;
    };
    publish_pending(instance);
    let runtime = instance.current.load(Ordering::Acquire);
    if runtime.is_null() {
        // Inactive flush happens on the main thread. This allocation is outside
        // the audio callback and becomes the input to the next activation.
        let mut scratch = Vec::with_capacity(MAX_EVENTS);
        if unsafe { append_events(events, 0, &mut scratch) } {
            if publish_inactive_values(instance, &scratch) {
                rescan_host_values(instance);
            }
        }
        return;
    }
    // CLAP calls active flush on the audio thread, separately from process().
    let runtime = unsafe { &mut *runtime };
    if !unsafe { append_events(events, 0, &mut runtime.automation) } {
        return;
    }
    let mut left = [];
    let mut right = [];
    if runtime
        .prepared
        .processor
        .process_host_automated(
            manifold_native::AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            },
            &runtime.automation,
        )
        .is_ok()
    {
        if !runtime.automation.is_empty() {
            publish_processor_snapshot(instance, runtime, type_changed(&runtime.automation));
        }
    }
}

pub(crate) unsafe extern "C" fn state_save(
    plugin: *const clap_plugin,
    stream: *const clap_ostream,
) -> bool {
    let Some(instance) = (unsafe { instance(plugin) }) else {
        return false;
    };
    if stream.is_null() {
        return false;
    }
    let Some(write) = (unsafe { (*stream).write }) else {
        return false;
    };
    let Some(state) = instance.capture_state() else {
        return false;
    };
    let mut offset = 0;
    while offset < state.len() {
        let count = unsafe {
            write(
                stream,
                state[offset..].as_ptr() as *const c_void,
                (state.len() - offset) as u64,
            )
        };
        if count <= 0 || count as usize > state.len() - offset {
            return false;
        }
        offset += count as usize;
    }
    true
}

pub(crate) unsafe extern "C" fn state_load(
    plugin: *const clap_plugin,
    stream: *const clap_istream,
) -> bool {
    let Some(instance) = (unsafe { instance(plugin) }) else {
        return false;
    };
    if stream.is_null() {
        return false;
    }
    let Some(read) = (unsafe { (*stream).read }) else {
        return false;
    };
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        let count = unsafe {
            read(
                stream,
                chunk.as_mut_ptr() as *mut c_void,
                chunk.len() as u64,
            )
        };
        if count < 0 || count as usize > chunk.len() {
            return false;
        }
        if count == 0 {
            break;
        }
        if bytes.len() + count as usize > MAX_STATE_BYTES {
            return false;
        }
        bytes.extend_from_slice(&chunk[..count as usize]);
    }
    let Ok(parsed) = NativeProject::parse_fx_module(&bytes) else {
        return false;
    };
    let mut values = DEFAULTS;
    for parameter in parsed.host_parameters() {
        let index = parameter.local_id as usize;
        if index >= 7 {
            return false;
        }
        values[index] = parameter.initial;
    }
    let mut type_values = parsed.fx_type_parameters();
    let selected = values[0] as usize;
    if selected >= 21 {
        return false;
    }
    type_values[selected].copy_from_slice(&values[2..7]);
    instance.retire_old();
    let configuration = instance.sample_rate.lock().ok().and_then(|guard| *guard);
    if let Some((rate, max)) = configuration {
        let Some(runtime) = instance.prepared(&bytes, rate, max) else {
            return false;
        };
        let pointer = Box::into_raw(runtime);
        if instance
            .pending
            .compare_exchange(null_mut(), pointer, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            // SAFETY: A failed compare_exchange did not publish this pointer.
            unsafe {
                drop(Box::from_raw(pointer));
            }
            return false;
        }
    }
    if let Ok(mut state) = instance.state.lock() {
        *state = bytes;
    } else {
        return false;
    }
    for (index, value) in values.iter().enumerate() {
        instance.values[index].store(value.to_bits(), Ordering::Release);
    }
    for (effect_type, row) in type_values.iter().enumerate() {
        for (index, value) in row.iter().enumerate() {
            instance.type_values[effect_type][index].store(value.to_bits(), Ordering::Release);
        }
    }
    instance.type_values_valid.store(true, Ordering::Release);
    rescan_host_values(instance);
    true
}
