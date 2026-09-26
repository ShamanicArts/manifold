//! Native reference for the background sample summary ABI.
use manifold_core::sample_analysis::analyze_stereo;
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 4 {
        return Err("usage: render_sample_analysis INPUT OUTPUT SOURCE_RATE".into());
    }
    let raw = std::fs::read(&args[1])?;
    if raw.len() % 8 != 0 {
        return Err("invalid stereo PCM".into());
    }
    let stereo: Vec<f32> = raw
        .chunks_exact(4)
        .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
        .collect();
    let summary = analyze_stereo(&stereo, args[3].parse()?).ok_or("analysis rejected source")?;
    let mut output = std::fs::File::create(&args[2])?;
    for value in [
        summary.peak,
        summary.rms,
        summary.pitch_hz.unwrap_or(0.0),
        summary.pitch_confidence,
    ]
    .into_iter()
    .chain(summary.peaks)
    {
        output.write_all(&value.to_le_bytes())?;
    }
    Ok(())
}
