//! Isolated native Rust phase vocoder capture for legacy comparison.
use manifold_core::phase_vocoder::PhaseVocoder;
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 11 {
        return Err("usage: render_phase_vocoder INPUT OUTPUT RATE BLOCK FRAMES MODE PITCH STRETCH MIX FFT_ORDER".into());
    }
    let bytes = std::fs::read(&args[1])?;
    if bytes.len() % 8 != 0 {
        return Err("stereo float32 input required".into());
    }
    let source: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|part| f32::from_le_bytes(part.try_into().unwrap()))
        .collect();
    let rate: f32 = args[3].parse()?;
    let block: usize = args[4].parse()?;
    let frames: usize = args[5].parse()?;
    if source.len() != frames * 2 || block == 0 {
        return Err("input length or block mismatch".into());
    }
    let params = [
        args[6].parse()?,
        args[7].parse()?,
        args[8].parse()?,
        args[9].parse()?,
        args[10].parse()?,
    ];
    let mut node = PhaseVocoder::new(rate, params);
    let mut rendered = Vec::with_capacity(bytes.len());
    for offset in (0..frames).step_by(block) {
        let count = (frames - offset).min(block);
        let mut left = vec![0.0; count];
        let mut right = vec![0.0; count];
        let mut out_left = vec![0.0; count];
        let mut out_right = vec![0.0; count];
        for frame in 0..count {
            left[frame] = source[(offset + frame) * 2];
            right[frame] = source[(offset + frame) * 2 + 1];
        }
        node.process_planar([&left, &right], [&mut out_left, &mut out_right]);
        for (a, b) in out_left.into_iter().zip(out_right) {
            rendered.extend_from_slice(&a.to_le_bytes());
            rendered.extend_from_slice(&b.to_le_bytes());
        }
    }
    std::fs::File::create(&args[2])?.write_all(&rendered)?;
    Ok(())
}
