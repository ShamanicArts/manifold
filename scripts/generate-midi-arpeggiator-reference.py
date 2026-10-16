#!/usr/bin/env python3
"""Independent native Rust Arp kernel into VoiceSynth reference."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess

root = Path(__file__).resolve().parent.parent
out = root / "web/public/reference/midi-arpeggiator"
out.mkdir(parents=True, exist_ok=True)
for name, mode, octaves, gate, hold, scenario in [
    ("chord-capture", 0, 1, 0.6, 0, "baseline"),
    ("held-pingpong", 2, 2, 0.6, 1, "held"),
    ("held-down-short-gate", 1, 2, 0.25, 1, "held"),
    ("held-seeded-random", 3, 2, 0.5, 1, "held"),
]:
    subprocess.run(["cargo", "run", "-q", "-p", "manifold-core", "--example",
                    "render_midi_arpeggiator_audio", "--", str(out / f"{name}.f32"),
                    str(mode), str(octaves), str(gate), str(hold), scenario], cwd=root, check=True)
(out / "input.f32").write_bytes(struct.pack("<65536f", *([0.0] * 65536)))
sources = [root / "crates/manifold-core/src/midi_arpeggiator.rs",
           root / "crates/manifold-core/src/voice.rs"]
manifest = {
    "version": 1,
    "reference": "native Rust Arp kernel into VoiceSynth; old Lua callback timing differs",
    "sourceSha256": hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest(),
    "sampleRate": 48000, "channels": 2, "frames": 32768, "blockSize": 128,
    "input": "input.f32",
    "cases": [{
        "id": "chord-capture", "label": "30 ms chord capture and sample-offset steps",
        "waveform": 0, "attack": 0.005, "decay": 0.02, "sustain": 0.55,
        "release": 0.03, "level": 0.25,
        "rate": 8, "mode": 0, "octaves": 1, "gate": 0.6, "hold": 0,
        "events": [{"frame": 0, "kind": 0, "channel": 0, "note": 60, "velocity": 90},
                   {"frame": 512, "kind": 0, "channel": 0, "note": 64, "velocity": 100},
                   {"frame": 9500, "kind": 2, "channel": 0, "note": 0, "velocity": 0}],
        "changes": [], "focusFrame": 7440, "output": "chord-capture.f32",
    }, {
        "id": "held-pingpong", "label": "Held chord through two octaves · ping-pong",
        "waveform": 0, "attack": 0.005, "decay": 0.02, "sustain": 0.55,
        "release": 0.03, "level": 0.25,
        "rate": 8, "mode": 2, "octaves": 2, "gate": 0.6, "hold": 1,
        "events": [{"frame": 0, "kind": 0, "channel": 0, "note": 60, "velocity": 90},
                   {"frame": 512, "kind": 0, "channel": 0, "note": 64, "velocity": 100},
                   {"frame": 2000, "kind": 1, "channel": 0, "note": 60, "velocity": 0},
                   {"frame": 2300, "kind": 1, "channel": 0, "note": 64, "velocity": 0}],
        "changes": [], "focusFrame": 19440, "output": "held-pingpong.f32",
    }, {
        "id": "held-down-short-gate", "label": "Held chord · down · short gates",
        "waveform": 0, "attack": 0.005, "decay": 0.02, "sustain": 0.55,
        "release": 0.03, "level": 0.25,
        "rate": 8, "mode": 1, "octaves": 2, "gate": 0.25, "hold": 1,
        "events": [{"frame": 0, "kind": 0, "channel": 0, "note": 60, "velocity": 90},
                   {"frame": 512, "kind": 0, "channel": 0, "note": 64, "velocity": 100},
                   {"frame": 2000, "kind": 1, "channel": 0, "note": 60, "velocity": 0},
                   {"frame": 2300, "kind": 1, "channel": 0, "note": 64, "velocity": 0}],
        "changes": [], "focusFrame": 13440, "output": "held-down-short-gate.f32",
    }, {
        "id": "held-seeded-random", "label": "Held chord · reproducible random steps",
        "waveform": 0, "attack": 0.005, "decay": 0.02, "sustain": 0.55,
        "release": 0.03, "level": 0.25,
        "rate": 8, "mode": 3, "octaves": 2, "gate": 0.5, "hold": 1,
        "events": [{"frame": 0, "kind": 0, "channel": 0, "note": 60, "velocity": 90},
                   {"frame": 512, "kind": 0, "channel": 0, "note": 64, "velocity": 100},
                   {"frame": 2000, "kind": 1, "channel": 0, "note": 60, "velocity": 0},
                   {"frame": 2300, "kind": 1, "channel": 0, "note": 64, "velocity": 0}],
        "changes": [], "focusFrame": 19440, "output": "held-seeded-random.f32",
    }],
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Wrote 4 native Rust MIDI Arpeggiator audio cases")
