//! VST3 audio component for the assembled Main instrument.

use std::ptr::null_mut;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, Ordering};
use std::time::{Duration, Instant};

use manifold_core::events::EventKind;
use manifold_native::main_host::{MainAudioRuntime, MainControl};
use manifold_native::main_host_buffers::{MainHostBuffers, RawMainHostBlock};
use manifold_native::main_instrument::{MainHostAudioBlock, MainHostEvent, MainHostEventKind};
use manifold_native::main_session::{default_main_session, prepare_main_session};
use vst3::{Class, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::main_controller::MainController;
use crate::main_values::normalized_to_plain;
use crate::util::{copy_wstring, read_stream_limited, write_stream};

// A host may send one point per sample for every Main parameter. Reserve the
// bounded event workspace on activation so those dense queues never allocate
// or get partially applied in the audio callback.
const MAX_EVENTS: usize = 65_536;
const MAX_STATE: usize = 300 * 1024 * 1024;

struct Runtime {
    audio: MainAudioRuntime,
    buffers: MainHostBuffers,
    tagged: Vec<(usize, MainHostEvent)>,
    actions: Vec<MainHostEvent>,
}

pub(crate) struct MainProcessor {
    runtime: AtomicPtr<Runtime>,
    control: Mutex<Option<MainControl>>,
    configuration: Mutex<Option<(f32, usize)>>,
    state: Mutex<Option<Vec<u8>>>,
    active: AtomicBool,
    processing: AtomicBool,
}

// VST3 serializes process calls on one component. The control endpoint uses
// lock-free mailboxes to publish state to its audio endpoint.
unsafe impl Sync for MainProcessor {}

impl MainProcessor {
    pub const CID: TUID = uid(0xD7B71650, 0x2C07478A, 0xA6590A54, 0x43953A71);

    pub fn new() -> Self {
        Self {
            runtime: AtomicPtr::new(null_mut()),
            control: Mutex::new(None),
            configuration: Mutex::new(None),
            state: Mutex::new(None),
            active: AtomicBool::new(false),
            processing: AtomicBool::new(false),
        }
    }

    fn deactivate(&self) {
        self.processing.store(false, Ordering::Release);
        self.active.store(false, Ordering::Release);
        let runtime = self.runtime.swap(null_mut(), Ordering::AcqRel);
        if !runtime.is_null() {
            unsafe { drop(Box::from_raw(runtime)) };
        }
        if let Ok(mut control) = self.control.lock() {
            *control = None;
        }
    }

    fn offline_block(runtime: &mut Runtime) -> bool {
        let mut left = [];
        let mut right = [];
        runtime
            .audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &[],
            })
            .is_ok()
    }

    fn snapshot(&self) -> Option<Vec<u8>> {
        let pointer = self.runtime.load(Ordering::Acquire);
        if pointer.is_null() {
            return self
                .state
                .lock()
                .ok()
                .and_then(|state| state.clone())
                .or_else(|| {
                    default_main_session(48_000.0)
                        .ok()
                        .and_then(|value| serde_json::to_vec(&value).ok())
                });
        }
        let offline = !self.processing.load(Ordering::Acquire);
        let mut control = self.control.lock().ok()?;
        let control = control.as_mut()?;
        if offline && !Self::offline_block(unsafe { &mut *pointer }) {
            return None;
        }
        control.request_session_snapshot().ok()?;
        let deadline = Instant::now() + Duration::from_secs(20);
        loop {
            if offline && !Self::offline_block(unsafe { &mut *pointer }) {
                return None;
            }
            if let Some(bytes) = control.poll_session_snapshot().ok()? {
                if let Ok(mut state) = self.state.lock() {
                    *state = Some(bytes.clone());
                }
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
}

impl Drop for MainProcessor {
    fn drop(&mut self) {
        self.deactivate();
    }
}

impl Class for MainProcessor {
    type Interfaces = (IComponent, IAudioProcessor, IProcessContextRequirements);
}

impl IPluginBaseTrait for MainProcessor {
    unsafe fn initialize(&self, _context: *mut FUnknown) -> tresult {
        kResultOk
    }
    unsafe fn terminate(&self) -> tresult {
        self.deactivate();
        kResultOk
    }
}

impl IComponentTrait for MainProcessor {
    unsafe fn getControllerClassId(&self, id: *mut TUID) -> tresult {
        if id.is_null() {
            return kInvalidArgument;
        }
        unsafe {
            *id = MainController::CID;
        }
        kResultOk
    }
    unsafe fn setIoMode(&self, _mode: IoMode) -> tresult {
        kResultOk
    }
    unsafe fn getBusCount(&self, media_type: MediaType, direction: BusDirection) -> i32 {
        if media_type == MediaTypes_::kAudio as MediaType {
            1
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
        if index != 0 || bus.is_null() {
            return kInvalidArgument;
        }
        let bus = unsafe { &mut *bus };
        bus.mediaType = media_type;
        bus.direction = direction;
        bus.busType = BusTypes_::kMain as BusType;
        bus.flags = BusInfo_::BusFlags_::kDefaultActive as u32;
        if media_type == MediaTypes_::kAudio as MediaType {
            if direction != BusDirections_::kInput as BusDirection
                && direction != BusDirections_::kOutput as BusDirection
            {
                return kInvalidArgument;
            }
            bus.channelCount = 2;
            copy_wstring(
                if direction == BusDirections_::kInput as BusDirection {
                    "Main In"
                } else {
                    "Main Out"
                },
                &mut bus.name,
            );
        } else if media_type == MediaTypes_::kEvent as MediaType
            && direction == BusDirections_::kInput as BusDirection
        {
            bus.channelCount = 16;
            copy_wstring("MIDI In", &mut bus.name);
        } else {
            return kInvalidArgument;
        }
        kResultOk
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
        _state: TBool,
    ) -> tresult {
        if index == 0
            && (media_type == MediaTypes_::kAudio as MediaType
                && (direction == BusDirections_::kInput as BusDirection
                    || direction == BusDirections_::kOutput as BusDirection)
                || media_type == MediaTypes_::kEvent as MediaType
                    && direction == BusDirections_::kInput as BusDirection)
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
        let Ok((mut audio, mut control)) = MainAudioRuntime::prepare(rate, frames) else {
            return kResultFalse;
        };
        let state = self.state.lock().ok().and_then(|state| state.clone());
        if let Some(bytes) = state {
            if control.submit_session(&bytes).is_err() {
                return kResultFalse;
            }
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
                return kResultFalse;
            }
            control.reclaim();
        }
        let runtime = Box::new(Runtime {
            audio,
            buffers: MainHostBuffers::prepare(frames),
            tagged: Vec::with_capacity(MAX_EVENTS),
            actions: Vec::with_capacity(MAX_EVENTS),
        });
        if let Ok(mut slot) = self.control.lock() {
            *slot = Some(control);
        } else {
            return kResultFalse;
        }
        self.runtime
            .store(Box::into_raw(runtime), Ordering::Release);
        self.active.store(true, Ordering::Release);
        kResultOk
    }
    unsafe fn setState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = (unsafe { read_stream_limited(stream, MAX_STATE) }) else {
            return kResultFalse;
        };
        let pointer = self.runtime.load(Ordering::Acquire);
        if pointer.is_null() {
            let Ok(document) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
                return kResultFalse;
            };
            let Some(rate) = document["sampleRate"].as_f64() else {
                return kResultFalse;
            };
            if prepare_main_session(&bytes, rate as f32, 128).is_err() {
                return kResultFalse;
            }
        } else {
            let Ok(mut slot) = self.control.lock() else {
                return kResultFalse;
            };
            let Some(control) = slot.as_mut() else {
                return kResultFalse;
            };
            if control.submit_session(&bytes).is_err() {
                return kResultFalse;
            }
        }
        if let Ok(mut state) = self.state.lock() {
            *state = Some(bytes);
            kResultOk
        } else {
            kResultFalse
        }
    }
    unsafe fn getState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = self.snapshot() else {
            return kResultFalse;
        };
        if unsafe { write_stream(stream, &bytes) } {
            kResultOk
        } else {
            kResultFalse
        }
    }
}

