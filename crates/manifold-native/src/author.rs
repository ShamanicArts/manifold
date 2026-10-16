//! Rust project graph authoring on the control thread. Export is checked by
//! the same native project reader used by standalone, VST3, and CLAP hosts.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

use manifold_core::graph::{GraphDescription, GraphError, NodeKind, NodeSpec};
use manifold_core::io::IoLayout;
use manifold_core::node_catalog::{WorkspaceType, workspace_type};
use manifold_core::parameter_catalog::{workspace_parameter, workspace_parameters};
use serde_json::{Value, json};

use crate::project::{
    NativeProject, ParameterEndpoint, PreparedNativeProject, ProjectControl,
    ProjectError,
};
use crate::{NativeError, NativeProcessor};

#[derive(Debug, PartialEq, Eq)]
pub enum AuthorError {
    UnknownType,
    InvalidId,
    MissingNode,
    InvalidPort,
    SignalMismatch,
    OccupiedInput,
    Cycle,
    InvalidParameter,
    InvalidEndpoint,
    DuplicateEndpoint,
    InvalidInstance,
    InvalidHostSlot,
    InvalidControl,
    UnsupportedProject,
    UnconnectedOutput,
    Project(ProjectError),
    Host(NativeError),
    StaleTransaction,
    CaptureBusy,
    InvalidConfiguration,
    InvalidAsset,
    InvalidSampleBinding,
}

#[derive(Clone)]
struct AuthoredNode {
    spec: &'static WorkspaceType,
    kind: NodeKind,
    arguments: [f64; 2],
}

#[derive(Clone, Copy)]
struct Edge {
    from: u32,
    output_port: usize,
    to: u32,
    input_port: usize,
}

fn json_number(value: f64) -> Value {
    if value.fract() == 0.0 && value >= i64::MIN as f64 && value < i64::MAX as f64 {
        json!(value as i64)
    } else {
        json!(value)
    }
}

/// A portable graph-workspace document assembled in Rust before audio starts.
/// Every new node acquires the shared Rust parameter defaults. Export records
/// the complete initial set for portable host state.
#[derive(Clone)]
pub struct GraphWorkspace {
    nodes: BTreeMap<u32, AuthoredNode>,
    edges: BTreeMap<(u32, usize), Edge>,
    parameters: BTreeMap<(u32, u32), f64>,
    endpoints: BTreeMap<String, ParameterEndpoint>,
    host_bindings: BTreeMap<u32, (u32, u32)>,
    host_assignments: BTreeMap<u32, Option<String>>,
    explicit_host_bindings: bool,
    controls: BTreeMap<String, ProjectControl>,
    instances: BTreeMap<String, u32>,
    input_source: InputSource,
    io: Option<IoLayout>,
    assets: BTreeMap<u32, Arc<Value>>,
    sample_bindings: BTreeMap<u32, u32>,
}

/// One acknowledged route at a time on a processor prepared from this graph.
/// The caller must hold exclusive processor access between audio blocks.
pub struct LiveGraphSession {
    graph: GraphWorkspace,
    revision: u64,
}

/// A validated graph and its compiled native runtime, built away from audio processing.
/// Keep this object until the host reaches a block boundary.
pub struct PreparedGraphTransaction {
    graph: GraphWorkspace,
    runtime: PreparedNativeProject,
    state_links: Vec<(u64, u64)>,
    base_revision: u64,
}

impl PreparedGraphTransaction {
    /// Inspect the candidate on the control thread before publication.
    pub fn to_project(&self) -> Result<Value, AuthorError> {
        self.graph.to_project()
    }
}

/// The old runtime and authored graph must be retired outside the audio callback.
pub struct RetiredGraphTransaction {
    pub runtime: PreparedNativeProject,
    pub graph: GraphWorkspace,
    state_links: Vec<(u64, u64)>,
}

impl RetiredGraphTransaction {
    pub fn continuity_links(&self) -> &[(u64, u64)] {
        &self.state_links
    }
}

/// A stale compiled candidate stays owned by the caller for off-callback disposal.
pub struct RejectedGraphTransaction {
    pub reason: AuthorError,
    pub prepared: PreparedGraphTransaction,
}

impl std::fmt::Debug for RejectedGraphTransaction {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("RejectedGraphTransaction")
            .field("reason", &self.reason)
            .finish_non_exhaustive()
    }
}

