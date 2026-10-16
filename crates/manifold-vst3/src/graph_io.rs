//! VST3 projects wider discrete graph buses as named mono host ports.
//! Mono/stereo logical buses retain their width. No surround mask is inferred.

use crate::util::copy_wstring;
use manifold_core::io::{AudioBus, IoLayout};
use manifold_native::host_buffers::{RawInputs, RawOutputs};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use vst3::Steinberg::{Vst::*, *};

/// Opt-in host negotiation trace, called only by control-thread SDK methods.
/// Never used by the process callback; contains no project state or audio.
pub(super) fn trace(message: std::fmt::Arguments<'_>) {
    use std::io::Write;
    if let Some(path) = std::env::var_os("MANIFOLD_VST3_IO_TRACE") {
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            let _ = writeln!(file, "{message}");
        }
    }
}

struct LogicalBus {
    first_host: usize,
    channels: usize,
}

/// Prepared mapping and host activation for this exact bus shape. A new shape
/// gets a new allocation; old runtimes retain their Arc until control-thread
/// retirement. Same-shape live edits share activation without callback locks.
pub(super) struct ChannelLayout {
    inputs: Vec<LogicalBus>,
    outputs: Vec<LogicalBus>,
    input_active: Vec<AtomicBool>,
    output_active: Vec<AtomicBool>,
}
impl ChannelLayout {
    fn new(inputs: &[AudioBus], outputs: &[AudioBus]) -> Self {
        let build = |buses: &[AudioBus], input: bool| {
            let mut logical = Vec::with_capacity(buses.len());
            let mut active = Vec::new();
            for bus in buses {
                logical.push(LogicalBus {
                    first_host: active.len(),
                    channels: bus.channels,
                });
                let count = if bus.channels > 2 { bus.channels } else { 1 };
                active.extend((0..count).map(|_| AtomicBool::new(!input || !bus.optional)));
            }
            (logical, active)
        };
        let (inputs, input_active) = build(inputs, true);
        let (outputs, output_active) = build(outputs, false);
        Self {
            inputs,
            outputs,
            input_active,
            output_active,
        }
    }
}
fn host_count(buses: &[AudioBus]) -> Option<usize> {
    buses.iter().try_fold(0usize, |sum, b| {
        sum.checked_add(if b.channels > 2 { b.channels } else { 1 })
    })
}

