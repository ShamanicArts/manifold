//! Prepared raw planar audio boundary for loadable Main plugin formats.
//! Input is copied before rendering so CLAP/VST3 in-place buffers cannot
//! create overlapping Rust slices. No scratch is allocated in `render`.

use std::ptr;

use crate::NativeError;
use crate::main_host::MainAudioRuntime;
use crate::main_instrument::{MainHostAudioBlock, MainHostEvent};

#[derive(Clone, Copy)]
pub struct RawMainHostBlock<'a> {
    pub frames: usize,
    /// Null input channels are silence. A mono bus supplies channel zero.
    pub input: [*const f32; 2],
    /// Null output channels discard their output. Input/output aliasing is allowed.
    pub output: [*mut f32; 2],
    pub actions: &'a [MainHostEvent],
}

pub struct MainHostBuffers {
    max_frames: usize,
    input: [Vec<f32>; 2],
    output: [Vec<f32>; 2],
}

impl MainHostBuffers {
    pub fn prepare(max_frames: usize) -> Self {
        let channel = || vec![0.0; max_frames];
        Self {
            max_frames,
            input: [channel(), channel()],
            output: [channel(), channel()],
        }
    }

    /// Render one raw host block through the assembled Main runtime.
    ///
    /// # Safety
    /// Each non-null input pointer must be readable for `frames` samples and
    /// each non-null output pointer writable for `frames` samples. Output
    /// channels may alias; the second copy then determines overlapping samples.
    /// The runtime and buffers must share a preparation limit.
    pub unsafe fn render(
        &mut self,
        audio: &mut MainAudioRuntime,
        block: RawMainHostBlock<'_>,
    ) -> Result<(), NativeError> {
        let frames = block.frames;
        if frames > self.max_frames {
            return Err(NativeError::BlockTooLarge);
        }
        for channel in 0..2 {
            let destination = &mut self.input[channel][..frames];
            if block.input[channel].is_null() {
                destination.fill(0.0);
            } else {
                // SAFETY: Caller guarantees readable host storage. Scratch is
                // separate from every host-owned output pointer.
                unsafe {
                    ptr::copy_nonoverlapping(block.input[channel], destination.as_mut_ptr(), frames)
                };
            }
        }
        let [input_left, input_right] = &self.input;
        let [out_left, out_right] = &mut self.output;
        audio.process_host(MainHostAudioBlock {
            input: Some([&input_left[..frames], &input_right[..frames]]),
            output: [&mut out_left[..frames], &mut out_right[..frames]],
            actions: block.actions,
        })?;
        for channel in 0..2 {
            if !block.output[channel].is_null() {
                // SAFETY: Caller guarantees writable host storage. Rust-owned
                // output scratch never aliases its destination.
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
    use crate::main_host_parameters::SYNTH_BASE;
    use crate::main_instrument::MainHostEventKind;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use serde_json::{Value, json};

    fn playing_loop() -> Vec<u8> {
        let mut state: Value = serde_json::from_str(include_str!(
            "../../../projects/main-looper/default-session-v15.json"
        ))
        .unwrap();
        state["sampleRate"] = json!(8_000);
        let samples: Vec<f32> = (0..16).map(|index| (index as f32 - 8.0) / 40.0).collect();
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|sample| sample.to_le_bytes())
            .collect();
        state["layers"][0]["frames"] = json!(8);
        state["layers"][0]["bars"] = json!(0.0625);
        state["layers"][0]["playing"] = json!(true);
        state["layers"][0]["pcmF32Base64"] = json!(STANDARD.encode(bytes));
        serde_json::to_vec(&state).unwrap()
    }

    #[test]
    fn in_place_main_host_audio_matches_separate_planar_buffers() {
        let session = playing_loop();
        let (mut alias_audio, mut alias_control) = MainAudioRuntime::prepare(8_000.0, 8).unwrap();
        let (mut split_audio, mut split_control) = MainAudioRuntime::prepare(8_000.0, 8).unwrap();
        alias_control.submit_session(&session).unwrap();
        split_control.submit_session(&session).unwrap();
        let mut alias_buffers = MainHostBuffers::prepare(8);
        let mut split_buffers = MainHostBuffers::prepare(8);
        let mut left = [0.2; 8];
        let mut right = [0.3; 8];
        let mut split_left = [0.0; 8];
        let mut split_right = [0.0; 8];
        let input_left = left;
        let input_right = right;
        // SAFETY: All host pointers refer to live eight-frame arrays. The
        // first host aliases its input and output by design.
        unsafe {
            for _ in 0..2 {
                alias_buffers
                    .render(
                        &mut alias_audio,
                        RawMainHostBlock {
                            frames: 8,
                            input: [left.as_ptr(), right.as_ptr()],
                            output: [left.as_mut_ptr(), right.as_mut_ptr()],
                            actions: &[],
                        },
                    )
                    .unwrap();
                split_buffers
                    .render(
                        &mut split_audio,
                        RawMainHostBlock {
                            frames: 8,
                            input: [input_left.as_ptr(), input_right.as_ptr()],
                            output: [split_left.as_mut_ptr(), split_right.as_mut_ptr()],
                            actions: &[],
                        },
                    )
                    .unwrap();
            }
        }
        assert_eq!(left, split_left);
        assert_eq!(right, split_right);
        assert!(left.iter().any(|sample| sample.abs() > 0.01));

        let mut too_long = [9.0; 9];
        // SAFETY: The oversized request is rejected before dereferencing.
        unsafe {
            assert_eq!(
                alias_buffers.render(
                    &mut alias_audio,
                    RawMainHostBlock {
                        frames: 9,
                        input: [ptr::null(), ptr::null()],
                        output: [too_long.as_mut_ptr(), ptr::null_mut()],
                        actions: &[],
                    }
                ),
                Err(NativeError::BlockTooLarge)
            );
        }
        assert_eq!(too_long, [9.0; 9]);

        let mut rejected = [0.6; 8];
        // SAFETY: The output is writable; validation rejects the event before
        // the scratch output is copied into host memory.
        unsafe {
            assert!(
                alias_buffers
                    .render(
                        &mut alias_audio,
                        RawMainHostBlock {
                            frames: 8,
                            input: [ptr::null(), ptr::null()],
                            output: [rejected.as_mut_ptr(), ptr::null_mut()],
                            actions: &[MainHostEvent {
                                offset: 4,
                                kind: MainHostEventKind::Parameter {
                                    id: SYNTH_BASE + 8,
                                    value: 0.5,
                                },
                            }],
                        },
                    )
                    .is_err()
            );
        }
        assert_eq!(rejected, [0.6; 8]);
    }
}
