//! Fixed-size audio-to-editor visual bank for Main. One 128-bin job runs per
//! processed block; the GUI only reads a completed 13-job frame.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

use manifold_native::main_host::MainAudioRuntime;

const BINS: usize = 128;
const LAYERS: usize = 4;
const STRIPS: usize = 9;
const JOBS: u32 = (LAYERS + STRIPS) as u32;
const BARS: [f32; STRIPS] = [16.0, 8.0, 4.0, 2.0, 1.0, 0.5, 0.25, 0.125, 0.0625];

struct Frame {
    layer_peaks: [[AtomicU32; BINS]; LAYERS],
    layer_lengths: [AtomicU32; LAYERS],
    active: AtomicU32,
    source_generation: AtomicU64,
    segments: [[AtomicU32; BINS]; STRIPS],
}

impl Frame {
    fn new() -> Self {
        Self {
            layer_peaks: std::array::from_fn(|_| std::array::from_fn(|_| AtomicU32::new(0))),
            layer_lengths: std::array::from_fn(|_| AtomicU32::new(0)),
            active: AtomicU32::new(0),
            source_generation: AtomicU64::new(0),
            segments: std::array::from_fn(|_| std::array::from_fn(|_| AtomicU32::new(0))),
        }
    }
}

pub(crate) struct VisualSnapshot {
    pub layer_peaks: [Vec<f32>; LAYERS],
    pub layer_lengths: [usize; LAYERS],
    pub active: usize,
    pub source_generation: u64,
    pub segments: [Vec<f32>; STRIPS],
}

pub(crate) struct MainVisualBank {
    frames: [Frame; 2],
    generation: AtomicU64,
    cursor: AtomicU32,
}

impl MainVisualBank {
    pub fn new() -> Self {
        Self {
            frames: [Frame::new(), Frame::new()],
            generation: AtomicU64::new(0),
            cursor: AtomicU32::new(0),
        }
    }

    /// The host calls this only while processing is stopped, before a new
    /// prepared runtime starts publishing jobs.
    pub fn reset(&self) {
        self.generation.store(0, Ordering::Release);
        self.cursor.store(0, Ordering::Relaxed);
    }

    /// Bounded work on the audio owner. A complete frame is published only
    /// after every layer and capture strip has been sampled.
    pub fn publish_job(&self, audio: &MainAudioRuntime) {
        let job = self.cursor.fetch_add(1, Ordering::Relaxed) % JOBS;
        let next = (self.generation.load(Ordering::Relaxed) + 1) as usize % 2;
        let frame = &self.frames[next];
        if job == 0 {
            frame
                .active
                .store(audio.status(1, 0) as u32, Ordering::Relaxed);
            frame
                .source_generation
                .store(audio.generation(), Ordering::Relaxed);
        }
        if job < LAYERS as u32 {
            let layer = job as usize;
            let length = audio.status(8, layer) as usize;
            let recorded = audio.recorded_frames(layer);
            let frames = if recorded > 0 { recorded } else { length };
            let kind = if recorded > 0 { 1 } else { 0 };
            frame.layer_lengths[layer].store(length as u32, Ordering::Relaxed);
            for bin in 0..BINS {
                let (start, end) = if recorded > 0 {
                    // Capture queries use samples ago; newest belongs at right.
                    (
                        frames * (BINS - bin - 1) / BINS,
                        frames * (BINS - bin) / BINS,
                    )
                } else {
                    (frames * bin / BINS, frames * (bin + 1) / BINS)
                };
                let peak = if end > start {
                    audio.peak(layer, kind, start, end)
                } else {
                    0.0
                };
                frame.layer_peaks[layer][bin].store(peak.to_bits(), Ordering::Relaxed);
            }
        } else {
            let strip = job as usize - LAYERS;
            let active = frame.active.load(Ordering::Relaxed) as usize;
            let sample_rate = audio.status(19, 0);
            let capacity = (sample_rate * 30.0) as usize;
            let spb = audio.status(6, 0);
            let captured = audio.status(12, active) as usize;
            let older = ((BARS[strip] * spb).floor() as usize).min(capacity);
            let newer = ((BARS.get(strip + 1).copied().unwrap_or(0.0) * spb).floor() as usize)
                .min(capacity);
            let span = older.saturating_sub(newer);
            for bin in 0..BINS {
                let start = newer + span * (BINS - bin - 1) / BINS;
                let end = newer + span * (BINS - bin) / BINS;
                let peak = if start < captured && end > start {
                    audio.peak(active, 1, start, end.min(captured))
                } else {
                    0.0
                };
                frame.segments[strip][bin].store(peak.to_bits(), Ordering::Relaxed);
            }
        }
        if job + 1 == JOBS {
            self.generation.fetch_add(1, Ordering::Release);
        }
    }

