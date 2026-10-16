use manifold_core::Filter;
use std::{env, fs, process};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 10 {
        eprintln!(
            "usage: render_svf INPUT OUTPUT MODE CUTOFF_BEFORE CUTOFF_AFTER RESONANCE SAMPLE_RATE BLOCK_SIZE STEP_FRAME"
        );
        process::exit(2);
    }
    let mode: f32 = args[3].parse()?;
    let before: f32 = args[4].parse()?;
    let after: f32 = args[5].parse()?;
    let resonance: f32 = args[6].parse()?;
    let sample_rate: f32 = args[7].parse()?;
    let block_size: usize = args[8].parse()?;
    let step_frame: usize = args[9].parse()?;
    let bytes = fs::read(&args[1])?;
    if bytes.len() % 8 != 0 || block_size == 0 || step_frame % block_size != 0 {
        process::exit(2);
    }
    let samples: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap()))
        .collect();
    let frames = samples.len() / 2;
    if step_frame > frames {
        process::exit(2);
    }
    let mut filter = Filter::new(sample_rate);
    for (id, value) in [(0, mode), (1, before), (2, resonance)] {
        if !filter.set_parameter(id, value) {
            process::exit(2);
        }
    }
    let mut output = vec![0.0f32; samples.len()];
    for offset in (0..frames).step_by(block_size) {
        if offset == step_frame {
            filter.set_parameter(1, after);
        }
        let count = block_size.min(frames - offset);
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        let mut out_left = vec![0.0; count];
        let mut out_right = vec![0.0; count];
        for frame in 0..count {
            left[frame] = samples[(offset + frame) * 2];
            right[frame] = samples[(offset + frame) * 2 + 1];
        }
        filter.process_planar([&left, &right], [&mut out_left, &mut out_right]);
        for frame in 0..count {
            output[(offset + frame) * 2] = out_left[frame];
            output[(offset + frame) * 2 + 1] = out_right[frame];
        }
    }
    let mut encoded = Vec::with_capacity(output.len() * 4);
    for sample in output {
        encoded.extend_from_slice(&sample.to_le_bytes());
    }
    fs::write(&args[2], encoded)?;
    Ok(())
}
