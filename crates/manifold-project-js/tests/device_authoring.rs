use manifold_native::{InputBus, OutputBus};
use manifold_project_js::native_host::{NativeScriptAudio, prepare_native_script};
use serde_json::json;

const SCRIPT: &str = include_str!("../../../projects/standalone-filter/live-controller.bundle.js");
const SOURCE: &str = include_str!("../../../packages/manifold/examples/gain.js");

fn render(audio: &mut NativeScriptAudio) -> f32 {
    let input = [0.25; 128];
    let mut left = [0.; 128];
    let mut right = [0.; 128];
    for _ in 0..48 {
        let input_channels = [input.as_slice(), input.as_slice()];
        let mut output_channels = [left.as_mut_slice(), right.as_mut_slice()];
        audio
            .process_io(
                &[InputBus {
                    channels: &input_channels,
                }],
                &mut [OutputBus {
                    channels: &mut output_channels,
                }],
                128,
                &[],
            )
            .unwrap();
    }
    left[127]
}

#[test]
fn device_source_runs_in_native_js_and_retains_accepted_gain_through_edit_and_recall() {
    // Start with this device's declared buses. Changing a running plug-in's
    // host bus identities requires a new native host, independently of syntax.
    let bundle = format!(
        "{SCRIPT}\nconst deviceCreator = ManifoldProject.createLiveCreatorProject;\n\
         const deviceFactory = (host, saved) => deviceCreator(host, {}, saved);\n\
         ManifoldProject = {{createProject: deviceFactory, restoreProject: deviceFactory}};",
        serde_json::to_string(SOURCE).unwrap()
    );
    let (mut control, mut audio) = prepare_native_script(&bundle, None, 48000., 128).unwrap();
    control
        .begin_call(
            "request",
            &[json!({"operation":"source.apply","source":SOURCE})],
        )
        .unwrap();
    render(&mut audio);
    control.poll().unwrap().unwrap();
    assert!((render(&mut audio) - 0.1625).abs() < 0.00001);
    assert_eq!(control.presentation().unwrap()["source"], SOURCE);
    control.begin_set_path("/volume", 0.4).unwrap();
    render(&mut audio);
    control.poll().unwrap().unwrap();
    let renamed = SOURCE
        .replace("const level =", "const outputLevel =")
        .replace("level.parameters", "outputLevel.parameters")
        .replace("level.inputs", "outputLevel.inputs")
        .replace("level.outputs", "outputLevel.outputs");
    control
        .begin_call(
            "request",
            &[json!({"operation":"source.apply","source":renamed})],
        )
        .unwrap();
    render(&mut audio);
    control.poll().unwrap().unwrap();
    assert!((render(&mut audio) - 0.1).abs() < 0.00001);
    let saved = control.save_project().unwrap().to_vec();
    let (mut reopened, mut audio) =
        prepare_native_script(&bundle, Some(&saved), 48000., 128).unwrap();
    assert!((render(&mut audio) - 0.1).abs() < 0.00001);
    assert_eq!(reopened.presentation().unwrap()["source"], renamed);
}

#[test]
fn native_graph_wrap_preserves_playing_signal_and_saved_control_identity() {
    let bundle = format!(
        "{SCRIPT}\nconst creator = ManifoldProject.createLiveCreatorProject;\n\
         const factory = (host, saved) => creator(host, {}, saved);\n\
         ManifoldProject = {{createProject: factory, restoreProject: factory}};",
        serde_json::to_string(SOURCE).unwrap()
    );
    let (mut control, mut audio) = prepare_native_script(&bundle, None, 48000., 128).unwrap();
    control.begin_set_path("/volume", 0.4).unwrap();
    render(&mut audio);
    control.poll().unwrap().unwrap();
    let before = control.presentation().unwrap();
    let id = before["graph"]["instances"]
        .as_array()
        .unwrap()
        .iter()
        .find(|node| {
            node["path"]
                .as_str()
                .unwrap()
                .ends_with("/processors/level")
        })
        .unwrap()["nodeId"]
        .clone();
    control
        .begin_call(
            "request",
            &[json!({"operation":"graph.wrap","ids":[id],"label":"Level Stage"})],
        )
        .unwrap();
    render(&mut audio);
    control.poll().unwrap().unwrap();
    assert!((render(&mut audio) - 0.1).abs() < 0.00001);
    let after = control.presentation().unwrap();
    assert!(
        after["audioNodes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|node| node["implementationKind"] == "composition")
    );
    assert_eq!(
        before["graph"]["hostBindings"],
        after["graph"]["hostBindings"]
    );
    let saved = control.save_project().unwrap().to_vec();
    let (_reopened, mut audio) = prepare_native_script(&bundle, Some(&saved), 48000., 128).unwrap();
    assert!((render(&mut audio) - 0.1).abs() < 0.00001);
}

#[test]
fn studio_instrument_routes_midi_and_releases_only_the_requested_owner() {
    let source = include_str!("../../../web/handbook/examples/instrument.mjs");
    let bundle = format!(
        "{}\nconst creator = ManifoldProject.createLiveCreatorProject;\n\
         const factory = (host, saved) => creator(host, {}, saved);\n\
         ManifoldProject = {{createProject: factory, restoreProject: factory}};",
        SCRIPT,
        serde_json::to_string(source).unwrap()
    );
    let (mut control, mut audio) = prepare_native_script(&bundle, None, 48000., 128).unwrap();
    let render = |audio: &mut NativeScriptAudio, blocks: usize| {
        let mut energy = 0.;
        for _ in 0..blocks {
            let mut left = [0.; 128];
            let mut right = [0.; 128];
            let mut channels = [left.as_mut_slice(), right.as_mut_slice()];
            audio
                .process_io(
                    &[],
                    &mut [OutputBus {
                        channels: &mut channels,
                    }],
                    128,
                    &[],
                )
                .unwrap();
            energy = left.iter().map(|x| x.abs()).sum::<f32>();
        }
        energy
    };
    assert_eq!(render(&mut audio, 1), 0.);
    for owner in ["keys", "agent"] {
        control.begin_call("request", &[json!({"operation":"event.send","event":{"type":"note-on","note":60,"owner":owner}})]).unwrap();
        for attempt in 0..16 {
            render(&mut audio, 1);
            control.poll().unwrap();
            if !control.is_pending() {
                break;
            }
            assert!(attempt < 15, "MIDI command did not finish");
        }
    }
    assert!(render(&mut audio, 100) > 1.);
    control
        .begin_call(
            "request",
            &[json!({"operation":"event.send","event":{"type":"panic","owner":"keys"}})],
        )
        .unwrap();
    for attempt in 0..16 {
        render(&mut audio, 1);
        control.poll().unwrap();
        if !control.is_pending() {
            break;
        }
        assert!(attempt < 15, "MIDI command did not finish");
    }
    assert!(
        render(&mut audio, 160) > 1.,
        "agent still owns the sounding note"
    );
    control
        .begin_call(
            "request",
            &[json!({"operation":"event.send","event":{"type":"panic","owner":"agent"}})],
        )
        .unwrap();
    for attempt in 0..16 {
        render(&mut audio, 1);
        control.poll().unwrap();
        if !control.is_pending() {
            break;
        }
        assert!(attempt < 15, "MIDI command did not finish");
    }
    assert_eq!(render(&mut audio, 200), 0.);
}
