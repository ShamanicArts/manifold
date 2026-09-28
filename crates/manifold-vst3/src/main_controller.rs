//! Fixed Main VST3 parameter surface. The original Main editor view will use
//! this same controller state once its VST3 message bridge is complete.

use std::ffi::{c_char, c_void};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use manifold_native::main_host_parameters::{MAIN_HOST_ID_CAPACITY, MainParameter, parameter_name};
use manifold_native::main_host_state::values_from_session;
use manifold_native::main_session::default_main_session;
use manifold_native::main_session_export::save_template;
use vst3::{Class, ComPtr, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::main_values::{normalized_to_plain, plain_to_normalized, step_count};
use crate::util::{copy_wstring, read_stream_limited, utf16_string, write_stream};

const MAX_STATE: usize = 300 * 1024 * 1024;
const CONTROLLER_MAGIC: &[u8; 8] = b"MNV3C001";
const MAX_CONTROLLER_STATE: usize = 16 * 1024;

pub(crate) struct MainController {
    ids: Vec<u32>,
    defaults: [f64; MAIN_HOST_ID_CAPACITY],
    normalized: [AtomicU64; MAIN_HOST_ID_CAPACITY],
    handler: Mutex<Option<ComPtr<IComponentHandler>>>,
    host: Mutex<Option<ComPtr<IHostApplication>>>,
    peer: Mutex<Option<ComPtr<IConnectionPoint>>>,
    pending_sync: AtomicBool,
}

impl MainController {
    pub const CID: TUID = uid(0x0B2E68F4, 0x956F4AD2, 0xB0D1F165, 0xB9DE0827);

    pub fn new() -> Self {
        let document = default_main_session(48_000.0).expect("authored Main default");
        let values = values_from_session(&document).expect("authored Main values");
        let ids = (0..MAIN_HOST_ID_CAPACITY as u32)
            .filter(|&id| MainParameter::spec(id).is_ok())
            .collect();
        let defaults = std::array::from_fn(|index| {
            let id = index as u32;
            if MainParameter::spec(id).is_err() {
                return 0.0;
            }
            plain_to_normalized(id, values[index]).unwrap_or_else(|| {
                plain_to_normalized(id, MainParameter::spec(id).unwrap().min).unwrap_or(0.0)
            })
        });
        let normalized = std::array::from_fn(|index| AtomicU64::new(defaults[index].to_bits()));
        Self {
            ids,
            defaults,
            normalized,
            handler: Mutex::new(None),
            host: Mutex::new(None),
            peer: Mutex::new(None),
            pending_sync: AtomicBool::new(false),
        }
    }

    fn value(&self, id: u32) -> f64 {
        f64::from_bits(self.normalized[id as usize].load(Ordering::Acquire))
    }

    fn send_values(&self, values: &[u8]) -> bool {
        let host = self.host.lock().ok().and_then(|slot| slot.clone());
        let peer = self.peer.lock().ok().and_then(|slot| slot.clone());
        let (Some(host), Some(peer)) = (host, peer) else {
            return false;
        };
        let mut cid = IMessage_iid;
        let mut iid = IMessage_iid;
        let mut raw: *mut c_void = std::ptr::null_mut();
        if unsafe { host.createInstance(&mut cid, &mut iid, &mut raw) } != kResultOk {
            return false;
        }
        let Some(message) = (unsafe { ComPtr::<IMessage>::from_raw(raw.cast()) }) else {
            return false;
        };
        unsafe { message.setMessageID(c"manifold.main.params.v1".as_ptr()) };
        let Some(attributes) = (unsafe { ComRef::from_raw(message.getAttributes()) }) else {
            return false;
        };
        unsafe {
            attributes.setBinary(
                c"values".as_ptr(),
                values.as_ptr().cast(),
                values.len() as u32,
            ) == kResultOk
                && peer.notify(message.as_ptr()) == kResultOk
        }
    }

    fn send_all(&self) -> bool {
        let mut bytes = Vec::with_capacity(self.ids.len() * 12);
        for &id in &self.ids {
            bytes.extend_from_slice(&id.to_le_bytes());
            bytes.extend_from_slice(&self.value(id).to_le_bytes());
        }
        self.send_values(&bytes)
    }
}

impl Class for MainController {
    type Interfaces = (IEditController, IConnectionPoint);
}

impl IPluginBaseTrait for MainController {
    unsafe fn initialize(&self, context: *mut FUnknown) -> tresult {
        if let Ok(mut host) = self.host.lock() {
            *host = unsafe { ComRef::from_raw(context) }
                .and_then(|context| context.cast::<IHostApplication>());
        }
        kResultOk
    }
    unsafe fn terminate(&self) -> tresult {
        if let Ok(mut peer) = self.peer.lock() {
            *peer = None;
        }
        if let Ok(mut host) = self.host.lock() {
            *host = None;
        }
        kResultOk
    }
}

impl IConnectionPointTrait for MainController {
    unsafe fn connect(&self, other: *mut IConnectionPoint) -> tresult {
        let Some(other) = (unsafe { ComRef::from_raw(other) }) else {
            return kInvalidArgument;
        };
        let Ok(mut peer) = self.peer.lock() else {
            return kResultFalse;
        };
        *peer = Some(other.to_com_ptr());
        drop(peer);
        if self.pending_sync.swap(false, Ordering::AcqRel) && !self.send_all() {
            self.pending_sync.store(true, Ordering::Release);
        }
        kResultOk
    }
    unsafe fn disconnect(&self, _other: *mut IConnectionPoint) -> tresult {
        if let Ok(mut peer) = self.peer.lock() {
            *peer = None;
        }
        kResultOk
    }
    unsafe fn notify(&self, _message: *mut IMessage) -> tresult {
        kResultFalse
    }
}

impl IEditControllerTrait for MainController {
    unsafe fn setComponentState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = (unsafe { read_stream_limited(stream, MAX_STATE) }) else {
            return kResultFalse;
        };
        let Ok(document) = save_template(&bytes) else {
            return kResultFalse;
        };
        let Some(values) = values_from_session(&document) else {
            return kResultFalse;
        };
        for &id in &self.ids {
            let normalized =
                plain_to_normalized(id, values[id as usize]).unwrap_or(self.defaults[id as usize]);
            self.normalized[id as usize].store(normalized.to_bits(), Ordering::Release);
        }
        kResultOk
    }
    unsafe fn setState(&self, stream: *mut IBStream) -> tresult {
        let Some(bytes) = (unsafe { read_stream_limited(stream, MAX_CONTROLLER_STATE) }) else {
            return kResultFalse;
        };
        if bytes.len() != 12 + self.ids.len() * 12 || !bytes.starts_with(CONTROLLER_MAGIC) {
            return kResultFalse;
        }
        let count = u32::from_le_bytes(bytes[8..12].try_into().unwrap()) as usize;
        if count != self.ids.len() {
            return kResultFalse;
        }
        let mut values = Vec::with_capacity(count);
        for (index, chunk) in bytes[12..].chunks_exact(12).enumerate() {
            let id = u32::from_le_bytes(chunk[..4].try_into().unwrap());
            let value = f64::from_le_bytes(chunk[4..].try_into().unwrap());
            if self.ids[index] != id || normalized_to_plain(id, value).is_none() {
                return kResultFalse;
            }
            values.push(value);
        }
        for (id, value) in self.ids.iter().zip(values) {
            self.normalized[*id as usize].store(value.to_bits(), Ordering::Release);
        }
        if !self.send_all() {
            self.pending_sync.store(true, Ordering::Release);
        }
        kResultOk
    }
    unsafe fn getState(&self, stream: *mut IBStream) -> tresult {
        let mut bytes = Vec::with_capacity(12 + self.ids.len() * 12);
        bytes.extend_from_slice(CONTROLLER_MAGIC);
        bytes.extend_from_slice(&(self.ids.len() as u32).to_le_bytes());
        for &id in &self.ids {
            bytes.extend_from_slice(&id.to_le_bytes());
            bytes.extend_from_slice(&self.value(id).to_le_bytes());
        }
        if unsafe { write_stream(stream, &bytes) } {
            kResultOk
        } else {
            kResultFalse
        }
    }
    unsafe fn getParameterCount(&self) -> i32 {
        self.ids.len() as i32
    }
    unsafe fn getParameterInfo(&self, index: i32, info: *mut ParameterInfo) -> tresult {
        if index < 0 || info.is_null() {
            return kInvalidArgument;
        }
        let Some(&id) = self.ids.get(index as usize) else {
            return kInvalidArgument;
        };
        let Ok(spec) = MainParameter::spec(id) else {
            return kInvalidArgument;
        };
        let (module, name) = parameter_name(spec.target);
        let info = unsafe { &mut *info };
        info.id = id;
        copy_wstring(&format!("{module} {name}"), &mut info.title);
        copy_wstring(&name, &mut info.shortTitle);
        copy_wstring("", &mut info.units);
        info.stepCount = step_count(id).unwrap_or(0);
        info.defaultNormalizedValue = self.defaults[id as usize];
        info.unitId = 0;
        info.flags = ParameterInfo_::ParameterFlags_::kCanAutomate as i32;
        kResultOk
    }
    unsafe fn getParamStringByValue(&self, id: u32, value: f64, result: *mut String128) -> tresult {
        if result.is_null() {
            return kInvalidArgument;
        }
        let Some(plain) = normalized_to_plain(id, value) else {
            return kInvalidArgument;
        };
        let text = if step_count(id).unwrap_or(0) > 0 {
            format!("{plain:.0}")
        } else {
            format!("{plain:.3}")
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
        if result.is_null() {
            return kInvalidArgument;
        }
        let Some(text) = (unsafe { utf16_string(string, 128) }) else {
            return kInvalidArgument;
        };
        let Some(value) = text
            .parse::<f32>()
            .ok()
            .and_then(|plain| plain_to_normalized(id, plain))
        else {
            return kInvalidArgument;
        };
        unsafe {
            *result = value;
        }
        kResultOk
    }
    unsafe fn normalizedParamToPlain(&self, id: u32, value: f64) -> f64 {
        normalized_to_plain(id, value).map_or(0.0, f64::from)
    }
    unsafe fn plainParamToNormalized(&self, id: u32, value: f64) -> f64 {
        plain_to_normalized(id, value as f32).unwrap_or(0.0)
    }
    unsafe fn getParamNormalized(&self, id: u32) -> f64 {
        if MainParameter::spec(id).is_err() {
            0.0
        } else {
            self.value(id)
        }
    }
    unsafe fn setParamNormalized(&self, id: u32, value: f64) -> tresult {
        if normalized_to_plain(id, value).is_none() {
            return kInvalidArgument;
        }
        self.normalized[id as usize].store(value.to_bits(), Ordering::Release);
        let mut bytes = [0_u8; 12];
        bytes[..4].copy_from_slice(&id.to_le_bytes());
        bytes[4..].copy_from_slice(&value.to_le_bytes());
        if !self.send_values(&bytes) {
            self.pending_sync.store(true, Ordering::Release);
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_native::main_host_parameters::LFO_BASE;

    #[test]
    fn main_controller_advertises_only_authored_ids_and_sparse_steps() {
        let controller = MainController::new();
        let expected = (0..MAIN_HOST_ID_CAPACITY as u32)
            .filter(|&id| MainParameter::spec(id).is_ok())
            .count();
        assert_eq!(unsafe { controller.getParameterCount() }, expected as i32);
        let position = controller
            .ids
            .iter()
            .position(|id| *id == LFO_BASE + 6)
            .unwrap();
        let mut info: ParameterInfo = unsafe { std::mem::zeroed() };
        assert_eq!(
            unsafe { controller.getParameterInfo(position as i32, &mut info) },
            kResultOk
        );
        assert_eq!(info.id, LFO_BASE + 6);
        assert_eq!(info.stepCount, 4);
        assert_eq!(
            unsafe { controller.normalizedParamToPlain(info.id, 0.75) },
            129.0
        );
    }
}
