use std::alloc::{GlobalAlloc, Layout, System};
use std::cell::Cell;

use manifold_core::graph::{Connection, GraphDescription, GraphError, NodeKind, NodeSpec};

thread_local! {
    static ALLOCATIONS: Cell<Option<usize>> = const { Cell::new(None) };
    static DEALLOCATIONS: Cell<usize> = const { Cell::new(0) };
}

struct CountingAllocator;

#[global_allocator]
static ALLOCATOR: CountingAllocator = CountingAllocator;

impl CountingAllocator {
    fn record() {
        let _ = ALLOCATIONS.try_with(|count| {
            if let Some(value) = count.get() {
                count.set(Some(value + 1));
            }
        });
    }
}

unsafe impl GlobalAlloc for CountingAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        Self::record();
        unsafe { System.alloc(layout) }
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        Self::record();
        unsafe { System.alloc_zeroed(layout) }
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        Self::record();
        unsafe { System.realloc(ptr, layout, new_size) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        if ALLOCATIONS.try_with(Cell::get).ok().flatten().is_some() {
            DEALLOCATIONS.with(|count| count.set(count.get() + 1));
        }
        unsafe { System.dealloc(ptr, layout) }
    }
}

fn loop_graph(id: u64, capacity: f32, retrospective: bool) -> GraphDescription {
    GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
            NodeSpec {
                id,
                kind: if retrospective {
                    NodeKind::RetrospectiveCapture {
                        capacity_seconds: capacity,
                    }
                } else {
                    NodeKind::LoopCapture {
                        capacity_seconds: capacity,
                        mix: 1.,
                    }
                },
            },
        ],
        connections: vec![edge(1, id), edge(id, 3)],
    }
}
fn render(plan: &mut manifold_core::graph::ExecutionPlan, input: &[f32; 128]) -> [[f32; 128]; 2] {
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    plan.process([input, input], [&mut left, &mut right]);
    [left, right]
}
fn targets(plan: &manifold_core::graph::ExecutionPlan, id: u64) -> [f32; 7] {
    std::array::from_fn(|parameter| plan.parameter_target(id, parameter as u32).unwrap())
}

#[test]
fn loop_record_play_overdub_and_control_intent_survive_owned_publication_without_heap() {
    for mode in 0..3 {
        let mut previous = loop_graph(4, 0.05, false)
            .compile_patchable(48_000., 128)
            .unwrap();
        let mut reference = loop_graph(4, 0.05, false)
            .compile_patchable(48_000., 128)
            .unwrap();
        let mut candidate = loop_graph(14, 0.05, false)
            .compile_patchable(48_000., 128)
            .unwrap();
        let input = std::array::from_fn(|i| (i as f32 * 0.11).sin() * 0.2);
        for plan in [&mut previous, &mut reference] {
            assert!(plan.set_parameter(4, 0, 1.));
            for _ in 0..24 {
                render(plan, &input);
            } // Wrap the ring.
            if mode != 0 {
                assert!(plan.set_parameter(4, 0, 0.));
                assert!(plan.set_parameter(4, 1, 1.));
                if mode == 2 {
                    assert!(plan.set_parameter(4, 2, 1.));
                }
                render(plan, &input);
            }
        }
        let mut parameters = targets(&previous, 4);
        parameters[3] = 1.33;
        parameters[4] = 1.;
        parameters[5] = 0.7;
        for id in [3, 4, 5] {
            reference.set_parameter(4, id, parameters[id as usize]);
        }
        DEALLOCATIONS.with(|value| value.set(0));
        ALLOCATIONS.with(|value| value.set(Some(0)));
        let transferred =
            candidate.transfer_owned_loop_history(&mut previous, &[(14, 4, parameters)]);
        let mut equal = true;
        for _ in 0..16 {
            equal &= render(&mut candidate, &input) == render(&mut reference, &input);
        }
        let allocations = ALLOCATIONS.with(|value| value.replace(None).unwrap());
        assert_eq!(transferred, 1);
        assert!(equal, "mode {mode}");
        assert_eq!(allocations, 0);
        assert_eq!(DEALLOCATIONS.with(Cell::get), 0);
        assert_eq!(targets(&candidate, 14), targets(&reference, 4));
        assert_eq!(
            candidate.capture_revision(14),
            reference.capture_revision(4)
        );
        // Publication with an explicit stop applies the normal record/play
        // transition after the take has moved, not to an empty candidate.
        let mut stopped = loop_graph(24, 0.05, false)
            .compile_patchable(48_000., 128)
            .unwrap();
        let mut stop = targets(&candidate, 14);
        stop[0] = 0.;
        stop[1] = 0.;
        stop[2] = 0.;
        for id in 0..3 {
            reference.set_parameter(4, id, 0.);
        }
        assert_eq!(
            stopped.transfer_owned_loop_history(&mut candidate, &[(24, 14, stop)]),
            1
        );
        assert_eq!(render(&mut stopped, &input), render(&mut reference, &input));
        let mut take = [0.; 4800];
        let mut expected = [0.; 4800];
        assert_eq!(
            stopped.copy_capture_interleaved(24, 0, &mut take),
            reference.copy_capture_interleaved(4, 0, &mut expected)
        );
        assert_eq!(take, expected);
    }
}

