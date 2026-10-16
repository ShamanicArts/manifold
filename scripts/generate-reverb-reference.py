#!/usr/bin/env python3
"""Capture legacy ReverbNode's stereo FreeVerb-style output and tails."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/reverb'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'reverb'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/ReverbNode.cpp', 'dsp/core/nodes/ReverbNode.h',
    'external/JUCE/modules/juce_audio_basics/utilities/juce_Reverb.h',
])).hexdigest()
frames, sample_rate, step = 32768, 48000, 16384
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        t = frame / sample_rate
        left = 0.0 if frame > 5000 else .12 * math.sin(2 * math.pi * 217 * t)
        right = 0.0 if frame > 7000 else .11 * math.sin(2 * math.pi * 373 * t)
        if frame in (0, 1600, 15000, 20000): left += .7
        if frame in (330, 12000, 21000): right -= .55
        output.write(struct.pack('<ff', left, right))
specs = [
    ('default', 'Default room and wet/dry', [.5,.5,.33,.4,1], [.5,.5,.33,.4,1], 128),
    ('room-sweep', 'Room small to large', [.15,.4,1,0,1], [.95,.4,1,0,1], 128),
    ('damping-sweep', 'Damping low to high', [.75,0,1,0,1], [.75,1,1,0,1], 128),
    ('stereo-width', 'Wet stereo width 0 to 1', [.6,.4,1,0,0], [.6,.4,1,0,1], 128),
    ('wet-level', 'Wet level sweep', [.6,.4,.2,.3,1], [.6,.4,1,.3,1], 128),
    ('dry-level', 'Dry level change', [.6,.4,1,1,1], [.6,.4,1,0,1], 128),
    ('short-block', 'Short blocks and parameter change', [.4,.2,1,0,.5], [.8,.8,1,0,.8], 32),
    ('long-block', 'Long blocks and stereo tail', [.6,.4,1,0,1], [.8,.3,1,0,1], 512),
]
cases=[]
for case_id,label,before,after,block in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner, *(str(value) for value in [OUT/'input.f32',OUT/name,sample_rate,block,step,frames,*before,*after])],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ ReverbNode / JUCE Reverb stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,'stepFrame':step,
    'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ Reverb cases to {OUT}')
