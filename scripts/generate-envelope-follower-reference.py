#!/usr/bin/env python3
"""Generate original C++ envelope follower audio and meter fixtures."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/envelope-follower'
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'envelope-follower'], text=True).strip()
source_hash = hashlib.sha256((LEGACY / 'dsp/core/nodes/EnvelopeFollowerNode.cpp').read_bytes()).hexdigest()
frames = 8192
sample_rate = 48000
step = 4096
with (OUT / 'input.f32').open('wb') as target:
    for frame in range(frames):
        amplitude = .8 if frame < 2048 else .15 if frame < 4096 else .95 if frame < 6144 else 0
        left = amplitude * math.sin(2 * math.pi * 220 * frame / sample_rate) + .08
        right = amplitude * .6 * math.sin(2 * math.pi * 331 * frame / sample_rate) - .05
        target.write(struct.pack('<ff', left, right))

specs = [
    ('peak', 'Peak detector', 10, 10, 120, 120, 1, 1, 80, 80, 0, 0, 128),
    ('rms', 'RMS detector', 10, 10, 120, 120, 1, 1, 80, 80, 1, 1, 128),
    ('hybrid', 'Hybrid detector', 10, 10, 120, 120, 1, 1, 80, 80, 2, 2, 128),
    ('fast', 'Fast attack and release', 1, 1, 20, 20, 1, 1, 80, 80, 0, 0, 128),
    ('highpass', 'Highpass and sensitivity', 10, 10, 120, 120, 3, 3, 1500, 1500, 1, 1, 128),
    ('sweep', 'Controls and mode change', 20, 2, 200, 40, .5, 2, 40, 500, 0, 2, 128),
    ('small-block', '64-frame blocks', 10, 1, 120, 30, 1, 3, 80, 400, 2, 1, 64),
]
keys = ['attackBefore', 'attackAfter', 'releaseBefore', 'releaseAfter', 'sensitivityBefore', 'sensitivityAfter', 'highpassBefore', 'highpassAfter', 'modeBefore', 'modeAfter', 'blockSize']
cases = []
for case_id, label, *values in specs:
    audio = f'{case_id}.f32'
    meters = f'{case_id}-meters.f32'
    args = [OUT / 'input.f32', OUT / audio, OUT / meters, *values[:10], sample_rate, values[10], step, frames]
    subprocess.run([binary, *(str(value) for value in args)], check=True)
    cases.append({'id': case_id, 'label': label, **dict(zip(keys, values)), 'output': audio, 'meterOutput': meters})
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'legacy C++ EnvelopeFollowerNode.cpp, stereo audio and envelope snapshots',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ envelope follower cases to {OUT}')
