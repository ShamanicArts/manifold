//! Main voice note and sample-pitch mapping from the original sample synth.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainPitchRoute {
    pub wave_frequency: f32,
    pub desired_sample_ratio: f32,
    pub sample_speed: f32,
    pub vocoder_semitones: f32,
    pub vocoder_mix: f32,
    pub vocoder_mode: u32,
}

/// `keytrack`: 0 wave, 1 sample, 2 both. `pitch_mode`: 0 classic, 1 vocoder,
/// 2 high-quality vocoder. The caller clamps the voice frequency to its
/// existing oscillator range before passing it here.
pub fn route_main_pitch(
    voice_frequency: f32,
    root_note: f32,
    keytrack: u32,
    sample_pitch_semitones: f32,
    pitch_mode: u32,
) -> MainPitchRoute {
    let frequency = if voice_frequency.is_finite() {
        voice_frequency.clamp(20.0, 8000.0)
    } else {
        220.0
    };
    let root_note = if root_note.is_finite() {
        root_note
    } else {
        60.0
    };
    let root_frequency = 440.0_f64 * 2.0_f64.powf((root_note as f64 - 69.0) / 12.0);
    let pitch = if sample_pitch_semitones.is_finite() {
        sample_pitch_semitones.clamp(-24.0, 24.0)
    } else {
        0.0
    };
    let pitch_ratio = 2.0_f64.powf(pitch as f64 / 12.0);
    let key_ratio = if keytrack >= 1 {
        (frequency as f64 / root_frequency).clamp(0.05, 8.0)
    } else {
        1.0
    };
    let desired = (key_ratio * pitch_ratio).clamp(0.05, 8.0);
    let wave_frequency = match keytrack {
        1 => root_frequency as f32,
        2 => (frequency as f64 * pitch_ratio) as f32,
        _ => frequency,
    };
    let vocoder_active = matches!(pitch_mode, 1 | 2);
    let desired_semitones = 12.0 * desired.log2();
    let vocoder_semitones = if vocoder_active {
        desired_semitones.clamp(-24.0, 24.0) as f32
    } else {
        0.0
    };
    let coarse_semitones = desired_semitones - vocoder_semitones as f64;
    let sample_speed = if vocoder_active {
        2.0_f64.powf(coarse_semitones / 12.0).clamp(0.05, 8.0) as f32
    } else {
        desired as f32
    };
    MainPitchRoute {
        wave_frequency,
        desired_sample_ratio: desired as f32,
        sample_speed,
        vocoder_semitones,
        vocoder_mix: if vocoder_active { 1.0 } else { 0.0 },
        vocoder_mode: if pitch_mode == 2 { 1 } else { 0 },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classic_sample_keytrack_uses_note_ratio() {
        let route = route_main_pitch(440.0, 69.0, 1, 12.0, 0);
        assert_eq!(route.wave_frequency, 440.0);
        assert_eq!(route.sample_speed, 2.0);
        assert_eq!(route.vocoder_mix, 0.0);
    }

    #[test]
    fn vocoder_carries_pitch_until_its_twenty_four_semitone_limit() {
        let route = route_main_pitch(1760.0, 69.0, 2, 12.0, 2);
        assert_eq!(route.wave_frequency, 3520.0);
        assert_eq!(route.desired_sample_ratio, 8.0);
        assert_eq!(route.sample_speed, 2.0);
        assert_eq!(route.vocoder_semitones, 24.0);
        assert_eq!(route.vocoder_mode, 1);
    }
}
