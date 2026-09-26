//! Patchable stereo ADSR. Time curves follow the legacy scalar node; an early
//! gate-off releases from the current level instead of waiting for sustain.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Stage {
    Off,
    Attack,
    Decay,
    Sustain,
    Release,
}

pub struct AdsrEnvelope {
    dt: f32,
    attack: f32,
    decay: f32,
    sustain: f32,
    release: f32,
    gate: bool,
    stage: Stage,
    level: f32,
    start_level: f32,
    stage_time: f64,
}

impl AdsrEnvelope {
    pub fn reset(&mut self) {
        self.gate = false;
        self.stage = Stage::Off;
        self.level = 0.0;
        self.start_level = 0.0;
        self.stage_time = 0.0;
    }

    pub fn level(&self) -> f32 {
        self.level
    }

    pub fn is_idle(&self) -> bool {
        self.stage == Stage::Off
    }

    pub fn is_releasing(&self) -> bool {
        self.stage == Stage::Release
    }

    pub fn new(sample_rate: f32) -> Self {
        Self {
            dt: 1.0 / sample_rate,
            attack: 0.05,
            decay: 0.2,
            sustain: 0.7,
            release: 0.4,
            gate: false,
            stage: Stage::Off,
            level: 0.0,
            start_level: 0.0,
            stage_time: 0.0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.attack = value.max(0.001),
            1 => self.decay = value.max(0.001),
            2 => self.sustain = value.clamp(0.0, 1.0),
            3 => self.release = value.max(0.001),
            4 => self.set_gate(value >= 0.5),
            _ => return false,
        }
        true
    }

    pub fn set_gate(&mut self, gate: bool) {
        if gate && !self.gate {
            self.stage = Stage::Attack;
            self.stage_time = 0.0;
            self.start_level = self.level;
        } else if !gate && self.gate && matches!(self.stage, Stage::Attack | Stage::Decay) {
            self.stage = Stage::Release;
            self.stage_time = 0.0;
            self.start_level = self.level;
        }
        self.gate = gate;
    }

    pub fn process_sample(&mut self) -> f32 {
        match self.stage {
            Stage::Off => {
                self.level = 0.0;
            }
            Stage::Attack => {
                let progress = self.stage_time as f32 / self.attack;
                if progress >= 1.0 {
                    self.level = 1.0;
                    self.stage = Stage::Decay;
                    self.stage_time = 0.0;
                } else {
                    self.level = self.start_level + (1.0 - self.start_level) * progress;
                }
            }
            Stage::Decay => {
                let progress = self.stage_time as f32 / self.decay;
                if progress >= 1.0 {
                    self.level = self.sustain;
                    self.stage = Stage::Sustain;
                } else {
                    self.level = 1.0 - (1.0 - self.sustain) * progress;
                }
            }
            Stage::Sustain => {
                self.level = self.sustain;
                if !self.gate {
                    self.stage = Stage::Release;
                    self.stage_time = 0.0;
                    self.start_level = self.level;
                }
            }
            Stage::Release => {
                let progress = self.stage_time as f32 / self.release;
                if progress >= 1.0 {
                    self.level = 0.0;
                    self.stage = Stage::Off;
                } else {
                    self.level = self.start_level * (1.0 - progress);
                }
            }
        }
        self.stage_time += self.dt as f64;
        self.level
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_during_attack_falls_from_current_level() {
        let mut envelope = AdsrEnvelope::new(1_000.0);
        envelope.set_parameter(0, 0.1);
        envelope.set_parameter(3, 0.01);
        envelope.set_gate(true);
        for _ in 0..20 {
            envelope.process_sample();
        }
        let before = envelope.level;
        assert!(before > 0.0);
        envelope.set_gate(false);
        assert!((envelope.process_sample() - before).abs() < 1e-6);
        for _ in 0..12 {
            envelope.process_sample();
        }
        assert_eq!(envelope.level, 0.0);
    }

    #[test]
    fn retrigger_during_release_starts_at_current_level() {
        let mut envelope = AdsrEnvelope::new(1_000.0);
        envelope.set_parameter(0, 0.01);
        envelope.set_parameter(1, 0.01);
        envelope.set_parameter(3, 0.1);
        envelope.set_gate(true);
        for _ in 0..50 {
            envelope.process_sample();
        }
        envelope.set_gate(false);
        for _ in 0..20 {
            envelope.process_sample();
        }
        let before = envelope.level;
        envelope.set_gate(true);
        assert!((envelope.process_sample() - before).abs() < 1e-6);
    }
}
