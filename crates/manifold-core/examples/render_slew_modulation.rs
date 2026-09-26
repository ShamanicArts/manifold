//! Native reference for an LFO -> SlewControl -> ModulatedGain patch.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 12 {
        return Err("usage: render_slew_modulation OUTPUT WAVE RATE_BEFORE RATE_AFTER UP_BEFORE UP_AFTER DOWN_BEFORE DOWN_AFTER DEPTH_BEFORE DEPTH_AFTER BLOCK".into());
    }
    let wave: u32 = args[2].parse()?;
    let before = [
        args[3].parse::<f32>()?,
        args[5].parse()?,
        args[7].parse()?,
        args[9].parse()?,
    ];
    let after = [
        args[4].parse::<f32>()?,
        args[6].parse()?,
        args[8].parse()?,
        args[10].parse()?,
    ];
    let block: usize = args[11].parse()?;
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
                    waveform: wave,
                    rate: before[0],
                },
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::SlewControl {
                    up: before[1],
                    down: before[2],
                },
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::ModulatedGain {
                    base: 0.6,
                    depth: before[3],
                },
            },
            NodeSpec {
                id: 5,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 4,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 3,
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
        ],
    };
    let mut plan = graph.compile(48_000.0, block)?;
    let mut output = std::fs::File::create(&args[1])?;
    for offset in (0..FRAMES).step_by(block) {
        if offset == STEP {
            assert!(plan.set_parameter(2, 1, after[0]));
            assert!(plan.set_parameter(3, 0, after[1]));
            assert!(plan.set_parameter(3, 1, after[2]));
            assert!(plan.set_parameter(4, 1, after[3]));
        }
        let count = block.min(FRAMES - offset);
        let silence = vec![0.0; count];
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        plan.process([&silence, &silence], [&mut left, &mut right]);
        for (&left, &right) in left.iter().zip(&right) {
            output.write_all(&left.to_le_bytes())?;
            output.write_all(&right.to_le_bytes())?;
        }
    }
    Ok(())
}
