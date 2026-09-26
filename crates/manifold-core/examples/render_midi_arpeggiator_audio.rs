//! Independent native render of the clocked Arp kernel into VoiceSynth.
use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use manifold_core::midi_arpeggiator::MidiArpeggiator;
use manifold_core::midi_note_router::MAX_OUTPUT_EVENTS;
use std::{env, fs};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let path = args
        .get(1)
        .expect("usage: render_midi_arpeggiator_audio OUTPUT.f32 MODE OCTAVES GATE HOLD SCENARIO");
    let mode: f32 = args.get(2).map_or(Ok(0.0), |value| value.parse())?;
    let octaves: f32 = args.get(3).map_or(Ok(1.0), |value| value.parse())?;
    let gate: f32 = args.get(4).map_or(Ok(0.6), |value| value.parse())?;
    let hold: f32 = args.get(5).map_or(Ok(0.0), |value| value.parse())?;
    let held = args.get(6).is_some_and(|value| value == "held");
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
    let mut plan = description.compile(48_000.0, 128)?;
    for (id, value) in [0.0, 0.005, 0.02, 0.55, 0.03, 0.25].into_iter().enumerate() {
        assert!(plan.set_parameter(1, id as u32, value));
    }
    let mut arp = MidiArpeggiator::new(48_000.0, 8.0, mode);
    let mut emitted = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
    assert_eq!(arp.set_parameter(2, octaves, 0, &mut emitted), Some(0));
    assert_eq!(arp.set_parameter(3, gate, 0, &mut emitted), Some(0));
    assert_eq!(arp.set_parameter(4, hold, 0, &mut emitted), Some(0));
    let silence = [0.0; 128];
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    let mut bytes = Vec::with_capacity(32_768 * 2 * 4);
    for block_start in (0..32_768).step_by(128) {
        let mut events = Vec::new();
        for frame in block_start..block_start + 128 {
            let input = match frame {
                0 => Some(EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 90,
                }),
                512 => Some(EventKind::NoteOn {
                    channel: 0,
                    note: 64,
                    velocity: 100,
                }),
                2000 if held => Some(EventKind::NoteOff {
                    channel: 0,
                    note: 60,
                }),
                2300 if held => Some(EventKind::NoteOff {
                    channel: 0,
                    note: 64,
                }),
                9500 if !held => Some(EventKind::AllNotesOff),
                _ => None,
            };
            if let Some(input) = input {
                let count = arp.handle(input, frame as u64, &mut emitted);
                for &kind in &emitted[..count] {
                    events.push(TimedEvent {
                        offset: frame - block_start,
                        node: 1,
                        kind,
                    });
                }
            }
            if arp
                .next_deadline()
                .is_some_and(|deadline| deadline <= frame as u64)
            {
                let count = arp.fire_due(frame as u64, &mut emitted);
                for &kind in &emitted[..count] {
                    events.push(TimedEvent {
                        offset: frame - block_start,
                        node: 1,
                        kind,
                    });
                }
            }
        }
        plan.process_with_events([&silence, &silence], [&mut left, &mut right], &events)
            .map_err(|error| format!("{error:?}"))?;
        for frame in 0..128 {
            bytes.extend_from_slice(&left[frame].to_le_bytes());
            bytes.extend_from_slice(&right[frame].to_le_bytes());
        }
    }
    fs::write(path, bytes)?;
    Ok(())
}
