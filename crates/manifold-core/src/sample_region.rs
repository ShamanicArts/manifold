//! File-backed stereo region playback. Decoding and storage replacement happen before processing.

use crate::events::EventKind;
use std::sync::Arc;

pub const MAX_SAMPLE_SECONDS: usize = 30;
pub const MAX_SAMPLE_FRAMES: usize = 48_000 * MAX_SAMPLE_SECONDS;

/// PCM that was checked before publication. Only constructors in this module
/// can create it, so the audio-thread source switch does not rescan the file.
pub struct ValidatedStereo {
    stereo: Vec<f32>,
    source_rate: f32,
}

/// Allocation and finite-value validation completed on a control thread.
/// The audio thread may clone this Arc without allocating or scanning PCM.
pub struct PreparedStereo {
    stereo: Arc<Vec<f32>>,
    source_rate: f32,
}

/// Keep the displaced source alive until a control thread can drop it.
pub struct RetiredStereo {
    stereo: Arc<Vec<f32>>,
}

impl ValidatedStereo {
    pub fn from_stereo(stereo: Vec<f32>, source_rate: f32) -> Option<Self> {
        if !valid_shape(stereo.len(), source_rate)
            || stereo.iter().any(|sample| !sample.is_finite())
        {
            return None;
        }
        Some(Self {
            stereo,
            source_rate,
        })
    }

    pub fn prepare(self) -> PreparedStereo {
        PreparedStereo {
            stereo: Arc::new(self.stereo),
            source_rate: self.source_rate,
        }
    }
}

impl RetiredStereo {
    pub fn frames(&self) -> usize {
        self.stereo.len() / 2
    }
}

/// Storage for a decoded source whose values arrive in bounded chunks.
/// Validation must advance in order through every frame before publication.
pub struct StereoSampleUpload {
    stereo: Vec<f32>,
    source_rate: f32,
    total_frames: usize,
    validated_frames: usize,
}

impl StereoSampleUpload {
    pub fn new(frames: usize, source_rate: f32) -> Option<Self> {
        if !valid_shape(frames.checked_mul(2)?, source_rate) {
            return None;
        }
        let mut stereo = Vec::new();
        stereo.try_reserve_exact(frames * 2).ok()?;
        Some(Self {
            stereo,
            source_rate,
            total_frames: frames,
            validated_frames: 0,
        })
    }

    pub fn prepare_next(&mut self, start_frame: usize, frames: usize) -> bool {
        let Some(end) = start_frame.checked_add(frames) else {
            return false;
        };
        if frames == 0
            || start_frame != self.validated_frames
            || self.stereo.len() != start_frame * 2
            || end > self.total_frames
        {
            return false;
        }
        self.stereo.resize(end * 2, 0.0);
        true
    }

    pub fn as_mut_ptr(&mut self) -> *mut f32 {
        self.stereo.as_mut_ptr()
    }

    pub fn samples_mut(&mut self) -> &mut [f32] {
        &mut self.stereo
    }

    pub fn validate_next(&mut self, start_frame: usize, frames: usize) -> bool {
        if frames == 0
            || start_frame != self.validated_frames
            || start_frame
                .checked_add(frames)
                .is_none_or(|end| end > self.total_frames || self.stereo.len() != end * 2)
        {
            return false;
        }
        let start = start_frame * 2;
        let end = (start_frame + frames) * 2;
        if self.stereo[start..end]
            .iter()
            .any(|sample| !sample.is_finite())
        {
            return false;
        }
        self.validated_frames += frames;
        true
    }

    pub fn is_complete(&self) -> bool {
        self.validated_frames == self.total_frames && self.stereo.len() == self.total_frames * 2
    }

    pub fn finish(self) -> Option<ValidatedStereo> {
        self.is_complete().then_some(ValidatedStereo {
            stereo: self.stereo,
            source_rate: self.source_rate,
        })
    }
}

fn valid_shape(sample_count: usize, source_rate: f32) -> bool {
    sample_count >= 2
        && sample_count % 2 == 0
        && source_rate.is_finite()
        && (8_000.0..=384_000.0).contains(&source_rate)
}

