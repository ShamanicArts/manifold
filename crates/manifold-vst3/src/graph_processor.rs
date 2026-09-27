//! VST3 component for portable browser-authored graph bundles.
//! Preparation, JSON and asset decoding stay off the audio callback.

use std::ptr::null_mut;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, AtomicU64, Ordering};

use crossbeam_queue::ArrayQueue;
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::host_buffers::{HostBuffers, RawHostBlock};
use manifold_native::parameters::{
    HOST_SLOT_BASE, HOST_SLOT_COUNT, HostParameter, TimedAutomation,
};
use manifold_native::project::{NativeProject, PreparedNativeProject};
use vst3::{Class, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::graph_contract::{DEFAULT_PROJECT, normalized_values, slot_descriptors};
use crate::graph_controller::GraphController;
use crate::util::{copy_wstring, read_stream, write_stream};

const MAX_MESSAGES: usize = 1024;

struct Runtime {
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
    normalized: [AtomicU32; HOST_SLOT_COUNT],
    sidechain_active: AtomicBool,
    sidechain_arrangement: AtomicU64,
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
            normalized: values.map(|value| AtomicU32::new((value as f32).to_bits())),
            sidechain_active: AtomicBool::new(false),
            sidechain_arrangement: AtomicU64::new(SpeakerArr::kStereo),
        }
    }

    fn prepared(bytes: &[u8], rate: f32, frames: usize) -> Option<Box<Runtime>> {
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
            prepared,
            buffers: HostBuffers::prepare(frames),
            automation: Vec::with_capacity(MAX_MESSAGES),
            events: Vec::with_capacity(MAX_MESSAGES),
            slot_indices,
            midi_node,
        }))
    }

    fn capture_state(&self) -> Option<Vec<u8>> {
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
        for (slot, index) in runtime.slot_indices.iter().enumerate() {
            if let Some(index) = index {
                if let Some(value) = parameters[*index].to_normalized(physical[*index]) {
                    self.normalized[slot].store(value.to_bits(), Ordering::Release);
                }
            }
        }
    }

    fn retire_old(&self) {
        while let Some(pointer) = self.retired.pop() {
            unsafe { drop(Box::from_raw(pointer as *mut Runtime)) };
        }
    }

    fn deactivate(&self) {
        self.active.store(false, Ordering::Release);
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
}

impl Drop for GraphProcessor {
    fn drop(&mut self) {
        self.deactivate();
    }
}

impl Class for GraphProcessor {
    type Interfaces = (IComponent, IAudioProcessor, IProcessContextRequirements);
}

impl IPluginBaseTrait for GraphProcessor {
    unsafe fn initialize(&self, _context: *mut FUnknown) -> tresult {
        kResultOk
    }
    unsafe fn terminate(&self) -> tresult {
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
        let Some(runtime) = Self::prepared(&state, rate, frames) else {
            return kResultFalse;
        };
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
        let Ok(project) = NativeProject::parse(&bytes) else {
            return kResultFalse;
        };
        let descriptors = slot_descriptors(&project);
        let values = normalized_values(&descriptors);
        self.retire_old();
        let replacement = if self.active.load(Ordering::Acquire) {
            if !self.pending.load(Ordering::Acquire).is_null() {
                return kResultFalse;
            }
            let Some((rate, frames)) = self.configuration.lock().ok().and_then(|guard| *guard)
            else {
                return kResultFalse;
            };
            let Some(runtime) = Self::prepared(&bytes, rate, frames) else {
                return kResultFalse;
            };
            Some(runtime)
        } else {
            None
        };
        let Ok(mut state) = self.state.lock() else {
            return kResultFalse;
        };
        let Ok(mut bound) = self.descriptors.lock() else {
            return kResultFalse;
        };
        *state = bytes;
        *bound = descriptors;
        for (slot, value) in values.iter().enumerate() {
            self.normalized[slot].store((*value as f32).to_bits(), Ordering::Release);
        }
        if let Some(runtime) = replacement {
            self.pending
                .store(Box::into_raw(runtime), Ordering::Release);
        }
        kResultOk
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
    use vst3::ComWrapper;

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
}
