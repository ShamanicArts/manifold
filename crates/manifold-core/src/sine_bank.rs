//! Fixed-capacity manual partial bank from the legacy SineBankNode.

use std::f64::consts::TAU;

pub const MAX_PARTIALS: usize = 32;
const MAX_UNISON: usize = 8;
pub const PARAM_COUNT: usize = 11;
pub const DEFAULTS: [f32; PARAM_COUNT] = [440.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0];

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct Partial {
    pub frequency: f32,
    pub amplitude: f32,
    pub phase: f32,
    pub decay_rate: f32,
}

#[derive(Clone, Copy)]
pub struct PartialSet {
    pub fundamental: f32,
    pub count: usize,
    pub partials: [Partial; MAX_PARTIALS],
}

impl Default for PartialSet {
    fn default() -> Self {
        Self {
            fundamental: 440.0,
            count: 0,
            partials: [Partial::default(); MAX_PARTIALS],
        }
    }
}

impl PartialSet {
    pub fn validate(&self) -> bool {
        self.count <= MAX_PARTIALS
            && self.fundamental.is_finite()
            && self.fundamental > 0.0
            && self.partials[..self.count].iter().all(|partial| {
                partial.frequency.is_finite()
                    && (0.0..=24_000.0).contains(&partial.frequency)
                    && partial.amplitude.is_finite()
                    && partial.amplitude >= 0.0
                    && partial.phase.is_finite()
                    && partial.decay_rate.is_finite()
                    && partial.decay_rate >= 0.0
            })
    }
}

pub struct SineBank {
    sample_rate: f64,
    target: [f32; PARAM_COUNT],
    current_frequency: f32,
    current_amplitude: f32,
    current_detune: f32,
    current_spread: f32,
    frequency_smoothing: f32,
    amplitude_smoothing: f32,
    detune_smoothing: f32,
    spread_smoothing: f32,
    unison_smoothing: f32,
    partial_smoothing: f32,
    partials: PartialSet,
    running_phases: [[f64; MAX_PARTIALS]; MAX_UNISON],
    current_partial_amplitudes: [f32; MAX_PARTIALS],
    unison_gains: [f32; MAX_UNISON],
    last_requested_unison: usize,
    previous_sync: f32,
}

impl SineBank {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let rate = if sample_rate > 1.0 {
            sample_rate as f64
        } else {
            44_100.0
        };
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let smooth =
            |seconds: f64| ((1.0 - (-1.0 / (seconds * rate)).exp()) as f32).clamp(0.0001, 1.0);
        let mut node = Self {
            sample_rate: rate,
            target,
            current_frequency: target[0],
            current_amplitude: target[1],
            current_detune: target[5],
            current_spread: target[3],
            frequency_smoothing: smooth(0.020),
            amplitude_smoothing: smooth(0.010),
            detune_smoothing: smooth(0.012),
            spread_smoothing: smooth(0.012),
            unison_smoothing: smooth(0.008),
            partial_smoothing: smooth(0.005),
            partials: PartialSet::default(),
            running_phases: [[0.0; MAX_PARTIALS]; MAX_UNISON],
            current_partial_amplitudes: [0.0; MAX_PARTIALS],
            unison_gains: [0.0; MAX_UNISON],
            last_requested_unison: 1,
            previous_sync: 0.0,
        };
        node.reset();
        node
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn load_partials(&mut self, next: PartialSet) -> bool {
        if !next.validate() {
            return false;
        }
        let previous_count = self.partials.count;
        self.partials = next;
        for index in previous_count..next.count {
            for voice in &mut self.running_phases {
                voice[index] = next.partials[index].phase as f64;
            }
        }
        true
    }

    pub fn reset(&mut self) {
        self.previous_sync = 0.0;
        for voice in 0..MAX_UNISON {
            for index in 0..MAX_PARTIALS {
                self.running_phases[voice][index] = self.partials.partials[index].phase as f64;
            }
            self.unison_gains[voice] = if voice == 0 { 1.0 } else { 0.0 };
        }
        self.last_requested_unison = 1;
        self.current_partial_amplitudes.fill(0.0);
    }

