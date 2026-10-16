#[path = "support/callback_heap.rs"]
mod callback_heap;
use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::{
    AudioBlock,
    author::GraphWorkspace,
    project::{NativeProject, PreparedNativeProject},
};
use serde_json::{Value, json};
fn prepare(doc: &Value) -> PreparedNativeProject {
    NativeProject::parse(&serde_json::to_vec(doc).unwrap())
        .unwrap()
        .prepare_patchable_with_state(48000., 128)
        .unwrap()
}
fn parameter(doc: &mut Value, node: u64, id: u32, value: f32) {
    doc["signal"]["initialParameters"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|p| p["nodeId"] == node && p["id"] == id)
        .unwrap()["value"] = json!(value);
}
fn render(runtime: &mut PreparedNativeProject, events: &[TimedEvent]) -> [[f32; 128]; 2] {
    let mut output = [[0.; 128]; 2];
    let [left, right] = &mut output;
    callback_heap::measure(|| {
        runtime
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [left, right],
                events,
            })
            .unwrap()
    });
    output
}
fn renumber(doc: &mut Value, delta: u64) {
    let map = |id: u64| if id >= 4 { id + delta } else { id };
    for node in doc["signal"]["nodes"].as_array_mut().unwrap() {
        node["id"] = map(node["id"].as_u64().unwrap()).into();
    }
    for edge in doc["signal"]["connections"].as_array_mut().unwrap() {
        for key in ["from", "to"] {
            edge[key] = map(edge[key].as_u64().unwrap()).into();
        }
    }
    for p in doc["signal"]["initialParameters"].as_array_mut().unwrap() {
        p["nodeId"] = map(p["nodeId"].as_u64().unwrap()).into();
    }
    for key in ["assets", "instances", "endpoints"] {
        if let Some(entries) = doc.get_mut(key).and_then(Value::as_array_mut) {
            for p in entries {
                p["nodeId"] = map(p["nodeId"].as_u64().unwrap()).into();
            }
        }
    }
    if let Some(bindings) = doc.get_mut("sampleBindings").and_then(Value::as_array_mut) {
        for p in bindings {
            for key in ["nodeId", "sourceNodeId"] {
                p[key] = map(p[key].as_u64().unwrap()).into();
            }
        }
    }
}
fn wave(path: &std::path::Path, pcm: &[f32]) {
    let size = (pcm.len() * 4) as u32;
    let mut out = Vec::with_capacity(44 + size as usize);
    out.extend(b"RIFF");
    out.extend((36 + size).to_le_bytes());
    out.extend(b"WAVEfmt ");
    out.extend(16u32.to_le_bytes());
    out.extend(3u16.to_le_bytes());
    out.extend(2u16.to_le_bytes());
    out.extend(48000u32.to_le_bytes());
    out.extend(384000u32.to_le_bytes());
    out.extend(8u16.to_le_bytes());
    out.extend(32u16.to_le_bytes());
    out.extend(b"data");
    out.extend(size.to_le_bytes());
    for value in pcm {
        out.extend(value.to_le_bytes());
    }
    std::fs::write(path, out).unwrap();
}
#[test]
fn actual_eight_voice_sample_unison_wet_fft_history_survives_repeated_renumbering_without_heap_work()
 {
    let mut document: Value = serde_json::from_slice(include_bytes!(
        "../../../projects/graph-workspace/authored-rack-sample-eight-voice.json"
    ))
    .unwrap();
    for voice in 0..8 {
        let region = 4 + voice * 3;
        parameter(&mut document, region, 9, 3.);
        parameter(&mut document, region, 10, 19.);
        parameter(&mut document, region, 11, 0.6);
        parameter(&mut document, region + 1, 1, (voice as f32 - 3.) * 0.7);
        parameter(&mut document, region + 1, 3, 1.);
        parameter(&mut document, region + 2, 0, 0.11);
    }
    let mut current = prepare(&document);
    let mut reference = prepare(&document);
    let events: Vec<_> = (0..8)
        .map(|voice| TimedEvent {
            node: 4 + voice * 3,
            offset: voice as usize * 3,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        })
        .collect();
    assert_eq!(
        render(&mut current, &events),
        render(&mut reference, &events)
    );
    let mut pcm = Vec::new();
    let mut controls = Vec::new();
    let mut rows = Vec::new();
    for block in 1..256 {
        if [23, 51, 78, 125, 183].contains(&block) {
            let baseline = serde_json::to_vec(&document).unwrap();
            renumber(&mut document, 100);
            let mut next = prepare(&document);
            next.plan_parameter_inheritance(&baseline).unwrap();
            let moved =
                callback_heap::measure(|| next.adopt_live_replacement_from(&mut current, true));
            assert!(moved >= 16);
            rows.push(json!({"block":block,"transferred":moved}));
            current = next;
        }
        let a = render(&mut current, &[]);
        let b = render(&mut reference, &[]);
        assert_eq!(a, b, "block {block}");
        for frame in 0..128 {
            pcm.extend([a[0][frame], a[1][frame]]);
            controls.extend([b[0][frame], b[1][frame]]);
        }
    }
    assert!(pcm.iter().any(|v| v.abs() > 0.01));
    let reopened = current.save_state().unwrap();
    let saved: Value = serde_json::from_slice(&reopened).unwrap();
    assert_eq!(saved["sampleBindings"].as_array().unwrap().len(), 7);
    if let Ok(root) = std::env::var("MANIFOLD_SAMPLE_PROOF_ROOT") {
        let root = std::path::Path::new(&root);
        std::fs::create_dir_all(root).unwrap();
        wave(&root.join("native-edited.wav"), &pcm);
        wave(&root.join("native-reference.wav"), &controls);
        std::fs::write(root.join("native-saved.json"), reopened).unwrap();
        std::fs::write(root.join("native-report.json"),serde_json::to_vec_pretty(&json!({"frames":pcm.len()/2,"edits":rows,"differingSamples":0,"callbackAllocations":0,"callbackDeallocations":0,"scope":"native Rust prepared graph; actual eight-voice module topology, all eight wet vocoders and 3-way unison"})).unwrap()).unwrap();
    }
}
fn instrument_document() -> Value {
    let mut g = GraphWorkspace::new();
    for (id, kind) in [
        (2, "midi-input"),
        (4, "sample-instrument"),
        (5, "phase-vocoder"),
        (6, "gain"),
    ] {
        g.add(id, kind).unwrap();
        g.register_instance(&format!("/sample/{kind}"), id).unwrap();
    }
    g.connect(2, "out", 4, "midi").unwrap();
    g.connect(4, "out", 5, "audio").unwrap();
    g.connect(5, "out", 6, "audio").unwrap();
    g.connect(6, "out", 3, "in").unwrap();
    let pcm: Vec<f32> = (0..8192)
        .flat_map(|i| {
            let v = (i as f32 * 0.057).sin() * 0.4;
            [v, v * 0.71]
        })
        .collect();
    g.set_sample_asset(4, &pcm, 48000, "Instrument").unwrap();
    g.set_parameter(4, 11, 4.).unwrap();
    g.set_parameter(4, 12, 21.).unwrap();
    g.set_parameter(4, 13, 0.7).unwrap();
    g.set_parameter(4, 10, 0.15).unwrap();
    g.set_parameter(5, 3, 1.).unwrap();
    g.set_parameter(5, 1, 3.).unwrap();
    g.to_project().unwrap()
}
#[test]
fn held_and_releasing_instrument_voices_keep_pcm_and_fft_and_changed_midi_ownership_resets() {
    let mut document = instrument_document();
    let mut current = prepare(&document);
    let mut reference = prepare(&document);
    let on = TimedEvent {
        node: 2,
        offset: 19,
        kind: EventKind::NoteOn {
            channel: 1,
            note: 67,
            velocity: 100,
        },
    };
    assert_eq!(render(&mut current, &[on]), render(&mut reference, &[on]));
    for block in 1..160 {
        if [17, 63, 86].contains(&block) {
            let baseline = serde_json::to_vec(&document).unwrap();
            renumber(&mut document, 100);
            let mut next = prepare(&document);
            next.plan_parameter_inheritance(&baseline).unwrap();
            assert!(
                callback_heap::measure(|| next.adopt_live_replacement_from(&mut current, true))
                    >= 2
            );
            current = next;
        }
        let event = TimedEvent {
            node: 2,
            offset: 57,
            kind: EventKind::NoteOff {
                channel: 1,
                note: 67,
            },
        };
        let events = if block == 74 {
            std::slice::from_ref(&event)
        } else {
            &[]
        };
        assert_eq!(
            render(&mut current, events),
            render(&mut reference, events),
            "block {block}"
        );
    }
    let initial = instrument_document();
    let mut current = prepare(&initial);
    for block in 0..40 {
        render(
            &mut current,
            if block == 0 {
                std::slice::from_ref(&on)
            } else {
                &[]
            },
        );
    }
    let mut rewired = initial.clone();
    rewired["signal"]["connections"]
        .as_array_mut()
        .unwrap()
        .retain(|e| e["to"] != 4);
    let mut next = prepare(&rewired);
    next.plan_parameter_inheritance(&serde_json::to_vec(&initial).unwrap())
        .unwrap();
    callback_heap::measure(|| next.adopt_live_replacement_from(&mut current, true));
    for _ in 0..40 {
        assert!(render(&mut next, &[]).iter().flatten().all(|v| *v == 0.));
    }
}
#[test]
fn new_shared_pcm_does_not_restore_old_playback_or_spectral_tails() {
    let mut original: Value = serde_json::from_slice(include_bytes!(
        "../../../projects/graph-workspace/authored-rack-sample-eight-voice.json"
    ))
    .unwrap();
    for voice in 0..8 {
        parameter(&mut original, 4 + voice * 3 + 2, 0, 0.5);
        parameter(&mut original, 4 + voice * 3 + 1, 3, 1.);
    }
    let mut old = prepare(&original);
    for block in 0..64 {
        let on = TimedEvent {
            node: 4,
            offset: 0,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        };
        render(
            &mut old,
            if block == 0 {
                std::slice::from_ref(&on)
            } else {
                &[]
            },
        );
    }
    let mut changed =
        GraphWorkspace::from_project_json(&serde_json::to_vec(&original).unwrap()).unwrap();
    changed
        .set_sample_asset(4, &vec![0.37; 4096], 48000, "New PCM")
        .unwrap();
    let changed = changed.to_project().unwrap();
    let mut next = prepare(&changed);
    next.plan_parameter_inheritance(&serde_json::to_vec(&original).unwrap())
        .unwrap();
    callback_heap::measure(|| next.adopt_live_replacement_from(&mut old, true));
    for _ in 0..40 {
        assert!(render(&mut next, &[]).iter().flatten().all(|v| *v == 0.));
    }
}

