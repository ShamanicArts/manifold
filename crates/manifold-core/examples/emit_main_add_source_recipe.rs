//! Emit a fixed Main Add source recipe for compiled C++ route comparisons.
use manifold_core::sine_bank::{Partial, PartialSet};
use manifold_core::spectral_targets::{AddFlavor, SpectralShape, prepare_add_target};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 5 && args.len() != 7 {
        return Err("usage: emit_main_add_source_recipe FREQUENCY WAVEFORM|self PULSE_WIDTH SOURCE_PARTIALS [STRETCH TILT_MODE]".into());
    }
    let fundamental: f32 = args[1].parse()?;
    let waveform: Option<u8> = if args[2] == "self" {
        None
    } else {
        Some(args[2].parse()?)
    };
    let pulse_width: f32 = args[3].parse()?;
    let stretch: f32 = if args.len() == 7 {
        args[5].parse()?
    } else {
        0.0
    };
    let tilt_mode: u8 = if args.len() == 7 { args[6].parse()? } else { 0 };
    let values: Vec<f32> = args[4]
        .split(',')
        .map(str::parse)
        .collect::<Result<_, _>>()?;
    if values.is_empty() || values.len() % 4 != 0 || values.len() > 32 * 4 {
        return Err("SOURCE_PARTIALS must contain one to 32 four-float partials".into());
    }
    let mut source = PartialSet {
        fundamental,
        count: values.len() / 4,
        ..PartialSet::default()
    };
    for (index, fields) in values.chunks_exact(4).enumerate() {
        source.partials[index] = Partial {
            frequency: fundamental * fields[0],
            amplitude: fields[1],
            phase: fields[2],
            decay_rate: fields[3],
        };
    }
    if !source.validate()
        || waveform.is_some_and(|waveform| waveform > 7)
        || !(0.01..=0.99).contains(&pulse_width)
        || !(0.0..=1.0).contains(&stretch)
        || tilt_mode > 2
    {
        return Err("Invalid source recipe".into());
    }
    let flavor = waveform.map_or(AddFlavor::SelfResynthesis, |waveform| AddFlavor::Driven {
        waveform,
        pulse_width,
    });
    let prepared = prepare_add_target(&source, SpectralShape { stretch, tilt_mode }, flavor);
    let values: Vec<String> = prepared.partials[..prepared.count]
        .iter()
        .flat_map(|partial| {
            [
                partial.frequency,
                partial.amplitude,
                partial.phase,
                partial.decay_rate,
            ]
            .into_iter()
            .map(|value| value.to_string())
        })
        .collect();
    println!("{}", values.join(","));
    Ok(())
}
