//! Native reference for eight note voices sharing one decoded sample.
use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 10 {
        return Err("usage: render_sample_instrument SAMPLE OUTPUT SOURCE_RATE OUTPUT_RATE BLOCK FRAMES PARAMETERS EVENTS CHANGES".into());
    }
    let raw = std::fs::read(&args[1])?;
    if raw.len() % 8 != 0 {
        return Err("invalid stereo sample".into());
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
    if parameters.len() != 14 {
        return Err("expected fourteen sample parameters".into());
    }
    let events: Vec<(usize, u32, u8, u8, u8)> = args[8]
        .split(',')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut parts = part.split(':');
            Ok((
                parts.next().ok_or("event frame")?.parse()?,
                parts.next().ok_or("event kind")?.parse()?,
                parts.next().ok_or("event channel")?.parse()?,
                parts.next().ok_or("event note")?.parse()?,
                parts.next().ok_or("event velocity")?.parse()?,
            ))
        })
        .collect::<Result<_, Box<dyn std::error::Error>>>()?;
    let changes: Vec<(usize, u32, f32)> = args[9]
        .split(',')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut parts = part.split(':');
            Ok((
                parts.next().ok_or("change frame")?.parse()?,
                parts.next().ok_or("change id")?.parse()?,
                parts.next().ok_or("change value")?.parse()?,
            ))
        })
        .collect::<Result<_, Box<dyn std::error::Error>>>()?;
    let mut plan = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 2,
                kind: NodeKind::SampleInstrument,
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
        assert!(plan.set_parameter(2, id as u32, value));
    }
    let mut result = Vec::with_capacity(frames * 8);
    for offset in (0..frames).step_by(block) {
        let count = block.min(frames - offset);
        for &(_, id, value) in changes.iter().filter(|change| change.0 == offset) {
            assert!(plan.set_parameter(2, id, value));
        }
        let timed: Vec<TimedEvent> = events
            .iter()
            .filter(|event| event.0 >= offset && event.0 < offset + count)
            .map(|&(frame, kind, channel, note, velocity)| TimedEvent {
                offset: frame - offset,
                node: 2,
                kind: match kind {
                    0 => EventKind::NoteOn {
                        channel,
                        note,
                        velocity,
                    },
                    1 => EventKind::NoteOff { channel, note },
                    2 => EventKind::AllNotesOff,
                    3 => EventKind::PitchBend {
                        channel,
                        value: ((velocity as u16) << 7) | note as u16,
                    },
                    _ => panic!("invalid event kind"),
                },
            })
            .collect();
        let silence = vec![0.0; count];
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
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
