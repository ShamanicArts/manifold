#!/usr/bin/env python3
"""Original C++ CompressorNode scalar audio and gain-reduction fixtures."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/compressor'
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'compressor'], text=True).strip()
source_hash = hashlib.sha256((LEGACY / 'dsp/core/nodes/CompressorNode.cpp').read_bytes()).hexdigest()
frames = 8192
sample_rate = 48000
step = 4096
with (OUT / 'input.f32').open('wb') as target:
    for frame in range(frames):
        level = .7 if frame < 2048 else .15 if frame < 4096 else .9 if frame < 6144 else .3
        left = level * math.sin(2 * math.pi * 233 * frame / sample_rate)
        right = level * .76 * math.sin(2 * math.pi * 377 * frame / sample_rate + .3)
        target.write(struct.pack('<ff', left, right))

default = [-12, 4, 10, 100, 6, 0, 1, 0, 0, 20, 1]
specs = [
    ('default', 'Default compression', default, default, 128),
    ('hard', 'Low threshold, high ratio', [-30, 12, 2, 200, 6, 0, 1, 0, 0, 20, 1], [-30, 12, 2, 200, 6, 0, 1, 0, 0, 20, 1], 128),
    ('dry', 'Dry mix with detector active', [-12, 4, 10, 100, 6, 0, 1, 0, 0, 20, 0], [-12, 4, 10, 100, 6, 0, 1, 0, 0, 20, 0], 128),
    ('threshold-sweep', 'Threshold, ratio, makeup, mix', default, [-30, 8, 10, 100, 6, 6, 1, 0, 0, 20, .5], 128),
    ('timing-after-prepare', 'Attack/release change after prepare', default, [-12, 4, 1, 20, 6, 0, 1, 0, 0, 20, 1], 128),
    ('inert-controls', 'Knee, auto, modes, HPF change', default, [-12, 4, 10, 100, 18, 0, 0, 2, 1, 900, 1], 128),
    ('small-block', '64-frame blocks', [-18, 5, 5, 250, 6, 2, 1, 0, 0, 20, .75], [-24, 8, 5, 250, 6, 4, 1, 0, 0, 20, .5], 64),
    ('large-block', '256-frame blocks', [-20, 6, 20, 150, 6, 0, 1, 0, 0, 20, 1], [-10, 2, 20, 150, 6, 0, 1, 0, 0, 20, 1], 256),
]
cases = []
for case_id, label, before, after, block in specs:
    audio = f'{case_id}.f32'
    meter = f'{case_id}-meters.f32'
    args = [OUT / 'input.f32', OUT / audio, OUT / meter, *before, *after, sample_rate, block, step, frames]
    subprocess.run([binary, *(str(value) for value in args)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after,
                  'blockSize': block, 'output': audio, 'meterOutput': meter})
for case_id in ['timing-after-prepare', 'inert-controls']:
    assert (OUT / f'{case_id}.f32').read_bytes() == (OUT / 'default.f32').read_bytes()
    assert (OUT / f'{case_id}-meters.f32').read_bytes() == (OUT / 'default-meters.f32').read_bytes()
(OUT / 'manifest.json').write_text(json.dumps({
    'version': 1, 'reference': 'legacy C++ CompressorNode.cpp scalar stereo with gain-reduction meter',
    'sourceSha256': source_hash, 'sampleRate': sample_rate, 'channels': 2,
    'frames': frames, 'stepFrame': step, 'input': 'input.f32', 'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ compressor cases to {OUT}')
