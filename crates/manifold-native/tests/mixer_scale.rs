use manifold_core::parameter_catalog::mixer_input_parameter;
use manifold_native::parameters::{TimedAutomation, graph_parameter_id};
use manifold_native::{AudioBlock, author::GraphWorkspace, project::NativeProject};
mod callback_heap {
    include!("support/callback_heap.rs");
}

#[test]
fn wide_local_parameters_automate_independently_of_other_nodes() {
    let mut graph = GraphWorkspace::new();
    graph
        .add_with_config(4, "mixer", &[("inputs", 128.)])
        .unwrap();
    graph.add(5, "gain").unwrap();
    graph.set_parameter(5, 0, 1.).unwrap();
    let pan = mixer_input_parameter(126, true).unwrap();
    assert_eq!(pan, 256); // Previously collided with node 5, local parameter 0.
    graph
        .register_parameter("/mixer/input127/pan", 4, pan, -1., 1., 0.)
        .unwrap();
    graph
        .register_parameter("/output/level", 5, 0, 0., 8., 1.)
        .unwrap();
    graph.bind_host_slot(0, 4, pan).unwrap();
    graph.bind_host_slot(1, 5, 0).unwrap();
    graph.connect(1, "out", 4, "in-127").unwrap();
    graph.connect(4, "out", 5, "audio").unwrap();
    graph.connect(5, "out", 3, "in").unwrap();
    let mut runtime = NativeProject::parse(&graph.to_project_json().unwrap())
        .unwrap()
        .prepare_with_state(48_000., 128)
        .unwrap();
    let input = [0.25; 128];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    for (id, normalized, expected_left) in [
        (graph_parameter_id(4, pan), 0., 0.25),
        (graph_parameter_id(5, 0), 0.0625, 0.125),
    ] {
        let edit = [TimedAutomation {
            offset: 0,
            id,
            normalized,
        }];
        for block in 0..64 {
            callback_heap::measure(|| {
                runtime
                    .processor
                    .process_automated(
                        AudioBlock {
                            main: Some([&input, &input]),
                            sidechain: None,
                            output: [&mut left, &mut right],
                            events: &[],
                        },
                        if block == 0 { &edit } else { &[] },
                    )
                    .unwrap()
            });
        }
        assert!(
            left.iter()
                .all(|sample| (*sample - expected_left).abs() < 1e-5)
        );
        assert!(right.iter().all(|sample| sample.abs() < 1e-5));
        let saved = NativeProject::parse(&runtime.save_state().unwrap()).unwrap();
        let value = |id| {
            saved
                .host_parameters()
                .iter()
                .find(|p| p.id == id)
                .unwrap()
                .initial
        };
        assert_eq!(value(graph_parameter_id(4, pan)), -1.);
        assert_eq!(value(graph_parameter_id(5, 0)), expected_left * 4.);
    }
}

#[test]
fn configured_mixer_ports_and_controls_grow_without_identity_collisions() {
    for inputs in [33, 128, 257, 513] {
        let mut graph = GraphWorkspace::new();
        graph
            .add_with_config(4, "mixer", &[("inputs", inputs as f64)])
            .unwrap();
        let gain = mixer_input_parameter(inputs - 1, false).unwrap();
        let pan = mixer_input_parameter(inputs - 1, true).unwrap();
        graph.set_parameter(4, gain, 0.5).unwrap();
        graph.set_parameter(4, pan, -1.).unwrap();
        graph
            .register_parameter("/last-input/level", 4, gain, 0., 2., 0.5)
            .unwrap();
        graph.bind_host_slot(0, 4, gain).unwrap();
        graph.connect(1, "out", 4, &format!("in-{inputs}")).unwrap();
        graph.connect(4, "out", 3, "in").unwrap();
        let saved = graph.to_project_json().unwrap();
        let restored = GraphWorkspace::from_project_json(&saved).unwrap();
        assert_eq!(graph.to_project().unwrap(), restored.to_project().unwrap());
        let native = NativeProject::parse(&saved).unwrap();
        assert_eq!(native.host_parameters().len(), inputs * 2 + 1);
        let mut runtime = native.prepare_with_state(48_000., 128).unwrap();
        assert_eq!(
            runtime.processor.bound_graph_parameter(0),
            Some(graph_parameter_id(4, gain))
        );
        let input = [0.25; 128];
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        callback_heap::measure(|| {
            runtime
                .processor
                .process(AudioBlock {
                    main: Some([&input, &input]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap()
        });
        assert!(left.iter().all(|sample| (*sample - 0.125).abs() < 1e-6));
        assert!(right.iter().all(|sample| sample.abs() < 1e-6));
        let edit = [TimedAutomation {
            offset: 0,
            id: graph_parameter_id(4, gain),
            normalized: 0.,
        }];
        callback_heap::measure(|| {
            runtime
                .processor
                .process_automated(
                    AudioBlock {
                        main: Some([&input, &input]),
                        sidechain: None,
                        output: [&mut left, &mut right],
                        events: &[],
                    },
                    &edit,
                )
                .unwrap()
        });
        assert!(
            left.last().unwrap() < left.first().unwrap(),
            "last input responds to host automation"
        );
        let recalled = NativeProject::parse(&runtime.save_state().unwrap()).unwrap();
        assert_eq!(
            recalled
                .host_parameters()
                .iter()
                .find(|p| p.id == graph_parameter_id(4, gain))
                .unwrap()
                .initial,
            0.
        );
        assert_eq!(
            recalled
                .host_parameters()
                .iter()
                .find(|p| p.local_id == 1)
                .unwrap()
                .initial,
            1.
        );
        graph
            .configure(4, &[("inputs", (inputs + 1) as f64)])
            .unwrap();
        assert_eq!(graph.to_project().unwrap()["hostBindings"][0]["id"], gain);
        assert!(
            graph
                .configure(4, &[("inputs", (inputs - 1) as f64)])
                .is_err()
        );
    }
    // These two addresses collided under node<<8 | local. Full-width pairing
    // must also remain independent at the largest supported node identity.
    assert_ne!(graph_parameter_id(4, 257), graph_parameter_id(5, 1));
    assert_ne!(
        graph_parameter_id(u32::MAX, 257),
        graph_parameter_id(u32::MAX, 1)
    );
}
