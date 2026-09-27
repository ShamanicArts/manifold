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
    project: Mutex<Vec<u8>>,
    pub handler: Mutex<Option<ComPtr<IComponentHandler>>>,
    host: Mutex<Option<ComPtr<IHostApplication>>>,
    peer: Mutex<Option<ComPtr<IConnectionPoint>>>,
    presentation: Mutex<serde_json::Value>,
    version: AtomicU64,
}

impl GraphShared {
    fn capture_message(
        &self,
        id: &std::ffi::CStr,
    ) -> Result<(ComPtr<IMessage>, ComPtr<IConnectionPoint>), &'static str> {
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
            return Err("host cannot create a capture message");
        }
        let message = unsafe { ComPtr::<IMessage>::from_raw(raw as *mut IMessage) }
            .ok_or("host returned an empty capture message")?;
        unsafe { message.setMessageID(id.as_ptr()) };
        Ok((message, peer))
    }

    pub fn capture_start(&self, node: u32, seconds: f64) -> Result<(), &'static str> {
        if node == 0 || !seconds.is_finite() || !(0.05..=30.0).contains(&seconds) {
            return Err("invalid capture window");
        }
        self.capture_window(node, seconds, c"manifold.graph.capture.start.v1")
    }

    pub fn capture_start_bars(&self, node: u32, bars: f64) -> Result<(), &'static str> {
        if node == 0 || !bars.is_finite() || !(0.0625..=16.0).contains(&bars) {
            return Err("invalid bar window");
        }
        self.capture_window(node, bars, c"manifold.graph.capture.bars.v1")
    }

    pub fn capture_free_arm(&self, node: u32) -> Result<(), &'static str> {
        self.capture_free_command(node, c"manifold.graph.capture.free.arm.v1")
    }

    pub fn capture_free_stop(&self, node: u32) -> Result<(), &'static str> {
        self.capture_free_command(node, c"manifold.graph.capture.free.stop.v1")
    }

    fn capture_free_command(&self, node: u32, kind: &std::ffi::CStr) -> Result<(), &'static str> {
        if node == 0 {
            return Err("invalid capture source");
        }
        let (message, peer) = self.capture_message(kind)?;
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }
            .ok_or("host message has no attributes")?;
        let request = node.to_le_bytes();
        if unsafe { attributes.setBinary(c"node".as_ptr(), request.as_ptr().cast(), 4) }
            != kResultOk
        {
            return Err("host rejected free capture request");
        }
        if unsafe { peer.notify(message.as_ptr()) } != kResultOk {
            return Err("processor rejected free capture request");
        }
        Ok(())
    }

    fn capture_window(
        &self,
        node: u32,
        window: f64,
        kind: &std::ffi::CStr,
    ) -> Result<(), &'static str> {
        let (message, peer) = self.capture_message(kind)?;
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }
            .ok_or("host message has no attributes")?;
        let mut request = [0_u8; 12];
        request[..4].copy_from_slice(&node.to_le_bytes());
        request[4..].copy_from_slice(&window.to_le_bytes());
        if unsafe { attributes.setBinary(c"request".as_ptr(), request.as_ptr().cast(), 12) }
            != kResultOk
        {
            return Err("host rejected capture request");
        }
        if unsafe { peer.notify(message.as_ptr()) } != kResultOk {
            return Err("processor rejected capture request");
        }
        Ok(())
    }

    /// None means still freezing; true means portable state was returned and
    /// adopted by this controller. The processor owns the prepared graph swap.
    pub fn capture_finish(&self, instrument: u32) -> Result<Option<bool>, &'static str> {
        if instrument == 0 {
            return Err("invalid sample instrument");
        }
        let (message, peer) = self.capture_message(c"manifold.graph.capture.finish.v1")?;
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }
            .ok_or("host message has no attributes")?;
        let request = instrument.to_le_bytes();
        if unsafe { attributes.setBinary(c"instrument".as_ptr(), request.as_ptr().cast(), 4) }
            != kResultOk
        {
            return Err("host rejected capture result request");
        }
        if unsafe { peer.notify(message.as_ptr()) } != kResultOk {
            return Err("processor could not finish capture");
        }
        let mut data: *const c_void = std::ptr::null();
        let mut size = 0;
        if unsafe { attributes.getBinary(c"status".as_ptr(), &mut data, &mut size) } != kResultOk
            || data.is_null()
            || size != 1
        {
            return Err("missing capture status");
        }
        let status = unsafe { *(data.cast::<u8>()) };
        if status == 0 {
            return Ok(None);
        }
        if status == 2 {
            return Ok(Some(false));
        }
        if status != 1 {
            return Err("invalid capture status");
        }
        let mut project_data: *const c_void = std::ptr::null();
        let mut project_size = 0;
        if unsafe {
            attributes.getBinary(c"project".as_ptr(), &mut project_data, &mut project_size)
        } != kResultOk
            || project_data.is_null()
            || project_size <= 0
            || project_size > 45 * 1024 * 1024
        {
            return Err("missing captured project");
        }
        let bytes =
            unsafe { std::slice::from_raw_parts(project_data.cast::<u8>(), project_size as usize) };
        let project = NativeProject::parse(bytes).map_err(|_| "invalid captured project")?;
        let next = presentation(bytes, &project).ok_or("unsupported captured presentation")?;
        let values = normalized_values(&slot_descriptors(&project));
        *self
            .presentation
            .lock()
            .map_err(|_| "presentation unavailable")? = next;
        *self.project.lock().map_err(|_| "project unavailable")? = bytes.to_vec();
        for (slot, value) in values.iter().enumerate() {
            self.normalized[slot].store(value.to_bits(), Ordering::Release);
        }
        self.version.fetch_add(1, Ordering::Release);
        if let Some(handler) = self.handler.lock().ok().and_then(|handler| handler.clone()) {
            unsafe { handler.restartComponent(RestartFlags_::kParamValuesChanged) };
        }
        Ok(Some(true))
    }

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
        *self.project.lock().map_err(|_| "project unavailable")? = bytes.to_vec();
        for (slot, value) in values.iter().enumerate() {
            self.normalized[slot].store(value.to_bits(), Ordering::Release);
        }
        self.version.fetch_add(1, Ordering::Release);
        if let Some(handler) = self.handler.lock().ok().and_then(|handler| handler.clone()) {
            unsafe { handler.restartComponent(RestartFlags_::kParamValuesChanged) };
        }
        Ok(())
    }

    pub fn reassign_slot(&self, id: u32, slot: u32) -> Result<(), &'static str> {
        let source = GraphController::slot(id).ok_or("invalid source slot")? as u32;
        if slot as usize >= HOST_SLOT_COUNT {
            return Err("invalid destination slot");
        }
        if source == slot {
            return Ok(());
        }
        let bytes = self
            .project
            .lock()
            .map_err(|_| "project unavailable")?
            .clone();
        let values = std::array::from_fn(|index| self.value(HOST_SLOT_BASE + index as u32));
        let updated = reassigned_project(&bytes, source, slot, &values)?;
        self.import_project(&updated)
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
        serde_json::json!({"schemaVersion":1,"id":"manifold.graph","nodes":nodes,"controls":controls,"captureGesture":true,
            "captureSources":document["signal"]["captureSources"],
            "selectedCaptureNodeId":document["signal"]["selectedCaptureNodeId"]}),
    )
}

