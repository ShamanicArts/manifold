#!/usr/bin/env python3
"""Capture original C++ sample playback and the Rust file-backed region."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/main-sample-playback"
OUT.mkdir(parents=True, exist_ok=True)
legacy_runner = subprocess.check_output([str(ROOT / "scripts/build-legacy-main-sample-playback-reference.sh")], text=True).strip()
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_sample_region"], cwd=ROOT, check=True)
rust_runner = ROOT / "target/debug/examples/render_sample_region"
source_frames, frames, sample_rate, block = 4096, 8192, 48_000, 128
sample = OUT / "sample.f32"
with sample.open("wb") as output:
    for frame in range(source_frames):
        left = .3 * math.sin(2 * math.pi * 220 * frame / sample_rate) + (.2 if frame == 0 else 0)
        right = .2 * math.sin(2 * math.pi * 330 * frame / sample_rate) - (.15 if frame == 127 else 0)
        output.write(struct.pack("<ff", left, right))
(OUT / "input.f32").write_bytes(bytes(frames * 8))
cases = []
for case_id, speed, one_shot, crossfade in [
    ("loop-unit", 1.0, 0, 0.0),
    ("loop-half", .5, 0, 0.0),
    ("loop-fast", 1.5, 0, 0.0),
    ("one-shot", 1.0, 1, 0.0),
    ("crossfade-20", 1.0, 0, .2),
]:
    old_output, rust_output = f"{case_id}-cpp.f32", f"{case_id}-rust.f32"
    params = [speed, 0, one_shot, 0, 0, 1, crossfade]
    subprocess.run([legacy_runner, str(sample), str(OUT / old_output), str(source_frames),
                    str(frames), str(block), str(speed), str(one_shot), str(crossfade)], check=True)
    subprocess.run([rust_runner, str(sample), str(OUT / rust_output),
                    str(sample_rate), str(sample_rate), str(block), str(frames),
                    ",".join(map(str, params)), "0:9:60"], check=True)
    cases.append({"id": case_id, "label": f"Original sample player · speed {speed} · one-shot {one_shot} · seam {crossfade}",
                  "parameters": params, "events": [[0, 9, 60]], "blockSize": block,
                  "output": rust_output, "legacyOutput": old_output})

def digest(paths):
    return hashlib.sha256(b"".join(path.read_bytes() for path in paths)).hexdigest()

(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "original C++ SampleRegionPlaybackNode and native Rust SampleRegion",
    "scope": "original player from captured stereo audio; old center pan applied before later Main voice stages",
    "legacySourceSha256": digest([LEGACY / "dsp/core/nodes/SampleRegionPlaybackNode.cpp"]),
    "referenceHarnessSha256": digest([ROOT / "tools/legacy-main-sample-playback-reference.cpp",
                                      ROOT / "scripts/build-legacy-main-sample-playback-reference.sh"]),
    "rustSourceSha256": digest([ROOT / "crates/manifold-core/src/sample_region.rs",
                                ROOT / "crates/manifold-core/src/graph.rs"]),
    "wasmSha256": hashlib.sha256((ROOT / "web/public/manifold_filter.wasm").read_bytes()).hexdigest(),
    "sampleRate": sample_rate, "sampleSourceRate": sample_rate, "sampleFrames": source_frames,
    "sample": "sample.f32", "input": "input.f32", "frames": frames, "channels": 2,
    "stepFrame": 4096, "legacyCenterPanGain": 2 ** -.5, "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} compiled C++ and Rust sample playback cases to {OUT}")
