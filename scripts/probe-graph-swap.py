#!/usr/bin/env python3
"""Compile the old C++ graph runtime read-only and capture swap mechanics."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OLD = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "target/legacy-reference/graph-swap-probe"
OUT.parent.mkdir(parents=True, exist_ok=True)
sources = [
    ROOT / "tools/legacy-graph-swap-probe.cpp",
    OLD / "manifold/primitives/scripting/PrimitiveGraph.cpp",
    OLD / "manifold/primitives/scripting/GraphRuntime.cpp",
    *(OLD / f"dsp/core/nodes/{name}Node.cpp" for name in ("Passthrough", "Gain", "StereoDelay")),
]
subprocess.run([
    "c++", "-std=c++17", "-O2", "-ffunction-sections", "-fdata-sections",
    "-Wl,--gc-sections", "-DNDEBUG=1", "-D_NDEBUG=1",
    "-DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1", f"-I{OLD}",
    f"-I{OLD / 'external/JUCE/modules'}", *(str(source) for source in sources),
    "-o", str(OUT), "-lhwy", "-pthread",
], check=True)
lines = subprocess.check_output([str(OUT)], text=True).strip().splitlines()
report = {key: float(value) if "." in value or "e" in value.lower() else int(value)
          for key, value in (line.split("=", 1) for line in lines)}
report = {"reference": "Old C++ PrimitiveGraph and GraphRuntime swap with old Gain and StereoDelay nodes",
          "sourceSha256": hashlib.sha256(b"".join(source.read_bytes() for source in sources)).hexdigest(),
          "sampleRate": 48000, "blockSize": 128, **report}
if abs(report["gate_closed_first"]) > 1e-8:
    raise SystemExit("Closed gate leaked audio")
if not 0 < report["gate_smooth_first"] < 0.01:
    raise SystemExit("Expected a smoothed gain when no runtime recompile occurs")
if abs(report["gate_after_reprepare_first"] - 1) > 1e-6:
    raise SystemExit("Expected the re-prepared gate to start at its target")
if report["same_topology_transfers"] != 1 or report["changed_topology_transfers"] != 0:
    raise SystemExit("Unexpected continuity transfer counts")
if not 0.1 < report["same_topology_tail_peak"] < 1 or not 0.1 < report["changed_topology_tail_peak"] < 1:
    raise SystemExit("Delay tail did not survive the runtime swaps")
dest = ROOT / "artifacts/reviews/checkpoint-79-graph-swap-metrics.json"
dest.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))
