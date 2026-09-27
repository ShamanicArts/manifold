//! Thin, single-instance AudioWorklet ABI. Graph and buffers are allocated only at prepare.

use manifold_core::chorus;
use manifold_core::compressor;
use manifold_core::effect_slot;
use manifold_core::events::{EventKind, TimedEvent};
use manifold_core::graph::{Connection, ExecutionPlan, GraphDescription, NodeKind, NodeSpec};
use manifold_core::limiter;
use manifold_core::main_instrument::MainInstrument;
use manifold_core::main_voice_bank::{MAX_MAIN_TEMPORAL_TARGETS, MainTemporalRecipe};
use manifold_core::phaser;
use manifold_core::sample_analysis::{PEAK_BINS, SampleSummary, analyze_stereo};
use manifold_core::sample_region::{MAX_SAMPLE_FRAMES, MAX_SAMPLE_SECONDS, StereoSampleUpload};
use manifold_core::sine_bank::{MAX_PARTIALS, Partial, PartialSet};
use manifold_core::spectral_targets::{
    AddFlavor, MorphRecipe, SpectralShape, WaveRecipe, build_wave_recipe, prepare_add_target,
    prepare_morph_target,
};
use manifold_core::stereo_delay;
use manifold_core::temporal_partials::{
    MAX_TEMPORAL_FRAMES, TemporalAnalysis, TemporalFrame, analyze_temporal_stereo,
};
use std::cell::RefCell;

struct WorkletEngine {
    plan: ExecutionPlan,
    capacity: usize,
    input: Vec<f32>,
    output: Vec<f32>,
    events: Vec<TimedEvent>,
    sample_upload: Option<(u32, f32, Vec<f32>)>,
    sample_replace_upload: Option<(u32, StereoSampleUpload)>,
    capture_publish: Option<CapturePublish>,
    partial_upload: Option<(u32, u32, PartialSet)>,
    temporal_upload: Option<(u32, Vec<f32>)>,
    temporal_raw_upload: Option<(u32, Vec<f32>, [f32; 10])>,
}

struct LooperEngine {
    instrument: MainInstrument,
    capacity: usize,
    input: Vec<f32>,
    output: Vec<f32>,
    transfer: Vec<f32>,
    sample_upload: Option<StereoSampleUpload>,
}

struct CapturePublish {
    capture: u32,
    instrument: u32,
    source_rate: f32,
    frames: usize,
    copied: usize,
    stereo: Vec<f32>,
}

struct AnalysisJob {
    source_rate: f32,
    stereo: Vec<f32>,
    result: Option<SampleSummary>,
    temporal: Option<TemporalAnalysis>,
    recipe: [f32; 11],
    target: Option<PartialSet>,
}

struct GraphBuilder {
    description: GraphDescription,
    expected_nodes: usize,
    expected_connections: usize,
    patchable: bool,
}

