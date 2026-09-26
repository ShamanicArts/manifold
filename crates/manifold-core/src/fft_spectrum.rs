//! Authored live FFT meter. Stereo audio passes through; all FFT storage is prepared.

pub const FFT_SIZE: usize = 2048;
pub const FFT_HOP: usize = FFT_SIZE / 2;
pub const FFT_BANDS: usize = 32;

pub struct FftSpectrum {
    sample_rate: f32,
    smoothing: f32,
    floor_db: f32,
    ring: [f32; FFT_SIZE],
    window: [f32; FFT_SIZE],
    real: [f32; FFT_SIZE],
    imag: [f32; FFT_SIZE],
    twiddle_real: [f32; FFT_SIZE / 2],
    twiddle_imag: [f32; FFT_SIZE / 2],
    bin_band: [u8; FFT_SIZE / 2 + 1],
    bands: [f32; FFT_BANDS],
    peak_hz: f32,
    window_sum: f32,
    write: usize,
    filled: usize,
    hop: usize,
}

impl FftSpectrum {
    pub fn new(sample_rate: f32, smoothing: f32, floor_db: f32) -> Self {
        let window = std::array::from_fn(|index| {
            0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / (FFT_SIZE - 1) as f32).cos()
        });
        let twiddle_real = std::array::from_fn(|index| {
            (std::f32::consts::TAU * index as f32 / FFT_SIZE as f32).cos()
        });
        let twiddle_imag = std::array::from_fn(|index| {
            -(std::f32::consts::TAU * index as f32 / FFT_SIZE as f32).sin()
        });
        let log_span = (sample_rate * 0.5 / 20.0).ln();
        let bin_band = std::array::from_fn(|bin| {
            if bin == 0 {
                return 0;
            }
            let hz = bin as f32 * sample_rate / FFT_SIZE as f32;
            ((hz / 20.0).ln() / log_span * FFT_BANDS as f32)
                .floor()
                .clamp(0.0, (FFT_BANDS - 1) as f32) as u8
        });
        Self {
            sample_rate,
            smoothing: smoothing.clamp(0.0, 0.99),
            floor_db: floor_db.clamp(-96.0, -24.0),
            ring: [0.0; FFT_SIZE],
            window,
            real: [0.0; FFT_SIZE],
            imag: [0.0; FFT_SIZE],
            twiddle_real,
            twiddle_imag,
            bin_band,
            bands: [0.0; FFT_BANDS],
            peak_hz: 0.0,
            window_sum: window.iter().sum(),
            write: 0,
            filled: 0,
            hop: 0,
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.smoothing = value.clamp(0.0, 0.99),
            1 => self.floor_db = value.clamp(-96.0, -24.0),
            _ => return false,
        }
        true
    }

    pub fn meter(&self, band: usize) -> Option<f32> {
        if band == FFT_BANDS {
            Some(self.peak_hz)
        } else {
            self.bands.get(band).copied()
        }
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [left, right] = input;
        let [out_left, out_right] = output;
        for frame in 0..left.len() {
            out_left[frame] = left[frame];
            out_right[frame] = right[frame];
            let mono = 0.5 * (left[frame] + right[frame]);
            self.ring[self.write] = if mono.is_finite() { mono } else { 0.0 };
            self.write = (self.write + 1) % FFT_SIZE;
            self.filled = (self.filled + 1).min(FFT_SIZE);
            self.hop += 1;
            if self.filled == FFT_SIZE && self.hop >= FFT_HOP {
                self.analyze_window();
                self.hop = 0;
            }
        }
    }

    fn analyze_window(&mut self) {
        for index in 0..FFT_SIZE {
            self.real[index] = self.ring[(self.write + index) % FFT_SIZE] * self.window[index];
            self.imag[index] = 0.0;
        }
        let bits = FFT_SIZE.trailing_zeros();
        for index in 0..FFT_SIZE {
            let reversed = index.reverse_bits() >> (usize::BITS - bits);
            if reversed > index {
                self.real.swap(index, reversed);
                self.imag.swap(index, reversed);
            }
        }
        let mut width = 2;
        while width <= FFT_SIZE {
            let half = width / 2;
            let stride = FFT_SIZE / width;
            for base in (0..FFT_SIZE).step_by(width) {
                for offset in 0..half {
                    let twiddle = offset * stride;
                    let other = base + offset + half;
                    let even = base + offset;
                    let real = self.real[other] * self.twiddle_real[twiddle]
                        - self.imag[other] * self.twiddle_imag[twiddle];
                    let imag = self.real[other] * self.twiddle_imag[twiddle]
                        + self.imag[other] * self.twiddle_real[twiddle];
                    self.real[other] = self.real[even] - real;
                    self.imag[other] = self.imag[even] - imag;
                    self.real[even] += real;
                    self.imag[even] += imag;
                }
            }
            width *= 2;
        }
        let scale = 2.0 / self.window_sum;
        let mut band_power = [0.0f32; FFT_BANDS];
        let mut peak_power = 0.0f32;
        let mut peak_bin = 0usize;
        for bin in 1..=FFT_SIZE / 2 {
            let real = self.real[bin] * scale;
            let imag = self.imag[bin] * scale;
            let power = real * real + imag * imag;
            let band = self.bin_band[bin] as usize;
            band_power[band] = band_power[band].max(power);
            if power > peak_power {
                peak_power = power;
                peak_bin = bin;
            }
        }
        for (band, power) in band_power.into_iter().enumerate() {
            let db = 10.0 * power.max(1e-12).log10();
            let level = ((db - self.floor_db) / -self.floor_db).clamp(0.0, 1.0);
            self.bands[band] = self.bands[band] * self.smoothing + level * (1.0 - self.smoothing);
        }
        if peak_power < 1e-10 {
            self.peak_hz = 0.0;
        } else {
            let magnitude = |bin: usize| {
                (self.real[bin] * self.real[bin] + self.imag[bin] * self.imag[bin]).sqrt()
            };
            let offset = if peak_bin > 1 && peak_bin < FFT_SIZE / 2 {
                let left = magnitude(peak_bin - 1);
                let center = magnitude(peak_bin);
                let right = magnitude(peak_bin + 1);
                let denominator = left - 2.0 * center + right;
                if denominator.abs() > 1e-9 {
                    (0.5 * (left - right) / denominator).clamp(-0.5, 0.5)
                } else {
                    0.0
                }
            } else {
                0.0
            };
            self.peak_hz = (peak_bin as f32 + offset) * self.sample_rate / FFT_SIZE as f32;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passes_stereo_audio_and_finds_tone_after_first_window() {
        let mut analyzer = FftSpectrum::new(48_000.0, 0.0, -72.0);
        let left: Vec<_> = (0..4096)
            .map(|frame| 0.5 * (std::f32::consts::TAU * 440.0 * frame as f32 / 48_000.0).sin())
            .collect();
        let right: Vec<_> = left.iter().map(|sample| sample * 0.8).collect();
        let mut out_left = vec![0.0; left.len()];
        let mut out_right = vec![0.0; right.len()];
        analyzer.process_planar([&left, &right], [&mut out_left, &mut out_right]);
        assert_eq!(out_left, left);
        assert_eq!(out_right, right);
        assert!((analyzer.meter(FFT_BANDS).unwrap() - 440.0).abs() < 5.0);
        assert!((0..FFT_BANDS).any(|band| analyzer.meter(band).unwrap() > 0.7));
        assert!(analyzer.meter(FFT_BANDS + 1).is_none());
    }

    #[test]
    fn partition_preserves_meter_and_silence_clears_it() {
        let signal: Vec<_> = (0..4096)
            .map(|frame| 0.3 * (std::f32::consts::TAU * 1000.0 * frame as f32 / 48_000.0).sin())
            .collect();
        let mut whole = FftSpectrum::new(48_000.0, 0.35, -72.0);
        let mut split = FftSpectrum::new(48_000.0, 0.35, -72.0);
        whole.process_planar(
            [&signal, &signal],
            [&mut vec![0.0; 4096], &mut vec![0.0; 4096]],
        );
        for chunk in signal.chunks(128) {
            split.process_planar(
                [chunk, chunk],
                [&mut vec![0.0; chunk.len()], &mut vec![0.0; chunk.len()]],
            );
        }
        for band in 0..=FFT_BANDS {
            assert_eq!(whole.meter(band), split.meter(band));
        }
        split.set_parameter(0, 0.0);
        let silence = vec![0.0; FFT_SIZE];
        split.process_planar(
            [&silence, &silence],
            [&mut vec![0.0; FFT_SIZE], &mut vec![0.0; FFT_SIZE]],
        );
        assert_eq!(split.meter(FFT_BANDS), Some(0.0));
        assert!((0..FFT_BANDS).all(|band| split.meter(band) == Some(0.0)));
    }
}
