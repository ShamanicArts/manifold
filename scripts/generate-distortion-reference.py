#!/usr/bin/env python3
"""Emit original C++ DistortionNode scalar stereo fixtures."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/distortion"
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"), "distortion"], text=True).strip()
source_hash = hashlib.sha256((LEGACY / "dsp/core/nodes/DistortionNode.cpp").read_bytes()).hexdigest()
with (OUT / "input.f32").open("wb") as output:
    for frame in range(4096):
        left = .65 * math.sin(2 * math.pi * frame * 233 / 48000) + .25 * math.sin(2 * math.pi * frame * 1703 / 48000)
        right = .55 * math.sin(2 * math.pi * frame * 331 / 48000) - .3 * math.sin(2 * math.pi * frame * 997 / 48000)
        if 800 <= frame < 840: left += .8
        if 3000 <= frame < 3040: right -= .8
        output.write(struct.pack("<ff", left, right))
specs = [
    ("default", "Default drive", 4, 4, .7, .7, .8, .8, 128),
    ("dry", "Dry path", 4, 4, 0, 0, 1, 1, 128),
    ("hard", "Hard drive", 20, 20, 1, 1, 1, 1, 128),
    ("drive-sweep", "Drive and mix sweep", 2, 18, .25, .9, .8, .8, 128),
    ("output-sweep", "Output sweep", 4, 4, .7, .7, .25, 1.5, 64),
    ("large-block", "512-frame blocks", 2, 18, .25, .9, .5, 1.5, 512),
]
keys = ["driveBefore", "driveAfter", "mixBefore", "mixAfter", "outputBefore", "outputAfter", "blockSize"]
cases = []
for case_id, label, *values in specs:
    output = f"{case_id}.f32"
    args = [OUT / "input.f32", OUT / output, *values[:6], 48000, values[6], 2048, 4096]
    subprocess.run([binary, *(str(value) for value in args)], check=True)
    cases.append({"id": case_id, "label": label, **dict(zip(keys, values)), "output": output})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "legacy C++ DistortionNode.cpp scalar stereo",
    "sourceSha256": source_hash, "sampleRate": 48000, "channels": 2,
    "frames": 4096, "stepFrame": 2048, "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} C++ distortion cases to {OUT}")
