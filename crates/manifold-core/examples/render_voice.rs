use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use std::{env, fs, process};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() < 11 || (args.len() - 11) % 5 != 0 {
        eprintln!(
            "usage: render_voice OUTPUT SAMPLE_RATE FRAMES BLOCK WAVEFORM ATTACK DECAY SUSTAIN RELEASE LEVEL [FRAME KIND CHANNEL NOTE VELOCITY]..."
        );
        process::exit(2);
    }
    let sample_rate: f32 = args[2].parse()?;
    let frames: usize = args[3].parse()?;
    let block: usize = args[4].parse()?;
    if frames == 0 || block == 0 {
        process::exit(2);
    }
    let parameters: Vec<f32> = args[5..=10]
        .iter()
        .map(|value| value.parse())
        .collect::<Result<_, _>>()?;
    let mut events = Vec::new();
    for event in args[11..].chunks_exact(5) {
        let frame: usize = event[0].parse()?;
        let kind: u32 = event[1].parse()?;
        let channel: u8 = event[2].parse()?;
        let note: u8 = event[3].parse()?;
        let velocity: u8 = event[4].parse()?;
        if frame >= frames {
            process::exit(2);
        }
        let kind = match kind {
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
            _ => process::exit(2),
        };
        events.push(TimedEvent {
            offset: frame,
            node: 1,
            kind,
        });
    }
    events.sort_by_key(|event| event.offset);
    let description = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::VoiceSynth,
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
    let mut plan = description.compile(sample_rate, block)?;
    for (id, value) in parameters.into_iter().enumerate() {
        if !plan.set_parameter(1, id as u32, value) {
            process::exit(2);
        }
    }
    let mut output = vec![0.0f32; frames * 2];
    for start in (0..frames).step_by(block) {
        let count = block.min(frames - start);
        let silence = vec![0.0f32; count];
        let block_events: Vec<TimedEvent> = events
            .iter()
            .filter(|event| event.offset >= start && event.offset < start + count)
            .map(|event| TimedEvent {
                offset: event.offset - start,
                ..*event
            })
            .collect();
        let mut left = vec![0.0f32; count];
        let mut right = vec![0.0f32; count];
        plan.process_with_events([&silence, &silence], [&mut left, &mut right], &block_events)
            .map_err(|error| format!("{error:?}"))?;
        for frame in 0..count {
            output[(start + frame) * 2] = left[frame];
            output[(start + frame) * 2 + 1] = right[frame];
        }
    }
    let mut encoded = Vec::with_capacity(output.len() * 4);
    for sample in output {
        encoded.extend_from_slice(&sample.to_le_bytes());
    }
    fs::write(&args[1], encoded)?;
    Ok(())
}
