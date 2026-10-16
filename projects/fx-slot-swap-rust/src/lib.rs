//! Rust orchestration of the legacy DspLiveScripting FX slot swap harness.
//! The graph consists only of ordinary, reusable Manifold primitives.

use manifold_native::author::{
    AuthorError, GraphWorkspace, InputSource, LiveGraphSession, PreparedGraphTransaction,
    RejectedGraphTransaction, RetiredGraphTransaction,
};
use manifold_native::project::PreparedNativeProject;
use serde_json::Value;

const PREFIX: &str = "/test/fxslot";

#[derive(Clone, Copy)]
struct Slot {
    name: &'static str,
    source: u32,
    gain: u32,
    gate: u32,
    mix: u32,
    width: u32,
    width_gate: u32,
}

const SLOTS: [Slot; 2] = [
    Slot {
        name: "slotA",
        source: 4,
        gain: 6,
        gate: 7,
        mix: 8,
        width: 14,
        width_gate: 15,
    },
    Slot {
        name: "slotB",
        source: 8,
        gain: 10,
        gate: 11,
        mix: 12,
        width: 16,
        width_gate: 17,
    },
];

fn select_path(slot: Slot) -> String {
    format!("{PREFIX}/{}/select", slot.name)
}

fn amount_path(slot: Slot, effect: &str) -> String {
    format!("{PREFIX}/{}/{effect}/amount", slot.name)
}

fn node_path(slot: Slot, role: &str) -> String {
    format!("{PREFIX}/{}/nodes/{role}", slot.name)
}

fn required_node(graph: &GraphWorkspace, path: &str) -> Result<u32, AuthorError> {
    graph
        .find_instance(path)
        .ok_or(AuthorError::UnsupportedProject)
}

fn next_id(graph: &GraphWorkspace, preferred: u32) -> Result<u32, AuthorError> {
    if graph.find(preferred).is_none() {
        return Ok(preferred);
    }
    (2..=65_535)
        .find(|id| graph.find(*id).is_none())
        .ok_or(AuthorError::InvalidId)
}

fn restore_legacy_instance_paths(graph: &mut GraphWorkspace) -> Result<(), AuthorError> {
    if graph
        .find_instance("/test/fxslot/nodes/input_trim")
        .is_some()
    {
        return Ok(());
    }
    let required = [
        ("/test/fxslot/nodes/input_trim", 4, "gain"),
        ("/test/fxslot/nodes/master", 13, "gain"),
        ("/test/fxslot/slotA/nodes/gain", 6, "gain"),
        ("/test/fxslot/slotA/nodes/gain_gate", 7, "gain"),
        ("/test/fxslot/slotA/nodes/mix", 8, "sum2"),
        ("/test/fxslot/slotB/nodes/gain", 10, "gain"),
        ("/test/fxslot/slotB/nodes/gain_gate", 11, "gain"),
        ("/test/fxslot/slotB/nodes/mix", 12, "sum2"),
    ];
    if required
        .iter()
        .any(|&(_, id, kind)| graph.find(id) != Some(kind))
    {
        return Err(AuthorError::UnsupportedProject);
    }
    for slot in SLOTS {
        if graph.find(slot.width).is_some() != graph.find(slot.width_gate).is_some()
            || graph
                .find(slot.width)
                .is_some_and(|kind| kind != "stereo-widener")
            || graph
                .find(slot.width_gate)
                .is_some_and(|kind| kind != "gain")
        {
            return Err(AuthorError::UnsupportedProject);
        }
    }
    for (path, id, _) in required {
        graph.register_instance(path, id)?;
    }
    for slot in SLOTS {
        if graph.find(slot.width) == Some("stereo-widener")
            && graph.find(slot.width_gate) == Some("gain")
        {
            graph.register_instance(&node_path(slot, "width"), slot.width)?;
            graph.register_instance(&node_path(slot, "width_gate"), slot.width_gate)?;
        }
    }
    Ok(())
}

