//! Offline stereo reference for a browser-authored MIDI graph project.
//! Usage: render_graph_midi_audio PROJECT OUTPUT_F32 BLOCK ON_FRAME OFF_FRAME VELOCITY
//! Velocity zero renders a graph with no MIDI events (for internal sources).

use std::io::Write;

use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::AudioBlock;
use manifold_native::project::NativeProject;

const RATE: f32 = 48_000.0;
const FRAMES: usize = 48_000;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let project_path = args.next().ok_or("expected project JSON")?;
    let output_path = args.next().ok_or("expected output f32 path")?;
    let block_size: usize = args.next().ok_or("expected block size")?.parse()?;
    let note_on: usize = args.next().ok_or("expected note-on frame")?.parse()?;
    let note_off: usize = args.next().ok_or("expected note-off frame")?.parse()?;
    let velocity: u8 = args.next().ok_or("expected MIDI velocity")?.parse()?;
    if args.next().is_some()
        || block_size == 0
        || block_size > 65_536
        || (velocity != 0 && (note_on >= note_off || note_off >= FRAMES))
        || velocity > 127
    {
        return Err("invalid render arguments".into());
    }
    let bytes = std::fs::read(project_path)?;
    let document: serde_json::Value = serde_json::from_slice(&bytes)?;
    let midi_node = document["signal"]["nodes"]
        .as_array()
        .and_then(|nodes| nodes.iter().find(|node| node["type"] == "midi-input"))
        .and_then(|node| node["id"].as_u64());
    if velocity != 0 && midi_node.is_none() {
        return Err("project has no MIDI input node".into());
    }
    let project =
        NativeProject::parse(&bytes).map_err(|error| format!("project parse: {error:?}"))?;
    let mut processor = project
        .prepare(RATE, block_size)
        .map_err(|error| format!("project prepare: {error:?}"))?;
    let silence = vec![0_f32; block_size];
    let mut left = vec![0_f32; block_size];
    let mut right = vec![0_f32; block_size];
    let mut file = std::fs::File::create(output_path)?;
    for start in (0..FRAMES).step_by(block_size) {
        let frames = block_size.min(FRAMES - start);
        let mut events = Vec::with_capacity(2);
        if let Some(midi_node) = midi_node.filter(|_| velocity != 0) {
            for (frame, kind) in [
                (
                    note_on,
                    EventKind::NoteOn {
                        channel: 0,
                        note: 60,
                        velocity,
                    },
                ),
                (
                    note_off,
                    EventKind::NoteOff {
                        channel: 0,
                        note: 60,
                    },
                ),
            ] {
                if (start..start + frames).contains(&frame) {
                    events.push(TimedEvent {
                        offset: frame - start,
                        node: midi_node,
                        kind,
                    });
                }
            }
        }
        processor
            .process(AudioBlock {
                main: Some([&silence[..frames], &silence[..frames]]),
                sidechain: None,
                output: [&mut left[..frames], &mut right[..frames]],
                events: &events,
            })
            .map_err(|error| format!("render: {error:?}"))?;
        for (a, b) in left[..frames].iter().zip(&right[..frames]) {
            file.write_all(&a.to_le_bytes())?;
            file.write_all(&b.to_le_bytes())?;
        }
    }
    Ok(())
}
