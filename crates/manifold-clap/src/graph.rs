//! CLAP graph instrument. Project parsing and runtime replacement happen on the
//! host main thread; the audio callback only uses prepared, bounded storage.

use std::ffi::{CStr, c_char, c_void};
use std::ptr::{self, null, null_mut};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, Ordering};

use clap_sys::audio_buffer::clap_audio_buffer;
use clap_sys::events::{
    CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_NOTE_OFF, CLAP_EVENT_NOTE_ON, CLAP_EVENT_PARAM_VALUE,
    clap_event_header, clap_event_note, clap_event_param_value, clap_input_events,
};
use clap_sys::ext::audio_ports::{
    CLAP_AUDIO_PORT_IS_MAIN, CLAP_EXT_AUDIO_PORTS, CLAP_PORT_STEREO, clap_audio_port_info,
    clap_plugin_audio_ports,
};
use clap_sys::ext::note_ports::{
    CLAP_EXT_NOTE_PORTS, CLAP_NOTE_DIALECT_CLAP, clap_note_port_info, clap_plugin_note_ports,
};
use clap_sys::ext::params::{
    CLAP_EXT_PARAMS, CLAP_PARAM_IS_AUTOMATABLE, CLAP_PARAM_IS_STEPPED, CLAP_PARAM_RESCAN_ALL,
    clap_host_params, clap_param_info, clap_plugin_params,
};
use clap_sys::ext::state::{CLAP_EXT_STATE, clap_plugin_state};
use clap_sys::host::clap_host;
use clap_sys::plugin::{clap_plugin, clap_plugin_descriptor};
use clap_sys::process::{
    CLAP_PROCESS_CONTINUE, CLAP_PROCESS_ERROR, clap_process, clap_process_status,
};
use clap_sys::stream::{clap_istream, clap_ostream};
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::host_buffers::{HostBuffers, RawHostBlock};
use manifold_native::parameters::{
    HOST_SLOT_BASE, HOST_SLOT_COUNT, HostParameter, TimedAutomation,
};
use manifold_native::project::{NativeProject, PreparedNativeProject};

const DEFAULT: &[u8] = include_bytes!("../../../projects/graph-workspace/note-voice.json");
const MAX_EVENTS: usize = 1024;
const MAX_STATE: usize = 45 * 1024 * 1024;

struct Runtime {
    prepared: PreparedNativeProject,
    buffers: HostBuffers,
    automation: Vec<TimedAutomation>,
    events: Vec<TimedEvent>,
    slot_indices: [Option<usize>; HOST_SLOT_COUNT],
    midi_node: Option<u64>,
}

pub(crate) struct Instance {
    pub plugin: clap_plugin,
    host: *const clap_host,
    current: AtomicPtr<Runtime>,
    pending: AtomicPtr<Runtime>,
    retired: AtomicPtr<Runtime>,
    active: AtomicBool,
    configuration: Mutex<Option<(f32, usize)>>,
    state: Mutex<Vec<u8>>,
    descriptors: Mutex<[Option<HostParameter>; HOST_SLOT_COUNT]>,
    normalized: [AtomicU32; HOST_SLOT_COUNT],
}

// CLAP serializes processing for an instance. The main thread owns state and
// retirement; the callback owns the published runtime while active.
unsafe impl Sync for Instance {}

fn slots(project: &NativeProject) -> [Option<HostParameter>; HOST_SLOT_COUNT] {
    std::array::from_fn(|index| {
        project
            .host_bindings()
            .iter()
            .find(|binding| binding.slot as usize == index)
            .and_then(|binding| {
                project
                    .host_parameters()
                    .iter()
                    .find(|parameter| parameter.id == binding.graph_parameter)
                    .copied()
            })
    })
}

impl Instance {
    pub(crate) fn new(
        host: *const clap_host,
        descriptor: *const clap_plugin_descriptor,
    ) -> Box<Self> {
        let parsed = NativeProject::parse(DEFAULT).expect("authored graph project");
        let descriptors = slots(&parsed);
        let normalized = std::array::from_fn(|slot| {
            descriptors[slot]
                .and_then(|parameter| parameter.to_normalized(parameter.initial))
                .unwrap_or(0.0)
        });
        let mut value = Box::new(Self {
            plugin: clap_plugin {
                desc: descriptor,
                plugin_data: null_mut(),
                init: Some(init),
                destroy: Some(destroy),
                activate: Some(activate),
                deactivate: Some(deactivate),
                start_processing: Some(start),
                stop_processing: Some(stop),
                reset: Some(reset),
                process: Some(process),
                get_extension: Some(extension),
                on_main_thread: Some(main_thread),
            },
            host,
            current: AtomicPtr::new(null_mut()),
            pending: AtomicPtr::new(null_mut()),
            retired: AtomicPtr::new(null_mut()),
            active: AtomicBool::new(false),
            configuration: Mutex::new(None),
            state: Mutex::new(DEFAULT.to_vec()),
            descriptors: Mutex::new(descriptors),
            normalized: normalized.map(|value: f32| AtomicU32::new(value.to_bits())),
        });
        value.plugin.plugin_data = &mut *value as *mut Self as *mut c_void;
        value
    }

