//! A reusable native control/audio handoff for authored JavaScript projects.
//! The audio side only applies prepared commands at the start of a block.

use std::ptr::null_mut;
use std::sync::Arc;
use std::sync::atomic::{AtomicPtr, AtomicU32, AtomicU64, Ordering};

use manifold_core::events::TimedEvent;
use manifold_native::parameters::AutomationError;
use manifold_native::parameters::{HostParameter, TimedAutomation};
use manifold_native::project::{NativeProject, PreparedNativeProject};
use manifold_native::{AudioBlock, NativeError, NativeProcessor};
use serde_json::Value;

use crate::{HostCommand, HostCommandKind, ProjectJsRuntime, ScriptError};

#[derive(Debug)]
pub enum NativeHostError {
    Script(ScriptError),
    Project(String),
    Busy,
    Rejected,
    UnpublishedMutation,
    LoopSnapshotRequired,
}

impl From<ScriptError> for NativeHostError {
    fn from(value: ScriptError) -> Self {
        Self::Script(value)
    }
}

// Readback only: targets are copied from the sole DSP owner after processing.
// Allocate the table during preparation and retire it with the old runtime.
struct PublishedParameters {
    descriptors: Vec<HostParameter>,
    values: Vec<AtomicU32>,
    sequence: AtomicU64,
}

impl PublishedParameters {
    fn prepare(processor: &NativeProcessor) -> Arc<Self> {
        Arc::new(Self {
            descriptors: processor.host_parameters().to_vec(),
            values: processor
                .current_parameter_values()
                .iter()
                .map(|value| AtomicU32::new(value.to_bits()))
                .collect(),
            sequence: AtomicU64::new(0),
        })
    }

    fn publish(&self, processor: &NativeProcessor) {
        self.sequence.fetch_add(1, Ordering::AcqRel);
        for (slot, value) in self.values.iter().zip(processor.current_parameter_values()) {
            slot.store(value.to_bits(), Ordering::Relaxed);
        }
        self.sequence.fetch_add(1, Ordering::Release);
    }

    fn merge_into(&self, document: &mut Value) -> Result<(), NativeHostError> {
        let mut values = vec![0.; self.values.len()];
        let mut coherent = false;
        for _ in 0..1024 {
            let before = self.sequence.load(Ordering::Acquire);
            if before & 1 != 0 {
                std::hint::spin_loop();
                continue;
            }
            for (target, slot) in values.iter_mut().zip(&self.values) {
                *target = f32::from_bits(slot.load(Ordering::Relaxed));
            }
            // Acquire both reads and the ending sequence: no mixed block.
            std::sync::atomic::fence(Ordering::Acquire);
            if before == self.sequence.load(Ordering::Acquire) {
                coherent = true;
                break;
            }
        }
        if !coherent {
            return Err(NativeHostError::Busy);
        }
        let parameters = document["signal"]["initialParameters"]
            .as_array_mut()
            .ok_or_else(|| NativeHostError::Project("parameters missing".into()))?;
        for (descriptor, value) in self.descriptors.iter().zip(values) {
            if let Some(target) = parameters.iter_mut().find(|target| {
                target["nodeId"] == descriptor.node && target["id"] == descriptor.local_id
            }) {
                // Preserve authored decimal spelling when it represents the
                // same f32 target; readback must not create phantom edits.
                if target["value"].as_f64().map(|number| number as f32) != Some(value) {
                    target["value"] = Value::from(value);
                }
            } else if value != descriptor.initial {
                parameters.push(serde_json::json!({ "nodeId": descriptor.node,
                    "id": descriptor.local_id, "value": value }));
            }
        }
        Ok(())
    }
}

struct Pending {
    id: u64,
    command: HostCommandKind,
    replacement: Option<PreparedNativeProject>,
    replacement_parameters: Option<Arc<PublishedParameters>>,
    retired: Option<PreparedNativeProject>,
    retired_parameters: Option<Arc<PublishedParameters>>,
    accepted: bool,
}

