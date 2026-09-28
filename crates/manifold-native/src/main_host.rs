//! Control/audio ownership handoff for the assembled Main instrument.
//!
//! The control side prepares complete sessions. The audio side publishes one
//! after a successful block and sends the displaced runtime back for control-
//! side destruction. Keep the audio runtime on one processing thread.

use std::collections::BTreeMap;
use std::ptr::null_mut;
use std::sync::Arc;
use std::sync::atomic::{AtomicPtr, AtomicU64, Ordering};

use crossbeam_queue::ArrayQueue;

use crate::NativeError;
use crate::main_instrument::{
    MainAudioBlock, MainHostAudioBlock, MainHostEventKind, MainNativeProcessor,
};
use crate::main_session::{MainSessionError, default_main_session, prepare_main_session};
use crate::main_session_export::{MainExportError, export_main_session, save_template};
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
    templates: BTreeMap<u64, serde_json::Value>,
}

impl MainAudioRuntime {
    /// Allocate the first processor and bounded retirement queue off the
    /// callback. The returned control endpoint may run on another thread.
    pub fn prepare(
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<(Self, MainControl), NativeError> {
        if !sample_rate.is_finite() || !(8_000.0..=192_000.0).contains(&sample_rate) {
            return Err(NativeError::InvalidSampleRate);
        }
        if max_frames == 0 || max_frames > 65_536 {
            return Err(NativeError::BlockTooLarge);
        }
        // The browser-authored empty session is the product default on every
        // host. Preparing through the loader gives fresh native instances the
        // same audible state that their first save will later describe.
        let template =
            default_main_session(sample_rate).map_err(|_| NativeError::InvalidDefaultSession)?;
        let bytes =
            serde_json::to_vec(&template).map_err(|_| NativeError::InvalidDefaultSession)?;
        let processor =
            prepare_main_session(&bytes, sample_rate, max_frames).map_err(|error| match error {
                MainSessionError::Native(error) => error,
                _ => NativeError::InvalidDefaultSession,
            })?;
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
            templates: BTreeMap::from([(0, template)]),
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
            self.current.processor.host_values(),
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
            self.current.processor.host_values(),
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
    fn prune_templates(&mut self) {
        if self.snapshot.is_active() {
            return;
        }
        let published = self.published_generation();
        let pending = self.next_generation.saturating_sub(1);
        while self.templates.len() > 16 {
            let Some(oldest) = self
                .templates
                .keys()
                .copied()
                .find(|generation| *generation != published && *generation != pending)
            else {
                break;
            };
            self.templates.remove(&oldest);
        }
    }

    pub fn request_session_snapshot(&mut self) -> Result<u64, MainExportError> {
        if !self.templates.contains_key(&self.published_generation()) {
            return Err(MainExportError::MissingTemplate);
        }
        self.snapshot.request().map_err(MainExportError::Snapshot)
    }

    /// Once ready, encode the browser v15 envelope entirely off the callback.
    pub fn poll_session_snapshot(&mut self) -> Result<Option<Vec<u8>>, MainExportError> {
        let Some(snapshot) = self.snapshot.poll().map_err(MainExportError::Snapshot)? else {
            self.prune_templates();
            return Ok(None);
        };
        let template = self
            .templates
            .get(&snapshot.header.generation)
            .ok_or(MainExportError::MissingTemplate)?;
        let bytes = export_main_session(&snapshot, template)?;
        self.prune_templates();
        Ok(Some(bytes))
    }

    /// Request a coherent PCM/transport snapshot. Poll on this control thread
    /// until it completes or is interrupted by a loop command or import.
    pub fn request_pcm_snapshot(&mut self) -> Result<u64, MainSnapshotError> {
        self.snapshot.request()
    }

    pub fn poll_pcm_snapshot(&mut self) -> Result<Option<MainPcmSnapshot>, MainSnapshotError> {
        let result = self.snapshot.poll();
        self.prune_templates();
        result
    }

    /// Parse and prepare off the callback. A failed import preserves the
    /// current and pending runtimes. The latest accepted pending file wins.
    pub fn submit_session(&mut self, bytes: &[u8]) -> Result<u64, MainSessionError> {
        let processor = prepare_main_session(bytes, self.sample_rate, self.max_frames)?;
        let template = save_template(bytes).map_err(|error| match error {
            MainExportError::Json(error) => MainSessionError::Json(error),
            _ => MainSessionError::Invalid("save template"),
        })?;
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
                let displaced = Box::from_raw(previous);
                self.templates.remove(&displaced.generation);
                drop(displaced);
            }
        }
        self.templates.insert(generation, template);
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
        self.prune_templates();
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
    use crate::main_host_parameters::{
        ARPEGGIATOR_BASE, NOTE_FILTER_BASE, SCALE_QUANTIZER_BASE, SYNTH_BASE, TRANSPOSE_BASE,
        VELOCITY_MAPPER_BASE,
    };
    use crate::main_instrument::{MainHostEvent, MainHostEventKind};
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use manifold_core::events::EventKind;
    use serde_json::{Value, json};
    use std::sync::Barrier;
    use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
    use std::time::{Duration, Instant};

    const EMPTY: &str = include_str!("../../../projects/main-looper/default-session-v15.json");

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
    fn fresh_native_main_saves_browser_v15_and_reopens_with_matching_audio() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        control.request_session_snapshot().unwrap();
        let mut saved = None;
        for _ in 0..8 {
            render(&mut audio);
            if let Some(bytes) = control.poll_session_snapshot().unwrap() {
                saved = Some(bytes);
                break;
            }
        }
        let saved = saved.expect("empty native session completes promptly");
        let state: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(state["version"], 15);
        assert_eq!(state["sampleRate"], 8_000.0);
        assert!(
            state["layers"]
                .as_array()
                .unwrap()
                .iter()
                .all(|layer| layer["frames"] == 0)
        );
        let mut reopened = prepare_main_session(&saved, 8_000.0, 128).unwrap();
        let note = [MainHostEvent {
            offset: 0,
            kind: MainHostEventKind::Midi(EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            }),
        }];
        let mut fresh_left = [0.0; 128];
        let mut fresh_right = [0.0; 128];
        audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut fresh_left, &mut fresh_right],
                actions: &note,
            })
            .unwrap();
        let mut reopened_left = [0.0; 128];
        let mut reopened_right = [0.0; 128];
        reopened
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut reopened_left, &mut reopened_right],
                actions: &note,
            })
            .unwrap();
        assert!(fresh_left.iter().any(|sample| sample.abs() > 1e-6));
        for (fresh, restored) in fresh_left.iter().zip(reopened_left.iter()) {
            assert!(
                (fresh - restored).abs() < 1e-5,
                "fresh={fresh} restored={restored}"
            );
        }
    }

    #[test]
    fn legacy_main_imports_upgrade_to_complete_v15_saves() {
        for version in [1, 3, 14] {
            let mut legacy: Value = serde_json::from_str(EMPTY).unwrap();
            legacy["sampleRate"] = json!(8_000);
            legacy["version"] = json!(version);
            if version == 1 {
                legacy.as_object_mut().unwrap().remove("sample");
                legacy.as_object_mut().unwrap().remove("rack");
            } else {
                legacy["rack"]["source"]["waveform"] = json!(2);
                legacy["rack"]["filter"]["cutoff"] = json!(1_000);
                if version == 3 {
                    let mut lfo = legacy["rack"]["lfos"][0].clone();
                    lfo.as_object_mut().unwrap().remove("slot");
                    lfo["shape"] = json!(3);
                    let rack = legacy["rack"].as_object_mut().unwrap();
                    rack.retain(|key, _| {
                        ["source", "adsr", "filter", "fx1", "fx2", "eq"].contains(&key.as_str())
                    });
                    rack.insert("lfo".into(), lfo);
                } else {
                    legacy["rack"]["range"]["min"] = json!(0.2);
                    legacy["rack"]
                        .as_object_mut()
                        .unwrap()
                        .remove("arpeggiator");
                }
            }
            let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
            control
                .submit_session(&serde_json::to_vec(&legacy).unwrap())
                .unwrap();
            render(&mut audio);
            control.reclaim();
            control.request_session_snapshot().unwrap();
            let mut saved = None;
            for _ in 0..8 {
                render(&mut audio);
                if let Some(bytes) = control.poll_session_snapshot().unwrap() {
                    saved = Some(bytes);
                    break;
                }
            }
            let saved = saved.expect("legacy save completes promptly");
            let state: Value = serde_json::from_slice(&saved).unwrap();
            assert_eq!(state["version"], 15);
            assert_eq!(state["rack"]["lfos"].as_array().unwrap().len(), 1);
            assert!(state["rack"]["arpeggiator"].is_object());
            if version == 3 {
                assert_eq!(state["rack"]["lfos"][0]["shape"], 3);
            }
            if version >= 3 {
                assert_eq!(state["rack"]["source"]["waveform"], 2);
                assert_eq!(state["rack"]["filter"]["cutoff"], 1_000);
            }
            if version == 14 {
                assert_eq!(state["rack"]["range"]["min"], 0.2);
            }
            prepare_main_session(&saved, 8_000.0, 128).unwrap();
        }
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
    fn host_values_are_frozen_with_the_first_pcm_header() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        control.submit_session(&snapshot_session()).unwrap();
        render(&mut audio);
        control.reclaim();
        control.request_pcm_snapshot().unwrap();
        let set_master = |value| MainHostEvent {
            offset: 64,
            kind: MainHostEventKind::Parameter {
                id: SYNTH_BASE + 15,
                value,
            },
        };
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &[set_master(0.25)],
            })
            .unwrap();
        assert!(control.poll_pcm_snapshot().unwrap().is_none());
        audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &[set_master(0.75)],
            })
            .unwrap();
        let snapshot = loop {
            render(&mut audio);
            if let Some(snapshot) = control.poll_pcm_snapshot().unwrap() {
                break snapshot;
            }
        };
        assert_eq!(snapshot.host_values.get(SYNTH_BASE + 15), Some(0.25));
        assert_eq!(snapshot.host_values.get(SYNTH_BASE + 22), None);
    }

    #[test]
    fn live_main_session_saves_pcm_automated_controls_and_inactive_fx_memories() {
        let (mut audio, mut control) = MainAudioRuntime::prepare(8_000.0, 128).unwrap();
        let mut imported: Value = serde_json::from_slice(&snapshot_session()).unwrap();
        imported["rack"]["fx1"]["parameters"][7][0] = json!(0.77);
        imported["rack"]["eq"]["bands"][0]["enabled"] = json!(true);
        imported["rack"]["eq"]["selected"] = json!(0);
        control
            .submit_session(&serde_json::to_vec(&imported).unwrap())
            .unwrap();
        render(&mut audio);
        control.reclaim();

        let events = [
            (SYNTH_BASE + 1, -0.2),
            (SYNTH_BASE + 15, 0.37),
            (SYNTH_BASE + 64, 0.0),
            (SYNTH_BASE + 104, -3.0),
            (SYNTH_BASE + 105, 0.65),
            (SYNTH_BASE + 128, 7.0),
            (SYNTH_BASE + 130, 0.42),
            (SCALE_QUANTIZER_BASE, 2.0),
            (SCALE_QUANTIZER_BASE + 1, 2.0),
            (SCALE_QUANTIZER_BASE + 3, 1.0),
            (TRANSPOSE_BASE, 7.0),
            (TRANSPOSE_BASE + 1, 1.0),
            (TRANSPOSE_BASE + 2, 1.0),
            (NOTE_FILTER_BASE, 68.0),
            (NOTE_FILTER_BASE + 1, 72.0),
            (NOTE_FILTER_BASE + 3, 2.0),
            (NOTE_FILTER_BASE + 4, 1.0),
            (VELOCITY_MAPPER_BASE, 0.8),
            (VELOCITY_MAPPER_BASE + 1, 2.0),
            (VELOCITY_MAPPER_BASE + 2, 0.1),
            (VELOCITY_MAPPER_BASE + 3, 4.0),
            (VELOCITY_MAPPER_BASE + 4, 1.0),
            (ARPEGGIATOR_BASE + 3, 45.0),
            (ARPEGGIATOR_BASE + 5, 1.0),
        ]
        .map(|(id, value)| MainHostEvent {
            offset: 64,
            kind: MainHostEventKind::Parameter { id, value },
        });
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &events,
            })
            .unwrap();
        control.request_session_snapshot().unwrap();
        let bytes = loop {
            render(&mut audio);
            if let Some(bytes) = control.poll_session_snapshot().unwrap() {
                break bytes;
            }
        };
        let saved: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(saved["version"], 15);
        assert_eq!(saved["layers"][0]["frames"], 9_000);
        assert_eq!(saved["sample"]["frames"], 9_000);
        assert!((saved["rack"]["source"]["output"].as_f64().unwrap() - 0.37).abs() < 1e-6);
        assert!((saved["rack"]["source"]["sampleBlend"].as_f64().unwrap() - 0.4).abs() < 1e-6);
        assert_eq!(
            saved["rack"]["source"]["sampleSource"],
            imported["rack"]["source"]["sampleSource"]
        );
        assert_eq!(saved["rack"]["fx1"]["selected"], 7);
        assert!((saved["rack"]["fx1"]["parameters"][7][0].as_f64().unwrap() - 0.42).abs() < 1e-6);
        for (saved, imported) in saved["rack"]["fx1"]["parameters"][0]
            .as_array()
            .unwrap()
            .iter()
            .zip(imported["rack"]["fx1"]["parameters"][0].as_array().unwrap())
        {
            assert!((saved.as_f64().unwrap() - imported.as_f64().unwrap()).abs() < 1e-6);
        }
        assert_eq!(saved["rack"]["eq"]["selected"], -1);
        assert_eq!(saved["rack"]["eq"]["output"], json!(-3.0));
        assert!((saved["rack"]["eq"]["mix"].as_f64().unwrap() - 0.65).abs() < 1e-6);
        assert_eq!(saved["rack"]["arpeggiator"]["gate"], json!(45.0));
        assert_eq!(saved["rack"]["arpeggiator"]["connected"], true);
        assert_eq!(saved["rack"]["scaleQuantizer"]["root"], 2.0);
        assert_eq!(saved["rack"]["scaleQuantizer"]["connected"], true);
        assert_eq!(saved["rack"]["transpose"]["semitones"], 7.0);
        assert_eq!(saved["rack"]["transpose"]["source"], 1.0);
        assert_eq!(saved["rack"]["transpose"]["connected"], true);
        assert_eq!(saved["rack"]["noteFilter"]["low"], 68.0);
        assert_eq!(saved["rack"]["noteFilter"]["high"], 72.0);
        assert_eq!(saved["rack"]["noteFilter"]["connected"], true);
        assert!((saved["rack"]["velocityMapper"]["amount"].as_f64().unwrap() - 0.8).abs() < 1e-6);
        assert_eq!(saved["rack"]["velocityMapper"]["curve"], 2.0);
        assert_eq!(saved["rack"]["velocityMapper"]["connected"], true);

        let reopened = prepare_main_session(&bytes, 8_000.0, 128).unwrap();
        assert_eq!(reopened.instrument().looper().layer_length(0), 9_000);
        assert_eq!(reopened.instrument().synth_sample_frames(), 9_000);
        assert!((reopened.instrument().fx_type_params(0, 7).unwrap()[0] - 0.42).abs() < 1e-6);
        assert_eq!(reopened.instrument().eq_control_snapshot()[40], -3.0);
        assert!((reopened.instrument().eq_control_snapshot()[41] - 0.65).abs() < 1e-6);
        assert_eq!(reopened.instrument().arpeggiator_status(11), 1.0);
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
