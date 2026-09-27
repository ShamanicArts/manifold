//! Main's synth-to-looper routing, with all scratch prepared before processing.

use crate::Filter;
use crate::effect_slot::{self, EffectSlot};
use crate::eq8::{self, Eq8};
use crate::events::EventKind;
use crate::main_lfo::{LfoOutputs, MainLfo};
use crate::main_looper::LAYERS;
use crate::main_looper::MainLooper;
use crate::main_sample_capture::MainSampleCapture;
use crate::main_voice_bank::MainVoiceBank;
use crate::sample_region::ValidatedStereo;

pub struct MainInstrument {
    looper: MainLooper,
    synth: MainVoiceBank,
    filter: Filter,
    lfo: MainLfo,
    modulation: MainModulationRoute,
    filter_cutoff_base: f32,
    filter_resonance_base: f32,
    filter_cutoff_effective: f32,
    filter_resonance_effective: f32,
    fx1: EffectSlot,
    fx2: EffectSlot,
    eq: Eq8,
    sample_capture: MainSampleCapture,
    layer_taps: [Vec<f32>; LAYERS],
    sample_rate: f32,
    synth_left: Vec<f32>,
    synth_right: Vec<f32>,
    filtered_left: Vec<f32>,
    filtered_right: Vec<f32>,
    fx1_left: Vec<f32>,
    fx1_right: Vec<f32>,
    fx2_left: Vec<f32>,
    fx2_right: Vec<f32>,
    equalized_left: Vec<f32>,
    equalized_right: Vec<f32>,
    capture_left: Vec<f32>,
    capture_right: Vec<f32>,
    monitor_left: Vec<f32>,
    monitor_right: Vec<f32>,
}

/// One typed scalar connection from Main's LFO outputs to a continuous
/// Filter parameter. IDs 22/23 are the stable Main parameter contract.
#[derive(Clone, Copy)]
struct MainModulationRoute {
    source: u32,
    target: u32,
    amount: f32,
    bias: f32,
    mode: u32,
    enabled: bool,
}

impl Default for MainModulationRoute {
    fn default() -> Self {
        Self {
            source: 0,
            target: 0,
            amount: 0.05,
            bias: 0.0,
            mode: 0,
            enabled: false,
        }
    }
}

impl MainModulationRoute {
    fn set(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id {
            0 if (0.0..=3.0).contains(&value) && value.fract() == 0.0 => self.source = value as u32,
            1 if (value == 0.0 || value == 22.0 || value == 23.0) => self.target = value as u32,
            2 if (-1.0..=1.0).contains(&value) => self.amount = value,
            3 if (-1.0..=1.0).contains(&value) => self.bias = value,
            4 if value == 0.0 || value == 1.0 => self.mode = value as u32,
            5 if value == 0.0 || value == 1.0 => self.enabled = value == 1.0,
            _ => return false,
        }
        true
    }

    fn effective(self, base: f32, outputs: LfoOutputs) -> f32 {
        if !self.enabled || self.target == 0 {
            return base;
        }
        let (source, neutral) = match self.source {
            0 => ((outputs.out + 1.0) * 0.5, 0.5),
            1 => ((outputs.inv + 1.0) * 0.5, 0.5),
            2 => (outputs.uni, 0.0),
            _ => (outputs.eoc, 0.0),
        };
        let (min, max): (f32, f32) = if self.target == 22 {
            (80.0, 16_000.0)
        } else {
            (0.1, 2.0)
        };
        let mapped = if self.mode == 1 {
            let t = (source * self.amount + self.bias).clamp(0.0, 1.0);
            if self.target == 22 {
                min * (max / min).powf(t)
            } else {
                min + t * (max - min)
            }
        } else {
            base + (source + self.bias - neutral) * (max - min) * self.amount
        };
        mapped.clamp(min, max)
    }
}