thread_local! {
    static ENGINE: RefCell<Option<WorkletEngine>> = const { RefCell::new(None) };
    static GRAPH_BUILDER: RefCell<Option<GraphBuilder>> = const { RefCell::new(None) };
    static ANALYSIS: RefCell<Option<AnalysisJob>> = const { RefCell::new(None) };
    static LOOPER: RefCell<Option<LooperEngine>> = const { RefCell::new(None) };
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_prepare(sample_rate: f32, capacity: u32) -> u32 {
    if !sample_rate.is_finite()
        || !(8_000.0..=192_000.0).contains(&sample_rate)
        || !(1..=2048).contains(&capacity)
    {
        return 0;
    }
    LOOPER.with(|slot| {
        *slot.borrow_mut() = Some(LooperEngine {
            instrument: MainInstrument::new(sample_rate, capacity as usize),
            capacity: capacity as usize,
            input: vec![0.0; capacity as usize * 2],
            output: vec![0.0; capacity as usize * 2],
            transfer: vec![0.0; 4096 * 2],
            sample_upload: None,
        })
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_input_ptr() -> *mut f32 {
    LOOPER.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |e| e.input.as_mut_ptr())
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_output_ptr() -> *const f32 {
    LOOPER.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |e| e.output.as_ptr())
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_process(frames: u32) -> u32 {
    LOOPER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(e) = slot.as_mut() else { return 0 };
        let frames = frames as usize;
        if frames > e.capacity {
            return 0;
        }
        let (left_in, right_in) = e.input.split_at(e.capacity);
        let (left_out, right_out) = e.output.split_at_mut(e.capacity);
        e.instrument.process(
            [&left_in[..frames], &right_in[..frames]],
            [&mut left_out[..frames], &mut right_out[..frames]],
        );
        1
    })
}
/// Main voice bank events use the same prepared Rust instrument as the looper.
/// 0 = note on, 1 = note off, 2 = all notes off.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_note(kind: u32, note: u32, velocity: u32) -> u32 {
    let event = match kind {
        0 if note <= 127 && (1..=127).contains(&velocity) => EventKind::NoteOn {
            channel: 0,
            note: note as u8,
            velocity: velocity as u8,
        },
        1 if note <= 127 => EventKind::NoteOff {
            channel: 0,
            note: note as u8,
        },
        2 => EventKind::AllNotesOff,
        _ => return 0,
    };
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            e.instrument.synth_event(event);
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_parameter(id: u32, value: f32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            u32::from(e.instrument.set_synth_parameter(id, value))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_eq_response(frequency: f32) -> f32 {
    LOOPER.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|e| e.instrument.eq_response_db_at(frequency))
            .unwrap_or(0.0)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_sample_frames() -> u32 {
    LOOPER.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |e| e.instrument.synth_sample_frames() as u32)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_sample_clear() -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            if e.sample_upload.is_some() {
                return 0;
            }
            e.instrument.clear_sample_source();
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_sample_peak(start: u32, end: u32) -> f32 {
    LOOPER.with(|slot| {
        slot.borrow().as_ref().map_or(0.0, |e| {
            e.instrument.synth_sample_peak(start as usize, end as usize)
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_sample_export_chunk(offset: u32, frames: u32) -> u32 {
    if frames == 0 || frames > 4096 {
        return 0;
    }
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            e.instrument.copy_synth_sample_interleaved(
                offset as usize,
                &mut e.transfer[..frames as usize * 2],
            ) as u32
        })
    })
}

/// Source 0 = dry Live input; 1-4 = loop playback after gate, before volume.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_capture(source: u32, bars: f32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            if e.sample_upload.is_some() {
                return 0;
            }
            e.instrument.request_sample_source(source as usize, bars) as u32
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_free_start(source: u32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            if e.sample_upload.is_some() {
                return 0;
            }
            u32::from(e.instrument.start_free_sample(source as usize))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_free_finish() -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(0, |e| e.instrument.finish_free_sample() as u32)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_free_elapsed() -> u32 {
    LOOPER.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |e| e.instrument.free_sample_elapsed_frames() as u32)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_free_cancel() {
    LOOPER.with(|slot| {
        if let Some(e) = slot.borrow_mut().as_mut() {
            e.instrument.cancel_free_sample();
        }
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_progress() -> u32 {
    LOOPER.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |e| e.instrument.sample_progress().0 as u32)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_captured_frames(source: u32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow().as_ref().map_or(0, |e| {
            e.instrument.sample_captured_frames(source as usize) as u32
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_publish_begin() -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            let (copied, frames) = e.instrument.sample_progress();
            if frames == 0 || copied != frames || e.sample_upload.is_some() {
                return 0;
            }
            let Some(upload) = StereoSampleUpload::new(frames, e.instrument.sample_rate()) else {
                return 0;
            };
            e.sample_upload = Some(upload);
            frames as u32
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_publish_chunk(offset: u32, frames: u32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            if frames == 0 || frames > 4096 {
                return 0;
            }
            let Some(upload) = e.sample_upload.as_mut() else {
                return 0;
            };
            let offset = offset as usize;
            let frames = frames as usize;
            if !upload.prepare_next(offset, frames) {
                return 0;
            }
            if !e.instrument.copy_sample_chunk(
                offset,
                &mut upload.samples_mut()[offset * 2..(offset + frames) * 2],
            ) {
                e.sample_upload = None;
                return 0;
            }
            u32::from(upload.validate_next(offset, frames))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_publish_finish() -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            let Some(upload) = e.sample_upload.take() else {
                return 0;
            };
            let Some(sample) = upload.finish() else {
                return 0;
            };
            e.instrument.load_validated_sample(sample);
            e.instrument.release_sample();
            1
        })
    })
}

/// Restore saved Main Sample PCM outside the audio callback, in bounded chunks.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_sample_import_begin(frames: u32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            if e.sample_upload.is_some() {
                return 0;
            }
            let Some(upload) = StereoSampleUpload::new(frames as usize, e.instrument.sample_rate())
            else {
                return 0;
            };
            e.sample_upload = Some(upload);
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_sample_import_chunk(offset: u32, frames: u32) -> u32 {
    if frames == 0 || frames > 4096 {
        return 0;
    }
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            let Some(upload) = e.sample_upload.as_mut() else {
                return 0;
            };
            let offset = offset as usize;
            let frames = frames as usize;
            if !upload.prepare_next(offset, frames) {
                return 0;
            }
            upload.samples_mut()[offset * 2..(offset + frames) * 2]
                .copy_from_slice(&e.transfer[..frames * 2]);
            u32::from(upload.validate_next(offset, frames))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_sample_import_finish() -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            let Some(upload) = e.sample_upload.take() else {
                return 0;
            };
            let Some(sample) = upload.finish() else {
                return 0;
            };
            e.instrument.load_validated_sample(sample);
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_synth_sample_import_cancel() {
    LOOPER.with(|slot| {
        if let Some(e) = slot.borrow_mut().as_mut() {
            e.sample_upload = None;
        }
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_sample_cancel() {
    LOOPER.with(|slot| {
        if let Some(e) = slot.borrow_mut().as_mut() {
            e.sample_upload = None;
            e.instrument.release_sample();
        }
    });
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_control(id: u32, value: f32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            u32::from(e.instrument.looper_mut().set_control(id, value))
        })
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_layer_control(layer: u32, id: u32, value: f32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            u32::from(
                e.instrument
                    .looper_mut()
                    .set_layer_control(layer as usize, id, value),
            )
        })
    })
}
/// Commands: 0 start REC, 1 stop REC, 2 play, 3 pause, 4 stop, 5 clear all,
/// 6 commit recent bars, 7 click segment, 8 fire armed, 9 clear selected layer.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_command(id: u32, value: f32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            let l = e.instrument.looper_mut();
            match id {
                0 => {
                    l.start_recording();
                    1
                }
                1 => u32::from(l.stop_recording()),
                2 => {
                    l.play_all();
                    1
                }
                3 => {
                    l.pause_all();
                    1
                }
                4 => {
                    l.stop_all();
                    1
                }
                5 => {
                    l.clear_all();
                    1
                }
                6 => u32::from(l.commit(value)),
                7 => u32::from(l.click_capture_segment(value)),
                8 => u32::from(l.fire_forward()),
                9 => {
                    l.clear_layer(value as usize);
                    1
                }
                _ => 0,
            }
        })
    })
}
/// Scalar status fields for a 10 Hz presentation poll.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_status(id: u32, layer: u32) -> f32 {
    LOOPER.with(|slot| {
        slot.borrow().as_ref().map_or(0.0, |e| {
            let l = e.instrument.looper();
            let index = layer as usize;
            match id {
                0 => l.tempo(),
                1 => l.active() as f32,
                2 => l.mode() as u32 as f32,
                3 => l.recording() as u8 as f32,
                4 => l.overdub() as u8 as f32,
                5 => l.forward_bars().unwrap_or(0.0),
                6 => l.samples_per_bar(),
                7 => l.layer_state(index) as u32 as f32,
                8 => l.layer_length(index) as f32,
                9 => l.layer_position(index),
                10 => l.layer_bars(index),
                11 => l.layer_pending(index),
                12 => l.capture_frames(index) as f32,
                13..=16 => l.layer_control(index, id - 13),
                17 => l.target_bpm(),
                18 => l.overdub_length_wins() as u8 as f32,
                19 => l.sample_rate(),
                _ => 0.0,
            }
        })
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_peak(layer: u32, kind: u32, start: u32, end: u32) -> f32 {
    LOOPER.with(|slot| {
        slot.borrow().as_ref().map_or(0.0, |e| {
            e.instrument
                .looper()
                .peak(layer as usize, kind, start as usize, end as usize)
        })
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_transfer_ptr() -> *mut f32 {
    LOOPER.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |e| e.transfer.as_mut_ptr())
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_export_chunk(layer: u32, offset: u32, frames: u32) -> u32 {
    if frames == 0 || frames > 4096 {
        return 0;
    }
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            e.instrument.looper().copy_loop_interleaved(
                layer as usize,
                offset as usize,
                &mut e.transfer[..frames as usize * 2],
            ) as u32
        })
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_import_begin(
    layer: u32,
    frames: u32,
    bars: f32,
    position: f32,
    playing: u32,
) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            u32::from(e.instrument.looper_mut().begin_layer_load(
                layer as usize,
                frames as usize,
                bars,
                position,
                playing != 0,
            ))
        })
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_import_chunk(layer: u32, offset: u32, frames: u32) -> u32 {
    if frames == 0 || frames > 4096 {
        return 0;
    }
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            u32::from(e.instrument.looper_mut().load_layer_chunk(
                layer as usize,
                offset as usize,
                &e.transfer[..frames as usize * 2],
            ))
        })
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_import_finish(layer: u32) -> u32 {
    LOOPER.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |e| {
            u32::from(e.instrument.looper_mut().finish_layer_load(layer as usize))
        })
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn manifold_looper_import_cancel(layer: u32) {
    LOOPER.with(|slot| {
        if let Some(e) = slot.borrow_mut().as_mut() {
            e.instrument.looper_mut().cancel_layer_load(layer as usize);
        }
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_version() -> u32 {
    4
}

/// Background-worker sample analysis ABI. This instance must not be the live audio worklet.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_begin(frames: u32, source_rate: f32) -> u32 {
    if frames == 0
        || frames as usize > MAX_SAMPLE_FRAMES
        || !source_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&source_rate)
        || frames as usize > (source_rate as usize).saturating_mul(MAX_SAMPLE_SECONDS)
    {
        return 0;
    }
    ANALYSIS.with(|slot| {
        *slot.borrow_mut() = Some(AnalysisJob {
            source_rate,
            stereo: vec![0.0; frames as usize * 2],
            result: None,
            temporal: None,
            recipe: [1.0, 8.0, 0.0, 0.0, 0.5, 0.0, 0.5, 0.5, 2.0, 0.0, 0.0],
            target: None,
        });
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_ptr() -> *mut f32 {
    ANALYSIS.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |job| job.stereo.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_run() -> u32 {
    ANALYSIS.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |job| {
            job.result = analyze_stereo(&job.stereo, job.source_rate);
            job.temporal = None;
            job.target = None;
            job.stereo = Vec::new();
            u32::from(job.result.is_some())
        })
    })
}

/// Full source summary plus bounded source-region partial frames. Worker only.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_run_temporal(
    region_start: u32,
    region_end: u32,
    max_frames: u32,
) -> u32 {
    ANALYSIS.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |job| {
            let Some(temporal) = analyze_temporal_stereo(
                &job.stereo,
                job.source_rate,
                region_start as usize..region_end as usize,
                max_frames as usize,
            ) else {
                return 0;
            };
            job.result = analyze_stereo(&job.stereo, job.source_rate);
            job.temporal = Some(temporal);
            job.target = None;
            job.stereo = Vec::new();
            u32::from(job.result.is_some())
        })
    })
}

/// Eleven f32 recipe fields: waveform, count, wave tilt, drift, pulse width,
/// Add flavor, Morph amount, Morph depth, Morph curve, stretch, tilt mode.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_recipe_ptr() -> *mut f32 {
    ANALYSIS.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |job| job.recipe.as_mut_ptr())
    })
}

