#!/usr/bin/env python3
"""Emit float32 fixtures using the original MixerNode.cpp scalar path."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/mixer"
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"), "mixer"], text=True).strip()
source_hash = hashlib.sha256((LEGACY / "dsp/core/nodes/MixerNode.cpp").read_bytes()).hexdigest()
shutil.copyfile(ROOT / "web/public/reference/svf/input.f32", OUT / "input.f32")

specs = [
    ("two-bus-centre", "2 buses · centre", 2, 0.6, 0.4, 0, 0, 0.8, 0.4, 0, 0.8, 128),
    ("gain-pan-master-sweep", "2 buses · gain/pan/master sweep", 2, 0.6, 0.2, -0.4, -0.8, 0.8, 1.2, 0.9, 1.3, 128),
    ("four-bus", "4 buses · stereo sum", 4, 0.4, 0.3, -0.5, 0.2, 0.65, 0.8, -0.8, 1.1, 128),
    ("thirty-two-bus", "32 buses · full port range", 32, 0.2, 0.15, 0, 0, 0.5, 0.4, 0.5, 0.8, 64),
]
cases = []
for case_id, label, buses, gain1, gain2, pan1, pan2, master, gain2_after, pan2_after, master_after, block_size in specs:
    output = f"{case_id}.f32"
    values = [buses, gain1, gain2, pan1, pan2, master, gain2_after, pan2_after, master_after, 48000, block_size, 2048]
    subprocess.run([binary, str(OUT / "input.f32"), str(OUT / output), *(str(value) for value in values)], check=True)
    cases.append({
        "id": case_id, "label": label, "buses": buses, "gain1": gain1, "gain2": gain2,
        "pan1": pan1, "pan2": pan2, "master": master, "gain2After": gain2_after,
        "pan2After": pan2_after, "masterAfter": master_after, "blockSize": block_size,
        "output": output,
    })

(OUT / "manifest.json").write_text(json.dumps({
    "version": 1,
    "reference": "legacy C++ MixerNode.cpp scalar path",
    "sourceSha256": source_hash,
    "sampleRate": 48000,
    "channels": 2,
    "frames": 4096,
    "stepFrame": 2048,
    "input": "input.f32",
    "extraInputs": "bus 2 = 0.25 stereo; bus n>=3 = 0.1 + 0.01*n stereo",
    "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} C++ mixer cases to {OUT}")
