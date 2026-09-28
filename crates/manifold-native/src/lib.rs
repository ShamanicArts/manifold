//! Native host boundary for the same prepared graph used by the browser.
//! The host owns device I/O and calls this adapter with planar f32 blocks.

pub use manifold_core::effect_slot::DEFAULT_TYPE_PARAMETERS;
use manifold_core::events::{EventError, TimedEvent};
use manifold_core::graph::{ExecutionPlan, GraphDescription, GraphError, NodeId};
use manifold_core::main_voice_bank::MainTemporalRecipe;
use manifold_core::sine_bank::PartialSet;
use manifold_core::temporal_partials::TemporalFrame;

pub mod capture_mailbox;
pub mod host_buffers;
pub mod host_transport;
pub mod host_values;
pub mod main_host;
pub mod main_host_buffers;
pub mod main_host_parameters;
pub mod main_host_state;
pub mod main_instrument;
pub mod main_presentation;
pub mod main_sample_handoff;
pub mod main_session;
pub mod main_session_export;
pub mod main_snapshot;
pub mod parameters;
pub mod project;

use parameters::{
    AutomationError, HOST_SLOT_BASE, HOST_SLOT_COUNT, HostParameter, TimedAutomation,
};

const MAX_SPLIT_MIDI_EVENTS: usize = 1024;
const MAX_AUTOMATION_POINTS: usize = 4096;

#[derive(Debug, PartialEq, Eq)]
pub enum NativeError {
    Graph(GraphError),
    InvalidSampleRate,
    InvalidDefaultSession,
    BlockTooLarge,
    ChannelLengthMismatch,
    Event(EventError),
    MainHost(main_instrument::MainHostEventError),
    Automation(AutomationError),
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
    host_parameters: Vec<HostParameter>,
    current_parameter_values: Vec<f32>,
    slot_bindings: [Option<u32>; HOST_SLOT_COUNT],
    event_scratch: Vec<TimedEvent>,
}

