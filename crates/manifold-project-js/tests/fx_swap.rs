use manifold_native::AudioBlock;
use manifold_native::project::{NativeProject, PreparedNativeProject};
use manifold_project_js::{HostCommandKind, ProjectJsRuntime, ScriptError};

const BUNDLE: &str = include_str!("../../../projects/graph-workspace/fx-slot-project.bundle.js");

fn render(active: &mut PreparedNativeProject) -> [f32; 128] {
    let input_left: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.17).sin() * 0.25);
    let input_right: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.11).sin() * -0.25);
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
    left
}

#[test]
fn authored_fx_swap_prepares_then_publishes_only_after_host_acceptance() {
    let script = ProjectJsRuntime::load(BUNDLE).unwrap();
    let original: serde_json::Value = serde_json::from_slice(script.initial_project()).unwrap();
    let expected: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../projects/graph-workspace/authored-fx-slot-swap.json"
    ))
    .unwrap();
    assert_eq!(original, expected);
    let mut active = NativeProject::parse(script.initial_project())
        .unwrap()
        .prepare_with_state(48_000.0, 128)
        .unwrap();
    assert!(
        script
            .begin_set_path("/test/fxslot/slotA/width/amount", 1.9)
            .unwrap()
            .is_none()
    );
    let amount = script.take_command().unwrap();
    let HostCommandKind::ReplaceGraph { document } = amount.kind else {
        panic!("FX amount must use the authored graph transaction");
    };
    let next = NativeProject::parse(&document)
        .unwrap()
        .prepare_with_state(48_000.0, 128)
        .unwrap();
    let retired = active.publish_replacement(next);
    script.acknowledge(amount.id, true).unwrap().unwrap();
    drop(retired);
    let before = render(&mut active);

    assert!(
        script
            .begin_set_path("/test/fxslot/slotA/select", 1.0)
            .unwrap()
            .is_none()
    );
    let command = script.take_command().unwrap();
    let HostCommandKind::ReplaceGraph { document } = command.kind else {
        panic!("FX selection must request a structural graph replacement");
    };
    let candidate: serde_json::Value = serde_json::from_slice(&document).unwrap();
    let expected_width: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../projects/graph-workspace/authored-fx-slot-swap-width.json"
    ))
    .unwrap();
    assert_eq!(candidate, expected_width);
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(script.initial_project()).unwrap(),
        original
    );
    let mut next = NativeProject::parse(&document)
        .unwrap()
        .prepare_with_state(48_000.0, 128)
        .unwrap();
    next.transfer_live_graph_history_from(&active);
    let retired = active.publish_replacement(next);
    let after = render(&mut active);
    assert!(before.iter().zip(after).any(|(a, b)| (a - b).abs() > 0.001));
    let saved = script.acknowledge(command.id, true).unwrap().unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&saved).unwrap(),
        expected_width
    );
    drop(retired);
}

#[test]
fn rejected_fx_swap_keeps_the_authored_graph_and_can_retry() {
    let script = ProjectJsRuntime::load(BUNDLE).unwrap();
    let original = script.initial_project().to_vec();
    assert!(
        script
            .begin_set_path("/test/fxslot/slotA/select", 1.0)
            .unwrap()
            .is_none()
    );
    let command = script.take_command().unwrap();
    assert!(matches!(
        script.acknowledge(command.id, false),
        Err(ScriptError::Rejected(_))
    ));
    assert_eq!(script.initial_project(), original);
    assert!(
        script
            .begin_set_path("/test/fxslot/slotA/select", 1.0)
            .unwrap()
            .is_none()
    );
    assert!(matches!(
        script.take_command().unwrap().kind,
        HostCommandKind::ReplaceGraph { .. }
    ));
}

#[test]
fn restored_fx_controller_adds_another_slot_to_the_saved_graph() {
    let saved =
        include_bytes!("../../../projects/graph-workspace/authored-fx-slot-swap-width.json");
    let script = ProjectJsRuntime::load_with_project(BUNDLE, Some(saved)).unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(script.initial_project()).unwrap(),
        serde_json::from_slice::<serde_json::Value>(saved).unwrap()
    );
    assert!(
        script
            .begin_set_path("/test/fxslot/slotB/select", 1.0)
            .unwrap()
            .is_none()
    );
    let command = script.take_command().unwrap();
    let HostCommandKind::ReplaceGraph { ref document } = command.kind else {
        panic!("restored FX controller must request a graph replacement");
    };
    let candidate: serde_json::Value = serde_json::from_slice(document).unwrap();
    assert_eq!(candidate["signal"]["nodes"].as_array().unwrap().len(), 14);
    assert_eq!(
        candidate["controls"]
            .as_array()
            .unwrap()
            .iter()
            .find(|control| control["path"] == "/test/fxslot/slotB/select")
            .unwrap()["value"],
        1
    );
    assert!(
        NativeProject::parse(document)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .is_ok()
    );
    let accepted = script.acknowledge(command.id, true).unwrap().unwrap();
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&accepted).unwrap(),
        candidate
    );
}
