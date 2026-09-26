//! Eight-band stereo EQ port of the legacy EQ8Node scalar path.

use std::f32::consts::PI;

pub const BAND_COUNT: usize = 8;
pub const PARAM_COUNT: usize = BAND_COUNT * 5 + 2;
pub fn defaults() -> [f32; PARAM_COUNT] {
    let mut values = [0.0; PARAM_COUNT];
    let mut band = 0;
    while band < BAND_COUNT {
        values[band * 5 + 1] = TYPES[band] as f32;
        values[band * 5 + 2] = FREQUENCIES[band];
        values[band * 5 + 4] = 1.0;
        band += 1;
    }
    values[41] = 1.0;
    values
}
const FREQUENCIES: [f32; BAND_COUNT] = [60.0, 120.0, 250.0, 500.0, 1000.0, 2500.0, 6000.0, 12000.0];
const TYPES: [u8; BAND_COUNT] = [1, 0, 0, 0, 0, 0, 0, 2];

#[derive(Clone, Copy, Default)]
struct Coeffs {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}
impl Coeffs {
    const IDENTITY: Self = Self {
        b0: 1.0,
        b1: 0.0,
        b2: 0.0,
        a1: 0.0,
        a2: 0.0,
    };
    fn normalized(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> Self {
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct State {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}
impl State {
    fn process(&mut self, x: f32, c: Coeffs) -> f32 {
        let y = c.b0 * x + c.b1 * self.x1 + c.b2 * self.x2 - c.a1 * self.y1 - c.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }
}

#[derive(Clone, Copy)]
struct Band {
    enabled: bool,
    kind: u8,
    freq: f32,
    gain: f32,
    q: f32,
}
impl Band {
    fn new(index: usize) -> Self {
        Self {
            enabled: false,
            kind: TYPES[index],
            freq: FREQUENCIES[index],
            gain: 0.0,
            q: 1.0,
        }
    }
    fn close_to(&self, other: &Self) -> bool {
        self.enabled == other.enabled
            && self.kind == other.kind
            && (self.freq - other.freq).abs() <= 0.5
            && (self.gain - other.gain).abs() <= 0.02
            && (self.q - other.q).abs() <= 0.01
    }
}

pub struct Eq8 {
    sample_rate: f32,
    smooth: f32,
    target: [Band; BAND_COUNT],
    current: [Band; BAND_COUNT],
    cached: [Band; BAND_COUNT],
    coeffs: [Coeffs; BAND_COUNT],
    state: [[State; BAND_COUNT]; 2],
    output_target: f32,
    output_db: f32,
    mix_target: f32,
    mix: f32,
}
impl Eq8 {
    pub fn new(sample_rate: f32, params: [f32; PARAM_COUNT]) -> Self {
        let bands = std::array::from_fn(Band::new);
        let mut eq = Self {
            sample_rate,
            smooth: ((1.0 - (-1.0 / (0.01 * sample_rate as f64)).exp()) as f32).clamp(0.0001, 1.0),
            target: bands,
            current: bands,
            cached: bands,
            coeffs: [Coeffs::IDENTITY; BAND_COUNT],
            state: [[State::default(); BAND_COUNT]; 2],
            output_target: 0.0,
            output_db: 0.0,
            mix_target: 1.0,
            mix: 1.0,
        };
        for (id, value) in params.into_iter().enumerate() {
            eq.set_parameter(id as u32, value);
        }
        eq.current = eq.target;
        eq.output_db = eq.output_target;
        eq.mix = eq.mix_target;
        eq.cached = std::array::from_fn(Band::new);
        for band in 0..BAND_COUNT {
            eq.coeffs[band] = eq.coefficients(eq.current[band]);
            eq.cached[band] = eq.current[band];
        }
        eq
    }
    pub fn set_parameter(&mut self, id: u32, value: f32) -> bool {
        if !value.is_finite() {
            return false;
        }
        match id as usize {
            0..40 => {
                let band = &mut self.target[id as usize / 5];
                match id % 5 {
                    0 => band.enabled = value >= 0.5,
                    1 => band.kind = value.round().clamp(0.0, 6.0) as u8,
                    2 => band.freq = value.clamp(20.0, 20000.0),
                    3 => band.gain = value.clamp(-24.0, 24.0),
                    _ => band.q = value.clamp(0.1, 24.0),
                }
            }
            40 => self.output_target = value.clamp(-24.0, 24.0),
            41 => self.mix_target = value.clamp(0.0, 1.0),
            _ => return false,
        }
        true
    }

    /// Current effective stereo response; coefficients are shared by both channels.
    pub fn response_db_at(&self, frequency: f32) -> Option<f32> {
        if !frequency.is_finite() || frequency <= 0.0 || frequency >= self.sample_rate * 0.5 {
            return None;
        }
        let angle = 2.0 * std::f64::consts::PI * frequency as f64 / self.sample_rate as f64;
        let (cos1, sin1) = (angle.cos(), angle.sin());
        let (cos2, sin2) = ((2.0 * angle).cos(), (2.0 * angle).sin());
        let (mut real, mut imag) = (1.0f64, 0.0f64);
        for band in 0..BAND_COUNT {
            if !self.current[band].enabled {
                continue;
            }
            let c = self.coeffs[band];
            let nr = c.b0 as f64 + c.b1 as f64 * cos1 + c.b2 as f64 * cos2;
            let ni = -(c.b1 as f64 * sin1 + c.b2 as f64 * sin2);
            let dr = 1.0 + c.a1 as f64 * cos1 + c.a2 as f64 * cos2;
            let di = -(c.a1 as f64 * sin1 + c.a2 as f64 * sin2);
            let denom = dr * dr + di * di;
            if denom <= 1e-24 {
                return None;
            }
            let br = (nr * dr + ni * di) / denom;
            let bi = (ni * dr - nr * di) / denom;
            (real, imag) = (real * br - imag * bi, real * bi + imag * br);
        }
        let gain = 10.0f64.powf(self.output_db as f64 / 20.0);
        real = (1.0 - self.mix as f64) + self.mix as f64 * gain * real;
        imag *= self.mix as f64 * gain;
        Some((20.0 * (real * real + imag * imag).sqrt().max(1e-6).log10()) as f32)
    }
    fn coefficients(&self, band: Band) -> Coeffs {
        let f = band
            .freq
            .clamp(20.0, (self.sample_rate * 0.45).clamp(40.0, 20000.0));
        let w0 = 2.0 * PI * f / self.sample_rate;
        let cos = w0.cos();
        let sin = w0.sin();
        let q = band.q.clamp(0.1, 24.0);
        let a = 10.0f32.powf(band.gain / 40.0);
        match band.kind {
            0 => {
                let alpha = sin / (2.0 * q);
                Coeffs::normalized(
                    1.0 + alpha * a,
                    -2.0 * cos,
                    1.0 - alpha * a,
                    1.0 + alpha / a,
                    -2.0 * cos,
                    1.0 - alpha / a,
                )
            }
            1 => {
                let alpha = sin / 2.0 * a.sqrt();
                Coeffs::normalized(
                    a * ((a + 1.0) - (a - 1.0) * cos + 2.0 * alpha),
                    2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
                    a * ((a + 1.0) - (a - 1.0) * cos - 2.0 * alpha),
                    (a + 1.0) + (a - 1.0) * cos + 2.0 * alpha,
                    -2.0 * ((a - 1.0) + (a + 1.0) * cos),
                    (a + 1.0) + (a - 1.0) * cos - 2.0 * alpha,
                )
            }
            2 => {
                let alpha = sin / 2.0 * a.sqrt();
                Coeffs::normalized(
                    a * ((a + 1.0) + (a - 1.0) * cos + 2.0 * alpha),
                    -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
                    a * ((a + 1.0) + (a - 1.0) * cos - 2.0 * alpha),
                    (a + 1.0) - (a - 1.0) * cos + 2.0 * alpha,
                    2.0 * ((a - 1.0) - (a + 1.0) * cos),
                    (a + 1.0) - (a - 1.0) * cos - 2.0 * alpha,
                )
            }
            kind => {
                let alpha = sin / (2.0 * q);
                let (b0, b1, b2) = match kind {
                    3 => ((1.0 - cos) * 0.5, 1.0 - cos, (1.0 - cos) * 0.5),
                    4 => ((1.0 + cos) * 0.5, -(1.0 + cos), (1.0 + cos) * 0.5),
                    5 => (1.0, -2.0 * cos, 1.0),
                    _ => (alpha, 0.0, -alpha),
                };
                Coeffs::normalized(b0, b1, b2, 1.0 + alpha, -2.0 * cos, 1.0 - alpha)
            }
        }
    }
    pub fn process_planar(&mut self, input: [&[f32]; 2], output: [&mut [f32]; 2]) {
        let [in_l, in_r] = input;
        let [out_l, out_r] = output;
        if self.mix_target <= 1e-4 && self.mix <= 1e-4 {
            out_l.copy_from_slice(in_l);
            out_r.copy_from_slice(in_r);
            return;
        }
        for i in 0..in_l.len() {
            for band in 0..BAND_COUNT {
                let t = self.target[band];
                let c = &mut self.current[band];
                c.enabled = t.enabled;
                c.kind = t.kind;
                c.freq += (t.freq - c.freq) * self.smooth;
                c.gain += (t.gain - c.gain) * self.smooth;
                c.q += (t.q - c.q) * self.smooth;
                let current = *c;
                if !current.close_to(&self.cached[band]) {
                    self.coeffs[band] = self.coefficients(current);
                    self.cached[band] = current;
                }
            }
            self.output_db += (self.output_target - self.output_db) * self.smooth;
            self.mix += (self.mix_target - self.mix) * self.smooth;
            let gain = 10.0f32.powf(self.output_db / 20.0);
            for (channel, (dry, out)) in [(in_l[i], &mut out_l[i]), (in_r[i], &mut out_r[i])]
                .into_iter()
                .enumerate()
            {
                let mut x = dry;
                for band in 0..BAND_COUNT {
                    if self.current[band].enabled {
                        x = self.state[channel][band].process(x, self.coeffs[band]);
                    }
                }
                *out = dry * (1.0 - self.mix) + x * gain * self.mix;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn disabled_bands_pass_stereo_and_enabled_band_changes_one_frequency() {
        let mut eq = Eq8::new(48000.0, defaults());
        let mut l = [0.0; 512];
        let mut r = [0.0; 512];
        l[0] = 1.0;
        r[1] = 0.5;
        let mut ol = [0.0; 512];
        let mut or = [0.0; 512];
        eq.process_planar([&l, &r], [&mut ol, &mut or]);
        assert_eq!(ol, l);
        assert_eq!(or, r);
        eq.set_parameter(0, 1.0);
        eq.set_parameter(1, 3.0);
        eq.set_parameter(2, 2000.0);
        eq.process_planar([&l, &r], [&mut ol, &mut or]);
        assert_ne!(ol, l);
        assert_ne!(or, r);
        assert!(ol.iter().chain(or.iter()).all(|x| x.is_finite()));
    }

    #[test]
    fn response_query_tracks_enabled_low_shelf_and_mix() {
        let mut eq = Eq8::new(48_000.0, defaults());
        assert!(eq.response_db_at(100.0).unwrap().abs() < 1e-5);
        eq.set_parameter(0, 1.0);
        eq.set_parameter(2, 150.0);
        eq.set_parameter(3, 12.0);
        let zero = [0.0; 1024];
        let mut left = [0.0; 1024];
        let mut right = [0.0; 1024];
        eq.process_planar([&zero, &zero], [&mut left, &mut right]);
        assert!(eq.response_db_at(40.0).unwrap() > eq.response_db_at(8000.0).unwrap() + 5.0);
        eq.set_parameter(41, 0.0);
        for _ in 0..8 {
            eq.process_planar([&zero, &zero], [&mut left, &mut right]);
        }
        assert!(eq.response_db_at(40.0).unwrap().abs() < 0.01);
        assert_eq!(eq.response_db_at(30_000.0), None);
    }
}
