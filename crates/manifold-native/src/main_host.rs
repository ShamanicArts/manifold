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
use crate::main_instrument::{MainAudioBlock, MainNativeProcessor};
use crate::main_session::{MainSessionError, prepare_main_session};

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
}

pub struct MainControl {
    exchange: Arc<Exchange>,
    next_generation: u64,
    sample_rate: f32,
    max_frames: usize,
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
        let audio = Self {
            current: Box::new(Prepared {
                processor,
                generation: 0,
            }),
            exchange: Arc::clone(&exchange),
        };
        let control = MainControl {
            exchange,
            next_generation: 1,
            sample_rate,
            max_frames,
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
        self.publish_pending();
        Ok(())
    }

    fn publish_pending(&mut self) {
        if self.exchange.retired.is_full() {
            return;
        }
        let pending = self.exchange.pending.swap(null_mut(), Ordering::AcqRel);
        if pending.is_null() {
            return;
        }
        // SAFETY: the successful swap gives the audio side sole ownership.
        let next = unsafe { Box::from_raw(pending) };
        let old = std::mem::replace(&mut self.current, next);
        let pushed = self.exchange.retired.push(Box::into_raw(old) as usize);
        debug_assert!(pushed.is_ok());
        self.exchange
            .published
            .store(self.current.generation, Ordering::Release);
    }
}

impl MainControl {
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
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use serde_json::{Value, json};
    use std::sync::Barrier;

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
}
