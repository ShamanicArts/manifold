//! Bounded temporal partial extraction for the background source-analysis worker.
//! Audio callbacks only receive a selected, validated `PartialSet` snapshot.

use crate::sample_analysis::analyze_stereo;
use crate::sine_bank::{MAX_PARTIALS, Partial, PartialSet};
use std::f64::consts::TAU;
use std::ops::Range;

pub const MAX_TEMPORAL_FRAMES: usize = 128;
const WINDOW: usize = 2048;
const HOP: usize = 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ExtractionMode {
    HarmonicProjection,
    SpectralPeaks,
}

pub struct TemporalFrame {
    pub position: f32,
    pub source_start: usize,
    pub rms: f32,
    pub brightness: f32,
    pub partials: PartialSet,
}

pub struct TemporalAnalysis {
    pub source_rate: f32,
    pub source_frames: usize,
    pub region: Range<usize>,
    pub global_fundamental: f32,
    pub global_partials: PartialSet,
    pub pitch_confidence: f32,
    pub mode: ExtractionMode,
    pub window_size: usize,
    pub hop_size: usize,
    pub frames: Vec<TemporalFrame>,
}

/// Source region uses absolute frame indices in the decoded stereo buffer.
/// Analysis may allocate and must run off the audio callback.
pub fn analyze_temporal_stereo(
    stereo: &[f32],
    source_rate: f32,
    region: Range<usize>,
    requested_frames: usize,
) -> Option<TemporalAnalysis> {
    let source_frames = stereo.len() / 2;
    if stereo.len() % 2 != 0
        || region.start >= region.end
        || region.end > source_frames
        || requested_frames == 0
        || requested_frames > MAX_TEMPORAL_FRAMES
        || region.len() < 256
    {
        return None;
    }
    let source = &stereo[region.start * 2..region.end * 2];
    let summary = analyze_stereo(source, source_rate)?;
    let mono: Vec<f32> = source
        .chunks_exact(2)
        .map(|channels| 0.5 * (channels[0] + channels[1]))
        .collect();
    let window_size = WINDOW.min(mono.len());
    let possible = 1 + (mono.len() - window_size) / HOP;
    let frame_count = possible.min(requested_frames);
    let mono_energy: f64 = mono.iter().map(|sample| (*sample as f64).powi(2)).sum();
    let tracked_pitch = summary.pitch_hz.filter(|_| mono_energy > 1e-8);
    let mode = if tracked_pitch.is_some() {
        ExtractionMode::HarmonicProjection
    } else {
        ExtractionMode::SpectralPeaks
    };
    let global_size = mono.len().min(8192).next_power_of_two();
    let global_size = if global_size > mono.len() {
        global_size / 2
    } else {
        global_size
    };
    let global_start = if tracked_pitch.is_some() {
        (mono.len() - global_size) / 2
    } else {
        0
    };
    let global_partials = if global_size < 512 {
        PartialSet::default()
    } else if let Some(pitch) = tracked_pitch {
        harmonic_partials(
            &mono[global_start..global_start + global_size],
            source_rate,
            pitch,
        )
    } else {
        peak_partials_with_projection(&mono[..global_size], &mono, source_rate)
    };
    let global_fundamental = tracked_pitch.unwrap_or_else(|| {
        if global_partials.count > 0 {
            global_partials.fundamental
        } else {
            0.0
        }
    });
    let mut frames = Vec::with_capacity(frame_count);
    let last_start = mono.len() - window_size;
    for index in 0..frame_count {
        let start = if frame_count == 1 {
            last_start / 2
        } else {
            last_start * index / (frame_count - 1)
        };
        let position = if last_start == 0 {
            0.5
        } else {
            start as f32 / last_start as f32
        };
        let window = &mono[start..start + window_size];
        let rms = (window
            .iter()
            .map(|sample| (*sample as f64).powi(2))
            .sum::<f64>()
            / window_size as f64)
            .sqrt() as f32;
        let mut partials = if let Some(pitch) = tracked_pitch {
            harmonic_partials(window, source_rate, pitch)
        } else {
            peak_partials(window, source_rate)
        };
        if tracked_pitch.is_none() && global_fundamental > 0.0 {
            partials.fundamental = global_fundamental;
        }
        let weight: f32 = partials.partials[..partials.count]
            .iter()
            .map(|partial| partial.amplitude)
            .sum();
        let brightness = if weight > 0.0 {
            (partials.partials[..partials.count]
                .iter()
                .map(|partial| partial.frequency * partial.amplitude)
                .sum::<f32>()
                / weight
                / (source_rate * 0.5))
                .clamp(0.0, 1.0)
        } else {
            0.0
        };
        frames.push(TemporalFrame {
            position,
            source_start: region.start + start,
            rms,
            brightness,
            partials,
        });
    }
    Some(TemporalAnalysis {
        source_rate,
        source_frames,
        region,
        global_fundamental,
        global_partials,
        pitch_confidence: summary.pitch_confidence,
        mode,
        window_size,
        hop_size: HOP,
        frames,
    })
}

