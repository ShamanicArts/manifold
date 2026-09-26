#!/usr/bin/env python3
"""Capture legacy C++ SineBankNode manual mode with deterministic sync input."""
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/sine-bank'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-reference.sh'), 'sine-bank'], text=True).strip()
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/SineBankNode.cpp', 'dsp/core/nodes/SineBankNode.h',
])).hexdigest()
frames, rate, step = 16384, 48000, 8192
with (OUT / 'input.f32').open('wb') as output:
    for frame in range(frames):
        pulse = 1.0 if frame in (0, 1500, 8180, 10500) else -1.0
        output.write(struct.pack('<ff', pulse, pulse))

default = [440, .6, 1, 0, 1, 0, 0, 0, 0, 1, 0]
def changed(base, **items):
    result = base.copy()
    for key, value in items.items():
        result[int(key[1:])] = value
    return result

specs = [
    ('single', 'Single partial · manual', 1, default, default, 128),
    ('saw-eight', 'Eight harmonic partials', 2, default, default, 128),
    ('odd-thirty-two', '32 slots · odd harmonics', 3, default, default, 128),
    ('pitch-ramp', '220 → 880 Hz', 2, changed(default, p0=220), changed(default, p0=880), 128),
    ('unison-spread', '1 → 4 voices · spread / detune', 2, default, changed(default, p3=.85, p4=4, p5=21), 128),
    ('drive-fold', 'Drive → fold with bias', 2, default, changed(default, p6=6, p7=3, p8=.25, p9=.8), 128),
    ('sync', 'Sync restarts oscillator phases', 2, changed(default, p10=1), changed(default, p10=1), 128),
    ('disabled', 'Enabled → silent', 2, default, changed(default, p2=0), 128),
    ('empty', 'No active partials', 0, default, default, 64),
]

def partials(preset):
    count = {0: 0, 1: 1, 2: 8, 3: 32}[preset]
    values = []
    for index in range(count):
        harmonic = index + 1
        amplitude = 1 if preset == 1 else 1 / harmonic if preset == 2 else (1 / harmonic if harmonic % 2 else 0)
        values.extend([440 * harmonic, amplitude, 0, .25])
    return values

cases = []
for case_id, label, preset, before, after, block in specs:
    output = f'{case_id}.f32'
    subprocess.run([runner, str(OUT / output), str(OUT / 'input.f32'), str(rate), str(block), str(frames),
                    str(step), str(preset), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({'id': case_id, 'label': label, 'before': before, 'after': after,
                  'blockSize': block, 'partials': partials(preset), 'output': output})

(OUT / 'manifest.json').write_text(json.dumps({'version': 1, 'reference': 'legacy C++ SineBankNode manual mode',
    'sourceSha256': source_hash, 'sampleRate': rate, 'channels': 2, 'frames': frames,
    'stepFrame': step, 'input': 'input.f32', 'cases': cases}, indent=2) + '\n')
print(f'Wrote {len(cases)} C++ sine bank cases to {OUT}')
