#!/usr/bin/env python3
"""Emit float32 fixtures using the original CrossfaderNode.cpp."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/crossfader"
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"), "crossfader"], text=True).strip()
source_hash = hashlib.sha256((LEGACY / "dsp/core/nodes/CrossfaderNode.cpp").read_bytes()).hexdigest()
shutil.copyfile(ROOT / "web/public/reference/svf/input.f32", OUT / "input.f32")

cases = []
specs = [
    ("equal-power-center", "Equal power · centre", 0, 0, 1, 1),
    ("equal-power-sweep", "Equal power · sweep", -1, 1, 1, 1),
    ("linear-sweep", "Linear · sweep", -1, 1, 0, 1),
    ("blended-curve", "Blended curve · 75% wet", -0.5, 0.5, 0.5, 0.75),
]
for case_id, label, before, after, curve, mix in specs:
    output = f"{case_id}.f32"
    subprocess.run([binary, str(OUT / "input.f32"), str(OUT / output), str(before), str(after), str(curve), str(mix), "48000", "128", "2048"], check=True)
    cases.append({"id": case_id, "label": label, "positionBefore": before, "positionAfter": after, "curve": curve, "mix": mix, "output": output})

(OUT / "manifest.json").write_text(json.dumps({
    "version": 1,
    "reference": "legacy C++ CrossfaderNode.cpp scalar path",
    "sourceSha256": source_hash,
    "sampleRate": 48000,
    "channels": 2,
    "frames": 4096,
    "blockSize": 128,
    "stepFrame": 2048,
    "input": "input.f32",
    "secondInput": {"kind": "constant", "value": 0.25},
    "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} C++ crossfader cases to {OUT}")