fn reassigned_project(
    bytes: &[u8],
    source: u32,
    destination: u32,
    values: &[f64; HOST_SLOT_COUNT],
) -> Result<Vec<u8>, &'static str> {
    if source as usize >= HOST_SLOT_COUNT || destination as usize >= HOST_SLOT_COUNT {
        return Err("invalid host slot");
    }
    let project = NativeProject::parse(bytes).map_err(|_| "invalid graph project")?;
    let mut bindings = project.host_bindings().to_vec();
    let current = bindings
        .iter()
        .position(|binding| binding.slot == source)
        .ok_or("source slot is unbound")?;
    let mut document: serde_json::Value =
        serde_json::from_slice(bytes).map_err(|_| "invalid graph project")?;
    let parameters = document["signal"]["initialParameters"]
        .as_array_mut()
        .ok_or("invalid graph parameters")?;
    for binding in &bindings {
        let descriptor = project
            .host_parameters()
            .iter()
            .find(|parameter| parameter.id == binding.graph_parameter)
            .ok_or("invalid host binding")?;
        let physical = descriptor
            .from_normalized(values[binding.slot as usize] as f32)
            .ok_or("invalid host value")?;
        let entry = parameters
            .iter_mut()
            .find(|entry| entry["nodeId"] == descriptor.node && entry["id"] == descriptor.local_id)
            .ok_or("missing graph parameter")?;
        entry["value"] = serde_json::Value::from(physical);
    }
    if let Some(displaced) = bindings
        .iter()
        .position(|binding| binding.slot == destination)
    {
        bindings[displaced].slot = source;
    }
    bindings[current].slot = destination;
    document["hostBindings"] = serde_json::Value::Array(
        bindings
            .iter()
            .map(|binding| {
                serde_json::json!({"slot":binding.slot,
                    "nodeId":binding.graph_parameter >> 8,
                    "id":binding.graph_parameter & 255})
            })
            .collect(),
    );
    serde_json::to_vec(&document).map_err(|_| "project serialization failed")
}