impl MainInstrument {
    pub fn new(sample_rate: f32, max_frames: usize) -> Self {
        Self {
            looper: MainLooper::new(sample_rate),
            synth: MainVoiceBank::new(sample_rate, max_frames, 9),
            filter: Filter::new(sample_rate),
            lfo: MainLfo::new(sample_rate),
            modulation: MainModulationRoute::default(),
            filter_cutoff_base: 3200.0,
            filter_resonance_base: 0.75,
            filter_cutoff_effective: 3200.0,
            filter_resonance_effective: 0.75,
            fx1: EffectSlot::new_legacy(
                sample_rate,
                max_frames,
                0,
                0.0,
                effect_slot::DEFAULT_TYPE_PARAMETERS[0],
            ),
            fx2: EffectSlot::new_legacy(
                sample_rate,
                max_frames,
                0,
                0.0,
                effect_slot::DEFAULT_TYPE_PARAMETERS[0],
            ),
            eq: Eq8::new(sample_rate, eq8::defaults()),
            sample_capture: MainSampleCapture::new(sample_rate),
            layer_taps: std::array::from_fn(|_| vec![0.0; max_frames * 2]),
            sample_rate,
            synth_left: vec![0.0; max_frames],
            synth_right: vec![0.0; max_frames],
            filtered_left: vec![0.0; max_frames],
            filtered_right: vec![0.0; max_frames],
            fx1_left: vec![0.0; max_frames],
            fx1_right: vec![0.0; max_frames],
            fx2_left: vec![0.0; max_frames],
            fx2_right: vec![0.0; max_frames],
            equalized_left: vec![0.0; max_frames],
            equalized_right: vec![0.0; max_frames],
            capture_left: vec![0.0; max_frames],
            capture_right: vec![0.0; max_frames],
            monitor_left: vec![0.0; max_frames],
            monitor_right: vec![0.0; max_frames],
        }
    }

    pub fn looper(&self) -> &MainLooper {
        &self.looper
    }

    pub fn looper_mut(&mut self) -> &mut MainLooper {
        &mut self.looper
    }

    pub fn set_synth_parameter(&mut self, id: u32, value: f32) -> bool {
        match id {
            21 => self.filter.set_parameter(0, value),
            22 if value.is_finite() => {
                self.filter_cutoff_base = value.clamp(80.0, 16_000.0);
                self.filter.set_parameter(1, self.filter_cutoff_base)
            }
            23 if value.is_finite() => {
                self.filter_resonance_base = value.clamp(0.1, 2.0);
                self.filter.set_parameter(2, self.filter_resonance_base)
            }
            64..=105 => self.eq.set_parameter(id - 64, value),
            128..=134 => self.fx1.set_parameter(id - 128, value),
            136..=142 => self.fx2.set_parameter(id - 136, value),
            _ => self.synth.set_parameter(id, value),
        }
    }

    pub fn set_lfo_parameter(&mut self, id: u32, value: f32) -> bool {
        self.lfo.set_parameter(id, value)
    }

    pub fn set_lfo_gate(&mut self, id: u32, high: bool) -> bool {
        self.lfo.set_gate(id, high)
    }

    pub fn set_modulation_route(&mut self, id: u32, value: f32) -> bool {
        self.modulation.set(id, value)
    }

    pub fn lfo_status(&self, id: u32) -> f32 {
        let outputs = self.lfo.outputs();
        match id {
            0 => outputs.phase,
            1 => outputs.out,
            2 => outputs.inv,
            3 => outputs.uni,
            4 => outputs.eoc,
            5 => self.filter_cutoff_effective,
            6 => self.filter_resonance_effective,
            _ => 0.0,
        }
    }

    pub fn eq_response_db_at(&self, frequency: f32) -> Option<f32> {
        self.eq.response_db_at(frequency)
    }

    pub fn synth_event(&mut self, event: EventKind) {
        self.synth.event(event);
    }

    pub fn request_sample_source(&mut self, source: usize, bars: f32) -> usize {
        if !bars.is_finite() || !(0.0625..=16.0).contains(&bars) {
            return 0;
        }
        let frames = (bars * self.looper.samples_per_bar()).round() as usize;
        let frames = frames.min(self.sample_capture.capacity());
        if self.sample_capture.request(source, frames) {
            frames
        } else {
            0
        }
    }

    pub fn start_free_sample(&mut self, source: usize) -> bool {
        self.sample_capture.start_free(source)
    }

