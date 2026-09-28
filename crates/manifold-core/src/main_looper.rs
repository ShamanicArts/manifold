//! Main's four-layer looper. Prepared storage and bounded commit copying.
//! Behavior follows Main/dsp/looper_baseline.lua and DSPHostLoopLayerBundle.cpp.

pub const LAYERS: usize = 4;
pub const BARS: [f32; 9] = [0.0625, 0.125, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0];
const COPY_PER_BLOCK: usize = 4096;
const CAPTURE_PEAK_BLOCK: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum Mode {
    FirstLoop,
    Free,
    Traditional,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u32)]
pub enum LayerState {
    Empty,
    Playing,
    Recording,
    Stopped,
    Paused,
}

struct Commit {
    requested: usize,
    target: usize,
    copied: usize,
    start: usize,
    overdub: bool,
}
struct Loading {
    frames: usize,
    copied: usize,
    bars: f32,
    position: f64,
    playing: bool,
}

struct Layer {
    capture: Vec<f32>,       // interleaved stereo, rolling 30-second ring
    capture_peaks: Vec<f32>, // prepared physical-ring maxima for visual queries
    loops: [Vec<f32>; 2],
    active: usize,
    write: usize,
    captured: usize,
    length: usize,
    position: f64,
    seek_source: f64,
    seek_remaining: u32,
    playing: bool,
    muted: bool,
    volume: f32,
    speed: f32,
    reversed: bool,
    bars: f32,
    commit: Option<Commit>,
    loading: Option<Loading>,
}

