use std::env;
use std::fs;

use manifold_native::main_presentation::compact_main_presentation;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let source = args.next().ok_or("missing Main session input")?;
    let target = args.next().ok_or("missing presentation output")?;
    if args.next().is_some() {
        return Err("extra arguments".into());
    }
    let bytes = fs::read(source)?;
    let document = compact_main_presentation(&bytes)
        .map_err(|error| format!("Main presentation: {error:?}"))?;
    fs::write(target, serde_json::to_vec_pretty(&document)?)?;
    Ok(())
}
