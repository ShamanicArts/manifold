#!/usr/bin/env python3
"""Compare a delayed FX branch against a first-visited Compressor graph swap."""
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OLD = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
BUILD = ROOT / "target/legacy-reference"
BUILD.mkdir(parents=True, exist_ok=True)
source = ROOT / "tools/legacy-fx-compressor-switch.cpp"
sources = [source, OLD / "manifold/primitives/scripting/PrimitiveGraph.cpp",
           OLD / "manifold/primitives/scripting/GraphRuntime.cpp",
           *(OLD / f"dsp/core/nodes/{name}Node.cpp" for name in
             ("Passthrough", "Gain", "Mixer", "Chorus", "StereoDelay", "Compressor"))]
binary = BUILD / "fx-compressor-switch"
subprocess.run(["c++", "-std=c++17", "-O2", "-ffunction-sections", "-fdata-sections",
                "-Wl,--gc-sections", "-DNDEBUG=1", "-D_NDEBUG=1",
                "-DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1", f"-I{OLD}",
                f"-I{OLD / 'external/JUCE/modules'}", *(str(path) for path in sources),
                "-o", str(binary), "-lhwy", "-pthread"], check=True)
old_capture = BUILD / "fx-compressor-switch-old.f32"
events = subprocess.check_output([str(binary), str(old_capture)], text=True)
subprocess.run(["cargo", "run", "-q", "-p", "manifold-core", "--example", "render_fx_tail",
                "--", str(BUILD / "fx-compressor-switch-rust.f32"), "--host-compressor"],
               cwd=ROOT, check=True)

def read(path):
    data = array("f")
    data.frombytes(path.read_bytes())
    if len(data) != 32768 * 2 or not all(math.isfinite(value) for value in data):
        raise RuntimeError(f"Invalid capture: {path}")
    return data

old = read(old_capture)
rust = read(BUILD / "fx-compressor-switch-rust.f32")
diff = [a - b for a, b in zip(old, rust)]
hash_paths = [*sources,
              OLD / "UserScripts/projects/Main/lib/fx_slot.lua",
              OLD / "UserScripts/projects/Main/lib/fx_definitions.lua"]
report = {
    "sourceSha256": hashlib.sha256(b"".join(path.read_bytes() for path in hash_paths)).hexdigest(),
    "events": events.strip().splitlines(),
    "max": max(map(abs, diff)),
    "rms": math.sqrt(sum(d * d for d in diff) / len(diff)),
    "segments": {name: {"max": max(abs(d) for d in diff[start * 2:end * 2])}
                 for name, start, end in (("delay", 0, 8192), ("compressor", 8192, 11008),
                                          ("returnedDelay", 11008, 11520),
                                          ("returnedCompressor", 11520, 32768))},
    "boundaryLeft": {str(frame): {"old": old[frame * 2], "rust": rust[frame * 2]}
                     for frame in (8192, 10880, 11008, 11520, 11521, 12000)},
}
out = ROOT / "artifacts/reviews/checkpoint-87-compressor-switch-metrics.json"
out.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
if report["max"] > 1e-5:
    raise SystemExit("Compressor host switch exceeds parity gate")