pub fn build_graph() -> Result<GraphWorkspace, AuthorError> {
    let mut graph = GraphWorkspace::new();
    graph.set_input_source(InputSource::External);
    graph.add(4, "gain")?;
    graph.register_instance("/test/fxslot/nodes/input_trim", 4)?;
    graph.set_parameter(4, 0, 1.0)?;
    graph.register_parameter("/test/fxslot/input_gain", 4, 0, 0.0, 2.0, 1.0)?;
    graph.bind_host_slot(0, 4, 0)?;
    graph.connect(1, "out", 4, "audio")?;
    for slot in SLOTS {
        graph.add(slot.gain, "gain")?;
        graph.add(slot.gate, "gain")?;
        graph.add(slot.mix, "sum2")?;
        graph.register_instance(&node_path(slot, "gain"), slot.gain)?;
        graph.register_instance(&node_path(slot, "gain_gate"), slot.gate)?;
        graph.register_instance(&node_path(slot, "mix"), slot.mix)?;
        graph.set_parameter(slot.gain, 0, 0.8)?;
        graph.set_parameter(slot.gate, 0, 1.0)?;
        graph.connect(slot.source, "out", slot.gain, "audio")?;
        graph.connect(slot.gain, "out", slot.gate, "audio")?;
        graph.connect(slot.gate, "out", slot.mix, "a")?;
        graph.register_control(&select_path(slot), 0.0, 1.0, 0.0, true)?;
        graph.register_control(&amount_path(slot, "gain"), 0.0, 2.0, 0.8, false)?;
        graph.register_control(&amount_path(slot, "width"), 0.0, 2.0, 1.6, false)?;
    }
    graph.add(13, "gain")?;
    graph.register_instance("/test/fxslot/nodes/master", 13)?;
    graph.set_parameter(13, 0, 1.0)?;
    graph.connect(12, "out", 13, "audio")?;
    graph.connect(13, "out", 3, "in")?;
    Ok(graph)
}

/// A reusable project event handler. Hosts own the prepared runtime and call
/// `prepare_set` on their control thread, then `publish` at a block boundary.
/// The handler needs no editor and can be reconstructed from saved graph state.
pub struct FxSlotSwap {
    session: LiveGraphSession,
}

impl FxSlotSwap {
    pub fn new() -> Result<Self, AuthorError> {
        Ok(Self {
            session: LiveGraphSession::new(build_graph()?)?,
        })
    }

    pub fn from_project_json(bytes: &[u8]) -> Result<Self, AuthorError> {
        let mut graph = GraphWorkspace::from_project_json(bytes)?;
        restore_legacy_instance_paths(&mut graph)?;
        for (path, kind) in [
            ("/test/fxslot/nodes/input_trim", "gain"),
            ("/test/fxslot/slotA/nodes/gain", "gain"),
            ("/test/fxslot/slotA/nodes/gain_gate", "gain"),
            ("/test/fxslot/slotA/nodes/mix", "sum2"),
            ("/test/fxslot/slotB/nodes/gain", "gain"),
            ("/test/fxslot/slotB/nodes/gain_gate", "gain"),
            ("/test/fxslot/slotB/nodes/mix", "sum2"),
            ("/test/fxslot/nodes/master", "gain"),
        ] {
            if graph.find_instance(path).and_then(|id| graph.find(id)) != Some(kind) {
                return Err(AuthorError::UnsupportedProject);
            }
        }
        if graph
            .find_parameter("/test/fxslot/input_gain")
            .is_none_or(|parameter| {
                Some(parameter.node) != graph.find_instance("/test/fxslot/nodes/input_trim")
                    || parameter.id != 0
            })
        {
            return Err(AuthorError::UnsupportedProject);
        }
        for slot in SLOTS {
            for path in [
                select_path(slot),
                amount_path(slot, "gain"),
                amount_path(slot, "width"),
            ] {
                if graph.find_control(&path).is_none() {
                    return Err(AuthorError::UnsupportedProject);
                }
            }
            let width = graph.find_instance(&node_path(slot, "width"));
            let width_gate = graph.find_instance(&node_path(slot, "width_gate"));
            if width.is_some() != width_gate.is_some()
                || width.is_some_and(|id| graph.find(id) != Some("stereo-widener"))
                || width_gate.is_some_and(|id| graph.find(id) != Some("gain"))
            {
                return Err(AuthorError::UnsupportedProject);
            }
        }
        Ok(Self {
            session: LiveGraphSession::new(graph)?,
        })
    }

    pub fn to_project(&self) -> Result<Value, AuthorError> {
        self.session.to_project()
    }

    pub fn revision(&self) -> u64 {
        self.session.revision()
    }

