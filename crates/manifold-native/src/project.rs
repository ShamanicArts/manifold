//! A deliberately bounded native reader for the browser graph project bundle.
//! JSON and PCM decoding happen before the processor reaches an audio callback.

use std::collections::{BTreeMap, BTreeSet};

use base64::{Engine as _, engine::general_purpose::STANDARD};
use manifold_core::graph::{Connection, GraphDescription, NodeKind, NodeSpec};
use manifold_core::io::IoLayout;
use manifold_core::main_voice_bank::MainTemporalRecipe;
use manifold_core::node_catalog::workspace_type;
use manifold_core::parameter_catalog::workspace_parameter;
use manifold_core::sine_bank::{Partial, PartialSet};
use manifold_core::spectral_targets::{AddFlavor, MorphRecipe, SpectralShape};
use manifold_core::temporal_partials::analyze_temporal_stereo;
use serde_json::Value;

use crate::loop_state_mailbox::{LoopControls, LoopTake};
use crate::parameters::{HOST_SLOT_BASE, HostBinding, HostParameter};
use crate::{DEFAULT_TYPE_PARAMETERS, NativeError, NativeProcessor};


#[derive(Debug, PartialEq, Eq)]
pub enum ProjectError {
    Invalid(&'static str),
    UnsupportedNode(String),
    Prepare(NativeError),
}

impl NativeProject {
    pub fn io_layout(&self) -> Option<&IoLayout> {
        self.io.as_ref()
    }
    /// A route-only edit keeps the same node table. When a host stops before
    /// the route command is published, combine that edited cable with the
    /// current loop take and loop controls from the synchronized old runtime.
    /// Refuse a different node table so an imported graph cannot inherit PCM.
    pub fn merge_route_loop_state(route: &[u8], live: &[u8]) -> Result<Vec<u8>, ProjectError> {
        let mut target: Value =
            serde_json::from_slice(route).map_err(|_| ProjectError::Invalid("route JSON"))?;
        let source: Value =
            serde_json::from_slice(live).map_err(|_| ProjectError::Invalid("live JSON"))?;
        if target["signal"]["nodes"] != source["signal"]["nodes"] {
            return Err(ProjectError::Invalid("route node table changed"));
        }
        let loop_nodes: BTreeSet<u32> = target["signal"]["nodes"]
            .as_array()
            .ok_or(ProjectError::Invalid("route nodes"))?
            .iter()
            .filter(|node| node["type"] == "loop-capture")
            .map(|node| {
                node["id"]
                    .as_u64()
                    .and_then(|id| u32::try_from(id).ok())
                    .ok_or(ProjectError::Invalid("route loop node"))
            })
            .collect::<Result<_, _>>()?;
        let source_assets = source["assets"].as_array().cloned().unwrap_or_default();
        if target["assets"].is_null() {
            target["assets"] = serde_json::json!([]);
        }
        let target_assets = target["assets"]
            .as_array_mut()
            .ok_or(ProjectError::Invalid("route assets"))?;
        target_assets.retain(|asset| {
            !asset["nodeId"]
                .as_u64()
                .and_then(|id| u32::try_from(id).ok())
                .is_some_and(|id| loop_nodes.contains(&id))
        });
        target_assets.extend(source_assets.into_iter().filter(|asset| {
            asset["nodeId"]
                .as_u64()
                .and_then(|id| u32::try_from(id).ok())
                .is_some_and(|id| loop_nodes.contains(&id))
        }));
        let source_parameters = source["signal"]["initialParameters"]
            .as_array()
            .ok_or(ProjectError::Invalid("live parameters"))?;
        let target_parameters = target["signal"]["initialParameters"]
            .as_array_mut()
            .ok_or(ProjectError::Invalid("route parameters"))?;
        for entry in source_parameters {
            let Some(node) = entry["nodeId"].as_u64() else {
                continue;
            };
            if !u32::try_from(node)
                .ok()
                .is_some_and(|id| loop_nodes.contains(&id))
            {
                continue;
            }
            let Some(id) = entry["id"].as_u64() else {
                continue;
            };
            if let Some(current) = target_parameters
                .iter_mut()
                .find(|target| target["nodeId"] == node && target["id"] == id)
            {
                *current = entry.clone();
            } else {
                target_parameters.push(entry.clone());
            }
        }
        let bytes = serde_json::to_vec(&target).map_err(|_| ProjectError::Invalid("route JSON"))?;
        NativeProject::parse(&bytes)?;
        Ok(bytes)
    }

