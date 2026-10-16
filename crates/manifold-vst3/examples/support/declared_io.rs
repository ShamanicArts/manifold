// Actual exported VST3 interface proof. Opens no device, editor or DAW.
use super::*;

fn open(factory: &ComPtr<IPluginFactory>, bytes: &[u8]) -> (Hosted, Value) {
    let component: ComPtr<IComponent> = instantiate(factory, &GRAPH_CID);
    assert_eq!(unsafe { component.initialize(null_mut()) }, kResultOk);
    let audio = component.cast::<IAudioProcessor>().unwrap();
    let connection = component.cast::<IConnectionPoint>().unwrap();
    let (incoming, _) = stream(bytes.to_vec());
    assert_eq!(unsafe { component.setState(incoming.as_ptr()) }, kResultOk);
    let mut ports = Vec::new();
    for (direction, label, widths) in [(0, "input", vec![1; 4]), (1, "output", vec![1; 5])] {
        assert_eq!(
            unsafe { component.getBusCount(0, direction) },
            widths.len() as i32
        );
        for (index, width) in widths.into_iter().enumerate() {
            let mut info: BusInfo = unsafe { std::mem::zeroed() };
            assert_eq!(
                unsafe { component.getBusInfo(0, direction, index as i32, &mut info) },
                kResultOk
            );
            assert_eq!(info.channelCount, width);
            let name = String::from_utf16_lossy(
                &info.name[..info
                    .name
                    .iter()
                    .position(|x| *x == 0)
                    .unwrap_or(info.name.len())],
            );
            ports.push(json!({"direction":label,"index":index,"name":name,"channels":width,"defaultActive":info.flags & 1 != 0}));
        }
    }
    let mut setup = ProcessSetup {
        processMode: ProcessModes_::kOffline as i32,
        symbolicSampleSize: 0,
        maxSamplesPerBlock: FRAMES as i32,
        sampleRate: RATE,
    };
    assert_eq!(unsafe { audio.setupProcessing(&mut setup) }, kResultOk);
    // Wider logical graph groups are projected into named mono VST3 ports.
    let mut arrangement = 123;
    assert_eq!(
        unsafe { audio.getBusArrangement(0, 0, &mut arrangement) },
        kResultOk
    );
    assert_eq!(arrangement, SpeakerArr::kMono);
    let mut inputs = [SpeakerArr::kMono; 4];
    let mut outputs = [SpeakerArr::kMono; 5];
    assert_eq!(
        unsafe { audio.setBusArrangements(inputs.as_mut_ptr(), 4, outputs.as_mut_ptr(), 5) },
        kResultTrue
    );
    let mut invalid = inputs;
    invalid[0] = SpeakerArr::kStereo;
    assert_eq!(
        unsafe { audio.setBusArrangements(invalid.as_mut_ptr(), 4, outputs.as_mut_ptr(), 5) },
        kResultFalse
    );
    for (direction, masks) in [(0, inputs.as_slice()), (1, outputs.as_slice())] {
        for (index, mask) in masks.iter().enumerate() {
            assert_eq!(
                unsafe { audio.getBusArrangement(direction, index as i32, &mut arrangement) },
                kResultOk
            );
            assert_eq!(arrangement, *mask);
        }
    }
    assert_eq!(unsafe { component.activateBus(0, 0, 3, 1) }, kResultOk);
    assert_eq!(unsafe { component.setActive(1) }, kResultOk);
    assert_eq!(unsafe { audio.setProcessing(1) }, kResultOk);
    assert_eq!(
        unsafe { audio.setBusArrangements(inputs.as_mut_ptr(), 4, outputs.as_mut_ptr(), 5) },
        kResultFalse
    );
    (
        Hosted {
            component,
            audio,
            connection,
        },
        json!({"buses":ports,"hostInputSpeakerMasks":inputs,"hostOutputSpeakerMasks":outputs,"wideGraphBusesUseNamedMonoHostPorts":true,"mismatchedProposalPreservedState":true}),
    )
}

