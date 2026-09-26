//! Fixed-capacity, sample-clocked MIDI arpeggiator based on the Main rack behavior.

use crate::events::EventKind;
use crate::midi_note_router::{MAX_OUTPUT_EVENTS, VOICES};

const MAX_SEQUENCE: usize = VOICES * 4;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct Note {
    active: bool,
    channel: u8,
    pitch: u8,
    velocity: u8,
    stamp: u64,
}

#[derive(Clone, Copy, Debug, Default)]
struct Lane {
    active: bool,
    channel: u8,
    pitch: u8,
    close_at: u64,
}

pub struct MidiArpeggiator {
    sample_rate: f64,
    rate: f32,
    mode: u8,
    octaves: u8,
    gate: f32,
    hold: bool,
    pressed: [Note; VOICES],
    latched: [Note; VOICES],
    sequence: [Note; MAX_SEQUENCE],
    sequence_len: usize,
    lanes: [Lane; VOICES],
    next_lane: usize,
    step_index: usize,
    direction: i8,
    next_step: Option<f64>,
    capture_pending: bool,
    stamp: u64,
    random_state: u64,
}

impl MidiArpeggiator {
    pub fn new(sample_rate: f32, rate: f32, mode: f32) -> Self {
        Self {
            sample_rate: f64::from(sample_rate),
            rate: rate.clamp(0.25, 20.0),
            mode: discrete(mode, 0.0, 3.0),
            octaves: 1,
            gate: 0.6,
            hold: false,
            pressed: [Note::default(); VOICES],
            latched: [Note::default(); VOICES],
            sequence: [Note::default(); MAX_SEQUENCE],
            sequence_len: 0,
            lanes: [Lane::default(); VOICES],
            next_lane: 0,
            step_index: 0,
            direction: 1,
            next_step: None,
            capture_pending: false,
            stamp: 0,
            random_state: 0x9e37_79b9_7f4a_7c15,
        }
    }

    pub fn set_parameter(
        &mut self,
        id: u32,
        value: f32,
        now: u64,
        out: &mut [EventKind; MAX_OUTPUT_EVENTS],
    ) -> Option<usize> {
        if !value.is_finite() {
            return None;
        }
        match id {
            0 => self.rate = value.clamp(0.25, 20.0),
            1 => self.mode = discrete(value, 0.0, 3.0),
            2 => self.octaves = discrete(value, 1.0, 4.0),
            3 => self.gate = value.clamp(0.05, 1.0),
            4 => {
                let hold = value.clamp(0.0, 1.0) > 0.5;
                if hold && !self.hold {
                    self.latched = self.pressed;
                }
                self.hold = hold;
                if !self.hold {
                    self.latched.fill(Note::default());
                }
            }
            _ => return None,
        }
        Some(self.refresh_sequence(now, out))
    }

    pub fn handle(
        &mut self,
        event: EventKind,
        now: u64,
        out: &mut [EventKind; MAX_OUTPUT_EVENTS],
    ) -> usize {
        match event {
            EventKind::NoteOn {
                channel,
                note,
                velocity: 0,
            }
            | EventKind::NoteOff { channel, note } => {
                if let Some(slot) = self
                    .pressed
                    .iter_mut()
                    .find(|slot| slot.active && slot.channel == channel && slot.pitch == note)
                {
                    slot.active = false;
                }
                self.refresh_sequence(now, out)
            }
            EventKind::NoteOn {
                channel,
                note,
                velocity,
            } => {
                self.stamp = self.stamp.wrapping_add(1);
                let entry = Note {
                    active: true,
                    channel,
                    pitch: note,
                    velocity,
                    stamp: self.stamp,
                };
                insert_note(&mut self.pressed, entry);
                if self.hold {
                    insert_note(&mut self.latched, entry);
                }
                self.refresh_sequence(now, out)
            }
            EventKind::AllNotesOff => {
                self.pressed.fill(Note::default());
                self.latched.fill(Note::default());
                self.refresh_sequence(now, out)
            }
            EventKind::PitchBend { .. } => {
                out[0] = event;
                1
            }
        }
    }

    pub fn next_deadline(&self) -> Option<u64> {
        let step = self.next_step.map(|time| time.ceil() as u64);
        self.lanes
            .iter()
            .filter(|lane| lane.active)
            .map(|lane| lane.close_at)
            .chain(step)
            .min()
    }

