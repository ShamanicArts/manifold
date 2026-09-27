//! Stable host slots for the authored browser graph project format.

use manifold_native::parameters::{HOST_SLOT_COUNT, HostParameter};
use manifold_native::project::NativeProject;

pub(crate) const DEFAULT_PROJECT: &[u8] =
    include_bytes!("../../../projects/graph-workspace/note-voice.json");

pub(crate) fn slot_descriptors(
    project: &NativeProject,
) -> [Option<HostParameter>; HOST_SLOT_COUNT] {
    let mut slots = [None; HOST_SLOT_COUNT];
    for binding in project.host_bindings() {
        if let Some(descriptor) = project
            .host_parameters()
            .iter()
            .find(|parameter| parameter.id == binding.graph_parameter)
        {
            slots[binding.slot as usize] = Some(*descriptor);
        }
    }
    slots
}

pub(crate) fn normalized_values(
    slots: &[Option<HostParameter>; HOST_SLOT_COUNT],
) -> [f64; HOST_SLOT_COUNT] {
    std::array::from_fn(|slot| {
        slots[slot]
            .and_then(|descriptor| descriptor.to_normalized(descriptor.initial))
            .unwrap_or(0.0) as f64
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixed_slots_map_the_authored_note_project() {
        let project = NativeProject::parse(DEFAULT_PROJECT).unwrap();
        let slots = slot_descriptors(&project);
        let values = normalized_values(&slots);
        assert_eq!(slots.len(), 128);
        assert!(slots.iter().filter(|slot| slot.is_some()).count() >= 10);
        assert!(values.iter().all(|value| (0.0..=1.0).contains(value)));
        assert!(slots[127].is_none());
    }
}
