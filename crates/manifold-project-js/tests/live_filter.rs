use manifold_native::AudioBlock;
use manifold_project_js::native_host::{NativeScriptAudio, prepare_native_script};
use manifold_project_js::package::ProjectPackage;
use serde_json::json;

const SCRIPT: &str = include_str!("../../../projects/standalone-filter/live-controller.bundle.js");
fn render(audio: &mut NativeScriptAudio) {
    let input = [0.25; 128];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    audio
        .process(AudioBlock {
            main: Some([&input, &input]),
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
        .unwrap();
    assert!(left.iter().all(|sample| sample.is_finite()));
}
fn graph_edit(control: &mut manifold_project_js::native_host::NativeScriptControl,
    audio: &mut NativeScriptAudio, mut command: serde_json::Value) {
    let revision = control.presentation().unwrap()["revision"].as_u64().unwrap();
    command["expectedRevision"] = revision.into();
    control.begin_call("request", &[command]).unwrap();
    render(audio);
    control.poll().unwrap().unwrap();
}

#[test]
fn native_package_load_publishes_into_existing_audio_host_and_retains_controller() {
    let (mut control, mut audio) = prepare_native_script(SCRIPT, None, 48000., 128).unwrap();
    render(&mut audio);
    let package = ProjectPackage::parse(include_bytes!(
        "../../../web/public/filter-delivery/2026-10-01/Filter.manifold.json"
    ))
    .unwrap();
    let before = control.current_project().to_vec();
    control
        .begin_load_script(&package.bundle, package.state())
        .unwrap();
    assert_eq!(control.current_project(), before);
    assert!(
        control
            .begin_load_script(&package.bundle, package.state())
            .is_err()
    );
    render(&mut audio);
    control.poll().unwrap().unwrap();
    let opened = control.presentation().unwrap();
    assert!(
        opened["parameters"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p["path"] == "/plugin/params/level")
    );
    control.begin_call("request", &[json!({"operation":"parameter.batch","edits":[{"path":"/plugin/params/cutoff","value":750},{"path":"/plugin/params/resonance","value":0.4}],"expectedRevision":opened["revision"]})]).unwrap();
    render(&mut audio);
    control.poll().unwrap().unwrap();
    let saved = package
        .save_with_state(control.save_project().unwrap())
        .unwrap();
    let reopened = ProjectPackage::parse(&saved).unwrap();
    assert_eq!(reopened.bundle_sha256, package.bundle_sha256);
    let (mut recalled, mut recalled_audio) = reopened.prepare_native(48000., 128).unwrap();
    render(&mut recalled_audio);
    let state = recalled.presentation().unwrap();
    assert_eq!(state["source"], opened["source"]);
    assert_eq!(
        state["parameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["path"] == "/plugin/params/cutoff")
            .unwrap()["value"],
        750
    );
    let accepted = control.current_project().to_vec();
    assert!(
        control
            .begin_load_script("return ???", package.state())
            .is_err()
    );
    assert_eq!(control.current_project(), accepted);
    render(&mut audio);
}

#[test]
fn native_creator_publishes_source_and_recalls_ui_from_same_project() {
    let (mut control, mut audio) = prepare_native_script(SCRIPT, None, 48000., 128).unwrap();
    render(&mut audio);
    let state = control.presentation().unwrap();
    control
        .begin_set_path("/plugin/params/resonance", 0.4)
        .unwrap();
    render(&mut audio);
    control.poll().unwrap().unwrap();
    let source = state["source"].as_str().unwrap().replace("3200", "1200");
    control.begin_call("request", &[json!({"operation":"source.apply","source":source,"expectedRevision":1,"origin":"agent"})]).unwrap();
    render(&mut audio);
    control.poll().unwrap().unwrap();
    assert_eq!(control.presentation().unwrap()["revision"], 2);
    let saved = control.save_project().unwrap().to_vec();
    let (mut reopened, mut audio) =
        prepare_native_script(SCRIPT, Some(&saved), 48000., 128).unwrap();
    render(&mut audio);
    let state = reopened.presentation().unwrap();
    assert_eq!(state["source"], source);
    assert_eq!(state["parameters"][0]["value"], 1200);
    assert!((state["parameters"][1]["value"].as_f64().unwrap() - 0.4).abs() < 1e-6);
    assert!(
        reopened
            .begin_call(
                "request",
                &[json!({"operation":"source.apply","source":"return ???"})]
            )
            .is_err()
    );
    render(&mut audio);
    assert_eq!(reopened.presentation().unwrap()["source"], source);
}

#[test]
fn native_creator_edits_the_same_studio_graph_and_changes_real_audio() {
    let (mut control, mut audio) = prepare_native_script(SCRIPT, None, 48000., 128).unwrap();
    let level = |audio: &mut NativeScriptAudio| {
        let input = [0.25; 128];
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        for _ in 0..48 {
            audio.process(AudioBlock { main:Some([&input,&input]), sidechain:None,
                output:[&mut left,&mut right], events:&[] }).unwrap();
        }
        left[127]
    };
    let base = level(&mut audio);
    graph_edit(&mut control,&mut audio,json!({"operation":"graph.add","type":"fixed-gain"}));
    graph_edit(&mut control,&mut audio,json!({"operation":"graph.connect","from":"/plugin/filter","output":"out",
        "to":"/studio/fixed-gain/5","input":"audio"}));
    graph_edit(&mut control,&mut audio,json!({"operation":"graph.connect","from":"/studio/fixed-gain/5","output":"out",
        "to":"@output","input":"in"}));
    let loud = level(&mut audio);
    assert!(loud.abs() > base.abs() * 2.5, "inserted Rust gain must change native audio: {base} -> {loud}");
    graph_edit(&mut control,&mut audio,json!({"operation":"graph.remove","id":5}));
    let restored = level(&mut audio);
    assert!((restored-base).abs() < 0.08, "removing the node must restore the original route: {base} -> {restored}");
    let state = control.presentation().unwrap();
    assert!(state["source"].as_str().unwrap().contains("studioGraph"));
    let saved = control.save_project().unwrap();
    let (mut reopened, mut reopened_audio) = prepare_native_script(SCRIPT, Some(&saved), 48000., 128).unwrap();
    assert_eq!(reopened.presentation().unwrap()["graph"]["signal"]["nodes"].as_array().unwrap().len(), 3);
    assert!((level(&mut reopened_audio)-base).abs() < 0.08);
}

#[test]
fn native_creator_exposes_a_new_node_in_the_shared_inspector() {
    let (mut control, mut audio) = prepare_native_script(SCRIPT, None, 48000., 128).unwrap();
    graph_edit(&mut control,&mut audio,json!({"operation":"graph.add","type":"gain"}));
    graph_edit(&mut control,&mut audio,json!({"operation":"parameter.expose","definition":{
        "instance":"/studio/gain/5","parameter":"level","path":"/plugin/added-gain",
        "label":"Added gain","min":0,"max":2,"default":0.7}}));
    let presentation = control.presentation().unwrap();
    assert!(presentation["components"].as_array().unwrap().iter()
        .any(|item| item["path"] == "/plugin/added-gain"));
    assert!(presentation["parameters"].as_array().unwrap().iter()
        .any(|item| item["path"] == "/plugin/added-gain"));
}