/// 0 = source frame, 1 = Add, 2 = Morph. Control/worker side only.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_prepare_target(
    mode: u32,
    position: f32,
    smooth: f32,
    contrast: f32,
) -> u32 {
    ANALYSIS.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(job) = slot.as_mut() else { return 0 };
        let Some(temporal) = job.temporal.as_ref() else {
            return 0;
        };
        if mode > 2
            || !position.is_finite()
            || !smooth.is_finite()
            || !contrast.is_finite()
            || job.recipe.iter().any(|value| !value.is_finite())
        {
            return 0;
        }
        let source = temporal.partials_at(position, smooth, contrast);
        let values = job.recipe;
        let waveform = values[0].round().clamp(0.0, 7.0) as u8;
        let shape = SpectralShape {
            stretch: values[9],
            tilt_mode: values[10].round().clamp(0.0, 2.0) as u8,
        };
        let target = match mode {
            0 => source,
            1 => prepare_add_target(
                &source,
                shape,
                if values[5] >= 0.5 {
                    AddFlavor::Driven {
                        waveform,
                        pulse_width: values[4],
                    }
                } else {
                    AddFlavor::SelfResynthesis
                },
            ),
            2 => {
                let wave = build_wave_recipe(WaveRecipe {
                    waveform,
                    count: values[1].round().clamp(1.0, MAX_PARTIALS as f32) as usize,
                    tilt: values[2],
                    drift: values[3],
                    pulse_width: values[4],
                });
                prepare_morph_target(
                    &wave,
                    &source,
                    MorphRecipe {
                        position: values[6],
                        depth: values[7],
                        curve: values[8].round().clamp(0.0, 2.0) as u8,
                    },
                    shape,
                )
            }
            _ => unreachable!(),
        };
        if !target.validate() {
            return 0;
        }
        job.target = Some(target);
        1
    })
}

/// Prepare an independent wave recipe target in the analysis worker. Callers
/// must copy the target before preparing another one on the same job.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_prepare_wave_target(
    waveform: u32,
    count: u32,
    tilt: f32,
    drift: f32,
    pulse_width: f32,
) -> u32 {
    if waveform > 7
        || !(1..=MAX_PARTIALS as u32).contains(&count)
        || !tilt.is_finite()
        || !drift.is_finite()
        || !pulse_width.is_finite()
    {
        return 0;
    }
    ANALYSIS.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(job) = slot.as_mut() else { return 0 };
        if job.temporal.is_none() {
            return 0;
        }
        job.target = Some(build_wave_recipe(WaveRecipe {
            waveform: waveform as u8,
            count: count as usize,
            tilt,
            drift,
            pulse_width,
        }));
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_target_count() -> u32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.target.as_ref())
            .map_or(0, |target| target.count as u32)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_target_fundamental() -> f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.target.as_ref())
            .map_or(f32::NAN, |target| target.fundamental)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_target_ptr() -> *const f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.target.as_ref())
            .map_or(std::ptr::null(), |target| target.partials.as_ptr().cast())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_temporal_count() -> u32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.temporal.as_ref())
            .map_or(0, |result| result.frames.len() as u32)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_temporal_global_count() -> u32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.temporal.as_ref())
            .map_or(0, |result| result.global_partials.count as u32)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_temporal_global_ptr() -> *const f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.temporal.as_ref())
            .map_or(std::ptr::null(), |result| {
                result.global_partials.partials.as_ptr().cast()
            })
    })
}

/// source rate, source frames, region bounds, global fundamental, confidence,
/// mode (0 harmonic, 1 peaks), window size, and hop size.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_temporal_meta(id: u32) -> f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.temporal.as_ref())
            .map_or(f32::NAN, |result| match id {
                0 => result.source_rate,
                1 => result.source_frames as f32,
                2 => result.region.start as f32,
                3 => result.region.end as f32,
                4 => result.global_fundamental,
                5 => result.pitch_confidence,
                6 => match result.mode {
                    manifold_core::temporal_partials::ExtractionMode::HarmonicProjection => 0.0,
                    manifold_core::temporal_partials::ExtractionMode::SpectralPeaks => 1.0,
                },
                7 => result.window_size as f32,
                8 => result.hop_size as f32,
                _ => f32::NAN,
            })
    })
}

/// Position, absolute source start, RMS, brightness, fundamental, count.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_temporal_frame_field(frame: u32, field: u32) -> f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.temporal.as_ref())
            .and_then(|result| result.frames.get(frame as usize))
            .map_or(f32::NAN, |frame| match field {
                0 => frame.position,
                1 => frame.source_start as f32,
                2 => frame.rms,
                3 => frame.brightness,
                4 => frame.partials.fundamental,
                5 => frame.partials.count as f32,
                _ => f32::NAN,
            })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_temporal_partials_ptr(frame: u32) -> *const f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.temporal.as_ref())
            .and_then(|result| result.frames.get(frame as usize))
            .map_or(std::ptr::null(), |frame| {
                frame.partials.partials.as_ptr().cast()
            })
    })
}

/// Peak, RMS, pitch Hz (zero if unknown), confidence; NaN for invalid metric.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_metric(id: u32) -> f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.result.as_ref())
            .map_or(f32::NAN, |result| match id {
                0 => result.peak,
                1 => result.rms,
                2 => result.pitch_hz.unwrap_or(0.0),
                3 => result.pitch_confidence,
                _ => f32::NAN,
            })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_peaks_ptr() -> *const f32 {
    ANALYSIS.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|job| job.result.as_ref())
            .map_or(std::ptr::null(), |result| result.peaks.as_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_analysis_peaks_len() -> u32 {
    (PEAK_BINS * 2) as u32
}

/// Prepare-time graph ABI. Kind codes are versioned with manifold_version().
#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_begin(node_count: u32, connection_count: u32) -> u32 {
    if !(1..=64).contains(&node_count) || connection_count > 256 {
        return 0;
    }
    GRAPH_BUILDER.with(|slot| {
        *slot.borrow_mut() = Some(GraphBuilder {
            description: GraphDescription {
                nodes: Vec::with_capacity(node_count as usize),
                connections: Vec::with_capacity(connection_count as usize),
            },
            expected_nodes: node_count as usize,
            expected_connections: connection_count as usize,
            patchable: false,
        });
    });
    1
}