    fn prepare(bytes: &[u8], rate: f32, max: usize) -> Option<Box<Runtime>> {
        let project = NativeProject::parse(bytes).ok()?;
        let document: serde_json::Value = serde_json::from_slice(bytes).ok()?;
        let midi_node = document["signal"]["nodes"]
            .as_array()?
            .iter()
            .find_map(|node| {
                (node["type"] == "midi-input")
                    .then(|| node["id"].as_u64())
                    .flatten()
            });
        let bindings = project.host_bindings().to_vec();
        let prepared = project.prepare_with_state(rate, max).ok()?;
        let slot_indices = std::array::from_fn(|slot| {
            bindings
                .iter()
                .find(|binding| binding.slot as usize == slot)
                .and_then(|binding| {
                    prepared
                        .processor
                        .host_parameters()
                        .iter()
                        .position(|parameter| parameter.id == binding.graph_parameter)
                })
        });
        Some(Box::new(Runtime {
            prepared,
            buffers: HostBuffers::prepare(max),
            automation: Vec::with_capacity(MAX_EVENTS),
            events: Vec::with_capacity(MAX_EVENTS),
            slot_indices,
            midi_node,
        }))
    }

    fn snapshot(&self, runtime: &Runtime) {
        let parameters = runtime.prepared.processor.host_parameters();
        let values = runtime.prepared.processor.current_parameter_values();
        for (slot, index) in runtime.slot_indices.iter().enumerate() {
            if let Some(index) = index {
                if let Some(value) = parameters[*index].to_normalized(values[*index]) {
                    self.normalized[slot].store(value.to_bits(), Ordering::Release);
                }
            }
        }
    }

    fn state_bytes(&self) -> Option<Vec<u8>> {
        let state = self.state.lock().ok()?;
        let descriptors = self.descriptors.lock().ok()?;
        let mut document: serde_json::Value = serde_json::from_slice(&state).ok()?;
        let entries = document["signal"]["initialParameters"].as_array_mut()?;
        for (slot, descriptor) in descriptors.iter().enumerate() {
            let Some(descriptor) = descriptor else {
                continue;
            };
            let normalized = f32::from_bits(self.normalized[slot].load(Ordering::Acquire));
            let physical = descriptor.from_normalized(normalized)?;
            if let Some(entry) = entries.iter_mut().find(|entry| {
                entry["nodeId"] == descriptor.node && entry["id"] == descriptor.local_id
            }) {
                entry["value"] = serde_json::Value::from(physical);
            } else {
                entries.push(serde_json::json!({"nodeId": descriptor.node,
                    "id": descriptor.local_id, "value": physical}));
            }
        }
        serde_json::to_vec(&document)
            .ok()
            .filter(|bytes| bytes.len() <= MAX_STATE)
    }

    fn retire(&self) {
        let old = self.retired.swap(null_mut(), Ordering::AcqRel);
        if !old.is_null() {
            unsafe { drop(Box::from_raw(old)) }
        }
    }
    fn deactivate(&self) {
        self.active.store(false, Ordering::Release);
        for pointer in [&self.current, &self.pending, &self.retired] {
            let old = pointer.swap(null_mut(), Ordering::AcqRel);
            if !old.is_null() {
                unsafe { drop(Box::from_raw(old)) }
            }
        }
        if let Ok(mut config) = self.configuration.lock() {
            *config = None;
        }
    }
    fn publish(&self) {
        // A single retirement slot bounds callback memory. The main thread
        // must collect it before another replacement can be published.
        if !self.retired.load(Ordering::Acquire).is_null() {
            return;
        }
        let next = self.pending.swap(null_mut(), Ordering::AcqRel);
        if next.is_null() {
            return;
        }
        let old = self.current.swap(next, Ordering::AcqRel);
        self.snapshot(unsafe { &*next });
        if !old.is_null() {
            self.retired.store(old, Ordering::Release);
            if !self.host.is_null() {
                if let Some(callback) = unsafe { (*self.host).request_callback } {
                    unsafe { callback(self.host) };
                }
            }
        }
    }
}

