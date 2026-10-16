// Visual sampling port of Main/lib/ui/oscillator_preview.lua. This produces
// drawing points only. The authored Rust oscillator remains the audio processor.
const previewClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const previewFract = (v) => v - Math.floor(v);
export function oscillatorPreviewWave(type, p, width) {
  p = previewFract(p);
  switch (type) {
    case 0:
      return Math.sin(p * 2 * Math.PI);
    case 1:
      return 2 * p - 1;
    case 2:
      return p < 0.5 ? 1 : -1;
    case 3:
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    case 4:
      return (2 * p - 1 + Math.sin(p * 2 * Math.PI)) * 0.5;
    case 5:
      return (previewFract(Math.sin(p * 43758.5453)) * 2 - 1) * 0.5;
    case 6:
      return p < width ? 1 : -1;
    case 7:
      return (
        (2 * p -
          1 +
          (2 * previewFract(p * 1.01) - 1) * 0.5 +
          (2 * previewFract(p * 0.99) - 1) * 0.5) *
        0.5
      );
  }
  return 0;
}
export function oscillatorPreviewRecipe(type, width) {
  const out = [],
    add = (ratio, amplitude, phase = 0) => {
      if (amplitude > 1e-6 && out.length < 12) out.push({ ratio, amplitude, phase });
    };
  if (type === 0) add(1, 1);
  else if (type === 1 || type === 4)
    for (let h = 1; h <= 12; h++) add(h, type === 1 ? 1 / h : (h === 1 ? 0.45 : 0) + 0.55 / h);
  else if (type === 2 || type === 3)
    for (let i = 0; i < 12; i++) {
      const h = 2 * i + 1;
      add(h, type === 2 ? 1 / h : 1 / (h * h), type === 2 ? 0 : (i % 2 ? 1 : -1) * Math.PI * 0.5);
    }
  else if (type === 5) {
    const r = [1, 1.37, 1.93, 2.58, 3.11, 3.93, 5.17, 6.44, 8.13, 10.37, 13.11, 16.51],
      a = [1, 0.91, 0.82, 0.74, 0.67, 0.6, 0.52, 0.45, 0.38, 0.31, 0.25, 0.2],
      p = [0, 0.63, 1.42, 2.17, 0.88, 2.74, 1.11, 2.49, 0.37, 1.96, 2.81, 0.94];
    r.forEach((v, i) => add(v, a[i], p[i]));
  } else if (type === 6)
    for (let h = 1; h <= 12; h++) {
      const c = Math.sin(Math.PI * h * width);
      add(h, Math.abs(c) / h, c < 0 ? Math.PI : 0);
    }
  else if (type === 7) {
    const d = [-18, -7, 0, 8, 19],
      g = [0.55, 0.82, 1, 0.79, 0.5],
      p = [0.17, 0.51, 0, 0.33, 0.74];
    d.forEach((v, i) => add(2 ** (v / 1200), g[i], p[i]));
  }
  return out;
}
export function oscillatorPreviewDrive(x, drive, shape, bias) {
  const clip = (v) => previewClamp(v, -1, 1);
  if (drive <= 0.0001) return clip(x);
  const transfer = (value) => {
    if (shape === 1) {
      const g = 1 + drive * 1.35;
      return Math.atan(value * g) / Math.atan(g);
    }
    if (shape === 2) return clip(value * (1 + drive * 1.2));
    if (shape === 3) {
      let v = previewClamp(value * (1 + drive * 1.1), -32, 32);
      while (v > 1 || v < -1) v = v > 1 ? 2 - v : -2 - v;
      return v;
    }
    const g = 1 + drive * 0.85;
    return Math.tanh(value * g) / Math.tanh(g);
  };
  const offset = bias * 0.75,
    center = transfer(offset),
    normal = Math.max(
      1e-6,
      Math.abs(transfer(1 + offset) - center),
      Math.abs(transfer(-1 + offset) - center),
    );
  return clip((transfer(x + offset) - center) / normal);
}
export function oscillatorPreviewCurves(controls) {
  const type = controls.waveform ?? 1,
    width = controls.pulseWidth ?? 0.5,
    add = controls.renderMode === 1;
  const recipe = oscillatorPreviewRecipe(type, width).slice(
    0,
    Math.max(1, Math.round(controls.additivePartials ?? 8)),
  );
  const tilt = controls.additiveTilt ?? 0,
    drift = controls.additiveDrift ?? 0;
  const partials = recipe.map((p) => ({
    ratio: Math.max(
      0.1,
      p.ratio *
        (1 + Math.sin(p.ratio * 2.173 + type * 0.53) * drift * 0.035 * (1 + p.ratio * 0.05)),
    ),
    phase: p.phase + Math.sin(p.ratio * 1.618 + type * 0.37) * drift * 0.85,
    amp: p.amplitude * Math.max(0.12, p.ratio ** (tilt * 0.85)),
  }));
  const sum = partials.reduce((s, p) => s + p.amp, 0),
    trim = [1, 0.96, 0.98, 1.06, 0.94, 0.78, 1, 0.84][type];
  const shape = (x) =>
    oscillatorPreviewDrive(
      x,
      controls.drive ?? 0,
      controls.driveShape ?? 0,
      controls.driveBias ?? 0,
    );
  const count = add ? 96 : 200,
    wave = Array.from({ length: count + 1 }, (_, i) => {
      const x = i / count;
      const sample = add
        ? sum > 1e-6
          ? (partials.reduce(
              (s, p) => s + Math.sin(2 * Math.PI * x * p.ratio + p.phase) * p.amp,
              0,
            ) /
              sum) *
            trim
          : 0
        : oscillatorPreviewWave(type, x, width);
      return [x, 0.5 - shape(sample) * 0.425];
    });
  const drive = Array.from({ length: 129 }, (_, i) => [i / 128, 0.5 - shape(i / 64 - 1) * 0.5]);
  return {
    wave,
    drive,
    color: ['#7dd3fc', '#38bdf8', '#22d3ee', '#2dd4bf', '#a78bfa', '#94a3b8', '#f472b6', '#fbbf24'][
      type
    ],
    label:
      ['SINE', 'SAW', 'SQUARE', 'TRIANGLE', 'BLEND', 'NOISE', 'PULSE', 'SUPERSAW'][type] +
      (add ? ' ADD' : '') +
      ' MODE',
  };
}
