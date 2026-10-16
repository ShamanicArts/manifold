#!/usr/bin/env python3
"""Capture the original compiled Main wave route and equivalent Rust bank voice."""
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/main-wave-voice"
OUT.mkdir(parents=True, exist_ok=True)
legacy_runner = subprocess.check_output([str(ROOT / "scripts/build-legacy-main-wave-voice-reference.sh")], text=True).strip()
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_main_voice_bank"], cwd=ROOT, check=True)
rust_runner = ROOT / "target/debug/examples/render_main_voice_bank"
project = json.loads((ROOT / "projects/main-voice-bank/project.json").read_text())
wave = project["partials"]["values"]
source = project["extraPartials"][0]["values"]
sample_rate, sample_frames, frames, block = 48_000, 4096, 8192, 128
(OUT / "sample.f32").write_bytes(bytes(sample_frames * 8))
(OUT / "input.f32").write_bytes(bytes(frames * 8))
frequency = struct.unpack("<f", struct.pack("<f", 440 * 2 ** ((60 - 69) / 12)))[0]
cases = []
for case_id, waveform, blend in [
    ("sine-wave", 0, -1.0),
    ("saw-wave", 1, -1.0),
    ("sine-midpoint", 0, 0.0),
]:
    old_output = f"{case_id}-cpp.f32"
    rust_output = f"{case_id}-rust.f32"
    params = [waveform, blend, 60, 2, 0, 0, 0, .5, .5, 0, 1,
              .001, .001, 1, .05, 1, 1, 0, .2]
    subprocess.run([legacy_runner, str(OUT / old_output), str(frequency), "0.4",
                    str(waveform), str(blend), str(frames), str(block)], check=True)
    subprocess.run([rust_runner, str(OUT / "sample.f32"), str(OUT / rust_output),
                    str(sample_rate), str(sample_rate), str(block), str(frames),
                    ",".join(map(str, params)), "0:0:0:60:127", "",
                    ",".join(map(str, wave)), ",".join(map(str, source))], check=True)
    cases.append({"id": case_id, "label": f"Normal wave route · waveform {waveform} · blend {blend}",
                  "parameters": params, "events": [[0, 0, 0, 60, 127]], "changes": [],
                  "blockSize": block, "output": rust_output, "legacyOutput": old_output})

def digest(paths):
    return hashlib.sha256(b"".join(path.read_bytes() for path in paths)).hexdigest()

(OUT / "manifest.json").write_text(json.dumps({
    "version": 1,
    "reference": "compiled original C++ oscillator, crossfaders and mixers against authored Rust Main bank",
    "scope": "sustained wave route with a silent sample bus; old UI envelope and old sample player excluded",
    "legacySourceSha256": digest([LEGACY / "dsp/core/nodes" / name for name in
                                  ["OscillatorNode.cpp", "CrossfaderNode.cpp", "MixerNode.cpp"]]),
    "referenceHarnessSha256": digest([ROOT / "tools/legacy-main-wave-voice-reference.cpp",
                                      ROOT / "scripts/build-legacy-main-wave-voice-reference.sh"]),
    "rustSourceSha256": digest([ROOT / "crates/manifold-core/src" / name for name in
                                ["main_voice_bank.rs", "oscillator.rs", "graph.rs"]]),
    "wasmSha256": hashlib.sha256((ROOT / "web/public/manifold_filter.wasm").read_bytes()).hexdigest(),
    "sampleRate": sample_rate, "sampleSourceRate": sample_rate, "sampleFrames": sample_frames,
    "sample": "sample.f32", "channels": 2, "frames": frames, "stepFrame": 4096,
    "input": "input.f32", "settledStartFrame": 512,
    "waveTarget": wave, "sourceTarget": source, "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} compiled C++ and Rust Main wave cases to {OUT}")
