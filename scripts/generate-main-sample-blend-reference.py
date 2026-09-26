#!/usr/bin/env python3
"""Render the Main sample branch study through native Rust for browser comparison."""
import hashlib
import json
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/main-sample-blend"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_main_sample_blend"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_main_sample_blend"
sources = [ROOT / path for path in [
    "crates/manifold-core/src/graph.rs", "crates/manifold-core/src/sample_region.rs",
    "crates/manifold-core/src/sine_bank.rs", "crates/manifold-core/src/temporal_partials.rs",
    "crates/manifold-core/src/spectral_targets.rs", "crates/manifold-core/examples/render_main_sample_blend.rs",
    "projects/main-sample-blend/project.json",
]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
source_rate, sample_frames = 48_000, 48_000
sample_path = OUT / "source.f32"
with sample_path.open("wb") as output:
    for frame in range(sample_frames):
        sample = .35 * math.sin(2 * math.pi * 220 * frame / source_rate) + .12 * math.sin(2 * math.pi * 440 * frame / source_rate)
        output.write(struct.pack("<ff", sample, sample * .9))
frames, block = 16_384, 128
(OUT / "input.f32").write_bytes(bytes(frames * 8))
cases = []
for case_id, label, mode, sample_gain, bank_gain in [
    ("sample", "Sample branch alone", 1, 1.0, 0.0),
    ("add", "Add branch alone", 1, 0.0, 1.0),
    ("morph", "Morph branch alone", 2, 0.0, 1.0),
    ("blend", "Sample + Morph at equal gain", 2, 0.5, 0.5),
]:
    output, target = f"{case_id}.f32", f"{case_id}-target.f32"
    subprocess.run([runner, str(sample_path), str(OUT / output), str(OUT / target), str(mode),
                    str(sample_gain), str(bank_gain), str(frames)], check=True)
    cases.append({"id": case_id, "label": label, "mode": mode, "sampleGain": sample_gain,
                  "bankGain": bank_gain, "target": target, "output": output, "blockSize": block})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust Main sample blend study", "sourceSha256": source_hash,
    "sampleRate": source_rate, "sampleSourceRate": source_rate, "sampleFrames": sample_frames,
    "sample": "source.f32", "channels": 2, "frames": frames, "stepFrame": frames // 2,
    "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust Main sample blend cases to {OUT}")
