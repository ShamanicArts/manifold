//! VST3 component for portable browser-authored graph bundles.
//! Preparation, JSON and asset decoding stay off the audio callback.

use manifold_native::visual_analysis::{OutputSpectrum, SpectrumMailbox};
use std::ffi::CStr;
use std::collections::BTreeMap;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicPtr, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crossbeam_queue::ArrayQueue;
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::capture_mailbox::{AudioCaptureWorker, CaptureMailbox, CapturedWindow};
use manifold_native::host_buffers::{HostBuffers, IoHostBuffers, RawHostBlock};
use manifold_native::host_transport::{CaptureWindow, HostBarClock};
use manifold_native::host_values::ValueBank;
use manifold_native::live_events::{EventCommand, EventMailbox};
use manifold_native::live_parameters::ParameterMailbox;
use manifold_native::live_routes::{RouteCommand, RouteMailbox};
use manifold_native::loop_state_mailbox::{LoopStateCache, LoopStateMailbox, LoopStateWorker};
use manifold_native::parameters::{
    HOST_SLOT_BASE, HostSlots, TimedAutomation,
};
use manifold_native::project::{NativeProject, PreparedNativeProject, StagedRoute};
use manifold_project_js::{
    HostCommandKind,
    package::ProjectPackage,
    worker::{ProjectScriptWorker, WorkerResult},
};
use vst3::{Class, ComPtr, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::graph_contract::{DEFAULT_PROJECT, normalized_values, slot_descriptors};
use crate::graph_controller::GraphController;
use crate::util::{copy_wstring, read_project_stream, write_stream};

#[path = "graph_io.rs"]
mod io_ports;

const MAX_MESSAGES: usize = 1024;

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
    io_channels: Arc<io_ports::ChannelLayout>,
    max_frames: usize,
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
    package: Option<Arc<ProjectPackage>>,
}

struct Publication {
    committed: StateSnapshot,
    staged: Vec<(u64, StateSnapshot)>,
    route_generation: Option<u64>,
    parameter_generation: Option<u64>,
}

impl Publication {
    fn acknowledge(&mut self, generation: u64) {
        if let Some(index) = self.staged.iter().position(|(id, _)| *id == generation) {
            let (_, snapshot) = self.staged.remove(index);
            self.committed = snapshot;
            self.staged.retain(|(id, _)| *id > generation);
            if self.route_generation == Some(generation) {
                self.route_generation = None;
            }
            if self.parameter_generation == Some(generation) {
                self.parameter_generation = None;
            }
        }
    }
}

struct InstalledScript {
    worker: ProjectScriptWorker,
    parameter_baseline: Vec<u8>,
    ready_generation: u64,
    in_flight: Option<(u64, u64, ScriptEditKind)>,
    last_completed: Option<(u64, bool)>,
    call_generation: Option<u64>,
}

enum PackageUpdate {
    Preserve,
    Replace(Option<Arc<ProjectPackage>>),
}

#[derive(Clone, Copy)]
enum ScriptEditKind {
    Graph,
    Route,
    Parameter,
    Event,
}

pub(crate) struct GraphProcessor {
    current: AtomicPtr<Runtime>,
    pending: AtomicPtr<Runtime>,
    published_generation: AtomicU64,
    next_generation: AtomicU64,
    publication: Mutex<Publication>,
    live_routes: RouteMailbox,
    live_parameters: ParameterMailbox,
    live_events: EventMailbox,
    control: Mutex<()>,
    script: Mutex<Option<InstalledScript>>,
    retired: ArrayQueue<usize>,
    active: AtomicBool,
    awaiting_io_restart: AtomicBool,
    processing: AtomicBool,
    bar_clock: HostBarClock,
    output_spectrum: SpectrumMailbox,
    output_rms: AtomicU32,
    configuration: Mutex<Option<(f32, usize)>>,
    state: Mutex<Arc<Vec<u8>>>,
    descriptors: Mutex<HostSlots>,
    values: Mutex<Arc<ValueBank>>,
    capture_result: Mutex<Option<CapturedWindow>>,
    capture_window: Mutex<Option<CaptureWindow>>,
    ports: Mutex<io_ports::Ports>,
    sidechain_active: AtomicBool,
    sidechain_arrangement: AtomicU64,
    peer: Mutex<Option<ComPtr<IConnectionPoint>>>,
}

// VST3 serializes process calls for one component; only that callback mutates
// the current runtime while active. Control-thread replacement is atomic.
unsafe impl Sync for GraphProcessor {}

impl GraphProcessor {
    pub const CID: TUID = uid(crate::product::PROCESSOR[0], crate::product::PROCESSOR[1], crate::product::PROCESSOR[2], crate::product::PROCESSOR[3]);

