//! Main's bounded voice-bundle arpeggiator. The sample clock and output lanes are
//! independent of MIDI note ownership and of the browser's presentation frame.

use crate::main_voice_allocator::{EnvelopePhase, MAIN_VOICE_COUNT, MainVoiceSlot};

const MAX_STEPS: usize = MAIN_VOICE_COUNT * 4;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Entry {
    source: usize,
    voice: MainVoiceSlot,
}

#[derive(Clone, Copy, Debug, Default)]
struct Lane {
    voice: MainVoiceSlot,
    source: usize,
    close_at: u64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ArpChanges {
    pub started: u8,
    pub released: u8,
}

pub struct MainArpeggiator {
    sample_rate: f64,
    rate: f32,
    mode: u8,
    octaves: u8,
    gate: f32,
    hold: bool,
    inputs: [Entry; MAIN_VOICE_COUNT],
    latched: [Entry; MAIN_VOICE_COUNT],
    latched_len: usize,
    sequence: [Entry; MAX_STEPS],
    sequence_len: usize,
    lanes: [Lane; MAIN_VOICE_COUNT],
    next_lane: usize,
    step_index: usize,
    direction: i8,
    next_step: Option<f64>,
    capture_pending: bool,
    random_state: u64,
    current_note: Option<u8>,
}

impl MainArpeggiator {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate: f64::from(sample_rate),
            rate: 8.0,
            mode: 0,
            octaves: 1,
            gate: 0.6,
            hold: false,
            inputs: [Entry::default(); MAIN_VOICE_COUNT],
            latched: [Entry::default(); MAIN_VOICE_COUNT],
            latched_len: 0,
            sequence: [Entry::default(); MAX_STEPS],
            sequence_len: 0,
            lanes: [Lane::default(); MAIN_VOICE_COUNT],
            next_lane: 0,
            step_index: 0,
            direction: 1,
            next_step: None,
            capture_pending: false,
            random_state: 0x9e37_79b9_7f4a_7c15,
            current_note: None,
        }
    }

    pub fn reset(&mut self) {
        let sample_rate = self.sample_rate as f32;
        let (rate, mode, octaves, gate, hold) =
            (self.rate, self.mode, self.octaves, self.gate, self.hold);
        *self = Self::new(sample_rate);
        (self.rate, self.mode, self.octaves, self.gate, self.hold) =
            (rate, mode, octaves, gate, hold);
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.rate = value.clamp(0.25, 20.0),
            1 if value.fract() == 0.0 && (0.0..=3.0).contains(&value) => self.mode = value as u8,
            2 if value.fract() == 0.0 && (1.0..=4.0).contains(&value) => self.octaves = value as u8,
            3 => self.gate = value.clamp(0.05, 1.0),
            4 if value == 0.0 || value == 1.0 => {
                if value == 1.0 && !self.hold {
                    self.latched_len = 0;
                    for index in 0..MAIN_VOICE_COUNT {
                        let entry = self.inputs[index];
                        if entry.voice.gate {
                            self.latch(entry);
                        }
                    }
                }
                self.hold = value == 1.0;
                if !self.hold {
                    self.latched_len = 0;
                }
            }
            _ => return false,
        }
        true
    }

    pub fn parameter(&self, id: u32) -> f32 {
        match id {
            0 => self.rate,
            1 => self.mode as f32,
            2 => self.octaves as f32,
            3 => self.gate,
            4 => f32::from(self.hold),
            _ => 0.0,
        }
    }

    pub fn update_inputs(
        &mut self,
        voices: [MainVoiceSlot; MAIN_VOICE_COUNT],
        now: u64,
    ) -> ArpChanges {
        for (source, voice) in voices.into_iter().enumerate() {
            let rising = voice.gate && !self.inputs[source].voice.gate;
            let entry = Entry { source, voice };
            if rising && self.hold {
                self.latch(entry);
            }
            self.inputs[source] = entry;
        }
        self.refresh_sequence(now)
    }

    fn latch(&mut self, entry: Entry) {
        if let Some(existing) = self.latched[..self.latched_len]
            .iter_mut()
            .find(|held| held.voice.note == entry.voice.note)
        {
            *existing = entry;
        } else if self.latched_len < MAIN_VOICE_COUNT {
            self.latched[self.latched_len] = entry;
            self.latched_len += 1;
        } else {
            self.latched[0] = entry;
        }
    }

    fn refresh_sequence(&mut self, now: u64) -> ArpChanges {
        let mut base = [Entry::default(); MAIN_VOICE_COUNT];
        let mut count = 0;
        if self.hold {
            count = self.latched_len;
            base[..count].copy_from_slice(&self.latched[..count]);
        } else {
            for entry in self.inputs.iter().filter(|entry| entry.voice.gate) {
                base[count] = *entry;
                count += 1;
            }
        }
        base[..count].sort_unstable_by_key(|entry| (entry.voice.note, entry.source));
        let mut expanded = [Entry::default(); MAX_STEPS];
        let mut len = 0;
        for octave in 0..self.octaves {
            for entry in &base[..count] {
                let mut copy = *entry;
                copy.voice.note = copy.voice.note.saturating_add(octave * 12).min(127);
                expanded[len] = copy;
                len += 1;
            }
        }
        if len == self.sequence_len && expanded[..len] == self.sequence[..len] {
            return ArpChanges::default();
        }
        let was_empty = self.sequence_len == 0;
        self.sequence = expanded;
        self.sequence_len = len;
        self.step_index = 0;
        self.direction = 1;
        if len == 0 {
            self.next_step = None;
            self.capture_pending = false;
            self.current_note = None;
            let mut changes = ArpChanges::default();
            for index in 0..MAIN_VOICE_COUNT {
                self.close_lane(index, &mut changes);
            }
            changes
        } else {
            if was_empty {
                self.capture_pending = true;
                self.next_step = Some((now + (self.sample_rate * 0.03).ceil() as u64) as f64);
            } else if !self.capture_pending {
                self.next_step = Some(self.next_step.unwrap_or(now as f64).max(now as f64));
            }
            ArpChanges::default()
        }
    }

    pub fn next_deadline(&self) -> Option<u64> {
        self.lanes
            .iter()
            .filter(|lane| lane.voice.gate)
            .map(|lane| lane.close_at)
            .chain(self.next_step.map(|step| step.ceil() as u64))
            .min()
    }

    pub fn fire_due(&mut self, now: u64) -> ArpChanges {
        let mut changes = ArpChanges::default();
        for index in 0..MAIN_VOICE_COUNT {
            if self.lanes[index].voice.gate && self.lanes[index].close_at <= now {
                self.close_lane(index, &mut changes);
            }
        }
        if self.next_step.is_some_and(|step| step.ceil() as u64 <= now) && self.sequence_len > 0 {
            self.capture_pending = false;
            let entry = self.choose_step();
            let index = (0..MAIN_VOICE_COUNT)
                .map(|offset| (self.next_lane + offset) % MAIN_VOICE_COUNT)
                .find(|&index| !self.lanes[index].voice.gate)
                .unwrap_or(self.next_lane);
            self.close_lane(index, &mut changes);
            let period = self.sample_rate / f64::from(self.rate);
            let gate_frames = (period * f64::from(self.gate)).round().max(1.0) as u64;
            let mut voice = entry.voice;
            voice.active = true;
            voice.gate = true;
            voice.phase = EnvelopePhase::Attack;
            voice.envelope_level = 0.0;
            self.lanes[index] = Lane {
                voice,
                source: entry.source,
                close_at: now.saturating_add(gate_frames),
            };
            changes.started |= 1 << index;
            self.current_note = Some(voice.note);
            self.next_lane = (index + 1) % MAIN_VOICE_COUNT;
            self.next_step = self.next_step.map(|step| step + period);
        }
        changes
    }

    fn close_lane(&mut self, index: usize, changes: &mut ArpChanges) {
        let lane = &mut self.lanes[index];
        if lane.voice.gate {
            lane.voice.gate = false;
            lane.voice.phase = EnvelopePhase::Release;
            changes.released |= 1 << index;
        }
    }

    fn choose_step(&mut self) -> Entry {
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

    pub fn output(&self, index: usize) -> MainVoiceSlot {
        self.lanes[index].voice
    }

    pub fn output_source(&self, index: usize) -> usize {
        self.lanes[index].source
    }

    pub fn report_envelope(&mut self, index: usize, phase: EnvelopePhase, level: f32) {
        let slot = &mut self.lanes[index].voice;
        if !slot.active {
            return;
        }
        slot.phase = phase;
        slot.envelope_level = level.clamp(0.0, 1.0);
        if phase == EnvelopePhase::Idle && !slot.gate {
            slot.active = false;
        }
    }

    pub fn status(&self, id: u32) -> f32 {
        match id {
            0 => self.sequence_len as f32 / self.octaves as f32,
            1 => {
                if self.lanes.iter().any(|lane| lane.voice.gate) {
                    self.current_note.map_or(-1.0, f32::from)
                } else {
                    -1.0
                }
            }
            2 => self.lanes.iter().filter(|lane| lane.voice.gate).count() as f32,
            3..=10 => f32::from(self.lanes[id as usize - 3].voice.gate),
            _ => 0.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(notes: &[(usize, u8, f32)]) -> [MainVoiceSlot; MAIN_VOICE_COUNT] {
        let mut slots = [MainVoiceSlot::default(); MAIN_VOICE_COUNT];
        for &(index, note, amp) in notes {
            slots[index] = MainVoiceSlot {
                active: true,
                gate: true,
                note,
                target_amp: amp,
                ..Default::default()
            };
        }
        slots
    }

    #[test]
    fn captures_chord_and_copies_source_amplitude_to_timed_lanes() {
        let mut arp = MainArpeggiator::new(48_000.0);
        arp.update_inputs(input(&[(3, 67, 0.2)]), 0);
        arp.update_inputs(input(&[(3, 67, 0.2), (1, 60, 0.37)]), 600);
        assert_eq!(arp.next_deadline(), Some(1440));
        assert_eq!(arp.fire_due(1440).started, 1);
        assert_eq!(
            (
                arp.output(0).note,
                arp.output(0).target_amp,
                arp.output_source(0)
            ),
            (60, 0.37, 1)
        );
        assert_eq!(arp.next_deadline(), Some(5040));
        assert_eq!(arp.fire_due(5040).released, 1);
        assert_eq!(arp.fire_due(7440).started, 2);
        assert_eq!((arp.output(1).note, arp.output_source(1)), (67, 3));
    }

    #[test]
    fn hold_and_octaves_survive_source_release_until_hold_clears() {
        let mut arp = MainArpeggiator::new(1000.0);
        arp.set_parameter(4, 1.0);
        arp.set_parameter(2, 2.0);
        arp.update_inputs(input(&[(0, 60, 0.3)]), 0);
        arp.update_inputs(input(&[]), 10);
        assert_eq!(arp.status(0), 1.0);
        assert_eq!(arp.fire_due(30).started, 1);
        assert_eq!(arp.output(0).note, 60);
        arp.fire_due(155);
        assert_eq!(arp.output(1).note, 72);
        arp.set_parameter(4, 0.0);
        let changes = arp.update_inputs(input(&[]), 155);
        assert_eq!(changes.released, 2);
        assert_eq!(arp.status(0), 0.0);
    }

    #[test]
    fn same_pitch_lanes_have_independent_gate_close() {
        let mut arp = MainArpeggiator::new(1000.0);
        arp.set_parameter(0, 20.0);
        arp.set_parameter(3, 1.0);
        arp.update_inputs(input(&[(0, 60, 0.2), (1, 60, 0.4)]), 0);
        arp.fire_due(30);
        assert_eq!(arp.output(0).target_amp, 0.2);
        arp.fire_due(80);
        assert_eq!(arp.output(1).target_amp, 0.4);
        assert!(!arp.output(0).gate);
        assert!(arp.output(1).gate);
    }

    #[test]
    fn sorted_down_bounce_and_seeded_random_follow_main_modes() {
        fn notes(mode: f32) -> Vec<u8> {
            let mut arp = MainArpeggiator::new(1000.0);
            arp.set_parameter(0, 20.0);
            arp.set_parameter(1, mode);
            arp.update_inputs(input(&[(2, 67, 0.2), (1, 60, 0.2), (0, 64, 0.2)]), 0);
            (0..8)
                .map(|step| {
                    let changes = arp.fire_due(30 + step * 50);
                    let lane = changes.started.trailing_zeros() as usize;
                    arp.output(lane).note
                })
                .collect()
        }
        assert_eq!(&notes(1.0)[..5], &[67, 64, 60, 67, 64]);
        assert_eq!(&notes(2.0)[..6], &[60, 64, 67, 64, 60, 64]);
        let first = notes(3.0);
        assert_eq!(first, notes(3.0));
        assert!(first.iter().all(|note| [60, 64, 67].contains(note)));
        assert!(first.iter().any(|note| *note != first[0]));
    }
}
