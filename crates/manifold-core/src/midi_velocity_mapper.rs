//! Event form of the old rack's amplitude curve, applied to MIDI velocity.

use crate::events::EventKind;
use crate::midi_note_router::{MAX_OUTPUT_EVENTS, MidiNoteRouter};

pub struct MidiVelocityMapper {
    amount: f32,
    curve: u8,
    offset: f32,
    router: MidiNoteRouter,
}

impl MidiVelocityMapper {
    pub fn new(amount: f32, curve: f32, offset: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            curve: (curve.clamp(0.0, 2.0) + 0.5).floor() as u8,
            offset: offset.clamp(-1.0, 1.0),
            router: MidiNoteRouter::new(),
        }
    }

    pub fn set_parameter(
        &mut self,
        id: u32,
        value: f32,
        out: &mut [EventKind; MAX_OUTPUT_EVENTS],
    ) -> Option<usize> {
        if !value.is_finite() {
            return None;
        }
        match id {
            0 => self.amount = value.clamp(0.0, 1.0),
            1 => self.curve = (value.clamp(0.0, 2.0) + 0.5).floor() as u8,
            2 => self.offset = value.clamp(-1.0, 1.0),
            _ => return None,
        }
        let (amount, curve, offset) = (self.amount, self.curve, self.offset);
        Some(self.router.remap_mapped(
            |note, velocity| mapped_note(note, velocity, amount, curve, offset),
            out,
        ))
    }

    pub fn handle(&mut self, event: EventKind, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        let (amount, curve, offset) = (self.amount, self.curve, self.offset);
        self.router.handle_mapped(
            event,
            |note, velocity| mapped_note(note, velocity, amount, curve, offset),
            out,
        )
    }
}

fn mapped_note(note: u8, velocity: u8, amount: f32, curve: u8, offset: f32) -> Option<(u8, u8)> {
    let normalized = f32::from(velocity) / 127.0;
    let shaped = match curve {
        1 => normalized * normalized * (3.0 - 2.0 * normalized),
        2 => normalized * normalized,
        _ => normalized,
    };
    let mapped = if amount <= 0.0 {
        normalized
    } else {
        (normalized * (1.0 - amount) + shaped * amount + offset * amount).clamp(0.0, 1.0)
    };
    let output_velocity = (mapped * 127.0 + 0.5).floor() as u8;
    (output_velocity > 0).then_some((note, output_velocity))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hard_curve_remaps_velocity_and_held_notes() {
        let mut effect = MidiVelocityMapper::new(1.0, 2.0, 0.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(
            effect.handle(
                EventKind::NoteOn {
                    channel: 2,
                    note: 64,
                    velocity: 64
                },
                &mut out
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 2,
                note: 64,
                velocity: 32
            }
        );
        assert_eq!(effect.set_parameter(2, 0.5, &mut out), Some(2));
        assert_eq!(
            out[..2],
            [
                EventKind::NoteOff {
                    channel: 2,
                    note: 64
                },
                EventKind::NoteOn {
                    channel: 2,
                    note: 64,
                    velocity: 96
                }
            ]
        );
        assert_eq!(
            effect.handle(
                EventKind::NoteOff {
                    channel: 2,
                    note: 64
                },
                &mut out
            ),
            1
        );
    }

    #[test]
    fn zero_output_is_silent_but_held_input_can_restart() {
        let mut effect = MidiVelocityMapper::new(1.0, 0.0, -1.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(
            effect.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 100
                },
                &mut out
            ),
            0
        );
        assert_eq!(effect.set_parameter(2, 0.0, &mut out), Some(1));
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100
            }
        );
    }

    #[test]
    fn curve_change_restarts_a_held_key_with_mapped_velocity() {
        let mut effect = MidiVelocityMapper::new(1.0, 0.0, 0.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(
            effect.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note: 64,
                    velocity: 64,
                },
                &mut out,
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 0,
                note: 64,
                velocity: 64,
            }
        );
        assert_eq!(effect.set_parameter(1, 2.0, &mut out), Some(2));
        assert_eq!(
            out[..2],
            [
                EventKind::NoteOff {
                    channel: 0,
                    note: 64,
                },
                EventKind::NoteOn {
                    channel: 0,
                    note: 64,
                    velocity: 32,
                }
            ]
        );
        assert_eq!(
            effect.handle(
                EventKind::NoteOff {
                    channel: 0,
                    note: 64,
                },
                &mut out,
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOff {
                channel: 0,
                note: 64,
            }
        );
    }
}
