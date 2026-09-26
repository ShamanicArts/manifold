#!/usr/bin/env python3
"""Capture native Rust Main bank audio for the browser/Wasm comparison lab."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/main-voice-bank"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_main_voice_bank"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_main_voice_bank"
sources = [ROOT / path for path in [
    "crates/manifold-core/src/graph.rs", "crates/manifold-core/src/main_voice_allocator.rs",
    "crates/manifold-core/src/main_voice_bank.rs", "crates/manifold-core/src/main_directional.rs",
    "crates/manifold-core/src/main_pitch.rs", "crates/manifold-core/src/phase_vocoder.rs",
    "crates/manifold-core/examples/render_main_voice_bank.rs", "projects/main-voice-bank/project.json",
]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
source_rate, sample_frames = 32_000, 4096
sample_path = OUT / "sample.f32"
with sample_path.open("wb") as output:
    for frame in range(sample_frames):
        time = frame / source_rate
        tone = (0.5 * math.sin(2 * math.pi * 220 * time) + 0.15 * math.sin(2 * math.pi * 660 * time))
        output.write(struct.pack("<ff", tone, tone * 0.8))
frames, sample_rate, block = 8192, 48_000, 128
(OUT / "input.f32").write_bytes(bytes(frames * 8))
base = [0, 0, 60, 2, 0, 0, 0, .5, .5, 0, 1, .005, .08, .8, .05, 1, 1]
def params(**changes):
    result = base.copy()
    for id, value in changes.items():
        result[int(id)] = value
    return result

specs = [
    ("wave-chord", "Three independent wave voices", params(**{"1": -1}),
     [(0, 0, 0, 60, 100), (237, 0, 0, 64, 83), (997, 0, 0, 67, 127)], []),
    ("sample-chord", "Three independent sample playheads", params(**{"1": 1}),
     [(0, 0, 0, 60, 100), (237, 0, 0, 64, 83), (997, 0, 0, 67, 127)], []),
    ("release-duplicate", "Duplicate keys release together", params(**{"1": .25}),
     [(0, 0, 0, 60, 127), (297, 0, 1, 60, 64), (3200, 1, 0, 60, 0),
      (5000, 0, 0, 67, 100)], []),
    ("oldest-steal", "Ninth key steals the oldest active voice", params(**{"1": -.25}),
     [(index * 173, 0, 0, 60 + index, 100) for index in range(9)] + [(4500, 1, 0, 60, 0)], []),
    ("fm-chord", "Per-voice FM motion", params(**{"1": 0, "6": 2, "7": .9, "9": .5}),
     [(0, 0, 0, 60, 100), (611, 0, 0, 67, 120)], []),
    ("vocoder-chord", "Per-voice spectral pitch", params(**{"1": 1, "5": 1, "4": 7}),
     [(0, 0, 0, 60, 100), (611, 0, 0, 67, 120)], []),
    ("sync-chord", "Per-voice Sync retrigger", params(**{"1": -.2, "6": 3}),
     [(0, 0, 0, 60, 100), (611, 0, 0, 67, 120)], []),
]
cases = []
for case_id, label, parameters, events, changes in specs:
    filename = f"{case_id}.f32"
    subprocess.run([runner, str(sample_path), str(OUT / filename), str(source_rate), str(sample_rate),
                    str(block), str(frames), ",".join(map(str, parameters)),
                    ",".join(":".join(map(str, event)) for event in events),
                    ",".join(":".join(map(str, change)) for change in changes)], check=True)
    case = {"id": case_id, "label": label, "parameters": parameters, "events": events,
            "changes": changes, "blockSize": block, "output": filename}
    if case_id == "vocoder-chord":
        case["comparisonTolerance"] = {"max": .005, "rms": .0005}
        case["comparisonNote"] = "Bounded native/Wasm spectral phase variance; this is not a bit-exact match."
    cases.append(case)
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust Main base voice bank; not original JUCE audio",
    "sourceSha256": source_hash, "sampleRate": sample_rate, "sampleSourceRate": source_rate,
    "sampleFrames": sample_frames, "sample": "sample.f32", "channels": 2,
    "frames": frames, "stepFrame": 4096, "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust Main voice bank cases to {OUT}")