unsafe fn get<'a>(plugin: *const clap_plugin) -> Option<&'a Instance> {
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
unsafe extern "C" fn init(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin).is_some() }
}
unsafe extern "C" fn destroy(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.deactivate();
        unsafe { drop(Box::from_raw(instance as *const Instance as *mut Instance)) };
    }
}
unsafe extern "C" fn activate(plugin: *const clap_plugin, rate: f64, _min: u32, max: u32) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
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
    let Some(state) = instance.state_bytes() else {
        return false;
    };
    let Some(runtime) = Instance::prepare(&state, rate as f32, max as usize) else {
        return false;
    };
    instance.snapshot(&runtime);
    instance
        .current
        .store(Box::into_raw(runtime), Ordering::Release);
    if let Ok(mut config) = instance.configuration.lock() {
        *config = Some((rate as f32, max as usize));
    } else {
        instance.deactivate();
        return false;
    }
    instance.active.store(true, Ordering::Release);
    true
}
unsafe extern "C" fn deactivate(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.deactivate()
    }
}
unsafe extern "C" fn start(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin) }.is_some_and(|instance| instance.active.load(Ordering::Acquire))
}
unsafe extern "C" fn stop(_plugin: *const clap_plugin) {}
unsafe extern "C" fn reset(_plugin: *const clap_plugin) {}
unsafe extern "C" fn main_thread(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.retire()
    }
}

unsafe extern "C" fn extension(_plugin: *const clap_plugin, id: *const c_char) -> *const c_void {
    if id.is_null() {
        return null();
    }
    let id = unsafe { CStr::from_ptr(id) };
    if id == CLAP_EXT_AUDIO_PORTS {
        &AUDIO_PORTS as *const _ as *const c_void
    } else if id == CLAP_EXT_NOTE_PORTS {
        &NOTE_PORTS as *const _ as *const c_void
    } else if id == CLAP_EXT_PARAMS {
        &PARAMS as *const _ as *const c_void
    } else if id == CLAP_EXT_STATE {
        &STATE as *const _ as *const c_void
    } else {
        null()
    }
}

unsafe extern "C" fn audio_count(_plugin: *const clap_plugin, input: bool) -> u32 {
    if input { 2 } else { 1 }
}
unsafe extern "C" fn audio_info(
    _plugin: *const clap_plugin,
    index: u32,
    input: bool,
    info: *mut clap_audio_port_info,
) -> bool {
    if info.is_null() || (input && index >= 2) || (!input && index != 0) {
        return false;
    }
    let info = unsafe { &mut *info };
    info.id = if input { index } else { 2 };
    info.name.fill(0);
    let name: &[u8] = if !input {
        b"Main Out"
    } else if index == 0 {
        b"Main In"
    } else {
        b"Sidechain"
    };
    for (dst, src) in info.name.iter_mut().zip(name.iter()) {
        *dst = *src as c_char
    }
    info.flags = if index == 0 {
        CLAP_AUDIO_PORT_IS_MAIN
    } else {
        0
    };
    info.channel_count = 2;
    info.port_type = CLAP_PORT_STEREO.as_ptr();
    info.in_place_pair = if index == 0 {
        if input { 2 } else { 0 }
    } else {
        u32::MAX
    };
    true
}
static AUDIO_PORTS: clap_plugin_audio_ports = clap_plugin_audio_ports {
    count: Some(audio_count),
    get: Some(audio_info),
};
unsafe extern "C" fn note_count(_plugin: *const clap_plugin, input: bool) -> u32 {
    if input { 1 } else { 0 }
}
unsafe extern "C" fn note_info(
    _plugin: *const clap_plugin,
    index: u32,
    input: bool,
    info: *mut clap_note_port_info,
) -> bool {
    if !input || index != 0 || info.is_null() {
        return false;
    }
    let info = unsafe { &mut *info };
    info.id = 0;
    info.supported_dialects = CLAP_NOTE_DIALECT_CLAP;
    info.preferred_dialect = CLAP_NOTE_DIALECT_CLAP;
    info.name.fill(0);
    for (dst, src) in info.name.iter_mut().zip(b"Notes In".iter()) {
        *dst = *src as c_char
    }
    true
}
static NOTE_PORTS: clap_plugin_note_ports = clap_plugin_note_ports {
    count: Some(note_count),
    get: Some(note_info),
};

