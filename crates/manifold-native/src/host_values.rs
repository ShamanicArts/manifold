//! Project-sized, versioned host-parameter snapshots.
//! Banks are prepared off the audio callback and owned by a runtime/publication.
//! Stable slot IDs are sparse: an authored high ID does not allocate empty slots.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

pub struct ValueBank {
    sequence: AtomicU64,
    values: BTreeMap<usize, AtomicU32>,
}

impl ValueBank {
    pub fn new(values: impl IntoIterator<Item = f32>) -> Self {
        Self::from_slots(values.into_iter().enumerate())
    }

    pub fn from_slots(values: impl IntoIterator<Item = (usize, f32)>) -> Self {
        Self {
            sequence: AtomicU64::new(0),
            values: values
                .into_iter()
                .map(|(slot, value)| (slot, AtomicU32::new(value.to_bits())))
                .collect(),
        }
    }

    pub fn slots(&self) -> impl Iterator<Item = usize> + '_ {
        self.values.keys().copied()
    }
    pub fn contains(&self, slot: usize) -> bool {
        self.values.contains_key(&slot)
    }

    pub fn write_all(&self, values: impl IntoIterator<Item = f32>) {
        self.write_slots(values.into_iter().enumerate());
    }

    /// One writer per bank. Iteration and atomic stores do not allocate.
    pub fn write_slots(&self, values: impl IntoIterator<Item = (usize, f32)>) {
        self.sequence.fetch_add(1, Ordering::SeqCst);
        for (slot, value) in values {
            if let Some(cell) = self.values.get(&slot) {
                cell.store(value.to_bits(), Ordering::SeqCst);
            }
        }
        self.sequence.fetch_add(1, Ordering::SeqCst);
    }

    pub fn write_slot(&self, slot: usize, value: f32) {
        self.write_slots([(slot, value)]);
    }

    /// Allocates a coherent snapshot for control-side save/export; never call in audio.
    pub fn read_all(&self) -> BTreeMap<usize, f32> {
        loop {
            let before = self.sequence.load(Ordering::SeqCst);
            if before & 1 != 0 {
                std::hint::spin_loop();
                continue;
            }
            let values = self
                .values
                .iter()
                .map(|(slot, value)| (*slot, f32::from_bits(value.load(Ordering::SeqCst))))
                .collect();
            if before == self.sequence.load(Ordering::SeqCst) {
                return values;
            }
        }
    }

    pub fn read_slot(&self, slot: usize) -> f32 {
        self.values
            .get(&slot)
            .map(|value| f32::from_bits(value.load(Ordering::Acquire)))
            .unwrap_or(0.0)
    }
}
