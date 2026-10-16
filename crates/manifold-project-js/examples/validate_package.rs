//! Export preflight in the native QuickJS/graph host, outside the DAW and audio
//! callback. Unlike Node, this runtime exposes only the project host contract.
use manifold_project_js::package::ProjectPackage;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let path = std::env::args().nth(1).ok_or("expected package path")?;
    let bytes = std::fs::read(path)?;
    let package = ProjectPackage::parse(&bytes)
        .map_err(|error| format!("native package validation: {error:?}"))?;
    let (_control, _audio) = package
        .prepare_native(48_000.0, 128)
        .map_err(|error| format!("native project compatibility: {error:?}"))?;
    println!("Native project compatible: {}", package.id);
    Ok(())
}
