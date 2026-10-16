//! Main rack LFO control source, following `Main/lib/lfo_runtime.lua`.
//! Its state and routing are owned by the audio engine; UI reads snapshots.

#[derive(Clone, Copy, Default)]
pub struct LfoOutputs {
    pub phase: f32,
    pub out: f32,
    pub inv: f32,
    pub uni: f32,
    pub eoc: f32,
}

pub struct MainLfo {
    sample_rate: f64,
    phase: f64,
    rate: f64,
    shape: u32,
    depth: f32,
    start_phase: f64,
    retrig: bool,
    reset_high: bool,
    sync_high: bool,
    random_state: u32,
    held: f32,
    noise_current: f32,
    noise_next: f32,
    outputs: LfoOutputs,
}

impl MainLfo {
    pub fn new(sample_rate: f32) -> Self {
        let mut lfo = Self {
            sample_rate: sample_rate as f64,
            phase: 0.0,
            rate: 1.0,
            shape: 0,
            depth: 1.0,
            start_phase: 0.0,
            retrig: true,
            reset_high: false,
            sync_high: false,
            random_state: 0x41c6_ce57,
            held: 0.0,
            noise_current: 0.0,
            noise_next: 0.0,
            outputs: LfoOutputs::default(),
        };
        lfo.held = lfo.random_bipolar();
        lfo.noise_current = lfo.random_bipolar();
        lfo.noise_next = lfo.random_bipolar();
        lfo.refresh(false);
        lfo
    }

    fn random_bipolar(&mut self) -> f32 {
        let mut value = self.random_state;
        value ^= value << 13;
        value ^= value >> 17;
        value ^= value << 5;
        self.random_state = value;
        value as f32 / u32::MAX as f32 * 2.0 - 1.0
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 if (0.0..=5.0).contains(&value) => self.shape = value.round() as u32,
            1 if (0.01..=20.0).contains(&value) => self.rate = value as f64,
            2 if (0.0..=1.0).contains(&value) => self.depth = value,
            3 if (0.0..=360.0).contains(&value) => self.start_phase = value as f64 / 360.0,
            4 if value == 0.0 || value == 1.0 => self.retrig = value == 1.0,
            _ => return false,
        }
        self.refresh(false);
        true
    }

    pub fn set_gate(&mut self, id: u32, high: bool) -> bool {
        match id {
            0 => {
                if high && !self.reset_high && self.retrig {
                    self.reset_phase();
                }
                self.reset_high = high;
            }
            1 => {
                if high && !self.sync_high && self.retrig {
                    self.reset_phase();
                }
                self.sync_high = high;
            }
            _ => return false,
        }
        self.refresh(false);
        true
    }

    fn reset_phase(&mut self) {
        self.phase = self.start_phase.rem_euclid(1.0);
        match self.shape {
            4 => self.held = self.random_bipolar(),
            5 => {
                self.noise_current = self.random_bipolar();
                self.noise_next = self.random_bipolar();
            }
            _ => {}
        }
    }

    fn refresh(&mut self, eoc: bool) {
        let shape = match self.shape {
            1 => 1.0 - ((self.phase * 4.0) - 2.0).abs(),
            2 => self.phase * 2.0 - 1.0,
            3 => {
                if self.phase < 0.5 {
                    1.0
                } else {
                    -1.0
                }
            }
            4 => self.held as f64,
            5 => {
                (self.noise_current + (self.noise_next - self.noise_current) * self.phase as f32)
                    as f64
            }
            _ => (std::f64::consts::TAU * self.phase).sin(),
        } as f32;
        let out = (shape * self.depth).clamp(-1.0, 1.0);
        self.outputs = LfoOutputs {
            phase: self.phase as f32,
            out,
            inv: -out,
            uni: ((shape + 1.0) * 0.5 * self.depth).clamp(0.0, 1.0),
            eoc: if eoc { 1.0 } else { 0.0 },
        };
    }

    pub fn advance(&mut self, frames: usize) -> LfoOutputs {
        let mut eoc_in_block = false;
        for _ in 0..frames {
            let mut eoc = false;
            if !self.sync_high {
                self.phase += self.rate / self.sample_rate;
                if self.phase >= 1.0 {
                    self.phase -= self.phase.floor();
                    eoc = true;
                    eoc_in_block = true;
                    match self.shape {
                        4 => self.held = self.random_bipolar(),
                        5 => {
                            self.noise_current = self.noise_next;
                            self.noise_next = self.random_bipolar();
                        }
                        _ => {}
                    }
                }
            }
            self.refresh(eoc);
        }
        self.outputs.eoc = if eoc_in_block { 1.0 } else { 0.0 };
        self.outputs
    }

    pub fn outputs(&self) -> LfoOutputs {
        self.outputs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_sine_outputs_and_retriggered_phase() {
        let mut lfo = MainLfo::new(1_000.0);
        let at_quarter = lfo.advance(250);
        assert!((at_quarter.out - 1.0).abs() < 1e-5);
        assert!((at_quarter.inv + 1.0).abs() < 1e-5);
        assert!((at_quarter.uni - 1.0).abs() < 1e-5);
        assert!(lfo.set_parameter(3, 90.0));
        assert!(lfo.set_gate(0, true));
        assert!((lfo.outputs().phase - 0.25).abs() < 1e-5);
        assert!(lfo.set_gate(0, false));
        assert_eq!(lfo.advance(750).eoc, 1.0);
    }

    #[test]
    fn hold_and_noise_are_finite_and_sync_pauses_phase() {
        let mut lfo = MainLfo::new(8_000.0);
        for shape in 0..6 {
            assert!(lfo.set_parameter(0, shape as f32));
            let out = lfo.advance(8_000);
            assert!(out.out.is_finite() && (-1.0..=1.0).contains(&out.out));
        }
        assert!(lfo.set_gate(1, true));
        let phase = lfo.outputs().phase;
        assert_eq!(lfo.advance(1_000).phase, phase);
        assert!(lfo.set_gate(1, false));
        assert_ne!(lfo.advance(100).phase, phase);
    }

    #[test]
    fn deterministic_shapes_match_legacy_quarter_cycle_values() {
        // Main/lib/lfo_runtime.lua:shapeValue at 0°, 90°, 180°, and 270°.
        let expected = [
            [0.0, 1.0, 0.0, -1.0],
            [-1.0, 0.0, 1.0, 0.0],
            [-1.0, -0.5, 0.0, 0.5],
            [1.0, 1.0, -1.0, -1.0],
        ];
        let mut lfo = MainLfo::new(8_000.0);
        for (shape, quarters) in expected.into_iter().enumerate() {
            assert!(lfo.set_parameter(0, shape as f32));
            for (quarter, value) in quarters.into_iter().enumerate() {
                assert!(lfo.set_parameter(3, quarter as f32 * 90.0));
                assert!(lfo.set_gate(0, true));
                assert!((lfo.outputs().out - value).abs() < 1e-5);
                assert!(lfo.set_gate(0, false));
            }
        }
    }
}
