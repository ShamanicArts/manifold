//! A deliberately bounded native reader for the browser graph project bundle.
//! JSON and PCM decoding happen before the processor reaches an audio callback.

use std::collections::{BTreeMap, BTreeSet};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use serde_json::Value;

use crate::{NativeError, NativeProcessor};

const MAX_PROJECT_BYTES: usize = 45 * 1024 * 1024;
const MAX_ASSET_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub enum ProjectError {
    Invalid(&'static str),
    UnsupportedNode(String),
    UnsupportedFeature(&'static str),
    Prepare(NativeError),
}

#[derive(Debug)]
struct Parameter {
    node: u32,
    id: u32,
    value: f32,
}

#[derive(Debug)]
struct Asset {
    node: u32,
    rate: f32,
    stereo: Vec<f32>,
}

/// A parsed v1 project. Currently supported node kinds are the live sampler
/// graph slice; other kinds and partial/temporal assets fail explicitly.
pub struct NativeProject {
    graph: GraphDescription,
    parameters: Vec<Parameter>,
    assets: Vec<Asset>,
}

fn object<'a>(
    value: &'a Value,
    keys: &[&str],
    optional: &[&str],
) -> Result<&'a serde_json::Map<String, Value>, ProjectError> {
    let map = value.as_object().ok_or(ProjectError::Invalid("object"))?;
    if map
        .keys()
        .any(|key| !keys.contains(&key.as_str()) && !optional.contains(&key.as_str()))
        || keys.iter().any(|key| !map.contains_key(*key))
    {
        return Err(ProjectError::Invalid("keys"));
    }
    Ok(map)
}

fn uint(value: &Value, maximum: u64) -> Result<u32, ProjectError> {
    let value = value.as_u64().ok_or(ProjectError::Invalid("integer"))?;
    if value > maximum {
        return Err(ProjectError::Invalid("integer range"));
    }
    Ok(value as u32)
}

fn float(value: &Value, min: f32, max: f32) -> Result<f32, ProjectError> {
    let value = value.as_f64().ok_or(ProjectError::Invalid("number"))?;
    if !value.is_finite()
        || value < min as f64
        || value > max as f64
        || value.abs() > f32::MAX as f64
    {
        return Err(ProjectError::Invalid("number range"));
    }
    Ok(value as f32)
}

fn required<'a>(map: &'a serde_json::Map<String, Value>, key: &str) -> &'a Value {
    // Callers first checked required keys with `object`.
    &map[key]
}

fn parameter_range(kind: &str, id: u32) -> Option<(f32, f32, bool)> {
    let spec = match kind {
        "gain" => &[(0., 2., false)][..],
        "loop-capture" => &[
            (0., 1., true),
            (0., 1., true),
            (0., 1., true),
            (0.25, 2., false),
            (0., 1., true),
            (0., 1., false),
            (0., 1., false),
        ],
        "sample-instrument" => &[
            (36., 84., false),
            (0., 1., false),
            (0., 0.5, false),
            (0.25, 2., false),
            (0., 1., true),
            (0., 1., true),
            (0., 1., false),
            (0., 1., false),
            (0., 1., false),
            (0., 0.5, false),
            (0., 0.2, false),
            (1., 4., false),
            (0., 100., false),
            (0., 1., false),
        ],
        _ => &[],
    };
    spec.get(id as usize).copied()
}

