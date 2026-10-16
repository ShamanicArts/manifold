#!/usr/bin/env python3
"""Compare original Lua Main pitch decisions with the isolated Rust mapping."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT.parent / "my-plugin/UserScripts/projects/Main/lib"
REF = ROOT / "web/public/reference/main-pitch"
SCENARIOS = REF / "scenarios.csv"
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_main_pitch_trace"],
               cwd=ROOT, check=True)
legacy = subprocess.check_output(["lua", str(ROOT / "tools/legacy-main-pitch-trace.lua"),
                                  str(LEGACY), str(SCENARIOS)], text=True)
rust = subprocess.check_output([str(ROOT / "target/debug/examples/render_main_pitch_trace"),
                                str(SCENARIOS)], text=True)
old_rows = [[float(cell) for cell in line.split(',')] for line in legacy.splitlines()]
new_rows = [[float(cell) for cell in line.split(',')] for line in rust.splitlines()]
assert len(old_rows) == len(new_rows) == 14
max_delta = [max(abs(old[col] - new[col]) for old, new in zip(old_rows, new_rows))
             for col in range(6)]
if max_delta[0] > 1e-3 or any(delta > 1e-5 for delta in max_delta[1:5]) or max_delta[5] != 0:
    raise SystemExit(f"Main pitch routing differs from original Lua: {max_delta}")
(REF / "legacy.csv").write_text(legacy)
(REF / "rust.csv").write_text(rust)
(REF / "manifest.json").write_text(json.dumps({
    "version": 1,
    "source": "original Main sample_synth.lua pitch helpers and updateBlendVoiceFrame",
    "legacySha256": hashlib.sha256((LEGACY / "sample_synth.lua").read_bytes()).hexdigest(),
    "rustSha256": hashlib.sha256((ROOT / "crates/manifold-core/src/main_pitch.rs").read_bytes()).hexdigest(),
    "scenarios": SCENARIOS.name, "legacy": "legacy.csv", "rust": "rust.csv",
    "cases": len(old_rows), "maximumDifference": max_delta,
}, indent=2) + "\n")
print(f"Original Lua Main pitch ↔ Rust: {len(old_rows)} cases, "
      f"wave frequency Δ {max_delta[0]:.3e} Hz, ratio Δ {max_delta[1]:.3e}, "
      f"speed Δ {max_delta[2]:.3e}, vocoder shift Δ {max_delta[3]:.3e} st")
