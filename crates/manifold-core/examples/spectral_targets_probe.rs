use manifold_core::sine_bank::{Partial, PartialSet};
use manifold_core::spectral_targets::{
    AddFlavor, MorphRecipe, SpectralShape, WaveRecipe, build_wave_recipe, prepare_add_target,
    prepare_morph_target,
};
use manifold_core::temporal_partials::{ExtractionMode, TemporalAnalysis, TemporalFrame};

fn source() -> PartialSet {
    let mut set = PartialSet {
        fundamental: 220.0,
        count: 5,
        ..PartialSet::default()
    };
    for (index, (frequency, amplitude)) in [
        (220.0, 1.0),
        (440.0, 0.4),
        (663.0, 0.2),
        (884.0, 0.1),
        (1320.0, 0.08),
    ]
    .into_iter()
    .enumerate()
    {
        set.partials[index] = Partial {
            frequency,
            amplitude,
            phase: 0.2 * index as f32,
            decay_rate: 0.1 * index as f32,
        };
    }
    set
}

fn temporal_case(id: u32) -> PartialSet {
    let frames = (0..3)
        .map(|frame| {
            let mut partials = PartialSet {
                fundamental: 220.0,
                count: if frame == 0 { 2 } else { 3 },
                ..PartialSet::default()
            };
            for index in 0..partials.count {
                partials.partials[index] = Partial {
                    frequency: (220.0 + 5.0 * frame as f32) * (index + 1) as f32,
                    amplitude: (1.0 - 0.2 * frame as f32) / (index + 1) as f32,
                    phase: 0.1 * (frame + index) as f32,
                    decay_rate: 0.03 * index as f32,
                };
            }
            TemporalFrame {
                position: frame as f32 * 0.5,
                source_start: 0,
                rms: 0.0,
                brightness: 0.0,
                partials,
            }
        })
        .collect();
    let temporal = TemporalAnalysis {
        source_rate: 48_000.0,
        source_frames: 4096,
        region: 0..4096,
        global_fundamental: 220.0,
        global_partials: PartialSet::default(),
        pitch_confidence: 1.0,
        mode: ExtractionMode::HarmonicProjection,
        window_size: 2048,
        hop_size: 1024,
        frames,
    };
    let position = if id == 13 || id == 14 {
        0.25
    } else if id == 15 {
        0.65
    } else {
        1.0
    };
    let smooth = if id == 13 {
        0.0
    } else if id == 14 {
        0.7
    } else {
        1.0
    };
    let contrast = if id == 15 { 1.5 } else { 0.5 };
    temporal.partials_at(position, smooth, contrast)
}

fn main() {
    let id: u32 = std::env::args().nth(1).unwrap().parse().unwrap();
    let source = source();
    let wave = |waveform| {
        build_wave_recipe(WaveRecipe {
            waveform,
            count: 8,
            tilt: 0.2,
            drift: 0.3,
            pulse_width: 0.35,
        })
    };
    let result = match id {
        0..=7 => wave(id as u8),
        8 => prepare_add_target(
            &source,
            SpectralShape::default(),
            AddFlavor::SelfResynthesis,
        ),
        9 => prepare_add_target(
            &source,
            SpectralShape {
                stretch: 0.2,
                tilt_mode: 1,
            },
            AddFlavor::Driven {
                waveform: 1,
                pulse_width: 0.35,
            },
        ),
        10..=12 => prepare_morph_target(
            &wave(1),
            &source,
            MorphRecipe {
                position: (id - 10) as f32 * 0.5,
                depth: 0.7,
                curve: 2,
            },
            SpectralShape {
                stretch: 0.1,
                tilt_mode: 2,
            },
        ),
        13..=16 => temporal_case(id),
        _ => panic!("unknown case"),
    };
    print!(
        "{{\"id\":{id},\"fundamental\":{},\"partials\":[",
        result.fundamental
    );
    for (index, partial) in result.partials[..result.count].iter().enumerate() {
        if index > 0 {
            print!(",");
        }
        print!(
            "[{},{},{},{}]",
            partial.frequency, partial.amplitude, partial.phase, partial.decay_rate
        );
    }
    println!("]}}");
}
