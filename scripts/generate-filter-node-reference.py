#!/usr/bin/env python3
"""Capture original C++ FilterNode, including its default Highway path."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/legacy-filter'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'filter-node'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/FilterNode.cpp', 'dsp/core/nodes/FilterNode.h', 'dsp/core/nodes/FilterNode_Highway.h',
])).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        t = frame / sample_rate
        left = .24 * math.sin(2 * math.pi * 97 * t) + .13 * math.sin(2 * math.pi * 1331 * t) + .06 * math.sin(2 * math.pi * 6811 * t)
        right = .19 * math.sin(2 * math.pi * 249 * t) + .12 * math.sin(2 * math.pi * 2900 * t)
        if frame in (0, 2000, 10000): left += .65
        if frame in (111, 7700, 14100): right -= .55
        output.write(struct.pack('<ff', left, right))
specs = [
    ('steady', 'Steady cutoff and resonance', [1400,.1,1], [1400,.1,1], 128, 1),
    ('cutoff-sweep', 'Cutoff sweep', [200,.2,1], [8000,.2,1], 128, 1),
    ('resonance', 'Resonance sweep', [1500,0,1], [1500,1,1], 128, 1),
    ('mix', 'Dry to wet', [800,.5,0], [800,.5,1], 128, 1),
    ('high-cutoff', 'Near maximum cutoff', [18000,.8,1], [6000,.4,1], 128, 1),
    ('low-cutoff', 'Near minimum cutoff', [20,.8,1], [120,.2,1], 128, 1),
    ('short-block', 'Short blocks', [1000,.3,1], [7000,.8,.5], 32, 1),
    ('scalar', 'Scalar path with parameter change', [1000,.2,1], [5000,.8,.7], 128, 0),
]
cases=[]
for case_id,label,before,after,block,mode in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner, *(str(value) for value in [OUT/'input.f32',OUT/name,sample_rate,block,step,frames,mode,*before,*after])],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'referenceMode':'Highway default' if mode else 'scalar','output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ FilterNode default Highway and scalar stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,'stepFrame':step,
    'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ FilterNode cases to {OUT}')
