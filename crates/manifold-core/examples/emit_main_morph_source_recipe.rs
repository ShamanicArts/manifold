//! Emit a fixed Main Morph source recipe for compiled C++ route comparisons.
use manifold_core::sine_bank::{Partial, PartialSet};
use manifold_core::spectral_targets::{MorphRecipe, SpectralShape, prepare_morph_target};

fn parse_partials(
    values: &str,
    fundamental: f32,
) -> Result<PartialSet, Box<dyn std::error::Error>> {
    let values: Vec<f32> = values
        .split(',')
        .map(str::parse)
        .collect::<Result<_, _>>()?;
    if values.is_empty() || values.len() % 4 != 0 || values.len() > 32 * 4 {
        return Err("partials must contain one to 32 four-float partials".into());
    }
    let mut result = PartialSet {
        fundamental,
        count: values.len() / 4,
        ..PartialSet::default()
    };
    for (index, fields) in values.chunks_exact(4).enumerate() {
        result.partials[index] = Partial {
            frequency: fundamental * fields[0],
            amplitude: fields[1],
            phase: fields[2],
            decay_rate: fields[3],
        };
    }
    if !result.validate() {
        return Err("invalid partials".into());
    }
    Ok(result)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 9 {
        return Err("usage: emit_main_morph_source_recipe FREQUENCY WAVE_PARTIALS SOURCE_PARTIALS STRETCH TILT_MODE AMOUNT DEPTH CURVE".into());
    }
    let fundamental: f32 = args[1].parse()?;
    let wave = parse_partials(&args[2], 1.0)?;
    let source = parse_partials(&args[3], fundamental)?;
    let shape = SpectralShape {
        stretch: args[4].parse()?,
        tilt_mode: args[5].parse()?,
    };
    let morph = MorphRecipe {
        position: args[6].parse()?,
        depth: args[7].parse()?,
        curve: args[8].parse()?,
    };
    if !(0.0..=1.0).contains(&shape.stretch)
        || shape.tilt_mode > 2
        || !(0.0..=1.0).contains(&morph.position)
        || !(0.0..=1.0).contains(&morph.depth)
        || morph.curve > 2
    {
        return Err("invalid Morph recipe".into());
    }
    let prepared = prepare_morph_target(&wave, &source, morph, shape);
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
