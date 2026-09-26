#!/usr/bin/env python3
"""Capture original JUCE and native Rust phase vocoder cases from one stereo source."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/phase-vocoder"
OUT.mkdir(parents=True, exist_ok=True)
cpp = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-phase-vocoder-reference.sh")], text=True).strip()
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_phase_vocoder"], cwd=ROOT, check=True)
rust = ROOT / "target/debug/examples/render_phase_vocoder"
source_hash = hashlib.sha256(b"".join((LEGACY / path).read_bytes() for path in [
    "dsp/core/nodes/PhaseVocoderNode.cpp", "dsp/core/nodes/PhaseVocoderNode.h",
    "external/JUCE/modules/juce_dsp/frequency/juce_FFT.cpp",
])).hexdigest()
frames, rate, block = 16_384, 48_000, 128
input_path = OUT / "input.f32"
with input_path.open("wb") as output:
    for frame in range(frames):
        time = frame / rate
        left = .35 * math.sin(2 * math.pi * 220 * time) + .12 * math.sin(2 * math.pi * 440 * time)
        output.write(struct.pack("<ff", left, left * .9))
specs = [
    ("dry", "Exact dry bypass", [0, 7, 1, 0, 11]),
    ("bin-unison", "Bin mapping · unison", [0, 0, 1, 1, 11]),
    ("bin-up", "Bin mapping · +7 st", [0, 7, 1, 1, 11]),
    ("bin-down", "Bin mapping · −7 st", [0, -7, 1, 1, 11]),
    ("hq-unison", "Stretch + resample · unison", [1, 0, 1, 1, 11]),
    ("hq-up", "Stretch + resample · +7 st", [1, 7, 1, 1, 11]),
    ("hq-time", "Stretch + resample · 1.5× time", [1, 0, 1.5, 1, 11]),
    ("bin-512", "Bin mapping · 512 FFT", [0, 7, 1, 1, 9]),
    ("bin-4096", "Bin mapping · 4096 FFT", [0, 7, 1, 1, 12]),
]
cases = []
for case_id, label, params in specs:
    output = f"{case_id}-cpp.f32"
    native = f"{case_id}-rust.f32"
    args = [str(input_path), str(OUT / output), str(rate), str(block), str(frames), *map(str, params)]
    subprocess.run([cpp, *args], check=True)
    args[1] = str(OUT / native)
    subprocess.run([rust, *args], check=True)
    cases.append({"id": case_id, "label": label, "before": params, "output": output,
                  "rustOutput": native, "blockSize": block})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "original JUCE PhaseVocoderNode and native Rust",
    "sourceSha256": source_hash, "sampleRate": rate, "channels": 2, "frames": frames,
    "stepFrame": frames // 2, "blockSize": block, "input": input_path.name, "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} original C++ and native Rust phase vocoder captures")
