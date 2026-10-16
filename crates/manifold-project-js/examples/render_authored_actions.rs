//! Offline proof host: execute packaged project calls with callback publication.
//! Input JSON: package path, optional saved graph, actions [{method,args,blocks}].
use manifold_native::AudioBlock;
use manifold_project_js::package::ProjectPackage;
use serde_json::{Value, json};
use std::io::Write;
mod callback_heap {
    include!(concat!(env!("CARGO_MANIFEST_DIR"), "/../manifold-native/tests/support/callback_heap.rs"));
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.len() != 2 { return Err("usage: render_authored_actions RECIPE.json OUTPUT.f32".into()); }
    let recipe: Value = serde_json::from_slice(&std::fs::read(&args[0])?)?;
    let mut package = ProjectPackage::parse(&std::fs::read(recipe["package"].as_str().ok_or("package")?)?)
        .map_err(|e| format!("package: {e:?}"))?;
    if let Some(state) = recipe.get("state") {
        let saved = package.save_with_state(&serde_json::to_vec(state)?).map_err(|e| format!("state: {e:?}"))?;
        package = ProjectPackage::parse(&saved).map_err(|e| format!("restore: {e:?}"))?;
    }
    let block = recipe["block"].as_u64().unwrap_or(128) as usize;
    let (mut control, mut audio) = package.prepare_native(48000., block).map_err(|e| format!("prepare: {e:?}"))?;
    let mut output = std::fs::File::create(&args[1])?;
    let mut frames = 0;
    for action in recipe["actions"].as_array().ok_or("actions")? {
        let method = action["method"].as_str().ok_or("method")?;
        control.begin_call(method, action["args"].as_array().ok_or("args")?).map_err(|e| format!("call {method}: {e:?}"))?;
        let mut done = false;
        for _ in 0..action["blocks"].as_u64().ok_or("blocks")? {
            let mut left = vec![0.; block]; let mut right = vec![0.; block];
            callback_heap::measure(|| audio.process(AudioBlock { main: None, sidechain: None, output: [&mut left, &mut right], events: &[] }))
                .map_err(|e| format!("render: {e:?}"))?;
            for (left, right) in left.iter().zip(right) { output.write_all(&left.to_le_bytes())?; output.write_all(&right.to_le_bytes())?; }
            frames += block;
            if !done { done = control.poll().map_err(|e| format!("poll {method}: {e:?}"))?.is_some(); }
        }
        if !done { return Err(format!("{method} did not finish in the declared blocks").into()); }
    }
    println!("{}", json!({"frames": frames, "callbackHeapGuarded": true,
        "state": serde_json::from_slice::<Value>(control.current_project())?}));
    Ok(())
}
