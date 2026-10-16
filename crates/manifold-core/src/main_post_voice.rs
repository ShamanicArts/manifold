//! Compile the authored default Main post-voice route before audio processing.
//! This small reader is temporary until the project graph parser lives in core.

use crate::effect_slot;
use crate::eq8;
use crate::graph::{Connection, ExecutionPlan, GraphDescription, NodeKind, NodeSpec};

pub(crate) fn default_plan(sample_rate: f32, max_frames: usize) -> ExecutionPlan {
    let document: serde_json::Value = serde_json::from_str(include_str!(
        "../../../projects/main-looper/default-rack-insert.json"
    ))
    .expect("authored default Main route must be valid JSON");
    let signal = &document["signal"];
    let nodes = signal["nodes"]
        .as_array()
        .expect("authored default Main nodes");
    let connections = signal["connections"]
        .as_array()
        .expect("authored default Main connections");
    let description = GraphDescription {
        nodes: nodes
            .iter()
            .map(|node| {
                let id = node["id"].as_u64().expect("Main node ID");
                let kind = match (id, node["type"].as_str().expect("Main node type")) {
                    (1, "input.raw") => NodeKind::InputRaw,
                    (6, "svf") => NodeKind::Svf,
                    (7 | 8, "effect-slot-legacy") => NodeKind::EffectSlotLegacy {
                        selected: node["a"].as_u64().expect("Main FX type") as u32,
                        mix: node["b"].as_f64().expect("Main FX mix") as f32,
                        params: effect_slot::DEFAULT_TYPE_PARAMETERS[0],
                    },
                    (9, "eq8") => NodeKind::Eq8 {
                        params: eq8::defaults(),
                    },
                    (3, "output") => NodeKind::Output,
                    other => panic!("unsupported default Main node: {other:?}"),
                };
                NodeSpec { id, kind }
            })
            .collect(),
        connections: connections
            .iter()
            .map(|edge| Connection {
                from: edge["from"].as_u64().expect("Main edge source"),
                to: edge["to"].as_u64().expect("Main edge target"),
                input_port: edge["inputPort"].as_u64().expect("Main input port") as usize,
                output_port: 0,
            })
            .collect(),
    };
    let mut plan = description
        .compile_patchable(sample_rate, max_frames)
        .expect("authored default Main route must compile");
    for parameter in signal["initialParameters"]
        .as_array()
        .expect("authored default Main controls")
    {
        let node = parameter["nodeId"].as_u64().expect("Main control node");
        let id = parameter["id"].as_u64().expect("Main control ID") as u32;
        let value = parameter["value"].as_f64().expect("Main control value") as f32;
        assert!(
            plan.set_parameter(node, id, value),
            "invalid Main control {node}:{id}"
        );
    }
    plan
}
