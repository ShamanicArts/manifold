// Shared build configuration for the existing Graph adapters. No DSP is generated.
use sha2::{Digest, Sha256};
use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=MANIFOLD_EXPORT_CONFIG");
    let output = PathBuf::from(env::var_os("OUT_DIR").unwrap());
    let mut name = "Manifold Graph".to_owned();
    let mut id = "arts.shamanic.manifold.graph".to_owned();
    let mut vendor = "Shamanic Arts".to_owned();
    let mut version = "0.1.0".to_owned();
    let mut category = "Fx".to_owned();
    let mut processor = [0x70477A2Du32, 0x9F294ED9, 0xA03E6858, 0x5A947923];
    let mut controller = [0xC5C5353Du32, 0x6BDF4E42, 0xAE535D85, 0x81C0832F];
    let exported = env::var_os("MANIFOLD_EXPORT_CONFIG").is_some();
    let default_graph;
    let default_package;
    if let Some(path) = env::var_os("MANIFOLD_EXPORT_CONFIG") {
        let path = PathBuf::from(path)
            .canonicalize()
            .expect("export manifest path");
        println!("cargo:rerun-if-changed={}", path.display());
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).expect("export manifest JSON");
        assert_eq!(manifest["format"], "manifold.plugin-export");
        assert_eq!(manifest["version"], 1);
        let label = |key: &str| {
            let value = manifest[key].as_str().expect("export string");
            assert!(
                !value.is_empty() && value.len() < 120 && !value.contains('\0'),
                "invalid export {key}"
            );
            value.to_owned()
        };
        name = label("name");
        id = label("id");
        vendor = label("vendor");
        version = label("pluginVersion");
        category = label("category");
        assert!(matches!(category.as_str(), "Fx" | "Instrument"));
        assert!(
            id.bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
        );
        let package_path = path
            .parent()
            .unwrap()
            .join(label("package"))
            .canonicalize()
            .expect("export package path");
        println!("cargo:rerun-if-changed={}", package_path.display());
        let bytes = fs::read(package_path).unwrap();
        let package: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(package["format"], "manifold.package");
        assert_eq!(package["schemaVersion"], 1);
        default_graph = serde_json::to_vec(&package["state"]).unwrap();
        default_package = bytes;
        // Stable IDs depend only on the explicit product ID, never build time or source.
        for (kind, words) in [
            ("processor", &mut processor),
            ("controller", &mut controller),
        ] {
            let hash = Sha256::digest(format!("manifold.export.v1/{id}/{kind}"));
            for (word, chunk) in words.iter_mut().zip(hash[..16].chunks_exact(4)) {
                *word = u32::from_be_bytes(chunk.try_into().unwrap());
            }
        }
    } else {
        let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("../..");
        let path = root.join("projects/graph-workspace/note-voice.json");
        println!("cargo:rerun-if-changed={}", path.display());
        default_graph = fs::read(path).unwrap();
        default_package = Vec::new();
    }
    fs::write(output.join("default-graph.json"), default_graph).unwrap();
    fs::write(output.join("default-package.json"), default_package).unwrap();
    let cstr = |value: &str| {
        format!(
            "match std::ffi::CStr::from_bytes_with_nul(&{:?}) {{ Ok(v) => v, Err(_) => panic!(\"invalid export label\") }}",
            format!("{value}\0").as_bytes()
        )
    };
    let text = format!(
        r#"
        pub const EXPORTED: bool = {exported};
        pub const NAME: &str = {name:?};
        pub const NAME_C: &std::ffi::CStr = {name_c};
        pub const CLAP_ID: &std::ffi::CStr = {id_c};
        pub const VENDOR: &str = {vendor:?};
        pub const VENDOR_C: &std::ffi::CStr = {vendor_c};
        pub const VERSION: &str = {version:?};
        pub const VERSION_C: &std::ffi::CStr = {version_c};
        pub const CATEGORY: &str = {category:?};
        pub const INSTRUMENT: bool = {instrument};
        pub const PROCESSOR: [u32; 4] = {processor:?};
        pub const CONTROLLER: [u32; 4] = {controller:?};
        pub const DEFAULT_GRAPH: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/default-graph.json"));
        pub const DEFAULT_PACKAGE: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/default-package.json"));
    "#,
        name_c = cstr(&name),
        id_c = cstr(&id),
        vendor_c = cstr(&vendor),
        version_c = cstr(&version),
        instrument = category == "Instrument"
    );
    // Numeric arrays are byte strings in CStr::from_bytes_with_nul.
    fs::write(
        output.join("plugin-export.rs"),
        text.replace("from_bytes_with_nul([", "from_bytes_with_nul(&["),
    )
    .unwrap();
}
