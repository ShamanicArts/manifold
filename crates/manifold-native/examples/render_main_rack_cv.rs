//! Native reference for the authored LFO-to-Filter Cutoff cable.
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::AudioBlock;
use manifold_native::project::NativeProject;
use serde_json::{Value, json};

fn energy(mut project: Value) -> f32 {
    project["signal"]["initialParameters"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|entry| entry["nodeId"] == 6 && entry["id"] == 1)
        .unwrap()["value"] = json!(800.);
    let mut processor = NativeProject::parse(&serde_json::to_vec(&project).unwrap())
        .unwrap()
        .prepare(48_000., 128)
        .unwrap();
    let note = TimedEvent {
        offset: 0,
        node: 4,
        kind: EventKind::NoteOn {
            channel: 0,
            note: 96,
            velocity: 120,
        },
    };
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    let mut energy = 0.;
    for block in 0..120 {
        let events: &[TimedEvent] = if block == 0 {
            std::slice::from_ref(&note)
        } else {
            &[]
        };
        processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events,
            })
            .unwrap();
        if block >= 40 {
            energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
        }
    }
    energy
}

fn main() {
    let base = serde_json::from_slice(include_bytes!(
        "../../../projects/main-looper/default-rack-graph.json"
    ))
    .unwrap();
    let wired = serde_json::from_slice(include_bytes!(
        "../../../projects/main-looper/lfo-filter-rack-graph.json"
    ))
    .unwrap();
    println!(
        "{}",
        json!({"unwired": energy(base), "wired": energy(wired)})
    );
}
