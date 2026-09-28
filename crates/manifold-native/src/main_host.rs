//! Control/audio ownership handoff for the assembled Main instrument.
//!
//! The control side prepares complete sessions. The audio side publishes one
//! after a successful block and sends the displaced runtime back for control-
//! side destruction. Keep the audio runtime on one processing thread.

use std::ptr::null_mut;
use std::sync::Arc;
use std::sync::atomic::{AtomicPtr, AtomicU64, Ordering};

use crossbeam_queue::ArrayQueue;

use crate::NativeError;
use crate::main_instrument::{
    MainAudioBlock, MainHostAudioBlock, MainHostEventKind, MainNativeProcessor,
};
use crate::main_session::{MainSessionError, prepare_main_session};
use crate::main_snapshot::{
    self, MainPcmSnapshot, MainSnapshotError, SnapshotAudio, SnapshotControl,
};

struct Prepared {
    processor: MainNativeProcessor,
    generation: u64,
}

struct Exchange {
    pending: AtomicPtr<Prepared>,
    retired: ArrayQueue<usize>,
    published: AtomicU64,
}

impl Drop for Exchange {
    fn drop(&mut self) {
        let pending = *self.pending.get_mut();
        if !pending.is_null() {
            // SAFETY: no endpoint remains when the last Arc is dropped.
            unsafe {
                drop(Box::from_raw(pending));
            }
        }
        while let Some(pointer) = self.retired.pop() {
            // SAFETY: no endpoint remains and each pointer was queued once.
            unsafe {
                drop(Box::from_raw(pointer as *mut Prepared));
            }
        }
    }
}

pub struct MainAudioRuntime {
    current: Box<Prepared>,
    exchange: Arc<Exchange>,
    snapshot: SnapshotAudio,
}

pub struct MainControl {
    exchange: Arc<Exchange>,
    next_generation: u64,
    sample_rate: f32,
    max_frames: usize,
    snapshot: SnapshotControl,
}

impl MainAudioRuntime {
    /// Allocate the first processor and bounded retirement queue off the
    /// callback. The returned control endpoint may run on another thread.
    pub fn prepare(
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<(Self, MainControl), NativeError> {
        let processor = MainNativeProcessor::prepare(sample_rate, max_frames)?;
        let exchange = Arc::new(Exchange {
            pending: AtomicPtr::new(null_mut()),
            retired: ArrayQueue::new(4),
            published: AtomicU64::new(0),
        });
        let (snapshot_audio, snapshot_control) = main_snapshot::prepare();
        let audio = Self {
            current: Box::new(Prepared {
                processor,
                generation: 0,
            }),
            exchange: Arc::clone(&exchange),
            snapshot: snapshot_audio,
        };
        let control = MainControl {
            exchange,
            next_generation: 1,
            sample_rate,
            max_frames,
            snapshot: snapshot_control,
        };
        Ok((audio, control))
    }

    pub fn generation(&self) -> u64 {
        self.current.generation
    }

    /// Processing itself, including session publication, allocates nothing.
    /// A rejected block does not publish a waiting session.
    pub fn process(&mut self, block: MainAudioBlock<'_>) -> Result<(), NativeError> {
        self.current.processor.process(block)?;
        let published = self.publish_pending();
        let interrupted = published || !self.exchange.pending.load(Ordering::Acquire).is_null();
        self.snapshot.after_block(
            self.current.processor.instrument(),
            self.current.generation,
            interrupted,
        );
        Ok(())
    }

    pub fn process_host(&mut self, block: MainHostAudioBlock<'_>) -> Result<(), NativeError> {
        let mutating = block
            .actions
            .iter()
            .any(|action| matches!(action.kind, MainHostEventKind::Command { .. }));
        self.current.processor.process_host(block)?;
        let published = self.publish_pending();
        let interrupted =
            mutating || published || !self.exchange.pending.load(Ordering::Acquire).is_null();
        self.snapshot.after_block(
            self.current.processor.instrument(),
            self.current.generation,
            interrupted,
        );
        Ok(())
    }

    fn publish_pending(&mut self) -> bool {
        if self.exchange.retired.is_full() {
            return false;
        }
        let pending = self.exchange.pending.swap(null_mut(), Ordering::AcqRel);
        if pending.is_null() {
            return false;
        }
        // SAFETY: the successful swap gives the audio side sole ownership.
        let next = unsafe { Box::from_raw(pending) };
        let old = std::mem::replace(&mut self.current, next);
        let pushed = self.exchange.retired.push(Box::into_raw(old) as usize);
        debug_assert!(pushed.is_ok());
        self.exchange
            .published
            .store(self.current.generation, Ordering::Release);
        true
    }
}

impl MainControl {
    /// Request a coherent PCM/transport snapshot. Poll on this control thread
    /// until it completes or is interrupted by a loop command or import.
    pub fn request_pcm_snapshot(&mut self) -> Result<u64, MainSnapshotError> {
        self.snapshot.request()
    }

