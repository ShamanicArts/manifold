use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 13 {
        return Err("usage: render_distortion INPUT OUTPUT DRIVE_BEFORE DRIVE_AFTER MIX_BEFORE MIX_AFTER OUTPUT_BEFORE OUTPUT_AFTER SAMPLE_RATE BLOCK_SIZE STEP_FRAME FRAMES".into());
    }
    let drive_before: f32 = args[3].parse()?;
    let drive_after: f32 = args[4].parse()?;
    let mix_before: f32 = args[5].parse()?;
    let mix_after: f32 = args[6].parse()?;
    let output_before: f32 = args[7].parse()?;
    let output_after: f32 = args[8].parse()?;
    let sample_rate: f32 = args[9].parse()?;
    let block: usize = args[10].parse()?;
    let step: usize = args[11].parse()?;
    let frames: usize = args[12].parse()?;
    let raw = std::fs::read(&args[1])?;
    if raw.len() != frames * 2 * 4 {
        return Err("invalid input size".into());
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
                kind: NodeKind::Distortion {
                    drive: drive_before,
                    mix: mix_before,
                    output: output_before,
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
    let mut plan = graph.compile(sample_rate, block)?;
    let mut result = Vec::with_capacity(raw.len());
    for offset in (0..frames).step_by(block) {
        if offset == step {
            for (id, value) in [drive_after, mix_after, output_after]
                .into_iter()
                .enumerate()
            {
                assert!(plan.set_parameter(2, id as u32, value));
            }
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
            result.extend_from_slice(&left.to_le_bytes());
            result.extend_from_slice(&right.to_le_bytes());
        }
    }
    std::fs::File::create(&args[2])?.write_all(&result)?;
    Ok(())
}
