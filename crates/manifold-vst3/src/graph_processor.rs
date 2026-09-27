//! VST3 component for portable browser-authored graph bundles.
//! Preparation, JSON and asset decoding stay off the audio callback.

use std::ffi::CStr;
use std::ptr::null_mut;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crossbeam_queue::ArrayQueue;
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::capture_mailbox::{AudioCaptureWorker, CaptureMailbox};
use manifold_native::host_buffers::{HostBuffers, RawHostBlock};
use manifold_native::host_values::ValueBank;
use manifold_native::parameters::{
    HOST_SLOT_BASE, HOST_SLOT_COUNT, HostParameter, TimedAutomation,
};
use manifold_native::project::{NativeProject, PreparedNativeProject};
use vst3::{Class, ComPtr, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::graph_contract::{DEFAULT_PROJECT, normalized_values, slot_descriptors};
use crate::graph_controller::GraphController;
use crate::util::{copy_wstring, read_stream, write_stream};

const MAX_MESSAGES: usize = 1024;

struct Runtime {
    capture_worker: Option<AudioCaptureWorker>,
    values: Arc<ValueBank>,
    prepared: PreparedNativeProject,
    buffers: HostBuffers,
    automation: Vec<TimedAutomation>,
    events: Vec<TimedEvent>,
    slot_indices: [Option<usize>; HOST_SLOT_COUNT],
    midi_node: Option<u64>,
}

pub(crate) struct GraphProcessor {
    current: AtomicPtr<Runtime>,
    pending: AtomicPtr<Runtime>,
    retired: ArrayQueue<usize>,
    active: AtomicBool,
    configuration: Mutex<Option<(f32, usize)>>,
    state: Mutex<Vec<u8>>,
    descriptors: Mutex<[Option<HostParameter>; HOST_SLOT_COUNT]>,
    values: Mutex<Arc<ValueBank>>,
    capture_mailbox: Mutex<Option<Arc<CaptureMailbox>>>,
    sidechain_active: AtomicBool,
    sidechain_arrangement: AtomicU64,
    peer: Mutex<Option<ComPtr<IConnectionPoint>>>,
}

// VST3 serializes process calls for one component; only that callback mutates
// the current runtime while active. Control-thread replacement is atomic.
unsafe impl Sync for GraphProcessor {}

impl GraphProcessor {
    pub const CID: TUID = uid(0x70477A2D, 0x9F294ED9, 0xA03E6858, 0x5A947923);

    pub fn new() -> Self {
        let project = NativeProject::parse(DEFAULT_PROJECT).expect("authored default graph");
        let descriptors = slot_descriptors(&project);
        let values = normalized_values(&descriptors);
        Self {
            current: AtomicPtr::new(null_mut()),
            pending: AtomicPtr::new(null_mut()),
            retired: ArrayQueue::new(64),
            active: AtomicBool::new(false),
            configuration: Mutex::new(None),
            state: Mutex::new(DEFAULT_PROJECT.to_vec()),
            descriptors: Mutex::new(descriptors),
            values: Mutex::new(Arc::new(ValueBank::new(values.map(|value| value as f32)))),
            capture_mailbox: Mutex::new(None),
            sidechain_active: AtomicBool::new(false),
            sidechain_arrangement: AtomicU64::new(SpeakerArr::kStereo),
            peer: Mutex::new(None),
        }
    }

    fn prepared(
        bytes: &[u8],
        rate: f32,
        frames: usize,
        values: Arc<ValueBank>,
    ) -> Option<Box<Runtime>> {
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
        let prepared = project.prepare_with_state(rate, frames).ok()?;
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
            capture_worker: None,
            values,
            prepared,
            buffers: HostBuffers::prepare(frames),
            automation: Vec::with_capacity(MAX_MESSAGES),
            events: Vec::with_capacity(MAX_MESSAGES),
            slot_indices,
            midi_node,
        }))
    }

    fn attach_capture_worker(
        runtime: &mut Runtime,
        bytes: &[u8],
        rate: f32,
    ) -> Option<Arc<CaptureMailbox>> {
        let document: serde_json::Value = serde_json::from_slice(bytes).ok()?;
        document["signal"]["selectedCaptureNodeId"].as_u64()?;
        let frames = ((rate as usize).saturating_mul(30)).min(1_440_000);
        let mailbox = CaptureMailbox::new(frames)?;
        runtime.capture_worker = Some(AudioCaptureWorker::new(Arc::clone(&mailbox)));
        Some(mailbox)
    }

    fn request_capture(&self, node: u32, frames: usize) -> bool {
        self.capture_mailbox
            .lock()
            .ok()
            .and_then(|mailbox| mailbox.clone())
            .is_some_and(|mailbox| mailbox.request(node, frames))
    }

    fn request_capture_seconds(&self, node: u32, seconds: f64) -> bool {
        let Some(rate) = self
            .configuration
            .lock()
            .ok()
            .and_then(|value| *value)
            .map(|config| config.0 as f64)
        else {
            return false;
        };
        seconds.is_finite()
            && (0.05..=30.0).contains(&seconds)
            && self.request_capture(node, (rate * seconds).round() as usize)
    }

    /// Poll from a control thread, encode portable state, then queue a prepared
    /// replacement. `None` means the callback has not finished staging yet.
    fn finish_capture(&self, instrument: u32, label: &str) -> Option<bool> {
        let mailbox = self
            .capture_mailbox
            .lock()
            .ok()
            .and_then(|value| value.clone())?;
        let result = mailbox.take()?;
        let Ok(window) = result else {
            return Some(false);
        };
        let state = self.capture_state()?;
        let rate = self
            .configuration
            .lock()
            .ok()
            .and_then(|value| *value)?
            .0
            .round() as u32;
        let Ok(bytes) = NativeProject::embed_capture_asset(
            &state,
            window.node,
            instrument,
            window.stereo(),
            rate,
            label,
        ) else {
            return Some(false);
        };
        Some(self.restore_bytes(bytes) == kResultOk)
    }

    fn capture_state(&self) -> Option<Vec<u8>> {
        let state = self.state.lock().ok()?;
        let descriptors = self.descriptors.lock().ok()?;
        let bank = self.values.lock().ok()?;
        let values = bank.read_all();
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
        let values = std::array::from_fn(|slot| {
            runtime.slot_indices[slot]
                .and_then(|index| parameters[index].to_normalized(physical[index]))
                .unwrap_or_else(|| runtime.values.read_slot(slot))
        });
        runtime.values.write_all(values);
    }

    fn retire_old(&self) {
        while let Some(pointer) = self.retired.pop() {
            unsafe { drop(Box::from_raw(pointer as *mut Runtime)) };
        }
    }

    fn deactivate(&self) {
        self.active.store(false, Ordering::Release);
        if let Ok(mut mailbox) = self.capture_mailbox.lock() {
            *mailbox = None;
        }
        for pointer in [&self.current, &self.pending] {
            let old = pointer.swap(null_mut(), Ordering::AcqRel);
            if !old.is_null() {
                unsafe { drop(Box::from_raw(old)) };
            }
        }
        self.retire_old();
    }

    fn publish_pending(&self) {
        if self.retired.is_full() {
            return;
        }
        let pending = self.pending.swap(null_mut(), Ordering::AcqRel);
        if !pending.is_null() {
            let old = self.current.swap(pending, Ordering::AcqRel);
            self.publish_snapshot(unsafe { &*pending });
            if !old.is_null() {
                let pushed = self.retired.push(old as usize);
                debug_assert!(pushed.is_ok());
            }
        }
    }

    fn restore_bytes(&self, bytes: Vec<u8>) -> tresult {
        let Ok(project) = NativeProject::parse(&bytes) else {
            return kResultFalse;
        };
        let descriptors = slot_descriptors(&project);
        let values = normalized_values(&descriptors);
        let bank = Arc::new(ValueBank::new(values.map(|value| value as f32)));
        self.retire_old();
        let replacement = if self.active.load(Ordering::Acquire) {
            let Some((rate, frames)) = self.configuration.lock().ok().and_then(|guard| *guard)
            else {
                return kResultFalse;
            };
            let Some(mut runtime) = Self::prepared(&bytes, rate, frames, Arc::clone(&bank)) else {
                return kResultFalse;
            };
            let capture = Self::attach_capture_worker(&mut runtime, &bytes, rate);
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
        let Ok(mut mailbox) = self.capture_mailbox.lock() else {
            return kResultFalse;
        };
        *state = bytes;
        *bound = descriptors;
        *current_bank = bank;
        if let Some((runtime, capture)) = replacement {
            *mailbox = capture;
            let previous = self.pending.swap(Box::into_raw(runtime), Ordering::AcqRel);
            if !previous.is_null() {
                // The callback can only acquire a pending runtime via its own
                // atomic swap. If this swap returned it, it was never used.
                unsafe { drop(Box::from_raw(previous)) };
            }
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
        if media_type == MediaTypes_::kAudio as MediaType {
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
        let bus = unsafe { &mut *bus };
        if media_type == MediaTypes_::kAudio as MediaType {
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
        if active == 0 {
            self.deactivate();
            return kResultOk;
        }
        if self.active.load(Ordering::Acquire) {
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
        let Some(mut runtime) = Self::prepared(&state, rate, frames, bank) else {
            return kResultFalse;
        };
        let capture = Self::attach_capture_worker(&mut runtime, &state, rate);
        let Ok(mut mailbox) = self.capture_mailbox.lock() else {
            return kResultFalse;
        };
        *mailbox = capture;
        self.publish_snapshot(&runtime);
        self.current
            .store(Box::into_raw(runtime), Ordering::Release);
        self.active.store(true, Ordering::Release);
        kResultOk
    }
    unsafe fn setState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = (unsafe { read_stream(stream) }) else {
            return kResultFalse;
        };
        self.restore_bytes(bytes)
    }
    unsafe fn getState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = self.capture_state() else {
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
        if kind == b"manifold.graph.capture.start.v1" {
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
            let seconds = f64::from_le_bytes(bytes[4..12].try_into().unwrap());
            return if self.request_capture_seconds(node, seconds) {
                kResultOk
            } else {
                kResultFalse
            };
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
        if kind != b"manifold.graph.import.v1" {
            return kResultFalse;
        }
        let mut data: *const std::ffi::c_void = std::ptr::null();
        let mut size = 0;
        if unsafe { attributes.getBinary(c"project".as_ptr(), &mut data, &mut size) } != kResultOk
            || data.is_null()
            || size == 0
            || size > 45 * 1024 * 1024
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
    unsafe fn setProcessing(&self, _state: TBool) -> tresult {
        kResultOk
    }
    unsafe fn process(&self, data: *mut ProcessData) -> tresult {
        if data.is_null() || !self.active.load(Ordering::Acquire) {
            return kResultFalse;
        }
        let data = unsafe { &mut *data };
        if data.symbolicSampleSize != SymbolicSampleSizes_::kSample32 as i32 || data.numSamples < 0
        {
            return kResultFalse;
        }
        self.publish_pending();
        let pointer = self.current.load(Ordering::Acquire);
        if pointer.is_null() {
            return kResultFalse;
        }
        let runtime = unsafe { &mut *pointer };
        if let Some(worker) = runtime.capture_worker.as_mut() {
            worker.service(&mut runtime.prepared.processor);
        }
        let frames = data.numSamples as usize;
        if !unsafe { collect_automation(data.inputParameterChanges, frames, runtime) }
            || !unsafe { collect_events(data.inputEvents, frames, runtime) }
        {
            return kResultFalse;
        }
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
        let Some(output) = (unsafe { audio_bus(data.outputs, data.numOutputs, 0, false) }) else {
            return kResultFalse;
        };
        if unsafe {
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
        .is_err()
        {
            return kResultFalse;
        }
        if let Some(worker) = runtime.capture_worker.as_mut() {
            worker.service(&mut runtime.prepared.processor);
        }
        if !runtime.automation.is_empty() {
            self.publish_snapshot(runtime);
        }
        if data.numOutputs == 1 && !data.outputs.is_null() {
            unsafe { (*data.outputs).silenceFlags = 0 };
        }
        kResultOk
    }
    unsafe fn getTailSamples(&self) -> u32 {
        kInfiniteTail
    }
}

impl IProcessContextRequirementsTrait for GraphProcessor {
    unsafe fn getProcessContextRequirements(&self) -> u32 {
        0
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
    if count < 0 || count > HOST_SLOT_COUNT as i32 {
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
        if slot >= HOST_SLOT_COUNT || runtime.slot_indices[slot].is_none() {
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
                id,
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
        let kind = match event.r#type as u32 {
            Event_::EventTypes_::kNoteOnEvent => {
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
            Event_::EventTypes_::kNoteOffEvent => {
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
    use super::*;
    use manifold_native::host_buffers::{HostBuffers, RawHostBlock};
    use std::collections::BTreeMap;
    use std::ffi::{CString, c_void};
    use vst3::ComWrapper;

    type AttrID = *const std::ffi::c_char;

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
        let descriptors = *component.descriptors.lock().unwrap();
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
        let bank = Arc::clone(&component.values.lock().unwrap());
        let initial = bank.read_all();
        std::thread::scope(|scope| {
            scope.spawn(|| {
                for index in 0..20_000 {
                    let mut values = initial;
                    values[first_slot] = if index & 1 == 0 { 0.2 } else { 0.8 };
                    values[second_slot] = if index & 1 == 0 { 0.8 } else { 0.2 };
                    bank.write_all(values);
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
                if (pair.0 - initial[first_slot]).abs() > 1e-5
                    || (pair.1 - initial[second_slot]).abs() > 1e-5
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
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
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
            assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
            let finish = capture_message("manifold.graph.capture.finish.v1");
            let attributes = unsafe { ComRef::from_raw(finish.getAttributes()) }.unwrap();
            let instrument = 5_u32.to_le_bytes();
            assert_eq!(
                unsafe {
                    attributes.setBinary(c"instrument".as_ptr(), instrument.as_ptr().cast(), 4)
                },
                kResultOk
            );
            assert_eq!(unsafe { component.notify(finish.as_ptr()) }, kResultOk);
            let mut status_data: *const c_void = std::ptr::null();
            let mut status_size = 0;
            assert_eq!(
                unsafe {
                    attributes.getBinary(c"status".as_ptr(), &mut status_data, &mut status_size)
                },
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
                        attributes.getBinary(
                            c"project".as_ptr(),
                            &mut project_data,
                            &mut project_size,
                        )
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
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        assert!(left.iter().any(|sample| *sample < -0.01));
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn browser_two_source_capture_reopens_and_plays_in_vst3() {
        let bytes = include_bytes!("../../../artifacts/fixtures/two-source-browser-capture.json");
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
        assert_eq!(document["signal"]["selectedCaptureNodeId"], 10);
        assert_eq!(document["signal"]["captureWindowMode"], "bars");
        assert_eq!(document["signal"]["captureWindowBars"], 0.1);
        assert_eq!(document["signal"]["captureTempoBpm"], 120);
        assert_eq!(document["assets"][0]["frames"], 9_600);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }
}
