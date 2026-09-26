//! Native capture of the authored Main-rack CV chain.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn values(text: &str) -> Result<[f32; 10], Box<dyn std::error::Error>> {
    let parsed: Vec<f32> = text.split(',').map(str::parse).collect::<Result<_, _>>()?;
    Ok(parsed
        .try_into()
        .map_err(|_| "expected ten parameter values")?)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 6 {
        return Err("usage: render_cv_rack OUTPUT METERS BEFORE_CSV AFTER_CSV BLOCK".into());
    }
    let before = values(&args[3])?;
    let after = values(&args[4])?;
    let block: usize = args[5].parse()?;
    const FRAMES: usize = 24576;
    const STEP: usize = FRAMES / 2;
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::Oscillator {
                    frequency: 220.0,
                    amplitude: 0.3,
                    waveform: 0,
                },
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::Lfo {
                    waveform: 0,
                    rate: before[1],
                },
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Lfo {
                    waveform: 2,
                    rate: before[2],
                },
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::SampleHold {
                    mode: before[0].round() as u32,
                },
            },
            NodeSpec {
                id: 5,
                kind: NodeKind::AttenuverterBias {
                    amount: before[3],
                    bias: before[4],
                },
            },
            NodeSpec {
                id: 6,
                kind: NodeKind::Lfo {
                    waveform: 1,
                    rate: 1.0,
                },
            },
            NodeSpec {
                id: 7,
                kind: NodeKind::CvMix {
                    levels: [before[5], before[6], 0.0, 0.0],
                    offset: before[7],
                },
            },
            NodeSpec {
                id: 8,
                kind: NodeKind::ModulatedGain {
                    base: before[8],
                    depth: before[9],
                },
            },
            NodeSpec {
                id: 9,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 8,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 4,
                input_port: 0,
            },
            Connection {
                from: 3,
                to: 4,
                input_port: 1,
            },
            Connection {
                from: 4,
                to: 5,
                input_port: 0,
            },
            Connection {
                from: 5,
                to: 7,
                input_port: 0,
            },
            Connection {
                from: 6,
                to: 7,
                input_port: 1,
            },
            Connection {
                from: 7,
                to: 8,
                input_port: 1,
            },
            Connection {
                from: 8,
                to: 9,
                input_port: 0,
            },
        ],
    };
    let mut plan = graph.compile(48_000.0, block)?;
    let mut output = std::fs::File::create(&args[1])?;
    let mut meters = std::fs::File::create(&args[2])?;
    for offset in (0..FRAMES).step_by(block) {
        if offset == STEP {
            for (node, id, value) in [
                (4, 0, after[0]),
                (2, 1, after[1]),
                (3, 1, after[2]),
                (5, 0, after[3]),
                (5, 1, after[4]),
                (7, 0, after[5]),
                (7, 1, after[6]),
                (7, 4, after[7]),
                (8, 0, after[8]),
                (8, 1, after[9]),
            ] {
                assert!(plan.set_parameter(node, id, value));
            }
        }
        let count = block.min(FRAMES - offset);
        let silence = vec![0.0; count];
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        plan.process([&silence, &silence], [&mut left, &mut right]);
        for node_id in [4, 5, 7, 8] {
            meters.write_all(&plan.node_meter(node_id, 0).unwrap().to_le_bytes())?;
        }
        for (&left, &right) in left.iter().zip(&right) {
            output.write_all(&left.to_le_bytes())?;
            output.write_all(&right.to_le_bytes())?;
        }
    }
    Ok(())
}