/// Retain prepared kernels for bounded, allocation-free route edits after start.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_patchable(enabled: u32) -> u32 {
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        builder.patchable = enabled != 0;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_node(id: u32, kind: u32, a: f32, b: f32) -> u32 {
    let kind = match kind {
        0 => NodeKind::InputRaw,
        1 => NodeKind::InputMonitor { gain: a },
        2 => NodeKind::Constant { value: a },
        3 => NodeKind::Gain { gain: a },
        4 => NodeKind::Sum2 {
            gain_a: a,
            gain_b: b,
        },
        5 => NodeKind::LinearBlend { mix: a },
        6 => NodeKind::Svf,
        7 => NodeKind::Output,
        8 => NodeKind::Crossfader {
            position: a,
            curve: b,
            mix: 1.0,
        },
        9 if a.is_finite() && a.fract() == 0.0 && (1.0..=32.0).contains(&a) => NodeKind::Mixer {
            inputs: a as usize,
            gains: vec![1.0; a as usize],
            pans: vec![0.0; a as usize],
            master: b,
        },
        10 => NodeKind::VoiceSynth,
        11 => NodeKind::Oscillator {
            frequency: a,
            amplitude: b,
            waveform: 0,
        },
        12 => NodeKind::AdsrEnvelope,
        13 => NodeKind::NoiseGenerator { level: a, color: b },
        14 => NodeKind::Lfo {
            waveform: 0,
            rate: a,
        },
        15 => NodeKind::ModulatedGain { base: a, depth: b },
        16 => NodeKind::ModulatedSvf { depth_hz: a },
        17 => NodeKind::Distortion {
            drive: a,
            mix: b,
            output: 0.8,
        },
        18 => {
            let mut params = stereo_delay::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::StereoDelay { params }
        }
        19 | 52 | 53 => {
            let Some(selected) = effect_slot::supported_type(a) else {
                return 0;
            };
            let params = match selected {
                effect_slot::CHORUS_TYPE => [0.5, 0.5, 0.2, 0.6, 0.4],
                effect_slot::PHASER_TYPE => [0.5, 0.5, 0.4, 0.5, 0.4],
                effect_slot::WAVESHAPER_TYPE => [0.3, 0.0, 0.7, 0.5, 0.5],
                effect_slot::WIDENER_TYPE => [0.6, 0.4, 0.5, 0.5, 0.5],
                effect_slot::LEGACY_FILTER_TYPE => [0.5, 0.2, 0.5, 0.5, 0.5],
                effect_slot::REVERB_TYPE => [0.5, 0.4, 0.5, 0.5, 0.5],
                effect_slot::MULTITAP_TYPE => [0.3, 0.3, 0.5, 0.5, 0.5],
                effect_slot::RING_TYPE => [0.3, 1.0, 0.2, 0.5, 0.5],
                effect_slot::TRANSIENT_TYPE => [0.5, 0.5, 0.5, 0.5, 0.5],
                effect_slot::BITCRUSHER_TYPE => [0.3, 0.12, 0.55, 0.5, 0.5],
                effect_slot::EQ_TYPE => [0.5; 5],
                effect_slot::FORMANT_TYPE => [0.0, 0.5, 0.4, 0.3, 0.5],
                effect_slot::REVERSE_DELAY_TYPE => [0.2, 0.25, 0.47, 0.5, 0.5],
                effect_slot::STUTTER_TYPE => [0.05, 0.8, 0.8, 0.25, 0.5],
                effect_slot::PITCH_SHIFT_TYPE => [0.5, 0.5, 0.2, 0.5, 0.5],
                effect_slot::GRANULATOR_TYPE => [0.3, 0.4, 0.6, 0.25, 0.5],
                effect_slot::SHIMMER_TYPE => [0.6, 0.75, 0.7, 0.5, 0.5],
                effect_slot::COMPRESSOR_TYPE => [0.4, 0.3, 0.1, 0.3, 0.5],
                effect_slot::SVF_TYPE => [0.5, 0.4, 0.1, 0.5, 0.5],
                effect_slot::DELAY_TYPE => [0.3, 0.3, 0.5, 0.5, 0.5],
                effect_slot::LIMITER_TYPE => [0.5, 0.3, 0.4, 0.4, 0.5],
                _ => unreachable!(),
            };
            if kind == 53 {
                NodeKind::EffectSlotHostSwitch {
                    selected,
                    mix: b,
                    params,
                }
            } else if kind == 52 {
                NodeKind::EffectSlotLegacy {
                    selected,
                    mix: b,
                    params,
                }
            } else {
                NodeKind::EffectSlot {
                    selected,
                    mix: b,
                    params,
                }
            }
        }
        20 => NodeKind::LoopCapture {
            capacity_seconds: a,
            mix: b,
        },
        66 => NodeKind::RetrospectiveCapture {
            capacity_seconds: a,
        },
        67 => NodeKind::FixedGain { gain: a },
        21 => NodeKind::SpectrumAnalyzer {
            sensitivity: a,
            smoothing: b,
            floor_db: -72.0,
        },
        22 => NodeKind::EnvelopeFollower {
            attack_ms: a,
            release_ms: b,
            sensitivity: 1.0,
            highpass_hz: 80.0,
            mode: 0,
        },
        23 => NodeKind::EnvelopeControl {
            attack_ms: a,
            release_ms: b,
            sensitivity: 1.0,
            highpass_hz: 80.0,
            mode: 0,
        },
        24 => {
            let mut params = compressor::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::Compressor { params }
        }
        25 => {
            let mut params = limiter::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::Limiter { params }
        }
        26 => NodeKind::SampleRegion,
        27 => NodeKind::SampleInstrument,
        28 => NodeKind::FftSpectrum {
            smoothing: a,
            floor_db: b,
        },
        29 => NodeKind::SlewAudio { up: a, down: b },
        30 => NodeKind::SlewControl { up: a, down: b },
        31 => NodeKind::AttenuverterBias { amount: a, bias: b },
        32 => NodeKind::SampleHold {
            mode: a.round().clamp(0.0, 2.0) as u32,
        },
        33 => NodeKind::CvMix {
            levels: [a, b, 0.0, 0.0],
            offset: 0.0,
        },
        34 => {
            let mut params = phaser::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::Phaser { params }
        }
        35 => {
            let mut params = chorus::defaults();
            params[0] = a;
            params[1] = b;
            NodeKind::Chorus { params }
        }
        36 => NodeKind::Eq8 {
            params: manifold_core::eq8::defaults(),
        },
        37 => NodeKind::WaveShaper {
            params: manifold_core::waveshaper::DEFAULTS,
        },
        38 => NodeKind::StereoWidener {
            params: manifold_core::stereo_widener::DEFAULTS,
        },
        39 => NodeKind::LegacyFilter {
            params: manifold_core::legacy_filter::DEFAULTS,
        },
        40 => NodeKind::Reverb {
            params: manifold_core::reverb::DEFAULTS,
        },
        41 => NodeKind::MultitapDelay {
            params: manifold_core::multitap_delay::DEFAULTS,
        },
        42 => NodeKind::RingModulator {
            params: manifold_core::ring_modulator::DEFAULTS,
        },
        43 => NodeKind::TransientShaper {
            params: manifold_core::transient_shaper::DEFAULTS,
        },
        44 => NodeKind::BitCrusher {
            params: manifold_core::bitcrusher::DEFAULTS,
        },
        45 => NodeKind::LegacyEq {
            params: manifold_core::legacy_eq::DEFAULTS,
        },
        46 => NodeKind::FormantFilter {
            params: manifold_core::formant_filter::DEFAULTS,
        },
        60 => NodeKind::Resonator {
            params: manifold_core::resonator::DEFAULTS,
        },
        61 => NodeKind::SineBank {
            params: manifold_core::sine_bank::DEFAULTS,
        },
        47 => NodeKind::ReverseDelay {
            params: manifold_core::reverse_delay::DEFAULTS,
        },
        48 => NodeKind::Stutter {
            params: manifold_core::stutter::DEFAULTS,
        },
        49 => NodeKind::PitchShifter {
            params: manifold_core::pitch_shifter::DEFAULTS,
        },
        62 => NodeKind::PhaseVocoder {
            params: manifold_core::phase_vocoder::DEFAULTS,
        },
        63 => NodeKind::PhraseGain {
            amount: a,
            reference: b,
        },
        64 if a.is_finite() && a.fract() == 0.0 && (9.0..=12.0).contains(&a) => {
            NodeKind::MainVoiceBank {
                fft_order: a as u32,
            }
        }
        65 => NodeKind::InputSidechain,
        50 => NodeKind::Shimmer {
            params: manifold_core::shimmer::DEFAULTS,
        },
        51 => NodeKind::Granulator {
            params: manifold_core::granulator::DEFAULTS,
        },
        54 => NodeKind::MidiInput,
        55 => NodeKind::MidiTranspose { semitones: a },
        56 => NodeKind::MidiNoteFilter {
            low: a,
            high: b,
            mode: 0,
        },
        57 => NodeKind::MidiScaleQuantizer {
            root: a,
            scale: b,
            direction: 1.0,
        },
        58 => NodeKind::MidiVelocityMapper {
            amount: a,
            curve: b,
            offset: 0.0,
        },
        59 => NodeKind::MidiArpeggiator { rate: a, mode: b },
        _ => return 0,
    };
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        if builder.description.nodes.len() >= builder.expected_nodes {
            return 0;
        }
        builder.description.nodes.push(NodeSpec {
            id: id.into(),
            kind,
        });
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_edge(from: u32, to: u32, input_port: u32) -> u32 {
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        if builder.description.connections.len() >= builder.expected_connections {
            return 0;
        }
        builder.description.connections.push(Connection {
            from: from.into(),
            to: to.into(),
            input_port: input_port as usize,
        });
        1
    })
}

