//! Native output for graphs assembled by the browser topology editor.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 || !["seed", "distortion", "cv"].contains(&args[1].as_str()) {
        return Err("usage: render_graph_workspace seed|distortion|cv OUTPUT".into());
    }
    let distorted = args[1] != "seed";
    let cv = args[1] == "cv";
    let mut nodes = vec![
        NodeSpec {
            id: 1,
            kind: NodeKind::InputRaw,
        },
        NodeSpec {
            id: 2,
            kind: NodeKind::Gain { gain: 0.7 },
        },
        NodeSpec {
            id: 3,
            kind: NodeKind::Output,
        },
    ];
    let mut connections = vec![Connection {
        from: 1,
        to: 2,
        input_port: 0,
    }];
    if distorted {
        nodes.push(NodeSpec {
            id: 4,
            kind: NodeKind::Distortion {
                drive: 9.0,
                mix: 0.7,
                output: 0.8,
            },
        });
        connections.push(Connection {
            from: 2,
            to: 4,
            input_port: 0,
        });
    }
    if cv {
        nodes.push(NodeSpec {
            id: 5,
            kind: NodeKind::Lfo {
                waveform: 0,
                rate: 2.0,
            },
        });
        nodes.push(NodeSpec {
            id: 6,
            kind: NodeKind::ModulatedGain {
                base: 0.5,
                depth: 0.4,
            },
        });
        connections.extend([
            Connection {
                from: 4,
                to: 6,
                input_port: 0,
            },
            Connection {
                from: 5,
                to: 6,
                input_port: 1,
            },
        ]);
    }
    connections.push(Connection {
        from: if cv {
            6
        } else if distorted {
            4
        } else {
            2
        },
        to: 3,
        input_port: 0,
    });
    let mut plan = GraphDescription { nodes, connections }.compile(48_000.0, 128)?;
    let mut pcm = Vec::with_capacity(8192 * 2 * 4);
    for block in 0..64 {
        let mut input_left = [0.0_f32; 128];
        let mut input_right = [0.0_f32; 128];
        for index in 0..128 {
            let frame = block * 128 + index;
            let step = (frame % 64) as i32 - 32;
            input_left[index] = step as f32 / 128.0;
            input_right[index] = -(step as f32) / 256.0;
        }
        let mut left = [0.0_f32; 128];
        let mut right = [0.0_f32; 128];
        plan.process([&input_left, &input_right], [&mut left, &mut right]);
        for (&l, &r) in left.iter().zip(&right) {
            pcm.extend_from_slice(&l.to_le_bytes());
            pcm.extend_from_slice(&r.to_le_bytes());
        }
    }
    std::fs::File::create(&args[2])?.write_all(&pcm)?;
    Ok(())
}
