// Shared native/CLAP/VST3 scale fixture: both many logical buses and a single
// wide discrete bus, with the last optional input routed into every output.
fn large_io_project(bus_count: usize) -> serde_json::Value {
    use manifold_native::{AudioBus, InputBinding, InputChannel, IoLayout, OutputChannel};
    let mut graph = manifold_native::author::GraphWorkspace::new();
    let inputs: Vec<_> = (0..bus_count)
        .map(|i| AudioBus {
            id: format!("bus-{i}"),
            name: format!("Audio bus {i}"),
            channels: if i == 0 { 300 } else { 9 },
            optional: i == bus_count - 1,
        })
        .collect();
    let count = inputs.iter().map(|b| b.channels).sum();
    let outputs = inputs
        .iter()
        .map(|b| AudioBus {
            optional: false,
            ..b.clone()
        })
        .collect();
    graph
        .set_io_layout(IoLayout {
            version: 1,
            inputs,
            outputs,
            input_bindings: vec![InputBinding {
                node: 1,
                channels: [
                    Some(InputChannel {
                        bus: bus_count - 1,
                        channel: 8,
                    }),
                    Some(InputChannel {
                        bus: 0,
                        channel: 299,
                    }),
                ],
            }],
            output_bindings: (0..count)
                .map(|i| {
                    Some(OutputChannel {
                        node: 1,
                        port: 0,
                        channel: i % 2,
                    })
                })
                .collect(),
        })
        .unwrap();
    graph.to_project().unwrap()
}