    pub fn prepare_set(
        &self,
        sample_rate: f32,
        max_frames: usize,
        path: &str,
        value: f64,
    ) -> Result<PreparedGraphTransaction, AuthorError> {
        if !value.is_finite() {
            return Err(AuthorError::InvalidControl);
        }
        if path == "/test/fxslot/input_gain" {
            return self
                .session
                .prepare_transaction(sample_rate, max_frames, |graph| {
                    graph.set_parameter_path(path, value)
                });
        }
        for slot in SLOTS {
            if path == select_path(slot) {
                let selected = (value + 0.5).floor().clamp(0.0, 1.0);
                return self
                    .session
                    .prepare_transaction(sample_rate, max_frames, |graph| {
                        graph.set_control(path, selected)?;
                        let width_path = node_path(slot, "width");
                        let width_gate_path = node_path(slot, "width_gate");
                        if selected == 1.0 && graph.find_instance(&width_path).is_none() {
                            let amount = graph
                                .find_control(&amount_path(slot, "width"))
                                .ok_or(AuthorError::InvalidControl)?
                                .value;
                            let width = next_id(graph, slot.width)?;
                            graph.add(width, "stereo-widener")?;
                            let width_gate = next_id(graph, slot.width_gate)?;
                            graph.add(width_gate, "gain")?;
                            graph.register_instance(&width_path, width)?;
                            graph.register_instance(&width_gate_path, width_gate)?;
                            graph.set_parameter(width, 0, amount)?;
                            graph.set_parameter(width, 1, 160.0)?;
                            graph.set_parameter(width, 2, 1.0)?;
                            graph.set_parameter(width_gate, 0, 0.0)?;
                            let source_path = if slot.name == "slotA" {
                                "/test/fxslot/nodes/input_trim".to_owned()
                            } else {
                                node_path(SLOTS[0], "mix")
                            };
                            graph.connect(
                                required_node(graph, &source_path)?,
                                "out",
                                width,
                                "audio",
                            )?;
                            graph.connect(width, "out", width_gate, "audio")?;
                            graph.connect(
                                width_gate,
                                "out",
                                required_node(graph, &node_path(slot, "mix"))?,
                                "b",
                            )?;
                        }
                        graph.set_parameter(
                            required_node(graph, &node_path(slot, "gain_gate"))?,
                            0,
                            if selected == 0.0 { 1.0 } else { 0.0 },
                        )?;
                        if let Some(width_gate) = graph.find_instance(&width_gate_path) {
                            graph.set_parameter(
                                width_gate,
                                0,
                                if selected == 1.0 { 1.0 } else { 0.0 },
                            )?;
                        }
                        Ok(())
                    });
            }
            for effect in ["gain", "width"] {
                if path == amount_path(slot, effect) {
                    return self
                        .session
                        .prepare_transaction(sample_rate, max_frames, |graph| {
                            graph.set_control(path, value)?;
                            if let Some(node_id) = graph.find_instance(&node_path(slot, effect)) {
                                graph.set_parameter(node_id, 0, value)?;
                            }
                            Ok(())
                        });
                }
            }
        }
        Err(AuthorError::InvalidControl)
    }