fn render(
    host: &Hosted,
    input: &[[f32; FRAMES]; 4],
    malformed: bool,
) -> (tresult, [[f32; FRAMES]; 5]) {
    let mut pcm = [[0.; FRAMES]; 5];
    pcm[..4].copy_from_slice(input);
    pcm[4].fill(99.);
    let mut pointers = pcm.each_mut().map(|c| c.as_mut_ptr());
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
    let mut data: ProcessData = unsafe { std::mem::zeroed() };
    data.processMode = ProcessModes_::kOffline as i32;
    data.numSamples = FRAMES as i32;
    data.numInputs = 4;
    data.numOutputs = 5;
    data.inputs = inputs.as_mut_ptr();
    data.outputs = outputs.as_mut_ptr();
    (unsafe { host.audio.process(&mut data) }, pcm)
}

fn reject_call(host: &Hosted, method: &str) {
    let message = message("manifold.graph.script.call.v1");
    let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }.unwrap();
    let bytes = serde_json::to_vec(&json!({"method":method,"args":[]})).unwrap();
    assert_eq!(
        unsafe {
            attributes.setBinary(c"call".as_ptr(), bytes.as_ptr().cast(), bytes.len() as u32)
        },
        kResultOk
    );
    assert_ne!(
        unsafe { host.connection.notify(message.as_ptr()) },
        kResultOk
    );
}

