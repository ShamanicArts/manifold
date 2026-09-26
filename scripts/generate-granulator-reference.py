#!/usr/bin/env python3
"""Capture original C++ GranulatorNode ring mode with zero spray for repeatability."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/granulator'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'granulator'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/GranulatorNode.cpp', 'dsp/core/nodes/GranulatorNode.h',
])).hexdigest()
frames, sample_rate, step = 131072, 48000, 65536
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .42 * math.sin(2 * math.pi * 220 * frame / sample_rate) + .18 * math.sin(2 * math.pi * 460 * frame / sample_rate)
        right = .36 * math.sin(2 * math.pi * 330 * frame / sample_rate) + .17 * math.sin(2 * math.pi * 750 * frame / sample_rate)
        if frame in (0, 5400, 17000, 25100): left += .2
        output.write(struct.pack('<ff', left, right))
# Controls: grain ms, density, position, pitch, spray, mix, freeze, envelope, enabled.
# The legacy default-constructed RNG has no reproducible seed. Spray=0 makes its random draw inert.
default = [80,20,.5,0,0,1,0,0,1]
specs = [
    ('default', 'Default capture ring, zero spray', default, default, 128),
    ('short-grains', 'Short dense grains', [20,60,.05,0,0,1,0,0,1], [20,60,.05,0,0,1,0,0,1], 128),
    ('size-sweep', 'Grain size sweep', [15,40,.05,0,0,1,0,0,1], [220,40,.05,0,0,1,0,0,1], 128),
    ('density-sweep', 'Density sweep', [80,4,.05,0,0,1,0,0,1], [80,80,.05,0,0,1,0,0,1], 128),
    ('pitch-sweep', 'Grain pitch sweep', [80,24,.05,-12,0,1,0,0,1], [80,24,.05,12,0,1,0,0,1], 128),
    ('envelopes', 'Hann to Blackman', [80,24,.05,0,0,1,0,0,1], [80,24,.05,0,0,1,0,2,1], 128),
    ('freeze', 'Freeze capture ring', [80,24,.05,0,0,1,0,3,1], [80,24,.05,0,0,1,1,3,1], 128),
    ('mix', 'Dry to wet and 64-frame blocks', [80,24,.05,0,0,.1,0,4,1], [80,24,.05,0,0,.9,0,4,1], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    name = f'{case_id}.f32'
    subprocess.run([runner, str(OUT/'input.f32'), str(OUT/name), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ GranulatorNode capture ring (spray=0)',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,
    'stepFrame':step,'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ Granulator cases to {OUT}')
