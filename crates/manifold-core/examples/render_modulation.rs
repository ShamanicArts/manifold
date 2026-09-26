//! Native reference for sample-rate LFO control of an audio gain stage.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 10 {
        return Err("usage: render_modulation OUTPUT WAVEFORM RATE_BEFORE RATE_AFTER BASE DEPTH_BEFORE DEPTH_AFTER BLOCK_SIZE FRAMES".into());
    }
    let waveform: u32 = args[2].parse()?;
    let rate_before: f32 = args[3].parse()?;
    let rate_after: f32 = args[4].parse()?;
    let base: f32 = args[5].parse()?;
    let depth_before: f32 = args[6].parse()?;
    let depth_after: f32 = args[7].parse()?;
    let block: usize = args[8].parse()?;
    let frames: usize = args[9].parse()?;
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
                    waveform,
                    rate: rate_before,
                },
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::ModulatedGain {
                    base,
                    depth: depth_before,
                },
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 3,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 3,
                input_port: 1,
            },
            Connection {
                from: 3,
                to: 4,
                input_port: 0,
            },
        ],
    };
    let mut plan = graph.compile(48_000.0, block)?;
    let mut result = Vec::with_capacity(frames * 2 * 4);
    for offset in (0..frames).step_by(block) {
        if offset == frames / 2 {
            assert!(plan.set_parameter(2, 1, rate_after));
            assert!(plan.set_parameter(3, 1, depth_after));
        }
        let count = block.min(frames - offset);
        let input = vec![0.0; count];
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        plan.process([&input, &input], [&mut left, &mut right]);
        for (&left, &right) in left.iter().zip(&right) {
            result.extend_from_slice(&left.to_le_bytes());
            result.extend_from_slice(&right.to_le_bytes());
        }
    }
    std::fs::File::create(&args[1])?.write_all(&result)?;
    Ok(())
}
