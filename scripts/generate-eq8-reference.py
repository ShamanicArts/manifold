#!/usr/bin/env python3
"""Capture the original C++ EQ8Node stereo path for the Standalone EQ workbench."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/eq8'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'eq8'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/EQ8Node.cpp', 'dsp/core/nodes/EQ8Node.h',
])).hexdigest()
frames, sample_rate, step = 24576, 48000, 12288
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        t = frame / sample_rate
        left = .17 * math.sin(2 * math.pi * 137 * t) + .11 * math.sin(2 * math.pi * 1703 * t)
        right = .13 * math.sin(2 * math.pi * 431 * t) + .08 * math.sin(2 * math.pi * 6301 * t)
        if frame in (0, 3072, 14336): left += .45
        if frame in (11, 7600, 17000): right -= .33
        output.write(struct.pack('<ff', left, right))

def settings(*bands, output=0, mix=1):
    values = [item for index, freq in enumerate([60,120,250,500,1000,2500,6000,12000])
              for item in [0, 1 if index == 0 else 2 if index == 7 else 0, freq, 0, 1]]
    for band, enabled, kind, freq, gain, q in bands:
        values[band*5:band*5+5] = [enabled,kind,freq,gain,q]
    return values + [output,mix]

def band(index, enabled, kind, freq, gain, q): return (index,enabled,kind,freq,gain,q)
flat = settings()
low = settings(band(0,1,1,120,9,1))
high = settings(band(7,1,2,7500,-12,1))
peak = settings(band(3,1,0,1000,12,.7))
notch = settings(band(4,1,5,1500,0,3))
filters = settings(band(0,1,4,160,0,.7), band(7,1,3,9000,0,.7))
all_bands = settings(*[band(i,1,[1,0,0,0,0,0,0,2][i],[60,120,250,500,1000,2500,6000,12000][i],6 if i%2==0 else -6,1) for i in range(8)])
specs = [
    ('bypass', 'All bands disabled', flat, flat, 128),
    ('low-shelf', 'Low shelf boost to cut', low, settings(band(0,1,1,120,-9,1)), 128),
    ('high-shelf', 'High shelf cut to boost', high, settings(band(7,1,2,7500,9,1)), 128),
    ('peak', 'Mid bell frequency and Q change', peak, settings(band(3,1,0,2400,-12,3)), 128),
    ('notch', 'Notch to band pass', notch, settings(band(4,1,6,1500,0,3)), 128),
    ('pass-filters', 'High and low pass', filters, settings(band(0,1,4,280,0,1.2),band(7,1,3,6000,0,1.2)), 128),
    ('enable', 'Enable and disable a band', flat, low, 128),
    ('eight-bands', 'Eight bands and short blocks', all_bands, settings(*[band(i,1,[1,0,0,0,0,0,0,2][i],[60,120,250,500,1000,2500,6000,12000][i],-6 if i%2==0 else 6,1) for i in range(8)]), 64),
    ('mix-output', 'Dry wet and output gain', settings(band(3,1,0,1000,12,.7),mix=.4,output=-3), settings(band(3,1,0,1000,12,.7),mix=.9,output=4), 128),
]
cases=[]
for case_id,label,before,after,block in specs:
    name=f'{case_id}.f32'
    subprocess.run([runner, *(str(value) for value in [OUT/'input.f32',OUT/name,sample_rate,block,step,frames,*before,*after])],check=True)
    cases.append({'id':case_id,'label':label,'before':before,'after':after,'blockSize':block,'output':name})
(OUT/'manifest.json').write_text(json.dumps({'version':1,'reference':'legacy C++ EQ8Node scalar stereo',
    'sourceSha256':source_hash,'sampleRate':sample_rate,'channels':2,'frames':frames,'stepFrame':step,
    'input':'input.f32','cases':cases},indent=2)+'\n')
print(f'Wrote {len(cases)} C++ EQ8 cases to {OUT}')
