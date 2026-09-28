//! VST3 host adapter for the authored Manifold Standalone FX project.
//! The browser Wasm and native host paths both execute manifold-core DSP.

mod controller;
#[cfg(target_os = "linux")]
mod editor;
mod graph_contract;
mod graph_controller;
#[cfg(target_os = "linux")]
mod graph_editor;
mod graph_processor;
mod main_controller;
#[cfg(target_os = "linux")]
mod main_editor;
mod main_processor;
mod main_values;
mod preset;
mod processor;
mod util;

pub use preset::export_graph_preset;

use std::ffi::c_void;

use util::copy_cstring;
use vst3::{Class, ComWrapper, Steinberg::*};

struct Factory;

impl Class for Factory {
    type Interfaces = (IPluginFactory2,);
}

impl IPluginFactoryTrait for Factory {
    unsafe fn getFactoryInfo(&self, info: *mut PFactoryInfo) -> tresult {
        if info.is_null() {
            return kInvalidArgument;
        }
        let info = unsafe { &mut *info };
        copy_cstring("Shamanic Arts", &mut info.vendor);
        copy_cstring("https://github.com/ShamanicArts/manifold", &mut info.url);
        copy_cstring("", &mut info.email);
        info.flags = PFactoryInfo_::FactoryFlags_::kUnicode as i32;
        kResultOk
    }

    unsafe fn countClasses(&self) -> i32 {
        6
    }

    unsafe fn getClassInfo(&self, index: i32, info: *mut PClassInfo) -> tresult {
        if info.is_null() {
            return kInvalidArgument;
        }
        let info = unsafe { &mut *info };
        info.cid = match index {
            0 => processor::Processor::CID,
            1 => controller::Controller::CID,
            2 => graph_processor::GraphProcessor::CID,
            3 => graph_controller::GraphController::CID,
            4 => main_processor::MainProcessor::CID,
            5 => main_controller::MainController::CID,
            _ => return kInvalidArgument,
        };
        info.cardinality = PClassInfo_::ClassCardinality_::kManyInstances as i32;
        copy_cstring(
            if index % 2 == 0 {
                "Audio Module Class"
            } else {
                "Component Controller Class"
            },
            &mut info.category,
        );
        copy_cstring(
            if index < 2 {
                "Manifold Standalone FX"
            } else if index < 4 {
                "Manifold Graph"
            } else {
                "Manifold Main"
            },
            &mut info.name,
        );
        kResultOk
    }

    unsafe fn createInstance(
        &self,
        cid: FIDString,
        iid: FIDString,
        obj: *mut *mut c_void,
    ) -> tresult {
        if cid.is_null() || iid.is_null() || obj.is_null() {
            return kInvalidArgument;
        }
        let cid = unsafe { *(cid as *const TUID) };
        let instance = if cid == processor::Processor::CID {
            Some(
                ComWrapper::new(processor::Processor::new())
                    .to_com_ptr::<FUnknown>()
                    .unwrap(),
            )
        } else if cid == controller::Controller::CID {
            Some(
                ComWrapper::new(controller::Controller::new())
                    .to_com_ptr::<FUnknown>()
                    .unwrap(),
            )
        } else if cid == graph_processor::GraphProcessor::CID {
            Some(
                ComWrapper::new(graph_processor::GraphProcessor::new())
                    .to_com_ptr::<FUnknown>()
                    .unwrap(),
            )
        } else if cid == graph_controller::GraphController::CID {
            Some(
                ComWrapper::new(graph_controller::GraphController::new())
                    .to_com_ptr::<FUnknown>()
                    .unwrap(),
            )
        } else if cid == main_processor::MainProcessor::CID {
            Some(
                ComWrapper::new(main_processor::MainProcessor::new())
                    .to_com_ptr::<FUnknown>()
                    .unwrap(),
            )
        } else if cid == main_controller::MainController::CID {
            Some(
                ComWrapper::new(main_controller::MainController::new())
                    .to_com_ptr::<FUnknown>()
                    .unwrap(),
            )
        } else {
            None
        };
        let Some(instance) = instance else {
            return kInvalidArgument;
        };
        let pointer = instance.as_ptr();
        unsafe { ((*(*pointer).vtbl).queryInterface)(pointer, iid as *mut TUID, obj) }
    }
}

