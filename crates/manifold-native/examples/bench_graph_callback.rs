//! Measure prepared native graph processing separately from project loading.
//! Usage: cargo run --release -p manifold-native --example bench_graph_callback -- PROJECT.json

use std::time::Instant;

use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::AudioBlock;
use manifold_native::project::NativeProject;

const RATE: f32 = 48_000.0;

fn scenario(bytes: &[u8], frames: usize, voices: u8) -> Result<serde_json::Value, String> {
    let started = Instant::now();
    let project = NativeProject::parse(bytes).map_err(|error| format!("parse: {error:?}"))?;
    let parsed_ms = started.elapsed().as_secs_f64() * 1_000.0;
    let started = Instant::now();
    let mut processor = project
        .prepare(RATE, frames)
        .map_err(|error| format!("prepare: {error:?}"))?;
    let prepared_ms = started.elapsed().as_secs_f64() * 1_000.0;

    let silence = vec![0.0_f32; frames];
    let mut left = vec![0.0_f32; frames];
    let mut right = vec![0.0_f32; frames];
    let note_ons: Vec<_> = (0..voices)
        .map(|voice| TimedEvent {
            offset: 0,
            node: 4,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60 + voice,
                velocity: 100,
            },
        })
        .collect();
    let mut run_block = |events: &[TimedEvent]| -> Result<f64, String> {
        let started = Instant::now();
        processor
            .process(AudioBlock {
                main: Some([&silence, &silence]),
                sidechain: None,
                output: [&mut left, &mut right],
                events,
            })
            .map_err(|error| format!("process: {error:?}"))?;
        Ok(started.elapsed().as_secs_f64() * 1_000.0)
    };
    run_block(&note_ons)?;
    for _ in 0..64 {
        run_block(&[])?;
    }
    let blocks = if frames == 128 { 4_096 } else { 512 };
    let mut durations = Vec::with_capacity(blocks);
    for _ in 0..blocks {
        durations.push(run_block(&[])?);
    }
    durations.sort_by(f64::total_cmp);
    let index = |fraction: f64| ((blocks - 1) as f64 * fraction).round() as usize;
    let deadline_ms = frames as f64 / RATE as f64 * 1_000.0;
    let p95_ms = durations[index(0.95)];
    let output_peak = left
        .iter()
        .chain(&right)
        .fold(0.0_f32, |peak, value| peak.max(value.abs()));
    if output_peak <= 0.01 {
        return Err("prepared sample graph became silent".into());
    }
    Ok(serde_json::json!({
        "frames": frames,
        "heldNotes": voices,
        "activeSampleVoices": voices as usize * 4,
        "blocks": blocks,
        "sampleRate": RATE,
        "parseMs": parsed_ms,
        "prepareMs": prepared_ms,
        "deadlineMs": deadline_ms,
        "medianMs": durations[index(0.5)],
        "p95Ms": p95_ms,
        "maxMs": durations[blocks - 1],
        "p95DeadlinePercent": p95_ms / deadline_ms * 100.0,
        "outputPeakAtEnd": output_peak,
    }))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args().nth(1).ok_or("expected project JSON")?;
    let bytes = std::fs::read(&path)?;
    let mut results = Vec::new();
    for (frames, voices) in [(128, 1), (128, 8), (1024, 1), (1024, 8)] {
        results.push(scenario(&bytes, frames, voices)?);
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "projectBytes": bytes.len(),
            "scenarios": results,
            "limitation": "Offline native processing timings; no DAW scheduling or physical device underruns measured"
        }))?
    );
    Ok(())
}
