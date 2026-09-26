//! Native reference for the authored Main wave/sample base + Add/Morph branch.
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use manifold_core::sine_bank::DEFAULTS;
use manifold_core::spectral_targets::{
    AddFlavor, MorphRecipe, SpectralShape, WaveRecipe, build_wave_recipe, prepare_add_target,
    prepare_morph_target,
};
use manifold_core::temporal_partials::analyze_temporal_stereo;
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 24 {
        return Err("usage: render_main_sample_blend SAMPLE OUTPUT TARGET MODE SAMPLE_GAIN BANK_GAIN FRAMES PVOC_MODE PITCH STRETCH MIX FFT_ORDER PHRASE_AMOUNT PHRASE_REFERENCE WAVE_PITCH WAVE_LEVEL WAVE_SHAPE BASE_BLEND ADD_BLEND DEPTH LINKED SAMPLE_STAGE_GAIN BANK_LEVEL".into());
    }
    let sample: Vec<f32> = std::fs::read(&args[1])?
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect();
    let sample_frames = sample.len() / 2;
    let mode: u32 = args[4].parse()?;
    let sample_gain: f32 = args[5].parse()?;
    let bank_gain: f32 = args[6].parse()?;
    let frames: usize = args[7].parse()?;
    let vocoder = [
        args[8].parse()?,
        args[9].parse()?,
        args[10].parse()?,
        args[11].parse()?,
        args[12].parse()?,
    ];
    let phrase_amount: f32 = args[13].parse()?;
    let phrase_reference: f32 = args[14].parse()?;
    let wave_pitch: f32 = args[15].parse()?;
    let wave_level: f32 = args[16].parse()?;
    let wave_shape: u32 = args[17].parse()?;
    let base_blend: f32 = args[18].parse()?;
    let add_blend: f32 = args[19].parse()?;
    let depth: f32 = args[20].parse()?;
    let linked: u32 = args[21].parse()?;
    let sample_stage_gain: f32 = args[22].parse()?;
    let bank_level: f32 = args[23].parse()?;
    let analysis = analyze_temporal_stereo(&sample, 48_000.0, 0..sample_frames, 128)
        .ok_or("source analysis failed")?;
    let source = analysis.partials_at(0.5, 0.6, 0.5);
    let shape = SpectralShape {
        stretch: 0.1,
        tilt_mode: 2,
    };
    let target = match mode {
        1 => prepare_add_target(&source, shape, AddFlavor::SelfResynthesis),
        2 => prepare_morph_target(
            &build_wave_recipe(WaveRecipe {
                waveform: 1,
                count: 8,
                tilt: 0.2,
                drift: 0.3,
                pulse_width: 0.35,
            }),
            &source,
            MorphRecipe {
                position: 0.5,
                depth: 0.7,
                curve: 2,
            },
            shape,
        ),
        _ => return Err("mode must be 1 (Add) or 2 (Morph)".into()),
    };
    if !target.validate() || target.count == 0 {
        return Err("invalid target".into());
    }
    let mut target_bytes = Vec::with_capacity(target.count * 16);
    for partial in &target.partials[..target.count] {
        for value in [
            partial.frequency,
            partial.amplitude,
            partial.phase,
            partial.decay_rate,
        ] {
            target_bytes.extend_from_slice(&value.to_le_bytes());
        }
    }
    std::fs::File::create(&args[3])?.write_all(&target_bytes)?;
    let wave_target = build_wave_recipe(WaveRecipe {
        waveform: 1,
        count: 8,
        tilt: 0.0,
        drift: 0.0,
        pulse_width: 0.5,
    });
    let mut wave_bytes = Vec::with_capacity(wave_target.count * 16);
    for partial in &wave_target.partials[..wave_target.count] {
        for value in [
            partial.frequency,
            partial.amplitude,
            partial.phase,
            partial.decay_rate,
        ] {
            wave_bytes.extend_from_slice(&value.to_le_bytes());
        }
    }
    std::fs::write(
        std::path::Path::new(&args[3]).with_file_name("wave-target.f32"),
        wave_bytes,
    )?;

    let mut bank = DEFAULTS;
    bank[0] = 220.0;
    bank[1] = bank_level;
    let mut plan = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 2,
                kind: NodeKind::SampleRegion,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::SineBank { params: bank },
            },
            NodeSpec {
                id: 13,
                kind: NodeKind::SineBank { params: bank },
            },
            NodeSpec {
                id: 14,
                kind: NodeKind::Crossfader {
                    position: add_blend,
                    curve: 1.0,
                    mix: 1.0,
                },
            },
            NodeSpec {
                id: 11,
                kind: NodeKind::Oscillator {
                    frequency: wave_pitch,
                    amplitude: wave_level,
                    waveform: wave_shape,
                },
            },
            NodeSpec {
                id: 15,
                kind: NodeKind::Gain {
                    gain: sample_stage_gain,
                },
            },
            NodeSpec {
                id: 12,
                kind: NodeKind::Crossfader {
                    position: base_blend,
                    curve: 1.0,
                    mix: 1.0,
                },
            },
            NodeSpec {
                id: 7,
                kind: NodeKind::EnvelopeControl {
                    attack_ms: 5.0,
                    release_ms: 80.0,
                    sensitivity: 2.0,
                    highpass_hz: 40.0,
                    mode: 0,
                },
            },
            NodeSpec {
                id: 8,
                kind: NodeKind::PhraseGain {
                    amount: phrase_amount,
                    reference: phrase_reference,
                },
            },
            NodeSpec {
                id: 6,
                kind: NodeKind::PhaseVocoder { params: vocoder },
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::Mixer {
                    inputs: 2,
                    gains: vec![sample_gain, bank_gain],
                    pans: vec![0.0, 0.0],
                    master: 1.0,
                },
            },
            NodeSpec {
                id: 16,
                kind: NodeKind::Mixer {
                    inputs: 4,
                    gains: vec![0.0, 0.0, 0.0, 1.0],
                    pans: vec![0.0; 4],
                    master: 1.0,
                },
            },
            NodeSpec {
                id: 5,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 2,
                to: 6,
                input_port: 0,
            },
            Connection {
                from: 2,
                to: 7,
                input_port: 0,
            },
            Connection {
                from: 11,
                to: 12,
                input_port: 0,
            },
            Connection {
                from: 6,
                to: 15,
                input_port: 0,
            },
            Connection {
                from: 15,
                to: 12,
                input_port: 1,
            },
            Connection {
                from: 12,
                to: 4,
                input_port: 0,
            },
            Connection {
                from: 13,
                to: 14,
                input_port: 0,
            },
            Connection {
                from: 3,
                to: 14,
                input_port: 1,
            },
            Connection {
                from: 14,
                to: 8,
                input_port: 0,
            },
            Connection {
                from: 7,
                to: 8,
                input_port: 1,
            },
            Connection {
                from: 8,
                to: 4,
                input_port: 1,
            },
            Connection {
                from: 4,
                to: 16,
                input_port: 3,
            },
            Connection {
                from: 16,
                to: 5,
                input_port: 0,
            },
        ],
    }
    .compile(48_000.0, 128)?;
    if !plan.load_sample_stereo(2, sample, 48_000.0)
        || !plan.load_partials(3, target)
        || !plan.load_partials(13, wave_target)
    {
        return Err("source or target upload failed".into());
    }
    assert!(plan.set_parameter(4, 65, depth));
    assert!(plan.set_parameter(4, 66, linked as f32));
    assert!(plan.set_parameter(2, 6, 1.0));
    let mut output = Vec::with_capacity(frames * 8);
    for offset in (0..frames).step_by(128) {
        let count = (frames - offset).min(128);
        let silence = vec![0.0; count];
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        plan.process([&silence, &silence], [&mut left, &mut right]);
        for (left, right) in left.into_iter().zip(right) {
            output.extend_from_slice(&left.to_le_bytes());
            output.extend_from_slice(&right.to_le_bytes());
        }
    }
    std::fs::File::create(&args[2])?.write_all(&output)?;
    Ok(())
}
