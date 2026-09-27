//! Fixed eight-slot note ownership shared by MIDI event transforms.

use crate::events::EventKind;

pub const VOICES: usize = 8;
pub const MAX_OUTPUT_EVENTS: usize = VOICES * 2;

#[derive(Clone, Copy, Default)]
struct HeldNote {
    active: bool,
    channel: u8,
    input: u8,
    output: Option<u8>,
    velocity: u8,
    stamp: u64,
}

#[derive(Default)]
pub struct MidiNoteRouter {
    held: [HeldNote; VOICES],
    stamp: u64,
}

impl MidiNoteRouter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn reset(&mut self) {
        self.held.fill(HeldNote::default());
        self.stamp = 0;
    }

    /// Re-evaluate held inputs after a parameter change. All offs precede ons.
    pub fn remap(
        &mut self,
        map: impl Fn(u8) -> Option<u8>,
        out: &mut [EventKind; MAX_OUTPUT_EVENTS],
    ) -> usize {
        self.remap_mapped(|note, velocity| map(note).map(|note| (note, velocity)), out)
    }

    pub fn remap_mapped(
        &mut self,
        map: impl Fn(u8, u8) -> Option<(u8, u8)>,
        out: &mut [EventKind; MAX_OUTPUT_EVENTS],
    ) -> usize {
        let mut count = 0;
        for note in self.held.iter().filter(|note| note.active) {
            if let Some(output) = note.output {
                out[count] = EventKind::NoteOff {
                    channel: note.channel,
                    note: output,
                };
                count += 1;
            }
        }
        for slot in &mut self.held {
            if slot.active {
                let mapped = map(slot.input, slot.velocity).filter(|(_, velocity)| *velocity > 0);
                slot.output = mapped.map(|(note, _)| note);
                if let Some((output, velocity)) = mapped {
                    out[count] = EventKind::NoteOn {
                        channel: slot.channel,
                        note: output,
                        velocity,
                    };
                    count += 1;
                }
            }
        }
        count
    }

    pub fn handle(
        &mut self,
        event: EventKind,
        map: impl Fn(u8) -> Option<u8>,
        out: &mut [EventKind; MAX_OUTPUT_EVENTS],
    ) -> usize {
        self.handle_mapped(
            event,
            |note, velocity| map(note).map(|note| (note, velocity)),
            out,
        )
    }

    pub fn handle_mapped(
        &mut self,
        event: EventKind,
        map: impl Fn(u8, u8) -> Option<(u8, u8)>,
        out: &mut [EventKind; MAX_OUTPUT_EVENTS],
    ) -> usize {
        match event {
            EventKind::NoteOn {
                channel,
                note,
                velocity: 0,
            } => self.handle_mapped(EventKind::NoteOff { channel, note }, map, out),
            EventKind::NoteOn {
                channel,
                note,
                velocity,
            } => {
                let existing = self.held.iter().position(|entry| {
                    entry.active && entry.channel == channel && entry.input == note
                });
                let free = self.held.iter().position(|entry| !entry.active);
                let index = existing.or(free).unwrap_or_else(|| {
                    self.held
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, entry)| entry.stamp)
                        .expect("fixed voice slots")
                        .0
                });
                let mut count = 0;
                if existing.is_none() && free.is_none() {
                    if let Some(output) = self.held[index].output {
                        out[count] = EventKind::NoteOff {
                            channel: self.held[index].channel,
                            note: output,
                        };
                        count += 1;
                    }
                }
                self.stamp = self.stamp.wrapping_add(1);
                let mapped = map(note, velocity).filter(|(_, velocity)| *velocity > 0);
                let output = mapped.map(|(note, _)| note);
                self.held[index] = HeldNote {
                    active: true,
                    channel,
                    input: note,
                    output,
                    velocity,
                    stamp: self.stamp,
                };
                if let Some((note, velocity)) = mapped {
                    out[count] = EventKind::NoteOn {
                        channel,
                        note,
                        velocity,
                    };
                    count += 1;
                }
                count
            }
            EventKind::NoteOff { channel, note } => {
                let Some(index) = self.held.iter().position(|entry| {
                    entry.active && entry.channel == channel && entry.input == note
                }) else {
                    return 0;
                };
                let output = self.held[index].output;
                self.held[index].active = false;
                if let Some(note) = output {
                    out[0] = EventKind::NoteOff { channel, note };
                    1
                } else {
                    0
                }
            }
            EventKind::AllNotesOff => {
                let mut count = 0;
                for note in &mut self.held {
                    if note.active {
                        if let Some(output) = note.output {
                            out[count] = EventKind::NoteOff {
                                channel: note.channel,
                                note: output,
                            };
                            count += 1;
                        }
                        note.active = false;
                    }
                }
                count
            }
            EventKind::PitchBend { .. } => {
                out[0] = event;
                1
            }
        }
    }
}
