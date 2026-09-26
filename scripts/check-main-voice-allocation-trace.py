#!/usr/bin/env python3
"""Compare original Main VoiceManager note-slot decisions with Rust."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT.parent / "my-plugin/UserScripts/projects/Main/ui/behaviors"
REF = ROOT / "web/public/reference/main-voice-allocation"
SCENARIOS = REF / "scenarios.csv"
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_main_voice_allocation_trace"],
               cwd=ROOT, check=True)
legacy = subprocess.check_output(["lua", str(ROOT / "tools/legacy-main-voice-allocation-trace.lua"),
                                  str(LEGACY), str(SCENARIOS)], text=True)
rust = subprocess.check_output([str(ROOT / "target/debug/examples/render_main_voice_allocation_trace"),
                                str(SCENARIOS)], text=True)
if legacy != rust:
    old_rows, new_rows = legacy.splitlines(), rust.splitlines()
    mismatch = next((index for index, (a, b) in enumerate(zip(old_rows, new_rows), 1) if a != b), None)
    raise SystemExit(f"Main voice allocation differs from original Lua at row {mismatch}")
(REF / "legacy.csv").write_text(legacy)
(REF / "rust.csv").write_text(rust)
(REF / "manifest.json").write_text(json.dumps({
    "version": 1,
    "source": "original Main UI behaviors/voice_manager.lua",
    "legacySha256": hashlib.sha256((LEGACY / "voice_manager.lua").read_bytes()).hexdigest(),
    "rustSha256": hashlib.sha256((ROOT / "crates/manifold-core/src/main_voice_allocator.rs").read_bytes()).hexdigest(),
    "scenarios": SCENARIOS.name, "legacy": "legacy.csv", "rust": "rust.csv",
    "steps": len(legacy.splitlines()), "voices": 8,
}, indent=2) + "\n")
print(f"Original Lua Main voice manager ↔ Rust: {len(legacy.splitlines())} steps, slot decisions and state exact")