unsafe extern "C" fn param_count(_plugin: *const clap_plugin) -> u32 {
    HOST_SLOT_COUNT as u32
}
unsafe extern "C" fn param_info(
    plugin: *const clap_plugin,
    index: u32,
    info: *mut clap_param_info,
) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if index as usize >= HOST_SLOT_COUNT || info.is_null() {
        return false;
    }
    let descriptor = instance
        .descriptors
        .lock()
        .ok()
        .and_then(|slots| slots[index as usize]);
    let info = unsafe { &mut *info };
    info.id = HOST_SLOT_BASE + index;
    info.flags = CLAP_PARAM_IS_AUTOMATABLE
        | if descriptor.is_some_and(|descriptor| descriptor.discrete) {
            CLAP_PARAM_IS_STEPPED
        } else {
            0
        };
    info.cookie = null_mut();
    info.name.fill(0);
    info.module.fill(0);
    let label = descriptor
        .map(|descriptor| {
            format!(
                "Slot {} · node {} control {}",
                index + 1,
                descriptor.node,
                descriptor.local_id
            )
        })
        .unwrap_or_else(|| format!("Slot {} · unbound", index + 1));
    for (dst, src) in info.name.iter_mut().zip(label.bytes()) {
        *dst = src as c_char
    }
    info.min_value = 0.;
    info.max_value = 1.;
    info.default_value = descriptor
        .and_then(|item| item.to_normalized(item.initial))
        .unwrap_or(0.) as f64;
    true
}
unsafe extern "C" fn param_value(plugin: *const clap_plugin, id: u32, output: *mut f64) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    let Some(slot) = id.checked_sub(HOST_SLOT_BASE).map(|value| value as usize) else {
        return false;
    };
    if slot >= HOST_SLOT_COUNT || output.is_null() {
        return false;
    }
    unsafe { *output = f32::from_bits(instance.normalized[slot].load(Ordering::Acquire)) as f64 };
    true
}
unsafe extern "C" fn to_text(
    _plugin: *const clap_plugin,
    _id: u32,
    value: f64,
    output: *mut c_char,
    capacity: u32,
) -> bool {
    if output.is_null() || !value.is_finite() || !(0. ..=1.).contains(&value) {
        return false;
    }
    let text = format!("{value:.3}");
    if text.len() + 1 > capacity as usize {
        return false;
    }
    unsafe {
        ptr::copy_nonoverlapping(text.as_ptr(), output as *mut u8, text.len());
        *output.add(text.len()) = 0
    };
    true
}
unsafe extern "C" fn from_text(
    _plugin: *const clap_plugin,
    _id: u32,
    text: *const c_char,
    output: *mut f64,
) -> bool {
    if text.is_null() || output.is_null() {
        return false;
    }
    let Ok(value) = (unsafe { CStr::from_ptr(text) })
        .to_str()
        .unwrap_or("")
        .parse::<f64>()
    else {
        return false;
    };
    if !value.is_finite() || !(0. ..=1.).contains(&value) {
        return false;
    }
    unsafe { *output = value };
    true
}
static PARAMS: clap_plugin_params = clap_plugin_params {
    count: Some(param_count),
    get_info: Some(param_info),
    get_value: Some(param_value),
    value_to_text: Some(to_text),
    text_to_value: Some(from_text),
    flush: Some(flush),
};

