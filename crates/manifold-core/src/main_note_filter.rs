//! Main's per-voice Note Filter, following note_filter_runtime.lua.

use crate::main_voice_allocator::{EnvelopePhase, MAIN_VOICE_COUNT, MainVoiceSlot};

pub struct MainNoteFilter {
    low: u8,
    high: u8,
    outside: bool,
    source: u8,
    connected: bool,
    preview: [Option<(u8, bool)>; MAIN_VOICE_COUNT],
}

impl MainNoteFilter {
    pub fn new() -> Self {
        Self {
            low: 36,
            high: 96,
            outside: false,
            source: 0,
            connected: false,
            preview: [None; MAIN_VOICE_COUNT],
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.low = (value.clamp(0.0, 127.0) + 0.5).floor() as u8,
            1 => self.high = (value.clamp(0.0, 127.0) + 0.5).floor() as u8,
            2 => self.outside = value.clamp(0.0, 1.0) >= 0.5,
            3 if value.fract() == 0.0 && (0.0..=2.0).contains(&value) => self.source = value as u8,
            4 if value == 0.0 || value == 1.0 => self.connected = value == 1.0,
            _ => return false,
        }
        true
    }

    pub fn source(&self) -> u8 {
        self.source
    }
    pub fn connected(&self) -> bool {
        self.connected
    }
    pub fn passes(&self, note: u8) -> bool {
        let inside = note >= self.low.min(self.high) && note <= self.low.max(self.high);
        inside != self.outside
    }
    pub fn begin_block(&mut self) {
        self.preview.fill(None);
    }

    /// Rejected voices retain their source identity but carry no gate or amplitude downstream.
    pub fn voice(&mut self, index: usize, input: MainVoiceSlot) -> MainVoiceSlot {
        let passes = self.passes(input.note);
        if self.connected && input.active {
            self.preview[index] = Some((input.note, passes));
        }
        if passes {
            input
        } else {
            MainVoiceSlot {
                active: false,
                gate: false,
                target_amp: 0.0,
                envelope_level: 0.0,
                phase: EnvelopePhase::Idle,
                ..input
            }
        }
    }

    /// 0: active input count; 1..16: input note/pass pairs; -1 for inactive inputs.
    pub fn status(&self, id: u32) -> f32 {
        if id == 0 {
            return self.preview.iter().filter(|entry| entry.is_some()).count() as f32;
        }
        let index = ((id - 1) / 2) as usize;
        self.preview
            .get(index)
            .and_then(|entry| *entry)
            .map_or(-1.0, |(note, passes)| {
                if (id - 1) % 2 == 0 {
                    note as f32
                } else if passes {
                    1.0
                } else {
                    0.0
                }
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reversed_limits_and_outside_mode_preserve_rejected_voice_identity() {
        let mut filter = MainNoteFilter::new();
        assert!(filter.set_parameter(4, 1.0));
        assert!(filter.set_parameter(0, 72.0));
        assert!(filter.set_parameter(1, 60.0));
        let input = MainVoiceSlot {
            active: true,
            gate: true,
            note: 61,
            target_amp: 0.3,
            stamp: 9,
            ..Default::default()
        };
        assert_eq!(filter.voice(0, input), input);
        assert_eq!(filter.status(2), 1.0);
        assert!(filter.set_parameter(2, 1.0));
        let blocked = filter.voice(0, input);
        assert_eq!((blocked.note, blocked.stamp), (61, 9));
        assert!(!blocked.active && !blocked.gate && blocked.target_amp == 0.0);
        assert_eq!(filter.status(2), 0.0);
        assert!(filter.set_parameter(1, 61.0));
        assert!(filter.set_parameter(0, 61.0));
        assert!(filter.passes(59));
        assert!(!filter.passes(61));
        assert!(!filter.set_parameter(3, 3.0));
        assert!(!filter.set_parameter(0, f32::NAN));
    }
}
