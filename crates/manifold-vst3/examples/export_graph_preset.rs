//! Convert a portable Manifold graph JSON bundle into a VST3 preset.
//! Usage: cargo run -p manifold-vst3 --example export_graph_preset -- PROJECT.json OUTPUT.vstpreset

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let input = args.next().ok_or("expected graph project JSON path")?;
    let output = args.next().ok_or("expected output .vstpreset path")?;
    if args.next().is_some() || !output.ends_with(".vstpreset") {
        return Err("expected one output .vstpreset path".into());
    }
    let bytes = std::fs::read(input)?;
    let preset = manifold_vst3::export_graph_preset(&bytes)?;
    std::fs::write(output, preset)?;
    Ok(())
}
