pub fn project(stages: u32, last_slot: u32) -> Vec<u8> {
    let mut graph = manifold_native::author::GraphWorkspace::new();
    let mut previous = 1;
    for stage in 0..stages {
        let id = 4 + stage;
        graph.add(id, "gain").unwrap();
        graph.set_parameter(id, 0, 1.).unwrap();
        graph
            .bind_host_slot(
                if stage + 1 == stages {
                    last_slot
                } else {
                    stage
                },
                id,
                0,
            )
            .unwrap();
        graph.connect(previous, "out", id, "audio").unwrap();
        previous = id;
    }
    graph.connect(previous, "out", 3, "in").unwrap();
    serde_json::to_vec(&graph.to_project().unwrap()).unwrap()
}

pub fn last_gain(bytes: &[u8], stages: u32) -> f64 {
    let document: serde_json::Value = serde_json::from_slice(bytes).unwrap();
    document["signal"]["initialParameters"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["nodeId"] == stages + 3 && p["id"] == 0)
        .unwrap()["value"]
        .as_f64()
        .unwrap()
}

pub fn displayed_project(discrete: bool) -> Vec<u8> {
    let mut graph = manifold_native::author::GraphWorkspace::new();
    graph.add(4, if discrete { "svf" } else { "gain" }).unwrap();
    graph
        .register_parameter("/tone/shape", 4, 0, 0., 2., 1.)
        .unwrap();
    graph.bind_host_slot(0, 4, 0).unwrap();
    graph.connect(1, "out", 4, "audio").unwrap();
    graph.connect(4, "out", 3, "in").unwrap();
    let mut document = graph.to_project().unwrap();
    document["liveAuthoring"] = serde_json::json!({"format":"manifold.live-project", "version":1,
      "source":"// host metadata fixture", "view":[{"id":"shape","type":"parameter","path":"/tone/shape",
      "label":if discrete {"Filter shape"} else {"Output level"}, "unit":if discrete {""} else {"linear"}}]});
    serde_json::to_vec(&document).unwrap()
}
