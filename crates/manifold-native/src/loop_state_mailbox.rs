//! Bounded, allocation-free transfer of stopped authored loop takes from a
//! native audio callback to a host control thread.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};

use crossbeam_queue::ArrayQueue;

use crate::NativeProcessor;
use crate::project::NativeProject;

const COPY_FRAMES_PER_BLOCK: usize = 4096;

fn status(revision: u64, stable: bool) -> u64 {
    revision.wrapping_shl(1) | u64::from(stable)
}

struct Slot {
    node: u32,
    source_rate: u32,
    max_frames: usize,
    state: AtomicU64,
    retry: AtomicBool,
    control_version: AtomicU64,
    control_bits: [AtomicU32; 7],
    control_present: [bool; 7],
    free: ArrayQueue<Vec<f32>>,
    ready: ArrayQueue<Ready>,
}

struct Ready {
    revision: u64,
    frames: usize,
    pcm: Vec<f32>,
}

pub struct LoopStateMailbox {
    slots: Vec<Arc<Slot>>,
}

#[derive(Clone)]
pub struct LoopStateCache {
    mailbox: Arc<LoopStateMailbox>,
    encoded: Vec<(u32, u64)>,
}

pub struct LoopStateWorker {
    slots: Vec<WorkerSlot>,
}

struct WorkerSlot {
    shared: Arc<Slot>,
    observed: u64,
    completed: u64,
    active: Option<Active>,
    control_indices: [Option<usize>; 7],
}

#[derive(Clone, Copy)]
pub struct LoopControls {
    pub node: u32,
    pub values: [Option<f32>; 7],
    version: u64,
}

struct Active {
    revision: u64,
    frames: usize,
    copied: usize,
    pcm: Vec<f32>,
}

pub struct LoopTake {
    pub node: u32,
    pub source_rate: u32,
    pub revision: u64,
    pub frames: usize,
    pcm: Option<Vec<f32>>,
    slot: Arc<Slot>,
}

impl LoopTake {
    pub fn stereo(&self) -> &[f32] {
        &self.pcm.as_ref().expect("prepared take")[..self.frames * 2]
    }

    pub fn state(&self) -> u64 {
        status(self.revision, true)
    }
}

impl Drop for LoopTake {
    fn drop(&mut self) {
        if let Some(pcm) = self.pcm.take() {
            let returned = self.slot.free.push(pcm);
            debug_assert!(returned.is_ok());
        }
    }
}

impl LoopStateMailbox {
    /// Each slot owns one full-capacity buffer. Queue storage and PCM are
    /// allocated while preparing a host, before its process callback starts.
    pub fn prepare(
        processor: &NativeProcessor,
        specs: &[(u32, usize)],
        source_rate: u32,
    ) -> Option<(Arc<Self>, LoopStateWorker)> {
        if !(8_000..=384_000).contains(&source_rate) {
            return None;
        }
        let mut slots = Vec::new();
        slots.try_reserve_exact(specs.len()).ok()?;
        let mut workers = Vec::new();
        workers.try_reserve_exact(specs.len()).ok()?;
        for &(node, max_frames) in specs {
            if node == 0
                || max_frames == 0
                || specs.iter().filter(|(id, _)| *id == node).count() != 1
            {
                return None;
            }
            let revision = processor.capture_revision(node.into())?;
            let stable = processor.stable_capture_length(node.into()).is_some();
            let initial = status(revision, stable);
            let control_indices = std::array::from_fn(|id| {
                processor.host_parameters().iter().position(|parameter| {
                    parameter.node == u64::from(node) && parameter.local_id == id as u32
                })
            });
            let control_present = control_indices.map(|index| index.is_some());
            let control_bits = std::array::from_fn(|id| {
                let value = control_indices[id]
                    .map(|index| processor.current_parameter_values()[index])
                    .unwrap_or(0.0);
                AtomicU32::new(value.to_bits())
            });
            let free = ArrayQueue::new(1);
            free.push(manifold_core::io::prepare_planar_buffer(2, max_frames).ok()?).ok()?;
            let shared = Arc::new(Slot {
                node,
                source_rate,
                max_frames,
                state: AtomicU64::new(initial),
                retry: AtomicBool::new(false),
                control_version: AtomicU64::new(0),
                control_bits,
                control_present,
                free,
                ready: ArrayQueue::new(1),
            });
            workers.push(WorkerSlot {
                shared: Arc::clone(&shared),
                observed: initial,
                completed: initial,
                active: None,
                control_indices,
            });
            slots.push(shared);
        }
        Some((Arc::new(Self { slots }), LoopStateWorker { slots: workers }))
    }