#[derive(Clone)]
pub struct SampleRegion {
    output_rate: f32,
    source_rate: f32,
    stereo: Arc<Vec<f32>>,
    position: f64,
    unison_positions: [f64; 7],
    unison_active: [bool; 8],
    unison_voice_gains: [f32; 8],
    unison_smoothing: f32,
    speed: f32,
    unison: usize,
    detune_cents: f32,
    spread: f32,
    speed_multipliers: [f64; 8],
    pan_gains: [[f32; 2]; 8],
    unison_gain: f32,
    reverse: bool,
    one_shot: bool,
    play_start: f32,
    loop_start: f32,
    loop_end: f32,
    crossfade: f32,
    playing: bool,
}

impl SampleRegion {
    pub fn new(output_rate: f32) -> Self {
        Self {
            output_rate,
            source_rate: output_rate,
            stereo: Arc::new(Vec::new()),
            position: 0.0,
            unison_positions: [0.0; 7],
            unison_active: [false; 8],
            unison_voice_gains: [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            unison_smoothing: (1.0 - (-1.0 / (0.008 * output_rate)).exp()).clamp(0.0001, 1.0),
            speed: 1.0,
            unison: 1,
            detune_cents: 0.0,
            spread: 0.0,
            speed_multipliers: [1.0; 8],
            pan_gains: [[0.0; 2]; 8],
            unison_gain: 1.0,
            reverse: false,
            one_shot: false,
            play_start: 0.0,
            loop_start: 0.0,
            loop_end: 1.0,
            crossfade: 0.0,
            playing: false,
        }
    }

    /// Stop playback and rewind without releasing prepared PCM or changing region controls.
    pub fn reset(&mut self) {
        self.position = 0.0;
        self.unison_positions.fill(0.0);
        self.unison_active.fill(false);
        self.reset_unison_voice_gains();
        self.playing = false;
    }

    pub fn load_stereo(&mut self, stereo: Vec<f32>, source_rate: f32) -> bool {
        let Some(source) = ValidatedStereo::from_stereo(stereo, source_rate) else {
            return false;
        };
        self.load_validated(source);
        true
    }

    pub fn clear_sample(&mut self) {
        self.stereo = Arc::new(Vec::new());
        self.source_rate = self.output_rate;
        self.position = 0.0;
        self.unison_positions.fill(0.0);
        self.unison_active.fill(false);
        self.reset_unison_voice_gains();
        self.playing = false;
    }

    pub(crate) fn load_validated(&mut self, source: ValidatedStereo) {
        self.stereo = Arc::new(source.stereo);
        self.source_rate = source.source_rate;
        self.playing = false;
        self.position = 0.0;
        self.unison_positions.fill(0.0);
        self.unison_active.fill(false);
        self.reset_unison_voice_gains();
    }

    pub(crate) fn replace_prepared(&mut self, source: &PreparedStereo) -> RetiredStereo {
        let old = std::mem::replace(&mut self.stereo, Arc::clone(&source.stereo));
        self.source_rate = source.source_rate;
        self.playing = false;
        self.position = 0.0;
        self.unison_positions.fill(0.0);
        self.unison_active.fill(false);
        self.reset_unison_voice_gains();
        RetiredStereo { stereo: old }
    }

    pub(crate) fn prepared_source(&self) -> Option<PreparedStereo> {
        (!self.stereo.is_empty()).then(|| PreparedStereo {
            stereo: Arc::clone(&self.stereo),
            source_rate: self.source_rate,
        })
    }

    /// Author targets are distinct from display meters and trigger actions.
    pub(crate) fn target_parameter(&self, id: u32) -> Option<f32> {
        Some(match id {
            0 => self.speed,
            1 => self.reverse as u32 as f32,
            2 => self.one_shot as u32 as f32,
            3 => self.play_start,
            4 => self.loop_start,
            5 => self.loop_end,
            6 => self.playing as u32 as f32,
            7 => 0.0,
            8 => self.crossfade,
            9 => self.unison as f32,
            10 => self.detune_cents,
            11 => self.spread,
            _ => return None,
        })
    }

    /// Move PCM and bounded playback history without dropping an Arc in audio.
    /// The host establishes equal authored PCM before selecting this transfer.
    pub(crate) fn transfer_owned_history(&mut self, old: &mut Self) -> bool {
        if self.output_rate != old.output_rate {
            return false;
        }
        let targets: [f32; 12] =
            std::array::from_fn(|id| self.target_parameter(id as u32).unwrap());
        std::mem::swap(self, old);
        for (id, value) in targets.into_iter().enumerate() {
            // Playing/trigger are event state, not authored scalar targets.
            if id != 6 && id != 7 {
                self.set_parameter(id as u32, value);
            }
        }
        true
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.speed = value.clamp(0.0, 8.0),
            1 => self.reverse = value >= 0.5,
            2 => self.one_shot = value >= 0.5,
            3 => self.play_start = value.clamp(0.0, 1.0),
            4 => self.loop_start = value.clamp(0.0, 1.0),
            5 => self.loop_end = value.clamp(0.0, 1.0),
            6 => self.playing = value >= 0.5 && !self.stereo.is_empty(),
            7 if value >= 0.5 => self.trigger(),
            7 => {}
            8 => self.crossfade = value.clamp(0.0, 0.5),
            9 => {
                let count = value.round().clamp(1.0, 8.0) as usize;
                for voice in self.unison..count {
                    self.unison_positions[voice - 1] = self.position;
                    self.unison_active[voice] = self.playing;
                    self.unison_voice_gains[voice] = 0.0;
                }
                self.unison = count;
                if self.one_shot {
                    self.playing = self.unison_active[..count].iter().any(|active| *active);
                }
            }
            10 => self.detune_cents = value.clamp(0.0, 100.0),
            11 => self.spread = value.clamp(0.0, 1.0),
            _ => return false,
        }
        if (9..=11).contains(&id) {
            self.refresh_stack_coefficients();
        }
        true
    }

