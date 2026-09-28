//! Bounded native Main Sample capture and prepared publication. The audio
//! endpoint only copies into prepared chunks and swaps Arc pointers; the
//! control endpoint assembles, validates, and retires PCM.

use std::ptr::null_mut;
use std::sync::Arc;
use std::sync::atomic::{AtomicPtr, AtomicU64, Ordering};

use crossbeam_queue::ArrayQueue;
use manifold_core::main_instrument::MainInstrument;
use manifold_core::sample_region::{PreparedStereo, RetiredStereo, ValidatedStereo};

const CHUNK_FRAMES: usize = 4096;

#[derive(Clone, Copy, Debug)]
enum Request {
    Retro { source: usize, bars: f32 },
    FreeStart { source: usize },
    FreeFinish,
    FreeCancel,
}

#[derive(Clone, Copy, Debug)]
enum Event {
    Started { frames: usize },
    FreeStarted,
    FreeCancelled,
    Rejected,
    Published { frames: usize },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SampleUpdate {
    Started { frames: usize },
    FreeStarted,
    FreeCancelled,
    Progress { copied: usize, total: usize },
    Published { frames: usize },
    Rejected,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Phase {
    Idle,
    Requested,
    Free,
    Copying,
    Publishing,
}

struct Chunk {
    offset: usize,
    frames: usize,
    samples: [f32; CHUNK_FRAMES * 2],
}

struct Retired {
    pointer: usize,
    previous: RetiredStereo,
}

struct Exchange {
    requests: ArrayQueue<Request>,
    events: ArrayQueue<Event>,
    free: ArrayQueue<Box<Chunk>>,
    ready: ArrayQueue<Box<Chunk>>,
    pending: AtomicPtr<PreparedStereo>,
    retired: ArrayQueue<Retired>,
    cancel_epoch: AtomicU64,
    cancel_applied: AtomicU64,
}

impl Drop for Exchange {
    fn drop(&mut self) {
        let pending = *self.pending.get_mut();
        if !pending.is_null() {
            unsafe { drop(Box::from_raw(pending)) };
        }
        while let Some(retired) = self.retired.pop() {
            unsafe { drop(Box::from_raw(retired.pointer as *mut PreparedStereo)) };
            drop(retired.previous);
        }
    }
}

pub struct SampleAudio {
    exchange: Arc<Exchange>,
    copy: Option<(usize, usize)>, // total frames, sent frames
    seen_cancel: u64,
}

pub struct SampleControl {
    exchange: Arc<Exchange>,
    sample_rate: f32,
    phase: Phase,
    assembly: Vec<f32>,
    expected: usize,
    received: usize,
}

pub fn prepare(sample_rate: f32) -> (SampleAudio, SampleControl) {
    let exchange = Arc::new(Exchange {
        requests: ArrayQueue::new(1),
        events: ArrayQueue::new(2),
        free: ArrayQueue::new(2),
        ready: ArrayQueue::new(2),
        pending: AtomicPtr::new(null_mut()),
        retired: ArrayQueue::new(2),
        cancel_epoch: AtomicU64::new(0),
        cancel_applied: AtomicU64::new(0),
    });
    for _ in 0..2 {
        exchange
            .free
            .push(Box::new(Chunk {
                offset: 0,
                frames: 0,
                samples: [0.0; CHUNK_FRAMES * 2],
            }))
            .ok();
    }
    (
        SampleAudio {
            exchange: Arc::clone(&exchange),
            copy: None,
            seen_cancel: 0,
        },
        SampleControl {
            exchange,
            sample_rate,
            phase: Phase::Idle,
            assembly: Vec::new(),
            expected: 0,
            received: 0,
        },
    )
}

impl SampleAudio {
    pub fn session_replaced(&mut self, instrument: &mut MainInstrument) {
        self.copy = None;
        instrument.release_sample();
        instrument.cancel_free_sample();
        while self.exchange.requests.pop().is_some() {}
        while self.exchange.events.pop().is_some() {}
        while let Some(chunk) = self.exchange.ready.pop() {
            self.exchange.free.push(chunk).ok();
        }
    }

    /// Run only after a validated Main host block. New requests begin after
    /// this block, so malformed blocks never mutate capture state.
    pub fn after_block(&mut self, instrument: &mut MainInstrument) -> bool {
        let cancel = self.exchange.cancel_epoch.load(Ordering::Acquire);
        if cancel != self.seen_cancel {
            self.seen_cancel = cancel;
            self.session_replaced(instrument);
            self.exchange
                .cancel_applied
                .store(cancel, Ordering::Release);
        }
        if let Some(request) = self.exchange.requests.pop() {
            let outcome = match request {
                Request::Retro { source, bars } => {
                    let frames = instrument.request_sample_source(source, bars);
                    if frames > 0 {
                        self.copy = Some((frames, 0));
                        Event::Started { frames }
                    } else {
                        Event::Rejected
                    }
                }
                Request::FreeStart { source } => {
                    if instrument.start_free_sample(source) {
                        Event::FreeStarted
                    } else {
                        Event::Rejected
                    }
                }
                Request::FreeFinish => {
                    let frames = instrument.finish_free_sample();
                    if frames > 0 {
                        self.copy = Some((frames, 0));
                        Event::Started { frames }
                    } else {
                        Event::Rejected
                    }
                }
                Request::FreeCancel => {
                    instrument.cancel_free_sample();
                    Event::FreeCancelled
                }
            };
            let queued = self.exchange.events.push(outcome);
            debug_assert!(queued.is_ok());
        }
        if let Some((total, sent)) = self.copy.as_mut() {
            let (copied, frozen) = instrument.sample_progress();
            if frozen != *total {
                instrument.release_sample();
                self.copy = None;
                let queued = self.exchange.events.push(Event::Rejected);
                debug_assert!(queued.is_ok());
            } else if copied == *total {
                if let Some(mut chunk) = self.exchange.free.pop() {
                    let frames = (*total - *sent).min(CHUNK_FRAMES);
                    chunk.offset = *sent;
                    chunk.frames = frames;
                    if !instrument.copy_sample_chunk(*sent, &mut chunk.samples[..frames * 2]) {
                        instrument.release_sample();
                        self.copy = None;
                        self.exchange.free.push(chunk).ok();
                        let queued = self.exchange.events.push(Event::Rejected);
                        debug_assert!(queued.is_ok());
                    } else {
                        *sent += frames;
                        let queued = self.exchange.ready.push(chunk);
                        debug_assert!(queued.is_ok());
                        if *sent == *total {
                            instrument.release_sample();
                            self.copy = None;
                        }
                    }
                }
            }
        }
        if self.exchange.retired.is_full() {
            return false;
        }
        let pointer = self.exchange.pending.swap(null_mut(), Ordering::AcqRel);
        if pointer.is_null() {
            return false;
        }
        let sample = unsafe { &*pointer };
        let previous = instrument.publish_prepared_sample(sample);
        let retired = self.exchange.retired.push(Retired {
            pointer: pointer as usize,
            previous,
        });
        debug_assert!(retired.is_ok());
        let published = self.exchange.events.push(Event::Published {
            frames: instrument.synth_sample_frames(),
        });
        debug_assert!(published.is_ok());
        true
    }
}

impl SampleControl {
    /// Called before accepting a replacement Main session. Pending prepared
    /// PCM is destroyed here, never by the audio callback.
    pub fn cancel_for_session(&mut self) {
        self.reclaim();
        let pointer = self.exchange.pending.swap(null_mut(), Ordering::AcqRel);
        if !pointer.is_null() {
            unsafe { drop(Box::from_raw(pointer)) };
        }
        while self.exchange.requests.pop().is_some() {}
        while self.exchange.events.pop().is_some() {}
        while let Some(chunk) = self.exchange.ready.pop() {
            self.exchange.free.push(chunk).ok();
        }
        self.phase = Phase::Idle;
        self.assembly.clear();
        self.expected = 0;
        self.received = 0;
        self.exchange.cancel_epoch.fetch_add(1, Ordering::AcqRel);
    }

    fn submit(&mut self, request: Request, expected: Phase, next: Phase) -> bool {
        if self.phase != expected
            || self.exchange.cancel_epoch.load(Ordering::Acquire)
                != self.exchange.cancel_applied.load(Ordering::Acquire)
            || self.exchange.requests.push(request).is_err()
        {
            return false;
        }
        self.phase = next;
        true
    }

    pub fn request_retro(&mut self, source: usize, bars: f32) -> bool {
        if source > 4 || !bars.is_finite() || !(0.0625..=16.0).contains(&bars) {
            return false;
        }
        self.submit(
            Request::Retro { source, bars },
            Phase::Idle,
            Phase::Requested,
        )
    }

    pub fn start_free(&mut self, source: usize) -> bool {
        if source > 4 {
            return false;
        }
        self.submit(Request::FreeStart { source }, Phase::Idle, Phase::Requested)
    }

    pub fn finish_free(&mut self) -> bool {
        self.submit(Request::FreeFinish, Phase::Free, Phase::Requested)
    }

    pub fn cancel_free(&mut self) -> bool {
        self.submit(Request::FreeCancel, Phase::Free, Phase::Requested)
    }

    pub fn reclaim(&mut self) {
        while let Some(retired) = self.exchange.retired.pop() {
            unsafe { drop(Box::from_raw(retired.pointer as *mut PreparedStereo)) };
            drop(retired.previous);
        }
    }

    /// Poll on the host control side. Returning chunks to `free` is what
    /// allows the audio endpoint to continue a long capture without waiting.
    pub fn poll(&mut self) -> Vec<SampleUpdate> {
        self.reclaim();
        if self.exchange.cancel_epoch.load(Ordering::Acquire)
            != self.exchange.cancel_applied.load(Ordering::Acquire)
        {
            while self.exchange.events.pop().is_some() {}
            while let Some(chunk) = self.exchange.ready.pop() {
                self.exchange.free.push(chunk).ok();
            }
            return Vec::new();
        }
        let mut updates = Vec::new();
        while let Some(event) = self.exchange.events.pop() {
            match event {
                Event::Started { frames } => {
                    self.phase = Phase::Copying;
                    self.expected = frames;
                    self.received = 0;
                    self.assembly = Vec::with_capacity(frames * 2);
                    updates.push(SampleUpdate::Started { frames });
                }
                Event::FreeStarted => {
                    self.phase = Phase::Free;
                    updates.push(SampleUpdate::FreeStarted);
                }
                Event::FreeCancelled => {
                    self.phase = Phase::Idle;
                    updates.push(SampleUpdate::FreeCancelled);
                }
                Event::Rejected => {
                    self.phase = Phase::Idle;
                    self.assembly.clear();
                    updates.push(SampleUpdate::Rejected);
                }
                Event::Published { frames } => {
                    self.phase = Phase::Idle;
                    updates.push(SampleUpdate::Published { frames });
                }
            }
        }
        while let Some(chunk) = self.exchange.ready.pop() {
            if self.phase == Phase::Copying && chunk.offset == self.received {
                self.assembly
                    .extend_from_slice(&chunk.samples[..chunk.frames * 2]);
                self.received += chunk.frames;
                updates.push(SampleUpdate::Progress {
                    copied: self.received,
                    total: self.expected,
                });
            }
            self.exchange.free.push(chunk).ok();
        }
        if self.phase == Phase::Copying && self.received == self.expected {
            let stereo = std::mem::take(&mut self.assembly);
            if let Some(sample) = ValidatedStereo::from_stereo(stereo, self.sample_rate) {
                let pointer = Box::into_raw(Box::new(sample.prepare()));
                if self
                    .exchange
                    .pending
                    .compare_exchange(null_mut(), pointer, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
                {
                    self.phase = Phase::Publishing;
                } else {
                    unsafe { drop(Box::from_raw(pointer)) };
                    self.phase = Phase::Idle;
                    updates.push(SampleUpdate::Rejected);
                }
            } else {
                self.phase = Phase::Idle;
                updates.push(SampleUpdate::Rejected);
            }
        }
        updates
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::main_host::MainAudioRuntime;
    use crate::main_instrument::{MainHostAudioBlock, MainHostEvent, MainHostEventKind};
    use manifold_core::events::EventKind;

    fn block(audio: &mut MainAudioRuntime, value: f32) {
        let input = [value; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        audio
            .process_host(MainHostAudioBlock {
                input: Some([&input, &input]),
                output: [&mut left, &mut right],
                actions: &[],
            })
            .unwrap();
    }

    #[test]
    fn retro_and_free_host_captures_publish_validated_sample_without_restarting_looper() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        for _ in 0..12 {
            block(&mut audio, 0.4);
        }
        assert!(control.request_retro_sample(0, 0.0625));
        assert!(!control.request_retro_sample(0, 0.0625));
        let mut published = false;
        for _ in 0..20 {
            block(&mut audio, 0.4);
            published |= control
                .poll_sample()
                .contains(&SampleUpdate::Published { frames: 1000 });
            if published {
                break;
            }
        }
        assert!(published);
        assert_eq!(audio.synth_sample_frames(), 1000);
        assert!((audio.synth_sample_peak(0, 1000) - 0.4).abs() < 1e-6);

        assert!(control.start_free_sample(0));
        block(&mut audio, 0.7);
        assert_eq!(control.poll_sample(), vec![SampleUpdate::FreeStarted]);
        for _ in 0..4 {
            block(&mut audio, 0.7);
        }
        assert!(control.finish_free_sample());
        let mut free_frames = None;
        for _ in 0..20 {
            block(&mut audio, 0.7);
            for update in control.poll_sample() {
                if let SampleUpdate::Published { frames } = update {
                    free_frames = Some(frames);
                }
            }
            if free_frames.is_some() {
                break;
            }
        }
        assert_eq!(free_frames, Some(640));
        assert!((audio.synth_sample_peak(0, 640) - 0.7).abs() < 1e-6);
        assert_eq!(
            audio.generation(),
            0,
            "sample publication leaves loop runtime intact"
        );
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let actions = [
            MainHostEvent {
                offset: 0,
                kind: MainHostEventKind::Parameter {
                    id: 257,
                    value: 1.0,
                },
            },
            MainHostEvent {
                offset: 0,
                kind: MainHostEventKind::Midi(EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 100,
                }),
            },
        ];
        audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &actions,
            })
            .unwrap();
        assert!(left.iter().any(|value| value.abs() > 0.001));
        control.request_session_snapshot().unwrap();
        let mut exported = None;
        for _ in 0..20 {
            block(&mut audio, 0.0);
            if let Some(bytes) = control.poll_session_snapshot().unwrap() {
                exported = Some(bytes);
                break;
            }
        }
        let exported = exported.expect("native state snapshot should include the new Sample PCM");
        let reopened = crate::main_session::prepare_main_session(&exported, 8_000.0, 128).unwrap();
        assert_eq!(reopened.instrument().synth_sample_frames(), 640);
        assert!((reopened.instrument().synth_sample_peak(0, 640) - 0.7).abs() < 1e-6);
    }

    #[test]
    fn accepted_session_replacement_cancels_a_waiting_capture() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        assert!(control.request_retro_sample(0, 0.0625));
        let replacement = crate::main_session::default_main_session(8_000.0).unwrap();
        let bytes = serde_json::to_vec(&replacement).unwrap();
        control.submit_session(&bytes).unwrap();
        block(&mut audio, 0.6);
        assert_eq!(audio.generation(), 1);
        assert_eq!(audio.synth_sample_frames(), 0);
        assert!(control.poll_sample().is_empty());
        assert!(control.request_retro_sample(0, 0.0625));
    }

