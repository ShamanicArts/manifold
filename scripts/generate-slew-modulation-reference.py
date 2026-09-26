#!/usr/bin/env python3
"""Render native Rust typed-CV slew modulation cases."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'web/public/reference/slew-modulation'
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(['cargo', 'build', '-p', 'manifold-core', '--example', 'render_slew_modulation'], cwd=ROOT, check=True)
runner = ROOT / 'target/debug/examples/render_slew_modulation'
sources = [ROOT / name for name in [
    'crates/manifold-core/src/graph.rs', 'crates/manifold-core/src/slew_limiter.rs',
    'crates/manifold-core/src/lfo.rs', 'projects/slew-modulation/project.json',
    'crates/manifold-core/examples/render_slew_modulation.rs',
]]
source_hash = hashlib.sha256(b''.join(path.read_bytes() for path in sources)).hexdigest()
specs = [
    ('direct', 'Direct square CV', 2, 8, 8, 1, 1, 1, 1, .5, .5, 128),
    ('slow', 'Rounded square CV', 2, 8, 8, 1200, 1200, 1200, 1200, .5, .5, 128),
    ('asymmetric', 'Fast rise, slow fall', 2, 8, 8, 60, 60, 1600, 1600, .5, .5, 128),
    ('change', 'Slide and depth change', 2, 8, 12, 100, 1600, 1600, 60, .5, -.4, 128),
    ('triangle-small-block', 'Triangle CV, 64-frame blocks', 1, 4, 10, 400, 80, 1200, 200, .5, .8, 64),
]
keys = ['waveform', 'rateBefore', 'rateAfter', 'upBefore', 'upAfter', 'downBefore', 'downAfter', 'depthBefore', 'depthAfter', 'blockSize']
cases = []
for case_id, label, *values in specs:
    audio = f'{case_id}.f32'
    subprocess.run([str(value) for value in [runner, OUT / audio, *values]], check=True)
    cases.append({'id': case_id, 'label': label, **dict(zip(keys, values)), 'output': audio})
(OUT / 'input.f32').write_bytes(bytes(24576 * 2 * 4))
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'native Rust typed-CV slew patch',
    'sourceSha256': source_hash, 'sampleRate': 48000, 'channels': 2,
    'frames': 24576, 'stepFrame': 12288, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} native Rust slew patch cases to {OUT}')
