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
    trigger: f32,
    stage: Stage,
    level: f32,
    start_level: f32,
    stage_time: f64,
}

impl AdsrEnvelope {
    /// Carry only audible history. The candidate keeps its authored ADSR targets
    /// and gate; a changed gate starts a new stage from the retained level.
    pub fn transfer_processing_state_from(&mut self, old: &Self) -> bool {
        if self.dt != old.dt { return false; }
        let requested_gate = self.gate;
        let retrigger = self.trigger != old.trigger && self.trigger > 0.0;
        self.stage = old.stage;
        self.level = old.level;
        self.start_level = old.start_level;
        self.stage_time = old.stage_time;
        self.gate = old.gate;
        self.set_gate(requested_gate);
        if requested_gate && retrigger { self.retrigger(); }
        true
    }
    fn retrigger(&mut self) {
        self.stage = Stage::Attack;
        self.stage_time = 0.0;
        self.start_level = self.level;
    }
    pub fn reset(&mut self) {
        self.gate = false;
        self.reset_processing();
    }
    /// Clear audible history while retaining authored gate and parameter targets.
    pub fn reset_processing(&mut self) {
        self.stage = if self.gate { Stage::Attack } else { Stage::Off };
        self.level = 0.0;
        self.start_level = 0.0;
        self.stage_time = 0.0;
    }

    pub fn level(&self) -> f32 {
        self.level
    }

    pub fn target_parameter(&self, id: u32) -> Option<f32> {
        match id {
            0 => Some(self.attack),
            1 => Some(self.decay),
            2 => Some(self.sustain),
            3 => Some(self.release),
            4 => Some(u32::from(self.gate) as f32),
            5 => Some(self.trigger),
            _ => None,
        }
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
            trigger: 0.0,
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
            5 => {
                let changed = self.trigger != value;
                self.trigger = value;
                if changed && self.gate && value > 0.0 { self.retrigger(); }
            },
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
    fn live_transfer_keeps_held_and_releasing_history_with_candidate_targets() {
        let mut old = AdsrEnvelope::new(1_000.0);
        old.set_gate(true);
        old.set_parameter(5, 1.0);
        for _ in 0..400 { old.process_sample(); }
        let mut next = AdsrEnvelope::new(1_000.0);
        next.set_gate(true);
        next.set_parameter(5, 1.0);
        next.set_parameter(3, 0.08);
        assert!(next.transfer_processing_state_from(&old));
        assert_eq!(next.process_sample(), old.process_sample());
        assert_eq!(next.target_parameter(3), Some(0.08));
        // Source edits preserve gate targets, but an authored gate-off releases
        // from the actual held level and uses the candidate's release time.
        let before = next.level();
        next.set_gate(false);
        let mut replacement = AdsrEnvelope::new(1_000.0);
        replacement.set_parameter(3, 0.08);
        replacement.set_parameter(5, 1.0);
        assert!(replacement.transfer_processing_state_from(&next));
        assert!((replacement.process_sample() - before).abs() < 1e-6);
        for _ in 0..90 { replacement.process_sample(); }
        assert!(replacement.is_idle());
    }

    #[test]
    fn retrigger_sequence_restarts_held_envelope_from_current_level_once() {
        let mut envelope = AdsrEnvelope::new(1_000.0);
        envelope.set_gate(true);
        envelope.set_parameter(5, 1.0);
        for _ in 0..400 { envelope.process_sample(); }
        let before = envelope.level();
        envelope.set_parameter(5, 2.0);
        assert_eq!(envelope.process_sample(), before);
        for _ in 0..10 { envelope.process_sample(); }
        let rising = envelope.level();
        envelope.set_parameter(5, 2.0);
        assert!(envelope.process_sample() > rising);
        let mut next = AdsrEnvelope::new(1_000.0);
        next.set_gate(true);
        next.set_parameter(5, 3.0);
        assert!(next.transfer_processing_state_from(&envelope));
        assert_eq!(next.process_sample(), envelope.level());
    }

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
