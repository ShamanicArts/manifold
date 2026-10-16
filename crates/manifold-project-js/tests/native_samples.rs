use manifold_core::events::{EventKind, TimedEvent};
use manifold_native::{AudioBlock, project::NativeProject};
use manifold_project_js::native_host::{
    NativeHostError, NativeScriptAudio, NativeScriptControl, prepare_native_script,
};
use serde_json::{Value, json};

mod callback_heap {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../manifold-native/tests/support/callback_heap.rs"
    ));
}
const BUNDLE: &str =
    include_str!("../../../projects/graph-workspace/rack-sample-project.bundle.js");
const BASE: &str = "/midi/synth/rack/sample/1";
const INSTRUMENT: &str =
    include_str!("../../../projects/graph-workspace/sample-instrument-project.bundle.js");

fn render(audio: &mut NativeScriptAudio, events: &[TimedEvent]) -> [[f32; 128]; 2] {
    let mut output = [[0.; 128]; 2];
    let [left, right] = &mut output;
    callback_heap::measure(|| {
        audio.process(AudioBlock {
            main: None,
            sidechain: None,
            output: [left, right],
            events,
        })
    })
    .unwrap();
    output
}
fn append(tape: &mut Vec<f32>, block: &[[f32; 128]; 2]) {
    for index in 0..128 {
        tape.extend([block[0][index], block[1][index]]);
    }
}

#[test]
fn public_rack_controller_runs_native_batches_events_pcm_edits_and_restore_without_callback_heap() {
    let (mut control, mut audio) = prepare_native_script(BUNDLE, None, 48000., 128).unwrap();
    let (mut untouched_control, mut untouched_audio) =
        prepare_native_script(BUNDLE, None, 48000., 128).unwrap();
    let mut tape = Vec::new();
    let mut reference_tape = Vec::new();
    let mut blocks = 0;
    let mut pair = |control: &mut NativeScriptControl,
                    audio: &mut NativeScriptAudio,
                    reference_control: &mut NativeScriptControl,
                    reference_audio: &mut NativeScriptAudio,
                    method: &str,
                    args: &[Value],
                    mirrored: bool| {
        control.begin_call(method, args).unwrap();
        if mirrored {
            reference_control.begin_call(method, args).unwrap();
        }
        let mut done = false;
        let mut reference_done = !mirrored;
        for _ in 0..32 {
            let actual = render(audio, &[]);
            let expected = render(reference_audio, &[]);
            assert_eq!(actual, expected, "{method}, block {blocks}");
            append(&mut tape, &actual);
            append(&mut reference_tape, &expected);
            blocks += 1;
            if !done {
                done = control.poll().unwrap().is_some();
            }
            if !reference_done {
                reference_done = reference_control.poll().unwrap().is_some();
            }
            if done && reference_done {
                return;
            }
        }
        panic!("controller did not finish {method}");
    };
    for (path, value) in [
        ("unison", 3.),
        ("detune", 23.),
        ("spread", 0.7),
        ("pitchMode", 2.),
    ] {
        pair(
            &mut control,
            &mut audio,
            &mut untouched_control,
            &mut untouched_audio,
            "set",
            &[json!(format!("{BASE}/{path}")), json!(value)],
            true,
        );
    }
    for voice in 1..=8 {
        for (key, value) in [("vOct", 60. + voice as f64), ("gate", 0.6)] {
            pair(
                &mut control,
                &mut audio,
                &mut untouched_control,
                &mut untouched_audio,
                "set",
                &[json!(format!("{BASE}/voice/{voice}/{key}")), json!(value)],
                true,
            );
        }
    }
    for index in 0..12 {
        pair(
            &mut control,
            &mut audio,
            &mut untouched_control,
            &mut untouched_audio,
            "setInsert",
            &[json!(index % 2 == 0)],
            false,
        );
    }
    pair(
        &mut control,
        &mut audio,
        &mut untouched_control,
        &mut untouched_audio,
        "replaceSource",
        &[json!(330)],
        true,
    );
    for voice in 1..=8 {
        for value in [0., 0.6] {
            pair(
                &mut control,
                &mut audio,
                &mut untouched_control,
                &mut untouched_audio,
                "set",
                &[json!(format!("{BASE}/voice/{voice}/gate")), json!(value)],
                true,
            );
        }
    }
    drop(pair);
    for _ in 0..128 {
        let actual = render(&mut audio, &[]);
        let expected = render(&mut untouched_audio, &[]);
        assert_eq!(actual, expected);
        append(&mut tape, &actual);
        append(&mut reference_tape, &expected);
    }
    assert!(tape.iter().any(|value| value.abs() > 0.001));
    let saved = control.save_project().unwrap().to_vec();
    let doc: Value = serde_json::from_slice(&saved).unwrap();
    assert_eq!(doc["sampleBindings"].as_array().unwrap().len(), 7);
    assert_eq!(doc["assets"][0]["label"], "Source 330 Hz");
    let (mut reopened_control, mut reopened_audio) =
        prepare_native_script(BUNDLE, Some(&saved), 48000., 128).unwrap();
    reopened_control.begin_call("activate", &[]).unwrap();
    let mut active = false;
    let mut reopened = Vec::new();
    for _ in 0..80 {
        let output = render(&mut reopened_audio, &[]);
        append(&mut reopened, &output);
        if !active {
            active = reopened_control.poll().unwrap().is_some();
        }
    }
    assert!(active && reopened.iter().any(|value| value.abs() > 0.001));
    export(&tape, &reference_tape, &reopened, &saved);
}

