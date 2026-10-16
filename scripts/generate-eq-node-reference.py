#!/usr/bin/env python3
"""Capture the original C++ EQNode output for three-band EQ parity."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/eq-node'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'eq-node'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/EQNode.cpp', 'dsp/core/nodes/EQNode.h',
])).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .47 * math.sin(2 * math.pi * 73 * frame / sample_rate) + .3 * math.sin(2 * math.pi * 910 * frame / sample_rate) + .16 * math.sin(2 * math.pi * 7300 * frame / sample_rate)
        right = .42 * math.sin(2 * math.pi * 159 * frame / sample_rate) + .26 * math.sin(2 * math.pi * 1600 * frame / sample_rate) + .14 * math.sin(2 * math.pi * 9500 * frame / sample_rate)
        if frame in (0, 4100, 8200, 12300): left += .17
        output.write(struct.pack('<ff', left, right))
default = [0,120,0,1000,.7,0,8000,0,1]
specs = [
    ('default', 'Default flat EQ', default, default, 128),
    ('low-shelf', 'Low shelf boost to cut', [10,120,0,1000,.7,0,8000,0,1], [-10,250,0,1000,.7,0,8000,0,1], 128),
    ('mid-peak', 'Mid peak and Q sweep', [0,120,9,900,.5,0,8000,0,1], [0,120,-9,3200,5,0,8000,0,1], 128),
    ('high-shelf', 'High shelf cut to boost', [0,120,0,1000,.7,-10,6000,0,1], [0,120,0,1000,.7,10,12500,0,1], 128),
    ('three-band', 'Three bands and output trim', [6,120,-4,900,.8,-5,8000,-3,1], [-6,220,5,2000,2,7,10000,4,1], 128),
    ('mix', 'Dry to wet sweep', [7,120,-5,1000,.7,7,8000,0,0], [7,120,-5,1000,.7,7,8000,0,1], 128),
    ('output', 'Output gain and wet mix', [0,120,0,1000,.7,0,8000,-12,.5], [0,120,0,1000,.7,0,8000,8,.8], 128),
    ('small-block', '64-frame blocks', [2,90,-3,1500,1.2,2,9000,0,.9], [-2,310,3,1200,2.8,-2,7000,-2,.6], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    name = f'{case_id}.f32'
    subprocess.run([runner, str(OUT / 'input.f32'), str(OUT / name), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after, 'blockSize': block, 'output': name})
(OUT / 'manifest.json').write_text(json.dumps({'version': 1, 'reference': 'legacy C++ EQNode stereo',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2, 'frames': frames,
    'stepFrame': step, 'input': 'input.f32', 'cases': cases}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ EQNode cases to {OUT}')