struct HostPort {
    id: String,
    channel: usize,
    width: usize,
    name: String,
    optional: bool,
    arrangement: SpeakerArrangement,
}
pub(super) struct Ports {
    pub layout: Option<IoLayout>,
    inputs: Vec<HostPort>,
    outputs: Vec<HostPort>,
    pub channels: Arc<ChannelLayout>,
}
impl Ports {
    pub fn new(layout: Option<IoLayout>, previous: Option<&Self>) -> Option<Self> {
        if let Some(layout) = &layout {
            i32::try_from(host_count(&layout.inputs)?).ok()?;
            i32::try_from(host_count(&layout.outputs)?).ok()?;
        }
        let channels = if let Some(old) = previous.filter(|old| old.same_shape(layout.as_ref())) {
            Arc::clone(&old.channels)
        } else {
            Arc::new(layout.as_ref().map_or_else(
                || ChannelLayout::new(&[], &[]),
                |io| ChannelLayout::new(&io.inputs, &io.outputs),
            ))
        };
        let build = |buses: &[AudioBus], old: Option<&Vec<HostPort>>| {
            let mut ports = Vec::new();
            for bus in buses {
                let count = if bus.channels > 2 { bus.channels } else { 1 };
                let width = if bus.channels > 2 { 1 } else { bus.channels };
                for channel in 0..count {
                    let arrangement = old
                        .and_then(|p| {
                            p.iter().find(|p| {
                                p.id == bus.id && p.channel == channel && p.width == width
                            })
                        })
                        .map(|p| p.arrangement)
                        .unwrap_or(if width == 1 {
                            SpeakerArr::kMono
                        } else {
                            SpeakerArr::kStereo
                        });
                    ports.push(HostPort {
                        id: bus.id.clone(),
                        channel,
                        width,
                        name: if count == 1 {
                            bus.name.clone()
                        } else {
                            format!("{} · {}", bus.name, channel + 1)
                        },
                        optional: bus.optional,
                        arrangement,
                    });
                }
            }
            ports
        };
        let (inputs, outputs) = if let Some(layout) = &layout {
            (
                build(&layout.inputs, previous.map(|p| &p.inputs)),
                build(&layout.outputs, previous.map(|p| &p.outputs)),
            )
        } else {
            (vec![], vec![])
        };
        Some(Self {
            layout,
            inputs,
            outputs,
            channels,
        })
    }
    pub fn same_shape(&self, layout: Option<&IoLayout>) -> bool {
        match (&self.layout, layout) {
            (None, None) => true,
            (Some(a), Some(b)) => a.inputs == b.inputs && a.outputs == b.outputs,
            _ => false,
        }
    }
    pub fn ready(&self) -> bool {
        true
    }
    pub fn activate(&self, direction: BusDirection, index: usize, state: bool) {
        let active = if direction == BusDirections_::kInput as i32 {
            &self.channels.input_active
        } else {
            &self.channels.output_active
        };
        if let Some(value) = active.get(index) {
            value.store(state, Ordering::Release);
        }
    }
    fn list(&self, direction: BusDirection) -> Option<&[HostPort]> {
        if direction == BusDirections_::kInput as i32 {
            Some(&self.inputs)
        } else if direction == BusDirections_::kOutput as i32 {
            Some(&self.outputs)
        } else {
            None
        }
    }
    pub fn count(&self, direction: BusDirection) -> Option<usize> {
        Some(self.list(direction)?.len())
    }
    pub fn info(&self, direction: BusDirection, index: i32, bus: &mut BusInfo) -> tresult {
        let Some(port) = usize::try_from(index)
            .ok()
            .and_then(|i| self.list(direction)?.get(i))
        else {
            return kInvalidArgument;
        };
        bus.mediaType = MediaTypes_::kAudio as i32;
        bus.direction = direction;
        bus.channelCount = port.width as i32;
        copy_wstring(&port.name, &mut bus.name);
        bus.busType = if index == 0 {
            BusTypes_::kMain
        } else {
            BusTypes_::kAux
        } as i32;
        bus.flags = if direction == BusDirections_::kOutput as i32 || !port.optional {
            BusInfo_::BusFlags_::kDefaultActive as u32
        } else {
            0
        };
        kResultOk
    }
    pub fn arrangement(
        &self,
        direction: BusDirection,
        index: i32,
    ) -> Result<SpeakerArrangement, tresult> {
        usize::try_from(index)
            .ok()
            .and_then(|i| self.list(direction)?.get(i))
            .map(|p| p.arrangement)
            .ok_or(kInvalidArgument)
    }
    pub fn negotiate(
        &mut self,
        inputs: &[SpeakerArrangement],
        outputs: &[SpeakerArrangement],
    ) -> bool {
        for (masks, ports) in [(inputs, &self.inputs), (outputs, &self.outputs)] {
            if masks.len() != ports.len()
                || masks
                    .iter()
                    .zip(ports)
                    .any(|(m, p)| m.count_ones() as usize != p.width)
            {
                return false;
            }
        }
        for (to, from) in self
            .inputs
            .iter_mut()
            .zip(inputs)
            .chain(self.outputs.iter_mut().zip(outputs))
        {
            to.arrangement = *from;
        }
        true
    }
}

