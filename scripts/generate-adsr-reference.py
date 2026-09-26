#!/usr/bin/env python3
"""Emit original C++ ADSREnvelopeNode scalar gate-cycle fixtures."""
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/adsr"
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"), "adsr"], text=True).strip()
source_hash = hashlib.sha256((LEGACY / "dsp/core/nodes/ADSREnvelopeNode.cpp").read_bytes()).hexdigest()
specs = [
    ("default", "Default curve", .05, .2, .7, .4, 14336, 128),
    ("pluck", "Pluck", .005, .02, .15, .06, 8192, 128),
    ("pad", "Soft onset", .03, .05, .8, .15, 8192, 128),
    ("short-block", "64-frame blocks", .01, .02, .5, .08, 8192, 64),
    ("long-block", "512-frame blocks", .01, .02, .5, .08, 8192, 512),
]
cases = []
frames = 16384
for case_id, label, attack, decay, sustain, release, gate_off, block_size in specs:
    output = f"{case_id}.f32"
    args = [attack, decay, sustain, release, gate_off, 48000, block_size, frames, .5]
    subprocess.run([binary, str(OUT / output), *(str(value) for value in args)], check=True)
    cases.append({"id": case_id, "label": label, "attack": attack, "decay": decay,
                  "sustain": sustain, "release": release, "gateOffFrame": gate_off,
                  "blockSize": block_size, "output": output})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "legacy C++ ADSREnvelopeNode.cpp scalar gate cycle",
    "sourceSha256": source_hash, "sampleRate": 48000, "channels": 2,
    "frames": frames, "stepFrame": 8192, "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
with (OUT / "input.f32").open("wb") as output:
    for _ in range(frames): output.write(struct.pack("<ff", .5, -.25))
print(f"Wrote {len(cases)} C++ ADSR cases to {OUT}")
