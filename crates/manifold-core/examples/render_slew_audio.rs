//! Native Rust renderer for the original stereo SlewLimiter cases.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 11 {
        return Err("usage: render_slew_audio INPUT OUTPUT UP_BEFORE UP_AFTER DOWN_BEFORE DOWN_AFTER RATE BLOCK STEP FRAMES".into());
    }
    let up_before: f32 = args[3].parse()?;
    let up_after: f32 = args[4].parse()?;
    let down_before: f32 = args[5].parse()?;
    let down_after: f32 = args[6].parse()?;
    let rate: f32 = args[7].parse()?;
    let block: usize = args[8].parse()?;
    let step: usize = args[9].parse()?;
    let frames: usize = args[10].parse()?;
    let raw = std::fs::read(&args[1])?;
    if raw.len() != frames * 8 || block == 0 {
        return Err("invalid input or block".into());
    }
    let input: Vec<f32> = raw
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect();
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::SlewAudio {
                    up: up_before,
                    down: down_before,
                },
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
    let mut plan = graph.compile(rate, block)?;
    let mut output = std::fs::File::create(&args[2])?;
    for offset in (0..frames).step_by(block) {
        if offset == step {
            assert!(plan.set_parameter(2, 0, up_after));
            assert!(plan.set_parameter(2, 1, down_after));
        }
        let count = block.min(frames - offset);
        let left: Vec<_> = (0..count)
            .map(|frame| input[(offset + frame) * 2])
            .collect();
        let right: Vec<_> = (0..count)
            .map(|frame| input[(offset + frame) * 2 + 1])
            .collect();
        let mut out_left = vec![0.0; count];
        let mut out_right = vec![0.0; count];
        plan.process([&left, &right], [&mut out_left, &mut out_right]);
        for (&left, &right) in out_left.iter().zip(&out_right) {
            output.write_all(&left.to_le_bytes())?;
            output.write_all(&right.to_le_bytes())?;
        }
    }
    Ok(())
}
