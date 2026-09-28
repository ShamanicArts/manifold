//! Dedicated Main CLAP class. Audio callbacks use the assembled Main runtime;
//! state parsing, preparation, and JSON serialization stay on the host thread.

use std::cell::UnsafeCell;
use std::ffi::{CStr, c_char, c_void};
use std::ptr::{null, null_mut};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use clap_sys::audio_buffer::clap_audio_buffer;
use clap_sys::events::{
    CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_NOTE_CHOKE, CLAP_EVENT_NOTE_OFF, CLAP_EVENT_NOTE_ON,
    CLAP_EVENT_PARAM_VALUE, clap_event_header, clap_event_note, clap_event_param_value,
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
    CLAP_EXT_PARAMS, CLAP_PARAM_IS_AUTOMATABLE, CLAP_PARAM_IS_STEPPED, clap_param_info,
    clap_plugin_params,
};
use clap_sys::ext::state::{CLAP_EXT_STATE, clap_plugin_state};
use clap_sys::host::clap_host;
use clap_sys::plugin::{clap_plugin, clap_plugin_descriptor};
use clap_sys::process::{
    CLAP_PROCESS_CONTINUE, CLAP_PROCESS_ERROR, clap_process, clap_process_status,
};
use clap_sys::stream::{clap_istream, clap_ostream};
use crossbeam_queue::ArrayQueue;
use manifold_core::events::EventKind;
use manifold_native::main_host::{MainAudioRuntime, MainControl};
use manifold_native::main_host_buffers::{MainHostBuffers, RawMainHostBlock};
use manifold_native::main_host_parameters::{MAIN_HOST_ID_CAPACITY, MainParameter, parameter_name};
use manifold_native::main_host_state::values_from_session;
use manifold_native::main_instrument::{
    MainHostAudioBlock, MainHostEvent, MainHostEventKind, valid_main_command,
};
use manifold_native::main_presentation::compact_main_presentation;
use manifold_native::main_rack_document::validate_layout_update;
use manifold_native::main_sample_handoff::SampleUpdate;
use manifold_native::main_session::{default_main_session, prepare_main_session};
use manifold_native::main_session_export::save_template;

use manifold_native::main_visual::MainVisualBank;

const MAX_EVENTS: usize = 4096;
const MAX_UI_COMMANDS: usize = 128;
pub(crate) const MAX_STATE: usize = 300 * 1024 * 1024;
const STATUS_FIELDS: usize = 20;
const STATUS_COUNT: usize = STATUS_FIELDS * 4;
const COMMAND_EXTENSION_ID: &[u8] = b"shamanic.manifold.main.commands/1";

/// Private editor-to-audio command ingress. IDs and values are the authored
/// `projects/main-looper/project.json` command map, separate from CLAP params.
#[repr(C)]
struct MainCommands {
    enqueue: Option<unsafe extern "C" fn(*const clap_plugin, u32, f32) -> bool>,
}

struct Runtime {
    audio: MainAudioRuntime,
    buffers: MainHostBuffers,
    actions: Vec<MainHostEvent>,
    max_frames: usize,
}

pub(crate) struct Instance {
    pub plugin: clap_plugin,
    pub(crate) host: *const clap_host,
    runtime: AtomicPtr<Runtime>,
    control: Mutex<Option<MainControl>>,
    state: Mutex<Option<Vec<u8>>>,
    layout_overlay: Mutex<Option<serde_json::Value>>,
    presentation: Mutex<Option<serde_json::Value>>,
    pending_values: Mutex<Vec<MainHostEvent>>,
    commands: ArrayQueue<MainHostEvent>,
    gui_retry: UnsafeCell<Option<MainHostEvent>>,
    parameter_ids: Vec<u32>,
    defaults: [f32; MAIN_HOST_ID_CAPACITY],
    values: [AtomicU32; MAIN_HOST_ID_CAPACITY],
    status_values: [AtomicU32; STATUS_COUNT],
    status_epoch: AtomicU64,
    status_runtime_generation: AtomicU64,
    sample_frames: AtomicU32,
    visual: MainVisualBank,
    active: AtomicBool,
    processing: AtomicBool,
    #[cfg(target_os = "linux")]
    pub(crate) gui: crate::main_gui::GuiState,
}

