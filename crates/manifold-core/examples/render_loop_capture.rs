//! Native reference for the first live capture / loop playback graph.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 9 {
        return Err(
            "usage: render_loop_capture INPUT OUTPUT RATE BLOCK FRAMES CAPACITY MIX EVENTS".into(),
        );
    }
    let sample_rate: f32 = args[3].parse()?;
    let block: usize = args[4].parse()?;
    let frames: usize = args[5].parse()?;
    let capacity_seconds: f32 = args[6].parse()?;
    let mix: f32 = args[7].parse()?;
    let events: Vec<(usize, u32, f32)> = args[8]
        .split(',')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut pieces = part.split(':');
            Ok((
                pieces.next().ok_or("event frame")?.parse()?,
                pieces.next().ok_or("event id")?.parse()?,
                pieces.next().ok_or("event value")?.parse()?,
            ))
        })
        .collect::<Result<_, Box<dyn std::error::Error>>>()?;
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
                kind: NodeKind::LoopCapture {
                    capacity_seconds,
                    mix,
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
        for &(frame, id, value) in events.iter().filter(|event| event.0 == offset) {
            debug_assert_eq!(frame, offset);
            assert!(plan.set_parameter(2, id, value));
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
