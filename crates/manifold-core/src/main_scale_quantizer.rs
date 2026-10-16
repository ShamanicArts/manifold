//! Main's per-voice Scale Quantizer. Source note ownership stays with the voice allocator.

use crate::main_voice_allocator::{MAIN_VOICE_COUNT, MainVoiceSlot};
use crate::midi_scale_quantizer::quantize;

pub struct MainScaleQuantizer {
    root: u8,
    scale: u8,
    direction: u8,
    connected: bool,
    preview: [Option<(u8, u8)>; MAIN_VOICE_COUNT],
}

impl MainScaleQuantizer {
    pub fn new() -> Self {
        Self {
            root: 0,
            scale: 1,
            direction: 1,
            connected: false,
            preview: [None; MAIN_VOICE_COUNT],
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.root = (value.clamp(0.0, 11.0) + 0.5).floor() as u8,
            1 => self.scale = (value.clamp(1.0, 6.0) + 0.5).floor() as u8,
            2 => self.direction = (value.clamp(1.0, 3.0) + 0.5).floor() as u8,
            3 if value == 0.0 || value == 1.0 => self.connected = value == 1.0,
            _ => return false,
        }
        true
    }

    pub fn note(&self, input: u8) -> u8 {
        if self.connected {
            quantize(input, self.root, self.scale, self.direction)
        } else {
            input
        }
    }

    pub fn begin_block(&mut self) {
        self.preview.fill(None);
    }

    /// Copy the complete voice payload, changing only its pitch note.
    pub fn voice(&mut self, index: usize, input: MainVoiceSlot) -> MainVoiceSlot {
        let output_note = self.note(input.note);
        if self.connected && input.active {
            self.preview[index] = Some((input.note, output_note));
        }
        MainVoiceSlot {
            note: output_note,
            ..input
        }
    }

    /// 0: active count; 1..16: input/output note pairs, -1 for inactive voices.
    pub fn status(&self, id: u32) -> f32 {
        if id == 0 {
            return self.preview.iter().filter(|entry| entry.is_some()).count() as f32;
        }
        let index = ((id - 1) / 2) as usize;
        self.preview
            .get(index)
            .and_then(|entry| *entry)
            .map_or(-1.0, |(input, output)| {
                if (id - 1) % 2 == 0 {
                    input as f32
                } else {
                    output as f32
                }
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_each_voice_pitch_without_changing_ownership_or_amplitude() {
        let mut q = MainScaleQuantizer::new();
        assert!(q.set_parameter(3, 1.0));
        let first = MainVoiceSlot {
            active: true,
            note: 61,
            gate: true,
            target_amp: 0.23,
            stamp: 7,
            ..Default::default()
        };
        let second = MainVoiceSlot {
            active: true,
            note: 63,
            gate: true,
            target_amp: 0.14,
            stamp: 8,
            ..Default::default()
        };
        assert_eq!(q.voice(0, first).note, 60);
        assert_eq!(q.voice(1, second).note, 62);
        assert_eq!(q.status(0), 2.0);
        assert_eq!(q.status(1), 61.0);
        assert_eq!(q.status(2), 60.0);
        assert_eq!(q.voice(0, first).target_amp, 0.23);
        assert_eq!(q.voice(0, first).stamp, 7);
        assert!(q.set_parameter(2, 2.0));
        assert_eq!(q.voice(0, first).note, 62);
        assert!(q.set_parameter(3, 0.0));
        assert_eq!(q.voice(0, first), first);
        assert!(q.set_parameter(1, 7.0)); // legacy parameter clamp
        assert_eq!(q.note(61), 61); // still disconnected
        assert!(!q.set_parameter(2, f32::NAN));
    }
}
