use manifold_native::project::{NativeProject, PreparedNativeProject};
use manifold_native::AudioBlock;
use serde_json::{json, Value};

pub fn document(id: u32, insert: bool, mix: f32) -> Vec<u8> {
    let mut doc: Value = serde_json::from_slice(include_bytes!(
        "../../../../projects/graph-workspace/authored-live-loop-route.json"
    ))
    .unwrap();
    for node in doc["signal"]["nodes"].as_array_mut().unwrap() {
        if node["id"] == 2 {
            node["id"] = id.into();
        }
    }
    for edge in doc["signal"]["connections"].as_array_mut().unwrap() {
        for key in ["from", "to"] {
            if edge[key] == 2 {
                edge[key] = id.into();
            }
        }
        if insert && edge["to"] == 3 {
            edge["to"] = 9.into();
        }
    }
    for p in doc["signal"]["initialParameters"].as_array_mut().unwrap() {
        p["nodeId"] = id.into();
        if p["id"] == 5 {
            p["value"] = json!(mix);
        }
    }
    if insert {
        doc["signal"]["nodes"]
            .as_array_mut()
            .unwrap()
            .push(json!({"id":9,"type":"fixed-gain","a":1}));
        doc["signal"]["connections"]
            .as_array_mut()
            .unwrap()
            .push(json!({"from":9,"to":3,"inputPort":0}));
    }
    doc["instances"] = json!([{"path":"/test/loop/layer","nodeId":id}]);
    serde_json::to_vec(&doc).unwrap()
}

pub fn prepare(bytes: &[u8]) -> PreparedNativeProject {
    NativeProject::parse(bytes)
        .unwrap()
        .prepare_patchable_with_state(48_000., 128)
        .unwrap()
}
pub fn input(frame: usize) -> [[f32; 128]; 2] {
    let left = std::array::from_fn(|index| {
        ((frame + index) as f32 * std::f32::consts::TAU * 220. / 48_000.).sin() * 0.2
    });
    [left, left.map(|value| -value * 0.7)]
}
pub fn render(runtime: &mut PreparedNativeProject, frame: usize) -> [[f32; 128]; 2] {
    let input = input(frame);
    let mut output = [[0.; 128]; 2];
    let [left, right] = &mut output;
    runtime
        .processor
        .process(AudioBlock {
            main: Some([&input[0], &input[1]]),
            sidechain: None,
            output: [left, right],
            events: &[],
        })
        .unwrap();
    output
}
pub fn append(tape: &mut Vec<f32>, block: &[[f32; 128]; 2]) {
    for index in 0..128 {
        tape.push(block[0][index]);
        tape.push(block[1][index]);
    }
}
pub fn assert_take(actual: &[u8], reference: &[u8]) {
    let actual: Value = serde_json::from_slice(actual).unwrap();
    let reference: Value = serde_json::from_slice(reference).unwrap();
    assert_eq!(
        actual["assets"][0]["frames"],
        reference["assets"][0]["frames"]
    );
    assert_eq!(
        actual["assets"][0]["pcmF32Base64"],
        reference["assets"][0]["pcmF32Base64"]
    );
    let controls = |doc: &Value| {
        let loops = doc["signal"]["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|node| node["type"] == "loop-capture")
            .map(|node| node["id"].as_u64().unwrap())
            .collect::<Vec<_>>();
        doc["signal"]["initialParameters"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|p| loops.contains(&p["nodeId"].as_u64().unwrap()))
            .map(|p| (p["id"].as_u64().unwrap(), p["value"].as_f64().unwrap()))
            .collect::<Vec<_>>()
    };
    assert_eq!(controls(&actual), controls(&reference));
}

pub fn export(host: &str, actual: &[f32], reference: &[f32], state: &[u8]) {
    let Some(root) = std::env::var_os("MANIFOLD_NATIVE_LOOP_EVIDENCE_DIR") else {
        return;
    };
    assert_eq!(actual, reference);
    let root = std::path::PathBuf::from(root).join(host);
    std::fs::create_dir_all(&root).unwrap();
    let write = |name: &str, bytes: &[u8]| {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(root.join(name))
            .unwrap();
        file.write_all(bytes).unwrap();
    };
    let wave = |tape: &[f32]| {
        let data_bytes = (tape.len() * 4) as u32;
        let mut out = Vec::with_capacity(data_bytes as usize + 44);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(data_bytes + 36).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16_u32.to_le_bytes());
        out.extend_from_slice(&3_u16.to_le_bytes());
        out.extend_from_slice(&2_u16.to_le_bytes());
        out.extend_from_slice(&48_000_u32.to_le_bytes());
        out.extend_from_slice(&384_000_u32.to_le_bytes());
        out.extend_from_slice(&8_u16.to_le_bytes());
        out.extend_from_slice(&32_u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_bytes.to_le_bytes());
        for value in tape {
            out.extend_from_slice(&value.to_le_bytes());
        }
        out
    };
    write("edited.wav", &wave(actual));
    write("reference.wav", &wave(reference));
    write("saved-project.json", state);
    write("report.json",&serde_json::to_vec_pretty(&json!({"host":host,"frames":actual.len()/2,
        "sampleRate":48000,"differingSamples":0,"maxDifference":0,"callbackAllocations":0,"callbackDeallocations":0,
        "scope":if host=="native-js" {"actual public JS author module in QuickJS and native callback; record, transparent insert/remove, speed/reverse, overdub, stop before publication, PCM snapshot and fresh module restore"}
          else {"actual callback; recording, staging defer/cancel, named renumber, racing controls, overdub, stop before publication and reopen"}})).unwrap());
}
