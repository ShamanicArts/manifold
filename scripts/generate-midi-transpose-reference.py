#!/usr/bin/env python3
"""Native Rust audio reference for the MIDI Transpose workbench."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess

root = Path(__file__).resolve().parent.parent
out = root / "web/public/reference/midi-transpose"
out.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "run", "-q", "-p", "manifold-core", "--example",
                "render_midi_transpose_audio", "--", str(out / "held-remap.f32")], cwd=root, check=True)
(out / "input.f32").write_bytes(struct.pack("<16384f", *([0.0] * 16384)))
sources = [root / "crates/manifold-core/src/midi_transpose.rs",
           root / "crates/manifold-core/src/voice.rs"]
manifest = {
    "version": 1,
    "reference": "native Rust MIDI Transpose into VoiceSynth; legacy Lua event trace in checkpoint 94",
    "sourceSha256": hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest(),
    "sampleRate": 48000, "channels": 2, "frames": 8192, "blockSize": 128,
    "input": "input.f32",
    "cases": [{
        "id": "held-remap", "label": "Held C4 moves to G4, then C3 while sounding",
        "waveform": 0, "attack": 0.005, "decay": 0.02, "sustain": 0.55,
        "release": 0.03, "level": 0.25, "semitones": 7,
        "events": [{"frame": 128, "kind": 0, "channel": 0, "note": 60, "velocity": 100},
                   {"frame": 4096, "kind": 1, "channel": 0, "note": 60, "velocity": 0}],
        "changes": [{"frame": 2048, "semitones": -12}],
        "focusFrame": 2048, "output": "held-remap.f32",
    }],
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Wrote 1 native Rust MIDI Transpose audio case")