/// Set a node's authored value before graph compilation, without a smoothing ramp.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_graph_initial_parameter(
    node_id: u32,
    parameter: u32,
    value: f32,
) -> u32 {
    if !value.is_finite() {
        return 0;
    }
    GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(builder) = slot.as_mut() else {
            return 0;
        };
        let Some(node) = builder
            .description
            .nodes
            .iter_mut()
            .find(|node| node.id == node_id.into())
        else {
            return 0;
        };
        match (&mut node.kind, parameter) {
            (NodeKind::Crossfader { position, .. }, 0) => *position = value.clamp(-1.0, 1.0),
            (NodeKind::Crossfader { curve, .. }, 1) => *curve = value.clamp(0.0, 1.0),
            (NodeKind::Crossfader { mix, .. }, 2) => *mix = value.clamp(0.0, 1.0),
            (NodeKind::Mixer { master, .. }, 0) => *master = value.clamp(0.0, 2.0),
            (NodeKind::Mixer { gains, .. }, id @ 1..=32) if (id as usize) <= gains.len() => {
                gains[id as usize - 1] = value.clamp(0.0, 2.0)
            }
            (NodeKind::Mixer { pans, .. }, id @ 33..=64) if (id as usize - 32) <= pans.len() => {
                pans[id as usize - 33] = value.clamp(-1.0, 1.0)
            }
            (NodeKind::Oscillator { waveform, .. }, 0) => {
                *waveform = value.round().clamp(0.0, 4.0) as u32
            }
            (NodeKind::Oscillator { frequency, .. }, 1) => *frequency = value.clamp(1.0, 20_000.0),
            (NodeKind::Oscillator { amplitude, .. }, 2) => *amplitude = value.clamp(0.0, 1.0),
            (NodeKind::NoiseGenerator { level, .. }, 0) => *level = value.clamp(0.0, 1.0),
            (NodeKind::NoiseGenerator { color, .. }, 1) => *color = value.clamp(0.0, 1.0),
            (NodeKind::Lfo { waveform, .. }, 0) => *waveform = value.round().clamp(0.0, 2.0) as u32,
            (NodeKind::Lfo { rate, .. }, 1) => *rate = value.clamp(0.05, 20.0),
            (NodeKind::ModulatedGain { base, .. }, 0) => *base = value.clamp(0.0, 2.0),
            (NodeKind::ModulatedGain { depth, .. }, 1) => *depth = value.clamp(-2.0, 2.0),
            (NodeKind::PhraseGain { amount, .. }, 0) => *amount = value.clamp(0.0, 1.0),
            (NodeKind::PhraseGain { reference, .. }, 1) => *reference = value.clamp(0.05, 0.6),
            (NodeKind::ModulatedSvf { depth_hz }, 3) => {
                *depth_hz = value.clamp(-20_000.0, 20_000.0)
            }
            (NodeKind::Distortion { drive, .. }, 0) => *drive = value.clamp(1.0, 30.0),
            (NodeKind::Distortion { mix, .. }, 1) => *mix = value.clamp(0.0, 1.0),
            (NodeKind::Distortion { output, .. }, 2) => *output = value.clamp(0.0, 2.0),
            (NodeKind::StereoDelay { params }, id) => {
                if !stereo_delay::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Phaser { params }, id) => {
                if !phaser::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Chorus { params }, id) => {
                if !chorus::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Eq8 { params }, id @ 0..=41) => params[id as usize] = value,
            (NodeKind::WaveShaper { params }, id @ 0..=7) => params[id as usize] = value,
            (NodeKind::StereoWidener { params }, id @ 0..=2) => params[id as usize] = value,
            (NodeKind::LegacyFilter { params }, id @ 0..=2) => params[id as usize] = value,
            (NodeKind::Reverb { params }, id @ 0..=4) => params[id as usize] = value,
            (NodeKind::MultitapDelay { params }, id @ 0..=26) => {
                if !manifold_core::multitap_delay::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::RingModulator { params }, id @ 0..=4) => {
                if !manifold_core::ring_modulator::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::TransientShaper { params }, id @ 0..=3) => {
                if !manifold_core::transient_shaper::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::BitCrusher { params }, id @ 0..=4) => {
                if !manifold_core::bitcrusher::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::LegacyEq { params }, id @ 0..=8) => {
                if !manifold_core::legacy_eq::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::FormantFilter { params }, id @ 0..=4) => {
                if !manifold_core::formant_filter::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Resonator { params }, id @ 0..=2) => {
                if !manifold_core::resonator::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::SineBank { params }, id @ 0..=10) => {
                if !manifold_core::sine_bank::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::ReverseDelay { params }, id @ 0..=3) => {
                if !manifold_core::reverse_delay::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Stutter { params }, id @ 0..=7) => {
                if !manifold_core::stutter::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::PitchShifter { params }, id @ 0..=3) => {
                if !manifold_core::pitch_shifter::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::PhaseVocoder { params }, id @ 0..=4) => {
                if !manifold_core::phase_vocoder::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Shimmer { params }, id @ 0..=5) => {
                if !manifold_core::shimmer::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Granulator { params }, id @ 0..=10) => {
                if !manifold_core::granulator::set_value(params, id, value) {
                    return 0;
                }
            }
            (
                NodeKind::EffectSlot { selected, .. }
                | NodeKind::EffectSlotLegacy { selected, .. }
                | NodeKind::EffectSlotHostSwitch { selected, .. },
                0,
            ) => {
                let Some(kind) = effect_slot::supported_type(value) else {
                    return 0;
                };
                *selected = kind;
            }
            (
                NodeKind::EffectSlot { mix, .. }
                | NodeKind::EffectSlotLegacy { mix, .. }
                | NodeKind::EffectSlotHostSwitch { mix, .. },
                1,
            ) => *mix = value.clamp(0.0, 1.0),
            (
                NodeKind::EffectSlot { params, .. }
                | NodeKind::EffectSlotLegacy { params, .. }
                | NodeKind::EffectSlotHostSwitch { params, .. },
                id @ 2..=6,
            ) => params[id as usize - 2] = value.clamp(0.0, 1.0),
            (NodeKind::SpectrumAnalyzer { sensitivity, .. }, 0) => {
                *sensitivity = value.clamp(0.1, 8.0)
            }
            (NodeKind::SpectrumAnalyzer { smoothing, .. }, 1) => {
                *smoothing = value.clamp(0.0, 0.999)
            }
            (NodeKind::SpectrumAnalyzer { floor_db, .. }, 2) => {
                *floor_db = value.clamp(-96.0, -12.0)
            }
            (NodeKind::FftSpectrum { smoothing, .. }, 0) => *smoothing = value.clamp(0.0, 0.99),
            (NodeKind::FftSpectrum { floor_db, .. }, 1) => *floor_db = value.clamp(-96.0, -24.0),
            (NodeKind::SlewAudio { up, .. } | NodeKind::SlewControl { up, .. }, 0) => {
                *up = value.max(1.0)
            }
            (NodeKind::SlewAudio { down, .. } | NodeKind::SlewControl { down, .. }, 1) => {
                *down = value.max(1.0)
            }
            (NodeKind::AttenuverterBias { amount, .. }, 0) => *amount = value.clamp(-1.0, 1.0),
            (NodeKind::AttenuverterBias { bias, .. }, 1) => *bias = value.clamp(-1.0, 1.0),
            (NodeKind::SampleHold { mode }, 0) => *mode = value.round().clamp(0.0, 2.0) as u32,
            (NodeKind::CvMix { levels, .. }, id @ 0..=3) => {
                levels[id as usize] = value.clamp(0.0, 1.0)
            }
            (NodeKind::CvMix { offset, .. }, 4) => *offset = value.clamp(-1.0, 1.0),
            (
                NodeKind::EnvelopeFollower { attack_ms, .. }
                | NodeKind::EnvelopeControl { attack_ms, .. },
                0,
            ) => *attack_ms = value.clamp(0.01, 500.0),
            (
                NodeKind::EnvelopeFollower { release_ms, .. }
                | NodeKind::EnvelopeControl { release_ms, .. },
                1,
            ) => *release_ms = value.clamp(0.1, 5000.0),
            (
                NodeKind::EnvelopeFollower { sensitivity, .. }
                | NodeKind::EnvelopeControl { sensitivity, .. },
                2,
            ) => *sensitivity = value.clamp(0.01, 16.0),
            (
                NodeKind::EnvelopeFollower { highpass_hz, .. }
                | NodeKind::EnvelopeControl { highpass_hz, .. },
                3,
            ) => *highpass_hz = value.clamp(5.0, 4000.0),
            (
                NodeKind::EnvelopeFollower { mode, .. } | NodeKind::EnvelopeControl { mode, .. },
                4,
            ) => *mode = value.round().clamp(0.0, 2.0) as u32,
            (NodeKind::Compressor { params }, id) => {
                if !compressor::set_value(params, id, value) {
                    return 0;
                }
            }
            (NodeKind::Limiter { params }, id) => {
                if !limiter::set_value(params, id, value) {
                    return 0;
                }
            }
            _ => return 0,
        }
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_prepare(sample_rate: f32, max_frames: u32) -> u32 {
    if !sample_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&sample_rate)
        || !(1..=8192).contains(&max_frames)
    {
        return 0;
    }
    let capacity = max_frames as usize;
    let fallback = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 1,
                kind: NodeKind::InputRaw,
            },
            NodeSpec {
                id: 2,
                kind: NodeKind::Svf,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 1,
                to: 2,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 3,
                input_port: 0,
            },
        ],
    };
    let description = GRAPH_BUILDER.with(|slot| {
        let mut slot = slot.borrow_mut();
        match slot.take() {
            Some(builder)
                if builder.description.nodes.len() == builder.expected_nodes
                    && builder.description.connections.len() == builder.expected_connections =>
            {
                Some((builder.description, builder.patchable))
            }
            Some(_) => None,
            None => Some((fallback, false)),
        }
    });
    let Some((description, patchable)) = description else {
        return 0;
    };
    let plan = if patchable {
        description.compile_patchable(sample_rate, capacity)
    } else {
        description.compile(sample_rate, capacity)
    };
    let Ok(plan) = plan else {
        return 0;
    };
    ENGINE.with(|slot| {
        *slot.borrow_mut() = Some(WorkletEngine {
            plan,
            capacity,
            input: vec![0.0; capacity * 4],
            output: vec![0.0; capacity * 2],
            events: Vec::with_capacity(256),
            sample_upload: None,
            sample_replace_upload: None,
            capture_publish: None,
            partial_upload: None,
            temporal_upload: None,
            temporal_raw_upload: None,
        });
    });
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_input_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .map_or(std::ptr::null_mut(), |engine| engine.input.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_output_ptr() -> *const f32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(std::ptr::null(), |engine| engine.output.as_ptr())
    })
}

