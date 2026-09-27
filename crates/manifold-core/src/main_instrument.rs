//! Main's synth-to-looper routing, with all scratch prepared before processing.

use crate::events::EventKind;
use crate::main_looper::LAYERS;
use crate::main_looper::MainLooper;
use crate::main_sample_capture::MainSampleCapture;
use crate::main_voice_bank::MainVoiceBank;
use crate::sample_region::ValidatedStereo;

pub struct MainInstrument {
    looper: MainLooper,
    synth: MainVoiceBank,
    sample_capture: MainSampleCapture,
    layer_taps: [Vec<f32>; LAYERS],
    sample_rate: f32,
    synth_left: Vec<f32>,
    synth_right: Vec<f32>,
    capture_left: Vec<f32>,
    capture_right: Vec<f32>,
    monitor_left: Vec<f32>,
    monitor_right: Vec<f32>,
}

impl MainInstrument {
    pub fn new(sample_rate: f32, max_frames: usize) -> Self {
        Self {
            looper: MainLooper::new(sample_rate),
            synth: MainVoiceBank::new(sample_rate, max_frames, 9),
            sample_capture: MainSampleCapture::new(sample_rate),
            layer_taps: std::array::from_fn(|_| vec![0.0; max_frames * 2]),
            sample_rate,
            synth_left: vec![0.0; max_frames],
            synth_right: vec![0.0; max_frames],
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
        self.synth.set_parameter(id, value)
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

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    pub fn synth_sample_frames(&self) -> usize {
        self.synth.sample_frames()
    }

    pub fn synth_sample_peak(&self, start: usize, end: usize) -> f32 {
        self.synth.sample_peak(start, end)
    }

    pub fn process(&mut self, dry: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let frames = dry[0].len();
        assert_eq!(dry[1].len(), frames);
        assert!(frames <= self.synth_left.len());
        self.synth.process_planar([
            &mut self.synth_left[..frames],
            &mut self.synth_right[..frames],
        ]);
        for frame in 0..frames {
            // Main/dsp/main.lua routes host input to the capture and monitor
            // branches. midisynth_integration.lua sends `spec` to every
            // capture input, and its audible `out` applies a gain of 0.8.
            self.capture_left[frame] = dry[0][frame] + self.synth_left[frame];
            self.capture_right[frame] = dry[1][frame] + self.synth_right[frame];
            self.monitor_left[frame] = dry[0][frame] + self.synth_left[frame] * 0.8;
            self.monitor_right[frame] = dry[1][frame] + self.synth_right[frame] * 0.8;
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
}