unsafe fn collect(list: *const clap_input_events, frames: usize, runtime: &mut Runtime) -> bool {
    runtime.automation.clear();
    runtime.events.clear();
    if list.is_null() {
        return true;
    }
    let (Some(size), Some(get)) = (unsafe { (*list).size }, unsafe { (*list).get }) else {
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
        if header.space_id != CLAP_CORE_EVENT_SPACE_ID {
            continue;
        }
        let offset = header.time as usize;
        if (frames == 0 && offset != 0) || (frames > 0 && offset >= frames) {
            return false;
        }
        match header.type_ {
            CLAP_EVENT_PARAM_VALUE => {
                if header.size < std::mem::size_of::<clap_event_param_value>() as u32 {
                    return false;
                }
                let event = unsafe {
                    &*(header as *const clap_event_header as *const clap_event_param_value)
                };
                let Some(slot) = event
                    .param_id
                    .checked_sub(HOST_SLOT_BASE)
                    .map(|value| value as usize)
                else {
                    continue;
                };
                if slot >= HOST_SLOT_COUNT || runtime.slot_indices[slot].is_none() {
                    continue;
                }
                if event.note_id != -1
                    || event.port_index != -1
                    || event.channel != -1
                    || event.key != -1
                {
                    continue;
                }
                if !event.value.is_finite()
                    || !(0. ..=1.).contains(&event.value)
                    || runtime.automation.len() == MAX_EVENTS
                {
                    return false;
                }
                runtime.automation.push(TimedAutomation {
                    offset,
                    id: event.param_id,
                    normalized: event.value as f32,
                });
            }
            CLAP_EVENT_NOTE_ON | CLAP_EVENT_NOTE_OFF if runtime.midi_node.is_some() => {
                if header.size < std::mem::size_of::<clap_event_note>() as u32 {
                    return false;
                }
                let event =
                    unsafe { &*(header as *const clap_event_header as *const clap_event_note) };
                if event.port_index != 0
                    || !(0..=15).contains(&event.channel)
                    || !(0..=127).contains(&event.key)
                    || !event.velocity.is_finite()
                    || !(0. ..=1.).contains(&event.velocity)
                    || runtime.events.len() == MAX_EVENTS
                {
                    return false;
                }
                let kind = if header.type_ == CLAP_EVENT_NOTE_OFF || event.velocity == 0. {
                    EventKind::NoteOff {
                        channel: event.channel as u8,
                        note: event.key as u8,
                    }
                } else {
                    EventKind::NoteOn {
                        channel: event.channel as u8,
                        note: event.key as u8,
                        velocity: (event.velocity * 127.).round() as u8,
                    }
                };
                runtime.events.push(TimedEvent {
                    offset,
                    node: runtime.midi_node.unwrap(),
                    kind,
                });
            }
            _ => {}
        }
    }
    true
}

unsafe fn channels(buffers: *const clap_audio_buffer, count: u32, index: usize) -> [*const f32; 2] {
    if buffers.is_null() || index >= count as usize {
        return [null(); 2];
    }
    let port = unsafe { &*buffers.add(index) };
    if port.data32.is_null() {
        return [null(); 2];
    }
    std::array::from_fn(|channel| {
        if channel < port.channel_count as usize {
            unsafe { *port.data32.add(channel) }
        } else {
            null()
        }
    })
}
unsafe fn out_channels(buffers: *mut clap_audio_buffer, count: u32) -> Option<[*mut f32; 2]> {
    if buffers.is_null() || count == 0 {
        return None;
    }
    let port = unsafe { &*buffers };
    if port.data32.is_null() {
        return None;
    }
    Some(std::array::from_fn(|channel| {
        if channel < port.channel_count as usize {
            unsafe { *port.data32.add(channel) }
        } else {
            null_mut()
        }
    }))
}
unsafe extern "C" fn process(
    plugin: *const clap_plugin,
    block: *const clap_process,
) -> clap_process_status {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return CLAP_PROCESS_ERROR;
    };
    if block.is_null() {
        return CLAP_PROCESS_ERROR;
    }
    instance.publish();
    let pointer = instance.current.load(Ordering::Acquire);
    if pointer.is_null() {
        return CLAP_PROCESS_ERROR;
    }
    let runtime = unsafe { &mut *pointer };
    let block = unsafe { &*block };
    if !unsafe { collect(block.in_events, block.frames_count as usize, runtime) } {
        return CLAP_PROCESS_ERROR;
    }
    let Some(output) = (unsafe { out_channels(block.audio_outputs, block.audio_outputs_count) })
    else {
        return CLAP_PROCESS_ERROR;
    };
    let raw = RawHostBlock {
        frames: block.frames_count as usize,
        main: unsafe { channels(block.audio_inputs, block.audio_inputs_count, 0) },
        sidechain: unsafe { channels(block.audio_inputs, block.audio_inputs_count, 1) },
        output,
        events: &runtime.events,
        automation: &runtime.automation,
    };
    if unsafe { runtime.buffers.render(&mut runtime.prepared.processor, raw) }.is_err() {
        return CLAP_PROCESS_ERROR;
    }
    if !runtime.automation.is_empty() {
        instance.snapshot(runtime)
    }
    CLAP_PROCESS_CONTINUE
}
unsafe extern "C" fn flush(
    plugin: *const clap_plugin,
    events: *const clap_input_events,
    _out: *const clap_sys::events::clap_output_events,
) {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return;
    };
    instance.publish();
    let pointer = instance.current.load(Ordering::Acquire);
    if pointer.is_null() {
        // Inactive flush is a main-thread call. Keep incoming host values so
        // activation and state save both start with the last automation value.
        if !events.is_null() {
            let (Some(size), Some(get)) = (unsafe { (*events).size }, unsafe { (*events).get })
            else {
                return;
            };
            let Ok(descriptors) = instance.descriptors.lock() else {
                return;
            };
            for index in 0..unsafe { size(events) }.min((MAX_EVENTS * 4) as u32) {
                let header = unsafe { get(events, index) };
                if header.is_null() {
                    return;
                }
                let header = unsafe { &*header };
                if header.space_id != CLAP_CORE_EVENT_SPACE_ID
                    || header.type_ != CLAP_EVENT_PARAM_VALUE
                    || header.size < std::mem::size_of::<clap_event_param_value>() as u32
                {
                    continue;
                }
                let value = unsafe {
                    &*(header as *const clap_event_header as *const clap_event_param_value)
                };
                let Some(slot) = value
                    .param_id
                    .checked_sub(HOST_SLOT_BASE)
                    .map(|slot| slot as usize)
                else {
                    continue;
                };
                if slot < HOST_SLOT_COUNT
                    && descriptors[slot].is_some()
                    && value.value.is_finite()
                    && (0. ..=1.).contains(&value.value)
                    && value.note_id == -1
                    && value.port_index == -1
                    && value.channel == -1
                    && value.key == -1
                {
                    instance.normalized[slot]
                        .store((value.value as f32).to_bits(), Ordering::Release);
                }
            }
        }
        return;
    }
    let runtime = unsafe { &mut *pointer };
    if !unsafe { collect(events, 0, runtime) } {
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
        instance.snapshot(runtime)
    }
}

