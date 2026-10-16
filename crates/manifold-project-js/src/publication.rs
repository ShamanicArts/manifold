//! Control-side verification of accepted script state, shared by native hosts.
use crate::{HostCommandKind, worker::WorkerError};
use manifold_native::project::NativeProject;
use serde_json::{Value, json};

fn parse(bytes: &[u8]) -> Result<Value, WorkerError> {
    serde_json::from_slice(bytes).map_err(|_| WorkerError::StateMismatch)
}
fn normalize(document: &mut Value) {
    if let Some(edges) = document
        .get_mut("signal")
        .and_then(|signal| signal.get_mut("connections"))
        .and_then(Value::as_array_mut)
    {
        for edge in edges {
            if edge.get("outputPort").is_none() {
                edge["outputPort"] = 0.into();
            }
        }
    }
    if let Some(parameters) = document
        .get_mut("signal")
        .and_then(|signal| signal.get_mut("initialParameters"))
        .and_then(Value::as_array_mut)
    {
        parameters.sort_by_key(|p| (p["nodeId"].as_u64(), p["id"].as_u64()));
    }
}
fn equal(mut left: Value, mut right: Value) -> bool {
    normalize(&mut left);
    normalize(&mut right);
    crate::worker::same_project(
        &serde_json::to_vec(&left).unwrap(),
        &serde_json::to_vec(&right).unwrap(),
    )
}

/// Control memory and bounded event bookkeeping may advance without a DSP
/// command (e.g. an inactive effect amount or pedal state). Require the same
/// topology, targets, descriptors, source, view and schema; only control values
/// and schema-compatible eventState may change. This runs on control only.
pub(crate) fn accepted_bookkeeping(current: &[u8], snapshot: &[u8]) -> Result<Vec<u8>, WorkerError> {
    let mut expected = parse(current)?;
    let project = parse(snapshot)?;
    if expected["liveAuthoring"]["format"] != "manifold.live-project" {
        return Err(WorkerError::StateMismatch);
    }
    // Host networking settings contain no DSP state. They can advance without
    // audio publication while source, descriptors and graph remain identical.
    if expected["liveAuthoring"]["network"].is_object()
        && project["liveAuthoring"]["network"].is_object()
        && project["liveAuthoring"]["network"].to_string().len() <= 4096 {
        expected["liveAuthoring"]["network"] = project["liveAuthoring"]["network"].clone();
    }
    // Project scripts and visual assets are authoring resources. A file edit
    // changes neither the sounding graph nor its published parameter targets.
    // NativeProject::parse below validates their bounded portable encoding.
    if project["liveAuthoring"]["files"].is_array() {
        expected["liveAuthoring"]["files"] = project["liveAuthoring"]["files"].clone();
    }
    if expected["liveAuthoring"]["eventStateSchema"].as_str().is_some() {
        expected["liveAuthoring"]["eventState"] = project["liveAuthoring"]["eventState"].clone();
    }
    if let (Some(old), Some(new)) = (expected.get_mut("controls").and_then(Value::as_array_mut), project["controls"].as_array()) {
        for entry in old {
            if let Some(next) = new.iter().find(|next| next["path"] == entry["path"]) {
                entry["value"] = next["value"].clone();
            }
        }
    }
    if !equal(expected, project) { return Err(WorkerError::StateMismatch); }
    NativeProject::parse(snapshot).map_err(|_| WorkerError::StateMismatch)?;
    Ok(snapshot.to_vec())
}

