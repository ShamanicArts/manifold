//! Main MidiSynth's five retrospective sample sources. Live is dry host input;
//! L1-L4 are layer playback after the gate and before the volume gain.

use crate::main_looper::LAYERS;
use crate::sample_region::MAX_SAMPLE_FRAMES;

const COPY_PER_BLOCK: usize = 4096;

struct Snapshot {
    source: usize,
    frames: usize,
    copied: usize,
    start: usize,
}

pub struct MainSampleCapture {
    rings: [Vec<f32>; LAYERS + 1],
    frozen: Vec<f32>,
    write: [usize; LAYERS + 1],
    captured: [usize; LAYERS + 1],
    snapshot: Option<Snapshot>,
}

impl MainSampleCapture {
    pub fn new(sample_rate: f32) -> Self {
        let frames = ((sample_rate * 30.0) as usize).min(MAX_SAMPLE_FRAMES);
        Self {
            rings: std::array::from_fn(|_| vec![0.0; frames * 2]),
            frozen: vec![0.0; frames * 2],
            write: [0; LAYERS + 1],
            captured: [0; LAYERS + 1],
            snapshot: None,
        }
    }

    pub fn request(&mut self, source: usize, frames: usize) -> bool {
        let capacity = self.capacity();
        if source > LAYERS || frames == 0 || frames > capacity || self.snapshot.is_some() {
            return false;
        }
        self.snapshot = Some(Snapshot {
            source,
            frames,
            copied: 0,
            start: (self.write[source] + capacity - frames) % capacity,
        });
        true
    }

    pub fn progress(&self) -> (usize, usize) {
        self.snapshot
            .as_ref()
            .map_or((0, 0), |job| (job.copied, job.frames))
    }

    pub fn capacity(&self) -> usize {
        self.rings[0].len() / 2
    }

    pub fn captured_frames(&self, source: usize) -> usize {
        self.captured.get(source).copied().unwrap_or(0)
    }

    pub fn release(&mut self) {
        self.snapshot = None;
    }

    pub fn copy_frozen_chunk(&self, offset: usize, destination: &mut [f32]) -> bool {
        let Some(job) = self.snapshot.as_ref() else {
            return false;
        };
        let frames = destination.len() / 2;
        if job.copied != job.frames
            || destination.len() % 2 != 0
            || frames == 0
            || frames > COPY_PER_BLOCK
            || offset
                .checked_add(frames)
                .is_none_or(|end| end > job.frames)
        {
            return false;
        }
        destination.copy_from_slice(&self.frozen[offset * 2..(offset + frames) * 2]);
        true
    }

    pub fn process(&mut self, input: [&[f32]; 2], layer_taps: &[Vec<f32>; LAYERS]) {
        let [left, right] = input;
        assert_eq!(left.len(), right.len());
        let capacity = self.capacity();
        if let Some(job) = self.snapshot.as_mut() {
            let count = (job.frames - job.copied).min(COPY_PER_BLOCK);
            let ring = &self.rings[job.source];
            for frame in 0..count {
                let source = (job.start + job.copied + frame) % capacity * 2;
                let target = (job.copied + frame) * 2;
                self.frozen[target..target + 2].copy_from_slice(&ring[source..source + 2]);
            }
            job.copied += count;
        }
        for frame in 0..left.len() {
            for source in 0..=LAYERS {
                let target = self.write[source] * 2;
                let (l, r) = if source == 0 {
                    (left[frame], right[frame])
                } else {
                    let tap = &layer_taps[source - 1];
                    (tap[frame * 2], tap[frame * 2 + 1])
                };
                self.rings[source][target] = l;
                self.rings[source][target + 1] = r;
                self.write[source] = (self.write[source] + 1) % capacity;
                self.captured[source] = (self.captured[source] + 1).min(capacity);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_ring_snapshot_finishes_before_new_writes_can_replace_its_head() {
        let mut capture = MainSampleCapture::new(8_000.0);
        let signal = [0.7; 128];
        let silence = [0.0; 128];
        let taps = std::array::from_fn(|_| vec![0.0; 256]);
        for _ in 0..(240_000 / 128) {
            capture.process([&signal, &signal], &taps);
        }
        assert!(capture.request(0, 240_000));
        while capture.progress().0 < 240_000 {
            capture.process([&silence, &silence], &taps);
        }
        let mut head = [0.0; 256];
        let mut tail = [0.0; 256];
        assert!(capture.copy_frozen_chunk(0, &mut head));
        assert!(capture.copy_frozen_chunk(240_000 - 128, &mut tail));
        assert!(head.iter().all(|v| (*v - 0.7).abs() < 1e-6));
        assert!(tail.iter().all(|v| (*v - 0.7).abs() < 1e-6));
    }
}
