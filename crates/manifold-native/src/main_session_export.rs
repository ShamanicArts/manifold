//! Browser-compatible Main v15 session assembly on the host control thread.
//! A snapshot supplies audio-thread truth; the stripped browser session
//! template retains UI-only choices that have no DSP parameter.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};

use crate::main_host_parameters::{
    ARPEGGIATOR_BASE, ATV_BASE, COMPARE_BASE, CV_MIX_BASE, NOTE_FILTER_BASE, RANGE_BASE,
    SAMPLE_HOLD_BASE, SCALE_QUANTIZER_BASE, SLEW_BASE, SYNTH_BASE, TRANSPOSE_BASE,
    VELOCITY_MAPPER_BASE,
};
use crate::main_session::{FX_CONTROL_COUNTS, default_main_session};
use crate::main_snapshot::MainPcmSnapshot;

#[derive(Debug)]
pub enum MainExportError {
    InvalidTemplate(&'static str),
    MissingTemplate,
    Snapshot(crate::main_snapshot::MainSnapshotError),
    Json(serde_json::Error),
}

fn pcm_base64(samples: &[f32]) -> String {
    let mut bytes = Vec::with_capacity(samples.len() * 4);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    STANDARD.encode(bytes)
}

fn rack_field<'a>(
    rack: &'a mut Value,
    module: &'static str,
) -> Result<&'a mut Value, MainExportError> {
    rack.get_mut(module)
        .filter(|value| value.is_object())
        .ok_or(MainExportError::InvalidTemplate(module))
}

fn set_host_field(
    rack: &mut Value,
    snapshot: &MainPcmSnapshot,
    id: u32,
    module: &'static str,
    key: &'static str,
    scale: f32,
    bias: f32,
) -> Result<(), MainExportError> {
    if let Some(value) = snapshot.host_values.get(id) {
        rack_field(rack, module)?[key] = json!(value * scale + bias);
    }
    Ok(())
}

