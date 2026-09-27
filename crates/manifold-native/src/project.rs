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
use crate::{NativeError, NativeProcessor};

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
    graph: GraphDescription,
    parameters: Vec<Parameter>,
    host_parameters: Vec<HostParameter>,
    host_bindings: Vec<HostBinding>,
    assets: Vec<Asset>,
    targets: Vec<Target>,
    temporal: Vec<TemporalRecipe>,
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
                "gain" | "loop-capture" | "sum2" | "midi-transpose" | "main-voice-bank"
                | "oscillator" | "noise" | "lfo" | "modulated-gain" => {
                    let a = float(
                        entry
                            .get("a")
                            .ok_or(ProjectError::Invalid("node arguments"))?,
                        -f32::MAX,
                        f32::MAX,
                    )?;
                    if kind == "main-voice-bank" {
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
            graph,
            parameters: parsed_parameters,
            host_parameters,
            host_bindings,
            assets,
            targets,
            temporal,
        })
    }

    pub fn host_parameters(&self) -> &[HostParameter] {
        &self.host_parameters
    }

    pub fn host_bindings(&self) -> &[HostBinding] {
        &self.host_bindings
    }

    /// Compile and install state on a control thread, before publishing the processor.
    pub fn prepare(
        self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<NativeProcessor, ProjectError> {
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
        processor.host_parameters = self.host_parameters;
        for binding in self.host_bindings {
            processor.slot_bindings[binding.slot as usize] = Some(binding.graph_parameter);
        }
        Ok(processor)
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
