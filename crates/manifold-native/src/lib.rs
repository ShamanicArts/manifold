//! Native host boundary for the same prepared graph used by the browser.
//! The host owns device I/O and calls this adapter with planar f32 blocks.

use manifold_core::events::{EventError, TimedEvent};
use manifold_core::graph::{ExecutionPlan, GraphDescription, GraphError, NodeId};

pub mod project;

#[derive(Debug, PartialEq, Eq)]
pub enum NativeError {
    Graph(GraphError),
    BlockTooLarge,
    ChannelLengthMismatch,
    Event(EventError),
}

impl From<GraphError> for NativeError {
    fn from(error: GraphError) -> Self {
        Self::Graph(error)
    }
}

pub struct AudioBlock<'a> {
    pub main: Option<[&'a [f32]; 2]>,
    pub sidechain: Option<[&'a [f32]; 2]>,
    pub output: [&'a mut [f32]; 2],
    pub events: &'a [TimedEvent],
}

pub struct NativeProcessor {
    plan: ExecutionPlan,
    max_frames: usize,
    silence: Vec<f32>,
}

impl NativeProcessor {
    /// Prepare all kernels and scratch outside the host's process callback.
    pub fn prepare(
        graph: &GraphDescription,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<Self, NativeError> {
        if max_frames > 65_536 {
            return Err(NativeError::BlockTooLarge);
        }
        let plan = graph.compile(sample_rate, max_frames)?;
        Ok(Self {
            plan,
            max_frames,
            silence: vec![0.0; max_frames],
        })
    }

    /// Prepared parameter changes may be applied between blocks. The host must
    /// map its stable public parameter IDs to node-local IDs before this call.
    pub fn set_parameter(&mut self, node: NodeId, parameter: u32, value: f32) -> bool {
        self.plan.set_parameter(node, parameter, value)
    }

    pub fn load_sample_stereo(&mut self, node: NodeId, stereo: Vec<f32>, source_rate: f32) -> bool {
        self.plan.load_sample_stereo(node, stereo, source_rate)
    }

    /// Render one host block without allocating. Missing buses are silence.
    /// Events use offsets within this block and are checked before any output
    /// is written. The host may pass any block length up to the prepared limit.
    pub fn process(&mut self, block: AudioBlock<'_>) -> Result<(), NativeError> {
        let AudioBlock {
            main,
            sidechain,
            output,
            events,
        } = block;
        let frames = output[0].len();
        if frames > self.max_frames {
            return Err(NativeError::BlockTooLarge);
        }
        if output[1].len() != frames
            || main.is_some_and(|bus| bus.iter().any(|channel| channel.len() != frames))
            || sidechain.is_some_and(|bus| bus.iter().any(|channel| channel.len() != frames))
        {
            return Err(NativeError::ChannelLengthMismatch);
        }
        if frames == 0 {
            return if events.is_empty() {
                Ok(())
            } else {
                Err(NativeError::Event(EventError::OffsetOutOfRange))
            };
        }
        let input = main.unwrap_or([&self.silence[..frames], &self.silence[..frames]]);
        self.plan
            .process_with_events_sidechain(input, sidechain, output, events)
            .map_err(NativeError::Event)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_core::events::EventKind;
    use manifold_core::graph::{Connection, NodeKind, NodeSpec};

    fn stereo_graph() -> GraphDescription {
        GraphDescription {
            nodes: vec![
                NodeSpec {
                    id: 1,
                    kind: NodeKind::InputRaw,
                },
                NodeSpec {
                    id: 2,
                    kind: NodeKind::InputSidechain,
                },
                NodeSpec {
                    id: 3,
                    kind: NodeKind::Sum2 {
                        gain_a: 1.0,
                        gain_b: 1.0,
                    },
                },
                NodeSpec {
                    id: 4,
                    kind: NodeKind::Output,
                },
            ],
            connections: vec![
                Connection {
                    from: 1,
                    to: 3,
                    input_port: 0,
                },
                Connection {
                    from: 2,
                    to: 3,
                    input_port: 1,
                },
                Connection {
                    from: 3,
                    to: 4,
                    input_port: 0,
                },
            ],
        }
    }

    #[test]
    fn separate_buses_and_missing_buses_render_at_variable_block_sizes() {
        let mut processor = NativeProcessor::prepare(&stereo_graph(), 48_000.0, 128).unwrap();
        for frames in [16, 128, 31] {
            let main = vec![0.25; frames];
            let side = vec![-0.5; frames];
            let mut left = vec![0.0; frames];
            let mut right = vec![0.0; frames];
            processor
                .process(AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: Some([&side, &side]),
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            assert_eq!(left, vec![-0.25; frames]);
            assert_eq!(right, left);
            processor
                .process(AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            assert_eq!(left, vec![0.25; frames]);
            processor
                .process(AudioBlock {
                    main: None,
                    sidechain: Some([&side, &side]),
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            assert_eq!(left, vec![-0.5; frames]);
        }
    }

    #[test]
    fn rejects_bad_buffers_before_touching_output() {
        let mut processor = NativeProcessor::prepare(&stereo_graph(), 48_000.0, 16).unwrap();
        let main = [1.0; 17];
        let mut left = [9.0; 17];
        let mut right = [9.0; 17];
        assert_eq!(
            processor.process(AudioBlock {
                main: Some([&main, &main]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[]
            }),
            Err(NativeError::BlockTooLarge)
        );
        assert_eq!(left, [9.0; 17]);
        let mut short = [9.0; 15];
        assert_eq!(
            processor.process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left[..16], &mut short],
                events: &[]
            }),
            Err(NativeError::ChannelLengthMismatch)
        );
        assert_eq!(left, [9.0; 17]);
    }

    #[test]
    fn timed_midi_event_enters_native_graph_at_its_frame() {
        let graph = GraphDescription {
            nodes: vec![
                NodeSpec {
                    id: 1,
                    kind: NodeKind::VoiceSynth,
                },
                NodeSpec {
                    id: 2,
                    kind: NodeKind::Output,
                },
            ],
            connections: vec![Connection {
                from: 1,
                to: 2,
                input_port: 0,
            }],
        };
        let mut processor = NativeProcessor::prepare(&graph, 48_000.0, 128).unwrap();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let note = TimedEvent {
            offset: 40,
            node: 1,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        };
        processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[note],
            })
            .unwrap();
        assert_eq!(left[..40], [0.0; 40]);
        assert!(left[41..].iter().any(|sample| sample.abs() > 0.0001));
        let invalid = TimedEvent {
            offset: 128,
            ..note
        };
        left.fill(9.0);
        assert_eq!(
            processor.process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[invalid]
            }),
            Err(NativeError::Event(EventError::OffsetOutOfRange))
        );
        assert_eq!(left, [9.0; 128]);
    }
}
