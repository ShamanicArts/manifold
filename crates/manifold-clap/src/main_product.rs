//! Dedicated Main CLAP class. Audio callbacks use the assembled Main runtime;
//! state parsing, preparation, and JSON serialization stay on the host thread.

use std::ffi::{CStr, c_char, c_void};
use std::ptr::{null, null_mut};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
use std::time::{Duration, Instant};

use clap_sys::audio_buffer::clap_audio_buffer;
use clap_sys::events::{
    CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_NOTE_CHOKE, CLAP_EVENT_NOTE_OFF, CLAP_EVENT_NOTE_ON,
    clap_event_header, clap_event_note, clap_input_events,
};
use clap_sys::ext::audio_ports::{
    CLAP_AUDIO_PORT_IS_MAIN, CLAP_EXT_AUDIO_PORTS, CLAP_PORT_STEREO, clap_audio_port_info,
    clap_plugin_audio_ports,
};
use clap_sys::ext::note_ports::{
    CLAP_EXT_NOTE_PORTS, CLAP_NOTE_DIALECT_CLAP, clap_note_port_info, clap_plugin_note_ports,
};
use clap_sys::ext::state::{CLAP_EXT_STATE, clap_plugin_state};
use clap_sys::host::clap_host;
use clap_sys::plugin::{clap_plugin, clap_plugin_descriptor};
use clap_sys::process::{
    CLAP_PROCESS_CONTINUE, CLAP_PROCESS_ERROR, clap_process, clap_process_status,
};
use clap_sys::stream::{clap_istream, clap_ostream};
use manifold_core::events::EventKind;
use manifold_native::main_host::{MainAudioRuntime, MainControl};
use manifold_native::main_host_buffers::{MainHostBuffers, RawMainHostBlock};
use manifold_native::main_instrument::{MainHostAudioBlock, MainHostEvent, MainHostEventKind};
use manifold_native::main_session::{default_main_session, prepare_main_session};

const MAX_EVENTS: usize = 1024;
const MAX_STATE: usize = 300 * 1024 * 1024;

struct Runtime {
    audio: MainAudioRuntime,
    buffers: MainHostBuffers,
    actions: Vec<MainHostEvent>,
}

pub(crate) struct Instance {
    pub plugin: clap_plugin,
    host: *const clap_host,
    runtime: AtomicPtr<Runtime>,
    control: Mutex<Option<MainControl>>,
    state: Mutex<Option<Vec<u8>>>,
    active: AtomicBool,
    processing: AtomicBool,
}

// CLAP serializes process calls and stops them before deactivate. The audio
// thread owns Runtime while processing; MainControl communicates only through
// bounded lock-free queues and is accessed on the host's state thread.
unsafe impl Sync for Instance {}

impl Instance {
    pub(crate) fn new(
        host: *const clap_host,
        descriptor: *const clap_plugin_descriptor,
    ) -> Box<Self> {
        let mut instance = Box::new(Self {
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
            runtime: AtomicPtr::new(null_mut()),
            control: Mutex::new(None),
            state: Mutex::new(None),
            active: AtomicBool::new(false),
            processing: AtomicBool::new(false),
        });
        instance.plugin.plugin_data = &mut *instance as *mut Self as *mut c_void;
        instance
    }

