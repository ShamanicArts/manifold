#!/usr/bin/env python3
"""Capture original TransientShaperNode audio and block transient meter."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/transient-shaper'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'transient'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/TransientShaperNode.cpp', 'dsp/core/nodes/TransientShaperNode.h',
])).hexdigest()
frames, sample_rate, step = 8192, 48000, 4096
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        level = .7 if frame < 1200 else .1 if frame < 2200 else .9 if frame < 3700 else .2 if frame < 4800 else .8 if frame < 6400 else .15
        left = level * math.sin(2 * math.pi * 230 * frame / sample_rate)
        right = .8 * level * math.sin(2 * math.pi * 380 * frame / sample_rate + .3)
        output.write(struct.pack('<ff', left, right))
specs = [
    ('default', 'Default attack and sustain', [.5,0,1,1], [.5,0,1,1], 128),
    ('attack', 'Attack boost to cut', [1,0,2,1], [-1,0,2,1], 128),
    ('sustain', 'Sustain boost to cut', [0,1,2,1], [0,-1,2,1], 128),
    ('sensitivity', 'Sensitivity sweep', [.8,-.5,.2,1], [.8,-.5,4,1], 64),
    ('mix', 'Dry/wet change', [1,-.5,2,0], [1,-.5,2,1], 128),
    ('stereo', 'Stereo detector independence', [.7,.4,1.5,1], [-.4,-.7,.7,.6], 256),
    ('small-block', '32-frame meter blocks', [.6,-.3,1.8,1], [.2,.5,1.2,1], 32),
]
cases=[]
for case_id,label,before,after,block in specs:
    audio=f'{case_id}.f32'; meter=f'{case_id}-meters.f32'
    args=[OUT/'input.f32',OUT/audio,OUT/meter,*before,*after,sample_rate,block,step,frames]
    subprocess.run([runner,*(str(value) for value in args)],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':audio,'meterOutput':meter})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ TransientShaperNode stereo with transient meter',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,
    'stepFrame':step,'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ Transient Shaper cases to {OUT}')
