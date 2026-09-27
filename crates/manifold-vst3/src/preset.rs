//! A portable graph project inside Steinberg's VST3 preset container.
//! The processor's `setState` receives the unmodified project JSON chunk.

use manifold_native::project::NativeProject;

// ASCII form of GraphProcessor::CID (the component ID, not the controller).
const GRAPH_CLASS: &[u8; 32] = b"70477A2D9F294ED9A03E68585A947923";
const HEADER_BYTES: u64 = 48;
const MAX_STATE_BYTES: usize = 45 * 1024 * 1024;

/// Export a validated browser-authored graph bundle as a VST3 preset.
/// The fixed 128 host slots remain the same across these project changes.
pub fn export_graph_preset(project: &[u8]) -> Result<Vec<u8>, String> {
    if project.len() > MAX_STATE_BYTES {
        return Err("project state exceeds the host state limit".into());
    }
    let validated = NativeProject::parse(project)
        .map_err(|error| format!("invalid graph project: {error:?}"))?;
    validated
        .prepare(48_000.0, 1_024)
        .map_err(|error| format!("graph cannot prepare: {error:?}"))?;
    let data_len = project.len() as u64;
    let list_offset = HEADER_BYTES + data_len;
    let mut preset = Vec::with_capacity(list_offset as usize + 28);
    preset.extend_from_slice(b"VST3");
    preset.extend_from_slice(&1_u32.to_le_bytes());
    preset.extend_from_slice(GRAPH_CLASS);
    preset.extend_from_slice(&list_offset.to_le_bytes());
    preset.extend_from_slice(project);
    preset.extend_from_slice(b"List");
    preset.extend_from_slice(&1_u32.to_le_bytes());
    preset.extend_from_slice(b"Comp");
    preset.extend_from_slice(&HEADER_BYTES.to_le_bytes());
    preset.extend_from_slice(&data_len.to_le_bytes());
    Ok(preset)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graph_contract::DEFAULT_PROJECT;
    use crate::graph_processor::GraphProcessor;

    #[test]
    fn preset_contains_exact_project_state_for_the_graph_component() {
        let preset = export_graph_preset(DEFAULT_PROJECT).unwrap();
        assert_eq!(&preset[..4], b"VST3");
        assert_eq!(u32::from_le_bytes(preset[4..8].try_into().unwrap()), 1);
        assert_eq!(&preset[8..40], GRAPH_CLASS);
        let list = u64::from_le_bytes(preset[40..48].try_into().unwrap()) as usize;
        assert_eq!(list, 48 + DEFAULT_PROJECT.len());
        assert_eq!(&preset[48..list], DEFAULT_PROJECT);
        assert_eq!(&preset[list..list + 8], b"List\x01\0\0\0");
        assert_eq!(&preset[list + 8..list + 12], b"Comp");
        assert_eq!(
            u64::from_le_bytes(preset[list + 12..list + 20].try_into().unwrap()),
            48
        );
        assert_eq!(
            u64::from_le_bytes(preset[list + 20..list + 28].try_into().unwrap()),
            DEFAULT_PROJECT.len() as u64
        );
        #[cfg(not(target_os = "windows"))]
        assert_eq!(
            GRAPH_CLASS.as_slice(),
            hex_uid(&GraphProcessor::CID).as_bytes()
        );
    }

    #[cfg(not(target_os = "windows"))]
    fn hex_uid(uid: &[i8; 16]) -> String {
        uid.iter()
            .map(|byte| format!("{:02X}", *byte as u8))
            .collect()
    }

    #[test]
    fn malformed_project_cannot_be_exported() {
        assert!(export_graph_preset(b"{}").is_err());
    }
}