impl IPluginFactory2Trait for Factory {
    unsafe fn getClassInfo2(&self, index: i32, info: *mut PClassInfo2) -> tresult {
        if info.is_null() {
            return kInvalidArgument;
        }
        let info = unsafe { &mut *info };
        info.cid = match index {
            0 => processor::Processor::CID,
            1 => controller::Controller::CID,
            2 => graph_processor::GraphProcessor::CID,
            3 => graph_controller::GraphController::CID,
            4 => main_processor::MainProcessor::CID,
            5 => main_controller::MainController::CID,
            _ => return kInvalidArgument,
        };
        info.cardinality = PClassInfo_::ClassCardinality_::kManyInstances as i32;
        copy_cstring(
            if index % 2 == 0 {
                "Audio Module Class"
            } else {
                "Component Controller Class"
            },
            &mut info.category,
        );
        copy_cstring(
            if index < 2 {
                "Manifold Standalone FX"
            } else if index < 4 {
                "Manifold Graph"
            } else {
                "Manifold Main"
            },
            &mut info.name,
        );
        info.classFlags = 0;
        copy_cstring(
            if index == 4 {
                "Instrument"
            } else if index % 2 == 0 {
                "Fx"
            } else {
                ""
            },
            &mut info.subCategories,
        );
        copy_cstring("Shamanic Arts", &mut info.vendor);
        copy_cstring("0.1.0", &mut info.version);
        copy_cstring("VST 3.8.0", &mut info.sdkVersion);
        kResultOk
    }
}

#[cfg(target_os = "linux")]
#[unsafe(no_mangle)]
pub extern "system" fn ModuleEntry(_library_handle: *mut c_void) -> bool {
    true
}

#[cfg(target_os = "linux")]
#[unsafe(no_mangle)]
pub extern "system" fn ModuleExit() -> bool {
    true
}

#[cfg(target_os = "windows")]
#[unsafe(no_mangle)]
pub extern "system" fn InitDll() -> bool {
    true
}

#[cfg(target_os = "windows")]
#[unsafe(no_mangle)]
pub extern "system" fn ExitDll() -> bool {
    true
}

#[cfg(target_os = "macos")]
#[unsafe(no_mangle)]
pub extern "system" fn BundleEntry(_bundle: *mut c_void) -> bool {
    true
}

#[cfg(target_os = "macos")]
#[unsafe(no_mangle)]
pub extern "system" fn BundleExit() -> bool {
    true
}

