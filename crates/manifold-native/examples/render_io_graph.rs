//! Offline library host for explicit channel-identity proof. No audio device.
use manifold_native::project::NativeProject;
use manifold_native::{InputBus, OutputBus};
use serde_json::{Value, json};
use std::io::Write;
mod callback_heap {
    include!("../tests/support/callback_heap.rs");
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 {
        return Err("usage: render_io_graph RECIPE.json OUTPUT.f32".into());
    }
    let recipe: Value = serde_json::from_slice(&std::fs::read(&args[0])?)?;
    let document = serde_json::to_vec(&recipe["project"])?;
    let mut processor = NativeProject::parse(&document)
        .map_err(|e| format!("parse: {e:?}"))?
        .prepare(48000., 128)
        .map_err(|e| format!("prepare: {e:?}"))?;
    let layout = processor
        .io_layout()
        .ok_or("explicit I/O layout required")?
        .clone();
    let values = recipe["inputValues"].as_array().ok_or("inputValues")?;
    if values.len() != layout.inputs.iter().map(|b| b.channels).sum::<usize>() {
        return Err("input channel count".into());
    }
    let inputs: Vec<_> = values
        .iter()
        .map(|v| v.as_f64().map(|v| vec![v as f32; 128]).ok_or("input value"))
        .collect::<Result<_, _>>()?;
    let refs: Vec<_> = inputs.iter().map(Vec::as_slice).collect();
    let mut offset = 0;
    let buses: Vec<_> = layout
        .inputs
        .iter()
        .map(|b| {
            let start = offset;
            offset += b.channels;
            InputBus {
                channels: &refs[start..offset],
            }
        })
        .collect();
    let total: usize = layout.outputs.iter().map(|b| b.channels).sum();
    let mut output = vec![vec![0.; 128]; total];
    let mut refs: Vec<_> = output.iter_mut().map(Vec::as_mut_slice).collect();
    let mut remaining = refs.as_mut_slice();
    let mut outputs = Vec::with_capacity(layout.outputs.len());
    for b in &layout.outputs {
        let (channels, tail) = remaining.split_at_mut(b.channels);
        outputs.push(OutputBus { channels });
        remaining = tail;
    }
    let blocks = recipe["blocks"].as_u64().ok_or("blocks")?;
    let mut file = std::fs::File::create(&args[1])?;
    for _ in 0..blocks {
        callback_heap::measure(|| processor.process_io(&buses, &mut outputs, 128, &[]))
            .map_err(|e| format!("process: {e:?}"))?;
        for frame in 0..128 {
            for bus in &outputs {
                for channel in bus.channels.iter() {
                    file.write_all(&channel[frame].to_le_bytes())?;
                }
            }
        }
    }
    println!(
        "{}",
        json!({"frames":blocks*128,"channels":total,"callbackHeapGuarded":true,"io":layout.to_json()})
    );
    Ok(())
}
