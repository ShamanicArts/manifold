//! One bounded script event, merged with host events and acknowledged after render.
use crate::NativeProcessor;
use crossbeam_queue::ArrayQueue;
use manifold_core::events::TimedEvent;
use std::sync::atomic::{AtomicU64, Ordering};

#[derive(Clone, Copy)]
pub struct EventCommand {
    pub generation: u64,
    pub event: TimedEvent,
}
pub struct EventMailbox {
    queue: ArrayQueue<EventCommand>,
    accepted: AtomicU64,
    rejected: AtomicU64,
}
impl Default for EventMailbox {
    fn default() -> Self {
        Self::new()
    }
}
impl EventMailbox {
    pub fn new() -> Self {
        Self {
            queue: ArrayQueue::new(1),
            accepted: AtomicU64::new(0),
            rejected: AtomicU64::new(0),
        }
    }
    pub fn submit(&self, command: EventCommand) -> bool {
        self.queue.push(command).is_ok()
    }
    pub fn status(&self, generation: u64) -> Option<bool> {
        if self.accepted.load(Ordering::Acquire) == generation {
            Some(true)
        } else if self.rejected.load(Ordering::Acquire) == generation {
            Some(false)
        } else {
            None
        }
    }
    pub fn cancel_pending(&self) {
        if let Some(command) = self.queue.pop() {
            self.complete(command, false);
        }
    }
    /// The audio owner provides its prepared event vector. Empty/full blocks
    /// retain the command. Equal-offset script events precede host events.
    pub fn merge(
        &self,
        processor: &NativeProcessor,
        events: &mut Vec<TimedEvent>,
        frames: usize,
    ) -> Option<EventCommand> {
        if frames == 0 || events.len() == events.capacity() {
            return None;
        }
        let command = self.queue.pop()?;
        if processor.validate_events(&[command.event], frames).is_err() {
            self.complete(command, false);
            return None;
        }
        let position = events.partition_point(|event| event.offset < command.event.offset);
        events.insert(position, command.event);
        Some(command)
    }
    pub fn complete(&self, command: EventCommand, accepted: bool) {
        if accepted {
            self.accepted.store(command.generation, Ordering::Release);
        } else {
            self.rejected.store(command.generation, Ordering::Release);
        }
    }
}