    fn activate(&self, rate: f64, max_frames: u32) -> bool {
        if self.active.load(Ordering::Acquire)
            || !rate.is_finite()
            || !(8_000.0..=192_000.0).contains(&rate)
            || max_frames == 0
            || max_frames > 65_536
        {
            return false;
        }
        let Ok(mut control_slot) = self.control.lock() else {
            return false;
        };
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        let bytes = if let Some(bytes) = state.as_ref() {
            bytes.clone()
        } else {
            let Ok(default) = default_main_session(rate as f32) else {
                return false;
            };
            let Ok(bytes) = serde_json::to_vec(&default) else {
                return false;
            };
            bytes
        };
        let Ok((mut audio, mut control)) =
            MainAudioRuntime::prepare(rate as f32, max_frames as usize)
        else {
            return false;
        };
        if control.submit_session(&bytes).is_err() {
            return false;
        }
        // Publish the imported state before the first audible host block.
        let mut left = [];
        let mut right = [];
        if audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &[],
            })
            .is_err()
        {
            return false;
        }
        control.reclaim();
        let runtime = Box::new(Runtime {
            audio,
            buffers: MainHostBuffers::prepare(max_frames as usize),
            actions: Vec::with_capacity(MAX_EVENTS),
        });
        *state = Some(bytes);
        *control_slot = Some(control);
        self.runtime
            .store(Box::into_raw(runtime), Ordering::Release);
        self.active.store(true, Ordering::Release);
        true
    }

    fn snapshot(
        &self,
        runtime: *mut Runtime,
        control: &mut MainControl,
        offline: bool,
    ) -> Option<Vec<u8>> {
        if offline {
            let mut left = [];
            let mut right = [];
            // Publish a state load accepted just before processing stopped.
            unsafe { &mut *runtime }
                .audio
                .process_host(MainHostAudioBlock {
                    input: None,
                    output: [&mut left, &mut right],
                    actions: &[],
                })
                .ok()?;
            control.reclaim();
        }
        control.request_session_snapshot().ok()?;
        if !offline && !self.host.is_null() {
            if let Some(request) = unsafe { (*self.host).request_process } {
                unsafe { request(self.host) };
            }
        }
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            if offline {
                let mut left = [];
                let mut right = [];
                // CLAP has stopped process calls before this host-thread path.
                unsafe { &mut *runtime }
                    .audio
                    .process_host(MainHostAudioBlock {
                        input: None,
                        output: [&mut left, &mut right],
                        actions: &[],
                    })
                    .ok()?;
            }
            if let Some(bytes) = control.poll_session_snapshot().ok()? {
                return Some(bytes);
            }
            if Instant::now() >= deadline {
                return None;
            }
            if !offline {
                std::thread::yield_now();
            }
        }
    }

    fn save_bytes(&self) -> Option<Vec<u8>> {
        let runtime = self.runtime.load(Ordering::Acquire);
        if runtime.is_null() {
            return self
                .state
                .lock()
                .ok()?
                .clone()
                .or_else(|| serde_json::to_vec(&default_main_session(48_000.0).ok()?).ok());
        }
        let mut control_slot = self.control.lock().ok()?;
        let control = control_slot.as_mut()?;
        let offline = !self.processing.load(Ordering::Acquire);
        let bytes = self.snapshot(runtime, control, offline)?;
        *self.state.lock().ok()? = Some(bytes.clone());
        Some(bytes)
    }

    fn load_bytes(&self, bytes: Vec<u8>) -> bool {
        if bytes.len() > MAX_STATE {
            return false;
        }
        let runtime = self.runtime.load(Ordering::Acquire);
        if runtime.is_null() {
            let Ok(document) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
                return false;
            };
            let Some(rate) = document["sampleRate"].as_f64() else {
                return false;
            };
            if prepare_main_session(&bytes, rate as f32, 128).is_err() {
                return false;
            }
        } else {
            let Ok(mut control_slot) = self.control.lock() else {
                return false;
            };
            let Some(control) = control_slot.as_mut() else {
                return false;
            };
            if control.submit_session(&bytes).is_err() {
                return false;
            }
            if !self.processing.load(Ordering::Acquire) {
                let mut left = [];
                let mut right = [];
                // No process callback can access Runtime while stopped.
                if unsafe { &mut *runtime }
                    .audio
                    .process_host(MainHostAudioBlock {
                        input: None,
                        output: [&mut left, &mut right],
                        actions: &[],
                    })
                    .is_err()
                {
                    return false;
                }
                control.reclaim();
            }
        }
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        *state = Some(bytes);
        true
    }

    fn deactivate(&self) {
        self.processing.store(false, Ordering::Release);
        self.active.store(false, Ordering::Release);
        let runtime = self.runtime.swap(null_mut(), Ordering::AcqRel);
        if runtime.is_null() {
            return;
        }
        if let Ok(mut slot) = self.control.lock() {
            if let Some(mut control) = slot.take() {
                if let Some(bytes) = self.snapshot(runtime, &mut control, true) {
                    if let Ok(mut state) = self.state.lock() {
                        *state = Some(bytes);
                    }
                }
                control.reclaim();
            }
        }
        // CLAP guarantees no concurrent process call after stop/deactivate.
        unsafe { drop(Box::from_raw(runtime)) };
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
    unsafe { get(plugin) }.is_some_and(|instance| instance.activate(rate, max))
}
unsafe extern "C" fn deactivate(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.deactivate();
    }
}
unsafe extern "C" fn start(plugin: *const clap_plugin) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if !instance.active.load(Ordering::Acquire) {
        return false;
    }
    instance.processing.store(true, Ordering::Release);
    true
}
unsafe extern "C" fn stop(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.processing.store(false, Ordering::Release);
    }
}
unsafe extern "C" fn reset(plugin: *const clap_plugin) {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return;
    };
    let runtime = instance.runtime.load(Ordering::Acquire);
    if !runtime.is_null() {
        // CLAP serializes reset against process for the same instance.
        unsafe { &mut *runtime }.audio.reset_processing();
    }
}
unsafe extern "C" fn main_thread(_plugin: *const clap_plugin) {}