// CLAP serializes process calls and stops them before deactivate. The audio
// thread owns Runtime and gui_retry while processing; MainControl communicates
// through bounded lock-free queues and is accessed on the host's state thread.
unsafe impl Sync for Instance {}

impl Instance {
    pub(crate) fn cancel_sample_capture(&self) {
        if let Ok(mut slot) = self.control.lock() {
            if let Some(control) = slot.as_mut() {
                control.cancel_sample_capture();
            }
        }
    }

    pub(crate) fn sample_action(&self, action: &str, source: usize, bars: f32) -> bool {
        if !self.active.load(Ordering::Acquire) || !self.processing.load(Ordering::Acquire) {
            return false;
        }
        let Ok(mut slot) = self.control.lock() else {
            return false;
        };
        let Some(control) = slot.as_mut() else {
            return false;
        };
        let accepted = match action {
            "retro" => control.request_retro_sample(source, bars),
            "free-start" => control.start_free_sample(source),
            "free-stop" => control.finish_free_sample(),
            "free-cancel" => control.cancel_free_sample(),
            _ => false,
        };
        if accepted && !self.host.is_null() {
            if let Some(request) = unsafe { (*self.host).request_process } {
                unsafe { request(self.host) };
            }
        }
        accepted
    }

    pub(crate) fn poll_sample_updates(&self) -> Vec<SampleUpdate> {
        let Ok(mut slot) = self.control.try_lock() else {
            return Vec::new();
        };
        let Some(control) = slot.as_mut() else {
            return Vec::new();
        };
        let updates = control.poll_sample();
        if updates.iter().any(
            |update| matches!(update, SampleUpdate::Progress { copied, total } if copied == total),
        ) && !self.host.is_null()
        {
            if let Some(request) = unsafe { (*self.host).request_process } {
                unsafe { request(self.host) };
            }
        }
        updates
    }

    pub(crate) fn enqueue_ui_action(&self, kind: MainHostEventKind) -> bool {
        if !self.active.load(Ordering::Acquire)
            || self
                .commands
                .push(MainHostEvent { offset: 0, kind })
                .is_err()
        {
            return false;
        }
        if !self.host.is_null() {
            if let Some(request) = unsafe { (*self.host).request_process } {
                unsafe { request(self.host) };
            }
        }
        true
    }

    pub(crate) fn editor_document(&self) -> Option<serde_json::Value> {
        self.presentation.lock().ok()?.clone()
    }