pub(crate) fn accepted_project(
    current: &[u8],
    command: &HostCommandKind,
    snapshot: &[u8],
) -> Result<Vec<u8>, WorkerError> {
    let mut expected = match command {
        HostCommandKind::ReplaceGraph { document } | HostCommandKind::Metadata { document } => parse(document)?,
        _ => parse(current)?,
    };
    let set = |document: &mut Value, node: u32, id: u32, value: f64| -> Result<(), WorkerError> {
        let entries = document["signal"]["initialParameters"]
            .as_array_mut()
            .ok_or(WorkerError::StateMismatch)?;
        if let Some(entry) = entries
            .iter_mut()
            .find(|entry| entry["nodeId"] == node && entry["id"] == id)
        {
            entry["value"] = value.into();
        } else {
            entries.push(json!({"nodeId":node,"id":id,"value":value}));
        }
        Ok(())
    };
    match command {
        HostCommandKind::Parameter { node, id, value } => set(&mut expected, *node, *id, *value)?,
        HostCommandKind::ParameterBatch { edits } => {
            for &(node, id, value) in edits {
                set(&mut expected, node, id, value)?;
            }
        }
        HostCommandKind::Route {
            to,
            input_port,
            from,
            output_port,
        } => {
            let edges = expected["signal"]["connections"]
                .as_array_mut()
                .ok_or(WorkerError::StateMismatch)?;
            edges.retain(|edge| !(edge["to"] == *to && edge["inputPort"] == *input_port));
            if *from != 0 {
                edges.push(
                    json!({"from":from,"to":to,"inputPort":input_port,"outputPort":output_port}),
                );
            }
        }
        _ => {}
    }
    let project = parse(snapshot)?;
    if let (Some(previous), Some(current)) = (
        expected.get_mut("controls").and_then(Value::as_array_mut),
        project["controls"].as_array(),
    ) {
        if previous.len() == current.len() {
            for entry in previous {
                if let Some(next) = current.iter().find(|next| next["path"] == entry["path"]) {
                    entry["value"] = next["value"].clone();
                }
            }
        }
    }
    if !equal(expected, project) {
        return Err(WorkerError::StateMismatch);
    }
    NativeProject::parse(snapshot).map_err(|_| WorkerError::StateMismatch)?;
    Ok(snapshot.to_vec())
}

/// Preserve audio-owned PCM and target readback while copying verified author
/// control values into the same published topology. Runs only on control.
pub fn merge_published_controls(published: &[u8], authored: &[u8]) -> Result<Vec<u8>, WorkerError> {
    let mut host = parse(published)?;
    let script = parse(authored)?;
    for key in ["nodes", "connections"] {
        let left = json!({"signal":{key:host["signal"][key].clone()}});
        let right = json!({"signal":{key:script["signal"][key].clone()}});
        if !equal(left, right) {
            return Err(WorkerError::StateMismatch);
        }
    }
    if host["instances"] != script["instances"] {
        return Err(WorkerError::StateMismatch);
    }
    let mut previous = host["controls"].clone();
    let current = script["controls"].clone();
    if let (Some(old), Some(new)) = (previous.as_array_mut(), current.as_array()) {
        for entry in old {
            if let Some(next) = new.iter().find(|next| next["path"] == entry["path"]) {
                entry["value"] = next["value"].clone();
            }
        }
    }
    if previous != current {
        return Err(WorkerError::StateMismatch);
    }
    if !current.is_null() {
        host["controls"] = current;
    }
    serde_json::to_vec(&host).map_err(|_| WorkerError::StateMismatch)
}

/// Accept a presentation/source edit only when the sounding graph and all
/// non-authoring state match the published host. Keep live DSP targets, audio
/// assets and control values from the host's current snapshot.
pub fn merge_published_metadata(published: &[u8], authored: &[u8]) -> Result<Vec<u8>, WorkerError> {
    let mut host = parse(published)?;
    let mut proposed = parse(authored)?;
    if proposed["liveAuthoring"]["format"] != "manifold.live-project" {
        return Err(WorkerError::StateMismatch);
    }
    proposed["signal"]["initialParameters"] = host["signal"]["initialParameters"].clone();
    for key in ["controls", "assets"] {
        if let Some(value) = host.get(key) {
            proposed[key] = value.clone();
        } else {
            proposed.as_object_mut().unwrap().remove(key);
        }
    }
    let metadata = proposed["liveAuthoring"].clone();
    proposed["liveAuthoring"] = host["liveAuthoring"].clone();
    if !equal(proposed, host.clone()) {
        return Err(WorkerError::StateMismatch);
    }
    host["liveAuthoring"] = metadata;
    let bytes = serde_json::to_vec(&host).map_err(|_| WorkerError::StateMismatch)?;
    NativeProject::parse(&bytes).map_err(|_| WorkerError::StateMismatch)?;
    Ok(bytes)
}

