//! Native host boundary for the same prepared graph used by the browser.
//! The host owns device I/O and calls this adapter with planar f32 blocks.

pub use manifold_core::effect_slot::DEFAULT_TYPE_PARAMETERS;
use manifold_core::events::{EventError, TimedEvent};
use manifold_core::graph::{ExecutionPlan, GraphDescription, GraphError, NodeId};
pub use manifold_core::io::{
    AudioBus, InputBinding, InputBus, InputChannel, IoError, IoLayout, OutputBus, OutputChannel,
    InputBuffers, OutputBuffers, prepare_planar_buffer,
};
use manifold_core::main_voice_bank::MainTemporalRecipe;
use manifold_core::sine_bank::PartialSet;
use manifold_core::temporal_partials::TemporalFrame;

pub mod author;
pub mod capture_mailbox;
pub mod host_buffers;
pub mod visual_analysis;
pub mod host_transport;
pub mod host_values;
mod io_automation;
pub mod live_events;
pub mod live_parameters;
pub mod live_routes;
pub mod loop_state_mailbox;
pub mod main_host;
pub mod main_host_buffers;
pub mod main_host_parameters;
pub mod main_host_state;
pub mod main_instrument;
pub mod main_presentation;
pub mod main_rack_document;
pub mod main_sample_handoff;
pub mod main_session;
pub mod main_session_export;
pub mod main_snapshot;
pub mod main_visual;
pub mod parameters;
pub mod project;

use parameters::{
    AutomationError, HOST_SLOT_BASE, HostParameter, TimedAutomation,
};

const MAX_SPLIT_MIDI_EVENTS: usize = 1024;
const MAX_AUTOMATION_POINTS: usize = 4096;

#[derive(Debug, PartialEq, Eq)]
pub enum NativeError {
    Io(IoError),
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
    slot_bindings: std::collections::BTreeMap<u32, u64>,
    event_scratch: Vec<TimedEvent>,
}

impl NativeProcessor {
    /// Hand a prepared graph to an enclosing instrument on the control side.
    /// Host buffers and parameter maps are discarded before audio publication.
    pub fn into_plan(self) -> ExecutionPlan {
        self.plan
    }

    pub fn transfer_retrospective_history_from(&mut self, previous: &mut Self) -> usize {
        self.plan
            .transfer_retrospective_history_from(&mut previous.plan)
    }

    /// Carry supported node histories across an authored graph publication.
    /// Call only with exclusive access at a block boundary.
    pub fn transfer_live_state_from(&mut self, previous: &Self) -> usize {
        self.plan.transfer_live_state_from(&previous.plan)
    }

    pub fn transfer_live_state_by_ids(
        &mut self,
        previous: &Self,
        identity: &[(manifold_core::graph::NodeId, manifold_core::graph::NodeId)],
    ) -> usize {
        self.plan
            .transfer_live_state_by_ids(&previous.plan, identity)
    }

    pub fn transfer_live_state_by_resolver(
        &mut self,
        previous: &Self,
        previous_id: impl Fn(manifold_core::graph::NodeId) -> Option<manifold_core::graph::NodeId>,
    ) -> usize {
        self.plan
            .transfer_live_state_by_resolver(&previous.plan, previous_id)
    }

