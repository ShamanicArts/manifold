#!/usr/bin/env python3
"""Emit native Rust reference samples for Standalone FX type IDs 6 and 8."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/standalone-fx"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_effect_slot"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_effect_slot"
sources = [ROOT / path for path in ["crates/manifold-core/src/graph.rs", "crates/manifold-core/src/effect_slot.rs", "crates/manifold-core/src/stereo_delay.rs", "crates/manifold-core/src/lib.rs", "projects/standalone-fx-slice/project.json", "crates/manifold-core/examples/render_effect_slot.rs"]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / "input.f32").open("wb") as output:
    for frame in range(frames):
        left = .65 if frame in (0, 5400, 10700) else 0
        right = -.5 if frame in (300, 5800, 11100) else 0
        if 1500 <= frame < 4300 or 9300 <= frame < 12500:
            left += .3 * math.sin(2 * math.pi * frame * 220 / sample_rate)
            right += .24 * math.sin(2 * math.pi * frame * 330 / sample_rate)
        output.write(struct.pack("<ff", left, right))
# type, mix, p/0..p/4. Type 6=SVF, 8=Stereo Delay.
specs = [
    ("dry-default", "Dry default, then wet filter", [6, 0, .5, .4, .1, .5, .5], [6, .8, .5, .4, .1, .5, .5], 128),
    ("filter-sweep", "Filter cutoff and drive", [6, .75, .25, .3, .1, .5, .5], [6, .75, .8, .7, .5, .5, .5], 128),
    ("delay-feedback", "Delay time and feedback", [8, .8, .06, .25, .5, .5, .5], [8, .8, .15, .65, .5, .5, .5], 64),
    ("filter-to-delay", "Switch filter to delay", [6, .7, .5, .4, .1, .5, .5], [8, .7, .1, .4, .5, .5, .5], 128),
    ("delay-to-filter", "Switch delay to filter", [8, .65, .09, .45, .5, .5, .5], [6, .65, .7, .25, .2, .5, .5], 128),
]
cases = []
for case_id, label, before, after, block in specs:
    filename = f"{case_id}.f32"
    subprocess.run([runner, str(OUT / "input.f32"), str(OUT / filename), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({"id": case_id, "label": label, "before": before, "after": after, "blockSize": block, "output": filename})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust Standalone FX slot slice", "sourceSha256": source_hash,
    "sampleRate": sample_rate, "channels": 2, "frames": frames, "stepFrame": step,
    "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust effect-slot cases to {OUT}")
