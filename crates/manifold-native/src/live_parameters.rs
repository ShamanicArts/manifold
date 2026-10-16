//! One validated project parameter edit per prepared graph, applied at a block boundary.

use std::sync::atomic::{AtomicU64, Ordering};

use crossbeam_queue::ArrayQueue;

use crate::NativeProcessor;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ParameterCommand {
    pub generation: u64,
    pub node: u32,
    pub id: u32,
    pub value: f32,
}

pub struct ParameterMailbox {
    queue: ArrayQueue<ParameterMessage>,
    retired: ArrayQueue<Box<[(u32, u32, f64)]>>,
    accepted: AtomicU64,
    rejected: AtomicU64,
}

enum ParameterMessage {
    Single(ParameterCommand),
    Batch {
        generation: u64,
        edits: Box<[(u32, u32, f64)]>,
    },
}

impl Default for ParameterMailbox {
    fn default() -> Self {
        Self::new()
    }
}

impl ParameterMailbox {
    pub fn new() -> Self {
        Self {
            queue: ArrayQueue::new(1),
            retired: ArrayQueue::new(1),
            accepted: AtomicU64::new(0),
            rejected: AtomicU64::new(0),
        }
    }

    pub fn submit(&self, command: ParameterCommand) -> Result<(), ParameterCommand> {
        self.retire();
        self.queue
            .push(ParameterMessage::Single(command))
            .map_err(|_| command)
    }

    /// Prepare the payload on control. Audio returns it for control-side disposal.
    pub fn submit_batch(&self, generation: u64, edits: &[(u32, u32, f64)]) -> bool {
        self.retire();
        if edits.is_empty() { return false; }
        self.queue.push(ParameterMessage::Batch { generation, edits: edits.into() }).is_ok()
    }

    /// Control-side only: reclaim completed transactions without freeing on audio.
    fn retire(&self) { while self.retired.pop().is_some() {} }

    pub fn cancel_pending(&self) {
        let _ = self.cancel_pending_generation();
    }
    pub fn cancel_pending_generation(&self) -> Option<u64> {
        self.retire();
        match self.queue.pop()? {
            ParameterMessage::Single(command) => Some(command.generation),
            ParameterMessage::Batch { generation, .. } => Some(generation),
        }
    }
    pub fn accepted(&self) -> u64 {
        self.retire();
        self.accepted.load(Ordering::Acquire)
    }
    pub fn rejected(&self) -> u64 {
        self.retire();
        self.rejected.load(Ordering::Acquire)
    }

    /// Called only by the audio thread before rendering a host block.
    pub fn apply(&self, processor: &mut NativeProcessor) -> Option<(u64, bool)> {
        // A control status poll or submission reclaims the previous batch.
        // Leave pending work queued until its payload can be retired safely.
        if self.retired.is_full() { return None; }
        let command = self.queue.pop()?;
        let (generation, ok) = match command {
            ParameterMessage::Single(command) => (
                command.generation,
                processor.set_parameter(command.node.into(), command.id, command.value),
            ),
            ParameterMessage::Batch {
                generation,
                edits,
            } => {
                let ok = processor.set_parameter_batch(&edits);
                // Only audio pushes; control can only free space after the guard.
                self.retired.push(edits).expect("parameter retirement slot reserved");
                (generation, ok)
            },
        };
        if ok {
            self.accepted.store(generation, Ordering::Release);
        } else {
            self.rejected.store(generation, Ordering::Release);
        }
        Some((generation, ok))
    }
}