    fn refresh_stack_coefficients(&mut self) {
        let center = (self.unison - 1) as f32 * 0.5;
        let max_offset = center.max(1.0);
        for voice in 0..self.unison {
            let offset = (voice as f32 - center) / max_offset;
            self.speed_multipliers[voice] =
                2.0_f64.powf(f64::from(offset * self.detune_cents) / 1200.0);
            let pan = (0.5 + offset * self.spread * 0.5).clamp(0.0, 1.0);
            self.pan_gains[voice] = [(1.0 - pan).sqrt(), pan.sqrt()];
        }
        self.unison_gain = 1.0 / (self.unison as f32).sqrt();
    }

    pub fn event(&mut self, event: EventKind) {
        match event {
            EventKind::NoteOn { velocity, .. } if velocity > 0 => self.trigger(),
            EventKind::AllNotesOff => self.playing = false,
            EventKind::PitchBend { .. } => {}
            _ => {}
        }
    }

    pub fn meter(&self, band: usize) -> Option<f32> {
        match band {
            0 => Some(if self.stereo.len() > 2 {
                (self.position / (self.stereo.len() / 2 - 1) as f64).clamp(0.0, 1.0) as f32
            } else {
                0.0
            }),
            1 => Some(if self.playing { 1.0 } else { 0.0 }),
            _ => None,
        }
    }

    pub fn sample_frames(&self) -> usize {
        self.stereo.len() / 2
    }

    /// Copy a bounded chronological span for host-side state export.
    pub fn copy_stereo_interleaved(&self, start_frame: usize, destination: &mut [f32]) -> usize {
        if destination.len() % 2 != 0 || start_frame >= self.sample_frames() {
            return 0;
        }
        let frames = (destination.len() / 2).min(self.sample_frames() - start_frame);
        destination[..frames * 2]
            .copy_from_slice(&self.stereo[start_frame * 2..(start_frame + frames) * 2]);
        frames
    }

    /// Bounded display peak in chronological sample order.
    pub fn sample_peak(&self, start: usize, end: usize) -> f32 {
        let first = start.min(self.sample_frames());
        let last = end.min(self.sample_frames());
        let stride = ((last.saturating_sub(first) + 63) / 64).max(1);
        let mut peak = 0.0_f32;
        for frame in (first..last).step_by(stride) {
            peak = peak
                .max(self.stereo[frame * 2].abs())
                .max(self.stereo[frame * 2 + 1].abs());
        }
        peak
    }

    /// Old Main's per-block modulator reads an integer playback cursor divided by sample length.
    pub fn legacy_normalized_position(&self) -> f32 {
        let frames = self.stereo.len() / 2;
        if frames == 0 {
            return 0.0;
        }
        self.position.floor().clamp(0.0, (frames - 1) as f64) as f32 / frames as f32
    }

