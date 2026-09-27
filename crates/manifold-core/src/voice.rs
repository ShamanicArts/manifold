//! A compact polyphonic voice baseline with explicit event and envelope state.

use crate::events::EventKind;
use std::f64::consts::TAU;

const MAX_VOICES: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Stage {
    Off,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone, Copy)]
struct Voice {
    channel: u8,
    note: u8,
    velocity: f32,
    phase: f64,
    frequency: f64,
    level: f32,
    release_level: f32,
    stage_time: f32,
    stage: Stage,
    serial: u64,
}

impl Default for Voice {
    fn default() -> Self {
        Self {
            channel: 0,
            note: 0,
            velocity: 0.0,
            phase: 0.0,
            frequency: 0.0,
            level: 0.0,
            release_level: 0.0,
            stage_time: 0.0,
            stage: Stage::Off,
            serial: 0,
        }
    }
}

pub struct VoiceSynth {
    sample_rate: f32,
    voices: [Voice; MAX_VOICES],
    bend_ratio: [f64; 16],
    serial: u64,
    waveform: u32,
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    level: f32,
}

impl VoiceSynth {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate,
            voices: [Voice::default(); MAX_VOICES],
            bend_ratio: [1.0; 16],
            serial: 0,
            waveform: 0,
            attack: 0.010,
            decay: 0.120,
            sustain: 0.65,
            release: 0.180,
            level: 0.25,
        }
    }

    /// Clear sounding and releasing voices immediately, retaining sound controls.
    /// This is safe to call from a prepared host's audio reset callback.
    pub fn reset(&mut self) {
        self.voices.fill(Voice::default());
        self.bend_ratio.fill(1.0);
        self.serial = 0;
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.waveform = value.round().clamp(0.0, 3.0) as u32,
            1 => self.attack = value.clamp(0.001, 10.0),
            2 => self.decay = value.clamp(0.001, 10.0),
            3 => self.sustain = value.clamp(0.0, 1.0),
            4 => self.release = value.clamp(0.001, 10.0),
            5 => self.level = value.clamp(0.0, 1.0),
            _ => return false,
        }
        true
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
                let slot = self
                    .voices
                    .iter()
                    .position(|voice| {
                        voice.stage != Stage::Off && voice.channel == channel && voice.note == note
                    })
                    .or_else(|| {
                        self.voices
                            .iter()
                            .position(|voice| voice.stage == Stage::Off)
                    })
                    .unwrap_or_else(|| {
                        self.voices
                            .iter()
                            .enumerate()
                            .min_by_key(|(_, voice)| voice.serial)
                            .unwrap()
                            .0
                    });
                self.serial = self.serial.wrapping_add(1);
                self.voices[slot] = Voice {
                    channel,
                    note,
                    velocity: velocity as f32 / 127.0,
                    phase: 0.0,
                    frequency: 440.0 * 2.0f64.powf((note as f64 - 69.0) / 12.0),
                    stage: Stage::Attack,
                    serial: self.serial,
                    ..Voice::default()
                };
            }
            EventKind::NoteOff { channel, note } => {
                for voice in &mut self.voices {
                    if voice.stage != Stage::Off && voice.channel == channel && voice.note == note {
                        voice.release_level = voice.level;
                        voice.stage = Stage::Release;
                        voice.stage_time = 0.0;
                    }
                }
            }
            EventKind::AllNotesOff => {
                for voice in &mut self.voices {
                    if voice.stage != Stage::Off {
                        voice.release_level = voice.level;
                        voice.stage = Stage::Release;
                        voice.stage_time = 0.0;
                    }
                }
            }
            EventKind::PitchBend { channel, value } => {
                if channel < 16 && value < 16384 {
                    self.bend_ratio[channel as usize] =
                        2.0f64.powf((value as f64 - 8192.0) / 8192.0);
                }
            }
        }
    }

    pub fn active_voices(&self) -> usize {
        self.voices
            .iter()
            .filter(|voice| voice.stage != Stage::Off)
            .count()
    }

    pub fn process_sample(&mut self) -> f32 {
        let mut sum = 0.0f32;
        let mut count = 0usize;
        for voice in &mut self.voices {
            if voice.stage == Stage::Off {
                continue;
            }
            let dt = 1.0 / self.sample_rate;
            match voice.stage {
                Stage::Off => {}
                Stage::Attack => {
                    voice.level = (voice.stage_time / self.attack).min(1.0);
                    if voice.stage_time >= self.attack {
                        voice.level = 1.0;
                        voice.stage = Stage::Decay;
                        voice.stage_time = 0.0;
                    }
                }
                Stage::Decay => {
                    voice.level =
                        1.0 - (1.0 - self.sustain) * (voice.stage_time / self.decay).min(1.0);
                    if voice.stage_time >= self.decay {
                        voice.level = self.sustain;
                        voice.stage = Stage::Sustain;
                        voice.stage_time = 0.0;
                    }
                }
                Stage::Sustain => voice.level = self.sustain,
                Stage::Release => {
                    voice.level =
                        voice.release_level * (1.0 - voice.stage_time / self.release).max(0.0);
                    if voice.stage_time >= self.release {
                        voice.level = 0.0;
                        voice.stage = Stage::Off;
                    }
                }
            }
            if voice.stage == Stage::Off {
                continue;
            }
            let phase = voice.phase / TAU;
            let wave = match self.waveform {
                1 => (phase * 2.0 - 1.0) as f32,
                2 => {
                    if phase < 0.5 {
                        1.0
                    } else {
                        -1.0
                    }
                }
                3 => (4.0 * (phase - 0.5).abs() - 1.0) as f32,
                _ => voice.phase.sin() as f32,
            };
            sum += wave * voice.velocity * voice.level;
            count += 1;
            voice.phase += TAU
                * voice.frequency
                * self
                    .bend_ratio
                    .get(voice.channel as usize)
                    .copied()
                    .unwrap_or(1.0)
                / self.sample_rate as f64;
            if voice.phase >= TAU {
                voice.phase -= TAU;
            }
            voice.stage_time += dt;
        }
        if count > 0 {
            sum * self.level / (count as f32).sqrt()
        } else {
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reset_silences_held_voice_and_retains_current_sound_controls() {
        let mut synth = VoiceSynth::new(48_000.0);
        assert!(synth.set_parameter(0, 2.0));
        assert!(synth.set_parameter(5, 0.7));
        synth.event(EventKind::PitchBend {
            channel: 0,
            value: 12288,
        });
        synth.event(EventKind::NoteOn {
            channel: 0,
            note: 69,
            velocity: 100,
        });
        for _ in 0..2048 {
            synth.process_sample();
        }
        assert_eq!(synth.active_voices(), 1);
        synth.reset();
        assert_eq!(synth.active_voices(), 0);
        assert_eq!(synth.process_sample(), 0.0);
        assert_eq!(synth.bend_ratio[0], 1.0);
        let mut fresh = VoiceSynth::new(48_000.0);
        assert!(fresh.set_parameter(0, 2.0));
        assert!(fresh.set_parameter(5, 0.7));
        let note = EventKind::NoteOn {
            channel: 0,
            note: 69,
            velocity: 100,
        };
        synth.event(note);
        fresh.event(note);
        for _ in 0..128 {
            assert_eq!(synth.process_sample(), fresh.process_sample());
        }
    }

    #[test]
    fn note_off_during_attack_releases_without_stuck_voice() {
        let mut synth = VoiceSynth::new(48_000.0);
        synth.set_parameter(1, 0.1);
        synth.set_parameter(4, 0.002);
        synth.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        });
        for _ in 0..48 {
            synth.process_sample();
        }
        assert_eq!(synth.active_voices(), 1);
        synth.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        for _ in 0..100 {
            synth.process_sample();
        }
        assert_eq!(synth.active_voices(), 0);
    }

    #[test]
    fn ninth_note_steals_oldest_voice() {
        let mut synth = VoiceSynth::new(48_000.0);
        for note in 60..69 {
            synth.event(EventKind::NoteOn {
                channel: 0,
                note,
                velocity: 100,
            });
        }
        assert_eq!(synth.active_voices(), 8);
        assert!(!synth.voices.iter().any(|voice| voice.note == 60));
        assert!(synth.voices.iter().any(|voice| voice.note == 68));
    }

    #[test]
    fn pitch_bend_follows_channel_and_applies_to_future_notes() {
        let mut synth = VoiceSynth::new(48_000.0);
        synth.event(EventKind::PitchBend {
            channel: 1,
            value: 12288,
        });
        for channel in [0, 1] {
            synth.event(EventKind::NoteOn {
                channel,
                note: 69,
                velocity: 100,
            });
        }
        assert_eq!(synth.bend_ratio[0], 1.0);
        assert!((synth.bend_ratio[1] - 2.0f64.sqrt()).abs() < 1e-12);
        synth.process_sample();
        let before: Vec<f64> = synth
            .voices
            .iter()
            .filter(|voice| voice.stage != Stage::Off)
            .map(|voice| voice.phase)
            .collect();
        assert!((before[1] / before[0] - 2.0f64.sqrt()).abs() < 1e-12);
        synth.event(EventKind::PitchBend {
            channel: 1,
            value: 8192,
        });
        synth.process_sample();
        let after: Vec<f64> = synth
            .voices
            .iter()
            .filter(|voice| voice.stage != Stage::Off)
            .map(|voice| voice.phase)
            .collect();
        assert!((after[1] - before[1] - (after[0] - before[0])).abs() < 1e-12);
    }

    #[test]
    fn invalid_midi_channel_does_not_panic_in_core() {
        let mut synth = VoiceSynth::new(48_000.0);
        synth.event(EventKind::NoteOn {
            channel: 255,
            note: 69,
            velocity: 100,
        });
        synth.event(EventKind::PitchBend {
            channel: 255,
            value: 12288,
        });
        assert!(synth.process_sample().is_finite());
    }
}
