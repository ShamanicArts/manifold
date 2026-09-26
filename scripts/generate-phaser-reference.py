#!/usr/bin/env python3
"""Capture the original C++ PhaserNode scalar stereo behavior."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/phaser'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'phaser'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/PhaserNode.cpp', 'dsp/core/nodes/PhaserNode.h',
])).hexdigest()
frames, sample_rate, step = 24576, 48000, 12288
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .19 * math.sin(2 * math.pi * 317 * frame / sample_rate)
        right = .16 * math.sin(2 * math.pi * 523 * frame / sample_rate)
        if frame in (0, 3000, 11500, 16000): left += .42
        if frame in (700, 5200, 12000, 19000): right -= .35
        output.write(struct.pack('<ff', left, right))

default = [.4, .7, 6, .2, 90]
specs = [
    ('default', 'Six-stage stereo', default, default, 128),
    ('stage-switch', 'Six to twelve stages', default, [.4, .7, 12, .2, 90], 128),
    ('rate-depth', 'Rate and depth sweep', [1.5, .2, 6, .2, 90], [5, 1, 6, .2, 90], 128),
    ('negative-feedback', 'Feedback polarity', [.8, .8, 12, .75, 90], [.8, .8, 12, -.8, 90], 128),
    ('spread', 'Stereo phase spread', [1, .7, 6, .2, 0], [1, .7, 6, .2, 180], 128),
    ('slow-shallow', 'Slow shallow sweep', [.1, .1, 6, 0, 45], [.25, .3, 6, .3, 45], 128),
    ('short-block', '64-frame block partition', [2, .9, 12, .4, 120], [3.5, .5, 12, .6, 30], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    name = f'{case_id}.f32'
    args = [OUT / 'input.f32', OUT / name, sample_rate, block, step, frames, *before, *after]
    subprocess.run([runner, *(str(value) for value in args)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after,
                  'blockSize': block, 'output': name})
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'legacy C++ PhaserNode.cpp scalar stereo',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ phaser cases to {OUT}')
