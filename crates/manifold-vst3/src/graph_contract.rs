//! Stable, project-sized host slots for authored graph projects.
use manifold_native::parameters::{HostSlots, HostSurface, host_slots, normalized_host_values};
use manifold_native::project::NativeProject;
use std::collections::BTreeMap;

pub(crate) const DEFAULT_PROJECT: &[u8] = crate::product::DEFAULT_GRAPH;
pub(crate) fn slot_descriptors(project: &NativeProject) -> HostSlots {
    host_slots(project, HostSurface::for_product(crate::product::EXPORTED))
}
pub(crate) fn normalized_values(slots: &HostSlots) -> BTreeMap<usize, f64> {
    normalized_host_values(slots)
        .into_iter()
        .map(|(slot, value)| (slot, value as f64))
        .collect()
}

pub(crate) fn host_ids_fit(project: &NativeProject) -> bool {
    // VST3 reserves the upper half of ParamID for the host.
    manifold_native::parameters::host_ids_fit(project, HostSurface::for_product(crate::product::EXPORTED), 0x7fff_ffff)
}
