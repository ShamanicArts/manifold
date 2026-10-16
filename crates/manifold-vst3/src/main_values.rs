//! VST3's 0–1 parameter values mapped to Main's authored physical host IDs.
//! The CLAP and browser contracts use the physical value directly.

use manifold_native::main_host_parameters::{
    LFO_BASE, LFO_STRIDE, MainParameter, MainParameterSpec,
};

const SPARSE_LFO_ROUTE: [f32; 5] = [0.0, 22.0, 23.0, 129.0, 137.0];

fn sparse_route(id: u32) -> bool {
    id >= LFO_BASE && (id - LFO_BASE) / LFO_STRIDE < 4 && (id - LFO_BASE) % LFO_STRIDE == 6
}

fn steps(id: u32, spec: MainParameterSpec) -> f64 {
    if sparse_route(id) {
        (SPARSE_LFO_ROUTE.len() - 1) as f64
    } else {
        (spec.max - spec.min) as f64
    }
}

pub(crate) fn step_count(id: u32) -> Option<i32> {
    let spec = MainParameter::spec(id).ok()?;
    Some(if spec.discrete {
        steps(id, spec) as i32
    } else {
        0
    })
}

pub(crate) fn plain_to_normalized(id: u32, plain: f32) -> Option<f64> {
    MainParameter::decode(id, plain).ok()?;
    let spec = MainParameter::spec(id).ok()?;
    if sparse_route(id) {
        let index = SPARSE_LFO_ROUTE
            .iter()
            .position(|choice| *choice == plain)?;
        Some(index as f64 / steps(id, spec))
    } else {
        Some(((plain - spec.min) as f64 / (spec.max - spec.min) as f64).clamp(0.0, 1.0))
    }
}

pub(crate) fn normalized_to_plain(id: u32, normalized: f64) -> Option<f32> {
    if !normalized.is_finite() || !(0.0..=1.0).contains(&normalized) {
        return None;
    }
    let spec = MainParameter::spec(id).ok()?;
    let plain = if sparse_route(id) {
        SPARSE_LFO_ROUTE[(normalized * steps(id, spec)).round() as usize]
    } else if spec.discrete {
        spec.min + (normalized * steps(id, spec)).round() as f32
    } else {
        spec.min + (normalized * (spec.max - spec.min) as f64) as f32
    };
    MainParameter::decode(id, plain).ok()?;
    Some(plain)
}

#[cfg(test)]
mod tests {
    use super::*;
    use manifold_native::main_host_parameters::{LAYER_BASE, SYNTH_BASE};

    #[test]
    fn main_host_values_roundtrip_through_vst3_normalization() {
        for (id, plain) in [
            (LAYER_BASE + 1, -2.5), // signed loop speed
            (SYNTH_BASE + 0, 3.0),  // Source selector
            (SYNTH_BASE + 7, 0.75), // Source blend
            (LFO_BASE + 6, 129.0),  // sparse route enum
        ] {
            let normalized = plain_to_normalized(id, plain).unwrap();
            let decoded = normalized_to_plain(id, normalized).unwrap();
            assert!((decoded - plain).abs() < 1e-5, "id {id}");
        }
        assert_eq!(step_count(LFO_BASE + 6), Some(4));
        assert_eq!(normalized_to_plain(LFO_BASE + 6, 0.75), Some(129.0));
        assert_eq!(plain_to_normalized(LFO_BASE + 6, 24.0), None);
        assert_eq!(normalized_to_plain(LFO_BASE + 6, f64::NAN), None);
    }

    #[test]
    fn every_main_vst3_parameter_decodes_at_normalized_endpoints() {
        for id in 0..manifold_native::main_host_parameters::MAIN_HOST_ID_CAPACITY as u32 {
            if MainParameter::spec(id).is_err() {
                continue;
            }
            for normalized in [0.0, 0.5, 1.0] {
                let plain = normalized_to_plain(id, normalized)
                    .unwrap_or_else(|| panic!("id {id}, normalized {normalized}"));
                assert!(plain_to_normalized(id, plain).is_some(), "id {id}");
            }
        }
    }
}