struct Handoff {
    pending: AtomicPtr<Pending>,
    completed: AtomicPtr<Pending>,
}

impl Handoff {
    fn new() -> Self {
        Self {
            pending: AtomicPtr::new(null_mut()),
            completed: AtomicPtr::new(null_mut()),
        }
    }
}

impl Drop for Handoff {
    fn drop(&mut self) {
        for slot in [&self.pending, &self.completed] {
            let ptr = slot.swap(null_mut(), Ordering::AcqRel);
            if !ptr.is_null() {
                // Both handles must be stopped before their shared handoff is dropped.
                unsafe { drop(Box::from_raw(ptr)) };
            }
        }
    }
}

/// Stays on one control thread. It runs project JS and prepares graph changes.
pub struct NativeScriptControl {
    script: ProjectJsRuntime,
    pending_script: Option<ProjectJsRuntime>,
    handoff: Arc<Handoff>,
    sample_rate: f32,
    max_frames: usize,
    in_flight: Option<u64>,
    faulted: bool,
    current_project: Vec<u8>,
    published_parameters: Arc<PublishedParameters>,
    io_layout: Option<manifold_native::IoLayout>,
}

/// Move this handle to a native audio thread. Its `process` method never runs JS.
pub struct NativeScriptAudio {
    active: PreparedNativeProject,
    published_parameters: Arc<PublishedParameters>,
    handoff: Arc<Handoff>,
    event_scratch: Vec<TimedEvent>,
    max_frames: usize,
}

pub fn prepare_native_script(
    bundle: &str,
    saved: Option<&[u8]>,
    sample_rate: f32,
    max_frames: usize,
) -> Result<(NativeScriptControl, NativeScriptAudio), NativeHostError> {
    let script = ProjectJsRuntime::load_with_project(bundle, saved)?;
    let current_project = script.initial_project().to_vec();
    let active = NativeProject::parse(&current_project)
        .map_err(|error| NativeHostError::Project(format!("{error:?}")))?
        .prepare_patchable_with_state(sample_rate, max_frames)
        .map_err(|error| NativeHostError::Project(format!("{error:?}")))?;
    let handoff = Arc::new(Handoff::new());
    let published_parameters = PublishedParameters::prepare(&active.processor);
    let io_layout = active.processor.io_layout().cloned();
    Ok((
        NativeScriptControl {
            script,
            pending_script: None,
            handoff: Arc::clone(&handoff),
            sample_rate,
            max_frames,
            in_flight: None,
            faulted: false,
            current_project,
            published_parameters: Arc::clone(&published_parameters),
            io_layout,
        },
        NativeScriptAudio {
            active,
            handoff,
            published_parameters,
            event_scratch: Vec::with_capacity(1024),
            max_frames,
        },
    ))
}

impl NativeScriptControl {
    /// Prepare a controller and its saved graph on control, then publish through
    /// this host's existing audio handoff. The old controller stays accepted
    /// until the callback accepts the candidate. Bus changes require host restart.
    pub fn begin_load_script(&mut self, bundle: &str, saved: &[u8]) -> Result<(), NativeHostError> {
        if self.is_pending() {
            return Err(NativeHostError::Busy);
        }
        let candidate = ProjectJsRuntime::load_with_project(bundle, Some(saved))?;
        self.begin_load_runtime(candidate)
    }

    /// Publish an already validated control-side candidate. UI hosts can inspect
    /// its presentation before publication without evaluating its bundle twice.
    pub fn begin_load_runtime(
        &mut self,
        candidate: ProjectJsRuntime,
    ) -> Result<(), NativeHostError> {
        if self.is_pending() {
            return Err(NativeHostError::Busy);
        }
        let command = HostCommand {
            id: 0,
            kind: HostCommandKind::ReplaceGraph {
                document: candidate.initial_project().to_vec(),
            },
        };
        self.submit_command(command)?;
        self.pending_script = Some(candidate);
        Ok(())
    }
    /// Whether a script call still needs audio publication or acknowledgement.
    /// Calls that make no graph/parameter change can finish in `begin_call`.
    pub fn is_pending(&self) -> bool {
        self.in_flight.is_some()
    }

