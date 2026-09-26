//! Trace the Rust Main pitch route against the original Lua functions.
use manifold_core::main_pitch::route_main_pitch;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let scenarios = std::env::args().nth(1).ok_or("scenario CSV required")?;
    let data = std::fs::read_to_string(scenarios)?;
    for line in data.lines().skip(1) {
        let values: Vec<f32> = line.split(',').map(str::parse).collect::<Result<_, _>>()?;
        if values.len() != 5 {
            return Err("invalid pitch scenario".into());
        }
        let route = route_main_pitch(
            values[0],
            values[1],
            values[2] as u32,
            values[3],
            values[4] as u32,
        );
        println!(
            "{:.9},{:.9},{:.9},{:.9},{:.9},{}",
            route.wave_frequency,
            route.desired_sample_ratio,
            route.sample_speed,
            route.vocoder_semitones,
            route.vocoder_mix,
            route.vocoder_mode
        );
    }
    Ok(())
}