    /// The control thread compares this status with its last encoded asset.
    /// The low bit indicates a stopped, immutable take.
    pub fn state(&self, node: u32) -> Option<u64> {
        self.slots
            .iter()
            .find(|slot| slot.node == node)
            .map(|slot| slot.state.load(Ordering::Acquire))
    }

    pub fn nodes(&self) -> impl Iterator<Item = u32> + '_ {
        self.slots.iter().map(|slot| slot.node)
    }

    /// The initial portable graph was prepared from the same PCM and controls
    /// as these slot states. A later revision requires a fresh transfer.
    pub fn cache(self: &Arc<Self>) -> LoopStateCache {
        LoopStateCache {
            mailbox: Arc::clone(self),
            encoded: self
                .slots
                .iter()
                .map(|slot| (slot.node, slot.state.load(Ordering::Acquire)))
                .collect(),
        }
    }

    pub fn take(&self, node: u32) -> Option<LoopTake> {
        let slot = self.slots.iter().find(|slot| slot.node == node)?;
        let ready = slot.ready.pop()?;
        Some(LoopTake {
            node,
            source_rate: slot.source_rate,
            revision: ready.revision,
            frames: ready.frames,
            pcm: Some(ready.pcm),
            slot: Arc::clone(slot),
        })
    }

    fn controls(&self, node: u32) -> Option<LoopControls> {
        let slot = self.slots.iter().find(|slot| slot.node == node)?;
        let version = slot.control_version.load(Ordering::Acquire);
        if version & 1 != 0 {
            return None;
        }
        let values = std::array::from_fn(|id| {
            slot.control_present[id]
                .then(|| f32::from_bits(slot.control_bits[id].load(Ordering::Relaxed)))
        });
        (slot.control_version.load(Ordering::Acquire) == version).then_some(LoopControls {
            node,
            values,
            version,
        })
    }
}

impl LoopStateCache {
    pub fn contains_node(&self, node: u64) -> bool {
        self.encoded.iter().any(|(id, _)| u64::from(*id) == node)
    }

    /// Encode complete current takes on the host control thread. `None` means
    /// a take is recording, overdubbing, still copying, or changed mid-save;
    /// hosts must not return stale PCM as a successful state save.
    pub fn refresh(&mut self, base: &[u8]) -> Option<Vec<u8>> {
        let result = self.try_refresh(base);
        if result.is_none() {
            // A failed encode may already have removed one or more ready
            // buffers. Once those buffers are returned, the worker must copy
            // the same stable revision again for a later host save.
            for slot in &self.mailbox.slots {
                slot.retry.store(true, Ordering::Release);
            }
        }
        result
    }

    fn try_refresh(&mut self, base: &[u8]) -> Option<Vec<u8>> {
        let mut takes = Vec::new();
        let mut updates = Vec::new();
        let mut controls = Vec::with_capacity(self.encoded.len());
        for &(node, encoded) in &self.encoded {
            controls.push(self.mailbox.controls(node)?);
            let now = self.mailbox.state(node)?;
            if now & 1 == 0 {
                return None;
            }
            if now == encoded {
                continue;
            }
            let take = self.mailbox.take(node)?;
            if take.state() != now {
                return None;
            }
            updates.push((node, now));
            takes.push(take);
        }
        let bytes = NativeProject::apply_loop_state(base, &takes, &controls).ok()?;
        if controls.iter().any(|snapshot| {
            self.mailbox
                .slots
                .iter()
                .find(|slot| slot.node == snapshot.node)
                .is_none_or(|slot| slot.control_version.load(Ordering::Acquire) != snapshot.version)
        }) || self.encoded.iter().any(|&(node, cached)| {
            let expected = updates
                .iter()
                .find(|(id, _)| *id == node)
                .map_or(cached, |(_, state)| *state);
            self.mailbox.state(node) != Some(expected)
        }) {
            return None;
        }
        for (node, state) in updates {
            if let Some((_, cached)) = self.encoded.iter_mut().find(|(id, _)| *id == node) {
                *cached = state;
            }
        }
        Some(bytes)
    }
}

