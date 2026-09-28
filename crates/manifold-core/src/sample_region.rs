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
        Some(Self {
            stereo: Vec::with_capacity(frames * 2),
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
        && sample_count / 2 <= (source_rate as usize).saturating_mul(MAX_SAMPLE_SECONDS)
        && sample_count / 2 <= MAX_SAMPLE_FRAMES
}

#[derive(Clone)]
pub struct SampleRegion {
    output_rate: f32,
    source_rate: f32,
    stereo: Arc<Vec<f32>>,
    position: f64,
    speed: f32,
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
            speed: 1.0,
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
        self.playing = false;
    }

    pub(crate) fn load_validated(&mut self, source: ValidatedStereo) {
        self.stereo = Arc::new(source.stereo);
        self.source_rate = source.source_rate;
        self.playing = false;
        self.position = 0.0;
    }

    pub(crate) fn replace_prepared(&mut self, source: &PreparedStereo) -> RetiredStereo {
        let old = std::mem::replace(&mut self.stereo, Arc::clone(&source.stereo));
        self.source_rate = source.source_rate;
        self.playing = false;
        self.position = 0.0;
        RetiredStereo { stereo: old }
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
            _ => return false,
        }
        true
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
        self.playing = true;
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

    pub fn process_sample(&mut self) -> [f32; 2] {
        if !self.playing || self.stereo.is_empty() {
            return [0.0; 2];
        }
        let frames = self.stereo.len() / 2;
        let region_start = ((frames - 1) as f64 * self.loop_start as f64).floor() as usize;
        let region_end = ((frames - 1) as f64 * self.loop_end as f64).floor() as usize;
        if region_start >= region_end {
            self.playing = false;
            return [0.0; 2];
        }
        let position = self.position.clamp(0.0, (frames - 1) as f64);
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
        let increment = self.speed as f64 * self.source_rate as f64 / self.output_rate as f64;
        self.position += if self.reverse { -increment } else { increment };
        if self.reverse {
            if self.position < region_start as f64 {
                if self.one_shot {
                    self.playing = false;
                } else {
                    self.position = region_end as f64
                        - fade as f64
                        - (region_start as f64 - self.position - 1.0)
                            .rem_euclid((window - fade) as f64);
                }
            }
        } else if self.position > region_end as f64 {
            if self.one_shot {
                self.playing = false;
            } else {
                self.position = region_start as f64
                    + fade as f64
                    + (self.position - region_end as f64 - 1.0).rem_euclid((window - fade) as f64);
            }
        }
        output
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
        assert_eq!(player.process_sample(), [0.25, 0.0]);
    }

    #[test]
    fn loops_and_plays_once_in_both_directions() {
        let mut player = SampleRegion::new(8000.0);
        assert!(player.load_stereo(vec![0., 0., 1., -1., 2., -2., 3., -3.], 8000.0));
        player.trigger();
        let forward: Vec<_> = (0..6).map(|_| player.process_sample()[0]).collect();
        assert_eq!(forward, [0., 1., 2., 3., 0., 1.]);
        player.set_parameter(1, 1.0);
        player.set_parameter(2, 1.0);
        player.trigger();
        let reverse: Vec<_> = (0..6).map(|_| player.process_sample()[0]).collect();
        assert_eq!(reverse, [3., 2., 1., 0., 0., 0.]);
    }

    #[test]
    fn source_rate_and_region_are_respected() {
        let mut player = SampleRegion::new(8000.0);
        assert!(player.load_stereo(vec![0., 0., 1., 1., 2., 2., 3., 3.], 16000.0));
        player.set_parameter(3, 1.0 / 3.0);
        player.set_parameter(4, 1.0 / 3.0);
        player.set_parameter(5, 1.0);
        player.trigger();
        assert_eq!(player.process_sample(), [1., 1.]);
        assert_eq!(player.process_sample(), [3., 3.]);
        assert_eq!(player.process_sample(), [2., 2.]);
    }

    #[test]
    fn crossfade_blends_the_seam_and_skips_the_overlapped_head() {
        let mut player = SampleRegion::new(8000.0);
        assert!(player.load_stereo(vec![1., 1., 1., 1., -1., -1., -1., -1.], 8000.0));
        player.set_parameter(8, 0.5);
        player.trigger();
        let forward: Vec<_> = (0..5).map(|_| player.process_sample()[0]).collect();
        assert_eq!(forward[..3], [1., 1., -1.]);
        assert!(forward[3].abs() < 0.0001);
        assert_eq!(forward[4], -1.);
        player.set_parameter(1, 1.0);
        player.trigger();
        let reverse: Vec<_> = (0..5).map(|_| player.process_sample()[0]).collect();
        assert_eq!(reverse[..3], [-1., -1., 1.]);
        assert!(reverse[3].abs() < 0.0001);
        assert_eq!(reverse[4], 1.);
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
