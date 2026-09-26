#!/usr/bin/env python3
"""Render original C++ and Rust oscillator with identical raw-audio sync crossings."""
from array import array
import math
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "web/public/reference/oscillator"
OUT = ROOT / "target/reference-rendered/oscillator"
OUT.mkdir(parents=True, exist_ok=True)
rate, frames, block = 48_000, 16_384, 128
source = REF / "sync-input.f32"
with source.open("wb") as destination:
    for frame in range(frames):
        sample = .35 * math.sin(2 * math.pi * 220 * frame / rate) + .12 * math.sin(2 * math.pi * 440 * frame / rate)
        destination.write(struct.pack("<f", sample))
legacy = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"), "oscillator"],
                                 text=True).strip()
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_oscillator"], cwd=ROOT, check=True)
args = ["330", "330", ".5", ".5", "1", str(rate), str(block), str(frames), str(frames), str(source)]
cpp = REF / "sync-cpp.f32"
rust = OUT / "sync-rust.f32"
subprocess.run([legacy, str(cpp), *args], check=True)
subprocess.run([str(ROOT / "target/debug/examples/render_oscillator"), str(rust), *args], check=True)
def samples(path):
    values = array('f')
    values.frombytes(path.read_bytes())
    return values
a, b = samples(cpp), samples(rust)
assert len(a) == len(b) == frames * 2
peak = max(abs(x-y) for x,y in zip(a,b))
rms = math.sqrt(sum((x-y)**2 for x,y in zip(a,b)) / len(a))
print(f"Original C++ oscillator sync ↔ Rust graph: max Δ {peak:.3e}, RMS Δ {rms:.3e}")
if peak > 2e-4: raise SystemExit("oscillator hard-sync parity exceeds tolerance")