    pub fn fire_due(&mut self, now: u64, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        let mut count = 0;
        for lane in &mut self.lanes {
            if lane.active && lane.close_at <= now {
                out[count] = EventKind::NoteOff {
                    channel: lane.channel,
                    note: lane.pitch,
                };
                lane.active = false;
                count += 1;
            }
        }
        if self.next_step.is_some_and(|time| time.ceil() as u64 <= now) && self.sequence_len > 0 {
            self.capture_pending = false;
            let entry = self.choose_step();
            let lane_index = (0..VOICES)
                .map(|offset| (self.next_lane + offset) % VOICES)
                .find(|&index| !self.lanes[index].active)
                .unwrap_or(self.next_lane);
            let lane = &mut self.lanes[lane_index];
            if lane.active {
                out[count] = EventKind::NoteOff {
                    channel: lane.channel,
                    note: lane.pitch,
                };
                count += 1;
            }
            let period = self.sample_rate / f64::from(self.rate);
            let gate_frames = (period * f64::from(self.gate)).round().max(1.0) as u64;
            *lane = Lane {
                active: true,
                channel: entry.channel,
                pitch: entry.pitch,
                close_at: now.saturating_add(gate_frames),
            };
            out[count] = EventKind::NoteOn {
                channel: entry.channel,
                note: entry.pitch,
                velocity: entry.velocity,
            };
            count += 1;
            self.next_lane = (lane_index + 1) % VOICES;
            self.next_step = self.next_step.map(|time| time + period);
        }
        count
    }

    fn choose_step(&mut self) -> Note {
        let len = self.sequence_len;
        let index = match self.mode {
            1 => {
                let index = len - 1 - self.step_index;
                self.step_index = (self.step_index + 1) % len;
                index
            }
            2 => {
                let index = self.step_index;
                if len > 1 {
                    if self.direction > 0 && self.step_index + 1 == len {
                        self.direction = -1;
                    } else if self.direction < 0 && self.step_index == 0 {
                        self.direction = 1;
                    }
                    self.step_index = self
                        .step_index
                        .wrapping_add_signed(isize::from(self.direction));
                }
                index
            }
            3 => {
                self.random_state ^= self.random_state << 13;
                self.random_state ^= self.random_state >> 7;
                self.random_state ^= self.random_state << 17;
                (self.random_state as usize) % len
            }
            _ => {
                let index = self.step_index;
                self.step_index = (self.step_index + 1) % len;
                index
            }
        };
        self.sequence[index]
    }

    fn refresh_sequence(&mut self, now: u64, out: &mut [EventKind; MAX_OUTPUT_EVENTS]) -> usize {
        let source = if self.hold {
            &self.latched
        } else {
            &self.pressed
        };
        let mut base = [Note::default(); VOICES];
        let mut len = 0;
        for &entry in source.iter().filter(|entry| entry.active) {
            if let Some(existing) = base[..len]
                .iter_mut()
                .find(|note| note.pitch == entry.pitch)
            {
                if entry.stamp > existing.stamp {
                    *existing = entry;
                }
            } else {
                base[len] = entry;
                len += 1;
            }
        }
        base[..len].sort_unstable_by_key(|note| (note.pitch, note.stamp));
        let mut expanded = [Note::default(); MAX_SEQUENCE];
        let mut expanded_len = 0;
        for octave in 0..self.octaves {
            for &entry in &base[..len] {
                expanded[expanded_len] = Note {
                    pitch: entry.pitch.saturating_add(octave * 12).min(127),
                    ..entry
                };
                expanded_len += 1;
            }
        }
        if expanded_len == self.sequence_len
            && expanded[..expanded_len] == self.sequence[..self.sequence_len]
        {
            return 0;
        }
        let was_empty = self.sequence_len == 0;
        self.sequence = expanded;
        self.sequence_len = expanded_len;
        self.step_index = 0;
        self.direction = 1;
        if expanded_len == 0 {
            self.next_step = None;
            self.capture_pending = false;
            let mut count = 0;
            for lane in &mut self.lanes {
                if lane.active {
                    out[count] = EventKind::NoteOff {
                        channel: lane.channel,
                        note: lane.pitch,
                    };
                    lane.active = false;
                    count += 1;
                }
            }
            count
        } else {
            if was_empty {
                self.capture_pending = true;
                self.next_step = Some((now + (self.sample_rate * 0.03).ceil() as u64) as f64);
            } else if !self.capture_pending {
                self.next_step = Some(self.next_step.unwrap_or(now as f64).max(now as f64));
            }
            0
        }
    }
}

fn discrete(value: f32, lo: f32, hi: f32) -> u8 {
    value.clamp(lo, hi).floor() as u8
}