#[unsafe(no_mangle)]
pub extern "system" fn GetPluginFactory() -> *mut IPluginFactory {
    ComWrapper::new(Factory)
        .to_com_ptr::<IPluginFactory>()
        .unwrap()
        .into_raw()
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_native::DEFAULT_TYPE_PARAMETERS;
    use std::ptr::null_mut;
    use std::sync::{Arc, Mutex};
    use vst3::{
        ComPtr, Interface,
        Steinberg::Vst::{
            AudioBusBuffers, AudioBusBuffers__type0, BusDirections_, IAudioProcessorTrait,
            IComponent, IComponentTrait, IEditController, IEditControllerTrait, MediaTypes_,
            ProcessData, ProcessSetup, SpeakerArr, SymbolicSampleSizes_,
        },
    };

    struct StreamData {
        bytes: Vec<u8>,
        position: usize,
    }
    struct MemoryStream(Arc<Mutex<StreamData>>);

    impl Class for MemoryStream {
        type Interfaces = (IBStream,);
    }
    impl IBStreamTrait for MemoryStream {
        unsafe fn read(&self, buffer: *mut c_void, capacity: i32, count: *mut i32) -> tresult {
            if buffer.is_null() || capacity < 0 || count.is_null() {
                return kInvalidArgument;
            }
            let Ok(mut data) = self.0.lock() else {
                return kResultFalse;
            };
            let read = (data.bytes.len() - data.position).min(capacity as usize);
            unsafe {
                std::ptr::copy_nonoverlapping(
                    data.bytes.as_ptr().add(data.position),
                    buffer.cast(),
                    read,
                );
                *count = read as i32;
            }
            data.position += read;
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

    fn stream(bytes: Vec<u8>) -> (ComPtr<IBStream>, Arc<Mutex<StreamData>>) {
        let data = Arc::new(Mutex::new(StreamData { bytes, position: 0 }));
        let stream = ComWrapper::new(MemoryStream(data.clone()))
            .to_com_ptr::<IBStream>()
            .unwrap();
        (stream, data)
    }

    #[test]
    fn exported_factory_creates_processor_and_controller() {
        let factory = unsafe { ComPtr::from_raw(GetPluginFactory()) }.unwrap();
        assert_eq!(unsafe { factory.countClasses() }, 6);
        for (cid, iid) in [
            (processor::Processor::CID, IComponent::IID),
            (controller::Controller::CID, IEditController::IID),
            (graph_processor::GraphProcessor::CID, IComponent::IID),
            (graph_controller::GraphController::CID, IEditController::IID),
            (main_processor::MainProcessor::CID, IComponent::IID),
            (main_controller::MainController::CID, IEditController::IID),
        ] {
            let mut object = null_mut();
            let result = unsafe {
                factory.createInstance(
                    cid.as_ptr() as FIDString,
                    iid.as_ptr() as FIDString,
                    &mut object,
                )
            };
            assert_eq!(result, kResultOk);
            assert!(!object.is_null());
            let unknown = unsafe { ComPtr::<FUnknown>::from_raw(object as *mut FUnknown) }.unwrap();
            drop(unknown);
        }
    }

    #[test]
    fn processor_state_roundtrips_to_controller() {
        let mut document: serde_json::Value = serde_json::from_slice(util::SOURCE_PROJECT).unwrap();
        let values = [7., 0.72, 0.8, 0.3, 0.4, 0.5, 0.6];
        document["signal"]["initialParameters"] = serde_json::Value::Array(
            values
                .iter()
                .enumerate()
                .map(|(id, value)| serde_json::json!({"nodeId": 2, "id": id, "value": value}))
                .collect(),
        );
        document["typeParameters"] = serde_json::Value::Object(
            DEFAULT_TYPE_PARAMETERS
                .iter()
                .enumerate()
                .map(|(index, row)| (index.to_string(), serde_json::json!(row)))
                .collect(),
        );
        let bytes = serde_json::to_vec(&document).unwrap();
        let (input, _) = stream(bytes);
        let effect = processor::Processor::new();
        assert_eq!(unsafe { effect.setState(input.as_ptr()) }, kResultOk);
        let (output, output_data) = stream(Vec::new());
        assert_eq!(unsafe { effect.getState(output.as_ptr()) }, kResultOk);
        let saved = output_data.lock().unwrap().bytes.clone();
        let restored = manifold_native::project::NativeProject::parse_fx_module(&saved).unwrap();
        let host = restored.host_parameters();
        assert_eq!(
            host.iter()
                .find(|param| param.local_id == 0)
                .unwrap()
                .initial,
            7.
        );
        assert!(
            (host
                .iter()
                .find(|param| param.local_id == 1)
                .unwrap()
                .initial
                - 0.72)
                .abs()
                < 1e-5
        );
        assert_eq!(restored.fx_type_parameters()[7], [0.8, 0.3, 0.4, 0.5, 0.6]);
        let controller = controller::Controller::new();
        let (input_again, _) = stream(saved);
        assert_eq!(
            unsafe { controller.setComponentState(input_again.as_ptr()) },
            kResultOk
        );
        assert!((unsafe { controller.getParamNormalized(0) } - 7. / 20.).abs() < 1e-5);
        assert!((unsafe { controller.getParamNormalized(1) } - 0.72).abs() < 1e-5);
    }

    #[test]
    fn graph_state_restores_a_sidechain_route_and_controller() {
        let mut document: serde_json::Value =
            serde_json::from_slice(graph_contract::DEFAULT_PROJECT).unwrap();
        document["signal"]["nodes"] = serde_json::json!([
            {"id": 1, "type": "input.raw"},
            {"id": 2, "type": "input.sidechain"},
            {"id": 3, "type": "output"}
        ]);
        document["signal"]["connections"] =
            serde_json::json!([{"from": 2, "to": 3, "inputPort": 0}]);
        document["signal"]["initialParameters"] = serde_json::json!([]);
        let bytes = serde_json::to_vec(&document).unwrap();
        let graph = graph_processor::GraphProcessor::new();
        let (input, _) = stream(bytes);
        assert_eq!(unsafe { graph.setState(input.as_ptr()) }, kResultOk);
        let (output, saved_data) = stream(Vec::new());
        assert_eq!(unsafe { graph.getState(output.as_ptr()) }, kResultOk);
        let saved = saved_data.lock().unwrap().bytes.clone();
        assert!(manifold_native::project::NativeProject::parse(&saved).is_ok());
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&saved).unwrap()["signal"]["connections"]
                [0]["from"],
            2
        );
        let controller = graph_controller::GraphController::new();
        let (controller_input, _) = stream(saved);
        assert_eq!(
            unsafe { controller.setComponentState(controller_input.as_ptr()) },
            kResultOk
        );
        assert_eq!(unsafe { controller.getParameterCount() }, 128);
        let snapshot = controller.shared.snapshot().unwrap();
        assert!(
            snapshot["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|node| node["type"] == "input.sidechain")
        );
        assert!(snapshot["controls"].as_array().unwrap().is_empty());

        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 32,
            sampleRate: 48_000.,
        };
        assert_eq!(unsafe { graph.setupProcessing(&mut setup) }, kResultOk);
        let mut inputs = [SpeakerArr::kStereo, SpeakerArr::kStereo];
        let mut outputs = [SpeakerArr::kStereo];
        assert_eq!(
            unsafe { graph.setBusArrangements(inputs.as_mut_ptr(), 2, outputs.as_mut_ptr(), 1) },
            kResultOk
        );
        assert_eq!(
            unsafe {
                graph.activateBus(
                    MediaTypes_::kAudio as i32,
                    BusDirections_::kInput as i32,
                    1,
                    1,
                )
            },
            kResultOk
        );
        assert_eq!(unsafe { graph.setActive(1) }, kResultOk);

        let mut main_left = [0.8_f32; 32];
        let mut main_right = [-0.8_f32; 32];
        let mut side_left = [0.2_f32; 32];
        let mut side_right = [-0.3_f32; 32];
        let mut rendered_left = [0_f32; 32];
        let mut rendered_right = [0_f32; 32];
        let mut main_channels = [main_left.as_mut_ptr(), main_right.as_mut_ptr()];
        let mut side_channels = [side_left.as_mut_ptr(), side_right.as_mut_ptr()];
        let mut output_channels = [rendered_left.as_mut_ptr(), rendered_right.as_mut_ptr()];
        let mut buses = [
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
            numSamples: 32,
            numInputs: 2,
            numOutputs: 1,
            inputs: buses.as_mut_ptr(),
            outputs: &mut output_bus,
            inputParameterChanges: null_mut(),
            outputParameterChanges: null_mut(),
            inputEvents: null_mut(),
            outputEvents: null_mut(),
            processContext: null_mut(),
        };
        assert_eq!(unsafe { graph.process(&mut data) }, kResultOk);
        assert_eq!(rendered_left, side_left);
        assert_eq!(rendered_right, side_right);
        assert_eq!(unsafe { graph.setActive(0) }, kResultOk);
    }

    #[test]
    fn main_vst3_component_and_controller_reopen_portable_loop_and_sample_pcm() {
        let fixture = include_bytes!("../../../web/public/main-native-saved-session.json");
        let component = main_processor::MainProcessor::new();
        let controller = main_controller::MainController::new();
        let (incoming, _) = stream(fixture.to_vec());
        assert_eq!(unsafe { component.setState(incoming.as_ptr()) }, kResultOk);
        let (controller_state, _) = stream(fixture.to_vec());
        assert_eq!(
            unsafe { controller.setComponentState(controller_state.as_ptr()) },
            kResultOk
        );
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.0,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        // REAPER can request state after setProcessing(true) but before its
        // first audio block. That request must return the prepared session.
        assert_eq!(unsafe { component.setProcessing(1) }, kResultOk);

        let (outgoing, data) = stream(Vec::new());
        assert_eq!(unsafe { component.getState(outgoing.as_ptr()) }, kResultOk);
        let saved: serde_json::Value = serde_json::from_slice(&data.lock().unwrap().bytes).unwrap();
        let original: serde_json::Value = serde_json::from_slice(fixture).unwrap();
        for layer in 0..4 {
            assert_eq!(
                saved["layers"][layer]["pcmF32Base64"],
                original["layers"][layer]["pcmF32Base64"]
            );
        }
        assert_eq!(
            saved["sample"]["pcmF32Base64"],
            original["sample"]["pcmF32Base64"]
        );
        assert_eq!(unsafe { component.setProcessing(0) }, kResultOk);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }

    #[test]
    fn main_vst3_state_roundtrips_browser_audio_cables_and_shell_layout() {
        for fixture in [
            include_bytes!("../../../web/public/main-audio-patch-saved-session.json").as_slice(),
            include_bytes!("../../../web/public/main-rack-layout-saved-session.json").as_slice(),
            include_bytes!("../../../web/public/main-filter-compact-saved-session.json").as_slice(),
        ] {
            let component = main_processor::MainProcessor::new();
            let (incoming, _) = stream(fixture.to_vec());
            assert_eq!(unsafe { component.setState(incoming.as_ptr()) }, kResultOk);
            let mut setup = ProcessSetup {
                processMode: 0,
                symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
                maxSamplesPerBlock: 128,
                sampleRate: 48_000.0,
            };
            assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
            assert_eq!(unsafe { component.setActive(1) }, kResultOk);
            assert_eq!(unsafe { component.setProcessing(1) }, kResultOk);
            let (outgoing, data) = stream(Vec::new());
            assert_eq!(unsafe { component.getState(outgoing.as_ptr()) }, kResultOk);
            let saved: serde_json::Value =
                serde_json::from_slice(&data.lock().unwrap().bytes).unwrap();
            let original: serde_json::Value = serde_json::from_slice(fixture).unwrap();
            assert_eq!(saved["version"], 16);
            assert_eq!(saved["rackDocument"], original["rackDocument"]);
            assert_eq!(unsafe { component.setProcessing(0) }, kResultOk);
            assert_eq!(unsafe { component.setActive(0) }, kResultOk);
        }
    }

    #[test]
    fn main_vst3_editor_layout_edit_updates_component_state() {
        let browser: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../../web/public/main-rack-layout-saved-session.json"
        ))
        .unwrap();
        let mut moved = browser["rackDocument"].clone();
        moved["viewMode"] = serde_json::json!("patch");
        let component = main_processor::MainProcessor::new();
        assert!(component.set_rack_layout(&moved));
        let (outgoing, data) = stream(Vec::new());
        assert_eq!(unsafe { component.getState(outgoing.as_ptr()) }, kResultOk);
        let saved: serde_json::Value = serde_json::from_slice(&data.lock().unwrap().bytes).unwrap();
        assert_eq!(saved["rackDocument"], moved);

        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 44_100.0,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        let original: serde_json::Value = serde_json::from_slice(include_bytes!(
            "../../../projects/main-looper/default-session-v16.json"
        ))
        .unwrap();
        assert!(component.set_rack_layout(&original["rackDocument"]));
        let (outgoing, data) = stream(Vec::new());
        assert_eq!(unsafe { component.getState(outgoing.as_ptr()) }, kResultOk);
        let saved: serde_json::Value = serde_json::from_slice(&data.lock().unwrap().bytes).unwrap();
        assert_eq!(saved["rackDocument"], original["rackDocument"]);
        assert_eq!(saved["sampleRate"], 44_100.0);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);

        let fresh = main_processor::MainProcessor::new();
        assert_eq!(unsafe { fresh.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { fresh.setActive(1) }, kResultOk);
        assert!(fresh.set_rack_layout(&moved));
        let (outgoing, data) = stream(Vec::new());
        assert_eq!(unsafe { fresh.getState(outgoing.as_ptr()) }, kResultOk);
        let saved: serde_json::Value = serde_json::from_slice(&data.lock().unwrap().bytes).unwrap();
        assert_eq!(saved["sampleRate"], 44_100.0);
        assert_eq!(saved["rackDocument"], moved);
        assert_eq!(unsafe { fresh.setActive(0) }, kResultOk);
    }

    #[test]
    fn main_controller_state_preserves_host_edit_after_component_state() {
        use manifold_native::main_host_parameters::SYNTH_BASE;
        let source_output = SYNTH_BASE + 15;
        let original = main_controller::MainController::new();
        assert_eq!(
            unsafe { original.setParamNormalized(source_output, 0.1) },
            kResultOk
        );
        let (output, saved) = stream(Vec::new());
        assert_eq!(unsafe { original.getState(output.as_ptr()) }, kResultOk);
        let bytes = saved.lock().unwrap().bytes.clone();
        let reopened = main_controller::MainController::new();
        let fixture = include_bytes!("../../../web/public/main-native-saved-session.json");
        let (component, _) = stream(fixture.to_vec());
        assert_eq!(
            unsafe { reopened.setComponentState(component.as_ptr()) },
            kResultOk
        );
        let (input, _) = stream(bytes);
        assert_eq!(unsafe { reopened.setState(input.as_ptr()) }, kResultOk);
        assert_eq!(unsafe { reopened.getParamNormalized(source_output) }, 0.1);
    }

    #[test]
    fn main_vst3_saves_a_live_session_while_host_blocks_continue() {
        use std::sync::atomic::{AtomicBool, Ordering};
        let fixture = include_bytes!("../../../web/public/main-native-saved-session.json");
        let component = Arc::new(main_processor::MainProcessor::new());
        let (incoming, _) = stream(fixture.to_vec());
        assert_eq!(unsafe { component.setState(incoming.as_ptr()) }, kResultOk);
        let mut setup = ProcessSetup {
            processMode: 0,
            symbolicSampleSize: SymbolicSampleSizes_::kSample32 as i32,
            maxSamplesPerBlock: 128,
            sampleRate: 48_000.0,
        };
        assert_eq!(unsafe { component.setupProcessing(&mut setup) }, kResultOk);
        assert_eq!(unsafe { component.setActive(1) }, kResultOk);
        assert_eq!(unsafe { component.setProcessing(1) }, kResultOk);
        let running = Arc::new(AtomicBool::new(true));
        std::thread::scope(|scope| {
            let worker_component = Arc::clone(&component);
            let worker_running = Arc::clone(&running);
            scope.spawn(move || {
                let mut left = [0.0_f32; 128];
                let mut right = [0.0_f32; 128];
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
                while worker_running.load(Ordering::Acquire) {
                    assert_eq!(unsafe { worker_component.process(&mut block) }, kResultOk);
                }
            });
            let (outgoing, data) = stream(Vec::new());
            assert_eq!(unsafe { component.getState(outgoing.as_ptr()) }, kResultOk);
            let saved: serde_json::Value =
                serde_json::from_slice(&data.lock().unwrap().bytes).unwrap();
            let original: serde_json::Value = serde_json::from_slice(fixture).unwrap();
            assert_eq!(
                saved["layers"][0]["pcmF32Base64"],
                original["layers"][0]["pcmF32Base64"]
            );
            assert_eq!(
                saved["sample"]["pcmF32Base64"],
                original["sample"]["pcmF32Base64"]
            );
            running.store(false, Ordering::Release);
        });
        assert_eq!(unsafe { component.setProcessing(0) }, kResultOk);
        assert_eq!(unsafe { component.setActive(0) }, kResultOk);
    }
}
