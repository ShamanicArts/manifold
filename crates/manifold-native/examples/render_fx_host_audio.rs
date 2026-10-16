//! Render an authored Standalone FX project from interleaved stereo f32 PCM.
//! This is an offline reference for comparing a real host's audio output.

use std::io::Write;

use manifold_native::AudioBlock;
use manifold_native::project::NativeProject;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let project_path = args.next().ok_or("expected project JSON")?;
    let input_path = args.next().ok_or("expected stereo f32le input")?;
    let output_path = args.next().ok_or("expected stereo f32le output")?;
    let block_size: usize = args.next().unwrap_or_else(|| "512".into()).parse()?;
    if args.next().is_some() || block_size == 0 || block_size > 65_536 {
        return Err("invalid block size or extra arguments".into());
    }
    let input = std::fs::read(input_path)?;
    if input.len() % 8 != 0 {
        return Err("input must have complete stereo f32 frames".into());
    }
    let project = NativeProject::parse_fx_module(&std::fs::read(project_path)?)
        .map_err(|error| format!("project parse: {error:?}"))?;
    let mut processor = project
        .prepare(48_000.0, block_size)
        .map_err(|error| format!("project prepare: {error:?}"))?;
    let mut output = std::fs::File::create(output_path)?;
    for chunk in input.chunks(block_size * 8) {
        let frames = chunk.len() / 8;
        let mut left = vec![0.0; frames];
        let mut right = vec![0.0; frames];
        let mut out_left = vec![0.0; frames];
        let mut out_right = vec![0.0; frames];
        for (index, pair) in chunk.chunks_exact(8).enumerate() {
            left[index] = f32::from_le_bytes(pair[..4].try_into()?);
            right[index] = f32::from_le_bytes(pair[4..].try_into()?);
        }
        processor
            .process(AudioBlock {
                main: Some([&left, &right]),
                sidechain: None,
                output: [&mut out_left, &mut out_right],
                events: &[],
            })
            .map_err(|error| format!("render: {error:?}"))?;
        for (left, right) in out_left.iter().zip(&out_right) {
            output.write_all(&left.to_le_bytes())?;
            output.write_all(&right.to_le_bytes())?;
        }
    }
    Ok(())
}
