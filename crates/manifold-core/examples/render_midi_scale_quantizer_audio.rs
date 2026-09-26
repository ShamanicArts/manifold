//! Native audio reference for the Main rack Scale Quantizer semantics.
use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use manifold_core::midi_note_router::MAX_OUTPUT_EVENTS;
use manifold_core::midi_scale_quantizer::MidiScaleQuantizer;
use std::{env, fs};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = env::args()
        .nth(1)
        .expect("usage: render_midi_scale_quantizer_audio OUTPUT.f32");
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
    let mut filter = MidiScaleQuantizer::new(0.0, 1.0, 1.0);
    let mut emitted = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
    let mut bytes = Vec::with_capacity(8192 * 2 * 4);
    let silence = [0.0; 128];
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    for offset in (0..8192).step_by(128) {
        let mut events = Vec::new();
        let count = match offset {
            128 => filter.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note: 61,
                    velocity: 90,
                },
                &mut emitted,
            ),
            512 => filter.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note: 64,
                    velocity: 100,
                },
                &mut emitted,
            ),
            2048 => filter.set_parameter(2, 2.0, &mut emitted).unwrap(),
            4096 => filter.handle(
                EventKind::NoteOff {
                    channel: 0,
                    note: 61,
                },
                &mut emitted,
            ),
            6144 => filter.handle(
                EventKind::NoteOff {
                    channel: 0,
                    note: 64,
                },
                &mut emitted,
            ),
            _ => 0,
        };
        for kind in emitted.iter().take(count) {
            events.push(TimedEvent {
                offset: 0,
                node: 1,
                kind: *kind,
            });
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