    pub fn finish_free_sample(&mut self) -> usize {
        self.sample_capture.finish_free()
    }

    pub fn cancel_free_sample(&mut self) {
        self.sample_capture.cancel_free();
    }

    pub fn free_sample_source(&self) -> Option<usize> {
        self.sample_capture.free_source()
    }

    pub fn free_sample_elapsed_frames(&self) -> usize {
        self.sample_capture.free_elapsed_frames()
    }

    pub fn sample_progress(&self) -> (usize, usize) {
        self.sample_capture.progress()
    }

    pub fn sample_captured_frames(&self, source: usize) -> usize {
        self.sample_capture.captured_frames(source)
    }

    pub fn copy_sample_chunk(&self, offset: usize, destination: &mut [f32]) -> bool {
        self.sample_capture.copy_frozen_chunk(offset, destination)
    }

    pub fn release_sample(&mut self) {
        self.sample_capture.release();
    }

    pub fn load_validated_sample(&mut self, sample: ValidatedStereo) {
        self.synth.load_validated(sample);
    }

    pub fn clear_sample_source(&mut self) {
        self.synth.clear_sample();
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    pub fn synth_sample_frames(&self) -> usize {
        self.synth.sample_frames()
    }

    pub fn synth_sample_peak(&self, start: usize, end: usize) -> f32 {
        self.synth.sample_peak(start, end)
    }

    pub fn copy_synth_sample_interleaved(
        &self,
        start_frame: usize,
        destination: &mut [f32],
    ) -> usize {
        self.synth.copy_sample_interleaved(start_frame, destination)
    }

    pub fn process(&mut self, dry: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let frames = dry[0].len();
        assert_eq!(dry[1].len(), frames);
        assert!(frames <= self.synth_left.len());
        let lfo = self.lfo.advance(frames);
        self.filter_cutoff_effective = if self.modulation.target == 22 {
            self.modulation.effective(self.filter_cutoff_base, lfo)
        } else {
            self.filter_cutoff_base
        };
        self.filter_resonance_effective = if self.modulation.target == 23 {
            self.modulation.effective(self.filter_resonance_base, lfo)
        } else {
            self.filter_resonance_base
        };
        self.filter.set_parameter(1, self.filter_cutoff_effective);
        self.filter
            .set_parameter(2, self.filter_resonance_effective);
        // The shared SVF clamps its public 0.1–2 resonance control to 1.
        // Report the target the audio processor actually received.
        self.filter_resonance_effective = self.filter.resonance();
        self.synth.process_planar([
            &mut self.synth_left[..frames],
            &mut self.synth_right[..frames],
        ]);
        self.filter.process_planar(
            [&self.synth_left[..frames], &self.synth_right[..frames]],
            [
                &mut self.filtered_left[..frames],
                &mut self.filtered_right[..frames],
            ],
        );
        self.fx1.process_planar(
            [
                &self.filtered_left[..frames],
                &self.filtered_right[..frames],
            ],
            [&mut self.fx1_left[..frames], &mut self.fx1_right[..frames]],
        );
        self.fx2.process_planar(
            [&self.fx1_left[..frames], &self.fx1_right[..frames]],
            [&mut self.fx2_left[..frames], &mut self.fx2_right[..frames]],
        );
        self.eq.process_planar(
            [&self.fx2_left[..frames], &self.fx2_right[..frames]],
            [
                &mut self.equalized_left[..frames],
                &mut self.equalized_right[..frames],
            ],
        );
        for frame in 0..frames {
            // Main/dsp/main.lua routes host input to the capture and monitor
            // branches. midisynth_integration.lua sends `spec` to every
            // capture input, and its audible `out` applies a gain of 0.8.
            self.capture_left[frame] = dry[0][frame] + self.equalized_left[frame];
            self.capture_right[frame] = dry[1][frame] + self.equalized_right[frame];
            self.monitor_left[frame] = dry[0][frame] + self.equalized_left[frame] * 0.8;
            self.monitor_right[frame] = dry[1][frame] + self.equalized_right[frame] * 0.8;
        }
        self.looper.process_routed_with_taps(
            [&self.capture_left[..frames], &self.capture_right[..frames]],
            [&self.monitor_left[..frames], &self.monitor_right[..frames]],
            output,
            Some(&mut self.layer_taps),
        );
        self.sample_capture.process(dry, &self.layer_taps);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sample_region::StereoSampleUpload;

    #[test]
    fn main_eq_changes_synth_monitor_and_capture_but_not_dry_input() {
        fn level(enabled: bool) -> (f32, f32) {
            let mut main = MainInstrument::new(48_000.0, 128);
            assert!(main.set_synth_parameter(0, 2.0)); // square wave
            assert!(main.set_synth_parameter(1, -1.0)); // wave only
            assert!(main.set_synth_parameter(22, 16_000.0)); // open shared filter
            assert!(main.set_synth_parameter(65, 3.0)); // EQ band 1 low-pass
            assert!(main.set_synth_parameter(66, 120.0));
            assert!(main.set_synth_parameter(64, if enabled { 1.0 } else { 0.0 }));
            main.synth_event(EventKind::NoteOn {
                channel: 0,
                note: 96,
                velocity: 100,
            });
            let silence = [0.0; 128];
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            let mut energy = 0.0;
            for block in 0..240 {
                main.process([&silence, &silence], [&mut left, &mut right]);
                if block >= 200 {
                    energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
                }
            }
            (energy, main.looper().peak(0, 1, 0, 512))
        }
        let (cut_monitor, cut_capture) = level(true);
        let (open_monitor, open_capture) = level(false);
        assert!(
            open_monitor > cut_monitor * 5.0,
            "monitor {open_monitor} / {cut_monitor}"
        );
        assert!(
            open_capture > cut_capture * 5.0,
            "capture {open_capture} / {cut_capture}"
        );
        let mut main = MainInstrument::new(48_000.0, 128);
        assert!(main.set_synth_parameter(65, 3.0));
        assert!(main.set_synth_parameter(66, 120.0));
        assert!(main.set_synth_parameter(64, 1.0));
        let dry = [0.25; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&dry, &dry], [&mut left, &mut right]);
        assert!(left.iter().all(|sample| (*sample - 0.25).abs() < 1e-6));
    }

    #[test]
    fn main_fx_slots_process_in_series_before_eq_and_capture() {
        fn level(active_slots: usize) -> (f32, f32) {
            let mut main = MainInstrument::new(48_000.0, 128);
            assert!(main.set_synth_parameter(0, 2.0));
            assert!(main.set_synth_parameter(1, -1.0));
            assert!(main.set_synth_parameter(22, 16_000.0));
            for base in [128, 136].into_iter().take(active_slots) {
                assert!(main.set_synth_parameter(base, 5.0)); // original FilterNode
                assert!(main.set_synth_parameter(base + 2, 0.0)); // 80 Hz
                assert!(main.set_synth_parameter(base + 1, 1.0));
            }
            main.synth_event(EventKind::NoteOn {
                channel: 0,
                note: 96,
                velocity: 100,
            });
            let silence = [0.0; 128];
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            let mut energy = 0.0;
            for block in 0..240 {
                main.process([&silence, &silence], [&mut left, &mut right]);
                if block >= 200 {
                    energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
                }
            }
            (energy, main.looper().peak(0, 1, 0, 512))
        }
        let (dry_fx, dry_capture) = level(0);
        let (one_fx, one_capture) = level(1);
        let (two_fx, two_capture) = level(2);
        assert!(dry_fx > one_fx * 3.0, "first FX: {dry_fx} / {one_fx}");
        assert!(one_fx > two_fx * 3.0, "second FX: {one_fx} / {two_fx}");
        assert!(dry_capture > one_capture * 3.0);
        assert!(one_capture > two_capture * 3.0);
        let mut main = MainInstrument::new(48_000.0, 128);
        assert!(main.set_synth_parameter(128, 5.0));
        assert!(main.set_synth_parameter(129, 1.0));
        assert!(main.set_synth_parameter(130, 0.0));
        let dry = [0.25; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&dry, &dry], [&mut left, &mut right]);
        assert!(left.iter().all(|sample| (*sample - 0.25).abs() < 1e-6));
    }