/// Reserve interleaved stereo storage before playback. Call commit after writing through the pointer.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_begin(node_id: u32, frames: u32, source_rate: f32) -> u32 {
    if frames == 0
        || !source_rate.is_finite()
        || !(8_000.0..=384_000.0).contains(&source_rate)
        || frames as usize > (source_rate as usize).saturating_mul(MAX_SAMPLE_SECONDS)
        || frames as usize > MAX_SAMPLE_FRAMES
    {
        return 0;
    }
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine.sample_upload = Some((node_id, source_rate, vec![0.0; frames as usize * 2]));
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .and_then(|engine| engine.sample_upload.as_mut())
            .map_or(std::ptr::null_mut(), |(_, _, samples)| samples.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_commit() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let Some((node_id, source_rate, samples)) = engine.sample_upload.take() else {
                return 0;
            };
            u32::from(
                engine
                    .plan
                    .load_sample_stereo(node_id.into(), samples, source_rate),
            )
        })
    })
}

/// Reserve a replacement for a running SampleInstrument. The browser fills
/// this storage in bounded control messages before a separate publication.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_publish_begin(
    node_id: u32,
    frames: u32,
    source_rate: f32,
) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            if engine.sample_replace_upload.is_some()
                || !engine.plan.accepts_sample_instrument(node_id.into())
            {
                return 0;
            }
            let Some(upload) = StereoSampleUpload::new(frames as usize, source_rate) else {
                return 0;
            };
            engine.sample_replace_upload = Some((node_id, upload));
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_publish_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .and_then(|engine| engine.sample_replace_upload.as_mut())
            .map_or(std::ptr::null_mut(), |(_, upload)| upload.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_publish_prepare_chunk(start_frame: u32, frames: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine
                .sample_replace_upload
                .as_mut()
                .map_or(0, |(_, upload)| {
                    u32::from(upload.prepare_next(start_frame as usize, frames as usize))
                })
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_publish_validate(start_frame: u32, frames: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine
                .sample_replace_upload
                .as_mut()
                .map_or(0, |(_, upload)| {
                    u32::from(upload.validate_next(start_frame as usize, frames as usize))
                })
        })
    })
}

/// Move a completed replacement into the instrument between process calls.
/// Rejection leaves the current source untouched.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_publish_commit() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            if !engine
                .sample_replace_upload
                .as_ref()
                .is_some_and(|(_, upload)| upload.is_complete())
            {
                return 0;
            }
            let Some((node_id, upload)) = engine.sample_replace_upload.take() else {
                return 0;
            };
            let Some(source) = upload.finish() else {
                return 0;
            };
            u32::from(
                engine
                    .plan
                    .publish_validated_sample_to_instrument(node_id.into(), source),
            )
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_sample_cancel() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.sample_replace_upload.take().is_some())
        })
    })
}

/// Begin a fixed-capacity, version-1 partial upload. Each entry is four f32s:
/// frequency, amplitude, phase, and stored decay rate.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_partials_begin(node_id: u32, count: u32, fundamental: f32) -> u32 {
    manifold_partials_begin_target(node_id, 0, count, fundamental)
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_partials_begin_target(
    node_id: u32,
    target: u32,
    count: u32,
    fundamental: f32,
) -> u32 {
    if count as usize > MAX_PARTIALS || !fundamental.is_finite() || fundamental <= 0.0 {
        return 0;
    }
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let mut partials = PartialSet::default();
            partials.fundamental = fundamental;
            partials.count = count as usize;
            engine.partial_upload = Some((node_id, target, partials));
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_partials_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .and_then(|engine| engine.partial_upload.as_mut())
            .map_or(std::ptr::null_mut(), |(_, _, set)| {
                set.partials.as_mut_ptr().cast()
            })
    })
}

/// Validate the whole upload, then install it between process blocks.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_partials_commit() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let Some((node_id, target, partials)) = engine.partial_upload.take() else {
                return 0;
            };
            u32::from(
                engine
                    .plan
                    .load_partials_target(node_id.into(), target, partials),
            )
        })
    })
}

/// Upload up to 256 uniformly spaced prepared Main source targets. Each frame
/// occupies two header floats (partial count, fundamental) and 32 partials of
/// four floats. The entire table is validated before replacing the old one.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_begin(node_id: u32, frames: u32) -> u32 {
    if frames < 2 || frames as usize > MAX_MAIN_TEMPORAL_TARGETS {
        return 0;
    }
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine.temporal_upload =
                Some((node_id, vec![0.0; frames as usize * (2 + MAX_PARTIALS * 4)]));
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .and_then(|engine| engine.temporal_upload.as_mut())
            .map_or(std::ptr::null_mut(), |(_, values)| values.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_commit() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let Some((node_id, values)) = engine.temporal_upload.take() else {
                return 0;
            };
            let stride = 2 + MAX_PARTIALS * 4;
            let mut targets = Vec::with_capacity(values.len() / stride);
            for frame in values.chunks_exact(stride) {
                let count = frame[0];
                if !count.is_finite()
                    || count.fract() != 0.0
                    || !(0.0..=MAX_PARTIALS as f32).contains(&count)
                {
                    return 0;
                }
                let mut set = PartialSet {
                    fundamental: frame[1],
                    count: count as usize,
                    ..PartialSet::default()
                };
                for (index, partial) in frame[2..2 + set.count * 4].chunks_exact(4).enumerate() {
                    set.partials[index] = Partial {
                        frequency: partial[0],
                        amplitude: partial[1],
                        phase: partial[2],
                        decay_rate: partial[3],
                    };
                }
                if !set.validate() {
                    return 0;
                }
                targets.push(set);
            }
            u32::from(
                engine
                    .plan
                    .load_main_temporal_targets(node_id.into(), targets),
            )
        })
    })
}

