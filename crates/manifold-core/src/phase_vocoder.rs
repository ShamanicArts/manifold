//! Stereo phase vocoder with prepared FFT storage and no process-time allocation.
//! The two algorithms follow the old PhaseVocoderNode: bin mapping and
//! time-stretch followed by resampling. The latter shares one read cursor
//! across stereo channels; the old C++ node accidentally advanced it twice.

pub const PARAM_COUNT: usize = 5;
/// Mode, semitones, time stretch, wet mix, FFT order.
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.0, 0.0, 1.0, 0.0, 11.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    let Some(slot) = params.get_mut(id as usize) else {
        return false;
    };
    *slot = match id {
        0 => value.round().clamp(0.0, 1.0),
        1 => value.clamp(-24.0, 24.0),
        2 => value.clamp(0.25, 4.0),
        3 => value.clamp(0.0, 1.0),
        4 => value.round().clamp(9.0, 12.0),
        _ => return false,
    };
    true
}

fn principal(phase: f32) -> f32 {
    phase - std::f32::consts::TAU * (phase / std::f32::consts::TAU + 0.5).floor()
}

fn fft(real: &mut [f32], imag: &mut [f32], twiddle: &[(f32, f32)], inverse: bool) {
    let size = real.len();
    let bits = size.trailing_zeros();
    for index in 0..size {
        let reversed = index.reverse_bits() >> (usize::BITS - bits);
        if reversed > index {
            real.swap(index, reversed);
            imag.swap(index, reversed);
        }
    }
    let mut width = 2;
    while width <= size {
        let half = width / 2;
        let stride = size / width;
        for base in (0..size).step_by(width) {
            for offset in 0..half {
                let (cos, neg_sin) = twiddle[offset * stride];
                let sin = if inverse { -neg_sin } else { neg_sin };
                let other = base + offset + half;
                let even = base + offset;
                let re = real[other] * cos - imag[other] * sin;
                let im = real[other] * sin + imag[other] * cos;
                real[other] = real[even] - re;
                imag[other] = imag[even] - im;
                real[even] += re;
                imag[even] += im;
            }
        }
        width *= 2;
    }
    if inverse {
        let scale = 1.0 / size as f32;
        for index in 0..size {
            real[index] *= scale;
            imag[index] *= scale;
        }
    }
}

struct Channel {
    input: Vec<f32>,
    output: Vec<f32>,
    stretch: Vec<f32>,
    previous_phase: Vec<f32>,
    synthesis_phase: Vec<f32>,
}

impl Channel {
    fn new(size: usize) -> Self {
        Self {
            input: vec![0.0; size * 2],
            output: vec![0.0; size * 2],
            stretch: vec![0.0; size * 8],
            previous_phase: vec![0.0; size / 2 + 1],
            synthesis_phase: vec![0.0; size / 2 + 1],
        }
    }
}

pub struct PhaseVocoder {
    target: [f32; PARAM_COUNT],
    current_pitch: f32,
    current_mix: f32,
    smoothing: f32,
    size: usize,
    hop: usize,
    channels: [Channel; 2],
    window: Vec<f32>,
    twiddle: Vec<(f32, f32)>,
    real: Vec<f32>,
    imag: Vec<f32>,
    analysis_mag: Vec<f32>,
    analysis_freq: Vec<f32>,
    synthesis_mag: Vec<f32>,
    synthesis_freq: Vec<f32>,
    input_write: usize,
    output_read: usize,
    hop_write: usize,
    stretch_write: usize,
    stretch_read: f32,
    until_hop: usize,
}

