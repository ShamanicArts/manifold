#!/usr/bin/env python3
"""Generate native Rust cases for the authored eight-voice sample instrument."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/sample-instrument"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_sample_instrument"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_sample_instrument"
sources = [ROOT / path for path in [
    "crates/manifold-core/src/graph.rs", "crates/manifold-core/src/sample_region.rs",
    "crates/manifold-core/src/sample_instrument.rs", "crates/manifold-core/examples/render_sample_instrument.rs",
    "projects/sample-instrument/project.json",
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
defaults = [60, 1, .25, 1, 0, 0, 0, 0, 1, .08, .01, 1, 0, 0]
specs = [
    ("root", "Root note and note off", defaults, [(0, 0, 0, 60, 127), (8192, 1, 0, 60, 0)], []),
    ("octave", "Root plus octave", defaults, [(0, 0, 0, 60, 100), (321, 0, 0, 72, 127), (8192, 1, 0, 60, 0), (12032, 1, 0, 72, 0)], []),
    ("chord", "Three voices and velocities", defaults, [(0, 0, 0, 60, 100), (47, 0, 1, 64, 80), (91, 0, 0, 67, 127), (9216, 1, 1, 64, 0)], []),
    ("steal", "Ninth note steals oldest", defaults, [(i * 17, 0, 0, 60 + i, 100) for i in range(9)] + [(1024, 1, 0, 60, 0), (12288, 2, 0, 0, 0)], []),
    ("one-shot-reverse", "Reverse one shot", [60, 1, .25, 1, 1, 1, 0, 0, 1, .08, .01, 1, 0, 0], [(0, 0, 0, 60, 127), (8192, 0, 0, 67, 90)], []),
    ("keytrack-change", "Key tracking and speed change", defaults, [(0, 0, 0, 72, 127)], [(4096, 1, 0), (8192, 3, .5)]),
    ("release", "Adjustable note release", defaults, [(0, 0, 0, 60, 127), (2048, 1, 0, 60, 0), (8192, 0, 0, 60, 127), (10240, 1, 0, 60, 0)], [(8192, 10, .05)]),
    ("unison", "Detuned stereo unison", defaults[:11] + [3, 35, .75], [(0, 0, 0, 60, 127), (8192, 0, 0, 67, 100)], []),
    ("unison-change", "Unison count on next note", defaults, [(0, 0, 0, 60, 127), (8192, 0, 0, 67, 127)], [(8192, 11, 4), (8192, 12, 50), (8192, 13, 1)]),
    ("one-shot-unison", "One shot with detuned subvoices", defaults[:5] + [1] + defaults[6:11] + [4, 100, 1], [(0, 0, 0, 60, 127)], []),
    ("bend-active", "Active sample bends one octave", defaults, [(0, 0, 0, 60, 127), (4157, 3, 0, 0, 96), (8213, 3, 0, 0, 64)], []),
    ("bend-channel", "Bend only the addressed channel", defaults, [(0, 0, 0, 60, 127), (1, 0, 1, 67, 127), (4157, 3, 0, 0, 96), (8213, 3, 1, 0, 32)], []),
]
cases = []
for case_id, label, parameters, events, changes in specs:
    filename = f"{case_id}.f32"
    subprocess.run([runner, str(sample_path), str(OUT / filename), str(source_rate), str(sample_rate),
                    str(block), str(frames), ",".join(map(str, parameters)),
                    ",".join(":".join(map(str, event)) for event in events),
                    ",".join(":".join(map(str, change)) for change in changes)], check=True)
    cases.append({"id": case_id, "label": label, "parameters": parameters, "events": events,
                  "changes": changes, "blockSize": block, "output": filename})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust shared-sample eight-voice instrument", "sourceSha256": source_hash,
    "sampleRate": sample_rate, "sampleSourceRate": source_rate, "sampleFrames": sample_frames,
    "sample": "sample.f32", "channels": 2, "frames": frames, "stepFrame": 8192,
    "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust sample-instrument cases to {OUT}")
