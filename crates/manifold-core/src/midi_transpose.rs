//! Fixed-capacity MIDI note transposition from the old Standalone Transpose export.
//! Produces MIDI events; it does not synthesize audio or allocate in the event path.

use crate::events::EventKind;
pub use crate::midi_note_router::MAX_OUTPUT_EVENTS;
use crate::midi_note_router::MidiNoteRouter;

pub struct MidiTranspose {
    semitones: i8,
    router: MidiNoteRouter,
}

impl Default for MidiTranspose {
    fn default() -> Self {
        Self::new()
    }
}

impl MidiTranspose {
    pub fn new() -> Self {
        Self {
            semitones: 0,
            router: MidiNoteRouter::new(),
        }
    }

    pub fn semitones(&self) -> i8 {
        self.semitones
    }

    pub fn reset(&mut self) {
        self.router.reset();
    }

    /// Match the legacy floor(value + 0.5) rounding and remap held notes.
    pub fn set_semitones(&mut self, value: f32, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        if !value.is_finite() {
            return 0;
        }
        self.semitones = (value.clamp(-24.0, 24.0) + 0.5).floor() as i8;
        let semitones = self.semitones;
        self.router.remap(
            |note| Some((i16::from(note) + i16::from(semitones)).clamp(0, 127) as u8),
            out,
        )
    }

    pub fn handle(&mut self, event: EventKind, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        let semitones = self.semitones;
        self.router.handle(
            event,
            |note| Some((i16::from(note) + i16::from(semitones)).clamp(0, 127) as u8),
            out,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reset_forgets_held_note_but_retains_transposition() {
        let mut effect = MidiTranspose::new();
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(effect.set_semitones(7.0, &mut out), 0);
        let on = EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        };
        assert_eq!(effect.handle(on, &mut out), 1);
        effect.reset();
        assert_eq!(
            effect.handle(
                EventKind::NoteOff {
                    channel: 0,
                    note: 60
                },
                &mut out
            ),
            0
        );
        assert_eq!(effect.handle(on, &mut out), 1);
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 0,
                note: 67,
                velocity: 100
            }
        );
    }

    #[test]
    fn held_note_remaps_and_releases_original_key() {
        let mut effect = MidiTranspose::new();
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(effect.set_semitones(7.0, &mut out), 0);
        assert_eq!(
            effect.handle(
                EventKind::NoteOn {
                    channel: 2,
                    note: 60,
                    velocity: 96
                },
                &mut out
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 2,
                note: 67,
                velocity: 96
            }
        );
        assert_eq!(effect.set_semitones(-12.0, &mut out), 2);
        assert_eq!(
            out[..2],
            [
                EventKind::NoteOff {
                    channel: 2,
                    note: 67
                },
                EventKind::NoteOn {
                    channel: 2,
                    note: 48,
                    velocity: 96
                }
            ]
        );
        assert_eq!(
            effect.handle(
                EventKind::NoteOff {
                    channel: 2,
                    note: 60
                },
                &mut out
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOff {
                channel: 2,
                note: 48
            }
        );
    }

    #[test]
    fn oldest_voice_is_released_before_ninth_note() {
        let mut effect = MidiTranspose::new();
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        for note in 60..68 {
            assert_eq!(
                effect.handle(
                    EventKind::NoteOn {
                        channel: 0,
                        note,
                        velocity: 100
                    },
                    &mut out
                ),
                1
            );
        }
        assert_eq!(
            effect.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note: 68,
                    velocity: 90
                },
                &mut out
            ),
            2
        );
        assert_eq!(
            out[..2],
            [
                EventKind::NoteOff {
                    channel: 0,
                    note: 60
                },
                EventKind::NoteOn {
                    channel: 0,
                    note: 68,
                    velocity: 90
                }
            ]
        );
        assert_eq!(
            effect.handle(
                EventKind::NoteOff {
                    channel: 0,
                    note: 60
                },
                &mut out
            ),
            0
        );
    }

    #[test]
    fn clamps_output_and_passes_pitch_bend() {
        let mut effect = MidiTranspose::new();
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        effect.set_semitones(24.0, &mut out);
        effect.handle(
            EventKind::NoteOn {
                channel: 15,
                note: 120,
                velocity: 100,
            },
            &mut out,
        );
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 15,
                note: 127,
                velocity: 100
            }
        );
        let bend = EventKind::PitchBend {
            channel: 15,
            value: 8192,
        };
        assert_eq!(effect.handle(bend, &mut out), 1);
        assert_eq!(out[0], bend);
    }
}
