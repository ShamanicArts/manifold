//! Prepared Main session import. Parse and allocate off the audio callback,
//! then hand the complete processor to a host's block-boundary publisher.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use manifold_core::main_instrument::MainInstrument;
use manifold_core::sample_region::ValidatedStereo;
use serde_json::Value;

use crate::{NativeError, main_instrument::MainNativeProcessor};

const MAX_SESSION_BYTES: usize = 300 * 1024 * 1024;
pub(crate) const FX_CONTROL_COUNTS: [i64; 21] = [
    5, 5, 4, 5, 2, 2, 3, 2, 2, 2, 3, 4, 3, 4, 3, 4, 3, 3, 4, 3, 4,
];

pub fn default_main_session(sample_rate: f32) -> Result<Value, MainSessionError> {
    let mut session: Value = serde_json::from_str(include_str!(
        "../../../projects/main-looper/default-session-v15.json"
    ))
    .map_err(MainSessionError::Json)?;
    session["sampleRate"] = serde_json::json!(sample_rate);
    Ok(session)
}

#[derive(Debug)]
pub enum MainSessionError {
    Json(serde_json::Error),
    Invalid(&'static str),
    Native(NativeError),
}

impl From<NativeError> for MainSessionError {
    fn from(value: NativeError) -> Self {
        Self::Native(value)
    }
}

fn member<'a>(value: &'a Value, key: &'static str) -> Result<&'a Value, MainSessionError> {
    value.get(key).ok_or(MainSessionError::Invalid(key))
}

fn number(value: &Value, key: &'static str, min: f64, max: f64) -> Result<f32, MainSessionError> {
    let n = member(value, key)?
        .as_f64()
        .ok_or(MainSessionError::Invalid(key))?;
    let discrete = matches!(
        key,
        "waveform"
            | "waveRender"
            | "pitchMode"
            | "blendMode"
            | "keytrack"
            | "shape"
            | "retrig"
            | "source"
            | "target"
            | "mode"
            | "slot"
            | "port"
            | "riseMs"
            | "fallMs"
            | "triggerSource"
            | "direction"
            | "pulseRemaining"
            | "root"
            | "scale"
            | "semitones"
            | "low"
            | "high"
            | "curve"
            | "octaves"
            | "gate"
            | "activeLayer"
            | "overdubLengthPolicy"
    );
    if !n.is_finite() || n < min || n > max || (discrete && n.fract() != 0.0) {
        return Err(MainSessionError::Invalid(key));
    }
    Ok(n as f32)
}

fn integer(value: &Value, key: &'static str, min: i64, max: i64) -> Result<i64, MainSessionError> {
    let n = member(value, key)?
        .as_i64()
        .ok_or(MainSessionError::Invalid(key))?;
    if n < min || n > max {
        return Err(MainSessionError::Invalid(key));
    }
    Ok(n)
}

fn boolean(value: &Value, key: &'static str) -> Result<bool, MainSessionError> {
    member(value, key)?
        .as_bool()
        .ok_or(MainSessionError::Invalid(key))
}

fn checked_set(ok: bool, name: &'static str) -> Result<(), MainSessionError> {
    if ok {
        Ok(())
    } else {
        Err(MainSessionError::Invalid(name))
    }
}

fn pcm(value: &Value, frames: usize) -> Result<Vec<f32>, MainSessionError> {
    let encoded = member(value, "pcmF32Base64")?
        .as_str()
        .ok_or(MainSessionError::Invalid("pcmF32Base64"))?;
    if frames == 0 {
        if encoded.is_empty() {
            return Ok(Vec::new());
        }
        return Err(MainSessionError::Invalid("pcmF32Base64"));
    }
    let byte_count = frames
        .checked_mul(8)
        .ok_or(MainSessionError::Invalid("frames"))?;
    // Reject impossible lengths before allocating the decoded payload.
    let expected_chars = byte_count.div_ceil(3) * 4;
    if encoded.len() != expected_chars {
        return Err(MainSessionError::Invalid("pcmF32Base64"));
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| MainSessionError::Invalid("pcmF32Base64"))?;
    if bytes.len() != byte_count {
        return Err(MainSessionError::Invalid("pcmF32Base64"));
    }
    let mut samples = Vec::with_capacity(frames * 2);
    for chunk in bytes.chunks_exact(4) {
        let sample = f32::from_le_bytes(chunk.try_into().unwrap());
        if !sample.is_finite() {
            return Err(MainSessionError::Invalid("pcmF32Base64"));
        }
        samples.push(sample);
    }
    Ok(samples)
}

fn set_synth(instrument: &mut MainInstrument, id: u32, value: f32) -> Result<(), MainSessionError> {
    checked_set(instrument.set_synth_parameter(id, value), "rack")
}

fn apply_rack(
    instrument: &mut MainInstrument,
    rack: &Value,
    version: i64,
) -> Result<(), MainSessionError> {
    let source = member(rack, "source")?;
    let tab = member(source, "tab")?
        .as_str()
        .ok_or(MainSessionError::Invalid("tab"))?;
    if !["wave", "sample", "blend"].contains(&tab) {
        return Err(MainSessionError::Invalid("tab"));
    }
    integer(source, "sampleSource", 0, 4)?;
    integer(source, "sampleMode", 0, 1)?;
    number(source, "sampleBars", 0.0625, 16.0)?;
    for (key, id, min, max) in [
        ("waveform", 0, 0.0, 4.0),
        ("waveRender", 19, 0.0, 1.0),
        ("sampleRoot", 2, 12.0, 96.0),
        ("sampleXfade", 20, 0.0, 50.0),
        ("sampleStretch", 16, 0.25, 4.0),
        ("pitchMode", 5, 0.0, 2.0),
        ("samplePitch", 4, -24.0, 24.0),
        ("blendMode", 6, 0.0, 5.0),
        ("keytrack", 3, 0.0, 2.0),
        ("blendDepth", 7, 0.0, 1.0),
        ("output", 15, 0.0, 2.0),
    ] {
        let value = number(source, key, min, max)?;
        let value = match key {
            "sampleXfade" => value / 100.0,
            _ => value,
        };
        set_synth(instrument, id, value)?;
    }
    let blend = number(source, "sampleBlend", 0.0, 1.0)?;
    set_synth(instrument, 1, blend * 2.0 - 1.0)?;

    let adsr = member(rack, "adsr")?;
    for (key, id, min, max, divisor) in [
        ("attack", 11, 1.0, 5000.0, 1000.0),
        ("decay", 12, 1.0, 5000.0, 1000.0),
        ("sustain", 13, 0.0, 100.0, 100.0),
        ("release", 14, 1.0, 10000.0, 1000.0),
    ] {
        set_synth(instrument, id, number(adsr, key, min, max)? / divisor)?;
    }
    let filter = member(rack, "filter")?;
    set_synth(instrument, 21, integer(filter, "mode", 0, 3)? as f32)?;
    set_synth(instrument, 22, number(filter, "cutoff", 80.0, 16000.0)?)?;
    set_synth(instrument, 23, number(filter, "resonance", 0.1, 2.0)?)?;

    for (slot, name, base) in [(0, "fx1", 128), (1, "fx2", 136)] {
        let fx = member(rack, name)?;
        let selected = integer(fx, "selected", 0, 20)? as u32;
        let mix = number(fx, "mix", 0.0, 1.0)?;
        integer(fx, "xIndex", 0, FX_CONTROL_COUNTS[selected as usize] - 1)?;
        integer(fx, "yIndex", 0, FX_CONTROL_COUNTS[selected as usize] - 1)?;
        let mode = member(fx, "mode")?
            .as_str()
            .ok_or(MainSessionError::Invalid("mode"))?;
        if !["xy", "graph"].contains(&mode) || (mode == "graph" && selected != 5 && selected != 6) {
            return Err(MainSessionError::Invalid("mode"));
        }
        let parameters = member(fx, "parameters")?
            .as_array()
            .ok_or(MainSessionError::Invalid("parameters"))?;
        if parameters.len() != 21 {
            return Err(MainSessionError::Invalid("parameters"));
        }
        for (kind, values) in parameters.iter().enumerate() {
            let values = values
                .as_array()
                .ok_or(MainSessionError::Invalid("parameters"))?;
            if values.len() != 5 {
                return Err(MainSessionError::Invalid("parameters"));
            }
            let mut controls = [0.0; 5];
            for (index, value) in values.iter().enumerate() {
                let n = value
                    .as_f64()
                    .ok_or(MainSessionError::Invalid("parameters"))?;
                if !n.is_finite() || !(0.0..=1.0).contains(&n) {
                    return Err(MainSessionError::Invalid("parameters"));
                }
                controls[index] = n as f32;
            }
            checked_set(
                instrument.restore_fx_type_params(slot, kind as u32, controls),
                "parameters",
            )?;
            if kind as u32 == selected {
                set_synth(instrument, base, selected as f32)?;
                set_synth(instrument, base + 1, mix)?;
                for (index, control) in controls.into_iter().enumerate() {
                    set_synth(instrument, base + 2 + index as u32, control)?;
                }
            }
        }
    }

    let eq = member(rack, "eq")?;
    let selected_band = integer(eq, "selected", -1, 7)?;
    integer(eq, "insertType", 0, 5)?;
    let bands = member(eq, "bands")?
        .as_array()
        .ok_or(MainSessionError::Invalid("bands"))?;
    if bands.len() != 8 {
        return Err(MainSessionError::Invalid("bands"));
    }
    if selected_band >= 0 && !boolean(&bands[selected_band as usize], "enabled")? {
        return Err(MainSessionError::Invalid("selected"));
    }
    for (index, band) in bands.iter().enumerate() {
        let base = 64 + index as u32 * 5;
        set_synth(instrument, base, boolean(band, "enabled")? as u8 as f32)?;
        set_synth(instrument, base + 1, integer(band, "type", 0, 6)? as f32)?;
        set_synth(instrument, base + 2, number(band, "freq", 20.0, 20000.0)?)?;
        set_synth(instrument, base + 3, number(band, "gain", -24.0, 24.0)?)?;
        set_synth(instrument, base + 4, number(band, "q", 0.1, 24.0)?)?;
    }
    if eq.get("output").is_some() {
        set_synth(instrument, 104, number(eq, "output", -24.0, 24.0)?)?;
    }
    if eq.get("mix").is_some() {
        set_synth(instrument, 105, number(eq, "mix", 0.0, 1.0)?)?;
    }

    let legacy_lfo = rack.get("lfo");
    let lfos = if version >= 4 || rack.get("lfos").is_some() {
        Some(
            member(rack, "lfos")?
                .as_array()
                .ok_or(MainSessionError::Invalid("lfos"))?,
        )
    } else {
        None
    };
    if lfos.is_some_and(|items| items.is_empty() || items.len() > 4) {
        return Err(MainSessionError::Invalid("lfos"));
    }
    let mut occupied = [false; 4];
    let lfo_items: Vec<&Value> = if let Some(items) = lfos {
        items.iter().collect()
    } else if version >= 3 || legacy_lfo.is_some() {
        vec![member(rack, "lfo")?]
    } else {
        Vec::new()
    };
    for lfo in lfo_items {
        let slot = if lfos.is_some() {
            integer(lfo, "slot", 0, 3)? as usize
        } else {
            0
        };
        if occupied[slot] {
            return Err(MainSessionError::Invalid("lfos"));
        }
        occupied[slot] = true;
        checked_set(instrument.set_lfo_slot_active(slot, true), "lfos")?;
        for (key, id, min, max) in [
            ("shape", 0, 0.0, 5.0),
            ("rate", 1, 0.01, 20.0),
            ("depth", 2, 0.0, 1.0),
            ("phase", 3, 0.0, 360.0),
            ("retrig", 4, 0.0, 1.0),
        ] {
            checked_set(
                instrument.set_lfo_slot_parameter(slot, id, number(lfo, key, min, max)?),
                "lfos",
            )?;
        }
        let route = member(lfo, "route")?;
        for (key, id, min, max) in [
            ("source", 0, 0.0, 12.0),
            ("target", 1, 0.0, 137.0),
            ("amount", 2, -1.0, 1.0),
            ("bias", 3, -1.0, 1.0),
            ("mode", 4, 0.0, 1.0),
        ] {
            let value = number(route, key, min, max)?;
            if key == "source" {
                let allowed = if version >= 10 {
                    12.0
                } else if version >= 9 {
                    11.0
                } else if version >= 8 {
                    9.0
                } else if version >= 7 {
                    7.0
                } else if version >= 6 {
                    5.0
                } else if version >= 5 {
                    4.0
                } else {
                    3.0
                };
                if value > allowed {
                    return Err(MainSessionError::Invalid("source"));
                }
            }
            if key == "target" && ![0.0, 22.0, 23.0, 129.0, 137.0].contains(&value) {
                return Err(MainSessionError::Invalid("target"));
            }
            checked_set(
                instrument.set_modulation_slot_route(slot, id, value),
                "route",
            )?;
        }
        checked_set(
            instrument.set_modulation_slot_route(slot, 5, boolean(route, "enabled")? as u8 as f32),
            "route",
        )?;
    }
    if (version >= 3 || legacy_lfo.is_some() || lfos.is_some()) && !occupied[0] {
        return Err(MainSessionError::Invalid("lfos"));
    }

    macro_rules! apply_module {
        ($since:expr, $name:literal, $setter:ident, [$(($key:literal, $id:expr, $min:expr, $max:expr)),* $(,)?], [$(($flag:literal, $flag_id:expr)),* $(,)?]) => {{
            if version >= $since || rack.get($name).is_some() {
                let state = member(rack, $name)?;
                $(checked_set(instrument.$setter($id, number(state, $key, $min, $max)?), $name)?;)*
                $(checked_set(instrument.$setter($flag_id, boolean(state, $flag)? as u8 as f32), $name)?;)*
            }
        }};
    }
    apply_module!(
        5,
        "atv",
        set_atv_parameter,
        [
            ("amount", 0, -1.0, 1.0),
            ("bias", 1, -1.0, 1.0),
            ("slot", 2, 0.0, 3.0),
            ("port", 3, 0.0, 3.0)
        ],
        []
    );
    apply_module!(
        6,
        "slew",
        set_slew_parameter,
        [
            ("riseMs", 0, 0.0, 2000.0),
            ("fallMs", 1, 0.0, 2000.0),
            ("shape", 2, 0.0, 2.0),
            ("source", 3, 0.0, 16.0)
        ],
        []
    );
    apply_module!(
        7,
        "sampleHold",
        set_sample_hold_parameter,
        [
            ("mode", 0, 0.0, 2.0),
            ("source", 1, 0.0, 17.0),
            ("triggerSource", 2, 0.0, 4.0),
            ("held", 4, -1.0, 1.0)
        ],
        [("manualGate", 3), ("triggerHigh", 5)]
    );
    apply_module!(
        8,
        "compare",
        set_compare_parameter,
        [
            ("direction", 0, 0.0, 2.0),
            ("threshold", 1, -1.0, 1.0),
            ("hysteresis", 2, 0.0, 0.5),
            ("source", 3, 0.0, 19.0),
            ("pulseRemaining", 5, 0.0, 2.0)
        ],
        [("gate", 4)]
    );
    apply_module!(
        9,
        "cvMix",
        set_cv_mix_parameter,
        [
            ("level1", 0, 0.0, 1.0),
            ("level2", 1, 0.0, 1.0),
            ("level3", 2, 0.0, 1.0),
            ("level4", 3, 0.0, 1.0),
            ("offset", 4, -1.0, 1.0),
            ("source1", 5, 0.0, 21.0),
            ("source2", 6, 0.0, 21.0),
            ("source3", 7, 0.0, 21.0),
            ("source4", 8, 0.0, 21.0)
        ],
        []
    );
    apply_module!(
        10,
        "range",
        set_range_parameter,
        [
            ("min", 0, 0.0, 1.0),
            ("max", 1, 0.0, 1.0),
            ("mode", 2, 0.0, 1.0),
            ("source", 3, 0.0, 23.0)
        ],
        []
    );
    apply_module!(
        11,
        "scaleQuantizer",
        set_scale_quantizer_parameter,
        [
            ("root", 0, 0.0, 11.0),
            ("scale", 1, 1.0, 6.0),
            ("direction", 2, 1.0, 3.0)
        ],
        [("connected", 3)]
    );
    apply_module!(
        12,
        "transpose",
        set_transpose_parameter,
        [("semitones", 0, -24.0, 24.0), ("source", 1, 0.0, 1.0)],
        [("connected", 2)]
    );
    apply_module!(
        13,
        "noteFilter",
        set_note_filter_parameter,
        [
            ("low", 0, 0.0, 127.0),
            ("high", 1, 0.0, 127.0),
            ("mode", 2, 0.0, 1.0),
            ("source", 3, 0.0, 2.0)
        ],
        [("connected", 4)]
    );
    apply_module!(
        14,
        "velocityMapper",
        set_velocity_mapper_parameter,
        [
            ("amount", 0, 0.0, 1.0),
            ("curve", 1, 0.0, 2.0),
            ("offset", 2, -1.0, 1.0),
            ("source", 3, 0.0, 4.0)
        ],
        [("connected", 4)]
    );
    apply_module!(
        15,
        "arpeggiator",
        set_arpeggiator_parameter,
        [
            ("rate", 0, 0.25, 20.0),
            ("mode", 1, 0.0, 3.0),
            ("octaves", 2, 1.0, 4.0),
            ("gate", 3, 5.0, 100.0),
            ("hold", 4, 0.0, 1.0)
        ],
        [("connected", 5)]
    );
    Ok(())
}

/// Decode and prepare browser Main session versions 1 through 15. The returned
/// processor is detached from the host callback until the host publishes it.
pub fn prepare_main_session(
    bytes: &[u8],
    sample_rate: f32,
    max_frames: usize,
) -> Result<MainNativeProcessor, MainSessionError> {
    if bytes.len() > MAX_SESSION_BYTES {
        return Err(MainSessionError::Invalid("session size"));
    }
    let state: Value = serde_json::from_slice(bytes).map_err(MainSessionError::Json)?;
    let version = integer(&state, "version", 1, 15)?;
    if member(&state, "format")?.as_str() != Some("manifold.project")
        || member(&state, "id")?.as_str() != Some("manifold.main-looper")
        || number(&state, "sampleRate", 8000.0, 192000.0)? != sample_rate
    {
        return Err(MainSessionError::Invalid("session identity"));
    }
    let mut processor = MainNativeProcessor::prepare(sample_rate, max_frames)?;
    let instrument = processor.instrument_control_mut();
    if version < 15 {
        let defaults = default_main_session(sample_rate)?;
        apply_rack(instrument, member(&defaults, "rack")?, 15)?;
    }
    let looper = instrument.looper_mut();
    for (key, id, min, max) in [
        ("activeLayer", 0, 0.0, 3.0),
        ("mode", 1, 0.0, 2.0),
        ("tempo", 2, 20.0, 300.0),
        ("targetBpm", 3, 20.0, 300.0),
        ("overdubLengthPolicy", 5, 0.0, 1.0),
    ] {
        checked_set(looper.set_control(id, number(&state, key, min, max)?), key)?;
    }
    checked_set(
        looper.set_control(4, boolean(&state, "overdub")? as u8 as f32),
        "overdub",
    )?;
    let layers = member(&state, "layers")?
        .as_array()
        .ok_or(MainSessionError::Invalid("layers"))?;
    if layers.len() != 4 {
        return Err(MainSessionError::Invalid("layers"));
    }
    for (index, layer) in layers.iter().enumerate() {
        let frames = integer(layer, "frames", 0, (sample_rate as i64) * 30)? as usize;
        let bars = number(layer, "bars", 0.0, 16.0)?;
        let position = number(layer, "position", 0.0, 1.0)?;
        let playing = boolean(layer, "playing")?;
        let volume = number(layer, "volume", 0.0, 2.0)?;
        let speed = number(layer, "speed", -4.0, 4.0)?;
        let muted = boolean(layer, "muted")?;
        let audio = pcm(layer, frames)?;
        if frames > 0 {
            checked_set(
                looper.begin_layer_load(index, frames, bars, position, playing),
                "layers",
            )?;
            for (chunk_index, chunk) in audio.chunks(4096 * 2).enumerate() {
                checked_set(
                    looper.load_layer_chunk(index, chunk_index * 4096, chunk),
                    "layers",
                )?;
            }
            checked_set(looper.finish_layer_load(index), "layers")?;
        }
        for (id, value) in [(0, volume), (1, speed), (2, muted as u8 as f32)] {
            checked_set(looper.set_layer_control(index, id, value), "layers")?;
        }
    }
    if version >= 2 {
        let sample = member(&state, "sample")?;
        let sample_frames = integer(
            sample,
            "frames",
            0,
            (sample_rate as i64 * 30).min(1_440_000),
        )? as usize;
        let sample_audio = pcm(sample, sample_frames)?;
        if sample_frames > 0 {
            let validated = ValidatedStereo::from_stereo(sample_audio, sample_rate)
                .ok_or(MainSessionError::Invalid("sample"))?;
            instrument.load_validated_sample(validated);
        }
        apply_rack(instrument, member(&state, "rack")?, version)?;
    }
    Ok(processor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const BROWSER_EMPTY: &str =
        include_str!("../../../projects/main-looper/default-session-v15.json");

    fn encode(samples: &[f32]) -> String {
        let bytes: Vec<u8> = samples
            .iter()
            .flat_map(|sample| sample.to_le_bytes())
            .collect();
        STANDARD.encode(bytes)
    }

    #[test]
    fn browser_v15_fixture_prepares_an_actual_native_main_instrument() {
        let host = prepare_main_session(BROWSER_EMPTY.as_bytes(), 48_000.0, 128).unwrap();
        assert_eq!(host.instrument().looper().tempo(), 120.0);
        assert_eq!(host.instrument().looper().layer_length(0), 0);
        assert_eq!(host.instrument().synth_sample_frames(), 0);
    }

    #[test]
    fn browser_v15_pcm_and_voice_controls_restore_before_publication() {
        let mut session: Value = serde_json::from_str(BROWSER_EMPTY).unwrap();
        let frames = 48;
        let mut audio = vec![0.0; frames * 2];
        for frame in 0..frames {
            audio[frame * 2] = 0.25;
            audio[frame * 2 + 1] = -0.5;
        }
        session["layers"][0]["frames"] = json!(frames);
        session["layers"][0]["bars"] = json!(0.0625);
        session["layers"][0]["playing"] = json!(true);
        session["layers"][0]["pcmF32Base64"] = json!(encode(&audio));
        session["sample"]["frames"] = json!(frames);
        session["sample"]["pcmF32Base64"] = json!(encode(&audio));
        session["rack"]["fx1"]["parameters"][7][0] = json!(0.77);
        session["rack"]["arpeggiator"]["connected"] = json!(true);
        let host = prepare_main_session(session.to_string().as_bytes(), 48_000.0, 128).unwrap();
        assert_eq!(host.instrument().looper().layer_length(0), frames);
        assert!((host.instrument().looper().peak(0, 0, 0, frames) - 0.5).abs() < 0.0001);
        assert_eq!(host.instrument().synth_sample_frames(), frames);
        assert!((host.instrument().synth_sample_peak(0, frames) - 0.5).abs() < 0.0001);
        assert!((host.instrument().fx_type_params(0, 7).unwrap()[0] - 0.77).abs() < 0.0001);
    }

    #[test]
    fn malformed_pcm_or_sample_rate_never_prepares_a_runtime() {
        let mut session: Value = serde_json::from_str(BROWSER_EMPTY).unwrap();
        session["layers"][0]["frames"] = json!(1);
        session["layers"][0]["pcmF32Base64"] = json!(encode(&[f32::NAN, 0.0]));
        assert!(prepare_main_session(session.to_string().as_bytes(), 48_000.0, 128).is_err());
        assert!(prepare_main_session(BROWSER_EMPTY.as_bytes(), 44_100.0, 128).is_err());
        let mut session: Value = serde_json::from_str(BROWSER_EMPTY).unwrap();
        session["rack"]["arpeggiator"]["mode"] = json!(1.5);
        assert!(prepare_main_session(session.to_string().as_bytes(), 48_000.0, 128).is_err());
    }

    #[test]
    fn browser_legacy_versions_prepare_with_later_modules_defaulted() {
        for version in 1..=14 {
            let mut session: Value = serde_json::from_str(BROWSER_EMPTY).unwrap();
            session["version"] = json!(version);
            if version == 1 {
                session.as_object_mut().unwrap().remove("rack");
                session.as_object_mut().unwrap().remove("sample");
            } else {
                let rack = session["rack"].as_object_mut().unwrap();
                for (since, name) in [
                    (5, "atv"),
                    (6, "slew"),
                    (7, "sampleHold"),
                    (8, "compare"),
                    (9, "cvMix"),
                    (10, "range"),
                    (11, "scaleQuantizer"),
                    (12, "transpose"),
                    (13, "noteFilter"),
                    (14, "velocityMapper"),
                    (15, "arpeggiator"),
                ] {
                    if version < since {
                        rack.remove(name);
                    }
                }
                if version <= 3 {
                    let mut lfo = rack.remove("lfos").unwrap()[0].clone();
                    lfo.as_object_mut().unwrap().remove("slot");
                    if version == 3 {
                        rack.insert("lfo".into(), lfo);
                    }
                }
            }
            let host = prepare_main_session(session.to_string().as_bytes(), 48_000.0, 128)
                .unwrap_or_else(|error| panic!("version {version}: {error:?}"));
            assert_eq!(host.instrument().looper().tempo(), 120.0);
            assert_eq!(host.instrument().synth_sample_frames(), 0);
        }
    }
}
