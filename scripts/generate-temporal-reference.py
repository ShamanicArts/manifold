#!/usr/bin/env python3
"""Capture selected old temporal partial extraction with an explicit pitch decision."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get('MANIFOLD_LEGACY_DIR', ROOT.parent / 'my-plugin'))
OUT = ROOT / 'web/public/reference/temporal-partials'
OUT.mkdir(parents=True, exist_ok=True)
runner = subprocess.check_output(['bash', str(ROOT / 'scripts/build-legacy-temporal-reference.sh')], text=True).strip()
rate = 48_000
frames = rate
source_hash = hashlib.sha256(b''.join((LEGACY / name).read_bytes() for name in [
    'dsp/core/nodes/PartialsExtractor.h', 'dsp/core/nodes/TemporalPartialData.h',
    'external/JUCE/modules/juce_dsp/frequency/juce_FFT.cpp',
])).hexdigest()

def xorshift(seed):
    seed ^= (seed << 13) & 0xffffffff
    seed ^= seed >> 17
    seed ^= (seed << 5) & 0xffffffff
    return seed & 0xffffffff

cases = [
    ('two-tone', '220 + 440 Hz, pitched', 4096, rate - 4096, 220, 12),
    ('broadband', 'Seeded broadband source', 0, rate, 0, 8),
    ('transient', 'Short noise burst', 0, rate, 0, 8),
    ('silence', 'Silent source', 0, rate, 0, 8),
]
manifest_cases = []
for case_id, label, start, end, fundamental, max_frames in cases:
    seed = 0x9e3779b9
    input_path = OUT / f'{case_id}.f32'
    with input_path.open('wb') as output:
        for frame in range(frames):
            if case_id == 'two-tone':
                left = .5 * math.sin(2 * math.pi * 220 * frame / rate) + .2 * math.sin(2 * math.pi * 440 * frame / rate)
                right = left * .9
            elif case_id in ('broadband', 'transient'):
                seed = xorshift(seed)
                noise = ((seed / 0xffffffff) - .5) * .4
                if case_id == 'transient':
                    envelope = 1 - (frame - 6000) / 1024 if 6000 <= frame < 7024 else 0
                    noise *= envelope
                left = right = noise
            else:
                left = right = 0
            output.write(struct.pack('<ff', left, right))
    output_name = f'{case_id}.json'
    subprocess.run([runner, str(OUT / output_name), str(input_path), str(frames), str(rate),
                    str(start), str(end), str(fundamental), str(max_frames)], check=True)
    manifest_cases.append({'id': case_id, 'label': label, 'input': input_path.name, 'output': output_name,
                           'sourceFrames': frames, 'regionStart': start, 'regionEnd': end,
                           'legacyFundamental': fundamental, 'maxFrames': max_frames})

(OUT / 'manifest.json').write_text(json.dumps({'version': 1, 'reference': 'legacy PartialsExtractor temporal frames with supplied pitch decision',
    'sourceSha256': source_hash, 'sampleRate': rate, 'cases': manifest_cases}, indent=2) + '\n')
print(f'Wrote {len(cases)} old temporal extractor captures to {OUT}')
