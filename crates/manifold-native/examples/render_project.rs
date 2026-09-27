//! Render a saved browser graph bundle through the native host boundary.
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::AudioBlock;
use manifold_native::project::NativeProject;
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let project_path = args.next().ok_or("expected project path")?;
    let output_path = args.next().ok_or("expected output path")?;
    if args.next().is_some() {
        return Err("too many arguments".into());
    }
    let project = NativeProject::parse(&std::fs::read(project_path)?)
        .map_err(|error| format!("project parse: {error:?}"))?;
    let mut processor = project
        .prepare(48_000.0, 128)
        .map_err(|error| format!("project prepare: {error:?}"))?;
    let mut output = std::fs::File::create(output_path)?;
    let note = [TimedEvent {
        offset: 16,
        node: 4,
        kind: EventKind::NoteOn {
            channel: 15,
            note: 60,
            velocity: 100,
        },
    }];
    for block in 0..64 {
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: if block == 0 { &note } else { &[] },
            })
            .map_err(|error| format!("render block {block}: {error:?}"))?;
        for (left, right) in left.iter().zip(right.iter()) {
            output.write_all(&left.to_le_bytes())?;
            output.write_all(&right.to_le_bytes())?;
        }
    }
    Ok(())
}
