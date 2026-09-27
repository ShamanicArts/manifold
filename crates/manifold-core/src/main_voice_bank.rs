//! Prepared, eight-voice Main wave/sample and Ring branches. The original UI's voice ownership is
//! preserved; per-sample ADSR timing is an explicit v2 change from its UI tick.

use crate::envelope::AdsrEnvelope;
use crate::envelope_follower::EnvelopeFollower;
use crate::events::EventKind;
use crate::main_directional::MainDirectionalMotion;
use crate::main_pitch::route_main_pitch;
use crate::main_voice_allocator::{EnvelopePhase, MAIN_VOICE_COUNT, MainVoiceAllocator};
use crate::oscillator::Oscillator;
use crate::phase_vocoder::PhaseVocoder;
use crate::phrase_gain::PhraseGain;
use crate::ring_modulator::RingModulator;
use crate::sample_region::{SampleRegion, ValidatedStereo};
use crate::sine_bank::{DEFAULTS as SINE_DEFAULTS, PartialSet, SineBank};
use crate::spectral_targets::{
    AddFlavor, MorphRecipe, SpectralShape, prepare_add_target, prepare_morph_target,
};
use crate::temporal_partials::{MAX_TEMPORAL_FRAMES, TemporalFrame, interpolate_temporal_frames};
use crate::wave_add_oscillator::{WaveAddOscillator, prepare_default_tables};

pub const MAX_MAIN_TEMPORAL_TARGETS: usize = 256;

#[derive(Clone, Copy)]
pub struct MainTemporalRecipe {
    pub smooth: f32,
    pub contrast: f32,
    pub shape: SpectralShape,
    pub add_flavor: AddFlavor,
    pub morph: MorphRecipe,
}

fn prepare_raw_temporal_target(
    frames: &[TemporalFrame],
    recipe: MainTemporalRecipe,
    wave: &PartialSet,
    position: f32,
    mode: u32,
) -> PartialSet {
    let source = interpolate_temporal_frames(frames, position, recipe.smooth, recipe.contrast);
    if mode == 4 {
        prepare_add_target(&source, recipe.shape, recipe.add_flavor)
    } else {
        prepare_morph_target(wave, &source, recipe.morph, recipe.shape)
    }
}

struct MainVoice {
    player: SampleRegion,
    oscillator: Oscillator,
    vocoder: PhaseVocoder,
    ring_sample_to_wave: RingModulator,
    ring_wave_to_sample: RingModulator,
    wave_add: SineBank,
    wave_add_oscillator: WaveAddOscillator,
    sample_add: SineBank,
    follower: EnvelopeFollower,
    phrase: PhraseGain,
    envelope: AdsrEnvelope,
    motion: MainDirectionalMotion,
}

pub struct MainVoiceBank {
    allocator: MainVoiceAllocator,
    voices: [MainVoice; MAIN_VOICE_COUNT],
    raw_left: Vec<f32>,
    raw_right: Vec<f32>,
    pitched_left: Vec<f32>,
    pitched_right: Vec<f32>,
    wave: Vec<f32>,
    ring_left: Vec<f32>,
    ring_right: Vec<f32>,
    add_wave_left: Vec<f32>,
    add_wave_right: Vec<f32>,
    add_sample_left: Vec<f32>,
    add_sample_right: Vec<f32>,
    add_left: Vec<f32>,
    add_right: Vec<f32>,
    sample_envelope: Vec<f32>,
    temporal_source_targets: Vec<PartialSet>,
    temporal_source_frames: Vec<TemporalFrame>,
    temporal_recipe: Option<MainTemporalRecipe>,
    wave_target: PartialSet,
    temporal_positions: [f32; MAIN_VOICE_COUNT],
    temporal_speed: f32,
    original_add_wave: bool,
    waveform: u32,
    blend: f32,
    root_note: f32,
    keytrack: u32,
    sample_pitch: f32,
    pitch_mode: u32,
    direction_mode: u32,
    depth: f32,
    wave_to_sample: f32,
    sample_to_wave: f32,
    retrigger: bool,
    master: f32,
    time_stretch: f32,
}

