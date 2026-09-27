//! Main rack Scale Quantizer event transform, using the legacy scale tables.

use crate::events::EventKind;
use crate::midi_note_router::{MAX_OUTPUT_EVENTS, MidiNoteRouter};

const MAJOR: &[i16] = &[0, 2, 4, 5, 7, 9, 11];
const MINOR: &[i16] = &[0, 2, 3, 5, 7, 8, 10];
const DORIAN: &[i16] = &[0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN: &[i16] = &[0, 2, 4, 5, 7, 9, 10];
const PENTATONIC: &[i16] = &[0, 2, 4, 7, 9];

pub struct MidiScaleQuantizer {
    root: u8,
    scale: u8,
    direction: u8,
    router: MidiNoteRouter,
}

impl MidiScaleQuantizer {
    pub fn reset(&mut self) {
        self.router.reset();
    }
    pub fn new(root: f32, scale: f32, direction: f32) -> Self {
        Self {
            root: rounded(root, 0.0, 11.0),
            scale: rounded(scale, 1.0, 6.0),
            direction: rounded(direction, 1.0, 3.0),
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
            0 => self.root = rounded(value, 0.0, 11.0),
            1 => self.scale = rounded(value, 1.0, 6.0),
            2 => self.direction = rounded(value, 1.0, 3.0),
            _ => return None,
        }
        let (root, scale, direction) = (self.root, self.scale, self.direction);
        Some(
            self.router
                .remap(|note| Some(quantize(note, root, scale, direction)), out),
        )
    }

    pub fn handle(&mut self, event: EventKind, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        let (root, scale, direction) = (self.root, self.scale, self.direction);
        self.router.handle(
            event,
            |note| Some(quantize(note, root, scale, direction)),
            out,
        )
    }
}

fn rounded(value: f32, lo: f32, hi: f32) -> u8 {
    (value.clamp(lo, hi) + 0.5).floor() as u8
}

fn quantize(note: u8, root: u8, scale: u8, direction: u8) -> u8 {
    let intervals = match scale {
        1 => MAJOR,
        2 => MINOR,
        3 => DORIAN,
        4 => MIXOLYDIAN,
        5 => PENTATONIC,
        _ => return note,
    };
    let normalized = i16::from(note) - i16::from(root);
    let octave = normalized.div_euclid(12);
    let pc = normalized.rem_euclid(12);
    let mut closest = 0;
    let mut closest_distance = i16::MAX;
    let mut lower = None;
    let mut higher = None;
    for &interval in intervals {
        let degree_note = octave * 12 + interval;
        let distance = (pc - interval).abs();
        if distance < closest_distance {
            closest_distance = distance;
            closest = degree_note;
        }
        if interval <= pc {
            lower = Some(degree_note);
        }
        if interval >= pc && higher.is_none() {
            higher = Some(degree_note);
        }
    }
    let lower = lower.unwrap_or((octave - 1) * 12 + intervals[intervals.len() - 1]);
    let higher = higher.unwrap_or((octave + 1) * 12 + intervals[0]);
    let result = match direction {
        2 => higher,
        3 => lower,
        _ => closest,
    };
    (i16::from(root) + result).clamp(0, 127) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn major_c_sharp_nearest_up_and_down_match_old_rack() {
        let mut effect = MidiScaleQuantizer::new(0.0, 1.0, 1.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(
            effect.handle(
                EventKind::NoteOn {
                    channel: 1,
                    note: 61,
                    velocity: 90
                },
                &mut out
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 1,
                note: 60,
                velocity: 90
            }
        );
        assert_eq!(effect.set_parameter(2, 2.0, &mut out), Some(2));
        assert_eq!(
            out[..2],
            [
                EventKind::NoteOff {
                    channel: 1,
                    note: 60
                },
                EventKind::NoteOn {
                    channel: 1,
                    note: 62,
                    velocity: 90
                }
            ]
        );
        assert_eq!(effect.set_parameter(2, 3.0, &mut out), Some(2));
        assert_eq!(
            out[1],
            EventKind::NoteOn {
                channel: 1,
                note: 60,
                velocity: 90
            }
        );
        assert_eq!(
            effect.handle(
                EventKind::NoteOff {
                    channel: 1,
                    note: 61
                },
                &mut out
            ),
            1
        );
        assert_eq!(
            out[0],
            EventKind::NoteOff {
                channel: 1,
                note: 60
            }
        );
    }

    #[test]
    fn chromatic_passes_and_legacy_nearest_stays_within_current_octave() {
        let mut effect = MidiScaleQuantizer::new(0.0, 6.0, 1.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        effect.handle(
            EventKind::NoteOn {
                channel: 0,
                note: 71,
                velocity: 100,
            },
            &mut out,
        );
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 0,
                note: 71,
                velocity: 100
            }
        );
        assert_eq!(effect.set_parameter(1, 2.0, &mut out), Some(2));
        assert_eq!(
            out[1],
            EventKind::NoteOn {
                channel: 0,
                note: 70,
                velocity: 100
            }
        );
    }
}