    pub fn process_planar(&mut self, sync: Option<&[f32]>, output: [&mut [f32]; 2]) {
        let [left, right] = output;
        assert_eq!(left.len(), right.len());
        if let Some(sync) = sync {
            assert_eq!(sync.len(), left.len());
        }
        let active = self.partials.count;
        if self.target[2] < 0.5 || active == 0 {
            left.fill(0.0);
            right.fill(0.0);
            return;
        }
        let target_unison = self.target[4] as usize;
        let layout_unison = if target_unison > self.last_requested_unison {
            for voice in self.last_requested_unison..target_unison {
                self.running_phases[voice] = self.running_phases[0];
                self.unison_gains[voice] = 0.0;
            }
            self.last_requested_unison = target_unison;
            target_unison
        } else {
            target_unison.max(self.last_requested_unison)
        };
        let voice_limit = layout_unison.clamp(1, MAX_UNISON);
        let placement_center = (layout_unison as f32 - 1.0) * 0.5;
        let amplitude_sum: f32 = self.partials.partials[..active]
            .iter()
            .map(|p| p.amplitude.max(0.0))
            .sum();
        let bank_normalizer = if amplitude_sum > 1e-6 {
            1.0 / amplitude_sum
        } else {
            1.0
        };
        let reference_fundamental = self.partials.fundamental.max(1.0);
        let sync_on = self.target[10] >= 0.5;
        for frame in 0..left.len() {
            if sync_on {
                if let Some(sync) = sync {
                    let sample = sync[frame];
                    if self.previous_sync <= 0.0 && sample > 0.0 {
                        self.reset();
                    }
                    self.previous_sync = sample;
                }
            }
            self.current_frequency +=
                (self.target[0] - self.current_frequency) * self.frequency_smoothing;
            self.current_amplitude +=
                (self.target[1] - self.current_amplitude) * self.amplitude_smoothing;
            self.current_detune += (self.target[5] - self.current_detune) * self.detune_smoothing;
            self.current_spread += (self.target[3] - self.current_spread) * self.spread_smoothing;
            let pitch_ratio = self.current_frequency.max(1.0) as f64 / reference_fundamental as f64;
            for index in 0..active {
                self.current_partial_amplitudes[index] += (self.partials.partials[index].amplitude
                    - self.current_partial_amplitudes[index])
                    * self.partial_smoothing;
            }
            let mut stereo = [0.0f32; 2];
            let mut contributing = 0;
            let mut higher_active = false;
            for voice in 0..voice_limit {
                let target_gain = if voice < target_unison { 1.0 } else { 0.0 };
                self.unison_gains[voice] +=
                    (target_gain - self.unison_gains[voice]) * self.unison_smoothing;
                let voice_gain = self.unison_gains[voice];
                if voice >= target_unison && voice_gain > 1e-4 {
                    higher_active = true;
                }
                if voice_gain <= 1e-4 {
                    continue;
                }
                contributing += 1;
                let voice_offset = voice as f32 - placement_center;
                let detune_semitones = voice_offset * self.current_detune / 100.0;
                let detune_ratio = 2.0f64.powf(detune_semitones as f64 / 12.0);
                let mut voice_sample = 0.0f32;
                for index in 0..active {
                    let partial_amplitude = self.current_partial_amplitudes[index];
                    if partial_amplitude <= 1e-6 {
                        continue;
                    }
                    let rendered_frequency =
                        self.partials.partials[index].frequency as f64 * pitch_ratio * detune_ratio;
                    if rendered_frequency <= 0.0 || rendered_frequency >= self.sample_rate * 0.5 {
                        continue;
                    }
                    let phase = &mut self.running_phases[voice][index];
                    voice_sample += (phase.sin() * partial_amplitude as f64) as f32;
                    *phase += TAU * rendered_frequency / self.sample_rate;
                    while *phase >= TAU {
                        *phase -= TAU;
                    }
                    while *phase < 0.0 {
                        *phase += TAU;
                    }
                }
                voice_sample *= bank_normalizer;
                voice_sample = apply_drive(
                    voice_sample,
                    self.target[6],
                    self.target[7] as u32,
                    self.target[8],
                    self.target[9],
                );
                if !voice_sample.is_finite() {
                    voice_sample = 0.0;
                }
                voice_sample *= voice_gain;
                let pan = if layout_unison > 1 {
                    (0.5 + voice_offset * (self.current_spread / (layout_unison - 1) as f32))
                        .clamp(0.0, 1.0)
                } else {
                    0.5
                };
                stereo[0] += voice_sample * (1.0 - pan).sqrt();
                stereo[1] += voice_sample * pan.sqrt();
            }
            if !higher_active {
                self.last_requested_unison = target_unison;
            }
            let unison_normalizer = if contributing > 0 {
                1.0 / (contributing as f32).sqrt()
            } else {
                0.0
            };
            left[frame] = stereo[0] * unison_normalizer * self.current_amplitude;
            right[frame] = stereo[1] * unison_normalizer * self.current_amplitude;
            if !left[frame].is_finite() {
                left[frame] = 0.0;
            }
            if !right[frame].is_finite() {
                right[frame] = 0.0;
            }
        }
    }
}

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    params
        .get_mut(id as usize)
        .map(|slot| {
            *slot = match id {
                0 => value.clamp(1.0, 20_000.0),
                1 | 2 | 3 | 9 | 10 => value.clamp(0.0, 1.0),
                4 => value.round().clamp(1.0, MAX_UNISON as f32),
                5 => value.clamp(0.0, 100.0),
                6 => value.clamp(0.0, 20.0),
                7 => value.round().clamp(0.0, 3.0),
                8 => value.clamp(-1.0, 1.0),
                _ => return false,
            };
            true
        })
        .unwrap_or(false)
}

