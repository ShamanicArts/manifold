//! Bounded Main PCM handoff. The audio thread alone reads live loop and sample
//! storage; the control thread alone allocates the assembled export vectors.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use crossbeam_queue::ArrayQueue;
use manifold_core::main_instrument::MainInstrument;
use manifold_core::main_looper::{LAYERS, Mode};

const CHUNK_FRAMES: usize = 4096;
const CHUNK_SAMPLES: usize = CHUNK_FRAMES * 2;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainLayerSnapshotHeader {
    pub frames: usize,
    pub bars: f32,
    pub position: f32,
    pub playing: bool,
    pub volume: f32,
    pub speed: f32,
    pub muted: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainPcmSnapshotHeader {
    pub generation: u64,
    pub sample_rate: f32,
    pub tempo: f32,
    pub target_bpm: f32,
    pub mode: Mode,
    pub active_layer: usize,
    pub overdub: bool,
    pub overdub_length_policy: bool,
    pub layers: [MainLayerSnapshotHeader; LAYERS],
    pub sample_frames: usize,
}

pub struct MainPcmSnapshot {
    pub header: MainPcmSnapshotHeader,
    pub layers: [Vec<f32>; LAYERS],
    pub sample: Vec<f32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MainSnapshotError {
    Busy,
    Unstable,
    Interrupted,
    CopyFailed,
    NonFiniteAudio,
}

#[derive(Clone, Copy)]
struct HeaderMessage {
    id: u64,
    header: MainPcmSnapshotHeader,
}

#[derive(Clone, Copy)]
struct Outcome {
    id: u64,
    result: Result<(), MainSnapshotError>,
}

struct Chunk {
    id: u64,
    source: usize,
    offset: usize,
    frames: usize,
    samples: [f32; CHUNK_SAMPLES],
}

impl Chunk {
    fn new() -> Self {
        Self {
            id: 0,
            source: 0,
            offset: 0,
            frames: 0,
            samples: [0.0; CHUNK_SAMPLES],
        }
    }
}

struct Exchange {
    requested: AtomicU64,
    header: ArrayQueue<HeaderMessage>,
    free: ArrayQueue<Box<Chunk>>,
    ready: ArrayQueue<Box<Chunk>>,
    outcome: ArrayQueue<Outcome>,
}

struct Cursor {
    id: u64,
    lengths: [usize; LAYERS + 1],
    source: usize,
    offset: usize,
}

pub(crate) struct SnapshotAudio {
    exchange: Arc<Exchange>,
    cursor: Option<Cursor>,
    seen: u64,
}

pub struct SnapshotControl {
    exchange: Arc<Exchange>,
    next_id: u64,
    active: Option<u64>,
    assembled: Option<MainPcmSnapshot>,
    copied: [usize; LAYERS + 1],
}

impl MainPcmSnapshotHeader {
    fn from_instrument(instrument: &MainInstrument, generation: u64) -> Self {
        let looper = instrument.looper();
        Self {
            generation,
            sample_rate: looper.sample_rate(),
            tempo: looper.tempo(),
            target_bpm: looper.target_bpm(),
            mode: looper.mode(),
            active_layer: looper.active(),
            overdub: looper.overdub(),
            overdub_length_policy: looper.overdub_length_wins(),
            layers: std::array::from_fn(|index| MainLayerSnapshotHeader {
                frames: looper.layer_length(index),
                bars: looper.layer_bars(index),
                position: looper.layer_position(index),
                playing: looper.layer_control(index, 3) == 1.0,
                volume: looper.layer_control(index, 0),
                speed: looper.layer_control(index, 1),
                muted: looper.layer_control(index, 2) == 1.0,
            }),
            sample_frames: instrument.synth_sample_frames(),
        }
    }
}

pub(crate) fn prepare() -> (SnapshotAudio, SnapshotControl) {
    let exchange = Arc::new(Exchange {
        requested: AtomicU64::new(0),
        header: ArrayQueue::new(1),
        free: ArrayQueue::new(2),
        ready: ArrayQueue::new(2),
        outcome: ArrayQueue::new(1),
    });
    for _ in 0..2 {
        exchange.free.push(Box::new(Chunk::new())).ok();
    }
    (
        SnapshotAudio {
            exchange: Arc::clone(&exchange),
            cursor: None,
            seen: 0,
        },
        SnapshotControl {
            exchange,
            next_id: 1,
            active: None,
            assembled: None,
            copied: [0; LAYERS + 1],
        },
    )
}

impl SnapshotAudio {
    fn finish(&mut self, id: u64, result: Result<(), MainSnapshotError>) {
        self.cursor = None;
        self.seen = id;
        let pushed = self.exchange.outcome.push(Outcome { id, result });
        debug_assert!(pushed.is_ok());
    }

    /// Called only after a successful audio block. One call copies at most
    /// 4,096 stereo frames and never waits for the control thread.
    pub(crate) fn after_block(
        &mut self,
        instrument: &MainInstrument,
        generation: u64,
        content_changed: bool,
    ) {
        let id = self.exchange.requested.load(Ordering::Acquire);
        if id == 0 {
            self.cursor = None; // the control endpoint was dropped
            return;
        }
        if self.seen == id {
            return; // outcome waits for control-side acknowledgement
        }
        if content_changed {
            self.finish(id, Err(MainSnapshotError::Interrupted));
            return;
        }
        if self.cursor.is_none() {
            let looper = instrument.looper();
            if looper.recording() || (0..LAYERS).any(|layer| looper.layer_pending(layer) > 0.0) {
                self.finish(id, Err(MainSnapshotError::Unstable));
                return;
            }
            let header = MainPcmSnapshotHeader::from_instrument(instrument, generation);
            let mut lengths = [0; LAYERS + 1];
            for (index, layer) in header.layers.iter().enumerate() {
                lengths[index] = layer.frames;
            }
            lengths[LAYERS] = header.sample_frames;
            let pushed = self.exchange.header.push(HeaderMessage { id, header });
            debug_assert!(pushed.is_ok());
            self.cursor = Some(Cursor {
                id,
                lengths,
                source: 0,
                offset: 0,
            });
        }
        let cursor = self.cursor.as_mut().expect("cursor prepared above");
        while cursor.source <= LAYERS && cursor.offset == cursor.lengths[cursor.source] {
            cursor.source += 1;
            cursor.offset = 0;
        }
        if cursor.source > LAYERS {
            self.finish(id, Ok(()));
            return;
        }
        let Some(mut chunk) = self.exchange.free.pop() else {
            return; // backpressure never stalls audio
        };
        let frames = (cursor.lengths[cursor.source] - cursor.offset).min(CHUNK_FRAMES);
        let copied = if cursor.source == LAYERS {
            instrument
                .copy_synth_sample_interleaved(cursor.offset, &mut chunk.samples[..frames * 2])
        } else {
            instrument.looper().copy_loop_interleaved(
                cursor.source,
                cursor.offset,
                &mut chunk.samples[..frames * 2],
            )
        };
        if copied != frames {
            let pushed = self.exchange.free.push(chunk);
            debug_assert!(pushed.is_ok());
            self.finish(id, Err(MainSnapshotError::CopyFailed));
            return;
        }
        chunk.id = cursor.id;
        chunk.source = cursor.source;
        chunk.offset = cursor.offset;
        chunk.frames = frames;
        cursor.offset += frames;
        let pushed = self.exchange.ready.push(chunk);
        debug_assert!(pushed.is_ok());
    }
}

impl SnapshotControl {
    pub fn request(&mut self) -> Result<u64, MainSnapshotError> {
        if self.active.is_some() || self.exchange.requested.load(Ordering::Acquire) != 0 {
            return Err(MainSnapshotError::Busy);
        }
        let id = self.next_id;
        self.next_id = self.next_id.wrapping_add(1).max(1);
        self.active = Some(id);
        self.assembled = None;
        self.copied.fill(0);
        self.exchange.requested.store(id, Ordering::Release);
        Ok(id)
    }

    /// Poll on the control thread. Allocations and PCM assembly happen here.
    pub fn poll(&mut self) -> Result<Option<MainPcmSnapshot>, MainSnapshotError> {
        let Some(id) = self.active else {
            return Ok(None);
        };
        if let Some(message) = self.exchange.header.pop() {
            debug_assert_eq!(message.id, id);
            self.assembled = Some(MainPcmSnapshot {
                header: message.header,
                layers: std::array::from_fn(|index| {
                    vec![0.0; message.header.layers[index].frames * 2]
                }),
                sample: vec![0.0; message.header.sample_frames * 2],
            });
        }
        while let Some(chunk) = self.exchange.ready.pop() {
            debug_assert_eq!(chunk.id, id);
            let copied = &mut self.copied[chunk.source];
            debug_assert_eq!(*copied, chunk.offset);
            let assembled = self.assembled.as_mut().expect("header precedes chunks");
            let destination = if chunk.source == LAYERS {
                &mut assembled.sample
            } else {
                &mut assembled.layers[chunk.source]
            };
            destination[chunk.offset * 2..(chunk.offset + chunk.frames) * 2]
                .copy_from_slice(&chunk.samples[..chunk.frames * 2]);
            *copied += chunk.frames;
            let pushed = self.exchange.free.push(chunk);
            debug_assert!(pushed.is_ok());
        }
        let Some(outcome) = self.exchange.outcome.pop() else {
            return Ok(None);
        };
        debug_assert_eq!(outcome.id, id);
        self.active = None;
        self.exchange.requested.store(0, Ordering::Release);
        outcome.result?;
        let assembled = self
            .assembled
            .take()
            .expect("completed transfer has header");
        if self
            .copied
            .iter()
            .zip(
                assembled
                    .header
                    .layers
                    .iter()
                    .map(|layer| layer.frames)
                    .chain([assembled.header.sample_frames]),
            )
            .any(|(copied, expected)| *copied != expected)
        {
            return Err(MainSnapshotError::CopyFailed);
        }
        if assembled
            .layers
            .iter()
            .chain(std::iter::once(&assembled.sample))
            .any(|pcm| pcm.iter().any(|sample| !sample.is_finite()))
        {
            return Err(MainSnapshotError::NonFiniteAudio);
        }
        Ok(Some(assembled))
    }
}

impl Drop for SnapshotControl {
    fn drop(&mut self) {
        self.exchange.requested.store(0, Ordering::Release);
    }
}
