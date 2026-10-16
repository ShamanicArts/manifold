use manifold_native::AudioBlock;
use manifold_native::project::{NativeProject, PreparedNativeProject};
use manifold_project_js::{HostCommand, HostCommandKind, ProjectJsRuntime, ScriptError};

const BUNDLE: &str = include_str!("../../../projects/graph-workspace/dsp-live-project.bundle.js");

fn prepare(script: &ProjectJsRuntime) -> PreparedNativeProject {
    NativeProject::parse(script.initial_project())
        .unwrap()
        .prepare_with_state(48_000.0, 128)
        .unwrap()
}

fn render(active: &mut PreparedNativeProject) -> f32 {
    let input_left: [f32; 128] = std::array::from_fn(|index| (index as f32 * 0.17).sin() * 0.25);
    let input_right: [f32; 128] = std::array::from_fn(|index| (index as f32 * 0.11).sin() * -0.25);
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    active
        .processor
        .process(AudioBlock {
            main: Some([&input_left, &input_right]),
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
        .unwrap();
    left.iter().map(|sample| sample.abs()).sum()
}

fn apply(active: &mut PreparedNativeProject, command: &HostCommand) -> bool {
    match command.kind {
        HostCommandKind::Parameter { node, id, value } => {
            active
                .processor
                .set_parameter(node.into(), id, value as f32)
        }
        HostCommandKind::Route {
            to,
            input_port,
            from,
            output_port,
        } => active
            .processor
            .set_route_from(
                to.into(),
                input_port as usize,
                (from != 0).then_some((from.into(), output_port as usize)),
            )
            .is_ok(),
        _ => false,
    }
}

#[test]
fn editor_closed_script_rewires_the_prepared_graph_after_host_acknowledgement() {
    let script = ProjectJsRuntime::load(BUNDLE).unwrap();
    let mut active = NativeProject::parse(script.initial_project())
        .unwrap()
        .prepare_patchable_with_state(48_000.0, 128)
        .unwrap();
    let before = render(&mut active);
    assert!(
        script
            .begin_call(
                "routeOutput",
                &[serde_json::json!("/dsp/live/nodes/input_trim")]
            )
            .unwrap()
            .is_none()
    );
    let command = script.take_command().unwrap();
    assert_eq!(
        command.kind,
        HostCommandKind::Route {
            to: 3,
            input_port: 0,
            from: 4,
            output_port: 0,
        }
    );
    assert!(script.take_command().is_none());
    assert!(apply(&mut active, &command));
    let after = render(&mut active);
    assert!((before - after).abs() > 0.001);
    let saved = script.acknowledge(command.id, true).unwrap().unwrap();
    let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
    assert!(
        document["signal"]["connections"]
            .as_array()
            .unwrap()
            .iter()
            .any(|edge| edge["from"] == 4 && edge["to"] == 3)
    );
}

#[test]
fn native_executes_the_shipped_js_project_and_controls_audio_without_an_editor() {
    let script = ProjectJsRuntime::load(BUNDLE).unwrap();
    let initial: serde_json::Value = serde_json::from_slice(script.initial_project()).unwrap();
    let expected: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../projects/graph-workspace/authored-dsp-live-scripting.json"
    ))
    .unwrap();
    assert_eq!(initial, expected);
    let mut active = prepare(&script);
    let mut before = 0.0;
    for _ in 0..32 {
        before = render(&mut active);
    }
    assert!(before > 0.01);

    assert!(
        script
            .begin_set_path("/dsp/live/input_gain", 0.4)
            .unwrap()
            .is_none()
    );
    let command = script.take_command().unwrap();
    assert_eq!(
        command.kind,
        HostCommandKind::Parameter {
            node: 4,
            id: 0,
            value: 0.4
        }
    );
    assert!(matches!(
        script.acknowledge(command.id + 1, true),
        Err(ScriptError::WrongAcknowledgement)
    ));
    assert!(matches!(
        script.begin_set_path("/dsp/live/width", 0.5),
        Err(ScriptError::Pending)
    ));
    assert!(apply(&mut active, &command));
    let saved = script.acknowledge(command.id, true).unwrap().unwrap();
    let document: serde_json::Value = serde_json::from_slice(&saved).unwrap();
    assert_eq!(
        document["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["nodeId"] == 4 && entry["id"] == 0)
            .unwrap()["value"],
        0.4
    );
    let mut after = 0.0;
    for _ in 0..32 {
        after = render(&mut active);
    }
    assert!(after < before * 0.5, "{before} -> {after}");
    assert!(matches!(
        script.begin_set_path("/missing", 0.5),
        Err(ScriptError::Rejected(_))
    ));
    assert!(script.take_command().is_none());
}

#[test]
fn instances_are_isolated_and_host_rejection_keeps_the_authored_state() {
    let first = ProjectJsRuntime::load(BUNDLE).unwrap();
    let second = ProjectJsRuntime::load(BUNDLE).unwrap();
    let original = first.initial_project().to_vec();
    assert_eq!(original, second.initial_project());
    let mut first_audio = prepare(&first);
    let mut second_audio = prepare(&second);
    assert!(
        first
            .begin_set_path("/dsp/live/input_gain", 0.4)
            .unwrap()
            .is_none()
    );
    let rejected = first.take_command().unwrap();
    assert!(matches!(
        first.acknowledge(rejected.id, false),
        Err(ScriptError::Rejected(_))
    ));
    assert_eq!(render(&mut first_audio), render(&mut second_audio));
    assert!(second.take_command().is_none());
    assert!(
        first
            .begin_set_path("/dsp/live/input_gain", 0.4)
            .unwrap()
            .is_none()
    );
    let accepted = first.take_command().unwrap();
    assert!(apply(&mut first_audio, &accepted));
    assert!(first.acknowledge(accepted.id, true).unwrap().is_some());
    for _ in 0..32 {
        render(&mut first_audio);
        render(&mut second_audio);
    }
    assert!(render(&mut first_audio) < render(&mut second_audio) * 0.5);
    assert_eq!(second.initial_project(), original);
}

#[test]
fn invalid_or_runaway_script_fails_before_publication() {
    assert!(matches!(
        ProjectJsRuntime::load("var ManifoldProject = {};"),
        Err(ScriptError::JavaScript(_))
    ));
    assert!(matches!(
        ProjectJsRuntime::load("while (true) {}"),
        Err(ScriptError::Timeout)
    ));
    let project =
        include_str!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
    let premature = format!(
        r#"var ManifoldProject = {{ createProject(host) {{
      host.setParameter({{nodeId: 4, id: 0, value: 0.4}});
      return {{ toProject: () => ({project}) }};
    }} }};"#
    );
    assert!(matches!(
        ProjectJsRuntime::load(&premature),
        Err(ScriptError::InvalidProject(_))
    ));
}

