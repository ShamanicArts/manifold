#!/usr/bin/env python3
"""Render deterministic native Rust voice cases for browser Wasm comparison."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/voice"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_voice"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_voice"
frames = 8192
(OUT / "input.f32").write_bytes(struct.pack(f"<{frames * 2}f", *([0.0] * frames * 2)))

specs = [
    ("single-note", "Single note · on/off", 0, 0.005, 0.02, 0.55, 0.03, 0.25, 128, 128, [(128, 0, 60, 100), (2048, 1, 60, 0)]),
    ("release-in-attack", "Release during attack", 0, 0.08, 0.02, 0.7, 0.015, 0.3, 128, 250, [(100, 0, 64, 110), (250, 1, 64, 0)]),
    ("poly-overlap", "Three overlapping notes", 1, 0.002, 0.015, 0.6, 0.04, 0.18, 128, 512, [(128, 0, 60, 90), (512, 0, 64, 100), (1024, 0, 67, 110), (2048, 1, 60, 0), (2500, 1, 64, 0), (3000, 1, 67, 0)]),
    ("block-boundary", "On/off across block edges", 0, 0.001, 0.02, 0.8, 0.005, 0.25, 128, 127, [(127, 0, 69, 127), (257, 1, 69, 0)]),
    ("voice-steal", "Ninth note steals oldest", 2, 0.001, 0.02, 0.65, 0.02, 0.12, 64, 64, [(64 + n, 0, 60 + n, 100) for n in range(9)] + [(2048, 2, 0, 0)]),
    ("bend-active", "Active note bends one octave", 0, 0.001, 0.02, 0.8, 0.03, 0.25, 128, 4096, [(0, 0, 69, 120), (4113, 3, 0, 96), (6157, 3, 0, 64)]),
    ("bend-before-note", "Wheel position persists for new note", 0, 0.001, 0.02, 0.8, 0.03, 0.25, 128, 2048, [(0, 3, 0, 96), (128, 0, 69, 120), (4113, 3, 0, 64)]),
]
cases = []
for case_id, label, waveform, attack, decay, sustain, release, level, block_size, focus, events in specs:
    output = f"{case_id}.f32"
    params = [48000, frames, block_size, waveform, attack, decay, sustain, release, level]
    events = [(frame, kind, 0, note, velocity) for frame, kind, note, velocity in events]
    event_args = [value for event in events for value in event]
    subprocess.run([str(runner), str(OUT / output), *(str(value) for value in params + event_args)], check=True)
    cases.append({
        "id": case_id, "label": label, "waveform": waveform, "attack": attack,
        "decay": decay, "sustain": sustain, "release": release, "level": level,
        "blockSize": block_size, "focusFrame": focus,
        "events": [{"frame": frame, "kind": kind, "channel": channel, "note": note, "velocity": velocity}
                   for frame, kind, channel, note, velocity in events],
        "output": output,
    })

(OUT / "manifest.json").write_text(json.dumps({
    "version": 1,
    "reference": "native Rust VoiceSynth with timed note events",
    "sourceSha256": hashlib.sha256((ROOT / "crates/manifold-core/src/voice.rs").read_bytes()).hexdigest(),
    "sampleRate": 48000,
    "channels": 2,
    "frames": frames,
    "input": "input.f32",
    "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust voice cases to {OUT}")
