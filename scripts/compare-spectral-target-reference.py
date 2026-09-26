#!/usr/bin/env python3
"""Compare native Rust prepared targets with checked-in original C++ captures."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'web/public/reference/spectral-targets/manifest.json').read_text())
binary = root / 'target/release/examples/spectral_targets_probe'
report = []
rust_cases = []
for before in manifest['cases']:
    after = json.loads(subprocess.check_output([str(binary), str(before['id'])]))
    assert len(before['partials']) == len(after['partials']), (before['id'], 'partial count')
    errors = [max(abs(old[column] - new[column]) for old, new in zip(before['partials'], after['partials']))
              for column in range(4)] if before['partials'] else [0.0] * 4
    fundamental_error = abs(before['fundamental'] - after['fundamental'])
    assert errors[0] < 3e-5 and max(errors[1:] + [fundamental_error]) < 1e-5, (before['id'], errors, fundamental_error)
    result = {'id': before['id'], 'label': before['label'], 'partials': len(before['partials']),
              'worstFrequency': errors[0], 'worstAmplitude': errors[1],
              'worstPhase': errors[2], 'worstDecay': errors[3],
              'fundamentalError': fundamental_error}
    report.append(result)
    rust_cases.append(after)
    print(json.dumps(result))
out = root / 'artifacts/reviews/checkpoint-106-spectral-target-comparison.json'
out.write_text(json.dumps(report, indent=2) + '\n')
(root / 'web/public/reference/spectral-targets/rust-cases.json').write_text(
    json.dumps({'version': 1, 'cases': rust_cases}, indent=2) + '\n')
