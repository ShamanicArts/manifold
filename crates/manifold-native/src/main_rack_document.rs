//! The saved Main rack is validated and compiled on the host control thread.
//! This first session contract accepts the six prepared audio modules only.

use std::collections::BTreeSet;

use manifold_core::main_instrument::MainInstrument;
use serde_json::{Value, json};

use crate::main_session::MainSessionError;
use crate::project::NativeProject;

fn invalid() -> MainSessionError {
    MainSessionError::Invalid("rackDocument")
}

fn name(value: &Value) -> Result<&str, MainSessionError> {
    let text = value.as_str().ok_or_else(invalid)?;
    if text.is_empty()
        || text.len() > 64
        || !text
            .bytes()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == b'_' || ch == b'-')
    {
        return Err(invalid());
    }
    Ok(text)
}

fn endpoint(value: &Value) -> Result<(&str, &str), MainSessionError> {
    Ok((name(&value["moduleId"])?, name(&value["portId"])?))
}

/// Return the post-voice insert's graph connections after checking every
/// saved identity, port, layout cell, and edge against the authored catalog.
fn audio_connections(document: &Value) -> Result<Vec<Value>, MainSessionError> {
    let catalog: Value =
        serde_json::from_str(include_str!("../../../projects/main-looper/rack.json"))
            .map_err(MainSessionError::Json)?;
    if document["schemaVersion"] != 1
        || document["projectId"] != "manifold.main-looper"
        || !matches!(document["viewMode"].as_str(), Some("rack" | "patch"))
    {
        return Err(invalid());
    }
    let modules = document["modules"].as_array().ok_or_else(invalid)?;
    let original = catalog["initial"]["modules"]
        .as_array()
        .ok_or_else(invalid)?;
    if modules.len() != original.len() {
        return Err(invalid());
    }
    let mut identities = BTreeSet::new();
    let mut cells = BTreeSet::new();
    for module in modules {
        let id = name(&module["id"])?;
        let reference = original
            .iter()
            .find(|item| item["id"] == id)
            .ok_or_else(invalid)?;
        if !identities.insert(id)
            || module["type"] != reference["type"]
            || module["nodeId"] != reference["nodeId"]
        {
            return Err(invalid());
        }
        let row = module["row"].as_u64().ok_or_else(invalid)?;
        let col = module["col"].as_u64().ok_or_else(invalid)?;
        let width = module["w"].as_u64().ok_or_else(invalid)?;
        let height = module["h"].as_u64().ok_or_else(invalid)?;
        if ["w", "h"].iter().any(|key| module[*key] != reference[*key]) {
            return Err(invalid());
        }
        let sizes = catalog["catalog"][module["type"].as_str().ok_or_else(invalid)?]["sizes"]
            .as_array()
            .ok_or_else(invalid)?;
        if !sizes
            .iter()
            .any(|size| size[0] == width && size[1] == height)
            || col.checked_add(width).is_none_or(|end| end > 5)
            || row.checked_add(height).is_none_or(|end| end > 32)
        {
            return Err(invalid());
        }
        for y in row..row + height {
            for x in col..col + width {
                if !cells.insert((y, x)) {
                    return Err(invalid());
                }
            }
        }
    }
    let connections = document["connections"].as_array().ok_or_else(invalid)?;
    if connections.len() > 256 {
        return Err(invalid());
    }
    let mut edges = BTreeSet::new();
    let mut ids = BTreeSet::new();
    let mut inputs = BTreeSet::new();
    let mut compiled = Vec::new();
    for connection in connections {
        if !ids.insert(name(&connection["id"])?) {
            return Err(invalid());
        }
        let from = endpoint(&connection["from"])?;
        let to = endpoint(&connection["to"])?;
        if !inputs.insert(to) || !edges.insert((from, to)) {
            return Err(invalid());
        }
        if (from, to) == (("__midiInput", "voice"), ("adsr", "midi"))
            || (from, to) == (("adsr", "voice"), ("oscillator", "voice"))
        {
            continue;
        }
        let source = match from {
            ("oscillator", "out") => 1,
            ("filter", "out") => 6,
            ("fx1", "out") => 7,
            ("fx2", "out") => 8,
            ("eq", "out") => 9,
            _ => return Err(invalid()),
        };
        let target = match to {
            ("filter", "in") => 6,
            ("fx1", "in") => 7,
            ("fx2", "in") => 8,
            ("eq", "in") => 9,
            ("__rackOutput", "main") => 3,
            _ => return Err(invalid()),
        };
        let stage = |id| match id {
            1 => 0,
            6 => 1,
            7 => 2,
            8 => 3,
            9 => 4,
            3 => 5,
            _ => 6,
        };
        if stage(source) >= stage(target) {
            return Err(invalid());
        }
        compiled.push(json!({ "from": source, "to": target, "inputPort": 0 }));
    }
    for required in [
        (("__midiInput", "voice"), ("adsr", "midi")),
        (("adsr", "voice"), ("oscillator", "voice")),
    ] {
        if !edges.contains(&required) {
            return Err(invalid());
        }
    }
    Ok(compiled)
}

