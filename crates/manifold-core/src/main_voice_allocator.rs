//! Eight-slot Main note ownership, following the original UI VoiceManager.
//! Envelope rendering remains a separate concern; it reports phase and level
//! here so release-stage stealing follows the same decision rule.

pub const MAIN_VOICE_COUNT: usize = 8;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum EnvelopePhase {
    #[default]
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct MainVoiceSlot {
    pub active: bool,
    pub note: u8,
    pub gate: bool,
    pub phase: EnvelopePhase,
    pub envelope_level: f32,
    pub target_amp: f32,
    pub stamp: u64,
}

#[derive(Clone, Debug, Default)]
pub struct MainVoiceAllocator {
    slots: [MainVoiceSlot; MAIN_VOICE_COUNT],
    stamp: u64,
}

impl MainVoiceAllocator {
    pub fn slots(&self) -> &[MainVoiceSlot; MAIN_VOICE_COUNT] {
        &self.slots
    }

    pub fn choose_voice(&self) -> usize {
        if let Some(index) = self
            .slots
            .iter()
            .position(|slot| !slot.active || slot.phase == EnvelopePhase::Idle)
        {
            return index;
        }
        let mut best_release = None;
        let mut best_level = f32::INFINITY;
        for (index, slot) in self.slots.iter().enumerate() {
            if slot.phase == EnvelopePhase::Release && slot.envelope_level < best_level {
                best_release = Some(index);
                best_level = slot.envelope_level;
            }
        }
        if let Some(index) = best_release {
            return index;
        }
        let mut oldest_index = 0;
        let mut oldest_stamp = self.slots[0].stamp;
        for (index, slot) in self.slots.iter().enumerate().skip(1) {
            if slot.stamp < oldest_stamp {
                oldest_index = index;
                oldest_stamp = slot.stamp;
            }
        }
        oldest_index
    }

    /// Returns the zero-based slot assigned to this note. The old allocator
    /// seeks an idle slot before considering a matching active note.
    pub fn note_on(&mut self, note: u8, velocity: u8) -> usize {
        let index = self.choose_voice();
        self.stamp = self.stamp.wrapping_add(1);
        self.slots[index] = MainVoiceSlot {
            active: true,
            note,
            gate: true,
            phase: EnvelopePhase::Attack,
            envelope_level: 0.0,
            target_amp: (0.03 + velocity as f32 / 127.0 * 0.37).clamp(0.0, 0.4),
            stamp: self.stamp,
        };
        index
    }

    pub fn set_target_amp(&mut self, index: usize, amp: f32) {
        if let Some(slot) = self.slots.get_mut(index) {
            slot.target_amp = amp.clamp(0.0, 1.0);
        }
    }

    /// Old note-off releases every active slot carrying this note.
    pub fn note_off(&mut self, note: u8) {
        for slot in &mut self.slots {
            if slot.active && slot.note == note {
                slot.gate = false;
                slot.phase = EnvelopePhase::Release;
            }
        }
    }

    pub fn report_envelope(&mut self, index: usize, phase: EnvelopePhase, level: f32) -> bool {
        let Some(slot) = self.slots.get_mut(index) else {
            return false;
        };
        if !level.is_finite() {
            return false;
        }
        slot.phase = phase;
        slot.envelope_level = level.clamp(0.0, 1.0);
        if phase == EnvelopePhase::Idle && !slot.gate {
            slot.active = false;
        }
        true
    }

    pub fn panic(&mut self) {
        self.slots.fill(MainVoiceSlot::default());
        self.stamp = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_then_quietest_release_then_oldest_active() {
        let mut pool = MainVoiceAllocator::default();
        for note in 60..68 {
            assert_eq!(pool.note_on(note, 100), (note - 60) as usize);
        }
        assert_eq!(pool.choose_voice(), 0);
        pool.note_off(62);
        pool.note_off(65);
        pool.report_envelope(2, EnvelopePhase::Release, 0.2);
        pool.report_envelope(5, EnvelopePhase::Release, 0.1);
        assert_eq!(pool.note_on(70, 64), 5);
        assert_eq!(pool.note_on(71, 64), 2);
        assert_eq!(pool.note_on(72, 64), 0);
    }

    #[test]
    fn duplicate_note_uses_another_idle_slot_and_releases_both() {
        let mut pool = MainVoiceAllocator::default();
        assert_eq!(pool.note_on(60, 127), 0);
        assert_eq!(pool.note_on(60, 64), 1);
        assert_eq!(pool.slots()[0].target_amp, 0.4);
        pool.note_off(60);
        assert!(!pool.slots()[0].gate && !pool.slots()[1].gate);
        assert!(pool.slots()[0].active && pool.slots()[1].active);
        pool.report_envelope(0, EnvelopePhase::Idle, 0.0);
        assert_eq!(pool.choose_voice(), 0);
        pool.panic();
        assert!(pool.slots().iter().all(|slot| !slot.active));
    }
}
