//! Native host block boundary for the assembled Main instrument. Host formats
//! share this adapter rather than reimplementing its audio or looper timing.

use manifold_core::events::{EventError, TimedEvent};
use manifold_core::main_instrument::MainInstrument;

use crate::NativeError;

pub const MAIN_MIDI_TARGET: u64 = 0;

pub struct MainAudioBlock<'a> {
    pub input: Option<[&'a [f32]; 2]>,
    pub output: [&'a mut [f32]; 2],
    pub events: &'a [TimedEvent],
}

pub struct MainNativeProcessor {
    instrument: MainInstrument,
    max_frames: usize,
    silence: Vec<f32>,
}

impl MainNativeProcessor {
    /// All capture rings, effect scratch, and silence are allocated here.
    pub fn prepare(sample_rate: f32, max_frames: usize) -> Result<Self, NativeError> {
        if !sample_rate.is_finite() || !(8_000.0..=192_000.0).contains(&sample_rate) {
            return Err(NativeError::InvalidSampleRate);
        }
        if max_frames == 0 || max_frames > 65_536 {
            return Err(NativeError::BlockTooLarge);
        }
        Ok(Self {
            instrument: MainInstrument::new(sample_rate, max_frames),
            max_frames,
            silence: vec![0.0; max_frames],
        })
    }

    /// Exclusive control-side access, while the host has suspended processing.
    pub fn instrument_control_mut(&mut self) -> &mut MainInstrument {
        &mut self.instrument
    }

    pub fn instrument(&self) -> &MainInstrument {
        &self.instrument
    }

    /// Validates the entire block and MIDI queue before touching output.
    /// Splits only at host event offsets; Main then handles its own arpeggio
    /// step and gate deadlines within each segment.
    pub fn process(&mut self, block: MainAudioBlock<'_>) -> Result<(), NativeError> {
        let MainAudioBlock {
            input,
            output,
            events,
        } = block;
        let [left, right] = output;
        let frames = left.len();
        if frames > self.max_frames {
            return Err(NativeError::BlockTooLarge);
        }
        if right.len() != frames
            || input.is_some_and(|bus| bus.iter().any(|channel| channel.len() != frames))
        {
            return Err(NativeError::ChannelLengthMismatch);
        }
        if frames == 0 && !events.is_empty() {
            return Err(NativeError::Event(EventError::OffsetOutOfRange));
        }
        let mut previous = 0;
        for (index, event) in events.iter().enumerate() {
            if event.node != MAIN_MIDI_TARGET {
                return Err(NativeError::Event(EventError::UnknownTarget));
            }
            if event.offset >= frames {
                return Err(NativeError::Event(EventError::OffsetOutOfRange));
            }
            if index > 0 && event.offset < previous {
                return Err(NativeError::Event(EventError::Unsorted));
            }
            previous = event.offset;
        }
        if frames == 0 {
            return Ok(());
        }
        let [input_left, input_right] =
            input.unwrap_or([&self.silence[..frames], &self.silence[..frames]]);
        let mut cursor = 0;
        for event in events {
            if cursor < event.offset {
                self.instrument.process(
                    [
                        &input_left[cursor..event.offset],
                        &input_right[cursor..event.offset],
                    ],
                    [
                        &mut left[cursor..event.offset],
                        &mut right[cursor..event.offset],
                    ],
                );
            }
            self.instrument.synth_event(event.kind);
            cursor = event.offset;
        }
        if cursor < frames {
            self.instrument.process(
                [&input_left[cursor..frames], &input_right[cursor..frames]],
                [&mut left[cursor..frames], &mut right[cursor..frames]],
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_core::events::EventKind;

    fn render(
        processor: &mut MainNativeProcessor,
        frames: usize,
        events: &[TimedEvent],
    ) -> Vec<f32> {
        let mut left = vec![0.0; frames];
        let mut right = vec![0.0; frames];
        processor
            .process(MainAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                events,
            })
            .unwrap();
        left
    }

    #[test]
    fn main_host_offset_feeds_sample_clocked_arp_and_missing_bus_is_silent() {
        let mut host = MainNativeProcessor::prepare(8_000.0, 128).unwrap();
        assert!(host.instrument_control_mut().set_synth_parameter(1, -1.0));
        assert!(
            host.instrument_control_mut()
                .set_arpeggiator_parameter(5, 1.0)
        );
        let note = TimedEvent {
            offset: 40,
            node: MAIN_MIDI_TARGET,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        };
        let first = render(&mut host, 128, &[note]);
        let second = render(&mut host, 128, &[]);
        let third = render(&mut host, 128, &[]);
        assert!(first.iter().all(|sample| *sample == 0.0));
        assert!(second.iter().all(|sample| *sample == 0.0));
        assert!(third[..24].iter().all(|sample| *sample == 0.0));
        assert!(third[32..].iter().any(|sample| sample.abs() > 0.001));
        assert_eq!(host.instrument().arpeggiator_status(0), 1.0);
        let off = TimedEvent {
            offset: 0,
            node: MAIN_MIDI_TARGET,
            kind: EventKind::NoteOff {
                channel: 0,
                note: 60,
            },
        };
        render(&mut host, 128, &[off]);
        assert_eq!(host.instrument().arpeggiator_status(0), 0.0);
    }

    #[test]
    fn invalid_host_event_does_not_advance_main_or_touch_output() {
        let mut host = MainNativeProcessor::prepare(8_000.0, 128).unwrap();
        let mut left = [0.3; 128];
        let mut right = [0.4; 128];
        let invalid = [TimedEvent {
            offset: 128,
            node: MAIN_MIDI_TARGET,
            kind: EventKind::AllNotesOff,
        }];
        assert_eq!(
            host.process(MainAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                events: &invalid
            }),
            Err(NativeError::Event(EventError::OffsetOutOfRange))
        );
        assert!(left.iter().all(|sample| *sample == 0.3));
        assert!(right.iter().all(|sample| *sample == 0.4));
    }

    #[test]
    fn native_main_first_loop_records_host_input_and_plays_the_committed_layer() {
        let mut host = MainNativeProcessor::prepare(8_000.0, 128).unwrap();
        host.instrument_control_mut().looper_mut().start_recording();
        let input = [0.25; 128];
        for _ in 0..4 {
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            host.process(MainAudioBlock {
                input: Some([&input, &input]),
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        }
        assert!(host.instrument_control_mut().looper_mut().stop_recording());
        let playback = render(&mut host, 128, &[]);
        assert!(host.instrument().looper().layer_length(0) > 0);
        assert!(playback.iter().any(|sample| *sample > 0.1));
        assert!(host.instrument().looper().peak(0, 0, 0, 128) > 0.2);
    }
}