impl IAudioProcessorTrait for MainProcessor {
    unsafe fn setBusArrangements(
        &self,
        inputs: *mut SpeakerArrangement,
        n_inputs: i32,
        outputs: *mut SpeakerArrangement,
        n_outputs: i32,
    ) -> tresult {
        if n_inputs == 1
            && n_outputs == 1
            && !inputs.is_null()
            && !outputs.is_null()
            && unsafe { *inputs == SpeakerArr::kStereo && *outputs == SpeakerArr::kStereo }
        {
            kResultTrue
        } else {
            kResultFalse
        }
    }
    unsafe fn getBusArrangement(
        &self,
        direction: BusDirection,
        index: i32,
        arrangement: *mut SpeakerArrangement,
    ) -> tresult {
        if index != 0
            || arrangement.is_null()
            || (direction != BusDirections_::kInput as BusDirection
                && direction != BusDirections_::kOutput as BusDirection)
        {
            return kInvalidArgument;
        }
        unsafe {
            *arrangement = SpeakerArr::kStereo;
        }
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
            || !(8_000.0..=192_000.0).contains(&setup.sampleRate)
            || !(1..=65_536).contains(&setup.maxSamplesPerBlock)
        {
            return kResultFalse;
        }
        if let Ok(mut config) = self.configuration.lock() {
            *config = Some((setup.sampleRate as f32, setup.maxSamplesPerBlock as usize));
            kResultOk
        } else {
            kResultFalse
        }
    }
    unsafe fn setProcessing(&self, state: TBool) -> tresult {
        self.processing.store(state != 0, Ordering::Release);
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
        let pointer = self.runtime.load(Ordering::Acquire);
        if pointer.is_null() {
            return kResultFalse;
        }
        let runtime = unsafe { &mut *pointer };
        let frames = data.numSamples as usize;
        if !unsafe { collect_actions(data, frames, runtime) } {
            return kResultFalse;
        }
        let Some(input) = (unsafe { channels(data.inputs, data.numInputs) }) else {
            return kResultFalse;
        };
        let Some(output) = (unsafe { channels(data.outputs, data.numOutputs) }) else {
            return kResultFalse;
        };
        if unsafe {
            runtime.buffers.render(
                &mut runtime.audio,
                RawMainHostBlock {
                    frames,
                    input: [input[0] as *const f32, input[1] as *const f32],
                    output,
                    actions: &runtime.actions,
                },
            )
        }
        .is_err()
        {
            return kResultFalse;
        }
        if data.numOutputs == 1 && !data.outputs.is_null() {
            unsafe {
                (*data.outputs).silenceFlags = 0;
            }
        }
        kResultOk
    }
    unsafe fn getTailSamples(&self) -> u32 {
        kInfiniteTail
    }
}

