//! Event form of the old Main rack Note Filter voice gate.

use crate::events::EventKind;
use crate::midi_note_router::{MAX_OUTPUT_EVENTS, MidiNoteRouter};

pub struct MidiNoteFilter {
    low: u8,
    high: u8,
    outside: bool,
    router: MidiNoteRouter,
}

impl MidiNoteFilter {
    pub fn new(low: f32, high: f32, mode: f32) -> Self {
        Self {
            low: round_note(low),
            high: round_note(high),
            outside: mode >= 0.5,
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
            0 => self.low = round_note(value),
            1 => self.high = round_note(value),
            2 => self.outside = value.clamp(0.0, 1.0) >= 0.5,
            _ => return None,
        }
        let (low, high, outside) = (
            self.low.min(self.high),
            self.low.max(self.high),
            self.outside,
        );
        Some(self.router.remap(
            |note| {
                let inside = note >= low && note <= high;
                (inside != outside).then_some(note)
            },
            out,
        ))
    }

    pub fn handle(&mut self, event: EventKind, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        let (low, high, outside) = (
            self.low.min(self.high),
            self.low.max(self.high),
            self.outside,
        );
        self.router.handle(
            event,
            |note| {
                let inside = note >= low && note <= high;
                (inside != outside).then_some(note)
            },
            out,
        )
    }
}

fn round_note(value: f32) -> u8 {
    (value.clamp(0.0, 127.0) + 0.5).floor() as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocked_notes_remain_owned_and_can_sound_after_range_change() {
        let mut filter = MidiNoteFilter::new(36.0, 96.0, 0.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(
            filter.handle(
                EventKind::NoteOn {
                    channel: 2,
                    note: 20,
                    velocity: 92
                },
                &mut out
            ),
            0
        );
        assert_eq!(filter.set_parameter(0, 20.0, &mut out), Some(1));
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 2,
                note: 20,
                velocity: 92
            }
        );
        assert_eq!(
            filter.handle(
                EventKind::NoteOff {
                    channel: 2,
                    note: 20
                },
                &mut out
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOff {
                channel: 2,
                note: 20
            }
        );
    }

    #[test]
    fn crossing_the_range_releases_before_restarting_held_notes() {
        let mut filter = MidiNoteFilter::new(36.0, 96.0, 0.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        filter.handle(
            EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
            &mut out,
        );
        filter.handle(
            EventKind::NoteOn {
                channel: 1,
                note: 110,
                velocity: 80,
            },
            &mut out,
        );
        assert_eq!(filter.set_parameter(2, 1.0, &mut out), Some(2));
        assert_eq!(
            out[..2],
            [
                EventKind::NoteOff {
                    channel: 0,
                    note: 60
                },
                EventKind::NoteOn {
                    channel: 1,
                    note: 110,
                    velocity: 80
                },
            ]
        );
        assert_eq!(
            filter.handle(
                EventKind::NoteOff {
                    channel: 0,
                    note: 60
                },
                &mut out
            ),
            0
        );
        assert_eq!(
            filter.handle(
                EventKind::NoteOff {
                    channel: 1,
                    note: 110
                },
                &mut out
            ),
            1
        );
    }
}
