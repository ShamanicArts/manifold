//! Fixed-size, versioned public host-parameter snapshots.
//! One audio runtime writes each bank; host-side readers retry overlapping blocks.

use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

use crate::parameters::HOST_SLOT_COUNT;

pub struct ValueBank {
    sequence: AtomicU64,
    values: [AtomicU32; HOST_SLOT_COUNT],
}

impl ValueBank {
    pub fn new(values: [f32; HOST_SLOT_COUNT]) -> Self {
        Self {
            sequence: AtomicU64::new(0),
            values: values.map(|value| AtomicU32::new(value.to_bits())),
        }
    }

    pub fn write_all(&self, values: [f32; HOST_SLOT_COUNT]) {
        self.sequence.fetch_add(1, Ordering::SeqCst);
        for (slot, value) in values.into_iter().enumerate() {
            self.values[slot].store(value.to_bits(), Ordering::SeqCst);
        }
        self.sequence.fetch_add(1, Ordering::SeqCst);
    }

    pub fn write_slot(&self, slot: usize, value: f32) {
        self.sequence.fetch_add(1, Ordering::SeqCst);
        self.values[slot].store(value.to_bits(), Ordering::SeqCst);
        self.sequence.fetch_add(1, Ordering::SeqCst);
    }

    pub fn read_all(&self) -> [f32; HOST_SLOT_COUNT] {
        loop {
            let before = self.sequence.load(Ordering::SeqCst);
            if before & 1 != 0 {
                std::hint::spin_loop();
                continue;
            }
            let values = std::array::from_fn(|slot| {
                f32::from_bits(self.values[slot].load(Ordering::SeqCst))
            });
            if before == self.sequence.load(Ordering::SeqCst) {
                return values;
            }
        }
    }

    pub fn read_slot(&self, slot: usize) -> f32 {
        f32::from_bits(self.values[slot].load(Ordering::Acquire))
    }
}
