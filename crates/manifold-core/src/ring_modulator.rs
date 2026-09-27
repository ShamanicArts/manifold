//! Stereo ring modulator with an internal oscillator or optional stereo audio modulator bus.

pub const PARAM_COUNT: usize = 5;
pub const DEFAULTS: [f32; PARAM_COUNT] = [180.0, 1.0, 1.0, 0.0, 1.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() || id as usize >= PARAM_COUNT {
        return false;
    }
    params[id as usize] = match id {
        0 => value.clamp(0.1, 8000.0),
        1 | 2 => value.clamp(0.0, 1.0),
        3 => value.clamp(0.0, 180.0),
        4 => f32::from(value >= 0.5),
        _ => unreachable!(),
    };
    true
}

pub struct RingModulator {
    target: [f32; PARAM_COUNT],
    current: [f32; 4],
    smoothing: f32,
    sample_rate: f32,
    phase: f32,
}

impl RingModulator {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let sample_rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44100.0
        };
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        Self {
            current: [target[0], target[1], target[2], target[3]],
            target,
            smoothing: ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32)
                .clamp(0.0001, 1.0),
            sample_rate,
            phase: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.reset_to(self.target);
    }

    pub fn reset_to(&mut self, params: [f32; PARAM_COUNT]) {
        self.target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut self.target, id as u32, value);
        }
        self.current = [
            self.target[0],
            self.target[1],
            self.target[2],
            self.target[3],
        ];
        self.phase = 0.0;
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn process_planar(
        &mut self,
        input: [&[f32]; 2],
        modulator: Option<[&[f32]; 2]>,
        output: [&mut [f32]; 2],
    ) {
        self.process_planar_inner(input, modulator, false, output);
    }

    /// The old GraphRuntime supplies a silent second input view even when the
    /// optional modulation bus has no connection. Its Ring node therefore
    /// takes the external-bus path rather than running its oscillator.
    pub fn process_planar_with_silent_external(
        &mut self,
        input: [&[f32]; 2],
        output: [&mut [f32]; 2],
    ) {
        self.process_planar_inner(input, None, true, output);
    }

    fn process_planar_inner(
        &mut self,
        input: [&[f32]; 2],
        modulator: Option<[&[f32]; 2]>,
        silent_external: bool,
        output: [&mut [f32]; 2],
    ) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        if self.target[4] < 0.5 {
            out_l.fill(0.0);
            out_r.fill(0.0);
            self.current[1] = 0.0;
            self.current[2] = 0.0;
            return;
        }
        for frame in 0..in_l.len() {
            for id in 0..4 {
                self.current[id] += (self.target[id] - self.current[id]) * self.smoothing;
            }
            let [mod_l, mod_r] = if let Some([bus_l, bus_r]) = modulator {
                [bus_l[frame].clamp(-1.0, 1.0), bus_r[frame].clamp(-1.0, 1.0)]
            } else if silent_external {
                [0.0, 0.0]
            } else {
                self.phase += self.current[0] / self.sample_rate;
                if self.phase >= 1.0 {
                    self.phase -= 1.0;
                }
                let spread_phase = self.current[3] / 360.0;
                [
                    (2.0 * std::f32::consts::PI * self.phase).sin(),
                    (2.0 * std::f32::consts::PI * (self.phase + spread_phase)).sin(),
                ]
            };
            let dry = 1.0 - self.current[2];
            let wet_l = in_l[frame] * ((1.0 - self.current[1]) + self.current[1] * mod_l);
            let wet_r = in_r[frame] * ((1.0 - self.current[1]) + self.current[1] * mod_r);
            out_l[frame] = in_l[frame] * dry + wet_l * self.current[2];
            out_r[frame] = in_r[frame] * dry + wet_r * self.current[2];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn silent_legacy_bus_differs_from_internal_oscillator() {
        let mut internal = RingModulator::new(48_000.0, [120.0, 1.0, 1.0, 36.0, 1.0]);
        let mut old_graph = RingModulator::new(48_000.0, [120.0, 1.0, 1.0, 36.0, 1.0]);
        let carrier = [0.5; 128];
        let mut internal_l = [0.0; 128];
        let mut internal_r = [0.0; 128];
        let mut old_l = [0.0; 128];
        let mut old_r = [0.0; 128];
        internal.process_planar(
            [&carrier, &carrier],
            None,
            [&mut internal_l, &mut internal_r],
        );
        old_graph
            .process_planar_with_silent_external([&carrier, &carrier], [&mut old_l, &mut old_r]);
        assert!(internal_l.iter().any(|sample| sample.abs() > 0.1));
        assert!(
            old_l
                .iter()
                .chain(old_r.iter())
                .all(|sample| *sample == 0.0)
        );
    }

    #[test]
    fn external_bus_bypasses_oscillator_and_enable_gates_output() {
        let mut node = RingModulator::new(48_000.0, [180.0, 1.0, 1.0, 0.0, 1.0]);
        let carrier = [0.5; 8];
        let positive = [1.0; 8];
        let negative = [-1.0; 8];
        let mut l = [0.0; 8];
        let mut r = [0.0; 8];
        node.process_planar(
            [&carrier, &carrier],
            Some([&positive, &negative]),
            [&mut l, &mut r],
        );
        assert_eq!(l, carrier);
        assert_eq!(r, [-0.5; 8]);
        node.set_parameter(4, 0.0);
        node.process_planar([&carrier, &carrier], None, [&mut l, &mut r]);
        assert_eq!(l, [0.0; 8]);
        assert_eq!(r, [0.0; 8]);
    }
}
