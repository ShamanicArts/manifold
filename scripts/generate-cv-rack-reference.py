#!/usr/bin/env python3
"""Native Rust captures for the typed sample-hold/attenuverter/CV-mix rack slice."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'web/public/reference/cv-rack'
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(['cargo', 'build', '-p', 'manifold-core', '--example', 'render_cv_rack'], cwd=ROOT, check=True)
runner = ROOT / 'target/debug/examples/render_cv_rack'
sources = [ROOT / name for name in [
    'crates/manifold-core/src/graph.rs', 'crates/manifold-core/src/cv_utilities.rs',
    'crates/manifold-core/src/lfo.rs', 'projects/cv-rack/project.json',
    'crates/manifold-core/examples/render_cv_rack.rs',
]]
source_hash = hashlib.sha256(b''.join(path.read_bytes() for path in sources)).hexdigest()
default = [0, 2, 8, -.7, .1, .8, .25, .1, .6, .5]
specs = [
    ('sample', 'Capture at trigger edges', default, default, 128),
    ('track', 'Track while trigger is high', [1, *default[1:]], [1, *default[1:]], 128),
    ('quantized', 'Twelve-step sample', [2, *default[1:]], [2, *default[1:]], 128),
    ('mode-change', 'Sample to track', default, [1, 4, 12, -.7, .1, .8, .25, .1, .6, .5], 128),
    ('invert-bias', 'Invert and bias sweep', default, [0, 2, 8, .8, -.25, .8, .25, .1, .6, .5], 128),
    ('mix-polarity', 'Blend and depth polarity', [0, 2, 8, -.7, .1, 0, 1, -.2, .6, .5], [0, 2, 8, -.7, .1, 1, 0, .3, .6, -.7], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    audio = f'{case_id}.f32'
    meters = f'{case_id}-meters.f32'
    subprocess.run([runner, OUT / audio, OUT / meters, ','.join(map(str, before)), ','.join(map(str, after)), str(block)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after, 'blockSize': block, 'output': audio, 'meterOutput': meters})
(OUT / 'input.f32').write_bytes(bytes(24576 * 2 * 4))
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'native Rust Main-rack typed CV chain',
    'sourceSha256': source_hash, 'sampleRate': 48000, 'channels': 2,
    'frames': 24576, 'stepFrame': 12288, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} native Rust CV-rack cases to {OUT}')
