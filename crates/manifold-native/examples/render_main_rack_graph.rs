//! Headless native reference for the rack-document audio edge proof.
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::AudioBlock;
use manifold_native::project::NativeProject;
use serde_json::{Value, json};

fn note_energy(document: &[u8]) -> f32 {
    let mut processor = NativeProject::parse(document)
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
    for block in 0..90 {
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
    let mut document: Value = serde_json::from_slice(include_bytes!(
        "../../../projects/main-looper/default-rack-graph.json"
    ))
    .unwrap();
    document["signal"]["initialParameters"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|entry| entry["nodeId"] == 6 && entry["id"] == 1)
        .unwrap()["value"] = json!(80.);
    let filtered = note_energy(&serde_json::to_vec(&document).unwrap());
    document["signal"]["connections"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|edge| edge["to"] == 7)
        .unwrap()["from"] = json!(5);
    let bypassed = note_energy(&serde_json::to_vec(&document).unwrap());
    println!("{}", json!({"filtered": filtered, "bypassed": bypassed}));
}