impl MainVoiceBank {
    pub fn new(sample_rate: f32, max_frames: usize, fft_order: u32) -> Self {
        let order = fft_order.clamp(9, 12);
        let mut add_wave_defaults = SINE_DEFAULTS;
        // The original Add oscillator is prepared at 220 Hz before note-on retunes it.
        add_wave_defaults[0] = 220.0;
        let wave_add_tables = prepare_default_tables();
        let voices = std::array::from_fn(|_| {
            let mut envelope = AdsrEnvelope::new(sample_rate);
            envelope.set_parameter(0, 0.005);
            envelope.set_parameter(1, 0.08);
            envelope.set_parameter(2, 0.8);
            envelope.set_parameter(3, 0.16);
            MainVoice {
                player: SampleRegion::new(sample_rate),
                oscillator: Oscillator::new(sample_rate, 261.62555, 0.0, 0),
                vocoder: PhaseVocoder::new(sample_rate, [0.0, 0.0, 1.0, 0.0, order as f32]),
                ring_sample_to_wave: RingModulator::new(sample_rate, [120.0, 0.0, 0.0, 0.0, 0.0]),
                ring_wave_to_sample: RingModulator::new(sample_rate, [120.0, 0.0, 0.0, 0.0, 0.0]),
                wave_add: SineBank::new(sample_rate, add_wave_defaults),
                wave_add_oscillator: WaveAddOscillator::new(sample_rate, wave_add_tables.clone()),
                sample_add: SineBank::new(sample_rate, SINE_DEFAULTS),
                follower: EnvelopeFollower::new(sample_rate, 8.0, 85.0),
                phrase: PhraseGain::new(sample_rate, 0.0, 0.2),
                envelope,
                motion: MainDirectionalMotion::new(sample_rate),
            }
        });
        Self {
            allocator: MainVoiceAllocator::default(),
            voices,
            raw_left: vec![0.0; max_frames],
            raw_right: vec![0.0; max_frames],
            pitched_left: vec![0.0; max_frames],
            pitched_right: vec![0.0; max_frames],
            wave: vec![0.0; max_frames],
            ring_left: vec![0.0; max_frames],
            ring_right: vec![0.0; max_frames],
            add_wave_left: vec![0.0; max_frames],
            add_wave_right: vec![0.0; max_frames],
            add_sample_left: vec![0.0; max_frames],
            add_sample_right: vec![0.0; max_frames],
            add_left: vec![0.0; max_frames],
            add_right: vec![0.0; max_frames],
            sample_envelope: vec![0.0; max_frames],
            temporal_source_targets: Vec::new(),
            temporal_source_frames: Vec::new(),
            temporal_recipe: None,
            wave_target: PartialSet::default(),
            temporal_positions: [0.0; MAIN_VOICE_COUNT],
            temporal_speed: 1.0,
            original_add_wave: false,
            waveform: 0,
            blend: 0.0,
            root_note: 60.0,
            keytrack: 2,
            sample_pitch: 0.0,
            pitch_mode: 0,
            direction_mode: 0,
            depth: 0.5,
            wave_to_sample: 0.5,
            sample_to_wave: 0.0,
            retrigger: true,
            master: 1.0,
            time_stretch: 1.0,
        }
    }

    pub fn load_stereo(&mut self, stereo: Vec<f32>, source_rate: f32) -> bool {
        let Some(source) = ValidatedStereo::from_stereo(stereo, source_rate) else { return false };
        self.load_validated(source);
        true
    }

    pub fn load_validated(&mut self, source: ValidatedStereo) {
        self.voices[0].player.load_validated(source);
        let (first, remaining) = self.voices.split_at_mut(1);
        for voice in remaining {
            voice.player.share_sample_from(&first[0].player);
        }
        self.temporal_source_targets.clear();
        self.temporal_source_frames.clear();
        self.temporal_recipe = None;
        self.panic();
    }

    /// A uniformly spaced, prepared source spectrum table. The control side
    /// builds every target; processing only selects and copies one per voice.
    pub fn load_temporal_source_targets(&mut self, targets: Vec<PartialSet>) -> bool {
        if targets.len() < 2
            || targets.len() > MAX_MAIN_TEMPORAL_TARGETS
            || targets.iter().any(|target| !target.validate())
        {
            return false;
        }
        self.temporal_source_targets = targets;
        self.temporal_source_frames.clear();
        self.temporal_recipe = None;
        self.temporal_positions.fill(0.0);
        true
    }

