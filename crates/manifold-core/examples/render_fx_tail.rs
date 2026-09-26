//! Persistent Chorus/Delay routing probe matching tools/legacy-fx-tail-reference.cpp.
use manifold_core::chorus::Chorus;
use manifold_core::fx_routing::LegacyFxRouting;
use manifold_core::stereo_delay::StereoDelay;
use std::fs::File;
use std::io::{BufWriter, Write};

fn input_sample(frame: usize, channel: usize) -> f32 {
    let mut value = 0.0_f32;
    for pulse in [0, 2000, 9500, 14000, 20000] {
        if frame == pulse + channel * 23 {
            value += if channel == 0 { 0.7 } else { -0.55 };
        }
    }
    if (4000..6000).contains(&frame) || (10500..12500).contains(&frame) {
        let (amplitude, frequency) = if channel == 0 {
            (0.2_f64, 220.0_f64)
        } else {
            (0.17, 330.0)
        };
        value += (amplitude * (2.0 * 3.141592653589793 * frequency * frame as f64 / 48000.0).sin())
            as f32;
    }
    value
}

fn main() -> std::io::Result<()> {
    let mut args = std::env::args().skip(1);
    let path = args
        .next()
        .expect("usage: render_fx_tail OUTPUT.f32 [--reset-on-reselect]");
    let reset_on_reselect = matches!(args.next().as_deref(), Some("--reset-on-reselect"));
    let mut output = BufWriter::new(File::create(path)?);
    let mut delay = StereoDelay::new(
        48_000.0,
        [
            40.0, 60.0, 0.552, 0.12, 0.0, 4200.0, 0.5, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 3.0, 6.0,
            120.0,
        ],
    );
    let mut chorus = Chorus::new(48_000.0, 128, [1.24, 0.525, 3.0, 0.6, 0.07, 0.0, 1.0]);
    let mut router = LegacyFxRouting::new(48_000.0, 8, 1.0).unwrap();
    let mut in_l = [0.0; 128];
    let mut in_r = [0.0; 128];
    let mut delay_l = [0.0; 128];
    let mut delay_r = [0.0; 128];
    let mut chorus_l = [0.0; 128];
    let mut chorus_r = [0.0; 128];
    let mut effects = [[0.0; 2]; 21];
    let mut chorus_visited = false;
    for offset in (0..32768).step_by(128) {
        if offset == 8192 {
            chorus_visited = true;
            router.select(0);
        }
        if offset == 16384 {
            if reset_on_reselect {
                delay.settle();
            }
            router.select(8);
        }
        for frame in 0..128 {
            in_l[frame] = input_sample(offset + frame, 0);
            in_r[frame] = input_sample(offset + frame, 1);
        }
        if reset_on_reselect && (8192..16384).contains(&offset) {
            delay_l.fill(0.0);
            delay_r.fill(0.0);
        } else {
            delay.process_planar([&in_l, &in_r], [&mut delay_l, &mut delay_r]);
        }
        if chorus_visited {
            chorus.process_planar([&in_l, &in_r], [&mut chorus_l, &mut chorus_r]);
        }
        for frame in 0..128 {
            effects[0] = [chorus_l[frame], chorus_r[frame]];
            effects[8] = [delay_l[frame], delay_r[frame]];
            for sample in router.process_sample([in_l[frame], in_r[frame]], &effects) {
                output.write_all(&sample.to_le_bytes())?;
            }
        }
    }
    Ok(())
}