    pub fn current_project(&self) -> &[u8] {
        &self.current_project
    }

    pub fn presentation(&mut self) -> Result<Value, NativeHostError> {
        if !self.is_pending() {
            self.synchronize_parameters()?;
        }
        self.script.presentation().map_err(NativeHostError::Script)
    }

    /// Save the authored model with the latest coherent audio block targets.
    /// This is a control-thread operation; no pending script edit may be saved.
    pub fn save_project(&mut self) -> Result<&[u8], NativeHostError> {
        self.synchronize_parameters()?;
        let document: Value = serde_json::from_slice(&self.current_project)
            .map_err(|error| NativeHostError::Project(error.to_string()))?;
        if document["signal"]["nodes"]
            .as_array()
            .is_some_and(|nodes| nodes.iter().any(|node| node["type"] == "loop-capture"))
        {
            // Parameters alone do not serialize audio-owned takes. Call the
            // stopped audio handle's explicit snapshot instead of saving stale PCM.
            return Err(NativeHostError::LoopSnapshotRequired);
        }
        Ok(&self.current_project)
    }

    fn synchronize_parameters(&mut self) -> Result<(), NativeHostError> {
        if self.in_flight.is_some() {
            return Err(NativeHostError::Busy);
        }
        let mut document: Value = serde_json::from_slice(&self.current_project)
            .map_err(|error| NativeHostError::Project(error.to_string()))?;
        self.published_parameters.merge_into(&mut document)?;
        let published = serde_json::to_vec(&document)
            .map_err(|error| NativeHostError::Project(error.to_string()))?;
        self.adopt_published_parameters(&published)
    }

    /// Synchronize a host's accepted portable snapshot on this control thread.
    /// Call only for this controller's published topology, with no edit pending.
    pub fn adopt_published_parameters(&mut self, published: &[u8]) -> Result<(), NativeHostError> {
        if self.in_flight.is_some() {
            return Err(NativeHostError::Busy);
        }
        if self.faulted {
            return Err(NativeHostError::UnpublishedMutation);
        }
        match crate::worker::synchronize_parameters(&self.script, &self.current_project, published)
        {
            Ok(project) => {
                self.current_project = project;
                Ok(())
            }
            Err(error) => {
                if matches!(error, crate::worker::WorkerError::StateMismatch) {
                    self.faulted = true;
                }
                Err(NativeHostError::Project(format!("{error:?}")))
            }
        }
    }

    pub fn begin_set_path(&mut self, path: &str, value: f64) -> Result<(), NativeHostError> {
        if self.faulted {
            return Err(NativeHostError::UnpublishedMutation);
        }
        if self.in_flight.is_some() {
            return Err(NativeHostError::Busy);
        }
        self.synchronize_parameters()?;
        let direct = self.script.begin_set_path(path, value)?;
        self.submit_script_result(direct)
    }

    pub fn begin_call(&mut self, method: &str, args: &[Value]) -> Result<(), NativeHostError> {
        if self.faulted {
            return Err(NativeHostError::UnpublishedMutation);
        }
        if self.in_flight.is_some() {
            return Err(NativeHostError::Busy);
        }
        self.synchronize_parameters()?;
        let direct = self.script.begin_call(method, args)?;
        self.submit_script_result(direct)
    }

    fn submit_script_result(&mut self, direct: Option<Vec<u8>>) -> Result<(), NativeHostError> {
        if let Some(project) = direct {
            let before = serde_json::from_slice::<Value>(&self.current_project).ok();
            let after = serde_json::from_slice::<Value>(&project).ok();
            if before != after {
                if let Ok(accepted) = crate::publication::accepted_bookkeeping(&self.current_project, &project) {
                    self.current_project = accepted;
                    return Ok(());
                }
                self.faulted = true;
                return Err(NativeHostError::UnpublishedMutation);
            }
            return Ok(());
        }
        let command = self.script.take_command().ok_or(NativeHostError::Busy)?;
        self.submit_command(command)
    }

