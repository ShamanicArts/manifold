//! Prepared copy boundary for a host's raw planar audio buffers.
//!
//! Copying inputs before rendering permits in-place host buffers without
//! creating overlapping Rust slices. All scratch is allocated at setup time.

use std::ptr;

use manifold_core::events::TimedEvent;

use crate::parameters::TimedAutomation;
use crate::{AudioBlock, NativeError, NativeProcessor};
use crate::{AudioBus, IoError, IoLayout};

#[derive(Clone, Copy)]
pub struct RawInputBus<'a> {
    pub channels: &'a [*const f32],
}
#[derive(Clone, Copy)]
pub struct RawOutputBus<'a> {
    pub channels: &'a [*mut f32],
}

/// Host pointer accessors borrow the host's tables for this callback. SDK
/// adapters validate their own shape before supplying these views; the shared
/// copy boundary validates them again against the prepared logical buses.
pub trait RawInputs {
    fn bus_count(&self) -> usize;
    fn channel_count(&self, bus: usize) -> usize;
    fn channel(&self, bus: usize, channel: usize) -> *const f32;
}
pub trait RawOutputs {
    fn bus_count(&self) -> usize;
    fn channel_count(&self, bus: usize) -> usize;
    fn channel(&self, bus: usize, channel: usize) -> *mut f32;
}
impl RawInputs for &[RawInputBus<'_>] {
    fn bus_count(&self) -> usize {
        self.len()
    }
    fn channel_count(&self, bus: usize) -> usize {
        self[bus].channels.len()
    }
    fn channel(&self, bus: usize, channel: usize) -> *const f32 {
        self[bus].channels[channel]
    }
}
impl RawOutputs for &[RawOutputBus<'_>] {
    fn bus_count(&self) -> usize {
        self.len()
    }
    fn channel_count(&self, bus: usize) -> usize {
        self[bus].channels.len()
    }
    fn channel(&self, bus: usize, channel: usize) -> *mut f32 {
        self[bus].channels[channel]
    }
}

/// Shared native host copy boundary for the authored bus layout. Input/output
/// buffers may overlap: every input is copied before the first output write.
pub struct IoHostBuffers {
    max_frames: usize,
    inputs: Vec<AudioBus>,
    outputs: Vec<AudioBus>,
    input_pcm: Vec<f32>,
    output_pcm: Vec<f32>,
}

// Decimate visualization only. Bounded work, no allocation, no retained audio.
fn rms<'a>(channels: impl Iterator<Item = &'a [f32]>) -> f32 {
    let mut sum = 0.0_f32;
    let mut count = 0usize;
    for channel in channels {
        for sample in channel.iter().step_by(16) {
            sum += sample * sample;
            count += 1;
        }
    }
    if count == 0 {
        0.0
    } else {
        (sum / count as f32).sqrt()
    }
}

impl IoHostBuffers {
    /// Primary output only; mono is duplicated for the stereo analysis tap.
    pub fn output_stereo(&self, frames: usize) -> [&[f32]; 2] {
        let frames = frames.min(self.max_frames);
        let left = self.output_pcm.get(..frames).unwrap_or(&[]);
        let right = if self.outputs.first().is_some_and(|bus| bus.channels > 1) {
            &self.output_pcm[self.max_frames..self.max_frames + frames]
        } else {
            left
        };
        [left, right]
    }

    /// Decimated output energy for presentation, after a successful render.
    pub fn output_rms(&self, frames: usize) -> f32 {
        if self.max_frames == 0 {
            return 0.;
        }
        rms(self
            .output_pcm
            .chunks_exact(self.max_frames)
            .map(|pcm| &pcm[..frames.min(self.max_frames)]))
    }

    pub fn prepare(layout: &IoLayout, max_frames: usize) -> Result<Self, NativeError> {
        if max_frames > 65_536 {
            return Err(NativeError::BlockTooLarge);
        }
        let allocate = |buses: &[AudioBus]| -> Result<Vec<f32>, NativeError> {
            let channels = buses
                .iter()
                .try_fold(0usize, |sum, b| {
                    if b.channels == 0 {
                        None
                    } else {
                        sum.checked_add(b.channels)
                    }
                })
                .ok_or(NativeError::Io(IoError::BufferAllocation))?;
            manifold_core::io::prepare_planar_buffer(channels, max_frames).map_err(NativeError::Io)
        };
        Ok(Self {
            max_frames,
            inputs: layout.inputs.clone(),
            outputs: layout.outputs.clone(),
            input_pcm: allocate(&layout.inputs)?,
            output_pcm: allocate(&layout.outputs)?,
        })
    }

