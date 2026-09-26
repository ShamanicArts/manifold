//! File-backed stereo region playback. Decoding and storage replacement happen before processing.

use crate::events::EventKind;
use std::sync::Arc;

pub const MAX_SAMPLE_SECONDS: usize = 30;
pub const MAX_SAMPLE_FRAMES: usize = 48_000 * MAX_SAMPLE_SECONDS;

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

    pub fn load_stereo(&mut self, stereo: Vec<f32>, source_rate: f32) -> bool {
        if stereo.len() < 2
            || stereo.len() % 2 != 0
            || !source_rate.is_finite()
            || !(8_000.0..=384_000.0).contains(&source_rate)
            || stereo.len() / 2 > (source_rate as usize).saturating_mul(MAX_SAMPLE_SECONDS)
            || stereo.len() / 2 > MAX_SAMPLE_FRAMES
            || stereo.iter().any(|sample| !sample.is_finite())
        {
            return false;
        }
        self.stereo = Arc::new(stereo);
        self.source_rate = source_rate;
        self.playing = false;
        self.position = 0.0;
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
            _ => return false,
        }
        true
    }

    pub fn event(&mut self, event: EventKind) {
        match event {
            EventKind::NoteOn { velocity, .. } if velocity > 0 => self.trigger(),
            EventKind::AllNotesOff => self.playing = false,
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

    pub(crate) fn share_sample_from(&mut self, source: &Self) {
        self.stereo = Arc::clone(&source.stereo);
        self.source_rate = source.source_rate;
        self.position = 0.0;
        self.playing = false;
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
}
