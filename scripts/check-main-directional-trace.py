#!/usr/bin/env python3
"""Compare original Lua Main FM/Sync commands with Rust control-block outputs."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT.parent / "my-plugin/UserScripts/projects/Main/lib"
REF = ROOT / "web/public/reference/main-directional"
SCENARIOS = REF / "scenarios.csv"
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_main_directional_trace"],
               cwd=ROOT, check=True)
legacy = subprocess.check_output(["lua", str(ROOT / "tools/legacy-main-directional-trace.lua"),
                                  str(LEGACY), str(SCENARIOS)], text=True)
rust = subprocess.check_output([str(ROOT / "target/debug/examples/render_main_directional_trace"),
                                str(SCENARIOS)], text=True)
(REF / "legacy.csv").write_text(legacy)
(REF / "rust.csv").write_text(rust)
(REF / "manifest.json").write_text(json.dumps({
    "version": 1, "source": "original Main sample_synth.lua updateBlendVoiceFrame",
    "legacySha256": hashlib.sha256((LEGACY / "sample_synth.lua").read_bytes()).hexdigest(),
    "rustSha256": hashlib.sha256((ROOT / "crates/manifold-core/src/main_directional.rs").read_bytes()).hexdigest(),
    "scenarios": SCENARIOS.name, "legacy": "legacy.csv", "rust": "rust.csv",
    "blocks": 13, "sampleRate": 48_000, "blockFrames": 128,
}, indent=2) + "\n")
old_rows = [[float(cell) for cell in line.split(',')] for line in legacy.splitlines()]
new_rows = [[float(cell) for cell in line.split(',')] for line in rust.splitlines()]
assert len(old_rows) == len(new_rows) == 13
peak_frequency = max(abs(old[0] - new[0]) for old, new in zip(old_rows, new_rows))
peak_speed = max(abs(old[1] - new[1]) for old, new in zip(old_rows, new_rows))
events_match = all(old[2:] == new[2:] for old, new in zip(old_rows, new_rows))
print(f"Original Lua Main motion ↔ Rust: {len(old_rows)} blocks, frequency Δ {peak_frequency:.3e}, "
      f"speed Δ {peak_speed:.3e}, trigger/play counts {'match' if events_match else 'differ'}")
if peak_frequency > 2e-4 or peak_speed > 1e-5 or not events_match:
    raise SystemExit("Main directional control trace differs from original Lua")
