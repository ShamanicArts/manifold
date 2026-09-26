#!/usr/bin/env python3
"""Original C++ LimiterNode scalar audio and block-averaged reduction fixtures."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/limiter'
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'limiter'], text=True).strip()
source_hash = hashlib.sha256((LEGACY / 'dsp/core/nodes/LimiterNode.cpp').read_bytes()).hexdigest()
frames, sample_rate, step = 8192, 48000, 4096
with (OUT / 'input.f32').open('wb') as target:
    for frame in range(frames):
        level = .95 if frame < 2048 else .15 if frame < 4096 else 1.2 if frame < 6144 else .35
        left = level * math.sin(2 * math.pi * 233 * frame / sample_rate)
        right = level * .77 * math.sin(2 * math.pi * 377 * frame / sample_rate + .3)
        target.write(struct.pack('<ff', left, right))

default = [-1, 60, 0, .2, 1]
specs = [
    ('default', 'Default limiting', default, default, 128),
    ('hard', 'Lower threshold and short release', [-12, 20, 0, 0, 1], [-12, 20, 0, 0, 1], 128),
    ('dry', 'Dry mix with active detector', [-8, 100, 0, 0, 0], [-8, 100, 0, 0, 0], 128),
    ('threshold-sweep', 'Threshold, release, makeup, mix', default, [-14, 240, 6, .2, .65], 128),
    ('soft-clip', 'Soft clip amount sweep', [-7, 70, 0, 0, 1], [-7, 70, 0, 1, 1], 128),
    ('small-block', '64-frame blocks', [-10, 40, 2, .4, .9], [-3, 120, 0, .8, .5], 64),
    ('large-block', '256-frame blocks', [-9, 300, 0, 0, 1], [-5, 80, 4, .3, .8], 256),
]
cases = []
for case_id, label, before, after, block in specs:
    audio = f'{case_id}.f32'
    meter = f'{case_id}-meters.f32'
    args = [OUT / 'input.f32', OUT / audio, OUT / meter, *before, *after, sample_rate, block, step, frames]
    subprocess.run([binary, *(str(value) for value in args)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after,
                  'blockSize': block, 'output': audio, 'meterOutput': meter})
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'legacy C++ LimiterNode.cpp scalar stereo with gain-reduction meter',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ limiter cases to {OUT}')