    /// Publish bounded raw source frames between callbacks. Only interpolation
    /// and recipe shaping run at the next voice block; extraction stays off-thread.
    pub fn load_temporal_source_frames(
        &mut self,
        frames: Vec<TemporalFrame>,
        recipe: MainTemporalRecipe,
    ) -> bool {
        if frames.len() < 2
            || frames.len() > MAX_TEMPORAL_FRAMES
            || !recipe.smooth.is_finite()
            || !(0.0..=1.0).contains(&recipe.smooth)
            || !recipe.contrast.is_finite()
            || !(0.0..=2.0).contains(&recipe.contrast)
            || !recipe.shape.stretch.is_finite()
            || !(0.0..=1.0).contains(&recipe.shape.stretch)
            || recipe.shape.tilt_mode > 2
            || !recipe.morph.position.is_finite()
            || !(0.0..=1.0).contains(&recipe.morph.position)
            || !recipe.morph.depth.is_finite()
            || !(0.0..=1.0).contains(&recipe.morph.depth)
            || recipe.morph.curve > 2
            || matches!(recipe.add_flavor, AddFlavor::Driven { waveform, pulse_width }
                if waveform > 7 || !pulse_width.is_finite()
                    || !(0.01..=0.99).contains(&pulse_width))
            || frames.iter().any(|frame| {
                !frame.position.is_finite()
                    || !(0.0..=1.0).contains(&frame.position)
                    || !frame.partials.validate()
            })
            || frames
                .windows(2)
                .any(|pair| pair[0].position >= pair[1].position)
        {
            return false;
        }
        self.temporal_source_frames = frames;
        self.temporal_recipe = Some(recipe);
        self.temporal_source_targets.clear();
        self.temporal_positions.fill(0.0);
        true
    }

    pub fn clear_temporal_source_targets(&mut self) {
        self.temporal_source_targets.clear();
        self.temporal_source_frames.clear();
        self.temporal_recipe = None;
    }

    pub fn set_temporal_speed(&mut self, speed: f32) -> bool {
        if !speed.is_finite() || !(0.0..=4.0).contains(&speed) {
            return false;
        }
        self.temporal_speed = speed;
        true
    }

