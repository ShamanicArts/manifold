#!/usr/bin/env python3
"""Capture original C++ RingModulatorNode internal and external bus behavior."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/ring-modulator'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'ring-modulator'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/RingModulatorNode.cpp', 'dsp/core/nodes/RingModulatorNode.h',
])).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        t = frame / sample_rate
        left = .42 * math.sin(2 * math.pi * 231 * t) + (.35 if frame in (0, 4500, 9500) else 0)
        right = .38 * math.sin(2 * math.pi * 347 * t) - (.3 if frame in (1200, 6000, 12000) else 0)
        output.write(struct.pack('<ff', left, right))
specs = [
    ('default', 'Internal oscillator default', [180,1,1,0,1], [180,1,1,0,1], False, 128),
    ('frequency', 'Frequency sweep', [38,.8,1,0,1], [1770,.8,1,0,1], False, 128),
    ('depth', 'Depth sweep', [270,.15,.9,30,1], [270,1,.9,30,1], False, 64),
    ('spread', 'Stereo phase spread', [130,1,1,0,1], [130,1,1,180,1], False, 128),
    ('mix', 'Dry/wet sweep', [300,1,.1,45,1], [300,1,1,45,1], False, 128),
    ('enable', 'Disabled to enabled', [90,1,1,0,0], [90,1,1,0,1], False, 128),
    ('external', 'Carrier as external stereo modulator', [90,1,1,0,1], [90,.5,.8,90,1], True, 64),
]
cases=[]
for case_id,label,before,after,external,block in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner, str(OUT/'input.f32'), str(OUT/name), str(sample_rate), str(block), str(step), str(frames), str(int(external)), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'external':external,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ RingModulatorNode stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,
    'stepFrame':step,'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ Ring Modulator cases to {OUT}')
