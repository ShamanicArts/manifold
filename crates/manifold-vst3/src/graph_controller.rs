//! Fixed VST3 parameter surface for arbitrary authored graph projects.

use std::ffi::c_char;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use manifold_native::parameters::{HOST_SLOT_BASE, HOST_SLOT_COUNT};
use manifold_native::project::NativeProject;
use vst3::{Class, ComPtr, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::graph_contract::{DEFAULT_PROJECT, normalized_values, slot_descriptors};
use crate::util::{copy_wstring, read_stream, utf16_string};

pub(crate) struct GraphController {
    normalized: [AtomicU64; HOST_SLOT_COUNT],
    defaults: [f64; HOST_SLOT_COUNT],
    handler: Mutex<Option<ComPtr<IComponentHandler>>>,
}

impl GraphController {
    pub const CID: TUID = uid(0xC5C5353D, 0x6BDF4E42, 0xAE535D85, 0x81C0832F);

    pub fn new() -> Self {
        let project = NativeProject::parse(DEFAULT_PROJECT).expect("authored default graph");
        let defaults = normalized_values(&slot_descriptors(&project));
        Self {
            normalized: defaults.map(|value| AtomicU64::new(value.to_bits())),
            defaults,
            handler: Mutex::new(None),
        }
    }

    fn slot(id: u32) -> Option<usize> {
        id.checked_sub(HOST_SLOT_BASE)
            .filter(|slot| (*slot as usize) < HOST_SLOT_COUNT)
            .map(|slot| slot as usize)
    }
}

impl Class for GraphController {
    type Interfaces = (IEditController,);
}

impl IPluginBaseTrait for GraphController {
    unsafe fn initialize(&self, _context: *mut FUnknown) -> tresult {
        kResultOk
    }
    unsafe fn terminate(&self) -> tresult {
        kResultOk
    }
}

impl IEditControllerTrait for GraphController {
    unsafe fn setComponentState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = (unsafe { read_stream(stream) }) else {
            return kResultFalse;
        };
        let Ok(project) = NativeProject::parse(&bytes) else {
            return kResultFalse;
        };
        let values = normalized_values(&slot_descriptors(&project));
        for (slot, value) in values.iter().enumerate() {
            self.normalized[slot].store(value.to_bits(), Ordering::Release);
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
        HOST_SLOT_COUNT as i32
    }

    unsafe fn getParameterInfo(&self, index: i32, info: *mut ParameterInfo) -> tresult {
        if index < 0 || index as usize >= HOST_SLOT_COUNT || info.is_null() {
            return kInvalidArgument;
        }
        let slot = index as usize;
        let info = unsafe { &mut *info };
        info.id = HOST_SLOT_BASE + index as u32;
        copy_wstring(&format!("Macro {:03}", slot + 1), &mut info.title);
        copy_wstring(&format!("M{:03}", slot + 1), &mut info.shortTitle);
        copy_wstring("", &mut info.units);
        info.stepCount = 0;
        info.defaultNormalizedValue = self.defaults[slot];
        info.unitId = 0;
        info.flags = ParameterInfo_::ParameterFlags_::kCanAutomate as i32;
        kResultOk
    }

    unsafe fn getParamStringByValue(&self, id: u32, value: f64, result: *mut String128) -> tresult {
        if Self::slot(id).is_none()
            || result.is_null()
            || !value.is_finite()
            || !(0. ..=1.).contains(&value)
        {
            return kInvalidArgument;
        }
        copy_wstring(&format!("{value:.3}"), unsafe { &mut *result });
        kResultOk
    }

    unsafe fn getParamValueByString(
        &self,
        id: u32,
        string: *mut TChar,
        result: *mut f64,
    ) -> tresult {
        if Self::slot(id).is_none() || result.is_null() {
            return kInvalidArgument;
        }
        let Some(value) = (unsafe { utf16_string(string, 128) })
            .and_then(|text| text.parse::<f64>().ok())
            .filter(|value| value.is_finite() && (0. ..=1.).contains(value))
        else {
            return kInvalidArgument;
        };
        unsafe { *result = value };
        kResultOk
    }

    unsafe fn normalizedParamToPlain(&self, _id: u32, value: f64) -> f64 {
        value
    }
    unsafe fn plainParamToNormalized(&self, _id: u32, value: f64) -> f64 {
        value
    }
    unsafe fn getParamNormalized(&self, id: u32) -> f64 {
        Self::slot(id)
            .map(|slot| f64::from_bits(self.normalized[slot].load(Ordering::Acquire)))
            .unwrap_or(0.0)
    }
    unsafe fn setParamNormalized(&self, id: u32, value: f64) -> tresult {
        let Some(slot) = Self::slot(id) else {
            return kInvalidArgument;
        };
        if !value.is_finite() || !(0. ..=1.).contains(&value) {
            return kInvalidArgument;
        }
        self.normalized[slot].store(value.to_bits(), Ordering::Release);
        kResultOk
    }
    unsafe fn setComponentHandler(&self, handler: *mut IComponentHandler) -> tresult {
        let Ok(mut slot) = self.handler.lock() else {
            return kResultFalse;
        };
        *slot = unsafe { ComRef::from_raw(handler) }.map(|handler| handler.to_com_ptr());
        kResultOk
    }
    unsafe fn createView(&self, _name: *const c_char) -> *mut IPlugView {
        std::ptr::null_mut()
    }
}
