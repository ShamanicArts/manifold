use std::ffi::c_char;
use std::ptr;
use std::sync::atomic::{AtomicU64, Ordering};

use manifold_native::project::NativeProject;
use vst3::{Class, Steinberg::Vst::*, Steinberg::*, uid};

use crate::util::{DEFAULTS, LABELS, TYPES, copy_wstring, read_stream, utf16_string};

pub(crate) struct Controller {
    normalized: [AtomicU64; 7],
}

impl Controller {
    pub const CID: TUID = uid(0xA3D4C7B1, 0x5F584B2B, 0x89A3F18E, 0x203AD8B7);

    pub fn new() -> Self {
        Self {
            normalized: DEFAULTS.map(|value| AtomicU64::new((value as f64).to_bits())),
        }
    }

    fn value(&self, id: usize) -> f64 {
        f64::from_bits(self.normalized[id].load(Ordering::Acquire))
    }
}

impl Class for Controller {
    type Interfaces = (IEditController,);
}

impl IPluginBaseTrait for Controller {
    unsafe fn initialize(&self, _context: *mut FUnknown) -> tresult {
        kResultOk
    }
    unsafe fn terminate(&self) -> tresult {
        kResultOk
    }
}

impl IEditControllerTrait for Controller {
    unsafe fn setComponentState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = (unsafe { read_stream(stream) }) else {
            return kResultFalse;
        };
        let Ok(project) = NativeProject::parse_fx_module(&bytes) else {
            return kResultFalse;
        };
        for parameter in project.host_parameters() {
            let id = parameter.local_id as usize;
            if id >= 7 {
                return kResultFalse;
            }
            let normalized = if id == 0 {
                parameter.initial as f64 / 20.
            } else {
                parameter.initial as f64
            };
            self.normalized[id].store(normalized.to_bits(), Ordering::Release);
        }
        kResultOk
    }

    unsafe fn setState(&self, _stream: *mut IBStream) -> tresult {
        kResultOk
    }
    unsafe fn getState(&self, _stream: *mut IBStream) -> tresult {
        kResultOk
    }
    unsafe fn getParameterCount(&self) -> i32 {
        7
    }

    unsafe fn getParameterInfo(&self, index: i32, info: *mut ParameterInfo) -> tresult {
        if !(0..7).contains(&index) || info.is_null() {
            return kInvalidArgument;
        }
        let id = index as usize;
        let info = unsafe { &mut *info };
        info.id = index as u32;
        copy_wstring(LABELS[id], &mut info.title);
        copy_wstring(LABELS[id], &mut info.shortTitle);
        copy_wstring("", &mut info.units);
        info.stepCount = if id == 0 { 20 } else { 0 };
        info.defaultNormalizedValue = if id == 0 { 0. } else { DEFAULTS[id] as f64 };
        info.unitId = 0;
        info.flags = ParameterInfo_::ParameterFlags_::kCanAutomate as i32;
        kResultOk
    }

    unsafe fn getParamStringByValue(&self, id: u32, value: f64, result: *mut String128) -> tresult {
        if id >= 7 || result.is_null() || !value.is_finite() || !(0. ..=1.).contains(&value) {
            return kInvalidArgument;
        }
        let text = if id == 0 {
            TYPES[(value * 20.).round() as usize].to_string()
        } else {
            format!("{value:.3}")
        };
        copy_wstring(&text, unsafe { &mut *result });
        kResultOk
    }

    unsafe fn getParamValueByString(
        &self,
        id: u32,
        string: *mut TChar,
        result: *mut f64,
    ) -> tresult {
        if id >= 7 || result.is_null() {
            return kInvalidArgument;
        }
        let Some(text) = (unsafe { utf16_string(string, 128) }) else {
            return kInvalidArgument;
        };
        let normalized = if id == 0 {
            TYPES
                .iter()
                .position(|label| label.eq_ignore_ascii_case(&text))
                .map(|index| index as f64 / 20.)
                .or_else(|| text.parse::<f64>().ok().map(|value| value / 20.))
        } else {
            text.parse::<f64>().ok()
        };
        let Some(value) =
            normalized.filter(|value| value.is_finite() && (0. ..=1.).contains(value))
        else {
            return kInvalidArgument;
        };
        unsafe {
            *result = value;
        }
        kResultOk
    }

    unsafe fn normalizedParamToPlain(&self, id: u32, value: f64) -> f64 {
        if id == 0 { value * 20. } else { value }
    }

    unsafe fn plainParamToNormalized(&self, id: u32, value: f64) -> f64 {
        if id == 0 { value / 20. } else { value }
    }

    unsafe fn getParamNormalized(&self, id: u32) -> f64 {
        if id >= 7 { 0. } else { self.value(id as usize) }
    }

    unsafe fn setParamNormalized(&self, id: u32, value: f64) -> tresult {
        if id >= 7 || !value.is_finite() || !(0. ..=1.).contains(&value) {
            return kInvalidArgument;
        }
        self.normalized[id as usize].store(value.to_bits(), Ordering::Release);
        kResultOk
    }

    unsafe fn setComponentHandler(&self, _handler: *mut IComponentHandler) -> tresult {
        kResultOk
    }
    unsafe fn createView(&self, _name: *const c_char) -> *mut IPlugView {
        ptr::null_mut()
    }
}