    fn submit_command(&mut self, command: HostCommand) -> Result<(), NativeHostError> {
        let replacement = match self.prepare_replacement(&command) {
            Ok(value) => value,
            Err(error) => {
                let _ = self.script.acknowledge(command.id, false);
                return Err(error);
            }
        };
        let replacement_parameters = replacement
            .as_ref()
            .map(|project| PublishedParameters::prepare(&project.processor));
        let id = command.id;
        let action = Box::into_raw(Box::new(Pending {
            id,
            command: command.kind,
            replacement,
            replacement_parameters,
            retired: None,
            retired_parameters: None,
            accepted: false,
        }));
        if self
            .handoff
            .pending
            .compare_exchange(null_mut(), action, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            unsafe { drop(Box::from_raw(action)) };
            let _ = self.script.acknowledge(id, false);
            return Err(NativeHostError::Busy);
        }
        self.in_flight = Some(id);
        Ok(())
    }

    fn prepare_replacement(
        &self,
        command: &HostCommand,
    ) -> Result<Option<PreparedNativeProject>, NativeHostError> {
        if let HostCommandKind::Metadata { document } = &command.kind {
            let mut current: Value = serde_json::from_slice(&self.current_project)
                .map_err(|error| NativeHostError::Project(error.to_string()))?;
            let mut candidate: Value = serde_json::from_slice(document)
                .map_err(|error| NativeHostError::Project(error.to_string()))?;
            current.as_object_mut().ok_or_else(|| NativeHostError::Project("Invalid current project".into()))?.remove("liveAuthoring");
            candidate.as_object_mut().ok_or_else(|| NativeHostError::Project("Invalid metadata project".into()))?.remove("liveAuthoring");
            if current != candidate {
                return Err(NativeHostError::Project("Metadata edit changed the DSP project".into()));
            }
            return Ok(None);
        }
        let HostCommandKind::ReplaceGraph { document } = &command.kind else {
            return Ok(None);
        };
        let project = NativeProject::parse(document)
            .map_err(|error| NativeHostError::Project(format!("{error:?}")))?;
        let same_buses = |a: &[manifold_native::AudioBus], b: &[manifold_native::AudioBus]| {
            a.len() == b.len()
                && a.iter().zip(b).all(|(a, b)| {
                    a.id == b.id && a.channels == b.channels && a.optional == b.optional
                })
        };
        let same_shape = match (project.io_layout(), self.io_layout.as_ref()) {
            (None, None) => true,
            (Some(a), Some(b)) => {
                same_buses(&a.inputs, &b.inputs) && same_buses(&a.outputs, &b.outputs)
            }
            _ => false,
        };
        if !same_shape {
            return Err(NativeHostError::Project(
                "Host bus IDs/counts/requirements require a new native host; active graph retained"
                    .into(),
            ));
        }
        let mut prepared = project
            .prepare_patchable_with_state(self.sample_rate, self.max_frames)
            .map_err(|error| NativeHostError::Project(format!("{error:?}")))?;
        prepared
            .plan_parameter_inheritance(&self.current_project)
            .map_err(|error| NativeHostError::Project(format!("{error:?}")))?;
        Ok(Some(prepared))
    }

    fn adopt_partial_publication(
        &mut self,
        command: &HostCommandKind,
    ) -> Result<(), NativeHostError> {
        let project = self.script.snapshot_project()?;
        if crate::publication::accepted_project(&self.current_project, command, &project).is_err() {
            self.faulted = true;
            return Err(NativeHostError::UnpublishedMutation);
        }
        self.current_project = project;
        Ok(())
    }