/// Upload the extractor's original source frames. One count float precedes
/// frames of position, fundamental, partial count and 32 four-float partials.
/// The ten-float recipe is published separately before commit.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_raw_begin(node_id: u32, frames: u32) -> u32 {
    if frames < 2 || frames as usize > MAX_TEMPORAL_FRAMES {
        return 0;
    }
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            engine.temporal_raw_upload = Some((
                node_id,
                vec![0.0; 1 + frames as usize * (3 + MAX_PARTIALS * 4)],
                [0.6, 0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.5, 1.0, 2.0],
            ));
            1
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_raw_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .and_then(|engine| engine.temporal_raw_upload.as_mut())
            .map_or(std::ptr::null_mut(), |(_, values, _)| values.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_raw_recipe_ptr() -> *mut f32 {
    ENGINE.with(|slot| {
        slot.borrow_mut()
            .as_mut()
            .and_then(|engine| engine.temporal_raw_upload.as_mut())
            .map_or(std::ptr::null_mut(), |(_, _, recipe)| recipe.as_mut_ptr())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_raw_commit() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let Some((node_id, values, controls)) = engine.temporal_raw_upload.take() else {
                return 0;
            };
            let count = (values.len() - 1) / (3 + MAX_PARTIALS * 4);
            if values[0] != count as f32
                || controls.iter().any(|value| !value.is_finite())
                || controls[3].fract() != 0.0
                || controls[4].fract() != 0.0
                || controls[5].fract() != 0.0
                || controls[9].fract() != 0.0
                || !(0.0..=1.0).contains(&controls[4])
                || !(0.0..=2.0).contains(&controls[3])
                || !(0.0..=7.0).contains(&controls[5])
                || !(0.0..=2.0).contains(&controls[9])
            {
                return 0;
            }
            let mut frames = Vec::with_capacity(count);
            for packed in values[1..].chunks_exact(3 + MAX_PARTIALS * 4) {
                let active = packed[2];
                if !active.is_finite()
                    || active.fract() != 0.0
                    || !(0.0..=MAX_PARTIALS as f32).contains(&active)
                {
                    return 0;
                }
                let mut partials = PartialSet {
                    fundamental: packed[1],
                    count: active as usize,
                    ..PartialSet::default()
                };
                for (index, fields) in packed[3..3 + partials.count * 4]
                    .chunks_exact(4)
                    .enumerate()
                {
                    partials.partials[index] = Partial {
                        frequency: fields[0],
                        amplitude: fields[1],
                        phase: fields[2],
                        decay_rate: fields[3],
                    };
                }
                frames.push(TemporalFrame {
                    position: packed[0],
                    source_start: 0,
                    rms: 0.0,
                    brightness: 0.0,
                    partials,
                });
            }
            let recipe = MainTemporalRecipe {
                smooth: controls[0],
                contrast: controls[1],
                shape: SpectralShape {
                    stretch: controls[2],
                    tilt_mode: controls[3] as u8,
                },
                add_flavor: if controls[4] >= 0.5 {
                    AddFlavor::Driven {
                        waveform: controls[5] as u8,
                        pulse_width: controls[6],
                    }
                } else {
                    AddFlavor::SelfResynthesis
                },
                morph: MorphRecipe {
                    position: controls[7],
                    depth: controls[8],
                    curve: controls[9] as u8,
                },
            };
            u32::from(
                engine
                    .plan
                    .load_main_temporal_frames(node_id.into(), frames, recipe),
            )
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_clear(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.plan.clear_main_temporal_targets(node_id.into()))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_temporal_speed(node_id: u32, speed: f32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.plan.set_main_temporal_speed(node_id.into(), speed))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_parameter(id: u32, value: f32) -> u32 {
    manifold_set_node_parameter(2, id, value)
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_node_parameter(node_id: u32, id: u32, value: f32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.plan.set_parameter(node_id.into(), id, value))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_directional_configure(oscillator_id: u32, sample_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(
                engine
                    .plan
                    .configure_main_directional(oscillator_id.into(), sample_id.into()),
            )
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_directional_parameter(id: u32, value: f32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.plan.set_main_directional_parameter(id, value))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_pitch_configure(vocoder_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.plan.configure_main_pitch(vocoder_id.into()))
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_main_pitch_parameter(id: u32, value: f32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(engine.plan.set_main_pitch_parameter(id, value))
        })
    })
}

/// Bounded MIDI transform trace, read from a worklet message handler between process calls.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_midi_trace_count() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .map_or(0, |engine| engine.plan.midi_trace_count() as u32)
    })
}

/// Fields: sequence, node, frame offset, kind, channel, note/LSB, velocity/MSB, emitted.
/// Returns u32::MAX for an invalid index or field.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_midi_trace_field(index: u32, field: u32) -> u32 {
    ENGINE.with(|slot| {
        let slot = slot.borrow();
        let Some(entry) = slot
            .as_ref()
            .and_then(|engine| engine.plan.midi_trace_entry(index as usize))
        else {
            return u32::MAX;
        };
        let (kind, channel, note, velocity) = match entry.kind {
            EventKind::NoteOn {
                channel,
                note,
                velocity,
            } => (0, channel as u32, note as u32, velocity as u32),
            EventKind::NoteOff { channel, note } => (1, channel as u32, note as u32, 0),
            EventKind::AllNotesOff => (2, 0, 0, 0),
            EventKind::PitchBend { channel, value } => {
                (3, channel as u32, (value & 127) as u32, (value >> 7) as u32)
            }
        };
        match field {
            0 => entry.sequence,
            1 => entry.node as u32,
            2 => entry.offset as u32,
            3 => kind,
            4 => channel,
            5 => note,
            6 => velocity,
            7 => u32::from(entry.emitted),
            _ => u32::MAX,
        }
    })
}

/// Source ID zero disconnects the target. Called between process blocks only.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_set_route(target_id: u32, port: u32, source_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(
                engine
                    .plan
                    .set_route(
                        target_id.into(),
                        port as usize,
                        (source_id != 0).then_some(source_id.into()),
                    )
                    .is_ok(),
            )
        })
    })
}

/// 1 means reachable from Output, 0 means parked, 2 means missing.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_node_active(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.node_active(node_id.into()))
            .map_or(2, u32::from)
    })
}

/// Read one bounded meter value after a process block; NaN means no such meter.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_get_node_meter(node_id: u32, band: u32) -> f32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.node_meter(node_id.into(), band as usize))
            .unwrap_or(f32::NAN)
    })
}

/// Read the prepared EQ8's effective transfer magnitude without changing DSP state.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_eq8_response_db(node_id: u32, frequency: f32) -> f32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.eq8_response_db(node_id.into(), frequency))
            .unwrap_or(f32::NAN)
    })
}

/// A stopped loop take's frame count; zero means empty, recording, or wrong node.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_length(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.capture_length(node_id.into()))
            .and_then(|frames| u32::try_from(frames).ok())
            .unwrap_or(0)
    })
}

/// The retrospective ring's next write offset. `u32::MAX` means unavailable;
/// zero is a valid offset at startup and after wrapping.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_write_offset(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.retrospective_cursor(node_id.into()))
            .and_then(|(offset, _)| u32::try_from(offset).ok())
            .unwrap_or(u32::MAX)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_capacity(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.retrospective_cursor(node_id.into()))
            .and_then(|(_, capacity)| u32::try_from(capacity).ok())
            .unwrap_or(0)
    })
}

/// The original free trigger measures one circular span between two cursor
/// reads. The host reads and stages both on the AudioWorklet thread.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_free_frames(start: u32, end: u32, capacity: u32) -> u32 {
    if start >= capacity || end >= capacity {
        return 0;
    }
    manifold_core::capture_timing::free_frames_from_offsets(
        i64::from(start),
        i64::from(end),
        capacity,
    )
    .unwrap_or(0)
}

/// Preallocate a bounded capture window before audio starts.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_reserve(node_id: u32, frames: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(
                engine
                    .plan
                    .reserve_capture_staging(node_id.into(), frames as usize),
            )
        })
    })
}

/// Begin a frozen recording-window copy; later render blocks advance it in bounded slices.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_begin(node_id: u32, requested_frames: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(
                engine
                    .plan
                    .begin_capture_staging(node_id.into(), requested_frames as usize),
            )
        })
    })
}