    /// Target 0 is the authored wave recipe; target 1 is the analyzed source.
    /// Uploads happen between blocks and are validated before any voice changes.
    pub fn load_partials(&mut self, target: u32, partials: PartialSet) -> bool {
        if target > 1 || !partials.validate() {
            return false;
        }
        if target == 0 {
            self.wave_target = partials;
        }
        for voice in &mut self.voices {
            let bank = if target == 0 {
                &mut voice.wave_add
            } else {
                &mut voice.sample_add
            };
            bank.load_partials(partials);
        }
        if target == 1 {
            self.temporal_source_targets.clear();
            self.temporal_source_frames.clear();
            self.temporal_recipe = None;
        }
        true
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 => {
                self.waveform = value.round().clamp(0.0, 4.0) as u32;
                for voice in &mut self.voices {
                    voice.oscillator.set_parameter(0, self.waveform as f32);
                    voice.wave_add_oscillator.set_waveform(self.waveform);
                }
            }
            1 => self.blend = value.clamp(-1.0, 1.0),
            2 => self.root_note = value.clamp(0.0, 127.0),
            3 => self.keytrack = value.round().clamp(0.0, 2.0) as u32,
            4 => self.sample_pitch = value.clamp(-24.0, 24.0),
            5 => self.pitch_mode = value.round().clamp(0.0, 2.0) as u32,
            6 if (0.0..=5.0).contains(&value) && value.fract() == 0.0 => {
                self.direction_mode = value as u32;
                for voice in &mut self.voices {
                    voice.motion.set_parameter(
                        0,
                        if value == 2.0 || value == 3.0 {
                            value
                        } else {
                            0.0
                        },
                    );
                    if value != 1.0 {
                        voice
                            .ring_sample_to_wave
                            .reset_to([120.0, 0.0, 0.0, 0.0, 0.0]);
                        voice
                            .ring_wave_to_sample
                            .reset_to([120.0, 0.0, 0.0, 0.0, 0.0]);
                    }
                }
            }
            7 => self.depth = value.clamp(0.0, 1.0),
            8 => self.wave_to_sample = value.clamp(0.0, 1.0),
            9 => self.sample_to_wave = value.clamp(0.0, 1.0),
            10 => self.retrigger = value >= 0.5,
            11..=14 => {
                for voice in &mut self.voices {
                    voice.envelope.set_parameter(id - 11, value);
                }
            }
            15 => self.master = value.clamp(0.0, 2.0),
            16 => self.time_stretch = value.clamp(0.25, 4.0),
            17..=18 => {
                for voice in &mut self.voices {
                    voice.phrase.set_parameter(id - 17, value);
                }
            }
            19 => self.original_add_wave = value >= 0.5,
            _ => return false,
        }
        true
    }

    pub fn event(&mut self, event: EventKind) {
        match event {
            EventKind::NoteOn {
                note, velocity: 0, ..
            } => self.release(note),
            EventKind::NoteOn { note, velocity, .. } => {
                let index = self.allocator.note_on(note, velocity);
                self.temporal_positions[index] = 0.0;
                let raw_target = self
                    .temporal_recipe
                    .filter(|_| !self.temporal_source_frames.is_empty() && self.direction_mode >= 4)
                    .map(|recipe| {
                        prepare_raw_temporal_target(
                            &self.temporal_source_frames,
                            recipe,
                            &self.wave_target,
                            0.0,
                            self.direction_mode,
                        )
                    });
                let voice = &mut self.voices[index];
                let frequency = (440.0_f64 * 2.0_f64.powf((note as f64 - 69.0) / 12.0)) as f32;
                voice.envelope.reset();
                voice.wave_add.reset();
                voice.wave_add_oscillator.reset_phase();
                if let Some(first) = raw_target {
                    voice.sample_add.load_partials(first);
                } else if let Some(first) = self.temporal_source_targets.first() {
                    voice.sample_add.load_partials(*first);
                }
                voice.sample_add.reset();
                voice.follower.reset();
                voice.envelope.set_gate(true);
                voice.vocoder.reset();
                voice
                    .ring_sample_to_wave
                    .reset_to([120.0, 0.0, 0.0, 0.0, 0.0]);
                voice
                    .ring_wave_to_sample
                    .reset_to([120.0, 0.0, 0.0, 0.0, 0.0]);
                voice.motion.set_parameter(1, frequency);
                voice.motion.set_parameter(8, 1.0);
                voice
                    .oscillator
                    .set_parameter(2, self.allocator.slots()[index].target_amp);
                voice.player.set_parameter(7, 1.0);
            }
            EventKind::NoteOff { note, .. } => self.release(note),
            EventKind::AllNotesOff => self.panic(),
            EventKind::PitchBend { .. } => {}
        }
    }

    fn release(&mut self, note: u8) {
        self.allocator.note_off(note);
        for (slot, voice) in self.allocator.slots().iter().zip(&mut self.voices) {
            if slot.active && slot.note == note && !slot.gate {
                voice.envelope.set_gate(false);
                voice.motion.set_parameter(8, 0.0);
            }
        }
    }

    fn panic(&mut self) {
        self.allocator.panic();
        for voice in &mut self.voices {
            voice.envelope.reset();
            voice.wave_add.reset();
            voice.wave_add_oscillator.reset_phase();
            voice.sample_add.reset();
            voice.follower.reset();
            voice.player.set_parameter(6, 0.0);
            voice.oscillator.set_parameter(2, 0.0);
            voice.motion.set_parameter(8, 0.0);
            voice.vocoder.reset();
            voice
                .ring_sample_to_wave
                .reset_to([120.0, 0.0, 0.0, 0.0, 0.0]);
            voice
                .ring_wave_to_sample
                .reset_to([120.0, 0.0, 0.0, 0.0, 0.0]);
        }
    }

    /// Discard active voice state while keeping sample assets, spectral targets,
    /// temporal recipes, and the bank's current sound controls prepared.
    pub fn reset_processing(&mut self) {
        self.panic();
        self.temporal_positions.fill(0.0);
        for voice in &mut self.voices {
            voice.player.reset();
            voice.oscillator.set_parameter(1, 261.62555);
            voice.oscillator.reset();
            voice.motion.reset();
            voice.phrase.reset();
        }
    }

    pub fn meter(&self, band: usize) -> Option<f32> {
        match band {
            0 => Some(
                self.allocator
                    .slots()
                    .iter()
                    .filter(|slot| slot.active)
                    .count() as f32,
            ),
            1..=MAIN_VOICE_COUNT => Some(if self.allocator.slots()[band - 1].active {
                self.voices[band - 1].player.meter(0).unwrap_or(0.0)
            } else {
                -1.0
            }),
            _ => None,
        }
    }

    pub fn process_planar(&mut self, output: [&mut [f32]; 2]) {
        let [left, right] = output;
        let frames = left.len();
        debug_assert_eq!(frames, right.len());
        debug_assert!(frames <= self.raw_left.len());
        left.fill(0.0);
        right.fill(0.0);
        let t = (self.blend + 1.0) * 0.5;
        let wave_gain = (std::f32::consts::FRAC_PI_2 * t).cos();
        let sample_gain = (std::f32::consts::FRAC_PI_2 * t).sin();
        for index in 0..MAIN_VOICE_COUNT {
            let slot = self.allocator.slots()[index];
            if !slot.active {
                continue;
            }
            let voice = &mut self.voices[index];
            let note_frequency =
                (440.0_f64 * 2.0_f64.powf((slot.note as f64 - 69.0) / 12.0)) as f32;
            let pitch = route_main_pitch(
                note_frequency,
                self.root_note,
                self.keytrack,
                self.sample_pitch,
                self.pitch_mode,
            );
            for (id, value) in [
                (3, self.depth),
                (4, self.wave_to_sample),
                (5, self.sample_to_wave),
                (6, f32::from(self.retrigger)),
                (7, self.blend),
            ] {
                voice.motion.set_parameter(id, value);
            }
            let position = voice.player.legacy_normalized_position();
            if self.direction_mode >= 4
                && (!self.temporal_source_targets.is_empty()
                    || !self.temporal_source_frames.is_empty())
            {
                if self.temporal_speed > 0.001 {
                    self.temporal_positions[index] = (position * self.temporal_speed).fract();
                }
                if let Some(recipe) = self
                    .temporal_recipe
                    .filter(|_| !self.temporal_source_frames.is_empty())
                {
                    let target = prepare_raw_temporal_target(
                        &self.temporal_source_frames,
                        recipe,
                        &self.wave_target,
                        self.temporal_positions[index],
                        self.direction_mode,
                    );
                    voice.sample_add.load_partials(target);
                } else {
                    let target_index = (self.temporal_positions[index]
                        * (self.temporal_source_targets.len() - 1) as f32)
                        .round() as usize;
                    voice
                        .sample_add
                        .load_partials(self.temporal_source_targets[target_index]);
                }
            }
            let directional = voice
                .motion
                .tick_with_speed(frames, position, pitch.sample_speed);
            let wave_frequency = pitch.wave_after_modulation(
                directional.map_or(note_frequency, |update| update.oscillator_frequency),
                note_frequency,
                self.keytrack,
            );
            voice.oscillator.set_parameter(1, wave_frequency);
            voice
                .oscillator
                .set_parameter(3, f32::from(directional.is_some_and(|u| u.sync_enabled)));
            voice.player.set_parameter(
                0,
                directional.map_or(pitch.sample_speed, |u| u.sample_speed),
            );
            if let Some(update) = directional {
                if update.sample_retrigger {
                    voice.player.set_parameter(7, 1.0);
                }
                if update.sample_play {
                    voice.player.set_parameter(6, 1.0);
                }
            }
            voice.vocoder.set_parameter(0, pitch.vocoder_mode as f32);
            voice.vocoder.set_parameter(1, pitch.vocoder_semitones);
            voice.vocoder.set_parameter(2, self.time_stretch);
            voice.vocoder.set_parameter(3, pitch.vocoder_mix);
            for frame in 0..frames {
                let sample = voice.player.process_sample();
                // The original SampleRegionPlaybackNode centers its single
                // unison voice before the vocoder and the envelope tap.
                let centered = [
                    sample[0] * std::f32::consts::FRAC_1_SQRT_2,
                    sample[1] * std::f32::consts::FRAC_1_SQRT_2,
                ];
                self.raw_left[frame] = centered[0];
                self.raw_right[frame] = centered[1];
                if self.direction_mode >= 4 {
                    self.sample_envelope[frame] = voice.follower.process_sample(centered);
                }
            }
            voice.vocoder.process_planar(
                [&self.raw_left[..frames], &self.raw_right[..frames]],
                [
                    &mut self.pitched_left[..frames],
                    &mut self.pitched_right[..frames],
                ],
            );
            let amp = slot.target_amp;
            for frame in 0..frames {
                self.wave[frame] = voice.oscillator.process_sample(Some(self.raw_left[frame]));
                self.pitched_left[frame] *= 2.0 * amp;
                self.pitched_right[frame] *= 2.0 * amp;
            }
            if self.direction_mode == 1 {
                let root_frequency =
                    440.0_f64 * 2.0_f64.powf((self.root_note as f64 - 69.0) / 12.0);
                let sample_frequency =
                    (root_frequency * pitch.desired_sample_ratio as f64).clamp(20.0, 8000.0) as f32;
                for (ring, frequency, spread) in [
                    (
                        &mut voice.ring_sample_to_wave,
                        wave_frequency,
                        self.wave_to_sample,
                    ),
                    (
                        &mut voice.ring_wave_to_sample,
                        sample_frequency,
                        self.sample_to_wave,
                    ),
                ] {
                    ring.set_parameter(0, frequency);
                    ring.set_parameter(1, self.depth);
                    ring.set_parameter(2, 1.0);
                    ring.set_parameter(3, spread * 180.0);
                    ring.set_parameter(4, 1.0);
                }
                voice.ring_sample_to_wave.process_planar(
                    [&self.wave[..frames], &self.wave[..frames]],
                    Some([&self.pitched_left[..frames], &self.pitched_right[..frames]]),
                    [&mut self.raw_left[..frames], &mut self.raw_right[..frames]],
                );
                voice.ring_wave_to_sample.process_planar(
                    [&self.pitched_left[..frames], &self.pitched_right[..frames]],
                    Some([&self.wave[..frames], &self.wave[..frames]]),
                    [
                        &mut self.ring_left[..frames],
                        &mut self.ring_right[..frames],
                    ],
                );
            }
            if self.direction_mode >= 4 {
                let root_frequency =
                    440.0_f64 * 2.0_f64.powf((self.root_note as f64 - 69.0) / 12.0);
                let sample_frequency =
                    (root_frequency * pitch.desired_sample_ratio as f64).clamp(20.0, 8000.0) as f32;
                let morph_frequency = wave_frequency + (sample_frequency - wave_frequency) * t;
                if self.direction_mode == 4 {
                    if self.original_add_wave {
                        voice.wave_add_oscillator.set_frequency(wave_frequency);
                        voice.wave_add_oscillator.set_amplitude(amp * 2.0);
                        for frame in 0..frames {
                            let sample = voice.wave_add_oscillator.process_sample();
                            self.add_wave_left[frame] = sample;
                            self.add_wave_right[frame] = sample;
                        }
                    } else {
                        voice.wave_add.set_parameter(0, wave_frequency);
                        voice.wave_add.set_parameter(1, amp * 2.0);
                        voice.wave_add.process_planar(
                            None,
                            [
                                &mut self.add_wave_left[..frames],
                                &mut self.add_wave_right[..frames],
                            ],
                        );
                    }
                }
                voice.sample_add.set_parameter(
                    0,
                    if self.direction_mode == 5 {
                        morph_frequency
                    } else {
                        sample_frequency
                    },
                );
                voice.sample_add.set_parameter(1, amp * 2.0);
                voice.sample_add.process_planar(
                    None,
                    [
                        &mut self.add_sample_left[..frames],
                        &mut self.add_sample_right[..frames],
                    ],
                );
                for frame in 0..frames {
                    if self.direction_mode == 5 {
                        self.add_left[frame] = self.add_sample_left[frame];
                        self.add_right[frame] = self.add_sample_right[frame];
                    } else {
                        self.add_left[frame] = self.add_wave_left[frame] * wave_gain
                            + self.add_sample_left[frame] * sample_gain;
                        self.add_right[frame] = self.add_wave_right[frame] * wave_gain
                            + self.add_sample_right[frame] * sample_gain;
                    }
                }
                voice.phrase.process_planar(
                    [&self.add_left[..frames], &self.add_right[..frames]],
                    &self.sample_envelope[..frames],
                    [
                        &mut self.add_wave_left[..frames],
                        &mut self.add_wave_right[..frames],
                    ],
                );
            }
            for frame in 0..frames {
                let envelope = voice.envelope.process_sample();
                let scaling = envelope * self.master * 0.5;
                if self.direction_mode == 1 {
                    left[frame] += (self.raw_left[frame] * wave_gain
                        + self.ring_left[frame] * sample_gain)
                        * scaling;
                    right[frame] += (self.raw_right[frame] * wave_gain
                        + self.ring_right[frame] * sample_gain)
                        * scaling;
                } else {
                    let base_gain = if self.direction_mode >= 4 {
                        1.0 - self.depth
                    } else {
                        1.0
                    };
                    let add_left = if self.direction_mode >= 4 {
                        self.add_wave_left[frame] * self.depth
                    } else {
                        0.0
                    };
                    let add_right = if self.direction_mode >= 4 {
                        self.add_wave_right[frame] * self.depth
                    } else {
                        0.0
                    };
                    left[frame] += ((self.wave[frame] * wave_gain
                        + self.pitched_left[frame] * sample_gain)
                        * base_gain
                        + add_left)
                        * scaling;
                    right[frame] += ((self.wave[frame] * wave_gain
                        + self.pitched_right[frame] * sample_gain)
                        * base_gain
                        + add_right)
                        * scaling;
                }
            }
            let phase = if voice.envelope.is_idle() {
                EnvelopePhase::Idle
            } else if voice.envelope.is_releasing() {
                EnvelopePhase::Release
            } else {
                EnvelopePhase::Sustain
            };
            self.allocator
                .report_envelope(index, phase, voice.envelope.level());
            if !self.allocator.slots()[index].active {
                voice.player.set_parameter(6, 0.0);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reset_silences_held_main_voice_and_retains_wave_controls() {
        let mut bank = MainVoiceBank::new(8_000.0, 128, 9);
        assert!(bank.set_parameter(0, 1.0));
        assert!(bank.set_parameter(1, -1.0));
        let note = EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        };
        bank.event(note);
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..8 {
            bank.process_planar([&mut left, &mut right]);
        }
        assert!(left.iter().any(|sample| sample.abs() > 0.0));
        bank.reset_processing();
        assert_eq!(bank.meter(0), Some(0.0));
        bank.process_planar([&mut left, &mut right]);
        assert_eq!(left, [0.0; 128]);
        assert_eq!(right, [0.0; 128]);
        let mut fresh = MainVoiceBank::new(8_000.0, 128, 9);
        assert!(fresh.set_parameter(0, 1.0));
        assert!(fresh.set_parameter(1, -1.0));
        bank.event(note);
        fresh.event(note);
        let mut expected_left = [0.0; 128];
        let mut expected_right = [0.0; 128];
        bank.process_planar([&mut left, &mut right]);
        fresh.process_planar([&mut expected_left, &mut expected_right]);
        assert_eq!(left, expected_left);
        assert_eq!(right, expected_right);
    }
    use crate::sine_bank::Partial;

    fn target(harmonics: &[(f32, f32)]) -> PartialSet {
        let mut set = PartialSet {
            fundamental: 1.0,
            count: harmonics.len(),
            ..PartialSet::default()
        };
        for (index, &(frequency, amplitude)) in harmonics.iter().enumerate() {
            set.partials[index] = Partial {
                frequency,
                amplitude,
                phase: 0.0,
                decay_rate: 0.0,
            };
        }
        set
    }

    #[test]
    fn sample_player_center_pan_precedes_the_voice_branches() {
        let mut bank = MainVoiceBank::new(8_000.0, 128, 9);
        assert!(bank.load_stereo(vec![0.5; 8_000 * 2], 8_000.0));
        bank.set_parameter(1, 1.0);
        bank.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        bank.process_planar([&mut left, &mut right]);
        let expected = 0.5 * std::f32::consts::FRAC_1_SQRT_2;
        assert!((bank.raw_left[0] - expected).abs() < 1e-7);
        assert!((bank.raw_right[0] - expected).abs() < 1e-7);
    }

    #[test]
    fn add_morph_targets_are_independent_and_depth_zero_keeps_the_base() {
        let render = |mode, depth, source: PartialSet| {
            let mut bank = MainVoiceBank::new(8_000.0, 128, 9);
            assert!(bank.load_stereo(vec![0.5; 8_000 * 2], 8_000.0));
            assert!(bank.load_partials(0, target(&[(1.0, 1.0), (2.0, 0.3)])));
            assert!(bank.load_partials(1, source));
            assert!(!bank.load_partials(2, target(&[(1.0, 1.0)])));
            bank.set_parameter(1, 0.0);
            bank.set_parameter(6, mode);
            bank.set_parameter(7, depth);
            for note in [60, 67] {
                bank.event(EventKind::NoteOn {
                    channel: 0,
                    note,
                    velocity: 100,
                });
            }
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            for _ in 0..8 {
                bank.process_planar([&mut left, &mut right]);
            }
            (left, right)
        };
        let source = target(&[(1.0, 1.0), (3.0, 0.4)]);
        let (base, _) = render(0.0, 0.0, source);
        let (dry_add, _) = render(4.0, 0.0, source);
        let (add, _) = render(4.0, 1.0, source);
        let (morph, _) = render(5.0, 1.0, source);
        let (changed, _) = render(5.0, 1.0, target(&[(1.0, 1.0), (4.0, 0.4)]));
        assert!(base.iter().zip(dry_add).all(|(a, b)| (a - b).abs() < 1e-6));
        assert!(base.iter().zip(add).any(|(a, b)| (a - b).abs() > 0.01));
        assert!(morph.iter().zip(changed).any(|(a, b)| (a - b).abs() > 0.01));
        assert!(morph.iter().zip(base).any(|(a, b)| (a - b).abs() > 0.01));
    }

    #[test]
    fn temporal_targets_follow_each_voice_and_manual_upload_disables_follow() {
        let mut bank = MainVoiceBank::new(8_000.0, 128, 9);
        assert!(bank.load_stereo(vec![0.5; 4_096 * 2], 8_000.0));
        assert!(bank.load_partials(1, target(&[(1.0, 1.0)])));
        assert!(
            bank.load_temporal_source_targets(vec![target(&[(1.0, 1.0)]), target(&[(3.0, 1.0)]),])
        );
        assert!(!bank.load_temporal_source_targets(vec![PartialSet::default()]));
        assert_eq!(bank.temporal_source_targets.len(), 2);
        assert!(bank.set_temporal_speed(1.0));
        assert!(!bank.set_temporal_speed(f32::NAN));
        bank.set_parameter(1, 1.0);
        bank.set_parameter(6, 4.0);
        bank.set_parameter(7, 1.0);
        bank.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..8 {
            bank.process_planar([&mut left, &mut right]);
        }
        bank.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 127,
        });
        for _ in 0..14 {
            bank.process_planar([&mut left, &mut right]);
        }
        assert!(bank.temporal_positions[0] > 0.5);
        assert!(bank.temporal_positions[1] < 0.5);
        assert!(left.iter().any(|sample| sample.abs() > 0.01));
        assert!(bank.load_partials(1, target(&[(2.0, 1.0)])));
        assert!(bank.temporal_source_targets.is_empty());
    }

    #[test]
    fn entering_add_or_morph_clears_previous_fm_sync_motion() {
        let mut bank = MainVoiceBank::new(8_000.0, 128, 9);
        for (previous, next) in [(2.0, 4.0), (3.0, 5.0)] {
            assert!(bank.set_parameter(6, previous));
            assert!(bank.voices.iter().all(|voice| voice.motion.active()));
            assert!(bank.set_parameter(6, next));
            assert!(bank.voices.iter().all(|voice| !voice.motion.active()));
        }
    }

    #[test]
    fn chords_release_independently_and_duplicate_notes_share_release() {
        let mut bank = MainVoiceBank::new(8_000.0, 128, 9);
        assert!(bank.load_stereo(vec![0.5; 8_000 * 2], 8_000.0));
        bank.set_parameter(1, 1.0);
        for note in [60, 64, 67] {
            bank.event(EventKind::NoteOn {
                channel: 0,
                note,
                velocity: 100,
            });
        }
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        bank.process_planar([&mut left, &mut right]);
        assert_eq!(bank.meter(0), Some(3.0));
        assert!(left.iter().any(|x| *x > 0.0));
        bank.event(EventKind::NoteOff {
            channel: 0,
            note: 64,
        });
        for _ in 0..12 {
            bank.process_planar([&mut left, &mut right]);
        }
        assert_eq!(bank.meter(0), Some(2.0));
        bank.event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        });
        assert_eq!(bank.meter(0), Some(3.0));
        bank.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        for _ in 0..12 {
            bank.process_planar([&mut left, &mut right]);
        }
        assert_eq!(bank.meter(0), Some(1.0));
        bank.event(EventKind::AllNotesOff);
        bank.process_planar([&mut left, &mut right]);
        assert!(left.iter().all(|x| *x == 0.0));
    }

    #[test]
    fn ninth_note_uses_original_oldest_slot_rule() {
        let mut bank = MainVoiceBank::new(8_000.0, 128, 9);
        for note in 60..69 {
            bank.event(EventKind::NoteOn {
                channel: 0,
                note,
                velocity: 100,
            });
        }
        assert_eq!(bank.meter(0), Some(8.0));
        assert_eq!(bank.allocator.slots()[0].note, 68);
        bank.event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        assert!(bank.allocator.slots()[0].gate);
    }

    #[test]
    fn ring_uses_both_live_sources_and_depth_changes_the_held_note() {
        let render = |mode: f32, depth: f32| {
            let mut bank = MainVoiceBank::new(8_000.0, 128, 9);
            assert!(bank.load_stereo(vec![0.5; 8_000 * 2], 8_000.0));
            bank.set_parameter(0, 1.0);
            bank.set_parameter(1, 0.0);
            bank.set_parameter(6, mode);
            bank.set_parameter(7, depth);
            bank.event(EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            });
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            for _ in 0..8 {
                bank.process_planar([&mut left, &mut right]);
            }
            (left, right)
        };
        let (base_l, base_r) = render(0.0, 0.0);
        let (dry_ring_l, dry_ring_r) = render(1.0, 0.0);
        let (wet_ring_l, wet_ring_r) = render(1.0, 1.0);
        assert!(
            base_l
                .iter()
                .zip(&dry_ring_l)
                .all(|(a, b)| (a - b).abs() < 1e-6)
        );
        assert!(
            base_r
                .iter()
                .zip(&dry_ring_r)
                .all(|(a, b)| (a - b).abs() < 1e-6)
        );
        assert!(
            base_l
                .iter()
                .zip(&wet_ring_l)
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        assert!(
            base_r
                .iter()
                .zip(&wet_ring_r)
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
    }
}
