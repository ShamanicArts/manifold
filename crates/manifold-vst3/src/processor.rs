use std::ptr::{null, null_mut};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU32, Ordering};

use crossbeam_queue::ArrayQueue;
use manifold_native::DEFAULT_TYPE_PARAMETERS;
use manifold_native::host_buffers::{HostBuffers, RawHostBlock};
use manifold_native::parameters::{HOST_SLOT_BASE, TimedAutomation};
use manifold_native::project::{NativeProject, PreparedNativeProject};
use vst3::{Class, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::controller::Controller;
use crate::util::{DEFAULTS, SOURCE_PROJECT, copy_wstring, read_stream, write_stream};

const MAX_EVENTS: usize = 1024;

struct Runtime {
    prepared: PreparedNativeProject,
    buffers: HostBuffers,
    automation: Vec<TimedAutomation>,
}

pub(crate) struct Processor {
    current: AtomicPtr<Runtime>,
    pending: AtomicPtr<Runtime>,
    retired: ArrayQueue<usize>,
    active: AtomicBool,
    configuration: Mutex<Option<(f32, usize)>>,
    state: Mutex<Vec<u8>>,
    values: [AtomicU32; 7],
    type_values: [[AtomicU32; 5]; 21],
}

// VST3 serializes process calls for one instance. Only process mutates the
// current Runtime while active; setup/state prepare a replacement off-thread.
unsafe impl Sync for Processor {}

impl Processor {
    pub const CID: TUID = uid(0x71F353A2, 0xE3144C44, 0x97F3E827, 0x5B78C063);

    pub fn new() -> Self {
        Self {
            current: AtomicPtr::new(null_mut()),
            pending: AtomicPtr::new(null_mut()),
            retired: ArrayQueue::new(64),
            active: AtomicBool::new(false),
            configuration: Mutex::new(None),
            state: Mutex::new(SOURCE_PROJECT.to_vec()),
            values: DEFAULTS.map(|value| AtomicU32::new(value.to_bits())),
            type_values: DEFAULT_TYPE_PARAMETERS
                .map(|row| row.map(|value| AtomicU32::new(value.to_bits()))),
        }
    }

    fn value(&self, index: usize) -> f32 {
        f32::from_bits(self.values[index].load(Ordering::Acquire))
    }

    fn prepared(bytes: &[u8], rate: f32, frames: usize) -> Option<Box<Runtime>> {
        let project = NativeProject::parse_fx_module(bytes).ok()?;
        let prepared = project.prepare_with_state(rate, frames).ok()?;
        Some(Box::new(Runtime {
            prepared,
            buffers: HostBuffers::prepare(frames),
            automation: Vec::with_capacity(MAX_EVENTS),
        }))
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
                serde_json::json!(std::array::from_fn::<_, 5, _>(|index| self.value(index + 2))),
            );
        }
        doc["typeParameters"] = serde_json::Value::Object(table);
        serde_json::to_vec(&doc).ok()
    }

    fn publish_snapshot(&self, runtime: &Runtime) {
        for (descriptor, value) in runtime
            .prepared
            .processor
            .host_parameters()
            .iter()
            .zip(runtime.prepared.processor.current_parameter_values())
        {
            if descriptor.node == 2 && descriptor.local_id < 7 {
                self.values[descriptor.local_id as usize].store(value.to_bits(), Ordering::Release);
            }
        }
        for effect_type in 0..21 {
            if let Some(values) = runtime
                .prepared
                .processor
                .effect_slot_params(2_u32.into(), effect_type)
            {
                for (index, value) in values.into_iter().enumerate() {
                    self.type_values[effect_type as usize][index]
                        .store(value.to_bits(), Ordering::Release);
                }
            }
        }
    }

    fn retire_old(&self) {
        while let Some(old) = self.retired.pop() {
            unsafe {
                drop(Box::from_raw(old as *mut Runtime));
            }
        }
    }

    fn deactivate(&self) {
        self.active.store(false, Ordering::Release);
        for pointer in [&self.current, &self.pending] {
            let old = pointer.swap(null_mut(), Ordering::AcqRel);
            if !old.is_null() {
                unsafe {
                    drop(Box::from_raw(old));
                }
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
                // One audio callback produces retired pointers, and capacity
                // was checked above. Disposal happens outside process().
                let pushed = self.retired.push(old as usize);
                debug_assert!(pushed.is_ok());
            }
        }
    }
}