unsafe extern "C" fn save(plugin: *const clap_plugin, stream: *const clap_ostream) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if stream.is_null() {
        return false;
    }
    let Some(write) = (unsafe { (*stream).write }) else {
        return false;
    };
    let Some(state) = instance.state_bytes() else {
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
unsafe extern "C" fn load(plugin: *const clap_plugin, stream: *const clap_istream) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if stream.is_null() {
        return false;
    }
    let Some(read) = (unsafe { (*stream).read }) else {
        return false;
    };
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 4096];
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
        if bytes.len() + count as usize > MAX_STATE {
            return false;
        }
        bytes.extend_from_slice(&chunk[..count as usize]);
    }
    let Ok(project) = NativeProject::parse(&bytes) else {
        return false;
    };
    let descriptors = slots(&project);
    let values = std::array::from_fn::<_, HOST_SLOT_COUNT, _>(|slot| {
        descriptors[slot]
            .and_then(|parameter| parameter.to_normalized(parameter.initial))
            .unwrap_or(0.)
    });
    instance.retire();
    let config = instance.configuration.lock().ok().and_then(|value| *value);
    let prepared = if let Some((rate, max)) = config {
        let Some(value) = Instance::prepare(&bytes, rate, max) else {
            return false;
        };
        Some(value)
    } else {
        None
    };
    // The host may request another restore before processing resumes. Reject
    // that load rather than discarding a prepared runtime on the audio thread.
    if prepared.is_some() && !instance.pending.load(Ordering::Acquire).is_null() {
        return false;
    }
    let Ok(mut state) = instance.state.lock() else {
        return false;
    };
    let Ok(mut bound) = instance.descriptors.lock() else {
        return false;
    };
    *state = bytes;
    *bound = descriptors;
    for (slot, value) in values.into_iter().enumerate() {
        instance.normalized[slot].store(value.to_bits(), Ordering::Release);
    }
    if let Some(prepared) = prepared {
        instance
            .pending
            .store(Box::into_raw(prepared), Ordering::Release);
    }
    if !instance.host.is_null() {
        if let Some(get) = unsafe { (*instance.host).get_extension } {
            let extension = unsafe { get(instance.host, CLAP_EXT_PARAMS.as_ptr()) };
            if !extension.is_null() {
                let params = unsafe { &*(extension as *const clap_host_params) };
                if let Some(rescan) = params.rescan {
                    unsafe { rescan(instance.host, CLAP_PARAM_RESCAN_ALL) }
                }
            }
        }
    }
    true
}
static STATE: clap_plugin_state = clap_plugin_state {
    save: Some(save),
    load: Some(load),
};

#[cfg(test)]
mod tests {
    use super::*;
    use clap_sys::events::clap_input_events;
    use clap_sys::version::CLAP_VERSION;