    pub fn poll_pcm_snapshot(&mut self) -> Result<Option<MainPcmSnapshot>, MainSnapshotError> {
        self.snapshot.poll()
    }

    /// Parse and prepare off the callback. A failed import preserves the
    /// current and pending runtimes. The latest accepted pending file wins.
    pub fn submit_session(&mut self, bytes: &[u8]) -> Result<u64, MainSessionError> {
        let processor = prepare_main_session(bytes, self.sample_rate, self.max_frames)?;
        let generation = self.next_generation;
        self.next_generation += 1;
        let pointer = Box::into_raw(Box::new(Prepared {
            processor,
            generation,
        }));
        let previous = self.exchange.pending.swap(pointer, Ordering::AcqRel);
        if !previous.is_null() {
            // SAFETY: the swap gives this control endpoint sole ownership.
            unsafe {
                drop(Box::from_raw(previous));
            }
        }
        self.reclaim();
        Ok(generation)
    }

    pub fn published_generation(&self) -> u64 {
        self.exchange.published.load(Ordering::Acquire)
    }

    /// Call off the callback to release displaced sample and capture buffers.
    pub fn reclaim(&mut self) -> usize {
        let mut count = 0;
        while let Some(pointer) = self.exchange.retired.pop() {
            // SAFETY: only the audio side enqueues displaced runtimes, and
            // ArrayQueue transfers each pointer to one consumer.
            unsafe {
                drop(Box::from_raw(pointer as *mut Prepared));
            }
            count += 1;
        }
        count
    }
}

impl Drop for MainControl {
    fn drop(&mut self) {
        let pending = self.exchange.pending.swap(null_mut(), Ordering::AcqRel);
        if !pending.is_null() {
            // SAFETY: this endpoint owns the pointer removed by the swap.
            unsafe {
                drop(Box::from_raw(pending));
            }
        }
        self.reclaim();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::main_instrument::{MainHostEvent, MainHostEventKind};
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use serde_json::{Value, json};
    use std::sync::Barrier;
    use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
    use std::time::{Duration, Instant};

    const EMPTY: &str = include_str!("../tests/fixtures/main-browser-v15-empty.json");

    fn layer_session(value: f32) -> Vec<u8> {
        let mut state: Value = serde_json::from_str(EMPTY).unwrap();
        let pcm = vec![value; 128 * 2];
        let bytes: Vec<u8> = pcm
            .iter()
            .flat_map(|sample: &f32| sample.to_le_bytes())
            .collect();
        state["layers"][0]["frames"] = json!(128);
        state["layers"][0]["bars"] = json!(0.0625);
        state["layers"][0]["playing"] = json!(true);
        state["layers"][0]["pcmF32Base64"] = json!(STANDARD.encode(bytes));
        serde_json::to_vec(&state).unwrap()
    }

    fn snapshot_session() -> Vec<u8> {
        let mut state: Value = serde_json::from_str(EMPTY).unwrap();
        state["sampleRate"] = json!(8_000);
        let frames = 9_000;
        let loop_pcm: Vec<f32> = (0..frames)
            .flat_map(|frame| [frame as f32 / frames as f32, -0.25])
            .collect();
        let sample_pcm: Vec<f32> = (0..frames)
            .flat_map(|frame| [0.5, -(frame as f32 / frames as f32)])
            .collect();
        let encode = |pcm: &[f32]| {
            STANDARD.encode(
                pcm.iter()
                    .flat_map(|sample| sample.to_le_bytes())
                    .collect::<Vec<u8>>(),
            )
        };
        state["layers"][0]["frames"] = json!(frames);
        state["layers"][0]["bars"] = json!(0.25);
        state["layers"][0]["playing"] = json!(true);
        state["layers"][0]["pcmF32Base64"] = json!(encode(&loop_pcm));
        state["sample"]["frames"] = json!(frames);
        state["sample"]["pcmF32Base64"] = json!(encode(&sample_pcm));
        serde_json::to_vec(&state).unwrap()
    }

    fn render(audio: &mut MainAudioRuntime) -> f32 {
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        audio
            .process(MainAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        left[0]
    }

    #[test]
    fn prepared_session_publishes_at_boundary_and_old_runtime_retires_off_callback() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(48_000.0, 128).unwrap();
        assert_eq!(render(&mut audio), 0.0);
        let first = control.submit_session(&layer_session(0.25)).unwrap();
        assert_eq!(first, 1);
        assert_eq!(render(&mut audio), 0.0);
        assert_eq!(audio.generation(), 1);
        assert_eq!(control.published_generation(), 1);
        assert!((render(&mut audio) - 0.25).abs() < 0.0001);
        assert_eq!(control.reclaim(), 1);
        assert!(control.submit_session(b"invalid").is_err());
        assert_eq!(audio.generation(), 1);
        let second = control.submit_session(&layer_session(0.5)).unwrap();
        assert_eq!(second, 2);
        assert!((render(&mut audio) - 0.25).abs() < 0.0001);
        assert_eq!(audio.generation(), 2);
        assert!((render(&mut audio) - 0.5).abs() < 0.0001);
        assert_eq!(control.reclaim(), 1);
    }

    #[test]
    fn latest_pending_session_wins_without_ever_entering_the_audio_callback() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(48_000.0, 128).unwrap();
        control.submit_session(&layer_session(0.25)).unwrap();
        control.submit_session(&layer_session(0.75)).unwrap();
        assert_eq!(render(&mut audio), 0.0);
        assert_eq!(audio.generation(), 2);
        assert!((render(&mut audio) - 0.75).abs() < 0.0001);
        assert_eq!(control.reclaim(), 1);
    }