    /// Poll after the audio callback. Disposal of the retired graph and the JS
    /// acknowledgement both happen on this control thread.
    pub fn poll(&mut self) -> Result<Option<&[u8]>, NativeHostError> {
        let ptr = self.handoff.completed.swap(null_mut(), Ordering::AcqRel);
        if ptr.is_null() {
            return Ok(None);
        }
        let completed = unsafe { Box::from_raw(ptr) };
        if self.in_flight.take() != Some(completed.id) {
            return Err(NativeHostError::Busy);
        }
        if !completed.accepted {
            if self.pending_script.take().is_none() {
                let _ = self.script.acknowledge(completed.id, false);
            }
            return Err(NativeHostError::Rejected);
        }
        if let Some(parameters) = completed.replacement_parameters.as_ref() {
            self.published_parameters = Arc::clone(parameters);
        }
        if let Some(candidate) = self.pending_script.take() {
            self.current_project = candidate.initial_project().to_vec();
            self.script = candidate;
            self.faulted = false;
            self.synchronize_parameters()?;
            return Ok(Some(&self.current_project));
        }
        let saved = self.script.acknowledge(completed.id, true)?;
        if let Some(saved) = saved {
            self.current_project = saved;
            self.synchronize_parameters()?;
            return Ok(Some(&self.current_project));
        }
        self.adopt_partial_publication(&completed.command)?;
        if let Some(next) = self.script.take_command() {
            self.submit_command(next)?;
        }
        Ok(None)
    }
}

impl Drop for NativeScriptAudio {
    fn drop(&mut self) {
        let ptr = self.handoff.pending.swap(null_mut(), Ordering::AcqRel);
        if !ptr.is_null() {
            unsafe { (*ptr).accepted = false };
            self.handoff.completed.store(ptr, Ordering::Release);
        }
    }
}

impl NativeScriptAudio {
    /// Call on the control thread after device processing has stopped and this
    /// audio handle has been returned to its owner. Allocates/encodes PCM here,
    /// never from `process`. Accepted pending edits publish before the snapshot;
    /// the controller must still poll their completion. JS local state is not
    /// serialized by this graph/PCM snapshot.
    pub fn stop_and_snapshot(&mut self) -> Result<Vec<u8>, NativeHostError> {
        self.active.cancel_capture_staging_for_host_stop();
        self.apply_pending();
        let pending = self.handoff.pending.load(Ordering::Acquire);
        if !pending.is_null()
            && matches!(
                unsafe { &(*pending).command },
                HostCommandKind::Event { .. }
            )
        {
            let ptr = self.handoff.pending.swap(null_mut(), Ordering::AcqRel);
            self.handoff.completed.store(ptr, Ordering::Release);
        }
        if !self.active.finish_recording_loops_for_host_stop() {
            return Err(NativeHostError::Rejected);
        }
        self.published_parameters.publish(&self.active.processor);
        self.active
            .save_state()
            .map_err(|error| NativeHostError::Project(format!("{error:?}")))
    }

    /// Prepared bus declaration; hosts can allocate their adapters before audio starts.
    pub fn io_layout(&self) -> Option<&manifold_native::IoLayout> {
        self.active.processor.io_layout()
    }

    pub fn process(&mut self, block: AudioBlock<'_>) -> Result<(), NativeError> {
        self.process_inner(block, None)
    }

    /// Scripted library host with explicit buses. Publication, timed events and
    /// accepted targets follow the same protocol as the stereo convenience API.
    pub fn process_io(
        &mut self,
        inputs: &[manifold_native::InputBus<'_, '_>],
        outputs: &mut [manifold_native::OutputBus<'_, '_>],
        frames: usize,
        events: &[manifold_core::events::TimedEvent],
    ) -> Result<(), NativeError> {
        if events.len() > 1024 {
            return Err(NativeError::Automation(AutomationError::TooManyEvents));
        }
        self.active
            .processor
            .validate_io(inputs, outputs, frames, events)?;
        self.render_with_pending(events, frames, |processor, merged| {
            processor.process_io(inputs, outputs, frames, merged)
        })
    }

