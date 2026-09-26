#!/usr/bin/env python3
"""Generate native Rust playback cases from one bounded decoded stereo sample."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/sample-region"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_sample_region"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_sample_region"
sources = [ROOT / path for path in [
    "crates/manifold-core/src/graph.rs", "crates/manifold-core/src/sample_region.rs",
    "crates/manifold-core/src/lib.rs", "crates/manifold-core/examples/render_sample_region.rs",
    "projects/sample-region/project.json",
]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
sample_frames, source_rate = 4096, 32000
sample_path = OUT / "sample.f32"
with sample_path.open("wb") as output:
    for frame in range(sample_frames):
        time = frame / source_rate
        envelope = (1 - frame / sample_frames) ** 1.5
        tone = envelope * (.35 * math.sin(2 * math.pi * 220 * time) + .15 * math.sin(2 * math.pi * 660 * time))
        output.write(struct.pack("<ff", tone + (.5 if frame == 0 else 0), tone * .7 - (.4 if frame == 127 else 0)))
frames, sample_rate, block = 16384, 48000, 128
(OUT / "input.f32").write_bytes(bytes(frames * 8))
specs = [
    ("loop", "Forward loop across blocks", [1, 0, 0, 0, 0, 1], [(0, 8, 60)]),
    ("one-shot", "One-shot ends in silence", [1, 0, 1, 0, 0, 1], [(0, 8, 60)]),
    ("reverse", "Reverse playback from loop end", [1, 1, 0, 0, .1, .9], [(0, 8, 60)]),
    ("region-speed", "Selected region and speed change", [.5, 0, 0, .2, .2, .6], [(0, 8, 60), (8192, 0, 1.5)]),
    ("retrigger", "Timed note retriggers playback", [1, 0, 1, 0, 0, 1], [(0, 8, 60), (8192, 8, 64)]),
]
cases = []
for case_id, label, parameters, events in specs:
    filename = f"{case_id}.f32"
    subprocess.run([runner, str(sample_path), str(OUT / filename), str(source_rate), str(sample_rate),
                    str(block), str(frames), ",".join(map(str, parameters)),
                    ",".join(f"{frame}:{id}:{value}" for frame, id, value in events)], check=True)
    cases.append({"id": case_id, "label": label, "parameters": parameters, "events": events,
                  "blockSize": block, "output": filename})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust file-backed sample region", "sourceSha256": source_hash,
    "sampleRate": sample_rate, "sampleSourceRate": source_rate, "sampleFrames": sample_frames,
    "sample": "sample.f32", "channels": 2, "frames": frames, "stepFrame": 8192,
    "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust sample-region cases to {OUT}")
