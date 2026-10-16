use manifold_native::{
    author::GraphWorkspace,
    parameters::{HostSurface, STUDIO_HOST_SLOT_COUNT, host_parameter_displays, host_slots},
    project::NativeProject,
};
use serde_json::{Value, json};

fn document(count: u32) -> Value {
    let mut graph = GraphWorkspace::new();
    let mut previous = 1;
    for slot in 0..count {
        let node = slot + 4;
        graph.add(node, "gain").unwrap();
        graph
            .register_parameter(&format!("/stage-{slot}/level"), node, 0, 0., 2., 1.)
            .unwrap();
        graph.bind_host_slot(slot, node, 0).unwrap();
        graph.connect(previous, "out", node, "audio").unwrap();
        previous = node;
    }
    graph.connect(previous, "out", 3, "in").unwrap();
    graph.to_project().unwrap()
}
fn parse(document: &Value) -> NativeProject {
    NativeProject::parse(&serde_json::to_vec(document).unwrap()).unwrap()
}

#[test]
fn studio_bank_is_fixed_while_internal_controls_and_exports_can_grow() {
    let doc = document(2050);
    let project = parse(&doc);
    assert_eq!(project.host_parameters().len(), 2050);
    let studio = host_slots(&project, HostSurface::Studio);
    assert_eq!(studio.len(), STUDIO_HOST_SLOT_COUNT);
    assert!(studio[&2047].is_some());
    assert!(!studio.contains_key(&2048));
    let exported = host_slots(&project, HostSurface::Exported);
    assert_eq!(exported.len(), 2050);
    assert!(exported[&2049].is_some());
    let prepared = project.prepare_with_state(48_000., 128).unwrap();
    assert!(prepared.processor.bound_graph_parameter(2049).is_some());
}

#[test]
fn exact_and_empty_contracts_roundtrip_with_reserved_names() {
    let mut doc = document(2);
    doc["hostBindings"].as_array_mut().unwrap().remove(0);
    let project = parse(&doc);
    assert_eq!(project.host_bindings().len(), 1);
    assert_eq!(host_slots(&project, HostSurface::Exported).len(), 1);
    doc["hostBindings"] = json!([]);
    let graph = GraphWorkspace::from_project(&doc).unwrap();
    assert_eq!(graph.to_project().unwrap(), doc);
    let project = parse(&doc);
    assert!(project.host_bindings().is_empty());
    assert!(host_slots(&project, HostSurface::Exported).is_empty());
    assert_eq!(host_slots(&project, HostSurface::Studio).len(), 2048);
    let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
    let saved: Value = serde_json::from_slice(&prepared.save_state().unwrap()).unwrap();
    assert_eq!(saved["hostAssignments"], doc["hostAssignments"]);
    assert_eq!(saved["hostBindings"], json!([]));
}

#[test]
fn declared_name_and_units_drive_host_text_without_changing_normalized_storage() {
    let mut doc = document(1);
    doc["liveAuthoring"] = json!({"format":"manifold.live-project","version":1,
      "source":"// display contract", "view":[{"id":"level","type":"parameter","path":"/stage-0/level","label":"Output level","unit":"linear"}]});
    let project = parse(&doc);
    let displays = host_parameter_displays(&project, &host_slots(&project, HostSurface::Studio));
    assert_eq!(displays[&0].name, "Output level");
    assert_eq!(displays[&0].text(0.25), "0.500 linear");
    assert_eq!(displays[&0].normalized("0.5 linear"), Some(0.25));
    assert_eq!(displays[&2047].name, "Automation 2048");
}

#[test]
fn anonymous_bindings_reserve_deleted_and_unbound_slots() {
    let mut graph = GraphWorkspace::new();
    graph.connect(1, "out", 3, "in").unwrap();
    graph.add(400, "gain").unwrap();
    graph.bind_host_slot(0, 400, 0).unwrap();
    graph.remove(400).unwrap();
    let doc = graph.to_project().unwrap();
    assert_eq!(doc["hostAssignments"], json!([{"slot":0}]));
    let mut recalled = GraphWorkspace::from_project(&doc).unwrap();
    recalled.add(400, "gain").unwrap();
    assert!(recalled.bind_host_slot(0, 400, 0).is_err());
    recalled.bind_host_slot(2, 400, 0).unwrap();
    assert!(recalled.unbind_host_slot(2));
    assert_eq!(
        recalled.to_project().unwrap()["hostAssignments"],
        json!([{"slot":0},{"slot":2}])
    );
}