    /// Check the raw shape before a host admits a pending graph or events.
    pub fn validate_raw(
        &self,
        inputs: &[RawInputBus<'_>],
        outputs: &[RawOutputBus<'_>],
        frames: usize,
    ) -> Result<(), NativeError> {
        self.validate_buffers(&inputs, &outputs, frames)
    }

    pub fn validate_buffers(
        &self,
        inputs: &dyn RawInputs,
        outputs: &dyn RawOutputs,
        frames: usize,
    ) -> Result<(), NativeError> {
        if frames > self.max_frames {
            return Err(NativeError::BlockTooLarge);
        }
        if inputs.bus_count() != self.inputs.len() || outputs.bus_count() != self.outputs.len() {
            return Err(NativeError::Io(IoError::BusCount));
        }
        for (bus, declared) in self.inputs.iter().enumerate() {
            let count = inputs.channel_count(bus);
            if count == 0 && declared.optional {
                continue;
            }
            if count != declared.channels {
                return Err(NativeError::Io(IoError::ChannelCount { input: true, bus }));
            }
        }
        for (bus, declared) in self.outputs.iter().enumerate() {
            if outputs.channel_count(bus) != declared.channels {
                return Err(NativeError::Io(IoError::ChannelCount { input: false, bus }));
            }
        }
        Ok(())
    }

    /// # Safety
    /// Each non-null pointer covers `frames` f32 samples. Inputs are readable;
    /// outputs are writable. Null inputs mean silence; null outputs discard.
    /// Host buffers may alias each other, but must not alias this scratch or the
    /// processor. If outputs overlap, the later channel copy determines samples.
    pub unsafe fn render(
        &mut self,
        processor: &mut NativeProcessor,
        inputs: &[RawInputBus<'_>],
        outputs: &[RawOutputBus<'_>],
        frames: usize,
        events: &[TimedEvent],
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        unsafe { self.render_buffers(processor, &inputs, &outputs, frames, events, automation) }
    }

    /// Render SDK pointer views. Same pointer validity and aliasing requirements
    /// as `render`; accessors must keep returning valid pointers for this call.
    /// # Safety
    /// Every non-null pointer must cover `frames` samples; input pointers are
    /// readable, outputs writable, and none may alias the processor or scratch.
    pub unsafe fn render_buffers(
        &mut self,
        processor: &mut NativeProcessor,
        inputs: &dyn RawInputs,
        outputs: &dyn RawOutputs,
        frames: usize,
        events: &[TimedEvent],
        automation: &[TimedAutomation],
    ) -> Result<(), NativeError> {
        self.validate_buffers(inputs, outputs, frames)?;
        let layout = processor
            .io_layout()
            .ok_or(NativeError::Io(IoError::NotPrepared))?;
        if layout.inputs != self.inputs || layout.outputs != self.outputs {
            return Err(NativeError::Io(IoError::BusCount));
        }
        let mut index = 0;
        for (bus, declared) in self.inputs.iter().enumerate() {
            for channel in 0..declared.channels {
                let destination =
                    &mut self.input_pcm[index * self.max_frames..index * self.max_frames + frames];
                let pointer = if channel < inputs.channel_count(bus) {
                    inputs.channel(bus, channel)
                } else {
                    ptr::null()
                };
                if pointer.is_null() {
                    destination.fill(0.);
                } else {
                    unsafe { ptr::copy_nonoverlapping(pointer, destination.as_mut_ptr(), frames) };
                }
                index += 1;
            }
        }
        processor.process_io_planar_host_automated(
            &self.input_pcm,
            &mut self.output_pcm,
            self.max_frames,
            frames,
            events,
            automation,
        )?;
        let mut index = 0;
        for (bus, declared) in self.outputs.iter().enumerate() {
            for channel in 0..declared.channels {
                let pointer = outputs.channel(bus, channel);
                if !pointer.is_null() {
                    unsafe {
                        ptr::copy_nonoverlapping(
                            self.output_pcm.as_ptr().add(index * self.max_frames),
                            pointer,
                            frames,
                        )
                    };
                }
                index += 1;
            }
        }
        Ok(())
    }
}

#[derive(Clone, Copy)]
pub struct RawHostBlock<'a> {
    pub frames: usize,
    /// Null channels are silence. A mono bus supplies only channel zero.
    pub main: [*const f32; 2],
    pub sidechain: [*const f32; 2],
    /// Null channels discard their output. Input/output aliasing is allowed.
    pub output: [*mut f32; 2],
    pub events: &'a [TimedEvent],
    pub automation: &'a [TimedAutomation],
}

pub struct HostBuffers {
    max_frames: usize,
    main: [Vec<f32>; 2],
    sidechain: [Vec<f32>; 2],
    output: [Vec<f32>; 2],
}

impl HostBuffers {
    /// Primary output only; mono is duplicated for the stereo analysis tap.
    pub fn output_stereo(&self, frames: usize) -> [&[f32]; 2] {
        let frames = frames.min(self.max_frames);
        let left = self.output.get(0).map_or(&[][..], |pcm| &pcm[..frames]);
        let right = self.output.get(1).map_or(left, |pcm| &pcm[..frames]);
        [left, right]
    }

    /// Decimated output energy for presentation, after a successful render.
    pub fn output_rms(&self, frames: usize) -> f32 {
        rms(self
            .output
            .iter()
            .map(|pcm| &pcm[..frames.min(self.max_frames)]))
    }

    /// Allocate once when the host supplies its maximum block size.
    pub fn prepare(max_frames: usize) -> Self {
        let channel = || vec![0.0; max_frames];
        Self {
            max_frames,
            main: [channel(), channel()],
            sidechain: [channel(), channel()],
            output: [channel(), channel()],
        }
    }

    /// Render a host block through the prepared native processor.
    ///
    /// # Safety
    /// Each non-null input pointer must be readable for `frames` samples, and
    /// each non-null output pointer writable for `frames` samples. Output
    /// channels may alias; if they do, the second copy determines overlapping
    /// samples. The processor and buffers must have matching preparation limits.
    pub unsafe fn render(
        &mut self,
        processor: &mut NativeProcessor,
        block: RawHostBlock<'_>,
    ) -> Result<(), NativeError> {
        let frames = block.frames;
        if frames > self.max_frames {
            return Err(NativeError::BlockTooLarge);
        }
        for channel in 0..2 {
            for (source, destination) in [
                (block.main[channel], &mut self.main[channel]),
                (block.sidechain[channel], &mut self.sidechain[channel]),
            ] {
                if source.is_null() {
                    destination[..frames].fill(0.0);
                } else {
                    // SAFETY: The caller guarantees the source is readable.
                    // Scratch is independently allocated, so host aliasing is safe.
                    unsafe { ptr::copy_nonoverlapping(source, destination.as_mut_ptr(), frames) };
                }
            }
        }
        let [main_left, main_right] = &self.main;
        let [side_left, side_right] = &self.sidechain;
        let [out_left, out_right] = &mut self.output;
        processor.process_host_automated(
            AudioBlock {
                main: Some([&main_left[..frames], &main_right[..frames]]),
                sidechain: Some([&side_left[..frames], &side_right[..frames]]),
                output: [&mut out_left[..frames], &mut out_right[..frames]],
                events: block.events,
            },
            block.automation,
        )?;
        for channel in 0..2 {
            if !block.output[channel].is_null() {
                // SAFETY: The caller guarantees the destination is writable.
                // Inputs have already been copied out of host-owned memory.
                unsafe {
                    ptr::copy_nonoverlapping(
                        self.output[channel].as_ptr(),
                        block.output[channel],
                        frames,
                    )
                };
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};

    fn summed_buses() -> GraphDescription {
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
    fn in_place_host_buffers_and_missing_channels_are_safe() {
        let mut processor = NativeProcessor::prepare(&summed_buses(), 48_000.0, 16).unwrap();
        let mut buffers = HostBuffers::prepare(16);
        let mut left = [0.2; 7];
        let mut right = [0.3; 7];
        let side_left = [0.4; 7];
        let null = ptr::null();
        // SAFETY: Every non-null pointer refers to a live seven-sample array.
        unsafe {
            buffers
                .render(
                    &mut processor,
                    RawHostBlock {
                        frames: 7,
                        main: [left.as_ptr(), right.as_ptr()],
                        sidechain: [side_left.as_ptr(), null],
                        output: [left.as_mut_ptr(), right.as_mut_ptr()],
                        events: &[],
                        automation: &[],
                    },
                )
                .unwrap();
        }
        for sample in left {
            assert!((sample - 0.6).abs() < 1e-6);
        }
        assert_eq!(right, [0.3; 7]);

        // A missing main bus is silence even when previous scratch held audio.
        // SAFETY: The output arrays remain live for this call.
        unsafe {
            buffers
                .render(
                    &mut processor,
                    RawHostBlock {
                        frames: 7,
                        main: [null, null],
                        sidechain: [null, null],
                        output: [left.as_mut_ptr(), right.as_mut_ptr()],
                        events: &[],
                        automation: &[],
                    },
                )
                .unwrap();
        }
        assert_eq!(left, [0.0; 7]);
        assert_eq!(right, [0.0; 7]);
    }

    #[test]
    fn rejected_host_block_does_not_touch_output() {
        let mut processor = NativeProcessor::prepare(&summed_buses(), 48_000.0, 8).unwrap();
        let mut buffers = HostBuffers::prepare(8);
        let mut output = [9.0; 9];
        let null = ptr::null();
        // SAFETY: The output array has space for the requested frame counts.
        unsafe {
            assert_eq!(
                buffers.render(
                    &mut processor,
                    RawHostBlock {
                        frames: 9,
                        main: [null, null],
                        sidechain: [null, null],
                        output: [output.as_mut_ptr(), ptr::null_mut()],
                        events: &[],
                        automation: &[],
                    }
                ),
                Err(NativeError::BlockTooLarge)
            );
            assert_eq!(
                buffers.render(
                    &mut processor,
                    RawHostBlock {
                        frames: 8,
                        main: [null, null],
                        sidechain: [null, null],
                        output: [output.as_mut_ptr(), ptr::null_mut()],
                        events: &[],
                        automation: &[TimedAutomation {
                            offset: 0,
                            id: 77,
                            normalized: 0.5
                        }],
                    }
                ),
                Err(NativeError::Automation(
                    crate::parameters::AutomationError::UnknownParameter
                ))
            );
        }
        assert_eq!(output, [9.0; 9]);
    }
}
