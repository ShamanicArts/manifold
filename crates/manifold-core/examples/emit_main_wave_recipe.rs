//! Emit the Rust Main additive wave recipe for the compiled C++ route probe.
use manifold_core::spectral_targets::{WaveRecipe, build_wave_recipe};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 6 {
        return Err("usage: emit_main_wave_recipe WAVEFORM COUNT TILT DRIFT PULSE_WIDTH".into());
    }
    let recipe = WaveRecipe {
        waveform: args[1].parse()?,
        count: args[2].parse()?,
        tilt: args[3].parse()?,
        drift: args[4].parse()?,
        pulse_width: args[5].parse()?,
    };
    let prepared = build_wave_recipe(recipe);
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