#[derive(Clone, Copy, Default)]
struct Projection {
    frequency: f32,
    amplitude: f32,
    phase: f32,
}

fn windowed_samples(window: &[f32]) -> (Vec<f64>, f64) {
    let mut sum = 0.0;
    let weighted = window
        .iter()
        .enumerate()
        .map(|(index, &sample)| {
            let hann = 0.5 - 0.5 * (TAU * index as f64 / (window.len() - 1) as f64).cos();
            sum += hann;
            sample as f64 * hann
        })
        .collect();
    (weighted, sum)
}

fn projection(weighted: &[f64], window_sum: f64, source_rate: f32, frequency: f32) -> Projection {
    let step = TAU * frequency as f64 / source_rate as f64;
    let (cos_step, sin_step) = (step.cos(), step.sin());
    let (mut cos_phase, mut sin_phase) = (1.0, 0.0);
    let mut re = 0.0;
    let mut im = 0.0;
    for &sample in weighted {
        re += sample * cos_phase;
        im -= sample * sin_phase;
        (cos_phase, sin_phase) = (
            cos_phase * cos_step - sin_phase * sin_step,
            sin_phase * cos_step + cos_phase * sin_step,
        );
    }
    Projection {
        frequency,
        amplitude: (2.0 * re.hypot(im) / window_sum) as f32,
        phase: im.atan2(re) as f32,
    }
}

fn harmonic_partials(window: &[f32], rate: f32, fundamental: f32) -> PartialSet {
    let (weighted, window_sum) = windowed_samples(window);
    let mut candidates = [Projection::default(); MAX_PARTIALS];
    let mut candidate_count = 0;
    let mut strongest = 0.0f32;
    for harmonic in 1..=MAX_PARTIALS {
        let expected = fundamental * harmonic as f32;
        if expected >= (rate * 0.475).min(24_000.0) {
            break;
        }
        let width = (expected * if harmonic == 1 { 0.03 } else { 0.025 }).max(6.0);
        let mut best = Projection::default();
        for step in 0..11 {
            let frequency = (expected + width * (step as f32 / 5.0 - 1.0))
                .clamp(20.0, (rate * 0.475).min(24_000.0));
            let candidate = projection(&weighted, window_sum, rate, frequency);
            if candidate.amplitude > best.amplitude {
                best = candidate;
            }
        }
        if best.amplitude > 1e-5 {
            strongest = strongest.max(best.amplitude);
            candidates[candidate_count] = best;
            candidate_count += 1;
        }
    }
    let mut result = PartialSet {
        fundamental,
        ..PartialSet::default()
    };
    if strongest > 0.0 {
        for candidate in candidates[..candidate_count].iter().copied() {
            if candidate.amplitude < strongest * 0.02 {
                continue;
            }
            result.partials[result.count] = Partial {
                frequency: candidate.frequency,
                amplitude: candidate.amplitude / strongest,
                phase: candidate.phase,
                decay_rate: 0.0,
            };
            result.count += 1;
        }
    }
    result
}

fn peak_partials(window: &[f32], rate: f32) -> PartialSet {
    peak_partials_with_projection(window, window, rate)
}

