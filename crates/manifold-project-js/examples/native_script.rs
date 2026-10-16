//! A small importable native render host for a packaged JS project.
//! Usage: cargo run -p manifold-project-js --example native_script -- \
//!   PACKAGE.manifold.json PATH VALUE SAVED.manifold.json [RESTORE.manifold.json]

use manifold_native::AudioBlock;
use manifold_project_js::native_host::NativeScriptAudio;
use manifold_project_js::package::ProjectPackage;

fn render(audio: &mut NativeScriptAudio) -> Result<f32, Box<dyn std::error::Error>> {
    let input_left: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.17).sin() * 0.25);
    let input_right: [f32; 128] = std::array::from_fn(|i| (i as f32 * 0.11).sin() * -0.25);
    let mut left = [0.0; 128];
    let mut right = [0.0; 128];
    audio
        .process(AudioBlock {
            main: Some([&input_left, &input_right]),
            sidechain: None,
            output: [&mut left, &mut right],
            events: &[],
        })
        .map_err(|error| format!("native render: {error:?}"))?;
    Ok(left.iter().map(|sample| sample.abs()).sum())
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let package_path = args.next().ok_or("expected package path")?;
    let path = args.next().ok_or("expected authored control path")?;
    let value: f64 = args.next().ok_or("expected control value")?.parse()?;
    let save_path = args.next().ok_or("expected output package path")?;
    let restore_path = args.next();
    if args.next().is_some() {
        return Err("too many arguments".into());
    }
    let bytes = std::fs::read(restore_path.unwrap_or(package_path))?;
    let package =
        ProjectPackage::parse(&bytes).map_err(|error| format!("package load: {error:?}"))?;
    let (mut control, mut audio) = package
        .prepare_native(48_000.0, 128)
        .map_err(|error| format!("project load: {error:?}"))?;
    for _ in 0..32 {
        render(&mut audio)?;
    }
    let before = render(&mut audio)?;
    control
        .begin_set_path(&path, value)
        .map_err(|error| format!("authored edit: {error:?}"))?;
    let first_block = render(&mut audio)?;
    let saved = control
        .poll()
        .map_err(|error| format!("publication: {error:?}"))?
        .ok_or("the authored edit did not publish")?;
    std::fs::write(
        &save_path,
        package
            .save_with_state(saved)
            .map_err(|error| format!("package save: {error:?}"))?,
    )?;
    for _ in 0..32 {
        render(&mut audio)?;
    }
    let after = render(&mut audio)?;
    let document: serde_json::Value = serde_json::from_slice(saved)?;
    println!(
        "{}",
        serde_json::json!({
            "package": package.id, "control": path, "value": value, "saved": save_path,
            "nodes": document["signal"]["nodes"].as_array().map(Vec::len),
            "before_block_energy": before,
            "first_published_block_energy": first_block,
            "after_block_energy": after,
        })
    );
    Ok(())
}