    pub(crate) fn share_sample_from(&mut self, source: &Self) {
        self.stereo = Arc::clone(&source.stereo);
        self.source_rate = source.source_rate;
        self.position = 0.0;
        self.unison_positions.fill(0.0);
        self.unison_active.fill(false);
        self.reset_unison_voice_gains();
        self.playing = false;
    }

    pub(crate) fn shares_sample_with(&self, source: &Self) -> bool {
        Arc::ptr_eq(&self.stereo, &source.stereo)
    }

    pub fn is_playing(&self) -> bool {
        self.playing
    }

    fn trigger(&mut self) {
        if self.stereo.is_empty() {
            return;
        }
        let frames = self.stereo.len() / 2;
        let start = ((frames - 1) as f64 * self.play_start as f64).floor();
        let end = ((frames - 1) as f64 * self.loop_end.max(self.loop_start) as f64).floor();
        self.position = if self.reverse { end } else { start };
        self.unison_positions.fill(self.position);
        self.unison_active.fill(false);
        self.unison_active[..self.unison].fill(true);
        self.reset_unison_voice_gains();
        self.playing = true;
    }

    fn reset_unison_voice_gains(&mut self) {
        self.unison_voice_gains = [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0];
    }

    fn read_at(&self, position: f64) -> [f32; 2] {
        let frames = self.stereo.len() / 2;
        let position = position.clamp(0.0, (frames - 1) as f64);
        let first = position.floor() as usize;
        let second = (first + 1).min(frames - 1);
        let frac = (position - first as f64) as f32;
        let mut output = [0.0; 2];
        for channel in 0..2 {
            let a = self.stereo[first * 2 + channel];
            let b = self.stereo[second * 2 + channel];
            output[channel] = a + (b - a) * frac;
        }
        output
    }

    fn render_voice(&self, mut position: f64, increment: f64) -> ([f32; 2], f64, bool) {
        let frames = self.stereo.len() / 2;
        let region_start = ((frames - 1) as f64 * self.loop_start as f64).floor() as usize;
        let region_end = ((frames - 1) as f64 * self.loop_end as f64).floor() as usize;
        if region_start >= region_end {
            return ([0.0; 2], position, false);
        }
        position = position.clamp(0.0, (frames - 1) as f64);
        let window = region_end - region_start + 1;
        let fade = ((self.crossfade * window as f32).round() as usize).min(window - 1);
        let seam = if self.reverse {
            position < (region_start + fade) as f64
        } else {
            position >= (region_end + 1 - fade) as f64
        };
        let output = if !self.one_shot && fade > 0 && seam {
            let seam_offset = if self.reverse {
                region_start as f64 + fade as f64 - 1.0 - position
            } else {
                position - (region_end + 1 - fade) as f64
            };
            let other_position = if self.reverse {
                region_end as f64 - seam_offset
            } else {
                region_start as f64 + seam_offset
            };
            let mix = (seam_offset / fade as f64).clamp(0.0, 1.0) as f32;
            let tail_gain = (mix * std::f32::consts::FRAC_PI_2).cos();
            let head_gain = (mix * std::f32::consts::FRAC_PI_2).sin();
            let tail = self.read_at(position);
            let head = self.read_at(other_position);
            [
                tail[0] * tail_gain + head[0] * head_gain,
                tail[1] * tail_gain + head[1] * head_gain,
            ]
        } else {
            self.read_at(position)
        };
        position += if self.reverse { -increment } else { increment };
        let mut active = true;
        if self.reverse {
            if position < region_start as f64 {
                if self.one_shot {
                    active = false;
                } else {
                    position = region_end as f64
                        - fade as f64
                        - (region_start as f64 - position - 1.0).rem_euclid((window - fade) as f64);
                }
            }
        } else if position > region_end as f64 {
            if self.one_shot {
                active = false;
            } else {
                position = region_start as f64
                    + fade as f64
                    + (position - region_end as f64 - 1.0).rem_euclid((window - fade) as f64);
            }
        }
        (output, position, active)
    }