pub(crate) fn prepare_audio_insert(
    instrument: &mut MainInstrument,
    document: &Value,
    sample_rate: f32,
    max_frames: usize,
) -> Result<(), MainSessionError> {
    let connections = audio_connections(document)?;
    let mut project: Value = serde_json::from_str(include_str!(
        "../../../projects/main-looper/default-rack-insert.json"
    ))
    .map_err(MainSessionError::Json)?;
    project["signal"]["connections"] = Value::Array(connections);
    let bytes = serde_json::to_vec(&project).map_err(MainSessionError::Json)?;
    let mut plan = NativeProject::parse(&bytes)
        .map_err(|_| invalid())?
        .prepare(sample_rate, max_frames)
        .map_err(|_| invalid())?
        .into_plan();
    instrument.prepare_rack_insert_controls(&mut plan);
    instrument
        .replace_prepared_rack_insert(Some(plan))
        .map_err(|_| invalid())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_core::events::EventKind;

    fn render(document: &Value) -> f32 {
        let mut instrument = MainInstrument::new(48_000.0, 128);
        assert!(instrument.set_synth_parameter(22, 800.0));
        prepare_audio_insert(&mut instrument, document, 48_000.0, 128).unwrap();
        instrument.synth_event(EventKind::NoteOn {
            channel: 0,
            note: 96,
            velocity: 120,
        });
        let dry = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut energy = 0.0;
        for block in 0..120 {
            instrument.process([&dry, &dry], [&mut left, &mut right]);
            if block >= 40 {
                energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
            }
        }
        energy
    }

    #[test]
    fn accepts_authored_audio_bypass_and_rejects_unmapped_ports() {
        let catalog: Value =
            serde_json::from_str(include_str!("../../../projects/main-looper/rack.json")).unwrap();
        let mut document = catalog["initial"].clone();
        document["schemaVersion"] = json!(1);
        document["projectId"] = json!("manifold.main-looper");
        assert_eq!(audio_connections(&document).unwrap().len(), 5);
        let filtered = render(&document);
        let edge = document["connections"]
            .as_array()
            .unwrap()
            .iter()
            .position(|edge| edge["id"] == "filter_to_fx1")
            .unwrap();
        document["connections"][edge]["from"]["moduleId"] = json!("oscillator");
        assert_eq!(audio_connections(&document).unwrap().len(), 5);
        let bypass = render(&document);
        assert!(
            bypass > filtered * 3.0,
            "filtered {filtered}, bypass {bypass}"
        );
        document["connections"][edge]["from"]["portId"] = json!("sub");
        assert!(audio_connections(&document).is_err());
        document["connections"][edge]["from"]["moduleId"] = json!("eq");
        document["connections"][edge]["from"]["portId"] = json!("out");
        assert!(audio_connections(&document).is_err());
    }

    #[test]
    fn browser_exported_cable_session_prepares_and_renders_in_native_main() {
        let bytes = include_bytes!("../../../web/public/main-audio-patch-saved-session.json");
        let mut processor =
            crate::main_session::prepare_main_session(bytes, 48_000.0, 128).unwrap();
        let instrument = processor.instrument_control_mut();
        assert!(instrument.has_rack_insert());
        assert!(instrument.set_synth_parameter(22, 800.0));
        instrument.synth_event(EventKind::NoteOn {
            channel: 0,
            note: 96,
            velocity: 120,
        });
        let dry = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut energy = 0.0;
        for block in 0..120 {
            instrument.process([&dry, &dry], [&mut left, &mut right]);
            if block >= 40 {
                energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
            }
        }
        assert!(energy > 100.0, "browser bypass session energy {energy}");
    }

    #[test]
    fn moved_main_shells_keep_the_saved_audio_route() {
        let catalog: Value =
            serde_json::from_str(include_str!("../../../projects/main-looper/rack.json")).unwrap();
        let mut document = catalog["initial"].clone();
        document["schemaVersion"] = json!(1);
        document["projectId"] = json!("manifold.main-looper");
        let baseline = audio_connections(&document).unwrap();
        document["modules"][1]["col"] = json!(3);
        document["modules"][2]["col"] = json!(1);
        assert_eq!(audio_connections(&document).unwrap(), baseline);
        document["modules"][2]["col"] = json!(2);
        assert!(audio_connections(&document).is_err());
        document["modules"][2]["col"] = json!(u64::MAX);
        assert!(audio_connections(&document).is_err());
    }

    #[test]
    fn browser_exported_layout_prepares_and_survives_native_save_template() {
        let bytes = include_bytes!("../../../web/public/main-rack-layout-saved-session.json");
        let browser: Value = serde_json::from_slice(bytes).unwrap();
        let mut prepared = crate::main_session::prepare_main_session(bytes, 48_000.0, 128).unwrap();
        assert!(prepared.instrument_control_mut().has_rack_insert());
        let native = crate::main_session_export::save_template(bytes).unwrap();
        assert_eq!(native["rackDocument"], browser["rackDocument"]);
        assert_eq!(native["rackDocument"]["modules"][1]["col"], 3);
    }
}
