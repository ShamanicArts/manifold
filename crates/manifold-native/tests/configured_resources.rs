use manifold_native::AudioBlock;
use manifold_native::author::{AuthorError, GraphWorkspace};
use manifold_native::project::NativeProject;
use serde_json::Value;
mod callback_heap {
    include!("support/callback_heap.rs");
}

#[test]
fn rust_imports_the_actual_eight_voice_rack_sample_graph_and_shared_pcm() {
    let doc: Value = serde_json::from_slice(include_bytes!(
        "../../../projects/graph-workspace/authored-rack-sample-eight-voice.json"
    ))
    .unwrap();
    let mut graph = GraphWorkspace::from_project(&doc).unwrap();
    let exported = graph.to_project().unwrap();
    assert_eq!(exported, doc);
    assert_eq!(graph.clone().to_project().unwrap(), doc);
    let source = doc["assets"][0]["nodeId"].as_u64().unwrap() as u32;
    let target = doc["sampleBindings"][0]["nodeId"].as_u64().unwrap() as u32;
    assert_eq!(
        graph.set_sample_asset(target, &[0.; 64], 48000, "cannot own and share"),
        Err(AuthorError::InvalidAsset)
    );
    assert_eq!(graph.to_project().unwrap(), doc);
    graph.unbind_sample_asset(target);
    let mut pcm = vec![0.2; 64];
    graph
        .set_sample_asset(target, &pcm, 48000, "independent")
        .unwrap();
    pcm.fill(f32::NAN);
    let own = graph.to_project().unwrap();
    assert_eq!(own["assets"].as_array().unwrap().len(), 2);
    assert!(NativeProject::parse(&graph.to_project_json().unwrap()).is_ok());
    graph.remove_sample_asset(target);
    graph.bind_sample_asset(source, target).unwrap();
    assert_eq!(graph.to_project().unwrap(), doc);
    graph.remove(source).unwrap();
    let removed = graph.to_project().unwrap();
    assert!(removed.get("assets").is_none());
    assert!(removed.get("sampleBindings").is_none());
}

#[test]
fn configured_capture_wraps_at_its_authored_capacity_and_reopens_pcm() {
    let mut graph = GraphWorkspace::new();
    graph
        .add_with_config(2, "loop-capture", &[("capacitySeconds", 0.05)])
        .unwrap();
    graph
        .add_with_config(4, "fixed-gain", &[("gain", 0.25)])
        .unwrap();
    graph.register_instance("/resource/loop", 2).unwrap();
    graph.connect(1, "out", 2, "audio").unwrap();
    graph.connect(2, "out", 4, "audio").unwrap();
    graph.connect(4, "out", 3, "in").unwrap();
    assert_eq!(graph.capture_ring_bytes(48000.).unwrap(), 2400 * 8);
    let before = graph.to_project().unwrap();
    assert_eq!(
        graph.configure(2, &[("capacitySeconds", 0.)]),
        Err(AuthorError::InvalidConfiguration)
    );
    assert_eq!(
        graph.configure(2, &[("capacitySeconds", 1.), ("capacitySeconds", 2.)]),
        Err(AuthorError::InvalidConfiguration)
    );
    assert_eq!(graph.to_project().unwrap(), before);
    let mut runtime = NativeProject::parse(&graph.to_project_json().unwrap())
        .unwrap()
        .prepare_patchable_with_state(48000., 128)
        .unwrap();
    assert!(runtime.processor.set_parameter(2, 0, 1.));
    for index in 0..24 {
        let input: [f32; 128] = std::array::from_fn(|frame| (index * 128 + frame) as f32 / 4096.);
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
        assert_eq!(left, input.map(|sample| sample * 0.25));
    }
    assert!(runtime.processor.set_parameter(2, 0, 0.));
    assert!(runtime.processor.set_parameter(2, 1, 1.));
    let saved = runtime.save_state().unwrap();
    let saved_doc: Value = serde_json::from_slice(&saved).unwrap();
    assert_eq!(saved_doc["assets"][0]["frames"], 2400);
    let reauthored = GraphWorkspace::from_project_json(&saved).unwrap();
    let reauthored_doc = reauthored.to_project().unwrap();
    assert_eq!(reauthored_doc["assets"], saved_doc["assets"]);
    assert_eq!(
        reauthored_doc["signal"]["nodes"],
        saved_doc["signal"]["nodes"]
    );
    assert_eq!(
        reauthored_doc["signal"]["connections"],
        saved_doc["signal"]["connections"]
    );
    for (actual, expected) in reauthored_doc["signal"]["initialParameters"]
        .as_array()
        .unwrap()
        .iter()
        .zip(saved_doc["signal"]["initialParameters"].as_array().unwrap())
    {
        assert_eq!(actual["nodeId"], expected["nodeId"]);
        assert_eq!(actual["id"], expected["id"]);
        assert_eq!(actual["value"].as_f64(), expected["value"].as_f64());
    }
    let mut reopened = NativeProject::parse(&reauthored.to_project_json().unwrap())
        .unwrap()
        .prepare_patchable_with_state(48000., 128)
        .unwrap();
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    callback_heap::measure(|| {
        reopened
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap()
    });
    assert_eq!(
        left,
        std::array::from_fn(|frame| ((672 + frame) as f32 / 4096.) * 0.25)
    );
}

#[test]
fn capture_storage_follows_the_project_without_a_combined_quota() {
    let mut graph = GraphWorkspace::new();
    graph.connect(1, "out", 3, "in").unwrap();
    for id in 4..8 {
        graph.add_with_config(id, "retrospective-capture", &[("capacitySeconds", 120.)]).unwrap();
    }
    assert_eq!(graph.capture_ring_bytes(48000.).unwrap(), 4 * 120 * 48000 * 8);
    let restored = GraphWorkspace::from_project(&graph.to_project().unwrap()).unwrap();
    assert_eq!(restored.capture_ring_bytes(48000.).unwrap(), 4 * 120 * 48000 * 8);
}