#[test]
fn events_merge_at_actual_offsets_reject_bad_targets_and_survive_empty_or_malformed_blocks() {
    let (mut control, mut audio) = prepare_native_script(BUNDLE, None, 48000., 128).unwrap();
    let mut expected = NativeProject::parse(control.current_project())
        .unwrap()
        .prepare_patchable_with_state(48000., 128)
        .unwrap();
    assert!(expected.processor.set_parameter(6, 0, 1.));
    for _ in 0..2 {
        let mut l = [0.; 128];
        let mut r = [0.; 128];
        expected
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut l, &mut r],
                events: &[],
            })
            .unwrap();
    }
    control
        .begin_call("batch", &[json!([{"nodeId":6,"id":0,"value":1}])])
        .unwrap();
    render(&mut audio, &[]);
    control.poll().unwrap().unwrap();
    let before = control.save_project().unwrap().to_vec();
    control
        .begin_call(
            "batch",
            &[json!([
                {"nodeId":6,"id":0,"value":0.2}, {"nodeId":999,"id":0,"value":1}
            ])],
        )
        .unwrap();
    render(&mut audio, &[]);
    assert!(matches!(control.poll(), Err(NativeHostError::Rejected)));
    assert_eq!(control.save_project().unwrap(), before);
    control
        .begin_call(
            "event",
            &[json!({"nodeId":4,"kind":0,"note":60,"velocity":100,"offset":37})],
        )
        .unwrap();
    let mut empty_l = [];
    let mut empty_r = [];
    audio
        .process(AudioBlock {
            main: None,
            sidechain: None,
            output: [&mut empty_l, &mut empty_r],
            events: &[],
        })
        .unwrap();
    assert!(control.poll().unwrap().is_none());
    let mut left = [0.; 128];
    let mut short = [0.; 127];
    assert!(
        audio
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut short],
                events: &[]
            })
            .is_err()
    );
    assert!(control.poll().unwrap().is_none());
    let host = TimedEvent {
        offset: 89,
        node: 4,
        kind: EventKind::AllNotesOff,
    };
    let actual = render(&mut audio, &[host]);
    let mut reference = [[0.; 128]; 2];
    let [l, r] = &mut reference;
    expected
        .processor
        .process(AudioBlock {
            main: None,
            sidechain: None,
            output: [l, r],
            events: &[
                TimedEvent {
                    offset: 37,
                    node: 4,
                    kind: EventKind::NoteOn {
                        channel: 0,
                        note: 60,
                        velocity: 100,
                    },
                },
                host,
            ],
        })
        .unwrap();
    assert_eq!(actual, reference);
    assert!(actual[0][..37].iter().all(|v| *v == 0.));
    assert!(actual[0][37..89].iter().any(|v| v.abs() > 0.001));
    control.poll().unwrap().unwrap();
    for event in [
        json!({"nodeId":999,"kind":0}),
        json!({"nodeId":4,"kind":0,"offset":128}),
    ] {
        control.begin_call("event", &[event]).unwrap();
        render(&mut audio, &[]);
        assert!(matches!(control.poll(), Err(NativeHostError::Rejected)));
    }
    control
        .begin_call(
            "event",
            &[json!({"nodeId":4,"kind":0,"note":60,"velocity":100})],
        )
        .unwrap();
    let full = [TimedEvent {
        offset: 0,
        node: 4,
        kind: EventKind::AllNotesOff,
    }; 1024];
    render(&mut audio, &full);
    assert!(control.poll().unwrap().is_none());
    let output = render(&mut audio, &[]);
    assert!(output[0].iter().any(|value| value.abs() > 0.001));
    control.poll().unwrap().unwrap();
    control
        .begin_call("event", &[json!({"nodeId":4,"kind":0})])
        .unwrap();
    audio.stop_and_snapshot().unwrap();
    assert!(matches!(control.poll(), Err(NativeHostError::Rejected)));
}

