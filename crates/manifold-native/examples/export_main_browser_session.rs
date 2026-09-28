//! Regenerate the review session with real native Main import, automation,
//! bounded live snapshot, and browser-compatible save.

use std::error::Error;
use std::fs;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use manifold_native::main_host::MainAudioRuntime;
use manifold_native::main_host_parameters::{
    ATV_BASE, COMPARE_BASE, CV_MIX_BASE, NOTE_FILTER_BASE, RANGE_BASE, SAMPLE_HOLD_BASE,
    SCALE_QUANTIZER_BASE, SLEW_BASE, SYNTH_BASE, TRANSPOSE_BASE, VELOCITY_MAPPER_BASE,
};
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
    let legacy_v3 = match std::env::args().nth(2).as_deref() {
        None => false,
        Some("--legacy-v3") => true,
        Some(_) => return Err("optional second argument must be --legacy-v3".into()),
    };
    let mut session: Value = serde_json::from_str(include_str!(
        "../../../projects/main-looper/default-session-v15.json"
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
    if legacy_v3 {
        session["version"] = json!(3);
        let mut lfo = session["rack"]["lfos"][0].clone();
        lfo.as_object_mut()
            .ok_or("default LFO is not an object")?
            .remove("slot");
        lfo["shape"] = json!(3);
        let rack = session["rack"]
            .as_object_mut()
            .ok_or("default rack is not an object")?;
        rack.retain(|key, _| {
            ["source", "adsr", "filter", "fx1", "fx2", "eq"].contains(&key.as_str())
        });
        rack.insert("lfo".into(), lfo);
    }
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
        (ATV_BASE, -0.65),
        (ATV_BASE + 1, 0.2),
        (ATV_BASE + 2, 2.0),
        (ATV_BASE + 3, 1.0),
        (SLEW_BASE, 240.0),
        (SLEW_BASE + 1, 480.0),
        (SLEW_BASE + 2, 1.0),
        (SLEW_BASE + 3, 2.0),
        (SAMPLE_HOLD_BASE, 1.0),
        (SAMPLE_HOLD_BASE + 1, 3.0),
        (SAMPLE_HOLD_BASE + 2, 1.0),
        (SAMPLE_HOLD_BASE + 3, 1.0),
        (COMPARE_BASE, 1.0),
        (COMPARE_BASE + 1, 0.35),
        (COMPARE_BASE + 2, 0.12),
        (COMPARE_BASE + 3, 5.0),
        (CV_MIX_BASE, 0.75),
        (CV_MIX_BASE + 1, 0.4),
        (CV_MIX_BASE + 4, -0.15),
        (CV_MIX_BASE + 5, 4.0),
        (RANGE_BASE, 0.2),
        (RANGE_BASE + 1, 0.9),
        (RANGE_BASE + 2, 1.0),
        (RANGE_BASE + 3, 6.0),
        (SCALE_QUANTIZER_BASE, 2.0),
        (SCALE_QUANTIZER_BASE + 1, 2.0),
        (SCALE_QUANTIZER_BASE + 3, 1.0),
        (TRANSPOSE_BASE, 7.0),
        (TRANSPOSE_BASE + 1, 1.0),
        (TRANSPOSE_BASE + 2, 1.0),
        (NOTE_FILTER_BASE, 68.0),
        (NOTE_FILTER_BASE + 1, 72.0),
        (NOTE_FILTER_BASE + 3, 2.0),
        (NOTE_FILTER_BASE + 4, 1.0),
        (VELOCITY_MAPPER_BASE, 0.8),
        (VELOCITY_MAPPER_BASE + 1, 2.0),
        (VELOCITY_MAPPER_BASE + 2, 0.1),
        (VELOCITY_MAPPER_BASE + 3, 4.0),
        (VELOCITY_MAPPER_BASE + 4, 1.0),
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