fn apply_drive_transfer(sample: f32, drive: f32, shape: u32) -> f32 {
    if drive <= 0.0001 {
        return sample.clamp(-1.0, 1.0);
    }
    match shape {
        1 => {
            let gain = 1.0 + drive * 1.35;
            (sample * gain).atan() / gain.atan()
        }
        2 => (sample * (1.0 + drive * 1.2)).clamp(-1.0, 1.0),
        3 => {
            let mut x = (sample * (1.0 + drive * 1.1)).clamp(-32.0, 32.0);
            while x > 1.0 || x < -1.0 {
                x = if x > 1.0 { 2.0 - x } else { -2.0 - x };
            }
            x
        }
        _ => {
            let gain = 1.0 + drive * 0.85;
            (sample * gain).tanh() / gain.tanh()
        }
    }
}

fn apply_drive(sample: f32, drive: f32, shape: u32, bias: f32, mix: f32) -> f32 {
    if drive <= 0.0001 || mix <= 0.0001 {
        return sample.clamp(-1.0, 1.0);
    }
    let offset = bias * 0.75;
    let center = apply_drive_transfer(offset, drive, shape);
    let positive = (apply_drive_transfer(1.0 + offset, drive, shape) - center).abs();
    let negative = (apply_drive_transfer(-1.0 + offset, drive, shape) - center).abs();
    let normalizer = positive.max(negative).max(1e-6);
    let wet = ((apply_drive_transfer(sample + offset, drive, shape) - center) / normalizer)
        .clamp(-1.0, 1.0);
    (sample + (wet - sample) * mix).clamp(-1.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_upload_is_atomic_and_bounded() {
        let mut bank = SineBank::new(48_000.0, DEFAULTS);
        let mut set = PartialSet::default();
        set.count = 1;
        set.partials[0] = Partial {
            frequency: 440.0,
            amplitude: 1.0,
            phase: 0.0,
            decay_rate: 0.0,
        };
        assert!(bank.load_partials(set));
        let mut invalid = set;
        invalid.partials[0].frequency = f32::NAN;
        assert!(!bank.load_partials(invalid));
        assert_eq!(bank.partials.partials[0].frequency, 440.0);
    }

    #[test]
    fn manual_bank_is_stereo_and_audible() {
        let mut params = DEFAULTS;
        params[1] = 0.8;
        let mut bank = SineBank::new(48_000.0, params);
        let mut set = PartialSet::default();
        set.count = 1;
        set.partials[0] = Partial {
            frequency: 440.0,
            amplitude: 1.0,
            phase: 0.0,
            decay_rate: 0.0,
        };
        assert!(bank.load_partials(set));
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        bank.process_planar(None, [&mut left, &mut right]);
        assert_eq!(left, right);
        assert!(left.iter().any(|value| value.abs() > 0.01));
    }
}
