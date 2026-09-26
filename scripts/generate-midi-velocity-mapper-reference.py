#!/usr/bin/env python3
"""Native Rust audio reference for the MIDI Velocity Mapper workbench."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess

root = Path(__file__).resolve().parent.parent
out = root / "web/public/reference/midi-velocity-mapper"
out.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "run", "-q", "-p", "manifold-core", "--example",
                "render_midi_velocity_mapper_audio", "--", str(out / "held-offset.f32")], cwd=root, check=True)
(out / "input.f32").write_bytes(struct.pack("<16384f", *([0.0] * 16384)))
sources = [root / "crates/manifold-core/src/midi_velocity_mapper.rs",
           root / "crates/manifold-core/src/midi_note_router.rs",
           root / "crates/manifold-core/src/voice.rs"]
manifest = {
    "version": 1,
    "reference": "native Rust Velocity Mapper into VoiceSynth; rack amplitude curve deliberately applied to MIDI velocity",
    "sourceSha256": hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest(),
    "sampleRate": 48000, "channels": 2, "frames": 8192, "blockSize": 128,
    "input": "input.f32",
    "cases": [{
        "id": "held-offset", "label": "Hard curve velocities rise as offset changes",
        "waveform": 0, "attack": 0.005, "decay": 0.02, "sustain": 0.55,
        "release": 0.03, "level": 0.25,
        "amount": 1, "curve": 2, "offset": 0,
        "events": [{"frame": 128, "kind": 0, "channel": 0, "note": 64, "velocity": 64},
                   {"frame": 512, "kind": 0, "channel": 0, "note": 60, "velocity": 100},
                   {"frame": 4096, "kind": 1, "channel": 0, "note": 64, "velocity": 0},
                   {"frame": 6144, "kind": 1, "channel": 0, "note": 60, "velocity": 0}],
        "changes": [{"frame": 2048, "id": 2, "value": 0.5}],
        "focusFrame": 2048, "output": "held-offset.f32",
    }],
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Wrote 1 native Rust MIDI Velocity Mapper audio case")
