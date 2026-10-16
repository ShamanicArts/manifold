//! Exercise the public Rust author API on portable PCM graphs, then render offline.
use base64::{Engine as _, engine::general_purpose::STANDARD};
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::{AudioBlock, author::GraphWorkspace, project::NativeProject};
use serde_json::Value;
use std::io::Write;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 3 {
        return Err("usage: reauthor_resources INPUT_JSON OUTPUT_JSON OUTPUT_F32".into());
    }
    let document: Value = serde_json::from_slice(&std::fs::read(&args[0])?)?;
    let mut graph =
        GraphWorkspace::from_project(&document).map_err(|error| format!("import: {error:?}"))?;
    for asset in document["assets"].as_array().into_iter().flatten() {
        let bytes = STANDARD.decode(asset["pcmF32Base64"].as_str().unwrap())?;
        let stereo: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|bytes| f32::from_le_bytes(bytes.try_into().unwrap()))
            .collect();
        graph
            .set_sample_asset(
                asset["nodeId"].as_u64().unwrap() as u32,
                &stereo,
                asset["sourceRate"].as_u64().unwrap() as u32,
                asset["label"].as_str().unwrap(),
            )
            .map_err(|error| format!("PCM authoring: {error:?}"))?;
    }
    // Both languages independently make these structural edits.
    for node in document["signal"]["nodes"].as_array().unwrap() {
        let id = node["id"].as_u64().unwrap() as u32;
        let config = match node["type"].as_str().unwrap() {
            "loop-capture" => Some(("capacitySeconds", 3.)),
            "fixed-gain" => Some(("gain", 0.25)),
            _ => None,
        };
        if let Some(config) = config {
            graph
                .configure(id, &[config])
                .map_err(|error| format!("configuration: {error:?}"))?;
        }
    }
    let mut events = Vec::new();
    for voice in [1, 8] {
        let prefix = format!("/midi/synth/rack/sample/1/nodes/voice_{voice}");
        if let Some(playback) = graph.find_instance(&format!("{prefix}/playback")) {
            let gain = graph
                .find_instance(&format!("{prefix}/gain"))
                .ok_or("missing voice gain")?;
            graph
                .set_parameter(gain, 0, 0.8)
                .map_err(|error| format!("voice gain: {error:?}"))?;
            graph
                .set_control(
                    &format!("/midi/synth/rack/sample/1/voice/{voice}/gate"),
                    0.8,
                )
                .map_err(|error| format!("voice control: {error:?}"))?;
            events.push(TimedEvent {
                offset: 16,
                node: playback.into(),
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 100,
                },
            });
        }
    }
    let exported = graph
        .to_project_json()
        .map_err(|error| format!("export: {error:?}"))?;
    std::fs::write(&args[1], &exported)?;
    let mut runtime = NativeProject::parse(&exported)
        .map_err(|error| format!("parse: {error:?}"))?
        .prepare_patchable_with_state(48000., 128)
        .map_err(|error| format!("prepare: {error:?}"))?;
    let mut file = std::fs::File::create(&args[2])?;
    for block in 0..64 {
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        runtime
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: if block == 0 { &events } else { &[] },
            })
            .map_err(|error| format!("process: {error:?}"))?;
        for (left, right) in left.iter().zip(right.iter()) {
            file.write_all(&left.to_le_bytes())?;
            file.write_all(&right.to_le_bytes())?;
        }
    }
    Ok(())
}
