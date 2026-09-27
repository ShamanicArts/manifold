//! Eight note voices read one shared, immutable decoded sample buffer.

use crate::events::EventKind;
use crate::sample_region::{SampleRegion, ValidatedStereo};

const VOICES: usize = 8;
const MAX_UNISON: usize = 4;

#[derive(Clone, Copy, Default)]
struct VoiceSlot {
    active: bool,
    releasing: bool,
    channel: u8,
    note: u8,
    velocity: f32,
    release_gain: f32,
    release_step: f32,
    release_remaining: u32,
    unison_count: u8,
    serial: u64,
}

pub struct SampleInstrument {
    source: SampleRegion,
    // Keep previous PCM alive until a later control-thread publication. Voices
    // can finish an earlier take without freeing its last Arc in process().
    retired_sources: Vec<SampleRegion>,
    players: [[SampleRegion; MAX_UNISON]; VOICES],
    slots: [VoiceSlot; VOICES],
    bend_ratio: [f64; 16],
    serial: u64,
    output_rate: f32,
    root_note: u8,
    key_track: f32,
    level: f32,
    speed: f32,
    release_seconds: f32,
    unison_count: usize,
    detune_cents: f32,
    spread: f32,
    pan_gains: [[[f32; 2]; MAX_UNISON]; MAX_UNISON + 1],
    normalization: [f32; MAX_UNISON + 1],
}