#[cfg(test)]
mod assignment_tests {
    use super::*;

    #[test]
    fn assignment_moves_and_swaps_fixed_slots_with_current_control_values() {
        let source = NativeProject::parse(DEFAULT_PROJECT).unwrap();
        let descriptors = slot_descriptors(&source);
        let first = descriptors[0].unwrap();
        let second = descriptors[1].unwrap();
        let mut values = normalized_values(&descriptors);
        values[0] = 0.75;
        let moved = reassigned_project(DEFAULT_PROJECT, 0, 17, &values).unwrap();
        let parsed = NativeProject::parse(&moved).unwrap();
        assert!(
            parsed
                .host_bindings()
                .iter()
                .any(|binding| binding.slot == 17 && binding.graph_parameter == first.id)
        );
        assert!(
            !parsed
                .host_bindings()
                .iter()
                .any(|binding| binding.slot == 0)
        );
        let document: serde_json::Value = serde_json::from_slice(&moved).unwrap();
        let value = document["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["nodeId"] == first.node && entry["id"] == first.local_id)
            .unwrap()["value"]
            .as_f64()
            .unwrap();
        assert!((value - first.from_normalized(0.75).unwrap() as f64).abs() < 1e-5);
        let swapped = reassigned_project(
            &moved,
            17,
            1,
            &normalized_values(&slot_descriptors(&parsed)),
        )
        .unwrap();
        let parsed = NativeProject::parse(&swapped).unwrap();
        assert!(
            parsed
                .host_bindings()
                .iter()
                .any(|binding| binding.slot == 1 && binding.graph_parameter == first.id)
        );
        assert!(
            parsed
                .host_bindings()
                .iter()
                .any(|binding| binding.slot == 17 && binding.graph_parameter == second.id)
        );
        assert!(reassigned_project(&swapped, 99, 1, &values).is_err());
    }
}

impl GraphController {
    pub const CID: TUID = uid(0xC5C5353D, 0x6BDF4E42, 0xAE535D85, 0x81C0832F);

    pub fn new() -> Self {
        let project = NativeProject::parse(DEFAULT_PROJECT).expect("authored default graph");
        let defaults = normalized_values(&slot_descriptors(&project));
        Self {
            shared: Arc::new(GraphShared {
                normalized: defaults.map(|value| AtomicU64::new(value.to_bits())),
                project: Mutex::new(DEFAULT_PROJECT.to_vec()),
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
        let Ok(mut saved_project) = self.shared.project.lock() else {
            return kResultFalse;
        };
        *saved_project = bytes;
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
