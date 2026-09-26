#!/usr/bin/env python3
"""Capture original C++ StereoWidenerNode audio and correlation per block."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/stereo-widener'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'stereo-widener'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/StereoWidenerNode.cpp', 'dsp/core/nodes/StereoWidenerNode.h',
])).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        t = frame / sample_rate
        common = .18 * math.sin(2 * math.pi * 90 * t) + .09 * math.sin(2 * math.pi * 700 * t)
        left = common + .16 * math.sin(2 * math.pi * 231 * t) + .06 * math.sin(2 * math.pi * 3211 * t)
        right = common - .13 * math.sin(2 * math.pi * 231 * t) + .05 * math.sin(2 * math.pi * 1811 * t)
        if frame in (0, 3080, 12101): left += .6
        if frame in (135, 8100, 14211): right -= .45
        output.write(struct.pack('<ff', left, right))
specs = [
    ('default', 'Default width and mono low', [1,120,1], [1,120,1], 128),
    ('width-sweep', 'Normal to extra wide', [1,140,1], [2,140,1], 128),
    ('mono-to-wide', 'Mono to wide', [0,140,1], [1.8,140,1], 128),
    ('low-frequency', 'Mono low crossover sweep', [1.4,40,1], [1.4,320,1], 128),
    ('mono-low-toggle', 'Mono low on to off', [1.25,140,1], [1.25,140,0], 128),
    ('wide-to-mono', 'Wide to mono', [2,500,0], [0,500,1], 64),
    ('short-block', 'Short blocks with width change', [0.5,200,1], [1.6,80,1], 32),
    ('high-width', 'Maximum width, low band off', [2,20,0], [2,20,0], 128),
]
cases=[]
for case_id,label,before,after,block in specs:
    name=f'{case_id}.f32'; meter=f'{case_id}-meter.f32'
    subprocess.run([runner, *(str(value) for value in [OUT/'input.f32',OUT/name,OUT/meter,sample_rate,block,step,frames,*before,*after])],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name,'meterOutput':meter})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ StereoWidenerNode stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,'stepFrame':step,
    'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ StereoWidener cases to {OUT}')
