#!/usr/bin/env python3
"""Capture seeded original StutterNode behavior, including pattern and probability."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/stutter'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'stutter'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/StutterNode.cpp', 'dsp/core/nodes/StutterNode.h',
    'external/JUCE/modules/juce_core/maths/juce_Random.cpp',
])).hexdigest()
frames, sample_rate, step = 65536, 48000, 32768
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .45 if frame % 4800 == 0 else 0.0
        right = -.35 if frame % 6000 == 0 else 0.0
        if (frame // 2400) % 3 != 2:
            left += .21 * math.sin(2 * math.pi * 211 * frame / sample_rate)
            right += .18 * math.sin(2 * math.pi * 317 * frame / sample_rate)
        output.write(struct.pack('<ff', left, right))
default = [.5,.8,.3,.2,.5,255,120,1]
specs = [
    ('default', 'Default seeded pattern', default, default, 128),
    ('always', 'Always trigger every segment', [.125,.8,.3,.2,1,255,120,1], [.125,.8,.3,.2,1,255,120,1], 128),
    ('probability', 'Seeded probability sweep', [.125,.8,.3,.2,.2,255,120,1], [.125,.8,.3,.2,.9,255,120,1], 128),
    ('pattern', 'Alternating pattern mask', [.125,.8,.3,.2,1,85,120,1], [.125,.8,.3,.2,1,170,120,1], 128),
    ('gate-decay', 'Gate and filter decay', [.125,.3,0,.2,1,255,120,1], [.125,.9,1,.2,1,255,120,1], 128),
    ('pitch-tempo', 'Pitch decay and tempo', [.25,.8,.3,0,1,255,120,1], [.25,.8,.3,1,1,255,240,1], 128),
    ('mix', 'Wet mix sweep', [.125,.8,.3,.2,1,255,120,.2], [.125,.8,.3,.2,1,255,120,.8], 128),
    ('small-block', '64-frame seeded blocks', [.125,.75,.5,.4,.7,255,120,.9], [.25,.6,.2,.6,.3,255,120,.9], 64),
]
cases=[]
for case_id,label,before,after,block in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner,str(OUT/'input.f32'),str(OUT/name),str(sample_rate),str(block),str(step),str(frames),*(str(value) for value in before),*(str(value) for value in after)],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ StutterNode with seeded juce::Random',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,
    'stepFrame':step,'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ Stutter cases to {OUT}')
