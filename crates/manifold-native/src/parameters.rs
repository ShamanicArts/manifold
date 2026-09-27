//! Physical parameter values and stable graph-scoped host identifiers.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HostParameter {
    /// Stable while the node ID and its local control ID remain in the project.
    pub id: u32,
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
            id: node << 8 | local_id,
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
    pub id: u32,
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
