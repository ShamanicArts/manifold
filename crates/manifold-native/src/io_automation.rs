//! The same timed host controls applied to explicitly declared planar buses.
use super::*;
use manifold_core::io::{InputBuffers, OutputBuffers};

impl NativeProcessor {
    /// Apply a host's inactive/zero-frame control flush without rendering audio.
    pub fn flush_host_automation(
        &mut self,
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        self.validate_automation(0, &[], automation, true)?;
        for point in automation {
            let descriptor = *self.parameter_for_id(point.id, true).expect("validated ID");
            let applied = self.set_parameter(
                descriptor.node,
                descriptor.local_id,
                descriptor
                    .from_normalized(point.normalized)
                    .expect("validated value"),
            );
            debug_assert!(applied);
        }
        Ok(())
    }
    /// Sample-offset automation using the project's graph parameter IDs.
    pub fn process_io_automated(
        &mut self,
        inputs: &[InputBus<'_, '_>],
        outputs: &mut [OutputBus<'_, '_>],
        frames: usize,
        events: &[TimedEvent],
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        self.process_io_automated_impl(inputs, outputs, frames, events, automation, false)
    }

    /// Sample-offset automation using the fixed CLAP/VST3 host slots.
    pub fn process_io_host_automated(
        &mut self,
        inputs: &[InputBus<'_, '_>],
        outputs: &mut [OutputBus<'_, '_>],
        frames: usize,
        events: &[TimedEvent],
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        self.process_io_automated_impl(inputs, outputs, frames, events, automation, true)
    }

    fn process_io_automated_impl(
        &mut self,
        inputs: &[InputBus<'_, '_>],
        outputs: &mut [OutputBus<'_, '_>],
        frames: usize,
        events: &[TimedEvent],
        automation: &[TimedAutomation],
        fixed_slots: bool,
    ) -> Result<(), NativeError> {
        self.process_io_buffers_automated(
            &InputBuffers::Buses(inputs),
            &mut OutputBuffers::Buses(outputs),
            frames,
            events,
            automation,
            fixed_slots,
        )
    }

    /// Contiguous planar audio with fixed host-slot automation. Storage is owned
    /// by the caller and prepared before playback.
    pub fn process_io_planar_host_automated(
        &mut self,
        input: &[f32],
        output: &mut [f32],
        stride: usize,
        frames: usize,
        events: &[TimedEvent],
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        self.process_io_buffers_automated(
            &InputBuffers::Planar {
                samples: input,
                stride,
            },
            &mut OutputBuffers::Planar {
                samples: output,
                stride,
            },
            frames,
            events,
            automation,
            true,
        )
    }

    fn process_io_buffers_automated(
        &mut self,
        inputs: &InputBuffers<'_, '_, '_>,
        outputs: &mut OutputBuffers<'_, '_, '_>,
        frames: usize,
        events: &[TimedEvent],
        automation: &[TimedAutomation],
        fixed_slots: bool,
    ) -> Result<(), NativeError> {
        self.plan
            .validate_io_buffers(inputs, outputs, frames, events)
            .map_err(NativeError::Io)?;
        if automation.is_empty() {
            return self
                .plan
                .process_io_buffers_range(inputs, outputs, frames, 0..frames, events)
                .map_err(NativeError::Io);
        }
        self.validate_automation(frames, events, automation, fixed_slots)?;
        let mut start = 0;
        let mut point_index = 0;
        let mut event_index = 0;
        loop {
            while point_index < automation.len() && automation[point_index].offset == start {
                let point = automation[point_index];
                let descriptor = *self
                    .parameter_for_id(point.id, fixed_slots)
                    .expect("validated ID");
                let value = descriptor
                    .from_normalized(point.normalized)
                    .expect("validated value");
                let applied = self.set_parameter(descriptor.node, descriptor.local_id, value);
                debug_assert!(applied);
                point_index += 1;
            }
            if start == frames {
                break;
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
                .process_io_buffers_range(inputs, outputs, frames, start..end, &self.event_scratch)
                .map_err(NativeError::Io)?;
            start = end;
        }
        Ok(())
    }

    pub(super) fn validate_automation(
        &self,
        frames: usize,
        events: &[TimedEvent],
        automation: &[TimedAutomation],
        fixed_slots: bool,
    ) -> Result<(), NativeError> {
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
        Ok(())
    }
}
