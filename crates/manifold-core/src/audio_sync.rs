//! Stereo audio sync from the historical AudioSync primitive. A positive
//! crossing on the second bus restarts replay of the recorded carrier cycle.

pub const PARAM_COUNT: usize = 2;
pub const DEFAULTS: [f32; PARAM_COUNT] = [0.0, 0.0];

pub fn set_value(params: &mut [f32; PARAM_COUNT], id: u32, value: f32) -> bool {
    if !value.is_finite() || id as usize >= PARAM_COUNT {
        return false;
    }
    params[id as usize] = value.clamp(0.0, 1.0);
    true
}

pub struct AudioSync {
    target: [f32; PARAM_COUNT],
    current: [f32; PARAM_COUNT],
    smooth: f32,
    history: [Vec<f32>; 2],
    write: usize,
    since_trigger: usize,
    period: usize,
    cycle: usize,
    previous_sync: f32,
}

impl AudioSync {
    pub fn new(sample_rate: f32, max_frames: usize, params: [f32; PARAM_COUNT]) -> Self {
        let sample_rate = if sample_rate > 1.0 {
            sample_rate
        } else {
            44_100.0
        };
        let size = 4096.max((sample_rate * 0.1).ceil() as usize + max_frames.max(4) + 8);
        let mut target = DEFAULTS;
        for (id, value) in params.into_iter().enumerate() {
            set_value(&mut target, id as u32, value);
        }
        Self {
            target,
            current: target,
            smooth: (1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp() as f32).clamp(0.0001, 1.0),
            history: [vec![0.0; size], vec![0.0; size]],
            write: 0,
            since_trigger: 0,
            period: 128,
            cycle: 0,
            previous_sync: 0.0,
        }
    }

    pub fn reset(&mut self) {
        self.write = 0;
        self.since_trigger = 0;
        self.period = 128;
        self.cycle = 0;
        self.previous_sync = 0.0;
        self.current = self.target;
        for channel in &mut self.history {
            channel.fill(0.0);
        }
    }

    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        set_value(&mut self.target, id, value)
    }

    pub fn process_planar(
        &mut self,
        input: [&[f32]; 2],
        sync: Option<[&[f32]; 2]>,
        output: [&mut [f32]; 2],
    ) {
        let size = self.history[0].len();
        let [left, right] = output;
        for frame in 0..left.len() {
            for id in 0..PARAM_COUNT {
                self.current[id] += (self.target[id] - self.current[id]) * self.smooth;
            }
            let in_l = input[0][frame];
            let in_r = input[1][frame];
            self.history[0][self.write] = in_l;
            self.history[1][self.write] = in_r;
            let trigger_sample = sync
                .as_ref()
                .map_or(0.0, |bus| 0.5 * (bus[0][frame] + bus[1][frame]));
            let trigger = sync.is_some() && self.previous_sync <= 0.0 && trigger_sample > 0.0;
            self.previous_sync = trigger_sample;
            if trigger {
                if self.since_trigger > 1 {
                    self.period = self.since_trigger.clamp(8, size - 4);
                }
                self.since_trigger = 0;
                self.cycle = 0;
            }
            let (replay_l, replay_r) = if sync.is_some() && self.period > 1 {
                let index = (self.write as isize - self.period as isize
                    + (self.cycle % self.period) as isize)
                    .rem_euclid(size as isize) as usize;
                (self.history[0][index], self.history[1][index])
            } else {
                (in_l, in_r)
            };
            let wet_l = in_l + (replay_l - in_l) * self.current[0];
            let wet_r = in_r + (replay_r - in_r) * self.current[0];
            left[frame] = in_l * (1.0 - self.current[1]) + wet_l * self.current[1];
            right[frame] = in_r * (1.0 - self.current[1]) + wet_r * self.current[1];
            self.since_trigger = self.since_trigger.saturating_add(1);
            self.cycle = (self.cycle + 1) % self.period.max(1);
            self.write = (self.write + 1) % size;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crossings_restart_carrier_replay_and_zero_hardness_passes_through() {
        let carrier: Vec<f32> = (0..256).map(|frame| (frame as f32 / 20.0).sin()).collect();
        let sync: Vec<f32> = (0..256)
            .map(|frame| if frame % 32 < 16 { -1.0 } else { 1.0 })
            .collect();
        let mut node = AudioSync::new(48_000.0, 256, [1.0, 1.0]);
        let mut left = [0.0; 256];
        let mut right = [0.0; 256];
        node.process_planar(
            [&carrier, &carrier],
            Some([&sync, &sync]),
            [&mut left, &mut right],
        );
        assert!(left.iter().zip(&carrier).any(|(a, b)| (a - b).abs() > 0.1));
        let mut dry = AudioSync::new(48_000.0, 256, [0.0, 1.0]);
        dry.process_planar(
            [&carrier, &carrier],
            Some([&sync, &sync]),
            [&mut left, &mut right],
        );
        assert_eq!(left.as_slice(), carrier.as_slice());
    }
}
