use manifold_native::AudioBlock;
use manifold_project_js::package::{PackageError, ProjectPackage};

const DSP: &[u8] = include_bytes!("../../../web/public/packages/dsp-live-scripting.manifold.json");
const FX: &[u8] = include_bytes!("../../../web/public/packages/fx-slot-swap.manifold.json");

fn block(audio: &mut manifold_project_js::native_host::NativeScriptAudio) {
    let input = [0.25_f32; 128];
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    audio
        .process(AudioBlock {
            main: Some([&input, &input]),
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
        .unwrap();
}

#[test]
fn one_package_restores_both_js_control_and_native_audio_state() {
    let package = ProjectPackage::parse(DSP).unwrap();
    assert_eq!(package.id, "manifold.dsp-live-scripting");
    let (mut control, mut audio) = package.prepare_native(48_000.0, 128).unwrap();
    control.begin_set_path("/dsp/live/input_gain", 0.4).unwrap();
    block(&mut audio);
    let saved_graph = control.poll().unwrap().unwrap().to_vec();
    let saved_package = package.save_with_state(&saved_graph).unwrap();
    let reopened = ProjectPackage::parse(&saved_package).unwrap();
    assert_eq!(reopened.bundle_sha256, package.bundle_sha256);
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(reopened.state()).unwrap(),
        serde_json::from_slice::<serde_json::Value>(&saved_graph).unwrap()
    );
    let (mut control, mut audio) = reopened.prepare_native(48_000.0, 128).unwrap();
    control
        .begin_call(
            "routeOutput",
            &[serde_json::json!("/dsp/live/nodes/input_trim")],
        )
        .unwrap();
    block(&mut audio);
    let routed = control.poll().unwrap().unwrap();
    let document: serde_json::Value = serde_json::from_slice(routed).unwrap();
    assert!(
        document["signal"]["connections"]
            .as_array()
            .unwrap()
            .iter()
            .any(|edge| edge["from"] == 4 && edge["to"] == 3)
    );
}

#[test]
fn packaged_fx_script_adds_effect_instances_after_state_reopen() {
    let package = ProjectPackage::parse(FX).unwrap();
    let (mut control, mut audio) = package.prepare_native(48_000.0, 128).unwrap();
    control
        .begin_set_path("/test/fxslot/slotA/select", 1.0)
        .unwrap();
    block(&mut audio);
    let saved = package
        .save_with_state(control.poll().unwrap().unwrap())
        .unwrap();
    let package = ProjectPackage::parse(&saved).unwrap();
    let (mut control, mut audio) = package.prepare_native(48_000.0, 128).unwrap();
    control
        .begin_set_path("/test/fxslot/slotB/select", 1.0)
        .unwrap();
    block(&mut audio);
    let project: serde_json::Value =
        serde_json::from_slice(control.poll().unwrap().unwrap()).unwrap();
    assert_eq!(project["signal"]["nodes"].as_array().unwrap().len(), 14);
}

#[test]
fn package_rejects_modified_code_before_running_it() {
    let mut document: serde_json::Value = serde_json::from_slice(DSP).unwrap();
    let altered = format!(
        "{}\n// modified",
        document["control"]["bundle"].as_str().unwrap()
    );
    document["control"]["bundle"] = altered.into();
    let bytes = serde_json::to_vec(&document).unwrap();
    assert!(matches!(
        ProjectPackage::parse(&bytes),
        Err(PackageError::BundleHash)
    ));
    document["schemaVersion"] = 99.into();
    let bytes = serde_json::to_vec(&document).unwrap();
    assert!(matches!(
        ProjectPackage::parse(&bytes),
        Err(PackageError::Invalid(_))
    ));
}