/// Callback-scoped view of VST3 buffers through the prepared logical mapping.
/// Sample pointers stay in the host table; native scratch handles all aliasing.
pub(super) struct Channels<'a> {
    data: &'a ProcessData,
    layout: &'a ChannelLayout,
}
impl<'a> Channels<'a> {
    pub unsafe fn read(data: &'a ProcessData, layout: &'a ChannelLayout) -> Option<Self> {
        if usize::try_from(data.numInputs).ok() != Some(layout.input_active.len())
            || usize::try_from(data.numOutputs).ok() != Some(layout.output_active.len())
            || (!layout.inputs.is_empty() && data.inputs.is_null())
            || (!layout.outputs.is_empty() && data.outputs.is_null())
        {
            return None;
        }
        for (actual, buses, active) in [
            (data.inputs, &layout.inputs, &layout.input_active),
            (data.outputs, &layout.outputs, &layout.output_active),
        ] {
            for bus in buses {
                let count = if bus.channels > 2 { bus.channels } else { 1 };
                let width = if bus.channels > 2 { 1 } else { bus.channels };
                for host in bus.first_host..bus.first_host + count {
                    let actual = unsafe { &*actual.add(host) };
                    if actual.numChannels != width as i32 {
                        return None;
                    }
                    if active[host].load(Ordering::Acquire) {
                        let pointers = unsafe { actual.__field0.channelBuffers32 };
                        if pointers.is_null() {
                            return None;
                        }
                        for c in 0..width {
                            if unsafe { *pointers.add(c) }.is_null() {
                                return None;
                            }
                        }
                    }
                }
            }
        }
        Some(Self { data, layout })
    }

    fn pointer(&self, input: bool, bus: usize, channel: usize) -> *mut f32 {
        let (buses, active, actual) = if input {
            (
                &self.layout.inputs,
                &self.layout.input_active,
                self.data.inputs,
            )
        } else {
            (
                &self.layout.outputs,
                &self.layout.output_active,
                self.data.outputs,
            )
        };
        let logical = &buses[bus];
        assert!(channel < logical.channels);
        let (host, lane) = if logical.channels > 2 {
            (logical.first_host + channel, 0)
        } else {
            (logical.first_host, channel)
        };
        // Activation may change between validation and use. Never dereference a
        // missing pointer table, even if the host activates a port mid-callback.
        if !active[host].load(Ordering::Acquire) {
            return std::ptr::null_mut();
        }
        let pointers = unsafe { (*actual.add(host)).__field0.channelBuffers32 };
        if pointers.is_null() {
            return std::ptr::null_mut();
        }
        unsafe { *pointers.add(lane) }
    }
}
impl RawInputs for Channels<'_> {
    fn bus_count(&self) -> usize {
        self.layout.inputs.len()
    }
    fn channel_count(&self, bus: usize) -> usize {
        self.layout.inputs[bus].channels
    }
    fn channel(&self, bus: usize, channel: usize) -> *const f32 {
        self.pointer(true, bus, channel).cast_const()
    }
}
impl RawOutputs for Channels<'_> {
    fn bus_count(&self) -> usize {
        self.layout.outputs.len()
    }
    fn channel_count(&self, bus: usize) -> usize {
        self.layout.outputs[bus].channels
    }
    fn channel(&self, bus: usize, channel: usize) -> *mut f32 {
        self.pointer(false, bus, channel)
    }
}

#[cfg(test)]
mod tests {
    use super::super::{GraphProcessor, tests::callback_heap};
    use super::*;
    use manifold_native::host_buffers::{RawInputBus, RawOutputBus};
    use vst3::ComPtr;

