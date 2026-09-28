//! Physical Main host parameter values derived from a validated v15 session.
//! This runs on a control thread when a plugin instance or state is prepared.

use serde_json::Value;

use crate::main_host_parameters::{
    ARPEGGIATOR_BASE, ATV_BASE, COMPARE_BASE, CV_MIX_BASE, LFO_BASE, LFO_STRIDE,
    MAIN_HOST_ID_CAPACITY, MainParameter, NOTE_FILTER_BASE, RANGE_BASE, SAMPLE_HOLD_BASE,
    SCALE_QUANTIZER_BASE, SLEW_BASE, SYNTH_BASE, TRANSPOSE_BASE, VELOCITY_MAPPER_BASE,
};

fn number(value: &Value) -> Option<f32> {
    let value = value.as_f64()?;
    value.is_finite().then_some(value as f32)
}

fn scalar(value: &Value) -> Option<f32> {
    if let Some(value) = value.as_bool() {
        Some(value as u8 as f32)
    } else {
        number(value)
    }
}

fn put(values: &mut [f32; MAIN_HOST_ID_CAPACITY], id: u32, value: f32) -> Option<()> {
    MainParameter::decode(id, value).ok()?;
    values[id as usize] = value;
    Some(())
}

fn fields<const N: usize>(
    values: &mut [f32; MAIN_HOST_ID_CAPACITY],
    module: &Value,
    base: u32,
    fields: [(u32, &'static str); N],
) -> Option<()> {
    for (local, key) in fields {
        put(values, base + local, scalar(module.get(key)?)?)?;
    }
    Some(())
}

/// Extract every fixed host value from a session already accepted by the Main
/// loader. Browser-only choices are intentionally outside the host ID bank.
pub fn values_from_session(session: &Value) -> Option<[f32; MAIN_HOST_ID_CAPACITY]> {
    let mut values = [0.0; MAIN_HOST_ID_CAPACITY];
    let rack = session.get("rack")?;
    for (id, key) in [
        (0, "mode"),
        (1, "activeLayer"),
        (2, "tempo"),
        (3, "targetBpm"),
        (4, "overdub"),
        (5, "overdubLengthPolicy"),
    ] {
        put(&mut values, id, scalar(session.get(key)?)?)?;
    }
    let layers = session.get("layers")?.as_array()?;
    if layers.len() != 4 {
        return None;
    }
    for (index, layer) in layers.iter().enumerate() {
        let base = 16 + index as u32 * 8;
        fields(
            &mut values,
            layer,
            base,
            [
                (0, "volume"),
                (1, "speed"),
                (2, "muted"),
                (3, "playing"),
                (4, "position"),
            ],
        )?;
    }
    let source = rack.get("source")?;
    fields(
        &mut values,
        source,
        SYNTH_BASE,
        [
            (0, "waveform"),
            (2, "sampleRoot"),
            (3, "keytrack"),
            (4, "samplePitch"),
            (5, "pitchMode"),
            (6, "blendMode"),
            (7, "blendDepth"),
            (15, "output"),
            (16, "sampleStretch"),
            (19, "waveRender"),
        ],
    )?;
    put(
        &mut values,
        SYNTH_BASE + 1,
        (number(source.get("sampleBlend")?)? - 0.5) * 2.0,
    )?;
    put(
        &mut values,
        SYNTH_BASE + 20,
        number(source.get("sampleXfade")?)? / 100.0,
    )?;
    let adsr = rack.get("adsr")?;
    for (local, key, divisor) in [
        (11, "attack", 1000.0),
        (12, "decay", 1000.0),
        (13, "sustain", 100.0),
        (14, "release", 1000.0),
    ] {
        put(
            &mut values,
            SYNTH_BASE + local,
            number(adsr.get(key)?)? / divisor,
        )?;
    }
    fields(
        &mut values,
        rack.get("filter")?,
        SYNTH_BASE,
        [(21, "mode"), (22, "cutoff"), (23, "resonance")],
    )?;
    let eq = rack.get("eq")?;
    let bands = eq.get("bands")?.as_array()?;
    if bands.len() != 8 {
        return None;
    }
    for (index, band) in bands.iter().enumerate() {
        let base = SYNTH_BASE + 64 + index as u32 * 5;
        fields(
            &mut values,
            band,
            base,
            [
                (0, "enabled"),
                (1, "type"),
                (2, "freq"),
                (3, "gain"),
                (4, "q"),
            ],
        )?;
    }
    put(
        &mut values,
        SYNTH_BASE + 104,
        eq.get("output").and_then(number).unwrap_or(0.0),
    )?;
    put(
        &mut values,
        SYNTH_BASE + 105,
        eq.get("mix").and_then(number).unwrap_or(1.0),
    )?;
    for (index, name) in ["fx1", "fx2"].into_iter().enumerate() {
        let fx = rack.get(name)?;
        let base = SYNTH_BASE + 128 + index as u32 * 8;
        fields(&mut values, fx, base, [(0, "selected"), (1, "mix")])?;
        let selected = fx.get("selected")?.as_u64()? as usize;
        let parameters = fx
            .get("parameters")?
            .as_array()?
            .get(selected)?
            .as_array()?;
        for local in 0..5 {
            put(
                &mut values,
                base + 2 + local,
                parameters
                    .get(local as usize)
                    .and_then(number)
                    .unwrap_or(0.0),
            )?;
        }
    }
    let lfos = rack.get("lfos")?.as_array()?;
    let default: Value = serde_json::from_str(include_str!(
        "../../../projects/main-looper/default-session-v15.json"
    ))
    .ok()?;
    let default_lfo = &default["rack"]["lfos"][0];
    for slot in 0..4 {
        let base = LFO_BASE + slot * LFO_STRIDE;
        let active = lfos
            .iter()
            .find(|lfo| lfo["slot"].as_u64() == Some(slot as u64));
        let lfo = active.unwrap_or(default_lfo);
        fields(
            &mut values,
            lfo,
            base,
            [
                (0, "shape"),
                (1, "rate"),
                (2, "depth"),
                (3, "phase"),
                (4, "retrig"),
            ],
        )?;
        fields(
            &mut values,
            lfo.get("route")?,
            base,
            [
                (5, "source"),
                (6, "target"),
                (7, "amount"),
                (8, "bias"),
                (9, "mode"),
                (10, "enabled"),
            ],
        )?;
        if slot > 0 {
            put(&mut values, base + 11, active.is_some() as u8 as f32)?;
        }
    }
    fields(
        &mut values,
        rack.get("atv")?,
        ATV_BASE,
        [(0, "amount"), (1, "bias"), (2, "slot"), (3, "port")],
    )?;
    fields(
        &mut values,
        rack.get("slew")?,
        SLEW_BASE,
        [(0, "riseMs"), (1, "fallMs"), (2, "shape"), (3, "source")],
    )?;
    fields(
        &mut values,
        rack.get("sampleHold")?,
        SAMPLE_HOLD_BASE,
        [
            (0, "mode"),
            (1, "source"),
            (2, "triggerSource"),
            (3, "manualGate"),
            (4, "held"),
            (5, "triggerHigh"),
        ],
    )?;
    fields(
        &mut values,
        rack.get("compare")?,
        COMPARE_BASE,
        [
            (0, "direction"),
            (1, "threshold"),
            (2, "hysteresis"),
            (3, "source"),
            (4, "gate"),
            (5, "pulseRemaining"),
        ],
    )?;
    fields(
        &mut values,
        rack.get("cvMix")?,
        CV_MIX_BASE,
        [
            (0, "level1"),
            (1, "level2"),
            (2, "level3"),
            (3, "level4"),
            (4, "offset"),
            (5, "source1"),
            (6, "source2"),
            (7, "source3"),
            (8, "source4"),
        ],
    )?;
    fields(
        &mut values,
        rack.get("range")?,
        RANGE_BASE,
        [(0, "min"), (1, "max"), (2, "mode"), (3, "source")],
    )?;
    fields(
        &mut values,
        rack.get("scaleQuantizer")?,
        SCALE_QUANTIZER_BASE,
        [
            (0, "root"),
            (1, "scale"),
            (2, "direction"),
            (3, "connected"),
        ],
    )?;
    fields(
        &mut values,
        rack.get("transpose")?,
        TRANSPOSE_BASE,
        [(0, "semitones"), (1, "source"), (2, "connected")],
    )?;
    fields(
        &mut values,
        rack.get("noteFilter")?,
        NOTE_FILTER_BASE,
        [
            (0, "low"),
            (1, "high"),
            (2, "mode"),
            (3, "source"),
            (4, "connected"),
        ],
    )?;
    fields(
        &mut values,
        rack.get("velocityMapper")?,
        VELOCITY_MAPPER_BASE,
        [
            (0, "amount"),
            (1, "curve"),
            (2, "offset"),
            (3, "source"),
            (4, "connected"),
        ],
    )?;
    fields(
        &mut values,
        rack.get("arpeggiator")?,
        ARPEGGIATOR_BASE,
        [
            (0, "rate"),
            (1, "mode"),
            (2, "octaves"),
            (3, "gate"),
            (4, "hold"),
            (5, "connected"),
        ],
    )?;
    Some(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_default_and_native_save_supply_valid_values_for_every_host_id() {
        for bytes in [
            include_bytes!("../../../projects/main-looper/default-session-v15.json").as_slice(),
            include_bytes!("../../../web/public/main-native-saved-session.json").as_slice(),
        ] {
            let session: Value = serde_json::from_slice(bytes).unwrap();
            let values = values_from_session(&session).unwrap();
            for id in 0..MAIN_HOST_ID_CAPACITY as u32 {
                if MainParameter::spec(id).is_ok() {
                    assert!(
                        MainParameter::decode(id, values[id as usize]).is_ok(),
                        "ID {id}"
                    );
                }
            }
        }
    }
}