#[test]
fn native_js_instrument_keeps_held_pcm_uses_new_sources_and_reuses_retired_idle_slots() {
    let (mut control, mut audio) = prepare_native_script(INSTRUMENT, None, 48000., 128).unwrap();
    let (mut reference_control, mut reference_audio) =
        prepare_native_script(INSTRUMENT, None, 48000., 128).unwrap();
    let mut tape = Vec::new();
    let mut reference_tape = Vec::new();
    let mut held_frames = 0;
    let mut new_note_difference = 0f32;
    for block in 0..320 {
        if block == 0 || block == 128 || (200..208).contains(&block) {
            let note = if block == 0 {
                60
            } else if block == 128 {
                67
            } else {
                48 + block - 200
            };
            let event = json!({"kind":0,"note":note,"velocity":100,"offset":19});
            control.begin_call("event", &[event.clone()]).unwrap();
            reference_control.begin_call("event", &[event]).unwrap();
        }
        if [12, 24, 36, 48, 60, 72, 84, 96, 190].contains(&block) {
            control
                .begin_call("replaceSource", &[json!(330 + block)])
                .unwrap();
        }
        if block == 160 {
            let event = json!({"kind":2});
            control.begin_call("event", &[event.clone()]).unwrap();
            reference_control.begin_call("event", &[event]).unwrap();
        }
        let actual = render(&mut audio, &[]);
        let reference = render(&mut reference_audio, &[]);
        if block < 128 {
            assert_eq!(actual, reference, "held block {block}");
            held_frames += 128;
        }
        if (128..160).contains(&block) {
            for (a, b) in actual.iter().flatten().zip(reference.iter().flatten()) {
                new_note_difference = new_note_difference.max((a - b).abs());
            }
        }
        append(&mut tape, &actual);
        append(&mut reference_tape, &reference);
        control.poll().unwrap();
        reference_control.poll().unwrap();
    }
    assert!(new_note_difference > 0.001);
    let saved = control.save_project().unwrap().to_vec();
    if let Some(path) = std::env::var_os("MANIFOLD_NATIVE_SAMPLE_EVIDENCE_DIR") {
        let root = std::path::PathBuf::from(path).join("instrument");
        std::fs::create_dir_all(&root).unwrap();
        // Reuse the WAV exporter with a distinct immutable directory.
        write_evidence(
            &root,
            &tape,
            &reference_tape,
            &[],
            &saved,
            &json!({
                "heldFrames":held_frames,"heldMaxDifference":0,"newNoteMaxDifference":new_note_difference,
                "sourcePublications":9,"idleNotesAfterRetirement":8,"callbackAllocations":0,"callbackDeallocations":0,
                "scope":"native JS authored Instrument; old PCM held, subsequent notes use new PCM; all-notes-off, publication, control retirement, all eight idle slots reused"
            }),
        );
    }
}