    /// Allocate and serialize only on the editor side. A generation check
    /// rejects a frame that became the audio writer's target while copying.
    pub fn snapshot(&self) -> Option<VisualSnapshot> {
        for _ in 0..3 {
            let generation = self.generation.load(Ordering::Acquire);
            if generation == 0 {
                return None;
            }
            let frame = &self.frames[generation as usize % 2];
            let result = VisualSnapshot {
                layer_peaks: std::array::from_fn(|layer| {
                    frame.layer_peaks[layer]
                        .iter()
                        .map(|peak| f32::from_bits(peak.load(Ordering::Relaxed)))
                        .collect()
                }),
                layer_lengths: std::array::from_fn(|layer| {
                    frame.layer_lengths[layer].load(Ordering::Relaxed) as usize
                }),
                active: frame.active.load(Ordering::Relaxed) as usize,
                source_generation: frame.source_generation.load(Ordering::Relaxed),
                segments: std::array::from_fn(|strip| {
                    frame.segments[strip]
                        .iter()
                        .map(|peak| f32::from_bits(peak.load(Ordering::Relaxed)))
                        .collect()
                }),
            };
            if self.generation.load(Ordering::Acquire) == generation {
                return Some(result);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_native::main_instrument::{MainHostAudioBlock, MainHostEvent, MainHostEventKind};

    #[test]
    fn host_capture_and_new_first_loop_reach_ordered_editor_bins() {
        let (mut audio, _control) = MainAudioRuntime::prepare(8_000.0, 64).unwrap();
        let visual = MainVisualBank::new();
        for block in 0..39 {
            let amplitude = if block == 0 || block == 13 { 0.8 } else { 0.2 };
            let input = [amplitude; 64];
            let mut left = [0.0; 64];
            let mut right = [0.0; 64];
            let actions = match block {
                13 => vec![MainHostEvent {
                    offset: 0,
                    kind: MainHostEventKind::Command { id: 0, value: 0.0 },
                }],
                21 => vec![MainHostEvent {
                    offset: 0,
                    kind: MainHostEventKind::Command { id: 1, value: 0.0 },
                }],
                _ => Vec::new(),
            };
            audio
                .process_host(MainHostAudioBlock {
                    input: Some([&input, &input]),
                    output: [&mut left, &mut right],
                    actions: &actions,
                })
                .unwrap();
            visual.publish_job(&audio);
            if block == 12 {
                let first = visual.snapshot().unwrap();
                let old_peak = first.segments[8]
                    .iter()
                    .position(|peak| *peak > 0.7)
                    .unwrap();
                assert!(old_peak < 64, "oldest captured audio belongs at left");
                assert!(first.segments[8][127] > 0.1);
                assert_eq!(
                    first.layer_peaks[0].iter().copied().fold(0.0, f32::max),
                    0.0
                );
            }
        }
        let second = visual.snapshot().unwrap();
        assert!(second.layer_lengths[0] > 0);
        assert!(second.layer_peaks[0].iter().any(|peak| *peak > 0.7));
        assert_eq!(second.layer_peaks[0].len(), 128);
        assert_eq!(second.segments.len(), 9);
        visual.reset();
        assert!(
            visual.snapshot().is_none(),
            "old session pixels must not survive reactivation"
        );
    }
}
