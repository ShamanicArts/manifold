//! Regenerate the review session with real native Main import, automation,
//! bounded live snapshot, and browser-compatible save.

use std::error::Error;
use std::fs;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use manifold_native::main_host::MainAudioRuntime;
use manifold_native::main_host_parameters::SYNTH_BASE;
use manifold_native::main_instrument::{
    MainAudioBlock, MainHostAudioBlock, MainHostEvent, MainHostEventKind,
};
use manifold_native::main_session::prepare_main_session;
use serde_json::{Value, json};

fn process(audio: &mut MainAudioRuntime, actions: &[MainHostEvent]) -> Result<(), Box<dyn Error>> {
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    if actions.is_empty() {
        audio
            .process(MainAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .map_err(|error| format!("audio process: {error:?}"))?;
    } else {
        audio
            .process_host(MainHostAudioBlock {
                input: None,
                output: [&mut left, &mut right],
                actions,
            })
            .map_err(|error| format!("host process: {error:?}"))?;
    }
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    let output = std::env::args_os()
        .nth(1)
        .ok_or("pass an output JSON path")?;
    let mut session: Value = serde_json::from_str(include_str!(
        "../tests/fixtures/main-browser-v15-empty.json"
    ))?;
    let frames = 6_000;
    let mut pcm = Vec::with_capacity(frames * 2);
    for frame in 0..frames {
        let phase = frame as f32 * std::f32::consts::TAU * 220.0 / 48_000.0;
        let envelope = 0.38 * (1.0 - frame as f32 / frames as f32);
        pcm.extend_from_slice(&[phase.sin() * envelope, phase.cos() * envelope * 0.7]);
    }
    let mut bytes = Vec::with_capacity(pcm.len() * 4);
    for sample in &pcm {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    let encoded = STANDARD.encode(bytes);
    session["layers"][0]["frames"] = json!(frames);
    session["layers"][0]["bars"] = json!(0.0625);
    session["layers"][0]["playing"] = json!(true);
    session["layers"][0]["pcmF32Base64"] = json!(encoded);
    session["sample"]["frames"] = json!(frames);
    session["sample"]["pcmF32Base64"] = json!(encoded);
    session["rack"]["source"]["sampleBlend"] = json!(0.4);
    let (mut audio, mut control) =
        MainAudioRuntime::prepare(48_000.0, 128).map_err(|error| format!("prepare: {error:?}"))?;
    control
        .submit_session(&serde_json::to_vec(&session)?)
        .map_err(|error| format!("submit: {error:?}"))?;
    process(&mut audio, &[])?; // publish prepared session after a valid block
    control.reclaim();
    let changes = [
        (SYNTH_BASE + 15, 0.6),
        (SYNTH_BASE + 22, 1_000.0),
        (SYNTH_BASE + 64, 1.0),
        (SYNTH_BASE + 104, -2.0),
        (SYNTH_BASE + 105, 0.8),
        (SYNTH_BASE + 129, 0.25),
    ]
    .map(|(id, value)| MainHostEvent {
        offset: 64,
        kind: MainHostEventKind::Parameter { id, value },
    });
    process(&mut audio, &changes)?;
    control
        .request_session_snapshot()
        .map_err(|error| format!("snapshot request: {error:?}"))?;
    let saved = loop {
        process(&mut audio, &[])?;
        if let Some(saved) = control
            .poll_session_snapshot()
            .map_err(|error| format!("session export: {error:?}"))?
        {
            break saved;
        }
    };
    prepare_main_session(&saved, 48_000.0, 128).map_err(|error| format!("reimport: {error:?}"))?;
    fs::write(output, saved)?;
    Ok(())
}
