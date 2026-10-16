//! Project-sized VST3 parameter surface for arbitrary authored graph projects.

use std::ffi::{c_char, c_void};
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use manifold_native::parameters::{HOST_SLOT_BASE, HostParameterDisplay, host_parameter_displays};
use manifold_native::project::NativeProject;
use manifold_project_js::package::ProjectPackage;
use vst3::{Class, ComPtr, ComRef, Steinberg::Vst::*, Steinberg::*, uid};

use crate::graph_contract::{DEFAULT_PROJECT, normalized_values, slot_descriptors};
use crate::util::{copy_wstring, read_project_stream, utf16_string};

pub(crate) struct GraphController {
    pub(crate) shared: Arc<GraphShared>,
}

pub(crate) struct GraphShared {
    parameters: Mutex<ControllerParameters>,
    project: Mutex<Vec<u8>>,
    pub handler: Mutex<Option<ComPtr<IComponentHandler>>>,
    host: Mutex<Option<ComPtr<IHostApplication>>>,
    peer: Mutex<Option<ComPtr<IConnectionPoint>>>,
    presentation: Mutex<serde_json::Value>,
    version: AtomicU64,
}

struct ControllerParameters {
    normalized: BTreeMap<usize, f64>,
    defaults: BTreeMap<usize, f64>,
    displays: BTreeMap<usize, HostParameterDisplay>,
}

impl GraphShared {
    fn replace_parameters(&self, values: BTreeMap<usize, f64>, project: &NativeProject) -> bool {
        let mut current = self.parameters.lock().unwrap();
        let displays = host_parameter_displays(project, &slot_descriptors(project));
        let changed = !current.normalized.keys().eq(values.keys()) || crate::product::EXPORTED && displays.iter().any(|(slot, display)| {
            display.parameter.map(|p| (p.min,p.max,p.discrete)) != current.displays.get(slot).and_then(|d| d.parameter).map(|p| (p.min,p.max,p.discrete))
                || Some(display.default_value) != current.displays.get(slot).map(|d| d.default_value)
        });
        *current = ControllerParameters { displays, defaults: values.clone(), normalized: values };
        changed
    }

    pub fn has_parameter(&self, id: u32) -> bool {
        GraphController::slot(id).is_some_and(|slot| self.parameters.lock().is_ok_and(|p| p.normalized.contains_key(&slot)))
    }

    fn notify_parameters(&self, changed: bool, io_changed: bool) {
        if let Some(handler) = self.handler.lock().ok().and_then(|handler| handler.clone()) {
            unsafe { handler.restartComponent(RestartFlags_::kParamValuesChanged | RestartFlags_::kParamTitlesChanged
                | if changed { RestartFlags_::kReloadComponent } else { 0 }
                | if io_changed { RestartFlags_::kIoChanged } else { 0 }); }
        }
    }