    pub(crate) fn set_rack_layout(&self, document: &serde_json::Value) -> bool {
        if serde_json::to_vec(document)
            .ok()
            .is_none_or(|bytes| bytes.len() > 16 * 1024)
        {
            return false;
        }
        let Ok(mut control_slot) = self.control.lock() else {
            return false;
        };
        let Ok(mut state_slot) = self.state.lock() else {
            return false;
        };
        let bytes = match state_slot.as_ref() {
            Some(bytes) => bytes.clone(),
            None => match default_main_session(48_000.0).and_then(|state| {
                serde_json::to_vec(&state)
                    .map_err(manifold_native::main_session::MainSessionError::Json)
            }) {
                Ok(bytes) => bytes,
                Err(_) => return false,
            },
        };
        let Ok(mut state) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
            return false;
        };
        if validate_layout_update(&state["rackDocument"], document).is_err() {
            return false;
        }
        if let Some(control) = control_slot.as_mut() {
            if control.set_rack_layout(document).is_err() {
                return false;
            }
        }
        if state_slot.is_none() && control_slot.is_none() {
            // A fresh inactive plug-in has no host sample rate yet. Keep this
            // visual edit separate from its future rate-specific default.
            let Ok(mut overlay) = self.layout_overlay.lock() else {
                return false;
            };
            *overlay = Some(document.clone());
        } else {
            state["rackDocument"] = document.clone();
            let Ok(bytes) = serde_json::to_vec(&state) else {
                return false;
            };
            *state_slot = Some(bytes);
        }
        if let Ok(mut presentation) = self.presentation.lock() {
            if let Some(presentation) = presentation.as_mut() {
                presentation["rackDocument"] = document.clone();
            }
        }
        true
    }

    fn publish_status(&self, audio: &MainAudioRuntime) {
        self.status_epoch.fetch_add(1, Ordering::SeqCst);
        for layer in 0..4 {
            for id in 0..STATUS_FIELDS {
                self.status_values[layer * STATUS_FIELDS + id]
                    .store(audio.status(id as u32, layer).to_bits(), Ordering::SeqCst);
            }
        }
        self.status_runtime_generation
            .store(audio.generation(), Ordering::SeqCst);
        self.sample_frames
            .store(audio.synth_sample_frames() as u32, Ordering::SeqCst);
        self.status_epoch.fetch_add(1, Ordering::SeqCst);
        self.visual.publish_job(audio);
    }

    pub(crate) fn editor_status(&self) -> Option<serde_json::Value> {
        let mut values = [0.0_f32; STATUS_COUNT];
        for _ in 0..5 {
            let before = self.status_epoch.load(Ordering::SeqCst);
            if before == 0 || before % 2 != 0 {
                continue;
            }
            for (index, destination) in values.iter_mut().enumerate() {
                *destination = f32::from_bits(self.status_values[index].load(Ordering::SeqCst));
            }
            let runtime_generation = self.status_runtime_generation.load(Ordering::SeqCst);
            let sample_frames = self.sample_frames.load(Ordering::SeqCst) as usize;
            if self.status_epoch.load(Ordering::SeqCst) == before {
                let field = |id: usize, layer: usize| values[layer * STATUS_FIELDS + id];
                let mut layers: Vec<_> = (0..4)
                    .map(|layer| {
                        serde_json::json!({
                            "state": field(7, layer), "length": field(8, layer),
                            "position": field(9, layer), "bars": field(10, layer),
                            "pending": field(11, layer), "volume": field(13, layer),
                            "speed": field(14, layer), "muted": field(15, layer) >= 0.5,
                            "playing": field(16, layer) >= 0.5,
                        })
                    })
                    .collect();
                let active = field(1, 0) as usize;
                let mut result = serde_json::json!({
                    "tempo": field(0, 0), "active": active, "mode": field(2, 0),
                    "recording": field(3, 0) >= 0.5, "overdub": field(4, 0) >= 0.5,
                    "forwardBars": field(5, 0), "captured": field(12, active.min(3)),
                    "sampleRate": field(19, 0), "targetBpm": field(17, 0),
                    "sampleFrames": sample_frames,
                });
                if let Some(visual) = self
                    .visual
                    .snapshot()
                    .filter(|visual| visual.source_generation == runtime_generation)
                {
                    for (layer, entry) in layers.iter_mut().enumerate() {
                        if visual.layer_lengths[layer] == field(8, layer) as usize {
                            entry["peaks"] = serde_json::json!(visual.layer_peaks[layer]);
                        }
                    }
                    if visual.active == active {
                        result["segments"] = serde_json::json!(visual.segments);
                    }
                    if visual.sample_frames == sample_frames {
                        result["samplePeaks"] = serde_json::json!(visual.sample_peaks);
                    }
                }
                result["layers"] = serde_json::json!(layers);
                return Some(result);
            }
        }
        None
    }

    fn drain_commands(
        &self,
        actions: &mut Vec<MainHostEvent>,
        output: *const clap_output_events,
        allow_midi: bool,
    ) {
        let insert_at = actions.partition_point(|action| action.offset == 0);
        let existing = actions.len();
        while actions.len() < MAX_EVENTS {
            let retry = unsafe { &mut *self.gui_retry.get() };
            let Some(command) = retry.take().or_else(|| self.commands.pop()) else {
                break;
            };
            if matches!(command.kind, MainHostEventKind::Midi(_)) && !allow_midi {
                *retry = Some(command);
                break;
            }
            if let MainHostEventKind::Parameter { id, value } = command.kind {
                if !output.is_null() {
                    if let Some(push) = unsafe { (*output).try_push } {
                        let event = clap_event_param_value {
                            header: clap_event_header {
                                size: std::mem::size_of::<clap_event_param_value>() as u32,
                                time: 0,
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
                            value: value as f64,
                        };
                        if !unsafe { push(output, &event.header) } {
                            *retry = Some(command);
                            break;
                        }
                    }
                }
            }
            actions.push(command);
        }
        // Host changes at offset zero establish the control state used by a
        // command (for example, Active Layer before Record). Later timed host
        // events remain after the UI commands.
        let added = actions.len() - existing;
        actions[insert_at..].rotate_right(added);
    }

    pub(crate) fn new(
        host: *const clap_host,
        descriptor: *const clap_plugin_descriptor,
    ) -> Box<Self> {
        let default = default_main_session(48_000.0).expect("authored Main default session");
        let defaults = values_from_session(&default).expect("authored Main host controls");
        let default_bytes = serde_json::to_vec(&default).expect("authored Main JSON");
        let presentation = compact_main_presentation(&default_bytes).expect("authored Main editor");
        let parameter_ids = (0..MAIN_HOST_ID_CAPACITY as u32)
            .filter(|&id| MainParameter::spec(id).is_ok())
            .collect();
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
            layout_overlay: Mutex::new(None),
            presentation: Mutex::new(Some(presentation)),
            pending_values: Mutex::new(Vec::new()),
            commands: ArrayQueue::new(MAX_UI_COMMANDS),
            gui_retry: UnsafeCell::new(None),
            parameter_ids,
            defaults,
            values: std::array::from_fn(|id| AtomicU32::new(defaults[id].to_bits())),
            status_values: std::array::from_fn(|_| AtomicU32::new(0)),
            status_epoch: AtomicU64::new(0),
            status_runtime_generation: AtomicU64::new(0),
            sample_frames: AtomicU32::new(0),
            visual: MainVisualBank::new(),
            active: AtomicBool::new(false),
            processing: AtomicBool::new(false),
            #[cfg(target_os = "linux")]
            gui: crate::main_gui::GuiState::new(),
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
        self.visual.reset();
        let Ok(mut control_slot) = self.control.lock() else {
            return false;
        };
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        let bytes = if let Some(bytes) = state.as_ref() {
            bytes.clone()
        } else {
            let Ok(mut default) = default_main_session(rate as f32) else {
                return false;
            };
            if let Some(layout) = self
                .layout_overlay
                .lock()
                .ok()
                .and_then(|slot| slot.clone())
            {
                default["rackDocument"] = layout;
            }
            let Ok(bytes) = serde_json::to_vec(&default) else {
                return false;
            };
            bytes
        };
        let Ok(document) = save_template(&bytes) else {
            return false;
        };
        let Some(initial_values) = values_from_session(&document) else {
            return false;
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
        let Ok(mut pending_values) = self.pending_values.lock() else {
            return false;
        };
        if !pending_values.is_empty() {
            pending_values.sort_by_key(|event| match event.kind {
                MainHostEventKind::Parameter { id, .. } => id,
                _ => u32::MAX,
            });
            if audio
                .process_host(MainHostAudioBlock {
                    input: None,
                    output: [&mut left, &mut right],
                    actions: &pending_values,
                })
                .is_err()
            {
                return false;
            }
            control.reclaim();
        }
        self.publish_status(&audio);
        let runtime = Box::new(Runtime {
            audio,
            buffers: MainHostBuffers::prepare(max_frames as usize),
            actions: Vec::with_capacity(MAX_EVENTS),
            max_frames: max_frames as usize,
        });
        *state = Some(bytes);
        if let Ok(mut presentation) = self.presentation.lock() {
            *presentation = compact_main_presentation(state.as_ref().unwrap()).ok();
        }
        for (id, value) in initial_values.into_iter().enumerate() {
            self.values[id].store(value.to_bits(), Ordering::Release);
        }
        for event in pending_values.drain(..) {
            if let MainHostEventKind::Parameter { id, value } = event.kind {
                self.values[id as usize].store(value.to_bits(), Ordering::Release);
            }
        }
        *control_slot = Some(control);
        if let Ok(mut overlay) = self.layout_overlay.lock() {
            *overlay = None;
        }
        self.runtime
            .store(Box::into_raw(runtime), Ordering::Release);
        self.active.store(true, Ordering::Release);
        #[cfg(target_os = "linux")]
        self.gui.request_refresh(self.host);
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
            let runtime = unsafe { &mut *runtime };
            runtime.actions.clear();
            self.drain_commands(&mut runtime.actions, null(), false);
            runtime
                .audio
                .process_host(MainHostAudioBlock {
                    input: None,
                    output: [&mut left, &mut right],
                    actions: &runtime.actions,
                })
                .ok()?;
            self.publish_status(&runtime.audio);
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

    pub(crate) fn save_bytes(&self) -> Option<Vec<u8>> {
        let runtime = self.runtime.load(Ordering::Acquire);
        if runtime.is_null() {
            let mut state = self.state.lock().ok()?;
            let mut pending = self.pending_values.lock().ok()?;
            let bytes = if let Some(bytes) = state.as_ref() {
                bytes.clone()
            } else {
                let mut default = default_main_session(48_000.0).ok()?;
                if let Some(layout) = self.layout_overlay.lock().ok()?.as_ref() {
                    default["rackDocument"] = layout.clone();
                }
                serde_json::to_vec(&default).ok()?
            };
            if pending.is_empty() {
                return Some(bytes);
            }
            let document: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
            let rate = document["sampleRate"].as_f64()? as f32;
            let (mut audio, mut control) = MainAudioRuntime::prepare(rate, 128).ok()?;
            control.submit_session(&bytes).ok()?;
            let mut left = [];
            let mut right = [];
            audio
                .process_host(MainHostAudioBlock {
                    input: None,
                    output: [&mut left, &mut right],
                    actions: &[],
                })
                .ok()?;
            control.reclaim();
            pending.sort_by_key(|event| match event.kind {
                MainHostEventKind::Parameter { id, .. } => id,
                _ => u32::MAX,
            });
            audio
                .process_host(MainHostAudioBlock {
                    input: None,
                    output: [&mut left, &mut right],
                    actions: &pending,
                })
                .ok()?;
            let mut temporary = Runtime {
                audio,
                buffers: MainHostBuffers::prepare(128),
                actions: Vec::with_capacity(MAX_EVENTS),
                max_frames: 128,
            };
            let saved = self.snapshot(&mut temporary, &mut control, true)?;
            *state = Some(saved.clone());
            if let Ok(mut presentation) = self.presentation.lock() {
                *presentation = compact_main_presentation(&saved).ok();
            }
            pending.clear();
            return Some(saved);
        }
        let mut control_slot = self.control.lock().ok()?;
        let control = control_slot.as_mut()?;
        let offline = !self.processing.load(Ordering::Acquire);
        let bytes = self.snapshot(runtime, control, offline)?;
        *self.state.lock().ok()? = Some(bytes.clone());
        *self.presentation.lock().ok()? = compact_main_presentation(&bytes).ok();
        #[cfg(target_os = "linux")]
        self.gui.request_refresh(self.host);
        Some(bytes)
    }

    pub(crate) fn load_bytes(&self, bytes: Vec<u8>) -> bool {
        if bytes.len() > MAX_STATE {
            return false;
        }
        let Ok(document) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
            return false;
        };
        let Ok(template) = save_template(&bytes) else {
            return false;
        };
        let Some(initial_values) = values_from_session(&template) else {
            return false;
        };
        let runtime = self.runtime.load(Ordering::Acquire);
        if runtime.is_null() {
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
                self.publish_status(&unsafe { &*runtime }.audio);
                control.reclaim();
            }
        }
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        *state = Some(bytes);
        if let Ok(mut overlay) = self.layout_overlay.lock() {
            *overlay = None;
        }
        if let Ok(mut presentation) = self.presentation.lock() {
            *presentation = compact_main_presentation(state.as_ref().unwrap()).ok();
        }
        if let Ok(mut pending) = self.pending_values.lock() {
            pending.clear();
        }
        while self.commands.pop().is_some() {}
        for (id, value) in initial_values.into_iter().enumerate() {
            self.values[id].store(value.to_bits(), Ordering::Release);
        }
        #[cfg(target_os = "linux")]
        self.gui.request_refresh(self.host);
        true
    }

    fn deactivate(&self) {
        self.processing.store(false, Ordering::Release);
        self.active.store(false, Ordering::Release);
        let runtime = self.runtime.swap(null_mut(), Ordering::AcqRel);
        self.visual.reset();
        if runtime.is_null() {
            return;
        }
        if let Ok(mut slot) = self.control.lock() {
            if let Some(mut control) = slot.take() {
                if let Some(bytes) = self.snapshot(runtime, &mut control, true) {
                    if let Ok(mut state) = self.state.lock() {
                        *state = Some(bytes.clone());
                    }
                    if let Ok(mut presentation) = self.presentation.lock() {
                        *presentation = compact_main_presentation(&bytes).ok();
                    }
                }
                control.reclaim();
            }
        }
        // CLAP guarantees no concurrent process call after stop/deactivate.
        unsafe { drop(Box::from_raw(runtime)) };
    }
}

