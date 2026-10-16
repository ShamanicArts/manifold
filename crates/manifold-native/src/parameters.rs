//! Physical parameter values and stable graph-scoped host identifiers.

/// Studio's published DAW interface. Internal graph controls remain unrestricted.
pub const STUDIO_HOST_SLOT_COUNT: usize = 2048;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HostSurface {
    Studio,
    Exported,
}

impl HostSurface {
    pub const fn for_product(exported: bool) -> Self {
        if exported {
            Self::Exported
        } else {
            Self::Studio
        }
    }
}

pub type HostSlots = std::collections::BTreeMap<usize, Option<HostParameter>>;

/// Check the plug-in format's ID namespace, without restricting internal graph IDs.
pub fn host_ids_fit(
    project: &crate::project::NativeProject,
    surface: HostSurface,
    last_id: u32,
) -> bool {
    project.host_bindings().iter().all(|binding| {
        surface == HostSurface::Studio && binding.slot as usize >= STUDIO_HOST_SLOT_COUNT
            || HOST_SLOT_BASE
                .checked_add(binding.slot)
                .is_some_and(|id| id <= last_id)
    })
}

pub fn host_slots(project: &crate::project::NativeProject, surface: HostSurface) -> HostSlots {
    let mut slots: HostSlots = if surface == HostSurface::Studio {
        (0..STUDIO_HOST_SLOT_COUNT)
            .map(|slot| (slot, None))
            .collect()
    } else {
        HostSlots::new()
    };
    let parameters: std::collections::BTreeMap<_, _> = project
        .host_parameters()
        .iter()
        .map(|parameter| (parameter.id, *parameter))
        .collect();
    for binding in project.host_bindings() {
        let slot = binding.slot as usize;
        if surface == HostSurface::Studio && slot >= STUDIO_HOST_SLOT_COUNT {
            continue;
        }
        if let Some(parameter) = parameters.get(&binding.graph_parameter) {
            slots.insert(slot, Some(*parameter));
        }
    }
    slots
}

/// Prepared on control, separate from Copy DSP descriptors and callback state.
#[derive(Clone, Debug, PartialEq)]
pub struct HostParameterDisplay {
    pub name: String,
    pub module: String,
    pub unit: String,
    pub parameter: Option<HostParameter>,
    pub default_value: f32,
    pub choices: Vec<(f64, String)>,
}

pub fn host_parameter_displays(
    project: &crate::project::NativeProject,
    slots: &HostSlots,
) -> std::collections::BTreeMap<usize, HostParameterDisplay> {
    slots
        .iter()
        .map(|(&slot, &parameter)| (slot, project.host_parameter_display(slot, parameter)))
        .collect()
}

impl HostParameterDisplay {
    pub fn text(&self, normalized: f64) -> String {
        let Some(parameter) = self.parameter else {
            return format!("{normalized:.3}");
        };
        let physical = parameter
            .from_normalized(normalized as f32)
            .unwrap_or(parameter.initial);
        if let Some((_, label)) = self
            .choices
            .iter()
            .find(|(value, _)| *value == physical as f64)
        {
            return label.clone();
        }
        let value = if parameter.discrete {
            format!("{physical:.0}")
        } else {
            format!("{physical:.3}")
        };
        if self.unit.is_empty() {
            value
        } else {
            format!("{value} {}", self.unit)
        }
    }
    pub fn normalized(&self, text: &str) -> Option<f64> {
        let Some(parameter) = self.parameter else {
            return text.parse().ok();
        };
        let physical = self
            .choices
            .iter()
            .find(|(_, label)| label == text)
            .map(|(value, _)| *value as f32)
            .or_else(|| text.trim().trim_end_matches(&self.unit).trim().parse().ok())?;
        parameter.to_normalized(physical).map(f64::from)
    }
}

pub fn normalized_host_values(slots: &HostSlots) -> std::collections::BTreeMap<usize, f32> {
    slots
        .iter()
        .map(|(slot, parameter)| {
            (
                *slot,
                parameter
                    .and_then(|p| p.to_normalized(p.initial))
                    .unwrap_or(0.0),
            )
        })
        .collect()
}
pub const HOST_SLOT_BASE: u32 = 0x0100_0000;

/// Explicit user reassignment swaps reservations as well as active bindings.
/// A deleted control's reservation is not silently discarded by this operation.
pub fn swap_host_assignments(document: &mut serde_json::Value, source: u32, destination: u32) {
    if let Some(assignments) = document
        .get_mut("hostAssignments")
        .and_then(serde_json::Value::as_array_mut)
    {
        for assignment in assignments.iter_mut() {
            if assignment["slot"] == source {
                assignment["slot"] = destination.into();
            } else if assignment["slot"] == destination {
                assignment["slot"] = source.into();
            }
        }
        assignments.sort_by_key(|entry| entry["slot"].as_u64());
    }
}

/// Internal graph-control identity. Host automation uses its separate stable
/// slot ID; neither node IDs nor local parameter IDs share each other's bits.
pub const fn graph_parameter_id(node: u32, local: u32) -> u64 {
    (node as u64) << 32 | local as u64
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct HostBinding {
    pub slot: u32,
    pub graph_parameter: u64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HostParameter {
    /// Stable while the node ID and its local control ID remain in the project.
    pub id: u64,
    pub node: u64,
    pub local_id: u32,
    pub min: f32,
    pub max: f32,
    pub discrete: bool,
    pub initial: f32,
}

impl HostParameter {
    pub(crate) fn new(
        node: u32,
        local_id: u32,
        min: f32,
        max: f32,
        discrete: bool,
        initial: f32,
    ) -> Self {
        Self {
            id: graph_parameter_id(node, local_id),
            node: node.into(),
            local_id,
            min,
            max,
            discrete,
            initial,
        }
    }

    pub fn from_normalized(&self, normalized: f32) -> Option<f32> {
        if !normalized.is_finite() || !(0.0..=1.0).contains(&normalized) {
            return None;
        }
        let value = self.min + normalized * (self.max - self.min);
        Some(if self.discrete { value.round() } else { value })
    }

    pub fn to_normalized(&self, physical: f32) -> Option<f32> {
        if !physical.is_finite() || physical < self.min || physical > self.max {
            return None;
        }
        Some((physical - self.min) / (self.max - self.min))
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TimedAutomation {
    pub offset: usize,
    pub id: u64,
    pub normalized: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AutomationError {
    OffsetOutOfRange,
    Unsorted,
    UnknownParameter,
    InvalidNormalized,
    TooManyEvents,
}
