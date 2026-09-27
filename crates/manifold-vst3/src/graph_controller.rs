//! Fixed VST3 parameter surface for arbitrary authored graph projects.

use std::ffi::{c_char, c_void};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use manifold_native::parameters::{HOST_SLOT_BASE, HOST_SLOT_COUNT};
use manifold_native::project::NativeProject;
use vst3::{Class, ComPtr, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::graph_contract::{DEFAULT_PROJECT, normalized_values, slot_descriptors};
use crate::util::{copy_wstring, read_stream, utf16_string};

pub(crate) struct GraphController {
    pub(crate) shared: Arc<GraphShared>,
    defaults: [f64; HOST_SLOT_COUNT],
}

pub(crate) struct GraphShared {
    normalized: [AtomicU64; HOST_SLOT_COUNT],
    pub handler: Mutex<Option<ComPtr<IComponentHandler>>>,
    host: Mutex<Option<ComPtr<IHostApplication>>>,
    peer: Mutex<Option<ComPtr<IConnectionPoint>>>,
    presentation: Mutex<serde_json::Value>,
    version: AtomicU64,
}

impl GraphShared {
    pub fn import_project(&self, bytes: &[u8]) -> Result<(), &'static str> {
        let project = NativeProject::parse(bytes).map_err(|_| "invalid graph project")?;
        let next = presentation(bytes, &project).ok_or("unsupported graph presentation")?;
        let host = self
            .host
            .lock()
            .map_err(|_| "host unavailable")?
            .clone()
            .ok_or("host message service unavailable")?;
        let peer = self
            .peer
            .lock()
            .map_err(|_| "processor unavailable")?
            .clone()
            .ok_or("processor connection unavailable")?;
        let mut cid = IMessage_iid;
        let mut iid = IMessage_iid;
        let mut raw: *mut c_void = std::ptr::null_mut();
        if unsafe { host.createInstance(&mut cid, &mut iid, &mut raw) } != kResultOk {
            return Err("host cannot create a project message");
        }
        let message = unsafe { ComPtr::<IMessage>::from_raw(raw as *mut IMessage) }
            .ok_or("host returned an empty project message")?;
        unsafe { message.setMessageID(c"manifold.graph.import.v1".as_ptr()) };
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }
            .ok_or("host message has no attributes")?;
        let len = u32::try_from(bytes.len()).map_err(|_| "project too large")?;
        if unsafe { attributes.setBinary(c"project".as_ptr(), bytes.as_ptr().cast(), len) }
            != kResultOk
        {
            return Err("host rejected project data");
        }
        if unsafe { peer.notify(message.as_ptr()) } != kResultOk {
            return Err("processor rejected project");
        }
        let values = normalized_values(&slot_descriptors(&project));
        let mut current = self
            .presentation
            .lock()
            .map_err(|_| "presentation unavailable")?;
        *current = next;
        for (slot, value) in values.iter().enumerate() {
            self.normalized[slot].store(value.to_bits(), Ordering::Release);
        }
        self.version.fetch_add(1, Ordering::Release);
        if let Some(handler) = self.handler.lock().ok().and_then(|handler| handler.clone()) {
            unsafe { handler.restartComponent(RestartFlags_::kParamValuesChanged) };
        }
        Ok(())
    }

    pub fn value(&self, id: u32) -> f64 {
        GraphController::slot(id)
            .map(|slot| f64::from_bits(self.normalized[slot].load(Ordering::Acquire)))
            .unwrap_or(0.0)
    }

    pub fn set_value(&self, id: u32, value: f64) -> bool {
        let Some(slot) = GraphController::slot(id) else {
            return false;
        };
        if !value.is_finite() || !(0. ..=1.).contains(&value) {
            return false;
        }
        self.normalized[slot].store(value.to_bits(), Ordering::Release);
        self.version.fetch_add(1, Ordering::Release);
        true
    }

    pub fn version(&self) -> u64 {
        self.version.load(Ordering::Acquire)
    }

    pub fn snapshot(&self) -> Option<serde_json::Value> {
        let mut presentation = self.presentation.lock().ok()?.clone();
        for item in presentation["controls"].as_array_mut()? {
            item["normalized"] = serde_json::Value::from(self.value(item["id"].as_u64()? as u32));
        }
        Some(presentation)
    }
}

