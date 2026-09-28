//! Main's voice-bundle Transpose stage, following transpose_runtime.lua.

use crate::main_voice_allocator::{MAIN_VOICE_COUNT, MainVoiceSlot};

pub struct MainTranspose {
    semitones: i8,
    source: u8,
    connected: bool,
    preview: [Option<(u8, u8)>; MAIN_VOICE_COUNT],
}

impl MainTranspose {
    pub fn new() -> Self {
        Self {
            semitones: 0,
            source: 1,
            connected: false,
            preview: [None; MAIN_VOICE_COUNT],
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.semitones = (value.clamp(-24.0, 24.0) + 0.5).floor() as i8,
            1 if value == 0.0 || value == 1.0 => self.source = value as u8,
            2 if value == 0.0 || value == 1.0 => self.connected = value == 1.0,
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
    pub fn note(&self, input: u8) -> u8 {
        (i16::from(input) + i16::from(self.semitones)).clamp(0, 127) as u8
    }
    pub fn begin_block(&mut self) {
        self.preview.fill(None);
    }

    pub fn voice(&mut self, index: usize, input: MainVoiceSlot) -> MainVoiceSlot {
        let output = self.note(input.note);
        if self.connected && input.active {
            self.preview[index] = Some((input.note, output));
        }
        MainVoiceSlot {
            note: output,
            ..input
        }
    }

    /// 0: active count; 1..16: input/output note pairs; -1 for inactive voices.
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
    fn rounded_shift_clamps_pitch_and_preserves_source_payload() {
        let mut transpose = MainTranspose::new();
        assert!(transpose.set_parameter(0, -2.5));
        assert_eq!(transpose.note(60), 58); // floor(value + 0.5), as in Lua
        assert!(transpose.set_parameter(0, 24.0));
        assert_eq!(transpose.note(120), 127);
        assert!(transpose.set_parameter(2, 1.0));
        let source = MainVoiceSlot {
            active: true,
            note: 60,
            gate: true,
            target_amp: 0.3,
            stamp: 4,
            ..Default::default()
        };
        let shifted = transpose.voice(0, source);
        assert_eq!(shifted.note, 84);
        assert_eq!(shifted.target_amp, source.target_amp);
        assert_eq!(shifted.stamp, source.stamp);
        assert_eq!(transpose.status(1), 60.0);
        assert_eq!(transpose.status(2), 84.0);
        assert!(transpose.set_parameter(1, 0.0));
        assert!(!transpose.set_parameter(1, 2.0));
        assert!(!transpose.set_parameter(0, f32::NAN));
    }
}
