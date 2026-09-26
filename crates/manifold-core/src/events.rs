//! Typed events use frame offsets within the next prepared audio block.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventKind {
    NoteOn { channel: u8, note: u8, velocity: u8 },
    NoteOff { channel: u8, note: u8 },
    AllNotesOff,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TimedEvent {
    pub offset: usize,
    pub node: u64,
    pub kind: EventKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EventError {
    OffsetOutOfRange,
    Unsorted,
    UnknownTarget,
}