#[test]
fn owned_capture_ring_retains_cursor_and_rejects_capacity_rate_or_active_stage_changes() {
    let mut old = loop_graph(4, 1., true)
        .compile_patchable(48_000., 128)
        .unwrap();
    let mut next = loop_graph(14, 1., true)
        .compile_patchable(48_000., 128)
        .unwrap();
    let input = [0.17; 128];
    for _ in 0..380 {
        render(&mut old, &input);
    }
    let cursor = old.retrospective_cursor(4);
    let parameters = [0., 0., 0., 1., 0., 0., 0.5];
    assert_eq!(
        next.transfer_owned_loop_history(&mut old, &[(14, 4, parameters)]),
        1
    );
    assert_eq!(next.retrospective_cursor(14), cursor);
    let mut changed = loop_graph(24, 2., true)
        .compile_patchable(48_000., 128)
        .unwrap();
    assert_eq!(
        changed.transfer_owned_loop_history(&mut next, &[(24, 14, parameters)]),
        0
    );
    let mut wrong_rate = loop_graph(24, 1., true)
        .compile_patchable(44_100., 128)
        .unwrap();
    assert_eq!(
        wrong_rate.transfer_owned_loop_history(&mut next, &[(24, 14, parameters)]),
        0
    );
    assert!(next.reserve_capture_staging(14, 256));
    assert!(next.begin_prepared_capture_staging(14, 256));
    let mut fresh = loop_graph(24, 1., true)
        .compile_patchable(48_000., 128)
        .unwrap();
    assert_eq!(
        fresh.transfer_owned_loop_history(&mut next, &[(24, 14, parameters)]),
        0
    );
    render(&mut next, &[0.; 128]);
    let mut pcm = [0.; 512];
    assert_eq!(next.copy_capture_staged_interleaved(14, 0, &mut pcm), 256);
    assert!(pcm.iter().all(|value| *value == 0.17));
}

fn edge(from: u64, to: u64) -> Connection {
    Connection {
        from,
        output_port: 0,
        to,
        input_port: 0,
    }
}

#[test]
fn backward_live_routes_and_audio_blocks_do_not_allocate() {
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::Gain { gain: 0.5 },
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::Gain { gain: 0.8 },
            },
            NodeSpec {
                id: 5,
                kind: NodeKind::Gain { gain: 0.5 },
            },
        ],
        connections: vec![edge(1, 2), edge(2, 3), edge(1, 4), edge(4, 5)],
    };
    let mut plan = graph.compile_patchable(48_000.0, 128).unwrap();
    let input = [1.0; 128];
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    // Initialize the counter and exercise one edit before measuring runtime work.
    ALLOCATIONS.with(|count| count.set(None));
    plan.set_route(2, 0, Some(5)).unwrap();
    plan.set_route(2, 0, Some(1)).unwrap();

    ALLOCATIONS.with(|count| count.set(Some(0)));
    for _ in 0..32 {
        plan.set_route(2, 0, Some(5)).unwrap();
        plan.process([&input, &input], [&mut left, &mut right]);
        assert!((left[127] - 0.2).abs() < 1e-6);
        assert_eq!(plan.set_route(5, 0, Some(2)), Err(GraphError::Cycle));
        plan.set_route(2, 0, Some(1)).unwrap();
        plan.process([&input, &input], [&mut left, &mut right]);
        assert!((left[127] - 0.5).abs() < 1e-6);
    }
    let allocations = ALLOCATIONS.with(|count| count.replace(None).unwrap());
    assert_eq!(allocations, 0, "audio block or backward route allocated");
}