    /// Apply complete audio-thread loop snapshots to a published project on a
    /// host control thread. Routing, host slots, and unrelated Sample assets
    /// remain in the same document.
    pub fn apply_loop_state(
        bytes: &[u8],
        takes: &[LoopTake],
        controls: &[LoopControls],
    ) -> Result<Vec<u8>, ProjectError> {
        let mut document: Value =
            serde_json::from_slice(bytes).map_err(|_| ProjectError::Invalid("project JSON"))?;
        for control in controls {
            let valid_node = document["signal"]["nodes"].as_array().is_some_and(|nodes| {
                nodes
                    .iter()
                    .any(|node| node["id"] == control.node && node["type"] == "loop-capture")
            });
            if !valid_node {
                return Err(ProjectError::Invalid("loop control node"));
            }
            let parameters = document["signal"]["initialParameters"]
                .as_array_mut()
                .ok_or(ProjectError::Invalid("parameters"))?;
            for (id, value) in control.values.iter().enumerate() {
                let Some(value) = value else { continue };
                if !value.is_finite() {
                    return Err(ProjectError::Invalid("loop control value"));
                }
                if let Some(entry) = parameters
                    .iter_mut()
                    .find(|entry| entry["nodeId"] == control.node && entry["id"] == id as u32)
                {
                    entry["value"] = Value::from(*value);
                } else {
                    parameters.push(serde_json::json!({
                        "nodeId": control.node, "id": id, "value": value,
                    }));
                }
            }
        }
        for take in takes {
            let valid_node = document["signal"]["nodes"].as_array().is_some_and(|nodes| {
                nodes
                    .iter()
                    .any(|node| node["id"] == take.node && node["type"] == "loop-capture")
            });
            if !valid_node {
                return Err(ProjectError::Invalid("loop asset node"));
            }
            if take.frames == 0 {
                if let Some(assets) = document.get_mut("assets").and_then(Value::as_array_mut) {
                    assets.retain(|asset| asset["nodeId"] != take.node);
                }
                continue;
            }
            let label = document
                .get("assets")
                .and_then(Value::as_array)
                .and_then(|assets| assets.iter().find(|asset| asset["nodeId"] == take.node))
                .and_then(|asset| asset["label"].as_str())
                .unwrap_or("Loop take")
                .to_owned();
            replace_sample_asset(
                &mut document,
                take.node,
                take.stereo(),
                take.source_rate,
                &label,
                None,
            )?;
        }
        let encoded =
            serde_json::to_vec(&document).map_err(|_| ProjectError::Invalid("project JSON"))?;
        Ok(encoded)
    }
}

#[derive(Debug)]
struct Parameter {
    node: u32,
    id: u32,
    value: f32,
}

/// Stable project path bound to one numeric graph parameter. Metadata lives in
/// the portable document; audio hosts resolve it on their control thread.
#[derive(Clone, Debug, PartialEq)]
pub struct ParameterEndpoint {
    pub path: String,
    pub node: u32,
    pub id: u32,
    pub min: f64,
    pub max: f64,
    pub default: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ProjectControl {
    pub path: String,
    pub min: f64,
    pub max: f64,
    pub default: f64,
    pub value: f64,
    pub discrete: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NamedInstance {
    pub path: String,
    pub node: u32,
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
    io: Option<IoLayout>,
    parameters: Vec<Parameter>,
    endpoints: Vec<ParameterEndpoint>,
    controls: Vec<ProjectControl>,
    instances: Vec<NamedInstance>,
    host_parameters: Vec<HostParameter>,
    host_bindings: Vec<HostBinding>,
    assets: Vec<Asset>,
    sample_bindings: Vec<(u32, u32)>,
    targets: Vec<Target>,
    temporal: Vec<TemporalRecipe>,
    fx_type_parameters: Option<[[f32; 5]; 21]>,
}

/// Keep the portable project beside its prepared processor for host state saves.
/// Saving is a control-thread operation after the host has synchronized processing.
pub struct PreparedNativeProject {
    pub processor: NativeProcessor,
    document: Value,
    node_identities: Vec<PreparedNodeIdentity>,
    inherited_parameters: Vec<InheritedParameter>,
    loop_history: Vec<LoopHistory>,
    resource_history: Vec<(u64, u64)>,
    authored_history: bool,
    sample_rate: f32,
    loop_specs: Vec<(u32, usize)>,
    capture_capacity: usize,
}

struct InheritedParameter {
    source_index: usize,
    source_node: u64,
    id: u32,
    target_node: u64,
}

struct LoopHistory {
    target_node: u64,
    source_node: u64,
    parameters: [f32; 7],
    inherit: [bool; 7],
    transferred: bool,
}

struct PreparedNodeIdentity {
    id: u64,
    kind: String,
    path: Option<String>,
}

/// A route validated against the prepared graph topology, with a
/// portable project document to commit after the audio block accepts it.
pub struct StagedRoute {
    pub document: Vec<u8>,
    pub to: u32,
    pub input_port: usize,
    pub source: Option<(u32, usize)>,
}

const LIVE_ROUTE_TYPES: &[&str] = &[
    "input.raw",
    "input.sidechain",
    "output",
    "gain",
    "fixed-gain",
    "distortion",
    "svf",
    "modulated-svf",
    "eq8",
    "sum2",
    "oscillator",
    "noise",
    "lfo",
    "modulated-gain",
    "slew-control",
    "attenuverter-bias",
    "sample-hold",
    "cv-mix",
    "cv-compare",
    "cv-range",
    "stereo-widener",
    "midi-input",
    "midi-transpose",
    "voice-synth",
    "loop-capture",
];

impl NativeProject {
    pub fn supports_live_routes(&self) -> bool {
        self.graph.nodes.len() <= 16
            && self.assets.iter().all(|asset| {
                self.graph.nodes.iter().any(|node| {
                    node.id == u64::from(asset.node)
                        && matches!(node.kind, NodeKind::LoopCapture { .. })
                })
            })
            && self.targets.is_empty()
            && self.temporal.is_empty()
            && self.graph.nodes.iter().all(|node| {
                node.kind
                    .workspace_type_id()
                    .is_some_and(|id| LIVE_ROUTE_TYPES.contains(&id))
            })
    }

    /// Validate a named route against the current compiled order, then export
    /// only its changed edge. Call on a control thread before submitting it.
    pub fn stage_live_route(
        bytes: &[u8],
        to: u32,
        input: &str,
        from: Option<(u32, &str)>,
        rate: f32,
        frames: usize,
    ) -> Result<StagedRoute, ProjectError> {
        let current = Self::parse(bytes)?;
        if !current.supports_live_routes() {
            return Err(ProjectError::Invalid("live route graph"));
        }
        let target = current
            .graph
            .nodes
            .iter()
            .find(|node| node.id == u64::from(to))
            .ok_or(ProjectError::Invalid("route target"))?;
        let input_port = (0..target.kind.input_port_count())
            .find(|&port| target.kind.input_port_name(port).as_deref() == Some(input))
            .ok_or(ProjectError::Invalid("route input"))?;
        let source = if let Some((from, output)) = from {
            let node = current
                .graph
                .nodes
                .iter()
                .find(|node| node.id == u64::from(from))
                .ok_or(ProjectError::Invalid("route source"))?;
            let port = (0..node.kind.output_port_count())
                .find(|&port| node.kind.output_port_name(port) == Some(output))
                .ok_or(ProjectError::Invalid("route output"))?;
            Some((from, port))
        } else {
            None
        };
        Self::stage_live_route_ports(current, to, input_port, source, rate, frames)
    }

    /// The numeric-port form used by language-neutral script host commands.
    /// Validate ports against the same node catalog as named host edits.
    pub fn stage_live_route_ports_from_document(
        bytes: &[u8],
        to: u32,
        input_port: usize,
        source: Option<(u32, usize)>,
        rate: f32,
        frames: usize,
    ) -> Result<StagedRoute, ProjectError> {
        let current = Self::parse(bytes)?;
        if !current.supports_live_routes() {
            return Err(ProjectError::Invalid("live route graph"));
        }
        let target = current
            .graph
            .nodes
            .iter()
            .find(|node| node.id == u64::from(to))
            .ok_or(ProjectError::Invalid("route target"))?;
        if input_port >= target.kind.input_port_count() {
            return Err(ProjectError::Invalid("route input"));
        }
        if let Some((from, output_port)) = source {
            let node = current
                .graph
                .nodes
                .iter()
                .find(|node| node.id == u64::from(from))
                .ok_or(ProjectError::Invalid("route source"))?;
            if output_port >= node.kind.output_port_count() {
                return Err(ProjectError::Invalid("route output"));
            }
        }
        Self::stage_live_route_ports(current, to, input_port, source, rate, frames)
    }

    /// Stage one script parameter edit in the portable project before the
    /// audio thread applies its compact command. Validation uses the normal
    /// project parser and shared parameter catalog.
    pub fn stage_live_parameter(
        bytes: &[u8],
        node: u32,
        id: u32,
        value: f64,
    ) -> Result<Vec<u8>, ProjectError> {
        Self::stage_live_parameter_batch(bytes, &[(node, id, value)])
    }
    /// Validate/decode once for a whole control-side target transaction.
    pub fn stage_live_parameter_batch(
        bytes: &[u8],
        edits: &[(u32, u32, f64)],
    ) -> Result<Vec<u8>, ProjectError> {
        if edits.is_empty() {
            return Err(ProjectError::Invalid("parameter batch size"));
        }
        let current = Self::parse(bytes)?;
        for &(node, id, value) in edits {
            let descriptor = current
                .host_parameters
                .iter()
                .find(|entry| entry.node == u64::from(node) && entry.local_id == id)
                .ok_or(ProjectError::Invalid("parameter target"))?;
            if !value.is_finite()
                || descriptor.to_normalized(value as f32).is_none()
                || (descriptor.discrete && value.fract() != 0.)
            {
                return Err(ProjectError::Invalid("parameter value"));
            }
        }
        let mut document = current.document;
        let parameters = document["signal"]["initialParameters"]
            .as_array_mut()
            .ok_or(ProjectError::Invalid("parameters"))?;
        for &(node, id, value) in edits {
            if let Some(entry) = parameters
                .iter_mut()
                .find(|entry| entry["nodeId"] == node && entry["id"] == id)
            {
                entry["value"] = value.into();
            } else {
                parameters.push(serde_json::json!({"nodeId":node,"id":id,"value":value}));
            }
        }
        let bytes = serde_json::to_vec(&document)
            .map_err(|_| ProjectError::Invalid("parameter document"))?;
        Self::parse(&bytes)?;
        Ok(bytes)
    }

    fn stage_live_route_ports(
        current: Self,
        to: u32,
        input_port: usize,
        source: Option<(u32, usize)>,
        rate: f32,
        frames: usize,
    ) -> Result<StagedRoute, ProjectError> {
        let mut plan = current
            .graph
            .compile_patchable(rate, frames)
            .map_err(|error| ProjectError::Prepare(error.into()))?;
        plan.set_route_from(
            u64::from(to),
            input_port,
            source.map(|(node, port)| (u64::from(node), port)),
        )
        .map_err(|error| ProjectError::Prepare(error.into()))?;
        let mut document = current.document;
        let edges = document["signal"]["connections"]
            .as_array_mut()
            .ok_or(ProjectError::Invalid("route edges"))?;
        edges.retain(|edge| edge["to"] != to || edge["inputPort"] != input_port);
        if let Some((node, port)) = source {
            edges.push(serde_json::json!({"from":node,"outputPort":port,
                "to":to,"inputPort":input_port}));
        }
        let document =
            serde_json::to_vec(&document).map_err(|_| ProjectError::Invalid("route document"))?;
        Self::parse(&document)?;
        Ok(StagedRoute {
            document,
            to,
            input_port,
            source,
        })
    }
}

fn replace_sample_asset(
    document: &mut Value,
    node: u32,
    stereo: &[f32],
    source_rate: u32,
    label: &str,
    capture: Option<u32>,
) -> Result<(), ProjectError> {
    let frames = stereo.len() / 2;
    if stereo.len() % 2 != 0
        || !(8_000..=384_000).contains(&source_rate)
        || frames == 0
        || !stereo.iter().all(|sample| sample.is_finite())
    {
        return Err(ProjectError::Invalid("replacement sample"));
    }
    let assets = document
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
    if let Some(capture) = capture {
        document["signal"]["selectedCaptureNodeId"] = Value::from(capture);
        if let Some(sources) = document["signal"]["captureSources"].as_array() {
            let selected = sources.iter().find(|source| source["nodeId"] == capture);
            if let Some(source) = selected {
                document["signal"]["selectedCaptureSourceId"] = source["id"].clone();
            }
        }
    }
    Ok(())
}

impl PreparedNativeProject {
    /// Whether this prepared project owns loop audio that must be captured
    /// before a native host discards its runtime on deactivation.
    pub fn has_prepared_loops(&self) -> bool {
        self.node_identities.iter().any(|node| {
            node.kind == "loop-capture" && self.processor.has_prepared_node(node.id.into())
        })
    }

    /// Largest accepted capture ring, for the host's shared transfer buffer.
    pub fn prepared_capture_capacity(&self) -> usize {
        self.capture_capacity
    }

    pub fn prepared_loop_specs(&self) -> &[(u32, usize)] {
        &self.loop_specs
    }

    /// A host stop ends any in-progress authored loop take before its runtime
    /// is discarded. This is a synchronized control-thread lifecycle action.
    pub fn finish_recording_loops_for_host_stop(&mut self) -> bool {
        for node in &self.node_identities {
            if node.kind != "loop-capture" || !self.processor.has_prepared_node(node.id.into()) {
                continue;
            }
            if self.processor.plan.capture_length(node.id.into()).is_none() {
                if !self.processor.set_parameter(node.id.into(), 0, 0.0)
                    || !self.processor.set_parameter(node.id.into(), 1, 0.0)
                    || !self.processor.set_parameter(node.id.into(), 2, 0.0)
                {
                    return false;
                }
            }
            if !self.processor.set_parameter(node.id, 2, 0.0) {
                return false;
            }
        }
        true
    }
    /// Prepare unchanged parameter inheritance away from the audio callback.
    /// Explicitly edited targets remain candidate-owned; untouched targets read
    /// the latest published processor values at the eventual block boundary.
    pub fn plan_parameter_inheritance(&mut self, baseline: &[u8]) -> Result<usize, ProjectError> {
        let previous = NativeProject::parse(baseline)?;
        let nodes = previous.document["signal"]["nodes"]
            .as_array()
            .ok_or(ProjectError::Invalid("baseline nodes"))?;
        let mut inherited = Vec::new();
        for target in self.processor.host_parameters() {
            let Some(identity) = self
                .node_identities
                .iter()
                .find(|node| node.id == target.node)
            else {
                continue;
            };
            let source_node = match identity.path.as_deref() {
                Some(path) => previous
                    .instances
                    .iter()
                    .find(|node| node.path == path)
                    .map(|node| u64::from(node.node)),
                None => (!previous
                    .instances
                    .iter()
                    .any(|node| u64::from(node.node) == target.node))
                .then_some(target.node),
            };
            let Some(source_node) = source_node else {
                continue;
            };
            if !nodes
                .iter()
                .any(|node| node["id"] == source_node && node["type"] == identity.kind)
            {
                continue;
            }
            let Some((source_index, source)) =
                previous
                    .host_parameters
                    .iter()
                    .enumerate()
                    .find(|(_, source)| {
                        source.node == source_node && source.local_id == target.local_id
                    })
            else {
                continue;
            };
            if source.initial == target.initial
                && source.min == target.min
                && source.max == target.max
            {
                inherited.push(InheritedParameter {
                    source_index,
                    source_node,
                    id: target.local_id,
                    target_node: target.node,
                });
            }
        }
        let mut loops = Vec::new();
        for identity in &self.node_identities {
            if !matches!(
                identity.kind.as_str(),
                "loop-capture" | "retrospective-capture"
            ) {
                continue;
            }
            let source = nodes.iter().find(|node| {
                node["type"] == identity.kind
                    && match identity.path.as_deref() {
                        Some(path) => previous
                            .instances
                            .iter()
                            .any(|instance| instance.path == path && node["id"] == instance.node),
                        None => {
                            node["id"] == identity.id
                                && !previous
                                    .instances
                                    .iter()
                                    .any(|instance| u64::from(instance.node) == identity.id)
                        }
                    }
            });
            let Some(source) = source else {
                continue;
            };
            let target = self.document["signal"]["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .find(|node| node["id"] == identity.id)
                .unwrap();
            // Ring capacity is a resource contract. Constructor changes reset
            // this resource unless they produce the same prepared frame count.
            let frames = |node: &Value| {
                (self.sample_rate * node["a"].as_f64().unwrap() as f32).round() as usize
            };
            if frames(target) != frames(source) {
                continue;
            }
            let source_node = source["id"].as_u64().unwrap();
            fn asset(document: &Value, node: u64) -> Option<&Value> {
                document["assets"]
                    .as_array()
                    .and_then(|assets| assets.iter().find(|asset| asset["nodeId"] == node))
            }
            let same_asset = match (
                asset(&self.document, identity.id),
                asset(&previous.document, source_node),
            ) {
                (None, None) => true,
                (Some(next), Some(old)) => ["sourceRate", "frames", "pcmF32Base64"]
                    .iter()
                    .all(|key| next[*key] == old[*key]),
                _ => false,
            };
            if !same_asset {
                continue;
            }
            let parameters = std::array::from_fn(|id| {
                self.processor
                    .host_parameters()
                    .iter()
                    .find(|p| p.node == identity.id && p.local_id == id as u32)
                    .map_or(0., |p| p.initial)
            });
            let inherit = std::array::from_fn(|id| {
                inherited.iter().any(|p| {
                    p.target_node == identity.id
                        && p.source_node == source_node
                        && p.id == id as u32
                })
            });
            loops.push(LoopHistory {
                target_node: identity.id,
                source_node,
                parameters,
                inherit,
                transferred: false,
            });
        }
        // Decode/compare immutable resources only on the control thread. Shared
        // regions compare their effective source, not binding or numeric IDs.
        fn asset(document: &Value, node: u64) -> Option<&Value> {
            let source = document["sampleBindings"]
                .as_array()
                .and_then(|bindings| bindings.iter().find(|binding| binding["nodeId"] == node))
                .and_then(|binding| binding["sourceNodeId"].as_u64())
                .unwrap_or(node);
            document["assets"]
                .as_array()
                .and_then(|assets| assets.iter().find(|asset| asset["nodeId"] == source))
        }
        let mut resources = Vec::new();
        for identity in &self.node_identities {
            if !matches!(
                identity.kind.as_str(),
                "sample-region" | "sample-instrument" | "phase-vocoder"
            ) {
                continue;
            }
            let source = nodes.iter().find(|node| {
                node["type"] == identity.kind
                    && match identity.path.as_deref() {
                        Some(path) => previous
                            .instances
                            .iter()
                            .any(|instance| instance.path == path && node["id"] == instance.node),
                        None => {
                            node["id"] == identity.id
                                && !previous
                                    .instances
                                    .iter()
                                    .any(|instance| u64::from(instance.node) == identity.id)
                        }
                    }
            });
            let Some(source) = source else {
                continue;
            };
            let old_id = source["id"].as_u64().unwrap();
            let same = matches!(
                identity.kind.as_str(),
                "phase-vocoder" | "sample-instrument"
            ) || match (
                asset(&self.document, identity.id),
                asset(&previous.document, old_id),
            ) {
                (None, None) => true,
                (Some(next), Some(old)) => ["sourceRate", "frames", "pcmF32Base64"]
                    .iter()
                    .all(|key| next[*key] == old[*key]),
                _ => false,
            };
            // A trigger is a fresh action, even if the source is unchanged.
            let retrigger = identity.kind == "sample-region"
                && self.document["signal"]["initialParameters"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|p| {
                        p["nodeId"] == identity.id
                            && p["id"] == 7
                            && p["value"].as_f64().unwrap() >= 0.5
                    });
            if same && !retrigger {
                resources.push((identity.id, old_id));
            }
        }
        inherited.retain(|entry| {
            !self.node_identities.iter().any(|node| {
                node.id == entry.target_node
                    && matches!(node.kind.as_str(), "sample-region" | "sample-instrument")
            }) || resources.iter().any(|pair| pair.0 == entry.target_node)
        });
        resources.extend(
            loops
                .iter()
                .map(|history| (history.target_node, history.source_node)),
        );
        self.resource_history = resources;
        // Replaced clips/capacities start from candidate control intent; live
        // recording/overdub must not overwrite a newly authored asset.
        inherited.retain(|entry| {
            !self
                .node_identities
                .iter()
                .any(|node| node.id == entry.target_node && node.kind == "loop-capture")
                || loops
                    .iter()
                    .any(|history| history.target_node == entry.target_node)
        });
        self.loop_history = loops;
        self.authored_history = true;
        self.inherited_parameters = inherited;
        Ok(self.inherited_parameters.len())
    }

    /// Apply a precomputed inheritance table without allocation or locking.
    pub fn inherit_live_parameters_from(&mut self, previous: &Self) -> usize {
        let mut count = 0;
        for entry in &self.inherited_parameters {
            if self
                .loop_history
                .iter()
                .any(|history| history.transferred && history.target_node == entry.target_node)
            {
                continue;
            }
            let Some(source) = previous.processor.host_parameters().get(entry.source_index) else {
                continue;
            };
            if source.node != entry.source_node || source.local_id != entry.id {
                continue;
            }
            let value = previous
                .processor
                .plan
                .parameter_target(entry.source_node, entry.id)
                .unwrap_or(previous.processor.current_parameter_values()[entry.source_index]);
            count += usize::from(self.processor.set_parameter(
                entry.target_node.into(),
                entry.id,
                value,
            ));
        }
        count
    }

    /// Active capture staging owns its old runtime. Hosts retain the pending
    /// candidate and continue servicing the old runtime until staging finishes.
    pub fn live_history_ready_from(&self, previous: &Self) -> bool {
        self.sample_rate != previous.sample_rate
            || self.loop_history.iter().all(|history| {
                self.processor
                    .capture_staging_status(history.target_node)
                    .is_none()
                    && previous
                        .processor
                        .capture_staging_status(history.source_node)
                        .is_none()
            })
    }

    /// Unified block-boundary adoption for authored native/plug-in replacement.
    /// All resource intent and identity was prepared on the control thread.
    /// Call only when `live_history_ready_from` succeeds with exclusive access.
    /// Old storage remains owned by `previous` for control-thread retirement.
    pub fn adopt_live_replacement_from(
        &mut self,
        previous: &mut Self,
        preserve_retrospective: bool,
    ) -> usize {
        debug_assert!(self.live_history_ready_from(previous));
        let mut transferred = 0;
        for history in &mut self.loop_history {
            let mut parameters = history.parameters;
            for (id, value) in parameters.iter_mut().enumerate() {
                if history.inherit[id] {
                    if let Some(old) = previous
                        .processor
                        .plan
                        .parameter_target(history.source_node, id as u32)
                    {
                        *value = old;
                    }
                }
            }
            history.transferred = self.processor.plan.transfer_owned_loop_history(
                &mut previous.processor.plan,
                &[(history.target_node, history.source_node, parameters)],
            ) == 1;
            if history.transferred {
                self.processor
                    .refresh_loop_parameter_values(history.target_node);
                transferred += 1;
            }
        }
        self.inherit_live_parameters_from(previous);
        let next = &self.node_identities;
        let old = &previous.node_identities;
        transferred += self
            .processor
            .plan
            .transfer_owned_resource_history_by_resolver(
                &mut previous.processor.plan,
                &self.resource_history,
                |id| {
                    let new = next.iter().find(|node| node.id == id)?;
                    old.iter()
                        .find(|candidate| {
                            candidate.kind == new.kind
                                && match new.path.as_deref() {
                                    Some(path) => candidate.path.as_deref() == Some(path),
                                    None => candidate.id == id && candidate.path.is_none(),
                                }
                        })
                        .map(|node| node.id)
                },
            );
        self.processor.refresh_parameter_values_from_plan();
        transferred += self.transfer_live_graph_history_from(previous);
        if preserve_retrospective && !self.authored_history {
            transferred += self
                .processor
                .transfer_retrospective_history_from(&mut previous.processor);
        }
        transferred
    }

    /// Synchronized host-stop path; no callback may still own this processor.
    pub fn cancel_capture_staging_for_host_stop(&mut self) {
        for node in &self.node_identities {
            if matches!(node.kind.as_str(), "loop-capture" | "retrospective-capture") {
                self.processor.cancel_capture_staging(node.id);
            }
        }
    }

    /// Carry eligible state through a host graph import by stable instance path.
    /// Both bounded identity tables were allocated during graph preparation.
    pub fn transfer_live_graph_history_from(&mut self, previous: &Self) -> usize {
        let next = &self.node_identities;
        let old = &previous.node_identities;
        self.processor
            .transfer_live_state_by_resolver(&previous.processor, |new_id| {
                let new = next.iter().find(|node| node.id == new_id)?;
                old.iter()
                    .find(|candidate| {
                        candidate.kind == new.kind
                            && match new.path.as_deref() {
                                Some(path) => candidate.path.as_deref() == Some(path),
                                None => candidate.id == new_id && candidate.path.is_none(),
                            }
                    })
                    .map(|node| node.id)
            })
    }

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
        // The host synchronizes processing before saving. Copy stopped loop
        // rings on this control thread, never in the audio callback.
        for node in &self.node_identities {
            if node.kind != "loop-capture" || !self.processor.has_prepared_node(node.id.into()) {
                continue;
            }
            let node_id = node.id as u32;
            let frames = self
                .processor
                .plan
                .capture_length(node.id.into())
                .ok_or(ProjectError::Invalid("recording loop cannot be saved"))?;
            if frames == 0 {
                if let Some(assets) = self
                    .document
                    .get_mut("assets")
                    .and_then(Value::as_array_mut)
                {
                    assets.retain(|asset| asset["nodeId"] != node.id);
                }
                continue;
            }
            let mut stereo = vec![0.0; frames * 2];
            if self
                .processor
                .plan
                .copy_capture_interleaved(node.id.into(), 0, &mut stereo)
                != frames
            {
                return Err(ProjectError::Invalid("loop changed during save"));
            }
            let label = self
                .document
                .get("assets")
                .and_then(Value::as_array)
                .and_then(|assets| assets.iter().find(|asset| asset["nodeId"] == node.id))
                .and_then(|asset| asset["label"].as_str())
                .unwrap_or("Loop take")
                .to_owned();
            replace_sample_asset(
                &mut self.document,
                node_id,
                &stereo,
                self.sample_rate.round() as u32,
                &label,
                None,
            )?;
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
        self.prepare_sample_replacement_with_capture(
            node,
            stereo,
            source_rate,
            label,
            sample_rate,
            max_frames,
            None,
        )
    }

    fn prepare_sample_replacement_with_capture(
        &mut self,
        node: u32,
        stereo: &[f32],
        source_rate: u32,
        label: &str,
        sample_rate: f32,
        max_frames: usize,
        capture: Option<u32>,
    ) -> Result<Self, ProjectError> {
        self.save_state()?;
        let mut candidate = self.document.clone();
        replace_sample_asset(&mut candidate, node, stereo, source_rate, label, capture)?;
        let bytes = serde_json::to_vec(&candidate).map_err(|_| ProjectError::Invalid("JSON"))?;
        NativeProject::parse(&bytes)?.prepare_with_state(sample_rate, max_frames)
    }

    /// Finish a frozen native capture on a synchronized host control thread.
    /// The returned graph can be published by an adapter at a block boundary.
    pub fn prepare_staged_capture_replacement(
        &mut self,
        capture: u32,
        instrument: u32,
        label: &str,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<Self, ProjectError> {
        let frames = self
            .processor
            .capture_staged_length(capture.into())
            .ok_or(ProjectError::Invalid("staged capture unavailable"))?;
        if frames == 0 {
            return Err(ProjectError::Invalid("staged capture length"));
        }
        let mut stereo = manifold_core::io::prepare_planar_buffer(2, frames)
            .map_err(|_| ProjectError::Invalid("PCM allocation"))?;
        if self
            .processor
            .copy_capture_staged_interleaved(capture.into(), 0, &mut stereo)
            != frames
        {
            return Err(ProjectError::Invalid("staged capture changed"));
        }
        let source_rate = sample_rate.round() as u32;
        self.prepare_sample_replacement_with_capture(
            instrument,
            &stereo,
            source_rate,
            label,
            sample_rate,
            max_frames,
            Some(capture),
        )
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
    workspace_parameter(kind, id).map(|spec| (spec.min as f32, spec.max as f32, spec.discrete))
}

fn configured_parameter_range(kind: &str, node: &NodeKind, id: u32) -> Option<(f32, f32, bool)> {
    if kind == "mixer" {
        let NodeKind::Mixer { inputs, .. } = node else {
            return None;
        };
        return manifold_core::parameter_catalog::mixer_parameter(*inputs, id)
            .map(|spec| (spec.min as f32, spec.max as f32, spec.discrete));
    }
    parameter_range(kind, id)
}

impl NativeProject {
    /// Assemble a captured window into portable state on a host control thread.
    /// The returned bytes can be passed through the ordinary CLAP/VST3 state
    /// replacement path, which prepares a new graph before publication.
    pub fn embed_capture_asset(
        state: &[u8],
        capture: u32,
        instrument: u32,
        stereo: &[f32],
        source_rate: u32,
        label: &str,
    ) -> Result<Vec<u8>, ProjectError> {
        Self::embed_capture_asset_inner(
            state,
            capture,
            instrument,
            stereo,
            source_rate,
            label,
            None,
        )
    }

    pub fn embed_capture_asset_with_window(
        state: &[u8],
        capture: u32,
        instrument: u32,
        stereo: &[f32],
        source_rate: u32,
        label: &str,
        window: crate::host_transport::CaptureWindow,
    ) -> Result<Vec<u8>, ProjectError> {
        Self::embed_capture_asset_inner(
            state,
            capture,
            instrument,
            stereo,
            source_rate,
            label,
            Some(window),
        )
    }

    fn embed_capture_asset_inner(
        state: &[u8],
        capture: u32,
        instrument: u32,
        stereo: &[f32],
        source_rate: u32,
        label: &str,
        window: Option<crate::host_transport::CaptureWindow>,
    ) -> Result<Vec<u8>, ProjectError> {
        let parsed = Self::parse(state)?;
        let mut document = parsed.document;
        if let Some(window) = window {
            let signal = &mut document["signal"];
            match window {
                crate::host_transport::CaptureWindow::Seconds(seconds) => {
                    signal["captureWindowMode"] = serde_json::json!("seconds");
                    signal["captureWindowSeconds"] = serde_json::json!(seconds);
                }
                crate::host_transport::CaptureWindow::Free => {
                    signal["captureWindowMode"] = serde_json::json!("free");
                    signal["captureWindowSeconds"] =
                        serde_json::json!((stereo.len() / 2) as f64 / f64::from(source_rate));
                }
                crate::host_transport::CaptureWindow::Bars {
                    bars,
                    tempo_bpm,
                    numerator,
                    denominator,
                } => {
                    signal["captureWindowMode"] = serde_json::json!("bars");
                    signal["captureWindowBars"] = serde_json::json!(bars);
                    signal["captureTempoBpm"] = serde_json::json!(tempo_bpm);
                    signal["captureTimeSignatureNumerator"] = serde_json::json!(numerator);
                    signal["captureTimeSignatureDenominator"] = serde_json::json!(denominator);
                    signal["captureWindowSeconds"] =
                        serde_json::json!((stereo.len() / 2) as f64 / f64::from(source_rate));
                }
            }
        }
        replace_sample_asset(
            &mut document,
            instrument,
            stereo,
            source_rate,
            label,
            Some(capture),
        )?;
        let bytes = serde_json::to_vec(&document).map_err(|_| ProjectError::Invalid("JSON"))?;
        Self::parse(&bytes)?;
        Ok(bytes)
    }

    /// Read the authored Standalone FX project used by the browser module.
    /// Translate its public metadata envelope to the graph-workspace contract
    /// while preserving the original envelope for native state roundtrips.
    pub fn parse_fx_module(json: &[u8]) -> Result<Self, ProjectError> {
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
        let root: Value =
            serde_json::from_slice(json).map_err(|_| ProjectError::Invalid("JSON"))?;
        let doc = object(
            &root,
            &["format", "schemaVersion", "projectId", "signal"],
            &[
                "assets",
                "sampleBindings",
                "targets",
                "temporal",
                "hostBindings",
                "hostAssignments",
                "endpoints",
                "controls",
                "instances",
                "liveAuthoring",
            ],
        )?;
        if let Some(metadata) = doc.get("liveAuthoring") {
            let authoring = object(
                metadata,
                &["format", "version", "source", "view"],
                &["eventState", "eventStateSchema", "network", "files", "composition"],
            )?;
            // Opaque authoring metadata to the DSP host. The shared authoring
            // runtime validates definitions, module closure and typed links;
            // native audio validates the versioned container without authoring quotas.
            if let Some(composition) = authoring.get("composition") {
                let fields=object(composition,&["version","definitions","nodes","connections"],&["groups"])?;
                if let Some(groups) = fields.get("groups") {
                    if !groups.is_array() {
                        return Err(ProjectError::Invalid("composition groups"));
                    }
                }
                if !matches!(required(fields,"version").as_u64(), Some(1 | 2 | 3 | 4)) {
                    return Err(ProjectError::Invalid("composition version"));
                }
                for key in ["definitions", "nodes", "connections"] {
                    if !required(fields,key).is_array() {
                        return Err(ProjectError::Invalid("composition arrays"));
                    }
                }
            }
            if let Some(files) = authoring.get("files") {
                let entries = files.as_array()
                    .ok_or(ProjectError::Invalid("project files"))?;
                let mut paths = std::collections::HashSet::new();
                for file in entries {
                    let file = object(file, &["path", "mediaType", "encoding", "content"], &[])?;
                    let path = required(file, "path").as_str().ok_or(ProjectError::Invalid("project file path"))?;
                    let segments: Vec<_> = path.strip_prefix('/').unwrap_or("").split('/').collect();
                    if matches!(path, "/project.mjs" | "/presentation.mjs" | "/composition.json")
                        || !paths.insert(path) || segments.iter().any(|segment| segment.is_empty()
                            || segment == &"." || segment == &".." || segment.starts_with('.') || segment.ends_with('.')
                            || !segment.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.')))
                    { return Err(ProjectError::Invalid("project file path")); }
                    let extension = path.rsplit('.').next().unwrap_or("");
                    let (mime, binary) = match extension {
                        "mjs" | "js" => ("text/javascript", false),
                        "ts" => ("text/typescript", false),
                        "json" => ("application/json", false),
                        "css" => ("text/css", false),
                        "txt" => ("text/plain", false),
                        "svg" => ("image/svg+xml", false),
                        "png" => ("image/png", true),
                        "jpg" | "jpeg" => ("image/jpeg", true),
                        "webp" => ("image/webp", true),
                        "gif" => ("image/gif", true),
                        _ => return Err(ProjectError::Invalid("project file type")),
                    };
                    if required(file, "mediaType") != mime
                        || required(file, "encoding") != if binary { "base64" } else { "utf8" }
                    { return Err(ProjectError::Invalid("project file encoding")); }
                    let content = required(file, "content").as_str().ok_or(ProjectError::Invalid("project file content"))?;
                    if binary {
                        STANDARD.decode(content).map_err(|_| ProjectError::Invalid("project file encoding"))?;
                    }
                }
            }
            if let Some(network) = authoring.get("network") {
                let settings = object(network, &[], &["tcp", "udp", "osc", "oscQuery", "link"])?;
                for key in ["tcp", "udp", "osc", "oscQuery"] {
                    if settings
                        .get(key)
                        .is_some_and(|v| !v.as_str().is_some_and(|s| s.len() <= 128))
                    {
                        return Err(ProjectError::Invalid("network address"));
                    }
                }
                if let Some(link) = settings.get("link") {
                    let link = object(
                        link,
                        &[],
                        &[
                            "enabled",
                            "tempoSync",
                            "startStopSync",
                            "playing",
                            "tempo",
                            "quantum",
                        ],
                    )?;
                    for key in ["enabled", "tempoSync", "startStopSync", "playing"] {
                        if link.get(key).is_some_and(|v| !v.is_boolean()) {
                            return Err(ProjectError::Invalid("Link setting"));
                        }
                    }
                    for (key, min, max) in [("tempo", 20.0, 300.0), ("quantum", 0.25, 64.0)] {
                        if link.get(key).is_some_and(|v| {
                            !v.as_f64()
                                .is_some_and(|v| v.is_finite() && v >= min && v <= max)
                        }) {
                            return Err(ProjectError::Invalid("Link setting"));
                        }
                    }
                }
            }
            if required(authoring, "format") != "manifold.live-project"
                || required(authoring, "version") != 1
                || required(authoring, "source")
                    .as_str()
                    .is_none()
                || required(authoring, "view")
                    .as_array()
                    .is_none()
            {
                return Err(ProjectError::Invalid("live authoring metadata"));
            }
            if authoring.get("eventStateSchema").is_some_and(|v| {
                !v.is_null() && v.as_str().is_none_or(|s| s.is_empty())
            })
            {
                return Err(ProjectError::Invalid("live event metadata"));
            }
        }
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
                "io",
                "selectedCaptureNodeId",
                "captureSources",
                "defaultCaptureSourceId",
                "selectedCaptureSourceId",
                "captureWindowSeconds",
                "captureWindowMode",
                "captureWindowBars",
                "captureTempoBpm",
                "captureTimeSignatureNumerator",
                "captureTimeSignatureDenominator",
            ],
        )?;
        if !signal.contains_key("io")
            && (required(signal, "inputs") != 2 || required(signal, "outputs") != 2)
        {
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
            if !seconds.as_f64().is_some_and(|v| v.is_finite() && v > 0.0) {
                return Err(ProjectError::Invalid("capture window seconds"));
            }
        }
        if signal
            .get("captureWindowMode")
            .is_some_and(|mode| mode != "seconds" && mode != "bars" && mode != "free")
        {
            return Err(ProjectError::Invalid("capture window mode"));
        }
        if let Some(bars) = signal.get("captureWindowBars") {
            if !bars.as_f64().is_some_and(|v| v.is_finite() && v > 0.0) {
                return Err(ProjectError::Invalid("capture window bars"));
            }
        }
        if let Some(tempo) = signal.get("captureTempoBpm") {
            float(tempo, 20.0, 300.0)?;
        }
        for key in [
            "captureTimeSignatureNumerator",
            "captureTimeSignatureDenominator",
        ] {
            if let Some(value) = signal.get(key) {
                let number = value
                    .as_u64()
                    .ok_or(ProjectError::Invalid("capture meter"))?;
                if !(1..=128).contains(&number) {
                    return Err(ProjectError::Invalid("capture meter"));
                }
            }
        }
        if signal.get("captureTimeSignatureNumerator").is_some()
            != signal.get("captureTimeSignatureDenominator").is_some()
        {
            return Err(ProjectError::Invalid("capture meter"));
        }
        if signal
            .get("captureWindowMode")
            .is_some_and(|mode| mode == "bars")
            && (signal.get("captureWindowBars").is_none()
                || signal.get("captureTempoBpm").is_none())
        {
            return Err(ProjectError::Invalid("capture bar timing"));
        }
        let nodes = required(signal, "nodes")
            .as_array()
            .ok_or(ProjectError::Invalid("nodes"))?;
        if nodes.len() < 2 {
            return Err(ProjectError::Invalid("node count"));
        }
        let mut graph = GraphDescription {
            nodes: Vec::with_capacity(nodes.len()),
            connections: Vec::new(),
        };
        let mut kinds = BTreeMap::new();
        for node in nodes {
            let entry = object(node, &["id", "type"], &["a", "b"])?;
            let id = uint(required(entry, "id"), u64::from(u32::MAX))?;
            if id == 0 || kinds.contains_key(&id) {
                return Err(ProjectError::Invalid("node id"));
            }
            let kind = required(entry, "type")
                .as_str()
                .ok_or(ProjectError::Invalid("node type"))?;
            let spec = workspace_type(kind)
                .ok_or_else(|| ProjectError::UnsupportedNode(kind.to_owned()))?;
            if entry.len() != 2 + usize::from(spec.arg_count)
                || spec.arg_count >= 1 && !entry.contains_key("a")
                || spec.arg_count >= 2 && !entry.contains_key("b")
            {
                return Err(ProjectError::Invalid("node arguments"));
            }
            let argument = |name, default| -> Result<f64, ProjectError> {
                entry.get(name).map_or(Ok(default), |value| {
                    value
                        .as_f64()
                        .ok_or(ProjectError::Invalid("node arguments"))
                })
            };
            let arguments = [argument("a", spec.a)?, argument("b", spec.b)?];
            if !spec.valid_arguments(arguments) {
                return Err(ProjectError::Invalid("node arguments"));
            }
            let constructed =
                NodeKind::from_abi_code(spec.code, arguments[0] as f32, arguments[1] as f32)
                    .filter(|node| spec.matches_kind(node))
                    .ok_or(ProjectError::Invalid("node arguments"))?;
            if (id == 1 && kind != "input.raw")
                || (id == 3) != (kind == "output")
                || !signal.contains_key("io") && (id == 1) != (kind == "input.raw")
            {
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
            let id = uint(selected, u64::from(u32::MAX))?;
            if !matches!(
                kinds.get(&id).map(String::as_str),
                Some("loop-capture" | "retrospective-capture")
            ) {
                return Err(ProjectError::Invalid("selected capture source"));
            }
        }
        if signal.get("captureSources").is_some()
            || signal.get("defaultCaptureSourceId").is_some()
            || signal.get("selectedCaptureSourceId").is_some()
        {
            let sources = signal
                .get("captureSources")
                .and_then(Value::as_array)
                .ok_or(ProjectError::Invalid("capture sources"))?;
            if sources.is_empty() {
                return Err(ProjectError::Invalid("capture sources"));
            }
            let mut ids = BTreeSet::new();
            let mut node_ids = BTreeSet::new();
            let mut selected_node = None;
            let default_id = uint(
                signal
                    .get("defaultCaptureSourceId")
                    .ok_or(ProjectError::Invalid("default capture source"))?,
                255,
            )?;
            let selected_id = uint(
                signal
                    .get("selectedCaptureSourceId")
                    .ok_or(ProjectError::Invalid("selected capture source"))?,
                255,
            )?;
            for source in sources {
                let entry = object(source, &["id", "nodeId", "name", "kind"], &[])?;
                let id = uint(required(entry, "id"), 255)?;
                let node_id = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
                let name = required(entry, "name")
                    .as_str()
                    .ok_or(ProjectError::Invalid("capture source name"))?;
                let kind = required(entry, "kind")
                    .as_str()
                    .ok_or(ProjectError::Invalid("capture source kind"))?;
                if !ids.insert(id)
                    || !node_ids.insert(node_id)
                    || !matches!(
                        kinds.get(&node_id).map(String::as_str),
                        Some("loop-capture" | "retrospective-capture")
                    )
                    || name.is_empty()
                    || name.trim() != name
                    || name.len() > 80
                    || !matches!(kind, "input" | "sidechain" | "layer" | "custom")
                {
                    return Err(ProjectError::Invalid("capture source"));
                }
                if id == selected_id {
                    selected_node = Some(node_id);
                }
            }
            if !ids.contains(&default_id)
                || selected_node
                    != signal
                        .get("selectedCaptureNodeId")
                        .and_then(Value::as_u64)
                        .map(|id| id as u32)
            {
                return Err(ProjectError::Invalid("selected capture source"));
            }
        }
        let edges = required(signal, "connections")
            .as_array()
            .ok_or(ProjectError::Invalid("connections"))?;
        for edge in edges {
            let edge = object(edge, &["from", "to", "inputPort"], &["outputPort"])?;
            graph.connections.push(Connection {
                from: uint(required(edge, "from"), u64::from(u32::MAX))?.into(),
                to: uint(required(edge, "to"), u64::from(u32::MAX))?.into(),
                input_port: uint(required(edge, "inputPort"), u64::from(u32::MAX))? as usize,
                output_port: edge
                    .get("outputPort")
                    .map(|value| uint(value, u64::from(u32::MAX)))
                    .transpose()?
                    .unwrap_or(0) as usize,
            });
        }
        let parameters = required(signal, "initialParameters")
            .as_array()
            .ok_or(ProjectError::Invalid("parameters"))?;
        let mut parsed_parameters = Vec::with_capacity(parameters.len());
        let mut host_parameters = Vec::with_capacity(parameters.len());
        let mut seen = BTreeSet::new();
        for parameter in parameters {
            let entry = object(parameter, &["nodeId", "id", "value"], &[])?;
            let node = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
            let id = uint(required(entry, "id"), u64::from(u32::MAX))?;
            let kind = kinds
                .get(&node)
                .ok_or(ProjectError::Invalid("parameter node"))?;
            let constructed = &graph
                .nodes
                .iter()
                .find(|entry| entry.id == u64::from(node))
                .ok_or(ProjectError::Invalid("parameter node"))?
                .kind;
            let (min, max, discrete) = configured_parameter_range(kind, constructed, id)
                .ok_or(ProjectError::Invalid("parameter id"))?;
            let value = float(required(entry, "value"), min, max)?;
            if discrete && value.fract() != 0.0 || !seen.insert((node, id)) {
                return Err(ProjectError::Invalid("parameter value"));
            }
            parsed_parameters.push(Parameter { node, id, value });
            host_parameters.push(HostParameter::new(node, id, min, max, discrete, value));
            if kind == "phase-vocoder" && id == 4 {
                let Some(NodeSpec {
                    kind: NodeKind::PhaseVocoder { params },
                    ..
                }) = graph
                    .nodes
                    .iter_mut()
                    .find(|entry| entry.id == u64::from(node))
                else {
                    return Err(ProjectError::Invalid("vocoder node"));
                };
                params[4] = value;
            }
        }
        for (&node, kind) in &kinds {
            let constructed = &graph
                .nodes
                .iter()
                .find(|entry| entry.id == u64::from(node))
                .unwrap()
                .kind;
            if (0..=64).any(|id| {
                configured_parameter_range(kind, constructed, id).is_some()
                    && !seen.contains(&(node, id))
                    && !(kind == "sample-region" && (9..=11).contains(&id))
            }) {
                return Err(ProjectError::Invalid("missing parameter"));
            }
        }
        let mut instances = Vec::new();
        if let Some(raw) = doc.get("instances") {
            let entries = raw.as_array().ok_or(ProjectError::Invalid("instances"))?;
            let mut paths = BTreeSet::new();
            let mut nodes = BTreeSet::new();
            for entry in entries {
                let entry = object(entry, &["path", "nodeId"], &[])?;
                let path = required(entry, "path")
                    .as_str()
                    .ok_or(ProjectError::Invalid("instance path"))?;
                let valid_path = path.starts_with('/')
                    && path[1..].split('/').all(|segment| {
                        !segment.is_empty()
                            && segment.bytes().all(|byte| {
                                byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
                            })
                    });
                let node = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
                if !valid_path
                    || !kinds.contains_key(&node)
                    || !paths.insert(path.to_owned())
                    || !nodes.insert(node)
                {
                    return Err(ProjectError::Invalid("instance binding"));
                }
                instances.push(NamedInstance {
                    path: path.to_owned(),
                    node,
                });
            }
            instances.sort_by(|a, b| a.path.cmp(&b.path));
        }
        let mut endpoints = Vec::new();
        if let Some(raw) = doc.get("endpoints") {
            let entries = raw.as_array().ok_or(ProjectError::Invalid("endpoints"))?;
            let mut paths = BTreeSet::new();
            let mut targets = BTreeSet::new();
            for entry in entries {
                let entry = object(
                    entry,
                    &["path", "kind", "nodeId", "id", "min", "max", "default"],
                    &[],
                )?;
                let path = required(entry, "path")
                    .as_str()
                    .ok_or(ProjectError::Invalid("endpoint path"))?;
                let valid_path = path.starts_with('/')
                    && path[1..].split('/').all(|segment| {
                        !segment.is_empty()
                            && segment.bytes().all(|byte| {
                                byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
                            })
                    });
                if !valid_path
                    || required(entry, "kind") != "parameter"
                    || !paths.insert(path.to_owned())
                {
                    return Err(ProjectError::Invalid("endpoint path"));
                }
                let node = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
                let id = uint(required(entry, "id"), u64::from(u32::MAX))?;
                let kind = kinds
                    .get(&node)
                    .ok_or(ProjectError::Invalid("endpoint node"))?;
                let spec = workspace_parameter(kind, id)
                    .ok_or(ProjectError::Invalid("endpoint parameter"))?;
                let min = required(entry, "min")
                    .as_f64()
                    .ok_or(ProjectError::Invalid("endpoint range"))?;
                let max = required(entry, "max")
                    .as_f64()
                    .ok_or(ProjectError::Invalid("endpoint range"))?;
                let default = required(entry, "default")
                    .as_f64()
                    .ok_or(ProjectError::Invalid("endpoint range"))?;
                if !seen.contains(&(node, id))
                    || !targets.insert((node, id))
                    || !min.is_finite()
                    || !max.is_finite()
                    || !default.is_finite()
                    || min < spec.min
                    || max > spec.max
                    || (min as f32) >= (max as f32)
                    || default < min
                    || default > max
                    || spec.discrete && [min, max, default].iter().any(|value| value.fract() != 0.0)
                    || parsed_parameters.iter().any(|parameter| {
                        parameter.node == node
                            && parameter.id == id
                            && (parameter.value < min as f32 || parameter.value > max as f32)
                    })
                {
                    return Err(ProjectError::Invalid("endpoint range"));
                }
                endpoints.push(ParameterEndpoint {
                    path: path.to_owned(),
                    node,
                    id,
                    min,
                    max,
                    default,
                });
                if let Some(host) = host_parameters
                    .iter_mut()
                    .find(|parameter| parameter.node == u64::from(node) && parameter.local_id == id)
                {
                    host.min = min as f32;
                    host.max = max as f32;
                }
            }
            endpoints.sort_by(|a, b| a.path.cmp(&b.path));
        }
        let mut controls = Vec::new();
        if let Some(raw) = doc.get("controls") {
            let entries = raw.as_array().ok_or(ProjectError::Invalid("controls"))?;
            let mut paths: BTreeSet<_> = endpoints
                .iter()
                .map(|endpoint| endpoint.path.clone())
                .collect();
            for entry in entries {
                let entry = object(
                    entry,
                    &["path", "min", "max", "default", "value", "discrete"],
                    &[],
                )?;
                let path = required(entry, "path")
                    .as_str()
                    .ok_or(ProjectError::Invalid("control path"))?;
                let valid_path = path.starts_with('/')
                    && path[1..].split('/').all(|segment| {
                        !segment.is_empty()
                            && segment.bytes().all(|byte| {
                                byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
                            })
                    });
                if !valid_path || !paths.insert(path.to_owned()) {
                    return Err(ProjectError::Invalid("control path"));
                }
                let number = |key| {
                    required(entry, key)
                        .as_f64()
                        .ok_or(ProjectError::Invalid("control value"))
                };
                let min = number("min")?;
                let max = number("max")?;
                let default = number("default")?;
                let value = number("value")?;
                let discrete = required(entry, "discrete")
                    .as_bool()
                    .ok_or(ProjectError::Invalid("control type"))?;
                if ![min, max, default, value]
                    .iter()
                    .all(|number| number.is_finite() && number.abs() <= f32::MAX as f64)
                    || (min as f32) >= (max as f32)
                    || default < min
                    || default > max
                    || value < min
                    || value > max
                    || discrete
                        && [min, max, default, value]
                            .iter()
                            .any(|number| number.fract() != 0.0)
                {
                    return Err(ProjectError::Invalid("control range"));
                }
                controls.push(ProjectControl {
                    path: path.to_owned(),
                    min,
                    max,
                    default,
                    value,
                    discrete,
                });
            }
            controls.sort_by(|a, b| a.path.cmp(&b.path));
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
        if let Some(assignments) = doc.get("hostAssignments") {
            let assignments = assignments.as_array().ok_or(ProjectError::Invalid("host assignments"))?;
            let mut slots = BTreeSet::new();
            let mut paths = BTreeSet::new();
            for assignment in assignments {
                let entry = object(assignment, &["slot"], &["path"])?;
                let slot = uint(required(entry, "slot"), u64::from(u32::MAX - HOST_SLOT_BASE))?;
                if !slots.insert(slot) { return Err(ProjectError::Invalid("host assignment slot")); }
                let Some(path) = entry.get("path") else { continue; };
                let path = path.as_str().ok_or(ProjectError::Invalid("host assignment path"))?;
                if !path.starts_with('/') || path[1..].split('/').any(|p| p.is_empty()
                    || !p.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-'))
                    || !paths.insert(path) {
                    return Err(ProjectError::Invalid("host assignment identity"));
                }
            }
        }
        let mut host_bindings = Vec::new();
        if let Some(raw) = doc.get("hostBindings") {
            let entries = raw
                .as_array()
                .ok_or(ProjectError::Invalid("host bindings"))?;
            let mut slots = BTreeSet::new();
            let mut targets = BTreeSet::new();
            for entry in entries {
                let entry = object(entry, &["slot", "nodeId", "id"], &[])?;
                let slot = uint(required(entry, "slot"), u64::from(u32::MAX - HOST_SLOT_BASE))?;
                let node = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
                let id = uint(required(entry, "id"), u64::from(u32::MAX))?;
                let graph_parameter = crate::parameters::graph_parameter_id(node, id);
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
        if let Some(assignments) = doc.get("hostAssignments").and_then(Value::as_array) {
            for assignment in assignments {
                if assignment.get("path").is_none() { continue; }
                let slot = assignment["slot"].as_u64().unwrap() as u32;
                if let Some(binding) = host_bindings.iter().find(|b| b.slot == slot) {
                    let endpoint = endpoints.iter().find(|e| assignment["path"] == e.path);
                    if !endpoint.is_some_and(|e| crate::parameters::graph_parameter_id(e.node, e.id) == binding.graph_parameter) {
                        return Err(ProjectError::Invalid("reserved host slot"));
                    }
                }
            }
        }
        let mut ordered: Vec<_> = host_parameters
            .iter()
            .map(|parameter| parameter.id)
            .collect();
        ordered.sort_unstable();
        for graph_parameter in ordered.into_iter().filter(|_| !doc.contains_key("hostBindings") && !doc.contains_key("hostAssignments")) {
            if host_bindings
                .iter()
                .any(|binding| binding.graph_parameter == graph_parameter)
            {
                continue;
            }
            let slot = (0..=u32::MAX - HOST_SLOT_BASE)
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
        let mut targets = Vec::with_capacity(raw_targets.len());
        let mut target_keys = BTreeSet::new();
        for target in raw_targets {
            let entry = object(target, &["nodeId", "target", "fundamental", "values"], &[])?;
            let node = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
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
        let mut assets = Vec::with_capacity(encoded_assets.len());
        let mut asset_nodes = BTreeSet::new();
        for asset in encoded_assets {
            let entry = object(
                asset,
                &["nodeId", "sourceRate", "frames", "label", "pcmF32Base64"],
                &[],
            )?;
            let node = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
            if !matches!(
                kinds.get(&node).map(String::as_str),
                Some(
                    "sample-instrument"
                        | "sample-region"
                        | "granulator"
                        | "main-voice-bank"
                        | "loop-capture"
                )
            ) || !asset_nodes.insert(node)
            {
                return Err(ProjectError::Invalid("asset node"));
            }
            let rate = uint(required(entry, "sourceRate"), 384_000)?;
            let frames = usize::try_from(uint(required(entry, "frames"), u64::MAX)?)
                .map_err(|_| ProjectError::Invalid("asset frame count"))?;
            required(entry, "label")
                .as_str()
                .ok_or(ProjectError::Invalid("asset label"))?;
            if rate < 8_000 || frames == 0 {
                return Err(ProjectError::Invalid("asset bounds"));
            }
            let pcm = required(entry, "pcmF32Base64")
                .as_str()
                .ok_or(ProjectError::Invalid("PCM encoding"))?;
            let byte_count = frames.checked_mul(8)
                .ok_or(ProjectError::Invalid("PCM size"))?;
            let encoded_count = byte_count.div_ceil(3).checked_mul(4)
                .ok_or(ProjectError::Invalid("PCM size"))?;
            if pcm.len() != encoded_count {
                return Err(ProjectError::Invalid("PCM size"));
            }
            let bytes = STANDARD
                .decode(pcm)
                .map_err(|_| ProjectError::Invalid("PCM encoding"))?;
            if bytes.len() != byte_count {
                return Err(ProjectError::Invalid("PCM size"));
            }
            let mut stereo = Vec::new();
            stereo.try_reserve_exact(frames * 2)
                .map_err(|_| ProjectError::Invalid("PCM allocation"))?;
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
        let encoded_bindings: &[Value] = match doc.get("sampleBindings") {
            None => &[],
            Some(Value::Array(values)) => values,
            _ => return Err(ProjectError::Invalid("sample bindings")),
        };
        let mut sample_bindings = Vec::with_capacity(encoded_bindings.len());
        let mut bound_targets = BTreeSet::new();
        for binding in encoded_bindings {
            let entry = object(binding, &["sourceNodeId", "nodeId"], &[])?;
            let source = uint(required(entry, "sourceNodeId"), u64::from(u32::MAX))?;
            let target = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
            if source == target
                || !asset_nodes.contains(&source)
                || asset_nodes.contains(&target)
                || !bound_targets.insert(target)
                || kinds.get(&source).map(String::as_str) != Some("sample-region")
                || kinds.get(&target).map(String::as_str) != Some("sample-region")
            {
                return Err(ProjectError::Invalid("sample binding"));
            }
            sample_bindings.push((source, target));
        }
        let raw_temporal: &[Value] = match doc.get("temporal") {
            None => &[],
            Some(Value::Array(values)) => values,
            Some(_) => return Err(ProjectError::Invalid("temporal recipes")),
        };
        let mut temporal = Vec::with_capacity(raw_temporal.len());
        let mut temporal_nodes = BTreeSet::new();
        for entry in raw_temporal {
            let entry = object(
                entry,
                &["nodeId", "mode", "speed", "smooth", "contrast", "recipe"],
                &[],
            )?;
            let node = uint(required(entry, "nodeId"), u64::from(u32::MAX))?;
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
        let io = signal
            .get("io")
            .map(|value| {
                IoLayout::from_json(value, &graph).map_err(|_| ProjectError::Invalid("I/O layout"))
            })
            .transpose()?;
        if let Some(layout) = &io {
            if required(signal, "inputs") != layout.inputs.iter().map(|b| b.channels).sum::<usize>()
                || required(signal, "outputs")
                    != layout.outputs.iter().map(|b| b.channels).sum::<usize>()
            {
                return Err(ProjectError::Invalid("I/O channel totals"));
            }
        }
        Ok(Self {
            document: root,
            graph,
            io,
            parameters: parsed_parameters,
            endpoints,
            controls,
            instances,
            host_parameters,
            host_bindings,
            assets,
            sample_bindings,
            targets,
            temporal,
            fx_type_parameters: None,
        })
    }

    pub(crate) fn host_parameter_display(&self, slot: usize, parameter: Option<HostParameter>)
        -> crate::parameters::HostParameterDisplay
    {
        let endpoint = parameter.and_then(|p| self.endpoints.iter()
            .find(|endpoint| u64::from(endpoint.node) == p.node && endpoint.id == p.local_id));
        let view = endpoint.and_then(|endpoint| self.document["liveAuthoring"]["view"].as_array()
            .and_then(|view| view.iter().find(|item| item["path"] == endpoint.path)));
        let reserved = self.document["hostAssignments"].as_array().and_then(|assignments|
            assignments.iter().find(|entry| entry["slot"].as_u64() == Some(slot as u64)))
            .and_then(|entry| entry["path"].as_str());
        let path = endpoint.map(|e| e.path.as_str()).or(reserved).unwrap_or("").trim_start_matches('/');
        let (module, leaf) = path.rsplit_once('/').unwrap_or(("", path));
        let name = view.and_then(|v| v["label"].as_str()).filter(|name| !name.is_empty())
            .map(str::to_owned).unwrap_or_else(|| {
                if leaf.is_empty() { format!("Automation {}", slot + 1) }
                else { leaf.replace(['-', '_'], " ") }
            });
        let unit = view.and_then(|v| v["unit"].as_str()).unwrap_or("").to_owned();
        let choices = view.and_then(|v| v["choices"].as_array()).map(|choices| {
            choices.iter().enumerate().filter_map(|(index, choice)| Some((
                view.and_then(|v| v["choiceValues"][index].as_f64()).unwrap_or(index as f64),
                choice.as_str()?.to_owned(),
            ))).collect()
        }).unwrap_or_default();
        let default_value = endpoint.map(|e| e.default as f32).or_else(|| parameter.map(|p| p.initial)).unwrap_or(0.);
        crate::parameters::HostParameterDisplay { name, module: module.to_owned(), unit, parameter, default_value, choices }
    }

    pub fn host_parameters(&self) -> &[HostParameter] {
        &self.host_parameters
    }

    pub fn parameter_endpoints(&self) -> &[ParameterEndpoint] {
        &self.endpoints
    }

    pub fn endpoint(&self, path: &str) -> Option<&ParameterEndpoint> {
        self.endpoints.iter().find(|endpoint| endpoint.path == path)
    }

    pub fn controls(&self) -> &[ProjectControl] {
        &self.controls
    }

    pub fn instances(&self) -> &[NamedInstance] {
        &self.instances
    }

    pub fn instance(&self, path: &str) -> Option<&NamedInstance> {
        self.instances.iter().find(|instance| instance.path == path)
    }

    pub fn control(&self, path: &str) -> Option<&ProjectControl> {
        self.controls.iter().find(|control| control.path == path)
    }

    pub fn endpoint_host_slot(&self, path: &str) -> Option<u32> {
        let endpoint = self.endpoint(path)?;
        let target = crate::parameters::graph_parameter_id(endpoint.node, endpoint.id);
        self.host_bindings
            .iter()
            .find(|binding| binding.graph_parameter == target)
            .map(|binding| binding.slot)
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
        self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<PreparedNativeProject, ProjectError> {
        self.prepare_with_state_inner(sample_rate, max_frames, false)
    }

    /// Prepare every graph node so a control thread can change routes between blocks.
    pub fn prepare_patchable(
        self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<NativeProcessor, ProjectError> {
        self.prepare_with_state_inner(sample_rate, max_frames, true)
            .map(|prepared| prepared.processor)
    }

    pub fn prepare_patchable_with_state(
        self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<PreparedNativeProject, ProjectError> {
        self.prepare_with_state_inner(sample_rate, max_frames, true)
    }

    fn prepare_with_state_inner(
        mut self,
        sample_rate: f32,
        max_frames: usize,
        patchable: bool,
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
        let mut processor = if let Some(layout) = &self.io {
            NativeProcessor::prepare_with_io(
                &self.graph,
                layout,
                sample_rate,
                max_frames,
                patchable,
            )
        } else if patchable {
            NativeProcessor::prepare_patchable(&self.graph, sample_rate, max_frames)
        } else {
            NativeProcessor::prepare(&self.graph, sample_rate, max_frames)
        }
        .map_err(ProjectError::Prepare)?;
        let mut loop_specs = Vec::new();
        let mut capture_capacity = 0;
        for node in &self.graph.nodes {
            if !matches!(node.kind, NodeKind::LoopCapture { .. } | NodeKind::RetrospectiveCapture { .. }) { continue; }
            // Disconnected non-patchable loops can be absent from the plan.
            let Some(frames) = processor.capture_capacity(node.id) else { continue; };
            if !processor.reserve_capture_staging(node.id, frames) {
                return Err(ProjectError::Invalid("capture staging allocation"));
            }
            capture_capacity = capture_capacity.max(frames);
            if matches!(node.kind, NodeKind::LoopCapture { .. })
                && processor.has_prepared_node(node.id)
            {
                loop_specs.push((node.id as u32, frames));
            }
        }
        if let Some(table) = self.fx_type_parameters {
            for (effect_type, values) in table.into_iter().enumerate() {
                if !processor.restore_effect_slot_params(2_u32.into(), effect_type as u32, values) {
                    return Err(ProjectError::Invalid("FX type controls"));
                }
            }
        }
        let loop_asset_nodes: BTreeSet<u32> = self
            .assets
            .iter()
            .filter_map(|asset| {
                self.graph
                    .nodes
                    .iter()
                    .find(|node| node.id == u64::from(asset.node))
                    .and_then(|node| {
                        matches!(node.kind, NodeKind::LoopCapture { .. }).then_some(asset.node)
                    })
            })
            .collect();
        let loop_controls: Vec<_> = self
            .parameters
            .iter()
            .filter(|parameter| loop_asset_nodes.contains(&parameter.node))
            .map(|parameter| (parameter.node, parameter.id, parameter.value))
            .collect();
        for parameter in self.parameters {
            if !processor.has_prepared_node(parameter.node.into()) {
                continue;
            }
            if !processor.set_parameter(parameter.node.into(), parameter.id, parameter.value) {
                return Err(ProjectError::Invalid("unavailable parameter"));
            }
        }
        // The document's initial values are the audible state at sample zero.
        // Settle smoothing after applying them, before any asset or event can run.
        processor.reset_processing();
        for asset in self.assets {
            if !processor.has_prepared_node(asset.node.into()) {
                continue;
            }
            if !processor.load_sample_stereo(asset.node.into(), asset.stereo, asset.rate) {
                return Err(ProjectError::Invalid("unavailable sample slot"));
            }
        }
        for (node, id, value) in loop_controls {
            if !processor.set_parameter(node.into(), id, value) {
                return Err(ProjectError::Invalid("loop controls"));
            }
        }
        for (source, target) in self.sample_bindings {
            if !processor.has_prepared_node(target.into()) {
                continue;
            }
            if !processor.share_sample_region(source.into(), target.into()) {
                return Err(ProjectError::Invalid("unavailable sample binding"));
            }
        }
        for target in self.targets {
            if !processor.has_prepared_node(target.node.into()) {
                continue;
            }
            if !processor.load_partials_target(target.node.into(), target.index, target.partials) {
                return Err(ProjectError::Invalid("unavailable partial target"));
            }
        }
        for (node, speed, frames, recipe) in prepared_temporal {
            if !processor.has_prepared_node(node.into()) {
                continue;
            }
            if !processor.load_main_temporal_frames(node.into(), frames, recipe)
                || !processor.set_main_temporal_speed(node.into(), speed)
            {
                return Err(ProjectError::Invalid("unavailable temporal source"));
            }
        }
        processor.current_parameter_values =
            self.host_parameters.iter().map(|p| p.initial).collect();
        processor.host_parameters = self.host_parameters;
        for &(node, _) in &loop_specs {
            processor.refresh_loop_parameter_values(node.into());
        }
        processor.refresh_parameter_values_from_plan();
        for binding in self.host_bindings {
            processor.slot_bindings.insert(binding.slot, binding.graph_parameter);
        }
        let node_identities = document["signal"]["nodes"]
            .as_array()
            .expect("validated graph nodes")
            .iter()
            .map(|node| {
                let id = node["id"].as_u64().expect("validated node ID");
                PreparedNodeIdentity {
                    id,
                    kind: node["type"]
                        .as_str()
                        .expect("validated node type")
                        .to_owned(),
                    path: self
                        .instances
                        .iter()
                        .find(|instance| u64::from(instance.node) == id)
                        .map(|instance| instance.path.clone()),
                }
            })
            .collect();
        Ok(PreparedNativeProject {
            processor,
            document,
            node_identities,
            inherited_parameters: Vec::new(),
            loop_history: Vec::new(),
            resource_history: Vec::new(),
            authored_history: false,
            sample_rate,
            loop_specs,
            capture_capacity,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_core::node_catalog::WORKSPACE_TYPES;

    #[test]
    fn nacre_project_visual_assets_load_natively_and_reject_bad_file_data() {
        let baseline = include_bytes!("../../../web/public/nacre/2026-10-10-graph/nacre-prism-bend.manifold.json");
        let creator: Value = serde_json::from_slice(baseline).unwrap();
        let mut project = creator["graph"].clone();
        project["liveAuthoring"] = serde_json::json!({
            "format": creator["format"], "version": creator["version"],
            "source": creator["source"], "view": creator["view"], "files": creator["files"]
        });
        NativeProject::parse(&serde_json::to_vec(&project).unwrap()).unwrap();
        assert_eq!(project["liveAuthoring"]["files"][0]["path"], "/assets/nacre-sigil.svg");

        project["liveAuthoring"]["files"][0]["path"] = "/assets/../sigil.svg".into();
        assert!(NativeProject::parse(&serde_json::to_vec(&project).unwrap()).is_err());
        project["liveAuthoring"]["files"][0]["path"] = "/assets/nacre-sigil.svg".into();
        project["liveAuthoring"]["files"].as_array_mut().unwrap().push(serde_json::json!({
            "path": "/assets/noise.png", "mediaType": "image/png", "encoding": "base64", "content": "invalid!"
        }));
        assert!(NativeProject::parse(&serde_json::to_vec(&project).unwrap()).is_err());
    }

    #[test]
    fn structural_edit_inherits_latest_unchanged_targets_by_path_and_keeps_explicit_edits() {
        let baseline =
            include_bytes!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
        let mut active = NativeProject::parse(baseline)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let mut candidate: Value = serde_json::from_slice(baseline).unwrap();
        for node in candidate["signal"]["nodes"].as_array_mut().unwrap() {
            if node["id"] == 4 {
                node["id"] = 14.into();
            }
        }
        for edge in candidate["signal"]["connections"].as_array_mut().unwrap() {
            for key in ["from", "to"] {
                if edge[key] == 4 {
                    edge[key] = 14.into();
                }
            }
        }
        for parameter in candidate["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
        {
            if parameter["nodeId"] == 4 {
                parameter["nodeId"] = 14.into();
            }
            if parameter["nodeId"] == 5 && parameter["id"] == 0 {
                parameter["value"] = 0.8.into();
            }
        }
        for key in ["instances", "endpoints", "hostBindings"] {
            for entry in candidate[key].as_array_mut().unwrap() {
                if entry["nodeId"] == 4 {
                    entry["nodeId"] = 14.into();
                }
            }
        }
        let mut next = NativeProject::parse(&serde_json::to_vec(&candidate).unwrap())
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        next.plan_parameter_inheritance(baseline).unwrap();
        assert!(active.processor.set_parameter(4_u32.into(), 0, 0.625));
        assert!(active.processor.set_parameter(5_u32.into(), 0, 0.33));
        next.inherit_live_parameters_from(&active);
        let saved: Value = serde_json::from_slice(&next.save_state().unwrap()).unwrap();
        let value = |node| {
            saved["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|p| p["nodeId"] == node && p["id"] == 0)
                .unwrap()["value"]
                .as_f64()
                .unwrap()
        };
        assert_eq!(value(14), 0.625);
        assert!((value(5) - 0.8).abs() < 1e-6);
    }

    #[test]
    fn route_loop_state_merge_rejects_a_different_node_table() {
        let fixture =
            include_bytes!("../../../projects/graph-workspace/authored-live-loop-route.json");
        let staged =
            NativeProject::stage_live_route(fixture, 4, "b", Some((2, "out")), 48_000., 128)
                .unwrap();
        let mut different: Value = serde_json::from_slice(fixture).unwrap();
        different["signal"]["nodes"][1]["id"] = Value::from(8);
        let different = serde_json::to_vec(&different).unwrap();
        assert_eq!(
            NativeProject::merge_route_loop_state(&staged.document, &different),
            Err(ProjectError::Invalid("route node table changed"))
        );
    }
    use manifold_core::parameter_catalog::workspace_parameters;

    #[test]
    fn prepared_host_import_carries_named_widener_history_across_node_renumbering() {
        let source =
            include_bytes!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
        let mut document: Value = serde_json::from_slice(source).unwrap();
        for node in document["signal"]["nodes"].as_array_mut().unwrap() {
            if node["id"] == 5 {
                node["id"] = 15.into();
            }
        }
        for edge in document["signal"]["connections"].as_array_mut().unwrap() {
            if edge["from"] == 5 {
                edge["from"] = 15.into();
            }
            if edge["to"] == 5 {
                edge["to"] = 15.into();
            }
        }
        for field in ["initialParameters"] {
            for entry in document["signal"][field].as_array_mut().unwrap() {
                if entry["nodeId"] == 5 {
                    entry["nodeId"] = 15.into();
                }
            }
        }
        for field in ["endpoints", "hostBindings", "instances"] {
            for entry in document[field].as_array_mut().unwrap() {
                if entry["nodeId"] == 5 {
                    entry["nodeId"] = 15.into();
                }
            }
        }
        let remapped = serde_json::to_vec(&document).unwrap();
        let prepare = |bytes: &[u8]| {
            NativeProject::parse(bytes)
                .unwrap()
                .prepare_with_state(48_000.0, 128)
                .unwrap()
        };
        let mut current = prepare(source);
        let mut expected = prepare(source);
        let mut next = prepare(&remapped);
        let left: [f32; 128] = std::array::from_fn(|i| ((i % 17) as f32 - 8.0) / 8.0);
        let right: [f32; 128] = std::array::from_fn(|i| ((i % 11) as f32 - 5.0) / 5.0);
        let process = |runtime: &mut PreparedNativeProject| {
            let mut out = ([0.0_f32; 128], [0.0_f32; 128]);
            runtime
                .processor
                .process(crate::AudioBlock {
                    main: Some([&left, &right]),
                    sidechain: None,
                    output: [&mut out.0, &mut out.1],
                    events: &[],
                })
                .unwrap();
            out
        };
        for _ in 0..24 {
            assert_eq!(process(&mut current), process(&mut expected));
        }
        assert_eq!(next.transfer_live_graph_history_from(&current), 2);
        assert_eq!(process(&mut next), process(&mut expected));
    }

    #[test]
    fn staged_named_route_retains_the_portable_project_and_prepared_order() {
        let source = include_bytes!("../../../projects/graph-workspace/authored-inverted-lfo.json");
        let staged =
            NativeProject::stage_live_route(source, 6, "cv", Some((5, "uni")), 48_000., 128)
                .unwrap();
        assert_eq!(
            (staged.to, staged.input_port, staged.source),
            (6, 1, Some((5, 2)))
        );
        let document: Value = serde_json::from_slice(&staged.document).unwrap();
        assert_eq!(
            document["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["from"] == 5)
                .unwrap()["outputPort"],
            2
        );
        assert!(NativeProject::parse(&staged.document).is_ok());
        assert!(
            NativeProject::stage_live_route(source, 6, "audio", Some((5, "uni")), 48_000., 128,)
                .is_err()
        );
        assert!(
            NativeProject::stage_live_route(source, 6, "cv", Some((6, "out")), 48_000., 128,)
                .is_err()
        );
    }

    #[test]
    fn native_reader_accepts_every_shared_workspace_type_and_legacy_fixed_gain() {
        for spec in WORKSPACE_TYPES {
            if matches!(spec.id, "input.raw" | "output") {
                continue;
            }
            if spec.id == "main-voice-bank" {
                let fixture = include_bytes!("../../../projects/graph-workspace/main-bank.json");
                assert!(NativeProject::parse(fixture).is_ok());
                let document: Value = serde_json::from_slice(fixture).unwrap();
                let bank = document["signal"]["nodes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|node| node["type"] == spec.id)
                    .unwrap();
                assert_eq!(bank["a"].as_f64(), Some(spec.a));
                continue;
            }
            let mut node = json!({ "id": 4, "type": spec.id });
            if spec.arg_count >= 1 {
                node["a"] = json!(spec.a);
            }
            if spec.arg_count >= 2 {
                node["b"] = json!(spec.b);
            }
            let parameters: Vec<_> = workspace_parameters(spec.id)
                .iter()
                .map(|parameter| {
                    json!({ "nodeId": 4, "id": parameter.id, "value": parameter.default })
                })
                .collect();
            let mut document = json!({
                "format": "manifold.project", "schemaVersion": 1,
                "projectId": "manifold.graph-workspace",
                "signal": { "inputs": 2, "outputs": 2, "inputSource": "none",
                    "nodes": [
                        { "id": 1, "type": "input.raw" },
                        { "id": 3, "type": "output" },
                        node,
                    ],
                    "connections": [], "initialParameters": parameters },
            });
            let parsed = NativeProject::parse(&serde_json::to_vec(&document).unwrap());
            assert!(parsed.is_ok(), "{}: {:?}", spec.id, parsed.err());
            if spec.id == "fixed-gain" {
                document["signal"]["nodes"][2]["a"] = json!(2.5);
                assert!(NativeProject::parse(&serde_json::to_vec(&document).unwrap()).is_ok());
                document["signal"]["nodes"][2]["a"] = json!(5.0);
                assert!(NativeProject::parse(&serde_json::to_vec(&document).unwrap()).is_err());
            }
        }
    }
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
    fn authored_main_cv_cable_roundtrips_through_native_state() {
        let bundle = include_bytes!("../../../projects/main-looper/lfo-filter-rack-graph.json");
        let mut prepared = NativeProject::parse(bundle)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let saved = prepared.save_state().unwrap();
        let restored: Value = serde_json::from_slice(&saved).unwrap();
        assert!(
            restored["signal"]["nodes"]
                .as_array()
                .unwrap()
                .iter()
                .any(|node| node["id"] == 6 && node["type"] == "modulated-svf")
        );
        assert!(
            restored["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .any(|edge| edge["from"] == 11 && edge["to"] == 6 && edge["inputPort"] == 1)
        );
        NativeProject::parse(&saved)
            .unwrap()
            .prepare(48_000., 128)
            .unwrap();
    }

    #[test]
    fn authored_main_rack_audio_edges_compile_and_change_note_output() {
        fn note_energy(bundle: &[u8]) -> f32 {
            let mut processor = NativeProject::parse(bundle)
                .unwrap()
                .prepare(48_000., 128)
                .unwrap();
            let mut left = [0.; 128];
            let mut right = [0.; 128];
            let mut energy = 0.;
            let note = TimedEvent {
                offset: 0,
                node: 4,
                kind: EventKind::NoteOn {
                    channel: 0,
                    note: 96,
                    velocity: 120,
                },
            };
            for block in 0..90 {
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
                if block >= 40 {
                    energy += left.iter().map(|sample| sample.abs()).sum::<f32>();
                }
            }
            energy
        }
        let mut rack: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/main-looper/default-rack-graph.json"
        ))
        .unwrap();
        let cutoff = rack["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|parameter| parameter["nodeId"] == 6 && parameter["id"] == 1)
            .unwrap();
        cutoff["value"] = json!(80.0);
        let filtered = note_energy(&serde_json::to_vec(&rack).unwrap());
        let edge = rack["signal"]["connections"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|edge| edge["to"] == 7)
            .unwrap();
        edge["from"] = json!(5);
        let bypassed = note_energy(&serde_json::to_vec(&rack).unwrap());
        assert!(
            bypassed > filtered * 3.,
            "filter {filtered}, bypass {bypassed}"
        );
        let mut parked = NativeProject::parse(&serde_json::to_vec(&rack).unwrap())
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let mut reopened: Value = serde_json::from_slice(&parked.save_state().unwrap()).unwrap();
        assert_eq!(
            reopened["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|parameter| parameter["nodeId"] == 6 && parameter["id"] == 1)
                .unwrap()["value"],
            json!(80.0)
        );
        reopened["signal"]["connections"]
            .as_array_mut()
            .unwrap()
            .iter_mut()
            .find(|edge| edge["to"] == 7)
            .unwrap()["from"] = json!(6);
        let restored = note_energy(&serde_json::to_vec(&reopened).unwrap());
        assert!((restored - filtered).abs() < filtered * 0.001);

        // Unplugging the only output parks the voice bank and its partials.
        // Save must keep them for the later cable reconnection.
        let mut silent = reopened;
        silent["signal"]["connections"]
            .as_array_mut()
            .unwrap()
            .retain(|edge| edge["to"] != 3);
        let mut parked = NativeProject::parse(&serde_json::to_vec(&silent).unwrap())
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let mut reopened: Value = serde_json::from_slice(&parked.save_state().unwrap()).unwrap();
        assert_eq!(reopened["targets"].as_array().unwrap().len(), 2);
        reopened["signal"]["connections"]
            .as_array_mut()
            .unwrap()
            .push(json!({"from": 9, "to": 3, "inputPort": 0}));
        assert!(
            (note_energy(&serde_json::to_vec(&reopened).unwrap()) - filtered).abs()
                < filtered * 0.001
        );
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
                id: u64::from(HOST_SLOT_BASE + 1),
                normalized: 0.8,
            },
            TimedAutomation {
                offset: 64,
                id: u64::from(HOST_SLOT_BASE),
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
                    id: u64::from(HOST_SLOT_BASE),
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
    fn standalone_sample_browser_take_reopens_in_native_graph() {
        let bytes = include_bytes!("../../../web/public/standalone-sample-browser-project.json");
        let original: Value = serde_json::from_slice(bytes).unwrap();
        assert_eq!(original["signal"]["selectedCaptureSourceId"], 1);
        assert_eq!(original["signal"]["selectedCaptureNodeId"], 10);
        assert_eq!(original["assets"][0]["frames"], 24_000);
        let mut prepared = NativeProject::parse(bytes)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        prepared
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[TimedEvent {
                    offset: 24,
                    node: 4_u32.into(),
                    kind: EventKind::NoteOn {
                        channel: 0,
                        note: 60,
                        velocity: 127,
                    },
                }],
            })
            .unwrap();
        assert_eq!(left[..24], [0.0; 24]);
        assert!(left[40..].iter().any(|sample| sample.abs() > 0.001));
        assert!(right[40..].iter().any(|sample| sample.abs() > 0.001));
        let saved: Value = serde_json::from_slice(&prepared.save_state().unwrap()).unwrap();
        assert_eq!(saved["signal"]["selectedCaptureSourceId"], 1);
        assert_eq!(
            saved["assets"][0]["pcmF32Base64"],
            original["assets"][0]["pcmF32Base64"]
        );
    }

    #[test]
    fn capture_source_registry_requires_unique_ids_and_matching_selection() {
        let mut document: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/retrospective-multisource.json"
        ))
        .unwrap();
        assert!(parse(&document).is_ok());
        document["signal"]["selectedCaptureSourceId"] = serde_json::json!(1);
        assert!(parse(&document).is_err());
        document["signal"]["selectedCaptureNodeId"] = serde_json::json!(10);
        assert!(parse(&document).is_ok());
        document["signal"]["captureSources"][1]["id"] = serde_json::json!(0);
        assert!(parse(&document).is_err());
        document["signal"]["captureSources"][1]["id"] = serde_json::json!(1);
        document["signal"]["captureSources"][1]["nodeId"] = serde_json::json!(9);
        assert!(parse(&document).is_err());
    }

    #[test]
    fn four_authored_rack_layer_sources_capture_distinct_audio_in_native_graph() {
        let bytes = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-sample-layer-capture.json"
        );
        let document: Value = serde_json::from_slice(bytes).unwrap();
        assert_eq!(document["signal"]["selectedCaptureSourceId"], 5);
        let mut prepared = NativeProject::parse(bytes)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let main_left = [0.4; 128];
        let main_right = [-0.4; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        for _ in 0..16 {
            prepared
                .processor
                .process(AudioBlock {
                    main: Some([&main_left, &main_right]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
        }
        for layer in 1..=4 {
            let capture = (72 + layer * 2) as u32;
            assert!(
                prepared
                    .processor
                    .begin_prepared_capture_staging(capture.into(), 128)
            );
            prepared
                .processor
                .process(AudioBlock {
                    main: Some([&main_left, &main_right]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            assert_eq!(
                prepared.processor.capture_staging_status(capture.into()),
                Some(true)
            );
            let mut captured = [0.0; 256];
            assert_eq!(
                prepared.processor.copy_capture_staged_interleaved(
                    capture.into(),
                    0,
                    &mut captured,
                ),
                128
            );
            let expected = layer as f32 * 0.1;
            assert!(
                captured
                    .chunks_exact(2)
                    .all(|frame| (frame[0] - expected).abs() < 0.001
                        && (frame[1] + expected).abs() < 0.001)
            );
        }
        let saved: Value = serde_json::from_slice(&prepared.save_state().unwrap()).unwrap();
        assert_eq!(saved["signal"]["selectedCaptureSourceId"], 5);
        assert_eq!(
            saved["signal"]["captureSources"],
            document["signal"]["captureSources"]
        );
    }

    #[test]
    fn authored_four_layer_loop_records_then_feeds_rack_capture_in_native_graph() {
        let bytes =
            include_bytes!("../../../projects/graph-workspace/authored-rack-four-layer-loops.json");
        let mut prepared = NativeProject::parse(bytes)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let main_left = [0.2; 128];
        let main_right = [-0.3; 128];
        let zero = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        assert!(prepared.processor.set_parameter(70_u32.into(), 0, 1.0));
        for _ in 0..4 {
            prepared
                .processor
                .process(AudioBlock {
                    main: Some([&main_left, &main_right]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
        }
        assert!(prepared.processor.set_parameter(70_u32.into(), 0, 0.0));
        assert!(prepared.processor.set_parameter(70_u32.into(), 1, 1.0));
        prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(
            prepared
                .processor
                .begin_prepared_capture_staging(74_u32.into(), 128)
        );
        prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        let mut captured = [0.0; 256];
        assert_eq!(
            prepared
                .processor
                .copy_capture_staged_interleaved(74_u32.into(), 0, &mut captured),
            128
        );
        assert!(
            captured
                .chunks_exact(2)
                .all(|frame| (frame[0] - 0.2).abs() < 1.0e-6 && (frame[1] + 0.3).abs() < 1.0e-6)
        );
        assert!(
            prepared
                .processor
                .begin_prepared_capture_staging(76_u32.into(), 128)
        );
        prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert_eq!(
            prepared
                .processor
                .copy_capture_staged_interleaved(76_u32.into(), 0, &mut captured),
            128
        );
        assert!(captured.iter().all(|sample| *sample == 0.0));
        let saved = prepared.save_state().unwrap();
        let document: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(
            document["assets"]
                .as_array()
                .unwrap()
                .iter()
                .find(|asset| asset["nodeId"] == 70)
                .unwrap()["frames"],
            512
        );
        let mut reopened = NativeProject::parse(&saved)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        reopened
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(
            reopened
                .processor
                .begin_prepared_capture_staging(74_u32.into(), 128)
        );
        reopened
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert_eq!(
            reopened
                .processor
                .copy_capture_staged_interleaved(74_u32.into(), 0, &mut captured),
            128
        );
        assert!(
            captured
                .chunks_exact(2)
                .all(|frame| (frame[0] - 0.2).abs() < 1e-6 && (frame[1] + 0.3).abs() < 1e-6)
        );
    }

    #[test]
    fn authored_loop_asset_reopens_playing_and_feeds_rack_capture() {
        let mut document: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-four-layer-loops.json"
        ))
        .unwrap();
        let mut pcm = Vec::new();
        for _ in 0..128 {
            pcm.extend_from_slice(&0.2_f32.to_le_bytes());
            pcm.extend_from_slice(&(-0.3_f32).to_le_bytes());
        }
        document["assets"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({
                "nodeId": 70, "sourceRate": 48000, "frames": 128,
                "label": "Layer 1 take", "pcmF32Base64": STANDARD.encode(pcm),
            }));
        for parameter in document["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
        {
            if parameter["nodeId"] == 70 && parameter["id"] == 1 {
                parameter["value"] = serde_json::json!(1);
            }
        }
        let mut prepared = NativeProject::parse(&serde_json::to_vec(&document).unwrap())
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        assert_eq!(
            prepared.processor.plan.capture_length(70_u32.into()),
            Some(128)
        );
        let zero = [0.0; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(
            prepared
                .processor
                .begin_prepared_capture_staging(74_u32.into(), 128)
        );
        prepared
            .processor
            .process(AudioBlock {
                main: Some([&zero, &zero]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        let mut captured = [0.0; 256];
        assert_eq!(
            prepared
                .processor
                .copy_capture_staged_interleaved(74_u32.into(), 0, &mut captured),
            128
        );
        assert!(
            captured
                .chunks_exact(2)
                .all(|frame| (frame[0] - 0.2).abs() < 1e-6 && (frame[1] + 0.3).abs() < 1e-6)
        );
    }

    #[test]
    fn retrospective_bar_timing_requires_a_bounded_complete_recipe() {
        let mut document: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/retrospective-multisource.json"
        ))
        .unwrap();
        document["signal"]["captureWindowBars"] = serde_json::json!(0);
        assert!(parse(&document).is_err());
        document["signal"]["captureWindowBars"] = serde_json::json!(1);
        document["signal"]["captureTempoBpm"] = Value::Null;
        assert!(parse(&document).is_err());
        document["signal"]["captureTempoBpm"] = serde_json::json!(120);
        assert!(parse(&document).is_ok());
    }

    #[test]
    fn browser_free_capture_accepts_one_frame_and_rejects_zero_duration() {
        let mut document: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/retrospective-multisource.json"
        ))
        .unwrap();
        document["signal"]["captureWindowMode"] = serde_json::json!("free");
        document["signal"]["captureWindowSeconds"] = serde_json::json!(1.0 / 48_000.0);
        parse(&document).unwrap().prepare(48_000.0, 128).unwrap();
        document["signal"]["captureWindowSeconds"] = serde_json::json!(0.0);
        assert!(parse(&document).is_err());
    }

    #[test]
    fn native_sidechain_ring_stages_to_portable_sample_and_reopens() {
        use manifold_core::capture_timing::{retrospective_frames, samples_per_bar};

        let project = NativeProject::parse(include_bytes!(
            "../../../projects/graph-workspace/retrospective-multisource.json"
        ))
        .unwrap();
        let mut prepared = project.prepare_with_state(48_000.0, 128).unwrap();
        assert!(
            prepared
                .prepare_staged_capture_replacement(10, 5, "Sidechain take", 48_000.0, 128)
                .is_err()
        );
        let main = [0.25; 128];
        let side = [-0.5; 128];
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        let mut render = |prepared: &mut PreparedNativeProject| {
            prepared
                .processor
                .process(AudioBlock {
                    main: Some([&main, &main]),
                    sidechain: Some([&side, &side]),
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            assert_eq!(left, [0.0; 128], "capture roots stay silent");
            assert_eq!(right, [0.0; 128]);
        };
        for _ in 0..75 {
            render(&mut prepared);
        }
        let spb = samples_per_bar(Some(96_000.0), 48_000.0, 120.0).unwrap();
        let frames = retrospective_frames(spb, 0.1).unwrap();
        assert_eq!(frames, 9_600);
        assert!(
            prepared
                .processor
                .begin_prepared_capture_staging(10_u32.into(), frames as usize)
        );
        for _ in 0..16 {
            if prepared.processor.capture_staging_status(10_u32.into()) == Some(true) {
                break;
            }
            render(&mut prepared);
        }
        assert_eq!(
            prepared.processor.capture_staging_status(10_u32.into()),
            Some(true)
        );
        let mut replacement = prepared
            .prepare_staged_capture_replacement(10, 5, "Sidechain take", 48_000.0, 128)
            .unwrap();
        let saved = replacement.save_state().unwrap();
        let document: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(document["signal"]["selectedCaptureNodeId"], 10);
        assert_eq!(document["signal"]["selectedCaptureSourceId"], 1);
        assert_eq!(document["signal"]["captureWindowMode"], "bars");
        assert_eq!(document["assets"][0]["frames"], 9_600);
        let encoded = document["assets"][0]["pcmF32Base64"].as_str().unwrap();
        let pcm = STANDARD.decode(encoded).unwrap();
        assert_eq!(f32::from_le_bytes(pcm[..4].try_into().unwrap()), -2.0);

        let mut reopened = NativeProject::parse(&saved)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let note = [TimedEvent {
            offset: 0,
            node: 4_u32.into(),
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 127,
            },
        }];
        let play = |prepared: &mut PreparedNativeProject| {
            let mut l = [0.0; 128];
            let mut r = [0.0; 128];
            prepared
                .processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut l, &mut r],
                    events: &note,
                })
                .unwrap();
            [l, r]
        };
        let first = play(&mut replacement);
        let second = play(&mut reopened);
        assert_eq!(first, second);
        assert!(first[0].iter().any(|sample| *sample < -0.01));
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
    fn browser_authored_lfo_output_port_survives_native_load_and_changes_audio() {
        let fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/tone-texture.json"
        ))
        .unwrap();
        let inverted_bytes =
            include_bytes!("../../../projects/graph-workspace/tone-texture-inverted.json");
        let parsed = NativeProject::parse(inverted_bytes).unwrap();
        assert_eq!(parsed.graph.connections[4].output_port, 1);
        let mut normal = NativeProject::parse(&serde_json::to_vec(&fixture).unwrap())
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let mut inverted = parsed.prepare(48_000.0, 128).unwrap();
        let mut normal_left = [0.0; 128];
        let mut normal_right = [0.0; 128];
        let mut inverted_left = [0.0; 128];
        let mut inverted_right = [0.0; 128];
        for _ in 0..8 {
            normal
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut normal_left, &mut normal_right],
                    events: &[],
                })
                .unwrap();
            inverted
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut inverted_left, &mut inverted_right],
                    events: &[],
                })
                .unwrap();
        }
        assert!(
            normal_left
                .iter()
                .zip(inverted_left.iter())
                .any(|(a, b)| (a - b).abs() > 0.001)
        );
        assert!(inverted_left.iter().all(|sample| sample.is_finite()));
    }

    #[test]
    fn javascript_authored_graph_renders_and_roundtrips_in_native_processor() {
        let bytes = include_bytes!("../../../projects/graph-workspace/authored-inverted-lfo.json");
        let project = NativeProject::parse(bytes).unwrap();
        assert_eq!(project.graph.connections[2].output_port, 1);
        let mut prepared = project.prepare_with_state(48_000.0, 128).unwrap();
        let mut left = [0.0; 128];
        let mut right = [0.0; 128];
        prepared
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        assert_eq!(left, right);
        let saved = prepared.save_state().unwrap();
        let reopened = NativeProject::parse(&saved).unwrap();
        assert_eq!(reopened.graph.connections[2].output_port, 1);
    }

    #[test]
    fn authored_phase_vocoder_fft_order_is_prepared_before_native_audio() {
        let bytes =
            include_bytes!("../../../projects/graph-workspace/authored-phase-vocoder-chain.json");
        let project = NativeProject::parse(bytes).unwrap();
        let vocoder = project
            .graph
            .nodes
            .iter()
            .find(|node| node.id == 5)
            .unwrap();
        assert!(matches!(&vocoder.kind, NodeKind::PhaseVocoder { params } if params[4] == 9.0));
        let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        for _ in 0..64 {
            prepared
                .processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
        }
        assert!(left.iter().any(|sample| sample.abs() > 0.01));
        assert!(left.iter().all(|sample| sample.is_finite()));
        let saved = prepared.save_state().unwrap();
        let reopened = NativeProject::parse(&saved).unwrap();
        let vocoder = reopened
            .graph
            .nodes
            .iter()
            .find(|node| node.id == 5)
            .unwrap();
        assert!(matches!(&vocoder.kind, NodeKind::PhaseVocoder { params } if params[4] == 9.0));
    }

    #[test]
    fn authored_sample_voice_asset_and_event_render_in_native_graph() {
        let bytes =
            include_bytes!("../../../projects/graph-workspace/authored-sample-voice-chain.json");
        let project = NativeProject::parse(bytes).unwrap();
        let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
        assert!(prepared.processor.set_parameter(6, 0, 0.6));
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        let event = manifold_core::events::TimedEvent {
            offset: 0,
            node: 4,
            kind: manifold_core::events::EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        };
        let mut peak = 0.0_f32;
        for block in 0..4 {
            let first_block_events = [event];
            prepared
                .processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: if block == 0 { &first_block_events } else { &[] },
                })
                .unwrap();
            peak = peak.max(left.iter().copied().map(f32::abs).fold(0.0, f32::max));
            assert_eq!(left, right);
        }
        assert!(peak > 0.01);
    }

    #[test]
    fn one_asset_feeds_eight_authored_sample_voices_in_native_graph() {
        let bytes = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-sample-eight-voice.json"
        );
        let project = NativeProject::parse(bytes).unwrap();
        let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        let mut peak = 0.0_f32;
        for node in [4, 25] {
            let gain = node + 2;
            assert!(prepared.processor.set_parameter(gain, 0, 0.7));
            let event = manifold_core::events::TimedEvent {
                offset: 0,
                node,
                kind: manifold_core::events::EventKind::NoteOn {
                    channel: 0,
                    note: 60,
                    velocity: 100,
                },
            };
            let events = [event];
            prepared
                .processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &events,
                })
                .unwrap();
            peak = peak.max(left.iter().copied().map(f32::abs).fold(0.0, f32::max));
            assert_eq!(left, right);
        }
        assert!(peak > 0.01);
    }

    #[test]
    fn authored_rack_selection_two_plays_eighth_sample_voice() {
        let bytes = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-sample.json"
        );
        let project = NativeProject::parse(bytes).unwrap();
        let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
        assert!(prepared.processor.set_parameter(62, 0, 0.7));
        let event = manifold_core::events::TimedEvent {
            offset: 0,
            node: 60,
            kind: manifold_core::events::EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        };
        let events = [event];
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        prepared
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &events,
            })
            .unwrap();
        assert!(left.iter().any(|sample| sample.abs() > 0.003));
        assert_eq!(left, right);
    }

    #[test]
    fn authored_rack_graph_above_64_nodes_prepares_and_renders_natively() {
        let mut document: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-sample.json"
        ))
        .unwrap();
        let signal = document["signal"].as_object_mut().unwrap();
        signal["connections"]
            .as_array_mut()
            .unwrap()
            .retain(|edge| edge["to"] != 3);
        for id in 70..=73_u32 {
            signal["nodes"]
                .as_array_mut()
                .unwrap()
                .push(serde_json::json!({"id": id, "type": "gain", "a": 0.7}));
            signal["initialParameters"]
                .as_array_mut()
                .unwrap()
                .push(serde_json::json!({"nodeId": id, "id": 0, "value": 1.0}));
            signal["connections"].as_array_mut().unwrap().push(
                serde_json::json!({"from": if id == 70 { 64 } else { id - 1 }, "outputPort": 0,
                    "to": id, "inputPort": 0}),
            );
        }
        signal["connections"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!({"from": 73, "outputPort": 0,
                "to": 3, "inputPort": 0}));
        assert_eq!(signal["nodes"].as_array().unwrap().len(), 72);
        for id in 70..=73_u32 {
            document["instances"].as_array_mut().unwrap().push(
                serde_json::json!({"path": format!("/rack_host/nodes/post_{id}"),
                    "nodeId": id}),
            );
        }
        assert_eq!(document["instances"].as_array().unwrap().len(), 70);
        let bytes = serde_json::to_vec(&document).unwrap();
        let mut prepared = NativeProject::parse(&bytes)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        assert!(prepared.processor.set_parameter(41, 0, 0.7));
        let events = [TimedEvent {
            offset: 0,
            node: 39_u32.into(),
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        }];
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        prepared
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &events,
            })
            .unwrap();
        assert!(left.iter().any(|sample| sample.abs() > 0.003));
        assert_eq!(left, right);
    }

    #[test]
    fn replacing_rack_sample_source_rebinds_all_eight_prepared_voices() {
        let bytes = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-sample.json"
        );
        let mut original = NativeProject::parse(bytes)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        assert!(original.processor.set_parameter(62, 0, 0.7));
        let events = [TimedEvent {
            offset: 0,
            node: 60_u32.into(),
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        }];
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        original
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &events,
            })
            .unwrap();
        assert!(left.iter().any(|sample| sample.abs() > 0.003));

        let replacement = vec![0.0; 4_800 * 2];
        let mut updated = original
            .prepare_sample_replacement(
                39,
                &replacement,
                48_000,
                "replacement silence",
                48_000.,
                128,
            )
            .unwrap();
        assert!(updated.processor.set_parameter(62, 0, 0.7));
        updated
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &events,
            })
            .unwrap();
        assert!(left.iter().all(|sample| *sample == 0.0));
        assert_eq!(left, right);
        let saved: Value = serde_json::from_slice(&updated.save_state().unwrap()).unwrap();
        assert_eq!(saved["assets"].as_array().unwrap().len(), 1);
        assert_eq!(saved["sampleBindings"].as_array().unwrap().len(), 7);
        assert_eq!(saved["assets"][0]["label"], "replacement silence");
    }

    #[test]
    fn authored_rack_sample_capture_source_records_host_input_natively() {
        let bytes = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-sample.json"
        );
        let mut prepared = NativeProject::parse(bytes)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let main_left = [0.25; 128];
        let main_right = [-0.25; 128];
        let side_left = [0.125; 128];
        let side_right = [-0.5; 128];
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        for _ in 0..2 {
            prepared
                .processor
                .process(AudioBlock {
                    main: Some([&main_left, &main_right]),
                    sidechain: Some([&side_left, &side_right]),
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
        }
        assert_eq!(
            prepared
                .processor
                .retrospective_cursor(65_u32.into())
                .unwrap()
                .0,
            256
        );
        assert!(
            prepared
                .processor
                .begin_prepared_capture_staging(65_u32.into(), 128)
        );
        assert_eq!(
            prepared
                .processor
                .retrospective_cursor(68_u32.into())
                .unwrap()
                .0,
            256
        );
        assert!(
            prepared
                .processor
                .begin_prepared_capture_staging(68_u32.into(), 128)
        );
        prepared
            .processor
            .process(AudioBlock {
                main: Some([&main_left, &main_right]),
                sidechain: Some([&side_left, &side_right]),
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert_eq!(
            prepared.processor.capture_staging_status(65_u32.into()),
            Some(true)
        );
        let mut captured = [0.; 256];
        assert_eq!(
            prepared
                .processor
                .copy_capture_staged_interleaved(65_u32.into(), 0, &mut captured,),
            128
        );
        assert!(captured.chunks_exact(2).all(|frame| frame == [0.25, -0.25]));
        assert_eq!(
            prepared.processor.capture_staging_status(68_u32.into()),
            Some(true)
        );
        assert_eq!(
            prepared
                .processor
                .copy_capture_staged_interleaved(68_u32.into(), 0, &mut captured),
            128
        );
        assert!(captured.chunks_exact(2).all(|frame| frame == [0.125, -0.5]));
        assert!(left.iter().all(|sample| *sample == 0.));
        assert!(right.iter().all(|sample| *sample == 0.));
    }

    #[test]
    fn authored_rack_capture_publishes_one_source_to_eight_native_voices() {
        let bytes = include_bytes!(
            "../../../projects/graph-workspace/authored-rack-module-host-sample.json"
        );
        let mut recording = NativeProject::parse(bytes)
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let main_left = [0.3; 128];
        let main_right = [-0.2; 128];
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        for _ in 0..2 {
            recording
                .processor
                .process(AudioBlock {
                    main: Some([&main_left, &main_right]),
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
        }
        assert!(
            recording
                .processor
                .begin_prepared_capture_staging(65_u32.into(), 128)
        );
        recording
            .processor
            .process(AudioBlock {
                main: Some([&main_left, &main_right]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert_eq!(
            recording.processor.capture_staging_status(65_u32.into()),
            Some(true)
        );
        let mut captured = recording
            .prepare_staged_capture_replacement(65, 39, "Rack input take", 48_000., 128)
            .unwrap();
        assert!(captured.processor.set_parameter(62, 0, 0.7));
        let events = [TimedEvent {
            offset: 0,
            node: 60_u32.into(),
            kind: EventKind::NoteOn {
                channel: 0,
                note: 60,
                velocity: 100,
            },
        }];
        captured
            .processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &events,
            })
            .unwrap();
        assert!(left.iter().any(|sample| sample.abs() > 0.003));
        assert!(right.iter().any(|sample| sample.abs() > 0.003));
        let saved: Value = serde_json::from_slice(&captured.save_state().unwrap()).unwrap();
        assert_eq!(saved["signal"]["selectedCaptureNodeId"], 65);
        assert_eq!(saved["signal"]["selectedCaptureSourceId"], 0);
        assert_eq!(saved["assets"].as_array().unwrap().len(), 1);
        assert_eq!(saved["assets"][0]["frames"], 128);
        assert_eq!(saved["assets"][0]["label"], "Rack input take");
        assert_eq!(saved["sampleBindings"].as_array().unwrap().len(), 7);
    }

    #[test]
    fn javascript_forked_graph_changes_native_audio_and_preserves_port_on_save() {
        let original =
            include_bytes!("../../../projects/graph-workspace/tone-texture-inverted.json");
        let fork = include_bytes!("../../../projects/graph-workspace/forked-tone-texture.json");
        let render = |bytes: &[u8]| {
            let mut prepared = NativeProject::parse(bytes)
                .unwrap()
                .prepare_with_state(48_000., 128)
                .unwrap();
            let mut left = [0.; 128];
            let mut right = [0.; 128];
            prepared
                .processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            (left, prepared)
        };
        let (old_audio, _) = render(original);
        let (new_audio, mut prepared) = render(fork);
        assert!(new_audio.iter().all(|sample| sample.is_finite()));
        assert!(
            old_audio
                .iter()
                .zip(new_audio.iter())
                .any(|(old, new)| (old - new).abs() > 0.001)
        );
        let saved = prepared.save_state().unwrap();
        let saved: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(
            saved["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["from"] == 9)
                .unwrap()["outputPort"],
            2
        );
    }

    #[test]
    fn javascript_authored_distortion_renders_and_saves_in_native() {
        let bytes = include_bytes!("../../../projects/graph-workspace/authored-distortion.json");
        let mut dry: Value = serde_json::from_slice(bytes).unwrap();
        dry["signal"]["nodes"]
            .as_array_mut()
            .unwrap()
            .retain(|node| node["id"] != 5);
        dry["signal"]["initialParameters"]
            .as_array_mut()
            .unwrap()
            .retain(|parameter| parameter["nodeId"] != 5);
        dry["signal"]["connections"] = json!([
            { "from": 4, "outputPort": 0, "to": 3, "inputPort": 0 }
        ]);
        let render = |project: &[u8]| {
            let mut prepared = NativeProject::parse(project)
                .unwrap()
                .prepare_with_state(48_000., 128)
                .unwrap();
            let mut left = [0.; 128];
            let mut right = [0.; 128];
            prepared
                .processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            (left, prepared)
        };
        let (dry_audio, _) = render(&serde_json::to_vec(&dry).unwrap());
        let (wet_audio, mut prepared) = render(bytes);
        assert!(wet_audio.iter().all(|sample| sample.is_finite()));
        assert!(
            wet_audio
                .iter()
                .zip(dry_audio.iter())
                .any(|(wet, dry)| (wet - dry).abs() > 0.001)
        );
        let saved = prepared.save_state().unwrap();
        let saved: Value = serde_json::from_slice(&saved).unwrap();
        assert_eq!(saved["signal"]["nodes"][3]["type"], "distortion");
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
                    id: u64::from(slot),
                    normalized: 0.5,
                }],
            )
            .unwrap();
        assert!((left[39] - 0.25).abs() < 0.001);
        assert!(left[127] > left[39]);
        assert!(!prepared.processor.set_parameter(9, 0, 9.0));
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
            4.0
        );
        let mut reopened = NativeProject::parse(&saved)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        assert_eq!(reopened.processor.bound_graph_parameter(77), Some(crate::parameters::graph_parameter_id(9, 0)));
        reopened
            .processor
            .process(AudioBlock {
                main: Some([&main, &main]),
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!((left[127] - 4.0).abs() < 0.001);
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
        assert_eq!(gain.id, crate::parameters::graph_parameter_id(9, 0));
        assert_eq!(gain.initial, 0.25);
        assert_eq!(gain.from_normalized(0.5), Some(4.0));
        assert_eq!(gain.to_normalized(4.0), Some(0.5));
        assert_eq!(gain.to_normalized(1.0), Some(0.125));
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
        assert_eq!(processor.bound_graph_parameter(7), Some(crate::parameters::graph_parameter_id(9, 0)));
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
                    id: u64::from(HOST_SLOT_BASE + 7),
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
            id: crate::parameters::graph_parameter_id(9, 0),
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
                    id: crate::parameters::graph_parameter_id(9, 0),
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
                    id: crate::parameters::graph_parameter_id(9, 0),
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
