//! Generate the browser's static port/type-code catalog from the Rust graph contract.
//! Run scripts/update-port-catalog.sh after changing a supported node's ports.

use std::collections::BTreeMap;

use manifold_core::graph::NodeKind;
use manifold_core::node_catalog::{WORKSPACE_TYPES, constructor_fields};
use manifold_core::parameter_catalog::workspace_parameters;
use serde_json::{Value, json};

fn main() {
    let catalog: BTreeMap<_, Value> = WORKSPACE_TYPES
        .into_iter()
        .map(|entry| {
            let manifold_core::node_catalog::WorkspaceType {
                id,
                code,
                a,
                b,
                arg_count,
            } = entry;
            let kind =
                NodeKind::from_abi_code(code, a as f32, b as f32).expect("catalog type code");
            assert_eq!(
                kind.workspace_type_id(),
                Some(id),
                "catalog type code {code} has wrong kind"
            );
            let inputs: Vec<_> = (0..kind.input_port_count())
                .map(|port| {
                    json!({
                        "name": kind.input_port_name(port).unwrap(),
                        "signal": kind.input_port_signal(port).unwrap().name(),
                    })
                })
                .collect();
            let outputs: Vec<_> = (0..kind.output_port_count())
                .map(|port| {
                    json!({
                        "name": kind.output_port_name(port).unwrap(),
                        "signal": kind.output_port_signal(port).unwrap().name(),
                    })
                })
                .collect();
            let parameters: Vec<_> = workspace_parameters(id)
                .iter()
                .map(|spec| {
                    json!({
                        "id": spec.id, "min": spec.min, "max": spec.max,
                        "default": spec.default, "discrete": spec.discrete,
                    })
                })
                .collect();
            let args = match arg_count {
                0 => json!({}),
                1 => json!({ "a": a }),
                2 => json!({ "a": a, "b": b }),
                _ => unreachable!(),
            };
            let configuration: BTreeMap<_, _> = constructor_fields(id).iter().map(|field| {
                let mut value = json!({"argument": (["a", "b"][field.argument]), "min": field.min,
                    "default": ([a,b][field.argument])});
                if let Some(max) = field.max { value["max"] = json!(max); }
                (field.name, value)
            }).collect();
            (
                id,
                json!({ "code": code, "args": args, "inputs": inputs, "outputs": outputs,
                    "parameters": parameters, "configuration": configuration }),
            )
        })
        .collect();
    println!("// Generated from manifold-core graph metadata. Run scripts/update-port-catalog.sh.");
    println!(
        "export const PORT_CATALOG = {};",
        serde_json::to_string_pretty(&catalog).unwrap()
    );
}