pub fn run(args: &[String]) -> Result<(), Box<dyn std::error::Error>> {
    if args.len() != 5 {
        return Err("expected --arbitrary-io LIBRARY PACKAGE GOLDEN_DIR OUTPUT_DIR".into());
    }
    let path = Path::new(&args[1]).canonicalize()?;
    let bytes = std::fs::read(&args[2])?;
    let golden = Path::new(&args[3]);
    let out = Path::new(&args[4]);
    std::fs::create_dir_all(out)?;
    let library = Library::open(&path);
    let factory = library.factory();
    let (host, ports) = open(&factory, &bytes);
    let input = [
        [0.125; FRAMES],
        [-0.25; FRAMES],
        [0.375; FRAMES],
        [-0.5; FRAMES],
    ];
    let mut recording = Vec::new();
    for _ in 0..64 {
        let (status, pcm) = render(&host, &input, false);
        assert_eq!(status, kResultOk);
        for frame in 0..FRAMES {
            for channel in &pcm {
                recording.extend_from_slice(&channel[frame].to_le_bytes());
            }
        }
    }
    let mut comparisons = Vec::new();
    for name in ["native.f32", "browser.f32"] {
        let expected = std::fs::read(golden.join(name))?;
        assert_eq!(recording.len(), expected.len());
        assert_eq!(recording, expected, "VST3 differs from {name}");
        comparisons.push(json!({"recording":golden.join(name),"sha256":hash(&expected),"differingSamples":0,"maximumAbsoluteError":0}));
    }
    // CLAP is also compared when the accepted proof is supplied in the env.
    if let Some(clap) = std::env::var_os("MANIFOLD_CLAP_IO_RECORDING") {
        let clap = Path::new(&clap);
        let expected = std::fs::read(clap)?;
        assert_eq!(recording, expected, "VST3 differs from exported CLAP");
        comparisons.push(json!({"recording":clap,"sha256":hash(&expected),"differingSamples":0,"maximumAbsoluteError":0}));
    }
    std::fs::write(out.join("vst3.f32"), &recording)?;
    let mut swaps = Vec::new();
    for index in 0..5 {
        let before = host.save();
        let generation = host.call(&json!({"method":"swap","args":[]}));
        assert_eq!(host.status(generation), 0);
        let (status, pcm) = render(&host, &input, true);
        assert_eq!(status, kResultFalse);
        assert_eq!(pcm[4], [99.; FRAMES]);
        assert_eq!(host.save(), before);
        assert_eq!(host.status(generation), 0);
        let (status, pcm) = render(&host, &input, false);
        assert_eq!(status, kResultOk);
        let expected = if index % 2 == 0 {
            [-0.25, 0.125, 0.375, -0.5, 0.0625]
        } else {
            [0.125, -0.25, 0.375, -0.5, 0.0625]
        };
        assert_eq!(pcm.map(|c| c[0]), expected);
        assert_eq!(host.status(generation), 1);
        for method in ["requestDifferentLayout", "requireAux"] {
            let before = host.save();
            reject_call(&host, method);
            assert_eq!(host.save(), before);
        }
        swaps.push(json!({"generation":generation,"outputs":expected,"malformedBlockKeptPendingEdit":true,"shapeAndOptionalityChangesRejected":true}));
    }
    assert_eq!(unsafe { host.component.activateBus(0, 0, 3, 0) }, kResultOk);
    let (status, pcm) = render(&host, &input, false);
    assert_eq!(status, kResultOk);
    assert_eq!(pcm[3], [0.; FRAMES]);
    let saved = host.save();
    std::fs::write(out.join("saved.manifold.json"), &saved)?;
    drop(host);
    let (host, reopened_ports) = open(&factory, &saved);
    assert_eq!(ports, reopened_ports);
    let (status, pcm) = render(&host, &input, false);
    assert_eq!(status, kResultOk);
    assert_eq!(pcm.map(|c| c[0]), [-0.25, 0.125, 0.375, -0.5, 0.0625]);
    let generation = host.call(&json!({"method":"swap","args":[]}));
    assert_eq!(render(&host, &input, false).1[0], [0.125; FRAMES]);
    assert_eq!(host.status(generation), 1);
    // Restore the swapped state for an audible recalled routing audition.
    drop(host);
    let (host, _) = open(&factory, &saved);
    let mut pairs = [Vec::new(), Vec::new(), Vec::new()];
    for block in 0..750 {
        let input = std::array::from_fn(|c| {
            std::array::from_fn(|i| {
                (((block * FRAMES + i) as f64 / RATE
                    * std::f64::consts::TAU
                    * [220., 330., 440., 110.][c])
                    .sin()
                    * 0.12) as f32
            })
        });
        let (status, pcm) = render(&host, &input, false);
        assert_eq!(status, kResultOk);
        for i in 0..FRAMES {
            pairs[0].extend_from_slice(&[pcm[0][i], pcm[1][i]]);
            pairs[1].extend_from_slice(&[pcm[2][i], pcm[3][i]]);
            pairs[2].extend_from_slice(&[pcm[4][i], pcm[4][i]]);
        }
    }
    for (name, samples) in ["stems-1-2.wav", "stems-3-4.wav", "mono-send.wav"]
        .into_iter()
        .zip(&pairs)
    {
        wav(&out.join(name), samples);
    }
    let controller: ComPtr<IEditController> = instantiate(&factory, &CONTROLLER_CID);
    assert_eq!(unsafe { controller.initialize(null_mut()) }, kResultOk);
    let (state, _) = stream(saved.clone());
    assert_eq!(
        unsafe { controller.setComponentState(state.as_ptr()) },
        kResultOk
    );
    assert_eq!(unsafe { controller.terminate() }, kResultOk);
    let report = json!({"accepted":true,"module":path,"moduleSha256":hash(&std::fs::read(&path)?),"packageSha256":hash(&bytes),"sampleRate":RATE,"frames":8192,"outputChannels":5,"blockFrames":FRAMES,"ports":ports,"comparisons":comparisons,"liveSwaps":swaps,"optionalInputDeactivationSilencedOnlyItsRoute":true,"coldRecallAndFurtherScriptEdit":true,"controllerAcceptedRecalledPackage":true,"scope":"Actual exported factory/IComponent/IAudioProcessor, offline. No DAW, editor or audio device. Wider logical buses are projected as named mono VST3 ports; ordered graph groups and DSP routes remain unchanged.","heapCounters":"not observable across shared-library boundary; separate release Rust callback guards","auditionFrames":96000,"audition":"Recalled script routing driven by host sine inputs; not Main synthesis or legacy parity"});
    std::fs::write(out.join("report.json"), serde_json::to_vec_pretty(&report)?)?;
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
