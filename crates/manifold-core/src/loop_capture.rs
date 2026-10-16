//! Bounded stereo capture and loop playback with no allocation during processing.

pub struct LoopCapture {
    left: Vec<f32>,
    right: Vec<f32>,
    staged: Vec<f32>,
    staging: Option<Staging>,
    retrospective: bool,
    write: usize,
    length: usize,
    revision: u64,
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

struct Staging {
    start: usize,
    length: usize,
    copied: usize,
    prefix_zero: usize,
}

/// Convert an authored duration to storage without clamping it to a quota.
/// Float rounding matches the graph's f32 constructor arguments.
pub fn capacity_frames(sample_rate: f32, seconds: f32) -> Option<usize> {
    if !sample_rate.is_finite() || sample_rate <= 0.0 || !seconds.is_finite() || seconds <= 0.0 {
        return None;
    }
    let frames = (sample_rate * seconds).round().max(1.0);
    if !frames.is_finite() || frames as f64 >= usize::MAX as f64 {
        return None;
    }
    let frames = frames as usize;
    frames.checked_mul(8)?;
    Some(frames)
}

impl LoopCapture {
    pub(crate) fn parameter_target(&self, id: u32) -> Option<f32> {
        if self.retrospective {
            return None;
        }
        Some(match id {
            0 => u8::from(self.recording) as f32,
            1 => u8::from(self.playing) as f32,
            2 => u8::from(self.overdub) as f32,
            3 => self.target_speed,
            4 => u8::from(self.reversed) as f32,
            5 => self.target_mix,
            6 => self.overdub_level,
            _ => return None,
        })
    }

    /// Swap all owned storage and history. The retired node receives the
    /// candidate's storage and is destroyed by the control owner later.
    /// Apply prepared control intent after the swap, so play can see the take
    /// and unchanged recording does not start a new one.
    pub(crate) fn transfer_owned_history_from(
        &mut self,
        previous: &mut Self,
        parameters: [f32; 7],
    ) -> bool {
        if self.retrospective != previous.retrospective
            || self.left.len() != previous.left.len()
            || self.staging.is_some()
            || previous.staging.is_some()
            || parameters.iter().any(|value| !value.is_finite())
        {
            return false;
        }
        std::mem::swap(self, previous);
        if !self.retrospective {
            for (id, value) in parameters.into_iter().enumerate() {
                if self.parameter_target(id as u32) != Some(value) {
                    self.set_parameter(id as u32, value);
                }
            }
        }
        true
    }

    /// Carry a retrospective ring into a replacement graph without copying or
    /// allocating. An in-progress staged snapshot belongs to its old runtime
    /// and prevents transfer.
    pub(crate) fn transfer_retrospective_history_from(&mut self, previous: &mut Self) -> bool {
        if !self.retrospective
            || !previous.retrospective
            || self.left.len() != previous.left.len()
            || self.staging.is_some()
            || previous.staging.is_some()
        {
            return false;
        }
        std::mem::swap(&mut self.left, &mut previous.left);
        std::mem::swap(&mut self.right, &mut previous.right);
        std::mem::swap(&mut self.write, &mut previous.write);
        std::mem::swap(&mut self.length, &mut previous.length);
        std::mem::swap(&mut self.start, &mut previous.start);
        true
    }

    pub fn new(sample_rate: f32, capacity_seconds: f32, mix: f32) -> Option<Self> {
        Self::new_with_mode(sample_rate, capacity_seconds, mix, false)
    }

    pub fn new_retrospective(sample_rate: f32, capacity_seconds: f32) -> Option<Self> {
        Self::new_with_mode(sample_rate, capacity_seconds, 0.0, true)
    }

    fn new_with_mode(
        sample_rate: f32,
        capacity_seconds: f32,
        mix: f32,
        retrospective: bool,
    ) -> Option<Self> {
        let size = capacity_frames(sample_rate, capacity_seconds)?;
        let left = crate::io::prepare_planar_buffer(1, size).ok()?;
        let right = crate::io::prepare_planar_buffer(1, size).ok()?;
        let mix = mix.clamp(0.0, 1.0);
        Some(Self {
            left,
            right,
            staged: Vec::new(),
            staging: None,
            retrospective,
            write: 0,
            length: 0,
            revision: 0,
            start: 0,
            position: 0.0,
            recording: retrospective,
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
        })
    }

