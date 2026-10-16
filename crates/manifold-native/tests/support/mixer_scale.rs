pub fn wide_mixer() -> Vec<u8> {
    let mut graph = manifold_native::author::GraphWorkspace::new();
    graph
        .add_with_config(4, "mixer", &[("inputs", 128.)])
        .unwrap();
    graph.add(5, "gain").unwrap();
    // These two addresses collided under the former eight-bit local packing.
    graph
        .register_parameter("/mixer/pan", 4, 256, -1., 1., 0.)
        .unwrap();
    graph
        .register_parameter("/output/level", 5, 0, 0., 8., 1.)
        .unwrap();
    graph.bind_host_slot(0, 4, 256).unwrap();
    graph.bind_host_slot(1, 5, 0).unwrap();
    graph.connect(1, "out", 4, "in-127").unwrap();
    graph.connect(4, "out", 5, "audio").unwrap();
    graph.connect(5, "out", 3, "in").unwrap();
    graph.to_project_json().unwrap()
}

pub fn assert_mixer_assignments(bytes: &[u8], pan_slot: u32, gain_slot: u32) {
    use manifold_native::parameters::graph_parameter_id;
    let project = manifold_native::project::NativeProject::parse(bytes).unwrap();
    for (slot, id) in [
        (pan_slot, graph_parameter_id(4, 256)),
        (gain_slot, graph_parameter_id(5, 0)),
    ] {
        assert!(
            project
                .host_bindings()
                .iter()
                .any(|b| b.slot == slot && b.graph_parameter == id)
        );
    }
}