pub(crate) unsafe fn get<'a>(plugin: *const clap_plugin) -> Option<&'a Instance> {
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
        {
            instance.cancel_sample_capture();
            instance.gui.stop();
        }
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
unsafe extern "C" fn main_thread(plugin: *const clap_plugin) {
    #[cfg(target_os = "linux")]
    if let Some(instance) = unsafe { get(plugin) } {
        instance.gui.main_thread(instance);
    }
    #[cfg(not(target_os = "linux"))]
    let _ = plugin;
}

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
        if header.type_ == CLAP_EVENT_PARAM_VALUE {
            if header.size < std::mem::size_of::<clap_event_param_value>() as u32 {
                return false;
            }
            let event =
                unsafe { &*(header as *const clap_event_header as *const clap_event_param_value) };
            if event.note_id != -1
                || event.port_index != -1
                || event.channel != -1
                || event.key != -1
            {
                continue;
            }
            let value = event.value as f32;
            if MainParameter::decode(event.param_id, value).is_err() {
                continue;
            }
            if actions.len() == MAX_EVENTS {
                return false;
            }
            actions.push(MainHostEvent {
                offset,
                kind: MainHostEventKind::Parameter {
                    id: event.param_id,
                    value,
                },
            });
            continue;
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
    if block.frames_count as usize > runtime.max_frames {
        return CLAP_PROCESS_ERROR;
    }
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
    instance.drain_commands(&mut runtime.actions, block.out_events, true);
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
    instance.publish_status(&runtime.audio);
    for action in &runtime.actions {
        if let MainHostEventKind::Parameter { id, value } = action.kind {
            instance.values[id as usize].store(value.to_bits(), Ordering::Release);
        }
    }
    CLAP_PROCESS_CONTINUE
}

unsafe extern "C" fn enqueue_command(plugin: *const clap_plugin, id: u32, value: f32) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    valid_main_command(id, value)
        && instance.enqueue_ui_action(MainHostEventKind::Command { id, value })
}

