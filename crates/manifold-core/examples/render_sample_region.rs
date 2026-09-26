//! Native reference for the authored file-backed sample region slice.
use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 9 {
        return Err("usage: render_sample_region SAMPLE OUTPUT SOURCE_RATE OUTPUT_RATE BLOCK FRAMES PARAMETERS EVENTS".into());
    }
    let raw = std::fs::read(&args[1])?;
    if raw.len() % 8 != 0 {
        return Err("invalid interleaved stereo sample".into());
    }
    let sample = raw
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect();
    let source_rate: f32 = args[3].parse()?;
    let output_rate: f32 = args[4].parse()?;
    let block: usize = args[5].parse()?;
    let frames: usize = args[6].parse()?;
    let parameters: Vec<f32> = args[7]
        .split(',')
        .map(str::parse)
        .collect::<Result<_, _>>()?;
    if parameters.len() != 7 {
        return Err("expected seven sample parameters".into());
    }
    let events: Vec<(usize, u32, f32)> = args[8]
        .split(',')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut parts = part.split(':');
            Ok((
                parts.next().ok_or("event frame")?.parse()?,
                parts.next().ok_or("event id")?.parse()?,
                parts.next().ok_or("event value")?.parse()?,
            ))
        })
        .collect::<Result<_, Box<dyn std::error::Error>>>()?;
    let mut plan = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 2,
                kind: NodeKind::SampleRegion,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![Connection {
            from: 2,
            to: 3,
            input_port: 0,
        }],
    }
    .compile(output_rate, block)?;
    if !plan.load_sample_stereo(2, sample, source_rate) {
        return Err("sample load rejected".into());
    }
    for (id, value) in parameters.into_iter().enumerate() {
        assert!(plan.set_parameter(2, if id == 6 { 8 } else { id as u32 }, value));
    }
    let mut result = Vec::with_capacity(frames * 8);
    for offset in (0..frames).step_by(block) {
        let count = block.min(frames - offset);
        let silence = vec![0.0; count];
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        let mut timed = Vec::new();
        for &(frame, id, value) in events.iter().filter(|event| event.0 == offset) {
            debug_assert_eq!(frame, offset);
            if id == 9 {
                timed.push(TimedEvent {
                    offset: 0,
                    node: 2,
                    kind: EventKind::NoteOn {
                        channel: 0,
                        note: value as u8,
                        velocity: 100,
                    },
                });
            } else {
                assert!(plan.set_parameter(2, id, value));
            }
        }
        plan.process_with_events([&silence, &silence], [&mut left, &mut right], &timed)
            .map_err(|error| format!("sample event rejected: {error:?}"))?;
        for (left, right) in left.into_iter().zip(right) {
            result.extend_from_slice(&left.to_le_bytes());
            result.extend_from_slice(&right.to_le_bytes());
        }
    }
    std::fs::File::create(&args[2])?.write_all(&result)?;
    Ok(())
}
