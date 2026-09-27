//! VST3 host adapter for the authored Manifold Standalone FX project.
//! The browser Wasm and native host paths both execute manifold-core DSP.

mod controller;
mod processor;
mod util;

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
        2
    }

    unsafe fn getClassInfo(&self, index: i32, info: *mut PClassInfo) -> tresult {
        if info.is_null() {
            return kInvalidArgument;
        }
        let info = unsafe { &mut *info };
        info.cid = match index {
            0 => processor::Processor::CID,
            1 => controller::Controller::CID,
            _ => return kInvalidArgument,
        };
        info.cardinality = PClassInfo_::ClassCardinality_::kManyInstances as i32;
        copy_cstring(
            if index == 0 {
                "Audio Module Class"
            } else {
                "Component Controller Class"
            },
            &mut info.category,
        );
        copy_cstring("Manifold Standalone FX", &mut info.name);
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
            _ => return kInvalidArgument,
        };
        info.cardinality = PClassInfo_::ClassCardinality_::kManyInstances as i32;
        copy_cstring(
            if index == 0 {
                "Audio Module Class"
            } else {
                "Component Controller Class"
            },
            &mut info.category,
        );
        copy_cstring("Manifold Standalone FX", &mut info.name);
        info.classFlags = 0;
        copy_cstring(if index == 0 { "Fx" } else { "" }, &mut info.subCategories);
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
        Steinberg::Vst::{IComponent, IComponentTrait, IEditController, IEditControllerTrait},
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
        assert_eq!(unsafe { factory.countClasses() }, 2);
        for (cid, iid) in [
            (processor::Processor::CID, IComponent::IID),
            (controller::Controller::CID, IEditController::IID),
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
}
