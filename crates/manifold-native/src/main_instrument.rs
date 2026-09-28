//! Native host block boundary for the assembled Main instrument. Host formats
//! share this adapter rather than reimplementing its audio or looper timing.

use manifold_core::events::EventKind;
use manifold_core::events::{EventError, TimedEvent};
use manifold_core::main_instrument::MainInstrument;

use crate::NativeError;
use crate::main_host_parameters::{MainHostValueBank, MainParameter, MainParameterError};

pub const MAIN_MIDI_TARGET: u64 = 0;

pub struct MainAudioBlock<'a> {
    pub input: Option<[&'a [f32]; 2]>,
    pub output: [&'a mut [f32]; 2],
    pub events: &'a [TimedEvent],
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum MainHostEventKind {
    Midi(EventKind),
    Parameter { id: u32, value: f32 },
    Command { id: u32, value: f32 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MainHostEvent {
    pub offset: usize,
    pub kind: MainHostEventKind,
}

pub struct MainHostAudioBlock<'a> {
    pub input: Option<[&'a [f32]; 2]>,
    pub output: [&'a mut [f32]; 2],
    pub actions: &'a [MainHostEvent],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MainHostEventError {
    OffsetOutOfRange,
    Unsorted,
    InvalidMidi,
    InvalidCommand,
    Parameter(MainParameterError),
}

fn valid_command(id: u32, value: f32) -> bool {
    if !value.is_finite() {
        return false;
    }
    match id {
        0..=5 | 8 => true,
        6 => (0.0625..=16.0).contains(&value),
        7 => [0.0625, 0.125, 0.25, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0].contains(&value),
        9 => (0.0..=3.0).contains(&value) && value.fract() == 0.0,
        _ => false,
    }
}

fn valid_midi(event: EventKind) -> bool {
    match event {
        EventKind::NoteOn {
            channel,
            note,
            velocity,
        } => channel < 16 && note < 128 && (1..=127).contains(&velocity),
        EventKind::NoteOff { channel, note } => channel < 16 && note < 128,
        EventKind::PitchBend { channel, value } => channel < 16 && value <= 16383,
        EventKind::AllNotesOff => true,
    }
}

pub struct MainNativeProcessor {
    instrument: MainInstrument,
    max_frames: usize,
    silence: Vec<f32>,
    host_values: MainHostValueBank,
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
            host_values: MainHostValueBank::default(),
        })
    }

    /// Exclusive control-side access, while the host has suspended processing.
    pub fn instrument_control_mut(&mut self) -> &mut MainInstrument {
        &mut self.instrument
    }

    pub fn instrument(&self) -> &MainInstrument {
        &self.instrument
    }

    pub fn host_values(&self) -> &MainHostValueBank {
        &self.host_values
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

    /// Timed host actions share a single ordered queue, so MIDI, automation,
    /// and transport commands take effect at the requested sample offset.
    /// Validate everything before processing any audio or changing state.
    pub fn process_host(&mut self, block: MainHostAudioBlock<'_>) -> Result<(), NativeError> {
        let MainHostAudioBlock {
            input,
            output,
            actions,
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
        let mut previous = 0;
        for (index, action) in actions.iter().enumerate() {
            if (frames == 0 && action.offset != 0) || (frames > 0 && action.offset >= frames) {
                return Err(NativeError::MainHost(MainHostEventError::OffsetOutOfRange));
            }
            if index > 0 && action.offset < previous {
                return Err(NativeError::MainHost(MainHostEventError::Unsorted));
            }
            previous = action.offset;
            match action.kind {
                MainHostEventKind::Midi(event) if frames == 0 || !valid_midi(event) => {
                    return Err(NativeError::MainHost(MainHostEventError::InvalidMidi));
                }
                MainHostEventKind::Parameter { id, value } => {
                    MainParameter::decode(id, value).map_err(|error| {
                        NativeError::MainHost(MainHostEventError::Parameter(error))
                    })?;
                }
                MainHostEventKind::Command { id, value } if !valid_command(id, value) => {
                    return Err(NativeError::MainHost(MainHostEventError::InvalidCommand));
                }
                _ => {}
            }
        }
        let [input_left, input_right] =
            input.unwrap_or([&self.silence[..frames], &self.silence[..frames]]);
        let mut cursor = 0;
        for action in actions {
            if cursor < action.offset {
                self.instrument.process(
                    [
                        &input_left[cursor..action.offset],
                        &input_right[cursor..action.offset],
                    ],
                    [
                        &mut left[cursor..action.offset],
                        &mut right[cursor..action.offset],
                    ],
                );
            }
            match action.kind {
                MainHostEventKind::Midi(event) => self.instrument.synth_event(event),
                MainHostEventKind::Parameter { id, value } => {
                    let parameter = MainParameter::decode(id, value).expect("validated above");
                    let applied = parameter.apply(&mut self.instrument);
                    debug_assert!(applied);
                    self.host_values.record(id, value);
                }
                MainHostEventKind::Command { id, value } => {
                    let looper = self.instrument.looper_mut();
                    match id {
                        0 => looper.start_recording(),
                        1 => {
                            looper.stop_recording();
                        }
                        2 => looper.play_all(),
                        3 => looper.pause_all(),
                        4 => looper.stop_all(),
                        5 => looper.clear_all(),
                        6 => {
                            looper.commit(value);
                        }
                        7 => {
                            looper.click_capture_segment(value);
                        }
                        8 => {
                            looper.fire_forward();
                        }
                        9 => looper.clear_layer(value as usize),
                        _ => unreachable!("validated above"),
                    }
                }
            }
            cursor = action.offset;
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
    use crate::main_host_parameters::{ARPEGGIATOR_BASE, LAYER_BASE, SYNTH_BASE};

    fn render_host(
        processor: &mut MainNativeProcessor,
        input: Option<[&[f32]; 2]>,
        actions: &[MainHostEvent],
    ) -> Vec<f32> {
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        processor
            .process_host(MainHostAudioBlock {
                input,
                output: [&mut left, &mut right],
                actions,
            })
            .unwrap();
        left.to_vec()
    }

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

    #[test]
    fn host_master_change_and_arp_connection_land_at_their_frame_offsets() {
        let mut baseline = MainNativeProcessor::prepare(8_000.0, 128).unwrap();
        let mut changed = MainNativeProcessor::prepare(8_000.0, 128).unwrap();
        let note = MainHostEvent {
            offset: 0,
            kind: MainHostEventKind::Midi(EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            }),
        };
        let master = MainHostEvent {
            offset: 64,
            kind: MainHostEventKind::Parameter {
                id: SYNTH_BASE + 15,
                value: 0.0,
            },
        };
        let plain = render_host(&mut baseline, None, &[note]);
        let edited = render_host(&mut changed, None, &[note, master]);
        assert_eq!(&plain[..64], &edited[..64]);
        assert!(
            plain[80..]
                .iter()
                .zip(&edited[80..])
                .any(|(a, b)| (a - b).abs() > 0.00001)
        );

        let mut arp = MainNativeProcessor::prepare(8_000.0, 128).unwrap();
        let connected = MainHostEvent {
            offset: 64,
            kind: MainHostEventKind::Parameter {
                id: ARPEGGIATOR_BASE + 5,
                value: 1.0,
            },
        };
        let arp_output = render_host(&mut arp, None, &[note, connected]);
        assert_eq!(arp.instrument().arpeggiator_status(11), 1.0);
        assert_eq!(&plain[..64], &arp_output[..64]);
        assert!(
            plain[80..]
                .iter()
                .zip(&arp_output[80..])
                .any(|(a, b)| (a - b).abs() > 0.00001)
        );
    }

    #[test]
    fn timed_first_loop_and_layer_volume_share_host_action_queue() {
        let mut host = MainNativeProcessor::prepare(8_000.0, 128).unwrap();
        let input = [0.25; 128];
        let rec = MainHostEvent {
            offset: 32,
            kind: MainHostEventKind::Command { id: 0, value: 0.0 },
        };
        let stop = MainHostEvent {
            offset: 96,
            kind: MainHostEventKind::Command { id: 1, value: 0.0 },
        };
        render_host(&mut host, Some([&input, &input]), &[rec, stop]);
        assert!(!host.instrument().looper().recording());
        assert!(host.instrument().looper().layer_length(0) > 0);
        assert!(
            host.instrument()
                .looper()
                .peak(0, 0, 0, host.instrument().looper().layer_length(0))
                > 0.2
        );
        let looper = host.instrument_control_mut().looper_mut();
        looper.clear_all();
        assert!(looper.begin_layer_load(0, 128, 0.0625, 0.0, true));
        assert!(looper.load_layer_chunk(0, 0, &[0.25; 256]));
        assert!(looper.finish_layer_load(0));
        let mute_at_half = MainHostEvent {
            offset: 64,
            kind: MainHostEventKind::Parameter {
                id: LAYER_BASE,
                value: 0.0,
            },
        };
        let output = render_host(&mut host, None, &[mute_at_half]);
        assert!(output[..64].iter().any(|value| value.abs() > 0.1));
        assert!(output[64..].iter().all(|value| value.abs() < 0.00001));
    }

    #[test]
    fn bad_host_queue_preserves_audio_and_zero_frame_flush_applies_controls() {
        let mut host = MainNativeProcessor::prepare(8_000.0, 128).unwrap();
        let mut left = [0.3; 128];
        let mut right = [0.4; 128];
        let actions = [
            MainHostEvent {
                offset: 0,
                kind: MainHostEventKind::Command { id: 0, value: 0.0 },
            },
            MainHostEvent {
                offset: 80,
                kind: MainHostEventKind::Parameter {
                    id: SYNTH_BASE + 15,
                    value: f32::NAN,
                },
            },
        ];
        assert_eq!(
            host.process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions: &actions
            }),
            Err(NativeError::MainHost(MainHostEventError::Parameter(
                MainParameterError::InvalidValue
            )))
        );
        assert!(left.iter().all(|value| *value == 0.3));
        assert!(right.iter().all(|value| *value == 0.4));
        assert!(!host.instrument().looper().recording());
        let mut empty_left = [];
        let mut empty_right = [];
        host.process_host(MainHostAudioBlock {
            input: None,
            output: [&mut empty_left, &mut empty_right],
            actions: &[MainHostEvent {
                offset: 0,
                kind: MainHostEventKind::Command { id: 0, value: 0.0 },
            }],
        })
        .unwrap();
        assert!(host.instrument().looper().recording());
    }
}
