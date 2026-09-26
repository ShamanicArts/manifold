//! Fixed identity-effect probe matching tools/legacy-fx-routing-probe.cpp.
use manifold_core::fx_routing::LegacyFxRouting;
use std::fs::File;
use std::io::{BufWriter, Write};

fn main() -> std::io::Result<()> {
    let path = std::env::args()
        .nth(1)
        .expect("usage: render_fx_routing OUTPUT.f32");
    let mut output = BufWriter::new(File::create(path)?);
    let mut router = LegacyFxRouting::new(48_000.0, 0, 0.0).unwrap();
    let input = [0.8, 0.6];
    let mut effects = [[0.0; 2]; 21];
    effects[0] = input;
    effects[4] = input;
    for frame in 0..8192 {
        match frame {
            2048 => {
                router.set_mix(1.0);
            }
            4096 => {
                router.select(4);
            }
            6144 => {
                router.select(0);
            }
            _ => {}
        }
        for sample in router.process_sample(input, &effects) {
            output.write_all(&sample.to_le_bytes())?;
        }
    }
    Ok(())
}
