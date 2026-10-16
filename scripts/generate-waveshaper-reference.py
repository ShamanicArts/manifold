#!/usr/bin/env python3
"""Capture original C++ WaveShaperNode stereo behavior, including all seven curves."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/waveshaper'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'waveshaper'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/WaveShaperNode.cpp', 'dsp/core/nodes/WaveShaperNode.h',
])).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        t = frame / sample_rate
        left = .32 * math.sin(2 * math.pi * 137 * t) + .18 * math.sin(2 * math.pi * 1473 * t)
        right = .38 * math.sin(2 * math.pi * 220 * t) + .12 * math.sin(2 * math.pi * 3891 * t)
        if frame in (0, 3072, 10347): left += .9
        if frame in (213, 8100, 12801): right -= .65
        output.write(struct.pack('<ff', left, right))

base = [0, 12, 0, 0, 0, 0, 1, 2]
specs = []
for curve, name in enumerate(['tanh', 'tube', 'tape', 'hardclip', 'foldback', 'sigmoid', 'softclip']):
    before = [curve, 12, 0, 0, 0, 0, 1, 2]
    after = [curve, 26, -3, 0, 0, .2, 1, 2]
    specs.append((name, f'{name} · drive, bias and output change', before, after, 128))
specs += [
    ('curve-switch', 'Tanh to foldback', base, [4, 16, 0, 0, 0, 0, 1, 2], 64),
    ('tone-filters', 'Pre and post tone filter sweep', [1, 18, 0, 9000, 5000, .1, 1, 2], [1, 18, 0, 700, 1800, -.1, 1, 2], 128),
    ('mix-oversample', 'Mix and 1x to 4x coefficient mode', [2, 14, 1, 3000, 2500, 0, .3, 1], [2, 22, -2, 1500, 6000, .2, .8, 4], 128),
    ('short-block', 'Short blocks and bypass', [6, 10, 0, 0, 0, 0, 0, 2], [6, 20, 0, 0, 0, -.2, .7, 2], 32),
]
cases=[]
for case_id,label,before,after,block in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner, *(str(value) for value in [OUT/'input.f32',OUT/name,sample_rate,block,step,frames,*before,*after])],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ WaveShaperNode scalar stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,'stepFrame':step,
    'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ WaveShaper cases to {OUT}')
