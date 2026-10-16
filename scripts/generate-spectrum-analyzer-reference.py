#!/usr/bin/env python3
"""Generate C++ audio and eight-band meter snapshots for the legacy analyzer."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/spectrum-analyzer'
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'spectrum-analyzer'], text=True).strip()
source_hash = hashlib.sha256((LEGACY / 'dsp/core/nodes/SpectrumAnalyzerNode.cpp').read_bytes()).hexdigest()
frames = 8192
sample_rate = 48000
step = 4096
with (OUT / 'input.f32').open('wb') as target:
    for frame in range(frames):
        frequency = 80 if frame < 2048 else 700 if frame < 4096 else 5000 if frame < 6144 else 250
        level = 0.7 if frame < 6144 else 0.25
        left = level * math.sin(2 * math.pi * frequency * frame / sample_rate)
        right = level * 0.75 * math.sin(2 * math.pi * frequency * frame / sample_rate + 0.35)
        target.write(struct.pack('<ff', left, right))

specs = [
    ('default', 'Default controls', 1, 1, .85, .85, -72, -72, 128),
    ('sensitive', 'High sensitivity', 4, 4, .85, .85, -72, -72, 128),
    ('unsmoothed', 'No band smoothing', 1, 1, 0, 0, -72, -72, 128),
    ('floor', 'Raised floor', 1, 1, .5, .5, -24, -24, 128),
    ('sweep', 'Sensitivity and smoothing change', .5, 5, .95, .2, -80, -36, 128),
    ('small-block', '64-frame blocks', 1, 2, .8, .4, -72, -60, 64),
    ('large-block', '256-frame blocks', 2, .5, .2, .9, -48, -80, 256),
]
keys = ['sensitivityBefore', 'sensitivityAfter', 'smoothingBefore', 'smoothingAfter', 'floorBefore', 'floorAfter', 'blockSize']
cases = []
for case_id, label, *values in specs:
    audio = f'{case_id}.f32'
    meters = f'{case_id}-meters.f32'
    args = [OUT / 'input.f32', OUT / audio, OUT / meters, *values[:6], sample_rate, values[6], step, frames]
    subprocess.run([binary, *(str(value) for value in args)], check=True)
    cases.append({'id': case_id, 'label': label, **dict(zip(keys, values)), 'output': audio, 'meterOutput': meters})

(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'legacy C++ SpectrumAnalyzerNode.cpp, stereo audio and eight band snapshots',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ spectrum analyzer cases to {OUT}')