impl IProcessContextRequirementsTrait for MainProcessor {
    unsafe fn getProcessContextRequirements(&self) -> u32 {
        0
    }
}

unsafe fn channels(buses: *mut AudioBusBuffers, count: i32) -> Option<[*mut f32; 2]> {
    if count == 0 {
        return Some([null_mut(), null_mut()]);
    }
    if count != 1 || buses.is_null() {
        return None;
    }
    let bus = unsafe { &*buses };
    if bus.numChannels != 2 {
        return None;
    }
    if unsafe { bus.__field0.channelBuffers32.is_null() } {
        return Some([null_mut(), null_mut()]);
    }
    let channels = unsafe { bus.__field0.channelBuffers32 };
    Some(unsafe { [*channels, *channels.add(1)] })
}

unsafe fn collect_actions(data: &ProcessData, frames: usize, runtime: &mut Runtime) -> bool {
    runtime.tagged.clear();
    runtime.actions.clear();
    if let Some(changes) = unsafe { ComRef::from_raw(data.inputParameterChanges) } {
        let count = unsafe { changes.getParameterCount() };
        if count < 0 || count as usize > MAX_EVENTS {
            return false;
        }
        for index in 0..count {
            let Some(queue) = (unsafe { ComRef::from_raw(changes.getParameterData(index)) }) else {
                return false;
            };
            let id = unsafe { queue.getParameterId() };
            let points = unsafe { queue.getPointCount() };
            if points < 0 || points as usize > MAX_EVENTS - runtime.tagged.len() {
                return false;
            }
            for point in 0..points {
                let mut offset = 0;
                let mut normalized = 0.0;
                if unsafe { queue.getPoint(point, &mut offset, &mut normalized) } != kResultOk
                    || offset < 0
                    || (frames > 0 && offset as usize >= frames)
                    || (frames == 0 && offset != 0)
                {
                    return false;
                }
                let Some(value) = normalized_to_plain(id, normalized) else {
                    return false;
                };
                let event = MainHostEvent {
                    offset: offset as usize,
                    kind: MainHostEventKind::Parameter { id, value },
                };
                runtime.tagged.push((runtime.tagged.len(), event));
            }
        }
    }
    if let Some(events) = unsafe { ComRef::from_raw(data.inputEvents) } {
        let count = unsafe { events.getEventCount() };
        if count < 0 || count as usize > MAX_EVENTS - runtime.tagged.len() {
            return false;
        }
        for index in 0..count {
            let mut event: Event = unsafe { std::mem::zeroed() };
            if unsafe { events.getEvent(index, &mut event) } != kResultOk
                || event.sampleOffset < 0
                || (frames > 0 && event.sampleOffset as usize >= frames)
                || (frames == 0 && event.sampleOffset != 0)
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
                        || !(0.0..=1.0).contains(&note.velocity)
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
                            velocity: (note.velocity * 127.0).round().max(1.0) as u8,
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
            runtime.tagged.push((
                runtime.tagged.len(),
                MainHostEvent {
                    offset: event.sampleOffset as usize,
                    kind: MainHostEventKind::Midi(kind),
                },
            ));
        }
    }
    runtime
        .tagged
        .sort_unstable_by_key(|(sequence, event)| (event.offset, *sequence));
    runtime
        .actions
        .extend(runtime.tagged.iter().map(|(_, event)| *event));
    true
}

