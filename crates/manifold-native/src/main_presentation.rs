//! Compact Main editor state derived on a control thread. PCM is decoded in
//! bounded chunks for waveform peaks and is never sent to the webview.

use std::io::Read;

use base64::engine::general_purpose::STANDARD;
use base64::read::DecoderReader;
use serde_json::{Value, json};

use crate::main_session_export::{MainExportError, save_template};

#[derive(Debug)]
pub enum MainPresentationError {
    Json(serde_json::Error),
    Upgrade(MainExportError),
    Invalid(&'static str),
    Pcm(std::io::Error),
}

fn peaks(asset: &Value) -> Result<Vec<f32>, MainPresentationError> {
    let frames = asset["frames"]
        .as_u64()
        .and_then(|frames| usize::try_from(frames).ok())
        .filter(|frames| *frames <= 30 * 192_000)
        .ok_or(MainPresentationError::Invalid("asset frames"))?;
    let encoded = asset["pcmF32Base64"]
        .as_str()
        .ok_or(MainPresentationError::Invalid("asset PCM"))?;
    let mut bins = if frames == 0 {
        Vec::new()
    } else {
        vec![0.0_f32; 128]
    };
    let mut reader = DecoderReader::new(encoded.as_bytes(), &STANDARD);
    let mut chunk = [0_u8; 8192];
    let mut cursor = 0;
    while cursor < frames {
        let count = (frames - cursor).min(1024);
        reader
            .read_exact(&mut chunk[..count * 8])
            .map_err(MainPresentationError::Pcm)?;
        for index in 0..count {
            let offset = index * 8;
            let left = f32::from_le_bytes(chunk[offset..offset + 4].try_into().unwrap());
            let right = f32::from_le_bytes(chunk[offset + 4..offset + 8].try_into().unwrap());
            if !left.is_finite() || !right.is_finite() {
                return Err(MainPresentationError::Invalid("finite PCM"));
            }
            let bin = ((cursor + index) * 128 / frames).min(127);
            bins[bin] = bins[bin].max(left.abs()).max(right.abs());
        }
        cursor += count;
    }
    let mut extra = [0_u8; 1];
    if reader
        .read(&mut extra)
        .map_err(MainPresentationError::Pcm)?
        != 0
    {
        return Err(MainPresentationError::Invalid("PCM length"));
    }
    Ok(bins)
}

/// Strip every PCM asset from an accepted Main session and replace it with
/// 128 left-to-right peak bins. Older sessions gain authored missing modules;
/// their existing transport, layer, Sample, and UI choices survive.
pub fn compact_main_presentation(bytes: &[u8]) -> Result<Value, MainPresentationError> {
    let source: Value = serde_json::from_slice(bytes).map_err(MainPresentationError::Json)?;
    if source["id"] != "manifold.main-looper" {
        return Err(MainPresentationError::Invalid("Main session"));
    }
    let version = source["version"]
        .as_u64()
        .filter(|version| (1..=15).contains(version))
        .ok_or(MainPresentationError::Invalid("Main version"))?;
    let mut state = if version == 15 {
        source
    } else {
        let mut upgraded = save_template(bytes).map_err(MainPresentationError::Upgrade)?;
        if let (Some(previous), Some(next)) = (source.as_object(), upgraded.as_object_mut()) {
            for (key, value) in previous {
                if !matches!(key.as_str(), "version" | "rack") {
                    next.insert(key.clone(), value.clone());
                }
            }
        }
        upgraded
    };
    let layers = state["layers"]
        .as_array_mut()
        .filter(|layers| layers.len() == 4)
        .ok_or(MainPresentationError::Invalid("layers"))?;
    for layer in layers {
        let bins = peaks(layer)?;
        let object = layer
            .as_object_mut()
            .ok_or(MainPresentationError::Invalid("layer"))?;
        object.remove("pcmF32Base64");
        object.insert("peaks".into(), json!(bins.as_slice()));
    }
    let bins = peaks(&state["sample"])?;
    let sample = state["sample"]
        .as_object_mut()
        .ok_or(MainPresentationError::Invalid("sample"))?;
    sample.remove("pcmF32Base64");
    sample.insert("peaks".into(), json!(bins.as_slice()));
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn peak_bins_follow_pcm_start_to_end_for_short_loops() {
        let audio: Vec<u8> = [0.1_f32, 0.2, 0.3, 0.4]
            .into_iter()
            .flat_map(|value| [value, -value])
            .flat_map(f32::to_le_bytes)
            .collect();
        let asset = json!({ "frames": 4, "pcmF32Base64": STANDARD.encode(audio) });
        let bins = peaks(&asset).unwrap();
        for (bin, expected) in [(0, 0.1), (32, 0.2), (64, 0.3), (96, 0.4)] {
            assert!((bins[bin] - expected).abs() < 1e-6);
        }
    }

    #[test]
    fn populated_browser_session_becomes_a_small_left_to_right_editor_document() {
        let bytes = include_bytes!("../../../web/public/main-native-saved-session.json");
        let document = compact_main_presentation(bytes).unwrap();
        assert_eq!(document["layers"][0]["frames"], 6000);
        assert!(document["layers"][0].get("pcmF32Base64").is_none());
        assert!(document["sample"].get("pcmF32Base64").is_none());
        let bins = document["layers"][0]["peaks"].as_array().unwrap();
        assert_eq!(bins.len(), 128);
        assert!(bins[0].as_f64().unwrap() > bins[127].as_f64().unwrap());
        assert!(serde_json::to_vec(&document).unwrap().len() < bytes.len() / 3);
        assert!((document["rack"]["source"]["output"].as_f64().unwrap() - 0.6).abs() < 1e-6);
    }

    #[test]
    fn legacy_session_keeps_its_layer_and_gains_the_current_rack() {
        let mut old: Value = serde_json::from_slice(include_bytes!(
            "../../../web/public/main-native-saved-session.json"
        ))
        .unwrap();
        old["version"] = json!(3);
        let rack = old["rack"].as_object_mut().unwrap();
        let mut lfo = rack.remove("lfos").unwrap()[0].clone();
        lfo.as_object_mut().unwrap().remove("slot");
        rack.insert("lfo".into(), lfo);
        rack.remove("arpeggiator");
        let document = compact_main_presentation(old.to_string().as_bytes()).unwrap();
        assert_eq!(document["version"], 15);
        assert_eq!(document["layers"][0]["frames"], 6000);
        assert_eq!(document["rack"]["lfos"][0]["slot"], 0);
        assert!(document["rack"]["arpeggiator"].is_object());
        assert!(document["layers"][0].get("pcmF32Base64").is_none());
    }
}
