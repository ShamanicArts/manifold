use manifold_native::{AudioBlock, InputBus, OutputBus};
use manifold_project_js::native_host::{
    NativeScriptAudio, NativeScriptControl, prepare_native_script,
};
use serde_json::{Value, json};

const SCRIPT: &str = include_str!("../../../projects/standalone-filter/live-controller.bundle.js");

#[test]
fn native_nacre_scene_graph_keeps_assets_and_audio_when_editing_behaviour() {
    let mut fixture: Value = serde_json::from_str(include_str!("../../../web/public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json")).unwrap();
    fixture["source"] = json!(format!("{}\n// Native Unicode roundtrip: Δ · 🎛️", fixture["source"].as_str().unwrap()));
    let mut project = fixture.as_object_mut().unwrap().remove("graph").unwrap();
    project["liveAuthoring"] = fixture;
    let bytes = serde_json::to_vec(&project).unwrap();
    let (mut control, mut audio) = prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let (_, mut reference) = prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let before = control.presentation().unwrap();
    assert_eq!(before["source"], project["liveAuthoring"]["source"]);
    assert_eq!(before["composition"]["version"], 4);
    assert_eq!(before["componentGroups"][0]["label"], "Visuals");
    assert_eq!(before["componentReferences"].as_array().unwrap().len(), 9);
    let paths: Vec<_> = before["componentNodes"].as_array().unwrap().iter().take(2).map(|node| node["instance"].clone()).collect();
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"graph.group", "paths":paths, "label":"Field controls"}));
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"component.reference", "path":"/focus", "x":20,"y":30}));
    let referenced = control.presentation().unwrap();
    assert_eq!(referenced["componentReferences"].as_array().unwrap().len(), 10);
    let grouped_save = control.save_project().unwrap().to_vec();
    let (mut grouped_recall, _) = prepare_native_script(SCRIPT, Some(&grouped_save), 48000., 128).unwrap();
    let recalled = grouped_recall.presentation().unwrap();
    assert_eq!(recalled["componentGroups"], referenced["componentGroups"]);
    assert_eq!(recalled["componentReferences"], referenced["componentReferences"]);
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"project.undo"}));
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"project.undo"}));
    assert_eq!(control.presentation().unwrap()["composition"], before["composition"]);
    let energy = before["componentNodes"].as_array().unwrap().iter().find(|node| node["type"] == "energy-response").unwrap();
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"component.update", "id":energy["id"], "changes":{"parameters":{"response":3}}}));
    let saved = control.save_project().unwrap().to_vec();
    let (mut recalled, _) = prepare_native_script(SCRIPT, Some(&saved), 48000., 128).unwrap();
    assert_eq!(recalled.presentation().unwrap()["composition"], control.presentation().unwrap()["composition"]);
    let restored: Value = serde_json::from_slice(&saved).unwrap();
    assert_eq!(restored["liveAuthoring"]["files"], project["liveAuthoring"]["files"]);
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"project.undo"}));
    assert_eq!(control.presentation().unwrap()["composition"], before["composition"]);
    for _ in 0..20 { assert_eq!(render(&mut audio), render(&mut reference)); }
}

#[test]
fn native_nested_graphs_edit_and_recall_without_replacing_audio() {
    let mut fixture: Value = serde_json::from_str(include_str!("../../../web/public/studio/nested-fields.manifold.json")).unwrap();
    let mut project = fixture.as_object_mut().unwrap().remove("graph").unwrap();
    project["liveAuthoring"] = fixture;
    let bytes = serde_json::to_vec(&project).unwrap();
    let (mut control, mut audio) = prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let (_, mut reference) = prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let before = control.presentation().unwrap();
    assert_eq!(before["composition"]["version"], 3);
    let group = before["composition"]["nodes"].as_array().unwrap().iter().find(|n|n["label"] == "Reactive field B").unwrap()["id"].clone();
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"component.update","id":group,"changes":{"parameters":{"n":3}}}));
    let child = before["componentNodes"].as_array().unwrap().iter().find(|n|n["type"] == "relief").unwrap();
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"graph.position","path":child["instance"],"x":470,"y":200,"space":"world"}));
    let accepted = control.presentation().unwrap();
    let saved = control.save_project().unwrap().to_vec();
    let (mut recalled, _) = prepare_native_script(SCRIPT, Some(&saved), 48000., 128).unwrap();
    assert_eq!(recalled.presentation().unwrap()["composition"], accepted["composition"]);
    assert_eq!(recalled.presentation().unwrap()["componentNodes"], accepted["componentNodes"]);
    for _ in 0..20 { assert_eq!(render(&mut audio),render(&mut reference)); }
}