    /// Discard the logical take without touching the prepared capture buffers.
    pub fn reset(&mut self) {
        self.staging = None;
        self.write = 0;
        self.length = 0;
        self.revision = self.revision.wrapping_add(1);
        self.start = 0;
        self.position = 0.0;
        self.recording = self.retrospective;
        self.playing = false;
        self.overdub = false;
        self.speed = self.target_speed;
        self.mix = self.target_mix;
    }

    /// A host may reset processing before an offline render or after a
    /// transport discontinuity. A stopped authored take is project data and
    /// must survive that lifecycle event. Explicit `reset` still clears it.
    pub fn reset_processing(&mut self) {
        if self.retrospective {
            self.reset();
            return;
        }
        self.staging = None;
        self.position = 0.0;
        self.speed = self.target_speed;
        self.mix = self.target_mix;
    }

    /// 0 record, 1 play, 2 overdub, 3 speed, 4 reverse, 5 wet mix, 6 overdub level.
    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() || self.retrospective {
            return false;
        }
        match id {
            0 => {
                let next = value >= 0.5;
                if next && !self.recording {
                    self.staging = None;
                    self.write = 0;
                    self.length = 0;
                    self.start = 0;
                    self.position = 0.0;
                    self.recording = true;
                    self.revision = self.revision.wrapping_add(1);
                    self.playing = false;
                    self.overdub = false;
                } else if !next && self.recording {
                    self.recording = false;
                    self.revision = self.revision.wrapping_add(1);
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
            2 => {
                let next = value >= 0.5;
                if next != self.overdub {
                    self.revision = self.revision.wrapping_add(1);
                }
                self.overdub = next;
                if self.overdub {
                    self.staging = None;
                }
            }
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

    /// Changes whenever a prepared take becomes invalid or its PCM changes.
    pub fn revision(&self) -> u64 {
        self.revision
    }
    /// A stopped take is ordered oldest to newest, even after the ring wraps.
    pub fn capture_length(&self) -> Option<usize> {
        (!self.recording).then_some(self.length)
    }

    /// PCM is immutable while neither recording nor overdubbing is active.
    pub fn stable_capture_length(&self) -> Option<usize> {
        (!self.recording && !self.overdub).then_some(self.length)
    }

    /// Restore a stopped take during graph preparation, before audio starts.
    /// The source is resampled into the prepared ring so project state is
    /// independent of the host's current sample rate.
    pub fn load_stereo(&mut self, stereo: Vec<f32>, source_rate: f32, sample_rate: f32) -> bool {
        if self.retrospective
            || !source_rate.is_finite()
            || !sample_rate.is_finite()
            || source_rate <= 0.0
            || sample_rate <= 0.0
            || stereo.len() < 2
            || stereo.len() % 2 != 0
            || !stereo.iter().all(|sample| sample.is_finite())
        {
            return false;
        }
        let source_frames = stereo.len() / 2;
        let target_frames = ((source_frames as f64 * sample_rate as f64 / source_rate as f64)
            .round() as usize)
            .max(1);
        if target_frames > self.left.len() {
            return false;
        }
        for frame in 0..target_frames {
            let source = frame as f64 * source_rate as f64 / sample_rate as f64;
            let index = (source.floor() as usize).min(source_frames - 1);
            let next = (index + 1).min(source_frames - 1);
            let fraction = (source - index as f64).clamp(0.0, 1.0) as f32;
            self.left[frame] =
                stereo[index * 2] + (stereo[next * 2] - stereo[index * 2]) * fraction;
            self.right[frame] =
                stereo[index * 2 + 1] + (stereo[next * 2 + 1] - stereo[index * 2 + 1]) * fraction;
        }
        self.staging = None;
        self.write = target_frames % self.left.len();
        self.length = target_frames;
        self.revision = self.revision.wrapping_add(1);
        self.start = 0;
        self.position = 0.0;
        self.recording = false;
        self.playing = false;
        self.overdub = false;
        true
    }

    /// Current ring window, ordered oldest to newest, including while recording.
    pub fn snapshot_length(&self) -> usize {
        self.length
    }

    /// The next write position and ring size for the legacy free-capture
    /// start/stop decision. Read between processing blocks.
    pub fn capacity(&self) -> usize {
        self.left.len()
    }

    pub fn retrospective_cursor(&self) -> Option<(usize, usize)> {
        self.retrospective.then_some((self.write, self.left.len()))
    }

    /// Start a frozen window. Allocation is confined to the caller's control path.
    pub fn begin_staged_snapshot(&mut self) -> bool {
        self.begin_staged_snapshot_recent(0)
    }

    /// Allocate and initialize staging storage while the graph is being
    /// prepared, before a host callback can request a snapshot.
    pub fn reserve_staging_capacity(&mut self, frames: usize) -> bool {
        if frames == 0 || frames > self.left.len() || self.staging.is_some() {
            return false;
        }
        let Some(count) = frames.checked_mul(2) else {
            return false;
        };
        if self
            .staged
            .try_reserve_exact(count.saturating_sub(self.staged.len()))
            .is_err()
        {
            return false;
        }
        self.staged.resize(count, 0.0);
        true
    }

    /// A nonzero request chooses a trailing window; retrospective history is
    /// padded with leading silence before the ring has received enough input.
    pub fn begin_staged_snapshot_recent(&mut self, requested_frames: usize) -> bool {
        self.begin_snapshot(requested_frames, true)
    }

    /// Callback-safe variant: an unprepared or oversized request fails instead
    /// of growing the staging buffer.
    pub fn begin_prepared_staged_snapshot_recent(&mut self, requested_frames: usize) -> bool {
        if requested_frames == 0
            || requested_frames > self.left.len()
            || (!self.retrospective && requested_frames > self.length)
        {
            return false;
        }
        self.begin_snapshot(requested_frames, false)
    }

    fn begin_snapshot(&mut self, requested_frames: usize, allow_growth: bool) -> bool {
        if (!self.recording && (self.retrospective || self.overdub)) || self.staging.is_some() {
            return false;
        }
        let length = if requested_frames == 0 {
            self.length
        } else if self.retrospective {
            requested_frames.min(self.left.len())
        } else {
            requested_frames.min(self.length)
        };
        if length == 0 {
            return false;
        }
        if self.staged.len() < length * 2 {
            if !allow_growth {
                return false;
            }
            if self
                .staged
                .try_reserve_exact(length * 2 - self.staged.len())
                .is_err()
            {
                return false;
            }
            self.staged.resize(length * 2, 0.0);
        }
        let available = length.min(self.length);
        self.staging = Some(Staging {
            start: if self.recording {
                (self.write + self.left.len() - available) % self.left.len()
            } else {
                (self.start + self.length - available) % self.left.len()
            },
            length,
            copied: 0,
            prefix_zero: length - available,
        });
        true
    }

    /// None means idle; Some(false) copying; Some(true) ready for export.
    pub fn staged_status(&self) -> Option<bool> {
        self.staging
            .as_ref()
            .map(|stage| stage.copied == stage.length)
    }

    pub fn staged_length(&self) -> Option<usize> {
        self.staging
            .as_ref()
            .filter(|stage| stage.copied == stage.length)
            .map(|stage| stage.length)
    }

    pub fn copy_staged_interleaved(&self, start_frame: usize, output: &mut [f32]) -> usize {
        let Some(length) = self.staged_length() else {
            return 0;
        };
        if start_frame >= length {
            return 0;
        }
        let frames = (output.len() / 2).min(length - start_frame);
        output[..frames * 2]
            .copy_from_slice(&self.staged[start_frame * 2..(start_frame + frames) * 2]);
        frames
    }

    pub fn take_staged(&mut self) -> Option<Vec<f32>> {
        let length = self.staged_length()?;
        self.staging = None;
        Some(self.staged[..length * 2].to_vec())
    }

    pub fn cancel_staged(&mut self) {
        self.staging = None;
    }

    pub(crate) fn advance_staged(&mut self, block_frames: usize) {
        let Some(stage) = &mut self.staging else {
            return;
        };
        let budget = block_frames.saturating_mul(16).min(8192).max(block_frames);
        let end = (stage.copied + budget).min(stage.length);
        for frame in stage.copied..end {
            if frame < stage.prefix_zero {
                self.staged[frame * 2] = 0.0;
                self.staged[frame * 2 + 1] = 0.0;
            } else {
                let index = (stage.start + frame - stage.prefix_zero) % self.left.len();
                self.staged[frame * 2] = self.left[index];
                self.staged[frame * 2 + 1] = self.right[index];
            }
        }
        stage.copied = end;
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
        if self.overdub && self.playing && self.length > 0 && !in_l.is_empty() {
            self.revision = self.revision.wrapping_add(1);
        }
        self.advance_staged(in_l.len());
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
    fn host_processing_reset_restarts_playback_without_erasing_the_take() {
        let mut loop_node = LoopCapture::new(48_000.0, 0.05, 1.0).unwrap();
        assert!(loop_node.load_stereo(vec![0.2, -0.3, 0.4, -0.5], 48_000.0, 48_000.0));
        assert!(loop_node.set_parameter(1, 1.0));
        let revision = loop_node.revision();
        let mut first_left = [0.0; 1];
        let mut first_right = [0.0; 1];
        loop_node.process_planar([&[0.0], &[0.0]], [&mut first_left, &mut first_right]);
        loop_node.reset_processing();
        assert_eq!(loop_node.capture_length(), Some(2));
        assert_eq!(loop_node.revision(), revision);
        let mut left = [0.0; 2];
        let mut right = [0.0; 2];
        loop_node.process_planar([&[0.0; 2], &[0.0; 2]], [&mut left, &mut right]);
        assert_eq!(left, [0.2, 0.4]);
        assert_eq!(right, [-0.3, -0.5]);
        loop_node.reset();
        assert_eq!(loop_node.capture_length(), Some(0));
    }

    #[test]
    fn take_revision_invalidates_snapshots_on_record_and_overdub_changes() {
        let mut loop_node = LoopCapture::new(1_000.0, 0.05, 1.0).unwrap();
        let initial = loop_node.revision();
        assert!(loop_node.set_parameter(0, 1.0));
        assert_ne!(loop_node.revision(), initial);
        let recording = loop_node.revision();
        let mut left = [0.0; 4];
        let mut right = [0.0; 4];
        loop_node.process_planar([&[0.2; 4], &[0.3; 4]], [&mut left, &mut right]);
        assert_eq!(loop_node.revision(), recording);
        assert!(loop_node.set_parameter(0, 0.0));
        let stopped = loop_node.revision();
        assert_ne!(stopped, recording);
        assert!(loop_node.set_parameter(1, 1.0));
        loop_node.process_planar([&[0.0; 4], &[0.0; 4]], [&mut left, &mut right]);
        assert_eq!(loop_node.revision(), stopped);
        assert!(loop_node.set_parameter(2, 1.0));
        loop_node.process_planar([&[0.1; 4], &[0.1; 4]], [&mut left, &mut right]);
        let overdubbed = loop_node.revision();
        assert_ne!(overdubbed, stopped);
        assert!(loop_node.set_parameter(2, 0.0));
        assert_ne!(loop_node.revision(), overdubbed);
        let before_reset = loop_node.revision();
        loop_node.reset();
        assert_ne!(loop_node.revision(), before_reset);
    }

    #[test]
    fn restored_pcm_plays_and_stages_at_a_different_host_rate() {
        let mut loop_node = LoopCapture::new(48_000.0, 0.05, 1.0).unwrap();
        assert!(loop_node.load_stereo(vec![0.2, -0.3, 0.4, -0.5], 24_000.0, 48_000.0));
        assert_eq!(loop_node.capture_length(), Some(4));
        assert!(loop_node.set_parameter(1, 1.0));
        let mut left = [0.0; 4];
        let mut right = [0.0; 4];
        loop_node.process_planar([&[0.0; 4], &[0.0; 4]], [&mut left, &mut right]);
        assert_eq!(left, [0.2, 0.3, 0.4, 0.4]);
        assert_eq!(right, [-0.3, -0.4, -0.5, -0.5]);
        assert!(loop_node.reserve_staging_capacity(4));
        assert!(loop_node.begin_prepared_staged_snapshot_recent(4));
        loop_node.process_planar([&[0.0; 4], &[0.0; 4]], [&mut left, &mut right]);
        let mut copied = [0.0; 8];
        assert_eq!(loop_node.copy_staged_interleaved(0, &mut copied), 4);
        assert_eq!(copied, [0.2, -0.3, 0.3, -0.4, 0.4, -0.5, 0.4, -0.5]);
    }

    #[test]
    fn reset_discards_take_without_reallocating_ring_or_changing_controls() {
        let mut loop_node = LoopCapture::new(1000.0, 0.05, 1.0).unwrap();
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
        let mut loop_node = LoopCapture::new(1000.0, 0.05, 1.0).unwrap();
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
        let mut loop_node = LoopCapture::new(100.0, 0.05, 1.0).unwrap();
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
        let mut loop_node = LoopCapture::new(1000.0, 0.05, 1.0).unwrap();
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
        let mut capture = LoopCapture::new(100.0, 0.05, 1.0).unwrap();
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
    fn staged_snapshot_survives_ring_overwrite_and_record_restart_cancels_it() {
        let mut capture = LoopCapture::new(1000.0, 0.5, 1.0).unwrap();
        capture.set_parameter(0, 1.0);
        let mut out_l = [0.; 10];
        let mut out_r = [0.; 10];
        for block in 0..60 {
            let left = [block as f32; 10];
            capture.process_planar([&left, &left], [&mut out_l, &mut out_r]);
        }
        assert!(capture.begin_staged_snapshot());
        assert_eq!(capture.staged_status(), Some(false));
        assert!(!capture.begin_staged_snapshot());
        for _ in 0..6 {
            capture.process_planar([&[9.; 10], &[9.; 10]], [&mut out_l, &mut out_r]);
        }
        assert_eq!(capture.staged_status(), Some(true));
        let mut frozen = [0.; 1000];
        assert_eq!(capture.copy_staged_interleaved(0, &mut frozen), 500);
        assert_eq!(frozen[0], 10.);
        assert_eq!(frozen[998], 59.);
        assert_eq!(capture.snapshot_length(), 500);
        assert_eq!(capture.copy_snapshot_interleaved(0, &mut [0.; 2]), 1);
        assert_eq!(capture.take_staged(), Some(frozen.to_vec()));
        assert_eq!(capture.staged_status(), None);
        assert!(capture.begin_staged_snapshot());
        capture.set_parameter(0, 0.0);
        capture.set_parameter(0, 1.0);
        assert_eq!(capture.staged_status(), None);
    }

    #[test]
    fn retrospective_capture_runs_without_record_control_and_pads_early_history() {
        let mut capture = LoopCapture::new_retrospective(100.0, 1.0).unwrap();
        assert_eq!(capture.retrospective_cursor(), Some((0, 100)));
        assert!(!capture.set_parameter(0, 0.0));
        let mut left = [0.; 3];
        let mut right = [0.; 3];
        capture.process_planar([&[1., 2., 3.], &[4., 5., 6.]], [&mut left, &mut right]);
        assert_eq!(left, [1., 2., 3.]);
        assert_eq!(right, [4., 5., 6.]);
        assert_eq!(capture.retrospective_cursor(), Some((3, 100)));
        assert!(capture.begin_staged_snapshot_recent(5));
        capture.process_planar([&[7., 8., 9.], &[7., 8., 9.]], [&mut left, &mut right]);
        assert_eq!(
            capture.take_staged(),
            Some(vec![0., 0., 0., 0., 1., 4., 2., 5., 3., 6.])
        );
        capture.reset();
        capture.process_planar([&[0.5; 3], &[0.25; 3]], [&mut left, &mut right]);
        assert_eq!(left, [0.5; 3]);
        assert!(capture.begin_staged_snapshot_recent(2));
        capture.process_planar([&[0.; 3], &[0.; 3]], [&mut left, &mut right]);
        assert_eq!(capture.take_staged(), Some(vec![0.5, 0.25, 0.5, 0.25]));
    }

    #[test]
    fn prepared_stage_reuses_storage_and_rejects_oversized_callback_request() {
        let mut capture = LoopCapture::new_retrospective(100.0, 1.0).unwrap();
        assert!(!capture.begin_prepared_staged_snapshot_recent(5));
        assert!(capture.reserve_staging_capacity(10));
        let storage = capture.staged.as_ptr();
        assert!(!capture.begin_prepared_staged_snapshot_recent(11));
        assert!(!capture.begin_prepared_staged_snapshot_recent(101));
        assert!(capture.begin_prepared_staged_snapshot_recent(5));
        let mut left = [0.0; 5];
        let mut right = [0.0; 5];
        capture.process_planar([&[0.25; 5], &[0.5; 5]], [&mut left, &mut right]);
        assert_eq!(capture.staged_status(), Some(true));
        assert_eq!(capture.take_staged(), Some(vec![0.0; 10]));
        assert_eq!(capture.staged.as_ptr(), storage);
        assert!(capture.begin_prepared_staged_snapshot_recent(10));
        capture.process_planar([&[1.0; 5], &[2.0; 5]], [&mut left, &mut right]);
        assert_eq!(capture.staged_status(), Some(true));
        assert_eq!(capture.staged.as_ptr(), storage);
        let mut short = LoopCapture::new_retrospective(100.0, 1.0).unwrap();
        assert!(short.reserve_staging_capacity(100));
        assert!(!short.begin_prepared_staged_snapshot_recent(101));
    }

    #[test]
    fn reverse_and_overdub_update_the_playing_loop() {
        let mut loop_node = LoopCapture::new(1000.0, 0.05, 1.0).unwrap();
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
