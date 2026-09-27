//! A deliberately bounded native reader for the browser graph project bundle.
//! JSON and PCM decoding happen before the processor reaches an audio callback.

use std::collections::{BTreeMap, BTreeSet};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use manifold_core::main_voice_bank::MainTemporalRecipe;
use manifold_core::sine_bank::{Partial, PartialSet};
use manifold_core::spectral_targets::{AddFlavor, MorphRecipe, SpectralShape};
use manifold_core::temporal_partials::analyze_temporal_stereo;
use serde_json::Value;

use crate::parameters::{HOST_SLOT_COUNT, HostBinding, HostParameter};
use crate::{DEFAULT_TYPE_PARAMETERS, NativeError, NativeProcessor};

const MAX_PROJECT_BYTES: usize = 45 * 1024 * 1024;
const MAX_ASSET_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub enum ProjectError {
    Invalid(&'static str),
    UnsupportedNode(String),
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

struct Target {
    node: u32,
    index: u32,
    partials: PartialSet,
}

struct TemporalRecipe {
    node: u32,
    speed: f32,
    smooth: f32,
    contrast: f32,
    recipe: [f32; 11],
}

/// A parsed v1 graph project; unsupported nodes fail explicitly.
pub struct NativeProject {
    document: Value,
    graph: GraphDescription,
    parameters: Vec<Parameter>,
    host_parameters: Vec<HostParameter>,
    host_bindings: Vec<HostBinding>,
    assets: Vec<Asset>,
    targets: Vec<Target>,
    temporal: Vec<TemporalRecipe>,
    fx_type_parameters: Option<[[f32; 5]; 21]>,
}

/// Keep the portable project beside its prepared processor for host state saves.
/// Saving is a control-thread operation after the host has synchronized processing.
pub struct PreparedNativeProject {
    pub processor: NativeProcessor,
    document: Value,
}

impl PreparedNativeProject {
    pub fn save_state(&mut self) -> Result<Vec<u8>, ProjectError> {
        let parameters = self.document["signal"]["initialParameters"]
            .as_array_mut()
            .ok_or(ProjectError::Invalid("parameters"))?;
        for entry in parameters {
            let node = entry["nodeId"]
                .as_u64()
                .ok_or(ProjectError::Invalid("parameter node"))?;
            let id = entry["id"]
                .as_u64()
                .ok_or(ProjectError::Invalid("parameter id"))?;
            let index = self
                .processor
                .host_parameters()
                .iter()
                .position(|parameter| parameter.node == node && u64::from(parameter.local_id) == id)
                .ok_or(ProjectError::Invalid("parameter id"))?;
            entry["value"] = Value::from(self.processor.current_parameter_values()[index]);
        }
        if self.document["id"] == "manifold.standalone-fx-module" {
            let mut table = serde_json::Map::new();
            for effect_type in 0..21 {
                let values = self
                    .processor
                    .effect_slot_params(2_u32.into(), effect_type)
                    .ok_or(ProjectError::Invalid("FX type controls"))?;
                table.insert(effect_type.to_string(), serde_json::json!(values));
            }
            self.document["typeParameters"] = Value::Object(table);
        }
        let bytes =
            serde_json::to_vec(&self.document).map_err(|_| ProjectError::Invalid("JSON"))?;
        if bytes.len() > MAX_PROJECT_BYTES {
            return Err(ProjectError::Invalid("project size"));
        }
        Ok(bytes)
    }

    /// Build a complete replacement on the control thread. The current instance
    /// remains usable if decoding, validation, analysis, or preparation fails.
    pub fn prepare_sample_replacement(
        &mut self,
        node: u32,
        stereo: &[f32],
        source_rate: u32,
        label: &str,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<Self, ProjectError> {
        let frames = stereo.len() / 2;
        if stereo.len() % 2 != 0
            || !(8_000..=384_000).contains(&source_rate)
            || frames == 0
            || frames > (source_rate as usize * 30).min(1_440_000)
            || label.len() > 200
            || !stereo.iter().all(|sample| sample.is_finite())
        {
            return Err(ProjectError::Invalid("replacement sample"));
        }
        self.save_state()?;
        let mut candidate = self.document.clone();
        let assets = candidate
            .as_object_mut()
            .ok_or(ProjectError::Invalid("project"))?
            .entry("assets")
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut()
            .ok_or(ProjectError::Invalid("assets"))?;
        let mut pcm = Vec::with_capacity(stereo.len() * 4);
        for sample in stereo {
            pcm.extend_from_slice(&sample.to_le_bytes());
        }
        let asset = serde_json::json!({
            "nodeId": node, "sourceRate": source_rate, "frames": frames,
            "label": label, "pcmF32Base64": STANDARD.encode(pcm),
        });
        if let Some(existing) = assets.iter_mut().find(|entry| entry["nodeId"] == node) {
            *existing = asset;
        } else {
            assets.push(asset);
        }
        let bytes = serde_json::to_vec(&candidate).map_err(|_| ProjectError::Invalid("JSON"))?;
        NativeProject::parse(&bytes)?.prepare_with_state(sample_rate, max_frames)
    }

    /// Build a replacement Main partial target without mutating the live graph.
    pub fn prepare_target_replacement(
        &mut self,
        node: u32,
        target: u32,
        partials: &PartialSet,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<Self, ProjectError> {
        if target > 1
            || !(1..=32).contains(&partials.count)
            || partials.fundamental > 24_000.0
            || !partials.validate()
        {
            return Err(ProjectError::Invalid("replacement target"));
        }
        self.save_state()?;
        let mut candidate = self.document.clone();
        let targets = candidate["targets"]
            .as_array_mut()
            .ok_or(ProjectError::Invalid("partial targets"))?;
        let existing = targets
            .iter_mut()
            .find(|entry| entry["nodeId"] == node && entry["target"] == target)
            .ok_or(ProjectError::Invalid("partial target node"))?;
        let mut values = Vec::with_capacity(partials.count * 4);
        for partial in &partials.partials[..partials.count] {
            values.extend_from_slice(&[
                partial.frequency,
                partial.amplitude,
                partial.phase,
                partial.decay_rate,
            ]);
        }
        *existing = serde_json::json!({
            "nodeId": node, "target": target,
            "fundamental": partials.fundamental, "values": values,
        });
        let bytes = serde_json::to_vec(&candidate).map_err(|_| ProjectError::Invalid("JSON"))?;
        NativeProject::parse(&bytes)?.prepare_with_state(sample_rate, max_frames)
    }

    /// Build a replacement Main temporal recipe and reanalyze its saved source.
    pub fn prepare_temporal_replacement(
        &mut self,
        node: u32,
        mode: u32,
        speed: f32,
        smooth: f32,
        contrast: f32,
        recipe: [f32; 11],
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<Self, ProjectError> {
        if ![speed, smooth, contrast]
            .iter()
            .all(|value| value.is_finite())
            || !recipe.iter().all(|value| value.is_finite())
        {
            return Err(ProjectError::Invalid("replacement temporal recipe"));
        }
        self.save_state()?;
        let mut candidate = self.document.clone();
        let temporal = candidate
            .as_object_mut()
            .ok_or(ProjectError::Invalid("project"))?
            .entry("temporal")
            .or_insert_with(|| Value::Array(Vec::new()))
            .as_array_mut()
            .ok_or(ProjectError::Invalid("temporal recipes"))?;
        let entry = serde_json::json!({
            "nodeId": node, "mode": mode, "speed": speed,
            "smooth": smooth, "contrast": contrast, "recipe": recipe,
        });
        if let Some(existing) = temporal.iter_mut().find(|entry| entry["nodeId"] == node) {
            *existing = entry;
        } else {
            temporal.push(entry);
        }
        let bytes = serde_json::to_vec(&candidate).map_err(|_| ProjectError::Invalid("JSON"))?;
        NativeProject::parse(&bytes)?.prepare_with_state(sample_rate, max_frames)
    }

    /// Publish a fully prepared instance at a host block boundary. The caller
    /// must retire the returned old instance away from the audio callback.
    pub fn publish_replacement(&mut self, next: Self) -> Self {
        std::mem::replace(self, next)
    }
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
        "midi-transpose" => &[(-24., 24., false)],
        "oscillator" => &[(0., 4., true), (20., 16_000., false), (0., 1., false)],
        "noise" => &[(0., 1., false), (0., 1., false)],
        "lfo" => &[(0., 2., true), (0.05, 20., false)],
        "modulated-gain" => &[(0., 2., false), (-2., 2., false)],
        "voice-synth" => &[
            (0., 3., true),
            (0.001, 2., false),
            (0.001, 2., false),
            (0., 1., false),
            (0.001, 3., false),
            (0., 1., false),
        ],
        "svf" => &[(0., 3., true), (20., 20_000., false), (0.1, 1., false)],
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
        "main-voice-bank" => &[
            (0., 4., true),
            (-1., 1., false),
            (36., 84., false),
            (0., 2., true),
            (-24., 24., false),
            (0., 2., true),
            (0., 5., true),
            (0., 1., false),
            (0., 1., false),
            (0., 1., false),
            (0., 1., true),
            (0.001, 0.5, false),
            (0.001, 1., false),
            (0., 1., false),
            (0.001, 2., false),
            (0., 2., false),
            (0.25, 4., false),
            (0., 1., false),
            (0.05, 0.6, false),
            (0., 1., true),
        ],
        "sample-region" => match id {
            0 => return Some((0.25, 2., false)),
            1 | 2 => return Some((0., 1., true)),
            3..=5 => return Some((0., 1., false)),
            8 => return Some((0., 0.5, false)),
            _ => return None,
        },
        "granulator" => &[
            (1., 500., false),
            (1., 100., false),
            (0., 1., false),
            (-24., 24., false),
            (0., 1., false),
            (0., 1., false),
            (0., 1., true),
            (0., 4., true),
            (0., 1., true),
            (0., 1., false),
            (0., 1., false),
        ],
        "effect-slot-legacy" => match id {
            0 => return Some((0., 20., true)),
            1..=6 => return Some((0., 1., false)),
            _ => return None,
        },
        _ => &[],
    };
    spec.get(id as usize).copied()
}

impl NativeProject {
    /// Read the authored Standalone FX project used by the browser module.
    /// Translate its public metadata envelope to the graph-workspace contract
    /// while preserving the original envelope for native state roundtrips.
    pub fn parse_fx_module(json: &[u8]) -> Result<Self, ProjectError> {
        if json.len() > MAX_PROJECT_BYTES {
            return Err(ProjectError::Invalid("project size"));
        }
        let mut authored: Value =
            serde_json::from_slice(json).map_err(|_| ProjectError::Invalid("JSON"))?;
        let root = object(
            &authored,
            &[
                "schemaVersion",
                "id",
                "name",
                "source",
                "signal",
                "parameters",
            ],
            &["typeParameters"],
        )?;
        if required(root, "schemaVersion") != 1
            || required(root, "id") != "manifold.standalone-fx-module"
        {
            return Err(ProjectError::Invalid("FX project version"));
        }
        let fx_type_parameters = if let Some(table) = root.get("typeParameters") {
            let entries = table
                .as_object()
                .filter(|entries| entries.len() == 21)
                .ok_or(ProjectError::Invalid("FX type controls"))?;
            let mut all = [[0.; 5]; 21];
            for (effect_type, values) in all.iter_mut().enumerate() {
                let row = entries
                    .get(&effect_type.to_string())
                    .and_then(Value::as_array)
                    .filter(|row| row.len() == 5)
                    .ok_or(ProjectError::Invalid("FX type controls"))?;
                for (index, value) in row.iter().enumerate() {
                    values[index] = float(value, 0., 1.)?;
                }
            }
            Some(all)
        } else {
            None
        };
        let public = required(root, "parameters")
            .as_array()
            .ok_or(ProjectError::Invalid("FX public parameters"))?;
        if public.len() != 7 {
            return Err(ProjectError::Invalid("FX public parameters"));
        }
        for (index, parameter) in public.iter().enumerate() {
            let entry = parameter
                .as_object()
                .ok_or(ProjectError::Invalid("FX public parameter"))?;
            if entry.get("id") != Some(&Value::from(index as u64))
                || entry.get("nodeId") != Some(&Value::from(2))
                || entry.get("nodeParameterId") != Some(&Value::from(index as u64))
                || entry.get("hostId").and_then(Value::as_str).is_none()
            {
                return Err(ProjectError::Invalid("FX public parameter"));
            }
        }
        let defaults = [public[0]["default"].clone(), public[1]["default"].clone()];
        let signal = authored["signal"]
            .as_object_mut()
            .ok_or(ProjectError::Invalid("FX signal"))?;
        let parameters = signal["initialParameters"]
            .as_array_mut()
            .ok_or(ProjectError::Invalid("FX initial parameters"))?;
        for id in 0..=1 {
            if !parameters
                .iter()
                .any(|entry| entry["nodeId"] == 2 && entry["id"] == id)
            {
                parameters.push(serde_json::json!({
                    "nodeId": 2, "id": id, "value": defaults[id],
                }));
            }
        }
        let envelope = serde_json::json!({
            "format": "manifold.project",
            "schemaVersion": 1,
            "projectId": "manifold.graph-workspace",
            "signal": authored["signal"],
        });
        let encoded = serde_json::to_vec(&envelope).map_err(|_| ProjectError::Invalid("JSON"))?;
        let mut parsed = Self::parse(&encoded)?;
        parsed.document = authored;
        parsed.fx_type_parameters = fx_type_parameters;
        // The authored file lists five controls before type. Host state may
        // reopen on any type, so select it before applying those controls.
        parsed.parameters.sort_by_key(|entry| entry.id);
        Ok(parsed)
    }

    pub fn parse(json: &[u8]) -> Result<Self, ProjectError> {
        if json.len() > MAX_PROJECT_BYTES {
            return Err(ProjectError::Invalid("project size"));
        }
        let root: Value =
            serde_json::from_slice(json).map_err(|_| ProjectError::Invalid("JSON"))?;
        let doc = object(
            &root,
            &["format", "schemaVersion", "projectId", "signal"],
            &["assets", "targets", "temporal", "hostBindings"],
        )?;
        if required(doc, "format") != "manifold.project"
            || required(doc, "schemaVersion") != 1
            || required(doc, "projectId") != "manifold.graph-workspace"
        {
            return Err(ProjectError::Invalid("project version"));
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
            &[
                "inputSource",
                "sidechainSource",
                "selectedCaptureNodeId",
                "captureWindowSeconds",
            ],
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
        if let Some(seconds) = signal.get("captureWindowSeconds") {
            float(seconds, 0.05, 30.0)?;
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
                "input.raw" | "input.sidechain" | "output" | "midi-input" | "sample-instrument"
                | "sample-region" | "svf" | "granulator" | "voice-synth" => {
                    if entry.len() != 2 {
                        return Err(ProjectError::Invalid("node arguments"));
                    }
                    match kind {
                        "input.raw" => NodeKind::InputRaw,
                        "input.sidechain" => NodeKind::InputSidechain,
                        "output" => NodeKind::Output,
                        "midi-input" => NodeKind::MidiInput,
                        "sample-instrument" => NodeKind::SampleInstrument,
                        "sample-region" => NodeKind::SampleRegion,
                        "svf" => NodeKind::Svf,
                        "voice-synth" => NodeKind::VoiceSynth,
                        _ => NodeKind::Granulator {
                            params: manifold_core::granulator::DEFAULTS,
                        },
                    }
                }
                "gain"
                | "fixed-gain"
                | "loop-capture"
                | "retrospective-capture"
                | "sum2"
                | "midi-transpose"
                | "main-voice-bank"
                | "oscillator"
                | "noise"
                | "lfo"
                | "modulated-gain"
                | "effect-slot-legacy" => {
                    let a = float(
                        entry
                            .get("a")
                            .ok_or(ProjectError::Invalid("node arguments"))?,
                        -f32::MAX,
                        f32::MAX,
                    )?;
                    if kind == "effect-slot-legacy" {
                        let b = float(
                            entry
                                .get("b")
                                .ok_or(ProjectError::Invalid("node arguments"))?,
                            0.,
                            1.,
                        )?;
                        if entry.len() != 4 || a != 0. || b != 0. {
                            return Err(ProjectError::Invalid("FX node arguments"));
                        }
                        NodeKind::EffectSlotLegacy {
                            selected: 0,
                            mix: 0.,
                            params: [0.5, 0.5, 0.2, 0.6, 0.4],
                        }
                    } else if kind == "main-voice-bank" {
                        if entry.len() != 3 || a != 9.0 {
                            return Err(ProjectError::Invalid("Main bank arguments"));
                        }
                        NodeKind::MainVoiceBank {
                            fft_order: a as u32,
                        }
                    } else if kind == "midi-transpose" || kind == "lfo" {
                        if entry.len() != 3 || a != if kind == "lfo" { 2.0 } else { 0.0 } {
                            return Err(ProjectError::Invalid("node arguments"));
                        }
                        if kind == "lfo" {
                            NodeKind::Lfo {
                                waveform: 0,
                                rate: a,
                            }
                        } else {
                            NodeKind::MidiTranspose { semitones: a }
                        }
                    } else if kind == "gain" {
                        if entry.len() != 3 || a != 0.7 {
                            return Err(ProjectError::Invalid("gain arguments"));
                        }
                        NodeKind::Gain { gain: a }
                    } else if kind == "fixed-gain" {
                        if entry.len() != 3 || !(0.0..=4.0).contains(&a) {
                            return Err(ProjectError::Invalid("fixed gain arguments"));
                        }
                        NodeKind::FixedGain { gain: a }
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
                        if kind == "oscillator" {
                            if a != 220.0 || b != 0.4 {
                                return Err(ProjectError::Invalid("oscillator arguments"));
                            }
                            NodeKind::Oscillator {
                                frequency: a,
                                amplitude: b,
                                waveform: 0,
                            }
                        } else if kind == "noise" {
                            if a != 0.08 || b != 0.5 {
                                return Err(ProjectError::Invalid("noise arguments"));
                            }
                            NodeKind::NoiseGenerator { level: a, color: b }
                        } else if kind == "modulated-gain" {
                            if a != 0.5 || b != 0.4 {
                                return Err(ProjectError::Invalid("modulated gain arguments"));
                            }
                            NodeKind::ModulatedGain { base: a, depth: b }
                        } else if kind == "loop-capture" {
                            if a != 2.0 || b != 1.0 {
                                return Err(ProjectError::Invalid("capture arguments"));
                            }
                            NodeKind::LoopCapture {
                                capacity_seconds: a,
                                mix: b,
                            }
                        } else if kind == "retrospective-capture" {
                            if a != 30.0 || b != 0.0 {
                                return Err(ProjectError::Invalid("retrospective arguments"));
                            }
                            NodeKind::RetrospectiveCapture {
                                capacity_seconds: a,
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
        if let Some(selected) = signal.get("selectedCaptureNodeId") {
            let id = uint(selected, 65_535)?;
            if !matches!(
                kinds.get(&id).map(String::as_str),
                Some("loop-capture" | "retrospective-capture")
            ) {
                return Err(ProjectError::Invalid("selected capture source"));
            }
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
        let mut host_parameters = Vec::with_capacity(parameters.len());
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
            host_parameters.push(HostParameter::new(node, id, min, max, discrete, value));
        }
        for (&node, kind) in &kinds {
            if (0..=19).any(|id| parameter_range(kind, id).is_some() && !seen.contains(&(node, id)))
            {
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
        let mut host_bindings = Vec::new();
        if let Some(raw) = doc.get("hostBindings") {
            let entries = raw
                .as_array()
                .ok_or(ProjectError::Invalid("host bindings"))?;
            if entries.len() > HOST_SLOT_COUNT {
                return Err(ProjectError::Invalid("host binding count"));
            }
            let mut slots = BTreeSet::new();
            let mut targets = BTreeSet::new();
            for entry in entries {
                let entry = object(entry, &["slot", "nodeId", "id"], &[])?;
                let slot = uint(required(entry, "slot"), (HOST_SLOT_COUNT - 1) as u64)?;
                let node = uint(required(entry, "nodeId"), 65_535)?;
                let id = uint(required(entry, "id"), 255)?;
                let graph_parameter = node << 8 | id;
                if !slots.insert(slot)
                    || !targets.insert(graph_parameter)
                    || !host_parameters
                        .iter()
                        .any(|parameter| parameter.id == graph_parameter)
                {
                    return Err(ProjectError::Invalid("host binding target"));
                }
                host_bindings.push(HostBinding {
                    slot,
                    graph_parameter,
                });
            }
        }
        let mut ordered: Vec<_> = host_parameters
            .iter()
            .map(|parameter| parameter.id)
            .collect();
        ordered.sort_unstable();
        for graph_parameter in ordered {
            if host_bindings.len() >= HOST_SLOT_COUNT {
                break;
            }
            if host_bindings
                .iter()
                .any(|binding| binding.graph_parameter == graph_parameter)
            {
                continue;
            }
            let slot = (0..HOST_SLOT_COUNT as u32)
                .find(|slot| !host_bindings.iter().any(|binding| binding.slot == *slot))
                .expect("free slot below capacity");
            host_bindings.push(HostBinding {
                slot,
                graph_parameter,
            });
        }
        let raw_targets: &[Value] = match doc.get("targets") {
            None => &[],
            Some(Value::Array(values)) => values,
            Some(_) => return Err(ProjectError::Invalid("partial targets")),
        };
        if raw_targets.len() > 8 {
            return Err(ProjectError::Invalid("partial target count"));
        }
        let mut targets = Vec::with_capacity(raw_targets.len());
        let mut target_keys = BTreeSet::new();
        for target in raw_targets {
            let entry = object(target, &["nodeId", "target", "fundamental", "values"], &[])?;
            let node = uint(required(entry, "nodeId"), 65_535)?;
            let index = uint(required(entry, "target"), 1)?;
            if kinds.get(&node).map(String::as_str) != Some("main-voice-bank")
                || !target_keys.insert((node, index))
            {
                return Err(ProjectError::Invalid("partial target node"));
            }
            let fundamental = float(required(entry, "fundamental"), 0., 24_000.)?;
            if fundamental <= 0. {
                return Err(ProjectError::Invalid("partial fundamental"));
            }
            let values = required(entry, "values")
                .as_array()
                .ok_or(ProjectError::Invalid("partial values"))?;
            if values.len() < 4 || values.len() > 128 || values.len() % 4 != 0 {
                return Err(ProjectError::Invalid("partial count"));
            }
            let mut partials = PartialSet {
                fundamental,
                count: values.len() / 4,
                ..PartialSet::default()
            };
            for (part, chunk) in values.chunks_exact(4).enumerate() {
                partials.partials[part] = Partial {
                    frequency: float(&chunk[0], 0., 24_000.)?,
                    amplitude: float(&chunk[1], 0., f32::MAX)?,
                    phase: float(&chunk[2], -f32::MAX, f32::MAX)?,
                    decay_rate: float(&chunk[3], 0., f32::MAX)?,
                };
            }
            if !partials.validate() {
                return Err(ProjectError::Invalid("partial values"));
            }
            targets.push(Target {
                node,
                index,
                partials,
            });
        }
        for (&node, kind) in &kinds {
            if kind == "main-voice-bank"
                && (!target_keys.contains(&(node, 0)) || !target_keys.contains(&(node, 1)))
            {
                return Err(ProjectError::Invalid("missing Main targets"));
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
            if !matches!(
                kinds.get(&node).map(String::as_str),
                Some("sample-instrument" | "sample-region" | "granulator" | "main-voice-bank")
            ) || !asset_nodes.insert(node)
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
        let raw_temporal: &[Value] = match doc.get("temporal") {
            None => &[],
            Some(Value::Array(values)) => values,
            Some(_) => return Err(ProjectError::Invalid("temporal recipes")),
        };
        if raw_temporal.len() > 4 {
            return Err(ProjectError::Invalid("temporal count"));
        }
        let mut temporal = Vec::with_capacity(raw_temporal.len());
        let mut temporal_nodes = BTreeSet::new();
        for entry in raw_temporal {
            let entry = object(
                entry,
                &["nodeId", "mode", "speed", "smooth", "contrast", "recipe"],
                &[],
            )?;
            let node = uint(required(entry, "nodeId"), 65_535)?;
            let mode = uint(required(entry, "mode"), 2)?;
            if mode < 1
                || kinds.get(&node).map(String::as_str) != Some("main-voice-bank")
                || !asset_nodes.contains(&node)
                || !temporal_nodes.insert(node)
            {
                return Err(ProjectError::Invalid("temporal node"));
            }
            let speed = float(required(entry, "speed"), 0., 4.)?;
            let smooth = float(required(entry, "smooth"), 0., 1.)?;
            let contrast = float(required(entry, "contrast"), 0., 2.)?;
            let fields = required(entry, "recipe")
                .as_array()
                .ok_or(ProjectError::Invalid("temporal recipe"))?;
            if fields.len() != 11 {
                return Err(ProjectError::Invalid("temporal recipe length"));
            }
            let mut recipe = [0.0; 11];
            for (index, field) in fields.iter().enumerate() {
                recipe[index] = float(field, -f32::MAX, f32::MAX)?;
            }
            if recipe[0].fract() != 0.
                || !(0.0..=7.0).contains(&recipe[0])
                || recipe[1] != 8.
                || recipe[2] != 0.
                || recipe[3] != 0.
                || !(0.01..=0.99).contains(&recipe[4])
                || (recipe[5] != 0.0 && recipe[5] != 1.0)
                || !(0.0..=1.0).contains(&recipe[6])
                || !(0.0..=1.0).contains(&recipe[7])
                || recipe[8].fract() != 0.
                || !(0.0..=2.0).contains(&recipe[8])
                || !(0.0..=1.0).contains(&recipe[9])
                || recipe[10].fract() != 0.
                || !(0.0..=2.0).contains(&recipe[10])
            {
                return Err(ProjectError::Invalid("temporal recipe values"));
            }
            temporal.push(TemporalRecipe {
                node,
                speed,
                smooth,
                contrast,
                recipe,
            });
        }
        Ok(Self {
            document: root,
            graph,
            parameters: parsed_parameters,
            host_parameters,
            host_bindings,
            assets,
            targets,
            temporal,
            fx_type_parameters: None,
        })
    }

    pub fn host_parameters(&self) -> &[HostParameter] {
        &self.host_parameters
    }

    pub fn host_bindings(&self) -> &[HostBinding] {
        &self.host_bindings
    }

    pub fn fx_type_parameters(&self) -> [[f32; 5]; 21] {
        self.fx_type_parameters.unwrap_or(DEFAULT_TYPE_PARAMETERS)
    }

    /// Compile and install state on a control thread, before publishing the processor.
    pub fn prepare(
        self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<NativeProcessor, ProjectError> {
        self.prepare_with_state(sample_rate, max_frames)
            .map(|prepared| prepared.processor)
    }

    pub fn prepare_with_state(
        mut self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<PreparedNativeProject, ProjectError> {
        let document = self.document.take();
        let mut prepared_temporal = Vec::with_capacity(self.temporal.len());
        for entry in &self.temporal {
            let source = self
                .assets
                .iter()
                .find(|asset| asset.node == entry.node)
                .ok_or(ProjectError::Invalid("temporal source"))?;
            let source_frames = source.stereo.len() / 2;
            let analysis =
                analyze_temporal_stereo(&source.stereo, source.rate, 0..source_frames, 128)
                    .ok_or(ProjectError::Invalid("temporal analysis"))?;
            if analysis.frames.len() < 2 {
                return Err(ProjectError::Invalid("temporal frame count"));
            }
            let values = entry.recipe;
            let recipe = MainTemporalRecipe {
                smooth: entry.smooth,
                contrast: entry.contrast,
                shape: SpectralShape {
                    stretch: values[9],
                    tilt_mode: values[10] as u8,
                },
                add_flavor: if values[5] >= 0.5 {
                    AddFlavor::Driven {
                        waveform: values[0] as u8,
                        pulse_width: values[4],
                    }
                } else {
                    AddFlavor::SelfResynthesis
                },
                morph: MorphRecipe {
                    position: values[6],
                    depth: values[7],
                    curve: values[8] as u8,
                },
            };
            prepared_temporal.push((entry.node, entry.speed, analysis.frames, recipe));
        }
        let mut processor = NativeProcessor::prepare(&self.graph, sample_rate, max_frames)
            .map_err(ProjectError::Prepare)?;
        if let Some(table) = self.fx_type_parameters {
            for (effect_type, values) in table.into_iter().enumerate() {
                if !processor.restore_effect_slot_params(2_u32.into(), effect_type as u32, values) {
                    return Err(ProjectError::Invalid("FX type controls"));
                }
            }
        }
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
        for target in self.targets {
            if !processor.load_partials_target(target.node.into(), target.index, target.partials) {
                return Err(ProjectError::Invalid("unavailable partial target"));
            }
        }
        for (node, speed, frames, recipe) in prepared_temporal {
            if !processor.load_main_temporal_frames(node.into(), frames, recipe)
                || !processor.set_main_temporal_speed(node.into(), speed)
            {
                return Err(ProjectError::Invalid("unavailable temporal source"));
            }
        }
        processor.current_parameter_values =
            self.host_parameters.iter().map(|p| p.initial).collect();
        processor.host_parameters = self.host_parameters;
        for binding in self.host_bindings {
            processor.slot_bindings[binding.slot as usize] = Some(binding.graph_parameter);
        }
        Ok(PreparedNativeProject {
            processor,
            document,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parameters::{AutomationError, HOST_SLOT_BASE, TimedAutomation};
    use crate::{AudioBlock, NativeError};
    use manifold_core::events::{EventKind, TimedEvent};
    use serde_json::json;

    fn fixture() -> Value {
        serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/sidechain-sampler.json"
        ))
        .unwrap()
    }

    #[test]
    fn standalone_fx_module_loads_the_authored_project_and_roundtrips_host_state() {
        use crate::host_buffers::{HostBuffers, RawHostBlock};

        let authored = include_bytes!("../../../projects/standalone-fx-module/project.json");
        let project = NativeProject::parse_fx_module(authored).unwrap();
        assert_eq!(project.host_parameters().len(), 7);
        assert_eq!(project.host_bindings()[0].slot, 0);
        let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
        let mut buffers = HostBuffers::prepare(128);
        let left = [0.3; 128];
        let right = [-0.2; 128];
        let mut output_left = [0.; 128];
        let mut output_right = [0.; 128];
        let automation = [
            TimedAutomation {
                offset: 0,
                id: HOST_SLOT_BASE + 1,
                normalized: 0.8,
            },
            TimedAutomation {
                offset: 64,
                id: HOST_SLOT_BASE,
                normalized: 8. / 20.,
            },
        ];
        // SAFETY: Each pointer refers to a live 128-frame array, with no aliasing.
        unsafe {
            buffers
                .render(
                    &mut prepared.processor,
                    RawHostBlock {
                        frames: 128,
                        main: [left.as_ptr(), right.as_ptr()],
                        sidechain: [std::ptr::null(); 2],
                        output: [output_left.as_mut_ptr(), output_right.as_mut_ptr()],
                        events: &[],
                        automation: &automation,
                    },
                )
                .unwrap();
        }
        assert!(output_left.iter().all(|sample| sample.is_finite()));
        assert!(output_right.iter().all(|sample| sample.is_finite()));
        assert!(output_left.iter().any(|sample| sample.abs() > 0.01));
        let saved = prepared.save_state().unwrap();
        let document: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(document["id"], "manifold.standalone-fx-module");
        assert_eq!(
            document["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .len(),
            7
        );
        let reopened = NativeProject::parse_fx_module(&saved).unwrap();
        let processor = reopened.prepare(48_000., 128).unwrap();
        let values = processor.current_parameter_values();
        let parameters = processor.host_parameters();
        let type_index = parameters
            .iter()
            .position(|parameter| parameter.local_id == 0)
            .unwrap();
        let mix_index = parameters
            .iter()
            .position(|parameter| parameter.local_id == 1)
            .unwrap();
        assert_eq!(values[type_index], 8.);
        assert!((values[mix_index] - 0.8).abs() < 1e-6);
    }

    #[test]
    fn fx_type_switch_restores_per_effect_controls_to_public_state() {
        let authored = include_bytes!("../../../projects/standalone-fx-module/project.json");
        let mut prepared = NativeProject::parse_fx_module(authored)
            .unwrap()
            .prepare_with_state(48_000., 64)
            .unwrap();
        let node = 2_u32.into();
        assert!(prepared.processor.set_parameter(node, 2, 0.87));
        assert!(prepared.processor.set_parameter(node, 0, 7.));
        let value = |prepared: &PreparedNativeProject, id| {
            let index = prepared
                .processor
                .host_parameters()
                .iter()
                .position(|parameter| parameter.local_id == id)
                .unwrap();
            prepared.processor.current_parameter_values()[index]
        };
        assert_eq!(value(&prepared, 2), 0.5); // Reverb's remembered first control.
        assert!(prepared.processor.set_parameter(node, 2, 0.13));
        let mut left = [0.; 64];
        let mut right = [0.; 64];
        prepared
            .processor
            .process_host_automated(
                crate::AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                },
                &[TimedAutomation {
                    offset: 32,
                    id: HOST_SLOT_BASE,
                    normalized: 0.,
                }],
            )
            .unwrap();
        assert_eq!(value(&prepared, 0), 0.);
        assert_eq!(value(&prepared, 2), 0.87);
        let saved = prepared.save_state().unwrap();
        let mut reopened = NativeProject::parse_fx_module(&saved)
            .unwrap()
            .prepare_with_state(48_000., 64)
            .unwrap();
        assert_eq!(value(&reopened, 2), 0.87);
        assert!(reopened.processor.set_parameter(node, 0, 7.));
        assert_eq!(value(&reopened, 2), 0.13);
    }

    #[test]
    fn fx_host_reset_clears_reverb_tail_and_keeps_controls() {
        let authored = include_bytes!("../../../projects/standalone-fx-module/project.json");
        let mut processor = NativeProject::parse_fx_module(authored)
            .unwrap()
            .prepare(48_000., 1024)
            .unwrap();
        let node = 2_u32.into();
        assert!(processor.set_parameter(node, 0, 7.));
        assert!(processor.set_parameter(node, 1, 1.));
        let silence = [0.; 1024];
        let mut impulse = [0.; 1024];
        impulse[0] = 1.;
        let mut left = [0.; 1024];
        let mut right = [0.; 1024];
        let mut tail_peak = 0.0_f32;
        for block in 0..8 {
            let input = if block == 0 { &impulse } else { &silence };
            processor
                .process(crate::AudioBlock {
                    main: Some([input, input]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            if block > 0 {
                tail_peak =
                    tail_peak.max(left.iter().map(|sample| sample.abs()).fold(0., f32::max));
            }
        }
        assert!(
            tail_peak > 1e-5,
            "reverb must have produced a tail before reset"
        );
        assert!(processor.reset_effect_slot(node));
        processor
            .process(crate::AudioBlock {
                main: Some([&silence, &silence]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(left.iter().all(|sample| sample.abs() < 1e-7));
        assert!(right.iter().all(|sample| sample.abs() < 1e-7));
        let values = processor.current_parameter_values();
        let types = processor.host_parameters();
        assert_eq!(
            values[types.iter().position(|entry| entry.local_id == 0).unwrap()],
            7.
        );
        assert_eq!(
            values[types.iter().position(|entry| entry.local_id == 1).unwrap()],
            1.
        );
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
        for json in [
            include_bytes!("../../../projects/graph-workspace/live-sampler.json").as_slice(),
            include_bytes!("../../../projects/graph-workspace/retrospective-sampler.json")
                .as_slice(),
            include_bytes!("../../../projects/graph-workspace/retrospective-multisource.json")
                .as_slice(),
        ] {
            NativeProject::parse(json)
                .unwrap()
                .prepare(48_000.0, 128)
                .unwrap();
        }
    }

    #[test]
    fn browser_region_and_granular_projects_prepare_natively() {
        for project in [
            include_bytes!("../../../projects/graph-workspace/region-voice.json").as_slice(),
            include_bytes!("../../../projects/graph-workspace/granular-source.json").as_slice(),
        ] {
            NativeProject::parse(project)
                .unwrap()
                .prepare(48_000.0, 128)
                .unwrap();
        }
    }

    #[test]
    fn browser_note_voice_and_sample_voice_prepare_natively() {
        for project in [
            include_bytes!("../../../projects/graph-workspace/note-voice.json").as_slice(),
            include_bytes!("../../../projects/graph-workspace/sample-voice.json").as_slice(),
        ] {
            NativeProject::parse(project)
                .unwrap()
                .prepare(48_000.0, 128)
                .unwrap();
        }
        let project = include_bytes!("../../../projects/graph-workspace/note-voice.json");
        let mut processor = NativeProject::parse(project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
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
        assert_eq!(left[..24], [0.0; 24]);
        assert!(left[40..].iter().any(|sample| sample.abs() > 0.0001));
        assert_eq!(left, right);
    }

    #[test]
    fn browser_tone_texture_cv_graph_renders_natively() {
        let project = include_bytes!("../../../projects/graph-workspace/tone-texture.json");
        let mut processor = NativeProject::parse(project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(left.iter().any(|sample| sample.abs() > 0.0001));
        assert!(left.iter().all(|sample| sample.is_finite()));
        assert!(right.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn authored_graphs_reset_to_fresh_audio_without_losing_controls() {
        let note_project = include_bytes!("../../../projects/graph-workspace/note-voice.json");
        let mut note = NativeProject::parse(note_project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let mut fresh_note = NativeProject::parse(note_project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let on = TimedEvent {
            offset: 0,
            node: 4,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        };
        let render = |processor: &mut NativeProcessor, events: &[TimedEvent]| {
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events,
                })
                .unwrap();
            (left, right)
        };
        for _ in 0..8 {
            assert!(
                render(&mut note, &[on])
                    .0
                    .iter()
                    .any(|value| value.abs() > 0.0)
            );
        }
        let controls = note.current_parameter_values().to_vec();
        note.reset_processing();
        assert_eq!(note.current_parameter_values(), controls);
        assert_eq!(render(&mut note, &[]), ([0.0; 128], [0.0; 128]));
        assert_eq!(render(&mut note, &[on]), render(&mut fresh_note, &[on]));
        note.reset_processing();
        fresh_note.reset_processing();
        assert_eq!(render(&mut note, &[on]), render(&mut fresh_note, &[on]));

        let tone_project = include_bytes!("../../../projects/graph-workspace/tone-texture.json");
        let mut tone = NativeProject::parse(tone_project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let mut fresh_tone = NativeProject::parse(tone_project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        for _ in 0..8 {
            render(&mut tone, &[]);
        }
        let controls = tone.current_parameter_values().to_vec();
        tone.reset_processing();
        assert_eq!(tone.current_parameter_values(), controls);
        assert_eq!(render(&mut tone, &[]), render(&mut fresh_tone, &[]));

        let sample_project = include_bytes!("../../../projects/graph-workspace/sample-voice.json");
        let mut sample = NativeProject::parse(sample_project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let mut fresh_sample = NativeProject::parse(sample_project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let pcm: Vec<f32> = (0..4096)
            .map(|index| ((index / 2) as f32 * 0.01).sin() * 0.5)
            .collect();
        assert!(sample.load_sample_stereo(5, pcm.clone(), 48_000.0));
        assert!(fresh_sample.load_sample_stereo(5, pcm, 48_000.0));
        for _ in 0..8 {
            render(&mut sample, &[on]);
        }
        sample.reset_processing();
        assert_eq!(render(&mut sample, &[]), ([0.0; 128], [0.0; 128]));
        assert_eq!(render(&mut sample, &[on]), render(&mut fresh_sample, &[on]));

        let main_project = include_bytes!("../../../projects/graph-workspace/main-bank.json");
        let mut main = NativeProject::parse(main_project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let mut fresh_main = NativeProject::parse(main_project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        for _ in 0..8 {
            render(&mut main, &[on]);
        }
        main.reset_processing();
        assert_eq!(render(&mut main, &[]), ([0.0; 128], [0.0; 128]));
        assert_eq!(render(&mut main, &[on]), render(&mut fresh_main, &[on]));
    }

    #[test]
    fn browser_main_bank_restores_both_partial_targets_and_renders_note() {
        let project = include_bytes!("../../../projects/graph-workspace/main-bank.json");
        let mut processor = NativeProject::parse(project)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
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
        let note_event = [note];
        let mut audible = false;
        for block in 0..16 {
            processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: if block == 0 { &note_event } else { &[] },
                })
                .unwrap();
            if block == 0 {
                assert_eq!(left[..24], [0.0; 24]);
            }
            audible |= left.iter().any(|sample| sample.abs() > 0.0001);
            assert!(left.iter().all(|sample| sample.is_finite()));
            assert!(right.iter().all(|sample| sample.is_finite()));
        }
        assert!(audible);
    }

    #[test]
    fn main_bank_rejects_missing_or_invalid_spectral_state() {
        let source = include_bytes!("../../../projects/graph-workspace/main-bank.json");
        let mut bundle: Value = serde_json::from_slice(source).unwrap();
        bundle["targets"].as_array_mut().unwrap().pop();
        assert!(matches!(
            parse(&bundle),
            Err(ProjectError::Invalid("missing Main targets"))
        ));
        let mut bundle: Value = serde_json::from_slice(source).unwrap();
        bundle["targets"][0]["values"][0] = json!(25_000);
        assert!(matches!(
            parse(&bundle),
            Err(ProjectError::Invalid("number range"))
        ));
        let mut bundle: Value = serde_json::from_slice(source).unwrap();
        bundle["temporal"] = json!([{}]);
        assert!(matches!(parse(&bundle), Err(ProjectError::Invalid(_))));
    }

    #[test]
    fn main_bank_embedded_sample_restores_sample_voice_route() {
        let source = include_bytes!("../../../projects/graph-workspace/main-bank.json");
        let mut bundle: Value = serde_json::from_slice(source).unwrap();
        let pcm: Vec<f32> = (0..4800)
            .flat_map(|i| {
                let sample = (i as f32 * std::f32::consts::TAU * 330.0 / 48_000.0).sin() * 0.8;
                [sample, sample]
            })
            .collect();
        let bytes: Vec<u8> = pcm.iter().flat_map(|sample| sample.to_le_bytes()).collect();
        bundle["assets"] = json!([{ "nodeId": 5, "sourceRate": 48000, "frames": 4800,
            "label": "Main source", "pcmF32Base64": STANDARD.encode(bytes) }]);
        bundle["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|entry| entry["nodeId"] == 5 && entry["id"] == 1)
            .unwrap()["value"] = json!(1);
        let mut processor = parse(&bundle).unwrap().prepare(48_000.0, 128).unwrap();
        let note = TimedEvent {
            offset: 0,
            node: 4,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        };
        let mut audible = false;
        for block in 0..32 {
            let mut left = [0.0; 128];
            let mut right = [0.0; 128];
            let events: &[TimedEvent] = if block == 0 {
                std::slice::from_ref(&note)
            } else {
                &[]
            };
            processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events,
                })
                .unwrap();
            audible |= left.iter().any(|sample| sample.abs() > 0.0001);
            assert!(left.iter().all(|sample| sample.is_finite()));
        }
        assert!(audible);
    }

    #[test]
    fn main_bank_temporal_recipe_analyzes_embedded_pcm_before_prepare() {
        let source = include_bytes!("../../../projects/graph-workspace/main-bank.json");
        let mut bundle: Value = serde_json::from_slice(source).unwrap();
        let pcm: Vec<f32> = (0..8192)
            .flat_map(|i| {
                let sample = (i as f32 * std::f32::consts::TAU * 330.0 / 48_000.0).sin() * 0.8;
                [sample, sample]
            })
            .collect();
        let bytes: Vec<u8> = pcm.iter().flat_map(|sample| sample.to_le_bytes()).collect();
        bundle["assets"] = json!([{ "nodeId": 5, "sourceRate": 48000, "frames": 8192,
            "label": "moving Main source", "pcmF32Base64": STANDARD.encode(bytes) }]);
        bundle["temporal"] = json!([{ "nodeId": 5, "mode": 1, "speed": 1,
            "smooth": 0, "contrast": 1,
            "recipe": [0, 8, 0, 0, 0.5, 0, 0, 0.7, 2, 0, 0] }]);
        let mut processor = parse(&bundle).unwrap().prepare(48_000.0, 128).unwrap();
        let note = TimedEvent {
            offset: 16,
            node: 4,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        };
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[note],
            })
            .unwrap();
        assert_eq!(left[..16], [0.0; 16]);
        assert!(left[32..].iter().any(|sample| sample.abs() > 0.0001));
        let mut invalid = bundle;
        invalid["temporal"][0]["recipe"][1] = json!(7);
        assert!(matches!(
            parse(&invalid),
            Err(ProjectError::Invalid("temporal recipe values"))
        ));
        invalid["temporal"][0]["recipe"][1] = json!(8);
        invalid.as_object_mut().unwrap().remove("assets");
        assert!(matches!(
            parse(&invalid),
            Err(ProjectError::Invalid("temporal node"))
        ));
    }

    #[test]
    fn saved_host_state_reopens_edited_controls_and_keeps_project_content() {
        let mut bundle = fixture();
        bundle["hostBindings"] = json!([{ "slot": 77, "nodeId": 9, "id": 0 }]);
        let mut prepared = parse(&bundle)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let main = [1.0; 128];
        let slot = HOST_SLOT_BASE + 77;
        prepared
            .processor
            .process_host_automated(
                AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                },
                &[TimedAutomation {
                    offset: 40,
                    id: slot,
                    normalized: 0.5,
                }],
            )
            .unwrap();
        assert!((left[39] - 0.25).abs() < 0.001);
        assert!(left[127] > left[39]);
        assert!(!prepared.processor.set_parameter(9, 0, 3.0));
        let saved = prepared.save_state().unwrap();
        let saved_value: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(saved_value["hostBindings"][0]["slot"], 77);
        assert_eq!(saved_value["signal"]["sidechainSource"], "oscillator");
        assert_eq!(
            saved_value["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 9 && entry["id"] == 0)
                .unwrap()["value"],
            1.0
        );
        let mut reopened = NativeProject::parse(&saved)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        assert_eq!(reopened.processor.bound_graph_parameter(77), Some(9 << 8));
        reopened
            .processor
            .process(AudioBlock {
                main: Some([&main, &main]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!((left[127] - 1.0).abs() < 0.001);
    }

    #[test]
    fn saved_main_state_retains_source_targets_and_temporal_recipe() {
        let mut bundle: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/main-bank.json"
        ))
        .unwrap();
        let pcm: Vec<f32> = (0..8192)
            .flat_map(|i| {
                let sample = (i as f32 * std::f32::consts::TAU * 330.0 / 48_000.0).sin() * 0.8;
                [sample, sample]
            })
            .collect();
        let bytes: Vec<u8> = pcm.iter().flat_map(|sample| sample.to_le_bytes()).collect();
        bundle["assets"] = json!([{ "nodeId": 5, "sourceRate": 48000, "frames": 8192,
            "label": "Main source", "pcmF32Base64": STANDARD.encode(bytes) }]);
        bundle["temporal"] = json!([{ "nodeId": 5, "mode": 1, "speed": 2,
            "smooth": 0, "contrast": 1,
            "recipe": [0, 8, 0, 0, 0.5, 0, 0, 0.7, 2, 0, 0] }]);
        let mut prepared = parse(&bundle)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        assert!(prepared.processor.set_parameter(5, 1, 0.6));
        let saved = prepared.save_state().unwrap();
        let saved_value: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(saved_value["assets"], bundle["assets"]);
        assert_eq!(saved_value["targets"], bundle["targets"]);
        assert_eq!(saved_value["temporal"], bundle["temporal"]);
        let saved_level = saved_value["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .find(|entry| entry["nodeId"] == 5 && entry["id"] == 1)
            .unwrap()["value"]
            .as_f64()
            .unwrap();
        assert!((saved_level - 0.6).abs() < 1e-6);
        NativeProject::parse(&saved)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let replacement: Vec<f32> = (0..8192)
            .flat_map(|i| {
                let sample = (i as f32 * std::f32::consts::TAU * 660.0 / 48_000.0).sin() * 0.8;
                [sample, sample]
            })
            .collect();
        let next = prepared
            .prepare_sample_replacement(5, &replacement, 48_000, "new Main source", 48_000.0, 128)
            .unwrap();
        let _old = prepared.publish_replacement(next);
        let updated: Value = serde_json::from_slice(&prepared.save_state().unwrap()).unwrap();
        assert_eq!(updated["assets"][0]["label"], "new Main source");
        assert_ne!(
            updated["assets"][0]["pcmF32Base64"],
            bundle["assets"][0]["pcmF32Base64"]
        );
        assert_eq!(updated["temporal"], bundle["temporal"]);
        let recipe = [0.0, 8.0, 0.0, 0.0, 0.5, 0.0, 0.0, 0.7, 2.0, 0.0, 0.0];
        let mut invalid = recipe;
        invalid[1] = 7.0;
        assert!(matches!(
            prepared.prepare_temporal_replacement(5, 1, 1.0, 0.2, 1.0, invalid, 48_000.0, 128),
            Err(ProjectError::Invalid("temporal recipe values"))
        ));
        let next = prepared
            .prepare_temporal_replacement(5, 1, 1.0, 0.2, 1.0, recipe, 48_000.0, 128)
            .unwrap();
        let _old = prepared.publish_replacement(next);
        let saved: Value = serde_json::from_slice(&prepared.save_state().unwrap()).unwrap();
        assert_eq!(saved["temporal"][0]["speed"], 1.0);
        assert_eq!(saved["assets"][0]["label"], "new Main source");
    }

    #[test]
    fn prepared_sample_replacement_publishes_only_after_validation() {
        let source = include_bytes!("../../../projects/graph-workspace/sample-voice.json");
        let mut active = NativeProject::parse(source)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        assert!(matches!(
            active.prepare_sample_replacement(5, &[f32::NAN, 0.0], 48_000, "bad", 48_000.0, 128),
            Err(ProjectError::Invalid("replacement sample"))
        ));
        let pcm: Vec<f32> = (0..4096)
            .flat_map(|i| {
                let value = (i as f32 * std::f32::consts::TAU * 220.0 / 48_000.0).sin() * 0.5;
                [value, value]
            })
            .collect();
        let next = active
            .prepare_sample_replacement(5, &pcm, 48_000, "new source", 48_000.0, 128)
            .unwrap();
        let old = active.publish_replacement(next);
        assert!(old.document.get("assets").is_none());
        let saved: Value = serde_json::from_slice(&active.save_state().unwrap()).unwrap();
        assert_eq!(saved["assets"][0]["label"], "new source");
        assert_eq!(saved["assets"][0]["frames"], 4096);
        let note = [TimedEvent {
            offset: 16,
            node: 4,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        }];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        active
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &note,
            })
            .unwrap();
        assert!(left[16..].iter().any(|sample| sample.abs() > 0.0001));
        NativeProject::parse(&serde_json::to_vec(&saved).unwrap())
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
    }

    #[test]
    fn prepared_main_target_replacement_changes_audio_and_saved_state() {
        let mut bundle: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/main-bank.json"
        ))
        .unwrap();
        bundle["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|entry| entry["nodeId"] == 5 && entry["id"] == 6)
            .unwrap()["value"] = json!(4);
        bundle["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|entry| entry["nodeId"] == 5 && entry["id"] == 19)
            .unwrap()["value"] = json!(0);
        let mut active = parse(&bundle)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let mut target = PartialSet {
            fundamental: 1.0,
            count: 1,
            ..PartialSet::default()
        };
        target.partials[0] = Partial {
            frequency: 1.0,
            amplitude: 0.03,
            phase: 0.0,
            decay_rate: 0.0,
        };
        let next = active
            .prepare_target_replacement(5, 0, &target, 48_000.0, 128)
            .unwrap();
        let mut old = active.publish_replacement(next);
        let saved: Value = serde_json::from_slice(&active.save_state().unwrap()).unwrap();
        assert_eq!(saved["targets"][0]["values"].as_array().unwrap().len(), 4);
        assert!((saved["targets"][0]["values"][1].as_f64().unwrap() - 0.03).abs() < 1e-6);
        NativeProject::parse(&serde_json::to_vec(&saved).unwrap())
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let note = [TimedEvent {
            offset: 16,
            node: 4,
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        }];
        let mut difference: f32 = 0.0;
        for block in 0..16 {
            let mut previous = [0.0; 128];
            let mut previous_right = [0.0; 128];
            let mut current = [0.0; 128];
            let mut current_right = [0.0; 128];
            let events: &[TimedEvent] = if block == 0 { &note } else { &[] };
            old.processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut previous, &mut previous_right],
                    events,
                })
                .unwrap();
            active
                .processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut current, &mut current_right],
                    events,
                })
                .unwrap();
            for (before, after) in previous.iter().zip(current.iter()) {
                difference = difference.max((before - after).abs());
            }
        }
        assert!(
            difference > 0.001,
            "target replacement should change Main audio"
        );
    }

    #[test]
    fn restored_region_and_granular_assets_render_audio() {
        let pcm: Vec<f32> = (0..4800)
            .flat_map(|i| {
                let sample = (i as f32 * std::f32::consts::TAU * 330.0 / 48_000.0).sin() * 0.7;
                [sample, sample]
            })
            .collect();
        let bytes: Vec<u8> = pcm.iter().flat_map(|sample| sample.to_le_bytes()).collect();
        for (document, note) in [
            (
                include_bytes!("../../../projects/graph-workspace/region-voice.json").as_slice(),
                true,
            ),
            (
                include_bytes!("../../../projects/graph-workspace/granular-source.json").as_slice(),
                false,
            ),
        ] {
            let mut bundle: Value = serde_json::from_slice(document).unwrap();
            bundle["assets"] = json!([{ "nodeId": 5, "sourceRate": 48000, "frames": 4800,
                "label": "restored sine", "pcmF32Base64": STANDARD.encode(&bytes) }]);
            let mut processor = parse(&bundle).unwrap().prepare(48_000.0, 128).unwrap();
            let event = TimedEvent {
                offset: 24,
                node: 4,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 127,
                },
            };
            let note_event = [event];
            let mut audible = false;
            for block in 0..32 {
                let mut left = [0.0; 128];
                let mut right = [0.0; 128];
                processor
                    .process(AudioBlock {
                        main: None,
                        sidechain: None,
                        output: [&mut left, &mut right],
                        events: if note && block == 0 { &note_event } else { &[] },
                    })
                    .unwrap();
                audible |= left.iter().any(|sample| sample.abs() > 0.0001);
                assert!(left.iter().all(|sample| sample.is_finite()));
                assert_eq!(left, right);
            }
            assert!(audible, "restored source should sound");
        }
    }

    #[test]
    fn host_ids_and_normalization_are_stable_across_parameter_order() {
        let bundle = fixture();
        let project = parse(&bundle).unwrap();
        let gain = project
            .host_parameters()
            .iter()
            .find(|p| p.node == 9)
            .unwrap();
        assert_eq!(gain.id, 9 << 8);
        assert_eq!(gain.initial, 0.25);
        assert_eq!(gain.from_normalized(0.5), Some(1.0));
        assert_eq!(gain.to_normalized(1.0), Some(0.5));
        let mut shuffled = bundle;
        shuffled["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
            .reverse();
        let other = parse(&shuffled).unwrap();
        assert!(
            other
                .host_parameters()
                .iter()
                .any(|p| p.id == gain.id && p.node == gain.node)
        );
        let slot = project
            .host_bindings()
            .iter()
            .find(|binding| binding.graph_parameter == gain.id)
            .unwrap()
            .slot;
        let other_slot = other
            .host_bindings()
            .iter()
            .find(|binding| binding.graph_parameter == gain.id)
            .unwrap()
            .slot;
        assert_eq!(slot, other_slot);
    }

    #[test]
    fn explicit_fixed_slot_drives_graph_gain_and_rejects_duplicates() {
        let mut bundle = fixture();
        bundle["hostBindings"] = json!([{ "slot": 7, "nodeId": 9, "id": 0 }]);
        let mut processor = parse(&bundle).unwrap().prepare(48_000.0, 128).unwrap();
        assert_eq!(processor.bound_graph_parameter(7), Some(9 << 8));
        assert_eq!(processor.bound_graph_parameter(127), None);
        let main = [1.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        processor
            .process_host_automated(
                AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                },
                &[TimedAutomation {
                    offset: 64,
                    id: HOST_SLOT_BASE + 7,
                    normalized: 0.5,
                }],
            )
            .unwrap();
        assert!(
            left[..64]
                .iter()
                .all(|value| (*value - 0.25).abs() < 0.0001)
        );
        assert!(left[127] > left[64]);
        let mut invalid = bundle;
        invalid["hostBindings"] = json!([{ "slot": 7, "nodeId": 9, "id": 0 },
            { "slot": 7, "nodeId": 5, "id": 0 }]);
        assert!(matches!(
            parse(&invalid),
            Err(ProjectError::Invalid("host binding target"))
        ));
    }

    #[test]
    fn automation_changes_gain_after_exact_offset_and_rejects_bad_queues() {
        let mut processor = parse(&fixture()).unwrap().prepare(48_000.0, 128).unwrap();
        let main = [1.0; 128];
        let mut left = [9.0; 128];
        let mut right = [9.0; 128];
        let point = TimedAutomation {
            offset: 64,
            id: 9 << 8,
            normalized: 0.5,
        };
        processor
            .process_automated(
                AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                },
                &[point],
            )
            .unwrap();
        assert!(left[..64].iter().all(|v| (*v - 0.25).abs() < 0.0001));
        assert!(left[64] > 0.25 && left[127] > left[64]);
        assert_eq!(left, right);
        left.fill(9.0);
        let bad = TimedEvent {
            offset: 100,
            node: 999,
            kind: EventKind::AllNotesOff,
        };
        assert_eq!(
            processor.process_automated(
                AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[bad]
                },
                &[point]
            ),
            Err(NativeError::Event(
                manifold_core::events::EventError::UnknownTarget
            ))
        );
        assert_eq!(left, [9.0; 128]);
        let mut empty_left = [];
        let mut empty_right = [];
        processor
            .process_automated(
                AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut empty_left, &mut empty_right],
                    events: &[],
                },
                &[TimedAutomation {
                    offset: 0,
                    id: 9 << 8,
                    normalized: 0.0,
                }],
            )
            .unwrap();
        processor
            .process(AudioBlock {
                main: Some([&main, &main]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(left[127] < left[0]);
        left.fill(9.0);
        let unknown = TimedAutomation { id: 999, ..point };
        assert_eq!(
            processor.process_automated(
                AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[]
                },
                &[unknown]
            ),
            Err(NativeError::Automation(AutomationError::UnknownParameter))
        );
        assert_eq!(left, [9.0; 128]);
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
            .process_automated(
                AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[note],
                },
                &[TimedAutomation {
                    offset: 12,
                    id: 9 << 8,
                    normalized: 0.5,
                }],
            )
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
        assert!(matches!(parse(&bundle), Err(ProjectError::Invalid(_))));
        let mut bundle = fixture();
        bundle["signal"]["nodes"][3]["type"] = json!("unavailable-node");
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