    #[test]
    fn shared_svf_filters_the_synth_before_main_capture_without_filtering_dry_input() {
        fn note_level(cutoff: f32) -> (f32, f32) {
            let mut main = MainInstrument::new(48_000.0, 128);
            assert!(main.set_synth_parameter(0, 2.0));
            assert!(main.set_synth_parameter(1, -1.0));
            assert!(main.set_synth_parameter(22, cutoff));
            main.synth_event(EventKind::NoteOn {
                channel: 0,
                note: 96,
                velocity: 100,
            });
            let silence = [0.0; 128];
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            let mut energy = 0.0;
            for block in 0..240 {
                main.process([&silence, &silence], [&mut left, &mut right]);
                if block >= 200 {
                    energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
                }
            }
            (energy / (40 * 128) as f32, main.looper().peak(0, 1, 0, 512))
        }
        let (low_monitor, low_capture) = note_level(80.0);
        let (open_monitor, open_capture) = note_level(16_000.0);
        assert!(
            open_monitor > low_monitor * 5.0,
            "monitor: low={low_monitor}, open={open_monitor}"
        );
        assert!(
            open_capture > low_capture * 5.0,
            "capture: low={low_capture}, open={open_capture}"
        );

        let mut main = MainInstrument::new(48_000.0, 128);
        assert!(main.set_synth_parameter(22, 80.0));
        let dry = [0.25; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&dry, &dry], [&mut left, &mut right]);
        assert!(left.iter().all(|sample| (*sample - 0.25).abs() < 1e-6));
    }

    #[test]
    fn layer_sample_source_taps_playback_gate_before_volume() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let dry = [0.4; 128];
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..12 {
            main.process([&dry, &dry], [&mut left, &mut right]);
        }
        assert!(main.looper_mut().commit(0.0625));
        assert!(main.looper_mut().set_layer_control(0, 0, 2.0));
        for _ in 0..20 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert_eq!(main.request_sample_source(1, 0.0625), 1_000);
        while main.sample_progress().0 < 1_000 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut chunk = [0.0; 256];
        assert!(main.copy_sample_chunk(0, &mut chunk));
        assert!(chunk.iter().all(|value| (*value - 0.4).abs() < 1e-6));
        main.release_sample();
        assert!(main.looper_mut().set_layer_control(0, 2, 1.0));
        for _ in 0..10 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert_eq!(main.request_sample_source(1, 0.0625), 1_000);
        while main.sample_progress().0 < 1_000 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert!(main.copy_sample_chunk(0, &mut chunk));
        assert!(chunk.iter().all(|value| *value == 0.0));
    }

    #[test]
    fn fourth_layer_sample_source_uses_its_own_loop_playback() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for layer in 0..4 {
            let dry = [0.1 * (layer + 1) as f32; 128];
            for _ in 0..12 {
                main.process([&dry, &dry], [&mut left, &mut right]);
            }
            assert!(main.looper_mut().set_control(0, layer as f32));
            assert!(main.looper_mut().commit(0.0625));
            for _ in 0..10 {
                main.process([&silence, &silence], [&mut left, &mut right]);
            }
        }
        assert_eq!(main.request_sample_source(4, 0.0625), 1_000);
        while main.sample_progress().0 < 1_000 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut chunk = [0.0; 256];
        assert!(main.copy_sample_chunk(0, &mut chunk));
        assert!(chunk.iter().all(|value| (*value - 0.4).abs() < 1e-6));
        main.release_sample();
        assert_eq!(main.request_sample_source(5, 0.0625), 0);
    }

    #[test]
    fn free_sample_spans_only_audio_after_start_from_the_pinned_layer() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let original = [0.4; 128];
        let other_dry = [0.9; 128];
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..12 {
            main.process([&original, &original], [&mut left, &mut right]);
        }
        assert!(main.looper_mut().commit(0.0625));
        for _ in 0..10 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert!(main.start_free_sample(1));
        assert_eq!(main.free_sample_source(), Some(1));
        for _ in 0..6 {
            main.process([&other_dry, &other_dry], [&mut left, &mut right]);
        }
        assert_eq!(main.finish_free_sample(), 768);
        while main.sample_progress().0 < 768 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut first = [0.0; 256];
        let mut last = [0.0; 256];
        assert!(main.copy_sample_chunk(0, &mut first));
        assert!(main.copy_sample_chunk(640, &mut last));
        assert!(
            first
                .iter()
                .chain(last.iter())
                .all(|value| (*value - 0.4).abs() < 1e-6)
        );
    }

    #[test]
    fn live_sample_is_dry_input_and_plays_through_main_voice_bank() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let dry = [0.35; 128];
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.set_synth_parameter(1, -1.0);
        main.synth_event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        });
        for _ in 0..16 {
            main.process([&dry, &dry], [&mut left, &mut right]);
        }
        let frames = main.request_sample_source(0, 0.0625);
        assert_eq!(frames, 1_000);
        while main.sample_progress().0 < frames {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut upload = StereoSampleUpload::new(frames, 8_000.0).unwrap();
        for offset in (0..frames).step_by(128) {
            let count = (frames - offset).min(128);
            assert!(upload.prepare_next(offset, count));
            assert!(main.copy_sample_chunk(
                offset,
                &mut upload.samples_mut()[offset * 2..(offset + count) * 2]
            ));
            assert!(upload.validate_next(offset, count));
        }
        // The live source must contain only the dry input, even though the
        // oscillator was sounding in the looper's dry-plus-synth capture.
        assert!(
            upload
                .samples_mut()
                .chunks_exact(2)
                .all(|frame| frame[0] == 0.35 && frame[1] == 0.35)
        );
        main.synth_event(EventKind::AllNotesOff);
        main.load_validated_sample(upload.finish().unwrap());
        main.release_sample();
        main.set_synth_parameter(1, 1.0);
        main.synth_event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        });
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
    }

    #[test]
    fn synth_note_is_audible_and_can_be_committed_from_every_layer_capture() {
        let mut main = MainInstrument::new(8_000.0, 128);
        main.set_synth_parameter(0, 0.0);
        main.set_synth_parameter(1, -1.0);
        main.synth_event(EventKind::NoteOn {
            channel: 0,
            note: 60,
            velocity: 100,
        });
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..20 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert!(left.iter().any(|v| v.abs() > 0.001));
        main.synth_event(EventKind::NoteOff {
            channel: 0,
            note: 60,
        });
        main.looper_mut().set_control(0, 2.0);
        assert!(main.looper_mut().commit(0.0625));
        for _ in 0..20 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert_eq!(main.looper().layer_length(2), 1_000);
        assert!(main.looper().peak(2, 0, 0, 1_000) > 0.001);
        assert_eq!(main.looper().layer_length(0), 0);
    }

    #[test]
    fn lfo_route_modulates_filter_without_overwriting_its_base_control() {
        let mut main = MainInstrument::new(8_000.0, 128);
        assert!(main.set_synth_parameter(22, 3_200.0));
        assert!(main.set_lfo_parameter(0, 3.0)); // square, positive first half cycle
        assert!(main.set_modulation_route(1, 22.0));
        assert!(main.set_modulation_route(2, -0.1));
        assert!(main.set_modulation_route(5, 1.0));
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert!((main.lfo_status(5) - 2_404.0).abs() < 1.0);
        for _ in 0..32 {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        assert!((main.lfo_status(5) - 3_996.0).abs() < 1.0);
        assert!(main.set_modulation_route(5, 0.0));
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.lfo_status(5), 3_200.0);
        assert!(!main.set_modulation_route(1, 64.0)); // EQ isn't a connected target yet
        assert!(main.set_modulation_route(1, 23.0));
        assert!(main.set_modulation_route(2, 1.0));
        assert!(main.set_modulation_route(5, 1.0));
        assert!(main.set_lfo_gate(0, true));
        assert!(main.set_lfo_gate(0, false));
        main.process([&silence, &silence], [&mut left, &mut right]);
        assert_eq!(main.lfo_status(6), 1.0); // public range reaches 2; SVF receives at most 1
    }
}
