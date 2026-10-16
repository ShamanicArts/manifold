#!/usr/bin/env python3
"""Generate native Rust FFT audio and meter captures for Wasm comparison."""
import hashlib
import json
import math
from pathlib import Path
import random
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'web/public/reference/fft-spectrum'
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(['cargo', 'build', '-p', 'manifold-core', '--example', 'render_fft_spectrum'], cwd=ROOT, check=True)
runner = ROOT / 'target/debug/examples/render_fft_spectrum'
sources = [ROOT / name for name in [
    'crates/manifold-core/src/fft_spectrum.rs', 'crates/manifold-core/src/graph.rs',
    'crates/manifold-core/examples/render_fft_spectrum.rs', 'projects/fft-spectrum/project.json',
]]
source_hash = hashlib.sha256(b''.join(path.read_bytes() for path in sources)).hexdigest()
frames, rate, step = 16384, 48000, 8192
rng = random.Random(31)
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        frequency = 440 if frame < step else 1000
        left = .42 * math.sin(2 * math.pi * frequency * frame / rate)
        right = .28 * math.sin(2 * math.pi * frequency * frame / rate + .3)
        if 4096 <= frame < 6144:
            left += .08 * (rng.random() * 2 - 1)
            right += .08 * (rng.random() * 2 - 1)
        if frame in (0, 4096, step): left += .5
        output.write(struct.pack('<ff', left, right))

specs = [
    ('default', '440 Hz to 1 kHz', [.45, -72], [.45, -72], 128),
    ('unsmoothed', 'Instant bands', [0, -72], [0, -72], 128),
    ('floor-change', 'Raise floor and smoothing', [.2, -90], [.8, -36], 128),
    ('small-block', '64-frame blocks', [.5, -72], [.15, -60], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    audio, meter = f'{case_id}.f32', f'{case_id}-meters.f32'
    subprocess.run([str(value) for value in [runner, OUT / 'input.f32', OUT / audio, OUT / meter,
                    rate, block, frames, step, *before, *after]], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after,
                  'blockSize': block, 'output': audio, 'meterOutput': meter})
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'native Rust 2048-point FFT, 32 log bands and peak Hz',
    'sourceSha256': source_hash, 'sampleRate': rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} native Rust FFT cases to {OUT}')