    unsafe extern "C" fn event_count(events: *const clap_input_events) -> u32 {
        unsafe { (*((*events).ctx as *const Vec<*const clap_event_header>)).len() as u32 }
    }
    unsafe extern "C" fn event_get(
        events: *const clap_input_events,
        index: u32,
    ) -> *const clap_event_header {
        unsafe { (&*((*events).ctx as *const Vec<*const clap_event_header>))[index as usize] }
    }
    unsafe extern "C" fn write(stream: *const clap_ostream, data: *const c_void, size: u64) -> i64 {
        let out = unsafe { &mut *((*stream).ctx as *mut Vec<u8>) };
        out.extend_from_slice(unsafe {
            std::slice::from_raw_parts(data as *const u8, size as usize)
        });
        size as i64
    }
    struct Reader<'a> {
        bytes: &'a [u8],
        offset: usize,
    }
    unsafe extern "C" fn read(stream: *const clap_istream, out: *mut c_void, size: u64) -> i64 {
        let reader = unsafe { &mut *((*stream).ctx as *mut Reader<'_>) };
        let count = (size as usize).min(reader.bytes.len() - reader.offset);
        unsafe {
            ptr::copy_nonoverlapping(
                reader.bytes.as_ptr().add(reader.offset),
                out as *mut u8,
                count,
            )
        };
        reader.offset += count;
        count as i64
    }

    #[test]
    fn inactive_graph_automation_survives_activation_and_state_save() {
        let host = clap_host {
            clap_version: CLAP_VERSION,
            host_data: null_mut(),
            name: c"Test host".as_ptr(),
            vendor: c"Manifold".as_ptr(),
            url: c"https://example.test".as_ptr(),
            version: c"1".as_ptr(),
            get_extension: None,
            request_restart: None,
            request_process: None,
            request_callback: None,
        };
        let plugin =
            unsafe { crate::factory_create(&crate::FACTORY.0, &host, crate::GRAPH_ID.as_ptr()) };
        assert!(unsafe { (*plugin).init.unwrap()(plugin) });
        let binding = NativeProject::parse(DEFAULT).unwrap().host_bindings()[0];
        let event = clap_event_param_value {
            header: clap_event_header {
                size: std::mem::size_of::<clap_event_param_value>() as u32,
                time: 0,
                space_id: CLAP_CORE_EVENT_SPACE_ID,
                type_: CLAP_EVENT_PARAM_VALUE,
                flags: 0,
            },
            param_id: HOST_SLOT_BASE + binding.slot,
            cookie: null_mut(),
            note_id: -1,
            port_index: -1,
            channel: -1,
            key: -1,
            value: 0.42,
        };
        let pointers = vec![&event.header as *const _];
        let events = clap_input_events {
            ctx: &pointers as *const _ as *mut c_void,
            size: Some(event_count),
            get: Some(event_get),
        };
        unsafe { PARAMS.flush.unwrap()(plugin, &events, null()) };
        let mut value = -1.;
        assert!(unsafe { PARAMS.get_value.unwrap()(plugin, event.param_id, &mut value) });
        assert!((value - 0.42).abs() < 1e-6);
        assert!(unsafe { (*plugin).activate.unwrap()(plugin, 48_000., 1, 128) });
        assert!(unsafe { PARAMS.get_value.unwrap()(plugin, event.param_id, &mut value) });
        assert!((value - 0.42).abs() < 0.01);
        let mut saved = Vec::new();
        let stream = clap_ostream {
            ctx: &mut saved as *mut _ as *mut c_void,
            write: Some(write),
        };
        assert!(unsafe { STATE.save.unwrap()(plugin, &stream) });
        assert!(NativeProject::parse(&saved).is_ok());
        unsafe {
            (*plugin).deactivate.unwrap()(plugin);
            (*plugin).destroy.unwrap()(plugin)
        };
    }

    #[test]
    fn graph_clap_note_and_automation_match_native_and_state_reopens() {
        let host = clap_host {
            clap_version: CLAP_VERSION,
            host_data: null_mut(),
            name: c"Test host".as_ptr(),
            vendor: c"Manifold".as_ptr(),
            url: c"https://example.test".as_ptr(),
            version: c"1".as_ptr(),
            get_extension: None,
            request_restart: None,
            request_process: None,
            request_callback: None,
        };
        let plugin =
            unsafe { crate::factory_create(&crate::FACTORY.0, &host, crate::GRAPH_ID.as_ptr()) };
        assert!(unsafe { (*plugin).init.unwrap()(plugin) });
        assert_eq!(unsafe { crate::factory_count(&crate::FACTORY.0) }, 2);
        assert_eq!(unsafe { NOTE_PORTS.count.unwrap()(plugin, true) }, 1);
        assert_eq!(
            unsafe { PARAMS.count.unwrap()(plugin) },
            HOST_SLOT_COUNT as u32
        );
        assert!(unsafe { (*plugin).activate.unwrap()(plugin, 48_000., 1, 128) });
        assert!(unsafe { (*plugin).start_processing.unwrap()(plugin) });

        let project = NativeProject::parse(DEFAULT).unwrap();
        let slot = project
            .host_bindings()
            .iter()
            .find(|binding| {
                project
                    .host_parameters()
                    .iter()
                    .any(|parameter| parameter.id == binding.graph_parameter && !parameter.discrete)
            })
            .unwrap()
            .slot;
        let midi = 4_u64;
        let note = clap_event_note {
            header: clap_event_header {
                size: std::mem::size_of::<clap_event_note>() as u32,
                time: 0,
                space_id: CLAP_CORE_EVENT_SPACE_ID,
                type_: CLAP_EVENT_NOTE_ON,
                flags: 0,
            },
            note_id: -1,
            port_index: 0,
            channel: 0,
            key: 60,
            velocity: 0.8,
        };
        let automation = clap_event_param_value {
            header: clap_event_header {
                size: std::mem::size_of::<clap_event_param_value>() as u32,
                time: 32,
                space_id: CLAP_CORE_EVENT_SPACE_ID,
                type_: CLAP_EVENT_PARAM_VALUE,
                flags: 0,
            },
            param_id: HOST_SLOT_BASE + slot,
            cookie: null_mut(),
            note_id: -1,
            port_index: -1,
            channel: -1,
            key: -1,
            value: 0.73,
        };
        let pointers = vec![&note.header as *const _, &automation.header as *const _];
        let input_events = clap_input_events {
            ctx: &pointers as *const _ as *mut c_void,
            size: Some(event_count),
            get: Some(event_get),
        };
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output = clap_audio_buffer {
            data32: channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let block = clap_process {
            steady_time: 0,
            frames_count: 128,
            transport: null(),
            audio_inputs: null(),
            audio_outputs: &mut output,
            audio_inputs_count: 0,
            audio_outputs_count: 1,
            in_events: &input_events,
            out_events: null(),
        };
        assert_eq!(
            unsafe { (*plugin).process.unwrap()(plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        assert!(left.iter().any(|sample| sample.abs() > 0.00001));

        let mut native = project.prepare(48_000., 128).unwrap();
        let mut buffers = HostBuffers::prepare(128);
        let mut expected_left = [0_f32; 128];
        let mut expected_right = [0_f32; 128];
        unsafe {
            buffers
                .render(
                    &mut native,
                    RawHostBlock {
                        frames: 128,
                        main: [null(); 2],
                        sidechain: [null(); 2],
                        output: [expected_left.as_mut_ptr(), expected_right.as_mut_ptr()],
                        events: &[TimedEvent {
                            offset: 0,
                            node: midi,
                            kind: EventKind::NoteOn {
                                channel: 0,
                                note: 60,
                                velocity: 102,
                            },
                        }],
                        automation: &[TimedAutomation {
                            offset: 32,
                            id: HOST_SLOT_BASE + slot,
                            normalized: 0.73,
                        }],
                    },
                )
                .unwrap()
        };
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);

        let mut saved = Vec::new();
        let stream = clap_ostream {
            ctx: &mut saved as *mut _ as *mut c_void,
            write: Some(write),
        };
        assert!(unsafe { STATE.save.unwrap()(plugin, &stream) });
        let restored = NativeProject::parse(&saved).unwrap();
        assert_eq!(
            restored.host_bindings(),
            NativeProject::parse(DEFAULT).unwrap().host_bindings()
        );
        unsafe {
            (*plugin).stop_processing.unwrap()(plugin);
            (*plugin).deactivate.unwrap()(plugin);
            (*plugin).destroy.unwrap()(plugin)
        };
        let reopened =
            unsafe { crate::factory_create(&crate::FACTORY.0, &host, crate::GRAPH_ID.as_ptr()) };
        assert!(unsafe { (*reopened).init.unwrap()(reopened) });
        let mut reader = Reader {
            bytes: &saved,
            offset: 0,
        };
        let input = clap_istream {
            ctx: &mut reader as *mut _ as *mut c_void,
            read: Some(read),
        };
        assert!(unsafe { STATE.load.unwrap()(reopened, &input) });
        assert!(unsafe { (*reopened).activate.unwrap()(reopened, 48_000., 1, 128) });
        let mut value = -1.;
        assert!(unsafe { PARAMS.get_value.unwrap()(reopened, HOST_SLOT_BASE + slot, &mut value) });
        assert!((value - 0.73).abs() < 0.001);
        unsafe {
            (*reopened).deactivate.unwrap()(reopened);
            (*reopened).destroy.unwrap()(reopened)
        };
    }
}