static COMMANDS: MainCommands = MainCommands {
    enqueue: Some(enqueue_command),
};

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
    } else if cfg!(target_os = "linux") && id.to_bytes() == b"clap.gui" {
        #[cfg(target_os = "linux")]
        {
            &crate::main_gui::GUI as *const _ as *const c_void
        }
        #[cfg(not(target_os = "linux"))]
        {
            null()
        }
    } else if id.to_bytes() == COMMAND_EXTENSION_ID {
        &COMMANDS as *const _ as *const c_void
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

unsafe extern "C" fn param_count(plugin: *const clap_plugin) -> u32 {
    unsafe { get(plugin) }.map_or(0, |instance| instance.parameter_ids.len() as u32)
}
unsafe extern "C" fn param_info(
    plugin: *const clap_plugin,
    index: u32,
    info: *mut clap_param_info,
) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    let Some(&id) = instance.parameter_ids.get(index as usize) else {
        return false;
    };
    if info.is_null() {
        return false;
    }
    let spec = MainParameter::spec(id).expect("enumerated Main parameter");
    let info = unsafe { &mut *info };
    info.id = id;
    info.flags = CLAP_PARAM_IS_AUTOMATABLE
        | if spec.discrete {
            CLAP_PARAM_IS_STEPPED
        } else {
            0
        };
    info.cookie = null_mut();
    info.name.fill(0);
    info.module.fill(0);
    let (module, name) = parameter_name(spec.target);
    for (destination, source) in info.name.iter_mut().zip(name.bytes()) {
        *destination = source as c_char;
    }
    for (destination, source) in info.module.iter_mut().zip(module.bytes()) {
        *destination = source as c_char;
    }
    info.min_value = spec.min as f64;
    info.max_value = spec.max as f64;
    info.default_value = instance.defaults[id as usize] as f64;
    true
}
unsafe extern "C" fn param_value(plugin: *const clap_plugin, id: u32, output: *mut f64) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if output.is_null() || MainParameter::spec(id).is_err() {
        return false;
    }
    unsafe {
        *output = f32::from_bits(instance.values[id as usize].load(Ordering::Acquire)) as f64
    };
    true
}
unsafe extern "C" fn param_to_text(
    _plugin: *const clap_plugin,
    id: u32,
    value: f64,
    output: *mut c_char,
    capacity: u32,
) -> bool {
    let Ok(spec) = MainParameter::spec(id) else {
        return false;
    };
    if output.is_null() || !value.is_finite() || MainParameter::decode(id, value as f32).is_err() {
        return false;
    }
    let text = if spec.discrete {
        format!("{value:.0}")
    } else {
        format!("{value:.3}")
    };
    if text.len() + 1 > capacity as usize {
        return false;
    }
    unsafe {
        std::ptr::copy_nonoverlapping(text.as_ptr(), output as *mut u8, text.len());
        *output.add(text.len()) = 0;
    }
    true
}
unsafe extern "C" fn text_to_param(
    _plugin: *const clap_plugin,
    id: u32,
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
    if !value.is_finite() || MainParameter::decode(id, value as f32).is_err() {
        return false;
    }
    unsafe { *output = value };
    true
}

