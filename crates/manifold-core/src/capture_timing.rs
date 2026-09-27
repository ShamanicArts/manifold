//! Frame decisions used by the old sample-synth capture control path.
//! Hosts supply transport timing; the audio graph receives a bounded frame count.

/// The original host prefers its `samplesPerBar` value and otherwise assumes
/// four quarter-note beats per bar at the supplied tempo.
pub fn samples_per_bar(host_value: Option<f64>, sample_rate: f64, tempo_bpm: f64) -> Option<f64> {
    if let Some(value) = host_value.filter(|value| value.is_finite() && *value > 0.0) {
        return Some(value);
    }
    if !sample_rate.is_finite() || !tempo_bpm.is_finite() {
        return None;
    }
    let rate = if sample_rate > 0.0 {
        sample_rate
    } else {
        44_100.0
    };
    let tempo = if tempo_bpm > 0.0 { tempo_bpm } else { 120.0 };
    Some(rate * 240.0 / tempo)
}

/// `sample_synth.lua` rounds retrospective bars to the nearest frame, with a
/// minimum of one. Its public bar setting is clamped to 1/16–16 bars.
pub fn retrospective_frames(samples_per_bar: f64, bars: f64) -> Option<u32> {
    if !samples_per_bar.is_finite() || samples_per_bar <= 0.0 || !bars.is_finite() {
        return None;
    }
    let frames = (samples_per_bar * bars.clamp(0.0625, 16.0) + 0.5)
        .floor()
        .max(1.0);
    (frames <= u32::MAX as f64).then_some(frames as u32)
}

/// The free-mode request measures one span between offsets in a circular ring.
/// Equal offsets produce one frame, as in the original Lua request builder.
pub fn free_frames_from_offsets(start: i64, end: i64, capacity: u32) -> Option<u32> {
    if capacity == 0 {
        return None;
    }
    let mut duration = end.max(0).saturating_sub(start.max(0));
    if duration < 0 {
        duration = duration.saturating_add(i64::from(capacity));
    }
    u32::try_from(duration.max(1)).ok()
}

/// A negative manual start offset means "this many frames back" in the old
/// control path. Zero instead arms free capture.
pub fn manual_negative_offset_frames(offset: i64) -> Option<u32> {
    (offset < 0)
        .then(|| u32::try_from(offset.unsigned_abs()).ok())
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_transport_fallback_and_bar_rounding() {
        assert_eq!(
            samples_per_bar(Some(48_000.0), 48_000.0, 120.0),
            Some(48_000.0)
        );
        assert_eq!(samples_per_bar(None, 48_000.0, 120.0), Some(96_000.0));
        assert_eq!(
            samples_per_bar(None, 48_000.0, 95.0),
            Some(48_000.0 * 240.0 / 95.0)
        );
        assert_eq!(retrospective_frames(48_000.0, 1.0), Some(48_000));
        assert_eq!(retrospective_frames(96_000.0, 0.0625), Some(6_000));
        assert_eq!(retrospective_frames(10.0, 0.25), Some(3));
        assert_eq!(retrospective_frames(96_000.0, 17.0), Some(1_536_000));
    }

    #[test]
    fn old_lua_free_capture_trace() {
        // Main/ui/tests/test_sample_synth_capture.lua: start/stop, equal, wrap.
        assert_eq!(free_frames_from_offsets(12, 37, 100), Some(25));
        assert_eq!(free_frames_from_offsets(50, 50, 100), Some(1));
        assert_eq!(free_frames_from_offsets(98, 5, 100), Some(7));
        assert_eq!(manual_negative_offset_frames(-48), Some(48));
        assert_eq!(manual_negative_offset_frames(0), None);
    }
}