impl SampleInstrument {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            source: SampleRegion::new(sample_rate),
            retired_sources: Vec::new(),
            players: std::array::from_fn(|_| {
                std::array::from_fn(|_| SampleRegion::new(sample_rate))
            }),
            slots: [VoiceSlot::default(); VOICES],
            bend_ratio: [1.0; 16],
            serial: 0,
            output_rate: sample_rate,
            root_note: 60,
            key_track: 1.0,
            level: 0.25,
            speed: 1.0,
            release_seconds: 0.01,
            unison_count: 1,
            detune_cents: 0.0,
            spread: 0.0,
            pan_gains: Self::build_pan_gains(0.0),
            normalization: std::array::from_fn(|count| {
                if count == 0 {
                    0.0
                } else {
                    1.0 / (count as f32).sqrt()
                }
            }),
        }
    }

    /// Clear active voices without releasing any PCM on the audio thread.
    /// Retired sources remain held for later control-thread reclamation.
    pub fn reset(&mut self) {
        self.slots.fill(VoiceSlot::default());
        self.bend_ratio.fill(1.0);
        self.serial = 0;
        for player in self.players.iter_mut().flatten() {
            player.reset();
        }
    }

    /// Decoded PCM is moved once and shared across voice cursors before audio starts.
    pub fn load_stereo(&mut self, stereo: Vec<f32>, source_rate: f32) -> bool {
        if !self.source.load_stereo(stereo, source_rate) {
            return false;
        }
        for player in self.players.iter_mut().flatten() {
            player.share_sample_from(&self.source);
        }
        self.slots.fill(VoiceSlot::default());
        self.retired_sources.clear();
        true
    }

    /// Publish a new source between audio blocks. Held notes keep their old PCM;
    /// each subsequent note starts from the latest source. Retired PCM is
    /// reclaimed on a later publication, never inside the render callback.
    pub fn publish_stereo(&mut self, stereo: Vec<f32>, source_rate: f32) -> bool {
        let Some(source) = ValidatedStereo::from_stereo(stereo, source_rate) else {
            return false;
        };
        self.publish_validated(source)
    }

    pub(crate) fn publish_validated(&mut self, source: ValidatedStereo) -> bool {
        let mut next = self.source.clone();
        next.load_validated(source);
        let previous = std::mem::replace(&mut self.source, next);
        self.retired_sources.push(previous);
        for (slot, group) in self.slots.iter().zip(&mut self.players) {
            for (index, player) in group.iter_mut().enumerate() {
                if !slot.active || index >= slot.unison_count as usize {
                    player.share_sample_from(&self.source);
                }
            }
        }
        self.retired_sources.retain(|old| {
            self.slots.iter().zip(&self.players).any(|(slot, group)| {
                slot.active
                    && group[..slot.unison_count as usize]
                        .iter()
                        .any(|player| player.shares_sample_with(old))
            })
        });
        true
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.root_note = value.round().clamp(0.0, 127.0) as u8,
            1 => self.key_track = value.clamp(0.0, 1.0),
            2 => self.level = value.clamp(0.0, 1.0),
            3 => self.speed = value.clamp(0.0, 8.0),
            10 => self.release_seconds = value.clamp(0.0, 1.0),
            11 => self.unison_count = value.round().clamp(1.0, MAX_UNISON as f32) as usize,
            12 => self.detune_cents = value.clamp(0.0, 100.0),
            13 => {
                self.spread = value.clamp(0.0, 1.0);
                self.pan_gains = Self::build_pan_gains(self.spread);
            }
            4..=9 => {
                let player_id = match id {
                    4 => 1,
                    5 => 2,
                    6 => 3,
                    7 => 4,
                    8 => 5,
                    _ => 8,
                };
                for player in self.players.iter_mut().flatten() {
                    player.set_parameter(player_id, value);
                }
            }
            _ => return false,
        }
        if matches!(id, 0 | 1 | 3 | 12) {
            for index in 0..VOICES {
                if self.slots[index].active {
                    let count = self.slots[index].unison_count as usize;
                    for subvoice in 0..count {
                        let speed = self.note_speed(
                            self.slots[index].channel,
                            self.slots[index].note,
                            subvoice,
                            count,
                        );
                        self.players[index][subvoice].set_parameter(0, speed);
                    }
                }
            }
        }
        true
    }

    fn unison_offset(subvoice: usize, count: usize) -> f32 {
        if count <= 1 {
            return 0.0;
        }
        let center = (count - 1) as f32 * 0.5;
        (subvoice as f32 - center) / center.max(1.0)
    }

    fn build_pan_gains(spread: f32) -> [[[f32; 2]; MAX_UNISON]; MAX_UNISON + 1] {
        std::array::from_fn(|count| {
            std::array::from_fn(|subvoice| {
                if count <= 1 {
                    [1.0, 1.0]
                } else {
                    let offset = Self::unison_offset(subvoice, count);
                    let pan = (0.5 + offset * spread * 0.5).clamp(0.0, 1.0);
                    [(2.0 * (1.0 - pan)).sqrt(), (2.0 * pan).sqrt()]
                }
            })
        })
    }

    fn note_speed(&self, channel: u8, note: u8, subvoice: usize, count: usize) -> f32 {
        let detune = Self::unison_offset(subvoice, count) as f64 * self.detune_cents as f64;
        (self.speed as f64
            * self
                .bend_ratio
                .get(channel as usize)
                .copied()
                .unwrap_or(1.0)
            * 2.0f64.powf(
                (note as f64 - self.root_note as f64) * self.key_track as f64 / 12.0
                    + detune / 1200.0,
            ))
        .clamp(0.0, 8.0) as f32
    }

    pub fn event(&mut self, event: EventKind) {
        match event {
            EventKind::NoteOn {
                channel,
                note,
                velocity,
            } => {
                if velocity == 0 {
                    self.event(EventKind::NoteOff { channel, note });
                    return;
                }
                let index = self
                    .slots
                    .iter()
                    .position(|slot| {
                        slot.active
                            && !slot.releasing
                            && slot.channel == channel
                            && slot.note == note
                    })
                    .or_else(|| self.slots.iter().position(|slot| !slot.active))
                    .or_else(|| self.slots.iter().position(|slot| slot.releasing))
                    .unwrap_or_else(|| {
                        self.slots
                            .iter()
                            .enumerate()
                            .min_by_key(|(_, slot)| slot.serial)
                            .unwrap()
                            .0
                    });
                self.serial = self.serial.wrapping_add(1);
                self.slots[index] = VoiceSlot {
                    active: true,
                    releasing: false,
                    channel,
                    note,
                    velocity: velocity as f32 / 127.0,
                    release_gain: 1.0,
                    release_step: 0.0,
                    release_remaining: 0,
                    unison_count: self.unison_count as u8,
                    serial: self.serial,
                };
                for subvoice in 0..MAX_UNISON {
                    let speed = self.note_speed(channel, note, subvoice, self.unison_count);
                    let player = &mut self.players[index][subvoice];
                    player.set_parameter(6, 0.0);
                    if subvoice < self.unison_count {
                        player.share_sample_from(&self.source);
                        player.set_parameter(0, speed);
                        player.event(event);
                    }
                }
            }
            EventKind::NoteOff { channel, note } => {
                for (slot, group) in self.slots.iter_mut().zip(&mut self.players) {
                    if slot.active
                        && !slot.releasing
                        && slot.channel == channel
                        && slot.note == note
                    {
                        if self.release_seconds == 0.0 {
                            slot.active = false;
                            for player in group {
                                player.set_parameter(6, 0.0);
                            }
                        } else {
                            slot.releasing = true;
                            slot.release_remaining =
                                (self.release_seconds * self.output_rate).ceil().max(1.0) as u32;
                            slot.release_step = 1.0 / slot.release_remaining as f32;
                        }
                    }
                }
            }
            EventKind::AllNotesOff => {
                for (slot, group) in self.slots.iter_mut().zip(&mut self.players) {
                    slot.active = false;
                    for player in group {
                        player.set_parameter(6, 0.0);
                    }
                }
            }
            EventKind::PitchBend { channel, value } => {
                if channel < 16 && value < 16384 {
                    self.bend_ratio[channel as usize] =
                        2.0f64.powf((value as f64 - 8192.0) / 8192.0);
                    for index in 0..VOICES {
                        if self.slots[index].active && self.slots[index].channel == channel {
                            let count = self.slots[index].unison_count as usize;
                            for subvoice in 0..count {
                                let speed = self.note_speed(
                                    channel,
                                    self.slots[index].note,
                                    subvoice,
                                    count,
                                );
                                self.players[index][subvoice].set_parameter(0, speed);
                            }
                        }
                    }
                }
            }
        }
    }

    pub fn active_voices(&self) -> usize {
        self.slots.iter().filter(|slot| slot.active).count()
    }

    pub fn meter(&self, band: usize) -> Option<f32> {
        match band {
            0 => Some(self.active_voices() as f32),
            1..=VOICES => Some(if self.slots[band - 1].active {
                let count = self.slots[band - 1].unison_count as usize;
                let group = &self.players[band - 1][..count];
                let center = (count - 1) / 2;
                group[center]
                    .is_playing()
                    .then_some(&group[center])
                    .or_else(|| group.iter().find(|player| player.is_playing()))
                    .and_then(|player| player.meter(0))
                    .unwrap_or(0.0)
            } else {
                -1.0
            }),
            _ => None,
        }
    }

    pub fn process_sample(&mut self) -> [f32; 2] {
        let mut output = [0.0; 2];
        let pan_gains = &self.pan_gains;
        let normalization = &self.normalization;
        let level = self.level;
        for (slot, group) in self.slots.iter_mut().zip(&mut self.players) {
            if !slot.active {
                continue;
            }
            let count = slot.unison_count as usize;
            let mut mixed = [0.0; 2];
            let mut contributing = 0;
            for (subvoice, player) in group[..count].iter_mut().enumerate() {
                if !player.is_playing() {
                    continue;
                }
                contributing += 1;
                let sample = player.process_sample();
                mixed[0] += sample[0] * pan_gains[count][subvoice][0];
                mixed[1] += sample[1] * pan_gains[count][subvoice][1];
            }
            if contributing > 0 {
                let gain = slot.velocity * level * slot.release_gain * normalization[contributing];
                output[0] += mixed[0] * gain;
                output[1] += mixed[1] * gain;
            }
            if slot.releasing {
                slot.release_remaining -= 1;
                slot.release_gain = if slot.release_remaining == 0 {
                    0.0
                } else {
                    (slot.release_gain - slot.release_step).max(0.0)
                };
            }
            if contributing == 0 || slot.release_gain == 0.0 {
                slot.active = false;
                for player in group {
                    player.set_parameter(6, 0.0);
                }
            }
        }
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn constant_instrument() -> SampleInstrument {
        let mut instrument = SampleInstrument::new(8000.0);
        assert!(instrument.load_stereo(vec![1.0; 16], 8000.0));
        instrument.set_parameter(2, 1.0);
        instrument
    }

    #[test]
    fn reset_silences_voices_and_reuses_prepared_new_source() {
        let mut instrument = constant_instrument();
        let note = EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        };
        instrument.event(note);
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
        assert!(instrument.publish_stereo(vec![0.5; 16], 8000.0));
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
        let retired = instrument.retired_sources.len();
        instrument.reset();
        assert_eq!(instrument.active_voices(), 0);
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
        assert_eq!(instrument.retired_sources.len(), retired);
        instrument.event(note);
        assert_eq!(instrument.process_sample(), [0.5, 0.5]);
    }

    #[test]
    fn published_source_changes_new_notes_without_cutting_held_notes() {
        let mut instrument = constant_instrument();
        instrument.set_parameter(10, 0.0);
        let on = |note| EventKind::NoteOn {
            channel: 0,
            note,
            velocity: 127,
        };
        instrument.event(on(60));
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
        assert!(!instrument.publish_stereo(vec![f32::NAN; 16], 8000.0));
        assert!(instrument.publish_stereo(vec![-1.0; 16], 8000.0));
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
        instrument.event(on(64));
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        assert_eq!(instrument.process_sample(), [-1.0, -1.0]);
        assert_eq!(instrument.active_voices(), 1);
        assert!(instrument.publish_stereo(vec![0.5; 16], 8000.0));
        assert_eq!(instrument.retired_sources.len(), 1);
        assert_eq!(instrument.process_sample(), [-1.0, -1.0]);
    }

    #[test]
    fn pitch_bend_retunes_only_matching_sample_channel() {
        let mut instrument = constant_instrument();
        for channel in [0, 1] {
            instrument.event(EventKind::NoteOn {
                channel,
                note: 60,
                velocity: 127,
            });
        }
        instrument.event(EventKind::PitchBend {
            channel: 1,
            value: 12288,
        });
        instrument.process_sample();
        let first = instrument.players[0][0].meter(0).unwrap();
        let second = instrument.players[1][0].meter(0).unwrap();
        assert!((second / first - 2.0f32.sqrt()).abs() < 1e-6);
        instrument.event(EventKind::PitchBend {
            channel: 0,
            value: 4096,
        });
        instrument.process_sample();
        let first_after = instrument.players[0][0].meter(0).unwrap();
        let second_after = instrument.players[1][0].meter(0).unwrap();
        assert!(((first_after - first) / first - 1.0 / 2.0f32.sqrt()).abs() < 1e-6);
        assert!(((second_after - second) / second - 1.0).abs() < 1e-6);
    }

    #[test]
    fn invalid_midi_channel_does_not_panic_in_core() {
        let mut instrument = constant_instrument();
        instrument.event(EventKind::NoteOn {
            channel: 255,
            note: 60,
            velocity: 127,
        });
        instrument.event(EventKind::PitchBend {
            channel: 255,
            value: 12288,
        });
        assert!(instrument.process_sample()[0].is_finite());
    }

    #[test]
    fn notes_have_independent_voices_and_note_off_targets_one_key() {
        let mut instrument = constant_instrument();
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 72,
            velocity: 127,
        });
        assert_eq!(instrument.process_sample(), [2.0, 2.0]);
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        let during_release = instrument.process_sample();
        assert_eq!(during_release, [2.0, 2.0]);
        for _ in 0..80 {
            instrument.process_sample();
        }
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
        assert_eq!(instrument.active_voices(), 1);
        instrument.event(EventKind::AllNotesOff);
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
    }

    #[test]
    fn root_note_changes_resampling_speed() {
        let mut instrument = SampleInstrument::new(8000.0);
        assert!(instrument.load_stereo(vec![0., 0., 1., 1., 2., 2., 3., 3.], 8000.0));
        instrument.set_parameter(2, 1.0);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 72,
            velocity: 127,
        });
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
        assert_eq!(instrument.process_sample(), [2.0, 2.0]);
        instrument.set_parameter(1, 0.0);
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
        assert_eq!(instrument.process_sample(), [1.0, 1.0]);
    }

    #[test]
    fn ninth_note_steals_oldest_voice() {
        let mut instrument = constant_instrument();
        for note in 60..69 {
            instrument.event(EventKind::NoteOn {
                channel: 0,
                note,
                velocity: 127,
            });
        }
        assert_eq!(instrument.active_voices(), 8);
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        assert_eq!(instrument.active_voices(), 8);
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 68,
        });
        assert_eq!(instrument.active_voices(), 8);
        for _ in 0..80 {
            instrument.process_sample();
        }
        assert_eq!(instrument.active_voices(), 7);
    }

    #[test]
    fn note_release_fades_over_configured_samples_and_can_be_disabled() {
        let mut instrument = constant_instrument();
        instrument.set_parameter(10, 0.001);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        let levels: Vec<f32> = (0..9).map(|_| instrument.process_sample()[0]).collect();
        for (actual, expected) in levels
            .into_iter()
            .zip([1.0, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.125, 0.0])
        {
            assert!((actual - expected).abs() < 1e-5, "{actual} != {expected}");
        }
        assert_eq!(instrument.active_voices(), 0);
        instrument.set_parameter(10, 0.0);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        assert_eq!(instrument.process_sample(), [0.0, 0.0]);
    }

    #[test]
    fn new_note_reuses_a_releasing_slot_before_stealing_a_held_note() {
        let mut instrument = constant_instrument();
        for note in 60..68 {
            instrument.event(EventKind::NoteOn {
                channel: 0,
                note,
                velocity: 127,
            });
        }
        instrument.event(EventKind::NoteOff {
            channel: 0,
            note: 65,
        });
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 72,
            velocity: 127,
        });
        assert_eq!(instrument.active_voices(), 8);
        assert!(
            instrument
                .slots
                .iter()
                .any(|slot| slot.active && slot.note == 60)
        );
        assert!(
            instrument
                .slots
                .iter()
                .any(|slot| slot.active && slot.note == 72)
        );
        assert!(
            !instrument
                .slots
                .iter()
                .any(|slot| slot.active && slot.note == 65)
        );
    }

    #[test]
    fn unison_count_is_captured_at_note_on_and_detune_moves_subvoices_apart() {
        let mut instrument = constant_instrument();
        instrument.set_parameter(11, 2.0);
        instrument.set_parameter(12, 100.0);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        assert_eq!(instrument.slots[0].unison_count, 2);
        let sample = instrument.process_sample();
        assert!((sample[0] - std::f32::consts::SQRT_2).abs() < 1e-6);
        let first = instrument.players[0][0].meter(0).unwrap();
        let second = instrument.players[0][1].meter(0).unwrap();
        assert!(first < second);
        instrument.set_parameter(11, 4.0);
        assert_eq!(instrument.slots[0].unison_count, 2);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 62,
            velocity: 127,
        });
        assert_eq!(instrument.slots[1].unison_count, 4);
    }

    #[test]
    fn spread_pan_separates_detuned_subvoices_and_one_shot_waits_for_last() {
        let mut instrument = SampleInstrument::new(8000.0);
        assert!(instrument.load_stereo(vec![0., 0., 1., 1., -1., -1., 0.5, 0.5], 8000.0));
        instrument.set_parameter(2, 1.0);
        instrument.set_parameter(5, 1.0);
        instrument.set_parameter(11, 2.0);
        instrument.set_parameter(12, 100.0);
        instrument.set_parameter(13, 1.0);
        instrument.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        instrument.process_sample();
        let second = instrument.process_sample();
        assert!((second[0] - second[1]).abs() > 1e-4);
        assert_eq!(instrument.active_voices(), 1);
        for _ in 0..8 {
            instrument.process_sample();
        }
        assert_eq!(instrument.active_voices(), 0);
    }
}
