#!/usr/bin/env python3
"""Emit native Rust reference samples for the authored v2 effects chain."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/fx-chain"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_fx_chain"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_fx_chain"
sources = [ROOT / path for path in ["crates/manifold-core/src/graph.rs", "crates/manifold-core/src/distortion.rs", "crates/manifold-core/src/stereo_delay.rs", "crates/manifold-core/src/lib.rs", "projects/fx-chain/project.json", "crates/manifold-core/examples/render_fx_chain.rs"]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / "input.f32").open("wb") as output:
    for frame in range(frames):
        left = .55 if frame in (0, 5000, 11000) else 0
        right = -.45 if frame in (300, 5400, 11400) else 0
        if 2000 <= frame < 3900 or 9200 <= frame < 10500:
            left += .25 * math.sin(2 * math.pi * frame * 220 / sample_rate)
            right += .2 * math.sin(2 * math.pi * frame * 330 / sample_rate)
        output.write(struct.pack("<ff", left, right))
# drive, distortion mix/output, left/right delay ms, feedback, delay mix,
# filter cutoff/resonance, filter blend, filter mode.
specs = [
    ("gentle", "Gentle chain", [3, .25, .8, 25.29, 35.43, .35, .4, 2500, .3, .65, 0], [3, .25, .8, 25.29, 35.43, .35, .4, 2500, .3, .65, 0], 128),
    ("drive-delay", "Drive and feedback sweep", [2, .2, .8, 20.27, 32.31, .25, .5, 3200, .25, .4, 0], [12, .8, .65, 20.27, 32.31, .6, .75, 3200, .25, .4, 0], 128),
    ("filter-sweep", "Filter mode and cutoff change", [4, .5, .7, 22.37, 37.29, .4, .4, 700, .2, 1, 0], [4, .5, .7, 22.37, 37.29, .4, .4, 4500, .55, 1, 2], 64),
    ("bypass-to-wet", "Dry chain to all wet", [2, 0, 1, 18.27, 30.43, .3, 0, 1600, .2, 0, 0], [8, 1, 1, 18.27, 30.43, .55, 1, 1600, .2, 1, 0], 128),
]
cases = []
for case_id, label, before, after, block in specs:
    filename = f"{case_id}.f32"
    subprocess.run([runner, str(OUT / "input.f32"), str(OUT / filename), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({"id": case_id, "label": label, "before": before, "after": after, "blockSize": block, "output": filename})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust authored effects chain", "sourceSha256": source_hash,
    "sampleRate": sample_rate, "channels": 2, "frames": frames, "stepFrame": step,
    "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust effects-chain cases to {OUT}")
