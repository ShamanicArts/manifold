use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 13 {
        return Err("usage: render_resonator_audio INPUT OUTPUT SAMPLE_RATE BLOCK STEP FRAMES GAIN0 FREQ0 Q0 GAIN1 FREQ1 Q1".into());
    }
    let rate: f32 = args[3].parse()?;
    let block: usize = args[4].parse()?;
    let step: usize = args[5].parse()?;
    let frames: usize = args[6].parse()?;
    let before = [args[7].parse()?, args[8].parse()?, args[9].parse()?];
    let after = [args[10].parse()?, args[11].parse()?, args[12].parse()?];
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
                kind: NodeKind::Resonator { params: before },
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
    let mut result = Vec::with_capacity(raw.len());
    for offset in (0..frames).step_by(block) {
        if offset == step {
            for (id, value) in after.into_iter().enumerate() {
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
