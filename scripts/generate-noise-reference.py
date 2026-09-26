#!/usr/bin/env python3
"""Emit deterministic original C++ NoiseGeneratorNode fixtures."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/noise"
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"), "noise"], text=True).strip()
source_hash = hashlib.sha256((LEGACY / "dsp/core/nodes/NoiseGeneratorNode.cpp").read_bytes()).hexdigest()
specs = [
    ("bright", "Bright noise", .5, .5, 0, 0, 128),
    ("dark", "Dark noise", .5, .5, 1, 1, 128),
    ("color-sweep", "Color sweep", .5, .5, 0, 1, 128),
    ("level-sweep", "Level sweep", .1, .8, .3, .3, 128),
    ("small-block", "64-frame blocks", .3, .7, .2, .9, 64),
    ("large-block", "512-frame blocks", .3, .7, .2, .9, 512),
]
cases = []
for case_id, label, level_before, level_after, color_before, color_after, block_size in specs:
    output = f"{case_id}.f32"
    args = [level_before, level_after, color_before, color_after, 48000, block_size, 2048, 4096]
    subprocess.run([binary, str(OUT / output), *(str(value) for value in args)], check=True)
    cases.append({"id": case_id, "label": label, "levelBefore": level_before,
                  "levelAfter": level_after, "colorBefore": color_before,
                  "colorAfter": color_after, "blockSize": block_size, "output": output})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "legacy C++ NoiseGeneratorNode.cpp",
    "sourceSha256": source_hash, "sampleRate": 48000, "channels": 2,
    "frames": 4096, "stepFrame": 2048, "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
(OUT / "input.f32").write_bytes(bytes(4096 * 2 * 4))
print(f"Wrote {len(cases)} C++ noise cases to {OUT}")