impl NativeProject {
    pub fn parse(json: &[u8]) -> Result<Self, ProjectError> {
        if json.len() > MAX_PROJECT_BYTES {
            return Err(ProjectError::Invalid("project size"));
        }
        let root: Value =
            serde_json::from_slice(json).map_err(|_| ProjectError::Invalid("JSON"))?;
        let doc = object(
            &root,
            &["format", "schemaVersion", "projectId", "signal"],
            &["assets", "targets", "temporal"],
        )?;
        if required(doc, "format") != "manifold.project"
            || required(doc, "schemaVersion") != 1
            || required(doc, "projectId") != "manifold.graph-workspace"
        {
            return Err(ProjectError::Invalid("project version"));
        }
        for key in ["targets", "temporal"] {
            if let Some(entries) = doc.get(key) {
                if !entries.as_array().is_some_and(Vec::is_empty) {
                    return Err(ProjectError::UnsupportedFeature(key));
                }
            }
        }
        let signal = object(
            required(doc, "signal"),
            &[
                "inputs",
                "outputs",
                "nodes",
                "connections",
                "initialParameters",
            ],
            &["inputSource", "sidechainSource"],
        )?;
        if required(signal, "inputs") != 2 || required(signal, "outputs") != 2 {
            return Err(ProjectError::Invalid("bus count"));
        }
        if signal
            .get("inputSource")
            .is_some_and(|v| v != "external" && v != "none")
            || signal
                .get("sidechainSource")
                .is_some_and(|v| v != "none" && v != "oscillator" && v != "microphone")
        {
            return Err(ProjectError::Invalid("source recipe"));
        }
        let nodes = required(signal, "nodes")
            .as_array()
            .ok_or(ProjectError::Invalid("nodes"))?;
        if !(2..=64).contains(&nodes.len()) {
            return Err(ProjectError::Invalid("node count"));
        }
        let mut graph = GraphDescription {
            nodes: Vec::with_capacity(nodes.len()),
            connections: Vec::new(),
        };
        let mut kinds = BTreeMap::new();
        for node in nodes {
            let entry = object(node, &["id", "type"], &["a", "b"])?;
            let id = uint(required(entry, "id"), 65_535)?;
            if id == 0 || kinds.contains_key(&id) {
                return Err(ProjectError::Invalid("node id"));
            }
            let kind = required(entry, "type")
                .as_str()
                .ok_or(ProjectError::Invalid("node type"))?;
            let constructed = match kind {
                "input.raw" | "input.sidechain" | "output" | "midi-input" | "sample-instrument" => {
                    if entry.len() != 2 {
                        return Err(ProjectError::Invalid("node arguments"));
                    }
                    match kind {
                        "input.raw" => NodeKind::InputRaw,
                        "input.sidechain" => NodeKind::InputSidechain,
                        "output" => NodeKind::Output,
                        "midi-input" => NodeKind::MidiInput,
                        _ => NodeKind::SampleInstrument,
                    }
                }
                "gain" | "loop-capture" | "sum2" => {
                    let a = float(
                        entry
                            .get("a")
                            .ok_or(ProjectError::Invalid("node arguments"))?,
                        -f32::MAX,
                        f32::MAX,
                    )?;
                    if kind == "gain" {
                        if entry.len() != 3 || a != 0.7 {
                            return Err(ProjectError::Invalid("gain arguments"));
                        }
                        NodeKind::Gain { gain: a }
                    } else {
                        let b = float(
                            entry
                                .get("b")
                                .ok_or(ProjectError::Invalid("node arguments"))?,
                            -f32::MAX,
                            f32::MAX,
                        )?;
                        if entry.len() != 4 {
                            return Err(ProjectError::Invalid("node arguments"));
                        }
                        if kind == "loop-capture" {
                            if a != 2.0 || b != 1.0 {
                                return Err(ProjectError::Invalid("capture arguments"));
                            }
                            NodeKind::LoopCapture {
                                capacity_seconds: a,
                                mix: b,
                            }
                        } else {
                            if a != 1.0 || b != 1.0 {
                                return Err(ProjectError::Invalid("sum arguments"));
                            }
                            NodeKind::Sum2 {
                                gain_a: a,
                                gain_b: b,
                            }
                        }
                    }
                }
                other => return Err(ProjectError::UnsupportedNode(other.to_owned())),
            };
            if (id == 1) != (kind == "input.raw") || (id == 3) != (kind == "output") {
                return Err(ProjectError::Invalid("fixed node id"));
            }
            kinds.insert(id, kind.to_owned());
            graph.nodes.push(NodeSpec {
                id: id.into(),
                kind: constructed,
            });
        }
        if kinds.get(&1).map(String::as_str) != Some("input.raw")
            || kinds.get(&3).map(String::as_str) != Some("output")
            || kinds
                .values()
                .filter(|v| v.as_str() == "midi-input")
                .count()
                > 1
        {
            return Err(ProjectError::Invalid("required nodes"));
        }
        let edges = required(signal, "connections")
            .as_array()
            .ok_or(ProjectError::Invalid("connections"))?;
        if edges.len() > 256 {
            return Err(ProjectError::Invalid("connection count"));
        }
        for edge in edges {
            let edge = object(edge, &["from", "to", "inputPort"], &[])?;
            graph.connections.push(Connection {
                from: uint(required(edge, "from"), 65_535)?.into(),
                to: uint(required(edge, "to"), 65_535)?.into(),
                input_port: uint(required(edge, "inputPort"), 31)? as usize,
            });
        }
        let parameters = required(signal, "initialParameters")
            .as_array()
            .ok_or(ProjectError::Invalid("parameters"))?;
        if parameters.len() > 22 * nodes.len() {
            return Err(ProjectError::Invalid("parameter count"));
        }
        let mut parsed_parameters = Vec::with_capacity(parameters.len());
        let mut seen = BTreeSet::new();
        for parameter in parameters {
            let entry = object(parameter, &["nodeId", "id", "value"], &[])?;
            let node = uint(required(entry, "nodeId"), 65_535)?;
            let id = uint(required(entry, "id"), 255)?;
            let kind = kinds
                .get(&node)
                .ok_or(ProjectError::Invalid("parameter node"))?;
            let (min, max, discrete) =
                parameter_range(kind, id).ok_or(ProjectError::Invalid("parameter id"))?;
            let value = float(required(entry, "value"), min, max)?;
            if discrete && value.fract() != 0.0 || !seen.insert((node, id)) {
                return Err(ProjectError::Invalid("parameter value"));
            }
            parsed_parameters.push(Parameter { node, id, value });
        }
        for (&node, kind) in &kinds {
            let count = match kind.as_str() {
                "gain" => 1,
                "loop-capture" => 7,
                "sample-instrument" => 14,
                _ => 0,
            };
            if (0..count).any(|id| !seen.contains(&(node, id))) {
                return Err(ProjectError::Invalid("missing parameter"));
            }
        }
        // Initial gain is authored into the graph so its first sample does not ramp from 0.7.
        for parameter in &parsed_parameters {
            if kinds.get(&parameter.node).map(String::as_str) == Some("gain") {
                if let Some(NodeSpec {
                    kind: NodeKind::Gain { gain },
                    ..
                }) = graph
                    .nodes
                    .iter_mut()
                    .find(|n| n.id == u64::from(parameter.node))
                {
                    *gain = parameter.value;
                }
            }
        }
        let encoded_assets: &[Value] = match doc.get("assets") {
            None => &[],
            Some(Value::Array(values)) => values,
            Some(_) => return Err(ProjectError::Invalid("assets")),
        };
        if encoded_assets.len() > 4 {
            return Err(ProjectError::Invalid("asset count"));
        }
        let mut assets = Vec::with_capacity(encoded_assets.len());
        let mut asset_nodes = BTreeSet::new();
        let mut total_bytes = 0;
        for asset in encoded_assets {
            let entry = object(
                asset,
                &["nodeId", "sourceRate", "frames", "label", "pcmF32Base64"],
                &[],
            )?;
            let node = uint(required(entry, "nodeId"), 65_535)?;
            if kinds.get(&node).map(String::as_str) != Some("sample-instrument")
                || !asset_nodes.insert(node)
            {
                return Err(ProjectError::Invalid("asset node"));
            }
            let rate = uint(required(entry, "sourceRate"), 384_000)?;
            let frames = uint(required(entry, "frames"), 1_440_000)? as usize;
            let label = required(entry, "label")
                .as_str()
                .ok_or(ProjectError::Invalid("asset label"))?;
            if rate < 8_000
                || frames == 0
                || frames > (rate as usize * 30).min(1_440_000)
                || label.len() > 200
            {
                return Err(ProjectError::Invalid("asset bounds"));
            }
            let pcm = required(entry, "pcmF32Base64")
                .as_str()
                .ok_or(ProjectError::Invalid("PCM encoding"))?;
            let byte_count = frames * 8;
            total_bytes += byte_count;
            if total_bytes > MAX_ASSET_BYTES || pcm.len() != 4 * byte_count.div_ceil(3) {
                return Err(ProjectError::Invalid("PCM size"));
            }
            let bytes = STANDARD
                .decode(pcm)
                .map_err(|_| ProjectError::Invalid("PCM encoding"))?;
            if bytes.len() != byte_count {
                return Err(ProjectError::Invalid("PCM size"));
            }
            let mut stereo = Vec::with_capacity(frames * 2);
            for chunk in bytes.chunks_exact(4) {
                let sample = f32::from_le_bytes(chunk.try_into().expect("four bytes"));
                if !sample.is_finite() {
                    return Err(ProjectError::Invalid("PCM sample"));
                }
                stereo.push(sample);
            }
            assets.push(Asset {
                node,
                rate: rate as f32,
                stereo,
            });
        }
        Ok(Self {
            graph,
            parameters: parsed_parameters,
            assets,
        })
    }

