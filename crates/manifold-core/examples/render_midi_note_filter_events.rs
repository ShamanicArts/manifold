//! Compare event gate behavior with the old Note Filter rack and exported adapter.
use manifold_core::events::EventKind;
use manifold_core::midi_note_filter::MidiNoteFilter;
use manifold_core::midi_note_router::MAX_OUTPUT_EVENTS;

fn main() {
    let mut effect = MidiNoteFilter::new(36.0, 96.0, 0.0);
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
    emit(
        effect.handle(
            EventKind::NoteOn {
                channel: 0,
                note: 20,
                velocity: 90,
            },
            &mut out,
        ),
        &out,
    );
    emit(
        effect.handle(
            EventKind::NoteOff {
                channel: 0,
                note: 20,
            },
            &mut out,
        ),
        &out,
    );
    emit(
        effect.handle(
            EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
            &mut out,
        ),
        &out,
    );
    emit(effect.set_parameter(2, 1.0, &mut out).unwrap(), &out);
    emit(
        effect.handle(
            EventKind::NoteOff {
                channel: 0,
                note: 60,
            },
            &mut out,
        ),
        &out,
    );
}
