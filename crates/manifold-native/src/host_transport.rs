//! A small, atomic transport snapshot for native editor requests.
//! The audio callback publishes one derived bar length; control threads only read it.

use std::sync::atomic::{AtomicU64, Ordering};

use manifold_core::capture_timing::{retrospective_frames, samples_per_bar_at_meter};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CaptureWindow {
    Seconds(f64),
    Free,
    Bars {
        bars: f64,
        tempo_bpm: f64,
        numerator: i32,
        denominator: i32,
    },
}

pub struct HostBarClock {
    generation: AtomicU64,
    samples_per_bar_bits: AtomicU64,
    tempo_bits: AtomicU64,
    meter: AtomicU64,
}

impl Default for HostBarClock {
    fn default() -> Self {
        Self::new()
    }
}

impl HostBarClock {
    pub const fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
            samples_per_bar_bits: AtomicU64::new(0),
            tempo_bits: AtomicU64::new(0),
            meter: AtomicU64::new(0),
        }
    }

    /// Called once per host block. A missing or invalid timing field makes bar
    /// capture unavailable rather than silently substituting a manual tempo.
    pub fn publish(&self, sample_rate: f64, tempo_bpm: f64, numerator: i32, denominator: i32) {
        let valid = sample_rate.is_finite()
            && sample_rate > 0.0
            && tempo_bpm.is_finite()
            && (20.0..=300.0).contains(&tempo_bpm)
            && (1..=128).contains(&numerator)
            && (1..=128).contains(&denominator);
        let value = if valid {
            samples_per_bar_at_meter(sample_rate, tempo_bpm, numerator as u32, denominator as u32)
                .unwrap_or(0.0)
        } else {
            0.0
        };
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.samples_per_bar_bits.store(
            if value.is_finite() && value > 0.0 {
                value.to_bits()
            } else {
                0
            },
            Ordering::Relaxed,
        );
        self.tempo_bits
            .store(tempo_bpm.to_bits(), Ordering::Relaxed);
        self.meter.store(
            ((numerator as u64) << 32) | denominator as u32 as u64,
            Ordering::Relaxed,
        );
        self.generation.fetch_add(1, Ordering::Release);
    }

    pub fn clear(&self) {
        self.generation.fetch_add(1, Ordering::AcqRel);
        self.samples_per_bar_bits.store(0, Ordering::Release);
        self.generation.fetch_add(1, Ordering::Release);
    }

    pub fn window(&self, bars: f64, capacity: usize) -> Option<(usize, CaptureWindow)> {
        if !(0.0625..=16.0).contains(&bars) || !bars.is_finite() {
            return None;
        }
        let (value, tempo_bpm, meter) = (0..4).find_map(|_| {
            let before = self.generation.load(Ordering::Acquire);
            if before & 1 != 0 {
                return None;
            }
            let value = self.samples_per_bar_bits.load(Ordering::Relaxed);
            let tempo = self.tempo_bits.load(Ordering::Relaxed);
            let meter = self.meter.load(Ordering::Relaxed);
            (before == self.generation.load(Ordering::Acquire)).then_some((
                f64::from_bits(value),
                f64::from_bits(tempo),
                meter,
            ))
        })?;
        let frames = retrospective_frames(value, bars)? as usize;
        let numerator = (meter >> 32) as i32;
        let denominator = meter as u32 as i32;
        (frames <= capacity).then_some((
            frames,
            CaptureWindow::Bars {
                bars,
                tempo_bpm,
                numerator,
                denominator,
            },
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_meter_and_tempo_define_a_bounded_window() {
        let clock = HostBarClock::new();
        assert_eq!(clock.window(1.0, 1_440_000), None);
        clock.publish(48_000.0, 90.0, 3, 4);
        assert_eq!(
            clock.window(0.5, 1_440_000),
            Some((
                48_000,
                CaptureWindow::Bars {
                    bars: 0.5,
                    tempo_bpm: 90.0,
                    numerator: 3,
                    denominator: 4,
                }
            ))
        );
        assert_eq!(clock.window(2.0, 48_000), None);
        clock.publish(48_000.0, 120.0, 7, 8);
        assert_eq!(
            clock.window(1.0, 1_440_000).map(|window| window.0),
            Some(84_000)
        );
        clock.clear();
        assert_eq!(clock.window(1.0, 1_440_000), None);
    }
}
