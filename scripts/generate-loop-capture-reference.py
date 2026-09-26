#!/usr/bin/env python3
"""Generate native Rust reference cases for bounded stereo live capture."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/loop-capture"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_loop_capture"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_loop_capture"
sources = [ROOT / path for path in ["crates/manifold-core/src/graph.rs", "crates/manifold-core/src/loop_capture.rs", "crates/manifold-core/src/lib.rs", "projects/loop-capture/project.json", "crates/manifold-core/examples/render_loop_capture.rs"]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
frames, sample_rate = 16384, 48000
with (OUT / "input.f32").open("wb") as output:
    for frame in range(frames):
        left = right = 0
        if frame < 4096:
            left = .35 * math.sin(2 * math.pi * frame * 220 / sample_rate)
            right = .28 * math.sin(2 * math.pi * frame * 330 / sample_rate)
        elif 8192 <= frame < 12288:
            left = .2 * math.sin(2 * math.pi * frame * 440 / sample_rate)
            right = .15 * math.sin(2 * math.pi * frame * 550 / sample_rate)
        if frame in (0, 300, 2400, 8192): left += .5
        if frame in (128, 2700, 8450): right -= .45
        output.write(struct.pack("<ff", left, right))
# Every control change lands on a block boundary. Parameter IDs: record, play,
# overdub, speed, reverse, mix, overdub level.
specs = [
    ("record-play", "Record, then loop", .25, 1, 128, [(0, 0, 1), (4096, 0, 0), (4096, 1, 1)]),
    ("capture-wrap", "Keep recent audio when full", .05, 1, 128, [(0, 0, 1), (4096, 0, 0), (4096, 1, 1)]),
    ("reverse-speed", "Reverse and change speed", .25, 1, 128, [(0, 0, 1), (4096, 0, 0), (4096, 1, 1), (8192, 4, 1), (12288, 3, .5)]),
    ("overdub", "Overdub a second phrase", .25, 1, 128, [(0, 0, 1), (4096, 0, 0), (4096, 1, 1), (8192, 2, 1), (12288, 2, 0)]),
    ("pause-resume", "Pause and resume playhead", .25, .75, 64, [(0, 0, 1), (4096, 0, 0), (4096, 1, 1), (8192, 1, 0), (12288, 1, 1)]),
]
cases = []
for case_id, label, capacity, mix, block, events in specs:
    filename = f"{case_id}.f32"
    event_arg = ",".join(f"{frame}:{id}:{value}" for frame, id, value in events)
    subprocess.run([runner, str(OUT / "input.f32"), str(OUT / filename), str(sample_rate), str(block), str(frames), str(capacity), str(mix), event_arg], check=True)
    cases.append({"id": case_id, "label": label, "capacitySeconds": capacity, "mix": mix, "blockSize": block, "events": events, "output": filename})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust bounded loop capture", "sourceSha256": source_hash,
    "sampleRate": sample_rate, "channels": 2, "frames": frames, "stepFrame": 8192,
    "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust loop-capture cases to {OUT}")
