//! Native Rust reconstruction of the old Main sample-only amplitude path.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 7 {
        return Err("usage: render_main_gain_stage SOURCE OUTPUT AMP DEPTH FRAMES BLOCK".into());
    }
    let source: Vec<f32> = std::fs::read(&args[1])?
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect();
    let amp: f32 = args[3].parse()?;
    let depth: f32 = args[4].parse()?;
    let frames: usize = args[5].parse()?;
    let block: usize = args[6].parse()?;
    if source.len() < frames * 2 || block == 0 {
        return Err("invalid source length or block size".into());
    }
    let nodes = vec![
        NodeSpec {
            id: 1,
            kind: NodeKind::InputRaw,
        },
        NodeSpec {
            id: 2,
            kind: NodeKind::Gain { gain: amp * 2.0 },
        },
        NodeSpec {
            id: 3,
            kind: NodeKind::Constant { value: 0.0 },
        },
        NodeSpec {
            id: 4,
            kind: NodeKind::Crossfader {
                position: 1.0,
                curve: 1.0,
                mix: 1.0,
            },
        },
        NodeSpec {
            id: 5,
            kind: NodeKind::Mixer {
                inputs: 3,
                gains: vec![1.0 - depth, 0.0, depth],
                pans: vec![0.0; 3],
                master: 1.0,
            },
        },
        NodeSpec {
            id: 6,
            kind: NodeKind::Mixer {
                inputs: 4,
                gains: vec![0.0, 0.0, 0.0, 1.0],
                pans: vec![0.0; 4],
                master: 1.0,
            },
        },
        NodeSpec {
            id: 7,
            kind: NodeKind::Output,
        },
    ];
    let edges = [
        (1, 2, 0),
        (3, 4, 0),
        (2, 4, 1),
        (4, 5, 0),
        (5, 6, 3),
        (6, 7, 0),
    ]
    .into_iter()
    .map(|(from, to, input_port)| Connection {
        from,
        to,
        input_port,
    })
    .collect();
    let mut plan = GraphDescription {
        nodes,
        connections: edges,
    }
    .compile(48_000.0, block)?;
    let mut output = Vec::with_capacity(frames * 8);
    for offset in (0..frames).step_by(block) {
        let count = (frames - offset).min(block);
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        let input_left: Vec<f32> = (0..count)
            .map(|index| source[(offset + index) * 2])
            .collect();
        let input_right: Vec<f32> = (0..count)
            .map(|index| source[(offset + index) * 2 + 1])
            .collect();
        plan.process([&input_left, &input_right], [&mut left, &mut right]);
        for (left, right) in left.into_iter().zip(right) {
            output.extend_from_slice(&left.to_le_bytes());
            output.extend_from_slice(&right.to_le_bytes());
        }
    }
    std::fs::write(&args[2], output)?;
    Ok(())
}
