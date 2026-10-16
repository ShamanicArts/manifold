//! Load the packaged VST3 shared library, with no editor or audio device.
//! Usage: LIBRARY PACKAGE OUTPUT_DIR CALL_JSON [REOPEN_CALL_JSON]

#[cfg(unix)]
mod probe {
    use std::collections::BTreeMap;
    use std::ffi::{CStr, CString, c_char, c_void};
    use std::io::Write;
    use std::path::Path;
    use std::ptr::null_mut;
    use std::sync::{Arc, Mutex};

    use manifold_native::{AudioBlock, parameters::TimedAutomation, project::NativeProject};
    mod automation_probe {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/examples/support/automation.rs"
        ));
    }
    use manifold_project_js::{native_host::NativeScriptAudio, package::ProjectPackage};
    use serde_json::{Value, json};
    use sha2::{Digest, Sha256};
    use vst3::{
        Class, ComPtr, ComRef, ComWrapper, Interface, Steinberg::Vst::*, Steinberg::*, uid,
    };

    const FRAMES: usize = 128;
    const RATE: f64 = 48_000.;
    const GRAPH_CID: TUID = uid(0x70477A2D, 0x9F294ED9, 0xA03E6858, 0x5A947923);
    const CONTROLLER_CID: TUID = uid(0xC5C5353D, 0x6BDF4E42, 0xAE535D85, 0x81C0832F);

    mod sample_suite {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../manifold-native/tests/support/scripted_samples.rs"
        ));
    }
    static SAMPLE_LIBRARY: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
    struct SampleHosted {
        // Drop interfaces before closing their shared library.
        host: Hosted,
        factory: ComPtr<IPluginFactory>,
        _library: Library,
    }
    impl sample_suite::SampleHost for SampleHosted {
        fn open(package: &[u8]) -> Self {
            let library = Library::open(SAMPLE_LIBRARY.get().unwrap());
            let factory = library.factory();
            let host = Hosted::open(&factory, package);
            Self {
                host,
                factory,
                _library: library,
            }
        }
        fn call(&self, method: &str, args: Vec<Value>) -> u64 {
            self.host.call(&json!({"method":method,"args":args}))
        }
        fn status(&self, generation: u64) -> u32 {
            self.host.status(generation).into()
        }
        fn render(&self) -> [[f32; 128]; 2] {
            self.host.render(&mut [[0.; 128]; 2], None)
        }
        fn save(&self) -> Vec<u8> {
            let bytes = self.host.save();
            let controller: ComPtr<IEditController> = instantiate(&self.factory, &CONTROLLER_CID);
            assert_eq!(unsafe { controller.initialize(null_mut()) }, kResultOk);
            let (state, _) = stream(bytes.clone());
            assert_eq!(
                unsafe { controller.setComponentState(state.as_ptr()) },
                kResultOk
            );
            assert_eq!(unsafe { controller.terminate() }, kResultOk);
            bytes
        }
        fn pause(&self) {
            assert_eq!(unsafe { self.host.audio.setProcessing(0) }, kResultOk);
        }
        fn resume(&self) {
            assert_eq!(unsafe { self.host.audio.setProcessing(1) }, kResultOk);
        }
        fn retire(&self) {
            self.host.status(0);
        }
    }

    struct Library(*mut c_void);
    impl Library {
        fn open(path: &Path) -> Self {
            let path = CString::new(path.as_os_str().as_encoded_bytes()).unwrap();
            let handle = unsafe { libc::dlopen(path.as_ptr(), libc::RTLD_NOW | libc::RTLD_LOCAL) };
            assert!(!handle.is_null(), "VST3 library failed to load");
            Self(handle)
        }
        fn factory(&self) -> ComPtr<IPluginFactory> {
            let entry = unsafe { libc::dlsym(self.0, c"GetPluginFactory".as_ptr()) };
            assert!(!entry.is_null(), "missing VST3 factory");
            let entry: unsafe extern "system" fn() -> *mut IPluginFactory =
                unsafe { std::mem::transmute(entry) };
            unsafe { ComPtr::from_raw(entry()) }.unwrap()
        }
    }
    impl Drop for Library {
        fn drop(&mut self) {
            unsafe { libc::dlclose(self.0) };
        }
    }

    fn instantiate<T: Interface>(factory: &ComPtr<IPluginFactory>, cid: &TUID) -> ComPtr<T> {
        let mut object = null_mut();
        assert_eq!(
            unsafe {
                factory.createInstance(cid.as_ptr().cast(), T::IID.as_ptr().cast(), &mut object)
            },
            kResultOk
        );
        unsafe { ComPtr::from_raw(object.cast()) }.unwrap()
    }

    struct StreamData {
        bytes: Vec<u8>,
        offset: usize,
    }
    struct Stream(Arc<Mutex<StreamData>>);
    impl Class for Stream {
        type Interfaces = (IBStream,);
    }
    impl IBStreamTrait for Stream {
        unsafe fn read(&self, buffer: *mut c_void, length: i32, count: *mut i32) -> tresult {
            if buffer.is_null() || count.is_null() || length < 0 {
                return kInvalidArgument;
            }
            let mut data = self.0.lock().unwrap();
            let length = (length as usize).min(data.bytes.len() - data.offset);
            unsafe {
                std::ptr::copy_nonoverlapping(
                    data.bytes.as_ptr().add(data.offset),
                    buffer.cast(),
                    length,
                );
                *count = length as i32;
            }
            data.offset += length;
            kResultOk
        }
        unsafe fn write(&self, buffer: *mut c_void, length: i32, count: *mut i32) -> tresult {
            if buffer.is_null() || count.is_null() || length < 0 {
                return kInvalidArgument;
            }
            let mut data = self.0.lock().unwrap();
            let offset = data.offset;
            let end = offset + length as usize;
            data.bytes.resize(end, 0);
            unsafe {
                std::ptr::copy_nonoverlapping(
                    buffer.cast::<u8>(),
                    data.bytes.as_mut_ptr().add(offset),
                    length as usize,
                );
                *count = length;
            }
            data.offset = end;
            kResultOk
        }
        unsafe fn seek(&self, _: i64, _: i32, _: *mut i64) -> tresult {
            kNotImplemented
        }
        unsafe fn tell(&self, _: *mut i64) -> tresult {
            kNotImplemented
        }
    }
    fn stream(bytes: Vec<u8>) -> (ComPtr<IBStream>, Arc<Mutex<StreamData>>) {
        let data = Arc::new(Mutex::new(StreamData { bytes, offset: 0 }));
        (
            ComWrapper::new(Stream(data.clone())).to_com_ptr().unwrap(),
            data,
        )
    }

    type AttrId = *const c_char;
    struct Attributes(Mutex<BTreeMap<Vec<u8>, Vec<u8>>>);
    impl Class for Attributes {
        type Interfaces = (IAttributeList,);
    }
    impl IAttributeListTrait for Attributes {
        unsafe fn setInt(&self, _: AttrId, _: i64) -> tresult {
            kNotImplemented
        }
        unsafe fn getInt(&self, _: AttrId, _: *mut i64) -> tresult {
            kNotImplemented
        }
        unsafe fn setFloat(&self, _: AttrId, _: f64) -> tresult {
            kNotImplemented
        }
        unsafe fn getFloat(&self, _: AttrId, _: *mut f64) -> tresult {
            kNotImplemented
        }
        unsafe fn setString(&self, _: AttrId, _: *const TChar) -> tresult {
            kNotImplemented
        }
        unsafe fn getString(&self, _: AttrId, _: *mut TChar, _: u32) -> tresult {
            kNotImplemented
        }
        unsafe fn setBinary(&self, id: AttrId, data: *const c_void, length: u32) -> tresult {
            if id.is_null() || data.is_null() {
                return kInvalidArgument;
            }
            let key = unsafe { CStr::from_ptr(id) }.to_bytes().to_vec();
            let value =
                unsafe { std::slice::from_raw_parts(data.cast::<u8>(), length as usize) }.to_vec();
            self.0.lock().unwrap().insert(key, value);
            kResultOk
        }
        unsafe fn getBinary(
            &self,
            id: AttrId,
            data: *mut *const c_void,
            length: *mut u32,
        ) -> tresult {
            if id.is_null() || data.is_null() || length.is_null() {
                return kInvalidArgument;
            }
            let key = unsafe { CStr::from_ptr(id) }.to_bytes();
            let guard = self.0.lock().unwrap();
            let Some(value) = guard.get(key) else {
                return kResultFalse;
            };
            unsafe {
                *data = value.as_ptr().cast();
                *length = value.len() as u32;
            }
            kResultOk
        }
    }
    struct Message {
        id: CString,
        attributes: ComPtr<IAttributeList>,
    }
    impl Class for Message {
        type Interfaces = (IMessage,);
    }
    impl IMessageTrait for Message {
        unsafe fn getMessageID(&self) -> FIDString {
            self.id.as_ptr()
        }
        unsafe fn setMessageID(&self, _: FIDString) {}
        unsafe fn getAttributes(&self) -> *mut IAttributeList {
            self.attributes.as_ptr()
        }
    }
    fn message(id: &str) -> ComPtr<IMessage> {
        let attributes = ComWrapper::new(Attributes(Mutex::new(BTreeMap::new())))
            .to_com_ptr()
            .unwrap();
        ComWrapper::new(Message {
            id: CString::new(id).unwrap(),
            attributes,
        })
        .to_com_ptr()
        .unwrap()
    }
    fn get_binary(attributes: ComRef<IAttributeList>, id: &CStr) -> Vec<u8> {
        let mut data = std::ptr::null();
        let mut length = 0;
        assert_eq!(
            unsafe { attributes.getBinary(id.as_ptr(), &mut data, &mut length) },
            kResultOk
        );
        unsafe { std::slice::from_raw_parts(data.cast::<u8>(), length as usize) }.to_vec()
    }

    struct Hosted {
        component: ComPtr<IComponent>,
        audio: ComPtr<IAudioProcessor>,
        connection: ComPtr<IConnectionPoint>,
    }
    impl Hosted {
        fn open(factory: &ComPtr<IPluginFactory>, bytes: &[u8]) -> Self {
            let component: ComPtr<IComponent> = instantiate(factory, &GRAPH_CID);
            assert_eq!(unsafe { component.initialize(null_mut()) }, kResultOk);
            let audio = component.cast::<IAudioProcessor>().unwrap();
            let connection = component.cast::<IConnectionPoint>().unwrap();
            let (incoming, _) = stream(bytes.to_vec());
            assert_eq!(unsafe { component.setState(incoming.as_ptr()) }, kResultOk);
            let mut setup = ProcessSetup {
                processMode: ProcessModes_::kOffline as i32,
                symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
                maxSamplesPerBlock: FRAMES as i32,
                sampleRate: RATE,
            };
            assert_eq!(unsafe { audio.setupProcessing(&mut setup) }, kResultOk);
            assert_eq!(unsafe { component.setActive(1) }, kResultOk);
            assert_eq!(unsafe { audio.setProcessing(1) }, kResultOk);
            Self {
                component,
                audio,
                connection,
            }
        }
        fn save(&self) -> Vec<u8> {
            let (outgoing, data) = stream(Vec::new());
            assert_eq!(
                unsafe { self.component.getState(outgoing.as_ptr()) },
                kResultOk
            );
            let bytes = data.lock().unwrap().bytes.clone();
            ProjectPackage::parse(&bytes).unwrap();
            bytes
        }
        fn call(&self, call: &Value) -> u64 {
            let message = message("manifold.graph.script.call.v1");
            let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }.unwrap();
            let bytes = serde_json::to_vec(call).unwrap();
            assert_eq!(
                unsafe {
                    attributes.setBinary(
                        c"call".as_ptr(),
                        bytes.as_ptr().cast(),
                        bytes.len() as u32,
                    )
                },
                kResultOk
            );
            assert_eq!(
                unsafe { self.connection.notify(message.as_ptr()) },
                kResultOk
            );
            u64::from_le_bytes(get_binary(attributes, c"generation").try_into().unwrap())
        }
        fn status(&self, generation: u64) -> u8 {
            let message = message("manifold.graph.script.status.v1");
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
            assert_eq!(
                unsafe { self.connection.notify(message.as_ptr()) },
                kResultOk
            );
            get_binary(attributes, c"status")[0]
        }
        fn render(
            &self,
            input: &mut [[f32; FRAMES]; 2],
            automation: Option<&ComPtr<IParameterChanges>>,
        ) -> [[f32; FRAMES]; 2] {
            let mut output = [[0_f32; FRAMES]; 2];
            let mut input_channels = [input[0].as_mut_ptr(), input[1].as_mut_ptr()];
            let mut output_channels = [output[0].as_mut_ptr(), output[1].as_mut_ptr()];
            let mut input_bus = AudioBusBuffers {
                numChannels: 2,
                silenceFlags: 0,
                __field0: AudioBusBuffers__type0 {
                    channelBuffers32: input_channels.as_mut_ptr(),
                },
            };
            let mut output_bus = AudioBusBuffers {
                numChannels: 2,
                silenceFlags: 0,
                __field0: AudioBusBuffers__type0 {
                    channelBuffers32: output_channels.as_mut_ptr(),
                },
            };
            let mut data = ProcessData {
                processMode: ProcessModes_::kOffline as i32,
                symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
                numSamples: FRAMES as i32,
                numInputs: 1,
                numOutputs: 1,
                inputs: &mut input_bus,
                outputs: &mut output_bus,
                inputParameterChanges: automation.map_or(null_mut(), |value| value.as_ptr()),
                outputParameterChanges: null_mut(),
                inputEvents: null_mut(),
                outputEvents: null_mut(),
                processContext: null_mut(),
            };
            assert_eq!(unsafe { self.audio.process(&mut data) }, kResultOk);
            output
        }
    }
    impl Drop for Hosted {
        fn drop(&mut self) {
            unsafe {
                self.audio.setProcessing(0);
                self.component.setActive(0);
                self.component.terminate();
            }
        }
    }

    fn render_pair(
        host: &Hosted,
        native: &mut NativeScriptAudio,
        block: usize,
        recording: &mut Vec<f32>,
        automation: Option<TimedAutomation>,
    ) -> f32 {
        let mut input: [[f32; FRAMES]; 2] = std::array::from_fn(|channel| {
            std::array::from_fn(|i| {
                let phase = (block * FRAMES + i) as f64 / RATE * std::f64::consts::TAU;
                (phase * if channel == 0 { 220. } else { 330. }).sin() as f32 * 0.12
            })
        });
        let queue = automation.map(|event| {
            automation_probe::changes(0, event.offset as i32, event.normalized.into())
        });
        let host_output = host.render(&mut input, queue.as_ref());
        let mut left = [0_f32; FRAMES];
        let mut right = [0_f32; FRAMES];
        native
            .process_host_automated(
                AudioBlock {
                    main: Some([&input[0], &input[1]]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                },
                automation.as_slice(),
            )
            .unwrap();
        let error = host_output[0]
            .iter()
            .zip(left)
            .chain(host_output[1].iter().zip(right))
            .map(|(host, native)| (host - native).abs())
            .fold(0_f32, f32::max);
        assert!(
            error < 1e-6,
            "packaged VST3/native mismatch in block {block}: {error}"
        );
        for i in 0..FRAMES {
            recording.extend_from_slice(&[host_output[0][i], host_output[1][i]]);
        }
        error
    }

    fn hash(bytes: &[u8]) -> String {
        format!("{:x}", Sha256::digest(bytes))
    }
    fn nodes(bytes: &[u8]) -> usize {
        let package = ProjectPackage::parse(bytes).unwrap();
        let graph: Value = serde_json::from_slice(package.state()).unwrap();
        graph["signal"]["nodes"].as_array().unwrap().len()
    }
    fn wav(path: &Path, samples: &[f32]) {
        let bytes = (samples.len() * 4) as u32;
        let mut file = std::fs::File::create(path).unwrap();
        file.write_all(b"RIFF").unwrap();
        file.write_all(&(36 + bytes).to_le_bytes()).unwrap();
        file.write_all(b"WAVEfmt ").unwrap();
        file.write_all(&16_u32.to_le_bytes()).unwrap();
        file.write_all(&3_u16.to_le_bytes()).unwrap();
        file.write_all(&2_u16.to_le_bytes()).unwrap();
        file.write_all(&(RATE as u32).to_le_bytes()).unwrap();
        file.write_all(&(RATE as u32 * 8).to_le_bytes()).unwrap();
        file.write_all(&8_u16.to_le_bytes()).unwrap();
        file.write_all(&32_u16.to_le_bytes()).unwrap();
        file.write_all(b"data").unwrap();
        file.write_all(&bytes.to_le_bytes()).unwrap();
        for sample in samples {
            file.write_all(&sample.to_le_bytes()).unwrap();
        }
    }

    mod declared_io { include!(concat!(env!("CARGO_MANIFEST_DIR"), "/examples/support/declared_io.rs")); }

    pub fn run() -> Result<(), Box<dyn std::error::Error>> {
        let args: Vec<_> = std::env::args().skip(1).collect();
        if args.first().is_some_and(|arg| arg == "--arbitrary-io") { return declared_io::run(&args); }
        if args.first().is_some_and(|arg| arg == "--samples") {
            if args.len() != 4 {
                return Err("expected --samples LIBRARY RACK_PACKAGE INSTRUMENT_PACKAGE; set MANIFOLD_SCRIPT_SAMPLE_EVIDENCE_DIR".into());
            }
            let library = Path::new(&args[1]).canonicalize()?;
            SAMPLE_LIBRARY.set(library.clone()).unwrap();
            let root = std::env::var_os("MANIFOLD_SCRIPT_SAMPLE_EVIDENCE_DIR")
                .ok_or("evidence directory required")?;
            let rack = std::fs::read(&args[2])?;
            let instrument = std::fs::read(&args[3])?;
            sample_suite::rack::<SampleHosted>("vst3-sdk", &rack);
            sample_suite::instrument::<SampleHosted>("vst3-sdk", &instrument);
            let manifest = json!({"library":library,"librarySha256":hash(&std::fs::read(&library)?),"rackPackageSha256":hash(&rack),"instrumentPackageSha256":hash(&instrument),"host":"exported VST3 factory and IAudioProcessor","editorOpened":false,"audioDeviceOpened":false,"heapCounters":"not observed across shared-library boundary; see separate release callback tests"});
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(Path::new(&root).join("vst3-sdk/manifest.json"))?;
            file.write_all(&serde_json::to_vec_pretty(&manifest)?)?;
            println!("{}", serde_json::to_string_pretty(&manifest)?);
            return Ok(());
        }
        if !(4..=5).contains(&args.len()) {
            return Err("expected LIBRARY PACKAGE OUTPUT_DIR CALL_JSON [REOPEN_CALL_JSON]".into());
        }
        let library_path = Path::new(&args[0]).canonicalize()?;
        let initial = std::fs::read(&args[1])?;
        let out = Path::new(&args[2]);
        std::fs::create_dir_all(out)?;
        let library = Library::open(&library_path);
        let factory = library.factory();
        let mut saved = initial.clone();
        let mut steps = Vec::new();
        let automated_gain: Option<f32> = std::env::var("MANIFOLD_PROBE_AUTOMATED_GAIN")
            .ok()
            .map(|value| value.parse())
            .transpose()?;
        for (index, call) in args[3..].iter().enumerate() {
            let call: Value = serde_json::from_str(call)?;
            let package = ProjectPackage::parse(&saved).unwrap();
            let host = Hosted::open(&factory, &saved);
            let (mut control, mut native) = package.prepare_native(RATE as f32, FRAMES).unwrap();
            let project = NativeProject::parse(package.state()).unwrap();
            let descriptor = project
                .host_parameters()
                .iter()
                .find(|parameter| parameter.node == 4 && parameter.local_id == 0)
                .unwrap();
            let automation = automated_gain.map(|value| TimedAutomation {
                offset: 64,
                id: u64::from(manifold_native::parameters::HOST_SLOT_BASE),
                normalized: descriptor.to_normalized(value).unwrap(),
            });
            let mut recording = Vec::new();
            let mut maximum_error = 0_f32;
            for block in 0..375 {
                maximum_error = maximum_error.max(render_pair(
                    &host,
                    &mut native,
                    block,
                    &mut recording,
                    if block == 187 { automation } else { None },
                ));
            }
            let before = host.save();

            let generation = host.call(&call);
            control
                .begin_call(
                    call["method"].as_str().unwrap(),
                    call["args"].as_array().unwrap(),
                )
                .unwrap();
            assert_eq!(host.status(generation), 0);
            assert_eq!(host.save(), before, "save changed before audio publication");
            maximum_error =
                maximum_error.max(render_pair(&host, &mut native, 375, &mut recording, None));
            assert!(control.poll().unwrap().is_some());
            assert_eq!(host.status(generation), 1);
            for block in 376..750 {
                maximum_error = maximum_error.max(render_pair(
                    &host,
                    &mut native,
                    block,
                    &mut recording,
                    if block == 187 { automation } else { None },
                ));
            }
            saved = host.save();
            let saved_graph: Value =
                serde_json::from_slice(ProjectPackage::parse(&saved).unwrap().state()).unwrap();
            let retained_gain = saved_graph["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|parameter| parameter["nodeId"] == 4 && parameter["id"] == 0)
                .unwrap()["value"]
                .as_f64()
                .unwrap();
            if let Some(gain) = automated_gain {
                assert!((retained_gain - f64::from(gain)).abs() < 1e-6);
            }
            let native_saved: Value =
                serde_json::from_slice(control.save_project().unwrap()).unwrap();
            let native_retained_gain = native_saved["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|parameter| parameter["nodeId"] == 4 && parameter["id"] == 0)
                .unwrap()["value"]
                .as_f64()
                .unwrap();
            assert!((native_retained_gain - retained_gain).abs() < 1e-6);
            let controller: ComPtr<IEditController> = instantiate(&factory, &CONTROLLER_CID);
            assert_eq!(unsafe { controller.initialize(null_mut()) }, kResultOk);
            let (state_stream, _) = stream(saved.clone());
            assert_eq!(
                unsafe { controller.setComponentState(state_stream.as_ptr()) },
                kResultOk
            );
            assert_eq!(unsafe { controller.terminate() }, kResultOk);
            let name = format!("step-{}.wav", index + 1);
            wav(&out.join(&name), &recording);
            std::fs::write(
                out.join(format!("step-{}.manifold.json", index + 1)),
                &saved,
            )?;
            let split = 375 * FRAMES * 2;
            let rms = |samples: &[f32]| {
                (samples
                    .iter()
                    .map(|sample| (*sample as f64).powi(2))
                    .sum::<f64>()
                    / samples.len() as f64)
                    .sqrt()
            };
            steps.push(json!({"hostAutomatedInputGain": automated_gain, "gainAfterStructuralEdit": retained_gain, "nativeSavedGain": native_retained_gain,
            "nativeParameterReadback": "automatic from native audio handle",
            "automationBlock": automation.map(|_| 187), "automationSampleOffset": automation.map(|event| event.offset), "call": call, "generation": generation, "nodesBefore": nodes(&before),
            "nodesAfter": nodes(&saved), "audio": name, "audioSha256": hash(&std::fs::read(out.join(&name))?),
            "beforeRms": rms(&recording[..split]), "afterRms": rms(&recording[split..]),
            "hostVsNativeMaximumError": maximum_error, "packageSha256": hash(&saved),
            "reopenedInstance": index > 0, "controllerAcceptedState": true,
            "saveBeforePublicationUnchanged": true, "acknowledgedAfterOneBlock": true}));
        }
        let report = json!({"library": library_path, "librarySha256": hash(&std::fs::read(&library_path)?),
        "initialPackageSha256": hash(&initial), "sampleRate": RATE, "blockFrames": FRAMES,
        "host": "VST3 exported factory, offline IAudioProcessor callback", "editorOpened": false,
        "audioDeviceOpened": false, "steps": steps, "recordedAtUnixSeconds": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs()});
        std::fs::write(out.join("report.json"), serde_json::to_vec_pretty(&report)?)?;
        println!("{}", serde_json::to_string_pretty(&report)?);
        Ok(())
    }
}

#[cfg(unix)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    probe::run()
}

#[cfg(not(unix))]
fn main() {
    panic!("this dynamic-library proof requires a Unix host");
}
