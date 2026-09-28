//! Test probe: render a browser Main session through the native adapter.

use std::io::{Read, Write};

use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::main_instrument::{MAIN_MIDI_TARGET, MainAudioBlock};
use manifold_native::main_session::prepare_main_session;

fn main() {
    let mut bytes = Vec::new();
    std::io::stdin().read_to_end(&mut bytes).unwrap();
    let mut host = prepare_main_session(&bytes, 48_000.0, 128).unwrap();
    let mut output = std::io::stdout().lock();
    for block in 0..8 {
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let event = if block == 0 {
            Some(TimedEvent {
                offset: 0,
                node: MAIN_MIDI_TARGET,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 100,
                },
            })
        } else if block == 6 {
            Some(TimedEvent {
                offset: 0,
                node: MAIN_MIDI_TARGET,
                kind: EventKind::NoteOff {
                    channel: 0,
                    note: 60,
                },
            })
        } else {
            None
        };
        host.process(MainAudioBlock {
            input: None,
            output: [&mut left, &mut right],
            events: event.as_ref().map_or(&[], std::slice::from_ref),
        })
        .unwrap();
        for (&l, &r) in left.iter().zip(right.iter()) {
            output.write_all(&l.to_le_bytes()).unwrap();
            output.write_all(&r.to_le_bytes()).unwrap();
        }
    }
}
