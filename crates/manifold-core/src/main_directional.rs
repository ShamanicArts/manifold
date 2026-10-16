//! Main sample voice FM/Sync control-block motion, translated from sample_synth.lua.
use std::f64::consts::TAU;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DirectionalUpdate {
    pub oscillator_frequency: f32,
    pub sample_speed: f32,
    pub sync_enabled: bool,
    pub sample_retrigger: bool,
    pub sample_play: bool,
}

pub struct MainDirectionalMotion {
    sample_rate: f64,
    mode: u32,
    base_frequency: f32,
    base_speed: f32,
    depth: f32,
    wave_to_sample: f32,
    sample_to_wave: f32,
    retrigger: bool,
    blend_position: f32,
    gate: bool,
    blend_phase: f64,
    sync_phase: f64,
}

impl MainDirectionalMotion {
    pub fn new(sample_rate: f32) -> Self {
        Self {
            sample_rate: sample_rate as f64,
            mode: 0,
            base_frequency: 220.0,
            base_speed: 1.0,
            depth: 0.5,
            wave_to_sample: 0.5,
            sample_to_wave: 0.0,
            retrigger: true,
            blend_position: 1.0,
            gate: true,
            blend_phase: 0.0,
            sync_phase: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.blend_phase = 0.0;
        self.sync_phase = 0.0;
    }

    pub fn active(&self) -> bool {
        matches!(self.mode, 2 | 3)
    }

    pub fn baseline(&self) -> DirectionalUpdate {
        DirectionalUpdate {
            oscillator_frequency: self.base_frequency,
            sample_speed: self.base_speed,
            sync_enabled: false,
            sample_retrigger: false,
            sample_play: false,
        }
    }

    pub fn base_frequency(&self) -> f32 {
        self.base_frequency
    }

    pub fn base_speed(&self) -> f32 {
        self.base_speed
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 if value == 0.0 || value == 2.0 || value == 3.0 => self.mode = value as u32,
            1 => self.base_frequency = value.clamp(20.0, 8000.0),
            2 => self.base_speed = value.clamp(0.05, 8.0),
            3 => self.depth = value.clamp(0.0, 1.0),
            4 => self.wave_to_sample = value.clamp(0.0, 1.0),
            5 => self.sample_to_wave = value.clamp(0.0, 1.0),
            6 => self.retrigger = value >= 0.5,
            7 => self.blend_position = value.clamp(-1.0, 1.0),
            8 => self.gate = value >= 0.5,
            _ => return false,
        }
        true
    }

    pub fn tick(&mut self, frames: usize, sample_position: f32) -> Option<DirectionalUpdate> {
        self.tick_with_speed(frames, sample_position, self.base_speed)
    }

    pub fn tick_with_speed(
        &mut self,
        frames: usize,
        sample_position: f32,
        base_speed: f32,
    ) -> Option<DirectionalUpdate> {
        if !self.gate {
            self.blend_phase = 0.0;
            self.sync_phase = 0.0;
            return None;
        }
        let base_frequency = self.base_frequency as f64;
        let phase_increment = base_frequency / self.sample_rate * frames as f64;
        self.blend_phase = (self.blend_phase + phase_increment).fract();
        if !self.active() {
            return None;
        }
        let oscillator_modulation = (self.blend_phase * TAU).sin();
        let sample_modulation = ((sample_position.clamp(0.0, 1.0) as f64) * TAU).sin();
        let mut oscillator_frequency = base_frequency;
        let mut sample_speed = base_speed as f64;
        let mut sample_retrigger = false;
        let mut sample_play = false;
        if self.mode == 2 {
            let sample_amount = self.wave_to_sample as f64 * self.depth as f64 * 0.75;
            let wave_amount = self.sample_to_wave as f64 * self.depth as f64 * 0.35;
            sample_speed =
                (sample_speed * (1.0 + oscillator_modulation * sample_amount)).clamp(0.05, 8.0);
            oscillator_frequency =
                (base_frequency * (1.0 + sample_modulation * wave_amount)).clamp(20.0, 8000.0);
        } else {
            self.sync_phase += phase_increment;
            if self.sync_phase >= 1.0 {
                self.sync_phase = self.sync_phase.fract();
                sample_retrigger = self.retrigger;
                sample_play = !self.retrigger;
            }
        }
        Some(DirectionalUpdate {
            oscillator_frequency: oscillator_frequency as f32,
            sample_speed: sample_speed as f32,
            sync_enabled: self.mode == 3 && self.blend_position < 0.0,
            sample_retrigger,
            sample_play,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fm_uses_block_phase_and_previous_sample_position() {
        let mut motion = MainDirectionalMotion::new(48_000.0);
        for (id, value) in [(0, 2.0), (1, 220.0), (2, 1.0), (3, 0.8), (4, 0.6), (5, 0.4)] {
            assert!(motion.set_parameter(id, value));
        }
        let result = motion.tick(128, 0.25).unwrap();
        let phase = (220.0_f64 / 48_000.0 * 128.0).fract();
        let expected_speed = 1.0 + (phase * TAU).sin() * 0.6 * 0.8 * 0.75;
        let expected_frequency = 220.0 * (1.0 + 0.4 * 0.8 * 0.35);
        assert!((result.sample_speed as f64 - expected_speed).abs() < 1e-6);
        assert!((result.oscillator_frequency as f64 - expected_frequency).abs() < 1e-5);
        assert!(!result.sync_enabled && !result.sample_retrigger);
    }

    #[test]
    fn normal_mode_keeps_the_fm_phase_clock_running() {
        let mut motion = MainDirectionalMotion::new(48_000.0);
        motion.set_parameter(1, 220.0);
        motion.set_parameter(3, 1.0);
        motion.set_parameter(4, 1.0);
        assert!(motion.tick(128, 0.0).is_none());
        motion.set_parameter(0, 2.0);
        let update = motion.tick(128, 0.0).unwrap();
        let phase = (220.0_f64 / 48_000.0 * 256.0).fract();
        let expected = 1.0 + (phase * TAU).sin() * 0.75;
        assert!((update.sample_speed as f64 - expected).abs() < 1e-6);
    }

    #[test]
    fn sync_retriggers_on_phase_wrap_and_only_hard_syncs_wave_facing_blends() {
        let mut motion = MainDirectionalMotion::new(48_000.0);
        for (id, value) in [(0, 3.0), (1, 400.0), (7, -0.2)] {
            assert!(motion.set_parameter(id, value));
        }
        assert!(!motion.tick(64, 0.3).unwrap().sample_retrigger);
        let wrapped = motion.tick(64, 0.3).unwrap();
        assert!(wrapped.sample_retrigger && wrapped.sync_enabled);
        motion.set_parameter(6, 0.0);
        motion.set_parameter(7, 0.2);
        let resumed = motion.tick(128, 0.3).unwrap();
        assert!(resumed.sample_play && !resumed.sync_enabled);
        motion.set_parameter(8, 0.0);
        assert!(motion.tick(128, 0.3).is_none());
        motion.set_parameter(8, 1.0);
        assert!(!motion.tick(64, 0.3).unwrap().sample_play);
    }
}
