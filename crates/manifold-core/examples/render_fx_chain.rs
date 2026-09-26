//! Offline native reference for an authored v2 effects chain.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use manifold_core::stereo_delay;
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 29 {
        return Err(
            "usage: render_fx_chain INPUT OUTPUT RATE BLOCK STEP FRAMES BEFORE[11] AFTER[11]"
                .into(),
        );
    }
    let sample_rate: f32 = args[3].parse()?;
    let block: usize = args[4].parse()?;
    let step: usize = args[5].parse()?;
    let frames: usize = args[6].parse()?;
    let before: [f32; 11] = args[7..18]
        .iter()
        .map(|value| value.parse())
        .collect::<Result<Vec<_>, _>>()?
        .try_into()
        .unwrap();
    let after: [f32; 11] = args[18..29]
        .iter()
        .map(|value| value.parse())
        .collect::<Result<Vec<_>, _>>()?
        .try_into()
        .unwrap();
    let raw = std::fs::read(&args[1])?;
    if raw.len() != frames * 8 {
        return Err("invalid stereo input size".into());
    }
    let input: Vec<f32> = raw
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect();
    let mut delay = stereo_delay::defaults();
    for (id, value) in [
        (0, before[3]),
        (1, before[4]),
        (2, before[5]),
        (7, before[6]),
    ] {
        stereo_delay::set_value(&mut delay, id, value);
    }
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::Distortion {
                    drive: before[0],
                    mix: before[1],
                    output: before[2],
                },
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::StereoDelay { params: delay },
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::Svf,
            },
            NodeSpec {
                id: 5,
                kind: NodeKind::LinearBlend { mix: before[9] },
            },
            NodeSpec {
                id: 6,
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
            Connection {
                from: 3,
                to: 4,
                input_port: 0,
            },
            Connection {
                from: 3,
                to: 5,
                input_port: 0,
            },
            Connection {
                from: 4,
                to: 5,
                input_port: 1,
            },
            Connection {
                from: 5,
                to: 6,
                input_port: 0,
            },
        ],
    };
    let mut plan = graph.compile(sample_rate, block)?;
    for (id, value) in [(0, before[10]), (1, before[7]), (2, before[8])] {
        assert!(plan.set_parameter(4, id, value));
    }
    let mut result = Vec::with_capacity(raw.len());
    for offset in (0..frames).step_by(block) {
        if offset == step {
            for (node, id, value) in [
                (2, 0, after[0]),
                (2, 1, after[1]),
                (2, 2, after[2]),
                (3, 0, after[3]),
                (3, 1, after[4]),
                (3, 2, after[5]),
                (3, 7, after[6]),
                (4, 1, after[7]),
                (4, 2, after[8]),
                (5, 0, after[9]),
                (4, 0, after[10]),
            ] {
                assert!(plan.set_parameter(node, id, value));
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
