#!/usr/bin/env python3
"""Emit native Rust reference samples for the authored synth patch."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "web/public/reference/patch"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_patch"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_patch"
sources = [ROOT / path for path in ["crates/manifold-core/src/graph.rs", "crates/manifold-core/src/oscillator.rs", "crates/manifold-core/src/noise.rs", "crates/manifold-core/src/envelope.rs", "crates/manifold-core/src/lib.rs", "projects/synth-patch/project.json", "crates/manifold-core/examples/render_patch.rs"]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
specs = [
    ("tone", "Tone through envelope and filter", 0, 220, 220, .4, 0, 0, .5, .02, .08, .6, .08, 1600, 1600, .2, .5, 128),
    ("tone-noise", "Tone and colored noise", 1, 220, 220, .3, .12, .12, .7, .01, .05, .5, .1, 2400, 2400, .35, .5, 128),
    ("sweep", "Pitch, noise and filter sweep", 0, 220, 440, .4, .04, .2, .3, .02, .04, .7, .1, 800, 4000, .1, .45, 128),
    ("noise-only", "Noise-only transient", 0, 220, 220, 0, .3, .1, .8, .002, .02, .3, .05, 3000, 1000, .2, .5, 64),
]
keys = ["waveform", "frequencyBefore", "frequencyAfter", "oscillatorLevel", "noiseLevelBefore", "noiseLevelAfter", "noiseColor", "attack", "decay", "sustain", "release", "cutoffBefore", "cutoffAfter", "resonance", "master", "blockSize"]
cases = []
for case_id, label, *values in specs:
    output = f"{case_id}.f32"
    subprocess.run([runner, str(OUT / output), *(str(value) for value in values), "16384"], check=True)
    cases.append({"id": case_id, "label": label, **dict(zip(keys, values)), "output": output})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust authored synth graph",
    "sourceSha256": source_hash, "sampleRate": 48000, "channels": 2,
    "frames": 16384, "stepFrame": 8192, "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
(OUT / "input.f32").write_bytes(bytes(16384 * 2 * 4))
print(f"Wrote {len(cases)} native Rust patch cases to {OUT}")