impl LiveGraphSession {
    pub fn new(graph: GraphWorkspace) -> Result<Self, AuthorError> {
        graph.to_project()?;
        Ok(Self { graph, revision: 0 })
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn to_project(&self) -> Result<Value, AuthorError> {
        self.graph.to_project()
    }

    /// Adopt already accepted DSP targets on the control thread. The caller
    /// synchronizes processor access; this never submits another audio edit.
    pub fn adopt_published_parameters(
        &mut self,
        processor: &NativeProcessor,
    ) -> Result<(), AuthorError> {
        let mut graph = self.graph.clone();
        for (parameter, value) in processor
            .host_parameters()
            .iter()
            .zip(processor.current_parameter_values())
        {
            graph.set_parameter(parameter.node as u32, parameter.local_id, f64::from(*value))?;
        }
        if graph.parameters != self.graph.parameters {
            self.graph = graph;
            self.revision += 1;
        }
        Ok(())
    }

    /// Stage arbitrary node, edge, and parameter edits and compile a replacement on
    /// the control thread. Failure leaves both the active runtime and document intact.
    pub fn prepare_transaction(
        &self,
        sample_rate: f32,
        max_frames: usize,
        edit: impl FnOnce(&mut GraphWorkspace) -> Result<(), AuthorError>,
    ) -> Result<PreparedGraphTransaction, AuthorError> {
        let mut graph = self.graph.clone();
        edit(&mut graph)?;
        let state_links = self.graph.state_links_to(&graph);
        let bytes = graph.to_project_json()?;
        let mut runtime = NativeProject::parse(&bytes)
            .map_err(AuthorError::Project)?
            .prepare_with_state(sample_rate, max_frames)
            .map_err(AuthorError::Project)?;
        runtime
            .plan_parameter_inheritance(&self.graph.to_project_json()?)
            .map_err(AuthorError::Project)?;
        Ok(PreparedGraphTransaction {
            graph,
            runtime,
            state_links,
            base_revision: self.revision,
        })
    }

    /// Publish at a block boundary. No graph compilation, allocation, or retirement
    /// happens here; the caller drops the returned old state on its control thread.
    pub fn publish_transaction(
        &mut self,
        active: &mut PreparedNativeProject,
        next: PreparedGraphTransaction,
    ) -> Result<RetiredGraphTransaction, RejectedGraphTransaction> {
        if next.base_revision != self.revision {
            return Err(RejectedGraphTransaction {
                reason: AuthorError::StaleTransaction,
                prepared: next,
            });
        }
        if !next.runtime.live_history_ready_from(active) {
            return Err(RejectedGraphTransaction {
                reason: AuthorError::CaptureBusy,
                prepared: next,
            });
        }
        let mut next_runtime = next.runtime;
        next_runtime.adopt_live_replacement_from(active, false);
        let runtime = active.publish_replacement(next_runtime);
        let graph = std::mem::replace(&mut self.graph, next.graph);
        self.revision += 1;
        Ok(RetiredGraphTransaction {
            runtime,
            graph,
            state_links: next.state_links,
        })
    }

    pub fn route(
        &mut self,
        processor: &mut NativeProcessor,
        to: u32,
        input: &str,
        from: Option<(u32, &str)>,
    ) -> Result<Value, AuthorError> {
        self.route_with_control(processor, None, to, input, from)
    }

    /// Save a project control with the one route that the prepared host accepts.
    pub fn route_control(
        &mut self,
        processor: &mut NativeProcessor,
        control_path: &str,
        control_value: f64,
        to: u32,
        input: &str,
        from: Option<(u32, &str)>,
    ) -> Result<Value, AuthorError> {
        self.route_with_control(
            processor,
            Some((control_path, control_value)),
            to,
            input,
            from,
        )
    }

    fn route_with_control(
        &mut self,
        processor: &mut NativeProcessor,
        control: Option<(&str, f64)>,
        to: u32,
        input: &str,
        from: Option<(u32, &str)>,
    ) -> Result<Value, AuthorError> {
        let mut staged = self.graph.clone();
        if let Some((path, value)) = control {
            staged.set_control(path, value)?;
        }
        staged.disconnect(to, input)?;
        if let Some((source, output)) = from {
            staged.connect(source, output, to, input)?;
        }
        let project = staged.to_project()?;
        let target = staged.nodes.get(&to).ok_or(AuthorError::MissingNode)?;
        let input_port = (0..target.kind.input_port_count())
            .find(|&index| target.kind.input_port_name(index).as_deref() == Some(input))
            .ok_or(AuthorError::InvalidPort)?;
        let source = from.map(|(id, output)| {
            let node = staged.nodes.get(&id).expect("validated source");
            let output_port = (0..node.kind.output_port_count())
                .find(|&index| node.kind.output_port_name(index) == Some(output))
                .expect("validated output");
            (id.into(), output_port)
        });
        processor
            .set_route_from(to.into(), input_port, source)
            .map_err(AuthorError::Host)?;
        self.graph = staged;
        self.revision += 1;
        Ok(project)
    }

    /// Resolve a portable path and apply its numeric parameter between audio blocks.
    pub fn parameter_path(
        &mut self,
        processor: &mut NativeProcessor,
        path: &str,
        value: f64,
    ) -> Result<Value, AuthorError> {
        let mut staged = self.graph.clone();
        let endpoint = staged
            .find_parameter(path)
            .ok_or(AuthorError::InvalidEndpoint)?;
        let (node, id) = (endpoint.node, endpoint.id);
        staged.set_parameter_path(path, value)?;
        let project = staged.to_project()?;
        if !processor.set_parameter(node.into(), id, value as f32) {
            return Err(AuthorError::InvalidParameter);
        }
        self.graph = staged;
        self.revision += 1;
        Ok(project)
    }

    /// Save a project control with its derived DSP parameter after host acceptance.
    pub fn parameter_control(
        &mut self,
        processor: &mut NativeProcessor,
        control_path: &str,
        control_value: f64,
        node: u32,
        id: u32,
        parameter_value: f64,
    ) -> Result<Value, AuthorError> {
        let mut staged = self.graph.clone();
        staged.set_control(control_path, control_value)?;
        staged.set_parameter(node, id, parameter_value)?;
        let project = staged.to_project()?;
        if !processor.set_parameter(node.into(), id, parameter_value as f32) {
            return Err(AuthorError::InvalidParameter);
        }
        self.graph = staged;
        self.revision += 1;
        Ok(project)
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum InputSource {
    #[default]
    None,
    External,
}

impl InputSource {
    fn name(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::External => "external",
        }
    }
}

impl Default for GraphWorkspace {
    fn default() -> Self {
        Self::new()
    }
}

impl GraphWorkspace {
    fn state_links_to(&self, next: &Self) -> Vec<(u64, u64)> {
        let old_named: BTreeSet<u32> = self.instances.values().copied().collect();
        next.nodes
            .iter()
            .filter_map(|(&new_id, node)| {
                let old_id =
                    if let Some((path, _)) = next.instances.iter().find(|(_, id)| **id == new_id) {
                        self.instances.get(path).copied()
                    } else if !old_named.contains(&new_id) {
                        Some(new_id)
                    } else {
                        None
                    }?;
                (self.nodes.get(&old_id)?.spec.id == node.spec.id)
                    .then_some((u64::from(new_id), u64::from(old_id)))
            })
            .collect()
    }

    pub fn new() -> Self {
        let mut graph = Self {
            nodes: BTreeMap::new(),
            edges: BTreeMap::new(),
            parameters: BTreeMap::new(),
            endpoints: BTreeMap::new(),
            host_bindings: BTreeMap::new(),
            host_assignments: BTreeMap::new(),
            explicit_host_bindings: false,
            controls: BTreeMap::new(),
            instances: BTreeMap::new(),
            input_source: InputSource::None,
            io: None,
            assets: BTreeMap::new(),
            sample_bindings: BTreeMap::new(),
        };
        graph.insert(1, "input.raw").expect("core input type");
        graph.insert(3, "output").expect("core output type");
        graph
    }

    /// Rehydrate a portable authored graph and its immutable PCM resources.
    pub fn from_project_json(bytes: &[u8]) -> Result<Self, AuthorError> {
        let document: Value =
            serde_json::from_slice(bytes).map_err(|_| AuthorError::UnsupportedProject)?;
        Self::from_project(&document)
    }

    pub fn from_project(document: &Value) -> Result<Self, AuthorError> {
        let bytes = serde_json::to_vec(document).map_err(|_| AuthorError::UnsupportedProject)?;
        NativeProject::parse(&bytes).map_err(AuthorError::Project)?;
        let root = document
            .as_object()
            .ok_or(AuthorError::UnsupportedProject)?;
        if root.keys().any(|key| {
            ![
                "format",
                "schemaVersion",
                "projectId",
                "signal",
                "endpoints",
                "hostBindings",
                "hostAssignments",
                "controls",
                "instances",
                "assets",
                "sampleBindings",
            ]
            .contains(&key.as_str())
        }) {
            return Err(AuthorError::UnsupportedProject);
        }
        let signal = root["signal"]
            .as_object()
            .ok_or(AuthorError::UnsupportedProject)?;
        if signal.keys().any(|key| {
            ![
                "inputs",
                "outputs",
                "inputSource",
                "nodes",
                "connections",
                "initialParameters",
                "io",
            ]
            .contains(&key.as_str())
        }) {
            return Err(AuthorError::UnsupportedProject);
        }
        let mut graph = Self::new();
        let source = signal
            .get("inputSource")
            .and_then(Value::as_str)
            .unwrap_or("none");
        graph.set_input_source(match source {
            "none" => InputSource::None,
            "external" => InputSource::External,
            _ => return Err(AuthorError::UnsupportedProject),
        });
        let entries = signal["nodes"]
            .as_array()
            .ok_or(AuthorError::UnsupportedProject)?;
        for entry in entries {
            let node = entry.as_object().ok_or(AuthorError::UnsupportedProject)?;
            let id = node["id"].as_u64().ok_or(AuthorError::UnsupportedProject)? as u32;
            let kind = node["type"]
                .as_str()
                .ok_or(AuthorError::UnsupportedProject)?;
            let spec = workspace_type(kind).ok_or(AuthorError::UnknownType)?;
            let expected_keys = 2 + spec.arg_count as usize;
            let arguments = [
                node.get("a").and_then(Value::as_f64).unwrap_or(spec.a),
                node.get("b").and_then(Value::as_f64).unwrap_or(spec.b),
            ];
            if node.len() != expected_keys || !spec.valid_arguments(arguments) {
                return Err(AuthorError::UnsupportedProject);
            }
            if id == 1 || id == 3 {
                if kind != if id == 1 { "input.raw" } else { "output" } {
                    return Err(AuthorError::UnsupportedProject);
                }
            } else {
                graph.add(id, kind)?;
                graph.set_arguments(id, arguments)?;
            }
        }
        if entries.len() != graph.nodes.len() {
            return Err(AuthorError::UnsupportedProject);
        }
        for edge in signal["connections"]
            .as_array()
            .ok_or(AuthorError::UnsupportedProject)?
        {
            let from = edge["from"]
                .as_u64()
                .ok_or(AuthorError::UnsupportedProject)? as u32;
            let to = edge["to"].as_u64().ok_or(AuthorError::UnsupportedProject)? as u32;
            let output_port = edge.get("outputPort").and_then(Value::as_u64).unwrap_or(0) as usize;
            let input_port = edge["inputPort"]
                .as_u64()
                .ok_or(AuthorError::UnsupportedProject)? as usize;
            let source = graph.nodes.get(&from).ok_or(AuthorError::MissingNode)?;
            let target = graph.nodes.get(&to).ok_or(AuthorError::MissingNode)?;
            let output = source
                .kind
                .output_port_name(output_port)
                .ok_or(AuthorError::InvalidPort)?
                .to_owned();
            let input = target
                .kind
                .input_port_name(input_port)
                .ok_or(AuthorError::InvalidPort)?;
            graph.connect(from, &output, to, &input)?;
        }
        for parameter in signal["initialParameters"]
            .as_array()
            .ok_or(AuthorError::UnsupportedProject)?
        {
            let node = parameter["nodeId"]
                .as_u64()
                .ok_or(AuthorError::UnsupportedProject)? as u32;
            let id = parameter["id"]
                .as_u64()
                .ok_or(AuthorError::UnsupportedProject)? as u32;
            let value = parameter["value"]
                .as_f64()
                .ok_or(AuthorError::UnsupportedProject)?;
            graph.set_parameter(node, id, value)?;
        }
        for endpoint in root
            .get("endpoints")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            graph.register_parameter(
                endpoint["path"]
                    .as_str()
                    .ok_or(AuthorError::UnsupportedProject)?,
                endpoint["nodeId"]
                    .as_u64()
                    .ok_or(AuthorError::UnsupportedProject)? as u32,
                endpoint["id"]
                    .as_u64()
                    .ok_or(AuthorError::UnsupportedProject)? as u32,
                endpoint["min"]
                    .as_f64()
                    .ok_or(AuthorError::UnsupportedProject)?,
                endpoint["max"]
                    .as_f64()
                    .ok_or(AuthorError::UnsupportedProject)?,
                endpoint["default"]
                    .as_f64()
                    .ok_or(AuthorError::UnsupportedProject)?,
            )?;
        }
        for binding in root
            .get("hostBindings")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            graph.bind_host_slot(
                binding["slot"]
                    .as_u64()
                    .ok_or(AuthorError::UnsupportedProject)? as u32,
                binding["nodeId"]
                    .as_u64()
                    .ok_or(AuthorError::UnsupportedProject)? as u32,
                binding["id"]
                    .as_u64()
                    .ok_or(AuthorError::UnsupportedProject)? as u32,
            )?;
        }
        for control in root
            .get("controls")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let path = control["path"]
                .as_str()
                .ok_or(AuthorError::UnsupportedProject)?;
            graph.register_control(
                path,
                control["min"]
                    .as_f64()
                    .ok_or(AuthorError::UnsupportedProject)?,
                control["max"]
                    .as_f64()
                    .ok_or(AuthorError::UnsupportedProject)?,
                control["default"]
                    .as_f64()
                    .ok_or(AuthorError::UnsupportedProject)?,
                control["discrete"]
                    .as_bool()
                    .ok_or(AuthorError::UnsupportedProject)?,
            )?;
            graph.set_control(
                path,
                control["value"]
                    .as_f64()
                    .ok_or(AuthorError::UnsupportedProject)?,
            )?;
        }
        for instance in root
            .get("instances")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            graph.register_instance(
                instance["path"]
                    .as_str()
                    .ok_or(AuthorError::UnsupportedProject)?,
                instance["nodeId"]
                    .as_u64()
                    .ok_or(AuthorError::UnsupportedProject)? as u32,
            )?;
        }
        for asset in root
            .get("assets")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            graph.assets.insert(
                asset["nodeId"].as_u64().unwrap() as u32,
                Arc::new(asset.clone()),
            );
        }
        for binding in root
            .get("sampleBindings")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            graph.sample_bindings.insert(
                binding["nodeId"].as_u64().unwrap() as u32,
                binding["sourceNodeId"].as_u64().unwrap() as u32,
            );
        }
        if let Some(value) = signal.get("io") {
            let description = GraphDescription {
                nodes: graph
                    .nodes
                    .iter()
                    .map(|(&id, n)| NodeSpec {
                        id: id.into(),
                        kind: n.kind.clone(),
                    })
                    .collect(),
                connections: vec![],
            };
            graph.io = Some(
                IoLayout::from_json(value, &description)
                    .map_err(|_| AuthorError::UnsupportedProject)?,
            );
        }
        graph.to_project()?;
        graph.explicit_host_bindings = root.contains_key("hostBindings") || root.contains_key("hostAssignments");
        graph.host_assignments.clear();
        if let Some(assignments) = root.get("hostAssignments").and_then(Value::as_array) {
            graph.host_assignments = assignments.iter().map(|a| (
                a["slot"].as_u64().unwrap() as u32, a["path"].as_str().map(str::to_owned)
            )).collect();
        }
        Ok(graph)
    }

    pub fn set_input_source(&mut self, source: InputSource) {
        self.input_source = source;
    }

    /// Explicit host bus/channel routes, validated before replacing the layout.
    pub fn set_io_layout(&mut self, layout: IoLayout) -> Result<(), AuthorError> {
        let description = GraphDescription {
            nodes: self
                .nodes
                .iter()
                .map(|(&id, n)| NodeSpec {
                    id: id.into(),
                    kind: n.kind.clone(),
                })
                .collect(),
            connections: vec![],
        };
        layout
            .validate(&description)
            .map_err(|_| AuthorError::InvalidPort)?;
        self.io = Some(layout);
        Ok(())
    }

    pub fn io_layout(&self) -> Option<&IoLayout> {
        self.io.as_ref()
    }

    fn insert(&mut self, id: u32, type_id: &str) -> Result<(), AuthorError> {
        let spec = workspace_type(type_id).ok_or(AuthorError::UnknownType)?;
        let kind = NodeKind::from_abi_code(spec.code, spec.a as f32, spec.b as f32)
            .ok_or(AuthorError::UnknownType)?;
        if !spec.matches_kind(&kind) {
            return Err(AuthorError::UnknownType);
        }
        self.nodes.insert(
            id,
            AuthoredNode {
                spec,
                kind,
                arguments: [spec.a, spec.b],
            },
        );
        for parameter in workspace_parameters(type_id) {
            self.parameters
                .insert((id, parameter.id), parameter.default);
        }
        Ok(())
    }

    pub fn add(&mut self, id: u32, type_id: &str) -> Result<(), AuthorError> {
        if id == 0
            || self.nodes.contains_key(&id)
            || id == 1
            || id == 3
            || type_id == "output"
        {
            return Err(AuthorError::InvalidId);
        }
        self.insert(id, type_id)
    }

    pub fn find(&self, id: u32) -> Option<&str> {
        self.nodes.get(&id).map(|node| node.spec.id)
    }

    pub fn add_with_config(
        &mut self,
        id: u32,
        type_id: &str,
        config: &[(&str, f64)],
    ) -> Result<(), AuthorError> {
        let spec = workspace_type(type_id).ok_or(AuthorError::UnknownType)?;
        let arguments = spec
            .configure([spec.a, spec.b], config)
            .ok_or(AuthorError::InvalidConfiguration)?;
        self.add(id, type_id)?;
        self.set_arguments(id, arguments)
    }

    pub fn configure(&mut self, id: u32, config: &[(&str, f64)]) -> Result<(), AuthorError> {
        let node = self.nodes.get(&id).ok_or(AuthorError::MissingNode)?;
        let arguments = node
            .spec
            .configure(node.arguments, config)
            .ok_or(AuthorError::InvalidConfiguration)?;
        self.set_arguments(id, arguments)
    }

    pub fn capture_ring_bytes(&self, sample_rate: f32) -> Result<usize, GraphError> {
        GraphDescription {
            nodes: self
                .nodes
                .iter()
                .map(|(&id, node)| NodeSpec {
                    id: id.into(),
                    kind: node.kind.clone(),
                })
                .collect(),
            connections: vec![],
        }
        .capture_ring_bytes(sample_rate)
    }

    fn set_arguments(&mut self, id: u32, arguments: [f64; 2]) -> Result<(), AuthorError> {
        let node = self.nodes.get_mut(&id).ok_or(AuthorError::MissingNode)?;
        if !node.spec.valid_arguments(arguments) {
            return Err(AuthorError::InvalidConfiguration);
        }
        let kind =
            NodeKind::from_abi_code(node.spec.code, arguments[0] as f32, arguments[1] as f32)
                .ok_or(AuthorError::InvalidConfiguration)?;
        if node.spec.id == "mixer" {
            let inputs = arguments[0] as u32;
            let valid = |parameter: u32| {
                manifold_core::parameter_catalog::mixer_parameter(inputs as usize, parameter).is_some()
            };
            if self
                .edges
                .values()
                .any(|edge| edge.to == id && edge.input_port >= inputs as usize)
                || self
                    .endpoints
                    .values()
                    .any(|endpoint| endpoint.node == id && !valid(endpoint.id))
                || self
                    .host_bindings
                    .values()
                    .any(|&(target, parameter)| target == id && !valid(parameter))
            {
                return Err(AuthorError::InvalidConfiguration);
            }
            self.parameters
                .retain(|(node_id, parameter), _| *node_id != id || valid(*parameter));
            for parameter in manifold_core::parameter_catalog::configured_mixer_parameters(inputs as usize)
            {
                self.parameters
                    .entry((id, parameter.id))
                    .or_insert(parameter.default);
            }
        }
        node.arguments = arguments;
        node.kind = kind;
        Ok(())
    }

    /// Copies caller PCM into a portable immutable asset on the control thread.
    pub fn set_sample_asset(
        &mut self,
        node: u32,
        stereo: &[f32],
        source_rate: u32,
        label: &str,
    ) -> Result<(), AuthorError> {
        if !matches!(
            self.find(node),
            Some(
                "loop-capture"
                    | "sample-region"
                    | "sample-instrument"
                    | "granulator"
                    | "main-voice-bank"
            )
        ) || self.sample_bindings.contains_key(&node)
            || !(8000..=384000).contains(&source_rate)
            || stereo.is_empty()
            || stereo.len() % 2 != 0
            || stereo.iter().any(|value| !value.is_finite())

        {
            return Err(AuthorError::InvalidAsset);
        }
        let bytes: Vec<u8> = stereo
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect();
        self.assets.insert(
            node,
            Arc::new(
                json!({"nodeId":node,"sourceRate":source_rate,"frames":stereo.len()/2,
            "label":label,"pcmF32Base64":STANDARD.encode(bytes)}),
            ),
        );
        Ok(())
    }

    pub fn remove_sample_asset(&mut self, node: u32) -> bool {
        let removed = self.assets.remove(&node).is_some();
        if removed {
            self.sample_bindings.retain(|_, source| *source != node);
        }
        removed
    }

    pub fn bind_sample_asset(&mut self, source: u32, target: u32) -> Result<(), AuthorError> {
        if source == target
            || self.find(source) != Some("sample-region")
            || self.find(target) != Some("sample-region")
            || !self.assets.contains_key(&source)
            || self.assets.contains_key(&target)
        {
            return Err(AuthorError::InvalidSampleBinding);
        }
        self.sample_bindings.insert(target, source);
        Ok(())
    }

    pub fn unbind_sample_asset(&mut self, target: u32) -> bool {
        self.sample_bindings.remove(&target).is_some()
    }

    pub fn register_instance(&mut self, path: &str, node: u32) -> Result<(), AuthorError> {
        let valid_path = path.starts_with('/')
            && path[1..].split('/').all(|segment| {
                !segment.is_empty()
                    && segment
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            });
        if !valid_path
            || !self.nodes.contains_key(&node)
            || self.instances.contains_key(path)
            || self.instances.values().any(|old| *old == node)
        {
            return Err(AuthorError::InvalidInstance);
        }
        self.instances.insert(path.to_owned(), node);
        Ok(())
    }

    pub fn find_instance(&self, path: &str) -> Option<u32> {
        self.instances.get(path).copied()
    }

    pub fn unregister_instance(&mut self, path: &str) -> bool {
        self.instances.remove(path).is_some()
    }

    pub fn remove(&mut self, id: u32) -> Result<(), AuthorError> {
        if self.io.as_ref().is_some_and(|io| {
            io.input_bindings.iter().any(|b| b.node == u64::from(id))
                || io
                    .output_bindings
                    .iter()
                    .flatten()
                    .any(|b| b.node == u64::from(id))
        }) {
            return Err(AuthorError::InvalidPort);
        }
        if id == 1 || id == 3 {
            return Err(AuthorError::InvalidId);
        }
        if self.nodes.remove(&id).is_none() {
            return Err(AuthorError::MissingNode);
        }
        self.edges
            .retain(|_, edge| edge.from != id && edge.to != id);
        self.parameters.retain(|&(node, _), _| node != id);
        for (&slot, &(node, local)) in &self.host_bindings {
            if node == id {
                self.host_assignments.entry(slot).or_insert_with(|| self.endpoints.values()
                    .find(|p| p.node == node && p.id == local).map(|p| p.path.clone()));
            }
        }
        self.endpoints.retain(|_, endpoint| endpoint.node != id);
        self.host_bindings.retain(|_, binding| binding.0 != id);
        self.instances.retain(|_, node| *node != id);
        self.remove_sample_asset(id);
        self.sample_bindings.remove(&id);
        Ok(())
    }

    pub fn connect(
        &mut self,
        from: u32,
        output: &str,
        to: u32,
        input: &str,
    ) -> Result<(), AuthorError> {
        let source = self.nodes.get(&from).ok_or(AuthorError::MissingNode)?;
        let target = self.nodes.get(&to).ok_or(AuthorError::MissingNode)?;
        let output_port = (0..source.kind.output_port_count())
            .find(|&index| source.kind.output_port_name(index) == Some(output))
            .ok_or(AuthorError::InvalidPort)?;
        let input_port = (0..target.kind.input_port_count())
            .find(|&index| target.kind.input_port_name(index).as_deref() == Some(input))
            .ok_or(AuthorError::InvalidPort)?;
        if source.kind.output_port_signal(output_port) != target.kind.input_port_signal(input_port)
        {
            return Err(AuthorError::SignalMismatch);
        }
        if self.edges.contains_key(&(to, input_port)) {
            return Err(AuthorError::OccupiedInput);
        }
        let mut descendants = BTreeSet::from([to]);
        let mut queue = vec![to];
        while let Some(node) = queue.pop() {
            for edge in self.edges.values().filter(|edge| edge.from == node) {
                if descendants.insert(edge.to) {
                    queue.push(edge.to);
                }
            }
        }
        if descendants.contains(&from) {
            return Err(AuthorError::Cycle);
        }
        self.edges.insert(
            (to, input_port),
            Edge {
                from,
                output_port,
                to,
                input_port,
            },
        );
        Ok(())
    }

    pub fn disconnect(&mut self, to: u32, input: &str) -> Result<(), AuthorError> {
        let target = self.nodes.get(&to).ok_or(AuthorError::MissingNode)?;
        let input_port = (0..target.kind.input_port_count())
            .find(|&index| target.kind.input_port_name(index).as_deref() == Some(input))
            .ok_or(AuthorError::InvalidPort)?;
        self.edges.remove(&(to, input_port));
        Ok(())
    }

    pub fn set_parameter(&mut self, node: u32, id: u32, value: f64) -> Result<(), AuthorError> {
        let kind = self
            .nodes
            .get(&node)
            .ok_or(AuthorError::MissingNode)?
            .spec
            .id;
        let spec = workspace_parameter(kind, id).ok_or(AuthorError::InvalidParameter)?;
        if !self.parameters.contains_key(&(node, id))
            || !value.is_finite()
            || value < spec.min
            || value > spec.max
            || (spec.discrete && value.fract() != 0.0)
            || self.endpoints.values().any(|endpoint| {
                endpoint.node == node
                    && endpoint.id == id
                    && (value < endpoint.min || value > endpoint.max)
            })
        {
            return Err(AuthorError::InvalidParameter);
        }
        self.parameters.insert((node, id), value);
        Ok(())
    }

    pub fn register_parameter(
        &mut self,
        path: &str,
        node: u32,
        id: u32,
        min: f64,
        max: f64,
        default: f64,
    ) -> Result<(), AuthorError> {
        let valid_path = path.starts_with('/')
            && path[1..].split('/').all(|segment| {
                !segment.is_empty()
                    && segment
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            });
        let spec = self
            .nodes
            .get(&node)
            .and_then(|authored| workspace_parameter(authored.spec.id, id));
        let valid_range = spec.is_some_and(|spec| {
            min.is_finite()
                && max.is_finite()
                && default.is_finite()
                && min >= spec.min
                && max <= spec.max
                && (min as f32) < (max as f32)
                && min <= default
                && default <= max
                && (!spec.discrete || [min, max, default].iter().all(|value| value.fract() == 0.0))
        });
        if !valid_path
            || !valid_range
            || !self.parameters.contains_key(&(node, id))
            || self.controls.contains_key(path)
        {
            return Err(AuthorError::InvalidEndpoint);
        }
        if self.endpoints.contains_key(path)
            || self
                .endpoints
                .values()
                .any(|endpoint| endpoint.node == node && endpoint.id == id)
        {
            return Err(AuthorError::DuplicateEndpoint);
        }
        self.endpoints.insert(
            path.to_owned(),
            ParameterEndpoint {
                path: path.to_owned(),
                node,
                id,
                min,
                max,
                default,
            },
        );
        Ok(())
    }

    pub fn find_parameter(&self, path: &str) -> Option<&ParameterEndpoint> {
        self.endpoints.get(path)
    }

    pub fn unregister_parameter(&mut self, path: &str) -> bool {
        self.endpoints.remove(path).is_some()
    }

    pub fn set_parameter_path(&mut self, path: &str, value: f64) -> Result<(), AuthorError> {
        let endpoint = self
            .find_parameter(path)
            .ok_or(AuthorError::InvalidEndpoint)?;
        if !value.is_finite() || value < endpoint.min || value > endpoint.max {
            return Err(AuthorError::InvalidParameter);
        }
        self.set_parameter(endpoint.node, endpoint.id, value)
    }

    pub fn bind_host_slot(&mut self, slot: u32, node: u32, id: u32) -> Result<(), AuthorError> {
        if slot > u32::MAX - crate::parameters::HOST_SLOT_BASE
            || !self.parameters.contains_key(&(node, id))
            || self.host_bindings.contains_key(&slot)
            || self
                .host_bindings
                .values()
                .any(|target| *target == (node, id))
        {
            return Err(AuthorError::InvalidHostSlot);
        }
        if let Some(endpoint) = self.endpoints.values().find(|p| p.node == node && p.id == id) {
            if self.host_assignments.get(&slot).is_some_and(|path| path.as_deref() != Some(endpoint.path.as_str()))
                || self.host_assignments.iter().any(|(&other, path)| other != slot && path.as_deref() == Some(endpoint.path.as_str())) {
                return Err(AuthorError::InvalidHostSlot);
            }
            self.host_assignments.insert(slot, Some(endpoint.path.clone()));
        } else if self.host_assignments.contains_key(&slot) {
            return Err(AuthorError::InvalidHostSlot);
        }
        self.explicit_host_bindings = true;
        self.host_bindings.insert(slot, (node, id));
        Ok(())
    }

    pub fn host_slot_for_path(&self, path: &str) -> Option<u32> {
        let endpoint = self.find_parameter(path)?;
        if let Some(slot) = self
            .host_bindings
            .iter()
            .find(|(_, target)| **target == (endpoint.node, endpoint.id))
            .map(|(slot, _)| *slot)
        {
            return Some(slot);
        }
        if self.explicit_host_bindings { return None; }
        let mut occupied: BTreeSet<u32> = self.host_bindings.keys().copied().collect();
        for target in self.parameters.keys() {
            if self.host_bindings.values().any(|bound| bound == target) {
                continue;
            }
            let slot = (0..=u32::MAX - crate::parameters::HOST_SLOT_BASE).find(|slot| !occupied.contains(slot))?;
            if *target == (endpoint.node, endpoint.id) {
                return Some(slot);
            }
            occupied.insert(slot);
        }
        None
    }

    pub fn unbind_host_slot(&mut self, slot: u32) -> bool {
        if let Some((node, id)) = self.host_bindings.remove(&slot) {
            self.host_assignments.entry(slot).or_insert_with(|| self.endpoints.values()
                .find(|p| p.node == node && p.id == id).map(|p| p.path.clone()));
            true
        } else { false }
    }

    pub fn register_control(
        &mut self,
        path: &str,
        min: f64,
        max: f64,
        default: f64,
        discrete: bool,
    ) -> Result<(), AuthorError> {
        let valid_path = path.starts_with('/')
            && path[1..].split('/').all(|segment| {
                !segment.is_empty()
                    && segment
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            });
        if !valid_path
            || self.controls.contains_key(path)
            || self.endpoints.contains_key(path)
            || ![min, max, default]
                .iter()
                .all(|number| number.is_finite() && number.abs() <= f32::MAX as f64)
            || (min as f32) >= (max as f32)
            || default < min
            || default > max
            || discrete
                && [min, max, default]
                    .iter()
                    .any(|number| number.fract() != 0.0)
        {
            return Err(AuthorError::InvalidControl);
        }
        self.controls.insert(
            path.to_owned(),
            ProjectControl {
                path: path.to_owned(),
                min,
                max,
                default,
                value: default,
                discrete,
            },
        );
        Ok(())
    }

    pub fn set_control(&mut self, path: &str, value: f64) -> Result<(), AuthorError> {
        let control = self
            .controls
            .get_mut(path)
            .ok_or(AuthorError::InvalidControl)?;
        if !value.is_finite()
            || value < control.min
            || value > control.max
            || control.discrete && value.fract() != 0.0
        {
            return Err(AuthorError::InvalidControl);
        }
        control.value = value;
        Ok(())
    }

    pub fn find_control(&self, path: &str) -> Option<&ProjectControl> {
        self.controls.get(path)
    }

    pub fn unregister_control(&mut self, path: &str) -> bool {
        self.controls.remove(path).is_some()
    }

    pub fn to_project(&self) -> Result<Value, AuthorError> {
        if self.io.is_none() && !self.edges.contains_key(&(3, 0)) {
            return Err(AuthorError::UnconnectedOutput);
        }
        let nodes: Vec<_> = self
            .nodes
            .iter()
            .map(|(&id, node)| {
                let mut value = json!({ "id": id, "type": node.spec.id });
                if node.spec.arg_count >= 1 {
                    value["a"] = json_number(node.arguments[0]);
                }
                if node.spec.arg_count >= 2 {
                    value["b"] = json_number(node.arguments[1]);
                }
                value
            })
            .collect();
        let connections: Vec<_> = self
            .edges
            .values()
            .map(|edge| {
                json!({
                    "from": edge.from, "outputPort": edge.output_port,
                    "to": edge.to, "inputPort": edge.input_port,
                })
            })
            .collect();
        let initial_parameters: Vec<_> = self
            .parameters
            .iter()
            .map(|(&(node_id, id), &value)| json!({ "nodeId": node_id, "id": id, "value": json_number(value) }))
            .collect();
        let mut document = json!({
            "format": "manifold.project", "schemaVersion": 1,
            "projectId": "manifold.graph-workspace",
            "signal": { "inputs": 2, "outputs": 2, "inputSource": self.input_source.name(),
                "nodes": nodes, "connections": connections,
                "initialParameters": initial_parameters },
        });
        if let Some(io) = &self.io {
            document["signal"].as_object_mut().unwrap().remove("inputSource");
            document["signal"]["io"] = io.to_json();
            document["signal"]["inputs"] =
                json!(io.inputs.iter().map(|b| b.channels).sum::<usize>());
            document["signal"]["outputs"] =
                json!(io.outputs.iter().map(|b| b.channels).sum::<usize>());
        }
        if !self.endpoints.is_empty() {
            document["endpoints"] = Value::Array(self.endpoints.values().map(|endpoint| json!({
                "path": endpoint.path, "kind": "parameter", "nodeId": endpoint.node,
                "id": endpoint.id, "min": json_number(endpoint.min),
                "max": json_number(endpoint.max), "default": json_number(endpoint.default),
            })).collect());
        }
        if self.explicit_host_bindings || !self.host_bindings.is_empty() {
            document["hostBindings"] = Value::Array(self.host_bindings.iter().map(|(&slot, &(node_id, id))|
                json!({ "slot": slot, "nodeId": node_id, "id": id })
            ).collect());
        }
        if !self.host_assignments.is_empty() {
            document["hostAssignments"] = Value::Array(self.host_assignments.iter()
                .map(|(&slot, path)| if let Some(path) = path { json!({"slot":slot,"path":path}) } else { json!({"slot":slot}) }).collect());
        }
        if !self.controls.is_empty() {
            document["controls"] = Value::Array(self.controls.values().map(|control| json!({
                "path": control.path, "min": json_number(control.min),
                "max": json_number(control.max), "default": json_number(control.default),
                "value": json_number(control.value), "discrete": control.discrete,
            })).collect());
        }
        if !self.instances.is_empty() {
            document["instances"] = Value::Array(
                self.instances
                    .iter()
                    .map(|(path, node_id)| json!({ "path": path, "nodeId": node_id }))
                    .collect(),
            );
        }
        if !self.assets.is_empty() {
            document["assets"] = Value::Array(
                self.assets
                    .values()
                    .map(|asset| (**asset).clone())
                    .collect(),
            );
        }
        if !self.sample_bindings.is_empty() {
            document["sampleBindings"] = Value::Array(
                self.sample_bindings
                    .iter()
                    .map(|(&node, &source)| json!({"nodeId":node,"sourceNodeId":source}))
                    .collect(),
            );
        }
        let bytes = serde_json::to_vec(&document).map_err(|_| AuthorError::InvalidParameter)?;
        NativeProject::parse(&bytes).map_err(AuthorError::Project)?;
        Ok(document)
    }

    pub fn to_project_json(&self) -> Result<Vec<u8>, AuthorError> {
        serde_json::to_vec(&self.to_project()?).map_err(|_| AuthorError::InvalidParameter)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AudioBlock;
    use manifold_core::graph::GraphError;

    #[test]
    fn named_legacy_instances_survive_native_state_and_author_reopen() {
        let source =
            include_bytes!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
        let mut graph = GraphWorkspace::from_project_json(source).unwrap();
        assert_eq!(graph.find_instance("/dsp/live/nodes/width"), Some(5));
        assert_eq!(
            graph.register_instance("/dsp/live/nodes/alias", 5),
            Err(AuthorError::InvalidInstance)
        );
        let bytes = graph.to_project_json().unwrap();
        let native = NativeProject::parse(&bytes).unwrap();
        assert_eq!(native.instance("/dsp/live/nodes/width").unwrap().node, 5);
        let mut prepared = native.prepare_with_state(48_000.0, 128).unwrap();
        let saved = prepared.save_state().unwrap();
        let mut reopened = GraphWorkspace::from_project_json(&saved).unwrap();
        assert_eq!(
            reopened.find_instance("/dsp/live/nodes/input_trim"),
            Some(4)
        );
        assert_eq!(reopened.find_instance("/dsp/live/nodes/width"), Some(5));
        let mut bad: Value = serde_json::from_slice(&saved).unwrap();
        bad["instances"][1]["nodeId"] = json!(99);
        assert!(NativeProject::parse(&serde_json::to_vec(&bad).unwrap()).is_err());
        reopened.remove(5).unwrap();
        assert_eq!(reopened.find_instance("/dsp/live/nodes/width"), None);
        assert_eq!(
            reopened.find_instance("/dsp/live/nodes/input_trim"),
            Some(4)
        );
    }

    #[test]
    fn native_live_session_switches_an_authored_output_and_commits_only_on_acceptance() {
        let mut graph = GraphWorkspace::new();
        graph.add(4, "oscillator").unwrap();
        graph.add(5, "lfo").unwrap();
        graph.add(6, "modulated-gain").unwrap();
        graph.connect(4, "out", 6, "audio").unwrap();
        graph.connect(5, "inv", 6, "cv").unwrap();
        graph.connect(6, "out", 3, "in").unwrap();
        let bytes = graph.to_project_json().unwrap();
        let mut changed = NativeProject::parse(&bytes)
            .unwrap()
            .prepare_patchable(48_000., 128)
            .unwrap();
        let mut reference = NativeProject::parse(&bytes)
            .unwrap()
            .prepare_patchable(48_000., 128)
            .unwrap();
        let mut fixed = NativeProject::parse(&bytes)
            .unwrap()
            .prepare(48_000., 128)
            .unwrap();
        let mut session = LiveGraphSession::new(graph).unwrap();
        let before = session.to_project().unwrap();
        let render = |processor: &mut NativeProcessor| {
            let mut left = [0.; 128];
            let mut right = [0.; 128];
            processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            assert_eq!(left, right);
            left
        };
        assert_eq!(render(&mut changed), render(&mut reference));
        assert!(matches!(
            session.route(&mut fixed, 6, "cv", Some((5, "uni"))),
            Err(AuthorError::Host(NativeError::Graph(
                GraphError::RouteChangeUnavailable
            )))
        ));
        assert_eq!(session.to_project().unwrap(), before);
        assert_eq!(session.revision(), 0);
        let after = session
            .route(&mut changed, 6, "cv", Some((5, "uni")))
            .unwrap();
        assert_eq!(
            after["signal"]["connections"]
                .as_array()
                .unwrap()
                .iter()
                .find(|edge| edge["from"] == 5)
                .unwrap()["outputPort"],
            2
        );
        assert_eq!(session.revision(), 1);
        let changed_audio = render(&mut changed);
        let reference_audio = render(&mut reference);
        assert!(
            changed_audio
                .iter()
                .zip(reference_audio)
                .any(|(left, right)| (left - right).abs() > 0.001)
        );
        assert_eq!(
            session.route(&mut changed, 6, "cv", Some((4, "out"))),
            Err(AuthorError::SignalMismatch)
        );
        assert_eq!(session.to_project().unwrap(), after);
        assert_eq!(session.revision(), 1);
    }

    #[test]
    fn rust_route_control_commits_selection_with_the_accepted_audio_edge() {
        let mut graph = GraphWorkspace::new();
        graph.add(4, "oscillator").unwrap();
        graph.add(5, "gain").unwrap();
        graph.set_parameter(5, 0, 0.3).unwrap();
        graph.connect(4, "out", 5, "audio").unwrap();
        graph.connect(5, "out", 3, "in").unwrap();
        graph
            .register_control("/rack/selected", 0.0, 1.0, 0.0, true)
            .unwrap();
        let bytes = graph.to_project_json().unwrap();
        let mut active = NativeProject::parse(&bytes)
            .unwrap()
            .prepare_patchable(48_000.0, 128)
            .unwrap();
        let mut reference = NativeProject::parse(&bytes)
            .unwrap()
            .prepare_patchable(48_000.0, 128)
            .unwrap();
        let mut fixed = NativeProject::parse(&bytes)
            .unwrap()
            .prepare(48_000.0, 128)
            .unwrap();
        let mut session = LiveGraphSession::new(graph).unwrap();
        let original = session.to_project().unwrap();
        assert_eq!(
            session.route_control(
                &mut active,
                "/rack/selected",
                0.5,
                3,
                "in",
                Some((4, "out"))
            ),
            Err(AuthorError::InvalidControl)
        );
        assert!(matches!(
            session.route_control(&mut fixed, "/rack/selected", 1.0, 3, "in", Some((4, "out"))),
            Err(AuthorError::Host(NativeError::Graph(
                GraphError::RouteChangeUnavailable
            )))
        ));
        assert_eq!(session.to_project().unwrap(), original);
        let selected = session
            .route_control(
                &mut active,
                "/rack/selected",
                1.0,
                3,
                "in",
                Some((4, "out")),
            )
            .unwrap();
        assert_eq!(selected["controls"][0]["value"], 1);
        assert_eq!(selected["signal"]["connections"][0]["from"], 4);
        assert_eq!(session.revision(), 1);
        let render = |processor: &mut NativeProcessor| {
            let mut left = [0.0_f32; 128];
            let mut right = [0.0_f32; 128];
            processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            left
        };
        for _ in 0..12 {
            render(&mut active);
            render(&mut reference);
        }
        let changed = render(&mut active);
        let unchanged = render(&mut reference);
        assert!(
            changed
                .iter()
                .zip(unchanged)
                .any(|(a, b)| (a - b).abs() > 0.05)
        );
    }

    #[test]
    fn rust_and_js_author_the_rack_filter_fx_eq_blend_selection_through_public_primitives() {
        let mut graph = GraphWorkspace::new();
        graph.set_input_source(InputSource::External);
        graph.add(4, "oscillator").unwrap();
        graph.add(5, "svf").unwrap();
        graph.add(6, "eq8").unwrap();
        graph.add(7, "effect-slot-legacy").unwrap();
        graph.add(8, "gain").unwrap();
        graph.add(9, "noise").unwrap();
        graph.add(10, "gain").unwrap();
        graph.add(11, "pulse-oscillator").unwrap();
        graph.add(12, "oscillator").unwrap();
        graph.add(13, "gain").unwrap();
        graph.add(14, "noise").unwrap();
        graph.add(15, "gain").unwrap();
        graph.add(16, "pulse-oscillator").unwrap();
        graph.add(17, "crossfader").unwrap();
        graph.add(18, "gain").unwrap();
        graph.add(19, "ring-modulator").unwrap();
        graph.add(20, "ring-modulator").unwrap();
        graph.add(21, "crossfader").unwrap();
        for (id, kind) in [
            (22, "audio-fm"),
            (23, "audio-fm"),
            (24, "crossfader"),
            (25, "audio-sync"),
            (26, "audio-sync"),
            (27, "crossfader"),
        ] {
            graph.add(id, kind).unwrap();
        }
        for (path, node) in [
            ("/rack_host/input_a/nodes/oscillator", 4),
            ("/rack_host/input_a/nodes/bus", 8),
            ("/rack_host/input_a/nodes/noise", 9),
            ("/rack_host/input_a/nodes/external", 10),
            ("/rack_host/input_a/nodes/pulse", 11),
            ("/rack_host/input_b/nodes/oscillator", 12),
            ("/rack_host/input_b/nodes/bus", 13),
            ("/rack_host/input_b/nodes/noise", 14),
            ("/rack_host/input_b/nodes/external", 15),
            ("/rack_host/input_b/nodes/pulse", 16),
            ("/rack_host/modules/blend_simple/nodes/crossfader", 17),
            ("/rack_host/modules/blend_simple/nodes/output", 18),
            ("/rack_host/modules/blend_simple/nodes/ring_a_to_b", 19),
            ("/rack_host/modules/blend_simple/nodes/ring_b_to_a", 20),
            ("/rack_host/modules/blend_simple/nodes/ring_crossfader", 21),
            ("/rack_host/modules/blend_simple/nodes/fm_a_to_b", 22),
            ("/rack_host/modules/blend_simple/nodes/fm_b_to_a", 23),
            ("/rack_host/modules/blend_simple/nodes/fm_crossfader", 24),
            ("/rack_host/modules/blend_simple/nodes/sync_a_to_b", 25),
            ("/rack_host/modules/blend_simple/nodes/sync_b_to_a", 26),
            ("/rack_host/modules/blend_simple/nodes/sync_crossfader", 27),
            ("/rack_host/modules/filter/nodes/processor", 5),
            ("/rack_host/modules/fx/nodes/processor", 7),
            ("/rack_host/modules/eq/nodes/processor", 6),
        ] {
            graph.register_instance(path, node).unwrap();
        }
        graph.set_parameter(4, 0, 0.0).unwrap();
        graph.set_parameter(4, 1, 261.6255653005986).unwrap();
        graph.set_parameter(4, 2, 1.0).unwrap();
        graph.set_parameter(8, 0, 0.65).unwrap();
        graph.set_parameter(9, 0, 1.0).unwrap();
        graph.set_parameter(9, 1, 0.1).unwrap();
        graph.set_parameter(10, 0, 1.0).unwrap();
        graph.set_parameter(11, 1, 261.6255653005986).unwrap();
        graph.set_parameter(11, 2, 1.0).unwrap();
        graph.set_parameter(11, 4, 0.25).unwrap();
        graph.set_parameter(12, 0, 1.0).unwrap();
        graph
            .set_parameter(12, 1, 440.0 * 2.0_f64.powf((67.0 - 69.0) / 12.0))
            .unwrap();
        graph.set_parameter(12, 2, 1.0).unwrap();
        graph.set_parameter(13, 0, 0.5).unwrap();
        graph.set_parameter(14, 0, 1.0).unwrap();
        graph.set_parameter(14, 1, 0.1).unwrap();
        graph.set_parameter(15, 0, 1.0).unwrap();
        graph
            .set_parameter(16, 1, 440.0 * 2.0_f64.powf((67.0 - 69.0) / 12.0))
            .unwrap();
        graph.set_parameter(16, 2, 1.0).unwrap();
        graph.set_parameter(16, 4, 0.25).unwrap();
        graph.set_parameter(17, 0, 0.0).unwrap();
        graph.set_parameter(17, 1, 1.0).unwrap();
        graph.set_parameter(17, 2, 1.0).unwrap();
        graph.set_parameter(18, 0, 1.0).unwrap();
        for ring in [19, 20] {
            for (id, value) in [(0, 120.0), (1, 0.5), (2, 1.0), (3, 0.0), (4, 1.0)] {
                graph.set_parameter(ring, id, value).unwrap();
            }
        }
        graph.set_parameter(21, 0, 0.0).unwrap();
        graph.set_parameter(21, 1, 1.0).unwrap();
        graph.set_parameter(21, 2, 1.0).unwrap();
        for node in [22, 23, 25, 26] {
            graph.set_parameter(node, 0, 0.5).unwrap();
            graph.set_parameter(node, 1, 1.0).unwrap();
        }
        for node in [24, 27] {
            graph.set_parameter(node, 0, 0.0).unwrap();
            graph.set_parameter(node, 1, 1.0).unwrap();
            graph.set_parameter(node, 2, 1.0).unwrap();
        }
        graph.set_parameter(6, 4, 0.8).unwrap();
        graph.set_parameter(6, 39, 0.8).unwrap();
        for (index, value) in [0.5, 0.5, 0.2, 0.6, 0.4].into_iter().enumerate() {
            graph.set_parameter(7, index as u32 + 2, value).unwrap();
        }
        graph.connect(1, "out", 10, "audio").unwrap();
        graph.connect(1, "out", 15, "audio").unwrap();
        graph.connect(4, "out", 8, "audio").unwrap();
        graph.connect(12, "out", 13, "audio").unwrap();
        graph.connect(8, "out", 5, "audio").unwrap();
        graph.connect(8, "out", 7, "audio").unwrap();
        graph.connect(8, "out", 6, "audio").unwrap();
        graph.connect(8, "out", 17, "a").unwrap();
        graph.connect(13, "out", 17, "b").unwrap();
        graph.connect(8, "out", 19, "carrier").unwrap();
        graph.connect(13, "out", 19, "modulator").unwrap();
        graph.connect(13, "out", 20, "carrier").unwrap();
        graph.connect(8, "out", 20, "modulator").unwrap();
        graph.connect(19, "out", 21, "a").unwrap();
        graph.connect(20, "out", 21, "b").unwrap();
        for (forward, backward, crossfade) in [(22, 23, 24), (25, 26, 27)] {
            graph.connect(8, "out", forward, "carrier").unwrap();
            graph.connect(13, "out", forward, "modulator").unwrap();
            graph.connect(13, "out", backward, "carrier").unwrap();
            graph.connect(8, "out", backward, "modulator").unwrap();
            graph.connect(forward, "out", crossfade, "a").unwrap();
            graph.connect(backward, "out", crossfade, "b").unwrap();
        }
        graph.connect(17, "out", 18, "audio").unwrap();
        graph.connect(5, "out", 3, "in").unwrap();
        graph
            .register_control("/rack_host/module/index", 1.0, 19.0, 4.0, true)
            .unwrap();
        graph
            .register_control("/rack_host/input_a/mode", 1.0, 7.0, 3.0, true)
            .unwrap();
        graph
            .register_control("/rack_host/input_a/pitch", 24.0, 84.0, 60.0, true)
            .unwrap();
        graph
            .register_control("/rack_host/input_b/mode", 1.0, 7.0, 4.0, true)
            .unwrap();
        graph
            .register_control("/rack_host/input_b/pitch", 24.0, 84.0, 67.0, true)
            .unwrap();
        graph
            .register_control("/midi/synth/rack/blend_simple/1/mode", 0.0, 3.0, 0.0, true)
            .unwrap();
        graph
            .register_control(
                "/midi/synth/rack/blend_simple/1/blendAmount",
                0.0,
                1.0,
                0.5,
                false,
            )
            .unwrap();
        graph
            .register_control(
                "/midi/synth/rack/blend_simple/1/blendModAmount",
                0.0,
                1.0,
                0.5,
                false,
            )
            .unwrap();
        for (path, node, id, min, max, default, slot) in [
            ("/midi/synth/rack/filter/1/type", 5, 0, 0.0, 3.0, 0.0, 0),
            (
                "/midi/synth/rack/filter/1/cutoff",
                5,
                1,
                20.0,
                20_000.0,
                3200.0,
                1,
            ),
            (
                "/midi/synth/rack/filter/1/resonance",
                5,
                2,
                0.1,
                1.0,
                0.75,
                2,
            ),
            ("/midi/synth/rack/eq/1/output", 6, 40, -24.0, 24.0, 0.0, 3),
            ("/midi/synth/rack/eq/1/mix", 6, 41, 0.0, 1.0, 1.0, 4),
            ("/midi/synth/rack/fx/1/type", 7, 0, 0.0, 20.0, 0.0, 5),
            ("/midi/synth/rack/fx/1/mix", 7, 1, 0.0, 1.0, 0.0, 6),
            ("/rack_host/input_a/level", 8, 0, 0.0, 1.0, 0.65, 12),
            ("/rack_host/input_b/level", 13, 0, 0.0, 1.0, 0.5, 13),
            (
                "/midi/synth/rack/blend_simple/1/output",
                18,
                0,
                0.0,
                1.0,
                1.0,
                14,
            ),
        ] {
            graph
                .register_parameter(path, node, id, min, max, default)
                .unwrap();
            graph.bind_host_slot(slot, node, id).unwrap();
        }
        for (index, default) in [0.5, 0.5, 0.2, 0.6, 0.4].into_iter().enumerate() {
            graph
                .register_parameter(
                    &format!("/midi/synth/rack/fx/1/p/{index}"),
                    7,
                    index as u32 + 2,
                    0.0,
                    1.0,
                    default,
                )
                .unwrap();
            graph
                .bind_host_slot(index as u32 + 7, 7, index as u32 + 2)
                .unwrap();
        }
        let filter_fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-filter.json"
        ))
        .unwrap();
        let eq_fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-eq.json"
        ))
        .unwrap();
        let fx_fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-fx.json"
        ))
        .unwrap();
        assert_eq!(graph.to_project().unwrap(), filter_fixture);
        let mut processor = NativeProject::parse(&graph.to_project_json().unwrap())
            .unwrap()
            .prepare_patchable(48_000.0, 128)
            .unwrap();
        let mut session = LiveGraphSession::new(graph).unwrap();
        let render = |processor: &mut NativeProcessor| {
            let mut left = [0.0_f32; 128];
            let mut right = [0.0_f32; 128];
            processor
                .process(AudioBlock {
                    main: None,
                    sidechain: None,
                    output: [&mut left, &mut right],
                    events: &[],
                })
                .unwrap();
            left
        };
        let filtered = render(&mut processor);
        let selected_fx = session
            .route_control(
                &mut processor,
                "/rack_host/module/index",
                5.0,
                3,
                "in",
                Some((7, "out")),
            )
            .unwrap();
        assert_eq!(selected_fx, fx_fixture);
        let _effect_dry = render(&mut processor);
        let selected = session
            .route_control(
                &mut processor,
                "/rack_host/module/index",
                6.0,
                3,
                "in",
                Some((6, "out")),
            )
            .unwrap();
        assert_eq!(selected, eq_fixture);
        let equalized = render(&mut processor);
        let blend_fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-blend.json"
        ))
        .unwrap();
        let selected_blend = session
            .route_control(
                &mut processor,
                "/rack_host/module/index",
                3.0,
                3,
                "in",
                Some((18, "out")),
            )
            .unwrap();
        assert_eq!(selected_blend, blend_fixture);
        let blended = render(&mut processor);
        assert!(
            blended
                .iter()
                .zip(equalized.iter())
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        let ring_fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-blend-ring.json"
        ))
        .unwrap();
        let mut ring_processor = NativeProject::parse(&serde_json::to_vec(&blend_fixture).unwrap())
            .unwrap()
            .prepare_patchable(48_000.0, 128)
            .unwrap();
        let mut ring_session =
            LiveGraphSession::new(GraphWorkspace::from_project(&blend_fixture).unwrap()).unwrap();
        assert_eq!(
            ring_session
                .route_control(
                    &mut ring_processor,
                    "/midi/synth/rack/blend_simple/1/mode",
                    1.0,
                    18,
                    "audio",
                    Some((21, "out"))
                )
                .unwrap(),
            ring_fixture
        );
        let ring_audio = render(&mut ring_processor);
        let mut crossfade_processor =
            NativeProject::parse(&serde_json::to_vec(&blend_fixture).unwrap())
                .unwrap()
                .prepare_patchable(48_000.0, 128)
                .unwrap();
        let crossfade_audio = render(&mut crossfade_processor);
        assert!(
            ring_audio
                .iter()
                .zip(crossfade_audio.iter())
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        for (mode, branch, fixture) in [
            (
                2.0,
                24,
                include_bytes!("../../../projects/graph-workspace/authored-rack-blend-fm.json")
                    .as_slice(),
            ),
            (
                3.0,
                27,
                include_bytes!("../../../projects/graph-workspace/authored-rack-blend-sync.json")
                    .as_slice(),
            ),
        ] {
            let fixture: Value = serde_json::from_slice(fixture).unwrap();
            let mut mode_processor =
                NativeProject::parse(&serde_json::to_vec(&blend_fixture).unwrap())
                    .unwrap()
                    .prepare_patchable(48_000.0, 128)
                    .unwrap();
            let mut mode_session =
                LiveGraphSession::new(GraphWorkspace::from_project(&blend_fixture).unwrap())
                    .unwrap();
            assert_eq!(
                mode_session
                    .route_control(
                        &mut mode_processor,
                        "/midi/synth/rack/blend_simple/1/mode",
                        mode,
                        18,
                        "audio",
                        Some((branch, "out"))
                    )
                    .unwrap(),
                fixture
            );
            let audio = render(&mut mode_processor);
            assert!(audio.iter().all(|sample| sample.is_finite()));
            assert!(
                audio
                    .iter()
                    .zip(crossfade_audio.iter())
                    .any(|(a, b)| (a - b).abs() > 0.01)
            );
        }
        assert!(
            filtered
                .iter()
                .zip(equalized)
                .any(|(a, b)| (a - b).abs() > 0.01)
        );
        assert_eq!(
            session.parameter_control(
                &mut processor,
                "/rack_host/input_a/pitch",
                60.5,
                4,
                1,
                270.0,
            ),
            Err(AuthorError::InvalidControl)
        );
        assert_eq!(session.to_project().unwrap(), blend_fixture);
        let pitched = session
            .parameter_control(
                &mut processor,
                "/rack_host/input_a/pitch",
                69.0,
                4,
                1,
                440.0,
            )
            .unwrap();
        assert_eq!(
            pitched["controls"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["path"] == "/rack_host/input_a/pitch")
                .unwrap()["value"],
            69
        );
        assert_eq!(
            pitched["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 4 && entry["id"] == 1)
                .unwrap()["value"],
            440.0
        );
        let reopened = GraphWorkspace::from_project(&selected).unwrap();
        assert_eq!(
            reopened.find_instance("/rack_host/modules/eq/nodes/processor"),
            Some(6)
        );
        let noise_fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-noise.json"
        ))
        .unwrap();
        let external_fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-external.json"
        ))
        .unwrap();
        let pulse_fixture: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-rack-pulse.json"
        ))
        .unwrap();
        let mut source_processor = NativeProject::parse(&serde_json::to_vec(&eq_fixture).unwrap())
            .unwrap()
            .prepare_patchable(48_000.0, 128)
            .unwrap();
        let mut source_session =
            LiveGraphSession::new(GraphWorkspace::from_project(&eq_fixture).unwrap()).unwrap();
        assert_eq!(
            source_session
                .route_control(
                    &mut source_processor,
                    "/rack_host/input_a/mode",
                    7.0,
                    8,
                    "audio",
                    Some((9, "out")),
                )
                .unwrap(),
            noise_fixture
        );
        assert!(
            render(&mut source_processor)
                .iter()
                .any(|sample| sample.abs() > 0.01)
        );
        let mut blend_processor =
            NativeProject::parse(&serde_json::to_vec(&blend_fixture).unwrap())
                .unwrap()
                .prepare_patchable(48_000.0, 128)
                .unwrap();
        let mut blend_session =
            LiveGraphSession::new(GraphWorkspace::from_project(&blend_fixture).unwrap()).unwrap();
        for (mode, branch) in [
            (7.0, Some(14)),
            (1.0, Some(15)),
            (6.0, Some(16)),
            (2.0, None),
            (4.0, Some(12)),
        ] {
            let saved = blend_session
                .route_control(
                    &mut blend_processor,
                    "/rack_host/input_b/mode",
                    mode,
                    13,
                    "audio",
                    branch.map(|node| (node, "out")),
                )
                .unwrap();
            assert_eq!(
                saved["controls"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|entry| entry["path"] == "/rack_host/input_b/mode")
                    .unwrap()["value"],
                mode
            );
            assert_eq!(
                saved["signal"]["connections"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|edge| edge["to"] == 13)
                    .map(|edge| edge["from"].as_u64().unwrap()),
                branch.map(u64::from)
            );
            let audio = render(&mut blend_processor);
            assert!(audio.iter().all(|sample| sample.is_finite()));
        }
        assert_eq!(
            source_session
                .route_control(
                    &mut source_processor,
                    "/rack_host/input_a/mode",
                    1.0,
                    8,
                    "audio",
                    Some((10, "out")),
                )
                .unwrap(),
            external_fixture
        );
        assert_eq!(
            source_session
                .route_control(
                    &mut source_processor,
                    "/rack_host/input_a/mode",
                    6.0,
                    8,
                    "audio",
                    Some((11, "out")),
                )
                .unwrap(),
            pulse_fixture
        );
        assert!(
            render(&mut source_processor)
                .iter()
                .any(|sample| sample.abs() > 0.01)
        );
    }

    #[test]
    fn rust_and_javascript_authoring_export_the_same_graph_and_audio() {
        let mut graph = GraphWorkspace::new();
        graph.add(4, "oscillator").unwrap();
        graph.add(5, "lfo").unwrap();
        graph.add(6, "modulated-gain").unwrap();
        graph.connect(4, "out", 6, "audio").unwrap();
        graph.connect(5, "inv", 6, "cv").unwrap();
        graph.connect(6, "out", 3, "in").unwrap();
        let js: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-inverted-lfo.json"
        ))
        .unwrap();
        assert_eq!(graph.to_project().unwrap(), js);
        let bytes = graph.to_project_json().unwrap();
        let mut processor = NativeProject::parse(&bytes)
            .unwrap()
            .prepare(48_000., 128)
            .unwrap();
        let mut left = [0.; 128];
        let mut right = [0.; 128];
        processor
            .process(AudioBlock {
                main: None,
                sidechain: None,
                output: [&mut left, &mut right],
                events: &[],
            })
            .unwrap();
        assert!(left.iter().any(|sample| sample.abs() > 0.001));
        assert_eq!(left, right);
    }

    #[test]
    fn rust_and_javascript_author_the_same_cv_utility_chain() {
        let mut graph = GraphWorkspace::new();
        for (id, kind) in [
            (4, "oscillator"),
            (5, "lfo"),
            (6, "attenuverter-bias"),
            (7, "slew-control"),
            (8, "sample-hold"),
            (9, "cv-mix"),
            (10, "modulated-gain"),
        ] {
            graph.add(id, kind).unwrap();
        }
        for (node, id, value) in [
            (5, 1, 5.0),
            (6, 0, -0.8),
            (6, 1, 0.2),
            (7, 0, 24.0),
            (7, 1, 80.0),
            (9, 1, 0.3),
        ] {
            graph.set_parameter(node, id, value).unwrap();
        }
        for (from, output, to, input) in [
            (5, "out", 6, "cv"),
            (6, "out", 7, "cv"),
            (7, "out", 8, "cv"),
            (5, "uni", 8, "trigger"),
            (8, "out", 9, "in-1"),
            (5, "inv", 9, "in-2"),
            (9, "out", 10, "cv"),
            (4, "out", 10, "audio"),
            (10, "out", 3, "in"),
        ] {
            graph.connect(from, output, to, input).unwrap();
        }
        let js: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-cv-utilities.json"
        ))
        .unwrap();
        assert_eq!(graph.to_project().unwrap(), js);
    }

    #[test]
    fn rust_and_javascript_author_the_same_cv_decision_chain() {
        let mut graph = GraphWorkspace::new();
        for (id, kind) in [
            (4, "oscillator"),
            (5, "lfo"),
            (6, "cv-compare"),
            (7, "cv-range"),
            (8, "cv-mix"),
            (9, "modulated-gain"),
        ] {
            graph.add(id, kind).unwrap();
        }
        for (node, id, value) in [
            (5, 1, 20.0),
            (6, 0, 2.0),
            (6, 1, 0.2),
            (7, 0, 0.1),
            (7, 1, 0.8),
            (7, 2, 1.0),
            (8, 0, 0.5),
            (8, 1, 0.5),
        ] {
            graph.set_parameter(node, id, value).unwrap();
        }
        for (from, output, to, input) in [
            (5, "out", 6, "cv"),
            (6, "gate", 7, "cv"),
            (7, "out", 8, "in-1"),
            (6, "trig", 8, "in-2"),
            (8, "out", 9, "cv"),
            (4, "out", 9, "audio"),
            (9, "out", 3, "in"),
        ] {
            graph.connect(from, output, to, input).unwrap();
        }
        let js: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-cv-decisions.json"
        ))
        .unwrap();
        assert_eq!(graph.to_project().unwrap(), js);
    }

    #[test]
    fn rust_and_javascript_author_the_legacy_live_script_graph() {
        let mut graph = GraphWorkspace::new();
        graph.set_input_source(InputSource::External);
        graph.add(4, "gain").unwrap();
        graph.add(5, "stereo-widener").unwrap();
        graph
            .register_instance("/dsp/live/nodes/input_trim", 4)
            .unwrap();
        graph.register_instance("/dsp/live/nodes/width", 5).unwrap();
        graph.set_parameter(4, 0, 1.0).unwrap();
        graph.set_parameter(5, 0, 0.25).unwrap();
        graph
            .register_parameter("/dsp/live/input_gain", 4, 0, 0.0, 2.0, 1.0)
            .unwrap();
        graph
            .register_parameter("/dsp/live/width", 5, 0, 0.0, 1.0, 0.25)
            .unwrap();
        graph.bind_host_slot(0, 4, 0).unwrap();
        graph.bind_host_slot(1, 5, 0).unwrap();
        graph.connect(1, "out", 4, "audio").unwrap();
        graph.connect(4, "out", 5, "audio").unwrap();
        graph.connect(5, "out", 3, "in").unwrap();
        let js: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-dsp-live-scripting.json"
        ))
        .unwrap();
        assert_eq!(graph.to_project().unwrap(), js);
        assert_eq!(graph.find_parameter("/dsp/live/width").unwrap().max, 1.0);
        assert_eq!(
            graph.set_parameter_path("/dsp/live/width", 1.5),
            Err(AuthorError::InvalidParameter)
        );
        let parsed = NativeProject::parse(&graph.to_project_json().unwrap()).unwrap();
        assert_eq!(parsed.parameter_endpoints().len(), 2);
        assert_eq!(parsed.endpoint("/dsp/live/input_gain").unwrap().node, 4);
        assert_eq!(
            parsed
                .host_parameters()
                .iter()
                .find(|entry| entry.node == 5)
                .unwrap()
                .max,
            1.0
        );
        assert_eq!(
            graph.set_parameter(5, 0, 1.5),
            Err(AuthorError::InvalidParameter)
        );
        assert_eq!(parsed.endpoint_host_slot("/dsp/live/width"), Some(1));
        assert_eq!(graph.host_slot_for_path("/dsp/live/input_gain"), Some(0));
        let mut inserted = graph.clone();
        inserted.add(2, "gain").unwrap();
        inserted
            .register_parameter("/new/level", 2, 0, 0.0, 2.0, 1.0)
            .unwrap();
        assert_eq!(inserted.host_slot_for_path("/new/level"), None);
        inserted.bind_host_slot(2, 2, 0).unwrap();
        let inserted_native = NativeProject::parse(&inserted.to_project_json().unwrap()).unwrap();
        assert_eq!(
            inserted_native.endpoint_host_slot("/dsp/live/input_gain"),
            Some(0)
        );
        assert_eq!(
            inserted_native.endpoint_host_slot("/dsp/live/width"),
            Some(1)
        );
        assert_eq!(inserted_native.endpoint_host_slot("/new/level"), Some(2));
        assert!(parsed.endpoint("/unknown").is_none());
        let mut processor = NativeProject::parse(&graph.to_project_json().unwrap())
            .unwrap()
            .prepare(48_000., 128)
            .unwrap();
        assert!(!processor.set_parameter(5_u32.into(), 0, 1.5));
        let left: [f32; 128] = std::array::from_fn(|frame| ((frame % 16) as f32 - 8.0) / 8.0);
        let right: [f32; 128] =
            std::array::from_fn(|frame| (((frame * 3) % 16) as f32 - 8.0) / 8.0);
        let mut out_left = [0.; 128];
        let mut out_right = [0.; 128];
        processor
            .process(AudioBlock {
                main: Some([&left, &right]),
                sidechain: None,
                output: [&mut out_left, &mut out_right],
                events: &[],
            })
            .unwrap();
        assert!(out_left.iter().any(|value| value.abs() > 0.01));
        assert_ne!(out_left, out_right);
        let mut session = LiveGraphSession::new(graph).unwrap();
        let changed = session
            .parameter_path(&mut processor, "/dsp/live/width", 0.8)
            .unwrap();
        assert_eq!(changed["signal"]["initialParameters"][1]["value"], 0.8);
        assert_eq!(session.revision(), 1);
        let mut reopened = NativeProject::parse(&serde_json::to_vec(&changed).unwrap())
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let saved: Value = serde_json::from_slice(&reopened.save_state().unwrap()).unwrap();
        assert_eq!(saved["endpoints"], changed["endpoints"]);
        let mut invalid = changed.clone();
        invalid["endpoints"][1]["max"] = json!(3);
        assert!(NativeProject::parse(&serde_json::to_vec(&invalid).unwrap()).is_err());
    }

    #[test]
    fn rust_and_javascript_author_the_lazy_fx_swap_graph_and_saved_controls() {
        let mut graph = GraphWorkspace::new();
        graph.set_input_source(InputSource::External);
        graph.add(4, "gain").unwrap();
        graph
            .register_instance("/test/fxslot/nodes/input_trim", 4)
            .unwrap();
        graph.set_parameter(4, 0, 1.0).unwrap();
        graph
            .register_parameter("/test/fxslot/input_gain", 4, 0, 0.0, 2.0, 1.0)
            .unwrap();
        graph.bind_host_slot(0, 4, 0).unwrap();
        graph.connect(1, "out", 4, "audio").unwrap();
        for (name, source, gain, gate, mix) in [("slotA", 4, 6, 7, 8), ("slotB", 8, 10, 11, 12)] {
            graph.add(gain, "gain").unwrap();
            graph.add(gate, "gain").unwrap();
            graph.add(mix, "sum2").unwrap();
            for (role, id) in [("gain", gain), ("gain_gate", gate), ("mix", mix)] {
                graph
                    .register_instance(&format!("/test/fxslot/{name}/nodes/{role}"), id)
                    .unwrap();
            }
            graph.set_parameter(gain, 0, 0.8).unwrap();
            graph.set_parameter(gate, 0, 1.0).unwrap();
            graph.connect(source, "out", gain, "audio").unwrap();
            graph.connect(gain, "out", gate, "audio").unwrap();
            graph.connect(gate, "out", mix, "a").unwrap();
            graph
                .register_control(&format!("/test/fxslot/{name}/select"), 0.0, 1.0, 0.0, true)
                .unwrap();
            graph
                .register_control(
                    &format!("/test/fxslot/{name}/gain/amount"),
                    0.0,
                    2.0,
                    0.8,
                    false,
                )
                .unwrap();
            graph
                .register_control(
                    &format!("/test/fxslot/{name}/width/amount"),
                    0.0,
                    2.0,
                    1.6,
                    false,
                )
                .unwrap();
        }
        graph.add(13, "gain").unwrap();
        graph
            .register_instance("/test/fxslot/nodes/master", 13)
            .unwrap();
        graph.set_parameter(13, 0, 1.0).unwrap();
        graph.connect(12, "out", 13, "audio").unwrap();
        graph.connect(13, "out", 3, "in").unwrap();
        let js: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-fx-slot-swap.json"
        ))
        .unwrap();
        assert_eq!(graph.to_project().unwrap(), js);
        let default_graph = graph.clone();
        assert_eq!(
            js["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 4)
                .unwrap()["value"],
            1
        );
        assert_eq!(
            js["signal"]["initialParameters"]
                .as_array()
                .unwrap()
                .iter()
                .find(|entry| entry["nodeId"] == 13)
                .unwrap()["value"],
            1
        );
        graph
            .set_control("/test/fxslot/slotA/width/amount", 1.9)
            .unwrap();
        graph.set_control("/test/fxslot/slotA/select", 1.0).unwrap();
        graph.add(14, "stereo-widener").unwrap();
        graph.add(15, "gain").unwrap();
        graph
            .register_instance("/test/fxslot/slotA/nodes/width", 14)
            .unwrap();
        graph
            .register_instance("/test/fxslot/slotA/nodes/width_gate", 15)
            .unwrap();
        graph.set_parameter(14, 0, 1.9).unwrap();
        graph.set_parameter(14, 1, 160.0).unwrap();
        graph.set_parameter(14, 2, 1.0).unwrap();
        graph.set_parameter(15, 0, 1.0).unwrap();
        graph.connect(4, "out", 14, "audio").unwrap();
        graph.connect(14, "out", 15, "audio").unwrap();
        graph.connect(15, "out", 8, "b").unwrap();
        graph.set_parameter(7, 0, 0.0).unwrap();
        let js_width: Value = serde_json::from_slice(include_bytes!(
            "../../../projects/graph-workspace/authored-fx-slot-swap-width.json"
        ))
        .unwrap();
        assert_eq!(graph.to_project().unwrap(), js_width);
        assert_eq!(
            graph
                .find_control("/test/fxslot/slotA/select")
                .unwrap()
                .value,
            1.0
        );
        assert_eq!(
            graph.set_control("/test/fxslot/slotA/select", 0.5),
            Err(AuthorError::InvalidControl)
        );
        let project = NativeProject::parse(&graph.to_project_json().unwrap()).unwrap();
        assert_eq!(project.controls().len(), 6);
        assert_eq!(
            project
                .control("/test/fxslot/slotA/width/amount")
                .unwrap()
                .value,
            1.9
        );
        let mut prepared = project.prepare_with_state(48_000., 128).unwrap();
        let saved: Value = serde_json::from_slice(&prepared.save_state().unwrap()).unwrap();
        assert_eq!(saved["controls"], js_width["controls"]);
        assert!(NativeProject::parse(&serde_json::to_vec(&saved).unwrap()).is_ok());
        let mut restored =
            GraphWorkspace::from_project_json(&serde_json::to_vec(&saved).unwrap()).unwrap();
        let reopened_document = restored.to_project().unwrap();
        assert_eq!(reopened_document["controls"], saved["controls"]);
        assert_eq!(reopened_document["endpoints"], saved["endpoints"]);
        assert_eq!(
            reopened_document["signal"]["nodes"],
            saved["signal"]["nodes"]
        );
        assert_eq!(
            reopened_document["signal"]["connections"],
            saved["signal"]["connections"]
        );
        for (author, host) in reopened_document["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .zip(saved["signal"]["initialParameters"].as_array().unwrap())
        {
            assert_eq!(author["nodeId"], host["nodeId"]);
            assert_eq!(author["id"], host["id"]);
            assert!(
                (author["value"].as_f64().unwrap() - host["value"].as_f64().unwrap()).abs() < 1e-6
            );
        }
        restored
            .set_control("/test/fxslot/slotA/select", 0.0)
            .unwrap();
        restored.set_parameter(7, 0, 1.0).unwrap();
        restored.set_parameter(15, 0, 0.0).unwrap();
        let reopened = NativeProject::parse(&restored.to_project_json().unwrap()).unwrap();
        assert_eq!(
            reopened.control("/test/fxslot/slotA/select").unwrap().value,
            0.0
        );
        let mut empty_assets = saved.clone();
        empty_assets["assets"] = json!([]);
        assert!(GraphWorkspace::from_project(&empty_assets).is_ok());
        let mut invalid = saved.clone();
        invalid["controls"][1]["value"] = json!(1.5);
        assert!(NativeProject::parse(&serde_json::to_vec(&invalid).unwrap()).is_err());
        let mut initial = NativeProject::parse(&serde_json::to_vec(&js).unwrap())
            .unwrap()
            .prepare(48_000., 128)
            .unwrap();
        let input_left: [f32; 128] = std::array::from_fn(|i| ((i % 16) as f32 - 8.) / 8.);
        let input_right: [f32; 128] = std::array::from_fn(|i| (((i * 3) % 16) as f32 - 8.) / 8.);
        let render = |processor: &mut NativeProcessor| {
            let mut left = [0.; 128];
            let mut right = [0.; 128];
            for _ in 0..12 {
                processor
                    .process(AudioBlock {
                        main: Some([&input_left, &input_right]),
                        sidechain: None,
                        output: [&mut left, &mut right],
                        events: &[],
                    })
                    .unwrap();
            }
            (left, right)
        };
        let gain = render(&mut initial);
        let width = render(&mut prepared.processor);
        assert!(
            gain.0
                .iter()
                .zip(width.0)
                .any(|(a, b)| (a - b).abs() > 0.03)
        );
        let mut active = NativeProject::parse(&serde_json::to_vec(&js).unwrap())
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let mut session = LiveGraphSession::new(default_graph).unwrap();
        let staged = session
            .prepare_transaction(48_000., 128, |next| {
                next.set_control("/test/fxslot/slotA/width/amount", 1.9)?;
                next.set_control("/test/fxslot/slotA/select", 1.0)?;
                next.add(14, "stereo-widener")?;
                next.add(15, "gain")?;
                next.register_instance("/test/fxslot/slotA/nodes/width", 14)?;
                next.register_instance("/test/fxslot/slotA/nodes/width_gate", 15)?;
                next.set_parameter(14, 0, 1.9)?;
                next.set_parameter(14, 1, 160.0)?;
                next.set_parameter(14, 2, 1.0)?;
                next.set_parameter(15, 0, 1.0)?;
                next.connect(4, "out", 14, "audio")?;
                next.connect(14, "out", 15, "audio")?;
                next.connect(15, "out", 8, "b")?;
                next.set_parameter(7, 0, 0.0)
            })
            .unwrap();
        assert_eq!(staged.to_project().unwrap(), js_width);
        assert_eq!(render(&mut active.processor), gain);
        let retired = session.publish_transaction(&mut active, staged).unwrap();
        assert_eq!(session.revision(), 1);
        let entering = render(&mut active.processor);
        assert_ne!(entering, gain);
        let mut settled = entering;
        for _ in 0..4 {
            settled = render(&mut active.processor);
        }
        let max_difference = settled
            .0
            .iter()
            .zip(width.0)
            .chain(settled.1.iter().zip(width.1))
            .map(|(a, b)| (a - b).abs())
            .fold(0.0_f32, f32::max);
        assert!(max_difference < 3e-5, "settled difference {max_difference}");
        drop(retired);
    }

    #[test]
    fn native_structural_transaction_adds_and_removes_a_legacy_primitive_between_blocks() {
        let mut graph = GraphWorkspace::new();
        graph.set_input_source(InputSource::External);
        graph.add(4, "gain").unwrap();
        graph.set_parameter(4, 0, 1.0).unwrap();
        graph.connect(1, "out", 4, "audio").unwrap();
        graph.connect(4, "out", 3, "in").unwrap();
        let mut active = NativeProject::parse(&graph.to_project_json().unwrap())
            .unwrap()
            .prepare_with_state(48_000., 128)
            .unwrap();
        let mut session = LiveGraphSession::new(graph).unwrap();
        let before = session.to_project().unwrap();
        assert!(matches!(
            session.prepare_transaction(48_000., 128, |next| {
                next.disconnect(3, "in")?;
                Ok(())
            }),
            Err(AuthorError::UnconnectedOutput)
        ));
        assert_eq!(session.to_project().unwrap(), before);
        let stale = session
            .prepare_transaction(48_000., 128, |next| next.set_parameter(4, 0, 0.5))
            .unwrap();
        let adding = session
            .prepare_transaction(48_000., 128, |next| {
                next.add(5, "stereo-widener")?;
                next.set_parameter(5, 0, 1.8)?;
                next.disconnect(3, "in")?;
                next.connect(4, "out", 5, "audio")?;
                next.connect(5, "out", 3, "in")
            })
            .unwrap();
        assert_eq!(
            adding.to_project().unwrap()["signal"]["nodes"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        assert_eq!(session.to_project().unwrap(), before);
        let left: [f32; 128] = std::array::from_fn(|i| ((i % 16) as f32 - 8.) / 8.);
        let right: [f32; 128] = std::array::from_fn(|i| (((i * 3) % 16) as f32 - 8.) / 8.);
        let render = |project: &mut PreparedNativeProject| {
            let mut out_left = [0.; 128];
            let mut out_right = [0.; 128];
            project
                .processor
                .process(AudioBlock {
                    main: Some([&left, &right]),
                    sidechain: None,
                    output: [&mut out_left, &mut out_right],
                    events: &[],
                })
                .unwrap();
            (out_left, out_right)
        };
        let dry = render(&mut active);
        let mut retired = session.publish_transaction(&mut active, adding).unwrap();
        assert_eq!(session.revision(), 1);
        assert_eq!(
            session.to_project().unwrap()["signal"]["nodes"]
                .as_array()
                .unwrap()
                .len(),
            4
        );
        let rejected = session
            .publish_transaction(&mut active, stale)
            .err()
            .unwrap();
        assert_eq!(rejected.reason, AuthorError::StaleTransaction);
        drop(rejected);
        assert_eq!(render(&mut retired.runtime), dry);
        let wet = render(&mut active);
        assert!(wet.0.iter().zip(dry.0).any(|(a, b)| (a - b).abs() > 0.05));
        let removing = session
            .prepare_transaction(48_000., 128, |next| {
                next.remove(5)?;
                next.connect(4, "out", 3, "in")
            })
            .unwrap();
        let _retired = session.publish_transaction(&mut active, removing).unwrap();
        assert_eq!(session.revision(), 2);
        assert_eq!(session.to_project().unwrap(), before);
        assert_eq!(render(&mut active), dry);
    }

    #[test]
    fn named_widener_keeps_its_filter_history_when_numeric_id_changes() {
        let source =
            include_bytes!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
        let graph = GraphWorkspace::from_project_json(source).unwrap();
        let mut session = LiveGraphSession::new(graph).unwrap();
        let mut active = NativeProject::parse(source)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let mut reference = NativeProject::parse(source)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let left: [f32; 128] = std::array::from_fn(|i| ((i % 17) as f32 - 8.0) / 8.0);
        let right: [f32; 128] = std::array::from_fn(|i| ((i % 11) as f32 - 5.0) / 5.0);
        let process = |runtime: &mut PreparedNativeProject| {
            let mut out = ([0.0_f32; 128], [0.0_f32; 128]);
            runtime
                .processor
                .process(AudioBlock {
                    main: Some([&left, &right]),
                    sidechain: None,
                    output: [&mut out.0, &mut out.1],
                    events: &[],
                })
                .unwrap();
            out
        };
        for _ in 0..24 {
            assert_eq!(process(&mut active), process(&mut reference));
        }
        let next = session
            .prepare_transaction(48_000.0, 128, |graph| {
                graph.remove(5)?;
                graph.add(15, "stereo-widener")?;
                graph.register_instance("/dsp/live/nodes/width", 15)?;
                graph.set_parameter(15, 0, 0.25)?;
                graph.set_parameter(15, 1, 120.0)?;
                graph.set_parameter(15, 2, 1.0)?;
                graph.connect(4, "out", 15, "audio")?;
                graph.connect(15, "out", 3, "in")?;
                graph.register_parameter("/dsp/live/width", 15, 0, 0.0, 1.0, 0.25)?;
                graph.bind_host_slot(1, 15, 0)
            })
            .unwrap();
        assert_eq!(process(&mut active), process(&mut reference));
        let retired = session.publish_transaction(&mut active, next).unwrap();
        assert!(retired.continuity_links().contains(&(15, 5)));
        assert_eq!(process(&mut active), process(&mut reference));
        drop(retired);
        let saved = active.save_state().unwrap();
        let reopened = GraphWorkspace::from_project_json(&saved).unwrap();
        assert_eq!(reopened.find_instance("/dsp/live/nodes/width"), Some(15));
    }

    #[test]
    fn changing_a_name_prevents_history_transfer_even_when_id_is_reused() {
        let source =
            include_bytes!("../../../projects/graph-workspace/authored-dsp-live-scripting.json");
        let graph = GraphWorkspace::from_project_json(source).unwrap();
        let mut session = LiveGraphSession::new(graph).unwrap();
        let mut active = NativeProject::parse(source)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let left = [0.7_f32; 128];
        let right = [-0.3_f32; 128];
        let process = |runtime: &mut PreparedNativeProject| {
            let mut out = ([0.0_f32; 128], [0.0_f32; 128]);
            runtime
                .processor
                .process(AudioBlock {
                    main: Some([&left, &right]),
                    sidechain: None,
                    output: [&mut out.0, &mut out.1],
                    events: &[],
                })
                .unwrap();
            out
        };
        for _ in 0..12 {
            process(&mut active);
        }
        let next = session
            .prepare_transaction(48_000.0, 128, |graph| {
                graph.unregister_instance("/dsp/live/nodes/width");
                graph.register_instance("/dsp/live/nodes/replacement", 5)
            })
            .unwrap();
        let bytes = serde_json::to_vec(&next.to_project().unwrap()).unwrap();
        let mut fresh = NativeProject::parse(&bytes)
            .unwrap()
            .prepare_with_state(48_000.0, 128)
            .unwrap();
        let retired = session.publish_transaction(&mut active, next).unwrap();
        assert!(!retired.continuity_links().iter().any(|(new, _)| *new == 5));
        assert_eq!(process(&mut active), process(&mut fresh));
        drop(retired);
    }

    #[test]
    fn named_ports_and_parameters_reject_invalid_edits() {
        let mut graph = GraphWorkspace::new();
        graph.add(4, "oscillator").unwrap();
        graph.add(5, "lfo").unwrap();
        graph.add(6, "modulated-gain").unwrap();
        assert_eq!(
            graph.connect(5, "inv", 6, "audio"),
            Err(AuthorError::SignalMismatch)
        );
        graph.connect(4, "out", 6, "audio").unwrap();
        assert_eq!(
            graph.connect(4, "out", 6, "audio"),
            Err(AuthorError::OccupiedInput)
        );
        graph.connect(6, "out", 3, "in").unwrap();
        assert_eq!(
            graph.set_parameter(5, 1, 200.),
            Err(AuthorError::InvalidParameter)
        );
        assert!(graph.to_project().is_ok());
        graph.add(7, "gain").unwrap();
        graph.connect(6, "out", 7, "audio").unwrap();
        graph.disconnect(6, "audio").unwrap();
        assert_eq!(graph.connect(7, "out", 6, "audio"), Err(AuthorError::Cycle));
        graph.remove(7).unwrap();
        assert_eq!(graph.find(7), None);
        assert_eq!(graph.remove(3), Err(AuthorError::InvalidId));
    }
}
