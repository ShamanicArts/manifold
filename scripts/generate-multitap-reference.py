#!/usr/bin/env python3
"""Capture original C++ MultitapDelayNode output and echo tails."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/multitap'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'multitap'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/MultitapDelayNode.cpp', 'dsp/core/nodes/MultitapDelayNode.h',
])).hexdigest()
frames, sample_rate, step = 65536, 48000, 32768
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .7 if frame in (0, 1600, 28000, 41000) else 0.0
        right = -.5 if frame in (320, 2100, 30000, 42000) else 0.0
        if 8000 <= frame < 15000:
            left += .08 * math.sin(2 * math.pi * frame * 217 / sample_rate)
            right += .07 * math.sin(2 * math.pi * frame * 373 / sample_rate)
        output.write(struct.pack('<ff', left, right))

DEFAULT = [4, .3, .5]
for tap in range(8):
    DEFAULT += [120 * (tap + 1), .5 / (tap + 1), -.5 if tap % 2 == 0 else .5]

def settings(**changes):
    result = DEFAULT.copy()
    for key, value in changes.items():
        if key in ('count', 'feedback', 'mix'):
            result[{'count': 0, 'feedback': 1, 'mix': 2}[key]] = value
        else:
            field, index = key.split('_')
            result[3 + (int(index) - 1) * 3 + {'time': 0, 'gain': 1, 'pan': 2}[field]] = value
    return result

specs = [
    ('default', 'Four original taps', settings(), settings(), 128),
    ('tap-count', 'Two to eight taps', settings(count=2, mix=1), settings(count=8), 128),
    ('feedback', 'Feedback sweep', settings(feedback=.1, mix=1), settings(feedback=.8), 128),
    ('tap-pan', 'Pan and gain changes', settings(mix=1, pan_1=-1, pan_2=1), settings(pan_1=1, pan_2=-1, gain_3=.8), 128),
    ('tap-time', 'Fractional tap time changes', settings(time_1=75.3, time_2=157.7, mix=1), settings(time_1=53.7, time_2=216.9), 64),
    ('mix', 'Dry to wet smoothing', settings(mix=0), settings(mix=1), 128),
    ('dormant', 'Dormant dry bypass and restart', settings(mix=0, feedback=0), settings(mix=1, feedback=.4), 64),
]
cases = []
for case_id, label, before, after, block in specs:
    filename = f'{case_id}.f32'
    subprocess.run([runner, str(OUT / 'input.f32'), str(OUT / filename), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after, 'blockSize': block, 'output': filename})
(OUT / 'manifest.json').write_text(json.dumps({'version': 1, 'reference': 'legacy C++ MultitapDelayNode stereo',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2, 'frames': frames,
    'stepFrame': step, 'input': 'input.f32', 'cases': cases}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ Multitap cases to {OUT}')
