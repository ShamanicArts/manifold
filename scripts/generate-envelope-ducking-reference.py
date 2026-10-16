#!/usr/bin/env python3
"""Native Rust fixtures for an authored follower-to-gain CV graph."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'web/public/reference/envelope-ducking'
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(['cargo', 'build', '-p', 'manifold-core', '--example', 'render_envelope_ducking'], cwd=ROOT, check=True)
runner = ROOT / 'target/debug/examples/render_envelope_ducking'
sources = [ROOT / path for path in [
    'crates/manifold-core/src/graph.rs', 'crates/manifold-core/src/envelope_follower.rs',
    'projects/envelope-ducking/project.json', 'crates/manifold-core/examples/render_envelope_ducking.rs',
]]
source_hash = hashlib.sha256(b''.join(path.read_bytes() for path in sources)).hexdigest()
frames = 8192
sample_rate = 48000
step = 4096
with (OUT / 'input.f32').open('wb') as target:
    for frame in range(frames):
        level = .2 if frame < 2048 else .75 if frame < 4096 else .45 if frame < 6144 else .85
        left = level * math.sin(2 * math.pi * 165 * frame / sample_rate)
        right = level * .72 * math.sin(2 * math.pi * 275 * frame / sample_rate + .4)
        target.write(struct.pack('<ff', left, right))
specs = [
    ('default', 'Peak ducking', [10, 120, 4, 80, 0, 1, -1.5], [10, 120, 4, 80, 0, 1, -1.5], 128),
    ('rms', 'RMS ducking', [10, 120, 4, 80, 1, 1, -1.5], [10, 120, 4, 80, 1, 1, -1.5], 128),
    ('hybrid', 'Hybrid ducking', [10, 120, 4, 80, 2, 1, -1.5], [10, 120, 4, 80, 2, 1, -1.5], 128),
    ('dry', 'Zero duck depth', [10, 120, 4, 80, 0, 1, 0], [10, 120, 4, 80, 0, 1, 0], 128),
    ('sweep', 'Detector and depth sweep', [20, 200, 2, 40, 0, 1, -.4], [2, 30, 6, 600, 1, .8, -1.9], 128),
    ('small-block', '64-frame blocks', [4, 40, 5, 100, 2, 1, -1.2], [8, 80, 3, 300, 0, 1.2, -.8], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    audio = f'{case_id}.f32'
    meter = f'{case_id}-meters.f32'
    args = [OUT / 'input.f32', OUT / audio, OUT / meter, sample_rate, block, step, frames, *before, *after]
    subprocess.run([runner, *(str(value) for value in args)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after, 'blockSize': block, 'output': audio, 'meterOutput': meter})
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'native Rust sample-rate envelope ducking graph',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} native Rust envelope ducking cases to {OUT}')
