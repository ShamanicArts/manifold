#!/usr/bin/env python3
"""Capture the original C++ ChorusNode scalar stereo behavior."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/chorus'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'chorus'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/ChorusNode.cpp', 'dsp/core/nodes/ChorusNode.h',
])).hexdigest()
frames, sample_rate, step = 32768, 48000, 16384
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .19 * math.sin(2 * math.pi * 317 * frame / sample_rate)
        right = .16 * math.sin(2 * math.pi * 523 * frame / sample_rate)
        if frame in (0, 3000, 11500, 16000): left += .42
        if frame in (700, 5200, 12000, 19000): right -= .35
        output.write(struct.pack('<ff', left, right))

default = [.6, .45, 3, .7, .1, 0, .5]
specs = [
    ('default', 'Three-voice sine chorus', default, default, 128),
    ('voice-switch', 'One to four voices', default, [.6, .45, 4, .7, .1, 0, .5], 128),
    ('triangle', 'Sine to triangle LFO', default, [.6, .45, 3, .7, .1, 1, .5], 128),
    ('deep-fast', 'Rate and depth sweep', [.2, .15, 3, .7, .1, 0, .5], [4, 1, 3, .7, .1, 0, .5], 128),
    ('feedback', 'Feedback increase', [.6, .8, 4, .7, 0, 0, .7], [.6, .8, 4, .7, .85, 0, .7], 128),
    ('spread', 'Stereo spread', [.8, .6, 3, 0, .1, 0, .8], [.8, .6, 3, 1, .1, 0, .8], 128),
    ('mix-short-block', 'Mix sweep in 64-frame blocks', [.6, .45, 3, .7, .1, 1, .2], [.6, .45, 3, .7, .1, 1, 1], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    name = f'{case_id}.f32'
    args = [OUT / 'input.f32', OUT / name, sample_rate, block, step, frames, *before, *after]
    subprocess.run([runner, *(str(value) for value in args)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after,
                  'blockSize': block, 'output': name})
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'legacy C++ ChorusNode.cpp scalar stereo',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ chorus cases to {OUT}')
