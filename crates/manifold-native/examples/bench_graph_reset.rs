//! Time in-place reset after preparing a large authored graph.
//! Usage: cargo run --release -p manifold-native --example bench_graph_reset -- PROJECT.json

use std::time::Instant;

use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::AudioBlock;
use manifold_native::project::NativeProject;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args().nth(1).ok_or("expected project JSON")?;
    let bytes = std::fs::read(path)?;
    let project = NativeProject::parse(&bytes).map_err(|error| format!("parse: {error:?}"))?;
    let mut processor = project
        .prepare(48_000.0, 128)
        .map_err(|error| format!("prepare: {error:?}"))?;
    let notes: Vec<_> = (0..8)
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
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    let mut durations = Vec::with_capacity(512);
    let mut peak = 0.0_f32;
    for index in 0..576 {
        processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &notes,
            })
            .map_err(|error| format!("process: {error:?}"))?;
        peak = peak.max(
            left.iter()
                .chain(&right)
                .map(|sample| sample.abs())
                .fold(0.0, f32::max),
        );
        let started = Instant::now();
        processor.reset_processing();
        let elapsed = started.elapsed().as_secs_f64() * 1_000.0;
        if index >= 64 {
            durations.push(elapsed);
        }
    }
    if peak <= 0.01 {
        return Err("prepared graph was silent".into());
    }
    durations.sort_by(f64::total_cmp);
    let percentile =
        |fraction: f64| durations[((durations.len() - 1) as f64 * fraction).round() as usize];
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "projectBytes": bytes.len(),
            "resets": durations.len(),
            "activeNotesBeforeEachReset": notes.len(),
            "outputPeak": peak,
            "medianMs": percentile(0.5),
            "p95Ms": percentile(0.95),
            "maxMs": durations[durations.len() - 1],
            "audioBlockDeadlineMsAt128Frames": 128.0 / 48_000.0 * 1_000.0,
            "limitation": "Offline native reset timings; no DAW scheduling or physical device underruns measured"
        }))?
    );
    Ok(())
}
