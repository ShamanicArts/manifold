#!/usr/bin/env python3
"""Capture stereo output of the legacy C++ ResonatorNode."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/resonator'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'resonator'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/ResonatorNode.cpp', 'dsp/core/nodes/ResonatorNode.h',
])).hexdigest()
frames, sample_rate, step = 16384, 44100, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        left = .35 * math.sin(2 * math.pi * 173 * frame / sample_rate) + .24 * math.sin(2 * math.pi * 997 * frame / sample_rate) + .12 * math.sin(2 * math.pi * 3023 * frame / sample_rate)
        right = .33 * math.sin(2 * math.pi * 227 * frame / sample_rate) + .22 * math.sin(2 * math.pi * 1103 * frame / sample_rate) + .11 * math.sin(2 * math.pi * 4011 * frame / sample_rate)
        if frame in (0, 4013, 8192, 12011):
            left += .22
            right -= .17
        output.write(struct.pack('<ff', left, right))
default = [1, 1000, 10]
specs = [
    ('default', '1 kHz · Q 10', default, default, 128),
    ('frequency-sweep', '300 Hz → 5 kHz', [1, 300, 8], [1, 5000, 8], 128),
    ('q-sweep', 'Q 2 → 40', [1, 1600, 2], [1, 1600, 40], 128),
    ('gain-sweep', 'Gain 0.3 → 2', [.3, 1200, 8], [2, 1200, 8], 128),
    ('low-q', 'Low Q and frequency clamp', [1, 20, .01], [1, 20, 1], 128),
    ('nyquist-clamp', 'High frequency · 44.1 kHz clamp', [1, 19000, 3], [1, 20000, 3], 128),
    ('small-block', '64-frame frequency and Q step', [.8, 600, 5], [1.4, 2600, 20], 64),
]
cases = []
for case_id, label, before, after, block in specs:
    name = f'{case_id}.f32'
    subprocess.run([runner, str(OUT / 'input.f32'), str(OUT / name), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after, 'blockSize': block, 'output': name})
(OUT / 'manifest.json').write_text(json.dumps({'version': 1, 'reference': 'legacy C++ ResonatorNode stereo',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2, 'frames': frames,
    'stepFrame': step, 'input': 'input.f32', 'cases': cases}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ Resonator cases to {OUT}')