fn apply_rack(rack: &mut Value, snapshot: &MainPcmSnapshot) -> Result<(), MainExportError> {
    for (id, module, key, scale, bias) in [
        (0, "source", "waveform", 1.0, 0.0),
        (1, "source", "sampleBlend", 0.5, 0.5),
        (2, "source", "sampleRoot", 1.0, 0.0),
        (3, "source", "keytrack", 1.0, 0.0),
        (4, "source", "samplePitch", 1.0, 0.0),
        (5, "source", "pitchMode", 1.0, 0.0),
        (6, "source", "blendMode", 1.0, 0.0),
        (7, "source", "blendDepth", 1.0, 0.0),
        (11, "adsr", "attack", 1000.0, 0.0),
        (12, "adsr", "decay", 1000.0, 0.0),
        (13, "adsr", "sustain", 100.0, 0.0),
        (14, "adsr", "release", 1000.0, 0.0),
        (15, "source", "output", 1.0, 0.0),
        (16, "source", "sampleStretch", 1.0, 0.0),
        (19, "source", "waveRender", 1.0, 0.0),
        (20, "source", "sampleXfade", 100.0, 0.0),
        (21, "filter", "mode", 1.0, 0.0),
        (22, "filter", "cutoff", 1.0, 0.0),
        (23, "filter", "resonance", 1.0, 0.0),
    ] {
        set_host_field(rack, snapshot, SYNTH_BASE + id, module, key, scale, bias)?;
    }
    for (id, module, key) in [
        (ATV_BASE, "atv", "amount"),
        (ATV_BASE + 1, "atv", "bias"),
        (ATV_BASE + 2, "atv", "slot"),
        (ATV_BASE + 3, "atv", "port"),
        (SLEW_BASE, "slew", "riseMs"),
        (SLEW_BASE + 1, "slew", "fallMs"),
        (SLEW_BASE + 2, "slew", "shape"),
        (SLEW_BASE + 3, "slew", "source"),
        (SAMPLE_HOLD_BASE, "sampleHold", "mode"),
        (SAMPLE_HOLD_BASE + 1, "sampleHold", "source"),
        (SAMPLE_HOLD_BASE + 2, "sampleHold", "triggerSource"),
        (COMPARE_BASE, "compare", "direction"),
        (COMPARE_BASE + 1, "compare", "threshold"),
        (COMPARE_BASE + 2, "compare", "hysteresis"),
        (COMPARE_BASE + 3, "compare", "source"),
        (CV_MIX_BASE, "cvMix", "level1"),
        (CV_MIX_BASE + 1, "cvMix", "level2"),
        (CV_MIX_BASE + 2, "cvMix", "level3"),
        (CV_MIX_BASE + 3, "cvMix", "level4"),
        (CV_MIX_BASE + 4, "cvMix", "offset"),
        (CV_MIX_BASE + 5, "cvMix", "source1"),
        (CV_MIX_BASE + 6, "cvMix", "source2"),
        (CV_MIX_BASE + 7, "cvMix", "source3"),
        (CV_MIX_BASE + 8, "cvMix", "source4"),
        (RANGE_BASE, "range", "min"),
        (RANGE_BASE + 1, "range", "max"),
        (RANGE_BASE + 2, "range", "mode"),
        (RANGE_BASE + 3, "range", "source"),
        (SCALE_QUANTIZER_BASE, "scaleQuantizer", "root"),
        (SCALE_QUANTIZER_BASE + 1, "scaleQuantizer", "scale"),
        (SCALE_QUANTIZER_BASE + 2, "scaleQuantizer", "direction"),
        (TRANSPOSE_BASE, "transpose", "semitones"),
        (TRANSPOSE_BASE + 1, "transpose", "source"),
        (NOTE_FILTER_BASE, "noteFilter", "low"),
        (NOTE_FILTER_BASE + 1, "noteFilter", "high"),
        (NOTE_FILTER_BASE + 2, "noteFilter", "mode"),
        (NOTE_FILTER_BASE + 3, "noteFilter", "source"),
        (VELOCITY_MAPPER_BASE, "velocityMapper", "amount"),
        (VELOCITY_MAPPER_BASE + 1, "velocityMapper", "curve"),
        (VELOCITY_MAPPER_BASE + 2, "velocityMapper", "offset"),
        (VELOCITY_MAPPER_BASE + 3, "velocityMapper", "source"),
    ] {
        set_host_field(rack, snapshot, id, module, key, 1.0, 0.0)?;
    }
    for (id, module) in [
        (SAMPLE_HOLD_BASE + 3, "sampleHold"),
        (SCALE_QUANTIZER_BASE + 3, "scaleQuantizer"),
        (TRANSPOSE_BASE + 2, "transpose"),
        (NOTE_FILTER_BASE + 4, "noteFilter"),
        (VELOCITY_MAPPER_BASE + 4, "velocityMapper"),
    ] {
        if let Some(value) = snapshot.host_values.get(id) {
            let key = if module == "sampleHold" {
                "manualGate"
            } else {
                "connected"
            };
            rack_field(rack, module)?[key] = json!(value >= 0.5);
        }
    }

    for (slot, name) in ["fx1", "fx2"].into_iter().enumerate() {
        let controls = snapshot.fx[slot];
        let fx = rack_field(rack, name)?;
        fx["selected"] = json!(controls.selected);
        fx["mix"] = json!(controls.mix);
        fx["parameters"] = json!(controls.parameters);
        let max_index = FX_CONTROL_COUNTS[controls.selected as usize] - 1;
        for key in ["xIndex", "yIndex"] {
            let previous = fx[key].as_i64().unwrap_or(0);
            fx[key] = json!(previous.clamp(0, max_index));
        }
        if controls.selected != 5 && controls.selected != 6 {
            fx["mode"] = json!("xy");
        }
    }

    let eq = rack_field(rack, "eq")?;
    let selected = eq["selected"].as_i64().unwrap_or(-1);
    let bands = eq["bands"]
        .as_array_mut()
        .filter(|bands| bands.len() == 8)
        .ok_or(MainExportError::InvalidTemplate("eq bands"))?;
    for (index, band) in bands.iter_mut().enumerate() {
        let offset = index * 5;
        band["enabled"] = json!(snapshot.eq[offset] >= 0.5);
        band["type"] = json!(snapshot.eq[offset + 1] as u32);
        band["freq"] = json!(snapshot.eq[offset + 2]);
        band["gain"] = json!(snapshot.eq[offset + 3]);
        band["q"] = json!(snapshot.eq[offset + 4]);
    }
    if (0..8).contains(&selected)
        && !bands[selected as usize]["enabled"]
            .as_bool()
            .unwrap_or(false)
    {
        eq["selected"] = json!(-1);
    } else if !(-1..8).contains(&selected) {
        return Err(MainExportError::InvalidTemplate("eq selected"));
    }
    eq["output"] = json!(snapshot.eq[40]);
    eq["mix"] = json!(snapshot.eq[41]);

    let arp = rack_field(rack, "arpeggiator")?;
    for (local, key) in [
        (0, "rate"),
        (1, "mode"),
        (2, "octaves"),
        (3, "gate"),
        (4, "hold"),
    ] {
        if let Some(value) = snapshot.host_values.get(ARPEGGIATOR_BASE + local) {
            arp[key] = json!(value);
        }
    }
    if let Some(value) = snapshot.host_values.get(ARPEGGIATOR_BASE + 5) {
        arp["connected"] = json!(value >= 0.5);
    }
    let hold = rack_field(rack, "sampleHold")?;
    hold["held"] = json!(snapshot.sample_hold_held);
    hold["triggerHigh"] = json!(snapshot.sample_hold_trigger_high);
    let compare = rack_field(rack, "compare")?;
    compare["gate"] = json!(snapshot.compare_gate);
    compare["pulseRemaining"] = json!(snapshot.compare_pulse_remaining);
    Ok(())
}

