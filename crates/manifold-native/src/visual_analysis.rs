//! Bounded output-only presentation telemetry. Never controls the audio graph.
use std::sync::atomic::{AtomicU32, Ordering};
use manifold_core::fft_spectrum::{FftSpectrum, FFT_BANDS};

pub struct OutputSpectrum {
    fft: Box<FftSpectrum>,
    sample_rate: f32,
}
impl OutputSpectrum {
    pub fn prepare(sample_rate: f32) -> Self {
        Self { fft: Box::new(FftSpectrum::new(sample_rate, 0.65, -72.0)), sample_rate }
    }
    pub fn process(&mut self, channels: [&[f32]; 2], mailbox: &SpectrumMailbox) {
        for (left, right) in channels[0].iter().zip(channels[1]) {
            self.fft.push_sample((left + right) * 0.5);
        }
        mailbox.sequence.fetch_add(1, Ordering::SeqCst);
        for (band, value) in mailbox.values.iter().enumerate() {
            value.store(self.fft.meter(band).unwrap_or(0.0).to_bits(), Ordering::SeqCst);
        }
        mailbox.sample_rate.store(self.sample_rate.to_bits(), Ordering::SeqCst);
        mailbox.sequence.fetch_add(1, Ordering::SeqCst);
    }
}

pub struct SpectrumMailbox {
    sequence: AtomicU32,
    values: [AtomicU32; FFT_BANDS + 1],
    sample_rate: AtomicU32,
}
pub struct SpectrumSnapshot {
    pub bands: [f32; FFT_BANDS],
    pub peak_hz: f32,
    pub sample_rate: f32,
}
impl SpectrumMailbox {
    pub fn new() -> Self {
        Self { sequence: AtomicU32::new(0), values: std::array::from_fn(|_| AtomicU32::new(0)), sample_rate: AtomicU32::new(0) }
    }
    /// Reader never blocks; skip a UI frame if the writer overlaps all attempts.
    pub fn snapshot(&self) -> Option<SpectrumSnapshot> {
        for _ in 0..3 {
            let before = self.sequence.load(Ordering::SeqCst);
            if before % 2 != 0 { continue; }
            let bands = std::array::from_fn(|i| f32::from_bits(self.values[i].load(Ordering::SeqCst)));
            let peak_hz = f32::from_bits(self.values[FFT_BANDS].load(Ordering::SeqCst));
            let sample_rate = f32::from_bits(self.sample_rate.load(Ordering::SeqCst));
            if before == self.sequence.load(Ordering::SeqCst) {
                return Some(SpectrumSnapshot { bands, peak_hz, sample_rate });
            }
        }
        None
    }
}
impl Default for SpectrumMailbox { fn default() -> Self { Self::new() } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn output_tap_resolves_pitch_and_clears_after_silence() {
        let mut tap = OutputSpectrum::prepare(48_000.0);
        let mailbox = SpectrumMailbox::new();
        let tone: Vec<_> = (0..8192).map(|i| (std::f32::consts::TAU * 440.0 * i as f32 / 48_000.0).sin() * 0.2).collect();
        tap.process([&tone, &tone], &mailbox);
        let result = mailbox.snapshot().unwrap();
        assert!((result.peak_hz - 440.0).abs() < 5.0);
        assert!(result.bands.iter().any(|v| *v > 0.7));
        let silence = [0.0; 8192];
        for _ in 0..4 { tap.process([&silence, &silence], &mailbox); }
        let silent = mailbox.snapshot().unwrap();
        assert_eq!(silent.peak_hz, 0.0);
        assert!(silent.bands.iter().all(|v| *v < 0.001));
    }
}