static PARAMS: clap_plugin_params = clap_plugin_params {
    count: Some(param_count),
    get_info: Some(param_info),
    get_value: Some(param_value),
    value_to_text: Some(param_to_text),
    text_to_value: Some(text_to_param),
    flush: Some(param_flush),
};

unsafe extern "C" fn param_flush(
    plugin: *const clap_plugin,
    events: *const clap_input_events,
    out: *const clap_output_events,
) {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return;
    };
    let runtime = instance.runtime.load(Ordering::Acquire);
    if runtime.is_null() {
        // CLAP invokes inactive flush on its host thread, away from audio.
        let mut actions = Vec::with_capacity(MAX_EVENTS);
        if !unsafe { collect(events, 0, &mut actions) } {
            return;
        }
        let Ok(mut pending) = instance.pending_values.lock() else {
            return;
        };
        for action in actions {
            let MainHostEventKind::Parameter { id, value } = action.kind else {
                continue;
            };
            if let Some(existing) = pending.iter_mut().find(|item| {
                matches!(item.kind,
                MainHostEventKind::Parameter { id: found, .. } if found == id)
            }) {
                *existing = action;
            } else {
                pending.push(action);
            }
            instance.values[id as usize].store(value.to_bits(), Ordering::Release);
        }
        return;
    }
    // CLAP serializes active flush with process for the same instance.
    let runtime = unsafe { &mut *runtime };
    if !unsafe { collect(events, 0, &mut runtime.actions) } {
        return;
    }
    runtime
        .actions
        .retain(|action| matches!(action.kind, MainHostEventKind::Parameter { .. }));
    instance.drain_commands(&mut runtime.actions, out, false);
    let mut left = [];
    let mut right = [];
    if runtime
        .audio
        .process_host(MainHostAudioBlock {
            input: None,
            output: [&mut left, &mut right],
            actions: &runtime.actions,
        })
        .is_ok()
    {
        instance.publish_status(&runtime.audio);
        for action in &runtime.actions {
            if let MainHostEventKind::Parameter { id, value } = action.kind {
                instance.values[id as usize].store(value.to_bits(), Ordering::Release);
            }
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    struct Output {
        accepts: bool,
        values: Vec<(u32, f64)>,
    }

    unsafe extern "C" fn push(
        list: *const clap_output_events,
        header: *const clap_event_header,
    ) -> bool {
        let output = unsafe { &mut *((*list).ctx as *mut Output) };
        if !output.accepts {
            return false;
        }
        if unsafe { (*header).type_ } == CLAP_EVENT_PARAM_VALUE {
            let event = unsafe { &*(header as *const clap_event_param_value) };
            output.values.push((event.param_id, event.value));
        }
        true
    }

    #[test]
    fn editor_parameter_waits_for_host_output_capacity_then_reaches_audio_and_state() {
        let instance = Instance::new(null(), null());
        assert!(instance.activate(48_000.0, 128));
        assert!(instance.enqueue_ui_action(MainHostEventKind::Parameter {
            id: 271,
            value: 0.5,
        }));
        let mut output = Output {
            accepts: false,
            values: Vec::new(),
        };
        let events = clap_output_events {
            ctx: &mut output as *mut Output as *mut c_void,
            try_push: Some(push),
        };
        let plugin = &instance.plugin as *const clap_plugin;
        unsafe { param_flush(plugin, null(), &events) };
        assert!(output.values.is_empty());
        assert_eq!(
            f32::from_bits(instance.values[271].load(Ordering::Acquire)),
            1.0
        );
        output.accepts = true;
        unsafe { param_flush(plugin, null(), &events) };
        assert_eq!(output.values, vec![(271, 0.5)]);
        assert_eq!(
            f32::from_bits(instance.values[271].load(Ordering::Acquire)),
            0.5
        );
        let saved = instance.save_bytes().unwrap();
        let state: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(state["rack"]["source"]["output"], 0.5);
        instance.deactivate();
    }

    #[test]
    fn browser_atv_rack_state_reopens_in_main_clap() {
        let browser = include_bytes!("../../../web/public/main-atv-rack-saved-session.json");
        let instance = Instance::new(null(), null());
        assert!(instance.load_bytes(browser.to_vec()));
        let saved: serde_json::Value =
            serde_json::from_slice(&instance.save_bytes().unwrap()).unwrap();
        let original: serde_json::Value = serde_json::from_slice(browser).unwrap();
        assert_eq!(saved["rackDocument"], original["rackDocument"]);
        assert_eq!(saved["rack"]["lfos"][0]["route"]["source"], 4);
    }

    #[test]
    fn browser_slew_rack_state_reopens_in_main_clap() {
        let browser = include_bytes!("../../../web/public/main-slew-rack-saved-session.json");
        let instance = Instance::new(null(), null());
        assert!(instance.load_bytes(browser.to_vec()));
        let saved: serde_json::Value =
            serde_json::from_slice(&instance.save_bytes().unwrap()).unwrap();
        let original: serde_json::Value = serde_json::from_slice(browser).unwrap();
        assert_eq!(saved["rackDocument"], original["rackDocument"]);
        assert_eq!(saved["rack"]["lfos"][0]["route"]["source"], 5);
        assert_eq!(saved["rack"]["slew"]["source"], 16);
    }

    #[test]
    fn browser_sample_hold_rack_state_reopens_in_main_clap() {
        let browser =
            include_bytes!("../../../web/public/main-sample-hold-rack-saved-session.json");
        let instance = Instance::new(null(), null());
        assert!(instance.load_bytes(browser.to_vec()));
        let saved: serde_json::Value =
            serde_json::from_slice(&instance.save_bytes().unwrap()).unwrap();
        let original: serde_json::Value = serde_json::from_slice(browser).unwrap();
        assert_eq!(saved["rackDocument"], original["rackDocument"]);
        assert_eq!(saved["rack"]["lfos"][0]["route"]["source"], 7);
        assert_eq!(saved["rack"]["sampleHold"]["source"], 17);
        assert_eq!(saved["rack"]["sampleHold"]["triggerSource"], 4);
    }

    #[test]
    fn browser_compare_rack_state_reopens_in_main_clap() {
        let browser = include_bytes!("../../../web/public/main-compare-rack-saved-session.json");
        let instance = Instance::new(null(), null());
        assert!(instance.load_bytes(browser.to_vec()));
        let saved: serde_json::Value =
            serde_json::from_slice(&instance.save_bytes().unwrap()).unwrap();
        let original: serde_json::Value = serde_json::from_slice(browser).unwrap();
        assert_eq!(saved["rackDocument"], original["rackDocument"]);
        assert_eq!(saved["rack"]["lfos"][0]["route"]["source"], 9);
        assert_eq!(saved["rack"]["compare"]["source"], 18);
    }

    #[test]
    fn bounded_editor_status_reflects_audio_thread_record_commands() {
        let instance = Instance::new(null(), null());
        assert!(instance.activate(48_000.0, 128));
        let plugin = &instance.plugin as *const clap_plugin;
        assert_eq!(instance.editor_status().unwrap()["recording"], false);
        assert!(instance.enqueue_ui_action(MainHostEventKind::Command { id: 0, value: 0.0 }));
        unsafe { param_flush(plugin, null(), null()) };
        let recording = instance.editor_status().unwrap();
        assert_eq!(recording["recording"], true);
        assert_eq!(recording["layers"][0]["state"], 2.0);
        assert!(instance.enqueue_ui_action(MainHostEventKind::Command { id: 1, value: 0.0 }));
        unsafe { param_flush(plugin, null(), null()) };
        assert_eq!(instance.editor_status().unwrap()["recording"], false);
        instance.deactivate();
    }
}
