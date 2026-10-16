#!/usr/bin/env python3
"""Capture original C++ PitchShifterNode two-head stereo output."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/pitch-shifter'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'pitch-shifter'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/PitchShifterNode.cpp', 'dsp/core/nodes/PitchShifterNode.h',
])).hexdigest()
frames, sample_rate, step = 32768, 48000, 16384
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .42 * math.sin(2 * math.pi * 220 * frame / sample_rate) + .18 * math.sin(2 * math.pi * 460 * frame / sample_rate)
        right = .36 * math.sin(2 * math.pi * 330 * frame / sample_rate) + .17 * math.sin(2 * math.pi * 750 * frame / sample_rate)
        if frame in (0, 5400, 17000, 25100): left += .2
        output.write(struct.pack('<ff', left, right))
default = [0,80,0,1]
specs = [
    ('default', 'Default unshifted overlap', default, default, 128),
    ('octave-up', 'Octave-up heads', [12,80,0,1], [12,80,0,1], 128),
    ('octave-down', 'Octave-down heads', [-12,80,0,1], [-12,80,0,1], 128),
    ('pitch-sweep', 'Pitch sweep', [-7,80,0,1], [7,80,0,1], 128),
    ('window-sweep', 'Window size sweep', [5,30,0,1], [5,180,0,1], 128),
    ('feedback', 'Feedback and wet mix', [7,80,.1,.7], [7,80,.7,.9], 128),
    ('dormant', 'Dormant dry bypass to active', [0,80,0,0], [12,80,0,1], 128),
    ('small-block', '64-frame shifting', [4,50,.2,.8], [-4,120,.2,.8], 64),
]
cases=[]
for case_id,label,before,after,block in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner,str(OUT/'input.f32'),str(OUT/name),str(sample_rate),str(block),str(step),str(frames),*(str(value) for value in before),*(str(value) for value in after)],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ PitchShifterNode stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,
    'stepFrame':step,'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ PitchShifter cases to {OUT}')