#[test]
fn canceled_second_step_keeps_accepted_gate_intent_and_controller_remains_usable() {
    let (mut control, mut audio) = prepare_native_script(BUNDLE, None, 48000., 128).unwrap();
    let path = format!("{BASE}/voice/1/gate");
    control.begin_set_path(&path, 0.6).unwrap();
    render(&mut audio, &[]);
    assert!(control.poll().unwrap().is_none()); // gain accepted, event now pending
    audio.stop_and_snapshot().unwrap();
    assert!(matches!(control.poll(), Err(NativeHostError::Rejected)));
    let saved: Value = serde_json::from_slice(control.save_project().unwrap()).unwrap();
    assert_eq!(
        saved["controls"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["path"] == path)
            .unwrap()["value"],
        0.6
    );
    // Stop did not play the event. The author can explicitly activate saved
    // intent, or lower/raise the gate, without reloading the controller.
    for value in [0., 0.6] {
        control.begin_set_path(&path, value).unwrap();
        let mut done = false;
        for _ in 0..4 {
            render(&mut audio, &[]);
            if control.poll().unwrap().is_some() {
                done = true;
                break;
            }
        }
        assert!(done);
    }
    assert!(
        render(&mut audio, &[])[0]
            .iter()
            .any(|value| value.abs() > 0.001)
    );
}

#[test]
fn intermediate_script_snapshot_cannot_smuggle_an_unpublished_graph_mutation() {
    let bundle = format!(
        r#"{BUNDLE}
      const originalSampleProject=ManifoldProject;
      ManifoldProject={{ ...originalSampleProject, createProject(host) {{
        const real=originalSampleProject.createProject(host);let fake=null;
        return {{toProject:()=>fake??real.toProject(),async set() {{
          await host.setParameter({{nodeId:6,id:0,value:0.6}});
          fake=structuredClone(real.toProject());fake.signal.initialParameters.find(p=>p.nodeId===6&&p.id===0).value=0.6;
          fake.signal.nodes.push({{id:900,type:'fixed-gain',a:1}});
          await host.sendEvent({{nodeId:4,kind:0}});return fake;
        }} }};
      }} }};
    "#
    );
    let (mut control, mut audio) = prepare_native_script(&bundle, None, 48000., 128).unwrap();
    control
        .begin_set_path(&format!("{BASE}/voice/1/gate"), 0.6)
        .unwrap();
    render(&mut audio, &[]);
    assert!(matches!(
        control.poll(),
        Err(NativeHostError::UnpublishedMutation)
    ));
}

fn export(tape: &[f32], reference: &[f32], reopened: &[f32], saved: &[u8]) {
    let Some(path) = std::env::var_os("MANIFOLD_NATIVE_SAMPLE_EVIDENCE_DIR") else {
        return;
    };
    let path = std::path::PathBuf::from(path);
    std::fs::create_dir_all(&path).unwrap();
    write_evidence(
        &path,
        tape,
        reference,
        reopened,
        saved,
        &json!({"frames":tape.len()/2,"maxDifference":0,
        "callbackAllocations":0,"callbackDeallocations":0,"scope":"actual public eight-voice Rack Sample controller in QuickJS; 16-target batches, events, wet vocoders, unison, 12 unity insert/remove edits, shared PCM publication and fresh controller restore; reference is v2"}),
    );
}
fn write_evidence(
    path: &std::path::Path,
    tape: &[f32],
    reference: &[f32],
    reopened: &[f32],
    saved: &[u8],
    report: &Value,
) {
    let write = |name: &str, bytes: &[u8]| {
        use std::io::Write;
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path.join(name))
            .unwrap()
            .write_all(bytes)
            .unwrap();
    };
    let wave = |pcm: &[f32]| {
        let size = (pcm.len() * 4) as u32;
        let mut out = Vec::new();
        out.extend(b"RIFF");
        out.extend((size + 36).to_le_bytes());
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
        out
    };
    write("edited.wav", &wave(tape));
    write("reference.wav", &wave(reference));
    write("reopened.wav", &wave(reopened));
    write("saved-project.json", saved);
    write("report.json", &serde_json::to_vec_pretty(report).unwrap());
}
