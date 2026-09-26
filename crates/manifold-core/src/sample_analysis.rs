//! Bounded source summary for the host's background worker, never the audio callback.

use crate::sample_region::{MAX_SAMPLE_FRAMES, MAX_SAMPLE_SECONDS};

pub const PEAK_BINS: usize = 256;

pub struct SampleSummary {
    /// Interleaved left/right absolute maxima, one pair per visual bin.
    pub peaks: [f32; PEAK_BINS * 2],
    pub peak: f32,
    pub rms: f32,
    pub pitch_hz: Option<f32>,
    pub pitch_confidence: f32,
}

pub fn analyze_stereo(stereo: &[f32], source_rate: f32) -> Option<SampleSummary> {
    if stereo.len() < 2
        || stereo.len() % 2 != 0
        || stereo.len() / 2 > MAX_SAMPLE_FRAMES
        || !source_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&source_rate)
        || stereo.len() / 2 > (source_rate as usize).saturating_mul(MAX_SAMPLE_SECONDS)
        || stereo.iter().any(|sample| !sample.is_finite())
    {
        return None;
    }
    let frames = stereo.len() / 2;
    let mut peaks = [0.0f32; PEAK_BINS * 2];
    let mut sum_squares = 0.0f64;
    let mut peak = 0.0f32;
    for frame in 0..frames {
        let left = stereo[frame * 2];
        let right = stereo[frame * 2 + 1];
        let bin = frame.saturating_mul(PEAK_BINS) / frames;
        peaks[bin * 2] = peaks[bin * 2].max(left.abs());
        peaks[bin * 2 + 1] = peaks[bin * 2 + 1].max(right.abs());
        peak = peak.max(left.abs()).max(right.abs());
        sum_squares += (left as f64 * left as f64 + right as f64 * right as f64) * 0.5;
    }
    let rms = (sum_squares / frames as f64).sqrt() as f32;
    let (pitch_hz, pitch_confidence) = estimate_pitch(stereo, source_rate);
    Some(SampleSummary {
        peaks,
        peak,
        rms,
        pitch_hz,
        pitch_confidence,
    })
}

fn estimate_pitch(stereo: &[f32], source_rate: f32) -> (Option<f32>, f32) {
    let frames = stereo.len() / 2;
    let window = frames.min(4096);
    if window < 512 {
        return (None, 0.0);
    }
    let max_start = frames - window;
    let first = ((source_rate * 0.01) as usize).min(max_start);
    let end = max_start.min(first.saturating_add((source_rate * 2.0) as usize));
    let mut best_start = first;
    let mut best_energy = 0.0f64;
    let mut best_channel = 0usize;
    let mut start = first;
    loop {
        let mut energies = [0.0f64; 3];
        for frame in start..start + window {
            let left = stereo[frame * 2] as f64;
            let right = stereo[frame * 2 + 1] as f64;
            let mid = (left + right) * 0.5;
            energies[0] += mid * mid;
            energies[1] += left * left;
            energies[2] += right * right;
        }
        let (channel, &energy) = energies
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .unwrap();
        if energy > best_energy {
            best_energy = energy;
            best_start = start;
            best_channel = channel;
        }
        if start >= end || end - start < window / 2 {
            break;
        }
        start += window / 2;
    }
    let mut mono = Vec::with_capacity(window);
    let mut peak = 0.0f32;
    for frame in best_start..best_start + window {
        let value = match best_channel {
            1 => stereo[frame * 2],
            2 => stereo[frame * 2 + 1],
            _ => (stereo[frame * 2] + stereo[frame * 2 + 1]) * 0.5,
        };
        peak = peak.max(value.abs());
        mono.push(value);
    }
    let rms = (best_energy / window as f64).sqrt() as f32;
    if peak < 0.01 || rms / peak < 0.1 {
        return (None, 0.0);
    }
    let min_lag = ((source_rate / 2000.0).floor() as usize).max(2);
    let max_lag = ((source_rate / 40.0).ceil() as usize).min(window / 2);
    if min_lag >= max_lag {
        return (None, 0.0);
    }
    let compare = window - max_lag;
    let mut normalized = vec![1.0f64; max_lag + 1];
    let mut cumulative = 0.0f64;
    for lag in 1..=max_lag {
        let mut difference = 0.0f64;
        for index in 0..compare {
            let delta = mono[index] as f64 - mono[index + lag] as f64;
            difference += delta * delta;
        }
        cumulative += difference;
        if cumulative > 0.0 {
            normalized[lag] = difference * lag as f64 / cumulative;
        }
    }
    let mut candidate = None;
    for lag in min_lag..max_lag {
        if normalized[lag] < 0.15 {
            let mut bottom = lag;
            while bottom < max_lag && normalized[bottom + 1] < normalized[bottom] {
                bottom += 1;
            }
            candidate = Some(bottom);
            break;
        }
    }
    let Some(lag) = candidate else {
        return (None, 0.0);
    };
    let confidence = (1.0 - normalized[lag]).clamp(0.0, 1.0) as f32;
    if confidence < 0.65 {
        return (None, confidence);
    }
    let left = normalized[lag - 1];
    let center = normalized[lag];
    let right = normalized[lag + 1];
    let denominator = left - 2.0 * center + right;
    let adjustment = if denominator.abs() > 1e-12 {
        (0.5 * (left - right) / denominator).clamp(-0.5, 0.5)
    } else {
        0.0
    };
    let frequency = source_rate as f64 / (lag as f64 + adjustment);
    (Some(frequency as f32), confidence)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_a_stereo_tone_and_preserves_channel_peaks() {
        let rate = 48_000.0;
        let mut stereo = Vec::new();
        for frame in 0..12_000 {
            let value = (std::f32::consts::TAU * 440.0 * frame as f32 / rate).sin() * 0.8;
            stereo.extend_from_slice(&[value, value * 0.5]);
        }
        let result = analyze_stereo(&stereo, rate).unwrap();
        assert!((result.pitch_hz.unwrap() - 440.0).abs() < 2.0);
        assert!(result.pitch_confidence > 0.9);
        assert!((result.peak - 0.8).abs() < 0.001);
        assert!(result.peaks[0] > result.peaks[1]);
        assert!(result.rms > 0.4 && result.rms < 0.5);
    }

    #[test]
    fn silence_and_transient_have_no_pitch() {
        let silence = vec![0.0; 8192 * 2];
        assert_eq!(analyze_stereo(&silence, 48_000.0).unwrap().pitch_hz, None);
        let mut transient = silence;
        transient[0] = 1.0;
        transient[1] = 1.0;
        assert_eq!(analyze_stereo(&transient, 48_000.0).unwrap().pitch_hz, None);
    }

    #[test]
    fn opposite_phase_stereo_still_yields_pitch() {
        let mut stereo = Vec::new();
        for frame in 0..12_000 {
            let value = (std::f32::consts::TAU * 330.0 * frame as f32 / 48_000.0).sin() * 0.6;
            stereo.extend_from_slice(&[value, -value]);
        }
        let summary = analyze_stereo(&stereo, 48_000.0).unwrap();
        assert!((summary.pitch_hz.unwrap() - 330.0).abs() < 2.0);
    }

    #[test]
    fn last_visual_bin_includes_final_frame() {
        let mut stereo = vec![0.0; 1024 * 2];
        stereo[2046] = -0.75;
        stereo[2047] = 0.25;
        let summary = analyze_stereo(&stereo, 48_000.0).unwrap();
        assert_eq!(summary.peaks[510..], [0.75, 0.25]);
        assert!(analyze_stereo(&stereo[..2047], 48_000.0).is_none());
    }
}