    #[test]
    fn control_thread_can_prepare_while_audio_thread_keeps_processing() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(48_000.0, 128).unwrap();
        let first_block = Arc::new(Barrier::new(2));
        let prepared = Arc::new(Barrier::new(2));
        let audio_first = Arc::clone(&first_block);
        let audio_prepared = Arc::clone(&prepared);
        let thread = std::thread::spawn(move || {
            assert_eq!(render(&mut audio), 0.0);
            audio_first.wait();
            audio_prepared.wait();
            assert_eq!(render(&mut audio), 0.0); // publication after this block
            assert!((render(&mut audio) - 0.4).abs() < 0.0001);
            audio.generation()
        });
        first_block.wait();
        assert_eq!(control.submit_session(&layer_session(0.4)).unwrap(), 1);
        prepared.wait();
        assert_eq!(thread.join().unwrap(), 1);
        assert_eq!(control.published_generation(), 1);
        assert_eq!(control.reclaim(), 1);
    }

    #[test]
    fn pcm_snapshot_uses_bounded_chunks_and_preserves_loop_and_sample_order() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        control.submit_session(&snapshot_session()).unwrap();
        render(&mut audio); // publish prepared session
        assert_eq!(audio.generation(), 1);
        control.reclaim();
        let id = control.request_pcm_snapshot().unwrap();
        assert_eq!(control.request_pcm_snapshot(), Err(MainSnapshotError::Busy));
        for _ in 0..4 {
            render(&mut audio); // producer hits the two-chunk pool limit
        }
        assert!(control.poll_pcm_snapshot().unwrap().is_none());
        let snapshot = loop {
            render(&mut audio);
            if let Some(snapshot) = control.poll_pcm_snapshot().unwrap() {
                break snapshot;
            }
        };
        assert_eq!(id, 1);
        assert_eq!(snapshot.header.generation, 1);
        assert_eq!(snapshot.header.layers[0].frames, 9_000);
        assert_eq!(snapshot.header.sample_frames, 9_000);
        assert_eq!(snapshot.layers[0].len(), 18_000);
        assert_eq!(snapshot.sample.len(), 18_000);
        assert_eq!(snapshot.layers[0][0], 0.0);
        assert!((snapshot.layers[0][8_192] - 4_096.0 / 9_000.0).abs() < 1e-6);
        assert!((snapshot.layers[0][17_998] - 8_999.0 / 9_000.0).abs() < 1e-6);
        assert_eq!(snapshot.layers[0][17_999], -0.25);
        assert_eq!(snapshot.sample[0], 0.5);
        assert!((snapshot.sample[17_999] + 8_999.0 / 9_000.0).abs() < 1e-6);
        assert!(snapshot.layers[1..].iter().all(Vec::is_empty));
    }

    #[test]
    fn loop_command_cancels_snapshot_without_blocking_audio() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        control.submit_session(&snapshot_session()).unwrap();
        render(&mut audio);
        control.reclaim();
        control.request_pcm_snapshot().unwrap();
        render(&mut audio);
        assert!(control.poll_pcm_snapshot().unwrap().is_none());
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &[MainHostEvent {
                    offset: 0,
                    kind: MainHostEventKind::Command { id: 5, value: 0.0 },
                }],
            })
            .unwrap();
        assert_eq!(
            control.poll_pcm_snapshot().err(),
            Some(MainSnapshotError::Interrupted)
        );
        assert!(control.request_pcm_snapshot().is_ok());
    }

    #[test]
    fn session_publication_cancels_old_pcm_snapshot() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        control.submit_session(&snapshot_session()).unwrap();
        render(&mut audio);
        control.reclaim();
        control.request_pcm_snapshot().unwrap();
        render(&mut audio);
        assert!(control.poll_pcm_snapshot().unwrap().is_none());
        let mut replacement: Value = serde_json::from_str(EMPTY).unwrap();
        replacement["sampleRate"] = json!(8_000);
        control
            .submit_session(&serde_json::to_vec(&replacement).unwrap())
            .unwrap();
        render(&mut audio);
        assert_eq!(audio.generation(), 2);
        assert_eq!(
            control.poll_pcm_snapshot().err(),
            Some(MainSnapshotError::Interrupted)
        );
        assert_eq!(control.reclaim(), 1);
    }

    #[test]
    fn recording_rejects_a_snapshot_until_the_take_is_finished() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &[MainHostEvent {
                    offset: 0,
                    kind: MainHostEventKind::Command { id: 0, value: 0.0 },
                }],
            })
            .unwrap();
        control.request_pcm_snapshot().unwrap();
        render(&mut audio);
        assert_eq!(
            control.poll_pcm_snapshot().err(),
            Some(MainSnapshotError::Unstable)
        );
    }

    #[test]
    fn control_thread_assembles_pcm_while_audio_thread_keeps_rendering() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        control.submit_session(&snapshot_session()).unwrap();
        render(&mut audio);
        control.reclaim();
        control.request_pcm_snapshot().unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let audio_stop = Arc::clone(&stop);
        let worker = std::thread::spawn(move || {
            let mut blocks = 0;
            while !audio_stop.load(AtomicOrdering::Acquire) && blocks < 100_000 {
                render(&mut audio);
                blocks += 1;
                std::thread::yield_now();
            }
            blocks
        });
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut result = None;
        while Instant::now() < deadline {
            if let Some(snapshot) = control.poll_pcm_snapshot().unwrap() {
                result = Some(snapshot);
                break;
            }
            std::thread::sleep(Duration::from_millis(1));
        }
        stop.store(true, AtomicOrdering::Release);
        assert!(worker.join().unwrap() > 0);
        let snapshot = result.expect("audio/control PCM transfer timed out");
        assert_eq!(snapshot.header.generation, 1);
        assert_eq!(snapshot.layers[0].len(), 18_000);
        assert_eq!(snapshot.sample.len(), 18_000);
        assert_eq!(snapshot.sample[0], 0.5);
    }
}
