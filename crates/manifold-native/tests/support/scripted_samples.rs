use manifold_native::AudioBlock;
use manifold_project_js::{
    native_host::{NativeScriptAudio, NativeScriptControl},
    package::ProjectPackage,
};
use serde_json::{Value, json};

pub trait SampleHost: Sized {
    fn open(package: &[u8]) -> Self;
    fn call(&self, method: &str, args: Vec<Value>) -> u64;
    fn status(&self, generation: u64) -> u32;
    fn render(&self) -> [[f32; 128]; 2];
    fn save(&self) -> Vec<u8>;
    fn pause(&self);
    fn resume(&self);
    fn retire(&self);
    /// Dynamic-library probes cannot observe the library's private allocator.
    fn heap_guarded() -> bool {
        false
    }
}
fn native(audio: &mut NativeScriptAudio) -> [[f32; 128]; 2] {
    let mut out = [[0.; 128]; 2];
    let [l, r] = &mut out;
    audio
        .process(AudioBlock {
            main: None,
            sidechain: None,
            output: [l, r],
            events: &[],
        })
        .unwrap();
    out
}
fn append(tape: &mut Vec<f32>, out: &[[f32; 128]; 2]) {
    for i in 0..128 {
        tape.extend([out[0][i], out[1][i]]);
    }
}
fn action<H: SampleHost>(
    host: &H,
    control: &mut NativeScriptControl,
    audio: &mut NativeScriptAudio,
    method: &str,
    args: Vec<Value>,
    tape: &mut Vec<f32>,
    reference: &mut Vec<f32>,
) {
    let generation = host.call(method, args.clone());
    control.begin_call(method, &args).unwrap();
    let mut finished = false;
    for step in 0..24 {
        let actual = host.render();
        let expected = native(audio);
        assert_eq!(actual, expected, "{method} step {step}");
        append(tape, &actual);
        append(reference, &expected);
        let done = control.poll().unwrap().is_some();
        let status = host.status(generation);
        assert_eq!(
            status,
            if done { 1 } else { 0 },
            "whole-call completion for {method}, step {step}"
        );
        if done {
            finished = true;
            break;
        }
    }
    assert!(finished, "{method} did not complete");
    host.retire();
}
pub fn rack<H: SampleHost>(host_name: &str, package: &[u8]) {
    let host = H::open(package);
    let package = ProjectPackage::parse(package).unwrap();
    let (mut control, mut audio) = package.prepare_native(48000., 128).unwrap();
    let mut tape = Vec::new();
    let mut reference = Vec::new();
    let base = "/midi/synth/rack/sample/1";
    // Empty activation is a successful no-op, requiring no audio command.
    let empty = host.call("activate", vec![]);
    assert_eq!(host.status(empty), 1);
    for (key, value) in [
        ("pitchMode", 2.),
        ("unison", 3.),
        ("detune", 21.),
        ("spread", 0.7),
    ] {
        action(
            &host,
            &mut control,
            &mut audio,
            "set",
            vec![json!(format!("{base}/{key}")), json!(value)],
            &mut tape,
            &mut reference,
        );
    }
    for voice in 1..=8 {
        action(
            &host,
            &mut control,
            &mut audio,
            "set",
            vec![json!(format!("{base}/voice/{voice}/gate")), json!(0.6)],
            &mut tape,
            &mut reference,
        );
    }
    for edit in 0..12 {
        action(
            &host,
            &mut control,
            &mut audio,
            "setInsert",
            vec![json!(edit % 2 == 0)],
            &mut tape,
            &mut reference,
        );
    }
    action(
        &host,
        &mut control,
        &mut audio,
        "replaceSource",
        vec![json!(330)],
        &mut tape,
        &mut reference,
    );
    for voice in 1..=8 {
        for gate in [0., 0.6] {
            action(
                &host,
                &mut control,
                &mut audio,
                "set",
                vec![json!(format!("{base}/voice/{voice}/gate")), json!(gate)],
                &mut tape,
                &mut reference,
            );
        }
    }
    for _ in 0..128 {
        let actual = host.render();
        let expected = native(&mut audio);
        assert_eq!(actual, expected);
        append(&mut tape, &actual);
        append(&mut reference, &expected);
    }
    let saved = host.save();
    let document: Value =
        serde_json::from_slice(ProjectPackage::parse(&saved).unwrap().state()).unwrap();
    assert_eq!(
        document["controls"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["path"] == format!("{base}/voice/1/gate"))
            .unwrap()["value"],
        0.6
    );
    assert_eq!(document["assets"][0]["label"], "Source 330 Hz");
    assert_eq!(document["sampleBindings"].as_array().unwrap().len(), 7);
    let reopened = H::open(&saved);
    let package = ProjectPackage::parse(&saved).unwrap();
    let (mut rc, mut ra) = package.prepare_native(48000., 128).unwrap();
    let mut reopened_tape = Vec::new();
    let mut reopened_reference = Vec::new();
    action(
        &reopened,
        &mut rc,
        &mut ra,
        "activate",
        vec![],
        &mut reopened_tape,
        &mut reopened_reference,
    );
    for _ in 0..80 {
        let actual = reopened.render();
        let expected = native(&mut ra);
        assert_eq!(actual, expected);
        append(&mut reopened_tape, &actual);
        append(&mut reopened_reference, &expected);
    }
    assert!(reopened_tape.iter().any(|v| v.abs() > 0.001));
    // Stop after the gate command but before its note. Completion belongs to
    // the original call, and a rejected event must not poison the controller.
    let canceled = H::open(&saved);
    let path = format!("{base}/voice/1/gate");
    let off = canceled.call("set", vec![json!(path), json!(0.)]);
    canceled.render();
    assert_eq!(canceled.status(off), 0);
    canceled.render();
    assert_eq!(canceled.status(off), 1);
    let on = canceled.call("set", vec![json!(path), json!(0.6)]);
    canceled.render();
    assert_eq!(canceled.status(on), 0);
    canceled.pause();
    assert_eq!(canceled.status(on), 2);
    let state = canceled.save();
    let doc: Value =
        serde_json::from_slice(ProjectPackage::parse(&state).unwrap().state()).unwrap();
    assert_eq!(
        doc["controls"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["path"] == path)
            .unwrap()["value"],
        0.6
    );
    canceled.resume();
    let activated = canceled.call("activate", vec![]);
    let mut completed = false;
    for _ in 0..12 {
        canceled.render();
        if canceled.status(activated) == 1 {
            completed = true;
            break;
        }
    }
    assert!(completed);
    let heap = H::heap_guarded().then_some(0);
    export(
        host_name,
        "rack",
        &tape,
        &reference,
        &reopened_tape,
        &saved,
        &json!({"frames":tape.len()/2,"maxDifference":0,"reopenedFrames":reopened_tape.len()/2,"reopenedMaxDifference":0,"callbackAllocations":heap,"callbackDeallocations":heap,"stopBetweenGateAndNote":"rejected event, accepted gate intent retained, controller retry passed","scope":"actual plug-in callback vs native JS; exact same public Rack package, wet FFT, unison, 16-target batches, eight gates, 12 unity edits, PCM replacement, controls saved and fresh controller recall"}),
    );
}
pub fn instrument<H: SampleHost>(host_name: &str, bytes: &[u8]) {
    let host = H::open(bytes);
    let package = ProjectPackage::parse(bytes).unwrap();
    let (mut control, mut audio) = package.prepare_native(48000., 128).unwrap();
    let mut tape = Vec::new();
    let mut reference = Vec::new();
    for block in 0..320 {
        let command = if block == 0 || block == 128 || (200..208).contains(&block) {
            Some((
                "event",
                vec![
                    json!({"kind":0,"note":if block==0{60}else if block==128{67}else{48+block-200},"velocity":100,"offset":19}),
                ],
            ))
        } else if [12, 24, 36, 48, 60, 72, 84, 96, 190].contains(&block) {
            Some(("replaceSource", vec![json!(330 + block)]))
        } else if block == 160 {
            Some(("event", vec![json!({"kind":2})]))
        } else {
            None
        };
        let generation = command.as_ref().map(|(method, args)| {
            control.begin_call(method, args).unwrap();
            host.call(method, args.clone())
        });
        let actual = host.render();
        let expected = native(&mut audio);
        assert_eq!(actual, expected, "Instrument block {block}");
        append(&mut tape, &actual);
        append(&mut reference, &expected);
        if let Some(generation) = generation {
            assert!(control.poll().unwrap().is_some());
            assert_eq!(host.status(generation), 1);
            host.retire();
        }
    }
    let before = host.save();
    for event in [
        json!({"kind":0,"nodeId":999999,"note":60,"velocity":100}),
        json!({"kind":0,"offset":128,"note":60,"velocity":100}),
    ] {
        let generation = host.call("event", vec![event]);
        assert_eq!(host.status(generation), 0);
        assert_eq!(
            host.render(),
            native(&mut audio),
            "rejected event altered audio"
        );
        assert_eq!(host.status(generation), 2);
        assert_eq!(
            host.save(),
            before,
            "ephemeral rejected event altered saved project"
        );
    }
    action(
        &host,
        &mut control,
        &mut audio,
        "event",
        vec![json!({"kind":0,"note":72,"velocity":90,"offset":19})],
        &mut tape,
        &mut reference,
    );
    assert_eq!(host.save(), before, "accepted event altered saved project");
    let heap = H::heap_guarded().then_some(0);
    export(
        host_name,
        "instrument",
        &tape,
        &reference,
        &[],
        &host.save(),
        &json!({"frames":tape.len()/2,"maxDifference":0,"sourcePublications":9,"idleNotesAfterRetirement":8,"invalidTargetAndOffsetRejected":true,"controllerRecoveredAfterRejection":true,"eventsAbsentFromSavedState":true,"callbackAllocations":heap,"callbackDeallocations":heap,"scope":"actual plug-in callback vs same native JS Instrument package; held PCM, new-source notes, wet FFT, all-off, publication and idle slot reuse"}),
    );
}
fn export(
    host: &str,
    kind: &str,
    tape: &[f32],
    reference: &[f32],
    reopened: &[f32],
    saved: &[u8],
    report: &Value,
) {
    let Some(root) = std::env::var_os("MANIFOLD_SCRIPT_SAMPLE_EVIDENCE_DIR") else {
        return;
    };
    let root = std::path::PathBuf::from(root).join(host).join(kind);
    std::fs::create_dir_all(&root).unwrap();
    let write = |name: &str, bytes: &[u8]| {
        use std::io::Write;
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(root.join(name))
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
        for v in pcm {
            out.extend(v.to_le_bytes());
        }
        out
    };
    write("edited.wav", &wave(tape));
    write("native-reference.wav", &wave(reference));
    if !reopened.is_empty() {
        write("reopened.wav", &wave(reopened));
    }
    write("saved.manifold.json", saved);
    write("report.json", &serde_json::to_vec_pretty(report).unwrap());
}