unsafe fn input_channels(buffers: *const clap_audio_buffer, count: u32) -> [*const f32; 2] {
    if buffers.is_null() || count == 0 {
        return [null(); 2];
    }
    let port = unsafe { &*buffers };
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

unsafe fn output_channels(buffers: *mut clap_audio_buffer, count: u32) -> Option<[*mut f32; 2]> {
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

unsafe fn collect(
    list: *const clap_input_events,
    frames: usize,
    actions: &mut Vec<MainHostEvent>,
) -> bool {
    actions.clear();
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
        if !matches!(
            header.type_,
            CLAP_EVENT_NOTE_ON | CLAP_EVENT_NOTE_OFF | CLAP_EVENT_NOTE_CHOKE
        ) {
            continue;
        }
        if header.size < std::mem::size_of::<clap_event_note>() as u32
            || actions.len() == MAX_EVENTS
        {
            return false;
        }
        let note = unsafe { &*(header as *const clap_event_header as *const clap_event_note) };
        if !(-1..=0).contains(&note.port_index) {
            return false;
        }
        let on = header.type_ == CLAP_EVENT_NOTE_ON;
        if (on
            && (!(0..=15).contains(&note.channel)
                || !(0..=127).contains(&note.key)
                || !note.velocity.is_finite()
                || !(0.0..=1.0).contains(&note.velocity)))
            || (!on && (!(-1..=15).contains(&note.channel) || !(-1..=127).contains(&note.key)))
        {
            return false;
        }
        let kind = if !on && (note.channel == -1 || note.key == -1) {
            EventKind::AllNotesOff
        } else if !on || note.velocity == 0.0 {
            EventKind::NoteOff {
                channel: note.channel as u8,
                note: note.key as u8,
            }
        } else {
            EventKind::NoteOn {
                channel: note.channel as u8,
                note: note.key as u8,
                velocity: ((note.velocity * 127.0).round() as u8).max(1),
            }
        };
        actions.push(MainHostEvent {
            offset,
            kind: MainHostEventKind::Midi(kind),
        });
    }
    true
}

unsafe extern "C" fn process(
    plugin: *const clap_plugin,
    block: *const clap_process,
) -> clap_process_status {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return CLAP_PROCESS_ERROR;
    };
    if block.is_null() || !instance.processing.load(Ordering::Acquire) {
        return CLAP_PROCESS_ERROR;
    }
    let pointer = instance.runtime.load(Ordering::Acquire);
    if pointer.is_null() {
        return CLAP_PROCESS_ERROR;
    }
    let runtime = unsafe { &mut *pointer };
    let block = unsafe { &*block };
    if !unsafe {
        collect(
            block.in_events,
            block.frames_count as usize,
            &mut runtime.actions,
        )
    } {
        return CLAP_PROCESS_ERROR;
    }
    let Some(output) = (unsafe { output_channels(block.audio_outputs, block.audio_outputs_count) })
    else {
        return CLAP_PROCESS_ERROR;
    };
    let input = unsafe { input_channels(block.audio_inputs, block.audio_inputs_count) };
    if unsafe {
        runtime.buffers.render(
            &mut runtime.audio,
            RawMainHostBlock {
                frames: block.frames_count as usize,
                input,
                output,
                actions: &runtime.actions,
            },
        )
    }
    .is_err()
    {
        return CLAP_PROCESS_ERROR;
    }
    CLAP_PROCESS_CONTINUE
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
    } else if id == CLAP_EXT_STATE {
        &STATE as *const _ as *const c_void
    } else {
        null()
    }
}

unsafe extern "C" fn audio_count(_plugin: *const clap_plugin, _input: bool) -> u32 {
    1
}
unsafe extern "C" fn audio_info(
    _plugin: *const clap_plugin,
    index: u32,
    input: bool,
    info: *mut clap_audio_port_info,
) -> bool {
    if index != 0 || info.is_null() {
        return false;
    }
    let info = unsafe { &mut *info };
    info.id = if input { 0 } else { 1 };
    info.name.fill(0);
    let name: &[u8] = if input { b"Main In" } else { b"Main Out" };
    for (destination, source) in info.name.iter_mut().zip(name.iter()) {
        *destination = *source as c_char;
    }
    info.flags = CLAP_AUDIO_PORT_IS_MAIN;
    info.channel_count = 2;
    info.port_type = CLAP_PORT_STEREO.as_ptr();
    info.in_place_pair = if input { 1 } else { 0 };
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
    for (destination, source) in info.name.iter_mut().zip(b"Notes In".iter()) {
        *destination = *source as c_char;
    }
    true
}
static NOTE_PORTS: clap_plugin_note_ports = clap_plugin_note_ports {
    count: Some(note_count),
    get: Some(note_info),
};

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
    let Some(bytes) = instance.save_bytes() else {
        return false;
    };
    let mut offset = 0;
    while offset < bytes.len() {
        let count = unsafe {
            write(
                stream,
                bytes[offset..].as_ptr() as *const c_void,
                (bytes.len() - offset) as u64,
            )
        };
        if count <= 0 || count as usize > bytes.len() - offset {
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
    instance.load_bytes(bytes)
}
static STATE: clap_plugin_state = clap_plugin_state {
    save: Some(save),
    load: Some(load),
};