    pub fn publish(
        &mut self,
        active: &mut PreparedNativeProject,
        next: PreparedGraphTransaction,
    ) -> Result<RetiredGraphTransaction, RejectedGraphTransaction> {
        self.session.publish_transaction(active, next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_core::stereo_widener::StereoWidener;
    use manifold_native::AudioBlock;
    use manifold_native::project::NativeProject;

    const GAIN: &[u8] = include_bytes!("../../graph-workspace/authored-fx-slot-swap.json");
    const WIDTH: &[u8] = include_bytes!("../../graph-workspace/authored-fx-slot-swap-width.json");

    fn prepare_active(project: &FxSlotSwap) -> PreparedNativeProject {
        NativeProject::parse(&serde_json::to_vec(&project.to_project().unwrap()).unwrap())
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap()
    }

    fn render(active: &mut PreparedNativeProject) -> ([f32; 128], [f32; 128]) {
        let left: [f32; 128] = std::array::from_fn(|i| ((i % 16) as f32 - 8.0) / 8.0);
        let right: [f32; 128] = std::array::from_fn(|i| (((i * 3) % 16) as f32 - 8.0) / 8.0);
        let mut output = ([0.0; 128], [0.0; 128]);
        for _ in 0..12 {
            active
                .processor
                .process(AudioBlock {
                    main: Some([&left, &right]),
                    sidechain: None,
                    output: [&mut output.0, &mut output.1],
                    events: &[],
                })
                .unwrap();
        }
        output
    }

    #[test]
    fn authored_gain_values_apply_on_the_first_native_sample() {
        let project = FxSlotSwap::new().unwrap();
        let mut active = prepare_active(&project);
        let input = [0.5_f32; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        active
            .processor
            .process(AudioBlock {
                main: Some([&input, &input]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!((left[0] - 0.32).abs() < 1e-5, "first sample: {}", left[0]);
        assert_eq!(left, right);
    }

    #[test]
    fn selected_width_applies_from_the_first_native_sample() {
        let project = FxSlotSwap::from_project_json(WIDTH).unwrap();
        let mut active = prepare_active(&project);
        let input_left = [0.5_f32; 128];
        let input_right = [-0.5_f32; 128];
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
        let mut reference = StereoWidener::new(48_000.0, [1.9, 160.0, 1.0]);
        let mut expected_left = [0.0; 128];
        let mut expected_right = [0.0; 128];
        reference.process_planar(
            [&input_left, &input_right],
            [&mut expected_left, &mut expected_right],
        );
        assert!(
            (left[0] - expected_left[0] * 0.8).abs() < 1e-4,
            "first sample: {} versus {}",
            left[0],
            expected_left[0] * 0.8
        );
        assert!((right[0] - expected_right[0] * 0.8).abs() < 1e-4);
    }

    #[test]
    fn saved_instance_paths_survive_node_renumbering_and_id_collisions() {
        let mut document: Value = serde_json::from_slice(GAIN).unwrap();
        let remap = |old: u64| match old {
            4 => 14,
            6 => 15,
            7 => 27,
            8 => 28,
            10 => 30,
            11 => 31,
            12 => 32,
            13 => 33,
            other => other,
        };
        for node in document["signal"]["nodes"].as_array_mut().unwrap() {
            node["id"] = remap(node["id"].as_u64().unwrap()).into();
        }
        for edge in document["signal"]["connections"].as_array_mut().unwrap() {
            edge["from"] = remap(edge["from"].as_u64().unwrap()).into();
            edge["to"] = remap(edge["to"].as_u64().unwrap()).into();
        }
        for entry in document["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
        {
            entry["nodeId"] = remap(entry["nodeId"].as_u64().unwrap()).into();
        }
        for field in ["endpoints", "hostBindings", "instances"] {
            for entry in document[field].as_array_mut().unwrap() {
                entry["nodeId"] = remap(entry["nodeId"].as_u64().unwrap()).into();
            }
        }
        let mut project =
            FxSlotSwap::from_project_json(&serde_json::to_vec(&document).unwrap()).unwrap();
        let mut active = prepare_active(&project);
        let amount = project
            .prepare_set(48_000.0, 128, "/test/fxslot/slotA/width/amount", 1.9)
            .unwrap();
        drop(project.publish(&mut active, amount).unwrap());
        let select = project
            .prepare_set(48_000.0, 128, "/test/fxslot/slotA/select", 1.0)
            .unwrap();
        drop(project.publish(&mut active, select).unwrap());
        let saved = project.to_project().unwrap();
        assert_eq!(
            saved["instances"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["path"] == "/test/fxslot/slotA/nodes/width")
                .unwrap()["nodeId"],
            2
        );
        assert_eq!(
            saved["instances"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["path"] == "/test/fxslot/slotA/nodes/width_gate")
                .unwrap()["nodeId"],
            4
        );
        let reference = FxSlotSwap::from_project_json(WIDTH).unwrap();
        let mut reference_active = prepare_active(&reference);
        let mut actual = render(&mut active);
        let mut expected = render(&mut reference_active);
        for _ in 0..20 {
            actual = render(&mut active);
            expected = render(&mut reference_active);
        }
        let diff_left = actual
            .0
            .iter()
            .zip(expected.0)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0_f32, f32::max);
        let diff_right = actual
            .1
            .iter()
            .zip(expected.1)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0_f32, f32::max);
        assert!(
            diff_left < 3e-5 && diff_right < 3e-5,
            "left={diff_left}, right={diff_right}"
        );
        let reopened = FxSlotSwap::from_project_json(&active.save_state().unwrap()).unwrap();
        assert_eq!(
            reopened.to_project().unwrap()["instances"],
            saved["instances"]
        );
    }

    #[test]
    fn pre_instance_fx_slot_save_restores_names_before_next_event() {
        let mut old: Value = serde_json::from_slice(WIDTH).unwrap();
        old.as_object_mut().unwrap().remove("instances");
        let mut project =
            FxSlotSwap::from_project_json(&serde_json::to_vec(&old).unwrap()).unwrap();
        assert_eq!(
            project.to_project().unwrap(),
            serde_json::from_slice::<Value>(WIDTH).unwrap()
        );
        let mut active = prepare_active(&project);
        let selected = project
            .prepare_set(48_000.0, 128, "/test/fxslot/slotA/select", 0.0)
            .unwrap();
        drop(project.publish(&mut active, selected).unwrap());
        assert_eq!(project.to_project().unwrap()["controls"][1]["value"], 0);
    }

    #[test]
    fn a_published_width_edit_carries_the_existing_filter_history() {
        let mut project = FxSlotSwap::from_project_json(WIDTH).unwrap();
        let mut active = prepare_active(&project);
        let mut reference = prepare_active(&project);
        assert_eq!(render(&mut active), render(&mut reference));
        let candidate = project
            .prepare_set(48_000.0, 128, "/test/fxslot/slotA/width/amount", 1.7)
            .unwrap();
        assert!(reference.processor.set_parameter(14, 0, 1.7));
        let retired = project.publish(&mut active, candidate).unwrap();
        drop(retired);
        let (actual_left, actual_right) = render(&mut active);
        let (expected_left, expected_right) = render(&mut reference);
        assert!(
            actual_left
                .iter()
                .zip(expected_left)
                .all(|(a, b)| (a - b).abs() < 1e-6)
        );
        assert!(
            actual_right
                .iter()
                .zip(expected_right)
                .all(|(a, b)| (a - b).abs() < 1e-6)
        );
    }

    #[test]
    fn editor_free_events_publish_the_same_graph_as_javascript_and_resume_after_save() {
        let mut project = FxSlotSwap::new().unwrap();
        let gain: Value = serde_json::from_slice(GAIN).unwrap();
        let width: Value = serde_json::from_slice(WIDTH).unwrap();
        assert_eq!(project.to_project().unwrap(), gain);
        let mut active = prepare_active(&project);
        let before = render(&mut active);
        assert_eq!(
            project
                .prepare_set(48_000.0, 128, "/test/fxslot/unknown", 1.0)
                .err(),
            Some(AuthorError::InvalidControl)
        );
        assert_eq!(project.to_project().unwrap(), gain);

        let amount = project
            .prepare_set(48_000.0, 128, "/test/fxslot/slotA/width/amount", 1.9)
            .unwrap();
        let retired = project.publish(&mut active, amount).unwrap();
        drop(retired);
        assert_eq!(
            project.to_project().unwrap()["signal"]["nodes"],
            gain["signal"]["nodes"]
        );
        let selected = project
            .prepare_set(48_000.0, 128, "/test/fxslot/slotA/select", 1.0)
            .unwrap();
        assert_eq!(selected.to_project().unwrap(), width);
        assert_eq!(render(&mut active), before);
        let retired = project.publish(&mut active, selected).unwrap();
        drop(retired);
        assert_eq!(project.revision(), 2);
        let after = render(&mut active);
        assert!(
            after
                .0
                .iter()
                .zip(before.0)
                .any(|(a, b)| (a - b).abs() > 0.03)
        );

        let saved = active.save_state().unwrap();
        let mut reopened = FxSlotSwap::from_project_json(&saved).unwrap();
        let saved_document: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(
            reopened.to_project().unwrap()["controls"],
            saved_document["controls"]
        );
        let mut reopened_active = prepare_active(&reopened);
        let select_gain = reopened
            .prepare_set(48_000.0, 128, "/test/fxslot/slotA/select", 0.0)
            .unwrap();
        let retired = reopened.publish(&mut reopened_active, select_gain).unwrap();
        drop(retired);
        let transitioning = render(&mut reopened_active);
        assert_ne!(transitioning.0, before.0);
        let mut restored = transitioning;
        for _ in 0..4 {
            restored = render(&mut reopened_active);
        }
        assert!(
            restored
                .0
                .iter()
                .zip(before.0)
                .all(|(a, b)| (a - b).abs() < 1e-5)
        );
        let document = reopened.to_project().unwrap();
        let controls = document["controls"].as_array().unwrap();
        assert_eq!(
            controls
                .iter()
                .find(|control| control["path"] == "/test/fxslot/slotA/width/amount")
                .unwrap()["value"],
            1.9
        );

        let select_second_slot = reopened
            .prepare_set(48_000.0, 128, "/test/fxslot/slotB/select", 1.0)
            .unwrap();
        let retired = reopened
            .publish(&mut reopened_active, select_second_slot)
            .unwrap();
        drop(retired);
        let both_slots = reopened.to_project().unwrap();
        assert!(
            both_slots["signal"]["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|node| node["id"] == 16 && node["type"] == "stereo-widener")
        );
        assert_eq!(
            both_slots["controls"]
                .as_array()
                .unwrap()
                .iter()
                .find(|control| control["path"] == "/test/fxslot/slotA/select")
                .unwrap()["value"],
            0
        );
    }
}