/// Convert a browser tempo and bar length to the original sample-synth frame
/// decision. Hosts with an explicit samples-per-bar value use the core helper.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_tempo_frames(
    sample_rate: f64,
    tempo_bpm: f64,
    bars: f64,
) -> u32 {
    manifold_core::capture_timing::samples_per_bar(None, sample_rate, tempo_bpm)
        .and_then(|samples| manifold_core::capture_timing::retrospective_frames(samples, bars))
        .unwrap_or(0)
}

/// Convert an explicit meter and tempo into the same bounded retrospective
/// frame decision used by native hosts.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_meter_frames(
    sample_rate: f64,
    tempo_bpm: f64,
    numerator: u32,
    denominator: u32,
    bars: f64,
) -> u32 {
    manifold_core::capture_timing::samples_per_bar_at_meter(
        sample_rate,
        tempo_bpm,
        numerator,
        denominator,
    )
    .and_then(|samples| manifold_core::capture_timing::retrospective_frames(samples, bars))
    .unwrap_or(0)
}

/// 0 idle/invalid, 1 copying, 2 ready.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_status(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.capture_staging_status(node_id.into()))
            .map_or(0, |ready| if ready { 2 } else { 1 })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_length(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow()
            .as_ref()
            .and_then(|engine| engine.plan.capture_staged_length(node_id.into()))
            .and_then(|frames| u32::try_from(frames).ok())
            .unwrap_or(0)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_cancel(node_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            if engine
                .capture_publish
                .as_ref()
                .is_some_and(|job| job.capture == node_id)
            {
                engine.capture_publish = None;
            }
            u32::from(engine.plan.cancel_capture_staging(node_id.into()))
        })
    })
}

/// Allocate the destination vector once in a user-triggered message handler.
/// Its pages are filled in bounded slices after subsequent render blocks.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_publish_begin(
    capture_id: u32,
    instrument_id: u32,
    source_rate: f32,
) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let Some(frames) = engine.plan.capture_staged_length(capture_id.into()) else {
                return 0;
            };
            if capture_id == instrument_id
                || !engine.plan.accepts_sample_instrument(instrument_id.into())
                || engine.capture_publish.is_some()
                || !source_rate.is_finite()
                || !(8_000.0..=384_000.0).contains(&source_rate)
                || frames == 0
                || frames > MAX_SAMPLE_FRAMES
                || frames > (source_rate as usize).saturating_mul(MAX_SAMPLE_SECONDS)
            {
                return 0;
            }
            engine.capture_publish = Some(CapturePublish {
                capture: capture_id,
                instrument: instrument_id,
                source_rate,
                frames,
                copied: 0,
                stereo: Vec::with_capacity(frames * 2),
            });
            1
        })
    })
}

/// Copy at most 2,048 frames into already reserved storage after a render
/// block. Return 1 while copying, 2 when ready for control-side publication.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_publish_step(max_frames: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let Some(job) = engine.capture_publish.as_mut() else {
                return 0;
            };
            if max_frames == 0
                || engine.plan.capture_staged_length(job.capture.into()) != Some(job.frames)
            {
                engine.capture_publish = None;
                return 0;
            }
            if job.copied == job.frames {
                return 2;
            }
            let next = (job.copied + (max_frames as usize).min(2048)).min(job.frames);
            job.stereo.resize(next * 2, 0.0);
            let copied = engine.plan.copy_capture_staged_interleaved(
                job.capture.into(),
                job.copied,
                &mut job.stereo[job.copied * 2..next * 2],
            );
            if copied != next - job.copied {
                engine.capture_publish = None;
                return 0;
            }
            job.copied = next;
            if next == job.frames { 2 } else { 1 }
        })
    })
}

/// Move the complete source into the instrument in a message handler. This
/// does no full-window PCM copy; held notes retain their previous source.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_publish_finish() -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            let Some(job) = engine.capture_publish.take() else {
                return 0;
            };
            if job.copied != job.frames {
                engine.capture_publish = Some(job);
                return 0;
            }
            let accepted = engine.plan.publish_prepared_sample_to_instrument(
                job.instrument.into(),
                job.stereo,
                job.source_rate,
            );
            if accepted {
                engine.plan.cancel_capture_staging(job.capture.into());
            }
            u32::from(accepted)
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_publish(capture_id: u32, instrument_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            if engine.capture_publish.is_some() {
                return 0;
            }
            u32::from(
                engine
                    .plan
                    .publish_staged_capture_to_instrument(capture_id.into(), instrument_id.into()),
            )
        })
    })
}

/// Copy a chunk as interleaved stereo into the prepared output scratch buffer.
/// Call only between process blocks; the next process() overwrites this buffer.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_copy(node_id: u32, start_frame: u32, frames: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            if frames == 0 || frames as usize > engine.capacity {
                return 0;
            }
            engine.plan.copy_capture_interleaved(
                node_id.into(),
                start_frame as usize,
                &mut engine.output[..frames as usize * 2],
            ) as u32
        })
    })
}

/// Copy a bounded chunk from the frozen window into prepared output scratch.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_stage_copy(node_id: u32, start_frame: u32, frames: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            if frames == 0 || frames as usize > engine.capacity {
                return 0;
            }
            engine.plan.copy_capture_staged_interleaved(
                node_id.into(),
                start_frame as usize,
                &mut engine.output[..frames as usize * 2],
            ) as u32
        })
    })
}

/// Publish a stopped loop take to a running sample instrument between blocks.
/// Returns zero for an empty/recording capture or a wrong destination.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_capture_publish(capture_id: u32, instrument_id: u32) -> u32 {
    ENGINE.with(|slot| {
        slot.borrow_mut().as_mut().map_or(0, |engine| {
            u32::from(
                engine
                    .plan
                    .publish_capture_to_instrument(capture_id.into(), instrument_id.into()),
            )
        })
    })
}

/// Queue a typed event at a frame offset in the next process block.
#[unsafe(no_mangle)]
pub extern "C" fn manifold_event_push(
    node_id: u32,
    offset: u32,
    kind: u32,
    channel: u32,
    note: u32,
    velocity: u32,
) -> u32 {
    let kind = match kind {
        0 if channel <= 15 && note <= 127 && velocity <= 127 => EventKind::NoteOn {
            channel: channel as u8,
            note: note as u8,
            velocity: velocity as u8,
        },
        1 if channel <= 15 && note <= 127 => EventKind::NoteOff {
            channel: channel as u8,
            note: note as u8,
        },
        2 => EventKind::AllNotesOff,
        3 if channel <= 15 && note <= 127 && velocity <= 127 => EventKind::PitchBend {
            channel: channel as u8,
            value: ((velocity << 7) | note) as u16,
        },
        _ => return 0,
    };
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        if offset >= engine.capacity as u32
            || engine.events.len() == engine.events.capacity()
            || engine
                .events
                .last()
                .is_some_and(|last| last.offset > offset as usize)
            || !engine.plan.accepts_events(node_id.into())
        {
            return 0;
        }
        engine.events.push(TimedEvent {
            node: node_id.into(),
            offset: offset as usize,
            kind,
        });
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn manifold_process(frames: u32) -> u32 {
    ENGINE.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(engine) = slot.as_mut() else {
            return 0;
        };
        let frames = frames as usize;
        if frames > engine.capacity {
            return 0;
        }
        let (main, sidechain) = engine.input.split_at(engine.capacity * 2);
        let (left_in, right_in) = main.split_at(engine.capacity);
        let (side_left, side_right) = sidechain.split_at(engine.capacity);
        let (left_out, right_out) = engine.output.split_at_mut(engine.capacity);
        let result = engine.plan.process_with_events_sidechain(
            [&left_in[..frames], &right_in[..frames]],
            Some([&side_left[..frames], &side_right[..frames]]),
            [&mut left_out[..frames], &mut right_out[..frames]],
            &engine.events,
        );
        engine.events.clear();
        if result.is_err() {
            left_out[..frames].fill(0.0);
            right_out[..frames].fill(0.0);
            return 0;
        }
        1
    })
}