    fn script_message(&self, kind: &std::ffi::CStr, key: &std::ffi::CStr, bytes: &[u8], reply: &std::ffi::CStr) -> Result<Vec<u8>, &'static str> {
        let (message, peer) = self.capture_message(kind)?;
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }.ok_or("host message has no attributes")?;
        if !bytes.is_empty() && unsafe { attributes.setBinary(key.as_ptr(), bytes.as_ptr().cast(), bytes.len() as u32) } != kResultOk { return Err("host rejected creator message"); }
        if unsafe { peer.notify(message.as_ptr()) } != kResultOk { return Err("Native creator rejected the request"); }
        let mut data: *const c_void = std::ptr::null(); let mut size = 0;
        if unsafe { attributes.getBinary(reply.as_ptr(), &mut data, &mut size) } != kResultOk || data.is_null() || size == 0 { return Err("missing creator reply"); }
        Ok(unsafe { std::slice::from_raw_parts(data.cast::<u8>(), size as usize) }.to_vec())
    }

    pub fn has_creator(&self) -> bool {
        self.project.lock().ok().and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok()).is_some_and(|project| project["liveAuthoring"]["format"] == "manifold.live-project")
    }

    pub fn creator_presentation(&self) -> Option<serde_json::Value> {
        let bytes = self.script_message(c"manifold.graph.creator.presentation.v1", c"unused", &[], c"presentation").ok()?;
        let view: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
        let mut graph = view["graph"].clone();
        graph["liveAuthoring"] = serde_json::json!({"format":"manifold.live-project","version":1,"source":view["source"],"view":view["view"],"eventState":view["eventState"],"eventStateSchema":view["eventStateSchema"]});
        let graph = serde_json::to_vec(&graph).ok()?;
        let project = NativeProject::parse(&graph).ok()?;
        let mut current = self.project.lock().ok()?;
        if *current == graph { return Some(view); }
        *current = graph.clone();
        drop(current);
        *self.presentation.lock().ok()? = presentation(&graph, &project)?;
        let values = normalized_values(&slot_descriptors(&project));
        let changed = self.replace_parameters(values, &project);
        self.notify_parameters(changed, false);
        Some(view)
    }

    pub fn creator_request(&self, command: serde_json::Value) -> Result<u64, &'static str> {
        let bytes = serde_json::to_vec(&serde_json::json!({"method":"request","args":[command]})).map_err(|_| "invalid creator request")?;
        let generation = self.script_message(c"manifold.graph.script.call.v1", c"call", &bytes, c"generation")?;
        Ok(u64::from_le_bytes(generation.as_slice().try_into().map_err(|_| "invalid creator generation")?))
    }

    pub fn creator_status(&self, generation: u64) -> Result<u8, &'static str> {
        let status = self.script_message(c"manifold.graph.script.status.v1", c"generation", &generation.to_le_bytes(), c"status")?;
        status.first().copied().ok_or("missing creator status")
    }

    pub fn request_route(
        &self,
        to: u32,
        input: &str,
        from: Option<(u32, &str)>,
    ) -> Result<u64, &'static str> {
        let (message, peer) = self.capture_message(c"manifold.graph.route.v1")?;
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }
            .ok_or("host message has no attributes")?;
        let route = serde_json::json!({"to":to,"input":input,"from":from.map(|(node, _)| node),
            "output":from.map(|(_, output)| output)});
        let bytes = serde_json::to_vec(&route).map_err(|_| "invalid route")?;
        if unsafe {
            attributes.setBinary(c"route".as_ptr(), bytes.as_ptr().cast(), bytes.len() as u32)
        } != kResultOk
        {
            return Err("host rejected route message");
        }
        if unsafe { peer.notify(message.as_ptr()) } != kResultOk {
            return Err("processor rejected route");
        }
        let mut data: *const c_void = std::ptr::null();
        let mut size = 0;
        if unsafe { attributes.getBinary(c"generation".as_ptr(), &mut data, &mut size) }
            != kResultOk
            || data.is_null()
            || size != 8
        {
            return Err("missing route generation");
        }
        Ok(u64::from_le_bytes(
            unsafe { std::slice::from_raw_parts(data.cast::<u8>(), 8) }
                .try_into()
                .unwrap(),
        ))
    }

    /// The processor supplies the published document only after the callback applies the route.
    pub fn finish_route(&self, generation: u64) -> Result<Option<bool>, &'static str> {
        let (message, peer) = self.capture_message(c"manifold.graph.route.status.v1")?;
        let attributes = unsafe { ComRef::from_raw(message.getAttributes()) }
            .ok_or("host message has no attributes")?;
        if unsafe {
            attributes.setBinary(
                c"generation".as_ptr(),
                generation.to_le_bytes().as_ptr().cast(),
                8,
            )
        } != kResultOk
        {
            return Err("host rejected route status request");
        }
        if unsafe { peer.notify(message.as_ptr()) } != kResultOk {
            return Err("processor route status unavailable");
        }
        let mut data: *const c_void = std::ptr::null();
        let mut size = 0;
        if unsafe { attributes.getBinary(c"status".as_ptr(), &mut data, &mut size) } != kResultOk
            || data.is_null()
            || size != 1
        {
            return Err("missing route status");
        }
        match unsafe { *data.cast::<u8>() } {
            0 => Ok(None),
            2 => Ok(Some(false)),
            1 => {
                let mut project_data: *const c_void = std::ptr::null();
                let mut project_size = 0;
                if unsafe {
                    attributes.getBinary(c"project".as_ptr(), &mut project_data, &mut project_size)
                } != kResultOk
                    || project_data.is_null()
                    || project_size <= 0

                {
                    return Err("missing published route project");
                }
                let bytes = unsafe {
                    std::slice::from_raw_parts(project_data.cast::<u8>(), project_size as usize)
                };
                let project =
                    NativeProject::parse(bytes).map_err(|_| "invalid published route project")?;
                let next = presentation(bytes, &project).ok_or("invalid route presentation")?;
                *self
                    .presentation
                    .lock()
                    .map_err(|_| "presentation unavailable")? = next;
                *self.project.lock().map_err(|_| "project unavailable")? = bytes.to_vec();
                self.version.fetch_add(1, Ordering::Release);
                Ok(Some(true))
            }
            _ => Err("invalid route status"),
        }
    }

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
        if node == 0 || !seconds.is_finite() || seconds <= 0.0 {
            return Err("invalid capture window");
        }
        self.capture_window(node, seconds, c"manifold.graph.capture.start.v1")
    }

    pub fn capture_start_bars(&self, node: u32, bars: f64) -> Result<(), &'static str> {
        if node == 0 || !bars.is_finite() || bars <= 0.0 {
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
        let parameters_changed = self.replace_parameters(values, &project);
        self.version.fetch_add(1, Ordering::Release);
        self.notify_parameters(parameters_changed, false);
        Ok(Some(true))
    }

    pub fn import_project(&self, bytes: &[u8]) -> Result<(), &'static str> {
        let project = NativeProject::parse(bytes).map_err(|_| "invalid graph project")?;
        let next = presentation(bytes, &project).ok_or("unsupported graph presentation")?;
        let io_changed = {
            let previous = self.project.lock().map_err(|_| "project unavailable")?;
            let previous =
                NativeProject::parse(&previous).map_err(|_| "previous project unavailable")?;
            match (previous.io_layout(), project.io_layout()) {
                (None, None) => false,
                (Some(a), Some(b)) => a.inputs != b.inputs || a.outputs != b.outputs,
                _ => true,
            }
        };
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
        let parameters_changed = self.replace_parameters(values, &project);
        self.version.fetch_add(1, Ordering::Release);
        drop(current);
        self.notify_parameters(parameters_changed, io_changed);
        Ok(())
    }

    pub fn reassign_slot(&self, id: u32, slot: u32) -> Result<(), &'static str> {
        let source = GraphController::slot(id).ok_or("invalid source slot")? as u32;
        if slot > u32::MAX - HOST_SLOT_BASE {
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
        let values = self.parameters.lock().map_err(|_| "parameters unavailable")?.normalized.clone();
        let updated = reassigned_project(&bytes, source, slot, &values)?;
        self.import_project(&updated)
    }

    pub fn value(&self, id: u32) -> f64 {
        GraphController::slot(id)
            .and_then(|slot| self.parameters.lock().ok()?.normalized.get(&slot).copied())
            .unwrap_or(0.0)
    }

    pub fn set_value(&self, id: u32, value: f64) -> bool {
        let Some(slot) = GraphController::slot(id) else {
            return false;
        };
        if !value.is_finite() || !(0. ..=1.).contains(&value) {
            return false;
        }
        let Ok(mut parameters) = self.parameters.lock() else { return false; };
        let Some(current) = parameters.normalized.get_mut(&slot) else { return false; };
        *current = value;
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
    if !crate::graph_contract::host_ids_fit(project) { return None; }
    let document: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let nodes: Vec<_> = document["signal"]["nodes"]
        .as_array()?
        .iter()
        .map(|node| serde_json::json!({"id": node["id"], "type": node["type"]}))
        .collect();
    let descriptors = slot_descriptors(project);
    let controls: Vec<_> = descriptors
        .iter()
        .filter_map(|(&slot, descriptor)| {
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
        serde_json::json!({"schemaVersion":1,"id":"manifold.graph","hostSlotCount":if crate::product::EXPORTED { None } else { Some(manifold_native::parameters::STUDIO_HOST_SLOT_COUNT) },"nodes":nodes,"controls":controls,"captureGesture":true,
            "liveRoutes":project.supports_live_routes(),
            "connections":document["signal"]["connections"],
            "captureSources":document["signal"]["captureSources"],
            "selectedCaptureNodeId":document["signal"]["selectedCaptureNodeId"]}),
    )
}

fn reassigned_project(
    bytes: &[u8],
    source: u32,
    destination: u32,
    values: &BTreeMap<usize, f64>,
) -> Result<Vec<u8>, &'static str> {
    if source > u32::MAX - HOST_SLOT_BASE || destination > u32::MAX - HOST_SLOT_BASE
        || !crate::product::EXPORTED && destination >= manifold_native::parameters::STUDIO_HOST_SLOT_COUNT as u32 {
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
        let Some(value) = values.get(&(binding.slot as usize)) else { continue; };
        let physical = descriptor
            .from_normalized(*value as f32)
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
    manifold_native::parameters::swap_host_assignments(&mut document, source, destination);
    document["hostBindings"] = serde_json::Value::Array(
        bindings
            .iter()
            .map(|binding| {
                serde_json::json!({"slot":binding.slot,
                    "nodeId":binding.graph_parameter >> 32,
                    "id":binding.graph_parameter & u32::MAX as u64})
            })
            .collect(),
    );
    serde_json::to_vec(&document).map_err(|_| "project serialization failed")
}

#[cfg(test)]
mod assignment_tests {
    use super::*;

    mod fixture {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../manifold-native/tests/support/mixer_scale.rs"
        ));
    }

    #[test]
    fn mixer_wide_local_ids_survive_slot_swap_and_move() {
        let source = fixture::wide_mixer();
        let swapped =
            reassigned_project(&source, 0, 1, &BTreeMap::from([(0, 0.25), (1, 0.5)])).unwrap();
        fixture::assert_mixer_assignments(&swapped, 1, 0);
        let parsed = NativeProject::parse(&swapped).unwrap();
        let moved = reassigned_project(
            &swapped,
            1,
            17,
            &normalized_values(&slot_descriptors(&parsed)),
        )
        .unwrap();
        fixture::assert_mixer_assignments(&moved, 17, 0);
        let parsed = NativeProject::parse(&moved).unwrap();
        assert_eq!(
            parsed
                .host_parameters()
                .iter()
                .find(|p| p.node == 4 && p.local_id == 256)
                .unwrap()
                .initial,
            -0.5
        );
        assert_eq!(
            parsed
                .host_parameters()
                .iter()
                .find(|p| p.node == 5 && p.local_id == 0)
                .unwrap()
                .initial,
            4.
        );
    }

    #[test]
    fn assignment_moves_and_swaps_fixed_slots_with_current_control_values() {
        let source = NativeProject::parse(DEFAULT_PROJECT).unwrap();
        let descriptors = slot_descriptors(&source);
        let first = descriptors[&0].unwrap();
        let second = descriptors[&1].unwrap();
        let mut values = normalized_values(&descriptors);
        values.insert(0, 0.75);
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
    pub const CID: TUID = uid(crate::product::CONTROLLER[0], crate::product::CONTROLLER[1], crate::product::CONTROLLER[2], crate::product::CONTROLLER[3]);

    pub fn new() -> Self {
        let project = NativeProject::parse(DEFAULT_PROJECT).expect("authored default graph");
        let defaults = normalized_values(&slot_descriptors(&project));
        Self {
            shared: Arc::new(GraphShared {
                parameters: Mutex::new(ControllerParameters { displays: host_parameter_displays(&project, &slot_descriptors(&project)), normalized: defaults.clone(), defaults }),
                project: Mutex::new(DEFAULT_PROJECT.to_vec()),
                handler: Mutex::new(None),
                host: Mutex::new(None),
                peer: Mutex::new(None),
                presentation: Mutex::new(
                    presentation(DEFAULT_PROJECT, &project).expect("authored graph presentation"),
                ),
                version: AtomicU64::new(0),
            }),
        }
    }

    fn slot(id: u32) -> Option<usize> {
        id.checked_sub(HOST_SLOT_BASE)
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
        let Some(bytes) = (unsafe { read_project_stream(stream) }) else {
            return kResultFalse;
        };
        let bytes = if serde_json::from_slice::<serde_json::Value>(&bytes)
            .ok()
            .is_some_and(|document| document["format"] == "manifold.package")
        {
            let Ok(package) = ProjectPackage::parse(&bytes) else {
                return kResultFalse;
            };
            package.state().to_vec()
        } else {
            bytes
        };
        let Ok(project) = NativeProject::parse(&bytes) else {
            return kResultFalse;
        };
        let Some(presentation) = presentation(&bytes, &project) else {
            return kResultFalse;
        };
        let io_changed = self
            .shared
            .project
            .lock()
            .ok()
            .and_then(|bytes| NativeProject::parse(&bytes).ok())
            .is_some_and(
                |previous| match (previous.io_layout(), project.io_layout()) {
                    (None, None) => false,
                    (Some(a), Some(b)) => a.inputs != b.inputs || a.outputs != b.outputs,
                    _ => true,
                },
            );
        let values = normalized_values(&slot_descriptors(&project));
        let Ok(mut current) = self.shared.presentation.lock() else {
            return kResultFalse;
        };
        *current = presentation;
        let Ok(mut saved_project) = self.shared.project.lock() else {
            return kResultFalse;
        };
        *saved_project = bytes;
        let parameters_changed = self.shared.replace_parameters(values, &project);
        self.shared.version.fetch_add(1, Ordering::Release);
        drop(saved_project);
        drop(current);
        self.shared.notify_parameters(parameters_changed, io_changed);
        kResultOk
    }

    unsafe fn setState(&self, _stream: *mut IBStream) -> tresult {
        kResultOk
    }
    unsafe fn getState(&self, _stream: *mut IBStream) -> tresult {
        kResultOk
    }
    unsafe fn getParameterCount(&self) -> i32 {
        self.shared.parameters.lock().map(|p| p.normalized.len() as i32).unwrap_or(0)
    }

    unsafe fn getParameterInfo(&self, index: i32, info: *mut ParameterInfo) -> tresult {
        if index < 0 || info.is_null() {
            return kInvalidArgument;
        }
        let Ok(parameters) = self.shared.parameters.lock() else { return kResultFalse; };
        let Some((&slot, _)) = parameters.defaults.iter().nth(index as usize) else { return kInvalidArgument; };
        let info = unsafe { &mut *info };
        info.id = HOST_SLOT_BASE + slot as u32;
        let Some(display) = parameters.displays.get(&slot) else { return kInvalidArgument; };
        let title = if display.module.is_empty() { display.name.clone() }
            else { format!("{} / {}", display.module, display.name) };
        copy_wstring(&title, &mut info.title);
        copy_wstring(&display.name, &mut info.shortTitle);
        copy_wstring(&display.unit, &mut info.units);
        info.stepCount = if crate::product::EXPORTED {
            display.parameter.filter(|p| p.discrete).map(|p| (p.max - p.min) as i32).unwrap_or(0)
        } else { 0 };
        info.defaultNormalizedValue = if crate::product::EXPORTED {
            display.parameter.and_then(|p| p.to_normalized(display.default_value)).unwrap_or(0.) as f64
        } else { 0. };
        info.unitId = 0;
        info.flags = ParameterInfo_::ParameterFlags_::kCanAutomate as i32;
        kResultOk
    }

    unsafe fn getParamStringByValue(&self, id: u32, value: f64, result: *mut String128) -> tresult {
        if !self.shared.has_parameter(id)
            || result.is_null()
            || !value.is_finite()
            || !(0. ..=1.).contains(&value)
        {
            return kInvalidArgument;
        }
        let Ok(parameters) = self.shared.parameters.lock() else { return kResultFalse; };
        let Some(display) = Self::slot(id).and_then(|slot| parameters.displays.get(&slot)) else { return kInvalidArgument; };
        copy_wstring(&display.text(value), unsafe { &mut *result });
        kResultOk
    }

    unsafe fn getParamValueByString(
        &self,
        id: u32,
        string: *mut TChar,
        result: *mut f64,
    ) -> tresult {
        if !self.shared.has_parameter(id) || result.is_null() {
            return kInvalidArgument;
        }
        let Ok(parameters) = self.shared.parameters.lock() else { return kResultFalse; };
        let Some(display) = Self::slot(id).and_then(|slot| parameters.displays.get(&slot)) else { return kInvalidArgument; };
        let Some(value) = (unsafe { utf16_string(string, 128) })
            .and_then(|text| display.normalized(&text))
            .filter(|value| value.is_finite() && (0. ..=1.).contains(value))
        else {
            return kInvalidArgument;
        };
        unsafe { *result = value };
        kResultOk
    }

    unsafe fn normalizedParamToPlain(&self, id: u32, value: f64) -> f64 {
        if !crate::product::EXPORTED { return value; }
        self.shared.parameters.lock().ok().and_then(|parameters| {
            let p = parameters.displays.get(&Self::slot(id)?)?.parameter?;
            p.from_normalized(value as f32).map(f64::from)
        }).unwrap_or(value)
    }
    unsafe fn plainParamToNormalized(&self, id: u32, value: f64) -> f64 {
        if !crate::product::EXPORTED { return value; }
        self.shared.parameters.lock().ok().and_then(|parameters| {
            let p = parameters.displays.get(&Self::slot(id)?)?.parameter?;
            p.to_normalized(value as f32).map(f64::from)
        }).unwrap_or(value)
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
        #[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
        {
            crate::graph_editor::create_view(name, self.shared.clone())
        }
        #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
        {
            let _ = name;
            std::ptr::null_mut()
        }
    }
}
