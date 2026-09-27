//! One bounded retrospective capture transaction between a native host control
//! thread and the audio callback. All PCM storage and queue slots are prepared.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crossbeam_queue::ArrayQueue;

use crate::NativeProcessor;

const COPY_FRAMES_PER_SERVICE: usize = 2048;
const MAX_CAPTURE_FRAMES: usize = 1_440_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CaptureError {
    StageRejected,
    StageLost,
    CopyMismatch,
}

#[derive(Clone, Copy)]
struct Request {
    node: u32,
    frames: usize,
}

enum Outcome {
    Ready {
        node: u32,
        frames: usize,
        pcm: Vec<f32>,
    },
    Failed(CaptureError),
}

struct Active {
    request: Request,
    pcm: Vec<f32>,
    copied: usize,
}

pub struct CaptureMailbox {
    max_frames: usize,
    busy: AtomicBool,
    requests: ArrayQueue<Request>,
    free: ArrayQueue<Vec<f32>>,
    ready: ArrayQueue<Outcome>,
}

impl CaptureMailbox {
    /// Allocate the single transfer buffer while preparing an instance.
    pub fn new(max_frames: usize) -> Option<Arc<Self>> {
        if !(1..=MAX_CAPTURE_FRAMES).contains(&max_frames) {
            return None;
        }
        let free = ArrayQueue::new(1);
        free.push(vec![0.0; max_frames * 2]).ok()?;
        Some(Arc::new(Self {
            max_frames,
            busy: AtomicBool::new(false),
            requests: ArrayQueue::new(1),
            free,
            ready: ArrayQueue::new(1),
        }))
    }

    /// One request at a time. The caller may retry after taking the result and
    /// returning its buffer; no wait or heap work occurs on the audio thread.
    pub fn request(&self, node: u32, frames: usize) -> bool {
        if node == 0 || frames == 0 || frames > self.max_frames || self.free.is_empty() {
            return false;
        }
        if self
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return false;
        }
        if self.requests.push(Request { node, frames }).is_err() {
            self.busy.store(false, Ordering::Release);
            return false;
        }
        true
    }

    /// Poll on a host control thread. The take returns its prepared buffer on
    /// drop, after project preparation has finished reading it.
    pub fn take(self: &Arc<Self>) -> Option<Result<CapturedWindow, CaptureError>> {
        let outcome = self.ready.pop()?;
        self.busy.store(false, Ordering::Release);
        Some(match outcome {
            Outcome::Ready { node, frames, pcm } => Ok(CapturedWindow {
                node,
                frames,
                pcm: Some(pcm),
                mailbox: Arc::clone(self),
            }),
            Outcome::Failed(error) => Err(error),
        })
    }

    pub fn max_frames(&self) -> usize {
        self.max_frames
    }
}

pub struct CapturedWindow {
    pub node: u32,
    pub frames: usize,
    pcm: Option<Vec<f32>>,
    mailbox: Arc<CaptureMailbox>,
}

impl CapturedWindow {
    pub fn stereo(&self) -> &[f32] {
        &self.pcm.as_ref().unwrap()[..self.frames * 2]
    }
}

impl Drop for CapturedWindow {
    fn drop(&mut self) {
        if let Some(pcm) = self.pcm.take() {
            let _ = self.mailbox.free.push(pcm);
        }
    }
}

/// Owned by one audio runtime. `service` is called at a block boundary and
/// copies at most 2048 stereo frames per call, with no allocation or lock.
pub struct AudioCaptureWorker {
    mailbox: Arc<CaptureMailbox>,
    active: Option<Active>,
}

impl AudioCaptureWorker {
    pub fn new(mailbox: Arc<CaptureMailbox>) -> Self {
        Self {
            mailbox,
            active: None,
        }
    }

    pub fn service(&mut self, processor: &mut NativeProcessor) {
        if self.active.is_none() {
            let Some(request) = self.mailbox.requests.pop() else {
                return;
            };
            let Some(pcm) = self.mailbox.free.pop() else {
                self.fail(CaptureError::StageLost);
                return;
            };
            if !processor.begin_prepared_capture_staging(request.node.into(), request.frames) {
                let _ = self.mailbox.free.push(pcm);
                self.fail(CaptureError::StageRejected);
                return;
            }
            self.active = Some(Active {
                request,
                pcm,
                copied: 0,
            });
        }
        let Some(active) = self.active.as_mut() else {
            return;
        };
        let node = active.request.node;
        match processor.capture_staging_status(node.into()) {
            Some(false) => return,
            Some(true) => {}
            None => {
                self.finish_failure(processor, CaptureError::StageLost);
                return;
            }
        }
        let length = processor.capture_staged_length(node.into());
        if length != Some(active.request.frames) {
            self.finish_failure(processor, CaptureError::StageLost);
            return;
        }
        let frames = (active.request.frames - active.copied).min(COPY_FRAMES_PER_SERVICE);
        let offset = active.copied * 2;
        if processor.copy_capture_staged_interleaved(
            node.into(),
            active.copied,
            &mut active.pcm[offset..offset + frames * 2],
        ) != frames
        {
            self.finish_failure(processor, CaptureError::CopyMismatch);
            return;
        }
        active.copied += frames;
        if active.copied == active.request.frames {
            let done = self.active.take().unwrap();
            processor.cancel_capture_staging(node.into());
            let pushed = self.mailbox.ready.push(Outcome::Ready {
                node,
                frames: done.request.frames,
                pcm: done.pcm,
            });
            debug_assert!(pushed.is_ok());
        }
    }

