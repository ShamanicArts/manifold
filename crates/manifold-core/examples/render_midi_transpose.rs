//! Match tools/legacy-midi-transpose.lua without loading Lua in v2.
use manifold_core::events::EventKind;
use manifold_core::midi_transpose::{MAX_OUTPUT_EVENTS, MidiTranspose};

fn main() {
    let mut effect = MidiTranspose::new();
    let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
    let emit = |count: usize, out: &[EventKind; MAX_OUTPUT_EVENTS]| {
        for event in &out[..count] {
            match *event {
                EventKind::NoteOn {
                    channel,
                    note,
                    velocity,
                } => println!("on,{channel},{note},{velocity}"),
                EventKind::NoteOff { channel, note } => println!("off,{channel},{note}"),
                EventKind::PitchBend { channel, value } => println!("bend,{channel},{value}"),
                EventKind::AllNotesOff => {}
            }
        }
    };
    emit(effect.set_semitones(7.0, &mut out), &out);
    emit(
        effect.handle(
            EventKind::NoteOn {
                channel: 2,
                note: 60,
                velocity: 96,
            },
            &mut out,
        ),
        &out,
    );
    emit(effect.set_semitones(-12.0, &mut out), &out);
    emit(
        effect.handle(
            EventKind::NoteOff {
                channel: 2,
                note: 60,
            },
            &mut out,
        ),
        &out,
    );
    emit(effect.set_semitones(24.0, &mut out), &out);
    emit(
        effect.handle(
            EventKind::NoteOn {
                channel: 0,
                note: 120,
                velocity: 100,
            },
            &mut out,
        ),
        &out,
    );
    emit(
        effect.handle(
            EventKind::NoteOff {
                channel: 0,
                note: 120,
            },
            &mut out,
        ),
        &out,
    );
    emit(effect.set_semitones(0.0, &mut out), &out);
    for note in 60..=68 {
        emit(
            effect.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note,
                    velocity: 100,
                },
                &mut out,
            ),
            &out,
        );
    }
    emit(effect.handle(EventKind::AllNotesOff, &mut out), &out);
    emit(
        effect.handle(
            EventKind::PitchBend {
                channel: 0,
                value: 8192,
            },
            &mut out,
        ),
        &out,
    );
}