/// Resolve an accepted creator target to the native host's normalized slot.
/// Editor adapters use this to report gestures through CLAP/VST3 automation.
pub fn creator_parameter_paths(command: &Value) -> Vec<String> {
    match command["operation"].as_str() {
        Some("parameter.set") => command["path"]
            .as_str()
            .map(str::to_owned)
            .into_iter()
            .collect(),
        Some("parameter.batch") => command["edits"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|edit| edit["path"].as_str().map(str::to_owned))
            .collect(),
        _ => Vec::new(),
    }
}

pub fn creator_host_parameter(view: &Value, path: &str) -> Option<(u32, f64)> {
    let endpoint = view["graph"]["endpoints"]
        .as_array()?
        .iter()
        .find(|endpoint| endpoint["path"] == path)?;
    let node = endpoint["nodeId"].as_u64()?;
    let id = endpoint["id"].as_u64()? as u32;
    let value = view["parameters"]
        .as_array()?
        .iter()
        .find(|parameter| parameter["path"] == path)?["value"]
        .as_f64()?;
    let bytes = serde_json::to_vec(&view["graph"]).ok()?;
    let project = NativeProject::parse(&bytes).ok()?;
    let parameter = project
        .host_parameters()
        .iter()
        .find(|parameter| parameter.node == node && parameter.local_id == id)?;
    let slot = project
        .host_bindings()
        .iter()
        .find(|binding| binding.graph_parameter == parameter.id)?
        .slot;
    Some((
        manifold_native::parameters::HOST_SLOT_BASE + slot,
        parameter.to_normalized(value as f32)? as f64,
    ))
}

#[cfg(test)]
mod tests {
    #[test]
    fn metadata_edit_preserves_published_audio_and_rejects_topology_change() {
        let bytes = include_bytes!("../../../projects/standalone-oscillator/live-project.json");
        let original: serde_json::Value = serde_json::from_slice(bytes).unwrap();
        let mut candidate = original.clone();
        candidate["liveAuthoring"]["source"] = format!(
            "{}\n// Edited face",
            original["liveAuthoring"]["source"].as_str().unwrap()
        ).into();
        candidate["signal"]["initialParameters"][0]["value"] = 0.into();
        let mut expected = candidate.clone();
        expected["signal"]["initialParameters"] = original["signal"]["initialParameters"].clone();
        for key in ["controls", "assets"] {
            if let Some(value) = original.get(key) {
                expected[key] = value.clone();
            } else {
                expected.as_object_mut().unwrap().remove(key);
            }
        }
        expected["liveAuthoring"] = original["liveAuthoring"].clone();
        assert!(super::equal(expected, original.clone()));
        let merged = super::merge_published_metadata(bytes, &serde_json::to_vec(&candidate).unwrap()).unwrap();
        let result: serde_json::Value = serde_json::from_slice(&merged).unwrap();
        assert_eq!(result["signal"], original["signal"]);
        assert_eq!(result["liveAuthoring"]["source"], candidate["liveAuthoring"]["source"]);
        candidate["signal"]["nodes"][0]["type"] = "gain".into();
        assert!(super::merge_published_metadata(bytes, &serde_json::to_vec(&candidate).unwrap()).is_err());
    }

    #[test]
    fn bookkeeping_without_publication_cannot_change_audio_source_or_schema() {
        let bytes = include_bytes!("../../../projects/standalone-oscillator/live-project.json");
        let original: serde_json::Value = serde_json::from_slice(bytes).unwrap();
        let mut state = original.clone();
        state["liveAuthoring"]["eventState"]["sustain"] = serde_json::json!({"test:0":true});
        assert!(super::accepted_bookkeeping(bytes, &serde_json::to_vec(&state).unwrap()).is_ok());
        for changed in ["parameter", "source", "schema"] {
            let mut invalid = state.clone();
            match changed {
                "parameter" => invalid["signal"]["initialParameters"][0]["value"] = 0.into(),
                "source" => invalid["liveAuthoring"]["source"] = "changed".into(),
                _ => invalid["liveAuthoring"]["eventStateSchema"] = "changed".into(),
            }
            assert!(super::accepted_bookkeeping(bytes, &serde_json::to_vec(&invalid).unwrap()).is_err(), "{changed}");
        }
    }
}
