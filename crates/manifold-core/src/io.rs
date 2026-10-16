//! Explicit host buses and channel maps. Layouts are prepared off callback.
//! Existing audio kernels expose two lanes; channel duplication/extraction is
//! authored in these maps rather than silently performed by a host adapter.
use crate::events::EventError;
use crate::graph::{GraphDescription, GraphError, NodeId, NodeKind, SignalKind};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AudioBus {
    pub id: String,
    pub name: String,
    pub channels: usize,
    pub optional: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct InputChannel {
    pub bus: usize,
    pub channel: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InputBinding {
    pub node: NodeId,
    pub channels: [Option<InputChannel>; 2],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OutputChannel {
    pub node: NodeId,
    pub port: usize,
    pub channel: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IoLayout {
    pub version: u32,
    pub inputs: Vec<AudioBus>,
    pub outputs: Vec<AudioBus>,
    pub input_bindings: Vec<InputBinding>,
    /// One entry per declared output channel, in bus/channel order.
    /// None is an explicitly silent channel.
    pub output_bindings: Vec<Option<OutputChannel>>,
}

/// Bus order and channel order are exactly those of the prepared layout.
/// An absent optional input is represented by an empty channel slice.
pub struct InputBus<'a, 'samples> {
    pub channels: &'a [&'samples [f32]],
}

pub struct OutputBus<'a, 'samples> {
    pub channels: &'a mut [&'samples mut [f32]],
}

/// Borrowed audio in either declared buses or contiguous planar storage.
/// Planar channels follow the prepared layout; each occupies `stride` samples.
/// These views own no storage and can be reused for sample-offset sub-blocks.
pub enum InputBuffers<'a, 'channels, 'samples> {
    Buses(&'a [InputBus<'channels, 'samples>]),
    Planar {
        samples: &'samples [f32],
        stride: usize,
    },
}

pub enum OutputBuffers<'a, 'channels, 'samples> {
    Buses(&'a mut [OutputBus<'channels, 'samples>]),
    Planar {
        samples: &'samples mut [f32],
        stride: usize,
    },
}

/// Allocate a host's planar sample storage during preparation. Failure reflects
/// address-space overflow or an actual allocator failure, never a project quota.
pub fn prepare_planar_buffer(channels: usize, stride: usize) -> Result<Vec<f32>, IoError> {
    let count = channels
        .checked_mul(stride)
        .ok_or(IoError::BufferAllocation)?;
    let mut samples = Vec::new();
    samples
        .try_reserve_exact(count)
        .map_err(|_| IoError::BufferAllocation)?;
    samples.resize(count, 0.);
    Ok(samples)
}

fn validate_planar(
    buses: &[AudioBus],
    samples: usize,
    stride: usize,
    frames: usize,
) -> Result<(), IoError> {
    let channels = buses
        .iter()
        .try_fold(0usize, |sum, b| sum.checked_add(b.channels));
    if stride == 0
        || frames > stride
        || channels.and_then(|n| n.checked_mul(stride)) != Some(samples)
    {
        return Err(IoError::BlockTooLarge);
    }
    Ok(())
}

impl InputBuffers<'_, '_, '_> {
    pub(crate) fn validate(&self, buses: &[AudioBus], frames: usize) -> Result<(), IoError> {
        let inputs = match self {
            Self::Buses(inputs) => inputs,
            Self::Planar { samples, stride } => {
                return validate_planar(buses, samples.len(), *stride, frames);
            }
        };
        if inputs.len() != buses.len() {
            return Err(IoError::BusCount);
        }
        for (bus, (actual, declared)) in inputs.iter().zip(buses).enumerate() {
            if actual.channels.is_empty() && declared.optional {
                continue;
            }
            if actual.channels.len() != declared.channels {
                return Err(IoError::ChannelCount { input: true, bus });
            }
            for (channel, samples) in actual.channels.iter().enumerate() {
                if samples.len() != frames {
                    return Err(IoError::ChannelLength {
                        input: true,
                        bus,
                        channel,
                    });
                }
            }
        }
        Ok(())
    }

    pub(crate) fn channel(&self, route: InputChannel, bus_offsets: &[usize]) -> Option<&[f32]> {
        match self {
            Self::Buses(buses) => buses[route.bus].channels.get(route.channel).copied(),
            Self::Planar { samples, stride } => {
                let start = (bus_offsets[route.bus] + route.channel) * stride;
                Some(&samples[start..start + stride])
            }
        }
    }
}

pub(crate) fn validate_output_buses(
    outputs: &[OutputBus<'_, '_>],
    buses: &[AudioBus],
    frames: usize,
) -> Result<(), IoError> {
    if outputs.len() != buses.len() {
        return Err(IoError::BusCount);
    }
    for (bus, (actual, declared)) in outputs.iter().zip(buses).enumerate() {
        if actual.channels.len() != declared.channels {
            return Err(IoError::ChannelCount { input: false, bus });
        }
        for (channel, samples) in actual.channels.iter().enumerate() {
            if samples.len() != frames {
                return Err(IoError::ChannelLength {
                    input: false,
                    bus,
                    channel,
                });
            }
        }
    }
    Ok(())
}

impl OutputBuffers<'_, '_, '_> {
    pub(crate) fn validate(&self, buses: &[AudioBus], frames: usize) -> Result<(), IoError> {
        match self {
            Self::Buses(outputs) => validate_output_buses(outputs, buses, frames),
            Self::Planar { samples, stride } => {
                validate_planar(buses, samples.len(), *stride, frames)
            }
        }
    }

    pub(crate) fn channel(&mut self, bus: usize, channel: usize, flat: usize) -> &mut [f32] {
        match self {
            Self::Buses(buses) => buses[bus].channels[channel],
            Self::Planar { samples, stride } => &mut samples[flat * *stride..(flat + 1) * *stride],
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum IoError {
    NotPrepared,
    DeclaredBusesRequired,
    BlockTooLarge,
    BufferAllocation,
    BusCount,
    ChannelCount {
        input: bool,
        bus: usize,
    },
    ChannelLength {
        input: bool,
        bus: usize,
        channel: usize,
    },
    Event(EventError),
}

impl IoLayout {
    pub fn from_json_bytes(bytes: &[u8], graph: &GraphDescription) -> Result<Self, GraphError> {
        let value =
            serde_json::from_slice(bytes).map_err(|_| GraphError::InvalidIo("layout JSON"))?;
        Self::from_json(&value, graph)
    }
    /// Control-thread validation, shared by document import and compilation.
    pub fn validate(&self, graph: &GraphDescription) -> Result<(), GraphError> {
        let invalid = |reason| GraphError::InvalidIo(reason);
        if self.version != 1 {
            return Err(invalid("layout version"));
        }
        for (input, buses) in [(true, &self.inputs), (false, &self.outputs)] {
            let mut total = 0usize;
            for (index, bus) in buses.iter().enumerate() {
                if bus.id.is_empty()
                    || !bus
                        .id
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
                    || bus.name.is_empty()
                    || bus.name.trim() != bus.name
                    || bus.channels == 0
                    || !input && bus.optional
                    || buses[..index].iter().any(|b| b.id == bus.id)
                {
                    return Err(invalid("bus declaration"));
                }
                total = total
                    .checked_add(bus.channels)
                    .ok_or(invalid("channel count overflow"))?;
            }
        }
        for (index, binding) in self.input_bindings.iter().enumerate() {
            if self.input_bindings[..index]
                .iter()
                .any(|b| b.node == binding.node)
            {
                return Err(invalid("duplicate input binding"));
            }
            if !graph.nodes.iter().any(|n| {
                n.id == binding.node
                    && matches!(
                        n.kind,
                        NodeKind::InputRaw
                            | NodeKind::InputSidechain
                            | NodeKind::InputMonitor { .. }
                    )
            }) {
                return Err(invalid("input binding target"));
            }
            for channel in binding.channels.iter().flatten() {
                if self
                    .inputs
                    .get(channel.bus)
                    .is_none_or(|b| channel.channel >= b.channels)
                {
                    return Err(invalid("input channel route"));
                }
            }
        }
        for node in &graph.nodes {
            if matches!(
                node.kind,
                NodeKind::InputRaw | NodeKind::InputSidechain | NodeKind::InputMonitor { .. }
            ) && !self.input_bindings.iter().any(|b| b.node == node.id)
            {
                return Err(invalid("unbound input node"));
            }
        }
        if self.output_bindings.len() != self.outputs.iter().map(|b| b.channels).sum::<usize>() {
            return Err(invalid("output binding count"));
        }
        for channel in self.output_bindings.iter().flatten() {
            if channel.channel > 1
                || !graph.nodes.iter().any(|n| {
                    n.id == channel.node
                        && n.kind.output_port_signal(channel.port) == Some(SignalKind::Audio)
                })
            {
                return Err(invalid("output channel route"));
            }
        }
        Ok(())
    }

    pub fn from_json(
        value: &serde_json::Value,
        graph: &GraphDescription,
    ) -> Result<Self, GraphError> {
        use serde_json::Value;
        fn fields<'a>(
            value: &'a Value,
            keys: &[&str],
        ) -> Result<&'a serde_json::Map<String, Value>, GraphError> {
            value
                .as_object()
                .filter(|v| v.len() == keys.len() && keys.iter().all(|k| v.contains_key(*k)))
                .ok_or(GraphError::InvalidIo("document fields"))
        }
        fn integer(value: &Value) -> Result<usize, GraphError> {
            value
                .as_u64()
                .and_then(|v| usize::try_from(v).ok())
                .ok_or(GraphError::InvalidIo("document integer"))
        }
        fn array(value: &Value) -> Result<&[Value], GraphError> {
            value
                .as_array()
                .map(Vec::as_slice)
                .ok_or(GraphError::InvalidIo("document array"))
        }
        fn buses(value: &Value) -> Result<Vec<AudioBus>, GraphError> {
            array(value)?
                .iter()
                .map(|v| {
                    let b = fields(v, &["id", "name", "channels", "optional"])?;
                    Ok(AudioBus {
                        id: b["id"]
                            .as_str()
                            .ok_or(GraphError::InvalidIo("bus id"))?
                            .into(),
                        name: b["name"]
                            .as_str()
                            .ok_or(GraphError::InvalidIo("bus name"))?
                            .into(),
                        channels: integer(&b["channels"])?,
                        optional: b["optional"]
                            .as_bool()
                            .ok_or(GraphError::InvalidIo("bus optionality"))?,
                    })
                })
                .collect()
        }
        let root = fields(
            value,
            &[
                "version",
                "inputs",
                "outputs",
                "inputBindings",
                "outputBindings",
            ],
        )?;
        if root["version"] != 1 {
            return Err(GraphError::InvalidIo("layout version"));
        }
        let input_bindings = array(&root["inputBindings"])?
            .iter()
            .map(|v| {
                let b = fields(v, &["nodeId", "channels"])?;
                let channels = array(&b["channels"])?;
                if channels.len() != 2 {
                    return Err(GraphError::InvalidIo("input lane count"));
                }
                let mut result = [None; 2];
                for (i, channel) in channels.iter().enumerate() {
                    if channel.is_null() {
                        continue;
                    }
                    let c = fields(channel, &["bus", "channel"])?;
                    result[i] = Some(InputChannel {
                        bus: integer(&c["bus"])?,
                        channel: integer(&c["channel"])?,
                    });
                }
                Ok(InputBinding {
                    node: b["nodeId"]
                        .as_u64()
                        .ok_or(GraphError::InvalidIo("input node"))?,
                    channels: result,
                })
            })
            .collect::<Result<_, GraphError>>()?;
        let output_bindings = array(&root["outputBindings"])?
            .iter()
            .map(|v| {
                if v.is_null() {
                    return Ok(None);
                }
                let c = fields(v, &["nodeId", "outputPort", "channel"])?;
                Ok(Some(OutputChannel {
                    node: c["nodeId"]
                        .as_u64()
                        .ok_or(GraphError::InvalidIo("output node"))?,
                    port: integer(&c["outputPort"])?,
                    channel: integer(&c["channel"])?,
                }))
            })
            .collect::<Result<_, GraphError>>()?;
        let layout = Self {
            version: 1,
            inputs: buses(&root["inputs"])?,
            outputs: buses(&root["outputs"])?,
            input_bindings,
            output_bindings,
        };
        layout.validate(graph)?;
        Ok(layout)
    }

    pub fn to_json(&self) -> serde_json::Value {
        use serde_json::{Value, json};
        let buses = |values: &[AudioBus]| {
            values
                .iter()
                .map(|b| {
                    json!({
            "id":b.id, "name":b.name, "channels":b.channels, "optional":b.optional })
                })
                .collect::<Vec<_>>()
        };
        json!({ "version":self.version, "inputs":buses(&self.inputs), "outputs":buses(&self.outputs),
            "inputBindings":self.input_bindings.iter().map(|b| json!({"nodeId":b.node,
                "channels":b.channels.map(|c| c.map_or(Value::Null, |c|json!({"bus":c.bus,"channel":c.channel}))) })).collect::<Vec<_>>(),
            "outputBindings":self.output_bindings.iter().map(|c| c.map_or(Value::Null, |c|json!({
                "nodeId":c.node,"outputPort":c.port,"channel":c.channel}))).collect::<Vec<_>>() })
    }
}

pub(crate) struct CompiledIo {
    pub layout: IoLayout,
    pub input_offsets: Vec<usize>,
    pub outputs: Vec<Option<(usize, usize, usize)>>,
}