    /// Prepare all kernels and scratch outside the host's process callback.
    pub fn prepare(
        graph: &GraphDescription,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<Self, NativeError> {
        Self::prepare_inner(graph, sample_rate, max_frames, false, None)
    }

    /// Retain prepared kernels for route edits between process blocks.
    pub fn prepare_patchable(
        graph: &GraphDescription,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<Self, NativeError> {
        Self::prepare_inner(graph, sample_rate, max_frames, true, None)
    }

    /// Prepare named buses and explicit channel routes for library/native hosts.
    pub fn prepare_with_io(
        graph: &GraphDescription,
        layout: &IoLayout,
        sample_rate: f32,
        max_frames: usize,
        patchable: bool,
    ) -> Result<Self, NativeError> {
        Self::prepare_inner(graph, sample_rate, max_frames, patchable, Some(layout))
    }

    pub fn io_layout(&self) -> Option<&IoLayout> {
        self.plan.io_layout()
    }
    pub fn validate_io(
        &self,
        inputs: &[InputBus<'_, '_>],
        outputs: &[OutputBus<'_, '_>],
        frames: usize,
        events: &[TimedEvent],
    ) -> Result<(), NativeError> {
        self.plan
            .validate_io(inputs, outputs, frames, events)
            .map_err(NativeError::Io)
    }

    /// Caller supplies the admitted bus/channel shape without allocating here.
    pub fn process_io(
        &mut self,
        inputs: &[InputBus<'_, '_>],
        outputs: &mut [OutputBus<'_, '_>],
        frames: usize,
        events: &[TimedEvent],
    ) -> Result<(), NativeError> {
        self.plan
            .process_io(inputs, outputs, frames, events)
            .map_err(NativeError::Io)
    }

    pub fn validate_io_planar(
        &self,
        input: &[f32],
        output: &mut [f32],
        stride: usize,
        frames: usize,
        events: &[TimedEvent],
    ) -> Result<(), NativeError> {
        self.plan
            .validate_io_buffers(
                &InputBuffers::Planar {
                    samples: input,
                    stride,
                },
                &OutputBuffers::Planar {
                    samples: output,
                    stride,
                },
                frames,
                events,
            )
            .map_err(NativeError::Io)
    }

    pub fn process_io_planar(
        &mut self,
        input: &[f32],
        output: &mut [f32],
        stride: usize,
        frames: usize,
        events: &[TimedEvent],
    ) -> Result<(), NativeError> {
        self.plan
            .process_io_planar(input, output, stride, frames, events)
            .map_err(NativeError::Io)
    }
    fn prepare_inner(
        graph: &GraphDescription,
        sample_rate: f32,
        max_frames: usize,
        patchable: bool,
        io: Option<&IoLayout>,
    ) -> Result<Self, NativeError> {
        if max_frames > 65_536 {
            return Err(NativeError::BlockTooLarge);
        }
        let plan = if let Some(layout) = io {
            graph.compile_with_io(sample_rate, max_frames, patchable, layout)?
        } else if patchable {
            graph.compile_patchable(sample_rate, max_frames)?
        } else {
            graph.compile(sample_rate, max_frames)?
        };
        Ok(Self {
            plan,
            max_frames,
            silence: vec![0.0; max_frames],
            host_parameters: Vec::new(),
            current_parameter_values: Vec::new(),
            slot_bindings: std::collections::BTreeMap::new(),
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

    pub(crate) fn refresh_parameter_values_from_plan(&mut self) {
        for (index, parameter) in self.host_parameters.iter().enumerate() {
            if let Some(value) = self
                .plan
                .parameter_target(parameter.node, parameter.local_id)
            {
                self.current_parameter_values[index] = value;
            }
        }
    }

    // Loop transport setters can change more than their requested target
    // (record disables play; play on an empty take remains off). Read DSP truth.
    pub(crate) fn refresh_loop_parameter_values(&mut self, node: NodeId) {
        Self::sync_loop_parameter_values(
            &self.plan,
            &self.host_parameters,
            &mut self.current_parameter_values,
            node,
        );
    }

    fn sync_loop_parameter_values(
        plan: &ExecutionPlan,
        parameters: &[HostParameter],
        values: &mut [f32],
        node: NodeId,
    ) {
        if plan.capture_revision(node).is_none() {
            return;
        }
        for (index, parameter) in parameters.iter().enumerate() {
            if parameter.node == node {
                if let Some(value) = plan.parameter_target(node, parameter.local_id) {
                    values[index] = value;
                }
            }
        }
    }

    /// Whether compilation retained this node in the prepared plan. A portable
    /// project can also describe disconnected nodes whose values stay in state.
    pub fn has_prepared_node(&self, node: NodeId) -> bool {
        self.plan.node_active(node).is_some()
    }

    /// Change a prepared edge at a block boundary. Route validation and any
    /// reorder use scratch allocated with the patchable plan.
    pub fn set_route_from(
        &mut self,
        target: NodeId,
        input_port: usize,
        source: Option<(NodeId, usize)>,
    ) -> Result<(), NativeError> {
        self.plan
            .set_route_from(target, input_port, source)
            .map_err(Into::into)
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

    pub fn capture_revision(&self, node: NodeId) -> Option<u64> {
        self.plan.capture_revision(node)
    }

    pub fn stable_capture_length(&self, node: NodeId) -> Option<usize> {
        self.plan.stable_capture_length(node)
    }

    pub fn copy_stopped_loop_interleaved(
        &self,
        node: NodeId,
        start_frame: usize,
        output: &mut [f32],
    ) -> usize {
        self.plan
            .copy_capture_interleaved(node, start_frame, output)
    }

    pub fn capture_capacity(&self, node: NodeId) -> Option<usize> {
        self.plan.capture_capacity(node)
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
    pub fn bound_graph_parameter(&self, slot: u32) -> Option<u64> {
        self.slot_bindings.get(&slot).copied()
    }

    fn parameter_for_id(&self, id: u64, fixed_slots: bool) -> Option<&HostParameter> {
        let graph_id = if fixed_slots {
            let slot = u32::try_from(id.checked_sub(u64::from(HOST_SLOT_BASE))?).ok()?;
            self.slot_bindings.get(&slot).copied()?
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
        self.refresh_loop_parameter_values(node);
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

    /// A public target batch is checked in full before changing any kernel.
    /// Call between blocks; descriptors were allocated during preparation.
    pub fn set_parameter_batch(&mut self, edits: &[(u32, u32, f64)]) -> bool {
        if edits.is_empty()
           
            || edits.iter().any(|&(node, id, value)| {
                !value.is_finite()
                    || !self.host_parameters.iter().any(|entry| {
                        entry.node == u64::from(node)
                            && entry.local_id == id
                            && entry.to_normalized(value as f32).is_some()
                            && (!entry.discrete || value.fract() == 0.)
                    })
            })
        {
            return false;
        }
        for &(node, id, value) in edits {
            if !self.set_parameter(node.into(), id, value as f32) {
                return false;
            }
        }
        true
    }

    /// Validate host/script event admission against the current sole DSP owner.
    pub fn validate_events(&self, events: &[TimedEvent], frames: usize) -> Result<(), NativeError> {
        self.plan
            .validate_events(events, frames)
            .map_err(NativeError::Event)
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

    pub fn share_sample_region(&mut self, source: NodeId, target: NodeId) -> bool {
        self.plan.share_sample_region(source, target)
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
        if self.plan.io_layout().is_some() {
            return Err(NativeError::Io(IoError::DeclaredBusesRequired));
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
        if self.plan.io_layout().is_some() {
            return Err(NativeError::Io(IoError::DeclaredBusesRequired));
        }
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
        self.validate_automation(frames, events, automation, fixed_slots)?;
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
                Self::sync_loop_parameter_values(
                    &self.plan,
                    &self.host_parameters,
                    &mut self.current_parameter_values,
                    node,
                );
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
                    output_port: 0,
                },
                Connection {
                    from: 2,
                    to: 3,
                    input_port: 1,
                    output_port: 0,
                },
                Connection {
                    from: 3,
                    to: 4,
                    input_port: 0,
                    output_port: 0,
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
                output_port: 0,
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