    #[test]
    fn timed_host_splits_keep_frozen_sample_copy_at_one_chunk_per_block() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        assert!(control.request_retro_sample(0, 1.0));
        block(&mut audio, 0.3);
        assert!(
            control
                .poll_sample()
                .contains(&SampleUpdate::Started { frames: 16_000 })
        );
        let input = [0.3; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let actions: Vec<_> = (1..=16)
            .map(|offset| MainHostEvent {
                offset,
                kind: MainHostEventKind::Parameter {
                    id: 2,
                    value: 120.0,
                },
            })
            .collect();
        audio
            .process_host(MainHostAudioBlock {
                input: Some([&input, &input]),
                output: [&mut left, &mut right],
                actions: &actions,
            })
            .unwrap();
        assert_eq!(audio.sample_capture_progress(), (4096, 16_000));
    }

    #[test]
    fn cancelled_transfer_releases_audio_capture_and_accepts_the_next_gesture() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        assert!(control.request_retro_sample(0, 1.0));
        block(&mut audio, 0.4);
        assert!(
            control
                .poll_sample()
                .contains(&SampleUpdate::Started { frames: 16_000 })
        );
        block(&mut audio, 0.4);
        assert_eq!(audio.sample_capture_progress(), (4096, 16_000));
        control.cancel_sample_capture();
        assert!(!control.request_retro_sample(0, 0.0625));
        assert!(control.poll_sample().is_empty());
        block(&mut audio, 0.4);
        assert_eq!(audio.sample_capture_progress(), (0, 0));
        assert!(control.request_retro_sample(0, 0.0625));
    }
}
