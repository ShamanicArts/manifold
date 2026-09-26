//! Thin, single-instance AudioWorklet ABI. Graph and buffers are allocated only at prepare.

use manifold_core::graph::{Connection, ExecutionPlan, GraphDescription, NodeKind, NodeSpec};
use std::cell::RefCell;

struct WorkletEngine {
    plan: ExecutionPlan,
    capacity: usize,
    input: Vec<f32>,
    output: Vec<f32>,
}

struct GraphBuilder {
    description: GraphDescription,
    expected_nodes: usize,
    expected_connections: usize,
}

thread_local! {
    static ENGINE: RefCell<Option<WorkletEngine>> = const { RefCell::new(None) };
    static GRAPH_BUILDER: RefCell<Option<GraphBuilder>> = const { RefCell::new(None) };
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_version() -> u32 {
    2
}

/// Prepare-time graph ABI. Kind codes are versioned with manifold_version().
#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_begin(node_count: u32, connection_count: u32) -> u32 {
    if !(1..=64).contains(&node_count) || connection_count > 256 {
        return 0;
    }
    GRAPH_BUILDER.with(|slot| {
        *slot.borrow_mut() = Some(GraphBuilder {
            description: GraphDescription {
                nodes: Vec::with_capacity(node_count as usize),
                connections: Vec::with_capacity(connection_count as usize),
            },
            expected_nodes: node_count as usize,
            expected_connections: connection_count as usize,
        });
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_node(id: u32, kind: u32, a: f32, b: f32) -> u32 {
    let kind = match kind {
        0 => NodeKind::InputRaw,
        1 => NodeKind::InputMonitor { gain: a },
        2 => NodeKind::Constant { value: a },
        3 => NodeKind::Gain { gain: a },
        4 => NodeKind::Sum2 {
            gain_a: a,
            gain_b: b,
        },
        5 => NodeKind::LinearBlend { mix: a },
        6 => NodeKind::Svf,
        7 => NodeKind::Output,
        8 => NodeKind::Crossfader {
            position: a,
            curve: b,
            mix: 1.0,
        },
        _ => return 0,
    };
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        if builder.description.nodes.len() >= builder.expected_nodes {
            return 0;
        }
        builder.description.nodes.push(NodeSpec {
            id: id.into(),
            kind,
        });
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_edge(from: u32, to: u32, input_port: u32) -> u32 {
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        if builder.description.connections.len() >= builder.expected_connections {
            return 0;
        }
        builder.description.connections.push(Connection {
            from: from.into(),
            to: to.into(),
            input_port: input_port as usize,
        });
        1
    })
}

/// Set a node's authored value before graph compilation, without a smoothing ramp.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_initial_parameter(
    node_id: u32,
    parameter: u32,
    value: f32,
) -> u32 {
    if !value.is_finite() {
        return 0;
    }
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        let Some(node) = builder
            .description
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id.into())
        else {
            return 0;
        };
        match (&mut node.kind, parameter) {
            (NodeKind::Crossfader { position, .. }, 0) => *position = value.clamp(-1.0, 1.0),
            (NodeKind::Crossfader { curve, .. }, 1) => *curve = value.clamp(0.0, 1.0),
            (NodeKind::Crossfader { mix, .. }, 2) => *mix = value.clamp(0.0, 1.0),
            _ => return 0,
        }
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_prepare(sample_rate: f32, max_frames: u32) -> u32 {
    if !sample_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&sample_rate)
        || !(1..=8192).contains(&max_frames)
    {
        return 0;
    }
    let capacity = max_frames as usize;
    let fallback = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::Svf,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 2,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 3,
                input_port: 0,
            },
        ],
    };
    let description = GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        match slot.take() {
            Some(builder)
                if builder.description.nodes.len() == builder.expected_nodes
                    && builder.description.connections.len() == builder.expected_connections =>
            {
                Some(builder.description)
            }
            Some(_) => None,
            None => Some(fallback),
        }
    });
    let Some(description) = description else {
        return 0;
    };
    let Ok(plan) = description.compile(sample_rate, capacity) else {
        return 0;
    };
    ENGINE.with(|slot| {
        *slot.borrow_mut() = Some(WorkletEngine {
            plan,
            capacity,
            input: vec![0.0; capacity * 2],
            output: vec![0.0; capacity * 2],
        });
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_input_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |engine| engine.input.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_output_ptr() -> *const f32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |engine| engine.output.as_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_parameter(id: u32, value: f32) -> u32 {
    manifold_set_node_parameter(2, id, value)
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_node_parameter(node_id: u32, id: u32, value: f32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.plan.set_parameter(node_id.into(), id, value))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_process(frames: u32) -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        let frames = frames as usize;
        if frames > engine.capacity {
            return 0;
        }
        let (left_in, right_in) = engine.input.split_at(engine.capacity);
        let (left_out, right_out) = engine.output.split_at_mut(engine.capacity);
        engine.plan.process(
            [&left_in[..frames], &right_in[..frames]],
            [&mut left_out[..frames], &mut right_out[..frames]],
        );
        1
    })
}
