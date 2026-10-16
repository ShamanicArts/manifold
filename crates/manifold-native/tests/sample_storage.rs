use manifold_core::sample_analysis::analyze_stereo;
use manifold_core::sample_region::StereoSampleUpload;
use manifold_native::AudioBlock;
use manifold_native::author::GraphWorkspace;
use manifold_native::project::NativeProject;

mod callback_heap {
    include!("support/callback_heap.rs");
}

#[test]
fn long_sample_round_trip_plays_its_tail_and_failed_replacement_preserves_it() {
    let frames = 1_500_128;
    let mut pcm = vec![0.; frames * 2];
    for frame in pcm[(frames - 256) * 2..].chunks_exact_mut(2) {
        frame.copy_from_slice(&[0.75, -0.5]);
    }
    let label = "Long take · 🎛 ".repeat(80);
    let mut graph = GraphWorkspace::new();
    graph.add(4, "sample-region").unwrap();
    graph.connect(4, "out", 3, "in").unwrap();
    graph.set_sample_asset(4, &pcm, 48_000, &label).unwrap();
    graph.set_parameter(4, 3, 0.99999).unwrap();
    graph.set_parameter(4, 2, 1.).unwrap();
    let saved = graph.to_project_json().unwrap();
    let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
    assert_eq!(document["assets"][0]["frames"], frames);
    assert_eq!(document["assets"][0]["label"], label);
    let project = NativeProject::parse(&saved).unwrap();
    let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
    let mut left = [0.; 8];
    let mut right = [0.; 8];
    assert!(prepared.processor.set_parameter(4, 7, 1.));
    callback_heap::measure(|| {
        prepared.processor.process(AudioBlock {
            main: None,
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
    })
    .unwrap();
    for sample in left {
        assert!((sample - 0.75 * std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-6);
    }
    for sample in right {
        assert!((sample + 0.5 * std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-6);
    }
    let summary = analyze_stereo(&pcm, 48_000.).unwrap();
    assert_eq!(summary.peak, 0.75);
    assert_eq!(summary.peaks[summary.peaks.len() - 2], 0.75);
    let recalled: serde_json::Value =
        serde_json::from_slice(&prepared.save_state().unwrap()).unwrap();
    assert_eq!(recalled["assets"][0], document["assets"][0]);
    pcm[frames * 2 - 1] = f32::NAN;
    assert!(
        prepared
            .prepare_sample_replacement(4, &pcm, 48_000, "invalid", 48_000., 128)
            .is_err()
    );
    assert!(prepared.processor.set_parameter(4, 7, 1.));
    callback_heap::measure(|| {
        prepared.processor.process(AudioBlock {
            main: None,
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
    })
    .unwrap();
    assert!(
        left.iter()
            .all(|sample| (*sample - 0.75 * std::f32::consts::FRAC_1_SQRT_2).abs() < 1e-6)
    );
    let mut invalid = document;
    invalid["assets"][0]["frames"] = serde_json::json!(u64::MAX);
    assert!(NativeProject::parse(&serde_json::to_vec(&invalid).unwrap()).is_err());
    assert!(StereoSampleUpload::new(usize::MAX, 48_000.).is_none());
}

#[test]
fn authored_capture_and_loop_transfers_use_actual_capacity_without_callback_heap_work() {
    use manifold_native::capture_mailbox::{AudioCaptureWorker, CaptureMailbox};
    use manifold_native::loop_state_mailbox::LoopStateMailbox;
    use std::sync::Arc;
    let mut graph = GraphWorkspace::new();
    graph.add(14, "mixer9").unwrap();
    graph.connect(14, "out", 3, "in").unwrap();
    // Nine loops cross the old slot quota; the first also crosses the former
    // 80 MiB aggregate transfer limit. This is prepared storage, not a budget.
    for id in 4..13 {
        graph
            .add_with_config(
                id,
                "loop-capture",
                &[("capacitySeconds", if id == 4 { 240. } else { 0.01 })],
            )
            .unwrap();
        graph.connect(1, "out", id, "audio").unwrap();
        graph
            .connect(id, "out", 14, &format!("in-{}", id - 3))
            .unwrap();
    }
    graph
        .add_with_config(13, "retrospective-capture", &[("capacitySeconds", 160.)])
        .unwrap();
    graph.connect(1, "out", 13, "audio").unwrap();
    let mut prepared = NativeProject::parse(&graph.to_project_json().unwrap())
        .unwrap()
        .prepare_patchable_with_state(48_000., 128)
        .unwrap();
    assert_eq!(prepared.prepared_capture_capacity(), 240 * 48_000);
    assert_eq!(prepared.processor.capture_capacity(13), Some(160 * 48_000));
    let specs = prepared.prepared_loop_specs();
    assert_eq!(specs.len(), 9);
    assert!(specs.iter().map(|(_, frames)| frames * 8).sum::<usize>() > 80 * 1024 * 1024);
    let (loops, mut loop_worker) =
        LoopStateMailbox::prepare(&prepared.processor, specs, 48_000).unwrap();
    let mailbox = CaptureMailbox::new(prepared.prepared_capture_capacity()).unwrap();
    let mut worker = AudioCaptureWorker::new(Arc::clone(&mailbox));
    for id in 4..13 {
        assert!(prepared.processor.set_parameter(id, 0, 1.));
    }
    let input = [0.25; 128];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    callback_heap::measure(|| {
        prepared.processor.process(AudioBlock {
            main: Some([&input, &input]),
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
    })
    .unwrap();
    for id in 4..13 {
        assert!(prepared.processor.set_parameter(id, 0, 0.));
    }
    callback_heap::measure(|| loop_worker.service(&prepared.processor));
    assert_eq!(loops.nodes().count(), 9);
    for id in 4..13 {
        let take = loops.take(id).unwrap();
        assert!(take.stereo().iter().all(|v| *v == 0.25));
        assert_eq!(take.stereo().len(), 256);
    }
    let frames = 1_500_128;
    assert!(mailbox.request(13, frames));
    let mut captured = None;
    for _ in 0..2000 {
        callback_heap::measure(|| {
            worker.service(&mut prepared.processor);
            prepared
                .processor
                .process(AudioBlock {
                    main: Some([&input, &input]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            worker.service(&mut prepared.processor);
        });
        if let Some(result) = mailbox.take() {
            captured = Some(result.unwrap());
            break;
        }
    }
    let captured = captured.expect("long capture completes incrementally");
    assert_eq!(captured.frames, frames);
    assert_eq!(captured.stereo()[0], 0.);
    assert!(
        captured.stereo()[(frames - 128) * 2..]
            .iter()
            .all(|v| *v == 0.25)
    );
    assert!(CaptureMailbox::new(usize::MAX).is_none());
}
