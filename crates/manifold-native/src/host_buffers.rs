//! Prepared copy boundary for a host's raw planar audio buffers.
//!
//! Copying inputs before rendering permits in-place host buffers without
//! creating overlapping Rust slices. All scratch is allocated at setup time.

use std::ptr;

use manifold_core::events::TimedEvent;

use crate::parameters::TimedAutomation;
use crate::{AudioBlock, NativeError, NativeProcessor};

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