#[cfg(test)]
mod tests {
    use super::*;
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
            unsafe {
                *event = *value;
            }
            kResultOk
        }
        unsafe fn addEvent(&self, _event: *mut Event) -> tresult {
            kNotImplemented
        }
    }

    #[test]
    fn main_vst3_component_renders_the_shared_native_runtime() {
        let component = MainProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.0,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        assert_eq!(unsafe { component.setProcessing(1) }, kResultOk);

        let mut input_left = [0.4_f32; 128];
        let mut input_right = [0.2_f32; 128];
        let mut output_left = [0.0_f32; 128];
        let mut output_right = [0.0_f32; 128];
        let mut inputs = [input_left.as_mut_ptr(), input_right.as_mut_ptr()];
        let mut outputs = [output_left.as_mut_ptr(), output_right.as_mut_ptr()];
        let mut input_bus = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: inputs.as_mut_ptr(),
            },
        };
        let mut output_bus = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: outputs.as_mut_ptr(),
            },
        };
        let mut data = ProcessData {
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
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);

        let (mut direct, _control) = MainAudioRuntime::prepare(48_000.0, 128).unwrap();
        let mut direct_buffers = MainHostBuffers::prepare(128);
        let mut reference_left = [0.0_f32; 128];
        let mut reference_right = [0.0_f32; 128];
        unsafe {
            direct_buffers.render(
                &mut direct,
                RawMainHostBlock {
                    frames: 128,
                    input: [input_left.as_ptr(), input_right.as_ptr()],
                    output: [reference_left.as_mut_ptr(), reference_right.as_mut_ptr()],
                    actions: &[],
                },
            )
        }
        .unwrap();
        assert_eq!(output_left, reference_left);
        assert_eq!(output_right, reference_right);
        assert!(output_left.iter().any(|value| *value != 0.0));

        assert_eq!(unsafe { component.setProcessing(0) }, kResultOk);
        let state: serde_json::Value =
            serde_json::from_slice(&component.snapshot().unwrap()).unwrap();
        assert_eq!(state["id"], "manifold.main-looper");
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn main_vst3_note_starts_at_host_offset_and_invalid_event_preserves_output() {
        let component = MainProcessor::new();
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.0,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        assert_eq!(unsafe { component.setProcessing(1) }, kResultOk);
        let mut note: Event = unsafe { std::mem::zeroed() };
        note.busIndex = 0;
        note.sampleOffset = 64;
        note.r#type = Event_::EventTypes_::kNoteOnEvent as u16;
        note.__field0.noteOn = NoteOnEvent {
            channel: 0,
            pitch: 60,
            tuning: 0.0,
            velocity: 1.0,
            length: 0,
            noteId: 1,
        };
        let list = ComWrapper::new(TestEvents(vec![note]))
            .to_com_ptr::<IEventList>()
            .unwrap();
        let mut output_left = [0.0_f32; 128];
        let mut output_right = [0.0_f32; 128];
        let mut outputs = [output_left.as_mut_ptr(), output_right.as_mut_ptr()];
        let mut bus = AudioBusBuffers {
            numChannels: 2,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: outputs.as_mut_ptr(),
            },
        };
        let mut data = ProcessData {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            numSamples: 128,
            numInputs: 0,
            numOutputs: 1,
            inputs: null_mut(),
            outputs: &mut bus,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: list.as_ptr(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(unsafe { component.process(&mut data) }, kResultOk);
        assert!(output_left[..64].iter().all(|value| *value == 0.0));
        assert!(output_left[64..].iter().any(|value| *value != 0.0));

        note.sampleOffset = 128;
        let invalid = ComWrapper::new(TestEvents(vec![note]))
            .to_com_ptr::<IEventList>()
            .unwrap();
        output_left.fill(0.125);
        output_right.fill(0.125);
        data.inputEvents = invalid.as_ptr();
        assert_eq!(unsafe { component.process(&mut data) }, kResultFalse);
        assert!(output_left.iter().all(|value| *value == 0.125));
        assert_eq!(unsafe { component.setProcessing(0) }, kResultOk);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }
}