impl Drop for Processor {
    fn drop(&mut self) {
        self.deactivate();
    }
}

impl Class for Processor {
    type Interfaces = (IComponent, IAudioProcessor, IProcessContextRequirements);
}

impl IPluginBaseTrait for Processor {
    unsafe fn initialize(&self, _context: *mut FUnknown) -> tresult {
        kResultOk
    }
    unsafe fn terminate(&self) -> tresult {
        self.deactivate();
        kResultOk
    }
}

impl IComponentTrait for Processor {
    unsafe fn getControllerClassId(&self, id: *mut TUID) -> tresult {
        if id.is_null() {
            return kInvalidArgument;
        }
        unsafe {
            *id = Controller::CID;
        }
        kResultOk
    }
    unsafe fn setIoMode(&self, _mode: IoMode) -> tresult {
        kResultOk
    }
    unsafe fn getBusCount(&self, media_type: MediaType, _direction: BusDirection) -> i32 {
        if media_type == MediaTypes_::kAudio as MediaType {
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
        if media_type != MediaTypes_::kAudio as MediaType || index != 0 || bus.is_null() {
            return kInvalidArgument;
        }
        if direction != BusDirections_::kInput as BusDirection
            && direction != BusDirections_::kOutput as BusDirection
        {
            return kInvalidArgument;
        }
        let bus = unsafe { &mut *bus };
        bus.mediaType = media_type;
        bus.direction = direction;
        bus.channelCount = 2;
        copy_wstring(
            if direction == BusDirections_::kInput as BusDirection {
                "Main In"
            } else {
                "Main Out"
            },
            &mut bus.name,
        );
        bus.busType = BusTypes_::kMain as BusType;
        bus.flags = BusInfo_::BusFlags_::kDefaultActive as u32;
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
        if media_type == MediaTypes_::kAudio as MediaType
            && index == 0
            && (direction == BusDirections_::kInput as BusDirection
                || direction == BusDirections_::kOutput as BusDirection)
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
        let Ok(project) = NativeProject::parse_fx_module(&bytes) else {
            return kResultFalse;
        };
        let mut values = DEFAULTS;
        for parameter in project.host_parameters() {
            let id = parameter.local_id as usize;
            if id >= 7 {
                return kResultFalse;
            }
            values[id] = parameter.initial;
        }
        let mut table = project.fx_type_parameters();
        let selected = values[0] as usize;
        if selected >= 21 {
            return kResultFalse;
        }
        table[selected].copy_from_slice(&values[2..7]);
        self.retire_old();
        let active = self.active.load(Ordering::Acquire);
        let replacement = if active {
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
        *state = bytes;
        drop(state);
        for (index, value) in values.iter().enumerate() {
            self.values[index].store(value.to_bits(), Ordering::Release);
        }
        for (effect_type, row) in table.iter().enumerate() {
            for (index, value) in row.iter().enumerate() {
                self.type_values[effect_type][index].store(value.to_bits(), Ordering::Release);
            }
        }
        if let Some(runtime) = replacement {
            self.pending
                .store(Box::into_raw(runtime), Ordering::Release);
        }
        kResultOk
    }
    unsafe fn getState(&self, stream: *mut IBStream) -> tresult {
        let Some(state) = self.capture_state() else {
            return kResultFalse;
        };
        if unsafe { write_stream(stream, &state) } {
            kResultOk
        } else {
            kResultFalse
        }
    }
}

impl IAudioProcessorTrait for Processor {
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
            || !(1_000. ..=768_000.).contains(&setup.sampleRate)
            || !(1..=65_536).contains(&setup.maxSamplesPerBlock)
        {
            return kResultFalse;
        }
        let Ok(mut config) = self.configuration.lock() else {
            return kResultFalse;
        };
        *config = Some((setup.sampleRate as f32, setup.maxSamplesPerBlock as usize));
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
        let runtime = self.current.load(Ordering::Acquire);
        if runtime.is_null() {
            return kResultFalse;
        }
        // SAFETY: VST3 serializes process calls for this component instance.
        let runtime = unsafe { &mut *runtime };
        let frames = data.numSamples as usize;
        if !unsafe {
            collect_automation(data.inputParameterChanges, frames, &mut runtime.automation)
        } {
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
                &mut runtime.prepared.processor,
                RawHostBlock {
                    frames,
                    main: [input[0] as *const f32, input[1] as *const f32],
                    sidechain: [null(), null()],
                    output,
                    events: &[],
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

impl IProcessContextRequirementsTrait for Processor {
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
    let pointers = unsafe { bus.__field0.channelBuffers32 };
    let channels = unsafe { [*pointers, *pointers.add(1)] };
    Some(channels)
}

unsafe fn collect_automation(
    changes: *mut IParameterChanges,
    frames: usize,
    output: &mut Vec<TimedAutomation>,
) -> bool {
    output.clear();
    let Some(changes) = (unsafe { ComRef::from_raw(changes) }) else {
        return true;
    };
    let count = unsafe { changes.getParameterCount() };
    if count < 0 || count > 7 {
        return false;
    }
    for index in 0..count {
        let Some(queue) = (unsafe { ComRef::from_raw(changes.getParameterData(index)) }) else {
            return false;
        };
        let id = unsafe { queue.getParameterId() };
        if id >= 7 {
            continue;
        }
        let point_count = unsafe { queue.getPointCount() };
        if point_count < 0 || point_count as usize > MAX_EVENTS - output.len() {
            return false;
        }
        for point in 0..point_count {
            let mut offset = 0_i32;
            let mut normalized = 0_f64;
            if unsafe { queue.getPoint(point, &mut offset, &mut normalized) } != kResultOk
                || offset < 0
                || offset as usize > frames
                || !normalized.is_finite()
                || !(0. ..=1.).contains(&normalized)
            {
                return false;
            }
            output.push(TimedAutomation {
                offset: offset as usize,
                id: HOST_SLOT_BASE + id,
                normalized: normalized as f32,
            });
        }
    }
    output.sort_unstable_by_key(|point| point.offset);
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_native::host_buffers::{HostBuffers, RawHostBlock};

    #[test]
    fn vst3_process_matches_prepared_native_fx() {
        let effect = Processor::new();
        effect.values[1].store(0.7_f32.to_bits(), Ordering::Release);
        let state = effect.capture_state().unwrap();
        let mut reference = NativeProject::parse_fx_module(&state)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let mut reference_buffers = HostBuffers::prepare(128);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { effect.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { effect.setActive(1) }, kResultOk);

        let mut left = [0_f32; 128];
        let mut right = [0_f32; 128];
        for index in 0..128 {
            left[index] = (index as f32 * 0.17).sin() * 0.4;
            right[index] = (index as f32 * 0.11).sin() * 0.3;
        }
        let mut vst_left = [0_f32; 128];
        let mut vst_right = [0_f32; 128];
        let mut ref_left = [0_f32; 128];
        let mut ref_right = [0_f32; 128];
        let mut inputs = [left.as_mut_ptr(), right.as_mut_ptr()];
        let mut outputs = [vst_left.as_mut_ptr(), vst_right.as_mut_ptr()];
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
        assert_eq!(unsafe { effect.process(&mut data) }, kResultOk);
        unsafe {
            reference_buffers.render(
                &mut reference.processor,
                RawHostBlock {
                    frames: 128,
                    main: [left.as_ptr(), right.as_ptr()],
                    sidechain: [null(), null()],
                    output: [ref_left.as_mut_ptr(), ref_right.as_mut_ptr()],
                    events: &[],
                    automation: &[],
                },
            )
        }
        .unwrap();
        assert_eq!(vst_left, ref_left);
        assert_eq!(vst_right, ref_right);
        assert_ne!(vst_left, left);
        assert_eq!(unsafe { effect.setActive(0) }, kResultOk);
    }
}