impl LoopStateWorker {
    /// Called after each processed block; at most 4096 stereo frames per loop
    /// are copied. No allocation, lock, wait, or encoding occurs here.
    pub fn service(&mut self, processor: &NativeProcessor) {
        for slot in &mut self.slots {
            slot.service(processor);
        }
    }
}

impl WorkerSlot {
    fn recycle(&self, pcm: Vec<f32>) {
        let returned = self.shared.free.push(pcm);
        debug_assert!(returned.is_ok());
    }

    fn service(&mut self, processor: &NativeProcessor) {
        let values = processor.current_parameter_values();
        let next = self
            .control_indices
            .map(|index| index.map(|i| values[i].to_bits()));
        if next.iter().enumerate().any(|(id, value)| {
            value.is_some_and(|bits| self.shared.control_bits[id].load(Ordering::Relaxed) != bits)
        }) {
            self.shared.control_version.fetch_add(1, Ordering::AcqRel);
            for (id, value) in next.into_iter().enumerate() {
                if let Some(bits) = value {
                    self.shared.control_bits[id].store(bits, Ordering::Relaxed);
                }
            }
            self.shared.control_version.fetch_add(1, Ordering::Release);
        }
        let node = self.shared.node;
        let Some(revision) = processor.capture_revision(node.into()) else {
            return;
        };
        let length = processor.stable_capture_length(node.into());
        let current = status(revision, length.is_some());
        self.shared.state.store(current, Ordering::Release);
        if current != self.observed {
            if let Some(active) = self.active.take() {
                self.recycle(active.pcm);
            }
            if let Some(old) = self.shared.ready.pop() {
                self.recycle(old.pcm);
            }
            self.observed = current;
            if length.is_none() {
                self.completed = current;
                return;
            }
        }
        let Some(frames) = length else {
            return;
        };
        if frames > self.shared.max_frames {
            return;
        }
        if self.completed == current {
            if !self.shared.retry.swap(false, Ordering::AcqRel) || !self.shared.ready.is_empty() {
                return;
            }
        }
        if self.active.is_none() {
            let Some(pcm) = self.shared.free.pop() else {
                return;
            };
            self.active = Some(Active {
                revision,
                frames,
                copied: 0,
                pcm,
            });
        }
        let active = self.active.as_mut().expect("just prepared");
        let count = (frames - active.copied).min(COPY_FRAMES_PER_BLOCK);
        if count > 0 {
            let offset = active.copied * 2;
            let copied = processor.copy_stopped_loop_interleaved(
                node.into(),
                active.copied,
                &mut active.pcm[offset..offset + count * 2],
            );
            if copied != count {
                let abandoned = self.active.take().expect("active");
                self.recycle(abandoned.pcm);
                return;
            }
            active.copied += count;
        }
        if active.copied != frames {
            return;
        }
        if processor.capture_revision(node.into()) != Some(revision)
            || processor.stable_capture_length(node.into()) != Some(frames)
        {
            let abandoned = self.active.take().expect("active");
            self.recycle(abandoned.pcm);
            return;
        }
        let done = self.active.take().expect("active");
        let queued = self.shared.ready.push(Ready {
            revision: done.revision,
            frames: done.frames,
            pcm: done.pcm,
        });
        debug_assert!(queued.is_ok());
        self.completed = current;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AudioBlock;
    use crate::project::NativeProject;

    #[test]
    fn revisions_replace_stale_ready_takes_without_allocating_in_service() {
        let bytes =
            include_bytes!("../../../projects/graph-workspace/authored-rack-four-layer-loops.json");
        let mut prepared = NativeProject::parse(bytes)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let processor = &mut prepared.processor;
        let (mailbox, mut worker) =
            LoopStateMailbox::prepare(processor, &[(70, 96_000)], 48_000).unwrap();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let render = |processor: &mut NativeProcessor,
                      worker: &mut LoopStateWorker,
                      sample: f32,
                      left: &mut [f32; 128],
                      right: &mut [f32; 128]| {
            processor
                .process(AudioBlock {
                    main: Some([&[sample; 128], &[sample; 128]]),
                    sidechain: None,
                    output: [left, right],
                    events: &[],
                })
                .unwrap();
            worker.service(processor);
        };
        assert!(processor.set_parameter(70_u32.into(), 0, 1.0));
        render(processor, &mut worker, 0.2, &mut left, &mut right);
        assert_eq!(mailbox.state(70).unwrap() & 1, 0);
        assert!(processor.set_parameter(70_u32.into(), 0, 0.0));
        worker.service(processor);
        let first = mailbox.take(70).unwrap();
        assert_eq!(first.frames, 128);
        assert!(
            first
                .stereo()
                .iter()
                .all(|sample| (*sample - 0.2).abs() < 1e-6)
        );
        drop(first);
        assert!(processor.set_parameter(70_u32.into(), 0, 1.0));
        render(processor, &mut worker, -0.3, &mut left, &mut right);
        assert!(processor.set_parameter(70_u32.into(), 0, 0.0));
        worker.service(processor);
        // A second take with the same frame count supersedes an unread ready
        // buffer. Its revision, rather than length alone, decides validity.
        assert!(processor.set_parameter(70_u32.into(), 0, 1.0));
        render(processor, &mut worker, 0.5, &mut left, &mut right);
        assert!(processor.set_parameter(70_u32.into(), 0, 0.0));
        worker.service(processor);
        let latest = mailbox.take(70).unwrap();
        assert_eq!(latest.frames, 128);
        assert!(
            latest
                .stereo()
                .iter()
                .all(|sample| (*sample - 0.5).abs() < 1e-6)
        );
    }

    #[test]
    fn failed_state_encode_retries_and_new_take_replaces_equal_length_pcm() {
        let base =
            include_bytes!("../../../projects/graph-workspace/authored-rack-four-layer-loops.json");
        let mut prepared = NativeProject::parse(base)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let processor = &mut prepared.processor;
        let (mailbox, mut worker) =
            LoopStateMailbox::prepare(processor, &[(70, 96_000)], 48_000).unwrap();
        let mut cache = mailbox.cache();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut record = |sample: f32,
                          processor: &mut NativeProcessor,
                          worker: &mut LoopStateWorker,
                          cache: &mut LoopStateCache| {
            assert!(processor.set_parameter(70_u32.into(), 0, 1.0));
            processor
                .process(AudioBlock {
                    main: Some([&[sample; 128], &[sample; 128]]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            worker.service(processor);
            assert!(cache.refresh(base).is_none());
            assert!(processor.set_parameter(70_u32.into(), 0, 0.0));
            worker.service(processor);
        };
        record(0.2, processor, &mut worker, &mut cache);
        assert!(cache.refresh(b"not JSON").is_none());
        worker.service(processor);
        let first = cache.refresh(base).expect("retry after failed encode");
        let first_doc: serde_json::Value = serde_json::from_slice(&first).unwrap();
        let first_asset = first_doc["assets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|asset| asset["nodeId"] == 70)
            .unwrap();
        assert_eq!(first_asset["frames"], 128);
        record(-0.3, processor, &mut worker, &mut cache);
        let latest = cache.refresh(&first).expect("same-length newer take");
        let latest_doc: serde_json::Value = serde_json::from_slice(&latest).unwrap();
        let latest_asset = latest_doc["assets"]
            .as_array()
            .unwrap()
            .iter()
            .find(|asset| asset["nodeId"] == 70)
            .unwrap();
        assert_eq!(latest_asset["frames"], 128);
        assert_ne!(latest_asset["pcmF32Base64"], first_asset["pcmF32Base64"]);
    }
}
