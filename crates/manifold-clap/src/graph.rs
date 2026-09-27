//! CLAP graph instrument. Project parsing and runtime replacement happen on the
//! host main thread; the audio callback only uses prepared, bounded storage.

#[cfg(target_os = "linux")]
use std::cell::UnsafeCell;
use std::ffi::{CStr, c_char, c_void};
use std::ptr::{self, null, null_mut};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, AtomicU64, AtomicUsize, Ordering};

#[cfg(target_os = "linux")]
use crate::graph_gui::{GuiMessage, GuiMessageKind, GuiState};
use clap_sys::audio_buffer::clap_audio_buffer;
use clap_sys::events::{
    CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_NOTE_CHOKE, CLAP_EVENT_NOTE_OFF, CLAP_EVENT_NOTE_ON,
    CLAP_EVENT_PARAM_GESTURE_BEGIN, CLAP_EVENT_PARAM_GESTURE_END, CLAP_EVENT_PARAM_VALUE,
    clap_event_header, clap_event_note, clap_event_param_gesture, clap_event_param_value,
    clap_input_events, clap_output_events,
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
const MAX_AUTOMATION: usize = 4096;
const MAX_NOTES: usize = 1024;
const MAX_STATE: usize = 45 * 1024 * 1024;

/// One graph generation's fixed host values. The active audio runtime is its
/// only writer; inactive flushes use the same bank when processing is stopped.
struct ValueBank {
    sequence: AtomicU64,
    values: [AtomicU32; HOST_SLOT_COUNT],
}

impl ValueBank {
    fn new(values: [f32; HOST_SLOT_COUNT]) -> Self {
        Self {
            sequence: AtomicU64::new(0),
            values: values.map(|value| AtomicU32::new(value.to_bits())),
        }
    }

    fn write_all(&self, values: [f32; HOST_SLOT_COUNT]) {
        self.sequence.fetch_add(1, Ordering::SeqCst);
        for (slot, value) in values.into_iter().enumerate() {
            self.values[slot].store(value.to_bits(), Ordering::SeqCst);
        }
        self.sequence.fetch_add(1, Ordering::SeqCst);
    }

    fn write_slot(&self, slot: usize, value: f32) {
        self.sequence.fetch_add(1, Ordering::SeqCst);
        self.values[slot].store(value.to_bits(), Ordering::SeqCst);
        self.sequence.fetch_add(1, Ordering::SeqCst);
    }

    fn read_all(&self) -> [f32; HOST_SLOT_COUNT] {
        loop {
            let before = self.sequence.load(Ordering::SeqCst);
            if before & 1 != 0 {
                std::hint::spin_loop();
                continue;
            }
            let values = std::array::from_fn(|slot| {
                f32::from_bits(self.values[slot].load(Ordering::SeqCst))
            });
            if before == self.sequence.load(Ordering::SeqCst) {
                return values;
            }
        }
    }

    fn read_slot(&self, slot: usize) -> f32 {
        f32::from_bits(self.values[slot].load(Ordering::Acquire))
    }
}

struct Runtime {
    bank: usize,
    prepared: PreparedNativeProject,
    buffers: HostBuffers,
    automation: Vec<TimedAutomation>,
    events: Vec<TimedEvent>,
    slot_indices: [Option<usize>; HOST_SLOT_COUNT],
    midi_node: Option<u64>,
}

pub(crate) struct Instance {
    pub plugin: clap_plugin,
    pub(super) host: *const clap_host,
    current: AtomicPtr<Runtime>,
    pending: AtomicPtr<Runtime>,
    retired: AtomicPtr<Runtime>,
    active: AtomicBool,
    configuration: Mutex<Option<(f32, usize)>>,
    state: Mutex<Vec<u8>>,
    descriptors: Mutex<[Option<HostParameter>; HOST_SLOT_COUNT]>,
    value_banks: [ValueBank; 2],
    active_bank: AtomicUsize,
    #[cfg(target_os = "linux")]
    presentation: Mutex<serde_json::Value>,
    #[cfg(target_os = "linux")]
    pub(super) gui: GuiState,
    #[cfg(target_os = "linux")]
    gui_retry: UnsafeCell<Option<GuiMessage>>,
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

#[cfg(target_os = "linux")]
fn build_presentation(bytes: &[u8], project: &NativeProject) -> Option<serde_json::Value> {
    let document: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let nodes: Vec<_> = document["signal"]["nodes"]
        .as_array()?
        .iter()
        .map(|node| serde_json::json!({"id":node["id"],"type":node["type"]}))
        .collect();
    let descriptors = slots(project);
    let controls: Vec<_> = descriptors
        .iter()
        .enumerate()
        .filter_map(|(slot, descriptor)| {
            descriptor.map(|descriptor| {
                serde_json::json!({
                    "id": HOST_SLOT_BASE + slot as u32, "nodeId":descriptor.node,
                    "parameterId":descriptor.local_id, "min":descriptor.min,
                    "max":descriptor.max, "discrete":descriptor.discrete, "normalized":0.0,
                })
            })
        })
        .collect();
    Some(serde_json::json!({"schemaVersion":1,"id":"manifold.graph",
        "nodes":nodes,"controls":controls}))
}

impl Instance {
    pub(crate) fn new(
        host: *const clap_host,
        descriptor: *const clap_plugin_descriptor,
    ) -> Box<Self> {
        let parsed = NativeProject::parse(DEFAULT).expect("authored graph project");
        #[cfg(target_os = "linux")]
        let presentation =
            build_presentation(DEFAULT, &parsed).expect("authored graph presentation");
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
            value_banks: [ValueBank::new(normalized), ValueBank::new(normalized)],
            active_bank: AtomicUsize::new(0),
            #[cfg(target_os = "linux")]
            presentation: Mutex::new(presentation),
            #[cfg(target_os = "linux")]
            gui: GuiState::new(),
            #[cfg(target_os = "linux")]
            gui_retry: UnsafeCell::new(None),
        });
        value.plugin.plugin_data = &mut *value as *mut Self as *mut c_void;
        value
    }

    fn prepare(bytes: &[u8], rate: f32, max: usize, bank: usize) -> Option<Box<Runtime>> {
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
            bank,
            prepared,
            buffers: HostBuffers::prepare(max),
            automation: Vec::with_capacity(MAX_AUTOMATION),
            events: Vec::with_capacity(MAX_NOTES),
            slot_indices,
            midi_node,
        }))
    }

    fn snapshot(&self, runtime: &Runtime) {
        let parameters = runtime.prepared.processor.host_parameters();
        let values = runtime.prepared.processor.current_parameter_values();
        let bank = &self.value_banks[runtime.bank];
        let normalized = std::array::from_fn(|slot| {
            runtime.slot_indices[slot]
                .and_then(|index| parameters[index].to_normalized(values[index]))
                .unwrap_or_else(|| bank.read_slot(slot))
        });
        bank.write_all(normalized);
        #[cfg(target_os = "linux")]
        self.gui.request_refresh(self.host);
    }

    pub(super) fn state_bytes(&self) -> Option<Vec<u8>> {
        let state = self.state.lock().ok()?;
        let descriptors = self.descriptors.lock().ok()?;
        let values = self.value_banks[self.active_bank.load(Ordering::Acquire)].read_all();
        let mut document: serde_json::Value = serde_json::from_slice(&state).ok()?;
        let entries = document["signal"]["initialParameters"].as_array_mut()?;
        for (slot, descriptor) in descriptors.iter().enumerate() {
            let Some(descriptor) = descriptor else {
                continue;
            };
            let physical = descriptor.from_normalized(values[slot])?;
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

    #[cfg(target_os = "linux")]
    pub(super) fn presentation(&self) -> Option<serde_json::Value> {
        let view = self.presentation.lock().ok()?;
        let mut document = view.clone();
        let values = self.value_banks[self.active_bank.load(Ordering::Acquire)].read_all();
        for control in document["controls"].as_array_mut()? {
            let id = u32::try_from(control["id"].as_u64()?).ok()?;
            let slot = id.checked_sub(HOST_SLOT_BASE)? as usize;
            if slot >= HOST_SLOT_COUNT {
                return None;
            }
            control["normalized"] = serde_json::Value::from(values[slot]);
        }
        Some(document)
    }

    pub(super) fn restore(&self, bytes: Vec<u8>) -> bool {
        let Ok(project) = NativeProject::parse(&bytes) else {
            return false;
        };
        #[cfg(target_os = "linux")]
        let Some(presentation) = build_presentation(&bytes, &project) else {
            return false;
        };
        let descriptors = slots(&project);
        let values = std::array::from_fn::<_, HOST_SLOT_COUNT, _>(|slot| {
            descriptors[slot]
                .and_then(|parameter| parameter.to_normalized(parameter.initial))
                .unwrap_or(0.)
        });
        self.retire();
        let config = self.configuration.lock().ok().and_then(|value| *value);
        let next_bank = 1 - self.active_bank.load(Ordering::Acquire);
        let prepared = if let Some((rate, max)) = config {
            let Some(value) = Instance::prepare(&bytes, rate, max, next_bank) else {
                return false;
            };
            Some(value)
        } else {
            None
        };
        if prepared.is_some() && !self.pending.load(Ordering::Acquire).is_null() {
            return false;
        }
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        let Ok(mut bound) = self.descriptors.lock() else {
            return false;
        };
        #[cfg(target_os = "linux")]
        let Ok(mut view) = self.presentation.lock() else {
            return false;
        };
        *state = bytes;
        *bound = descriptors;
        #[cfg(target_os = "linux")]
        {
            *view = presentation;
        }
        self.value_banks[next_bank].write_all(values);
        self.active_bank.store(next_bank, Ordering::Release);
        if let Some(prepared) = prepared {
            self.pending
                .store(Box::into_raw(prepared), Ordering::Release);
        }
        #[cfg(target_os = "linux")]
        drop(view);
        drop(bound);
        drop(state);
        if !self.host.is_null() {
            if let Some(get) = unsafe { (*self.host).get_extension } {
                let extension = unsafe { get(self.host, CLAP_EXT_PARAMS.as_ptr()) };
                if !extension.is_null() {
                    let params = unsafe { &*(extension as *const clap_host_params) };
                    if let Some(rescan) = params.rescan {
                        unsafe { rescan(self.host, CLAP_PARAM_RESCAN_ALL) }
                    }
                }
            }
        }
        #[cfg(target_os = "linux")]
        self.gui.request_refresh(self.host);
        true
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

pub(super) unsafe fn get<'a>(plugin: *const clap_plugin) -> Option<&'a Instance> {
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
        #[cfg(target_os = "linux")]
        instance.gui.stop();
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
    let bank = instance.active_bank.load(Ordering::Acquire);
    let Some(runtime) = Instance::prepare(&state, rate as f32, max as usize, bank) else {
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
unsafe extern "C" fn reset(plugin: *const clap_plugin) {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return;
    };
    let pointer = instance.current.load(Ordering::Acquire);
    if pointer.is_null() {
        return;
    }
    // CLAP calls reset while process is stopped; the prepared runtime belongs
    // to this audio thread. Keep project state, bindings, and host values.
    let runtime = unsafe { &mut *pointer };
    runtime.prepared.processor.reset_processing();
    runtime.events.clear();
    runtime.automation.clear();
}
unsafe extern "C" fn main_thread(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.retire();
        #[cfg(target_os = "linux")]
        instance.gui.main_thread(instance);
    }
}

unsafe extern "C" fn extension(_plugin: *const clap_plugin, id: *const c_char) -> *const c_void {
    if id.is_null() {
        return null();
    }
    let id = unsafe { CStr::from_ptr(id) };
    #[cfg(target_os = "linux")]
    if id == clap_sys::ext::gui::CLAP_EXT_GUI {
        return &crate::graph_gui::GUI as *const _ as *const c_void;
    }
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
    let bank = instance.active_bank.load(Ordering::Acquire);
    unsafe { *output = instance.value_banks[bank].read_slot(slot) as f64 };
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
    if count as usize > MAX_AUTOMATION * 4 {
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
                    || runtime.automation.len() == MAX_AUTOMATION
                {
                    return false;
                }
                runtime.automation.push(TimedAutomation {
                    offset,
                    id: event.param_id,
                    normalized: event.value as f32,
                });
            }
            CLAP_EVENT_NOTE_ON | CLAP_EVENT_NOTE_OFF | CLAP_EVENT_NOTE_CHOKE
                if runtime.midi_node.is_some() =>
            {
                if header.size < std::mem::size_of::<clap_event_note>() as u32 {
                    return false;
                }
                let event =
                    unsafe { &*(header as *const clap_event_header as *const clap_event_note) };
                if !(-1..=0).contains(&event.port_index) || runtime.events.len() == MAX_NOTES {
                    return false;
                }
                let on = header.type_ == CLAP_EVENT_NOTE_ON;
                if (on
                    && (!(0..=15).contains(&event.channel)
                        || !(0..=127).contains(&event.key)
                        || !event.velocity.is_finite()
                        || !(0. ..=1.).contains(&event.velocity)))
                    || (!on
                        && (!(-1..=15).contains(&event.channel)
                            || !(-1..=127).contains(&event.key)))
                {
                    return false;
                }
                // The core currently identifies notes by channel and key,
                // not CLAP note ID. A wildcard release clears all held notes
                // conservatively until filtered note-offs have a core event.
                let kind = if !on && (event.channel == -1 || event.key == -1) {
                    EventKind::AllNotesOff
                } else if !on || event.velocity == 0. {
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

#[cfg(target_os = "linux")]
fn drain_gui(
    instance: &Instance,
    output: *const clap_output_events,
    mut runtime: Option<&mut Runtime>,
) -> bool {
    if output.is_null() {
        return false;
    }
    let Some(push) = (unsafe { (*output).try_push }) else {
        return false;
    };
    let retry = unsafe { &mut *instance.gui_retry.get() };
    let mut changed = false;
    while let Some(message) = retry.take().or_else(|| instance.gui.events.pop()) {
        let header = clap_event_header {
            size: 0,
            time: 0,
            space_id: CLAP_CORE_EVENT_SPACE_ID,
            type_: 0,
            flags: 0,
        };
        let accepted = match message.kind {
            GuiMessageKind::Begin | GuiMessageKind::End => {
                let event = clap_event_param_gesture {
                    header: clap_event_header {
                        size: std::mem::size_of::<clap_event_param_gesture>() as u32,
                        type_: if matches!(message.kind, GuiMessageKind::Begin) {
                            CLAP_EVENT_PARAM_GESTURE_BEGIN
                        } else {
                            CLAP_EVENT_PARAM_GESTURE_END
                        },
                        ..header
                    },
                    param_id: message.id,
                };
                unsafe { push(output, &event.header) }
            }
            GuiMessageKind::Value => {
                let event = clap_event_param_value {
                    header: clap_event_header {
                        size: std::mem::size_of::<clap_event_param_value>() as u32,
                        type_: CLAP_EVENT_PARAM_VALUE,
                        ..header
                    },
                    param_id: message.id,
                    cookie: null_mut(),
                    note_id: -1,
                    port_index: -1,
                    channel: -1,
                    key: -1,
                    value: message.value as f64,
                };
                unsafe { push(output, &event.header) }
            }
        };
        if !accepted {
            *retry = Some(message);
            instance.gui.flush_retry.store(true, Ordering::Release);
            if !instance.host.is_null() {
                if let Some(callback) = unsafe { (*instance.host).request_callback } {
                    unsafe { callback(instance.host) };
                }
            }
            break;
        }
        if matches!(message.kind, GuiMessageKind::Value) {
            let slot = (message.id - HOST_SLOT_BASE) as usize;
            if let Some(runtime) = runtime.as_deref_mut() {
                if let Some(index) = runtime.slot_indices[slot] {
                    let descriptor = runtime.prepared.processor.host_parameters()[index];
                    if let Some(physical) = descriptor.from_normalized(message.value) {
                        let _ = runtime.prepared.processor.set_parameter(
                            (descriptor.node as u32).into(),
                            descriptor.local_id,
                            physical,
                        );
                    }
                }
            } else {
                let bank = instance.active_bank.load(Ordering::Acquire);
                instance.value_banks[bank].write_slot(slot, message.value);
            }
            changed = true;
        }
    }
    if changed {
        instance.gui.request_refresh(instance.host);
    }
    changed
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
    #[cfg(target_os = "linux")]
    let gui_changed = drain_gui(instance, block.out_events, Some(runtime));
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
    if !runtime.automation.is_empty() || {
        #[cfg(target_os = "linux")]
        {
            gui_changed
        }
        #[cfg(not(target_os = "linux"))]
        {
            false
        }
    } {
        instance.snapshot(runtime)
    }
    CLAP_PROCESS_CONTINUE
}
unsafe extern "C" fn flush(
    plugin: *const clap_plugin,
    events: *const clap_input_events,
    out: *const clap_output_events,
) {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return;
    };
    instance.publish();
    let pointer = instance.current.load(Ordering::Acquire);
    if pointer.is_null() {
        #[cfg(target_os = "linux")]
        let _ = drain_gui(instance, out, None);
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
            for index in 0..unsafe { size(events) }.min((MAX_AUTOMATION * 4) as u32) {
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
                    let bank = instance.active_bank.load(Ordering::Acquire);
                    instance.value_banks[bank].write_slot(slot, value.value as f32);
                }
            }
        }
        #[cfg(target_os = "linux")]
        instance.gui.request_refresh(instance.host);
        return;
    }
    let runtime = unsafe { &mut *pointer };
    if !unsafe { collect(events, 0, runtime) } {
        return;
    }
    #[cfg(target_os = "linux")]
    let _ = drain_gui(instance, out, Some(runtime));
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
    instance.restore(bytes)
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

    #[test]
    fn fixed_value_bank_never_exposes_a_mixed_audio_snapshot() {
        let bank = ValueBank::new([0.25; HOST_SLOT_COUNT]);
        std::thread::scope(|scope| {
            scope.spawn(|| {
                for index in 0..20_000 {
                    bank.write_all([if index & 1 == 0 { 0.75 } else { 0.25 }; HOST_SLOT_COUNT]);
                }
            });
            for _ in 0..20_000 {
                let values = bank.read_all();
                assert!(values.iter().all(|value| *value == values[0]));
            }
        });
    }

    #[test]
    fn live_state_saves_keep_automated_controls_from_one_block() {
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        let descriptors = *instance.descriptors.lock().unwrap();
        let continuous: Vec<_> = descriptors
            .iter()
            .enumerate()
            .filter_map(|(slot, descriptor)| {
                descriptor
                    .filter(|descriptor| !descriptor.discrete)
                    .map(|descriptor| (slot, descriptor))
            })
            .collect();
        let (first_slot, first) = continuous[0];
        let (second_slot, second) = continuous[1];
        let initial = instance.value_banks[0].read_all();
        std::thread::scope(|scope| {
            scope.spawn(|| {
                for index in 0..20_000 {
                    let mut values = initial;
                    values[first_slot] = if index & 1 == 0 { 0.2 } else { 0.8 };
                    values[second_slot] = if index & 1 == 0 { 0.8 } else { 0.2 };
                    instance.value_banks[0].write_all(values);
                }
            });
            for _ in 0..128 {
                let saved = instance.state_bytes().unwrap();
                let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
                let entries = document["signal"]["initialParameters"].as_array().unwrap();
                let physical = |descriptor: HostParameter| {
                    entries
                        .iter()
                        .find(|entry| {
                            entry["nodeId"] == descriptor.node && entry["id"] == descriptor.local_id
                        })
                        .unwrap()["value"]
                        .as_f64()
                        .unwrap()
                };
                let normalized_first = first.to_normalized(physical(first) as f32).unwrap();
                let normalized_second = second.to_normalized(physical(second) as f32).unwrap();
                // The initial pair may be read before the first publication.
                if (normalized_first - initial[first_slot]).abs() > 1e-5
                    || (normalized_second - initial[second_slot]).abs() > 1e-5
                {
                    assert!(
                        (normalized_first + normalized_second - 1.0).abs() < 1e-5,
                        "saved pair={normalized_first},{normalized_second}; initial pair={},{}",
                        initial[first_slot],
                        initial[second_slot]
                    );
                }
                NativeProject::parse(&saved).unwrap();
            }
        });
    }

    #[test]
    fn project_import_save_ignores_snapshots_from_the_retired_generation() {
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        *instance.configuration.lock().unwrap() = Some((48_000., 128));
        instance.active.store(true, Ordering::Release);
        let old_runtime = Instance::prepare(DEFAULT, 48_000., 128, 0).unwrap();
        let running = AtomicBool::new(true);
        std::thread::scope(|scope| {
            scope.spawn(|| {
                while running.load(Ordering::Acquire) {
                    instance.snapshot(&old_runtime);
                }
            });
            let tone = include_bytes!("../../../projects/graph-workspace/tone-texture.json");
            assert!(instance.restore(tone.to_vec()));
            assert!(!instance.pending.load(Ordering::Acquire).is_null());
            for _ in 0..32 {
                let saved = instance.state_bytes().unwrap();
                let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
                assert!(
                    document["signal"]["nodes"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|node| node["type"] == "oscillator")
                );
                let reopened = NativeProject::parse(&saved).unwrap();
                assert_eq!(reopened.host_bindings().len(), 12);
            }
            running.store(false, Ordering::Release);
        });
        instance.deactivate();
    }

    unsafe extern "C" fn event_count(events: *const clap_input_events) -> u32 {
        unsafe { (*((*events).ctx as *const Vec<*const clap_event_header>)).len() as u32 }
    }
    unsafe extern "C" fn event_get(
        events: *const clap_input_events,
        index: u32,
    ) -> *const clap_event_header {
        unsafe { (&*((*events).ctx as *const Vec<*const clap_event_header>))[index as usize] }
    }
    #[cfg(target_os = "linux")]
    unsafe extern "C" fn output_push(
        output: *const clap_output_events,
        event: *const clap_event_header,
    ) -> bool {
        let collected = unsafe { &mut *((*output).ctx as *mut Vec<(u16, u32, f64)>) };
        let header = unsafe { &*event };
        let (id, value) = if header.type_ == CLAP_EVENT_PARAM_VALUE {
            let event = unsafe { &*(event as *const clap_event_param_value) };
            (event.param_id, event.value)
        } else {
            let event = unsafe { &*(event as *const clap_event_param_gesture) };
            (event.param_id, 0.)
        };
        collected.push((header.type_, id, value));
        true
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

    #[cfg(target_os = "linux")]
    #[test]
    fn original_graph_widget_gestures_reach_clap_and_saved_state() {
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
        let id = HOST_SLOT_BASE + 1;
        let instance = unsafe { get(plugin) }.unwrap();
        for (kind, value) in [
            (GuiMessageKind::Begin, 0.),
            (GuiMessageKind::Value, 0.71),
            (GuiMessageKind::End, 0.),
        ] {
            assert!(
                instance
                    .gui
                    .enqueue(instance.host, GuiMessage { kind, id, value })
            );
        }
        let mut collected: Vec<(u16, u32, f64)> = Vec::new();
        let output = clap_output_events {
            ctx: &mut collected as *mut _ as *mut c_void,
            try_push: Some(output_push),
        };
        unsafe { PARAMS.flush.unwrap()(plugin, null(), &output) };
        assert_eq!(
            collected,
            vec![
                (CLAP_EVENT_PARAM_GESTURE_BEGIN, id, 0.),
                (CLAP_EVENT_PARAM_VALUE, id, 0.71_f32 as f64),
                (CLAP_EVENT_PARAM_GESTURE_END, id, 0.),
            ]
        );
        let mut public = -1.;
        assert!(unsafe { PARAMS.get_value.unwrap()(plugin, id, &mut public) });
        assert!((public - 0.71).abs() < 1e-6);
        let mut saved = Vec::new();
        let stream = clap_ostream {
            ctx: &mut saved as *mut _ as *mut c_void,
            write: Some(write),
        };
        assert!(unsafe { STATE.save.unwrap()(plugin, &stream) });
        assert!(NativeProject::parse(&saved).is_ok());
        unsafe { (*plugin).destroy.unwrap()(plugin) };
    }

    #[test]
    fn dense_automation_and_wildcard_release_stay_inside_prepared_buffers() {
        let mut runtime = *Instance::prepare(DEFAULT, 48_000., 128, 0).unwrap();
        let id = HOST_SLOT_BASE + 1;
        let points: Vec<_> = (0..1536)
            .map(|index| clap_event_param_value {
                header: clap_event_header {
                    size: std::mem::size_of::<clap_event_param_value>() as u32,
                    time: index / 16,
                    space_id: CLAP_CORE_EVENT_SPACE_ID,
                    type_: CLAP_EVENT_PARAM_VALUE,
                    flags: 0,
                },
                param_id: id,
                cookie: null_mut(),
                note_id: -1,
                port_index: -1,
                channel: -1,
                key: -1,
                value: (index % 101) as f64 / 100.,
            })
            .collect();
        let release = clap_event_note {
            header: clap_event_header {
                size: std::mem::size_of::<clap_event_note>() as u32,
                time: 96,
                space_id: CLAP_CORE_EVENT_SPACE_ID,
                type_: CLAP_EVENT_NOTE_OFF,
                flags: 0,
            },
            note_id: -1,
            port_index: -1,
            channel: -1,
            key: -1,
            velocity: f64::NAN,
        };
        let mut pointers: Vec<_> = points
            .iter()
            .map(|point| &point.header as *const _)
            .collect();
        pointers.push(&release.header);
        let events = clap_input_events {
            ctx: &pointers as *const _ as *mut c_void,
            size: Some(event_count),
            get: Some(event_get),
        };
        assert!(unsafe { collect(&events, 128, &mut runtime) });
        assert_eq!(runtime.automation.len(), 1536);
        assert_eq!(runtime.events[0].kind, EventKind::AllNotesOff);
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        assert!(
            unsafe {
                runtime.buffers.render(
                    &mut runtime.prepared.processor,
                    RawHostBlock {
                        frames: 128,
                        main: [null(); 2],
                        sidechain: [null(); 2],
                        output: [left.as_mut_ptr(), right.as_mut_ptr()],
                        events: &runtime.events,
                        automation: &runtime.automation,
                    },
                )
            }
            .is_ok()
        );
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
        let mut block = clap_process {
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

        unsafe {
            (*plugin).stop_processing.unwrap()(plugin);
            (*plugin).reset.unwrap()(plugin);
            (*plugin).reset.unwrap()(plugin);
            assert!((*plugin).start_processing.unwrap()(plugin));
        }
        let empty_pointers: Vec<*const clap_event_header> = Vec::new();
        let empty_events = clap_input_events {
            ctx: &empty_pointers as *const _ as *mut c_void,
            size: Some(event_count),
            get: Some(event_get),
        };
        block.in_events = &empty_events;
        assert_eq!(
            unsafe { (*plugin).process.unwrap()(plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        assert_eq!(left, [0.0; 128]);
        assert_eq!(right, [0.0; 128]);
        let mut retained = -1.0;
        assert!(unsafe { PARAMS.get_value.unwrap()(plugin, HOST_SLOT_BASE + slot, &mut retained) });
        assert!((retained - 0.73).abs() < 0.001);

        let note_pointers = vec![&note.header as *const _];
        let note_events = clap_input_events {
            ctx: &note_pointers as *const _ as *mut c_void,
            size: Some(event_count),
            get: Some(event_get),
        };
        block.in_events = &note_events;
        assert_eq!(
            unsafe { (*plugin).process.unwrap()(plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        native.reset_processing();
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
                        automation: &[],
                    },
                )
                .unwrap();
        }
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