fn peak_partials_with_projection(
    fft_window: &[f32],
    measure_window: &[f32],
    rate: f32,
) -> PartialSet {
    let size = fft_window.len().next_power_of_two();
    let mut real = vec![0.0f32; size];
    let mut imag = vec![0.0f32; size];
    let (weighted, window_sum) = windowed_samples(measure_window);
    for (index, &sample) in fft_window.iter().enumerate() {
        let norm = index as f32 / (fft_window.len() - 1) as f32;
        let hann = 0.5 * (1.0 - (std::f32::consts::TAU * norm).cos());
        real[index] = sample * hann;
    }
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
        for base in (0..size).step_by(width) {
            for offset in 0..half {
                let angle = -std::f32::consts::TAU * offset as f32 / width as f32;
                let (cos, sin) = (angle.cos(), angle.sin());
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
    let magnitude = |bin: usize| real[bin].hypot(imag[bin]);
    let bins = size / 2;
    let max_frequency = (rate * 0.475).min(24_000.0);
    let usable = |bin: usize| {
        bin >= 2
            && bin < bins - 1
            && (20.0..max_frequency).contains(&(bin as f32 * rate / size as f32))
    };
    let strongest_magnitude = (2..bins - 1).map(magnitude).fold(0.0f32, f32::max);
    if strongest_magnitude <= 1e-8 {
        return PartialSet::default();
    }
    let local_floor = strongest_magnitude * 0.004;
    let band_floor = strongest_magnitude * 0.0015;
    let raw_floor = strongest_magnitude * 0.0008;
    let min_spacing = (12.0 * size as f32 / rate).round().max(1.0) as usize;
    let mut local_peaks: Vec<(usize, f32)> = (2..bins - 1)
        .filter(|&bin| {
            usable(bin)
                && magnitude(bin) >= local_floor
                && magnitude(bin) >= magnitude(bin - 1)
                && magnitude(bin) >= magnitude(bin + 1)
        })
        .map(|bin| (bin, magnitude(bin)))
        .collect();
    let mut selected_bins = Vec::with_capacity(MAX_PARTIALS);
    let too_close = |selected: &[usize], bin: usize| {
        selected
            .iter()
            .any(|&existing| existing.abs_diff(bin) < min_spacing)
    };
    let log_min = 20.0f64.ln();
    let log_max = (max_frequency as f64).ln();
    for band in 0..MAX_PARTIALS {
        let start = (((log_min + (log_max - log_min) * band as f64 / MAX_PARTIALS as f64).exp()
            * size as f64
            / rate as f64)
            .floor() as usize)
            .clamp(2, bins - 2);
        let end = (((log_min + (log_max - log_min) * (band + 1) as f64 / MAX_PARTIALS as f64).exp()
            * size as f64
            / rate as f64)
            .ceil() as usize)
            .clamp(start, bins - 2);
        let mut best_local = None;
        let mut best_any = None;
        for bin in start..=end {
            if !usable(bin) {
                continue;
            }
            let level = magnitude(bin);
            if best_any.is_none_or(|(_, best): (usize, f32)| level > best) {
                best_any = Some((bin, level));
            }
            if level >= magnitude(bin - 1)
                && level >= magnitude(bin + 1)
                && best_local.is_none_or(|(_, best): (usize, f32)| level > best)
            {
                best_local = Some((bin, level));
            }
        }
        if let Some((bin, level)) = best_local.or(best_any) {
            if level >= band_floor && !too_close(&selected_bins, bin) {
                selected_bins.push(bin);
            }
        }
    }
    local_peaks.sort_by(|a, b| b.1.total_cmp(&a.1));
    for (bin, _) in local_peaks {
        if selected_bins.len() >= MAX_PARTIALS {
            break;
        }
        if !too_close(&selected_bins, bin) {
            selected_bins.push(bin);
        }
    }
    if selected_bins.len() < MAX_PARTIALS {
        let mut raw_bins: Vec<_> = (2..bins - 1)
            .filter(|&bin| usable(bin) && magnitude(bin) >= raw_floor)
            .map(|bin| (bin, magnitude(bin)))
            .collect();
        raw_bins.sort_by(|a, b| b.1.total_cmp(&a.1));
        for (bin, _) in raw_bins {
            if selected_bins.len() >= MAX_PARTIALS {
                break;
            }
            if !too_close(&selected_bins, bin) {
                selected_bins.push(bin);
            }
        }
    }
    let mut measured = Vec::new();
    for bin in selected_bins {
        let left = magnitude(bin - 1);
        let center = magnitude(bin);
        let right = magnitude(bin + 1);
        let denominator = left - 2.0 * center + right;
        let delta = if denominator.abs() > 1e-8 {
            (0.5 * (left - right) / denominator).clamp(-1.0, 1.0)
        } else {
            0.0
        };
        let frequency = (bin as f32 + delta) * rate / size as f32;
        if !(20.0..max_frequency).contains(&frequency) {
            continue;
        }
        let candidate = projection(&weighted, window_sum, rate, frequency);
        if candidate.amplitude > 1e-5 {
            measured.push(candidate);
        }
    }
    let Some(strongest) = measured
        .iter()
        .max_by(|a, b| a.amplitude.total_cmp(&b.amplitude))
        .copied()
    else {
        return PartialSet::default();
    };
    let mut result = PartialSet {
        fundamental: strongest.frequency,
        ..PartialSet::default()
    };
    measured.sort_by(|a, b| a.frequency.total_cmp(&b.frequency));
    for candidate in measured {
        result.partials[result.count] = Partial {
            frequency: candidate.frequency,
            amplitude: candidate.amplitude / strongest.amplitude,
            phase: candidate.phase,
            decay_rate: 0.0,
        };
        result.count += 1;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn follows_a_tone_across_a_region() {
        let rate = 48_000.0;
        let mut stereo = vec![0.0; 24_000 * 2];
        for frame in 0..24_000 {
            let tone = 0.6 * (std::f32::consts::TAU * 440.0 * frame as f32 / rate).sin()
                + 0.2 * (std::f32::consts::TAU * 880.0 * frame as f32 / rate).sin();
            stereo[frame * 2] = tone;
            stereo[frame * 2 + 1] = tone;
        }
        let result = analyze_temporal_stereo(&stereo, rate, 2048..22_000, 8).unwrap();
        assert_eq!(result.mode, ExtractionMode::HarmonicProjection);
        assert_eq!(result.frames.len(), 8);
        assert!((result.global_fundamental - 440.0).abs() < 2.0);
        assert_eq!(result.frames[0].source_start, 2048);
        assert!(result.frames.iter().all(|frame| frame.partials.validate()));
        assert!(
            result.frames[0].partials.partials[..result.frames[0].partials.count]
                .iter()
                .any(|partial| (partial.frequency - 880.0).abs() < 15.0 && partial.amplitude > 0.1)
        );
    }

    #[test]
    fn transient_uses_peaks_and_silence_is_empty() {
        let mut stereo = vec![0.0; 8192 * 2];
        stereo[0] = 1.0;
        stereo[1] = 1.0;
        let result = analyze_temporal_stereo(&stereo, 48_000.0, 0..8192, 4).unwrap();
        assert_eq!(result.mode, ExtractionMode::SpectralPeaks);
        assert!(result.frames.iter().all(|frame| frame.partials.validate()));
        let silence = vec![0.0; 8192 * 2];
        let empty = analyze_temporal_stereo(&silence, 48_000.0, 0..8192, 4).unwrap();
        assert!(empty.frames.iter().all(|frame| frame.partials.count == 0));
        let mut noise = vec![0.0; 8192 * 2];
        let mut seed = 0x9e37_79b9_u32;
        for stereo_frame in noise.chunks_exact_mut(2) {
            seed ^= seed << 13;
            seed ^= seed >> 17;
            seed ^= seed << 5;
            let value = (seed as f32 / u32::MAX as f32 - 0.5) * 0.4;
            stereo_frame.copy_from_slice(&[value, value]);
        }
        let broad = analyze_temporal_stereo(&noise, 48_000.0, 0..8192, 4).unwrap();
        assert_eq!(broad.mode, ExtractionMode::SpectralPeaks);
        assert!(broad.frames.iter().any(|frame| frame.partials.count > 0));
        assert!(broad.frames.iter().all(|frame| frame.partials.validate()));
    }

    #[test]
    fn rejects_invalid_regions_and_samples() {
        let mut stereo = vec![0.0; 1024 * 2];
        assert!(analyze_temporal_stereo(&stereo, 48_000.0, 500..200, 1).is_none());
        assert!(analyze_temporal_stereo(&stereo, 48_000.0, 0..2048, 1).is_none());
        stereo[8] = f32::NAN;
        assert!(analyze_temporal_stereo(&stereo, 48_000.0, 0..1024, 1).is_none());
    }
}
