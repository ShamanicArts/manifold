//! Native library proof: control reads accepted DSP state without a second model.
use manifold_native::{
    AudioBlock,
    parameters::{HOST_SLOT_BASE, TimedAutomation},
};
use manifold_project_js::native_host::{NativeScriptAudio, prepare_native_script};
use serde_json::Value;
use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

thread_local! {
    static TRACKING: Cell<bool> = const { Cell::new(false) };
    static ALLOCATIONS: Cell<usize> = const { Cell::new(0) };
    static DEALLOCATIONS: Cell<usize> = const { Cell::new(0) };
}
struct TrackedAllocator;
unsafe impl GlobalAlloc for TrackedAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if TRACKING.try_with(Cell::get).unwrap_or(false) {
            ALLOCATIONS.with(|count| count.set(count.get() + 1));
        }
        unsafe { System.alloc(layout) }
    }
    unsafe fn dealloc(&self, pointer: *mut u8, layout: Layout) {
        if TRACKING.try_with(Cell::get).unwrap_or(false) {
            DEALLOCATIONS.with(|count| count.set(count.get() + 1));
        }
        unsafe {
            System.dealloc(pointer, layout);
        }
    }
    unsafe fn realloc(&self, pointer: *mut u8, layout: Layout, size: usize) -> *mut u8 {
        if TRACKING.try_with(Cell::get).unwrap_or(false) {
            ALLOCATIONS.with(|count| count.set(count.get() + 1));
        }
        unsafe { System.realloc(pointer, layout, size) }
    }
}
#[global_allocator]
static ALLOCATOR: TrackedAllocator = TrackedAllocator;

fn render_without_heap(audio: &mut NativeScriptAudio, automation: &[TimedAutomation]) {
    let input = [0.1_f32; 128];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    ALLOCATIONS.with(|count| count.set(0));
    DEALLOCATIONS.with(|count| count.set(0));
    TRACKING.with(|enabled| enabled.set(true));
    let result = audio.process_host_automated(
        AudioBlock {
            main: Some([&input, &input]),
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        },
        automation,
    );
    TRACKING.with(|enabled| enabled.set(false));
    result.unwrap();
    assert_eq!(ALLOCATIONS.with(Cell::get), 0, "callback allocated");
    assert_eq!(
        DEALLOCATIONS.with(Cell::get),
        0,
        "callback retired heap storage"
    );
    assert!(left.iter().chain(&right).all(|sample| sample.is_finite()));
}
fn target(bytes: &[u8]) -> f64 {
    let graph: Value = serde_json::from_slice(bytes).unwrap();
    graph["signal"]["initialParameters"]
        .as_array()
        .unwrap()
        .iter()
        .find(|parameter| parameter["nodeId"] == 4 && parameter["id"] == 0)
        .unwrap()["value"]
        .as_f64()
        .unwrap()
}

#[test]
fn native_library_automatically_adopts_host_targets_before_edit_save_and_reopen_without_callback_heap_work()
 {
    let bundle = include_str!("../../../projects/graph-workspace/fx-slot-project.bundle.js");
    let (mut control, mut audio) = prepare_native_script(bundle, None, 48_000., 128).unwrap();
    let project =
        manifold_native::project::NativeProject::parse(control.current_project()).unwrap();
    let gain = project
        .host_parameters()
        .iter()
        .find(|parameter| parameter.node == 4 && parameter.local_id == 0)
        .unwrap();
    render_without_heap(
        &mut audio,
        &[TimedAutomation {
            offset: 64,
            id: u64::from(HOST_SLOT_BASE),
            normalized: gain.to_normalized(0.375).unwrap(),
        }],
    );
    // The accessor is the last authored snapshot; saving explicitly refreshes it.
    assert_eq!(target(control.current_project()), 1.);
    assert_eq!(target(control.save_project().unwrap()), 0.375);
    control
        .begin_set_path("/test/fxslot/slotA/select", 1.)
        .unwrap();
    render_without_heap(&mut audio, &[]);
    let saved = control.poll().unwrap().unwrap().to_vec();
    assert_eq!(target(&saved), 0.375);
    let (mut reopened, mut playback) =
        prepare_native_script(bundle, Some(&saved), 48_000., 128).unwrap();
    render_without_heap(
        &mut playback,
        &[TimedAutomation {
            offset: 12,
            id: u64::from(HOST_SLOT_BASE),
            normalized: gain.to_normalized(0.625).unwrap(),
        }],
    );
    // No save/synchronize call before this edit: the controller adopts automatically.
    reopened
        .begin_set_path("/test/fxslot/slotB/select", 1.)
        .unwrap();
    render_without_heap(&mut playback, &[]);
    let saved = reopened.poll().unwrap().unwrap();
    assert_eq!(target(saved), 0.625);
    let graph: Value = serde_json::from_slice(saved).unwrap();
    assert_eq!(graph["signal"]["nodes"].as_array().unwrap().len(), 14);
    let controls = graph["controls"].as_array().unwrap();
    assert_eq!(
        controls
            .iter()
            .filter(
                |control| control["path"].as_str().unwrap().ends_with("/select")
                    && control["value"] == 1
            )
            .count(),
        2
    );
}