    fn finish_failure(&mut self, processor: &mut NativeProcessor, error: CaptureError) {
        if let Some(active) = self.active.take() {
            processor.cancel_capture_staging(active.request.node.into());
            let _ = self.mailbox.free.push(active.pcm);
        }
        self.fail(error);
    }

    fn fail(&self, error: CaptureError) {
        let pushed = self.mailbox.ready.push(Outcome::Failed(error));
        debug_assert!(pushed.is_ok());
    }
}

impl Drop for AudioCaptureWorker {
    fn drop(&mut self) {
        if let Some(active) = self.active.take() {
            let _ = self.mailbox.free.push(active.pcm);
            self.fail(CaptureError::StageLost);
        } else if self.mailbox.requests.pop().is_some() {
            self.fail(CaptureError::StageLost);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AudioBlock;
    use crate::project::NativeProject;
    use manifold_core::events::{EventKind, TimedEvent};

    #[test]
    fn running_graph_transfers_two_sources_through_one_prepared_buffer() {
        let project = NativeProject::parse(include_bytes!(
            "../../../projects/graph-workspace/retrospective-multisource.json"
        ))
        .unwrap();
        let mut prepared = project.prepare_with_state(48_000.0, 128).unwrap();
        let mailbox = CaptureMailbox::new(9_600).unwrap();
        let mut worker = AudioCaptureWorker::new(Arc::clone(&mailbox));
        let main = [0.25; 128];
        let side = [-0.5; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut block = |worker: &mut AudioCaptureWorker| {
            worker.service(&mut prepared.processor);
            prepared
                .processor
                .process(AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: Some([&side, &side]),
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            worker.service(&mut prepared.processor);
        };
        for _ in 0..75 {
            block(&mut worker);
        }
        assert!(!mailbox.request(10, 9_601));
        assert!(mailbox.request(10, 9_600));
        assert!(!mailbox.request(6, 9_600));
        let side_take = loop {
            block(&mut worker);
            if let Some(result) = mailbox.take() {
                break result.unwrap();
            }
        };
        assert_eq!(side_take.node, 10);
        assert_eq!(side_take.frames, 9_600);
        assert_eq!(side_take.stereo()[0], -2.0);
        let portable = NativeProject::embed_capture_asset(
            include_bytes!("../../../projects/graph-workspace/retrospective-multisource.json"),
            side_take.node,
            5,
            side_take.stereo(),
            48_000,
            "Sidechain capture",
        )
        .unwrap();
        let document: serde_json::Value = serde_json::from_slice(&portable).unwrap();
        assert_eq!(document["signal"]["selectedCaptureNodeId"], 10);
        assert_eq!(document["assets"][0]["frames"], 9_600);
        let mut reopened = NativeProject::parse(&portable)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let mut playback_left = [0.0; 128];
        let mut playback_right = [0.0; 128];
        reopened
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut playback_left, &mut playback_right],
                events: &[TimedEvent {
                    offset: 0,
                    node: 4_u32.into(),
                    kind: EventKind::NoteOn {
                        channel: 0,
                        note: 60,
                        velocity: 127,
                    },
                }],
            })
            .unwrap();
        assert!(playback_left.iter().any(|sample| *sample < -0.01));
        let buffer = side_take.stereo().as_ptr();
        assert!(
            !mailbox.request(6, 9_600),
            "control thread still owns the buffer"
        );
        drop(side_take);
        assert!(mailbox.request(6, 9_600));
        let main_take = loop {
            block(&mut worker);
            if let Some(result) = mailbox.take() {
                break result.unwrap();
            }
        };
        assert_eq!(main_take.stereo().as_ptr(), buffer);
        assert_eq!(main_take.node, 6);
        assert_eq!(main_take.stereo()[0], 1.0);
        drop(main_take);
        assert!(mailbox.request(3, 100));
        worker.service(&mut prepared.processor);
        assert!(matches!(
            mailbox.take(),
            Some(Err(CaptureError::StageRejected))
        ));
    }

    #[test]
    fn retiring_a_runtime_returns_its_capture_buffer() {
        let project = NativeProject::parse(include_bytes!(
            "../../../projects/graph-workspace/retrospective-multisource.json"
        ))
        .unwrap();
        let mut prepared = project.prepare_with_state(48_000.0, 128).unwrap();
        let mailbox = CaptureMailbox::new(128).unwrap();
        let mut worker = AudioCaptureWorker::new(Arc::clone(&mailbox));
        assert!(mailbox.request(10, 128));
        worker.service(&mut prepared.processor);
        drop(worker);
        drop(prepared);
        assert!(matches!(mailbox.take(), Some(Err(CaptureError::StageLost))));
        assert!(mailbox.request(10, 128));
        let queued = AudioCaptureWorker::new(Arc::clone(&mailbox));
        drop(queued);
        assert!(matches!(mailbox.take(), Some(Err(CaptureError::StageLost))));
    }
}
