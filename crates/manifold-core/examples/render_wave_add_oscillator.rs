//! Isolated prepared Main wave Add oscillator capture.
use manifold_core::wave_add_oscillator::{WaveAddOscillator, prepare_default_tables};
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 10 {
        return Err("usage: render_wave_add_oscillator OUTPUT FREQ_BEFORE FREQ_AFTER AMP_BEFORE AMP_AFTER WAVEFORM SAMPLE_RATE STEP_FRAME FRAMES".into());
    }
    let before_frequency: f32 = args[2].parse()?;
    let after_frequency: f32 = args[3].parse()?;
    let before_amplitude: f32 = args[4].parse()?;
    let after_amplitude: f32 = args[5].parse()?;
    let waveform: u32 = args[6].parse()?;
    let sample_rate: f32 = args[7].parse()?;
    let step_frame: usize = args[8].parse()?;
    let frames: usize = args[9].parse()?;
    let mut oscillator = WaveAddOscillator::new(sample_rate, prepare_default_tables());
    oscillator.set_waveform(waveform);
    oscillator.set_frequency(before_frequency);
    oscillator.set_amplitude(before_amplitude);
    let mut output = Vec::with_capacity(frames * 8);
    for frame in 0..frames {
        if frame == step_frame {
            oscillator.set_frequency(after_frequency);
            oscillator.set_amplitude(after_amplitude);
        }
        let sample = oscillator.process_sample();
        output.extend_from_slice(&sample.to_le_bytes());
        output.extend_from_slice(&sample.to_le_bytes());
    }
    std::fs::File::create(&args[1])?.write_all(&output)?;
    Ok(())
}
