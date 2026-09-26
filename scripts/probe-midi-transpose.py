#!/usr/bin/env python3
"""Replay one event scenario through original Lua and native Rust transpose."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
old = Path(os.environ.get("MANIFOLD_LEGACY_DIR", root.parent / "my-plugin"))
sources = [old / "UserScripts/projects/Main/lib/export_midi_effect_scaffold.lua",
           old / "UserScripts/projects/Main/lib/export_midi_effects/voice_transform.lua",
           old / "UserScripts/projects/Main/lib/transpose_runtime.lua"]
legacy = subprocess.check_output(["lua", "tools/legacy-midi-transpose.lua"], cwd=root, text=True)
rust = subprocess.check_output(["cargo", "run", "-q", "-p", "manifold-core", "--example",
                                "render_midi_transpose"], cwd=root, text=True)
report = {
    "reference": "Old Lua Standalone Transpose adapter, run offline with stubbed host services",
    "sourceSha256": hashlib.sha256(b"".join(p.read_bytes() for p in sources)).hexdigest(),
    "eventCount": len(legacy.splitlines()),
    "exactMatch": legacy == rust,
    "events": legacy.splitlines(),
}
out = root / "artifacts/reviews/checkpoint-94-midi-transpose-events.json"
out.write_text(json.dumps(report, indent=2) + "\n")
print(f"{report['eventCount']} old Lua and native Rust output events; exact match: {report['exactMatch']}")
if not report["exactMatch"]:
    raise SystemExit("MIDI transpose parity failed")