#[test]
fn native_typed_field_rules_edit_and_recall_without_touching_audio() {
    let mut fixture: Value = serde_json::from_str(include_str!("../../../web/public/studio/field-rules.manifold.json")).unwrap();
    let mut project = fixture.as_object_mut().unwrap().remove("graph").unwrap();
    project["liveAuthoring"] = fixture;
    let bytes = serde_json::to_vec(&project).unwrap();
    let (mut control, mut audio) = prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let (_, mut reference) = prepare_native_script(SCRIPT, Some(&bytes), 48000., 128).unwrap();
    let before = control.presentation().unwrap();
    assert_eq!(before["composition"]["version"], 2);
    let field = before["composition"]["nodes"][0]["id"].as_u64().unwrap();
    let energy = before["composition"]["nodes"][1]["id"].as_u64().unwrap();
    let relief = before["composition"]["nodes"][2]["id"].as_u64().unwrap();
    let renderer = before["composition"]["nodes"][3]["id"].as_u64().unwrap();
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"component.update","id":relief,"changes":{"parameters":{"folds":2.0}}}));
    edit(&mut control, &mut audio, &mut reference, json!({"operation":"graph.connect","from":format!("/visual/{field}"),"output":"field","to":format!("/visual/{renderer}"),"input":"relief"}));
    let accepted = control.presentation().unwrap();
    assert!(control.begin_call("request", &[json!({"operation":"component.connect","from":energy,"output":"energy","to":renderer,"input":"relief"})]).is_err());
    assert_eq!(control.presentation().unwrap()["composition"], accepted["composition"]);
    let saved = control.save_project().unwrap().to_vec();
    let (mut recalled, _) = prepare_native_script(SCRIPT, Some(&saved), 48000., 128).unwrap();
    assert_eq!(recalled.presentation().unwrap()["composition"], accepted["composition"]);
    assert_eq!(accepted["nodeSources"][relief.to_string()][0]["path"], "/nodes/relief.mjs");
    for _ in 0..20 { assert_eq!(render(&mut audio), render(&mut reference)); }
}
fn render(audio: &mut NativeScriptAudio) -> [f32; 128] {
    let input = [0.125; 128];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    if let Some(layout) = audio.io_layout() {
        let has_input = !layout.inputs.is_empty();
        let inputs: &[&[f32]] = &[&input, &input];
        let buses = [InputBus { channels: inputs }];
        let mut channels = [left.as_mut_slice(), right.as_mut_slice()];
        audio.process_io(if has_input { &buses } else { &[] }, &mut [OutputBus { channels: &mut channels }], 128, &[]).unwrap();
        if !has_input { assert!(left.iter().any(|sample| sample.abs() > 0.001), "The authored field tone must actually run"); }
    } else {
        audio.process(AudioBlock {
            main: Some([&input, &input]), sidechain: None,
            output: [&mut left, &mut right], events: &[],
        }).unwrap();
    }
    left
}
fn edit(
    control: &mut NativeScriptControl,
    audio: &mut NativeScriptAudio,
    reference: &mut NativeScriptAudio,
    command: Value,
) {
    control.begin_call("request", &[command.clone()]).unwrap_or_else(|error| panic!("{command}: {error:?}"));
    // Metadata follows the existing block acknowledgement without replacing
    // DSP state. Compare every acknowledgement block to an untouched instance.
    if control.is_pending() {
        assert_eq!(render(audio), render(reference));
        control.poll().unwrap().unwrap();
    }
}

#[test]
fn native_visual_instances_files_and_wires_recall_without_changing_audio() {
    let (mut control, mut audio) = prepare_native_script(SCRIPT, None, 48000., 128).unwrap();
    let (_, mut reference) = prepare_native_script(SCRIPT, None, 48000., 128).unwrap();
    edit(
        &mut control,
        &mut audio,
        &mut reference,
        json!({"operation":"component.create"}),
    );
    let state = control.presentation().unwrap();
    let first = state["composition"]["nodes"][0]["id"].clone();
    edit(
        &mut control,
        &mut audio,
        &mut reference,
        json!({"operation":"component.connect","from":3,"output":"analysis","to":first,"input":"signal"}),
    );
    edit(
        &mut control,
        &mut audio,
        &mut reference,
        json!({"operation":"component.add","definitionId":"visual-1"}),
    );
    let state = control.presentation().unwrap();
    let entry = state["composition"]["definitions"][0]["implementation"]["entry"].clone();
    let links = &state["nodeSources"][first.to_string()];
    assert_eq!(links[0]["path"], entry);
    assert_eq!(links[0]["role"], "definition");
    assert_eq!(links[0]["sharedInstances"], 2);
    let code = state["visualDefinitions"][0]["sources"][entry.as_str().unwrap()]
        .as_str()
        .unwrap()
        .to_owned();
    edit(
        &mut control,
        &mut audio,
        &mut reference,
        json!({"operation":"file.write","path":entry,"mediaType":"text/javascript","encoding":"utf8",
        "content":format!("{code}\n// native source edit"),"expectedContent":code}),
    );
    for _ in 0..20 {
        assert_eq!(render(&mut audio), render(&mut reference));
    }
    let saved = control.save_project().unwrap().to_vec();
    let (mut recalled, _) = prepare_native_script(SCRIPT, Some(&saved), 48000., 128).unwrap();
    let restored = recalled.presentation().unwrap();
    assert_eq!(restored["nodeSources"], control.presentation().unwrap()["nodeSources"]);
    assert_eq!(
        restored["composition"],
        control.presentation().unwrap()["composition"]
    );
    assert_eq!(
        restored["visualDefinitions"],
        control.presentation().unwrap()["visualDefinitions"]
    );
    assert_eq!(
        restored["composition"]["nodes"].as_array().unwrap().len(),
        2
    );
    assert_eq!(
        restored["composition"]["connections"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(
        recalled
            .begin_call(
                "request",
                &[json!({"operation":"file.remove","path":entry})]
            )
            .is_err()
    );
    assert_eq!(
        recalled.presentation().unwrap()["composition"],
        restored["composition"]
    );
    edit(
        &mut control,
        &mut audio,
        &mut reference,
        json!({"operation":"project.undo"}),
    );
    assert_eq!(
        control.presentation().unwrap()["visualDefinitions"][0]["sources"][entry.as_str().unwrap()],
        code
    );
}
