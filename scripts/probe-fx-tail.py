#!/usr/bin/env python3
"""Compare a two-effect old C++ FX route with persistent Rust kernels."""
from array import array
import hashlib
import json
import math
import os
from pathlib import Path
import shlex
import subprocess
import wave

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parent.parent
OLD = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "artifacts/reviews"
BUILD = ROOT / "target/legacy-reference"
BUILD.mkdir(parents=True, exist_ok=True)
source = ROOT / "tools/legacy-fx-tail-reference.cpp"
node_sources = [OLD / f"dsp/core/nodes/{name}Node.cpp" for name in ("Gain", "Mixer", "Chorus", "StereoDelay")]
binary = BUILD / "fx-tail-reference"
flags = shlex.split(subprocess.check_output(["pkg-config", "--cflags", "--libs", "libhwy"], text=True))
subprocess.run([
    "c++", "-std=c++17", "-O2", "-ffunction-sections", "-fdata-sections", "-Wl,--gc-sections",
    "-DNDEBUG=1", "-D_NDEBUG=1", "-DJUCE_GLOBAL_MODULE_SETTINGS_INCLUDED=1",
    f"-I{OLD}", f"-I{OLD / 'external/JUCE/modules'}", str(source),
    *(str(path) for path in node_sources), "-o", str(binary), *flags,
], check=True)
old_path = BUILD / "fx-tail-old.f32"
rust_path = BUILD / "fx-tail-rust.f32"
reset_path = BUILD / "fx-tail-reset.f32"
subprocess.run([str(binary), str(old_path)], check=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_fx_tail"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_fx_tail"
subprocess.run([str(runner), str(rust_path)], check=True)
subprocess.run([str(runner), str(reset_path), "--reset-on-reselect"], check=True)

def read(path):
    values = array("f")
    values.frombytes(path.read_bytes())
    assert len(values) == 32768 * 2
    return values

old, rust, reset = read(old_path), read(rust_path), read(reset_path)

def distance(a, b, first=0, last=32768):
    differences = [x - y for x, y in zip(a[first * 2:last * 2], b[first * 2:last * 2])]
    return {"max": max(map(abs, differences)), "rms": math.sqrt(sum(value * value for value in differences) / len(differences))}

parity = distance(old, rust)
reset_difference = distance(old, reset, 16384, 32768)
if parity["max"] > 2e-6:
    raise SystemExit(f"Persistent Rust route differs from old C++ by {parity['max']}")
if reset_difference["max"] < 0.01:
    raise SystemExit("Reset probe did not reveal a material returning tail")

source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in [source, *node_sources,
    OLD / "UserScripts/projects/Main/lib/fx_slot.lua",
    OLD / "UserScripts/projects/Main/lib/fx_definitions.lua",
    ROOT / "crates/manifold-core/src/fx_routing.rs",
    ROOT / "crates/manifold-core/examples/render_fx_tail.rs"])).hexdigest()
report = {
    "reference": "Isolated old C++ scalar Gain/Mixer/Chorus/StereoDelay route; Chorus prepared at start, processes after first selection",
    "sourceSha256": source_hash,
    "sampleRate": 48000,
    "frames": 32768,
    "blockSize": 128,
    "switchFrames": {"delayToChorus": 8192, "chorusToDelay": 16384},
    "hiddenDelayInputImpulseFrame": 9500,
    "cppVsPersistentRust": parity,
    "cppVsPausedResetRustAfterReselect": reset_difference,
    "returnTailFrame": 17180,
    "returnTailSample": {"cppLeft": old[17180 * 2], "persistentRustLeft": rust[17180 * 2],
                         "pausedResetRustLeft": reset[17180 * 2]},
}
(OUT / "checkpoint-73-tail-metrics.json").write_text(json.dumps(report, indent=2) + "\n")

def audition_wav(path, data):
    # The source peak is under 0.28; 3x gain makes the short tail easier to hear without clipping.
    pcm = array("h", (max(-32768, min(32767, round(value * 3.0 * 32767))) for value in data))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(48000)
        output.writeframes(pcm.tobytes())

audition_wav(OUT / "checkpoint-73-persistent.wav", old)
audition_wav(OUT / "checkpoint-73-reset.wav", reset)

def block_rms(samples, start, size=128):
    return [math.sqrt(sum(value * value for value in samples[frame * 2:(frame + size) * 2]) / (size * 2))
            for frame in range(start, 32768, size)]

starts = list(range(0, 32768, 128))
old_rms = block_rms(old, 0)
reset_rms = block_rms(reset, 0)
diff_rms = [distance(old, reset, frame, frame + 128)["rms"] for frame in starts]
time = [frame / 48000 for frame in starts]
fig, axes = plt.subplots(2, 1, figsize=(10, 5.8), sharex=True)
axes[0].plot(time, old_rms, label="C++ / persistent Rust", color="#6655a8", linewidth=1.4)
axes[0].plot(time, reset_rms, label="Paused, reset Delay", color="#c78c58", linewidth=1.1, alpha=.9)
axes[0].set(ylabel="Output RMS", title="Chorus / Delay switch · real effect kernels")
axes[0].legend(loc="upper right", frameon=False, fontsize=8)
axes[1].plot(time, diff_rms, color="#b6576e", linewidth=1.3)
axes[1].set(xlabel="Time (s)", ylabel="Difference RMS")
for ax in axes:
    for frame, label in ((8192, "Delay → Chorus"), (16384, "Chorus → Delay")):
        ax.axvline(frame / 48000, color="#81909a", linestyle="--", linewidth=.8)
        ax.text(frame / 48000 + .003, ax.get_ylim()[1] * .96, label, fontsize=8, rotation=90, va="top")
    ax.grid(axis="y", alpha=.18)
fig.tight_layout()
fig.savefig(OUT / "checkpoint-73-tail.png", dpi=160)
plt.close(fig)
print(json.dumps({"parity": parity, "resetDifference": reset_difference,
                  "returnTail": report["returnTailSample"]}, indent=2))