#[test]
fn instrument_resource_replacement_keeps_old_voice_pcm_until_release_and_uses_new_pcm_for_new_notes()
 {
    use manifold_core::graph::{Connection, ExecutionPlan, GraphDescription, NodeKind, NodeSpec};
    let graph = GraphDescription {
        nodes: vec![
            NodeSpec {
                id: 2,
                kind: NodeKind::MidiInput,
            },
            NodeSpec {
                id: 4,
                kind: NodeKind::SampleInstrument,
            },
            NodeSpec {
                id: 3,
                kind: NodeKind::Output,
            },
        ],
        connections: vec![
            Connection {
                from: 2,
                output_port: 0,
                to: 4,
                input_port: 0,
            },
            Connection {
                from: 4,
                output_port: 0,
                to: 3,
                input_port: 0,
            },
        ],
    };
    let build = |value: f32| {
        let mut plan = graph.compile_patchable(48000., 128).unwrap();
        assert!(plan.load_sample_stereo(4, vec![value; 8192], 48000.));
        assert!(plan.set_parameter(4, 11, 4.));
        assert!(plan.set_parameter(4, 10, 0.1));
        plan
    };
    fn render(plan: &mut ExecutionPlan, events: &[TimedEvent]) -> [[f32; 128]; 2] {
        let input = [0.; 128];
        let mut out = [[0.; 128]; 2];
        let [left, right] = &mut out;
        callback_heap::measure(|| {
            plan.process_with_events([&input, &input], [left, right], events)
                .unwrap()
        });
        out
    }
    let mut current = build(0.1);
    let mut reference = build(0.1);
    let event = |kind, note| TimedEvent {
        node: 2,
        offset: 13,
        kind: if kind == 0 {
            EventKind::NoteOn {
                channel: 0,
                note,
                velocity: 100,
            }
        } else {
            EventKind::NoteOff { channel: 0, note }
        },
    };
    for block in 0..140 {
        if block % 3 == 1 {
            let source = (block as f32 + 1.) / 200.;
            assert!(reference.publish_prepared_sample_to_instrument(4, vec![source; 8192], 48000.));
            let mut next = build(source);
            assert_eq!(
                callback_heap::measure(|| next.transfer_owned_resource_history_by_resolver(
                    &mut current,
                    &[(4, 4)],
                    Some
                )),
                1
            );
            current = next;
        }
        let note = match block {
            _ if block % 3 == 0 => Some(event(0, 48 + (block % 32) as u8)),
            78 => Some(event(1, 60)),
            _ => None,
        };
        let events = note.as_ref().map_or(&[][..], std::slice::from_ref);
        let actual = render(&mut current, events);
        let expected = render(&mut reference, events);
        assert_eq!(actual, expected, "block {block}");
        if block > 0 {
            assert!(actual.iter().flatten().any(|v| v.abs() > 0.01));
        }
    }
    let off = TimedEvent {
        node: 2,
        offset: 0,
        kind: EventKind::AllNotesOff,
    };
    assert_eq!(render(&mut current, &[off]), render(&mut reference, &[off]));
    assert!(reference.publish_prepared_sample_to_instrument(4, vec![0.71; 8192], 48000.));
    let mut next = build(0.71);
    assert_eq!(
        callback_heap::measure(|| next.transfer_owned_resource_history_by_resolver(
            &mut current,
            &[(4, 4)],
            Some
        )),
        1
    );
    current = next; // Retire the old plan before any idle slot is reused.
    let notes: Vec<_> = (36..44).map(|note| event(0, note)).collect();
    assert_eq!(render(&mut current, &notes), render(&mut reference, &notes));
}
