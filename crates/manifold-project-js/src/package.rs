//! Portable v1 package containing one authored controller and its graph state.

use manifold_native::project::NativeProject;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::native_host::{
    NativeHostError, NativeScriptAudio, NativeScriptControl, prepare_native_script,
};


#[derive(Debug)]
pub enum PackageError {
    Invalid(&'static str),
    Json(String),
    Project(String),
    BundleHash,
    Host(NativeHostError),
}

impl From<NativeHostError> for PackageError {
    fn from(error: NativeHostError) -> Self {
        Self::Host(error)
    }
}

#[derive(Debug, Clone)]
pub struct ProjectPackage {
    pub id: String,
    pub version: String,
    pub bundle: String,
    pub bundle_sha256: String,
    state: Vec<u8>,
}

fn exact_keys(value: &Value, keys: &[&str]) -> bool {
    value.as_object().is_some_and(|object| {
        object.len() == keys.len() && keys.iter().all(|key| object.contains_key(*key))
    })
}

fn valid_label(label: &str) -> bool {
    !label.is_empty()
        && label.len() <= 128
        && label
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
}

impl ProjectPackage {
    pub fn parse(bytes: &[u8]) -> Result<Self, PackageError> {
        let value: Value =
            serde_json::from_slice(bytes).map_err(|error| PackageError::Json(error.to_string()))?;
        if !exact_keys(
            &value,
            &[
                "format",
                "schemaVersion",
                "packageId",
                "packageVersion",
                "control",
                "state",
            ],
        ) || value["format"] != "manifold.package"
            || value["schemaVersion"] != 1
        {
            return Err(PackageError::Invalid("package format"));
        }
        let id = value["packageId"]
            .as_str()
            .filter(|id| valid_label(id))
            .ok_or(PackageError::Invalid("package ID"))?;
        let version = value["packageVersion"]
            .as_str()
            .filter(|version| valid_label(version))
            .ok_or(PackageError::Invalid("package version"))?;
        let control = &value["control"];
        if !exact_keys(control, &["language", "format", "bundle", "sha256"])
            || control["language"] != "javascript"
            || control["format"] != "iife"
        {
            return Err(PackageError::Invalid("control entry"));
        }
        let bundle = control["bundle"]
            .as_str()
            .filter(|bundle| !bundle.is_empty())
            .ok_or(PackageError::Invalid("control bundle"))?;
        let expected_hash = control["sha256"]
            .as_str()
            .filter(|hash| hash.len() == 64 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
            .ok_or(PackageError::Invalid("bundle hash"))?;
        let actual_hash = format!("{:x}", Sha256::digest(bundle.as_bytes()));
        if actual_hash != expected_hash.to_ascii_lowercase() {
            return Err(PackageError::BundleHash);
        }
        let state = serde_json::to_vec(&value["state"])
            .map_err(|error| PackageError::Json(error.to_string()))?;
        NativeProject::parse(&state)
            .map_err(|error| PackageError::Project(format!("{error:?}")))?;
        Ok(Self {
            id: id.into(),
            version: version.into(),
            bundle: bundle.into(),
            bundle_sha256: actual_hash,
            state,
        })
    }

    pub fn state(&self) -> &[u8] {
        &self.state
    }

    pub fn save_with_state(&self, state: &[u8]) -> Result<Vec<u8>, PackageError> {
        NativeProject::parse(state).map_err(|error| PackageError::Project(format!("{error:?}")))?;
        let state: Value =
            serde_json::from_slice(state).map_err(|error| PackageError::Json(error.to_string()))?;
        let encoded = serde_json::to_vec(&json!({
            "format": "manifold.package", "schemaVersion": 1,
            "packageId": self.id, "packageVersion": self.version,
            "control": { "language": "javascript", "format": "iife",
                "bundle": self.bundle, "sha256": self.bundle_sha256 },
            "state": state,
        }))
        .map_err(|error| PackageError::Json(error.to_string()))?;
        Ok(encoded)
    }

    pub fn prepare_native(
        &self,
        sample_rate: f32,
        max_frames: usize,
    ) -> Result<(NativeScriptControl, NativeScriptAudio), PackageError> {
        Ok(prepare_native_script(
            &self.bundle,
            Some(&self.state),
            sample_rate,
            max_frames,
        )?)
    }
}
