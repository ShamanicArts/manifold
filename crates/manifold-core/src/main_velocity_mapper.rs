//! Main's per-voice amplitude mapper, following velocity_mapper_runtime.lua.

use crate::main_voice_allocator::{MAIN_VOICE_COUNT, MainVoiceSlot};

pub struct MainVelocityMapper {
    amount: f32,
    curve: u8,
    offset: f32,
    source: u8,
    connected: bool,
    preview: [Option<(f32, f32)>; MAIN_VOICE_COUNT],
}

impl MainVelocityMapper {
    pub fn new() -> Self {
        Self {
            amount: 1.0,
            curve: 0,
            offset: 0.0,
            source: 4,
            connected: false,
            preview: [None; MAIN_VOICE_COUNT],
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => self.amount = value.clamp(0.0, 1.0),
            1 if value.fract() == 0.0 && (0.0..=2.0).contains(&value) => self.curve = value as u8,
            2 => self.offset = value.clamp(-1.0, 1.0),
            3 if value.fract() == 0.0 && (0.0..=4.0).contains(&value) => self.source = value as u8,
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

    /// The historical runtime's Soft curve is smoothstep. Its UI graph used
    /// sqrt instead; the audio rule is authoritative for both sound and graph.
    pub fn map(&self, input: f32) -> f32 {
        let x = input.clamp(0.0, 1.0);
        if self.amount <= 0.0 {
            return x;
        }
        let shaped = match self.curve {
            1 => x * x * (3.0 - 2.0 * x),
            2 => x * x,
            _ => x,
        };
        (x * (1.0 - self.amount) + shaped * self.amount + self.offset * self.amount).clamp(0.0, 1.0)
    }

    pub fn begin_block(&mut self) {
        self.preview.fill(None);
    }

    pub fn voice(&mut self, index: usize, input: MainVoiceSlot) -> MainVoiceSlot {
        let output = self.map(input.target_amp);
        if self.connected && input.active {
            self.preview[index] = Some((input.target_amp, output));
        }
        MainVoiceSlot {
            target_amp: output,
            ..input
        }
    }

    /// 0: active count; 1..16: input/output amplitude pairs; -1 for inactive.
    pub fn status(&self, id: u32) -> f32 {
        if id == 0 {
            return self.preview.iter().filter(|entry| entry.is_some()).count() as f32;
        }
        let index = ((id - 1) / 2) as usize;
        self.preview
            .get(index)
            .and_then(|entry| *entry)
            .map_or(
                -1.0,
                |(input, output)| {
                    if (id - 1) % 2 == 0 { input } else { output }
                },
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_curves_blend_and_offset_without_changing_voice_identity() {
        let mut mapper = MainVelocityMapper::new();
        assert_eq!(mapper.map(0.25), 0.25);
        assert!(mapper.set_parameter(1, 1.0));
        assert!((mapper.map(0.25) - 0.15625).abs() < 1e-6);
        assert!(mapper.set_parameter(1, 2.0));
        assert!((mapper.map(0.25) - 0.0625).abs() < 1e-6);
        assert!(mapper.set_parameter(0, 0.5));
        assert!(mapper.set_parameter(2, 0.2));
        assert!((mapper.map(0.25) - 0.25625).abs() < 1e-6);
        assert!(mapper.set_parameter(4, 1.0));
        let input = MainVoiceSlot {
            active: true,
            gate: true,
            note: 61,
            target_amp: 0.25,
            stamp: 9,
            ..Default::default()
        };
        let output = mapper.voice(0, input);
        assert_eq!((output.note, output.gate, output.stamp), (61, true, 9));
        assert!((output.target_amp - 0.25625).abs() < 1e-6);
        assert_eq!(mapper.status(0), 1.0);
        assert_eq!(mapper.status(1), 0.25);
        assert!((mapper.status(2) - 0.25625).abs() < 1e-6);
        assert!(!mapper.set_parameter(1, 3.0));
        assert!(!mapper.set_parameter(0, f32::NAN));
    }
}
