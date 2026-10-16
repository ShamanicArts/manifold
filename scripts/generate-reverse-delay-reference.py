#!/usr/bin/env python3
"""Capture the original C++ ReverseDelayNode stereo windows and bypass."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/reverse-delay'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'reverse-delay'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/ReverseDelayNode.cpp', 'dsp/core/nodes/ReverseDelayNode.h',
])).hexdigest()
frames, sample_rate, step = 32768, 48000, 16384
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .65 if frame in (0, 4900, 11400, 17000, 24000) else 0.0
        right = -.5 if frame in (1200, 6000, 12500, 19000, 25000) else 0.0
        if 2200 <= frame < 6000 or 12600 <= frame < 15800 or 21500 <= frame < 27500:
            left += .24 * math.sin(2 * math.pi * 290 * frame / sample_rate)
            right += .2 * math.sin(2 * math.pi * 410 * frame / sample_rate)
        output.write(struct.pack('<ff', left, right))
default = [420, 120, .35, .5]
specs = [
    ('default', 'Default reverse window', default, default, 128),
    ('short-window', 'Short 50 ms delay and 20 ms window', [50,20,.35,.7], [50,20,.35,.7], 128),
    ('time-sweep', 'Delay time sweep', [80,40,.35,.8], [260,40,.35,.8], 128),
    ('window-sweep', 'Reverse window sweep', [250,20,.35,.8], [250,200,.35,.8], 128),
    ('feedback', 'Feedback sweep', [150,80,0,.8], [150,80,.9,.8], 128),
    ('mix', 'Wet mix sweep', [120,60,.4,0], [120,60,.4,1], 128),
    ('dormant', 'Dormant bypass and restart', [120,60,0,0], [120,60,.4,.8], 128),
    ('small-block', '64-frame reverse windows', [90,30,.3,.8], [180,90,.6,.8], 64),
]
cases=[]
for case_id,label,before,after,block in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner,str(OUT/'input.f32'),str(OUT/name),str(sample_rate),str(block),str(step),str(frames),*(str(value) for value in before),*(str(value) for value in after)],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ ReverseDelayNode stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,
    'stepFrame':step,'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ ReverseDelay cases to {OUT}')