    /// Compile and install state on a control thread, before publishing the processor.
    pub fn prepare(
        self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<NativeProcessor, ProjectError> {
        let mut processor = NativeProcessor::prepare(&self.graph, sample_rate, max_frames)
            .map_err(ProjectError::Prepare)?;
        for parameter in self.parameters {
            if !processor.set_parameter(parameter.node.into(), parameter.id, parameter.value) {
                return Err(ProjectError::Invalid("unavailable parameter"));
            }
        }
        for asset in self.assets {
            if !processor.load_sample_stereo(asset.node.into(), asset.stereo, asset.rate) {
                return Err(ProjectError::Invalid("unavailable sample slot"));
            }
        }
        Ok(processor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AudioBlock;
    use manifold_core::events::{EventKind, TimedEvent};
    use serde_json::json;

    fn fixture() -> Value {
        serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/sidechain-sampler.json"
        ))
        .unwrap()
    }

    fn parse(value: &Value) -> Result<NativeProject, ProjectError> {
        NativeProject::parse(&serde_json::to_vec(value).unwrap())
    }

    #[test]
    fn browser_sidechain_template_restores_its_main_level() {
        let mut processor = parse(&fixture()).unwrap().prepare(48_000.0, 128).unwrap();
        let main = [0.8; 128];
        let side = [-0.6; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        processor
            .process(AudioBlock {
                main: Some([&main, &main]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(left.iter().all(|v| (*v - 0.2).abs() < 0.0001));
        assert_eq!(left, right);
        processor
            .process(AudioBlock {
                main: Some([&main, &main]),
                sidechain: Some([&side, &side]),
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(left.iter().any(|v| (*v - 0.2).abs() > 0.1));
    }

    #[test]
    fn browser_live_sampler_template_is_accepted() {
        let json = include_bytes!("../../../projects/graph-workspace/live-sampler.json");
        NativeProject::parse(json)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
    }

    #[test]
    fn browser_pcm_asset_restores_and_plays_through_midi() {
        let mut bundle = fixture();
        let pcm: Vec<f32> = (0..4800)
            .flat_map(|i| {
                let sample = (i as f32 * std::f32::consts::TAU * 440.0 / 48_000.0).sin() * 0.8;
                [sample, sample]
            })
            .collect();
        let bytes: Vec<u8> = pcm.iter().flat_map(|v| v.to_le_bytes()).collect();
        bundle["assets"] = json!([{ "nodeId": 5, "sourceRate": 48000, "frames": 4800,
            "label": "native restore test", "pcmF32Base64": STANDARD.encode(bytes) }]);
        let mut processor = parse(&bundle).unwrap().prepare(48_000.0, 128).unwrap();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let note = TimedEvent {
            offset: 24,
            node: 4,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        };
        processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[note],
            })
            .unwrap();
        assert!(left[..24].iter().all(|v| *v == 0.0));
        assert!(left[30..].iter().any(|v| v.abs() > 0.01));
        assert_eq!(left, right);
    }

    #[test]
    fn malformed_or_unrestorable_state_is_rejected() {
        let mut bundle = fixture();
        bundle["schemaVersion"] = json!(2);
        assert!(matches!(
            parse(&bundle),
            Err(ProjectError::Invalid("project version"))
        ));
        let mut bundle = fixture();
        bundle["targets"] = json!([{}]);
        assert!(matches!(
            parse(&bundle),
            Err(ProjectError::UnsupportedFeature("targets"))
        ));
        let mut bundle = fixture();
        bundle["signal"]["nodes"][3]["type"] = json!("main-voice-bank");
        assert!(matches!(
            parse(&bundle),
            Err(ProjectError::UnsupportedNode(_))
        ));
        let mut bundle = fixture();
        bundle["signal"]["initialParameters"][0]["value"] = json!(999);
        assert!(matches!(
            parse(&bundle),
            Err(ProjectError::Invalid("number range"))
        ));
        let mut bundle = fixture();
        bundle["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
            .pop();
        assert!(matches!(
            parse(&bundle),
            Err(ProjectError::Invalid("missing parameter"))
        ));
        let mut bundle = fixture();
        bundle["assets"] = json!([{ "nodeId": 5, "sourceRate": 48000, "frames": 1,
            "label": "bad", "pcmF32Base64": STANDARD.encode([0xff; 8]) }]);
        assert!(matches!(
            parse(&bundle),
            Err(ProjectError::Invalid("PCM sample"))
        ));
    }
}
