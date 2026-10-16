#!/usr/bin/env python3
"""Capture original FormantFilterNode stereo output for browser comparison."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/formant'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'formant'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/FormantFilterNode.cpp', 'dsp/core/nodes/FormantFilterNode.h',
])).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .41 * math.sin(2 * math.pi * 147 * frame / sample_rate) + .27 * math.sin(2 * math.pi * 1030 * frame / sample_rate) + .13 * math.sin(2 * math.pi * 2700 * frame / sample_rate)
        right = .39 * math.sin(2 * math.pi * 202 * frame / sample_rate) + .25 * math.sin(2 * math.pi * 780 * frame / sample_rate) + .12 * math.sin(2 * math.pi * 3200 * frame / sample_rate)
        if frame in (0, 5000, 8200, 13000): left += .21
        output.write(struct.pack('<ff', left, right))
default = [0, 0, 6, 1.2, 1]
specs = [
    ('default', 'Default vowel A', default, default, 128),
    ('a-to-e', 'A to E transition', [0,0,7,1.4,1], [1,0,7,1.4,1], 128),
    ('e-to-i', 'E to I transition', [1,0,7,1.4,1], [2,0,7,1.4,1], 128),
    ('o-to-u', 'O to U transition', [3,0,7,1.4,1], [4,0,7,1.4,1], 128),
    ('fractional-vowel', 'Interpolated vowel', [.5,0,6,1.2,1], [2.5,0,6,1.2,1], 128),
    ('shift-resonance', 'Shift and Q sweep', [0,-8,3,1.4,1], [3,8,14,1.4,1], 128),
    ('drive-mix', 'Drive and wet mix', [2,0,6,.8,.25], [2,0,6,4,.8], 128),
    ('dry-small-block', 'Dry bypass to 64-frame wet blocks', [4,0,6,1.2,0], [4,0,6,1.2,.7], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    name = f'{case_id}.f32'
    subprocess.run([runner, str(OUT / 'input.f32'), str(OUT / name), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after, 'blockSize': block, 'output': name})
(OUT / 'manifest.json').write_text(json.dumps({'version': 1, 'reference': 'legacy C++ FormantFilterNode stereo',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2, 'frames': frames,
    'stepFrame': step, 'input': 'input.f32', 'cases': cases}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ Formant cases to {OUT}')