    mod automation {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/examples/support/automation.rs"
        ));
    }
    const PACKAGE: &[u8] =
        include_bytes!("../../../web/public/packages/arbitrary-io.manifold.json");

    fn open(bytes: &[u8]) -> GraphProcessor {
        let processor = GraphProcessor::new();
        assert_eq!(processor.restore_bytes(bytes.to_vec()), kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: 0,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { processor.setupProcessing(&mut setup) }, kResultOk);
        processor
    }

    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../manifold-native/tests/support/large_io.rs"
    ));

    #[test]
    fn vst_large_port_activation_survives_live_edits_and_new_shapes_without_callback_heap() {
        let processor = open(&serde_json::to_vec(&large_io_project(41)).unwrap());
        for buses in [41, 42, 33] {
            let mut document = large_io_project(buses);
            assert_eq!(
                processor.restore_bytes(serde_json::to_vec(&document).unwrap()),
                kResultOk
            );
            let total = 300 + (buses - 1) * 9;
            for direction in [0, 1] {
                assert_eq!(unsafe { processor.getBusCount(0, direction) }, total as i32);
            }
            let mut arrangements = vec![SpeakerArr::kMono; total];
            assert_eq!(
                unsafe {
                    processor.setBusArrangements(
                        arrangements.as_mut_ptr(),
                        total as i32,
                        arrangements.as_mut_ptr(),
                        total as i32,
                    )
                },
                kResultTrue
            );
            assert_eq!(unsafe { processor.setActive(1) }, kResultOk);
            assert_eq!(unsafe { processor.setProcessing(1) }, kResultOk);
            let mut pcm = vec![vec![0.125; 17]; total];
            pcm[299].fill(-0.25);
            pcm[total - 1].fill(0.75);
            let mut input_ptrs: Vec<_> = pcm.iter_mut().map(|v| v.as_mut_ptr()).collect();
            let mut output = vec![vec![99.; 17]; total];
            let mut output_ptrs: Vec<_> = output.iter_mut().map(|v| v.as_mut_ptr()).collect();
            let make_buses = |pointers: &mut Vec<*mut f32>| {
                (0..total)
                    .map(|i| AudioBusBuffers {
                        numChannels: 1,
                        silenceFlags: 0,
                        __field0: AudioBusBuffers__type0 {
                            channelBuffers32: unsafe { pointers.as_mut_ptr().add(i) },
                        },
                    })
                    .collect::<Vec<_>>()
            };
            let mut inputs = make_buses(&mut input_ptrs);
            let mut outputs = make_buses(&mut output_ptrs);
            let mut data = ProcessData {
                processMode: 0,
                symbolicSampleSize: 0,
                numSamples: 17,
                numInputs: total as i32,
                numOutputs: total as i32,
                inputs: inputs.as_mut_ptr(),
                outputs: outputs.as_mut_ptr(),
                inputParameterChanges: std::ptr::null_mut(),
                outputParameterChanges: std::ptr::null_mut(),
                inputEvents: std::ptr::null_mut(),
                outputEvents: std::ptr::null_mut(),
                processContext: std::ptr::null_mut(),
            };
            for connected in [false, true, false, true] {
                assert_eq!(
                    unsafe { processor.activateBus(0, 0, (total - 1) as i32, u8::from(connected)) },
                    kResultOk
                );
                assert_eq!(
                    callback_heap::measure(|| unsafe { processor.process(&mut data) }),
                    kResultOk
                );
                for (i, channel) in output.iter().enumerate() {
                    let expected = if i % 2 == 1 {
                        -0.25
                    } else if connected {
                        0.75
                    } else {
                        0.
                    };
                    assert!(
                        channel.iter().all(|v| *v == expected),
                        "bus shape {buses}, channel {i}"
                    );
                }
            }
            // Same-shape publication must preserve the host's activated last
            // port. No callback retains a borrow into the retired mapping.
            document["signal"]["io"]["outputBindings"][0]["channel"] = serde_json::json!(1);
            assert_eq!(
                processor.restore_bytes(serde_json::to_vec(&document).unwrap()),
                kResultOk
            );
            assert_eq!(
                callback_heap::measure(|| unsafe { processor.process(&mut data) }),
                kResultOk
            );
            assert_eq!(output[0], vec![-0.25; 17]);
            assert_eq!(output[(total - 1) & !1], vec![0.75; 17]);
            assert_eq!(unsafe { processor.setProcessing(0) }, kResultOk);
            assert_eq!(unsafe { processor.setActive(0) }, kResultOk);
        }
    }

    fn negotiate(processor: &GraphProcessor) {
        let mut inputs = [SpeakerArr::kMono; 4];
        let mut outputs = [SpeakerArr::kMono; 5];
        assert_eq!(
            unsafe {
                processor.setBusArrangements(inputs.as_mut_ptr(), 4, outputs.as_mut_ptr(), 5)
            },
            kResultTrue
        );
    }

    fn render(
        processor: &GraphProcessor,
        malformed: bool,
        changes: Option<&ComPtr<IParameterChanges>>,
    ) -> (tresult, [[f32; 17]; 5]) {
        // Cross-bus input/output aliasing exercises the shared copy boundary.
        let mut pcm = [[0.125; 17], [-0.25; 17], [0.375; 17], [-0.5; 17], [99.; 17]];
        let mut pointers = pcm.each_mut().map(|channel| channel.as_mut_ptr());
        let bus = |pointer, width| AudioBusBuffers {
            numChannels: width,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: pointer,
            },
        };
        let mut inputs: [AudioBusBuffers; 4] =
            std::array::from_fn(|i| bus(unsafe { pointers.as_mut_ptr().add(i) }, 1));
        let mut outputs: [AudioBusBuffers; 5] = std::array::from_fn(|i| {
            bus(
                unsafe { pointers.as_mut_ptr().add(i) },
                if i == 0 && malformed { 2 } else { 1 },
            )
        });
        let mut data = ProcessData {
            processMode: 0,
            symbolicSampleSize: 0,
            numSamples: 17,
            numInputs: 4,
            numOutputs: 5,
            inputs: inputs.as_mut_ptr(),
            outputs: outputs.as_mut_ptr(),
            inputParameterChanges: changes.map_or(std::ptr::null_mut(), |c| c.as_ptr()),
            outputParameterChanges: std::ptr::null_mut(),
            inputEvents: std::ptr::null_mut(),
            outputEvents: std::ptr::null_mut(),
            processContext: std::ptr::null_mut(),
        };
        let status = callback_heap::measure(|| unsafe { processor.process(&mut data) });
        (status, pcm)
    }

    #[test]
    fn vst_declared_buses_host_negotiation_live_script_in_place_rejection_and_recall() {
        let processor = open(PACKAGE);
        for (direction, counts) in [
            (BusDirections_::kInput as i32, vec![1; 4]),
            (BusDirections_::kOutput as i32, vec![1; 5]),
        ] {
            assert_eq!(
                unsafe { processor.getBusCount(MediaTypes_::kAudio as i32, direction) },
                counts.len() as i32
            );
            for (index, width) in counts.into_iter().enumerate() {
                let mut info: BusInfo = unsafe { std::mem::zeroed() };
                assert_eq!(
                    unsafe {
                        processor.getBusInfo(
                            MediaTypes_::kAudio as i32,
                            direction,
                            index as i32,
                            &mut info,
                        )
                    },
                    kResultOk
                );
                assert_eq!(info.channelCount, width);
            }
        }
        let mut untouched = 123;
        assert_eq!(
            unsafe { processor.getBusArrangement(0, 0, &mut untouched) },
            kResultOk
        );
        assert_eq!(untouched, SpeakerArr::kMono);
        negotiate(&processor);
        let mut invalid = [SpeakerArr::kMono; 4];
        invalid[0] = SpeakerArr::kStereo;
        let mut outputs = [SpeakerArr::kMono; 5];
        assert_eq!(
            unsafe {
                processor.setBusArrangements(invalid.as_mut_ptr(), 4, outputs.as_mut_ptr(), 5)
            },
            kResultFalse
        );
        assert_eq!(
            unsafe { processor.getBusArrangement(0, 0, &mut untouched) },
            kResultOk
        );
        assert_eq!(untouched.count_ones(), 1);
        assert_eq!(unsafe { processor.activateBus(0, 0, 3, 1) }, kResultOk);
        assert_eq!(unsafe { processor.setActive(1) }, kResultOk);
        assert_eq!(unsafe { processor.setProcessing(1) }, kResultOk);
        assert_eq!(
            render(&processor, false, None).1.map(|c| c[0]),
            [0.125, -0.25, 0.375, -0.5, 0.0625]
        );
        for i in 0..6 {
            let before = processor.host_state_bytes().unwrap();
            let generation = processor.scripted_call("swap", vec![]).unwrap();
            assert_eq!(processor.scripted_status(generation), 0);
            let (status, untouched) = render(&processor, true, None);
            assert_eq!(status, kResultFalse);
            assert_eq!(untouched.map(|c| c[0]), [0.125, -0.25, 0.375, -0.5, 99.]);
            assert_eq!(processor.host_state_bytes().unwrap(), before);
            assert_eq!(processor.scripted_status(generation), 0);
            let (status, pcm) = render(&processor, false, None);
            assert_eq!(status, kResultOk);
            assert_eq!(
                pcm.map(|c| c[0]),
                if i % 2 == 0 {
                    [-0.25, 0.125, 0.375, -0.5, 0.0625]
                } else {
                    [0.125, -0.25, 0.375, -0.5, 0.0625]
                }
            );
            assert_eq!(processor.scripted_status(generation), 1);
            for method in ["requestDifferentLayout", "requireAux"] {
                let saved = processor.host_state_bytes().unwrap();
                assert!(processor.scripted_call(method, vec![]).is_err());
                assert_eq!(processor.host_state_bytes().unwrap(), saved);
            }
        }
        assert_eq!(unsafe { processor.activateBus(0, 0, 3, 0) }, kResultOk);
        assert_eq!(
            render(&processor, false, None).1.map(|c| c[0]),
            [0.125, -0.25, 0.375, 0., 0.0625]
        );
        let saved = processor.host_state_bytes().unwrap();
        let reopened = open(&saved);
        negotiate(&reopened);
        assert_eq!(unsafe { reopened.setActive(1) }, kResultOk);
        assert_eq!(unsafe { reopened.setProcessing(1) }, kResultOk);
        assert_eq!(render(&reopened, false, None).0, kResultOk);
        let generation = reopened.scripted_call("swap", vec![]).unwrap();
        assert_eq!(render(&reopened, false, None).1[0][0], -0.25);
        assert_eq!(reopened.scripted_status(generation), 1);
    }

    #[test]
    fn vst_declared_buses_sample_offset_automation_and_no_audio_flush() {
        let mut graph: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/arbitrary-io-project.json"
        ))
        .unwrap();
        graph["hostBindings"] = serde_json::json!([{"slot":0,"nodeId":12,"id":0}]);
        let bytes = serde_json::to_vec(&graph).unwrap();
        let processor = open(&bytes);
        let mut reference = manifold_native::project::NativeProject::parse(&bytes)
            .unwrap()
            .prepare(48_000., 128)
            .unwrap();
        let mut buffers = manifold_native::host_buffers::IoHostBuffers::prepare(
            reference.io_layout().unwrap(),
            128,
        )
        .unwrap();
        let render_reference =
            |reference: &mut manifold_native::NativeProcessor,
             buffers: &mut manifold_native::host_buffers::IoHostBuffers,
             automation: &[manifold_native::parameters::TimedAutomation]| {
                let mut pcm = [[0.125; 17], [-0.25; 17], [0.375; 17], [-0.5; 17], [99.; 17]];
                let p = pcm.each_mut().map(|c| c.as_mut_ptr());
                let inputs = [p[0].cast_const(), p[1].cast_const(), p[2].cast_const()];
                let aux = [p[3].cast_const()];
                let mono = [p[4]];
                unsafe {
                    buffers.render(
                        reference,
                        &[
                            RawInputBus { channels: &inputs },
                            RawInputBus { channels: &aux },
                        ],
                        &[
                            RawOutputBus { channels: &p[..4] },
                            RawOutputBus { channels: &mono },
                        ],
                        17,
                        &[],
                        automation,
                    )
                }
                .unwrap();
                pcm
            };
        negotiate(&processor);
        assert_eq!(unsafe { processor.activateBus(0, 0, 3, 1) }, kResultOk);
        assert_eq!(unsafe { processor.setActive(1) }, kResultOk);
        let changes = automation::changes(0, 7, 0.0);
        let (status, pcm) = render(&processor, false, Some(&changes));
        assert_eq!(status, kResultOk);
        assert_eq!(&pcm[4][..7], &[0.0625; 7]);
        let points = [manifold_native::parameters::TimedAutomation {
            id: u64::from(manifold_native::parameters::HOST_SLOT_BASE),
            offset: 7,
            normalized: 0.,
        }];
        assert_eq!(pcm, render_reference(&mut reference, &mut buffers, &points));
        assert!(pcm[4][7] < pcm[4][6]);
        let changes = automation::changes(0, 0, 0.5);
        let mut data: ProcessData = unsafe { std::mem::zeroed() };
        data.inputParameterChanges = changes.as_ptr();
        assert_eq!(
            callback_heap::measure(|| unsafe { processor.process(&mut data) }),
            kResultOk
        );
        let (status, pcm) = render(&processor, false, None);
        assert_eq!(status, kResultOk);
        reference
            .flush_host_automation(&[manifold_native::parameters::TimedAutomation {
                id: u64::from(manifold_native::parameters::HOST_SLOT_BASE),
                offset: 0,
                normalized: 0.5,
            }])
            .unwrap();
        assert_eq!(pcm, render_reference(&mut reference, &mut buffers, &[]));
    }

    #[test]
    fn vst_256_ordered_input_channels_remain_discrete_through_host_projection() {
        let mut graph: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/arbitrary-io-project.json"
        ))
        .unwrap();
        graph["signal"]["inputs"] = 256.into();
        graph["signal"]["io"]["inputs"][0]["channels"] = 255.into();
        graph["signal"]["io"]["inputBindings"][0]["channels"][0]["channel"] = 254.into();
        graph["signal"]["io"]["inputBindings"][0]["channels"][1]["channel"] = 253.into();
        let processor = open(&serde_json::to_vec(&graph).unwrap());
        assert_eq!(unsafe { processor.getBusCount(0, 0) }, 256);
        assert_eq!(unsafe { processor.activateBus(0, 0, 255, 1) }, kResultOk);
        assert_eq!(unsafe { processor.setActive(1) }, kResultOk);
        let mut pcm: [[f32; 17]; 256] = std::array::from_fn(|i| [i as f32 / 256.; 17]);
        let mut pointers = pcm.each_mut().map(|c| c.as_mut_ptr());
        let bus = |p| AudioBusBuffers {
            numChannels: 1,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: p,
            },
        };
        let mut inputs: [AudioBusBuffers; 256] =
            std::array::from_fn(|i| bus(unsafe { pointers.as_mut_ptr().add(i) }));
        let mut outputs: [AudioBusBuffers; 5] =
            std::array::from_fn(|i| bus(unsafe { pointers.as_mut_ptr().add(i) }));
        let mut data: ProcessData = unsafe { std::mem::zeroed() };
        data.numSamples = 17;
        data.numInputs = 256;
        data.numOutputs = 5;
        data.inputs = inputs.as_mut_ptr();
        data.outputs = outputs.as_mut_ptr();
        assert_eq!(
            callback_heap::measure(|| unsafe { processor.process(&mut data) }),
            kResultOk
        );
        assert_eq!(
            pcm[..5].iter().map(|c| c[0]).collect::<Vec<_>>(),
            vec![
                254. / 256.,
                253. / 256.,
                2. / 256.,
                255. / 256.,
                127. / 256.
            ]
        );
    }

    #[test]
    fn vst_zero_input_generator_disconnected_outputs_and_no_buses() {
        use manifold_native::{AudioBus, InputBinding, IoLayout, OutputChannel};
        let mut graph = manifold_native::author::GraphWorkspace::new();
        graph.add(20, "oscillator").unwrap();
        graph.set_parameter(20, 1, 440.).unwrap();
        graph.set_parameter(20, 2, 0.25).unwrap();
        let mut layout = IoLayout {
            version: 1,
            inputs: vec![],
            outputs: vec![
                AudioBus {
                    id: "mono".into(),
                    name: "Mono".into(),
                    channels: 1,
                    optional: false,
                },
                AudioBus {
                    id: "discrete".into(),
                    name: "Discrete".into(),
                    channels: 3,
                    optional: false,
                },
            ],
            input_bindings: vec![InputBinding {
                node: 1,
                channels: [None, None],
            }],
            output_bindings: vec![
                Some(OutputChannel {
                    node: 20,
                    port: 0,
                    channel: 0,
                }),
                Some(OutputChannel {
                    node: 20,
                    port: 0,
                    channel: 1,
                }),
                None,
                None,
            ],
        };
        graph.set_io_layout(layout.clone()).unwrap();
        let processor = open(&serde_json::to_vec(&graph.to_project().unwrap()).unwrap());
        let mut masks = [SpeakerArr::kMono; 4];
        assert_eq!(
            unsafe { processor.setBusArrangements(std::ptr::null_mut(), 0, masks.as_mut_ptr(), 4) },
            kResultTrue
        );
        assert_eq!(unsafe { processor.setActive(1) }, kResultOk);
        let mut pcm = [[99.; 17]; 4];
        let mut pointers = pcm.each_mut().map(|c| c.as_mut_ptr());
        let bus = |pointer, width| AudioBusBuffers {
            numChannels: width,
            silenceFlags: 0,
            __field0: AudioBusBuffers__type0 {
                channelBuffers32: pointer,
            },
        };
        let mut buses: [AudioBusBuffers; 4] =
            std::array::from_fn(|i| bus(unsafe { pointers.as_mut_ptr().add(i) }, 1));
        let mut data: ProcessData = unsafe { std::mem::zeroed() };
        data.numSamples = 17;
        data.numOutputs = 4;
        data.outputs = buses.as_mut_ptr();
        assert_eq!(
            callback_heap::measure(|| unsafe { processor.process(&mut data) }),
            kResultOk
        );
        assert!(pcm[0].iter().any(|v| v.abs() > 0.01));
        assert_eq!(pcm[0], pcm[1]);
        assert_eq!(pcm[2], [0.; 17]);
        assert_eq!(pcm[3], [0.; 17]);
        for i in 1..4 {
            assert_eq!(unsafe { processor.activateBus(0, 1, i, 0) }, kResultOk);
        }
        unsafe {
            (*data.outputs.add(1)).__field0.channelBuffers32 = std::ptr::null_mut();
        }
        assert_eq!(
            callback_heap::measure(|| unsafe { processor.process(&mut data) }),
            kResultOk
        );
        assert_eq!(unsafe { processor.activateBus(0, 1, 1, 1) }, kResultOk);
        assert_eq!(
            callback_heap::measure(|| unsafe { processor.process(&mut data) }),
            kResultFalse
        );
        assert_eq!(unsafe { processor.setActive(0) }, kResultOk);
        layout.outputs.clear();
        layout.output_bindings.clear();
        graph.set_io_layout(layout).unwrap();
        assert_eq!(
            processor.restore_bytes(serde_json::to_vec(&graph.to_project().unwrap()).unwrap()),
            kResultOk
        );
        assert_eq!(unsafe { processor.getBusCount(0, 1) }, 0);
        assert_eq!(
            unsafe {
                processor.setBusArrangements(std::ptr::null_mut(), 0, std::ptr::null_mut(), 0)
            },
            kResultTrue
        );
        assert_eq!(unsafe { processor.setActive(1) }, kResultOk);
        data.numOutputs = 0;
        data.outputs = std::ptr::null_mut();
        assert_eq!(
            callback_heap::measure(|| unsafe { processor.process(&mut data) }),
            kResultOk
        );
    }

    #[test]
    fn vst_host_state_shape_load_waits_for_stop_before_audio_publication() {
        let processor = open(super::super::DEFAULT_PROJECT);
        assert_eq!(unsafe { processor.setActive(1) }, kResultOk);
        let before = processor.host_state_bytes().unwrap();
        assert_eq!(processor.restore_bytes(PACKAGE.to_vec()), kResultFalse);
        assert_eq!(
            processor.restore_bytes_admission(PACKAGE.to_vec(), true),
            kResultOk
        );
        assert_eq!(processor.host_state_bytes().unwrap(), before);
        let mut data: ProcessData = unsafe { std::mem::zeroed() };
        assert_eq!(
            callback_heap::measure(|| unsafe { processor.process(&mut data) }),
            kResultFalse
        );
        assert_eq!(unsafe { processor.setActive(0) }, kResultOk);
        assert_eq!(unsafe { processor.getBusCount(0, 1) }, 5);
        let saved = processor.host_state_bytes().unwrap();
        assert_eq!(
            manifold_project_js::package::ProjectPackage::parse(&saved)
                .unwrap()
                .id,
            "manifold.arbitrary-io"
        );
        negotiate(&processor);
        assert_eq!(unsafe { processor.activateBus(0, 0, 3, 1) }, kResultOk);
        assert_eq!(unsafe { processor.setActive(1) }, kResultOk);
        assert_eq!(
            render(&processor, false, None).1.map(|c| c[0]),
            [0.125, -0.25, 0.375, -0.5, 0.0625]
        );
    }
}
