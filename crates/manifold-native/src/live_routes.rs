//! One bounded control-to-audio route command per prepared native graph.
//! Submission and document validation happen off the callback; application is
//! allocation-free and reports an atomic acknowledgement after the block swap.

use std::sync::atomic::{AtomicU64, Ordering};

use crossbeam_queue::ArrayQueue;

use crate::NativeProcessor;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RouteCommand {
    pub generation: u64,
    pub to: u32,
    pub input_port: usize,
    pub source: Option<(u32, usize)>,
}

pub struct RouteMailbox {
    queue: ArrayQueue<RouteCommand>,
    accepted: AtomicU64,
    rejected: AtomicU64,
}

impl Default for RouteMailbox {
    fn default() -> Self {
        Self::new()
    }
}

impl RouteMailbox {
    pub fn new() -> Self {
        Self {
            queue: ArrayQueue::new(1),
            accepted: AtomicU64::new(0),
            rejected: AtomicU64::new(0),
        }
    }

    pub fn submit(&self, command: RouteCommand) -> Result<(), RouteCommand> {
        self.queue.push(command)
    }

    pub fn pending(&self) -> bool {
        !self.queue.is_empty()
    }
    /// Call after the host has stopped its audio callback.
    pub fn cancel_pending(&self) {
        let _ = self.queue.pop();
    }
    pub fn accepted(&self) -> u64 {
        self.accepted.load(Ordering::Acquire)
    }
    pub fn rejected(&self) -> u64 {
        self.rejected.load(Ordering::Acquire)
    }

    /// Call only at the start of the host audio block, after runtime swaps.
    pub fn apply(&self, processor: &mut NativeProcessor) -> Option<(u64, bool)> {
        let command = self.queue.pop()?;
        let ok = processor
            .set_route_from(
                command.to.into(),
                command.input_port,
                command.source.map(|(node, port)| (node.into(), port)),
            )
            .is_ok();
        if ok {
            self.accepted.store(command.generation, Ordering::Release);
        } else {
            self.rejected.store(command.generation, Ordering::Release);
        }
        Some((command.generation, ok))
    }
}
