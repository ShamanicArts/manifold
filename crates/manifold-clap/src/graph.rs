//! CLAP graph adapter. Project parsing and runtime replacement happen off the
//! audio callback, which only uses prepared, bounded storage.

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
use manifold_native::visual_analysis::{OutputSpectrum, SpectrumMailbox};
use std::cell::UnsafeCell;
use std::ffi::{CStr, c_char, c_void};
use std::ptr::{self, null, null_mut};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicPtr, AtomicU64, Ordering};
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
use crate::graph_gui::{GuiMessage, GuiMessageKind, GuiState};
use clap_sys::audio_buffer::clap_audio_buffer;
use clap_sys::events::{
    CLAP_CORE_EVENT_SPACE_ID, CLAP_EVENT_NOTE_CHOKE, CLAP_EVENT_NOTE_OFF, CLAP_EVENT_NOTE_ON,
    CLAP_EVENT_PARAM_GESTURE_BEGIN, CLAP_EVENT_PARAM_GESTURE_END, CLAP_EVENT_PARAM_VALUE,
    CLAP_TRANSPORT_HAS_TEMPO, CLAP_TRANSPORT_HAS_TIME_SIGNATURE, clap_event_header,
    clap_event_note, clap_event_param_gesture, clap_event_param_value, clap_input_events,
    clap_output_events,
};
use clap_sys::ext::audio_ports::{
    CLAP_AUDIO_PORT_IS_MAIN, CLAP_EXT_AUDIO_PORTS, CLAP_PORT_STEREO, clap_audio_port_info,
    clap_plugin_audio_ports,
};
use clap_sys::ext::note_ports::{
    CLAP_EXT_NOTE_PORTS, CLAP_NOTE_DIALECT_CLAP, clap_note_port_info, clap_plugin_note_ports,
};
use clap_sys::ext::params::{
    CLAP_EXT_PARAMS, CLAP_PARAM_IS_AUTOMATABLE, CLAP_PARAM_IS_STEPPED, CLAP_PARAM_RESCAN_ALL, CLAP_PARAM_RESCAN_VALUES, CLAP_PARAM_RESCAN_TEXT, CLAP_PARAM_RESCAN_INFO, CLAP_PARAM_CLEAR_ALL,
    clap_host_params, clap_param_info, clap_plugin_params,
};
use clap_sys::ext::state::{CLAP_EXT_STATE, clap_plugin_state};
use clap_sys::ext::tail::{CLAP_EXT_TAIL, clap_plugin_tail};
use clap_sys::host::clap_host;
use clap_sys::plugin::{clap_plugin, clap_plugin_descriptor};
use clap_sys::process::{
    CLAP_PROCESS_CONTINUE, CLAP_PROCESS_ERROR, clap_process, clap_process_status,
};
use clap_sys::stream::{clap_istream, clap_ostream};
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::capture_mailbox::{AudioCaptureWorker, CaptureMailbox, CapturedWindow};
use manifold_native::host_buffers::{
    HostBuffers, IoHostBuffers, RawHostBlock,
};
#[path = "graph_io.rs"]
mod io_ports;
use manifold_native::host_transport::{CaptureWindow, HostBarClock};
use manifold_native::host_values::ValueBank;
use manifold_native::live_events::{EventCommand, EventMailbox};
use manifold_native::live_parameters::ParameterMailbox;
use manifold_native::live_routes::{RouteCommand, RouteMailbox};
use manifold_native::loop_state_mailbox::{LoopStateCache, LoopStateMailbox, LoopStateWorker};
use manifold_native::parameters::{
    HOST_SLOT_BASE, HostSlots, HostSurface, HostParameter, HostParameterDisplay, host_parameter_displays, host_slots, normalized_host_values, TimedAutomation,
};
use manifold_native::project::{NativeProject, PreparedNativeProject, StagedRoute};
use manifold_project_js::HostCommandKind;
use manifold_project_js::package::ProjectPackage;
use manifold_project_js::worker::{ProjectScriptWorker, WorkerResult};

const DEFAULT: &[u8] = crate::product::DEFAULT_GRAPH;
const MAX_AUTOMATION: usize = 4096;
const MAX_NOTES: usize = 1024;

struct Runtime {
    generation: u64,
    sample_rate: f64,
    capture_worker: Option<AudioCaptureWorker>,
    loop_mailbox: Option<Arc<LoopStateMailbox>>,
    loop_worker: Option<LoopStateWorker>,
    preserve_capture_history: bool,
    values: Arc<ValueBank>,
    prepared: PreparedNativeProject,
    spectrum: OutputSpectrum,
    buffers: HostBuffers,
    io_buffers: Option<IoHostBuffers>,
    automation: Vec<TimedAutomation>,
    events: Vec<TimedEvent>,
    slot_indices: BTreeMap<usize, Option<usize>>,
    midi_node: Option<u64>,
}

struct StateSnapshot {
    bytes: Arc<Vec<u8>>,
    descriptors: HostSlots,
    values: Arc<ValueBank>,
    loop_cache: Option<LoopStateCache>,
    capture_mailbox: Option<Arc<CaptureMailbox>>,
}

struct Publication {
    committed: StateSnapshot,
    staged: Vec<(u64, StateSnapshot)>,
    live_edit_generation: Option<u64>,
}

#[derive(Clone, Copy)]
enum ScriptEditKind {
    Graph,
    Route,
    Parameter,
    Event,
}

struct InstalledScript {
    package: ProjectPackage,
    worker: ProjectScriptWorker,
    parameter_baseline: Vec<u8>,
    ready_generation: u64,
    in_flight: Option<(u64, u64, ScriptEditKind)>,
    last_completed: Option<(u64, bool)>,
    call_generation: Option<u64>,
}

impl Publication {
    fn acknowledge(&mut self, generation: u64) {
        if let Some(index) = self.staged.iter().position(|(id, _)| *id == generation) {
            let (_, snapshot) = self.staged.remove(index);
            self.committed = snapshot;
            self.staged.retain(|(id, _)| *id > generation);
            if self.live_edit_generation == Some(generation) {
                self.live_edit_generation = None;
            }
        }
    }
}

pub(crate) struct Instance {
    pub plugin: clap_plugin,
    pub(super) host: *const clap_host,
    current: AtomicPtr<Runtime>,
    pending: AtomicPtr<Runtime>,
    published_generation: AtomicU64,
    next_generation: AtomicU64,
    publication: Mutex<Publication>,
    live_routes: RouteMailbox,
    live_parameters: ParameterMailbox,
    live_events: EventMailbox,
    retired: AtomicPtr<Runtime>,
    active: AtomicBool,
    awaiting_parameter_restart: AtomicBool,
    parameter_rescan: AtomicU32,
    processing: AtomicBool,
    bar_clock: HostBarClock,
    output_spectrum: SpectrumMailbox,
    output_rms: AtomicU32,
    control: Mutex<()>,
    script: Mutex<Option<InstalledScript>>,
    configuration: Mutex<Option<(f32, usize)>>,
    ports: Mutex<io_ports::PortLayout>,
    state: Mutex<Arc<Vec<u8>>>,
    capture_result: Mutex<Option<CapturedWindow>>,
    capture_window: Mutex<Option<CaptureWindow>>,
    descriptors: Mutex<HostSlots>,
    displays: Mutex<BTreeMap<usize, HostParameterDisplay>>,
    values: Mutex<Arc<ValueBank>>,
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    presentation: Mutex<serde_json::Value>,
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    pub(super) gui: GuiState,
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    gui_retry: UnsafeCell<Option<GuiMessage>>,
}

// CLAP serializes processing for an instance. The control mutex serializes
// host lifecycle and editor project changes; the audio callback owns the
// published runtime while active.
unsafe impl Sync for Instance {}

fn slots(project: &NativeProject) -> HostSlots { host_slots(project, HostSurface::for_product(crate::product::EXPORTED)) }

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
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
        .filter_map(|(&slot, descriptor)| {
            descriptor.map(|descriptor| {
                serde_json::json!({
                    "id": HOST_SLOT_BASE + slot as u32, "nodeId":descriptor.node,
                    "parameterId":descriptor.local_id, "min":descriptor.min,
                    "max":descriptor.max, "discrete":descriptor.discrete, "normalized":0.0,
                })
            })
        })
        .collect();
    Some(serde_json::json!({"schemaVersion":1,"id":"manifold.graph","hostSlotCount":if crate::product::EXPORTED { None } else { Some(manifold_native::parameters::STUDIO_HOST_SLOT_COUNT) },
        "nodes":nodes,"controls":controls,"captureGesture":true,
        "liveRoutes":project.supports_live_routes(),
        "connections":document["signal"]["connections"],
        "captureSources":document["signal"]["captureSources"],
        "selectedCaptureNodeId":document["signal"]["selectedCaptureNodeId"]}))
}

