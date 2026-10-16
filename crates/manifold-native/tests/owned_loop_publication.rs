use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use manifold_native::AudioBlock;
use manifold_native::author::{AuthorError, GraphWorkspace, LiveGraphSession};
use manifold_native::project::{NativeProject, PreparedNativeProject};
use serde_json::{Value, json};

thread_local! { static COUNTS: Cell<Option<(usize, usize)>> = const { Cell::new(None) }; }
struct Allocator;
#[global_allocator]
static ALLOCATOR: Allocator = Allocator;
fn count(alloc: bool) {
    let _ = COUNTS.try_with(|counts| {
        if let Some((a, d)) = counts.get() {
            counts.set(Some((a + usize::from(alloc), d + usize::from(!alloc))));
        }
    });
}
unsafe impl GlobalAlloc for Allocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        count(true);
        unsafe { System.alloc(layout) }
    }
    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        count(true);
        unsafe { System.alloc_zeroed(layout) }
    }
    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        count(true);
        unsafe { System.realloc(ptr, layout, size) }
    }
    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        count(false);
        unsafe { System.dealloc(ptr, layout) }
    }
}

fn fixture(id: u32) -> Value {
    let mut doc: Value = serde_json::from_slice(include_bytes!(
        "../../../projects/graph-workspace/authored-live-loop-route.json"
    ))
    .unwrap();
    for node in doc["signal"]["nodes"].as_array_mut().unwrap() {
        if node["id"] == 2 {
            node["id"] = id.into();
        }
    }
    for edge in doc["signal"]["connections"].as_array_mut().unwrap() {
        for key in ["from", "to"] {
            if edge[key] == 2 {
                edge[key] = id.into();
            }
        }
    }
    for parameter in doc["signal"]["initialParameters"].as_array_mut().unwrap() {
        if parameter["nodeId"] == 2 {
            parameter["nodeId"] = id.into();
        }
    }
    doc["signal"]["nodes"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":80,"type":"retrospective-capture","a":30,"b":0}));
    doc["signal"]["connections"]
        .as_array_mut()
        .unwrap()
        .push(json!({"from":1,"to":80,"inputPort":0}));
    doc["instances"] =
        json!([{"path":"/loop/main","nodeId":id},{"path":"/capture/history","nodeId":80}]);
    doc
}
fn bytes(doc: &Value) -> Vec<u8> {
    serde_json::to_vec(doc).unwrap()
}
fn prepare(doc: &Value) -> PreparedNativeProject {
    NativeProject::parse(&bytes(doc))
        .unwrap()
        .prepare_patchable_with_state(48_000., 128)
        .unwrap()
}
fn render(runtime: &mut PreparedNativeProject, phase: usize) -> [[f32; 128]; 2] {
    let left = std::array::from_fn::<_, 128, _>(|i| (((phase + i) % 139) as f32 - 69.) / 99.);
    let right = left.map(|v| -v / 2.);
    let mut out = [[0.; 128]; 2];
    let [out_left, out_right] = &mut out;
    runtime
        .processor
        .process(AudioBlock {
            main: Some([&left, &right]),
            sidechain: None,
            output: [out_left, out_right],
            events: &[],
        })
        .unwrap();
    out
}
fn parameter(doc: &mut Value, node: u32, id: u32, value: f32) {
    doc["signal"]["initialParameters"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|p| p["nodeId"] == node && p["id"] == id)
        .unwrap()["value"] = json!(value);
}

#[test]
fn native_owned_record_play_overdub_renumber_and_racing_targets_are_exact_without_heap_work() {
    let source = fixture(2);
    let mut active = prepare(&source);
    let mut reference = prepare(&source);
    for runtime in [&mut active, &mut reference] {
        assert!(runtime.processor.set_parameter(2, 0, 1.));
    }
    for block in 0..9 {
        assert_eq!(
            render(&mut active, block * 128),
            render(&mut reference, block * 128)
        );
    }
    let mut next = prepare(&fixture(12));
    next.plan_parameter_inheritance(&bytes(&source)).unwrap();
    // Changes arrive after preparation and must inherit actual old targets.
    for runtime in [&mut active, &mut reference] {
        assert!(runtime.processor.set_parameter(2, 3, 1.33));
        assert!(runtime.processor.set_parameter(2, 4, 1.));
    }
    assert!(next.live_history_ready_from(&active));
    COUNTS.with(|c| c.set(Some((0, 0))));
    assert_eq!(next.adopt_live_replacement_from(&mut active, false), 2);
    for block in 9..13 {
        assert_eq!(
            render(&mut next, block * 128),
            render(&mut reference, block * 128)
        );
    }
    assert_eq!(COUNTS.with(|c| c.replace(None)), Some((0, 0)));
    for (runtime, id) in [(&mut next, 12), (&mut reference, 2)] {
        assert!(runtime.processor.set_parameter(id, 0, 0.));
        assert!(runtime.processor.set_parameter(id, 1, 1.));
        assert!(runtime.processor.set_parameter(id, 2, 1.));
    }
    for block in 13..17 {
        assert_eq!(
            render(&mut next, block * 128),
            render(&mut reference, block * 128)
        );
    }
    let mut candidate = fixture(12);
    parameter(&mut candidate, 12, 5, 0.7);
    let mut final_runtime = prepare(&candidate);
    final_runtime
        .plan_parameter_inheritance(&bytes(&fixture(12)))
        .unwrap();
    assert!(reference.processor.set_parameter(2, 5, 0.7));
    COUNTS.with(|c| c.set(Some((0, 0))));
    final_runtime.adopt_live_replacement_from(&mut next, false);
    for block in 17..25 {
        assert_eq!(
            render(&mut final_runtime, block * 128),
            render(&mut reference, block * 128)
        );
    }
    assert_eq!(COUNTS.with(|c| c.replace(None)), Some((0, 0)));
    for runtime in [&mut final_runtime, &mut reference] {
        assert!(runtime.finish_recording_loops_for_host_stop());
    }
    let saved: Value = serde_json::from_slice(&final_runtime.save_state().unwrap()).unwrap();
    let expected: Value = serde_json::from_slice(&reference.save_state().unwrap()).unwrap();
    assert_eq!(
        saved["assets"][0]["pcmF32Base64"],
        expected["assets"][0]["pcmF32Base64"]
    );
    let mut reopened = prepare(&saved);
    let mut reopened_reference = prepare(&expected);
    for block in 25..33 {
        assert_eq!(
            render(&mut reopened, block * 128),
            render(&mut reopened_reference, block * 128)
        );
    }
}

#[test]
fn explicit_clip_replacement_keeps_its_pcm_and_transport_while_old_recording_changes() {
    let source = fixture(2);
    let mut active = prepare(&source);
    assert!(active.processor.set_parameter(2, 0, 1.));
    render(&mut active, 0);
    let mut doc = source.clone();
    let pcm: Vec<u8> = (0..32)
        .flat_map(|_| [0.23_f32, -0.17].into_iter().flat_map(f32::to_le_bytes))
        .collect();
    doc["assets"] = json!([{"nodeId":2,"sourceRate":48000,"frames":32,"label":"new clip","pcmF32Base64":STANDARD.encode(pcm)}]);
    parameter(&mut doc, 2, 1, 1.);
    parameter(&mut doc, 2, 2, 1.);
    let mut candidate = prepare(&doc);
    candidate
        .plan_parameter_inheritance(&bytes(&source))
        .unwrap();
    candidate.adopt_live_replacement_from(&mut active, false);
    assert_eq!(
        candidate.processor.stable_capture_length(2),
        None,
        "authored overdub is restored after asset load"
    );
    assert!(candidate.processor.set_parameter(2, 2, 0.));
    let saved: Value = serde_json::from_slice(&candidate.save_state().unwrap()).unwrap();
    assert_eq!(
        saved["assets"][0]["pcmF32Base64"],
        doc["assets"][0]["pcmF32Base64"]
    );
    assert_eq!(
        candidate.processor.current_parameter_values()[0],
        0.,
        "old recording target cannot clear a replacement clip"
    );
    assert_eq!(candidate.processor.current_parameter_values()[1], 1.);
}

#[test]
fn staging_defers_compatible_publication_and_empty_play_readback_reports_dsp_state() {
    let source = fixture(2);
    let mut active = prepare(&source);
    assert!(active.processor.set_parameter(2, 1, 1.));
    assert_eq!(active.processor.current_parameter_values()[1], 0.);
    render(&mut active, 0);
    assert!(active.processor.begin_prepared_capture_staging(80, 128));
    let mut candidate = prepare(&fixture(12));
    candidate
        .plan_parameter_inheritance(&bytes(&source))
        .unwrap();
    assert!(!candidate.live_history_ready_from(&active));
    render(&mut active, 128);
    assert!(
        !candidate.live_history_ready_from(&active),
        "ready staging still owns its runtime"
    );
    assert!(active.processor.cancel_capture_staging(80));
    assert!(candidate.live_history_ready_from(&active));
    COUNTS.with(|c| c.set(Some((0, 0))));
    candidate.adopt_live_replacement_from(&mut active, false);
    assert_eq!(COUNTS.with(|c| c.replace(None)), Some((0, 0)));
}

#[test]
fn rust_authoring_returns_busy_candidate_for_retry_without_losing_the_recording() {
    let mut source = fixture(2);
    // The Rust author binding currently imports resource-free documents only;
    // portable embedded-PCM authoring remains a separate open contract task.
    source.as_object_mut().unwrap().remove("assets");
    let graph = GraphWorkspace::from_project_json(&bytes(&source)).unwrap();
    let mut session = LiveGraphSession::new(graph).unwrap();
    let mut active = prepare(&source);
    let mut reference = prepare(&source);
    for runtime in [&mut active, &mut reference] {
        assert!(runtime.processor.set_parameter(2, 0, 1.));
    }
    for block in 0..8 {
        assert_eq!(
            render(&mut active, block * 128),
            render(&mut reference, block * 128)
        );
    }
    let candidate = session
        .prepare_transaction(48_000., 128, |graph| {
            graph.remove(2)?;
            graph.add(12, "loop-capture")?;
            graph.register_instance("/loop/main", 12)?;
            graph.connect(1, "out", 12, "audio")?;
            graph.connect(12, "out", 4, "a")
        })
        .unwrap();
    assert!(active.processor.begin_prepared_capture_staging(80, 128));
    COUNTS.with(|c| c.set(Some((0, 0))));
    let rejected = session
        .publish_transaction(&mut active, candidate)
        .err()
        .unwrap();
    assert_eq!(COUNTS.with(|c| c.replace(None)), Some((0, 0)));
    assert_eq!(rejected.reason, AuthorError::CaptureBusy);
    assert_eq!(session.revision(), 0);
    assert!(active.processor.cancel_capture_staging(80));
    COUNTS.with(|c| c.set(Some((0, 0))));
    let retired = session
        .publish_transaction(&mut active, rejected.prepared)
        .unwrap();
    for block in 8..16 {
        assert_eq!(
            render(&mut active, block * 128),
            render(&mut reference, block * 128)
        );
    }
    assert_eq!(COUNTS.with(|c| c.replace(None)), Some((0, 0)));
    assert_eq!(session.revision(), 1);
    drop(retired);
}