impl NativeProcessor {
    pub fn transfer_retrospective_history_from(&mut self, previous: &mut Self) -> usize {
        self.plan
            .transfer_retrospective_history_from(&mut previous.plan)
    }

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
            host_parameters: Vec::new(),
            current_parameter_values: Vec::new(),
            slot_bindings: [None; HOST_SLOT_COUNT],
            event_scratch: Vec::with_capacity(MAX_SPLIT_MIDI_EVENTS),
        })
    }

    pub fn host_parameters(&self) -> &[HostParameter] {
        &self.host_parameters
    }

    /// Current physical values in the same order as `host_parameters`.
    /// Read this only while host processing is suspended or otherwise synchronized.
    pub fn current_parameter_values(&self) -> &[f32] {
        &self.current_parameter_values
    }

    pub fn effect_slot_params(&self, node: NodeId, effect_type: u32) -> Option<[f32; 5]> {
        self.plan.effect_slot_params(node, effect_type)
    }

    /// Restore inactive effect memories during project preparation, before
    /// normal active parameter setup applies live DSP settings.
    pub fn restore_effect_slot_params(
        &mut self,
        node: NodeId,
        effect_type: u32,
        values: [f32; 5],
    ) -> bool {
        self.plan
            .restore_effect_slot_params(node, effect_type, values)
    }

    pub fn reset_effect_slot(&mut self, node: NodeId) -> bool {
        self.plan.reset_effect_slot(node)
    }

    /// Host control transaction: call only with exclusive access to this
    /// processor. Subsequent process blocks freeze the requested window.
    pub fn begin_capture_staging(&mut self, node: NodeId, requested_frames: usize) -> bool {
        self.plan.begin_capture_staging(node, requested_frames)
    }

    /// Reserve a callback-safe window while preparing the native graph.
    pub fn reserve_capture_staging(&mut self, node: NodeId, frames: usize) -> bool {
        self.plan.reserve_capture_staging(node, frames)
    }

    /// Audio-thread entry point. It never grows staging storage.
    pub fn begin_prepared_capture_staging(
        &mut self,
        node: NodeId,
        requested_frames: usize,
    ) -> bool {
        self.plan
            .begin_prepared_capture_staging(node, requested_frames)
    }

    pub fn capture_staging_status(&self, node: NodeId) -> Option<bool> {
        self.plan.capture_staging_status(node)
    }

    pub fn retrospective_cursor(&self, node: NodeId) -> Option<(usize, usize)> {
        self.plan.retrospective_cursor(node)
    }

    pub fn capture_staged_length(&self, node: NodeId) -> Option<usize> {
        self.plan.capture_staged_length(node)
    }

    /// Copy frozen PCM into caller-owned storage outside the audio callback.
    pub fn copy_capture_staged_interleaved(
        &self,
        node: NodeId,
        start_frame: usize,
        output: &mut [f32],
    ) -> usize {
        self.plan
            .copy_capture_staged_interleaved(node, start_frame, output)
    }

    pub fn cancel_capture_staging(&mut self, node: NodeId) -> bool {
        self.plan.cancel_capture_staging(node)
    }

    /// Audio-thread reset of prepared signal state; host controls and assets stay loaded.
    pub fn reset_processing(&mut self) {
        self.plan.reset_processing();
        self.event_scratch.clear();
    }

    /// Fixed public host slots; a slot may be unbound in a given project.
    pub fn bound_graph_parameter(&self, slot: u32) -> Option<u32> {
        self.slot_bindings.get(slot as usize).copied().flatten()
    }

    fn parameter_for_id(&self, id: u32, fixed_slots: bool) -> Option<&HostParameter> {
        let graph_id = if fixed_slots {
            let slot = id.checked_sub(HOST_SLOT_BASE)? as usize;
            self.slot_bindings.get(slot).copied().flatten()?
        } else {
            id
        };
        self.host_parameters
            .iter()
            .find(|entry| entry.id == graph_id)
    }

    /// Prepared parameter changes may be applied between blocks. The host must
    /// map its stable public parameter IDs to node-local IDs before this call.
    pub fn set_parameter(&mut self, node: NodeId, parameter: u32, value: f32) -> bool {
        if let Some(descriptor) = self
            .host_parameters
            .iter()
            .find(|entry| entry.node == node && entry.local_id == parameter)
        {
            if descriptor.to_normalized(value).is_none()
                || (descriptor.discrete && value.fract() != 0.0)
            {
                return false;
            }
        }
        if !self.plan.set_parameter(node, parameter, value) {
            return false;
        }
        if let Some(index) = self
            .host_parameters
            .iter()
            .position(|entry| entry.node == node && entry.local_id == parameter)
        {
            self.current_parameter_values[index] = value;
        }
        if parameter == 0 {
            Self::sync_effect_slot_public_values(
                &self.plan,
                &self.host_parameters,
                &mut self.current_parameter_values,
                node,
                value as u32,
            );
        }
        true
    }

    fn sync_effect_slot_public_values(
        plan: &ExecutionPlan,
        host_parameters: &[HostParameter],
        current_parameter_values: &mut [f32],
        node: NodeId,
        effect_type: u32,
    ) {
        let Some(params) = plan.effect_slot_params(node, effect_type) else {
            return;
        };
        for (index, descriptor) in host_parameters.iter().enumerate() {
            if descriptor.node == node && (2..=6).contains(&descriptor.local_id) {
                current_parameter_values[index] = params[(descriptor.local_id - 2) as usize];
            }
        }
    }

    pub fn load_sample_stereo(&mut self, node: NodeId, stereo: Vec<f32>, source_rate: f32) -> bool {
        self.plan.load_sample_stereo(node, stereo, source_rate)
    }

    pub fn load_partials_target(
        &mut self,
        node: NodeId,
        target: u32,
        partials: PartialSet,
    ) -> bool {
        self.plan.load_partials_target(node, target, partials)
    }

    pub fn load_main_temporal_frames(
        &mut self,
        node: NodeId,
        frames: Vec<TemporalFrame>,
        recipe: MainTemporalRecipe,
    ) -> bool {
        self.plan.load_main_temporal_frames(node, frames, recipe)
    }

    pub fn set_main_temporal_speed(&mut self, node: NodeId, speed: f32) -> bool {
        self.plan.set_main_temporal_speed(node, speed)
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

    /// Apply normalized graph controls at exact offsets. Host IDs come from a
    /// restored project; all queues are validated before rendering any output.
    /// The event scratch is allocated during prepare and never grows here.
    pub fn process_automated(
        &mut self,
        block: AudioBlock<'_>,
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        self.process_automated_impl(block, automation, false)
    }

    /// The VST3-facing automation path uses a fixed set of 128 macro IDs.
    /// Bindings are restored with the project, so graph edits cannot renumber
    /// host automation lanes.
    pub fn process_host_automated(
        &mut self,
        block: AudioBlock<'_>,
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        self.process_automated_impl(block, automation, true)
    }

    fn process_automated_impl(
        &mut self,
        block: AudioBlock<'_>,
        automation: &[TimedAutomation],
        fixed_slots: bool,
    ) -> Result<(), NativeError> {
        if automation.is_empty() {
            return self.process(block);
        }
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
        if events.len() > MAX_SPLIT_MIDI_EVENTS || automation.len() > MAX_AUTOMATION_POINTS {
            return Err(NativeError::Automation(AutomationError::TooManyEvents));
        }
        self.plan
            .validate_events(events, frames)
            .map_err(NativeError::Event)?;
        let mut previous = 0;
        for (index, point) in automation.iter().enumerate() {
            if point.offset >= frames && !(frames == 0 && point.offset == 0) {
                return Err(NativeError::Automation(AutomationError::OffsetOutOfRange));
            }
            if index > 0 && point.offset < previous {
                return Err(NativeError::Automation(AutomationError::Unsorted));
            }
            let descriptor = self
                .parameter_for_id(point.id, fixed_slots)
                .ok_or(NativeError::Automation(AutomationError::UnknownParameter))?;
            if descriptor.from_normalized(point.normalized).is_none() {
                return Err(NativeError::Automation(AutomationError::InvalidNormalized));
            }
            previous = point.offset;
        }
        if frames == 0 {
            for point in automation {
                let descriptor = self
                    .parameter_for_id(point.id, fixed_slots)
                    .expect("validated ID");
                let value = descriptor
                    .from_normalized(point.normalized)
                    .expect("validated normalized value");
                let node = descriptor.node;
                let local_id = descriptor.local_id;
                let applied = self.set_parameter(node, local_id, value);
                debug_assert!(applied);
            }
            return Ok(());
        }
        let [left_out, right_out] = output;
        let [main_left, main_right] =
            main.unwrap_or([&self.silence[..frames], &self.silence[..frames]]);
        let mut start = 0;
        let mut point_index = 0;
        let mut event_index = 0;
        while start < frames {
            while point_index < automation.len() && automation[point_index].offset == start {
                let point = automation[point_index];
                let descriptor = self
                    .parameter_for_id(point.id, fixed_slots)
                    .expect("validated ID");
                let value = descriptor
                    .from_normalized(point.normalized)
                    .expect("validated normalized value");
                let node = descriptor.node;
                let local_id = descriptor.local_id;
                let applied = self.plan.set_parameter(node, local_id, value);
                debug_assert!(applied);
                if let Some(index) = self
                    .host_parameters
                    .iter()
                    .position(|entry| entry.node == node && entry.local_id == local_id)
                {
                    self.current_parameter_values[index] = value;
                }
                if local_id == 0 {
                    Self::sync_effect_slot_public_values(
                        &self.plan,
                        &self.host_parameters,
                        &mut self.current_parameter_values,
                        node,
                        value as u32,
                    );
                }
                point_index += 1;
            }
            let end = automation
                .get(point_index)
                .map_or(frames, |point| point.offset);
            self.event_scratch.clear();
            while event_index < events.len() && events[event_index].offset < end {
                let mut event = events[event_index];
                event.offset -= start;
                self.event_scratch.push(event);
                event_index += 1;
            }
            self.plan
                .process_with_events_sidechain(
                    [&main_left[start..end], &main_right[start..end]],
                    sidechain.map(|[left, right]| [&left[start..end], &right[start..end]]),
                    [&mut left_out[start..end], &mut right_out[start..end]],
                    &self.event_scratch,
                )
                .map_err(NativeError::Event)?;
            start = end;
        }
        Ok(())
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