fn presentation(bytes: &[u8], project: &NativeProject) -> Option<serde_json::Value> {
    let document: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let nodes: Vec<_> = document["signal"]["nodes"]
        .as_array()?
        .iter()
        .map(|node| serde_json::json!({"id": node["id"], "type": node["type"]}))
        .collect();
    let descriptors = slot_descriptors(project);
    let controls: Vec<_> = descriptors
        .iter()
        .enumerate()
        .filter_map(|(slot, descriptor)| {
            descriptor.map(|descriptor| {
                serde_json::json!({
                    "id": HOST_SLOT_BASE + slot as u32,
                    "nodeId": descriptor.node,
                    "parameterId": descriptor.local_id,
                    "min": descriptor.min,
                    "max": descriptor.max,
                    "discrete": descriptor.discrete,
                })
            })
        })
        .collect();
    Some(
        serde_json::json!({"schemaVersion":1,"id":"manifold.graph","nodes":nodes,"controls":controls}),
    )
}

impl GraphController {
    pub const CID: TUID = uid(0xC5C5353D, 0x6BDF4E42, 0xAE535D85, 0x81C0832F);

    pub fn new() -> Self {
        let project = NativeProject::parse(DEFAULT_PROJECT).expect("authored default graph");
        let defaults = normalized_values(&slot_descriptors(&project));
        Self {
            shared: Arc::new(GraphShared {
                normalized: defaults.map(|value| AtomicU64::new(value.to_bits())),
                handler: Mutex::new(None),
                host: Mutex::new(None),
                peer: Mutex::new(None),
                presentation: Mutex::new(
                    presentation(DEFAULT_PROJECT, &project).expect("authored graph presentation"),
                ),
                version: AtomicU64::new(0),
            }),
            defaults,
        }
    }

    fn slot(id: u32) -> Option<usize> {
        id.checked_sub(HOST_SLOT_BASE)
            .filter(|slot| (*slot as usize) < HOST_SLOT_COUNT)
            .map(|slot| slot as usize)
    }
}

impl Class for GraphController {
    type Interfaces = (IEditController, IConnectionPoint);
}

impl IPluginBaseTrait for GraphController {
    unsafe fn initialize(&self, context: *mut FUnknown) -> tresult {
        if let Ok(mut host) = self.shared.host.lock() {
            *host = unsafe { ComRef::from_raw(context) }
                .and_then(|context| context.cast::<IHostApplication>());
        }
        kResultOk
    }
    unsafe fn terminate(&self) -> tresult {
        if let Ok(mut peer) = self.shared.peer.lock() {
            *peer = None;
        }
        if let Ok(mut host) = self.shared.host.lock() {
            *host = None;
        }
        kResultOk
    }
}

impl IConnectionPointTrait for GraphController {
    unsafe fn connect(&self, other: *mut IConnectionPoint) -> tresult {
        let Some(other) = (unsafe { ComRef::from_raw(other) }) else {
            return kInvalidArgument;
        };
        let Ok(mut peer) = self.shared.peer.lock() else {
            return kResultFalse;
        };
        *peer = Some(other.to_com_ptr());
        kResultOk
    }
    unsafe fn disconnect(&self, _other: *mut IConnectionPoint) -> tresult {
        let Ok(mut peer) = self.shared.peer.lock() else {
            return kResultFalse;
        };
        *peer = None;
        kResultOk
    }
    unsafe fn notify(&self, _message: *mut IMessage) -> tresult {
        kResultFalse
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
        let Some(presentation) = presentation(&bytes, &project) else {
            return kResultFalse;
        };
        let values = normalized_values(&slot_descriptors(&project));
        let Ok(mut current) = self.shared.presentation.lock() else {
            return kResultFalse;
        };
        *current = presentation;
        for (slot, value) in values.iter().enumerate() {
            self.shared.normalized[slot].store(value.to_bits(), Ordering::Release);
        }
        self.shared.version.fetch_add(1, Ordering::Release);
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
        self.shared.value(id)
    }
    unsafe fn setParamNormalized(&self, id: u32, value: f64) -> tresult {
        if self.shared.set_value(id, value) {
            kResultOk
        } else {
            kInvalidArgument
        }
    }
    unsafe fn setComponentHandler(&self, handler: *mut IComponentHandler) -> tresult {
        let Ok(mut slot) = self.shared.handler.lock() else {
            return kResultFalse;
        };
        *slot = unsafe { ComRef::from_raw(handler) }.map(|handler| handler.to_com_ptr());
        kResultOk
    }
    unsafe fn createView(&self, name: *const c_char) -> *mut IPlugView {
        #[cfg(target_os = "linux")]
        {
            crate::graph_editor::create_view(name, self.shared.clone())
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = name;
            std::ptr::null_mut()
        }
    }
}