impl Layer {
    fn new(frames: usize) -> Self {
        Self {
            capture: vec![0.0; frames * 2],
            capture_peaks: vec![0.0; frames.div_ceil(CAPTURE_PEAK_BLOCK)],
            loops: [vec![0.0; frames * 2], vec![0.0; frames * 2]],
            active: 0,
            write: 0,
            captured: 0,
            length: 0,
            position: 0.0,
            seek_source: 0.0,
            seek_remaining: 0,
            playing: false,
            muted: false,
            volume: 1.0,
            speed: 1.0,
            reversed: false,
            bars: 0.0,
            commit: None,
            loading: None,
        }
    }
    fn capacity(&self) -> usize {
        self.capture.len() / 2
    }
    fn write_capture(&mut self, left: f32, right: f32) {
        let frame = self.write;
        self.capture[frame * 2] = left;
        self.capture[frame * 2 + 1] = right;
        let block = frame / CAPTURE_PEAK_BLOCK;
        let magnitude = left.abs().max(right.abs());
        if frame % CAPTURE_PEAK_BLOCK == 0 {
            self.capture_peaks[block] = magnitude;
        } else {
            self.capture_peaks[block] = self.capture_peaks[block].max(magnitude);
        }
        self.write = (frame + 1) % self.capacity();
        self.captured = (self.captured + 1).min(self.capacity());
    }
    fn capture_peak(&self, start_ago: usize, end_ago: usize) -> f32 {
        let capacity = self.capacity();
        let mut age = start_ago.min(self.captured);
        let end = end_ago.min(self.captured);
        let dirty_block = if self.write % CAPTURE_PEAK_BLOCK == 0 {
            None
        } else {
            Some(self.write / CAPTURE_PEAK_BLOCK)
        };
        let mut peak = 0.0_f32;
        while age < end {
            let physical = (self.write + capacity - 1 - age) % capacity;
            let block = physical / CAPTURE_PEAK_BLOCK;
            let block_start = block * CAPTURE_PEAK_BLOCK;
            let block_size = (capacity - block_start).min(CAPTURE_PEAK_BLOCK);
            let run = (physical - block_start + 1).min(end - age);
            if run == block_size && dirty_block != Some(block) {
                peak = peak.max(self.capture_peaks[block]);
            } else {
                for offset in 0..run {
                    let frame = physical - offset;
                    peak = peak.max(self.capture[frame * 2].abs());
                    peak = peak.max(self.capture[frame * 2 + 1].abs());
                }
            }
            age += run;
        }
        peak.min(1.0)
    }
    fn clear(&mut self) {
        self.commit = None;
        self.length = 0;
        self.position = 0.0;
        self.seek_source = 0.0;
        self.seek_remaining = 0;
        self.playing = false;
        self.loading = None;
        self.muted = false;
        self.volume = 1.0;
        self.speed = 1.0;
        self.reversed = false;
        self.bars = 0.0;
    }
    fn begin_commit(&mut self, frames: usize, bars: f32, overdub: bool, length_wins: bool) -> bool {
        if frames == 0 || self.commit.is_some() || self.loading.is_some() {
            return false;
        }
        let requested = frames.min(self.capacity());
        let target = if overdub && self.length > 0 && !length_wins {
            self.length.max(requested)
        } else {
            requested
        };
        self.commit = Some(Commit {
            requested,
            target,
            copied: 0,
            start: (self.write + self.capacity() - requested) % self.capacity(),
            overdub,
        });
        self.bars = bars;
        true
    }
    fn copy_commit(&mut self) {
        let Some(mut job) = self.commit.take() else {
            return;
        };
        let end = (job.copied + COPY_PER_BLOCK).min(job.target);
        let next = 1 - self.active;
        for frame in job.copied..end {
            let source = (job.start + frame % job.requested) % self.capacity();
            for channel in 0..2 {
                let incoming = self.capture[source * 2 + channel];
                let previous = if job.overdub && self.length > 0 {
                    self.loops[self.active][(frame % self.length) * 2 + channel]
                } else {
                    0.0
                };
                self.loops[next][frame * 2 + channel] = previous + incoming;
            }
        }
        job.copied = end;
        if end == job.target {
            self.active = next;
            self.length = job.target;
            self.position = self.position.rem_euclid(self.length as f64);
            self.seek_remaining = 0;
            self.playing = true;
        } else {
            self.commit = Some(job);
        }
    }
    /// Gate output and post-volume output. Main's Sample L1-L4 taps the gate.
    fn sample(&mut self) -> ([f32; 2], [f32; 2]) {
        if !self.playing || self.length == 0 {
            return ([0.0; 2], [0.0; 2]);
        }
        let index = self.position.floor() as usize;
        let loop_data = &self.loops[self.active];
        let mut out = [0.0; 2];
        let increment = if self.reversed {
            -self.speed
        } else {
            self.speed
        };
        if !self.muted {
            for channel in 0..2 {
                let mut sample = loop_data[index * 2 + channel];
                // Main's LoopPlaybackNode blends the last 4,410 frames into
                // the loop head when moving forward.
                if increment > 0.0 && self.length > 4410 && index >= self.length - 4410 {
                    let head_index = index - (self.length - 4410);
                    let head = loop_data[head_index * 2 + channel];
                    let mix = head_index as f32 / 4410.0;
                    sample = sample * (mix * std::f32::consts::FRAC_PI_2).cos()
                        + head * (mix * std::f32::consts::FRAC_PI_2).sin();
                }
                if self.seek_remaining > 0 {
                    let source_index = self.seek_source.floor() as usize;
                    let source = loop_data[source_index * 2 + channel];
                    let t = 1.0 - self.seek_remaining as f32 / 64.0;
                    sample = source * (1.0 - t) + sample * t;
                }
                out[channel] = sample;
            }
        }
        if self.seek_remaining > 0 {
            self.seek_source = (self.seek_source + increment as f64).rem_euclid(self.length as f64);
            self.seek_remaining -= 1;
        }
        self.position = (self.position + increment as f64).rem_euclid(self.length as f64);
        (out, [out[0] * self.volume, out[1] * self.volume])
    }
    fn begin_load(&mut self, frames: usize, bars: f32, position: f64, playing: bool) -> bool {
        if frames == 0
            || frames > self.capacity()
            || self.commit.is_some()
            || self.loading.is_some()
            || !bars.is_finite()
            || !position.is_finite()
            || !(0.0..=16.0).contains(&bars)
            || !(0.0..=1.0).contains(&position)
        {
            return false;
        }
        self.loading = Some(Loading {
            frames,
            copied: 0,
            bars,
            position,
            playing,
        });
        true
    }
    fn load_chunk(&mut self, offset: usize, values: &[f32]) -> bool {
        let Some(job) = self.loading.as_mut() else {
            return false;
        };
        let frames = values.len() / 2;
        if offset != job.copied
            || values.len() % 2 != 0
            || frames == 0
            || frames > 4096
            || offset + frames > job.frames
            || values.iter().any(|v| !v.is_finite())
        {
            self.loading = None;
            return false;
        }
        let next = 1 - self.active;
        self.loops[next][offset * 2..(offset + frames) * 2].copy_from_slice(values);
        job.copied += frames;
        true
    }
    fn finish_load(&mut self) -> bool {
        let Some(job) = self.loading.take() else {
            return false;
        };
        if job.copied != job.frames {
            return false;
        }
        self.active = 1 - self.active;
        self.length = job.frames;
        self.position = (job.position as f64 * job.frames as f64).rem_euclid(job.frames as f64);
        self.seek_remaining = 0;
        self.playing = job.playing;
        self.bars = job.bars;
        true
    }
}

