#!/usr/bin/env python3
"""Record the old export's gate discrepancy beside the corrected Rust events."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
old = Path(os.environ.get("MANIFOLD_LEGACY_DIR", root.parent / "my-plugin"))
sources = [old / "UserScripts/projects/Main/lib/export_midi_effects/voice_transform.lua",
           old / "UserScripts/projects/Main/lib/note_filter_runtime.lua"]
legacy = subprocess.check_output(["lua", "tools/legacy-midi-note-filter.lua"], cwd=root, text=True).splitlines()
rust = subprocess.check_output(["cargo", "run", "-q", "-p", "manifold-core", "--example",
                                "render_midi_note_filter_events"], cwd=root, text=True).splitlines()
assert legacy == ["on,0,20,90", "off,0,20", "on,0,60,100", "off,0,60", "on,0,60,100", "off,0,60"]
assert rust == ["on,0,60,100", "off,0,60"]
report = {
    "reference": "Old rack Note Filter gates outside notes; old exported MIDI adapter ignores the gate",
    "sourceSha256": hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest(),
    "legacyExportEvents": legacy,
    "rustEvents": rust,
    "decision": "Rust MIDI Note Filter follows the rack's inside/outside gate; the export's forwarded blocked notes are not preserved",
}
out = root / "artifacts/reviews/checkpoint-98-midi-note-filter-events.json"
out.write_text(json.dumps(report, indent=2) + "\n")
print(f"Old export: {len(legacy)} events; corrected Rust gate: {len(rust)} events")
