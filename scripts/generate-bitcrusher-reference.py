#!/usr/bin/env python3
"""Capture original BitCrusherNode default Highway and scalar output, including bus B logic."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/bitcrusher'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'bitcrusher'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/BitCrusherNode.cpp', 'dsp/core/nodes/BitCrusherNode.h',
    'dsp/core/nodes/BitCrusherNode_Highway.h',
])).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .7 * math.sin(2 * math.pi * 227 * frame / sample_rate) + (.3 if frame in (0,3900,8200) else 0)
        right = .5 * math.sin(2 * math.pi * 349 * frame / sample_rate) + (.27 if frame in (500,4100,8500) else 0)
        output.write(struct.pack('<ff',left,right))
specs = [
    ('default-simd', 'Default Highway path', [8,4,1,.8,0], [8,4,1,.8,0], False, False, 128),
    ('default-scalar', 'Scalar path', [8,4,1,.8,0], [8,4,1,.8,0], False, True, 128),
    ('bits', 'Bit depth sweep', [3,8,1,.8,0], [15,8,1,.8,0], False, False, 128),
    ('rate', 'Rate reduction sweep', [8,1,1,.8,0], [8,63,1,.8,0], False, False, 128),
    ('mix-output', 'Dry mix and output gain', [6,8,.2,.5,0], [6,8,.9,1.7,0], False, False, 128),
    ('xor', 'XOR with external stereo bus', [6,4,1,.8,1], [12,8,1,.8,1], True, False, 128),
    ('gate', 'Gate with external stereo bus', [6,4,1,.8,2], [6,8,1,.8,2], True, False, 128),
    ('no-bus-fallback', 'Logic mode without bus B', [6,4,1,.8,1], [6,8,1,.8,2], False, True, 128),
    ('small-block', '64-frame blocks', [6,8,.8,1,0], [10,2,.6,.5,0], False, False, 64),
]
cases=[]
for case_id,label,before,after,external,scalar,block in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner,str(OUT/'input.f32'),str(OUT/name),str(sample_rate),str(block),str(step),str(frames),str(int(external)),str(int(scalar)),*(str(value) for value in before),*(str(value) for value in after)],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'external':external,
                  'referenceMode':'scalar' if scalar else 'Highway','blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ BitCrusherNode Highway and scalar stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,
    'stepFrame':step,'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ BitCrusher cases to {OUT}')
