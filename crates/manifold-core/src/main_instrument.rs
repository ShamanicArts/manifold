//! Main's synth-to-looper routing, with all scratch prepared before processing.

use crate::events::EventKind;
use crate::main_looper::MainLooper;
use crate::main_live_capture::MainLiveCapture;
use crate::main_voice_bank::MainVoiceBank;
use crate::sample_region::ValidatedStereo;

pub struct MainInstrument {
    looper: MainLooper,
    synth: MainVoiceBank,
    live_capture: MainLiveCapture,
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
            live_capture: MainLiveCapture::new(sample_rate),
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

    pub fn request_live_sample(&mut self, bars: f32) -> usize {
        if !bars.is_finite() || !(0.0625..=16.0).contains(&bars) {
            return 0;
        }
        let frames = (bars * self.looper.samples_per_bar()).round() as usize;
        let frames = frames.min(self.live_capture.capacity());
        if self.live_capture.request(frames) { frames } else { 0 }
    }

    pub fn live_sample_progress(&self) -> (usize, usize) {
        self.live_capture.progress()
    }

    pub fn live_sample_captured_frames(&self) -> usize {
        self.live_capture.captured_frames()
    }

    pub fn copy_live_sample_chunk(&self, offset: usize, destination: &mut [f32]) -> bool {
        self.live_capture.copy_frozen_chunk(offset, destination)
    }

    pub fn release_live_sample(&mut self) {
        self.live_capture.release();
    }

    pub fn load_validated_sample(&mut self, sample: ValidatedStereo) {
        self.synth.load_validated(sample);
    }

    pub fn sample_rate(&self) -> f32 {
        self.sample_rate
    }

    pub fn process(&mut self, dry: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let frames = dry[0].len();
        assert_eq!(dry[1].len(), frames);
        assert!(frames <= self.synth_left.len());
        self.live_capture.process(dry);
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
        self.looper.process_routed(
            [&self.capture_left[..frames], &self.capture_right[..frames]],
            [&self.monitor_left[..frames], &self.monitor_right[..frames]],
            output,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sample_region::StereoSampleUpload;

    #[test]
    fn live_sample_is_dry_input_and_plays_through_main_voice_bank() {
        let mut main = MainInstrument::new(8_000.0, 128);
        let dry = [0.35; 128];
        let silence = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        main.set_synth_parameter(1, -1.0);
        main.synth_event(EventKind::NoteOn { channel: 0, note: 60, velocity: 100 });
        for _ in 0..16 {
            main.process([&dry, &dry], [&mut left, &mut right]);
        }
        let frames = main.request_live_sample(0.0625);
        assert_eq!(frames, 1_000);
        while main.live_sample_progress().0 < frames {
            main.process([&silence, &silence], [&mut left, &mut right]);
        }
        let mut upload = StereoSampleUpload::new(frames, 8_000.0).unwrap();
        for offset in (0..frames).step_by(128) {
            let count = (frames - offset).min(128);
            assert!(upload.prepare_next(offset, count));
            assert!(main.copy_live_sample_chunk(offset,
                &mut upload.samples_mut()[offset * 2..(offset + count) * 2]));
            assert!(upload.validate_next(offset, count));
        }
        // The live source must contain only the dry input, even though the
        // oscillator was sounding in the looper's dry-plus-synth capture.
        assert!(upload.samples_mut().chunks_exact(2).all(|frame| frame[0] == 0.35 && frame[1] == 0.35));
        main.synth_event(EventKind::AllNotesOff);
        main.load_validated_sample(upload.finish().unwrap());
        main.release_live_sample();
        main.set_synth_parameter(1, 1.0);
        main.synth_event(EventKind::NoteOn { channel: 0, note: 60, velocity: 100 });
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
        main.synth_event(EventKind::NoteOff { channel: 0, note: 60 });
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
