//! Main MidiSynth's Live sample source: dry host input, separate from the
//! looper layers' dry-plus-synth capture rings. Storage is prepared up front.

use crate::sample_region::MAX_SAMPLE_FRAMES;

const COPY_PER_BLOCK: usize = 4096;

struct Snapshot {
    frames: usize,
    copied: usize,
    start: usize,
}

pub struct MainLiveCapture {
    ring: Vec<f32>,
    frozen: Vec<f32>,
    write: usize,
    captured: usize,
    snapshot: Option<Snapshot>,
}

impl MainLiveCapture {
    pub fn new(sample_rate: f32) -> Self {
        let frames = ((sample_rate * 30.0) as usize).min(MAX_SAMPLE_FRAMES);
        Self {
            ring: vec![0.0; frames * 2],
            frozen: vec![0.0; frames * 2],
            write: 0,
            captured: 0,
            snapshot: None,
        }
    }

    pub fn request(&mut self, frames: usize) -> bool {
        let capacity = self.ring.len() / 2;
        if frames == 0 || frames > capacity || self.snapshot.is_some() {
            return false;
        }
        self.snapshot = Some(Snapshot {
            frames,
            copied: 0,
            start: (self.write + capacity - frames) % capacity,
        });
        true
    }

    pub fn progress(&self) -> (usize, usize) {
        self.snapshot
            .as_ref()
            .map_or((0, 0), |job| (job.copied, job.frames))
    }

    pub fn capacity(&self) -> usize {
        self.ring.len() / 2
    }

    pub fn captured_frames(&self) -> usize {
        self.captured
    }

    pub fn release(&mut self) {
        self.snapshot = None;
    }

    pub fn copy_frozen_chunk(&self, offset: usize, destination: &mut [f32]) -> bool {
        let Some(job) = self.snapshot.as_ref() else {
            return false;
        };
        let frames = destination.len() / 2;
        if job.copied != job.frames || destination.len() % 2 != 0 || frames == 0
            || frames > COPY_PER_BLOCK
            || offset.checked_add(frames).is_none_or(|end| end > job.frames)
        {
            return false;
        }
        destination.copy_from_slice(&self.frozen[offset * 2..(offset + frames) * 2]);
        true
    }

    pub fn process(&mut self, input: [&[f32]; 2]) {
        let [left, right] = input;
        assert_eq!(left.len(), right.len());
        let capacity = self.ring.len() / 2;
        if let Some(job) = self.snapshot.as_mut() {
            let count = (job.frames - job.copied).min(COPY_PER_BLOCK);
            for frame in 0..count {
                let source = (job.start + job.copied + frame) % capacity * 2;
                let target = (job.copied + frame) * 2;
                self.frozen[target..target + 2].copy_from_slice(&self.ring[source..source + 2]);
            }
            job.copied += count;
        }
        for frame in 0..left.len() {
            let target = self.write * 2;
            self.ring[target] = left[frame];
            self.ring[target + 1] = right[frame];
            self.write = (self.write + 1) % capacity;
            self.captured = (self.captured + 1).min(capacity);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_ring_snapshot_finishes_before_new_writes_can_replace_its_head() {
        let mut capture = MainLiveCapture::new(8_000.0);
        let signal = [0.7; 128];
        let silence = [0.0; 128];
        for _ in 0..(240_000 / 128) {
            capture.process([&signal, &signal]);
        }
        assert!(capture.request(240_000));
        while capture.progress().0 < 240_000 {
            capture.process([&silence, &silence]);
        }
        let mut head = [0.0; 256];
        let mut tail = [0.0; 256];
        assert!(capture.copy_frozen_chunk(0, &mut head));
        assert!(capture.copy_frozen_chunk(240_000 - 128, &mut tail));
        assert!(head.iter().all(|v| (*v - 0.7).abs() < 1e-6));
        assert!(tail.iter().all(|v| (*v - 0.7).abs() < 1e-6));
    }
}