pub struct MainLooper {
    sample_rate: f32,
    layers: [Layer; LAYERS],
    frame: u64,
    recording_start: Option<u64>,
    recording_layer: usize,
    active: usize,
    mode: Mode,
    tempo: f32,
    target_bpm: f32,
    overdub: bool,
    overdub_length_wins: bool,
    forward_bars: Option<f32>,
}

impl MainLooper {
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = if sample_rate.is_finite() {
            sample_rate.clamp(8_000.0, 192_000.0)
        } else {
            48_000.0
        };
        let frames = (sample_rate * 30.0) as usize;
        Self {
            sample_rate,
            layers: std::array::from_fn(|_| Layer::new(frames)),
            frame: 0,
            recording_start: None,
            recording_layer: 0,
            active: 0,
            mode: Mode::FirstLoop,
            tempo: 120.0,
            target_bpm: 120.0,
            overdub: true,
            overdub_length_wins: false,
            forward_bars: None,
        }
    }
    pub fn mode(&self) -> Mode {
        self.mode
    }
    pub fn tempo(&self) -> f32 {
        self.tempo
    }
    pub fn target_bpm(&self) -> f32 {
        self.target_bpm
    }
    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }
    pub fn overdub_length_wins(&self) -> bool {
        self.overdub_length_wins
    }
    pub fn active(&self) -> usize {
        self.active
    }
    pub fn recording(&self) -> bool {
        self.recording_start.is_some()
    }
    pub fn overdub(&self) -> bool {
        self.overdub
    }
    pub fn forward_bars(&self) -> Option<f32> {
        self.forward_bars
    }
    pub fn samples_per_bar(&self) -> f32 {
        self.sample_rate * 240.0 / self.tempo
    }
    /// Shared scalar presentation contract for browser and native hosts.
    pub fn status(&self, id: u32, layer: usize) -> f32 {
        match id {
            0 => self.tempo(),
            1 => self.active() as f32,
            2 => self.mode() as u32 as f32,
            3 => self.recording() as u8 as f32,
            4 => self.overdub() as u8 as f32,
            5 => self.forward_bars().unwrap_or(0.0),
            6 => self.samples_per_bar(),
            7 => self.layer_state(layer) as u32 as f32,
            8 => self.layer_length(layer) as f32,
            9 => self.layer_position(layer),
            10 => self.layer_bars(layer),
            11 => self.layer_pending(layer),
            12 => self.capture_frames(layer) as f32,
            13..=16 => self.layer_control(layer, id - 13),
            17 => self.target_bpm(),
            18 => self.overdub_length_wins() as u8 as f32,
            19 => self.sample_rate(),
            _ => 0.0,
        }
    }
    pub fn layer_state(&self, index: usize) -> LayerState {
        let Some(layer) = self.layers.get(index) else {
            return LayerState::Empty;
        };
        if self.recording() && self.recording_layer == index {
            LayerState::Recording
        } else if layer.length == 0 {
            LayerState::Empty
        } else if layer.playing {
            LayerState::Playing
        } else if layer.position == 0.0 {
            LayerState::Stopped
        } else {
            LayerState::Paused
        }
    }
    pub fn layer_length(&self, index: usize) -> usize {
        self.layers.get(index).map_or(0, |l| l.length)
    }
    pub fn layer_position(&self, index: usize) -> f32 {
        self.layer_position_precise(index) as f32
    }
    /// Preserve the native playhead precision in portable session saves.
    pub fn layer_position_precise(&self, index: usize) -> f64 {
        self.layers.get(index).map_or(0.0, |l| {
            if l.length == 0 {
                0.0
            } else {
                l.position / l.length as f64
            }
        })
    }
    pub fn layer_bars(&self, index: usize) -> f32 {
        self.layers.get(index).map_or(0.0, |l| l.bars)
    }
    pub fn layer_pending(&self, index: usize) -> f32 {
        self.layers
            .get(index)
            .and_then(|l| l.commit.as_ref())
            .map_or(0.0, |c| (c.copied + 1) as f32 / c.target as f32)
    }
    pub fn layer_control(&self, index: usize, id: u32) -> f32 {
        let Some(layer) = self.layers.get(index) else {
            return 0.0;
        };
        match id {
            0 => layer.volume,
            1 => {
                if layer.reversed {
                    -layer.speed
                } else {
                    layer.speed
                }
            }
            2 => layer.muted as u8 as f32,
            3 => layer.playing as u8 as f32,
            _ => 0.0,
        }
    }
    pub fn set_control(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.active = value.round().clamp(0.0, 3.0) as usize,
            1 => {
                self.mode = match value.round() as u32 {
                    0 => Mode::FirstLoop,
                    1 => Mode::Free,
                    _ => Mode::Traditional,
                }
            }
            2 => self.tempo = value.clamp(20.0, 300.0),
            3 => self.target_bpm = value.clamp(20.0, 300.0),
            4 => self.overdub = value >= 0.5,
            5 => self.overdub_length_wins = value >= 0.5,
            _ => return false,
        }
        true
    }
    pub fn set_layer_control(&mut self, index: usize, id: u32, value: f32) -> bool {
        let Some(layer) = self.layers.get_mut(index) else {
            return false;
        };
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => layer.volume = value.clamp(0.0, 2.0),
            1 => {
                layer.speed = value.abs().clamp(0.0, 4.0);
                layer.reversed = value < 0.0;
            }
            2 => layer.muted = value >= 0.5,
            3 => {
                layer.playing = value >= 0.5 && layer.length > 0;
            }
            4 => {
                let next =
                    (value.clamp(0.0, 1.0) as f64 * layer.length.saturating_sub(1) as f64).floor();
                if layer.length > 0 && (next - layer.position).abs() > 1.0 {
                    layer.seek_source = layer.position;
                    layer.seek_remaining = 64;
                } else {
                    layer.seek_remaining = 0;
                }
                layer.position = next;
            }
            _ => return false,
        }
        true
    }
    pub fn start_recording(&mut self) {
        if self.recording_start.is_none() {
            self.recording_start = Some(self.frame);
            self.recording_layer = self.active;
        }
    }
    pub fn stop_recording(&mut self) -> bool {
        let Some(start) = self.recording_start.take() else {
            return false;
        };
        let duration = self.frame.saturating_sub(start) as usize;
        if duration == 0 {
            return false;
        }
        self.active = self.recording_layer;
        let bars = if self.mode == Mode::FirstLoop {
            let minutes = duration as f32 / self.sample_rate / 60.0;
            let best = BARS
                .into_iter()
                .min_by(|a, b| {
                    let da = (a * 4.0 / minutes - self.target_bpm).abs();
                    let db = (b * 4.0 / minutes - self.target_bpm).abs();
                    da.total_cmp(&db).then_with(|| b.total_cmp(a))
                })
                .unwrap();
            self.tempo = (best * 4.0 / minutes).clamp(20.0, 300.0);
            best
        } else {
            let spb = self.samples_per_bar();
            let mut best_frames = duration;
            let mut best_distance = usize::MAX;
            for unit in [1.0, 0.5, 0.25, 0.125, 0.0625] {
                let quantum = (spb * unit).trunc().max(1.0) as usize;
                let candidate = ((duration as f32 / quantum as f32).round() as usize) * quantum;
                let distance = candidate.abs_diff(duration);
                if distance < best_distance {
                    best_frames = candidate;
                    best_distance = distance;
                }
            }
            best_frames.max(1) as f32 / spb
        };
        self.commit(bars)
    }
    pub fn commit(&mut self, bars: f32) -> bool {
        if !bars.is_finite() || !(0.0625..=16.0).contains(&bars) {
            return false;
        }
        let frames = (bars * self.samples_per_bar()).round().max(1.0) as usize;
        self.forward_bars = None;
        self.layers[self.active].begin_commit(frames, bars, self.overdub, self.overdub_length_wins)
    }
    pub fn click_capture_segment(&mut self, bars: f32) -> bool {
        if self.mode == Mode::Traditional {
            if !BARS.contains(&bars) {
                return false;
            }
            self.forward_bars = Some(bars);
            true
        } else {
            self.commit(bars)
        }
    }
    pub fn fire_forward(&mut self) -> bool {
        self.forward_bars.is_some_and(|bars| self.commit(bars))
    }
    pub fn play_all(&mut self) {
        for layer in &mut self.layers {
            layer.playing = layer.length > 0;
        }
    }
    pub fn pause_all(&mut self) {
        for layer in &mut self.layers {
            layer.playing = false;
        }
    }
    pub fn stop_all(&mut self) {
        for layer in &mut self.layers {
            layer.playing = false;
            layer.position = 0.0;
            layer.seek_remaining = 0;
        }
    }
    pub fn clear_all(&mut self) {
        for layer in &mut self.layers {
            layer.clear();
        }
        self.recording_start = None;
        self.forward_bars = None;
    }
    pub fn clear_layer(&mut self, index: usize) {
        if let Some(layer) = self.layers.get_mut(index) {
            layer.clear();
        }
    }
    pub fn capture_frames(&self, index: usize) -> usize {
        self.layers.get(index).map_or(0, |l| l.captured)
    }
    pub fn copy_loop_interleaved(&self, index: usize, start: usize, output: &mut [f32]) -> usize {
        let Some(layer) = self.layers.get(index) else {
            return 0;
        };
        if start >= layer.length {
            return 0;
        }
        let frames = (output.len() / 2).min(layer.length - start);
        output[..frames * 2]
            .copy_from_slice(&layer.loops[layer.active][start * 2..(start + frames) * 2]);
        frames
    }
    pub fn begin_layer_load(
        &mut self,
        index: usize,
        frames: usize,
        bars: f32,
        position: f32,
        playing: bool,
    ) -> bool {
        self.begin_layer_load_precise(index, frames, bars, position as f64, playing)
    }
    pub fn begin_layer_load_precise(
        &mut self,
        index: usize,
        frames: usize,
        bars: f32,
        position: f64,
        playing: bool,
    ) -> bool {
        self.layers
            .get_mut(index)
            .is_some_and(|layer| layer.begin_load(frames, bars, position, playing))
    }
    pub fn load_layer_chunk(&mut self, index: usize, start: usize, samples: &[f32]) -> bool {
        self.layers
            .get_mut(index)
            .is_some_and(|layer| layer.load_chunk(start, samples))
    }
    pub fn finish_layer_load(&mut self, index: usize) -> bool {
        self.layers.get_mut(index).is_some_and(Layer::finish_load)
    }
    pub fn cancel_layer_load(&mut self, index: usize) {
        if let Some(layer) = self.layers.get_mut(index) {
            layer.loading = None;
        }
    }
    pub fn peak(&self, index: usize, kind: u32, start: usize, end: usize) -> f32 {
        let Some(layer) = self.layers.get(index) else {
            return 0.0;
        };
        if kind == 1 {
            return layer.capture_peak(start, end);
        }
        if kind != 0 {
            return 0.0;
        }
        let count = layer.length;
        if count == 0 {
            return 0.0;
        }
        let mut peak: f32 = 0.0;
        let first = start.min(count);
        let last = end.min(count);
        let stride = ((last.saturating_sub(first) + 63) / 64).max(1);
        for frame in (first..last).step_by(stride) {
            let pcm = &layer.loops[layer.active];
            peak = peak.max(pcm[frame * 2].abs()).max(pcm[frame * 2 + 1].abs());
        }
        peak.min(1.0)
    }
    pub fn process(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        self.process_routed(input, input, output);
    }

    /// Main routes dry host input plus the synth send to every capture ring,
    /// while the audible synth branch has its own downstream gain.
    pub fn process_routed(
        &mut self,
        capture: [&[f32]; 2],
        monitor: [&[f32]; 2],
        output: [&mut [f32]; 2],
    ) {
        self.process_routed_with_taps(capture, monitor, output, None);
    }

    pub fn process_routed_with_taps(
        &mut self,
        capture: [&[f32]; 2],
        monitor: [&[f32]; 2],
        output: [&mut [f32]; 2],
        mut layer_taps: Option<&mut [Vec<f32>; LAYERS]>,
    ) {
        let [left, right] = capture;
        let [monitor_left, monitor_right] = monitor;
        let [out_left, out_right] = output;
        assert_eq!(left.len(), right.len());
        assert_eq!(left.len(), monitor_left.len());
        assert_eq!(left.len(), monitor_right.len());
        assert_eq!(left.len(), out_left.len());
        assert_eq!(left.len(), out_right.len());
        if let Some(taps) = &layer_taps {
            assert!(taps.iter().all(|tap| tap.len() >= left.len() * 2));
        }
        for layer in &mut self.layers {
            layer.copy_commit();
        }
        for frame in 0..left.len() {
            let mut sum = [monitor_left[frame], monitor_right[frame]];
            for (index, layer) in self.layers.iter_mut().enumerate() {
                let (gate, sample) = layer.sample();
                if let Some(taps) = &mut layer_taps {
                    taps[index][frame * 2] = gate[0];
                    taps[index][frame * 2 + 1] = gate[1];
                }
                sum[0] += sample[0];
                sum[1] += sample[1];
                layer.write_capture(left[frame], right[frame]);
            }
            out_left[frame] = sum[0];
            out_right[frame] = sum[1];
        }
        self.frame += left.len() as u64;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capture_peak_keeps_single_frame_transients_through_wrap_and_partial_overwrite() {
        let mut layer = Layer::new(130); // final peak block is only two frames
        for frame in 0..130 {
            layer.write_capture(0.0, if frame == 50 { 0.9 } else { 0.0 });
        }
        assert!((layer.capture_peak(0, 130) - 0.9).abs() < 1e-6);
        assert_eq!(layer.capture_peak(0, 79), 0.0);
        assert!((layer.capture_peak(79, 80) - 0.9).abs() < 1e-6);
        layer.write_capture(0.0, 0.0); // a partially overwritten cache block
        assert!((layer.capture_peak(0, 130) - 0.9).abs() < 1e-6);
        for _ in 0..50 {
            layer.write_capture(0.0, 0.0);
        }
        assert_eq!(layer.capture_peak(0, 130), 0.0);
        for _ in 0..77 {
            layer.write_capture(0.0, 0.0);
        }
        layer.write_capture(0.7, 0.0); // first frame of the short final block
        assert!((layer.capture_peak(0, 130) - 0.7).abs() < 1e-6);
    }
    #[test]
    fn capture_peak_index_agrees_with_every_sample_across_ring_edges() {
        let mut layer = Layer::new(130);
        for frame in 0..390 {
            let left = if frame % 43 == 11 { 0.83 } else { 0.0 };
            let right = if frame % 29 == 7 { 0.67 } else { 0.0 };
            layer.write_capture(left, right);
            if frame % 13 != 0 {
                continue;
            }
            for start in [0, 1, 17, 63, 64, 65, 97, 129] {
                for end in [1, 18, 64, 65, 96, 130] {
                    let expected = (start.min(layer.captured)..end.min(layer.captured))
                        .map(|age| {
                            let physical =
                                (layer.write + layer.capacity() - 1 - age) % layer.capacity();
                            layer.capture[physical * 2]
                                .abs()
                                .max(layer.capture[physical * 2 + 1].abs())
                        })
                        .fold(0.0_f32, f32::max);
                    assert_eq!(
                        layer.capture_peak(start, end),
                        expected,
                        "frame={frame}, range={start}..{end}"
                    );
                }
            }
        }
    }
    fn feed(looper: &mut MainLooper, data: &[f32]) -> Vec<f32> {
        let mut left = vec![0.0; data.len()];
        let mut right = vec![0.0; data.len()];
        looper.process([data, data], [&mut left, &mut right]);
        left
    }
    fn settle(looper: &mut MainLooper) {
        for _ in 0..100 {
            feed(looper, &[0.0; 128]);
        }
    }
    #[test]
    fn first_loop_infers_tempo_and_commits_recorded_input() {
        let mut looper = MainLooper::new(8_000.0);
        looper.start_recording();
        for _ in 0..125 {
            feed(&mut looper, &[0.25; 128]);
        } // 2 sec = 1 bar at 120
        assert!(looper.stop_recording());
        assert_eq!(looper.layer_bars(0), 1.0);
        assert!((looper.tempo() - 120.0).abs() < 0.001);
        settle(&mut looper);
        assert_eq!(looper.layer_state(0), LayerState::Playing);
        looper.stop_all();
        looper.play_all();
        assert!((feed(&mut looper, &[0.0])[0] - 0.25).abs() < 0.001);
    }
    #[test]
    fn retrospective_commit_without_recording_and_four_independent_layers() {
        let mut looper = MainLooper::new(8_000.0);
        for _ in 0..125 {
            feed(&mut looper, &[0.2; 128]);
        }
        assert!(looper.click_capture_segment(1.0));
        settle(&mut looper);
        looper.set_control(0, 1.0);
        for _ in 0..125 {
            feed(&mut looper, &[0.3; 128]);
        }
        assert!(looper.click_capture_segment(1.0));
        settle(&mut looper);
        assert_eq!(looper.layer_length(0), 16_000);
        assert_eq!(looper.layer_length(1), 16_000);
        assert_eq!(looper.layer_length(2), 0);
        let audible = feed(&mut looper, &[0.0])[0];
        assert!(audible > 0.39 && audible < 0.61, "{audible}");
    }
    #[test]
    fn traditional_arms_then_fires_and_overdub_respects_length_policy() {
        let mut looper = MainLooper::new(8_000.0);
        looper.set_control(1, 2.0);
        feed(&mut looper, &[0.1; 128]);
        assert!(looper.click_capture_segment(0.0625));
        assert_eq!(looper.layer_length(0), 0);
        assert!(looper.fire_forward());
        settle(&mut looper);
        assert_eq!(looper.layer_length(0), 1000);
        looper.set_control(4, 1.0);
        feed(&mut looper, &[0.2; 128]);
        assert!(looper.commit(0.125));
        settle(&mut looper);
        assert_eq!(looper.layer_length(0), 2000);
        assert!(looper.peak(0, 0, 0, 2000) > 0.19);
    }
    #[test]
    fn free_mode_quantizes_recorded_span_at_existing_tempo() {
        let mut looper = MainLooper::new(8_000.0);
        looper.set_control(1, 1.0);
        looper.start_recording();
        for _ in 0..46 {
            feed(&mut looper, &[0.25; 128]);
        } // 5,888 frames
        assert!(looper.stop_recording());
        assert_eq!(looper.tempo(), 120.0);
        assert_eq!(looper.layer_bars(0), 0.375); // nearest 1/8-bar grid: 6,000 frames
        settle(&mut looper);
        assert_eq!(looper.layer_length(0), 6_000);
    }
    #[test]
    fn overdub_length_wins_can_shorten_existing_loop() {
        let mut looper = MainLooper::new(8_000.0);
        for _ in 0..16 {
            feed(&mut looper, &[0.1; 128]);
        }
        assert!(looper.commit(0.125));
        settle(&mut looper);
        assert_eq!(looper.layer_length(0), 2_000);
        looper.set_control(5, 1.0);
        for _ in 0..8 {
            feed(&mut looper, &[0.2; 128]);
        }
        assert!(looper.commit(0.0625));
        settle(&mut looper);
        assert_eq!(looper.layer_length(0), 1_000);
        assert!(looper.peak(0, 0, 0, 1000) > 0.15);
    }
    #[test]
    fn playback_uses_original_integer_step_and_seek_crossfade() {
        let mut looper = MainLooper::new(8_000.0);
        let layer = &mut looper.layers[0];
        layer.length = 8;
        layer.playing = true;
        layer.speed = 0.5;
        for frame in 0..8 {
            layer.loops[0][frame * 2] = frame as f32;
            layer.loops[0][frame * 2 + 1] = frame as f32;
        }
        assert_eq!(layer.sample().1[0], 0.0);
        assert_eq!(layer.sample().1[0], 0.0);
        assert_eq!(layer.sample().1[0], 1.0);
        assert!(looper.set_layer_control(0, 4, 1.0));
        assert_eq!(looper.layers[0].seek_remaining, 64);
        assert_eq!(looper.layers[0].sample().1[0], 1.0); // old source on first jumped sample
    }
    #[test]
    fn exported_loop_reopens_without_touching_live_capture_or_previous_audio_until_complete() {
        let mut looper = MainLooper::new(8_000.0);
        for _ in 0..125 {
            feed(&mut looper, &[0.2; 128]);
        }
        assert!(looper.commit(0.0625));
        settle(&mut looper);
        let mut pcm = vec![0.0; 2000];
        assert_eq!(looper.copy_loop_interleaved(0, 0, &mut pcm), 1000);
        assert!(looper.begin_layer_load(0, 1000, 0.0625, 0.0, true));
        let replacement = vec![0.4; 2000];
        assert!(!looper.load_layer_chunk(0, 1, &replacement));
        assert!(looper.peak(0, 0, 0, 1000) > 0.1);
        assert!(looper.begin_layer_load(0, 1000, 0.0625, 0.0, true));
        assert!(looper.load_layer_chunk(0, 0, &replacement));
        assert!(looper.finish_layer_load(0));
        looper.stop_all();
        looper.play_all();
        assert!((feed(&mut looper, &[0.0])[0] - 0.4).abs() < 0.001);
    }
}
