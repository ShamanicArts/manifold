#!/usr/bin/env python3
"""Capture the original SineBank Add/Morph helpers and Oscillator wave recipes."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
legacy = Path(os.environ.get('MANIFOLD_LEGACY_DIR', root.parent / 'my-plugin'))
runner = subprocess.check_output(['bash', str(root / 'scripts/build-legacy-spectral-target-reference.sh')], text=True).strip()
source_hash = hashlib.sha256(b''.join((legacy / name).read_bytes() for name in [
    'dsp/core/nodes/SineBankNode.cpp',
    'dsp/core/nodes/OscillatorNode.cpp',
    'dsp/core/nodes/TemporalPartialData.h',
])).hexdigest()
labels = ['Sine wave', 'Saw wave', 'Square wave', 'Triangle wave', 'Blend wave',
          'Noise cloud', 'Pulse wave', 'SuperSaw wave', 'Self Add', 'Driven Add',
          'Morph at 0%', 'Morph at 50%', 'Morph at 100%',
          'Temporal step', 'Temporal smooth', 'Temporal contrast', 'Temporal endpoint']
cases = []
for case_id, label in enumerate(labels):
    data = json.loads(subprocess.check_output([runner, str(case_id)]))
    data['label'] = label
    cases.append(data)
out = root / 'web/public/reference/spectral-targets'
out.mkdir(parents=True, exist_ok=True)
(out / 'manifest.json').write_text(json.dumps({
    'version': 1,
    'reference': 'Original SineBankNode recipe helpers and OscillatorNode buildWavePartials',
    'sourceSha256': source_hash,
    'cases': cases,
}, indent=2) + '\n')
print(f'Wrote {len(cases)} old spectral recipe captures to {out}')
