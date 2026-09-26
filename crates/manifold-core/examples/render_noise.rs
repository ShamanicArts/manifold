use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 10 {
        return Err("usage: render_noise OUTPUT LEVEL_BEFORE LEVEL_AFTER COLOR_BEFORE COLOR_AFTER SAMPLE_RATE BLOCK_SIZE STEP_FRAME FRAMES".into());
    }
    let level_before: f32 = args[2].parse()?;
    let level_after: f32 = args[3].parse()?;
    let color_before: f32 = args[4].parse()?;
    let color_after: f32 = args[5].parse()?;
    let sample_rate: f32 = args[6].parse()?;
    let block: usize = args[7].parse()?;
    let step: usize = args[8].parse()?;
    let frames: usize = args[9].parse()?;
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::NoiseGenerator {
                    level: level_before,
                    color: color_before,
                },
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![Connection {
            from: 1,
            to: 2,
            input_port: 0,
        }],
    };
    let mut plan = graph.compile(sample_rate, block)?;
    let mut result = Vec::with_capacity(frames * 2 * 4);
    for offset in (0..frames).step_by(block) {
        if offset == step {
            assert!(plan.set_parameter(1, 0, level_after));
            assert!(plan.set_parameter(1, 1, color_after));
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
