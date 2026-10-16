#!/usr/bin/env python3
"""Compare native Rust Chorus output with checked-in original C++ captures."""
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / 'web/public/reference/chorus'
manifest = json.loads((FIXTURES / 'manifest.json').read_text())
subprocess.run(['cargo', 'build', '-p', 'manifold-core', '--example', 'render_chorus'], cwd=ROOT, check=True)
runner = ROOT / 'target/debug/examples/render_chorus'
rendered_dir = ROOT / 'target/reference-rendered/chorus'
rendered_dir.mkdir(parents=True, exist_ok=True)

def samples(path):
    raw = path.read_bytes()
    return struct.unpack(f'<{len(raw) // 4}f', raw)

failed = False
for case in manifest['cases']:
    rendered = rendered_dir / case['output']
    args = [FIXTURES / manifest['input'], rendered, manifest['sampleRate'], case['blockSize'],
            manifest['stepFrame'], manifest['frames'], *case['before'], *case['after']]
    subprocess.run([str(runner), *(str(value) for value in args)], check=True)
    legacy, rust = samples(FIXTURES / case['output']), samples(rendered)
    if len(legacy) != len(rust): raise SystemExit(f"{case['id']}: sample count mismatch")
    differences = [abs(a - b) for a, b in zip(legacy, rust)]
    peak = max(differences)
    rms = math.sqrt(sum(value * value for value in differences) / len(differences))
    print(f"{case['id']:20s} maxAbs={peak:.8f} rmsDiff={rms:.8f}")
    failed |= not math.isfinite(peak) or peak > .00001
if failed: raise SystemExit('Chorus parity exceeds 0.00001 maximum sample error')
