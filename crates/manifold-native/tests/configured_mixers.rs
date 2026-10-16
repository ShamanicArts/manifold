use manifold_native::{AudioBlock, author::GraphWorkspace, project::NativeProject};

#[test]
fn configured_ports_and_targets_round_trip_and_render_in_rust() {
    for inputs in [1, 2, 3, 4, 7, 8, 9, 13, 32] {
        let mut graph = GraphWorkspace::new();
        graph.add_with_config(4, "mixer", &[("inputs", inputs as f64)]).unwrap();
        graph.connect(1, "out", 4, &format!("in-{inputs}")).unwrap();
        graph.connect(4, "out", 3, "in").unwrap();
        graph.set_parameter(4, inputs, 0.5).unwrap();
        graph.set_parameter(4, inputs + 32, -1.).unwrap();
        if inputs < 32 { assert!(graph.set_parameter(4, inputs + 1, 0.5).is_err()); }
        let saved = graph.to_project().unwrap();
        let project = NativeProject::parse(&serde_json::to_vec(&saved).unwrap()).unwrap();
        let mut processor = project.prepare(48000., 128).unwrap();
        let input = [0.25; 128];
        let mut left = [0.; 128]; let mut right = [0.; 128];
        processor.process(AudioBlock { main: Some([&input, &input]), sidechain: None,
            output: [&mut left, &mut right], events: &[] }).unwrap();
        assert!(left.iter().all(|v| (*v - 0.125).abs() < 1e-6));
        assert!(right.iter().all(|v| v.abs() < 1e-6));
        let before = graph.to_project().unwrap();
        if inputs > 1 {
            assert!(graph.configure(4, &[("inputs", inputs as f64 - 1.)]).is_err());
            assert_eq!(graph.to_project().unwrap(), before);
            graph.disconnect(4, &format!("in-{inputs}")).unwrap();
            graph.configure(4, &[("inputs", inputs as f64 - 1.)]).unwrap();
            graph.configure(4, &[("inputs", inputs as f64)]).unwrap();
        }
    }
    assert!(GraphWorkspace::new().add_with_config(4, "mixer", &[("inputs", 3.5)]).is_err());
}
