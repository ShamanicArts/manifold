#!/usr/bin/env python3
"""Render legacy C++ SlewLimiterNode stereo and control-change cases."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/slew-audio'
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'slew-audio'], text=True).strip()
source_hash = hashlib.sha256((LEGACY / 'dsp/core/nodes/SlewLimiterNode.cpp').read_bytes()).hexdigest()
frames, rate, step = 8192, 48000, 4096
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .65 if (frame // 640) % 2 else -.65
        right = .4 if (frame // 960) % 2 else -.4
        left += .08 * math.sin(2 * math.pi * frame * 331 / rate)
        right += .05 * math.sin(2 * math.pi * frame * 447 / rate)
        output.write(struct.pack('<ff', left, right))
specs = [
    ('direct', 'Direct slide', 1, 1, 1, 1, 128),
    ('slow-rise', 'Slow rise', 256, 256, 1, 1, 128),
    ('slow-fall', 'Slow fall', 1, 1, 384, 384, 128),
    ('asymmetric', 'Different rise and fall', 72, 72, 320, 320, 128),
    ('change', 'Change slide at midpoint', 8, 300, 256, 12, 128),
    ('small-block', '64-frame blocks', 400, 24, 16, 256, 64),
]
keys = ['upBefore', 'upAfter', 'downBefore', 'downAfter', 'blockSize']
cases = []
for case_id, label, *values in specs:
    audio = f'{case_id}.f32'
    subprocess.run([binary, *(str(value) for value in [OUT / 'input.f32', OUT / audio, *values[:4], rate, values[4], step, frames])], check=True)
    cases.append({'id': case_id, 'label': label, **dict(zip(keys, values)), 'output': audio})
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'legacy C++ SlewLimiterNode.cpp scalar stereo',
    'sourceSha256': source_hash, 'sampleRate': rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ slew cases to {OUT}')