fn insert_note(notes: &mut [Note; VOICES], note: Note) {
    let index = notes
        .iter()
        .position(|slot| slot.active && slot.channel == note.channel && slot.pitch == note.pitch)
        .or_else(|| notes.iter().position(|slot| !slot.active))
        .unwrap_or_else(|| {
            notes
                .iter()
                .enumerate()
                .min_by_key(|(_, slot)| slot.stamp)
                .unwrap()
                .0
        });
    notes[index] = note;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn notes_for_mode(mode: f32) -> Vec<u8> {
        let mut arp = MidiArpeggiator::new(48_000.0, 8.0, mode);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        arp.set_parameter(2, 2.0, 0, &mut out);
        arp.handle(
            EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 90,
            },
            0,
            &mut out,
        );
        arp.handle(
            EventKind::NoteOn {
                channel: 0,
                note: 64,
                velocity: 100,
            },
            480,
            &mut out,
        );
        [1440, 7440, 13440, 19440, 25440]
            .into_iter()
            .map(|frame| {
                let count = arp.fire_due(frame, &mut out);
                out[..count]
                    .iter()
                    .find_map(|event| match event {
                        EventKind::NoteOn { note, .. } => Some(*note),
                        _ => None,
                    })
                    .unwrap()
            })
            .collect()
    }

    #[test]
    fn captures_chord_then_steps_and_closes_gate_at_sample_deadlines() {
        let mut arp = MidiArpeggiator::new(48_000.0, 8.0, 0.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(
            arp.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 90
                },
                0,
                &mut out
            ),
            0
        );
        assert_eq!(arp.next_deadline(), Some(1440));
        assert_eq!(
            arp.handle(
                EventKind::NoteOn {
                    channel: 0,
                    note: 64,
                    velocity: 100
                },
                480,
                &mut out
            ),
            0
        );
        assert_eq!(arp.next_deadline(), Some(1440));
        assert_eq!(arp.fire_due(1440, &mut out), 1);
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 90
            }
        );
        assert_eq!(arp.next_deadline(), Some(5040));
        assert_eq!(arp.fire_due(5040, &mut out), 1);
        assert_eq!(
            out[0],
            EventKind::NoteOff {
                channel: 0,
                note: 60
            }
        );
        assert_eq!(arp.next_deadline(), Some(7440));
        assert_eq!(arp.fire_due(7440, &mut out), 1);
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 0,
                note: 64,
                velocity: 100
            }
        );
    }

    #[test]
    fn modes_and_octaves_follow_sorted_legacy_sequence() {
        assert_eq!(notes_for_mode(0.0), [60, 64, 72, 76, 60]);
        assert_eq!(notes_for_mode(1.0), [76, 72, 64, 60, 76]);
        assert_eq!(notes_for_mode(2.0), [60, 64, 72, 76, 72]);
        assert_eq!(notes_for_mode(2.9), notes_for_mode(2.0));
    }

    #[test]
    fn hold_latches_released_key_until_switched_off() {
        let mut arp = MidiArpeggiator::new(48_000.0, 8.0, 0.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        assert_eq!(arp.set_parameter(4, 1.0, 0, &mut out), Some(0));
        arp.handle(
            EventKind::NoteOn {
                channel: 2,
                note: 67,
                velocity: 80,
            },
            0,
            &mut out,
        );
        arp.handle(
            EventKind::NoteOff {
                channel: 2,
                note: 67,
            },
            600,
            &mut out,
        );
        assert_eq!(arp.next_deadline(), Some(1440));
        assert_eq!(arp.fire_due(1440, &mut out), 1);
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 2,
                note: 67,
                velocity: 80
            }
        );
        assert_eq!(arp.set_parameter(4, 0.0, 2000, &mut out), Some(1));
        assert_eq!(
            out[0],
            EventKind::NoteOff {
                channel: 2,
                note: 67
            }
        );
        assert_eq!(arp.next_deadline(), None);
    }

    #[test]
    fn enabling_hold_captures_keys_already_pressed() {
        let mut arp = MidiArpeggiator::new(48_000.0, 8.0, 0.0);
        let mut out = [EventKind::AllNotesOff; MAX_OUTPUT_EVENTS];
        arp.handle(
            EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
            0,
            &mut out,
        );
        assert_eq!(arp.set_parameter(4, 1.0, 100, &mut out), Some(0));
        arp.handle(
            EventKind::NoteOff {
                channel: 0,
                note: 60,
            },
            200,
            &mut out,
        );
        assert_eq!(arp.next_deadline(), Some(1440));
        assert_eq!(arp.fire_due(1440, &mut out), 1);
        assert_eq!(
            out[0],
            EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            }
        );
    }
}
