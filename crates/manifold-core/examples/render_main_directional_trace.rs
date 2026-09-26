//! Trace the Rust Main control-block motion for comparison with the original Lua function.
use manifold_core::main_directional::MainDirectionalMotion;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let scenarios = std::env::args().nth(1).ok_or("scenario CSV required")?;
    let data = std::fs::read_to_string(scenarios)?;
    let mut motion = MainDirectionalMotion::new(48_000.0);
    let mut frequency = 330.0_f32;
    let mut speed = 1.0_f32;
    let mut triggers = 0;
    let mut plays = 0;
    for line in data.lines().skip(1) {
        let values: Vec<f32> = line.split(',').map(str::parse).collect::<Result<_, _>>()?;
        if values.len() != 9 {
            return Err("invalid scenario".into());
        }
        for (id, value) in [
            (0, values[0]),
            (1, values[8]),
            (2, 1.0),
            (3, values[2]),
            (4, values[3]),
            (5, values[4]),
            (6, values[5]),
            (7, values[6]),
            (8, values[7]),
        ] {
            if !motion.set_parameter(id, value) {
                return Err("invalid directional control".into());
            }
        }
        if let Some(update) = motion.tick(128, values[1]) {
            frequency = update.oscillator_frequency;
            speed = update.sample_speed;
            triggers += i32::from(update.sample_retrigger);
            plays += i32::from(update.sample_play);
        }
        println!("{frequency:.9},{speed:.9},{triggers},{plays}");
    }
    Ok(())
}