    pub fn process_sample(&mut self) -> [f32; 2] {
        if !self.playing || self.stereo.is_empty() {
            return [0.0; 2];
        }
        let base_increment = self.speed as f64 * self.source_rate as f64 / self.output_rate as f64;
        if self.unison == 1 {
            let (output, position, active) = self.render_voice(self.position, base_increment);
            self.position = position;
            self.playing = active;
            // The original SampleRegionPlaybackNode applies equal-power center
            // pan even with one voice, before its contributor normalization.
            return [
                output[0] * std::f32::consts::FRAC_1_SQRT_2,
                output[1] * std::f32::consts::FRAC_1_SQRT_2,
            ];
        }
        let mut mixed = [0.0; 2];
        let mut contributors = 0;
        for voice in 0..self.unison {
            // The historical node starts secondary unison voices at zero on
            // each trigger and fades them in over about eight milliseconds.
            self.unison_voice_gains[voice] +=
                (1.0 - self.unison_voice_gains[voice]) * self.unison_smoothing;
            if self.one_shot && !self.unison_active[voice] {
                continue;
            }
            let old_position = if voice == 0 {
                self.position
            } else {
                self.unison_positions[voice - 1]
            };
            let (sample, next_position, active) =
                self.render_voice(old_position, base_increment * self.speed_multipliers[voice]);
            if voice == 0 {
                self.position = next_position;
            } else {
                self.unison_positions[voice - 1] = next_position;
            }
            self.unison_active[voice] = active;
            let voice_gain = self.unison_voice_gains[voice];
            mixed[0] += sample[0] * self.pan_gains[voice][0] * voice_gain;
            mixed[1] += sample[1] * self.pan_gains[voice][1] * voice_gain;
            contributors += 1;
        }
        if contributors == 0 {
            self.playing = false;
            return [0.0; 2];
        }
        if self.one_shot {
            self.playing = self.unison_active[..self.unison]
                .iter()
                .any(|active| *active);
        }
        let gain = if contributors == self.unison {
            self.unison_gain
        } else {
            1.0 / (contributors as f32).sqrt()
        };
        [mixed[0] * gain, mixed[1] * gain]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bounded_upload_requires_ordered_finite_complete_pcm() {
        let mut upload = StereoSampleUpload::new(4, 8000.0).unwrap();
        assert!(!upload.prepare_next(2, 2));
        assert!(upload.prepare_next(0, 2));
        upload.samples_mut()[2] = f32::NAN;
        assert!(!upload.validate_next(0, 2));
        upload.samples_mut()[2] = 0.25;
        assert!(upload.validate_next(0, 2));
        assert!(!upload.is_complete());
        assert!(upload.prepare_next(2, 2));
        assert!(upload.validate_next(2, 2));
        assert!(upload.is_complete());
        let source = upload.finish().unwrap();
        let mut player = SampleRegion::new(8000.0);
        player.load_validated(source);
        player.trigger();
        assert_eq!(player.process_sample(), [0.0, 0.0]);
        assert_eq!(
            player.process_sample(),
            [0.25 * std::f32::consts::FRAC_1_SQRT_2, 0.0]
        );
    }

    #[test]
    fn loops_and_plays_once_in_both_directions() {
        let mut player = SampleRegion::new(8000.0);
        assert!(player.load_stereo(vec![0., 0., 1., -1., 2., -2., 3., -3.], 8000.0));
        player.trigger();
        let forward: Vec<_> = (0..6).map(|_| player.process_sample()[0]).collect();
        let center = std::f32::consts::FRAC_1_SQRT_2;
        assert_eq!(forward, [0., center, 2. * center, 3. * center, 0., center]);
        player.set_parameter(1, 1.0);
        player.set_parameter(2, 1.0);
        player.trigger();
        let reverse: Vec<_> = (0..6).map(|_| player.process_sample()[0]).collect();
        assert_eq!(reverse, [3. * center, 2. * center, center, 0., 0., 0.]);
    }

    #[test]
    fn unison_uses_independent_detuned_cursors_and_stereo_spread() {
        let pcm: Vec<f32> = (0..512)
            .flat_map(|frame| {
                let value = (frame as f32 * 0.12).sin();
                [value, value]
            })
            .collect();
        let mut single = SampleRegion::new(48_000.0);
        let mut stacked = SampleRegion::new(48_000.0);
        assert!(single.load_stereo(pcm.clone(), 48_000.0));
        assert!(stacked.load_stereo(pcm, 48_000.0));
        assert!(stacked.set_parameter(9, 2.0));
        assert!(stacked.set_parameter(10, 100.0));
        assert!(stacked.set_parameter(11, 1.0));
        single.trigger();
        stacked.trigger();
        let mut separated = false;
        let mut changed = false;
        for _ in 0..128 {
            let base = single.process_sample();
            let pair = stacked.process_sample();
            separated |= (pair[0] - pair[1]).abs() > 0.001;
            changed |= (pair[0] - base[0]).abs() > 0.001;
            assert!(pair.iter().all(|sample| sample.is_finite()));
        }
        assert!(separated);
        assert!(changed);
        assert!(stacked.is_playing());
    }

    #[test]
    fn secondary_unison_voices_ramp_from_zero_after_each_trigger() {
        let mut player = SampleRegion::new(48_000.0);
        assert!(player.load_stereo(vec![1.0; 9600], 48_000.0));
        assert!(player.set_parameter(9, 3.0));
        player.trigger();
        let first = player.process_sample()[0];
        let expected_gain = 1.0 - (-1.0_f32 / (0.008 * 48_000.0)).exp();
        let expected =
            (1.0 + 2.0 * expected_gain) / 3.0_f32.sqrt() * std::f32::consts::FRAC_1_SQRT_2;
        assert!((first - expected).abs() < 1.0e-6);
        let late = (0..512).map(|_| player.process_sample()[0]).last().unwrap();
        assert!(late > first * 2.0);
        player.trigger();
        assert!((player.process_sample()[0] - first).abs() < 1.0e-6);
    }

    #[test]
    fn one_voice_uses_legacy_equal_power_center_pan() {
        let mut player = SampleRegion::new(48_000.0);
        assert!(player.load_stereo(vec![1.0, -1.0, 1.0, -1.0], 48_000.0));
        player.trigger();
        assert_eq!(
            player.process_sample(),
            [
                std::f32::consts::FRAC_1_SQRT_2,
                -std::f32::consts::FRAC_1_SQRT_2,
            ]
        );
    }

    #[test]
    fn source_rate_and_region_are_respected() {
        let mut player = SampleRegion::new(8000.0);
        assert!(player.load_stereo(vec![0., 0., 1., 1., 2., 2., 3., 3.], 16000.0));
        player.set_parameter(3, 1.0 / 3.0);
        player.set_parameter(4, 1.0 / 3.0);
        player.set_parameter(5, 1.0);
        player.trigger();
        let center = std::f32::consts::FRAC_1_SQRT_2;
        assert_eq!(player.process_sample(), [center, center]);
        assert_eq!(player.process_sample(), [3. * center, 3. * center]);
        assert_eq!(player.process_sample(), [2. * center, 2. * center]);
    }

    #[test]
    fn crossfade_blends_the_seam_and_skips_the_overlapped_head() {
        let mut player = SampleRegion::new(8000.0);
        assert!(player.load_stereo(vec![1., 1., 1., 1., -1., -1., -1., -1.], 8000.0));
        player.set_parameter(8, 0.5);
        player.trigger();
        let forward: Vec<_> = (0..5).map(|_| player.process_sample()[0]).collect();
        let center = std::f32::consts::FRAC_1_SQRT_2;
        assert_eq!(forward[..3], [center, center, -center]);
        assert!(forward[3].abs() < 0.0001);
        assert_eq!(forward[4], -center);
        player.set_parameter(1, 1.0);
        player.trigger();
        let reverse: Vec<_> = (0..5).map(|_| player.process_sample()[0]).collect();
        assert_eq!(reverse[..3], [-center, -center, center]);
        assert!(reverse[3].abs() < 0.0001);
        assert_eq!(reverse[4], center);
    }

    #[test]
    fn display_peaks_follow_uploaded_sample_head_to_tail() {
        let mut player = SampleRegion::new(8_000.0);
        assert!(player.load_stereo(vec![0.8, -0.7, 0.8, -0.7, 0.1, -0.05, 0.1, -0.05], 8_000.0));
        assert_eq!(player.sample_frames(), 4);
        assert!((player.sample_peak(0, 2) - 0.8).abs() < 1e-6);
        assert!((player.sample_peak(2, 4) - 0.1).abs() < 1e-6);
        assert_eq!(player.sample_peak(4, 8), 0.0);
    }
}
