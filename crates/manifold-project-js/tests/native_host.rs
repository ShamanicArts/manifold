use std::sync::mpsc;

use manifold_native::AudioBlock;
use manifold_project_js::native_host::{NativeHostError, NativeScriptAudio, prepare_native_script};

const DSP: &str = include_str!("../../../projects/graph-workspace/dsp-live-project.bundle.js");
const FX: &str = include_str!("../../../projects/graph-workspace/fx-slot-project.bundle.js");

fn render(audio: &mut NativeScriptAudio) -> f32 {
    let left_input: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.17).sin() * 0.25);
    let right_input: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.11).sin() * -0.25);
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    audio
        .process(AudioBlock {
            main: Some([&left_input, &right_input]),
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
        .unwrap();
    left.iter().map(|sample| sample.abs()).sum()
}

#[test]
fn native_audio_thread_applies_scripted_controls_and_reopens_saved_state() {
    let (mut control, audio) = prepare_native_script(DSP, None, 48_000.0, 128).unwrap();
    let (blocks, requests) = mpsc::channel::<usize>();
    let (responses, energies) = mpsc::channel::<f32>();
    let worker = std::thread::spawn(move || {
        let mut audio = audio;
        for count in requests {
            let mut energy = 0.0;
            for _ in 0..count {
                energy = render(&mut audio);
            }
            responses.send(energy).unwrap();
        }
    });
    blocks.send(32).unwrap();
    let before = energies.recv().unwrap();
    assert!(before > 0.01);
    control.begin_set_path("/dsp/live/input_gain", 0.4).unwrap();
    assert!(control.poll().unwrap().is_none());
    blocks.send(32).unwrap();
    let after = energies.recv().unwrap();
    let saved = control.poll().unwrap().unwrap().to_vec();
    assert!(after < before * 0.5, "{before} -> {after}");
    assert_eq!(control.current_project(), saved);

    control
        .begin_call(
            "routeOutput",
            &[serde_json::json!("/dsp/live/nodes/input_trim")],
        )
        .unwrap();
    blocks.send(1).unwrap();
    energies.recv().unwrap();
    let routed = control.poll().unwrap().unwrap().to_vec();
    let document: serde_json::Value = serde_json::from_slice(&routed).unwrap();
    assert!(
        document["signal"]["connections"]
            .as_array()
            .unwrap()
            .iter()
            .any(|edge| edge["from"] == 4 && edge["to"] == 3)
    );
    drop(blocks);
    worker.join().unwrap();

    let (mut reopened, mut audio) =
        prepare_native_script(DSP, Some(&routed), 48_000.0, 128).unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(reopened.current_project()).unwrap(),
        document
    );
    reopened
        .begin_set_path("/dsp/live/input_gain", 0.8)
        .unwrap();
    assert!(render(&mut audio) > 0.0);
    assert!(reopened.poll().unwrap().is_some());
}

#[test]
fn native_audio_thread_publishes_authored_structural_fx_swap() {
    let (mut control, mut audio) = prepare_native_script(FX, None, 48_000.0, 128).unwrap();
    for _ in 0..32 {
        render(&mut audio);
    }
    let before = render(&mut audio);
    control
        .begin_set_path("/test/fxslot/slotA/width/amount", 1.9)
        .unwrap();
    render(&mut audio);
    assert!(control.poll().unwrap().is_some());
    control
        .begin_set_path("/test/fxslot/slotA/select", 1.0)
        .unwrap();
    assert!(control.poll().unwrap().is_none());
    let after = render(&mut audio);
    let saved = control.poll().unwrap().unwrap().to_vec();
    let expected: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../projects/graph-workspace/authored-fx-slot-swap-width.json"
    ))
    .unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&saved).unwrap(),
        expected
    );
    assert!((after - before).abs() > 0.001);
    let (mut reopened, mut audio) = prepare_native_script(FX, Some(&saved), 48_000.0, 128).unwrap();
    reopened
        .begin_set_path("/test/fxslot/slotB/select", 1.0)
        .unwrap();
    render(&mut audio);
    let next = reopened.poll().unwrap().unwrap();
    let document: serde_json::Value = serde_json::from_slice(next).unwrap();
    assert_eq!(document["signal"]["nodes"].as_array().unwrap().len(), 14);
}

#[test]
fn stopped_audio_host_rejects_a_queued_edit_without_changing_saved_state() {
    let (mut control, audio) = prepare_native_script(DSP, None, 48_000.0, 128).unwrap();
    let original = control.current_project().to_vec();
    control.begin_set_path("/dsp/live/input_gain", 0.4).unwrap();
    drop(audio);
    assert!(matches!(control.poll(), Err(NativeHostError::Rejected)));
    assert_eq!(control.current_project(), original);
}

#[test]
fn a_script_cannot_change_the_saved_graph_without_host_publication() {
    let project =
        include_str!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
    let bundle = format!(
        r#"
        var ManifoldProject = {{ createProject() {{
            let project = {project};
            return {{ toProject() {{ return project; }},
                set(path, value) {{ project.signal.initialParameters[0].value = value;
                    return project; }} }};
        }} }};
    "#
    );
    let (mut control, mut audio) = prepare_native_script(&bundle, None, 48_000.0, 128).unwrap();
    let original = control.current_project().to_vec();
    assert!(matches!(
        control.begin_set_path("/dsp/live/input_gain", 0.4),
        Err(NativeHostError::UnpublishedMutation)
    ));
    assert_eq!(control.current_project(), original);
    assert!(render(&mut audio) > 0.0);
    assert!(control.poll().unwrap().is_none());
    assert!(matches!(
        control.begin_set_path("/dsp/live/input_gain", 0.8),
        Err(NativeHostError::UnpublishedMutation)
    ));
}