/// Build a v15 save template from a previously validated browser session.
/// Old versions inherit only modules they did not define from the authored
/// default, while their UI-only choices and existing module values survive.
pub fn save_template(bytes: &[u8]) -> Result<Value, MainExportError> {
    let mut state: Value = serde_json::from_slice(bytes).map_err(MainExportError::Json)?;
    let version = state["version"]
        .as_i64()
        .filter(|version| (1..=15).contains(version))
        .ok_or(MainExportError::InvalidTemplate("version"))?;
    if version < 15 {
        let sample_rate = state["sampleRate"]
            .as_f64()
            .ok_or(MainExportError::InvalidTemplate("sampleRate"))?
            as f32;
        let mut upgraded = default_main_session(sample_rate)
            .map_err(|_| MainExportError::InvalidTemplate("default session"))?;
        if let Some(rack) = state.get("rack").and_then(Value::as_object) {
            for key in [
                "source",
                "adsr",
                "filter",
                "fx1",
                "fx2",
                "eq",
                "lfos",
                "atv",
                "slew",
                "sampleHold",
                "compare",
                "cvMix",
                "range",
                "scaleQuantizer",
                "transpose",
                "noteFilter",
                "velocityMapper",
                "arpeggiator",
            ] {
                if let Some(value) = rack.get(key) {
                    upgraded["rack"][key] = value.clone();
                }
            }
            if rack.get("lfos").is_none() {
                if let Some(lfo) = rack.get("lfo") {
                    let mut lfo = lfo.clone();
                    lfo["slot"] = json!(0);
                    upgraded["rack"]["lfos"] = json!([lfo]);
                }
            }
        }
        state = upgraded;
    }
    let layers = state["layers"]
        .as_array_mut()
        .filter(|layers| layers.len() == 4)
        .ok_or(MainExportError::InvalidTemplate("layers"))?;
    for layer in layers {
        layer["pcmF32Base64"] = json!("");
    }
    state["sample"]["pcmF32Base64"] = json!("");
    Ok(state)
}

/// Reassemble the exact browser Main envelope. This allocates and serializes
/// only on the host control thread, after PCM and controls were frozen together.
pub fn export_main_session(
    snapshot: &MainPcmSnapshot,
    template: &Value,
) -> Result<Vec<u8>, MainExportError> {
    if template["format"] != "manifold.project"
        || template["id"] != "manifold.main-looper"
        || template["version"] != 15
        || !template["rack"].is_object()
    {
        return Err(MainExportError::InvalidTemplate("identity"));
    }
    let mut state = template.clone();
    let header = &snapshot.header;
    state["sampleRate"] = json!(header.sample_rate);
    state["tempo"] = json!(header.tempo);
    state["targetBpm"] = json!(header.target_bpm);
    state["mode"] = json!(header.mode as u32);
    state["activeLayer"] = json!(header.active_layer);
    state["overdub"] = json!(header.overdub);
    state["overdubLengthPolicy"] = json!(u8::from(header.overdub_length_policy));
    let layers = state["layers"]
        .as_array_mut()
        .filter(|layers| layers.len() == 4)
        .ok_or(MainExportError::InvalidTemplate("layers"))?;
    for (index, layer) in layers.iter_mut().enumerate() {
        let values = header.layers[index];
        if snapshot.layers[index].len() != values.frames * 2 {
            return Err(MainExportError::InvalidTemplate("layer PCM"));
        }
        layer["frames"] = json!(values.frames);
        layer["bars"] = json!(values.bars);
        layer["position"] = json!(values.position);
        layer["playing"] = json!(values.playing);
        layer["volume"] = json!(values.volume);
        layer["speed"] = json!(values.speed);
        layer["muted"] = json!(values.muted);
        layer["pcmF32Base64"] = json!(pcm_base64(&snapshot.layers[index]));
    }
    if snapshot.sample.len() != header.sample_frames * 2 {
        return Err(MainExportError::InvalidTemplate("sample PCM"));
    }
    state["sample"]["frames"] = json!(header.sample_frames);
    state["sample"]["pcmF32Base64"] = json!(pcm_base64(&snapshot.sample));
    apply_rack(&mut state["rack"], snapshot)?;
    serde_json::to_vec(&state).map_err(MainExportError::Json)
}
