//! Native reference for sample-rate envelope control of a stereo gain stage.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 22 {
        return Err("usage: render_envelope_ducking INPUT AUDIO METERS RATE BLOCK STEP FRAMES BEFORE[7] AFTER[7]".into());
    }
    let sample_rate: f32 = args[4].parse()?;
    let block: usize = args[5].parse()?;
    let step: usize = args[6].parse()?;
    let frames: usize = args[7].parse()?;
    let before: [f32; 7] = args[8..15]
        .iter()
        .map(|value| value.parse())
        .collect::<Result<Vec<_>, _>>()?
        .try_into()
        .unwrap();
    let after: [f32; 7] = args[15..22]
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
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::EnvelopeControl {
                    attack_ms: before[0],
                    release_ms: before[1],
                    sensitivity: before[2],
                    highpass_hz: before[3],
                    mode: before[4] as u32,
                },
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::ModulatedGain {
                    base: before[5],
                    depth: before[6],
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
                to: 2,
                input_port: 0,
            },
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
    let mut plan = graph.compile(sample_rate, block)?;
    let mut audio = Vec::with_capacity(raw.len());
    let mut meters = Vec::with_capacity((frames + block - 1) / block * 4);
    for offset in (0..frames).step_by(block) {
        if offset == step {
            for (id, value) in after[..5].iter().enumerate() {
                assert!(plan.set_parameter(2, id as u32, *value));
            }
            assert!(plan.set_parameter(3, 0, after[5]));
            assert!(plan.set_parameter(3, 1, after[6]));
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
            audio.extend_from_slice(&left.to_le_bytes());
            audio.extend_from_slice(&right.to_le_bytes());
        }
        meters.extend_from_slice(&plan.node_meter(2, 0).unwrap().to_le_bytes());
    }
    std::fs::File::create(&args[2])?.write_all(&audio)?;
    std::fs::File::create(&args[3])?.write_all(&meters)?;
    Ok(())
}