    /// Contiguous planar counterpart of `process_io`, using the same live
    /// publication and event protocol without rebuilding borrowed bus tables.
    pub fn process_io_planar(
        &mut self,
        inputs: &[f32],
        outputs: &mut [f32],
        stride: usize,
        frames: usize,
        events: &[manifold_core::events::TimedEvent],
    ) -> Result<(), NativeError> {
        if events.len() > 1024 {
            return Err(NativeError::Automation(AutomationError::TooManyEvents));
        }
        self.active
            .processor
            .validate_io_planar(inputs, outputs, stride, frames, events)?;
        self.render_with_pending(events, frames, |processor, merged| {
            processor.process_io_planar(inputs, outputs, stride, frames, merged)
        })
    }
    /// Host automation shares the same prepared processor and sample offsets.
    pub fn process_host_automated(
        &mut self,
        block: AudioBlock<'_>,
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        self.process_inner(block, Some(automation))
    }

    fn process_inner(
        &mut self,
        block: AudioBlock<'_>,
        automation: Option<&[TimedAutomation]>,
    ) -> Result<(), NativeError> {
        if self.active.processor.io_layout().is_some() {
            return Err(NativeError::Io(
                manifold_native::IoError::DeclaredBusesRequired,
            ));
        }
        let AudioBlock {
            main,
            sidechain,
            output,
            events,
        } = block;
        let frames = output[0].len();
        // A malformed or empty host block must not consume a pending script event.
        if frames > self.max_frames {
            return Err(NativeError::BlockTooLarge);
        }
        if output[1].len() != frames
            || main.is_some_and(|bus| bus.iter().any(|channel| channel.len() != frames))
            || sidechain.is_some_and(|bus| bus.iter().any(|channel| channel.len() != frames))
        {
            return Err(NativeError::ChannelLengthMismatch);
        }
        if events.len() > 1024 {
            return Err(NativeError::Automation(AutomationError::TooManyEvents));
        }
        self.active.processor.validate_events(events, frames)?;
        self.render_with_pending(events, frames, |processor, merged| {
            let block = AudioBlock {
                main,
                sidechain,
                output,
                events: merged,
            };
            match automation {
                Some(automation) => processor.process_host_automated(block, automation),
                None => processor.process(block),
            }
        })
    }

    fn render_with_pending(
        &mut self,
        events: &[manifold_core::events::TimedEvent],
        frames: usize,
        render: impl FnOnce(
            &mut manifold_native::NativeProcessor,
            &[manifold_core::events::TimedEvent],
        ) -> Result<(), NativeError>,
    ) -> Result<(), NativeError> {
        self.apply_pending();
        self.event_scratch.clear();
        let mut event_action = null_mut();
        let pending = self.handoff.pending.load(Ordering::Acquire);
        if frames > 0
            && !pending.is_null()
            && self.handoff.completed.load(Ordering::Acquire).is_null()
        {
            if let HostCommandKind::Event { event } = unsafe { &(*pending).command } {
                // Leave an event pending when the host filled the bounded buffer.
                if events.len() < self.event_scratch.capacity() {
                    let event = *event;
                    event_action = self.handoff.pending.swap(null_mut(), Ordering::AcqRel);
                    if self
                        .active
                        .processor
                        .validate_events(&[event], frames)
                        .is_ok()
                    {
                        let split = events.partition_point(|host| host.offset < event.offset);
                        self.event_scratch.extend_from_slice(&events[..split]);
                        self.event_scratch.push(event);
                        self.event_scratch.extend_from_slice(&events[split..]);
                    } else {
                        // Rejection is acknowledged on control; host audio still runs.
                        self.handoff
                            .completed
                            .store(event_action, Ordering::Release);
                        event_action = null_mut();
                    }
                }
            }
        }
        let merged = if self.event_scratch.is_empty() {
            events
        } else {
            &self.event_scratch
        };
        let result = render(&mut self.active.processor, merged);
        self.published_parameters.publish(&self.active.processor);
        if !event_action.is_null() {
            unsafe {
                (*event_action).accepted = result.is_ok();
            }
            self.handoff
                .completed
                .store(event_action, Ordering::Release);
        }
        result
    }

