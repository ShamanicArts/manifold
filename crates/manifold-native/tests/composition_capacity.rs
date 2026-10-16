use manifold_native::{AudioBlock, author::GraphWorkspace, project::NativeProject};
use serde_json::json;
mod callback_heap { include!("support/callback_heap.rs"); }

#[test]
fn large_project_roundtrips_and_processes_without_callback_allocation() {
    let mut graph = GraphWorkspace::new();
    let mut previous = 1;
    for id in 4..604 {
        graph.add(id, "gain").unwrap();
        graph.set_parameter(id, 0, 1.).unwrap();
        graph.register_instance(&format!("/stage-{id}"), id).unwrap();
        graph.register_parameter(&format!("/level-{id}"), id, 0, 0., 2., 1.).unwrap();
        graph.bind_host_slot(id - 4, id, 0).unwrap();
        graph.connect(previous, "out", id, "audio").unwrap();
        previous = id;
    }
    graph.connect(previous, "out", 3, "in").unwrap();
    let mut document = graph.to_project().unwrap();
    document["liveAuthoring"] = json!({
        "format": "manifold.live-project", "version": 1,
        "source": format!("// {}", "context ".repeat(40000)),
        "view": (0..600).map(|id| json!({"type":"parameter", "path":format!("/level-{}", id+4)})).collect::<Vec<_>>(),
        "files": (0..80).map(|id| json!({"path":format!("/notes/topic-{id}.txt"),
            "mediaType":"text/plain","encoding":"utf8","content":"notes ".repeat(9000)})).collect::<Vec<_>>(),
        "composition": {"version":4,
            "definitions": (0..600).map(|id| json!({"id":format!("level-{id}"),"version":1,"label":"Read level",
                "inputs":[],"outputs":[{"name":"value","type":"scalar"}],"parameters":[],
                "implementation":{"kind":"parameter","path":"/level-4"}})).collect::<Vec<_>>(),
            "nodes": (0..600).map(|id| json!({"id":10000+id,"definition":format!("level-{id}"),
                "label":"Read level","parameters":{},"position":[0,0]})).collect::<Vec<_>>(),
            "connections":[]}
    });
    let native = NativeProject::parse(&serde_json::to_vec(&document).unwrap()).unwrap();
    let mut prepared = native.prepare_with_state(48000., 128).unwrap();
    assert!(prepared.processor.bound_graph_parameter(599).is_some());
    let input = [0.25; 128];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    callback_heap::measure(|| prepared.processor.process(AudioBlock {
        main: Some([&input, &input]), sidechain: None, output: [&mut left, &mut right], events: &[],
    }).unwrap());
    assert_eq!(left, input);
    assert_eq!(right, input);
    let saved: serde_json::Value = serde_json::from_slice(&prepared.save_state().unwrap()).unwrap();
    assert_eq!(saved["liveAuthoring"], document["liveAuthoring"]);
    assert_eq!(saved["instances"].as_array().unwrap().len(), 600);
    assert_eq!(saved["endpoints"].as_array().unwrap().len(), 600);
    NativeProject::parse(&serde_json::to_vec(&saved).unwrap()).unwrap();
}

#[test]
fn full_width_node_ids_have_distinct_parameter_addresses_and_process() {
    use manifold_native::parameters::TimedAutomation;
    let mut graph = GraphWorkspace::new();
    let mut previous = 1;
    let ids = [65_536, 0x0100_0000, u32::MAX - 1];
    for (slot, id) in ids.into_iter().enumerate() {
        graph.add(id, "gain").unwrap();
        graph.set_parameter(id, 0, 1.).unwrap();
        graph.bind_host_slot(slot as u32, id, 0).unwrap();
        graph.connect(previous, "out", id, "audio").unwrap();
        previous = id;
    }
    graph.connect(previous, "out", 3, "in").unwrap();
    let project = NativeProject::parse(&serde_json::to_vec(&graph.to_project().unwrap()).unwrap()).unwrap();
    let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
    for (slot, id) in ids.into_iter().enumerate() {
        assert_eq!(prepared.processor.bound_graph_parameter(slot as u32), Some(manifold_native::parameters::graph_parameter_id(id, 0)));
    }
    let input = [0.25; 128];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    callback_heap::measure(|| prepared.processor.process(AudioBlock { main: Some([&input, &input]), sidechain: None, output: [&mut left, &mut right], events: &[] }).unwrap());
    assert_eq!(left, input);
    assert_eq!(right, input);
    // Graph-scoped automation also retains all node bits; it cannot alias node 0.
    let automation = [TimedAutomation { offset: 0, id: manifold_native::parameters::graph_parameter_id(ids[2], 0), normalized: 0. }];
    callback_heap::measure(|| prepared.processor.process_automated(AudioBlock { main: Some([&input, &input]), sidechain: None, output: [&mut left, &mut right], events: &[] }, &automation).unwrap());
    let saved = prepared.save_state().unwrap();
    let reopened = NativeProject::parse(&saved).unwrap();
    assert_eq!(reopened.host_bindings().len(), 3);
    let parameters = reopened.host_parameters();
    assert_eq!(parameters.iter().find(|p| p.node == u64::from(ids[2])).unwrap().initial, 0.);
    assert_eq!(parameters.iter().filter(|p| p.initial == 1.).count(), 2);
}

#[test]
fn large_parameter_transactions_are_atomic_and_retired_off_audio() {
    use manifold_native::live_parameters::ParameterMailbox;
    let mut graph = GraphWorkspace::new();
    let mut previous = 1;
    for id in 4..604 {
        graph.add(id, "gain").unwrap(); graph.set_parameter(id, 0, 1.).unwrap();
        graph.connect(previous, "out", id, "audio").unwrap(); previous = id;
    }
    graph.connect(previous, "out", 3, "in").unwrap();
    let project = NativeProject::parse(&serde_json::to_vec(&graph.to_project().unwrap()).unwrap()).unwrap();
    let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
    let mailbox = ParameterMailbox::new();
    let mut edits: Vec<_> = (4..604).map(|id| (id, 0, 0.5)).collect();
    assert!(mailbox.submit_batch(1, &edits));
    assert_eq!(callback_heap::measure(|| mailbox.apply(&mut prepared.processor)), Some((1, true)));
    assert_eq!(mailbox.accepted(), 1); // Control-side reclamation.
    assert!(prepared.processor.current_parameter_values().iter().all(|&v| v == 0.5));
    edits.iter_mut().for_each(|edit| edit.2 = 0.25);
    edits.last_mut().unwrap().0 = 999_999;
    assert!(mailbox.submit_batch(2, &edits));
    assert_eq!(callback_heap::measure(|| mailbox.apply(&mut prepared.processor)), Some((2, false)));
    assert_eq!(mailbox.rejected(), 2);
    assert!(prepared.processor.current_parameter_values().iter().all(|&v| v == 0.5));
    edits.last_mut().unwrap().0 = 603;
    assert!(mailbox.submit_batch(3, &edits));
    assert_eq!(callback_heap::measure(|| mailbox.apply(&mut prepared.processor)), Some((3, true)));
    assert!(prepared.processor.current_parameter_values().iter().all(|&v| v == 0.25));
}