    pub fn new() -> Self {
        let project = NativeProject::parse(DEFAULT_PROJECT).expect("authored default graph");
        let descriptors = slot_descriptors(&project);
        let values = normalized_values(&descriptors);
        let bank = Arc::new(ValueBank::from_slots(values.into_iter().map(|(slot, value)| (slot, value as f32))));
        let state = Arc::new(DEFAULT_PROJECT.to_vec());
        let instance = Self {
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
                    package: None,
                },
                staged: Vec::new(),
                route_generation: None,
                parameter_generation: None,
            }),
            live_routes: RouteMailbox::new(),
            live_parameters: ParameterMailbox::new(),
            live_events: EventMailbox::new(),
            control: Mutex::new(()),
            script: Mutex::new(None),
            retired: ArrayQueue::new(64),
            active: AtomicBool::new(false),
            awaiting_io_restart: AtomicBool::new(false),
            processing: AtomicBool::new(false),
            bar_clock: HostBarClock::new(),
            output_spectrum: SpectrumMailbox::new(),
            output_rms: AtomicU32::new(0),
            configuration: Mutex::new(None),
            state: Mutex::new(state),
            descriptors: Mutex::new(descriptors),
            values: Mutex::new(bank),
            capture_result: Mutex::new(None),
            capture_window: Mutex::new(None),
            ports: Mutex::new(io_ports::Ports::new(None, None).unwrap()),
            sidechain_active: AtomicBool::new(false),
            sidechain_arrangement: AtomicU64::new(SpeakerArr::kStereo),
            peer: Mutex::new(None),
        };
        if crate::product::EXPORTED { assert_eq!(instance.restore_bytes(crate::product::DEFAULT_PACKAGE.to_vec()), kResultOk, "exported project load"); }
        instance
    }

    fn prepared(
        bytes: &[u8],
        rate: f32,
        frames: usize,
        values: Arc<ValueBank>,
        ports: &io_ports::Ports,
    ) -> Option<Box<Runtime>> {
        let project = NativeProject::parse(bytes).ok()?;
        if !crate::graph_contract::host_ids_fit(&project) { return None; }
        let io_buffers = project
            .io_layout()
            .map(|layout| IoHostBuffers::prepare(layout, frames))
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
            project.prepare_patchable_with_state(rate, frames)
        } else {
            project.prepare_with_state(rate, frames)
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
            buffers: HostBuffers::prepare(frames),
            io_buffers,
            io_channels: Arc::clone(&ports.channels),
            max_frames: frames,
            automation: Vec::with_capacity(MAX_MESSAGES),
            events: Vec::with_capacity(MAX_MESSAGES),
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

    fn request_capture_seconds(&self, node: u32, seconds: f64) -> bool {
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

    fn request_capture_bars(&self, node: u32, bars: f64) -> bool {
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

    fn request_capture_free_arm(&self, node: u32) -> bool {
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

    fn request_capture_free_stop(&self, node: u32) -> bool {
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

    /// Poll from a control thread, encode portable state, then queue a prepared
    /// replacement. `None` means the callback has not finished staging yet.
    fn finish_capture(&self, instrument: u32, label: &str) -> Option<bool> {
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
        let state = self.capture_state()?;
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
        Some(self.restore_graph_locked(bytes, true, PackageUpdate::Preserve, None, false) == kResultOk)
    }

    fn capture_state(&self) -> Option<Vec<u8>> {
        self.recover_rejected_route();
        self.recover_rejected_parameter();
        let state = self.state.lock().ok()?;
        let descriptors = self.descriptors.lock().ok()?;
        let bank = self.values.lock().ok()?;
        Self::encode_state(state.as_slice(), &descriptors, &bank, None)
    }

    /// Host saves observe the last runtime published by the audio callback.
    fn capture_published_state(&self) -> Option<Vec<u8>> {
        self.capture_published_snapshot().map(|(bytes, _)| bytes)
    }

    fn capture_published_snapshot(&self) -> Option<(Vec<u8>, Option<Arc<ProjectPackage>>)> {
        self.recover_rejected_route();
        self.recover_rejected_parameter();
        let mut publication = self.publication.lock().ok()?;
        let generation = self.published_generation.load(Ordering::Acquire);
        publication.acknowledge(generation);
        let snapshot = &mut publication.committed;
        if let Some(cache) = snapshot.loop_cache.as_mut() {
            let refreshed = cache.refresh(snapshot.bytes.as_slice())?;
            snapshot.bytes = Arc::new(refreshed);
        }
        let bytes = Self::encode_state(
            snapshot.bytes.as_slice(),
            &snapshot.descriptors,
            &snapshot.values,
            snapshot.loop_cache.as_ref(),
        )?;
        Some((bytes, snapshot.package.clone()))
    }

    fn recover_rejected_route(&self) {
        let rejected = self.live_routes.rejected();
        if rejected == 0 {
            return;
        }
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        let Ok(mut publication) = self.publication.lock() else {
            return;
        };
        if publication.route_generation == Some(rejected) {
            publication.staged.retain(|(id, _)| *id != rejected);
            publication.route_generation = None;
            *state = Arc::clone(&publication.committed.bytes);
        }
    }

    fn recover_rejected_parameter(&self) {
        let rejected = self.live_parameters.rejected();
        if rejected == 0 {
            return;
        }
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        let Ok(mut publication) = self.publication.lock() else {
            return;
        };
        if publication.parameter_generation == Some(rejected) {
            publication.staged.retain(|(id, _)| *id != rejected);
            publication.parameter_generation = None;
            *state = Arc::clone(&publication.committed.bytes);
        }
    }

    fn request_live_route(&self, to: u32, input: &str, from: Option<(u32, &str)>) -> Option<u64> {
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
        let _control = self.control.lock().ok()?;
        if !self.active.load(Ordering::Acquire) || !self.pending.load(Ordering::Acquire).is_null() {
            return None;
        }
        let (rate, frames) = self.configuration.lock().ok()?.as_ref().copied()?;
        let current = self.capture_published_state()?;
        let staged = stage(&current, rate, frames).ok()?;
        let mut state = self.state.lock().ok()?;
        let descriptors = self.descriptors.lock().ok()?.clone();
        let bank = Arc::clone(&*self.values.lock().ok()?);
        let mut publication = self.publication.lock().ok()?;
        publication.acknowledge(self.published_generation.load(Ordering::Acquire));
        if publication.route_generation.is_some()
            || publication.parameter_generation.is_some()
            || !publication.staged.is_empty()
            || !self.pending.load(Ordering::Acquire).is_null()
        {
            return None;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        let bytes = Arc::new(staged.document);
        let snapshot = StateSnapshot {
            bytes: Arc::clone(&bytes),
            descriptors: descriptors.clone(),
            values: bank,
            loop_cache: publication.committed.loop_cache.clone(),
            capture_mailbox: publication.committed.capture_mailbox.clone(),
            package: publication.committed.package.clone(),
        };
        let command = RouteCommand {
            generation,
            to: staged.to,
            input_port: staged.input_port,
            source: staged.source,
        };
        publication.staged.push((generation, snapshot));
        publication.route_generation = Some(generation);
        if self.live_routes.submit(command).is_err() {
            publication.staged.pop();
            publication.route_generation = None;
            return None;
        }
        *state = bytes;
        Some(generation)
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
        let current = self.capture_published_state()?;
        let document = NativeProject::stage_live_parameter_batch(&current, edits).ok()?;
        let mut state = self.state.lock().ok()?;
        let descriptors = self.descriptors.lock().ok()?.clone();
        let bank = Arc::clone(&*self.values.lock().ok()?);
        let mut publication = self.publication.lock().ok()?;
        publication.acknowledge(self.published_generation.load(Ordering::Acquire));
        if publication.route_generation.is_some()
            || publication.parameter_generation.is_some()
            || !publication.staged.is_empty()
            || !self.pending.load(Ordering::Acquire).is_null()
        {
            return None;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        let bytes = Arc::new(document);
        let snapshot = StateSnapshot {
            bytes: Arc::clone(&bytes),
            descriptors: descriptors.clone(),
            values: bank,
            loop_cache: publication.committed.loop_cache.clone(),
            capture_mailbox: publication.committed.capture_mailbox.clone(),
            package: publication.committed.package.clone(),
        };
        publication.staged.push((generation, snapshot));
        publication.parameter_generation = Some(generation);
        if !self.live_parameters.submit_batch(generation, edits) {
            publication.staged.pop();
            publication.parameter_generation = None;
            return None;
        }
        *state = bytes;
        Some(generation)
    }

    fn live_route_status(&self, generation: u64) -> Option<bool> {
        if !self.active.load(Ordering::Acquire) {
            return Some(self.published_generation.load(Ordering::Acquire) >= generation);
        }
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
        let published = self.capture_published_state()?;
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
                if self.restore_graph_with_parameter_baseline(
                    document,
                    false,
                    PackageUpdate::Preserve,
                    Some(&script.parameter_baseline),
                    false,
                ) != kResultOk
                {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("VST3 graph publication rejected");
                }
                (
                    self.next_generation.load(Ordering::Acquire) - 1,
                    ScriptEditKind::Graph,
                )
            }
            HostCommandKind::Metadata { document } => {
                let merged = self.capture_published_state().and_then(|published|
                    manifold_project_js::publication::merge_published_metadata(&published, &document).ok());
                let Some(merged) = merged else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("VST3 metadata edit changed the sounding graph");
                };
                let Ok(_control) = self.control.lock() else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("VST3 control unavailable");
                };
                let (Ok(mut state), Ok(mut publication)) = (self.state.lock(), self.publication.lock()) else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("VST3 metadata state unavailable");
                };
                if !publication.staged.is_empty() {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("VST3 metadata edit overlaps a pending graph");
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
                    return Err("VST3 live route rejected");
                };
                (generation, ScriptEditKind::Route)
            }
            HostCommandKind::Parameter { node, id, value } => {
                let Some(generation) = self.request_live_parameter(node, id, value) else {
                    let _ = script.worker.acknowledge(command.id, false);
                    return Err("VST3 live parameter rejected");
                };
                (generation, ScriptEditKind::Parameter)
            }
        };
        script.in_flight = Some((command.id, generation, kind));
        Ok(generation)
    }

    fn scripted_call(
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
            .capture_published_state()
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

    fn scripted_finish(&self) -> Option<bool> {
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

    fn creator_presentation(&self) -> Option<serde_json::Value> {
        self.scripted_finish();
        let installed = self.script.lock().ok()?;
        let script = installed.as_ref()?;
        if script.in_flight.is_some() || self.published_generation.load(Ordering::Acquire) < script.ready_generation { return None; }
        let published = self.capture_published_state()?;
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

    fn scripted_status(&self, generation: u64) -> u8 {
        self.scripted_finish();
        // Polling is a control-thread service; reclaim replaced runtimes here
        // even when the caller keeps authoring parameters or notes afterward.
        self.retire_old();
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
        let (graph, package) = self.capture_published_snapshot()?;
        match package {
            Some(package) => package.save_with_state(&graph).ok(),
            None => Some(graph),
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
                entries.push(serde_json::json!({
                    "nodeId": descriptor.node, "id": descriptor.local_id, "value": physical
                }));
            }
        }
        serde_json::to_vec(&document).ok()
    }

    fn publish_snapshot(&self, runtime: &Runtime) {
        let parameters = runtime.prepared.processor.host_parameters();
        let physical = runtime.prepared.processor.current_parameter_values();
        let values = runtime.slot_indices.iter().map(|(&slot, index)| (slot, index
                .and_then(|index| parameters[index].to_normalized(physical[index]))
                .unwrap_or_else(|| runtime.values.read_slot(slot))));
        runtime.values.write_slots(values);
    }

    fn retire_old(&self) {
        while let Some(pointer) = self.retired.pop() {
            unsafe { drop(Box::from_raw(pointer as *mut Runtime)) };
        }
    }

    fn deactivate(&self) {
        self.awaiting_io_restart.store(false, Ordering::Release);
        let Ok(_control) = self.control.lock() else {
            return;
        };
        self.recover_rejected_route();
        self.recover_rejected_parameter();
        self.active.store(false, Ordering::Release);
        self.processing.store(false, Ordering::Release);
        self.live_routes.cancel_pending();
        self.live_parameters.cancel_pending();
        self.live_events.cancel_pending();
        self.bar_clock.clear();
        // VST3 has ceased processing this runtime. Transfer its stopped loop
        // PCM into the project document before the runtime is retired.
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
            self.publish_snapshot(unsafe { &*pending });
        }
        let loop_state = if !current.is_null() && self.pending.load(Ordering::Acquire).is_null() {
            let prepared = unsafe { &mut (*current).prepared };
            let saved = if prepared.has_prepared_loops() && prepared.finish_recording_loops_for_host_stop() {
                prepared.save_state().ok()
            } else { None };
            // Finishing a recording resets its record control; publish that state too.
            self.publish_snapshot(unsafe { &*current });
            saved
        } else {
            None
        };
        if let Ok(mut window) = self.capture_window.lock() {
            *window = None;
        }
        if let Ok(mut result) = self.capture_result.lock() {
            *result = None;
        }
        for pointer in [&self.current, &self.pending] {
            let old = pointer.swap(null_mut(), Ordering::AcqRel);
            if !old.is_null() {
                unsafe { drop(Box::from_raw(old)) };
            }
        }
        self.retire_old();
        // Once audio is inactive, the accepted target becomes the state that
        // the next activation will prepare, even if its swap was never heard.
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
                let live_edit = publication.route_generation == Some(generation)
                    || publication.parameter_generation == Some(generation);
                let merge = if live_edit {
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
                    if publication.parameter_generation == Some(generation)
                        && self.live_parameters.accepted() != generation
                    {
                        // A stop can commit a queued parameter before audio
                        // applies it. The saved host bank must use that target.
                        if let Ok(project) = NativeProject::parse(snapshot.bytes.as_slice()) {
                            snapshot.values.write_slots(
                                normalized_values(&slot_descriptors(&project))
                                    .into_iter().map(|(slot, value)| (slot, value as f32)),
                            );
                        }
                    }
                    staged_state = Some(Arc::clone(&snapshot.bytes));
                    publication.committed = snapshot;
                    self.published_generation
                        .store(generation, Ordering::Release);
                } else if let Some(live) = loop_state.as_ref() {
                    // A route with a changed node table cannot inherit this
                    // take. Preserve the previously published graph and PCM.
                    let bytes = Arc::new(live.clone());
                    staged_state = Some(Arc::clone(&bytes));
                    publication.committed.bytes = bytes;
                }
                publication.staged.clear();
                publication.route_generation = None;
                publication.parameter_generation = None;
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
    }

    fn publish_pending(&self) {
        if self.retired.is_full() {
            return;
        }
        let pending = self.pending.swap(null_mut(), Ordering::AcqRel);
        if !pending.is_null() {
            let current = self.current.load(Ordering::Acquire);
            if !current.is_null()
                && !unsafe {
                    (*pending)
                        .prepared
                        .live_history_ready_from(&(*current).prepared)
                    && (*current).capture_worker.as_ref().is_none_or(|worker| worker.try_retire())
                }
            {
                // The audio owner claimed this candidate. Put it back only if
                // control has not installed a newer one; otherwise retire it.
                if self
                    .pending
                    .compare_exchange(null_mut(), pending, Ordering::AcqRel, Ordering::Acquire)
                    .is_err()
                {
                    let pushed = self.retired.push(pending as usize);
                    debug_assert!(pushed.is_ok());
                }
                return;
            }
            let old = self.current.swap(pending, Ordering::AcqRel);
            if !old.is_null() {
                unsafe {
                    (*pending).prepared.adopt_live_replacement_from(
                        &mut (*old).prepared,
                        (*pending).preserve_capture_history,
                    )
                };
            }
            self.publish_snapshot(unsafe { &*pending });
            self.published_generation
                .store(unsafe { (*pending).generation }, Ordering::Release);
            if !old.is_null() {
                let pushed = self.retired.push(old as usize);
                debug_assert!(pushed.is_ok());
            }
        }
    }

    fn restore_bytes(&self, bytes: Vec<u8>) -> tresult {
        self.restore_bytes_admission(bytes, false)
    }

    fn restore_bytes_admission(&self, bytes: Vec<u8>, allow_bus_restart: bool) -> tresult {
        let packaged = serde_json::from_slice::<serde_json::Value>(&bytes)
            .ok()
            .is_some_and(|document| document["format"] == "manifold.package");
        if packaged {
            let Ok(package) = ProjectPackage::parse(&bytes) else {
                return kResultFalse;
            };
            let Ok(worker) =
                ProjectScriptWorker::start(package.bundle.clone(), package.state().to_vec())
            else {
                return kResultFalse;
            };
            let Ok(mut script) = self.script.lock() else {
                return kResultFalse;
            };
            let state = package.state().to_vec();
            let result = self.restore_graph_with_parameter_baseline(
                state,
                false,
                PackageUpdate::Replace(Some(Arc::new(package))),
                None,
                allow_bus_restart,
            );
            if result == kResultOk {
                let generation = self.next_generation.load(Ordering::Acquire) - 1;
                *script = Some(InstalledScript {
                    worker,
                    parameter_baseline: Vec::new(),
                    ready_generation: generation,
                    in_flight: None,
                    last_completed: None,
                    call_generation: None,
                });
            }
            result
        } else {
            let Ok(mut script) = self.script.lock() else {
                return kResultFalse;
            };
            let result = self.restore_graph_with_parameter_baseline(
                bytes,
                false,
                PackageUpdate::Replace(None),
                None,
                allow_bus_restart,
            );
            if result == kResultOk {
                *script = None;
            }
            result
        }
    }

    fn restore_graph_with_parameter_baseline(
        &self,
        bytes: Vec<u8>,
        preserve_capture_history: bool,
        package_update: PackageUpdate,
        parameter_baseline: Option<&[u8]>,
        allow_bus_restart: bool,
    ) -> tresult {
        let Ok(_control) = self.control.lock() else {
            return kResultFalse;
        };
        self.restore_graph_locked(bytes, preserve_capture_history, package_update,
            parameter_baseline, allow_bus_restart)
    }

    /// Caller owns control across reading the project and preparing its edit.
    fn restore_graph_locked(
        &self,
        bytes: Vec<u8>,
        preserve_capture_history: bool,
        package_update: PackageUpdate,
        parameter_baseline: Option<&[u8]>,
        allow_bus_restart: bool,
    ) -> tresult {
        self.recover_rejected_route();
        self.recover_rejected_parameter();
        let Ok(project) = NativeProject::parse(&bytes) else {
            return kResultFalse;
        };
        if !crate::graph_contract::host_ids_fit(&project) { return kResultFalse; }
        let Ok(mut ports) = self.ports.lock() else {
            return kResultFalse;
        };
        let same_shape = ports.same_shape(project.io_layout());
        let restart = self.active.load(Ordering::Acquire)
            && (!same_shape || self.awaiting_io_restart.load(Ordering::Acquire));
        if restart && !allow_bus_restart {
            return kResultFalse;
        }
        let Some(next_ports) = io_ports::Ports::new(project.io_layout().cloned(), Some(&ports))
        else {
            return kResultFalse;
        };
        let descriptors = slot_descriptors(&project);
        let values = normalized_values(&descriptors);
        let bank = Arc::new(ValueBank::from_slots(values.into_iter().map(|(slot, value)| (slot, value as f32))));
        if restart {
            let Some((rate, frames)) = self.configuration.lock().ok().and_then(|c| *c) else {
                return kResultFalse;
            };
            if Self::prepared(&bytes, rate, frames, Arc::clone(&bank), &next_ports).is_none() {
                return kResultFalse;
            }
        }
        self.retire_old();
        let replacement = if self.active.load(Ordering::Acquire) && !restart {
            let Some((rate, frames)) = self.configuration.lock().ok().and_then(|guard| *guard)
            else {
                return kResultFalse;
            };
            let Some(mut runtime) = Self::prepared(&bytes, rate, frames, Arc::clone(&bank), &next_ports) else {
                return kResultFalse;
            };
            if let Some(baseline) = parameter_baseline {
                if runtime
                    .prepared
                    .plan_parameter_inheritance(baseline)
                    .is_err()
                {
                    return kResultFalse;
                }
            }
            runtime.preserve_capture_history = preserve_capture_history;
            let Ok(capture) = Self::attach_capture_worker(&mut runtime, &bytes) else { return kResultFalse; };
            Some((runtime, capture))
        } else {
            None
        };
        let Ok(mut state) = self.state.lock() else {
            return kResultFalse;
        };
        let Ok(mut bound) = self.descriptors.lock() else {
            return kResultFalse;
        };
        let Ok(mut current_bank) = self.values.lock() else {
            return kResultFalse;
        };
        let Ok(mut publication) = self.publication.lock() else {
            return kResultFalse;
        };
        publication.acknowledge(self.published_generation.load(Ordering::Acquire));
        if publication.route_generation.is_some() || publication.parameter_generation.is_some() {
            return kResultFalse;
        }
        let generation = self.next_generation.fetch_add(1, Ordering::Relaxed);
        let state_bytes = Arc::new(bytes);
        let snapshot = StateSnapshot {
            bytes: Arc::clone(&state_bytes),
            descriptors: descriptors.clone(),
            values: Arc::clone(&bank),
            capture_mailbox: replacement.as_ref().and_then(|(_, capture)| capture.clone()),
            loop_cache: replacement.as_ref().and_then(|(runtime, _)| {
                runtime.loop_mailbox.as_ref().map(|mailbox| mailbox.cache())
            }),
            package: match package_update {
                PackageUpdate::Preserve => publication.committed.package.clone(),
                PackageUpdate::Replace(package) => package,
            },
        };
        if restart {
            self.awaiting_io_restart.store(true, Ordering::Release);
            let old_pending = self.pending.swap(null_mut(), Ordering::AcqRel);
            if !old_pending.is_null() {
                unsafe { drop(Box::from_raw(old_pending)) };
            }
        }
        io_ports::trace(format_args!(
            "restore graph declared={} ready={} sameShape={same_shape}",
            next_ports.layout.is_some(),
            next_ports.ready()
        ));
        *ports = next_ports;
        *state = state_bytes;
        *bound = descriptors;
        *current_bank = bank;
        if let Some((runtime, _)) = replacement {
            let mut runtime = runtime;
            runtime.generation = generation;
            publication.staged.push((generation, snapshot));
            let previous = self.pending.swap(Box::into_raw(runtime), Ordering::AcqRel);
            if !previous.is_null() {
                // The callback can only acquire a pending runtime via its own
                // atomic swap. If this swap returned it, it was never used.
                publication
                    .staged
                    .retain(|(id, _)| *id != unsafe { (*previous).generation });
                unsafe { drop(Box::from_raw(previous)) };
            }
        } else if restart {
            // The host owns stopping/restarting processing for kIoChanged.
            // Do not publish this graph into buffers prepared for the old shape.
            publication.staged.clear();
            publication.staged.push((generation, snapshot));
            self.awaiting_io_restart.store(true, Ordering::Release);
        } else {
            publication.committed = snapshot;
            publication.staged.clear();
            self.published_generation
                .store(generation, Ordering::Release);
        }
        kResultOk
    }
}

impl Drop for GraphProcessor {
    fn drop(&mut self) {
        self.deactivate();
    }
}

impl Class for GraphProcessor {
    type Interfaces = (
        IComponent,
        IAudioProcessor,
        IProcessContextRequirements,
        IConnectionPoint,
    );
}

impl IPluginBaseTrait for GraphProcessor {
    unsafe fn initialize(&self, _context: *mut FUnknown) -> tresult {
        kResultOk
    }
    unsafe fn terminate(&self) -> tresult {
        if let Ok(mut peer) = self.peer.lock() {
            *peer = None;
        }
        self.deactivate();
        kResultOk
    }
}

impl IComponentTrait for GraphProcessor {
    unsafe fn getControllerClassId(&self, id: *mut TUID) -> tresult {
        if id.is_null() {
            return kInvalidArgument;
        }
        unsafe { *id = GraphController::CID };
        kResultOk
    }
    unsafe fn setIoMode(&self, _mode: IoMode) -> tresult {
        kResultOk
    }
    unsafe fn getBusCount(&self, media_type: MediaType, direction: BusDirection) -> i32 {
        io_ports::trace(format_args!(
            "getBusCount media={media_type} dir={direction}"
        ));
        if media_type == MediaTypes_::kAudio as MediaType {
            if let Ok(ports) = self.ports.lock() {
                if ports.layout.is_some() {
                    return ports.count(direction).unwrap_or(0) as i32;
                }
            }
            if direction == BusDirections_::kInput as BusDirection {
                2
            } else {
                1
            }
        } else if media_type == MediaTypes_::kEvent as MediaType
            && direction == BusDirections_::kInput as BusDirection
        {
            1
        } else {
            0
        }
    }
    unsafe fn getBusInfo(
        &self,
        media_type: MediaType,
        direction: BusDirection,
        index: i32,
        bus: *mut BusInfo,
    ) -> tresult {
        if bus.is_null() {
            return kInvalidArgument;
        }
        io_ports::trace(format_args!(
            "getBusInfo media={media_type} dir={direction} index={index}"
        ));
        let bus = unsafe { &mut *bus };
        if media_type == MediaTypes_::kAudio as MediaType {
            if let Ok(ports) = self.ports.lock() {
                if ports.layout.is_some() {
                    return ports.info(direction, index, bus);
                }
            }
            if direction == BusDirections_::kInput as BusDirection && (0..=1).contains(&index) {
                bus.mediaType = media_type;
                bus.direction = direction;
                bus.channelCount = if index == 1
                    && self.sidechain_arrangement.load(Ordering::Acquire) == SpeakerArr::kMono
                {
                    1
                } else {
                    2
                };
                copy_wstring(
                    if index == 0 { "Main In" } else { "Sidechain" },
                    &mut bus.name,
                );
                bus.busType = if index == 0 {
                    BusTypes_::kMain
                } else {
                    BusTypes_::kAux
                } as BusType;
                bus.flags = if index == 0 {
                    BusInfo_::BusFlags_::kDefaultActive as u32
                } else {
                    0
                };
                return kResultOk;
            }
            if direction == BusDirections_::kOutput as BusDirection && index == 0 {
                bus.mediaType = media_type;
                bus.direction = direction;
                bus.channelCount = 2;
                copy_wstring("Main Out", &mut bus.name);
                bus.busType = BusTypes_::kMain as BusType;
                bus.flags = BusInfo_::BusFlags_::kDefaultActive as u32;
                return kResultOk;
            }
        } else if media_type == MediaTypes_::kEvent as MediaType
            && direction == BusDirections_::kInput as BusDirection
            && index == 0
        {
            bus.mediaType = media_type;
            bus.direction = direction;
            bus.channelCount = 16;
            copy_wstring("MIDI In", &mut bus.name);
            bus.busType = BusTypes_::kMain as BusType;
            bus.flags = BusInfo_::BusFlags_::kDefaultActive as u32;
            return kResultOk;
        }
        kInvalidArgument
    }
    unsafe fn getRoutingInfo(
        &self,
        _input: *mut RoutingInfo,
        _output: *mut RoutingInfo,
    ) -> tresult {
        kNotImplemented
    }
    unsafe fn activateBus(
        &self,
        media_type: MediaType,
        direction: BusDirection,
        index: i32,
        state: TBool,
    ) -> tresult {
        if media_type == MediaTypes_::kAudio as MediaType {
            let Ok(ports) = self.ports.lock() else {
                return kResultFalse;
            };
            if ports.layout.is_some() {
                let Some(count) = ports.count(direction) else {
                    return kInvalidArgument;
                };
                if index < 0 || index as usize >= count {
                    return kInvalidArgument;
                }
                ports.activate(direction, index as usize, state != 0);
                return kResultOk;
            }
        }
        if media_type == MediaTypes_::kAudio as MediaType
            && direction == BusDirections_::kInput as BusDirection
            && index == 1
        {
            self.sidechain_active.store(state != 0, Ordering::Release);
            return kResultOk;
        }
        if (media_type == MediaTypes_::kAudio as MediaType
            && ((direction == BusDirections_::kInput as BusDirection && index == 0)
                || (direction == BusDirections_::kOutput as BusDirection && index == 0)))
            || (media_type == MediaTypes_::kEvent as MediaType
                && direction == BusDirections_::kInput as BusDirection
                && index == 0)
        {
            kResultOk
        } else {
            kInvalidArgument
        }
    }
    unsafe fn setActive(&self, active: TBool) -> tresult {
        io_ports::trace(format_args!(
            "setActive {active} ready={}",
            self.ports.lock().is_ok_and(|p| p.ready())
        ));
        if active == 0 {
            self.deactivate();
            return kResultOk;
        }
        if self.active.load(Ordering::Acquire) {
            return kResultFalse;
        }
        if !self.ports.lock().is_ok_and(|ports| ports.ready()) {
            return kResultFalse;
        }
        let Some((rate, frames)) = self.configuration.lock().ok().and_then(|guard| *guard) else {
            return kResultFalse;
        };
        let Some(state) = self.capture_state() else {
            return kResultFalse;
        };
        let Some(bank) = self.values.lock().ok().map(|bank| Arc::clone(&bank)) else {
            return kResultFalse;
        };
        let runtime = self.ports.lock().ok().and_then(|ports| Self::prepared(&state, rate, frames, bank, &ports));
        let Some(mut runtime) = runtime else { return kResultFalse; };
        runtime.generation = self.published_generation.load(Ordering::Acquire);
        let Ok(capture) = Self::attach_capture_worker(&mut runtime, &state) else { return kResultFalse; };
        if let Ok(mut publication) = self.publication.lock() {
            publication.acknowledge(runtime.generation);
            publication.committed.capture_mailbox = capture;
            publication.committed.loop_cache =
                runtime.loop_mailbox.as_ref().map(|mailbox| mailbox.cache());
        } else {
            return kResultFalse;
        }
        self.publish_snapshot(&runtime);
        self.current
            .store(Box::into_raw(runtime), Ordering::Release);
        self.active.store(true, Ordering::Release);
        kResultOk
    }
    unsafe fn setState(&self, stream: *mut IBStream) -> tresult {
        io_ports::trace(format_args!(
            "setState active={}",
            self.active.load(Ordering::Acquire)
        ));
        let Some(bytes) = (unsafe { read_project_stream(stream) }) else {
            io_ports::trace(format_args!("setState unreadable stream"));
            return kResultFalse;
        };
        io_ports::trace(format_args!(
            "setState bytes={} prefix={:?}",
            bytes.len(),
            bytes.get(..8)
        ));
        let result = self.restore_bytes_admission(bytes, true);
        io_ports::trace(format_args!("setState result={result}"));
        result
    }
    unsafe fn getState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = self.host_state_bytes() else {
            return kResultFalse;
        };
        if unsafe { write_stream(stream, &bytes) } {
            kResultOk
        } else {
            kResultFalse
        }
    }
}

impl IConnectionPointTrait for GraphProcessor {
    unsafe fn connect(&self, other: *mut IConnectionPoint) -> tresult {
        let Some(other) = (unsafe { ComRef::from_raw(other) }) else {
            return kInvalidArgument;
        };
        let Ok(mut peer) = self.peer.lock() else {
            return kResultFalse;
        };
        *peer = Some(other.to_com_ptr());
        kResultOk
    }
    unsafe fn disconnect(&self, _other: *mut IConnectionPoint) -> tresult {
        let Ok(mut peer) = self.peer.lock() else {
            return kResultFalse;
        };
        *peer = None;
        kResultOk
    }
    unsafe fn notify(&self, message: *mut IMessage) -> tresult {
        let Some(message) = (unsafe { ComRef::from_raw(message) }) else {
            return kInvalidArgument;
        };
        let id = unsafe { message.getMessageID() };
        if id.is_null() {
            return kResultFalse;
        }
        let kind = unsafe { CStr::from_ptr(id) }.to_bytes();
        let Some(attributes) = (unsafe { ComRef::from_raw(message.getAttributes()) }) else {
            return kResultFalse;
        };
        if kind == b"manifold.graph.capture.start.v1" || kind == b"manifold.graph.capture.bars.v1" {
            let mut data: *const std::ffi::c_void = std::ptr::null();
            let mut size = 0;
            if unsafe { attributes.getBinary(c"request".as_ptr(), &mut data, &mut size) }
                != kResultOk
                || data.is_null()
                || size != 12
            {
                return kResultFalse;
            }
            let bytes = unsafe { std::slice::from_raw_parts(data.cast::<u8>(), 12) };
            let node = u32::from_le_bytes(bytes[..4].try_into().unwrap());
            let window = f64::from_le_bytes(bytes[4..12].try_into().unwrap());
            let accepted = if kind == b"manifold.graph.capture.bars.v1" {
                self.request_capture_bars(node, window)
            } else {
                self.request_capture_seconds(node, window)
            };
            return if accepted { kResultOk } else { kResultFalse };
        }
        if kind == b"manifold.graph.capture.free.arm.v1"
            || kind == b"manifold.graph.capture.free.stop.v1"
        {
            let mut data: *const std::ffi::c_void = std::ptr::null();
            let mut size = 0;
            if unsafe { attributes.getBinary(c"node".as_ptr(), &mut data, &mut size) } != kResultOk
                || data.is_null()
                || size != 4
            {
                return kResultFalse;
            }
            let node = u32::from_le_bytes(
                unsafe { std::slice::from_raw_parts(data.cast::<u8>(), 4) }
                    .try_into()
                    .unwrap(),
            );
            let accepted = if kind == b"manifold.graph.capture.free.arm.v1" {
                self.request_capture_free_arm(node)
            } else {
                self.request_capture_free_stop(node)
            };
            return if accepted { kResultOk } else { kResultFalse };
        }
        if kind == b"manifold.graph.capture.finish.v1" {
            let mut data: *const std::ffi::c_void = std::ptr::null();
            let mut size = 0;
            if unsafe { attributes.getBinary(c"instrument".as_ptr(), &mut data, &mut size) }
                != kResultOk
                || data.is_null()
                || size != 4
            {
                return kResultFalse;
            }
            let instrument = u32::from_le_bytes(
                unsafe { std::slice::from_raw_parts(data.cast::<u8>(), 4) }
                    .try_into()
                    .unwrap(),
            );
            let status = match self.finish_capture(instrument, "DAW capture") {
                None => 0_u8,
                Some(false) => 2,
                Some(true) => 1,
            };
            if status == 1 {
                let Some(bytes) = self.capture_state() else {
                    return kResultFalse;
                };
                if unsafe {
                    attributes.setBinary(
                        c"project".as_ptr(),
                        bytes.as_ptr().cast(),
                        bytes.len() as u32,
                    )
                } != kResultOk
                {
                    return kResultFalse;
                }
            }
            return if unsafe {
                attributes.setBinary(c"status".as_ptr(), (&status as *const u8).cast(), 1)
            } == kResultOk
            {
                kResultOk
            } else {
                kResultFalse
            };
        }
        if kind == b"manifold.graph.creator.presentation.v1" {
            let Some(view) = self.creator_presentation() else { return kResultFalse; };
            let Ok(bytes) = serde_json::to_vec(&view) else { return kResultFalse; };
            return unsafe { attributes.setBinary(c"presentation".as_ptr(), bytes.as_ptr().cast(), bytes.len() as u32) };
        }
        if kind == b"manifold.graph.script.call.v1" {
            let mut data: *const std::ffi::c_void = std::ptr::null();
            let mut size = 0;
            if unsafe { attributes.getBinary(c"call".as_ptr(), &mut data, &mut size) } != kResultOk
                || data.is_null()
                || !(1..=1024 * 1024).contains(&size)
            {
                return kResultFalse;
            }
            let bytes = unsafe { std::slice::from_raw_parts(data.cast::<u8>(), size as usize) };
            let Ok(call) = serde_json::from_slice::<serde_json::Value>(bytes) else {
                return kResultFalse;
            };
            let Some(method) = call["method"]
                .as_str()
                .filter(|method| !method.is_empty() && method.len() <= 128)
            else {
                return kResultFalse;
            };
            let Some(args) = call["args"].as_array() else {
                return kResultFalse;
            };
            let Ok(generation) = self.scripted_call(method, args.clone()) else {
                return kResultFalse;
            };
            return unsafe {
                attributes.setBinary(
                    c"generation".as_ptr(),
                    generation.to_le_bytes().as_ptr().cast(),
                    8,
                )
            };
        }
        if kind == b"manifold.graph.script.status.v1" {
            let mut data: *const std::ffi::c_void = std::ptr::null();
            let mut size = 0;
            if unsafe { attributes.getBinary(c"generation".as_ptr(), &mut data, &mut size) }
                != kResultOk
                || data.is_null()
                || size != 8
            {
                return kResultFalse;
            }
            let generation = u64::from_le_bytes(
                unsafe { std::slice::from_raw_parts(data.cast::<u8>(), 8) }
                    .try_into()
                    .unwrap(),
            );
            let status = self.scripted_status(generation);
            if status == 1 {
                let Some(project) = self.host_state_bytes() else {
                    return kResultFalse;
                };
                if unsafe {
                    attributes.setBinary(
                        c"project".as_ptr(),
                        project.as_ptr().cast(),
                        project.len() as u32,
                    )
                } != kResultOk
                {
                    return kResultFalse;
                }
            }
            return unsafe {
                attributes.setBinary(c"status".as_ptr(), (&status as *const u8).cast(), 1)
            };
        }
        if kind == b"manifold.graph.route.v1" {
            let mut data: *const std::ffi::c_void = std::ptr::null();
            let mut size = 0;
            if unsafe { attributes.getBinary(c"route".as_ptr(), &mut data, &mut size) } != kResultOk
                || data.is_null()
                || size <= 0
                || size > 512
            {
                return kResultFalse;
            }
            let bytes = unsafe { std::slice::from_raw_parts(data.cast::<u8>(), size as usize) };
            let Ok(route) = serde_json::from_slice::<serde_json::Value>(bytes) else {
                return kResultFalse;
            };
            let Some(to) = route["to"].as_u64().and_then(|n| u32::try_from(n).ok()) else {
                return kResultFalse;
            };
            let Some(input) = route["input"].as_str().filter(|s| s.len() <= 32) else {
                return kResultFalse;
            };
            let from = if route["from"].is_null() {
                Some(None)
            } else {
                route["from"]
                    .as_u64()
                    .and_then(|n| u32::try_from(n).ok())
                    .zip(route["output"].as_str().filter(|s| s.len() <= 32))
                    .map(Some)
            };
            let Some(from) = from else {
                return kResultFalse;
            };
            let Some(generation) = self.request_live_route(to, input, from) else {
                return kResultFalse;
            };
            return unsafe {
                attributes.setBinary(
                    c"generation".as_ptr(),
                    generation.to_le_bytes().as_ptr().cast(),
                    8,
                )
            };
        }
        if kind == b"manifold.graph.route.status.v1" {
            let mut data: *const std::ffi::c_void = std::ptr::null();
            let mut size = 0;
            if unsafe { attributes.getBinary(c"generation".as_ptr(), &mut data, &mut size) }
                != kResultOk
                || data.is_null()
                || size != 8
            {
                return kResultFalse;
            }
            let generation = u64::from_le_bytes(
                unsafe { std::slice::from_raw_parts(data.cast::<u8>(), 8) }
                    .try_into()
                    .unwrap(),
            );
            let status = if self.live_routes.rejected() == generation {
                2_u8
            } else if self.live_routes.accepted() == generation
                && self.published_generation.load(Ordering::Acquire) >= generation
            {
                1_u8
            } else {
                0_u8
            };
            if status == 1 {
                let Some(project) = self.capture_published_state() else {
                    return kResultFalse;
                };
                if unsafe {
                    attributes.setBinary(
                        c"project".as_ptr(),
                        project.as_ptr().cast(),
                        project.len() as u32,
                    )
                } != kResultOk
                {
                    return kResultFalse;
                }
            }
            return unsafe {
                attributes.setBinary(c"status".as_ptr(), (&status as *const u8).cast(), 1)
            };
        }
        if kind != b"manifold.graph.import.v1" {
            return kResultFalse;
        }
        let mut data: *const std::ffi::c_void = std::ptr::null();
        let mut size = 0;
        if unsafe { attributes.getBinary(c"project".as_ptr(), &mut data, &mut size) } != kResultOk
            || data.is_null()
            || size == 0
        {
            return kResultFalse;
        }
        let bytes = unsafe { std::slice::from_raw_parts(data.cast::<u8>(), size as usize) };
        self.restore_bytes(bytes.to_vec())
    }
}

impl IAudioProcessorTrait for GraphProcessor {
    unsafe fn setBusArrangements(
        &self,
        inputs: *mut SpeakerArrangement,
        n_inputs: i32,
        outputs: *mut SpeakerArrangement,
        n_outputs: i32,
    ) -> tresult {
        io_ports::trace(format_args!(
            "setBusArrangements inputs={n_inputs} outputs={n_outputs}"
        ));
        if self.active.load(Ordering::Acquire) {
            return kResultFalse;
        }
        let Ok(mut ports) = self.ports.lock() else {
            return kResultFalse;
        };
        if ports.layout.is_some() {
            if n_inputs < 0
                || n_outputs < 0
                || Some(n_inputs as usize) != ports.count(BusDirections_::kInput as i32)
                || Some(n_outputs as usize) != ports.count(BusDirections_::kOutput as i32)
                || (n_inputs > 0 && inputs.is_null())
                || (n_outputs > 0 && outputs.is_null())
            {
                return kResultFalse;
            }
            let inputs = if n_inputs == 0 {
                &[]
            } else {
                unsafe { std::slice::from_raw_parts(inputs, n_inputs as usize) }
            };
            let outputs = if n_outputs == 0 {
                &[]
            } else {
                unsafe { std::slice::from_raw_parts(outputs, n_outputs as usize) }
            };
            return if ports.negotiate(inputs, outputs) {
                kResultTrue
            } else {
                kResultFalse
            };
        }
        if !(1..=2).contains(&n_inputs)
            || n_outputs != 1
            || inputs.is_null()
            || outputs.is_null()
            || unsafe { *inputs != SpeakerArr::kStereo || *outputs != SpeakerArr::kStereo }
        {
            return kResultFalse;
        }
        let sidechain = if n_inputs == 2 {
            unsafe { *inputs.add(1) }
        } else {
            SpeakerArr::kStereo
        };
        if sidechain != SpeakerArr::kStereo && sidechain != SpeakerArr::kMono {
            return kResultFalse;
        }
        self.sidechain_arrangement
            .store(sidechain, Ordering::Release);
        kResultTrue
    }
    unsafe fn getBusArrangement(
        &self,
        direction: BusDirection,
        index: i32,
        arrangement: *mut SpeakerArrangement,
    ) -> tresult {
        if arrangement.is_null() {
            return kInvalidArgument;
        }
        io_ports::trace(format_args!(
            "getBusArrangement dir={direction} index={index}"
        ));
        let Ok(ports) = self.ports.lock() else {
            return kResultFalse;
        };
        if ports.layout.is_some() {
            return match ports.arrangement(direction, index) {
                Ok(value) => {
                    unsafe { *arrangement = value };
                    kResultOk
                }
                Err(error) => error,
            };
        }
        let value = if direction == BusDirections_::kInput as BusDirection && index == 1 {
            self.sidechain_arrangement.load(Ordering::Acquire)
        } else if index == 0
            && (direction == BusDirections_::kInput as BusDirection
                || direction == BusDirections_::kOutput as BusDirection)
        {
            SpeakerArr::kStereo
        } else {
            return kInvalidArgument;
        };
        unsafe { *arrangement = value };
        kResultOk
    }
    unsafe fn canProcessSampleSize(&self, size: i32) -> tresult {
        if size == SymbolicSampleSizes_::kSample32 as i32 {
            kResultTrue
        } else {
            kResultFalse
        }
    }
    unsafe fn getLatencySamples(&self) -> u32 {
        0
    }
    unsafe fn setupProcessing(&self, setup: *mut ProcessSetup) -> tresult {
        if setup.is_null() || self.active.load(Ordering::Acquire) {
            return kResultFalse;
        }
        let setup = unsafe { &*setup };
        if setup.symbolicSampleSize != SymbolicSampleSizes_::kSample32 as i32
            || !setup.sampleRate.is_finite()
            || !(1_000. ..=768_000.).contains(&setup.sampleRate)
            || !(1..=65_536).contains(&setup.maxSamplesPerBlock)
        {
            return kResultFalse;
        }
        let Ok(mut configuration) = self.configuration.lock() else {
            return kResultFalse;
        };
        *configuration = Some((setup.sampleRate as f32, setup.maxSamplesPerBlock as usize));
        kResultOk
    }
    unsafe fn setProcessing(&self, state: TBool) -> tresult {
        self.processing.store(state != 0, Ordering::Release);
        if state == 0 {
            self.live_events.cancel_pending();
        }
        kResultOk
    }
    unsafe fn process(&self, data: *mut ProcessData) -> tresult {
        if data.is_null()
            || !self.active.load(Ordering::Acquire)
            || self.awaiting_io_restart.load(Ordering::Acquire)
        {
            return kResultFalse;
        }
        let data = unsafe { &mut *data };
        if data.symbolicSampleSize != SymbolicSampleSizes_::kSample32 as i32 || data.numSamples < 0
        {
            return kResultFalse;
        }
        let pointer = self.current.load(Ordering::Acquire);
        if pointer.is_null() {
            return kResultFalse;
        }
        let current = unsafe { &*pointer };
        let frames = data.numSamples as usize;
        if frames > current.max_frames {
            return kResultFalse;
        }
        let has_io = frames > 0 && current.prepared.processor.io_layout().is_some();
        if has_io {
            let Some(channels) = (unsafe { io_ports::Channels::read(data, &current.io_channels) }) else {
                return kResultFalse;
            };
            if current.io_buffers.as_ref().unwrap().validate_buffers(&channels, &channels, frames).is_err() {
                return kResultFalse;
            }
        }
        self.publish_pending();
        let pointer = self.current.load(Ordering::Acquire);
        if pointer.is_null() {
            return kResultFalse;
        }
        let runtime = unsafe { &mut *pointer };
        if let Some((generation, accepted)) =
            self.live_routes.apply(&mut runtime.prepared.processor)
        {
            if accepted {
                self.published_generation
                    .store(generation, Ordering::Release);
            }
        }
        if let Some((generation, accepted)) =
            self.live_parameters.apply(&mut runtime.prepared.processor)
        {
            if accepted {
                self.publish_snapshot(runtime);
                self.published_generation
                    .store(generation, Ordering::Release);
            }
        }
        if !data.processContext.is_null() {
            let context = unsafe { &*data.processContext };
            let required = ProcessContext_::StatesAndFlags_::kTempoValid
                | ProcessContext_::StatesAndFlags_::kTimeSigValid;
            if context.state & required as u32 == required as u32 {
                self.bar_clock.publish(
                    runtime.sample_rate,
                    context.tempo,
                    context.timeSigNumerator,
                    context.timeSigDenominator,
                );
            } else {
                self.bar_clock.clear();
            }
        } else {
            self.bar_clock.clear();
        }

        if let Some(worker) = runtime.capture_worker.as_mut() {
            worker.service(&mut runtime.prepared.processor);
        }
        let frames = data.numSamples as usize;
        if !unsafe { collect_automation(data.inputParameterChanges, frames, runtime) }
            || !unsafe { collect_events(data.inputEvents, frames, runtime) }
        {
            return kResultFalse;
        }
        if frames == 0 {
            if runtime
                .prepared
                .processor
                .flush_host_automation(&runtime.automation)
                .is_err()
            {
                return kResultFalse;
            }
            if !runtime.automation.is_empty() {
                self.publish_snapshot(runtime);
            }
            return kResultOk;
        }
        let scripted_event =
            self.live_events
                .merge(&runtime.prepared.processor, &mut runtime.events, frames);
        let rendered = if has_io {
            // Publication retains the bus shape. Borrow only the adopted
            // runtime's mapping; never retain a view into a retired runtime.
            let Some(channels) = (unsafe { io_ports::Channels::read(data, &runtime.io_channels) }) else {
                return kResultFalse;
            };
            unsafe {
                runtime.io_buffers.as_mut().unwrap().render_buffers(
                    &mut runtime.prepared.processor, &channels, &channels,
                    frames, &runtime.events, &runtime.automation,
                )
            }
        } else {
            let Some(main) = (unsafe { audio_bus(data.inputs, data.numInputs, 0, false) }) else {
                return kResultFalse;
            };
            let sidechain = if self.sidechain_active.load(Ordering::Acquire) {
                let Some(bus) = (unsafe { audio_bus(data.inputs, data.numInputs, 1, true) }) else {
                    return kResultFalse;
                };
                bus
            } else {
                [null_mut(), null_mut()]
            };
            let Some(output) = (unsafe { audio_bus(data.outputs, data.numOutputs, 0, false) })
            else {
                return kResultFalse;
            };
            unsafe {
                runtime.buffers.render(
                    &mut runtime.prepared.processor,
                    RawHostBlock {
                        frames,
                        main: [main[0].cast_const(), main[1].cast_const()],
                        sidechain: [sidechain[0].cast_const(), sidechain[1].cast_const()],
                        output,
                        events: &runtime.events,
                        automation: &runtime.automation,
                    },
                )
            }
        };
        if let Some(command) = scripted_event {
            self.live_events.complete(command, rendered.is_ok());
        }
        if rendered.is_err() {
            return kResultFalse;
        }
        let rms = runtime.io_buffers.as_ref().map_or_else(|| runtime.buffers.output_rms(frames), |buffers| buffers.output_rms(frames));
        self.output_rms.store(rms.to_bits(), Ordering::Relaxed);
        let channels = runtime.io_buffers.as_ref().map_or_else(|| runtime.buffers.output_stereo(frames), |buffers| buffers.output_stereo(frames));
        runtime.spectrum.process(channels, &self.output_spectrum);
        if let Some(worker) = runtime.capture_worker.as_mut() {
            worker.service(&mut runtime.prepared.processor);
        }
        if let Some(worker) = runtime.loop_worker.as_mut() {
            worker.service(&runtime.prepared.processor);
        }
        if !runtime.automation.is_empty() {
            self.publish_snapshot(runtime);
        }
        if data.numOutputs > 0 && !data.outputs.is_null() {
            for i in 0..data.numOutputs as usize {
                unsafe { (*data.outputs.add(i)).silenceFlags = 0 };
            }
        }
        kResultOk
    }
    unsafe fn getTailSamples(&self) -> u32 {
        kInfiniteTail
    }
}

impl IProcessContextRequirementsTrait for GraphProcessor {
    unsafe fn getProcessContextRequirements(&self) -> u32 {
        (IProcessContextRequirements_::Flags_::kNeedTempo
            | IProcessContextRequirements_::Flags_::kNeedTimeSignature) as u32
    }
}

/// Null or absent bus channels are silence/discarded output; one sidechain
/// channel is allowed, and the host's scratch is copied before output writes.
unsafe fn audio_bus(
    buses: *mut AudioBusBuffers,
    count: i32,
    index: i32,
    mono_allowed: bool,
) -> Option<[*mut f32; 2]> {
    if count < 0 || count > 2 || (count > 0 && buses.is_null()) {
        return None;
    }
    if index >= count {
        return Some([null_mut(), null_mut()]);
    }
    let bus = unsafe { &*buses.add(index as usize) };
    if bus.numChannels != 2 && !(mono_allowed && bus.numChannels == 1) {
        return None;
    }
    let pointers = unsafe { bus.__field0.channelBuffers32 };
    if pointers.is_null() {
        return Some([null_mut(), null_mut()]);
    }
    let left = unsafe { *pointers };
    let right = if bus.numChannels == 2 {
        unsafe { *pointers.add(1) }
    } else {
        null_mut()
    };
    Some([left, right])
}

fn stable_offset_sort<T>(items: &mut [T], offset: impl Fn(&T) -> usize) {
    for index in 1..items.len() {
        let mut position = index;
        while position > 0 && offset(&items[position - 1]) > offset(&items[position]) {
            items.swap(position - 1, position);
            position -= 1;
        }
    }
}

unsafe fn collect_automation(
    changes: *mut IParameterChanges,
    frames: usize,
    runtime: &mut Runtime,
) -> bool {
    runtime.automation.clear();
    let Some(changes) = (unsafe { ComRef::from_raw(changes) }) else {
        return true;
    };
    let count = unsafe { changes.getParameterCount() };
    if count < 0 {
        return false;
    }
    for index in 0..count {
        let Some(queue) = (unsafe { ComRef::from_raw(changes.getParameterData(index)) }) else {
            return false;
        };
        let id = unsafe { queue.getParameterId() };
        let Some(slot) = id.checked_sub(HOST_SLOT_BASE).map(|slot| slot as usize) else {
            continue;
        };
        if runtime.slot_indices.get(&slot).copied().flatten().is_none() {
            continue;
        }
        let count = unsafe { queue.getPointCount() };
        if count < 0 || count as usize > MAX_MESSAGES - runtime.automation.len() {
            return false;
        }
        for point in 0..count {
            let mut offset = 0_i32;
            let mut normalized = 0_f64;
            if unsafe { queue.getPoint(point, &mut offset, &mut normalized) } != kResultOk
                || offset < 0
                || (frames > 0 && offset as usize >= frames)
                || (frames == 0 && offset != 0)
                || !normalized.is_finite()
                || !(0. ..=1.).contains(&normalized)
            {
                return false;
            }
            runtime.automation.push(TimedAutomation {
                offset: offset as usize,
                id: u64::from(id),
                normalized: normalized as f32,
            });
        }
    }
    stable_offset_sort(&mut runtime.automation, |point| point.offset);
    true
}

unsafe fn collect_events(events: *mut IEventList, frames: usize, runtime: &mut Runtime) -> bool {
    runtime.events.clear();
    let Some(node) = runtime.midi_node else {
        return true;
    };
    let Some(events) = (unsafe { ComRef::from_raw(events) }) else {
        return true;
    };
    let count = unsafe { events.getEventCount() };
    if count < 0 || count as usize > MAX_MESSAGES {
        return false;
    }
    for index in 0..count {
        let mut event: Event = unsafe { std::mem::zeroed() };
        if unsafe { events.getEvent(index, &mut event) } != kResultOk
            || event.sampleOffset < 0
            || event.sampleOffset as usize >= frames
        {
            return false;
        }
        if event.busIndex != 0 {
            continue;
        }
        let kind = match event.r#type as i32 {
            x if x == Event_::EventTypes_::kNoteOnEvent as i32 => {
                let note = unsafe { event.__field0.noteOn };
                if !(0..=15).contains(&note.channel)
                    || !(0..=127).contains(&note.pitch)
                    || !note.velocity.is_finite()
                    || !(0. ..=1.).contains(&note.velocity)
                {
                    return false;
                }
                if note.velocity == 0.0 {
                    EventKind::NoteOff {
                        channel: note.channel as u8,
                        note: note.pitch as u8,
                    }
                } else {
                    EventKind::NoteOn {
                        channel: note.channel as u8,
                        note: note.pitch as u8,
                        velocity: (note.velocity * 127.0).round() as u8,
                    }
                }
            }
            x if x == Event_::EventTypes_::kNoteOffEvent as i32 => {
                let note = unsafe { event.__field0.noteOff };
                if !(0..=15).contains(&note.channel) || !(0..=127).contains(&note.pitch) {
                    return false;
                }
                EventKind::NoteOff {
                    channel: note.channel as u8,
                    note: note.pitch as u8,
                }
            }
            _ => continue,
        };
        runtime.events.push(TimedEvent {
            offset: event.sampleOffset as usize,
            node,
            kind,
        });
    }
    stable_offset_sort(&mut runtime.events, |event| event.offset);
    true
}

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
    struct ScriptSampleHost(GraphProcessor);
    impl sample_suite::SampleHost for ScriptSampleHost {
        fn open(bytes: &[u8]) -> Self {
            let component = GraphProcessor::new();
            assert_eq!(component.restore_bytes(bytes.to_vec()), kResultOk);
            let mut setup = ProcessSetup {
                processMode: 0,
                symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
                maxSamplesPerBlock: 128,
                sampleRate: 48000.,
            };
            assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
            assert_eq!(unsafe { component.setActive(1) }, kResultOk);
            assert_eq!(unsafe { component.setProcessing(1) }, kResultOk);
            Self(component)
        }
        fn call(&self, method: &str, args: Vec<serde_json::Value>) -> u64 {
            self.0.scripted_call(method, args).unwrap()
        }
        fn status(&self, generation: u64) -> u32 {
            self.0.scripted_status(generation).into()
        }
        fn render(&self) -> [[f32; 128]; 2] {
            callback_heap::measure(|| render_owned_loop_block(&self.0, 0))
        }
        fn save(&self) -> Vec<u8> {
            self.0.host_state_bytes().unwrap()
        }
        fn pause(&self) {
            assert_eq!(unsafe { self.0.setProcessing(0) }, kResultOk);
        }
        fn resume(&self) {
            assert_eq!(unsafe { self.0.setProcessing(1) }, kResultOk);
        }
        fn retire(&self) {
            self.0.retire_old();
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
    fn vst3_scripted_sample_package_matches_native() {
        sample_suite::rack::<ScriptSampleHost>(
            "vst3",
            include_bytes!("../../../web/public/packages/rack-sample-author.manifold.json"),
        );
        sample_suite::instrument::<ScriptSampleHost>(
            "vst3",
            include_bytes!("../../../web/public/packages/sample-instrument-author.manifold.json"),
        );
    }

    #[test]
    fn vst3_script_parameter_rejection_after_deactivation_can_retry() {
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
        assert_eq!(unsafe { host.0.setActive(1) }, kResultOk);
        assert_eq!(unsafe { host.0.setProcessing(1) }, kResultOk);
        let generation = host.0.scripted_call("set", args).unwrap();
        callback_heap::measure(|| render_owned_loop_block(&host.0, 0));
        assert_eq!(host.0.scripted_status(generation), 1);
    }

    fn render_owned_loop_block(component: &GraphProcessor, frame: usize) -> [[f32; 128]; 2] {
        let mut input = owned_loops::input(frame);
        let mut input_channels = [input[0].as_mut_ptr(), input[1].as_mut_ptr()];
        let mut input_bus = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: input_channels.as_mut_ptr(),
            },
        };
        let mut output = [[0.; 128]; 2];
        let mut output_channels = [output[0].as_mut_ptr(), output[1].as_mut_ptr()];
        let mut output_bus = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: output_channels.as_mut_ptr(),
            },
        };
        let mut block = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 1,
            numOutputs: 1,
            inputs: &mut input_bus,
            outputs: &mut output_bus,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: null_mut(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(unsafe { component.process(&mut block) }, kResultOk);
        output
    }

    #[test]
    fn vst3_owned_loop_publication_matches_native_through_staging_races_stop_and_reopen() {
        let source = owned_loops::document(2, false, 1.);
        let first = owned_loops::document(12, true, 1.);
        let second = owned_loops::document(22, true, 0.7);
        let component = GraphProcessor::new();
        assert_eq!(component.restore_bytes(source.clone()), kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let mut reference = owned_loops::prepare(&source);
        let set = |id, value| {
            let runtime = unsafe { &mut *component.current.load(Ordering::Acquire) };
            let node = runtime.prepared.processor.host_parameters()[0].node;
            assert!(runtime.prepared.processor.set_parameter(node, id, value));
        };
        set(0, 1.);
        assert!(reference.processor.set_parameter(2, 0, 1.));
        let mut tape = Vec::new();
        let mut expected_tape = Vec::new();
        for index in 0..384 {
            if index == 12 {
                assert_eq!(
                    component.restore_graph_with_parameter_baseline(
                        first.clone(),
                        false,
                        PackageUpdate::Preserve,
                        Some(&source),
                        false
                    ),
                    kResultOk
                );
                let runtime = unsafe { &mut *component.current.load(Ordering::Acquire) };
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
                let runtime = unsafe { &mut *component.current.load(Ordering::Acquire) };
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
                assert_eq!(
                    component.restore_graph_with_parameter_baseline(
                        second.clone(),
                        false,
                        PackageUpdate::Preserve,
                        Some(&first),
                        false
                    ),
                    kResultOk
                );
                set(4, 1.);
                assert!(reference.processor.set_parameter(2, 4, 1.));
                assert!(reference.processor.set_parameter(2, 5, 0.7));
            }
            if index == 240 {
                set(2, 0.);
                assert!(reference.processor.set_parameter(2, 2, 0.));
            }
            let actual =
                callback_heap::measure(|| render_owned_loop_block(&component, index * 128));
            let expected = owned_loops::render(&mut reference, index * 128);
            assert_eq!(actual, expected, "block {index}");
            if index == 12 || index == 13 {
                assert!(!component.pending.load(Ordering::Acquire).is_null());
            }
            owned_loops::append(&mut tape, &actual);
            owned_loops::append(&mut expected_tape, &expected);
        }
        let saved = component.capture_published_state().unwrap();
        let expected = reference.save_state().unwrap();
        owned_loops::assert_take(&saved, &expected);
        let third = owned_loops::document(32, true, 0.7);
        assert_eq!(
            component.restore_graph_with_parameter_baseline(
                third,
                false,
                PackageUpdate::Preserve,
                Some(&second),
                false
            ),
            kResultOk
        );
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        let stopped = component.capture_published_state().unwrap();
        assert!(reference.finish_recording_loops_for_host_stop());
        let expected = reference.save_state().unwrap();
        owned_loops::assert_take(&stopped, &expected);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let mut reference = owned_loops::prepare(&expected);
        for index in 384..448 {
            let actual =
                callback_heap::measure(|| render_owned_loop_block(&component, index * 128));
            let expected = owned_loops::render(&mut reference, index * 128);
            assert_eq!(actual, expected);
            owned_loops::append(&mut tape, &actual);
            owned_loops::append(&mut expected_tape, &expected);
        }
        owned_loops::export("vst3", &tape, &expected_tape, &stopped);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }
    use manifold_native::AudioBlock;
    use manifold_native::host_buffers::{HostBuffers, RawHostBlock};
    use std::collections::BTreeMap;
    use std::ffi::{CString, c_void};
    use vst3::ComWrapper;

    struct TestStreamData {
        bytes: Vec<u8>,
        position: usize,
    }
    struct TestStream(Arc<Mutex<TestStreamData>>);

    impl Class for TestStream {
        type Interfaces = (IBStream,);
    }
    impl IBStreamTrait for TestStream {
        unsafe fn read(&self, buffer: *mut c_void, capacity: i32, count: *mut i32) -> tresult {
            if buffer.is_null() || capacity < 0 || count.is_null() {
                return kInvalidArgument;
            }
            let Ok(mut data) = self.0.lock() else {
                return kResultFalse;
            };
            let length = (data.bytes.len() - data.position).min(capacity as usize);
            unsafe {
                std::ptr::copy_nonoverlapping(
                    data.bytes.as_ptr().add(data.position),
                    buffer.cast(),
                    length,
                );
                *count = length as i32;
            }
            data.position += length;
            kResultOk
        }
        unsafe fn write(&self, buffer: *mut c_void, size: i32, count: *mut i32) -> tresult {
            if buffer.is_null() || size < 0 || count.is_null() {
                return kInvalidArgument;
            }
            let Ok(mut data) = self.0.lock() else {
                return kResultFalse;
            };
            let end = data.position + size as usize;
            if end > data.bytes.len() {
                data.bytes.resize(end, 0);
            }
            unsafe {
                std::ptr::copy_nonoverlapping(
                    buffer.cast::<u8>(),
                    data.bytes.as_mut_ptr().add(data.position),
                    size as usize,
                );
                *count = size;
            }
            data.position = end;
            kResultOk
        }
        unsafe fn seek(&self, _position: i64, _mode: i32, _result: *mut i64) -> tresult {
            kNotImplemented
        }
        unsafe fn tell(&self, _position: *mut i64) -> tresult {
            kNotImplemented
        }
    }

    fn test_stream(bytes: Vec<u8>) -> (ComPtr<IBStream>, Arc<Mutex<TestStreamData>>) {
        let data = Arc::new(Mutex::new(TestStreamData { bytes, position: 0 }));
        let stream = ComWrapper::new(TestStream(Arc::clone(&data)))
            .to_com_ptr::<IBStream>()
            .unwrap();
        (stream, data)
    }

    mod automation_probe {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/examples/support/automation.rs"
        ));
    }

    fn render_package_block(component: &GraphProcessor) -> [f32; 128] {
        render_package_block_automated(component, None)
    }

    fn render_package_block_automated(
        component: &GraphProcessor,
        automation: Option<&ComPtr<IParameterChanges>>,
    ) -> [f32; 128] {
        let mut input_left: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.17).sin() * 0.25);
        let mut input_right: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.11).sin() * -0.25);
        let mut input_channels = [input_left.as_mut_ptr(), input_right.as_mut_ptr()];
        let mut input = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: input_channels.as_mut_ptr(),
            },
        };
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut output_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: output_channels.as_mut_ptr(),
            },
        };
        let mut block = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 1,
            numOutputs: 1,
            inputs: &mut input,
            outputs: &mut output,
            inputParameterChanges: automation.map_or(null_mut(), |value| value.as_ptr()),
            outputParameterChanges: null_mut(),
            inputEvents: null_mut(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(unsafe { component.process(&mut block) }, kResultOk);
        left
    }

    fn saved_package(component: &GraphProcessor) -> ProjectPackage {
        let (stream, data) = test_stream(Vec::new());
        assert_eq!(unsafe { component.getState(stream.as_ptr()) }, kResultOk);
        ProjectPackage::parse(&data.lock().unwrap().bytes).unwrap()
    }

    fn vst3_script_call(
        component: &GraphProcessor,
        method: &str,
        args: Vec<serde_json::Value>,
    ) -> Result<u64, tresult> {
        let message = capture_message("manifold.graph.script.call.v1");
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }.unwrap();
        let bytes =
            serde_json::to_vec(&serde_json::json!({"method": method, "args": args})).unwrap();
        assert_eq!(
            unsafe {
                attributes.setBinary(c"call".as_ptr(), bytes.as_ptr().cast(), bytes.len() as u32)
            },
            kResultOk
        );
        let result = unsafe { component.notify(message.as_ptr()) };
        if result != kResultOk {
            return Err(result);
        }
        let mut data: *const c_void = std::ptr::null();
        let mut size = 0;
        assert_eq!(
            unsafe { attributes.getBinary(c"generation".as_ptr(), &mut data, &mut size) },
            kResultOk
        );
        assert_eq!(size, 8);
        Ok(u64::from_le_bytes(
            unsafe { std::slice::from_raw_parts(data.cast::<u8>(), 8) }
                .try_into()
                .unwrap(),
        ))
    }

    fn vst3_script_status(component: &GraphProcessor, generation: u64) -> u8 {
        let message = capture_message("manifold.graph.script.status.v1");
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }.unwrap();
        assert_eq!(
            unsafe {
                attributes.setBinary(
                    c"generation".as_ptr(),
                    generation.to_le_bytes().as_ptr().cast(),
                    8,
                )
            },
            kResultOk
        );
        assert_eq!(unsafe { component.notify(message.as_ptr()) }, kResultOk);
        let mut data: *const c_void = std::ptr::null();
        let mut size = 0;
        assert_eq!(
            unsafe { attributes.getBinary(c"status".as_ptr(), &mut data, &mut size) },
            kResultOk
        );
        assert_eq!(size, 1);
        let status = unsafe { *data.cast::<u8>() };
        if status == 1 {
            assert_eq!(
                unsafe { attributes.getBinary(c"project".as_ptr(), &mut data, &mut size) },
                kResultOk
            );
            let bytes = unsafe { std::slice::from_raw_parts(data.cast::<u8>(), size as usize) };
            ProjectPackage::parse(bytes).unwrap();
        }
        status
    }

    #[test]
    fn vst3_host_automation_survives_script_composition_and_stop_during_preparation() {
        for stop_before_publication in [false, true] {
            let component = GraphProcessor::new();
            assert_eq!(
                component.restore_bytes(
                    include_bytes!("../../../web/public/packages/fx-slot-swap.manifold.json")
                        .to_vec()
                ),
                kResultOk
            );
            let mut setup = ProcessSetup {
                processMode: 0,
                symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
                maxSamplesPerBlock: 128,
                sampleRate: 48_000.,
            };
            assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
            assert_eq!(unsafe { component.setActive(1) }, kResultOk);
            let descriptor = component.descriptors.lock().unwrap()[&0].unwrap();
            let queue =
                automation_probe::changes(0, 64, descriptor.to_normalized(0.375).unwrap().into());
            render_package_block_automated(&component, Some(&queue));
            let generation = vst3_script_call(
                &component,
                "set",
                vec!["/test/fxslot/slotA/select".into(), 1.0.into()],
            )
            .unwrap();
            // Model the last callback finishing while the replacement is being
            // prepared: its final target is newer than the authoring baseline.
            let old = unsafe { &mut *component.current.load(Ordering::Acquire) };
            assert!(old.prepared.processor.set_parameter(4_u32.into(), 0, 0.625));
            component.publish_snapshot(old);
            if stop_before_publication {
                assert_eq!(unsafe { component.setActive(0) }, kResultOk);
            } else {
                render_package_block(&component);
            }
            assert_eq!(vst3_script_status(&component, generation), 1);
            let saved = component.host_state_bytes().unwrap();
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
            let reopened = GraphProcessor::new();
            assert_eq!(reopened.restore_bytes(saved), kResultOk);
            let second = vst3_script_call(
                &reopened,
                "set",
                vec!["/test/fxslot/slotB/select".into(), 1.0.into()],
            )
            .unwrap();
            assert_eq!(vst3_script_status(&reopened, second), 1);
        }
    }

    #[test]
    fn packaged_js_fx_controller_publishes_and_reopens_through_vst3_state() {
        let package = include_bytes!("../../../web/public/packages/fx-slot-swap.manifold.json");
        let component = GraphProcessor::new();
        let (stream, _) = test_stream(package.to_vec());
        assert_eq!(unsafe { component.setState(stream.as_ptr()) }, kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        for _ in 0..12 {
            render_package_block(&component);
        }
        let before = render_package_block(&component);
        let generation = vst3_script_call(
            &component,
            "set",
            vec!["/test/fxslot/slotA/select".into(), 1.0.into()],
        )
        .unwrap();
        assert_eq!(vst3_script_status(&component, generation), 0);
        let before_save = saved_package(&component);
        let before_state: serde_json::Value = serde_json::from_slice(before_save.state()).unwrap();
        assert_eq!(
            before_state["signal"]["nodes"].as_array().unwrap().len(),
            10
        );
        let mut after = [0_f32; 128];
        for _ in 0..12 {
            after = render_package_block(&component);
        }
        assert_eq!(vst3_script_status(&component, generation), 1);
        assert!(after.iter().zip(before).any(|(a, b)| (a - b).abs() > 0.03));
        let saved = saved_package(&component);
        let state: serde_json::Value = serde_json::from_slice(saved.state()).unwrap();
        assert_eq!(state["signal"]["nodes"].as_array().unwrap().len(), 12);
        let reopened = GraphProcessor::new();
        let bytes = component.host_state_bytes().unwrap();
        let (stream, _) = test_stream(bytes);
        assert_eq!(unsafe { reopened.setState(stream.as_ptr()) }, kResultOk);
        assert_eq!(unsafe { reopened.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { reopened.setActive(1) }, kResultOk);
        let second = vst3_script_call(
            &reopened,
            "set",
            vec!["/test/fxslot/slotB/select".into(), 1.0.into()],
        )
        .unwrap();
        for _ in 0..12 {
            render_package_block(&reopened);
        }
        assert_eq!(vst3_script_status(&reopened, second), 1);
        let state: serde_json::Value =
            serde_json::from_slice(saved_package(&reopened).state()).unwrap();
        assert_eq!(state["signal"]["nodes"].as_array().unwrap().len(), 14);
    }

    #[test]
    fn packaged_js_parameter_and_route_survive_vst3_save_and_reopen() {
        let package =
            include_bytes!("../../../web/public/packages/dsp-live-scripting.manifold.json");
        let component = GraphProcessor::new();
        let (stream, _) = test_stream(package.to_vec());
        assert_eq!(unsafe { component.setState(stream.as_ptr()) }, kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        for _ in 0..12 {
            render_package_block(&component);
        }
        let before = render_package_block(&component);
        let gain = vst3_script_call(
            &component,
            "set",
            vec!["/dsp/live/input_gain".into(), 0.4.into()],
        )
        .unwrap();
        for _ in 0..12 {
            render_package_block(&component);
        }
        assert_eq!(vst3_script_status(&component, gain), 1);
        let lowered = render_package_block(&component);
        assert!(
            lowered
                .iter()
                .zip(before)
                .any(|(a, b)| (a - b).abs() > 0.001)
        );
        let route = vst3_script_call(
            &component,
            "routeOutput",
            vec!["/dsp/live/nodes/input_trim".into()],
        )
        .unwrap();
        for _ in 0..12 {
            render_package_block(&component);
        }
        assert_eq!(vst3_script_status(&component, route), 1);
        let saved = component.host_state_bytes().unwrap();
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
        let reopened = GraphProcessor::new();
        let (stream, _) = test_stream(saved);
        assert_eq!(unsafe { reopened.setState(stream.as_ptr()) }, kResultOk);
        assert_eq!(unsafe { reopened.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { reopened.setActive(1) }, kResultOk);
        for _ in 0..12 {
            render_package_block(&reopened);
        }
        assert!(
            vst3_script_call(
                &reopened,
                "set",
                vec!["/dsp/live/input_gain".into(), 0.7.into()]
            )
            .is_ok()
        );
    }

    #[test]
    fn vst3_package_identity_changes_with_the_published_graph_and_controller_accepts_it() {
        let dsp = include_bytes!("../../../web/public/packages/dsp-live-scripting.manifold.json");
        let fx = include_bytes!("../../../web/public/packages/fx-slot-swap.manifold.json");
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let original = component.host_state_bytes().unwrap();
        let (stream, _) = test_stream(dsp.to_vec());
        assert_eq!(unsafe { component.setState(stream.as_ptr()) }, kResultOk);
        assert_eq!(component.host_state_bytes().unwrap(), original);
        assert!(
            vst3_script_call(
                &component,
                "set",
                vec!["/dsp/live/input_gain".into(), 0.4.into()]
            )
            .is_err()
        );
        render_package_block(&component);
        let published_dsp = component.host_state_bytes().unwrap();
        assert_eq!(
            ProjectPackage::parse(&published_dsp).unwrap().id,
            "manifold.dsp-live-scripting"
        );
        let controller = GraphController::new();
        let (stream, _) = test_stream(published_dsp.clone());
        assert_eq!(
            unsafe { controller.setComponentState(stream.as_ptr()) },
            kResultOk
        );
        let (stream, _) = test_stream(fx.to_vec());
        assert_eq!(unsafe { component.setState(stream.as_ptr()) }, kResultOk);
        assert_eq!(component.host_state_bytes().unwrap(), published_dsp);
        render_package_block(&component);
        let published_fx = component.host_state_bytes().unwrap();
        assert_eq!(
            ProjectPackage::parse(&published_fx).unwrap().id,
            "manifold.fx-slot-swap"
        );
        let (stream, _) = test_stream(published_fx.clone());
        assert_eq!(
            unsafe { controller.setComponentState(stream.as_ptr()) },
            kResultOk
        );
        let mut damaged: serde_json::Value = serde_json::from_slice(fx).unwrap();
        damaged["control"]["bundle"] = "tampered".into();
        let (stream, _) = test_stream(serde_json::to_vec(&damaged).unwrap());
        assert_eq!(unsafe { component.setState(stream.as_ptr()) }, kResultFalse);
        assert_eq!(component.host_state_bytes().unwrap(), published_fx);
        let (stream, _) = test_stream(DEFAULT_PROJECT.to_vec());
        assert_eq!(unsafe { component.setState(stream.as_ptr()) }, kResultOk);
        assert_eq!(component.host_state_bytes().unwrap(), published_fx);
        render_package_block(&component);
        let raw = component.host_state_bytes().unwrap();
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&raw).unwrap()["format"],
            "manifold.project"
        );
        assert!(
            vst3_script_call(
                &component,
                "set",
                vec!["/test/fxslot/slotA/select".into(), 1.0.into()]
            )
            .is_err()
        );
    }

    #[test]
    fn pending_script_parameter_becomes_reopen_state_when_vst3_host_stops() {
        let package =
            include_bytes!("../../../web/public/packages/dsp-live-scripting.manifold.json");
        let component = GraphProcessor::new();
        assert_eq!(component.restore_bytes(package.to_vec()), kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let generation = vst3_script_call(
            &component,
            "set",
            vec!["/dsp/live/input_gain".into(), 0.4.into()],
        )
        .unwrap();
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        assert_eq!(vst3_script_status(&component, generation), 1);
        let saved = component.host_state_bytes().unwrap();
        let package = ProjectPackage::parse(&saved).unwrap();
        let state: serde_json::Value = serde_json::from_slice(package.state()).unwrap();
        let gain = state["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["nodeId"] == 4 && entry["id"] == 0)
            .unwrap()["value"]
            .as_f64()
            .unwrap();
        assert!((gain - 0.4).abs() < 1e-6, "saved gain {gain}");
        let reopened = GraphProcessor::new();
        assert_eq!(reopened.restore_bytes(saved), kResultOk);
        assert_eq!(unsafe { reopened.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { reopened.setActive(1) }, kResultOk);
        let routed = vst3_script_call(
            &reopened,
            "routeOutput",
            vec!["/dsp/live/nodes/input_trim".into()],
        )
        .unwrap();
        assert_eq!(unsafe { reopened.setActive(0) }, kResultOk);
        assert_eq!(vst3_script_status(&reopened, routed), 1);
    }

    type AttrID = *const std::ffi::c_char;

    #[test]
    fn pending_vst3_loop_route_keeps_newer_take_on_host_stop() {
        let fixture =
            include_bytes!("../../../projects/graph-workspace/authored-live-loop-route.json");
        let component = GraphProcessor::new();
        assert_eq!(component.restore_bytes(fixture.to_vec()), kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let runtime = unsafe { &mut *component.current.load(Ordering::Acquire) };
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
                    component
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
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
        assert_eq!(
            active_state["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 2 && entry["id"] == 1)
                .unwrap()["value"],
            1.0
        );
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        let saved = component.capture_published_state().unwrap();
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
        assert!(left.iter().all(|value| (*value + 0.6).abs() < 1e-5));
        assert!(right.iter().all(|value| (*value + 0.6).abs() < 1e-5));
    }

    #[test]
    fn active_vst3_state_save_reopens_authored_loop_pcm() {
        let fixture =
            include_bytes!("../../../projects/graph-workspace/authored-rack-four-layer-loops.json");
        let component = GraphProcessor::new();
        assert_eq!(component.restore_bytes(fixture.to_vec()), kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let runtime = unsafe { &mut *component.current.load(Ordering::Acquire) };
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
        assert!(component.capture_published_state().is_none());
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
        let (outgoing, saved_data) = test_stream(Vec::new());
        assert_eq!(unsafe { component.getState(outgoing.as_ptr()) }, kResultOk);
        let saved = saved_data.lock().unwrap().bytes.clone();
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
        let reopened = GraphProcessor::new();
        let (incoming, _) = test_stream(saved);
        assert_eq!(unsafe { reopened.setState(incoming.as_ptr()) }, kResultOk);
        assert_eq!(unsafe { reopened.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { reopened.setActive(1) }, kResultOk);
        let playback = unsafe { &mut *reopened.current.load(Ordering::Acquire) };
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
        assert_eq!(unsafe { reopened.setActive(0) }, kResultOk);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn deactivated_vst3_graph_saves_recorded_loop_pcm() {
        let fixture =
            include_bytes!("../../../projects/graph-workspace/authored-rack-four-layer-loops.json");
        let component = GraphProcessor::new();
        assert_eq!(component.restore_bytes(fixture.to_vec()), kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let runtime = unsafe { &mut *component.current.load(Ordering::Acquire) };
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
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        let saved = component.capture_published_state().unwrap();
        let project: serde_json::Value = serde_json::from_slice(&saved).unwrap();
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
        NativeProject::parse(&saved).unwrap();
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let restored = unsafe { &mut *component.current.load(Ordering::Acquire) };
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
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        let stopped: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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

    struct CaptureAttributes(Mutex<BTreeMap<Vec<u8>, Vec<u8>>>);
    impl Class for CaptureAttributes {
        type Interfaces = (IAttributeList,);
    }
    impl IAttributeListTrait for CaptureAttributes {
        unsafe fn setInt(&self, _: AttrID, _: i64) -> tresult {
            kNotImplemented
        }
        unsafe fn getInt(&self, _: AttrID, _: *mut i64) -> tresult {
            kNotImplemented
        }
        unsafe fn setFloat(&self, _: AttrID, _: f64) -> tresult {
            kNotImplemented
        }
        unsafe fn getFloat(&self, _: AttrID, _: *mut f64) -> tresult {
            kNotImplemented
        }
        unsafe fn setString(&self, _: AttrID, _: *const TChar) -> tresult {
            kNotImplemented
        }
        unsafe fn getString(&self, _: AttrID, _: *mut TChar, _: u32) -> tresult {
            kNotImplemented
        }
        unsafe fn setBinary(&self, id: AttrID, data: *const c_void, size: u32) -> tresult {
            if id.is_null() || data.is_null() {
                return kInvalidArgument;
            }
            let key = unsafe { CStr::from_ptr(id) }.to_bytes().to_vec();
            let bytes =
                unsafe { std::slice::from_raw_parts(data.cast::<u8>(), size as usize) }.to_vec();
            self.0.lock().unwrap().insert(key, bytes);
            kResultOk
        }
        unsafe fn getBinary(
            &self,
            id: AttrID,
            data: *mut *const c_void,
            size: *mut u32,
        ) -> tresult {
            if id.is_null() || data.is_null() || size.is_null() {
                return kInvalidArgument;
            }
            let key = unsafe { CStr::from_ptr(id) }.to_bytes();
            let guard = self.0.lock().unwrap();
            let Some(bytes) = guard.get(key) else {
                return kResultFalse;
            };
            unsafe {
                *data = bytes.as_ptr().cast();
                *size = bytes.len() as u32;
            }
            kResultOk
        }
    }
    struct CaptureMessage {
        id: CString,
        attributes: ComPtr<IAttributeList>,
    }
    impl Class for CaptureMessage {
        type Interfaces = (IMessage,);
    }
    impl IMessageTrait for CaptureMessage {
        unsafe fn getMessageID(&self) -> FIDString {
            self.id.as_ptr()
        }
        unsafe fn setMessageID(&self, _: FIDString) {}
        unsafe fn getAttributes(&self) -> *mut IAttributeList {
            self.attributes.as_ptr()
        }
    }
    fn capture_message(id: &str) -> ComPtr<IMessage> {
        let attributes = ComWrapper::new(CaptureAttributes(Mutex::new(BTreeMap::new())))
            .to_com_ptr::<IAttributeList>()
            .unwrap();
        ComWrapper::new(CaptureMessage {
            id: CString::new(id).unwrap(),
            attributes,
        })
        .to_com_ptr::<IMessage>()
        .unwrap()
    }

    #[test]
    fn live_saves_keep_one_value_block_and_one_imported_generation() {
        let component = GraphProcessor::new();
        let descriptors = component.descriptors.lock().unwrap().clone();
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
        let bank = Arc::clone(&component.values.lock().unwrap());
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
                let saved = component.capture_state().unwrap();
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
                        .unwrap() as f32
                };
                let pair = (
                    first.to_normalized(physical(first)).unwrap(),
                    second.to_normalized(physical(second)).unwrap(),
                );
                if (pair.0 - initial[&first_slot]).abs() > 1e-5
                    || (pair.1 - initial[&second_slot]).abs() > 1e-5
                {
                    assert!((pair.0 + pair.1 - 1.).abs() < 1e-5, "{pair:?}");
                }
                NativeProject::parse(&saved).unwrap();
            }
        });

        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let running = AtomicBool::new(true);
        let old_runtime = component.current.load(Ordering::Acquire) as usize;
        std::thread::scope(|scope| {
            scope.spawn(|| {
                while running.load(Ordering::Acquire) {
                    component.publish_snapshot(unsafe { &*(old_runtime as *const Runtime) });
                }
            });
            let tone = include_bytes!("../../../projects/graph-workspace/tone-texture.json");
            for index in 0..40 {
                let next = if index & 1 == 0 {
                    tone.as_slice()
                } else {
                    DEFAULT_PROJECT
                };
                assert_eq!(component.restore_bytes(next.to_vec()), kResultOk);
                for _ in 0..3 {
                    let saved = component.capture_state().unwrap();
                    let project = NativeProject::parse(&saved).unwrap();
                    assert_eq!(
                        project.host_bindings().len(),
                        if index & 1 == 0 { 12 } else { 10 }
                    );
                }
            }
            running.store(false, Ordering::Release);
        });
        component.publish_pending();
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    struct TestEvents(Vec<Event>);
    impl Class for TestEvents {
        type Interfaces = (IEventList,);
    }
    impl IEventListTrait for TestEvents {
        unsafe fn getEventCount(&self) -> i32 {
            self.0.len() as i32
        }
        unsafe fn getEvent(&self, index: i32, event: *mut Event) -> tresult {
            let Some(value) = self.0.get(index as usize) else {
                return kInvalidArgument;
            };
            if event.is_null() {
                return kInvalidArgument;
            }
            unsafe { *event = *value };
            kResultOk
        }
        unsafe fn addEvent(&self, _event: *mut Event) -> tresult {
            kNotImplemented
        }
    }

    #[test]
    fn host_save_waits_for_published_graph_generation() {
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let saved = component.capture_published_state().unwrap();
        let tone = include_bytes!("../../../projects/graph-workspace/tone-texture.json");
        assert_eq!(component.restore_bytes(tone.to_vec()), kResultOk);
        assert_eq!(component.capture_published_state().unwrap(), saved);
        assert_eq!(component.restore_bytes(DEFAULT_PROJECT.to_vec()), kResultOk);
        assert_eq!(component.restore_bytes(tone.to_vec()), kResultOk);
        assert_eq!(component.capture_published_state().unwrap(), saved);
        assert_eq!(component.restore_bytes(b"{broken".to_vec()), kResultFalse);
        assert_eq!(component.capture_published_state().unwrap(), saved);
        component.publish_pending();
        let published = component.capture_published_state().unwrap();
        let document: serde_json::Value = serde_json::from_slice(&published).unwrap();
        assert!(
            document["signal"]["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|node| node["type"] == "oscillator")
        );
        assert_eq!(component.capture_published_state().unwrap(), published);
        assert_eq!(component.restore_bytes(DEFAULT_PROJECT.to_vec()), kResultOk);
        assert_eq!(component.capture_published_state().unwrap(), published);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        assert_eq!(component.capture_published_state().unwrap(), saved);
    }

    #[test]
    fn repeated_project_imports_before_a_process_block_keep_the_latest_graph() {
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let tone = include_bytes!("../../../projects/graph-workspace/tone-texture.json");
        assert_eq!(component.restore_bytes(tone.to_vec()), kResultOk);
        assert_eq!(component.restore_bytes(DEFAULT_PROJECT.to_vec()), kResultOk);
        assert_eq!(component.restore_bytes(b"{broken".to_vec()), kResultFalse);
        component.publish_pending();
        let saved = component.capture_state().unwrap();
        let project = NativeProject::parse(&saved).unwrap();
        assert_eq!(
            slot_descriptors(&project),
            slot_descriptors(&NativeProject::parse(DEFAULT_PROJECT).unwrap())
        );
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn javascript_authored_graph_matches_native_in_vst3_callback() {
        let authored =
            include_bytes!("../../../projects/graph-workspace/authored-inverted-lfo.json");
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        assert_eq!(component.restore_bytes(authored.to_vec()), kResultOk);
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: channels.as_mut_ptr(),
            },
        };
        let mut block = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 0,
            numOutputs: 1,
            inputs: null_mut(),
            outputs: &mut output,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: null_mut(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(unsafe { component.process(&mut block) }, kResultOk);
        let project = NativeProject::parse(authored).unwrap();
        let mut reference = project.prepare_patchable_with_state(48_000., 128).unwrap();
        let mut buffers = HostBuffers::prepare(128);
        let mut expected_left = [0_f32; 128];
        let mut expected_right = [0_f32; 128];
        unsafe {
            buffers.render(
                &mut reference.processor,
                RawHostBlock {
                    frames: 128,
                    main: [std::ptr::null(), std::ptr::null()],
                    sidechain: [std::ptr::null(), std::ptr::null()],
                    output: [expected_left.as_mut_ptr(), expected_right.as_mut_ptr()],
                    events: &[],
                    automation: &[],
                },
            )
        }
        .unwrap();
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        let before_route = component.capture_published_state().unwrap();
        let generation = component
            .request_live_route(6, "cv", Some((5, "uni")))
            .unwrap();
        assert!(
            component
                .request_live_route(6, "audio", Some((5, "uni")))
                .is_none()
        );
        assert_eq!(component.capture_published_state().unwrap(), before_route);
        reference
            .processor
            .set_route_from(6_u32.into(), 1, Some((5_u32.into(), 2)))
            .unwrap();
        assert_eq!(unsafe { component.process(&mut block) }, kResultOk);
        unsafe {
            buffers.render(
                &mut reference.processor,
                RawHostBlock {
                    frames: 128,
                    main: [std::ptr::null(), std::ptr::null()],
                    sidechain: [std::ptr::null(), std::ptr::null()],
                    output: [expected_left.as_mut_ptr(), expected_right.as_mut_ptr()],
                    events: &[],
                    automation: &[],
                },
            )
        }
        .unwrap();
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
        assert_eq!(component.live_routes.accepted(), generation);
        assert_ne!(component.capture_published_state().unwrap(), before_route);
        let saved = component.capture_state().unwrap();
        NativeProject::parse(&saved).unwrap();
        let saved_json: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert!(
            saved_json["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|edge| edge["from"] == 5
                    && edge["to"] == 6
                    && edge["inputPort"] == 1
                    && edge["outputPort"] == 2)
        );
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn authored_cv_chains_match_native_in_vst3_callback() {
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
            let component = GraphProcessor::new();
            let mut setup = ProcessSetup {
                processMode: 0,
                symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
                maxSamplesPerBlock: 128,
                sampleRate: 48_000.,
            };
            assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
            assert_eq!(unsafe { component.setActive(1) }, kResultOk);
            assert_eq!(component.restore_bytes(authored.to_vec()), kResultOk);
            let mut left = [0_f32; 128];
            let mut right = [0_f32; 128];
            let mut channels = [left.as_mut_ptr(), right.as_mut_ptr()];
            let mut output = AudioBusBuffers {
                numChannels: 2,
                silenceFlags: 0,
                __field0: AudioBusBuffers__type0 {
                    channelBuffers32: channels.as_mut_ptr(),
                },
            };
            let mut block = ProcessData {
                processMode: 0,
                symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
                numSamples: 128,
                numInputs: 0,
                numOutputs: 1,
                inputs: null_mut(),
                outputs: &mut output,
                inputParameterChanges: null_mut(),
                outputParameterChanges: null_mut(),
                inputEvents: null_mut(),
                outputEvents: null_mut(),
                processContext: null_mut(),
            };
            let project = NativeProject::parse(authored).unwrap();
            let mut reference = project.prepare_patchable_with_state(48_000., 128).unwrap();
            let mut buffers = HostBuffers::prepare(128);
            let mut expected_left = [0_f32; 128];
            let mut expected_right = [0_f32; 128];
            for _ in 0..4 {
                assert_eq!(unsafe { component.process(&mut block) }, kResultOk);
                unsafe {
                    buffers.render(
                        &mut reference.processor,
                        RawHostBlock {
                            frames: 128,
                            main: [std::ptr::null(), std::ptr::null()],
                            sidechain: [std::ptr::null(), std::ptr::null()],
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
            let saved = component.capture_state().unwrap();
            NativeProject::parse(&saved).unwrap();
            let saved_json: serde_json::Value = serde_json::from_slice(&saved).unwrap();
            assert_eq!(
                saved_json["signal"]["nodes"].as_array().unwrap().len(),
                expected_nodes
            );
            assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        }
    }

    #[test]
    fn queued_route_survives_vst3_deactivation_as_next_activation_state() {
        let authored =
            include_bytes!("../../../projects/graph-workspace/authored-inverted-lfo.json");
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        assert_eq!(component.restore_bytes(authored.to_vec()), kResultOk);
        component.publish_pending();
        assert!(
            component
                .request_live_route(6, "cv", Some((5, "uni")))
                .is_some()
        );
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        let saved = component.capture_published_state().unwrap();
        let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert!(
            document["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|edge| edge["from"] == 5 && edge["to"] == 6 && edge["outputPort"] == 2)
        );
        assert!(!component.live_routes.pending());
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        assert_eq!(component.capture_published_state().unwrap(), saved);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn legacy_graph_bypass_and_fx_swap_publish_during_vst3_audio() {
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

        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let send_import = |bytes: &[u8]| {
            let message = capture_message("manifold.graph.import.v1");
            let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }.unwrap();
            assert_eq!(
                unsafe {
                    attributes.setBinary(
                        c"project".as_ptr(),
                        bytes.as_ptr().cast(),
                        bytes.len() as u32,
                    )
                },
                kResultOk
            );
            unsafe { component.notify(message.as_ptr()) }
        };
        assert_eq!(send_import(authored), kResultOk);
        let reference_component = GraphProcessor::new();
        assert_eq!(
            unsafe { reference_component.setupProcessing(&mut setup) },
            kResultOk
        );
        assert_eq!(unsafe { reference_component.setActive(1) }, kResultOk);
        assert_eq!(
            reference_component.restore_bytes(authored.to_vec()),
            kResultOk
        );
        let mut input_left: [f32; 128] = std::array::from_fn(|i| ((i % 16) as f32 - 8.) / 8.);
        let mut input_right: [f32; 128] =
            std::array::from_fn(|i| (((i * 3) % 16) as f32 - 8.) / 8.);
        let mut input_channels = [input_left.as_mut_ptr(), input_right.as_mut_ptr()];
        let mut input = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: input_channels.as_mut_ptr(),
            },
        };
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut output_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: output_channels.as_mut_ptr(),
            },
        };
        let mut data = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 1,
            numOutputs: 1,
            inputs: &mut input,
            outputs: &mut output,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: null_mut(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        assert!(left.iter().any(|sample| sample.abs() > 0.01));
        let mut reference_left = [0_f32; 128];
        let mut reference_right = [0_f32; 128];
        let mut reference_channels = [reference_left.as_mut_ptr(), reference_right.as_mut_ptr()];
        let mut reference_output = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: reference_channels.as_mut_ptr(),
            },
        };
        let mut reference_data = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 1,
            numOutputs: 1,
            inputs: &mut input,
            outputs: &mut reference_output,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: null_mut(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(
            unsafe { reference_component.process(&mut reference_data) },
            kResultOk
        );
        assert_eq!(left, reference_left);
        assert_eq!(right, reference_right);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
            assert_eq!(
                unsafe { reference_component.process(&mut reference_data) },
                kResultOk
            );
        }
        assert_eq!(left, reference_left);
        assert_eq!(right, reference_right);
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
        assert_eq!(
            send_import(&serde_json::to_vec(&renumbered).unwrap()),
            kResultOk
        );
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        assert_eq!(
            unsafe { reference_component.process(&mut reference_data) },
            kResultOk
        );
        assert_eq!(left, reference_left);
        assert_eq!(right, reference_right);
        let wet = left;
        let published = component.capture_published_state().unwrap();
        let published_document: serde_json::Value = serde_json::from_slice(&published).unwrap();
        assert_eq!(published_document["instances"].as_array().unwrap().len(), 2);
        assert_eq!(
            published_document["signal"]["nodes"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        assert_eq!(send_import(&bypass), kResultOk);
        assert_eq!(component.capture_published_state().unwrap(), published);
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        assert!(left.iter().zip(wet).any(|(a, b)| (a - b).abs() > 0.05));
        let saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(gain_slots), kResultOk);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        let gain_audio = left;
        let gain_published = component.capture_published_state().unwrap();
        let gain_state: serde_json::Value = serde_json::from_slice(&gain_published).unwrap();
        assert_eq!(gain_state["signal"]["nodes"].as_array().unwrap().len(), 10);
        assert_eq!(gain_state["controls"].as_array().unwrap().len(), 6);
        assert_eq!(send_import(width_slot), kResultOk);
        assert_eq!(component.capture_published_state().unwrap(), gain_published);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        assert!(
            left.iter()
                .zip(gain_audio)
                .any(|(a, b)| (a - b).abs() > 0.03)
        );
        let width_state: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
        assert_eq!(width_state["signal"]["nodes"].as_array().unwrap().len(), 12);
        assert_eq!(width_state["controls"].as_array().unwrap()[1]["value"], 1);
        let rack_filter =
            include_bytes!("../../../projects/graph-workspace/authored-rack-filter.json");
        let rack_fx = include_bytes!("../../../projects/graph-workspace/authored-rack-fx.json");
        let rack_eq = include_bytes!("../../../projects/graph-workspace/authored-rack-eq.json");
        assert_eq!(send_import(rack_filter), kResultOk);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        let filter_audio = left;
        assert_eq!(send_import(rack_fx), kResultOk);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        assert!(
            left.iter()
                .zip(filter_audio)
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        let fx_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(rack_eq), kResultOk);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        assert!(
            left.iter()
                .zip(filter_audio)
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        let rack_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(rack_blend), kResultOk);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        let blend_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(rack_ring), kResultOk);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        let ring_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
            assert_eq!(send_import(bytes), kResultOk);
            for _ in 0..12 {
                assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
            }
            let saved: serde_json::Value =
                serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
            assert_eq!(send_import(bytes), kResultOk);
            for _ in 0..12 {
                assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
            }
            let saved: serde_json::Value =
                serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(rack_oscillator), kResultOk);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        let oscillator_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(rack_voice), kResultOk);
        for _ in 0..12 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        let voice_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(vocoder), kResultOk);
        for _ in 0..64 {
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        }
        assert!(left.iter().any(|sample| sample.abs() > 0.01));
        let vocoder_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(rack_sample), kResultOk);
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        let sample_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
        assert_eq!(sample_saved["assets"].as_array().unwrap().len(), 1);
        assert_eq!(sample_saved["sampleBindings"].as_array().unwrap().len(), 7);
        let rack_sample_host = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-sample.json"
        );
        assert_eq!(send_import(rack_sample_host), kResultOk);
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        let rack_sample_saved: serde_json::Value =
            serde_json::from_slice(&component.capture_published_state().unwrap()).unwrap();
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
        assert_eq!(send_import(b"{invalid"), kResultFalse);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        assert_eq!(unsafe { reference_component.setActive(0) }, kResultOk);
    }

    #[test]
    fn vst3_editor_route_message_returns_generation_and_published_status() {
        let authored =
            include_bytes!("../../../projects/graph-workspace/authored-inverted-lfo.json");
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        assert_eq!(component.restore_bytes(authored.to_vec()), kResultOk);
        component.publish_pending();
        let message = capture_message("manifold.graph.route.v1");
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }.unwrap();
        let request = br#"{"to":6,"input":"cv","from":5,"output":"uni"}"#;
        assert_eq!(
            unsafe {
                attributes.setBinary(
                    c"route".as_ptr(),
                    request.as_ptr().cast(),
                    request.len() as u32,
                )
            },
            kResultOk
        );
        assert_eq!(unsafe { component.notify(message.as_ptr()) }, kResultOk);
        let mut data: *const c_void = std::ptr::null();
        let mut size = 0;
        assert_eq!(
            unsafe { attributes.getBinary(c"generation".as_ptr(), &mut data, &mut size) },
            kResultOk
        );
        assert_eq!(size, 8);
        let generation = u64::from_le_bytes(
            unsafe { std::slice::from_raw_parts(data.cast::<u8>(), 8) }
                .try_into()
                .unwrap(),
        );
        let query = capture_message("manifold.graph.route.status.v1");
        let query_attrs = unsafe { ComRef::from_raw(query.getAttributes()) }.unwrap();
        assert_eq!(
            unsafe {
                query_attrs.setBinary(
                    c"generation".as_ptr(),
                    generation.to_le_bytes().as_ptr().cast(),
                    8,
                )
            },
            kResultOk
        );
        assert_eq!(unsafe { component.notify(query.as_ptr()) }, kResultOk);
        assert_eq!(
            unsafe { query_attrs.getBinary(c"status".as_ptr(), &mut data, &mut size) },
            kResultOk
        );
        assert_eq!(unsafe { *data.cast::<u8>() }, 0);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn vst3_note_event_matches_native_graph_output() {
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);

        let mut note: Event = unsafe { std::mem::zeroed() };
        note.busIndex = 0;
        note.sampleOffset = 16;
        note.r#type = Event_::EventTypes_::kNoteOnEvent as u16;
        note.__field0.noteOn = NoteOnEvent {
            channel: 0,
            pitch: 60,
            tuning: 0.,
            velocity: 1.,
            length: 0,
            noteId: 1,
        };
        let list = ComWrapper::new(TestEvents(vec![note]))
            .to_com_ptr::<IEventList>()
            .unwrap();
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut output_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output_bus = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: output_channels.as_mut_ptr(),
            },
        };
        let mut data = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 0,
            numOutputs: 1,
            inputs: null_mut(),
            outputs: &mut output_bus,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: list.as_ptr(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);

        let project = NativeProject::parse(DEFAULT_PROJECT).unwrap();
        let mut reference = project.prepare_with_state(48_000., 128).unwrap();
        let mut reference_buffers = HostBuffers::prepare(128);
        let mut expected_left = [0_f32; 128];
        let mut expected_right = [0_f32; 128];
        unsafe {
            reference_buffers.render(
                &mut reference.processor,
                RawHostBlock {
                    frames: 128,
                    main: [std::ptr::null(), std::ptr::null()],
                    sidechain: [std::ptr::null(), std::ptr::null()],
                    output: [expected_left.as_mut_ptr(), expected_right.as_mut_ptr()],
                    events: &[TimedEvent {
                        offset: 16,
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
        }
        .unwrap();
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn vst3_audio_callback_captures_sidechain_and_publishes_portable_sample() {
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let authored =
            include_bytes!("../../../projects/graph-workspace/retrospective-multisource.json");
        assert_eq!(component.restore_bytes(authored.to_vec()), kResultOk);
        component.sidechain_active.store(true, Ordering::Release);
        let mut main_left = [0.25_f32; 128];
        let mut main_right = [0.25_f32; 128];
        let mut side_left = [-0.5_f32; 128];
        let mut side_right = [-0.5_f32; 128];
        let mut main_channels = [main_left.as_mut_ptr(), main_right.as_mut_ptr()];
        let mut side_channels = [side_left.as_mut_ptr(), side_right.as_mut_ptr()];
        let mut inputs = [
            AudioBusBuffers {
                numChannels: 2,
                silenceFlags: 0,
                __field0: AudioBusBuffers__type0 {
                    channelBuffers32: main_channels.as_mut_ptr(),
                },
            },
            AudioBusBuffers {
                numChannels: 2,
                silenceFlags: 0,
                __field0: AudioBusBuffers__type0 {
                    channelBuffers32: side_channels.as_mut_ptr(),
                },
            },
        ];
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut output_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: output_channels.as_mut_ptr(),
            },
        };
        let mut data = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 2,
            numOutputs: 1,
            inputs: inputs.as_mut_ptr(),
            outputs: &mut output,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: null_mut(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        for _ in 0..75 {
            assert_eq!(
                callback_heap::measure(|| unsafe { component.process(&mut data) }),
                kResultOk
            );
        }
        assert!(!component.request_capture(10, 1_440_001));
        let start = capture_message("manifold.graph.capture.start.v1");
        let start_attributes = unsafe { ComRef::from_raw(start.getAttributes()) }.unwrap();
        let mut request = [0_u8; 12];
        request[..4].copy_from_slice(&10_u32.to_le_bytes());
        request[4..].copy_from_slice(&0.2_f64.to_le_bytes());
        assert_eq!(
            unsafe { start_attributes.setBinary(c"request".as_ptr(), request.as_ptr().cast(), 12) },
            kResultOk
        );
        assert_eq!(unsafe { component.notify(start.as_ptr()) }, kResultOk);
        assert!(!component.request_capture(6, 9_600));
        let mut published = false;
        for _ in 0..100 {
            assert_eq!(
                callback_heap::measure(|| unsafe { component.process(&mut data) }),
                kResultOk
            );
            let finish = capture_message("manifold.graph.capture.finish.v1");
            let attributes = unsafe { ComRef::from_raw(finish.getAttributes()) }.unwrap();
            let instrument = 5_u32.to_le_bytes();
            assert_eq!(
                unsafe { attributes.setBinary(c"instrument".as_ptr(), instrument.as_ptr().cast(), 4) },
                kResultOk
            );
            assert_eq!(unsafe { component.notify(finish.as_ptr()) }, kResultOk);
            let mut status_data: *const c_void = std::ptr::null();
            let mut status_size = 0;
            assert_eq!(
                unsafe { attributes.getBinary(c"status".as_ptr(), &mut status_data, &mut status_size) },
                kResultOk
            );
            assert_eq!(status_size, 1);
            let status = unsafe { *(status_data.cast::<u8>()) };
            assert_ne!(status, 2, "capture rejected");
            if status == 1 {
                let mut project_data: *const c_void = std::ptr::null();
                let mut project_size = 0;
                assert_eq!(
                    unsafe {
                        attributes.getBinary(c"project".as_ptr(), &mut project_data, &mut project_size)
                    },
                    kResultOk
                );
                assert!(
                    NativeProject::parse(unsafe {
                        std::slice::from_raw_parts(project_data.cast::<u8>(), project_size as usize)
                    })
                    .is_ok()
                );
                published = true;
                break;
            }
        }
        assert!(published);
        let saved = component.capture_state().unwrap();
        let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(document["signal"]["selectedCaptureNodeId"], 10);
        assert_eq!(document["assets"][0]["frames"], 9_600);
        let mut note: Event = unsafe { std::mem::zeroed() };
        note.busIndex = 0;
        note.r#type = Event_::EventTypes_::kNoteOnEvent as u16;
        note.__field0.noteOn = NoteOnEvent {
            channel: 0,
            pitch: 60,
            tuning: 0.,
            velocity: 1.,
            length: 0,
            noteId: 1,
        };
        let list = ComWrapper::new(TestEvents(vec![note]))
            .to_com_ptr::<IEventList>()
            .unwrap();
        data.inputEvents = list.as_ptr();
        assert_eq!(
            callback_heap::measure(|| unsafe { component.process(&mut data) }),
            kResultOk
        );
        assert!(left.iter().any(|sample| *sample < -0.01));
        data.inputEvents = null_mut();
        let mailbox = component.capture_mailbox().unwrap();
        assert!(mailbox.request(10, 9_600));
        let mut second = None;
        for _ in 0..100 {
            assert_eq!(
                callback_heap::measure(|| unsafe { component.process(&mut data) }),
                kResultOk
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
        let arm = capture_message("manifold.graph.capture.free.arm.v1");
        let arm_attributes = unsafe { ComRef::from_raw(arm.getAttributes()) }.unwrap();
        let node = 10_u32.to_le_bytes();
        assert_eq!(
            unsafe { arm_attributes.setBinary(c"node".as_ptr(), node.as_ptr().cast(), 4) },
            kResultOk
        );
        assert_eq!(unsafe { component.notify(arm.as_ptr()) }, kResultOk);
        assert_eq!(
            callback_heap::measure(|| unsafe { component.process(&mut data) }),
            kResultOk
        );
        let old_runtime = component.current.load(Ordering::Acquire);
        let old_mailbox = component.capture_mailbox().unwrap();
        let mut edited: serde_json::Value =
            serde_json::from_slice(&component.capture_state().unwrap()).unwrap();
        for node in edited["signal"]["nodes"].as_array_mut().unwrap() {
            if node["type"] == "retrospective-capture" {
                node["a"] = serde_json::json!(31);
            }
            if node["id"] == 9 {
                node["a"] = serde_json::json!(2);
            }
        }
        assert_eq!(
            component.restore_graph_with_parameter_baseline(
                serde_json::to_vec(&edited).unwrap(),
                true,
                PackageUpdate::Preserve,
                None,
                false
            ),
            kResultOk
        );
        assert!(!component.pending.load(Ordering::Acquire).is_null());
        assert!(Arc::ptr_eq(
            &old_mailbox,
            &component.capture_mailbox().unwrap()
        ));
        for _ in 0..2 {
            assert_eq!(
                callback_heap::measure(|| unsafe { component.process(&mut data) }),
                kResultOk
            );
            assert_eq!(
                component.current.load(Ordering::Acquire),
                old_runtime,
                "armed take keeps its audio owner"
            );
        }

        let stop = capture_message("manifold.graph.capture.free.stop.v1");
        let stop_attributes = unsafe { ComRef::from_raw(stop.getAttributes()) }.unwrap();
        assert_eq!(
            unsafe { stop_attributes.setBinary(c"node".as_ptr(), node.as_ptr().cast(), 4) },
            kResultOk
        );
        assert_eq!(unsafe { component.notify(stop.as_ptr()) }, kResultOk);
        let mut free_published = false;
        for _ in 0..100 {
            assert_eq!(
                callback_heap::measure(|| unsafe { component.process(&mut data) }),
                kResultOk
            );
            if let Some(result) = component.finish_capture(5, "VST3 free take") {
                assert!(result);
                free_published = true;
                break;
            }
        }
        assert!(free_published);
        let free_state: serde_json::Value =
            serde_json::from_slice(&component.capture_state().unwrap()).unwrap();
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
            callback_heap::measure(|| unsafe { component.process(&mut data) }),
            kResultOk
        );
        let adopted_mailbox = component.capture_mailbox().unwrap();
        assert_eq!(adopted_mailbox.max_frames(), 31 * 48_000);
        assert!(!Arc::ptr_eq(&old_mailbox, &adopted_mailbox));
        assert_eq!(component.restore_bytes(authored.to_vec()), kResultOk);
        assert_eq!(
            callback_heap::measure(|| unsafe { component.process(&mut data) }),
            kResultOk
        );
        let fresh_mailbox = component.capture_mailbox().unwrap();
        assert!(fresh_mailbox.request(10, 9_600));
        let mut fresh = None;
        for _ in 0..100 {
            assert_eq!(
                callback_heap::measure(|| unsafe { component.process(&mut data) }),
                kResultOk
            );
            if let Some(result) = fresh_mailbox.take() {
                fresh = Some(result.unwrap());
                break;
            }
        }
        assert_eq!(
            fresh.expect("import capture completed").stereo()[0],
            0.0,
            "a separate project import starts fresh capture history"
        );
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    fn browser_capture_reopens_and_plays_in_vst3(
        bytes: &[u8],
        expected_mode: &str,
        expected_frames: u64,
    ) {
        let component = GraphProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        assert_eq!(component.restore_bytes(bytes.to_vec()), kResultOk);

        let mut note: Event = unsafe { std::mem::zeroed() };
        note.busIndex = 0;
        note.sampleOffset = 0;
        note.r#type = Event_::EventTypes_::kNoteOnEvent as u16;
        note.__field0.noteOn = NoteOnEvent {
            channel: 0,
            pitch: 60,
            tuning: 0.,
            velocity: 1.,
            length: 0,
            noteId: 1,
        };
        let list = ComWrapper::new(TestEvents(vec![note]))
            .to_com_ptr::<IEventList>()
            .unwrap();
        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        let mut output_channels = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut output_bus = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: output_channels.as_mut_ptr(),
            },
        };
        let mut data = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 0,
            numOutputs: 1,
            inputs: null_mut(),
            outputs: &mut output_bus,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: list.as_ptr(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
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
                        main: [std::ptr::null(); 2],
                        sidechain: [std::ptr::null(); 2],
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
        let saved = component.capture_state().unwrap();
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
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn browser_two_source_capture_reopens_and_plays_in_vst3() {
        browser_capture_reopens_and_plays_in_vst3(
            include_bytes!("../../../artifacts/fixtures/two-source-browser-capture.json"),
            "bars",
            9_600,
        );
    }

    #[test]
    fn standalone_sample_browser_take_reopens_and_plays_in_vst3() {
        browser_capture_reopens_and_plays_in_vst3(
            include_bytes!("../../../web/public/standalone-sample-browser-project.json"),
            "seconds",
            24_000,
        );
    }
}