    fn apply_pending(&mut self) {
        // The control side must consume one completion before submitting the next.
        if !self.handoff.completed.load(Ordering::Acquire).is_null() {
            return;
        }
        let ptr = self.handoff.pending.swap(null_mut(), Ordering::AcqRel);
        if ptr.is_null() {
            return;
        }
        let action = unsafe { &mut *ptr };
        if matches!(action.command, HostCommandKind::Event { .. }) {
            self.handoff.pending.store(ptr, Ordering::Release);
            return;
        }
        if action
            .replacement
            .as_ref()
            .is_some_and(|next| !next.live_history_ready_from(&self.active))
        {
            // One in-flight command is enforced by the control handle. Keep
            // this candidate owned and continue the old capture until it clears.
            self.handoff.pending.store(ptr, Ordering::Release);
            return;
        }
        action.accepted = match &action.command {
            HostCommandKind::Event { .. } => unreachable!(),
            HostCommandKind::ParameterBatch { edits } => {
                self.active.processor.set_parameter_batch(edits)
            }
            HostCommandKind::Parameter { node, id, value } => {
                self.active
                    .processor
                    .set_parameter((*node).into(), *id, *value as f32)
            }
            HostCommandKind::Route {
                to,
                input_port,
                from,
                output_port,
            } => self
                .active
                .processor
                .set_route_from(
                    (*to).into(),
                    *input_port as usize,
                    (*from != 0).then_some(((*from).into(), *output_port as usize)),
                )
                .is_ok(),
            HostCommandKind::ReplaceGraph { .. } => {
                if let Some(mut next) = action.replacement.take() {
                    next.adopt_live_replacement_from(&mut self.active, false);
                    action.retired = Some(self.active.publish_replacement(next));
                    let next_parameters = Arc::clone(
                        action
                            .replacement_parameters
                            .as_ref()
                            .expect("prepared parameter readback"),
                    );
                    action.retired_parameters = Some(std::mem::replace(
                        &mut self.published_parameters,
                        next_parameters,
                    ));
                    true
                } else {
                    false
                }
            }
            HostCommandKind::Metadata { .. } => true,
        };
        self.handoff.completed.store(ptr, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::Pending;

    #[test]
    fn native_parameter_readback_never_merges_targets_from_different_blocks() {
        use super::PublishedParameters;
        use std::sync::atomic::{AtomicBool, Ordering};
        let fixture =
            include_bytes!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
        let mut project = manifold_native::project::NativeProject::parse(fixture)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        for node in [4_u32, 5] {
            assert!(project.processor.set_parameter(node.into(), 0, 0.25));
        }
        let snapshot = PublishedParameters::prepare(&project.processor);
        let running = AtomicBool::new(true);
        std::thread::scope(|scope| {
            let writer = scope.spawn(|| {
                let mut value = 0.25;
                for _ in 0..100_000 {
                    if !running.load(Ordering::Acquire) {
                        break;
                    }
                    value = if value == 0.25 { 0.75 } else { 0.25 };
                    for node in [4_u32, 5] {
                        assert!(project.processor.set_parameter(node.into(), 0, value));
                    }
                    snapshot.publish(&project.processor);
                }
            });
            let mut observed = 0;
            for _ in 0..512 {
                let mut document: serde_json::Value = serde_json::from_slice(fixture).unwrap();
                match snapshot.merge_into(&mut document) {
                    Ok(()) => observed += 1,
                    Err(super::NativeHostError::Busy) => continue,
                    Err(error) => panic!("{error:?}"),
                }
                let parameters = document["signal"]["initialParameters"].as_array().unwrap();
                let value = |node| {
                    parameters
                        .iter()
                        .find(|parameter| parameter["nodeId"] == node && parameter["id"] == 0)
                        .unwrap()["value"]
                        .as_f64()
                        .unwrap()
                };
                assert_eq!(value(4), value(5));
            }
            running.store(false, Ordering::Release);
            writer.join().unwrap();
            assert!(observed > 0);
        });
    }

    #[test]
    fn prepared_action_is_safe_to_transfer_to_the_audio_thread() {
        fn requires_send<T: Send>() {}
        requires_send::<Pending>();
    }
}