#[test]
fn restored_js_controller_edits_the_saved_graph_with_no_editor() {
    let script = ProjectJsRuntime::load(BUNDLE).unwrap();
    assert!(
        script
            .begin_set_path("/dsp/live/input_gain", 0.4)
            .unwrap()
            .is_none()
    );
    let command = script.take_command().unwrap();
    let saved = script.acknowledge(command.id, true).unwrap().unwrap();

    let restored = ProjectJsRuntime::load_with_project(BUNDLE, Some(&saved)).unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(restored.initial_project()).unwrap(),
        serde_json::from_slice::<serde_json::Value>(&saved).unwrap()
    );
    let mut audio = NativeProject::parse(restored.initial_project())
        .unwrap()
        .prepare_patchable_with_state(48_000.0, 128)
        .unwrap();
    assert!(render(&mut audio) > 0.0);
    assert!(
        restored
            .begin_call(
                "routeOutput",
                &[serde_json::json!("/dsp/live/nodes/input_trim")]
            )
            .unwrap()
            .is_none()
    );
    let route = restored.take_command().unwrap();
    assert_eq!(
        route.kind,
        HostCommandKind::Route {
            to: 3,
            input_port: 0,
            from: 4,
            output_port: 0,
        }
    );
    assert!(apply(&mut audio, &route));
    let next = restored.acknowledge(route.id, true).unwrap().unwrap();
    let document: serde_json::Value = serde_json::from_slice(&next).unwrap();
    assert_eq!(
        document["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["nodeId"] == 4 && entry["id"] == 0)
            .unwrap()["value"],
        0.4
    );
    assert!(matches!(
        ProjectJsRuntime::load_with_project(
            BUNDLE,
            Some(include_bytes!(
                "../../../projects/graph-workspace/authored-fx-slot-swap.json"
            ))
        ),
        Err(ScriptError::JavaScript(_))
    ));
}
