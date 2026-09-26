//! Legacy Standalone FX gain routing, separate from effect kernels.
//! Each visited effect can keep processing upstream while its output gate closes.

const TYPES: usize = 21;
const CENTER_PAN: f32 = std::f32::consts::FRAC_1_SQRT_2;

fn wet_gain(effect_type: u32) -> f32 {
    match effect_type {
        0 | 9 | 18 => 1.4,
        13 => 1.5,
        19 => 1.2,
        4 | 8 => 1.1,
        _ => 1.0,
    }
}

/// Reproduces the old slot's dry Gain, per-effect gates, wet Mixer and trim,
/// and output Mixer. The caller supplies already processed stereo effect samples.
/// No effect is prepared or reset here; kernel lifetime stays with the caller.
pub struct LegacyFxRouting {
    smoothing: f32,
    selected: u32,
    mix: f32,
    dry: f32,
    dry_target: f32,
    trim: f32,
    trim_target: f32,
    gates: [f32; TYPES],
    gate_targets: [f32; TYPES],
}

impl LegacyFxRouting {
    pub fn new(sample_rate: f32, selected: u32, mix: f32) -> Option<Self> {
        if !sample_rate.is_finite()
            || sample_rate <= 1.0
            || selected as usize >= TYPES
            || !mix.is_finite()
        {
            return None;
        }
        let mix = mix.clamp(0.0, 1.0);
        let mut gates = [0.0; TYPES];
        gates[selected as usize] = 1.0;
        Some(Self {
            smoothing: ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32)
                .clamp(0.0001, 1.0),
            selected,
            mix,
            dry: 1.0 - mix,
            dry_target: 1.0 - mix,
            trim: mix * wet_gain(selected),
            trim_target: mix * wet_gain(selected),
            gates,
            gate_targets: gates,
        })
    }

    pub fn select(&mut self, effect_type: u32) -> bool {
        if effect_type as usize >= TYPES {
            return false;
        }
        self.selected = effect_type;
        self.gate_targets.fill(0.0);
        self.gate_targets[effect_type as usize] = 1.0;
        self.trim_target = self.mix * wet_gain(effect_type);
        true
    }

    pub fn set_mix(&mut self, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        self.mix = value.clamp(0.0, 1.0);
        self.dry_target = 1.0 - self.mix;
        self.trim_target = self.mix * wet_gain(self.selected);
        true
    }

    /// Advance one sample of all gain envelopes and mix the supplied effect outputs.
    /// A future wrapper must keep visited effect kernels processing even at zero gate.
    pub fn process_sample(&mut self, input: [f32; 2], effects: &[[f32; 2]; TYPES]) -> [f32; 2] {
        self.dry += (self.dry_target - self.dry) * self.smoothing;
        self.trim += (self.trim_target - self.trim) * self.smoothing;
        let mut wet = [0.0; 2];
        for (index, effect) in effects.iter().enumerate() {
            self.gates[index] += (self.gate_targets[index] - self.gates[index]) * self.smoothing;
            wet[0] += effect[0] * self.gates[index] * CENTER_PAN;
            wet[1] += effect[1] * self.gates[index] * CENTER_PAN;
        }
        [
            input[0] * self.dry * CENTER_PAN + wet[0] * self.trim * CENTER_PAN,
            input[1] * self.dry * CENTER_PAN + wet[1] * self.trim * CENTER_PAN,
        ]
    }
}
