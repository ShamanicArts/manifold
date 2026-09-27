//! Bounded stereo capture and loop playback with no allocation during processing.

pub struct LoopCapture {
    left: Vec<f32>,
    right: Vec<f32>,
    write: usize,
    length: usize,
    start: usize,
    position: f64,
    recording: bool,
    playing: bool,
    overdub: bool,
    reversed: bool,
    speed: f32,
    target_speed: f32,
    mix: f32,
    target_mix: f32,
    overdub_level: f32,
    smoothing: f32,
}

impl LoopCapture {
    pub fn new(sample_rate: f32, capacity_seconds: f32, mix: f32) -> Self {
        let seconds = capacity_seconds.clamp(0.05, 30.0);
        let size = ((sample_rate * seconds).round() as usize).max(1);
        let mix = mix.clamp(0.0, 1.0);
        Self {
            left: vec![0.0; size],
            right: vec![0.0; size],
            write: 0,
            length: 0,
            start: 0,
            position: 0.0,
            recording: false,
            playing: false,
            overdub: false,
            reversed: false,
            speed: 1.0,
            target_speed: 1.0,
            mix,
            target_mix: mix,
            overdub_level: 0.5,
            smoothing: ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32)
                .clamp(0.0001, 1.0),
        }
    }

    /// Discard the logical take without touching the prepared capture buffers.
    pub fn reset(&mut self) {
        self.write = 0;
        self.length = 0;
        self.start = 0;
        self.position = 0.0;
        self.recording = false;
        self.playing = false;
        self.overdub = false;
        self.speed = self.target_speed;
        self.mix = self.target_mix;
    }

    /// 0 record, 1 play, 2 overdub, 3 speed, 4 reverse, 5 wet mix, 6 overdub level.
    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => {
                let next = value >= 0.5;
                if next && !self.recording {
                    self.write = 0;
                    self.length = 0;
                    self.start = 0;
                    self.position = 0.0;
                    self.recording = true;
                    self.playing = false;
                    self.overdub = false;
                } else if !next && self.recording {
                    self.recording = false;
                    self.start = if self.length == self.left.len() {
                        self.write
                    } else {
                        0
                    };
                    self.position = 0.0;
                    self.playing = false;
                }
            }
            1 => self.playing = value >= 0.5 && self.length > 0,
            2 => self.overdub = value >= 0.5,
            3 => self.target_speed = value.clamp(0.0, 4.0),
            4 => self.reversed = value >= 0.5,
            5 => self.target_mix = value.clamp(0.0, 1.0),
            6 => self.overdub_level = value.clamp(0.0, 1.0),
            _ => return false,
        }
        true
    }

    pub fn length(&self) -> usize {
        self.length
    }
    /// A stopped take is ordered oldest to newest, even after the ring wraps.
    pub fn capture_length(&self) -> Option<usize> {
        (!self.recording).then_some(self.length)
    }

    /// Current ring window, ordered oldest to newest, including while recording.
    pub fn snapshot_length(&self) -> usize {
        self.length
    }

    /// Copy a bounded chunk without allocating. The caller may invoke this between blocks.
    pub fn copy_capture_interleaved(&self, start_frame: usize, output: &mut [f32]) -> usize {
        if self.recording {
            return 0;
        }
        self.copy_snapshot_interleaved(start_frame, output)
    }

    /// Copy the current ring window between process blocks, including while recording.
    pub fn copy_snapshot_interleaved(&self, start_frame: usize, output: &mut [f32]) -> usize {
        if start_frame >= self.length {
            return 0;
        }
        let start = if self.recording && self.length == self.left.len() {
            self.write
        } else {
            self.start
        };
        let frames = (output.len() / 2).min(self.length - start_frame);
        for frame in 0..frames {
            let index = (start + start_frame + frame) % self.left.len();
            output[frame * 2] = self.left[index];
            output[frame * 2 + 1] = self.right[index];
        }
        frames
    }
    pub fn position(&self) -> f32 {
        if self.length == 0 {
            0.0
        } else {
            (self.position / self.length as f64) as f32
        }
    }

    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        debug_assert_eq!(in_l.len(), out_l.len());
        debug_assert_eq!(in_r.len(), out_r.len());
        for frame in 0..in_l.len() {
            let dry_l = in_l[frame];
            let dry_r = in_r[frame];
            if self.recording {
                self.left[self.write] = dry_l;
                self.right[self.write] = dry_r;
                self.write += 1;
                if self.write == self.left.len() {
                    self.write = 0;
                }
                self.length = (self.length + 1).min(self.left.len());
                out_l[frame] = dry_l;
                out_r[frame] = dry_r;
                continue;
            }
            self.speed += (self.target_speed - self.speed) * self.smoothing;
            self.mix += (self.target_mix - self.mix) * self.smoothing;
            if self.playing && self.length > 0 {
                let loop_pos = if self.reversed {
                    (self.length as f64 - 1.0 - self.position).rem_euclid(self.length as f64)
                } else {
                    self.position
                };
                let index = loop_pos.floor() as usize;
                let next = (index + 1) % self.length;
                let fraction = (loop_pos - index as f64) as f32;
                let ring_index = (self.start + index) % self.left.len();
                let ring_next = (self.start + next) % self.left.len();
                let wet_l = self.left[ring_index]
                    + (self.left[ring_next] - self.left[ring_index]) * fraction;
                let wet_r = self.right[ring_index]
                    + (self.right[ring_next] - self.right[ring_index]) * fraction;
                out_l[frame] = dry_l * (1.0 - self.mix) + wet_l * self.mix;
                out_r[frame] = dry_r * (1.0 - self.mix) + wet_r * self.mix;
                if self.overdub {
                    self.left[ring_index] =
                        (self.left[ring_index] + dry_l * self.overdub_level).clamp(-1.0, 1.0);
                    self.right[ring_index] =
                        (self.right[ring_index] + dry_r * self.overdub_level).clamp(-1.0, 1.0);
                }
                self.position = (self.position + self.speed as f64) % self.length as f64;
            } else {
                out_l[frame] = dry_l;
                out_r[frame] = dry_r;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reset_discards_take_without_reallocating_ring_or_changing_controls() {
        let mut loop_node = LoopCapture::new(1000.0, 0.05, 1.0);
        let ring = loop_node.left.as_ptr();
        assert!(loop_node.set_parameter(3, 2.0));
        assert!(loop_node.set_parameter(0, 1.0));
        let input = [0.5; 4];
        let mut left = [0.0; 4];
        let mut right = [0.0; 4];
        loop_node.process_planar([&input, &input], [&mut left, &mut right]);
        assert!(loop_node.set_parameter(0, 0.0));
        assert!(loop_node.set_parameter(1, 1.0));
        loop_node.reset();
        assert_eq!(loop_node.left.as_ptr(), ring);
        assert_eq!(loop_node.capture_length(), Some(0));
        assert_eq!(loop_node.speed, 2.0);
        loop_node.process_planar([&[0.0; 4], &[0.0; 4]], [&mut left, &mut right]);
        assert_eq!(left, [0.0; 4]);
        assert_eq!(right, [0.0; 4]);
    }

    #[test]
    fn records_then_repeats_across_blocks() {
        let mut loop_node = LoopCapture::new(1000.0, 0.05, 1.0);
        assert!(loop_node.set_parameter(0, 1.0));
        let left = [1.0, 0.0, -1.0, 0.0];
        let right = [-1.0, 0.0, 1.0, 0.0];
        let mut out_l = [0.0; 4];
        let mut out_r = [0.0; 4];
        loop_node.process_planar([&left, &right], [&mut out_l, &mut out_r]);
        assert!(loop_node.set_parameter(0, 0.0));
        assert!(loop_node.set_parameter(1, 1.0));
        let silence = [0.0; 4];
        loop_node.process_planar([&silence, &silence], [&mut out_l, &mut out_r]);
        assert_eq!(out_l, left);
        assert_eq!(out_r, right);
        loop_node.process_planar([&silence, &silence], [&mut out_l, &mut out_r]);
        assert_eq!(out_l, left);
    }

    #[test]
    fn full_buffer_keeps_the_most_recent_frames() {
        let mut loop_node = LoopCapture::new(100.0, 0.05, 1.0);
        loop_node.set_parameter(0, 1.0);
        let input = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0];
        let mut output = [0.0; 7];
        let mut other = [0.0; 7];
        loop_node.process_planar([&input, &input], [&mut output, &mut other]);
        loop_node.set_parameter(0, 0.0);
        loop_node.set_parameter(1, 1.0);
        let silence = [0.0; 5];
        let mut played = [0.0; 5];
        let mut played_other = [0.0; 5];
        loop_node.process_planar([&silence, &silence], [&mut played, &mut played_other]);
        assert_eq!(played, [3.0, 4.0, 5.0, 6.0, 7.0]);
        let mut first_chunk = [0.0; 6];
        let mut second_chunk = [0.0; 4];
        assert_eq!(loop_node.copy_capture_interleaved(0, &mut first_chunk), 3);
        assert_eq!(loop_node.copy_capture_interleaved(3, &mut second_chunk), 2);
        assert_eq!(first_chunk, [3.0, 3.0, 4.0, 4.0, 5.0, 5.0]);
        assert_eq!(second_chunk, [6.0, 6.0, 7.0, 7.0]);
    }

    #[test]
    fn recording_take_cannot_be_exported_until_stopped() {
        let mut loop_node = LoopCapture::new(1000.0, 0.05, 1.0);
        loop_node.set_parameter(0, 1.0);
        let input = [0.25, 0.5];
        let mut left = [0.0; 2];
        let mut right = [0.0; 2];
        loop_node.process_planar([&input, &input], [&mut left, &mut right]);
        assert_eq!(loop_node.capture_length(), None);
        assert_eq!(loop_node.copy_capture_interleaved(0, &mut [0.0; 4]), 0);
        loop_node.set_parameter(0, 0.0);
        assert_eq!(loop_node.capture_length(), Some(2));
    }

    #[test]
    fn live_snapshot_tracks_wrapped_ring_without_stopping() {
        let mut capture = LoopCapture::new(100.0, 0.05, 1.0);
        capture.set_parameter(0, 1.0);
        let mut left = [0.0; 7];
        let mut right = [0.0; 7];
        capture.process_planar(
            [&[1., 2., 3., 4., 5., 6., 7.], &[0.; 7]],
            [&mut left, &mut right],
        );
        assert_eq!(capture.capture_length(), None);
        assert_eq!(capture.snapshot_length(), 5);
        let mut snapshot = [0.; 10];
        assert_eq!(capture.copy_snapshot_interleaved(0, &mut snapshot), 5);
        assert_eq!(snapshot, [3., 0., 4., 0., 5., 0., 6., 0., 7., 0.]);
        capture.process_planar([&[8., 9.], &[0.; 2]], [&mut left[..2], &mut right[..2]]);
        assert_eq!(capture.copy_snapshot_interleaved(0, &mut snapshot), 5);
        assert_eq!(snapshot, [5., 0., 6., 0., 7., 0., 8., 0., 9., 0.]);
        assert_eq!(capture.copy_capture_interleaved(0, &mut snapshot), 0);
    }

    #[test]
    fn reverse_and_overdub_update_the_playing_loop() {
        let mut loop_node = LoopCapture::new(1000.0, 0.05, 1.0);
        loop_node.set_parameter(0, 1.0);
        let input = [0.1, 0.2, 0.3, 0.4];
        let mut out_l = [0.0; 4];
        let mut out_r = [0.0; 4];
        loop_node.process_planar([&input, &input], [&mut out_l, &mut out_r]);
        loop_node.set_parameter(0, 0.0);
        loop_node.set_parameter(1, 1.0);
        loop_node.set_parameter(4, 1.0);
        loop_node.set_parameter(2, 1.0);
        let overdub = [0.1, 0.0, 0.0, 0.0];
        loop_node.process_planar([&overdub, &overdub], [&mut out_l, &mut out_r]);
        assert!((out_l[0] - 0.4).abs() < 1e-6);
        assert!((out_l[3] - 0.1).abs() < 1e-6);
        let silence = [0.0; 4];
        loop_node.process_planar([&silence, &silence], [&mut out_l, &mut out_r]);
        assert!((out_l[0] - 0.45).abs() < 1e-6);
        assert_eq!(out_l, out_r);
    }
}