impl Instance {
    pub(crate) fn new(
        host: *const clap_host,
        descriptor: *const clap_plugin_descriptor,
    ) -> Box<Self> {
        let parsed = NativeProject::parse(DEFAULT).expect("authored graph project");
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        let presentation =
            build_presentation(DEFAULT, &parsed).expect("authored graph presentation");
        let descriptors = slots(&parsed);
        let bank = Arc::new(ValueBank::from_slots(normalized_host_values(&descriptors)));
        let state = Arc::new(DEFAULT.to_vec());
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
            published_generation: AtomicU64::new(0),
            next_generation: AtomicU64::new(1),
            publication: Mutex::new(Publication {
                committed: StateSnapshot {
                    bytes: Arc::clone(&state),
                    descriptors: descriptors.clone(),
                    values: Arc::clone(&bank),
                    loop_cache: None,
                    capture_mailbox: None,
                },
                staged: Vec::new(),
                live_edit_generation: None,
            }),
            live_routes: RouteMailbox::new(),
            live_parameters: ParameterMailbox::new(),
            live_events: EventMailbox::new(),
            retired: AtomicPtr::new(null_mut()),
            active: AtomicBool::new(false),
            awaiting_parameter_restart: AtomicBool::new(false),
            parameter_rescan: AtomicU32::new(0),
            processing: AtomicBool::new(false),
            bar_clock: HostBarClock::new(),
            output_spectrum: SpectrumMailbox::new(),
            output_rms: AtomicU32::new(0),
            control: Mutex::new(()),
            script: Mutex::new(None),
            configuration: Mutex::new(None),
            ports: Mutex::new(io_ports::PortLayout::new(None).unwrap()),
            state: Mutex::new(state),
            capture_result: Mutex::new(None),
            capture_window: Mutex::new(None),
            displays: Mutex::new(host_parameter_displays(&parsed, &descriptors)),
            descriptors: Mutex::new(descriptors),
            values: Mutex::new(bank),
            #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
            presentation: Mutex::new(presentation),
            #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
            gui: GuiState::new(),
            #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
            gui_retry: UnsafeCell::new(None),
        });
        value.plugin.plugin_data = &mut *value as *mut Self as *mut c_void;
        if crate::product::EXPORTED { assert!(value.restore(crate::product::DEFAULT_PACKAGE.to_vec()), "exported project load"); }
        value
    }

    fn prepare(bytes: &[u8], rate: f32, max: usize, values: Arc<ValueBank>) -> Option<Box<Runtime>> {
        let project = NativeProject::parse(bytes).ok()?;
        let io_buffers = project
            .io_layout()
            .map(|layout| IoHostBuffers::prepare(layout, max))
            .transpose()
            .ok()?;
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
        let prepared = if project.supports_live_routes() {
            project.prepare_patchable_with_state(rate, max)
        } else {
            project.prepare_with_state(rate, max)
        }
        .ok()?;
        let slot_indices = values.slots().map(|slot| (slot, bindings
                .iter()
                .find(|binding| binding.slot as usize == slot)
                .and_then(|binding| {
                    prepared
                        .processor
                        .host_parameters()
                        .iter()
                        .position(|parameter| parameter.id == binding.graph_parameter)
                }))).collect();
        let (loop_mailbox, loop_worker) = if prepared.prepared_loop_specs().is_empty() {
            (None, None)
        } else {
            let (mailbox, worker) = LoopStateMailbox::prepare(
                &prepared.processor,
                prepared.prepared_loop_specs(),
                rate.round() as u32,
            )?;
            (Some(mailbox), Some(worker))
        };
        Some(Box::new(Runtime {
            generation: 0,
            sample_rate: rate as f64,
            capture_worker: None,
            loop_mailbox,
            loop_worker,
            preserve_capture_history: false,
            values,
            prepared,
            spectrum: OutputSpectrum::prepare(rate as f32),
            buffers: HostBuffers::prepare(max),
            io_buffers,
            automation: Vec::with_capacity(MAX_AUTOMATION),
            events: Vec::with_capacity(MAX_NOTES),
            slot_indices,
            midi_node,
        }))
    }

    fn attach_capture_worker(
        runtime: &mut Runtime,
        bytes: &[u8],
    ) -> Result<Option<Arc<CaptureMailbox>>, ()> {
        let document: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| ())?;
        if document["signal"]["selectedCaptureNodeId"]
            .as_u64()
            .is_none()
        {
            return Ok(None);
        }
        let frames = runtime.prepared.prepared_capture_capacity();
        let mailbox = CaptureMailbox::new(frames).ok_or(())?;
        runtime.capture_worker = Some(AudioCaptureWorker::new(Arc::clone(&mailbox)));
        Ok(Some(mailbox))
    }

    /// Resolve only the runtime the callback has actually adopted. Snapshots
    /// own the Arc, so control never borrows a raw audio-runtime pointer.
    fn capture_mailbox(&self) -> Option<Arc<CaptureMailbox>> {
        let mut publication = self.publication.lock().ok()?;
        publication.acknowledge(self.published_generation.load(Ordering::Acquire));
        publication.committed.capture_mailbox.clone()
    }

    fn request_capture(&self, node: u32, frames: usize) -> bool {
        let Ok(result) = self.capture_result.lock() else {
            return false;
        };
        if result.is_some() {
            return false;
        }

        self.capture_mailbox()
            .is_some_and(|mailbox| mailbox.request(node, frames))
    }

    pub(super) fn request_capture_seconds(&self, node: u32, seconds: f64) -> bool {
        let Ok(_control) = self.control.lock() else {
            return false;
        };
        let Some(rate) = self
            .configuration
            .lock()
            .ok()
            .and_then(|value| *value)
            .map(|config| config.0 as f64)
        else {
            return false;
        };
        if !seconds.is_finite() || seconds <= 0.0 {
            return false;
        }
        let Ok(mut window) = self.capture_window.lock() else {
            return false;
        };
        let accepted = self.request_capture(node, (rate * seconds).round() as usize);
        if accepted {
            *window = Some(CaptureWindow::Seconds(seconds));
        }
        accepted
    }

    pub(super) fn request_capture_bars(&self, node: u32, bars: f64) -> bool {
        let Ok(_control) = self.control.lock() else {
            return false;
        };
        let capacity = self
            .capture_mailbox()
            .map_or(0, |mailbox| mailbox.max_frames());
        let Some((frames, timing)) = self.bar_clock.window(bars, capacity) else {
            return false;
        };
        let Ok(mut window) = self.capture_window.lock() else {
            return false;
        };
        let accepted = self.request_capture(node, frames);
        if accepted {
            *window = Some(timing);
        }
        accepted
    }

    pub(super) fn request_capture_free_arm(&self, node: u32) -> bool {
        let Ok(_control) = self.control.lock() else {
            return false;
        };
        let Ok(mut window) = self.capture_window.lock() else {
            return false;
        };
        let Ok(result) = self.capture_result.lock() else {
            return false;
        };
        if result.is_some() {
            return false;
        }
        let accepted = self
            .capture_mailbox()
            .is_some_and(|mailbox| mailbox.arm_free(node));
        if accepted {
            *window = None;
        }
        accepted
    }

    pub(super) fn request_capture_free_stop(&self, node: u32) -> bool {
        let Ok(_control) = self.control.lock() else {
            return false;
        };
        let Ok(mut window) = self.capture_window.lock() else {
            return false;
        };
        let accepted = self
            .capture_mailbox()
            .is_some_and(|mailbox| mailbox.stop_free(node));
        if accepted {
            *window = Some(CaptureWindow::Free);
        }
        accepted
    }

    pub(super) fn finish_capture(&self, instrument: u32, label: &str) -> Option<bool> {
        let _control = self.control.lock().ok()?;
        let mut request = self.capture_window.lock().ok()?;
        let mut result = self.capture_result.lock().ok()?;
        if result.is_none() {
            match self.capture_mailbox()?.take()? {
                Ok(window) => *result = Some(window),
                Err(_) => return Some(false),
            }
        }
        // Taking the result releases audio-side admission. Retain its PCM here
        // while a graph edit is adopted, then embed it into that edited project.
        // A pending candidate must not cause a completed take to be consumed/lost.
        {
            let mut publication = self.publication.lock().ok()?;
            publication.acknowledge(self.published_generation.load(Ordering::Acquire));
            if !publication.staged.is_empty() {
                return None;
            }
        }
        let window = result.take()?;
        let request = request.take();
        let state = self.state_bytes()?;
        let rate = self
            .configuration
            .lock()
            .ok()
            .and_then(|value| *value)?
            .0
            .round() as u32;
        let bytes = if let Some(request) = request {
            NativeProject::embed_capture_asset_with_window(
                &state,
                window.node,
                instrument,
                window.stereo(),
                rate,
                label,
                request,
            )
        } else {
            NativeProject::embed_capture_asset(
                &state,
                window.node,
                instrument,
                window.stereo(),
                rate,
                label,
            )
        };
        let Ok(bytes) = bytes else {
            return Some(false);
        };
        // A capture only changes PCM and capture metadata. Keep the fixed host
        // slots and avoid calling CLAP host methods from the editor IPC thread.
        Some(self.restore_locked(bytes, true, false))
    }

    fn snapshot(&self, runtime: &Runtime) {
        let parameters = runtime.prepared.processor.host_parameters();
        let values = runtime.prepared.processor.current_parameter_values();
        let bank = &runtime.values;
        let normalized = runtime.slot_indices.iter().map(|(&slot, index)| (slot, index
                .and_then(|index| parameters[index].to_normalized(values[index]))
                .unwrap_or_else(|| bank.read_slot(slot))));
        bank.write_slots(normalized);
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        self.gui.request_refresh(self.host);
    }

    pub(super) fn state_bytes(&self) -> Option<Vec<u8>> {
        if self.awaiting_parameter_restart.load(Ordering::Acquire) { return self.published_state_bytes(); }
        self.recover_rejected_live_edit();
        let state = self.state.lock().ok()?;
        let descriptors = self.descriptors.lock().ok()?;
        let bank = self.values.lock().ok()?;
        Self::encode_state(state.as_slice(), &descriptors, &bank, None)
    }

    fn published_state_bytes(&self) -> Option<Vec<u8>> {
        self.recover_rejected_live_edit();
        let mut publication = self.publication.lock().ok()?;
        let generation = self.published_generation.load(Ordering::Acquire);
        publication.acknowledge(generation);
        let snapshot = &mut publication.committed;
        if let Some(cache) = snapshot.loop_cache.as_mut() {
            let refreshed = cache.refresh(snapshot.bytes.as_slice())?;
            snapshot.bytes = Arc::new(refreshed);
        }
        Self::encode_state(
            snapshot.bytes.as_slice(),
            &snapshot.descriptors,
            &snapshot.values,
            snapshot.loop_cache.as_ref(),
        )
    }

    fn recover_rejected_live_edit(&self) {
        let route = self.live_routes.rejected();
        let parameter = self.live_parameters.rejected();
        let rejected = route.max(parameter);
        if rejected == 0 {
            return;
        }
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        let Ok(mut publication) = self.publication.lock() else {
            return;
        };
        if publication.live_edit_generation == Some(rejected) {
            publication.staged.retain(|(id, _)| *id != rejected);
            publication.live_edit_generation = None;
            *state = Arc::clone(&publication.committed.bytes);
        }
    }

    fn encode_state(
        state: &[u8],
        descriptors: &HostSlots,
        bank: &ValueBank,
        live_loops: Option<&LoopStateCache>,
    ) -> Option<Vec<u8>> {
        let values = bank.read_all();
        let mut document: serde_json::Value = serde_json::from_slice(state).ok()?;
        let entries = document["signal"]["initialParameters"].as_array_mut()?;
        for (slot, descriptor) in descriptors.iter() {
            let Some(descriptor) = descriptor else {
                continue;
            };
            if live_loops.is_some_and(|cache| cache.contains_node(descriptor.node)) {
                continue;
            }
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

    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    pub(super) fn presentation(&self) -> Option<serde_json::Value> {
        let _control = self.control.lock().ok()?;
        let published: serde_json::Value =
            serde_json::from_slice(&self.published_state_bytes()?).ok()?;
        let view = self.presentation.lock().ok()?;
        let mut document = view.clone();
        document["connections"] = published["signal"]["connections"].clone();
        let values = self.values.lock().ok()?.read_all();
        for control in document["controls"].as_array_mut()? {
            let id = u32::try_from(control["id"].as_u64()?).ok()?;
            let slot = id.checked_sub(HOST_SLOT_BASE)? as usize;
            control["normalized"] = serde_json::Value::from(*values.get(&slot)?);
        }
        Some(document)
    }

    pub(super) fn restore(&self, bytes: Vec<u8>) -> bool {
        if serde_json::from_slice::<serde_json::Value>(&bytes)
            .ok()
            .is_some_and(|document| document["format"] == "manifold.package")
        {
            return self.restore_package(&bytes);
        }
        let Ok(mut script) = self.script.lock() else {
            return false;
        };
        let Ok(_control) = self.control.lock() else {
            return false;
        };
        if !self.restore_locked(bytes, false, true) {
            return false;
        }
        *script = None;
        true
    }

    fn restore_package(&self, bytes: &[u8]) -> bool {
        let Ok(package) = ProjectPackage::parse(bytes) else {
            return false;
        };
        let Ok(worker) =
            ProjectScriptWorker::start(package.bundle.clone(), package.state().to_vec())
        else {
            return false;
        };
        let Ok(mut script) = self.script.lock() else {
            return false;
        };
        let Ok(_control) = self.control.lock() else {
            return false;
        };
        if !self.restore_locked(package.state().to_vec(), false, true) {
            return false;
        }
        *script = Some(InstalledScript {
            package,
            worker,
            parameter_baseline: Vec::new(),
            ready_generation: self.next_generation.load(Ordering::Acquire) - 1,
            in_flight: None,
            last_completed: None,
            call_generation: None,
        });
        true
    }

    fn request_script_event(&self, event: TimedEvent) -> Option<u64> {
        let _control = self.control.lock().ok()?;
        if !self.active.load(Ordering::Acquire)
            || !self.processing.load(Ordering::Acquire)
            || !self.pending.load(Ordering::Acquire).is_null()
        {
            return None;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        self.live_events
            .submit(EventCommand { generation, event })
            .then_some(generation)
    }

    fn adopt_script_controls(&self, script: &InstalledScript) -> Option<()> {
        let authored = script.worker.published_project().ok()?;
        let _control = self.control.lock().ok()?;
        let published = self.published_state_bytes()?;
        let merged = Arc::new(
            manifold_project_js::publication::merge_published_controls(&published, &authored)
                .ok()?,
        );
        let mut state = self.state.lock().ok()?;
        let mut publication = self.publication.lock().ok()?;
        if !publication.staged.is_empty() {
            return None;
        }
        publication.committed.bytes = Arc::clone(&merged);
        *state = merged;
        Some(())
    }

    fn dispatch_script_command(
        &self,
        script: &mut InstalledScript,
        command: manifold_project_js::HostCommand,
    ) -> Result<u64, &'static str> {
        let (generation, kind) = match command.kind {
            HostCommandKind::Event { event } => {
                let Some(generation) = self.request_script_event(event) else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("Script event admission rejected");
                };
                (generation, ScriptEditKind::Event)
            }
            HostCommandKind::ParameterBatch { edits } => {
                let Some(generation) = self.request_live_parameter_batch(&edits) else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("Script parameter batch rejected");
                };
                (generation, ScriptEditKind::Parameter)
            }
            HostCommandKind::ReplaceGraph { document } => {
                let Ok(_control) = self.control.lock() else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("CLAP control unavailable");
                };
                if !self.restore_locked_with_parameter_baseline(
                    document,
                    false,
                    true,
                    Some(&script.parameter_baseline),
                ) {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("CLAP graph publication rejected");
                }
                (
                    self.next_generation.load(Ordering::Acquire) - 1,
                    ScriptEditKind::Graph,
                )
            }
            HostCommandKind::Metadata { document } => {
                let merged = self.published_state_bytes().and_then(|published|
                    manifold_project_js::publication::merge_published_metadata(&published, &document).ok());
                let Some(merged) = merged else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("CLAP metadata edit changed the sounding graph");
                };
                let Ok(_control) = self.control.lock() else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("CLAP control unavailable");
                };
                let (Ok(mut state), Ok(mut publication)) = (self.state.lock(), self.publication.lock()) else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("CLAP metadata state unavailable");
                };
                if !publication.staged.is_empty() {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("CLAP metadata edit overlaps a pending graph");
                }
                let merged = Arc::new(merged);
                publication.committed.bytes = Arc::clone(&merged);
                *state = merged;
                (self.published_generation.load(Ordering::Acquire), ScriptEditKind::Graph)
            }
            HostCommandKind::Route {
                to,
                input_port,
                from,
                output_port,
            } => {
                let source = (from != 0).then_some((from, output_port as usize));
                let Some(generation) = self.request_live_route_with(|current, rate, frames| {
                    NativeProject::stage_live_route_ports_from_document(
                        current,
                        to,
                        input_port as usize,
                        source,
                        rate,
                        frames,
                    )
                }) else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("CLAP live route rejected");
                };
                (generation, ScriptEditKind::Route)
            }
            HostCommandKind::Parameter { node, id, value } => {
                let Some(generation) = self.request_live_parameter(node, id, value) else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("CLAP live parameter rejected");
                };
                (generation, ScriptEditKind::Parameter)
            }
        };
        script.in_flight = Some((command.id, generation, kind));
        Ok(generation)
    }

    /// Author a project control with the editor closed. The script runs on its
    /// own thread and the graph goes through the existing CLAP publisher.
    pub(super) fn scripted_set_path(&self, path: &str, value: f64) -> Result<u64, &'static str> {
        if !value.is_finite() {
            return Err("non-finite project control");
        }
        self.scripted_call(
            "set",
            vec![
                serde_json::Value::from(path),
                serde_json::Value::from(value),
            ],
        )
    }

    pub(super) fn scripted_call(
        &self,
        method: &str,
        args: Vec<serde_json::Value>,
    ) -> Result<u64, &'static str> {
        let Ok(mut installed) = self.script.lock() else {
            return Err("script unavailable");
        };
        let Some(script) = installed.as_mut() else {
            return Err("no project package loaded");
        };
        if self.published_generation.load(Ordering::Acquire) < script.ready_generation
            || script.in_flight.is_some()
        {
            return Err("scripted graph publication pending");
        }
        let published = self
            .published_state_bytes()
            .ok_or("published graph unavailable")?;
        let WorkerResult::Project(baseline) = script
            .worker
            .synchronize_parameters(&published)
            .map_err(|_| "project script could not adopt published parameters")?
        else {
            return Err("project script submitted work while adopting parameters");
        };
        script.parameter_baseline = baseline;
        match script
            .worker
            .call(method, args)
            .map_err(|_| "project script rejected control")?
        {
            WorkerResult::Command(command) => {
                let generation = self.dispatch_script_command(script, command)?;
                script.call_generation = Some(generation);
                script.last_completed = None;
                Ok(generation)
            }
            WorkerResult::Project(_) => {
                self.adopt_script_controls(script)
                    .ok_or("No-op script state rejected")?;
                let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
                script.call_generation = Some(generation);
                script.last_completed = Some((generation, true));
                Ok(generation)
            }
        }
    }

    /// Return None until the callback publishes the graph. Retired audio state
    /// is handled by the existing CLAP main-thread retirement path.
    pub(super) fn scripted_finish(&self) -> Option<bool> {
        let mut installed = self.script.lock().ok()?;
        let script = installed.as_mut()?;
        let (id, generation, kind) = script.in_flight?;
        let accepted = match kind {
            ScriptEditKind::Event => self.live_events.status(generation)?,
            ScriptEditKind::Route => self.live_route_status(generation)?,
            ScriptEditKind::Parameter => self.live_parameter_status(generation)?,
            ScriptEditKind::Graph => {
                if self.published_generation.load(Ordering::Acquire) < generation {
                    return None;
                }
                true
            }
        };
        script.in_flight = None;
        let call_generation = script.call_generation.unwrap_or(generation);
        let reply = script.worker.acknowledge(id, accepted);
        if self.adopt_script_controls(script).is_none() {
            script.last_completed = Some((call_generation, false));
            return Some(false);
        }
        match reply {
            Ok(WorkerResult::Project(_)) => {
                script.last_completed = Some((call_generation, accepted));
                Some(accepted)
            }
            Ok(WorkerResult::Command(command)) => {
                if self.dispatch_script_command(script, command).is_ok() {
                    None
                } else {
                    script.last_completed = Some((call_generation, false));
                    Some(false)
                }
            }
            Err(_) => {
                script.last_completed = Some((call_generation, false));
                Some(false)
            }
        }
    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    pub(super) fn has_creator(&self) -> bool {
        self.script.lock().ok().and_then(|script| script.as_ref().map(|script|
            serde_json::from_slice::<serde_json::Value>(script.package.state()).ok().is_some_and(|project| project["liveAuthoring"]["format"] == "manifold.live-project"))).unwrap_or(false)
    }

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    pub(super) fn creator_presentation(&self) -> Option<serde_json::Value> {
        self.scripted_finish();
        let installed = self.script.lock().ok()?;
        let script = installed.as_ref()?;
        if script.in_flight.is_some() || self.published_generation.load(Ordering::Acquire) < script.ready_generation {
            return None;
        }
        let published = self.published_state_bytes()?;
        script.worker.synchronize_parameters(&published).ok()?;
        let mut presentation = script.worker.presentation().ok()?;
        presentation["product"] = serde_json::json!({"name": crate::product::NAME, "id": crate::product::CLAP_ID.to_string_lossy()});
        presentation["analysis"] = serde_json::json!({"rms": f32::from_bits(self.output_rms.load(Ordering::Relaxed))});
        if let Some(spectrum) = self.output_spectrum.snapshot() {
            presentation["analysis"]["bands"] = serde_json::json!(spectrum.bands);
            presentation["analysis"]["peakHz"] = serde_json::json!(spectrum.peak_hz);
            presentation["analysis"]["sampleRate"] = serde_json::json!(spectrum.sample_rate);
        }
        Some(presentation)
    }

    pub(super) fn scripted_status(&self, generation: u64) -> u32 {
        self.scripted_finish();
        let Ok(installed) = self.script.lock() else {
            return 2;
        };
        let Some(script) = installed.as_ref() else {
            return 2;
        };
        if let Some((completed, accepted)) = script.last_completed
            && completed == generation
        {
            return if accepted { 1 } else { 2 };
        }
        if script.in_flight.is_some() && script.call_generation == Some(generation) {
            0
        } else {
            2
        }
    }

    fn host_state_bytes(&self) -> Option<Vec<u8>> {
        self.scripted_finish();
        let graph = self.published_state_bytes()?;
        let script = self.script.lock().ok()?;
        match script.as_ref() {
            Some(script) => script.package.save_with_state(&graph).ok(),
            None => Some(graph),
        }
    }

    /// Prepare a named route off the callback and queue its compact change for
    /// the next audio block. Host save follows the callback acknowledgement.
    pub(super) fn request_live_route(
        &self,
        to: u32,
        input: &str,
        from: Option<(u32, &str)>,
    ) -> Option<u64> {
        self.request_live_route_with(|current, rate, frames| {
            NativeProject::stage_live_route(current, to, input, from, rate, frames)
        })
    }

    fn request_live_route_with(
        &self,
        stage: impl FnOnce(
            &[u8],
            f32,
            usize,
        ) -> Result<StagedRoute, manifold_native::project::ProjectError>,
    ) -> Option<u64> {
        let Ok(_control) = self.control.lock() else {
            return None;
        };
        let Some((rate, frames)) = self.configuration.lock().ok().and_then(|value| *value) else {
            return None;
        };
        if !self.pending.load(Ordering::Acquire).is_null() {
            return None;
        }
        let Some(current) = self.published_state_bytes() else {
            return None;
        };
        let Ok(staged) = stage(&current, rate, frames) else {
            return None;
        };
        let Ok(mut state) = self.state.lock() else {
            return None;
        };
        let Ok(mut publication) = self.publication.lock() else {
            return None;
        };
        publication.acknowledge(self.published_generation.load(Ordering::Acquire));
        if publication.live_edit_generation.is_some()
            || !publication.staged.is_empty()
            || !self.pending.load(Ordering::Acquire).is_null()
        {
            return None;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        let bytes = Arc::new(staged.document);
        let snapshot = StateSnapshot {
            bytes: Arc::clone(&bytes),
            descriptors: self.descriptors.lock().unwrap().clone(),
            values: Arc::clone(&self.values.lock().unwrap()),
            loop_cache: publication.committed.loop_cache.clone(),
            capture_mailbox: publication.committed.capture_mailbox.clone(),
        };
        let command = RouteCommand {
            generation,
            to: staged.to,
            input_port: staged.input_port,
            source: staged.source,
        };
        publication.staged.push((generation, snapshot));
        publication.live_edit_generation = Some(generation);
        if self.live_routes.submit(command).is_err() {
            publication.staged.pop();
            publication.live_edit_generation = None;
            return None;
        }
        *state = bytes;
        Some(generation)
    }

    pub(super) fn live_route_status(&self, generation: u64) -> Option<bool> {
        if self.live_routes.accepted() == generation
            && self.published_generation.load(Ordering::Acquire) >= generation
        {
            Some(true)
        } else if self.live_routes.rejected() == generation {
            Some(false)
        } else {
            None
        }
    }

    fn request_live_parameter(&self, node: u32, id: u32, value: f64) -> Option<u64> {
        self.request_live_parameter_batch(&[(node, id, value)])
    }
    fn request_live_parameter_batch(&self, edits: &[(u32, u32, f64)]) -> Option<u64> {
        if edits.is_empty() {
            return None;
        }

        let _control = self.control.lock().ok()?;
        if !self.active.load(Ordering::Acquire) || !self.pending.load(Ordering::Acquire).is_null() {
            return None;
        }
        let current = self.published_state_bytes()?;
        let document = NativeProject::stage_live_parameter_batch(&current, edits).ok()?;
        let mut state = self.state.lock().ok()?;
        let mut publication = self.publication.lock().ok()?;
        publication.acknowledge(self.published_generation.load(Ordering::Acquire));
        if publication.live_edit_generation.is_some()
            || !publication.staged.is_empty()
            || !self.pending.load(Ordering::Acquire).is_null()
        {
            return None;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        let bytes = Arc::new(document);
        let snapshot = StateSnapshot {
            bytes: Arc::clone(&bytes),
            descriptors: self.descriptors.lock().ok()?.clone(),
            values: Arc::clone(&*self.values.lock().ok()?),
            loop_cache: publication.committed.loop_cache.clone(),
            capture_mailbox: publication.committed.capture_mailbox.clone(),
        };
        publication.staged.push((generation, snapshot));
        publication.live_edit_generation = Some(generation);
        if !self.live_parameters.submit_batch(generation, edits) {
            publication.staged.pop();
            publication.live_edit_generation = None;
            return None;
        }
        *state = bytes;
        Some(generation)
    }

    fn live_parameter_status(&self, generation: u64) -> Option<bool> {
        if !self.active.load(Ordering::Acquire) {
            return Some(self.published_generation.load(Ordering::Acquire) >= generation);
        }
        if self.live_parameters.accepted() == generation
            && self.published_generation.load(Ordering::Acquire) >= generation
        {
            Some(true)
        } else if self.live_parameters.rejected() == generation {
            Some(false)
        } else {
            None
        }
    }

    fn restore_locked(
        &self,
        bytes: Vec<u8>,
        preserve_capture_history: bool,
        notify_host: bool,
    ) -> bool {
        self.restore_locked_with_parameter_baseline(
            bytes,
            preserve_capture_history,
            notify_host,
            None,
        )
    }

    fn restore_locked_with_parameter_baseline(
        &self,
        bytes: Vec<u8>,
        preserve_capture_history: bool,
        notify_host: bool,
        parameter_baseline: Option<&[u8]>,
    ) -> bool {
        self.recover_rejected_live_edit();
        let Ok(project) = NativeProject::parse(&bytes) else {
            return false;
        };
        if !manifold_native::parameters::host_ids_fit(&project, HostSurface::for_product(crate::product::EXPORTED), u32::MAX - 1) { return false; }
        let Some(next_ports) = io_ports::PortLayout::new(project.io_layout()) else {
            return false;
        };
        let port_flags = {
            let Ok(current) = self.ports.lock() else {
                return false;
            };
            if self.active.load(Ordering::Acquire) && !current.same_shape(&next_ports) {
                io_ports::trace(format_args!("restore rejected active shape change"));
                return false;
            }
            current.changes(&next_ports)
        };
        if !self.accepts_port_changes(port_flags) {
            return false;
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        let Some(presentation) = build_presentation(&bytes, &project) else {
            return false;
        };
        let descriptors = slots(&project);
        let displays = host_parameter_displays(&project, &descriptors);
        // CLAP requires deactivation before changing the parameter list or flags.
        // Prepare now, retain the active bank/surface, then publish at host restart.
        let Ok(current) = self.descriptors.lock() else { return false; };
        let Ok(current_displays) = self.displays.lock() else { return false; };
        let surface_changed = !descriptors.keys().eq(current.keys()) || crate::product::EXPORTED && descriptors.iter().any(|(slot, next)| {
            next.map(|p| (p.min, p.max, p.discrete)) != current.get(slot).copied().flatten().map(|p| (p.min, p.max, p.discrete))
                || displays.get(slot).map(|d| d.default_value) != current_displays.get(slot).map(|d| d.default_value)
        });
        drop(current_displays);
        drop(current);
        let restart = !self.host.is_null() && self.active.load(Ordering::Acquire)
            && (surface_changed || self.awaiting_parameter_restart.load(Ordering::Acquire));
        if restart && unsafe { (*self.host).request_restart.is_none() } { return false; }
        let bank = Arc::new(ValueBank::from_slots(normalized_host_values(&descriptors)));
        self.retire();
        let config = self.configuration.lock().ok().and_then(|value| *value);
        let prepared = if let Some((rate, max)) = config {
            let Some(mut value) = Instance::prepare(&bytes, rate, max, Arc::clone(&bank)) else {
                return false;
            };
            if let Some(baseline) = parameter_baseline {
                if value.prepared.plan_parameter_inheritance(baseline).is_err() {
                    return false;
                }
            }
            value.preserve_capture_history = preserve_capture_history;
            let Ok(capture) = Self::attach_capture_worker(&mut value, &bytes) else { return false; };
            Some((value, capture))
        } else {
            None
        };
        if prepared.is_some() && !self.pending.load(Ordering::Acquire).is_null() {
            return false;
        }
        let Ok(mut ports) = self.ports.lock() else {
            return false;
        };
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        let Ok(mut bound) = self.descriptors.lock() else {
            return false;
        };
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        let Ok(mut view) = self.presentation.lock() else {
            return false;
        };
        let Ok(mut publication) = self.publication.lock() else {
            return false;
        };
        publication.acknowledge(self.published_generation.load(Ordering::Acquire));
        if publication.live_edit_generation.is_some() {
            return false;
        }
        if !publication.staged.is_empty() {
            // The callback has claimed the pending runtime but has not yet
            // completed publication. Keep its previous value bank intact.
            return false;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        let state_bytes = Arc::new(bytes);
        let snapshot = StateSnapshot {
            bytes: Arc::clone(&state_bytes),
            descriptors: descriptors.clone(),
            values: Arc::clone(&bank),
            capture_mailbox: prepared.as_ref().and_then(|(_, capture)| capture.clone()),
            loop_cache: prepared.as_ref().and_then(|(runtime, _)| {
                runtime.loop_mailbox.as_ref().map(|mailbox| mailbox.cache())
            }),
        };
        *ports = next_ports;
        *state = state_bytes;
        if !restart {
            *bound = descriptors;
            *self.displays.lock().unwrap() = displays;
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        {
            *view = presentation;
        }
        if !restart { *self.values.lock().unwrap() = bank; }
        // Gate the audio-side publication before making its candidate visible.
        if restart { self.awaiting_parameter_restart.store(true, Ordering::Release); }
        if let Some((mut prepared, _)) = prepared {
            prepared.generation = generation;
            publication.staged.push((generation, snapshot));
            self.pending
                .store(Box::into_raw(prepared), Ordering::Release);
        } else {
            publication.committed = snapshot;
            publication.staged.clear();
            self.published_generation
                .store(generation, Ordering::Release);
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        drop(view);
        drop(bound);
        drop(state);
        drop(publication);
        drop(ports);
        self.notify_port_changes(port_flags);
        if restart {
            unsafe { (*self.host).request_restart.unwrap()(self.host); }
        } else if notify_host {
            self.request_parameter_rescan(if self.active.load(Ordering::Acquire) {
                CLAP_PARAM_RESCAN_VALUES | CLAP_PARAM_RESCAN_INFO | CLAP_PARAM_RESCAN_TEXT
            } else { CLAP_PARAM_RESCAN_ALL });
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        if notify_host {
            self.gui.request_refresh(self.host);
        }
        true
    }

    fn request_parameter_rescan(&self, flags: u32) {
        if self.host.is_null() { return; }
        self.parameter_rescan.fetch_or(flags, Ordering::Release);
        if let Some(callback) = unsafe { (*self.host).request_callback } { unsafe { callback(self.host); } }
    }

    fn rescan_parameters_on_main_thread(&self) {
        if self.host.is_null() { return; }
        let flags = self.parameter_rescan.swap(0, Ordering::AcqRel);
        if flags == 0 { return; }
        if self.active.load(Ordering::Acquire) && flags & CLAP_PARAM_RESCAN_ALL != 0 {
            self.parameter_rescan.fetch_or(flags, Ordering::Release);
            return;
        }
        if let Some(get) = unsafe { (*self.host).get_extension } {
            let extension = unsafe { get(self.host, CLAP_EXT_PARAMS.as_ptr()) };
            if let Some(params) = unsafe { (extension as *const clap_host_params).as_ref() } {
                if let Some(rescan) = params.rescan { unsafe { rescan(self.host, flags); } }
            }
        }
    }

    fn retire(&self) {
        let old = self.retired.swap(null_mut(), Ordering::AcqRel);
        if !old.is_null() {
            unsafe { drop(Box::from_raw(old)) }
        }
    }
    fn deactivate(&self) {
        let Ok(_control) = self.control.lock() else {
            return;
        };
        self.deactivate_locked();
    }
    fn deactivate_locked(&self) {
        self.recover_rejected_live_edit();
        self.active.store(false, Ordering::Release);
        self.processing.store(false, Ordering::Release);
        self.live_routes.cancel_pending();
        let pending_parameter = self.live_parameters.cancel_pending_generation();
        self.live_events.cancel_pending();
        self.bar_clock.clear();
        // CLAP has stopped calling process at deactivation. Preserve live
        // stopped takes before releasing the published runtime; an accepted
        // replacement still waiting for publication must win instead.
        let current = self.current.load(Ordering::Acquire);
        let pending = self.pending.load(Ordering::Acquire);
        let mut pending_loop_state = None;
        if !current.is_null() && !pending.is_null() {
            unsafe {
                (*current).prepared.cancel_capture_staging_for_host_stop();
                (*pending).prepared.cancel_capture_staging_for_host_stop();
                (*pending).prepared.adopt_live_replacement_from(
                    &mut (*current).prepared,
                    (*pending).preserve_capture_history,
                );
                if (*pending).prepared.has_prepared_loops()
                    && (*pending).prepared.finish_recording_loops_for_host_stop()
                {
                    pending_loop_state = (*pending)
                        .prepared
                        .save_state()
                        .ok()
                        .map(|bytes| ((*pending).generation, bytes));
                }
            }
            self.snapshot(unsafe { &*pending });
        }
        let loop_state = if !current.is_null() && self.pending.load(Ordering::Acquire).is_null() {
            let prepared = unsafe { &mut (*current).prepared };
            let saved = if prepared.has_prepared_loops() && prepared.finish_recording_loops_for_host_stop() {
                prepared.save_state().ok()
            } else { None };
            // Finishing a recording resets its record control; publish that state too.
            self.snapshot(unsafe { &*current });
            saved
        } else {
            None
        };
        if let Ok(mut result) = self.capture_result.lock() {
            *result = None;
        }
        if let Ok(mut window) = self.capture_window.lock() {
            *window = None;
        }
        for pointer in [&self.current, &self.pending, &self.retired] {
            let old = pointer.swap(null_mut(), Ordering::AcqRel);
            if !old.is_null() {
                unsafe { drop(Box::from_raw(old)) }
            }
        }
        let mut had_staged = false;
        let mut staged_state = None;
        if let Ok(mut publication) = self.publication.lock() {
            had_staged = !publication.staged.is_empty();
            if let Some((generation, mut snapshot)) = publication.staged.pop() {
                if let Some((saved_generation, bytes)) = pending_loop_state.take() {
                    if saved_generation == generation {
                        snapshot.bytes = Arc::new(bytes);
                    }
                }
                let route = publication.live_edit_generation == Some(generation);
                let merge = if route {
                    loop_state.as_ref().map(|live| {
                        NativeProject::merge_route_loop_state(snapshot.bytes.as_slice(), live)
                    })
                } else {
                    None
                };
                let merged = match merge {
                    Some(Ok(bytes)) => {
                        snapshot.bytes = Arc::new(bytes);
                        true
                    }
                    Some(Err(_)) => false,
                    None => true,
                };
                if merged {
                    if pending_parameter == Some(generation) {
                        if let Ok(project) = NativeProject::parse(snapshot.bytes.as_slice()) {
                            let descriptors = slots(&project);
                            snapshot.values.write_slots(normalized_host_values(&descriptors));
                        }
                    }
                    staged_state = Some(Arc::clone(&snapshot.bytes));
                    publication.committed = snapshot;
                    self.published_generation
                        .store(generation, Ordering::Release);
                } else if let Some(live) = loop_state.as_ref() {
                    // The route failed its node-table check. Keep the latest
                    // take on the previously published graph.
                    let bytes = Arc::new(live.clone());
                    staged_state = Some(Arc::clone(&bytes));
                    publication.committed.bytes = bytes;
                }
                publication.staged.clear();
                publication.live_edit_generation = None;
            }
            publication.committed.loop_cache = None;
            publication.committed.capture_mailbox = None;
        }
        if let Some(bytes) = staged_state {
            if let Ok(mut state) = self.state.lock() {
                *state = bytes;
            }
        } else if !had_staged {
            if let Some(bytes) = loop_state {
                let bytes = Arc::new(bytes);
                if let Ok(mut state) = self.state.lock() {
                    if let Ok(mut publication) = self.publication.lock() {
                        *state = Arc::clone(&bytes);
                        publication.committed.bytes = bytes;
                    }
                }
            }
        }
        if let Ok(mut config) = self.configuration.lock() { *config = None; }
        if self.awaiting_parameter_restart.swap(false, Ordering::AcqRel) {
            // Processing is stopped and the staged snapshot has become committed.
            let publication = self.publication.lock().unwrap();
            let previous = std::mem::replace(&mut *self.descriptors.lock().unwrap(), publication.committed.descriptors.clone());
            *self.values.lock().unwrap() = Arc::clone(&publication.committed.values);
            if let Ok(project) = NativeProject::parse(publication.committed.bytes.as_slice()) {
                *self.displays.lock().unwrap() = host_parameter_displays(&project, &publication.committed.descriptors);
            }
            let removed: Vec<_> = previous.keys().filter(|slot| !publication.committed.descriptors.contains_key(slot)).copied().collect();
            drop(publication);
            if !self.host.is_null() {
                if let Some(get) = unsafe { (*self.host).get_extension } {
                    let extension = unsafe { get(self.host, CLAP_EXT_PARAMS.as_ptr()) };
                    if let Some(params) = unsafe { (extension as *const clap_host_params).as_ref() } {
                        if let Some(clear) = params.clear {
                            for slot in removed { unsafe { clear(self.host, HOST_SLOT_BASE + slot as u32, CLAP_PARAM_CLEAR_ALL); } }
                        }
                    }
                }
            }
            self.parameter_rescan.fetch_or(CLAP_PARAM_RESCAN_ALL, Ordering::Release);
            self.rescan_parameters_on_main_thread();
        }
    }
    fn publish(&self) {
        if self.awaiting_parameter_restart.load(Ordering::Acquire) { return; }
        // A single retirement slot bounds callback memory. The main thread
        // must collect it before another replacement can be published.
        if !self.retired.load(Ordering::Acquire).is_null() {
            return;
        }
        let next = self.pending.swap(null_mut(), Ordering::AcqRel);
        if next.is_null() {
            return;
        }
        let current = self.current.load(Ordering::Acquire);
        if !current.is_null()
            && !unsafe {
                (*next)
                    .prepared
                    .live_history_ready_from(&(*current).prepared)
                    && (*current).capture_worker.as_ref().is_none_or(|worker| worker.try_retire())
            }
        {
            if self
                .pending
                .compare_exchange(null_mut(), next, Ordering::AcqRel, Ordering::Acquire)
                .is_err()
            {
                self.retired.store(next, Ordering::Release);
                if !self.host.is_null() {
                    if let Some(callback) = unsafe { (*self.host).request_callback } {
                        unsafe { callback(self.host) };
                    }
                }
            }
            return;
        }
        let old = self.current.swap(next, Ordering::AcqRel);
        if !old.is_null() {
            unsafe {
                (*next).prepared.adopt_live_replacement_from(
                    &mut (*old).prepared,
                    (*next).preserve_capture_history,
                )
            };
        }
        self.snapshot(unsafe { &*next });
        self.published_generation
            .store(unsafe { (*next).generation }, Ordering::Release);
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
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        instance.gui.stop();
        instance.deactivate();
        unsafe { drop(Box::from_raw(instance as *const Instance as *mut Instance)) };
    }
}
unsafe extern "C" fn activate(plugin: *const clap_plugin, rate: f64, _min: u32, max: u32) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    io_ports::trace(format_args!("activate rate={rate} max={max}"));
    let Ok(_control) = instance.control.lock() else {
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
    instance.rescan_parameters_on_main_thread();
    let Some(state) = instance.state_bytes() else {
        return false;
    };
    let Ok(bank) = instance.values.lock().map(|bank| Arc::clone(&bank)) else { return false; };
    let Some(mut runtime) = Instance::prepare(&state, rate as f32, max as usize, bank) else {
        return false;
    };
    runtime.generation = instance.published_generation.load(Ordering::Acquire);
    let Ok(capture) = Instance::attach_capture_worker(&mut runtime, &state) else {
        return false;
    };
    if let Ok(mut publication) = instance.publication.lock() {
        publication.acknowledge(runtime.generation);
        publication.committed.capture_mailbox = capture;
        publication.committed.loop_cache =
            runtime.loop_mailbox.as_ref().map(|mailbox| mailbox.cache());
    } else {
        return false;
    }
    instance.snapshot(&runtime);
    instance
        .current
        .store(Box::into_raw(runtime), Ordering::Release);
    if let Ok(mut config) = instance.configuration.lock() {
        *config = Some((rate as f32, max as usize));
    } else {
        instance.deactivate_locked();
        return false;
    }
    instance.active.store(true, Ordering::Release);
    true
}
unsafe extern "C" fn deactivate(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        io_ports::trace(format_args!("deactivate"));
        instance.deactivate()
    }
}
unsafe extern "C" fn start(plugin: *const clap_plugin) -> bool {
    unsafe { get(plugin) }.is_some_and(|instance| {
        let active = instance.active.load(Ordering::Acquire);
        instance.processing.store(active, Ordering::Release);
        active
    })
}
unsafe extern "C" fn stop(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.processing.store(false, Ordering::Release);
        instance.live_events.cancel_pending();
    }
}
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
    if let Some(worker) = runtime.capture_worker.as_mut() {
        worker.service(&mut runtime.prepared.processor);
    }
    runtime.prepared.processor.reset_processing();
    if let Some(worker) = runtime.loop_worker.as_mut() {
        worker.service(&runtime.prepared.processor);
    }
    runtime.events.clear();
    runtime.automation.clear();
}
unsafe extern "C" fn main_thread(plugin: *const clap_plugin) {
    if let Some(instance) = unsafe { get(plugin) } {
        instance.retire();
        instance.rescan_parameters_on_main_thread();
        instance.scripted_finish();
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        instance.gui.main_thread(instance);
    }
}

#[repr(C)]
struct ClapProjectScript {
    set_path:
        Option<unsafe extern "C" fn(*const clap_plugin, *const c_char, f64, *mut u64) -> bool>,
    status: Option<unsafe extern "C" fn(*const clap_plugin, u64) -> u32>,
    call_json: Option<
        unsafe extern "C" fn(*const clap_plugin, *const c_char, *const u8, usize, *mut u64) -> bool,
    >,
}

unsafe extern "C" fn script_set_path(
    plugin: *const clap_plugin,
    path: *const c_char,
    value: f64,
    generation: *mut u64,
) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if path.is_null() || generation.is_null() {
        return false;
    }
    let Ok(path) = (unsafe { CStr::from_ptr(path) }).to_str() else {
        return false;
    };
    if path.len() > 512 {
        return false;
    }
    let Ok(published) = instance.scripted_set_path(path, value) else {
        return false;
    };
    unsafe {
        *generation = published;
    }
    true
}

unsafe extern "C" fn script_status(plugin: *const clap_plugin, generation: u64) -> u32 {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return 2;
    };
    instance.scripted_status(generation)
}

unsafe extern "C" fn script_call_json(
    plugin: *const clap_plugin,
    method: *const c_char,
    args_json: *const u8,
    args_len: usize,
    generation: *mut u64,
) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if method.is_null() || args_json.is_null() || generation.is_null() || args_len > 64 * 1024 {
        return false;
    }
    let Ok(method) = (unsafe { CStr::from_ptr(method) }).to_str() else {
        return false;
    };
    if method.is_empty() || method.len() > 128 {
        return false;
    }
    let bytes = unsafe { std::slice::from_raw_parts(args_json, args_len) };
    let Ok(args) = serde_json::from_slice::<Vec<serde_json::Value>>(bytes) else {
        return false;
    };
    let Ok(published) = instance.scripted_call(method, args) else {
        return false;
    };
    unsafe {
        *generation = published;
    }
    true
}

static PROJECT_SCRIPT: ClapProjectScript = ClapProjectScript {
    set_path: Some(script_set_path),
    status: Some(script_status),
    call_json: Some(script_call_json),
};

unsafe extern "C" fn extension(_plugin: *const clap_plugin, id: *const c_char) -> *const c_void {
    if id.is_null() {
        return null();
    }
    let id = unsafe { CStr::from_ptr(id) };
    if id == c"manifold.project.script.v1" {
        return &PROJECT_SCRIPT as *const _ as *const c_void;
    }
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    if id == clap_sys::ext::gui::CLAP_EXT_GUI {
        return &crate::graph_gui::GUI as *const _ as *const c_void;
    }
    if id == clap_sys::ext::audio_ports_config::CLAP_EXT_AUDIO_PORTS_CONFIG {
        return &io_ports::CONFIG as *const _ as *const c_void;
    }
    if id == clap_sys::ext::audio_ports_config::CLAP_EXT_AUDIO_PORTS_CONFIG_INFO
        || id == clap_sys::ext::audio_ports_config::CLAP_EXT_AUDIO_PORTS_CONFIG_INFO_COMPAT
    {
        return &io_ports::CONFIG_INFO as *const _ as *const c_void;
    }
    if id == CLAP_EXT_AUDIO_PORTS {
        &AUDIO_PORTS as *const _ as *const c_void
    } else if id == CLAP_EXT_NOTE_PORTS {
        &NOTE_PORTS as *const _ as *const c_void
    } else if id == CLAP_EXT_PARAMS {
        &PARAMS as *const _ as *const c_void
    } else if id == CLAP_EXT_STATE {
        &STATE as *const _ as *const c_void
    } else if id == CLAP_EXT_TAIL {
        &TAIL as *const _ as *const c_void
    } else {
        null()
    }
}

/// An authored graph can contain a free-running generator or a playing loop,
/// and its topology can change while active. The host must keep processing it
/// after its input becomes quiet. CLAP defines >= INT32_MAX as infinite tail.
unsafe extern "C" fn tail(_plugin: *const clap_plugin) -> u32 {
    i32::MAX as u32
}

static TAIL: clap_plugin_tail = clap_plugin_tail { get: Some(tail) };

static AUDIO_PORTS: clap_plugin_audio_ports = clap_plugin_audio_ports {
    count: Some(io_ports::count),
    get: Some(io_ports::port),
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

// Studio's generic 0..1 slots are stable. Exported CLAP products expose physical
// ranges; conversion to the engine's normalized automation stays in this adapter.
fn host_value(parameter: Option<HostParameter>, normalized: f32) -> f64 {
    if crate::product::EXPORTED {
        parameter.and_then(|p| p.from_normalized(normalized)).unwrap_or(normalized) as f64
    } else { normalized as f64 }
}
fn normalized_value(parameter: Option<HostParameter>, value: f64) -> Option<f32> {
    if !value.is_finite() { return None; }
    if crate::product::EXPORTED {
        let p = parameter?;
        if p.discrete && value.fract() != 0. { return None; }
        p.to_normalized(value as f32)
    } else { (0. ..=1.).contains(&value).then_some(value as f32) }
}

unsafe extern "C" fn param_count(plugin: *const clap_plugin) -> u32 {
    unsafe { get(plugin) }.and_then(|instance| instance.descriptors.lock().ok().map(|slots| slots.len() as u32)).unwrap_or(0)
}
unsafe extern "C" fn param_info(
    plugin: *const clap_plugin,
    index: u32,
    info: *mut clap_param_info,
) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    if info.is_null() {
        return false;
    }
    let Some((slot, descriptor)) = instance.descriptors.lock().ok()
        .and_then(|slots| slots.iter().nth(index as usize).map(|(&slot, &descriptor)| (slot, descriptor))) else { return false; };
    let info = unsafe { &mut *info };
    info.id = HOST_SLOT_BASE + slot as u32;
    info.flags = CLAP_PARAM_IS_AUTOMATABLE
        | if crate::product::EXPORTED && descriptor.is_some_and(|descriptor| descriptor.discrete) {
            CLAP_PARAM_IS_STEPPED
        } else {
            0
        };
    info.cookie = null_mut();
    info.name.fill(0);
    info.module.fill(0);
    let Ok(displays) = instance.displays.lock() else { return false; };
    let Some(display) = displays.get(&slot) else { return false; };
    for (dst, src) in info.name.iter_mut().take(255).zip(display.name.bytes()) {
        *dst = src as c_char;
    }
    for (dst, src) in info.module.iter_mut().take(1023).zip(display.module.bytes()) {
        *dst = src as c_char;
    }
    let physical = crate::product::EXPORTED && descriptor.is_some();
    info.min_value = if physical { descriptor.unwrap().min as f64 } else { 0. };
    info.max_value = if physical { descriptor.unwrap().max as f64 } else { 1. };
    info.default_value = if physical { display.default_value as f64 } else {
        0.
    };
    true
}
unsafe extern "C" fn param_value(plugin: *const clap_plugin, id: u32, output: *mut f64) -> bool {
    let Some(instance) = (unsafe { get(plugin) }) else {
        return false;
    };
    let Some(slot) = id.checked_sub(HOST_SLOT_BASE).map(|value| value as usize) else {
        return false;
    };
    if output.is_null() { return false; }
    let Ok(descriptors) = instance.descriptors.lock() else { return false; };
    let Ok(bank) = instance.values.lock() else { return false; };
    if !bank.contains(slot) { return false; }
    unsafe { *output = host_value(descriptors.get(&slot).copied().flatten(), bank.read_slot(slot)) };
    true
}
unsafe extern "C" fn to_text(
    plugin: *const clap_plugin, id: u32, value: f64,
    output: *mut c_char, capacity: u32,
) -> bool {
    if output.is_null() { return false; }
    let Some(instance) = (unsafe { get(plugin) }) else { return false; };
    let Some(slot) = id.checked_sub(HOST_SLOT_BASE) else { return false; };
    let Ok(displays) = instance.displays.lock() else { return false; };
    let Some(display) = displays.get(&(slot as usize)) else { return false; };
    let Some(normalized) = normalized_value(display.parameter, value) else { return false; };
    let text = display.text(normalized as f64);
    if text.len() + 1 > capacity as usize { return false; }
    unsafe {
        ptr::copy_nonoverlapping(text.as_ptr(), output as *mut u8, text.len());
        *output.add(text.len()) = 0;
    }
    true
}
unsafe extern "C" fn from_text(
    plugin: *const clap_plugin, id: u32, text: *const c_char, output: *mut f64,
) -> bool {
    if text.is_null() || output.is_null() { return false; }
    let Some(instance) = (unsafe { get(plugin) }) else { return false; };
    let Some(slot) = id.checked_sub(HOST_SLOT_BASE) else { return false; };
    let Ok(displays) = instance.displays.lock() else { return false; };
    let Some(display) = displays.get(&(slot as usize)) else { return false; };
    let Ok(text) = (unsafe { CStr::from_ptr(text) }).to_str() else { return false; };
    let Some(normalized) = display.normalized(text).filter(|v| v.is_finite() && (0. ..=1.).contains(v)) else { return false; };
    unsafe { *output = host_value(display.parameter, normalized as f32); }
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
                let Some(index) = runtime.slot_indices.get(&slot).copied().flatten() else { continue; };
                let parameter = runtime.prepared.processor.host_parameters()[index];
                if event.note_id != -1
                    || event.port_index != -1
                    || event.channel != -1
                    || event.key != -1
                {
                    continue;
                }
                let Some(normalized) = normalized_value(Some(parameter), event.value) else { return false; };
                if runtime.automation.len() == MAX_AUTOMATION
                {
                    return false;
                }
                runtime.automation.push(TimedAutomation {
                    offset,
                    id: u64::from(event.param_id),
                    normalized,
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

#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
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
                let slot = (message.id - HOST_SLOT_BASE) as usize;
                let parameter = if let Some(runtime) = runtime.as_deref() {
                    runtime.slot_indices.get(&slot).copied().flatten()
                        .map(|index| runtime.prepared.processor.host_parameters()[index])
                } else {
                    instance.descriptors.lock().ok().and_then(|slots| slots.get(&slot).copied().flatten())
                };
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
                    value: host_value(parameter, message.value),
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
                if let Some(index) = runtime.slot_indices.get(&slot).copied().flatten() {
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
                if let Ok(bank) = instance.values.lock() { bank.write_slot(slot, message.value); }
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
    let block = unsafe { &*block };
    let current = instance.current.load(Ordering::Acquire);
    if current.is_null() {
        return CLAP_PROCESS_ERROR;
    }
    // Reject malformed audio buffers before consuming a pending publication or
    // control mailbox. Active edits are required to retain the same bus shape.
    let current = unsafe { &*current };
    let io_channels = if let Some(layout) = current.prepared.processor.io_layout() {
        let Some(channels) = (unsafe { io_ports::Channels::read(block, layout) }) else {
            return CLAP_PROCESS_ERROR;
        };
        Some(channels)
    } else {
        None
    };
    if let Some(channels) = &io_channels {
        if current.io_buffers.as_ref().unwrap()
            .validate_buffers(channels, channels, block.frames_count as usize).is_err() {
            return CLAP_PROCESS_ERROR;
        }
    }
    instance.publish();
    let pointer = instance.current.load(Ordering::Acquire);
    if pointer.is_null() {
        return CLAP_PROCESS_ERROR;
    }
    let runtime = unsafe { &mut *pointer };
    if let Some((generation, accepted)) =
        instance.live_routes.apply(&mut runtime.prepared.processor)
    {
        if accepted {
            instance.snapshot(runtime);
            instance
                .published_generation
                .store(generation, Ordering::Release);
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        instance.gui.request_refresh(instance.host);
    }
    let mut scripted_parameter_changed = false;
    if let Some((generation, accepted)) = instance
        .live_parameters
        .apply(&mut runtime.prepared.processor)
    {
        if accepted {
            instance.snapshot(runtime);
            instance
                .published_generation
                .store(generation, Ordering::Release);
            scripted_parameter_changed = true;
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        instance.gui.request_refresh(instance.host);
    }
    if !block.transport.is_null() {
        let transport = unsafe { &*block.transport };
        if transport.flags & (CLAP_TRANSPORT_HAS_TEMPO | CLAP_TRANSPORT_HAS_TIME_SIGNATURE)
            == CLAP_TRANSPORT_HAS_TEMPO | CLAP_TRANSPORT_HAS_TIME_SIGNATURE
        {
            instance.bar_clock.publish(
                runtime.sample_rate,
                transport.tempo,
                i32::from(transport.tsig_num),
                i32::from(transport.tsig_denom),
            );
        } else {
            instance.bar_clock.clear();
        }
    } else {
        instance.bar_clock.clear();
    }
    if !unsafe { collect(block.in_events, block.frames_count as usize, runtime) } {
        return CLAP_PROCESS_ERROR;
    }
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    let gui_changed = drain_gui(instance, block.out_events, Some(runtime));
    let output = if io_channels.is_none() {
        let Some(output) =
            (unsafe { out_channels(block.audio_outputs, block.audio_outputs_count) })
        else {
            return CLAP_PROCESS_ERROR;
        };
        Some(output)
    } else {
        None
    };
    let scripted_event = instance.live_events.merge(
        &runtime.prepared.processor,
        &mut runtime.events,
        block.frames_count as usize,
    );
    let rendered = if let Some(channels) = &io_channels {
        unsafe {
            runtime.io_buffers.as_mut().unwrap().render_buffers(
                &mut runtime.prepared.processor,
                channels, channels,
                block.frames_count as usize,
                &runtime.events,
                &runtime.automation,
            )
        }
    } else {
        let raw = RawHostBlock {
            frames: block.frames_count as usize,
            main: unsafe { channels(block.audio_inputs, block.audio_inputs_count, 0) },
            sidechain: unsafe { channels(block.audio_inputs, block.audio_inputs_count, 1) },
            output: output.unwrap(),
            events: &runtime.events,
            automation: &runtime.automation,
        };
        unsafe { runtime.buffers.render(&mut runtime.prepared.processor, raw) }
    };
    if let Some(command) = scripted_event {
        instance.live_events.complete(command, rendered.is_ok());
    }
    if rendered.is_err() {
        return CLAP_PROCESS_ERROR;
    }
    let rms = runtime.io_buffers.as_ref().map_or_else(|| runtime.buffers.output_rms(block.frames_count as usize), |buffers| buffers.output_rms(block.frames_count as usize));
    instance.output_rms.store(rms.to_bits(), Ordering::Relaxed);
    let channels = runtime.io_buffers.as_ref().map_or_else(|| runtime.buffers.output_stereo(block.frames_count as usize), |buffers| buffers.output_stereo(block.frames_count as usize));
    runtime.spectrum.process(channels, &instance.output_spectrum);
    if let Some(worker) = runtime.capture_worker.as_mut() {
        worker.service(&mut runtime.prepared.processor);
    }
    if let Some(worker) = runtime.loop_worker.as_mut() {
        worker.service(&runtime.prepared.processor);
    }
    if scripted_parameter_changed || !runtime.automation.is_empty() || {
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        {
            gui_changed
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
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
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
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
                let Some(parameter) = descriptors.get(&slot) else { continue; };
                let Some(normalized) = normalized_value(*parameter, value.value) else { continue; };
                if value.note_id == -1
                    && value.port_index == -1
                    && value.channel == -1
                    && value.key == -1
                {
                    if let Ok(bank) = instance.values.lock() { bank.write_slot(slot, normalized); }
                }
            }
        }
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        instance.gui.request_refresh(instance.host);
        return;
    }
    let runtime = unsafe { &mut *pointer };
    if !unsafe { collect(events, 0, runtime) } {
        return;
    }
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
    let _ = drain_gui(instance, out, Some(runtime));
    if runtime
        .prepared
        .processor
        .flush_host_automation(&runtime.automation)
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
    let Some(state) = instance.host_state_bytes() else {
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
        bytes.extend_from_slice(&chunk[..count as usize]);
    }
    io_ports::trace(format_args!("state.load bytes={} active={}", bytes.len(), instance.active.load(Ordering::Acquire)));
    let result = instance.restore(bytes);
    io_ports::trace(format_args!("state.load result={result}"));
    result
}
static STATE: clap_plugin_state = clap_plugin_state {
    save: Some(save),
    load: Some(load),
};

#[cfg(test)]
mod tests {
    use manifold_native::parameters::HostParameter;
    use super::*;
    include!("graph_scale_tests.rs");
    mod host_scale { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../manifold-native/tests/support/host_scale.rs")); }
    mod owned_loops {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../manifold-native/tests/support/loop_publication.rs"
        ));
    }
    pub(super) mod callback_heap {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../manifold-native/tests/support/callback_heap.rs"
        ));
    }

    mod sample_suite {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../manifold-native/tests/support/scripted_samples.rs"
        ));
    }
    struct ScriptSampleHost(Box<Instance>);
    impl sample_suite::SampleHost for ScriptSampleHost {
        fn open(bytes: &[u8]) -> Self {
            let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
            assert!(instance.restore_package(bytes));
            assert!(unsafe { activate(&instance.plugin, 48000., 1, 128) });
            assert!(unsafe { start(&instance.plugin) });
            Self(instance)
        }
        fn call(&self, method: &str, args: Vec<serde_json::Value>) -> u64 {
            self.0.scripted_call(method, args).unwrap()
        }
        fn status(&self, generation: u64) -> u32 {
            self.0.scripted_status(generation)
        }
        fn render(&self) -> [[f32; 128]; 2] {
            callback_heap::measure(|| render_owned_loop_block(&self.0, 0))
        }
        fn save(&self) -> Vec<u8> {
            self.0.host_state_bytes().unwrap()
        }
        fn pause(&self) {
            unsafe { stop(&self.0.plugin) };
        }
        fn resume(&self) {
            assert!(unsafe { start(&self.0.plugin) });
        }
        fn retire(&self) {
            self.0.retire();
        }
        fn heap_guarded() -> bool {
            true
        }
    }
    impl Drop for ScriptSampleHost {
        fn drop(&mut self) {
            self.0.deactivate();
        }
    }
    #[test]
    fn clap_scripted_sample_package_matches_native() {
        sample_suite::rack::<ScriptSampleHost>(
            "clap",
            include_bytes!("../../../web/public/packages/rack-sample-author.manifold.json"),
        );
        sample_suite::instrument::<ScriptSampleHost>(
            "clap",
            include_bytes!("../../../web/public/packages/sample-instrument-author.manifold.json"),
        );
    }

    #[test]
    fn clap_script_parameter_rejection_after_deactivation_can_retry() {
        let host = <ScriptSampleHost as sample_suite::SampleHost>::open(include_bytes!(
            "../../../web/public/packages/rack-sample-author.manifold.json"
        ));
        host.0.deactivate();
        let before = host.0.host_state_bytes().unwrap();
        let args = vec![
            serde_json::json!("/midi/synth/rack/sample/1/unison"),
            serde_json::json!(2.),
        ];
        assert!(host.0.scripted_call("set", args.clone()).is_err());
        assert_eq!(host.0.host_state_bytes().unwrap(), before);
        assert!(unsafe { activate(&host.0.plugin, 48000., 1, 128) });
        assert!(unsafe { start(&host.0.plugin) });
        let generation = host.0.scripted_call("set", args).unwrap();
        callback_heap::measure(|| render_owned_loop_block(&host.0, 0));
        assert_eq!(host.0.scripted_status(generation), 1);
    }

    fn render_owned_loop_block(instance: &Instance, frame: usize) -> [[f32; 128]; 2] {
        let mut input = owned_loops::input(frame);
        let mut input_channels = [input[0].as_mut_ptr(), input[1].as_mut_ptr()];
        let input_bus = clap_audio_buffer {
            data32: input_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let mut output = [[0.; 128]; 2];
        let mut output_channels = [output[0].as_mut_ptr(), output[1].as_mut_ptr()];
        let mut output_bus = clap_audio_buffer {
            data32: output_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let block = clap_process {
            steady_time: frame as i64,
            frames_count: 128,
            transport: null(),
            audio_inputs: &input_bus,
            audio_outputs: &mut output_bus,
            audio_inputs_count: 1,
            audio_outputs_count: 1,
            in_events: null(),
            out_events: null(),
        };
        assert_eq!(
            unsafe { process(&instance.plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        output
    }

    #[test]
    fn clap_owned_loop_publication_matches_native_through_staging_races_stop_and_reopen() {
        let source = owned_loops::document(2, false, 1.);
        let first = owned_loops::document(12, true, 1.);
        let second = owned_loops::document(22, true, 0.7);
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(source.clone()));
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        let mut reference = owned_loops::prepare(&source);
        let set = |id, value| {
            let runtime = unsafe { &mut *instance.current.load(Ordering::Acquire) };
            let node = runtime.prepared.processor.host_parameters()[0].node;
            assert!(runtime.prepared.processor.set_parameter(node, id, value));
        };
        set(0, 1.);
        assert!(reference.processor.set_parameter(2, 0, 1.));
        let mut tape = Vec::new();
        let mut expected_tape = Vec::new();
        for index in 0..384 {
            if index == 12 {
                assert!(instance.restore_locked_with_parameter_baseline(
                    first.clone(),
                    false,
                    true,
                    Some(&source)
                ));
                let runtime = unsafe { &mut *instance.current.load(Ordering::Acquire) };
                assert!(
                    runtime
                        .prepared
                        .processor
                        .begin_prepared_capture_staging(2, 128)
                );
                set(3, 1.33);
                assert!(reference.processor.set_parameter(2, 3, 1.33));
            }
            if index == 14 {
                let runtime = unsafe { &mut *instance.current.load(Ordering::Acquire) };
                assert!(runtime.prepared.processor.cancel_capture_staging(2));
            }
            if index == 48 {
                for (id, value) in [(0, 0.), (1, 1.)] {
                    set(id, value);
                    assert!(reference.processor.set_parameter(2, id, value));
                }
            }
            if index == 96 {
                set(2, 1.);
                assert!(reference.processor.set_parameter(2, 2, 1.));
            }
            if index == 128 {
                assert!(instance.restore_locked_with_parameter_baseline(
                    second.clone(),
                    false,
                    true,
                    Some(&first)
                ));
                set(4, 1.);
                assert!(reference.processor.set_parameter(2, 4, 1.));
                assert!(reference.processor.set_parameter(2, 5, 0.7));
            }
            if index == 240 {
                set(2, 0.);
                assert!(reference.processor.set_parameter(2, 2, 0.));
            }
            let actual = callback_heap::measure(|| render_owned_loop_block(&instance, index * 128));
            let expected = owned_loops::render(&mut reference, index * 128);
            assert_eq!(actual, expected, "block {index}");
            if index == 12 || index == 13 {
                assert!(!instance.pending.load(Ordering::Acquire).is_null());
            }
            owned_loops::append(&mut tape, &actual);
            owned_loops::append(&mut expected_tape, &expected);
        }
        let saved = instance.published_state_bytes().unwrap();
        let expected = reference.save_state().unwrap();
        owned_loops::assert_take(&saved, &expected);
        let third = owned_loops::document(32, true, 0.7);
        assert!(instance.restore_locked_with_parameter_baseline(third, false, true, Some(&second)));
        instance.deactivate();
        let stopped = instance.published_state_bytes().unwrap();
        assert!(reference.finish_recording_loops_for_host_stop());
        let expected = reference.save_state().unwrap();
        owned_loops::assert_take(&stopped, &expected);
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        let mut reference = owned_loops::prepare(&expected);
        for index in 384..448 {
            let actual = callback_heap::measure(|| render_owned_loop_block(&instance, index * 128));
            let expected = owned_loops::render(&mut reference, index * 128);
            assert_eq!(actual, expected);
            owned_loops::append(&mut tape, &actual);
            owned_loops::append(&mut expected_tape, &expected);
        }
        owned_loops::export("clap", &tape, &expected_tape, &stopped);
        instance.deactivate();
    }
    use clap_sys::events::clap_input_events;
    use clap_sys::version::CLAP_VERSION;
    use manifold_native::AudioBlock;

    #[test]
    fn pending_clap_loop_route_keeps_newer_take_on_host_stop() {
        let fixture =
            include_bytes!("../../../projects/graph-workspace/authored-live-loop-route.json");
        NativeProject::parse(fixture).unwrap();
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(fixture.to_vec()));
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        let runtime = unsafe { &mut *instance.current.load(Ordering::Acquire) };
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for sample in [0.2, -0.3] {
            assert!(
                runtime
                    .prepared
                    .processor
                    .set_parameter(2_u32.into(), 0, 1.0)
            );
            runtime
                .prepared
                .processor
                .process(AudioBlock {
                    main: Some([&[sample; 128], &[sample; 128]]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            runtime
                .loop_worker
                .as_mut()
                .unwrap()
                .service(&runtime.prepared.processor);
            assert!(
                runtime
                    .prepared
                    .processor
                    .set_parameter(2_u32.into(), 0, 0.0)
            );
            runtime
                .loop_worker
                .as_mut()
                .unwrap()
                .service(&runtime.prepared.processor);
            if sample > 0.0 {
                assert!(
                    instance
                        .request_live_route(4, "b", Some((2, "out")))
                        .is_some()
                );
            }
        }
        assert!(
            runtime
                .prepared
                .processor
                .set_parameter(2_u32.into(), 1, 1.0)
        );
        runtime
            .loop_worker
            .as_mut()
            .unwrap()
            .service(&runtime.prepared.processor);
        let active_state: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(
            active_state["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 2 && entry["id"] == 1)
                .unwrap()["value"],
            1.0
        );
        instance.deactivate();
        let mut saved = Vec::new();
        let stream = clap_ostream {
            ctx: (&mut saved as *mut Vec<u8>).cast(),
            write: Some(write),
        };
        assert!(unsafe { save(&instance.plugin, &stream) });
        let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert!(
            document["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|edge| edge["from"] == 2 && edge["to"] == 4 && edge["inputPort"] == 1)
        );
        let mut reopened = NativeProject::parse(&saved)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let zero = [0.0; 128];
        reopened
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(
            left.iter().all(|value| (*value + 0.6).abs() < 1e-5),
            "{}",
            left[0]
        );
        assert!(right.iter().all(|value| (*value + 0.6).abs() < 1e-5));
    }

    #[test]
    fn active_clap_state_save_reopens_authored_loop_pcm() {
        let fixture =
            include_bytes!("../../../projects/graph-workspace/authored-rack-four-layer-loops.json");
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(fixture.to_vec()));
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        let runtime = unsafe { &mut *instance.current.load(Ordering::Acquire) };
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        assert!(
            runtime
                .prepared
                .processor
                .set_parameter(70_u32.into(), 0, 1.0)
        );
        runtime
            .prepared
            .processor
            .process(AudioBlock {
                main: Some([&[0.2; 128], &[-0.3; 128]]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        runtime
            .loop_worker
            .as_mut()
            .unwrap()
            .service(&runtime.prepared.processor);
        assert!(instance.published_state_bytes().is_none());
        assert!(
            runtime
                .prepared
                .processor
                .set_parameter(70_u32.into(), 0, 0.0)
        );
        runtime
            .loop_worker
            .as_mut()
            .unwrap()
            .service(&runtime.prepared.processor);
        assert!(
            runtime
                .prepared
                .processor
                .set_parameter(70_u32.into(), 1, 1.0)
        );
        runtime
            .loop_worker
            .as_mut()
            .unwrap()
            .service(&runtime.prepared.processor);
        let mut saved = Vec::new();
        let stream = clap_ostream {
            ctx: (&mut saved as *mut Vec<u8>).cast(),
            write: Some(write),
        };
        assert!(unsafe { save(&instance.plugin, &stream) });
        let project: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        let take = project["assets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|asset| asset["nodeId"] == 70)
            .unwrap();
        assert_eq!(take["frames"], 128);
        assert_eq!(
            project["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 70 && entry["id"] == 1)
                .unwrap()["value"],
            1.0
        );
        let restored = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(restored.restore(saved));
        assert!(unsafe { activate(&restored.plugin, 48_000., 1, 128) });
        unsafe { reset(&restored.plugin) };
        let playback = unsafe { &mut *restored.current.load(Ordering::Acquire) };
        let zero = [0.0; 128];
        playback
            .prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(
            playback
                .prepared
                .processor
                .begin_prepared_capture_staging(74_u32.into(), 128)
        );
        playback
            .prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        let mut captured = [0.0; 256];
        assert_eq!(
            playback.prepared.processor.copy_capture_staged_interleaved(
                74_u32.into(),
                0,
                &mut captured
            ),
            128
        );
        assert!(
            captured
                .chunks_exact(2)
                .all(|pair| (pair[0] - 0.2).abs() < 1e-5 && (pair[1] + 0.3).abs() < 1e-5)
        );
        restored.deactivate();
        instance.deactivate();
    }

    #[test]
    fn deactivated_clap_graph_saves_recorded_loop_pcm() {
        let fixture =
            include_bytes!("../../../projects/graph-workspace/authored-rack-four-layer-loops.json");
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(fixture.to_vec()));
        *instance.configuration.lock().unwrap() = Some((48_000., 128));
        instance.current.store(
            Box::into_raw(Instance::prepare(fixture, 48_000., 128, Arc::clone(&instance.values.lock().unwrap())).unwrap()),
            Ordering::Release,
        );
        instance.active.store(true, Ordering::Release);
        let runtime = unsafe { &mut *instance.current.load(Ordering::Acquire) };
        let input_left = [0.2; 128];
        let input_right = [-0.3; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        assert!(
            runtime
                .prepared
                .processor
                .set_parameter(70_u32.into(), 0, 1.0)
        );
        for _ in 0..4 {
            runtime
                .prepared
                .processor
                .process(AudioBlock {
                    main: Some([&input_left, &input_right]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
        }
        assert!(
            runtime
                .prepared
                .processor
                .set_parameter(70_u32.into(), 0, 0.0)
        );
        assert!(
            runtime
                .prepared
                .processor
                .set_parameter(70_u32.into(), 1, 1.0)
        );
        instance.deactivate();
        let mut host_saved = Vec::new();
        let stream = clap_ostream {
            ctx: (&mut host_saved as *mut Vec<u8>).cast(),
            write: Some(write),
        };
        assert!(unsafe { save(&instance.plugin, &stream) });
        let project: serde_json::Value = serde_json::from_slice(&host_saved).unwrap();
        assert_eq!(
            project["assets"]
                .as_array()
                .unwrap()
                .iter()
                .find(|asset| asset["nodeId"] == 70)
                .unwrap()["frames"],
            512
        );
        assert_eq!(
            project["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 70 && entry["id"] == 1)
                .unwrap()["value"]
                .as_f64(),
            Some(1.)
        );
        NativeProject::parse(&host_saved).unwrap();
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        let restored = unsafe { &mut *instance.current.load(Ordering::Acquire) };
        let zero = [0.0; 128];
        restored
            .prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(
            restored
                .prepared
                .processor
                .begin_prepared_capture_staging(74_u32.into(), 128)
        );
        restored
            .prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        let mut captured = [0.0; 256];
        assert_eq!(
            restored.prepared.processor.copy_capture_staged_interleaved(
                74_u32.into(),
                0,
                &mut captured
            ),
            128
        );
        assert!(
            captured
                .chunks_exact(2)
                .all(|frame| (frame[0] - 0.2).abs() < 1e-6 && (frame[1] + 0.3).abs() < 1e-6)
        );
        assert!(
            restored
                .prepared
                .processor
                .set_parameter(70_u32.into(), 0, 1.0)
        );
        for _ in 0..2 {
            restored
                .prepared
                .processor
                .process(AudioBlock {
                    main: Some([&input_left, &input_right]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
        }
        instance.deactivate();
        host_saved.clear();
        assert!(unsafe { save(&instance.plugin, &stream) });
        let stopped: serde_json::Value = serde_json::from_slice(&host_saved).unwrap();
        assert_eq!(
            stopped["assets"]
                .as_array()
                .unwrap()
                .iter()
                .find(|asset| asset["nodeId"] == 70)
                .unwrap()["frames"],
            256
        );
        assert_eq!(
            stopped["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 70 && entry["id"] == 0)
                .unwrap()["value"]
                .as_f64(),
            Some(0.)
        );
    }

    #[test]
    fn fixed_value_bank_never_exposes_a_mixed_audio_snapshot() {
        let bank = ValueBank::new([0.25; manifold_native::parameters::STUDIO_HOST_SLOT_COUNT]);
        std::thread::scope(|scope| {
            scope.spawn(|| {
                for index in 0..20_000 {
                    bank.write_all([if index & 1 == 0 { 0.75 } else { 0.25 }; manifold_native::parameters::STUDIO_HOST_SLOT_COUNT]);
                }
            });
            for _ in 0..20_000 {
                let values = bank.read_all();
                assert!(values.values().all(|value| *value == values[&0]));
            }
        });
    }

    #[test]
    fn live_state_saves_keep_automated_controls_from_one_block() {
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        let descriptors = instance.descriptors.lock().unwrap().clone();
        let continuous: Vec<_> = descriptors
            .iter()
            .filter_map(|(&slot, descriptor)| {
                descriptor
                    .filter(|descriptor| !descriptor.discrete)
                    .map(|descriptor| (slot, descriptor))
            })
            .collect();
        let (first_slot, first) = continuous[0];
        let (second_slot, second) = continuous[1];
        let bank = Arc::clone(&instance.values.lock().unwrap());
        let initial = bank.read_all();
        std::thread::scope(|scope| {
            scope.spawn(|| {
                for index in 0..20_000 {
                    let mut values = initial.clone();
                    values.insert(first_slot, if index & 1 == 0 { 0.2 } else { 0.8 });
                    values.insert(second_slot, if index & 1 == 0 { 0.8 } else { 0.2 });
                    bank.write_slots(values);
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
                if (normalized_first - initial[&first_slot]).abs() > 1e-5
                    || (normalized_second - initial[&second_slot]).abs() > 1e-5
                {
                    assert!(
                        (normalized_first + normalized_second - 1.0).abs() < 1e-5,
                        "saved pair={normalized_first},{normalized_second}; initial pair={},{}",
                        initial[&first_slot],
                        initial[&second_slot]
                    );
                }
                NativeProject::parse(&saved).unwrap();
            }
        });
    }

    #[test]
    fn host_save_waits_for_published_graph_generation() {
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        *instance.configuration.lock().unwrap() = Some((48_000., 128));
        instance.active.store(true, Ordering::Release);
        instance.current.store(
            Box::into_raw(Instance::prepare(DEFAULT, 48_000., 128, Arc::clone(&instance.values.lock().unwrap())).unwrap()),
            Ordering::Release,
        );
        let saved = instance.published_state_bytes().unwrap();
        let tone = include_bytes!("../../../projects/graph-workspace/tone-texture.json");
        assert!(instance.restore(tone.to_vec()));
        assert_eq!(instance.published_state_bytes().unwrap(), saved);
        let mut host_saved = Vec::new();
        let stream = clap_ostream {
            ctx: (&mut host_saved as *mut Vec<u8>).cast(),
            write: Some(write),
        };
        assert!(unsafe { save(&instance.plugin, &stream) });
        assert_eq!(host_saved, saved);
        assert!(!instance.restore(b"{broken".to_vec()));
        assert_eq!(instance.published_state_bytes().unwrap(), saved);
        instance.publish();
        let published = instance.published_state_bytes().unwrap();
        host_saved.clear();
        assert!(unsafe { save(&instance.plugin, &stream) });
        assert_eq!(host_saved, published);
        let document: serde_json::Value = serde_json::from_slice(&published).unwrap();
        assert!(
            document["signal"]["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|node| node["type"] == "oscillator")
        );
        assert_eq!(instance.published_state_bytes().unwrap(), published);
        assert!(instance.restore(DEFAULT.to_vec()));
        assert_eq!(instance.published_state_bytes().unwrap(), published);
        instance.deactivate();
        assert_eq!(instance.published_state_bytes().unwrap(), saved);
    }

    #[test]
    fn project_import_save_ignores_snapshots_from_the_retired_generation() {
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        *instance.configuration.lock().unwrap() = Some((48_000., 128));
        instance.active.store(true, Ordering::Release);
        let old_runtime = Instance::prepare(DEFAULT, 48_000., 128, Arc::clone(&instance.values.lock().unwrap())).unwrap();
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
    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
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

    #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
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
        let bank = Arc::new(ValueBank::from_slots(normalized_host_values(&slots(&NativeProject::parse(DEFAULT).unwrap()))));
        let mut runtime = *Instance::prepare(DEFAULT, 48_000., 128, bank).unwrap();
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
        assert_eq!(unsafe { crate::factory_count(&crate::FACTORY.0) }, 3);
        assert_eq!(unsafe { NOTE_PORTS.count.unwrap()(plugin, true) }, 1);
        assert_eq!(
            unsafe { PARAMS.count.unwrap()(plugin) },
            manifold_native::parameters::STUDIO_HOST_SLOT_COUNT as u32
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
                            id: u64::from(HOST_SLOT_BASE + slot),
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

    #[test]
    fn live_named_route_changes_clap_callback_and_published_host_save() {
        let authored =
            include_bytes!("../../../projects/graph-workspace/authored-inverted-lfo.json");
        let changed = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        let reference = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        for instance in [&changed, &reference] {
            assert!(instance.restore(authored.to_vec()));
            assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        }
        let render = |instance: &Instance| {
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
                in_events: null(),
                out_events: null(),
            };
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
            assert_eq!(left, right);
            left
        };
        assert_eq!(render(&changed), render(&reference));
        let before = changed.published_state_bytes().unwrap();
        let generation = changed
            .request_live_route(6, "cv", Some((5, "uni")))
            .unwrap();
        assert_eq!(changed.published_state_bytes().unwrap(), before);
        let after_audio = render(&changed);
        let old_audio = render(&reference);
        assert!(
            after_audio
                .iter()
                .zip(old_audio)
                .any(|(a, b)| (a - b).abs() > 0.001)
        );
        assert_eq!(changed.live_route_status(generation), Some(true));
        let saved = changed.published_state_bytes().unwrap();
        let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(
            document["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["from"] == 5)
                .unwrap()["outputPort"],
            2
        );
        assert!(
            changed
                .request_live_route(6, "audio", Some((5, "uni")))
                .is_none()
        );
        assert_eq!(changed.published_state_bytes().unwrap(), saved);
        changed.deactivate();
        reference.deactivate();
    }

    #[test]
    fn queued_route_survives_clap_deactivation_as_next_activation_state() {
        let authored =
            include_bytes!("../../../projects/graph-workspace/authored-inverted-lfo.json");
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(authored.to_vec()));
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        assert!(
            instance
                .request_live_route(6, "cv", Some((5, "uni")))
                .is_some()
        );
        instance.deactivate();
        let saved = instance.published_state_bytes().unwrap();
        let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert!(
            document["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|edge| edge["from"] == 5 && edge["to"] == 6 && edge["outputPort"] == 2)
        );
        assert!(!instance.live_routes.pending());
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        assert_eq!(instance.published_state_bytes().unwrap(), saved);
        instance.deactivate();
    }

    #[test]
    fn javascript_authored_graph_matches_native_in_clap_callback() {
        let authored =
            include_bytes!("../../../projects/graph-workspace/authored-inverted-lfo.json");
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        let plugin = &instance.plugin as *const clap_plugin;
        assert!(instance.restore(authored.to_vec()));
        assert!(unsafe { activate(plugin, 48_000., 1, 128) });
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
            in_events: null(),
            out_events: null(),
        };
        assert_eq!(unsafe { process(plugin, &block) }, CLAP_PROCESS_CONTINUE);
        let project = NativeProject::parse(authored).unwrap();
        let mut reference = project.prepare_with_state(48_000., 128).unwrap();
        let mut buffers = HostBuffers::prepare(128);
        let mut expected_left = [0_f32; 128];
        let mut expected_right = [0_f32; 128];
        unsafe {
            buffers.render(
                &mut reference.processor,
                RawHostBlock {
                    frames: 128,
                    main: [null(), null()],
                    sidechain: [null(), null()],
                    output: [expected_left.as_mut_ptr(), expected_right.as_mut_ptr()],
                    events: &[],
                    automation: &[],
                },
            )
        }
        .unwrap();
        assert!(
            left.iter()
                .zip(expected_left)
                .all(|(actual, expected)| (actual - expected).abs() < 1e-7)
        );
        assert!(
            right
                .iter()
                .zip(expected_right)
                .all(|(actual, expected)| (actual - expected).abs() < 1e-7)
        );
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        let saved = instance.state_bytes().unwrap();
        NativeProject::parse(&saved).unwrap();
        let saved_json: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(saved_json["signal"]["connections"][2]["outputPort"], 1);
        instance.deactivate();
    }

    #[test]
    fn authored_cv_chains_match_native_in_clap_callback() {
        let fixtures: [(&[u8], usize); 2] = [
            (
                include_bytes!("../../../projects/graph-workspace/authored-cv-utilities.json"),
                9,
            ),
            (
                include_bytes!("../../../projects/graph-workspace/authored-cv-decisions.json"),
                8,
            ),
        ];
        for (authored, expected_nodes) in fixtures {
            let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
            assert!(instance.restore(authored.to_vec()));
            assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
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
                in_events: null(),
                out_events: null(),
            };
            let project = NativeProject::parse(authored).unwrap();
            let mut reference = project.prepare_with_state(48_000., 128).unwrap();
            let mut buffers = HostBuffers::prepare(128);
            let mut expected_left = [0_f32; 128];
            let mut expected_right = [0_f32; 128];
            for _ in 0..4 {
                assert_eq!(
                    unsafe { process(&instance.plugin, &block) },
                    CLAP_PROCESS_CONTINUE
                );
                unsafe {
                    buffers.render(
                        &mut reference.processor,
                        RawHostBlock {
                            frames: 128,
                            main: [null(), null()],
                            sidechain: [null(), null()],
                            output: [expected_left.as_mut_ptr(), expected_right.as_mut_ptr()],
                            events: &[],
                            automation: &[],
                        },
                    )
                }
                .unwrap();
                assert!(
                    left.iter()
                        .zip(expected_left)
                        .all(|(a, b)| (a - b).abs() < 1e-6)
                );
                assert!(
                    right
                        .iter()
                        .zip(expected_right)
                        .all(|(a, b)| (a - b).abs() < 1e-6)
                );
            }
            assert!(left.iter().any(|sample| sample.abs() > 0.001));
            let saved = instance.published_state_bytes().unwrap();
            NativeProject::parse(&saved).unwrap();
            let saved_json: serde_json::Value = serde_json::from_slice(&saved).unwrap();
            assert_eq!(
                saved_json["signal"]["nodes"].as_array().unwrap().len(),
                expected_nodes
            );
            instance.deactivate();
        }
    }

    #[test]
    fn legacy_authored_graph_and_fx_swap_publish_while_clap_audio_runs() {
        let authored =
            include_bytes!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
        let mut bypass: serde_json::Value = serde_json::from_slice(authored).unwrap();
        bypass["signal"]["nodes"]
            .as_array_mut()
            .unwrap()
            .retain(|node| node["id"] != 5);
        bypass["signal"]["connections"]
            .as_array_mut()
            .unwrap()
            .retain(|edge| edge["from"] != 5 && edge["to"] != 5);
        bypass["signal"]["connections"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({
                "from": 4, "outputPort": 0, "to": 3, "inputPort": 0
            }));
        bypass["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
            .retain(|value| value["nodeId"] != 5);
        bypass["endpoints"]
            .as_array_mut()
            .unwrap()
            .retain(|endpoint| endpoint["nodeId"] != 5);
        bypass["hostBindings"]
            .as_array_mut()
            .unwrap()
            .retain(|binding| binding["nodeId"] != 5);
        bypass["instances"]
            .as_array_mut()
            .unwrap()
            .retain(|instance| instance["nodeId"] != 5);
        let bypass = serde_json::to_vec(&bypass).unwrap();
        NativeProject::parse(&bypass).unwrap();

        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(instance.restore(authored.to_vec()));
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        let mut input_left: [f32; 128] = std::array::from_fn(|i| ((i % 16) as f32 - 8.) / 8.);
        let mut input_right: [f32; 128] =
            std::array::from_fn(|i| (((i * 3) % 16) as f32 - 8.) / 8.);
        let mut input_channels = [input_left.as_mut_ptr(), input_right.as_mut_ptr()];
        let input = clap_audio_buffer {
            data32: input_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut output_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output = clap_audio_buffer {
            data32: output_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let block = clap_process {
            steady_time: 0,
            frames_count: 128,
            transport: null(),
            audio_inputs: &input,
            audio_outputs: &mut output,
            audio_inputs_count: 1,
            audio_outputs_count: 1,
            in_events: null(),
            out_events: null(),
        };
        assert_eq!(
            unsafe { process(&instance.plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        assert!(left.iter().any(|sample| sample.abs() > 0.01));
        let mut reference = NativeProject::parse(authored)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let mut reference_block = || {
            let mut reference_left = [0_f32; 128];
            let mut reference_right = [0_f32; 128];
            reference
                .processor
                .process(manifold_native::AudioBlock {
                    main: Some([&input_left, &input_right]),
                    sidechain: None,
                    output: [&mut reference_left, &mut reference_right],
                    events: &[],
                })
                .unwrap();
            (reference_left, reference_right)
        };
        let (expected_left, expected_right) = reference_block();
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
        let mut renumbered: serde_json::Value = serde_json::from_slice(authored).unwrap();
        for node in renumbered["signal"]["nodes"].as_array_mut().unwrap() {
            if node["id"] == 5 {
                node["id"] = 15.into();
            }
        }
        for edge in renumbered["signal"]["connections"].as_array_mut().unwrap() {
            if edge["from"] == 5 {
                edge["from"] = 15.into();
            }
            if edge["to"] == 5 {
                edge["to"] = 15.into();
            }
        }
        for entry in renumbered["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
        {
            if entry["nodeId"] == 5 {
                entry["nodeId"] = 15.into();
            }
        }
        for field in ["endpoints", "hostBindings", "instances"] {
            for entry in renumbered[field].as_array_mut().unwrap() {
                if entry["nodeId"] == 5 {
                    entry["nodeId"] = 15.into();
                }
            }
        }
        assert!(instance.restore(serde_json::to_vec(&renumbered).unwrap()));
        let (expected_left, expected_right) = reference_block();
        assert_eq!(
            unsafe { process(&instance.plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
        let wet = left;
        let published = instance.published_state_bytes().unwrap();
        let published_document: serde_json::Value = serde_json::from_slice(&published).unwrap();
        assert_eq!(published_document["instances"].as_array().unwrap().len(), 2);
        assert_eq!(
            published_document["signal"]["nodes"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        assert!(instance.restore(bypass));
        assert_eq!(instance.published_state_bytes().unwrap(), published);
        assert_eq!(
            unsafe { process(&instance.plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        assert!(left.iter().zip(wet).any(|(a, b)| (a - b).abs() > 0.05));
        let saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(saved["signal"]["nodes"].as_array().unwrap().len(), 3);
        assert_eq!(saved["instances"].as_array().unwrap().len(), 1);
        assert!(
            saved["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|edge| edge["from"] == 4 && edge["to"] == 3)
        );
        let gain_slots =
            include_bytes!("../../../projects/graph-workspace/authored-fx-slot-swap.json");
        let width_slot =
            include_bytes!("../../../projects/graph-workspace/authored-fx-slot-swap-width.json");
        assert!(instance.restore(gain_slots.to_vec()));
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        let gain_audio = left;
        let gain_published = instance.published_state_bytes().unwrap();
        let gain_state: serde_json::Value = serde_json::from_slice(&gain_published).unwrap();
        assert_eq!(gain_state["signal"]["nodes"].as_array().unwrap().len(), 10);
        assert_eq!(gain_state["controls"].as_array().unwrap().len(), 6);
        assert!(instance.restore(width_slot.to_vec()));
        assert_eq!(instance.published_state_bytes().unwrap(), gain_published);
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert!(
            left.iter()
                .zip(gain_audio)
                .any(|(a, b)| (a - b).abs() > 0.03)
        );
        let width_state: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(width_state["signal"]["nodes"].as_array().unwrap().len(), 12);
        assert_eq!(width_state["controls"].as_array().unwrap()[1]["value"], 1);
        let rack_filter =
            include_bytes!("../../../projects/graph-workspace/authored-rack-filter.json");
        let rack_fx = include_bytes!("../../../projects/graph-workspace/authored-rack-fx.json");
        let rack_eq = include_bytes!("../../../projects/graph-workspace/authored-rack-eq.json");
        assert!(instance.restore(rack_filter.to_vec()));
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        let filter_audio = left;
        assert!(instance.restore(rack_fx.to_vec()));
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert!(
            left.iter()
                .zip(filter_audio)
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        let fx_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(
            fx_saved["controls"]
                .as_array()
                .unwrap()
                .iter()
                .find(|control| control["path"] == "/rack_host/module/index")
                .unwrap()["value"],
            5
        );
        assert_eq!(
            fx_saved["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["to"] == 3)
                .unwrap()["from"],
            7
        );
        assert!(instance.restore(rack_eq.to_vec()));
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert!(
            left.iter()
                .zip(filter_audio)
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        let rack_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(
            rack_saved["controls"]
                .as_array()
                .unwrap()
                .iter()
                .find(|control| control["path"] == "/rack_host/module/index")
                .unwrap()["value"],
            6
        );
        assert_eq!(
            rack_saved["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["to"] == 3)
                .unwrap()["from"],
            6
        );
        let rack_blend =
            include_bytes!("../../../projects/graph-workspace/authored-rack-blend.json");
        assert!(instance.restore(rack_blend.to_vec()));
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        let blend_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(
            blend_saved["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["to"] == 3)
                .unwrap()["from"],
            18
        );
        assert_eq!(
            blend_saved["controls"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["path"] == "/rack_host/module/index")
                .unwrap()["value"],
            3
        );
        let rack_ring =
            include_bytes!("../../../projects/graph-workspace/authored-rack-blend-ring.json");
        assert!(instance.restore(rack_ring.to_vec()));
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        let ring_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(
            ring_saved["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["to"] == 18)
                .unwrap()["from"],
            21
        );
        for (bytes, branch) in [
            (
                include_bytes!("../../../projects/graph-workspace/authored-rack-blend-fm.json")
                    .as_slice(),
                24,
            ),
            (
                include_bytes!("../../../projects/graph-workspace/authored-rack-blend-sync.json")
                    .as_slice(),
                27,
            ),
        ] {
            assert!(instance.restore(bytes.to_vec()));
            for _ in 0..12 {
                assert_eq!(
                    unsafe { process(&instance.plugin, &block) },
                    CLAP_PROCESS_CONTINUE
                );
            }
            let saved: serde_json::Value =
                serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
            assert_eq!(
                saved["signal"]["connections"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|edge| edge["to"] == 18)
                    .unwrap()["from"],
                branch
            );
        }
        for (bytes, mode, source) in [
            (
                include_bytes!("../../../projects/graph-workspace/authored-rack-noise.json")
                    .as_slice(),
                7,
                9,
            ),
            (
                include_bytes!("../../../projects/graph-workspace/authored-rack-external.json")
                    .as_slice(),
                1,
                10,
            ),
            (
                include_bytes!("../../../projects/graph-workspace/authored-rack-pulse.json")
                    .as_slice(),
                6,
                11,
            ),
        ] {
            assert!(instance.restore(bytes.to_vec()));
            for _ in 0..12 {
                assert_eq!(
                    unsafe { process(&instance.plugin, &block) },
                    CLAP_PROCESS_CONTINUE
                );
            }
            let saved: serde_json::Value =
                serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
            assert_eq!(
                saved["controls"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|control| control["path"] == "/rack_host/input_a/mode")
                    .unwrap()["value"],
                mode
            );
            assert_eq!(
                saved["signal"]["connections"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|edge| edge["to"] == 8)
                    .unwrap()["from"],
                source
            );
        }
        let rack_oscillator = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-oscillator.json"
        );
        assert!(instance.restore(rack_oscillator.to_vec()));
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        let oscillator_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(
            oscillator_saved["controls"]
                .as_array()
                .unwrap()
                .iter()
                .find(|control| control["path"] == "/rack_host/module/index")
                .unwrap()["value"],
            1
        );
        assert_eq!(
            oscillator_saved["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["to"] == 3)
                .unwrap()["from"],
            38
        );
        let rack_voice = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-voice.json"
        );
        assert!(instance.restore(rack_voice.to_vec()));
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        let voice_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        let saved_pitch = voice_saved["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["nodeId"] == 28 && entry["id"] == 1)
            .unwrap()["value"]
            .as_f64()
            .unwrap();
        assert!((saved_pitch - 622.2539674441618).abs() < 0.001);
        let vocoder =
            include_bytes!("../../../projects/graph-workspace/authored-phase-vocoder-chain.json");
        assert!(instance.restore(vocoder.to_vec()));
        for _ in 0..64 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert!(left.iter().any(|sample| sample.abs() > 0.01));
        let vocoder_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(
            vocoder_saved["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 5 && entry["id"] == 4)
                .unwrap()["value"]
                .as_f64(),
            Some(9.0)
        );
        let rack_sample = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-sample-eight-voice.json"
        );
        assert!(instance.restore(rack_sample.to_vec()));
        assert_eq!(
            unsafe { process(&instance.plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        let sample_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(sample_saved["assets"].as_array().unwrap().len(), 1);
        assert_eq!(sample_saved["sampleBindings"].as_array().unwrap().len(), 7);
        let rack_sample_host = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-sample.json"
        );
        assert!(instance.restore(rack_sample_host.to_vec()));
        assert_eq!(
            unsafe { process(&instance.plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );
        let rack_sample_saved: serde_json::Value =
            serde_json::from_slice(&instance.published_state_bytes().unwrap()).unwrap();
        assert_eq!(
            rack_sample_saved["signal"]["nodes"]
                .as_array()
                .unwrap()
                .len(),
            68
        );
        assert_eq!(
            rack_sample_saved["sampleBindings"]
                .as_array()
                .unwrap()
                .len(),
            7
        );
        assert_eq!(
            rack_sample_saved["controls"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["path"] == "/rack_host/module/index")
                .unwrap()["value"],
            2
        );
        instance.deactivate();
    }

    #[test]
    fn clap_audio_callback_captures_sidechain_and_publishes_portable_sample() {
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        let plugin = &instance.plugin as *const clap_plugin;
        let authored =
            include_bytes!("../../../projects/graph-workspace/retrospective-multisource.json");
        assert!(instance.restore(authored.to_vec()));
        assert!(unsafe { activate(plugin, 48_000., 1, 128) });
        let mut main_left = [0.25_f32; 128];
        let mut main_right = [0.25_f32; 128];
        let mut side_left = [-0.5_f32; 128];
        let mut side_right = [-0.5_f32; 128];
        let mut main_channels = [main_left.as_mut_ptr(), main_right.as_mut_ptr()];
        let mut side_channels = [side_left.as_mut_ptr(), side_right.as_mut_ptr()];
        let inputs = [
            clap_audio_buffer {
                data32: main_channels.as_mut_ptr(),
                data64: null_mut(),
                channel_count: 2,
                latency: 0,
                constant_mask: 0,
            },
            clap_audio_buffer {
                data32: side_channels.as_mut_ptr(),
                data64: null_mut(),
                channel_count: 2,
                latency: 0,
                constant_mask: 0,
            },
        ];
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
            audio_inputs: inputs.as_ptr(),
            audio_outputs: &mut output,
            audio_inputs_count: 2,
            audio_outputs_count: 1,
            in_events: null(),
            out_events: null(),
        };
        for _ in 0..75 {
            assert_eq!(
                callback_heap::measure(|| unsafe { process(plugin, &block) }),
                CLAP_PROCESS_CONTINUE
            );
        }
        assert!(!instance.request_capture(10, 1_440_001));
        assert!(instance.request_capture(10, 9_600));
        let mut published = false;
        for _ in 0..100 {
            assert_eq!(
                callback_heap::measure(|| unsafe { process(plugin, &block) }),
                CLAP_PROCESS_CONTINUE
            );
            if let Some(result) = instance.finish_capture(5, "CLAP sidechain take") {
                assert!(result);
                published = true;
                break;
            }
        }
        assert!(published);
        let saved = instance.state_bytes().unwrap();
        let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(document["signal"]["selectedCaptureNodeId"], 10);
        assert_eq!(document["assets"][0]["frames"], 9_600);
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
            velocity: 1.0,
        };
        let pointers = vec![&note.header as *const _];
        let events = clap_input_events {
            ctx: &pointers as *const _ as *mut c_void,
            size: Some(event_count),
            get: Some(event_get),
        };
        block.in_events = &events;
        assert_eq!(
            callback_heap::measure(|| unsafe { process(plugin, &block) }),
            CLAP_PROCESS_CONTINUE
        );
        assert!(left.iter().any(|sample| *sample < -0.01));
        block.in_events = null();
        let mailbox = instance.capture_mailbox().unwrap();
        assert!(mailbox.request(10, 9_600));
        let mut second = None;
        for _ in 0..100 {
            assert_eq!(
                callback_heap::measure(|| unsafe { process(plugin, &block) }),
                CLAP_PROCESS_CONTINUE
            );
            if let Some(result) = mailbox.take() {
                second = Some(result.unwrap());
                break;
            }
        }
        let second = second.expect("second capture completed");
        assert_eq!(
            second.stereo()[0],
            -2.0,
            "the prior sidechain ring survived publication"
        );
        drop(second);
        assert!(instance.request_capture_free_arm(10));
        assert_eq!(
            callback_heap::measure(|| unsafe { process(plugin, &block) }),
            CLAP_PROCESS_CONTINUE
        );
        let old_runtime = instance.current.load(Ordering::Acquire);
        let old_mailbox = instance.capture_mailbox().unwrap();
        let mut edited: serde_json::Value =
            serde_json::from_slice(&instance.state_bytes().unwrap()).unwrap();
        for node in edited["signal"]["nodes"].as_array_mut().unwrap() {
            if node["type"] == "retrospective-capture" {
                node["a"] = serde_json::json!(31);
            }
            if node["id"] == 9 {
                node["a"] = serde_json::json!(2);
            }
        }
        assert!(instance.restore_locked(serde_json::to_vec(&edited).unwrap(), true, false));
        assert!(!instance.pending.load(Ordering::Acquire).is_null());
        assert!(Arc::ptr_eq(
            &old_mailbox,
            &instance.capture_mailbox().unwrap()
        ));
        for _ in 0..2 {
            assert_eq!(
                callback_heap::measure(|| unsafe { process(plugin, &block) }),
                CLAP_PROCESS_CONTINUE
            );
            assert_eq!(
                instance.current.load(Ordering::Acquire),
                old_runtime,
                "armed take keeps its audio owner"
            );
        }
        assert!(instance.request_capture_free_stop(10));
        let mut free_published = false;
        for _ in 0..100 {
            assert_eq!(
                callback_heap::measure(|| unsafe { process(plugin, &block) }),
                CLAP_PROCESS_CONTINUE
            );
            if let Some(result) = instance.finish_capture(5, "CLAP free take") {
                assert!(result);
                free_published = true;
                break;
            }
        }
        assert!(free_published);
        let free_state: serde_json::Value =
            serde_json::from_slice(&instance.state_bytes().unwrap()).unwrap();
        assert_eq!(free_state["signal"]["captureWindowMode"], "free");
        assert_eq!(free_state["assets"][0]["frames"], 384);
        assert_eq!(
            free_state["signal"]["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .find(|n| n["id"] == 9)
                .unwrap()["a"],
            2,
            "capture completion preserves the concurrent graph edit"
        );
        use base64::Engine as _;
        let pcm = base64::engine::general_purpose::STANDARD
            .decode(free_state["assets"][0]["pcmF32Base64"].as_str().unwrap())
            .unwrap();
        assert_eq!(pcm.len(), 384 * 2 * 4);
        assert!(
            pcm.chunks_exact(4)
                .all(|sample| f32::from_le_bytes(sample.try_into().unwrap()) == -2.0),
            "the whole take comes from the old running sidechain, not the staged gain"
        );
        assert!(
            !old_mailbox.request(10, 128),
            "retired mailbox rejects stale control handles"
        );
        assert_eq!(
            callback_heap::measure(|| unsafe { process(plugin, &block) }),
            CLAP_PROCESS_CONTINUE
        );
        let adopted_mailbox = instance.capture_mailbox().unwrap();
        assert_eq!(adopted_mailbox.max_frames(), 31 * 48_000);
        assert!(!Arc::ptr_eq(&old_mailbox, &adopted_mailbox));
        instance.deactivate();
    }

    fn browser_capture_reopens_and_plays_in_clap(
        bytes: &[u8],
        expected_mode: &str,
        expected_frames: u64,
    ) {
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
        let mut reader = Reader { bytes, offset: 0 };
        let input = clap_istream {
            ctx: &mut reader as *mut _ as *mut c_void,
            read: Some(read),
        };
        assert!(unsafe { STATE.load.unwrap()(plugin, &input) });
        assert!(unsafe { (*plugin).activate.unwrap()(plugin, 48_000., 1, 128) });
        assert!(unsafe { (*plugin).start_processing.unwrap()(plugin) });
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
            velocity: 1.0,
        };
        let pointers = vec![&note.header as *const _];
        let events = clap_input_events {
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
            in_events: &events,
            out_events: null(),
        };
        assert_eq!(
            unsafe { (*plugin).process.unwrap()(plugin, &block) },
            CLAP_PROCESS_CONTINUE
        );

        let mut native = NativeProject::parse(bytes)
            .unwrap()
            .prepare(48_000., 128)
            .unwrap();
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
                            node: 4,
                            kind: EventKind::NoteOn {
                                channel: 0,
                                note: 60,
                                velocity: 127,
                            },
                        }],
                        automation: &[],
                    },
                )
                .unwrap();
        }
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        let mut saved = Vec::new();
        let stream = clap_ostream {
            ctx: &mut saved as *mut _ as *mut c_void,
            write: Some(write),
        };
        assert!(unsafe { STATE.save.unwrap()(plugin, &stream) });
        let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        let original: serde_json::Value = serde_json::from_slice(bytes).unwrap();
        assert_eq!(document["signal"]["selectedCaptureNodeId"], 10);
        if !original["signal"]["selectedCaptureSourceId"].is_null() {
            assert_eq!(document["signal"]["selectedCaptureSourceId"], 1);
        }
        assert_eq!(document["signal"]["captureWindowMode"], expected_mode);
        if expected_mode == "bars" {
            assert_eq!(document["signal"]["captureWindowBars"], 0.1);
            assert_eq!(document["signal"]["captureTempoBpm"], 120);
        }
        assert_eq!(document["assets"][0]["frames"], expected_frames);
        assert_eq!(
            document["assets"][0]["pcmF32Base64"],
            original["assets"][0]["pcmF32Base64"]
        );
        unsafe {
            (*plugin).stop_processing.unwrap()(plugin);
            (*plugin).deactivate.unwrap()(plugin);
            (*plugin).destroy.unwrap()(plugin);
        }
    }

    #[test]
    fn browser_two_source_capture_reopens_and_plays_in_clap() {
        browser_capture_reopens_and_plays_in_clap(
            include_bytes!("../../../artifacts/fixtures/two-source-browser-capture.json"),
            "bars",
            9_600,
        );
    }

    #[test]
    fn standalone_sample_browser_take_reopens_and_plays_in_clap() {
        browser_capture_reopens_and_plays_in_clap(
            include_bytes!("../../../web/public/standalone-sample-browser-project.json"),
            "seconds",
            24_000,
        );
    }

    #[test]
    fn clap_host_automation_survives_script_composition_and_stop_during_preparation() {
        for stop_before_publication in [false, true] {
            let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
            assert!(instance.restore_package(include_bytes!(
                "../../../web/public/packages/fx-slot-swap.manifold.json"
            )));
            assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
            let descriptor = instance.descriptors.lock().unwrap()[&0].unwrap();
            let event = clap_event_param_value {
                header: clap_event_header {
                    size: std::mem::size_of::<clap_event_param_value>() as u32,
                    time: 0,
                    space_id: CLAP_CORE_EVENT_SPACE_ID,
                    type_: CLAP_EVENT_PARAM_VALUE,
                    flags: 0,
                },
                param_id: HOST_SLOT_BASE,
                cookie: null_mut(),
                note_id: -1,
                port_index: -1,
                channel: -1,
                key: -1,
                value: descriptor.to_normalized(0.375).unwrap().into(),
            };
            let pointers = vec![&event.header as *const _];
            let events = clap_input_events {
                ctx: &pointers as *const _ as *mut c_void,
                size: Some(event_count),
                get: Some(event_get),
            };
            unsafe {
                flush(&instance.plugin, &events, null());
            }
            let generation = instance
                .scripted_set_path("/test/fxslot/slotA/select", 1.)
                .unwrap();
            let old = unsafe { &mut *instance.current.load(Ordering::Acquire) };
            assert!(old.prepared.processor.set_parameter(4_u32.into(), 0, 0.625));
            instance.snapshot(old);
            if stop_before_publication {
                instance.deactivate();
            } else {
                unsafe {
                    flush(&instance.plugin, null(), null());
                }
            }
            assert_eq!(instance.scripted_status(generation), 1);
            let saved = instance.host_state_bytes().unwrap();
            let package = ProjectPackage::parse(&saved).unwrap();
            let graph: serde_json::Value = serde_json::from_slice(package.state()).unwrap();
            assert_eq!(graph["signal"]["nodes"].as_array().unwrap().len(), 12);
            assert_eq!(
                graph["signal"]["initialParameters"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|p| p["nodeId"] == 4 && p["id"] == 0)
                    .unwrap()["value"],
                0.625
            );
            let reopened = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
            assert!(reopened.restore_package(&saved));
            let second = reopened
                .scripted_set_path("/test/fxslot/slotB/select", 1.)
                .unwrap();
            assert_eq!(reopened.scripted_status(second), 1);
        }
    }

    #[test]
    fn packaged_js_fx_controller_survives_closed_editor_clap_save_and_reopen() {
        let package = include_bytes!("../../../web/public/packages/fx-slot-swap.manifold.json");
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(unsafe {
            STATE.load.unwrap()(
                &instance.plugin,
                &clap_istream {
                    ctx: &mut Reader {
                        bytes: package,
                        offset: 0,
                    } as *mut _ as *mut c_void,
                    read: Some(read),
                },
            )
        });
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        let mut input_left: [f32; 128] = std::array::from_fn(|i| ((i % 16) as f32 - 8.) / 8.);
        let mut input_right: [f32; 128] =
            std::array::from_fn(|i| (((i * 3) % 16) as f32 - 8.) / 8.);
        let mut input_channels = [input_left.as_mut_ptr(), input_right.as_mut_ptr()];
        let input = clap_audio_buffer {
            data32: input_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut output_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output = clap_audio_buffer {
            data32: output_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let block = clap_process {
            steady_time: 0,
            frames_count: 128,
            transport: null(),
            audio_inputs: &input,
            audio_outputs: &mut output,
            audio_inputs_count: 1,
            audio_outputs_count: 1,
            in_events: null(),
            out_events: null(),
        };
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        let before = left;
        let script_extension =
            unsafe { extension(&instance.plugin, c"manifold.project.script.v1".as_ptr()) }
                as *const ClapProjectScript;
        assert!(!script_extension.is_null());
        let mut generation = 0;
        assert!(unsafe {
            (*script_extension).set_path.unwrap()(
                &instance.plugin,
                c"/test/fxslot/slotA/select".as_ptr(),
                1.0,
                &mut generation,
            )
        });
        assert_eq!(
            unsafe { (*script_extension).status.unwrap()(&instance.plugin, generation) },
            0
        );
        let mut before_save = Vec::new();
        assert!(unsafe {
            STATE.save.unwrap()(
                &instance.plugin,
                &clap_ostream {
                    ctx: &mut before_save as *mut _ as *mut c_void,
                    write: Some(write),
                },
            )
        });
        let before_package = ProjectPackage::parse(&before_save).unwrap();
        let before_state: serde_json::Value =
            serde_json::from_slice(before_package.state()).unwrap();
        assert_eq!(
            before_state["signal"]["nodes"].as_array().unwrap().len(),
            10
        );
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert_eq!(
            unsafe { (*script_extension).status.unwrap()(&instance.plugin, generation) },
            1
        );
        assert!(left.iter().zip(before).any(|(a, b)| (a - b).abs() > 0.03));
        let mut after_save = Vec::new();
        assert!(unsafe {
            STATE.save.unwrap()(
                &instance.plugin,
                &clap_ostream {
                    ctx: &mut after_save as *mut _ as *mut c_void,
                    write: Some(write),
                },
            )
        });
        let after_package = ProjectPackage::parse(&after_save).unwrap();
        let after_state: serde_json::Value = serde_json::from_slice(after_package.state()).unwrap();
        assert_eq!(after_state["signal"]["nodes"].as_array().unwrap().len(), 12);
        assert_eq!(after_state["controls"].as_array().unwrap()[1]["value"], 1);
        let reopened = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(unsafe {
            STATE.load.unwrap()(
                &reopened.plugin,
                &clap_istream {
                    ctx: &mut Reader {
                        bytes: &after_save,
                        offset: 0,
                    } as *mut _ as *mut c_void,
                    read: Some(read),
                },
            )
        });
        assert!(unsafe { activate(&reopened.plugin, 48_000., 1, 128) });
        let extension =
            unsafe { extension(&reopened.plugin, c"manifold.project.script.v1".as_ptr()) }
                as *const ClapProjectScript;
        let mut second_generation = 0;
        assert!(unsafe {
            (*extension).set_path.unwrap()(
                &reopened.plugin,
                c"/test/fxslot/slotB/select".as_ptr(),
                1.0,
                &mut second_generation,
            )
        });
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&reopened.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert_eq!(
            unsafe { (*extension).status.unwrap()(&reopened.plugin, second_generation) },
            1
        );
        let saved = ProjectPackage::parse(&reopened.host_state_bytes().unwrap()).unwrap();
        let state: serde_json::Value = serde_json::from_slice(saved.state()).unwrap();
        assert_eq!(state["signal"]["nodes"].as_array().unwrap().len(), 14);
    }

    #[test]
    fn packaged_js_parameter_and_route_publish_in_clap_and_survive_host_reopen() {
        let package =
            include_bytes!("../../../web/public/packages/dsp-live-scripting.manifold.json");
        let instance = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(unsafe {
            STATE.load.unwrap()(
                &instance.plugin,
                &clap_istream {
                    ctx: &mut Reader {
                        bytes: package,
                        offset: 0,
                    } as *mut _ as *mut c_void,
                    read: Some(read),
                },
            )
        });
        assert!(unsafe { activate(&instance.plugin, 48_000., 1, 128) });
        let mut input_left: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.17).sin() * 0.25);
        let mut input_right: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.11).sin() * -0.25);
        let mut input_channels = [input_left.as_mut_ptr(), input_right.as_mut_ptr()];
        let input = clap_audio_buffer {
            data32: input_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut output_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output = clap_audio_buffer {
            data32: output_channels.as_mut_ptr(),
            data64: null_mut(),
            channel_count: 2,
            latency: 0,
            constant_mask: 0,
        };
        let block = clap_process {
            steady_time: 0,
            frames_count: 128,
            transport: null(),
            audio_inputs: &input,
            audio_outputs: &mut output,
            audio_inputs_count: 1,
            audio_outputs_count: 1,
            in_events: null(),
            out_events: null(),
        };
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        let before = left;
        let extension =
            unsafe { extension(&instance.plugin, c"manifold.project.script.v1".as_ptr()) }
                as *const ClapProjectScript;
        assert!(!extension.is_null());
        let mut gain_generation = 0;
        assert!(unsafe {
            (*extension).set_path.unwrap()(
                &instance.plugin,
                c"/dsp/live/input_gain".as_ptr(),
                0.4,
                &mut gain_generation,
            )
        });
        assert_eq!(
            unsafe { (*extension).status.unwrap()(&instance.plugin, gain_generation) },
            0
        );
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert_eq!(
            unsafe { (*extension).status.unwrap()(&instance.plugin, gain_generation) },
            1
        );
        assert!(left.iter().zip(before).any(|(a, b)| (a - b).abs() > 0.001));
        let gain_output = left;
        let args = br#"["/dsp/live/nodes/input_trim"]"#;
        let mut generation = 0;
        assert!(unsafe {
            (*extension).call_json.unwrap()(
                &instance.plugin,
                c"routeOutput".as_ptr(),
                args.as_ptr(),
                args.len(),
                &mut generation,
            )
        });
        assert_eq!(
            unsafe { (*extension).status.unwrap()(&instance.plugin, generation) },
            0
        );
        for _ in 0..12 {
            assert_eq!(
                unsafe { process(&instance.plugin, &block) },
                CLAP_PROCESS_CONTINUE
            );
        }
        assert_eq!(
            unsafe { (*extension).status.unwrap()(&instance.plugin, generation) },
            1
        );
        assert!(
            left.iter()
                .zip(gain_output)
                .any(|(a, b)| (a - b).abs() > 0.001)
        );
        let mut saved = Vec::new();
        assert!(unsafe {
            STATE.save.unwrap()(
                &instance.plugin,
                &clap_ostream {
                    ctx: &mut saved as *mut _ as *mut c_void,
                    write: Some(write),
                },
            )
        });
        let package = ProjectPackage::parse(&saved).unwrap();
        let state: serde_json::Value = serde_json::from_slice(package.state()).unwrap();
        assert!(
            state["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|edge| edge["from"] == 4 && edge["to"] == 3)
        );
        let gain = state["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["nodeId"] == 4 && entry["id"] == 0)
            .unwrap()["value"]
            .as_f64()
            .unwrap();
        assert!((gain - 0.4).abs() < 1e-6, "saved gain {gain}");
        let reopened = Instance::new(null(), &crate::GRAPH_DESCRIPTOR);
        assert!(unsafe {
            STATE.load.unwrap()(
                &reopened.plugin,
                &clap_istream {
                    ctx: &mut Reader {
                        bytes: &saved,
                        offset: 0,
                    } as *mut _ as *mut c_void,
                    read: Some(read),
                },
            )
        });
        assert!(unsafe { activate(&reopened.plugin, 48_000., 1, 128) });
        let reopened_state = ProjectPackage::parse(&reopened.host_state_bytes().unwrap()).unwrap();
        let document: serde_json::Value = serde_json::from_slice(reopened_state.state()).unwrap();
        assert!(
            document["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|edge| edge["from"] == 4 && edge["to"] == 3)
        );
    }
}
