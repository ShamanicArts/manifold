#!/usr/bin/env python3
"""Capture original C++ ShimmerNode stereo output over its long delay."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/shimmer'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'shimmer'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/ShimmerNode.cpp', 'dsp/core/nodes/ShimmerNode.h',
])).hexdigest()
frames, sample_rate, step = 65536, 48000, 32768
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .42 * math.sin(2 * math.pi * 220 * frame / sample_rate) + .18 * math.sin(2 * math.pi * 460 * frame / sample_rate)
        right = .36 * math.sin(2 * math.pi * 330 * frame / sample_rate) + .17 * math.sin(2 * math.pi * 750 * frame / sample_rate)
        if frame in (0, 5400, 17000, 25100): left += .2
        output.write(struct.pack('<ff', left, right))
default = [.6,12,.65,.45,.25,6000]
specs = [
    ('default', 'Default shimmer', default, default, 128),
    ('short-delay', 'Short size and unison pitch', [0,0,.2,1,0,6000], [0,0,.2,1,0,6000], 128),
    ('pitch-sweep', 'Upward pitch sweep', [.2,-12,.5,.8,.2,5000], [.2,12,.5,.8,.2,5000], 128),
    ('size-sweep', 'Delay size sweep', [.1,7,.5,.8,.2,5000], [.8,7,.5,.8,.2,5000], 128),
    ('feedback', 'Feedback and filter sweep', [.2,12,.1,.8,.2,500], [.2,12,.9,.8,.2,10000], 128),
    ('modulation', 'Stereo modulation sweep', [.2,12,.5,.8,0,6000], [.2,12,.5,.8,1,6000], 128),
    ('mix', 'Dry to wet mix sweep', [.2,12,.5,0,.2,6000], [.2,12,.5,1,.2,6000], 128),
    ('small-block', '64-frame processing', [.2,7,.4,.9,.4,4000], [.2,-7,.4,.9,.4,4000], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    name = f'{case_id}.f32'
    subprocess.run([runner, str(OUT/'input.f32'), str(OUT/name), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ ShimmerNode stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,
    'stepFrame':step,'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ Shimmer cases to {OUT}')