impl PhaseVocoder {
    pub fn target_parameter(&self, id: usize) -> f32 {
        self.target[id]
    }
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        let size = 1usize << target[4] as usize;
        let hop = size / 4;
        let bins = size / 2 + 1;
        let rate = if sample_rate.is_finite() && sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        Self {
            target,
            current_pitch: target[1],
            current_mix: target[3],
            smoothing: (1.0 - (-1.0 / (0.01 * rate)).exp()).clamp(0.0001, 1.0),
            size,
            hop,
            channels: [Channel::new(size), Channel::new(size)],
            window: (0..size)
                .map(|index| 0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / size as f32).cos())
                .collect(),
            twiddle: (0..size / 2)
                .map(|index| {
                    let angle = std::f32::consts::TAU * index as f32 / size as f32;
                    (angle.cos(), -angle.sin())
                })
                .collect(),
            real: vec![0.0; size],
            imag: vec![0.0; size],
            analysis_mag: vec![0.0; bins],
            analysis_freq: vec![0.0; bins],
            synthesis_mag: vec![0.0; bins],
            synthesis_freq: vec![0.0; bins],
            input_write: 0,
            output_read: 0,
            hop_write: 0,
            stretch_write: 0,
            stretch_read: 0.0,
            until_hop: hop,
        }
    }

    pub fn latency_samples(&self) -> usize {
        self.size
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if id == 4 {
            // FFT storage and window must be rebuilt off the callback.
            return value.is_finite()
                && value.round().clamp(9.0, 12.0) as usize == self.size.trailing_zeros() as usize;
        }
        set_value(&mut self.target, id, value)
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [left, right] = input;
        let [out_left, out_right] = output;
        debug_assert_eq!(left.len(), right.len());
        debug_assert_eq!(left.len(), out_left.len());
        debug_assert_eq!(left.len(), out_right.len());
        if self.target[3] < 0.001 {
            out_left.copy_from_slice(left);
            out_right.copy_from_slice(right);
            return;
        }
        for frame in 0..left.len() {
            self.current_pitch += (self.target[1] - self.current_pitch) * self.smoothing;
            self.current_mix += (self.target[3] - self.current_mix) * self.smoothing;
            let dry = [left[frame], right[frame]];
            let mode = self.target[0] as usize;
            for channel in 0..2 {
                self.channels[channel].input[self.input_write] = if dry[channel].is_finite() {
                    dry[channel]
                } else {
                    0.0
                };
                let wet = if mode == 0 {
                    let sample = self.channels[channel].output[self.output_read];
                    self.channels[channel].output[self.output_read] = 0.0;
                    sample
                } else {
                    let index = self.stretch_read as usize % self.channels[channel].stretch.len();
                    let sample = self.channels[channel].stretch[index];
                    self.channels[channel].stretch[index] = 0.0;
                    sample
                };
                let rendered = dry[channel] * (1.0 - self.current_mix) + wet * self.current_mix;
                if channel == 0 {
                    out_left[frame] = rendered;
                } else {
                    out_right[frame] = rendered;
                }
            }
            self.input_write = (self.input_write + 1) % (self.size * 2);
            if mode == 0 {
                self.output_read = (self.output_read + 1) % (self.size * 2);
            } else {
                self.stretch_read += 2.0_f32.powf(self.current_pitch / 12.0);
                if self.stretch_read >= (self.size * 8) as f32 {
                    self.stretch_read -= (self.size * 8) as f32;
                }
            }
            self.until_hop -= 1;
            if self.until_hop == 0 {
                let pitch_ratio = 2.0_f32.powf(self.current_pitch / 12.0);
                self.process_hop(mode, pitch_ratio);
                self.until_hop = self.hop;
            }
        }
    }

    fn process_hop(&mut self, mode: usize, pitch_ratio: f32) {
        let ring_size = self.size * 2;
        let read_start = (self.input_write + ring_size - self.size) % ring_size;
        let bins = self.size / 2 + 1;
        let omega_factor = std::f32::consts::TAU * self.hop as f32 / self.size as f32;
        let stretch_ratio = (pitch_ratio * self.target[2]).clamp(0.0625, 16.0);
        for channel in 0..2 {
            for index in 0..self.size {
                let position = (read_start + index) % ring_size;
                self.real[index] = self.channels[channel].input[position] * self.window[index];
                self.imag[index] = 0.0;
            }
            fft(&mut self.real, &mut self.imag, &self.twiddle, false);
            for bin in 0..bins {
                let real = self.real[bin];
                let imag = self.imag[bin];
                let phase = imag.atan2(real);
                let omega = bin as f32 * omega_factor;
                let raw = phase - self.channels[channel].previous_phase[bin];
                self.analysis_mag[bin] = real.hypot(imag);
                self.analysis_freq[bin] = omega + principal(raw - omega);
                self.channels[channel].previous_phase[bin] = phase;
            }
            if mode == 0 {
                self.map_bins(pitch_ratio, omega_factor);
            }
            self.real.fill(0.0);
            self.imag.fill(0.0);
            for bin in 0..bins {
                let magnitude = if mode == 0 {
                    self.synthesis_mag[bin]
                } else {
                    self.analysis_mag[bin]
                };
                let advance = if mode == 0 {
                    self.synthesis_freq[bin]
                } else {
                    self.analysis_freq[bin] * stretch_ratio
                };
                let phase = &mut self.channels[channel].synthesis_phase[bin];
                *phase += advance;
                if magnitude < 1e-6 {
                    *phase = principal(*phase);
                }
                self.real[bin] = magnitude * phase.cos();
                self.imag[bin] = if bin == 0 || bin == self.size / 2 {
                    0.0
                } else {
                    magnitude * phase.sin()
                };
            }
            for bin in 1..self.size / 2 {
                self.real[self.size - bin] = self.real[bin];
                self.imag[self.size - bin] = -self.imag[bin];
            }
            fft(&mut self.real, &mut self.imag, &self.twiddle, true);
            let gain = if mode == 0 {
                2.0 / 3.0
            } else {
                (2.0 / 3.0) / stretch_ratio.sqrt()
            };
            for index in 0..self.size {
                let sample = self.real[index] * self.window[index] * gain;
                if mode == 0 {
                    let position = (self.hop_write + index) % (self.size * 2);
                    self.channels[channel].output[position] += sample;
                } else {
                    let position = (self.stretch_write + index) % (self.size * 8);
                    self.channels[channel].stretch[position] += sample;
                }
            }
        }
        if mode == 0 {
            self.hop_write = (self.hop_write + self.hop) % (self.size * 2);
        } else {
            self.stretch_write =
                (self.stretch_write + (self.hop as f32 * stretch_ratio) as usize) % (self.size * 8);
        }
    }

    fn map_bins(&mut self, pitch_ratio: f32, omega_factor: f32) {
        let bins = self.size / 2 + 1;
        self.synthesis_mag.fill(0.0);
        self.synthesis_freq.fill(0.0);
        for dst in 0..bins {
            let src = dst as f32 / pitch_ratio;
            let lo = src.floor() as usize;
            let hi = lo + 1;
            let frac = src - lo as f32;
            let mut weighted_magnitude = 0.0;
            let mut freq_weighted = 0.0;
            let mut freq_magnitude = 0.0;
            for (bin, weight) in [(lo, 1.0 - frac), (hi, frac)] {
                if bin < bins {
                    let magnitude = self.analysis_mag[bin];
                    weighted_magnitude += magnitude * weight;
                    freq_weighted += self.analysis_freq[bin] * magnitude;
                    freq_magnitude += magnitude;
                }
            }
            self.synthesis_mag[dst] = weighted_magnitude;
            self.synthesis_freq[dst] = if freq_magnitude > 1e-10 {
                let deviation = freq_weighted / freq_magnitude - src * omega_factor;
                dst as f32 * omega_factor + deviation
            } else {
                dst as f32 * omega_factor
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dry_bypass_is_exact_and_order_is_prepare_only() {
        let mut vocoder = PhaseVocoder::new(48_000.0, DEFAULTS);
        let input = [0.1, -0.2, 0.3, 0.0];
        let mut left = [0.0; 4];
        let mut right = [0.0; 4];
        vocoder.process_planar([&input, &input], [&mut left, &mut right]);
        assert_eq!(left, input);
        assert_eq!(right, input);
        assert_eq!(vocoder.latency_samples(), 2048);
        assert!(!vocoder.set_parameter(4, 12.0));
    }

    #[test]
    fn both_modes_make_finite_wet_audio_without_stereo_cursor_split() {
        for mode in [0.0, 1.0] {
            let mut params = DEFAULTS;
            params[0] = mode;
            params[1] = 7.0;
            params[3] = 1.0;
            let mut vocoder = PhaseVocoder::new(48_000.0, params);
            let count = 8192;
            let source: Vec<_> = (0..count)
                .map(|frame| (std::f32::consts::TAU * 220.0 * frame as f32 / 48_000.0).sin() * 0.3)
                .collect();
            let mut left = vec![0.0; count];
            let mut right = vec![0.0; count];
            vocoder.process_planar([&source, &source], [&mut left, &mut right]);
            assert!(left.iter().all(|value| value.is_finite()));
            assert!(left.iter().zip(&right).all(|(a, b)| (a - b).abs() < 1e-6));
            assert!(left.iter().skip(2048).any(|value| value.abs() > 0.01));
            let tail = &left[4096..8192];
            let (best_lag, _) = (110..=240)
                .map(|lag| {
                    (
                        lag,
                        tail.iter()
                            .zip(&tail[lag..])
                            .map(|(a, b)| a * b)
                            .sum::<f32>(),
                    )
                })
                .max_by(|a, b| a.1.total_cmp(&b.1))
                .unwrap();
            let pitch = 48_000.0 / best_lag as f32;
            assert!((pitch - 329.6).abs() < 15.0, "mode {mode}, pitch {pitch}");
        }
    }
}
