#!/usr/bin/env python3
"""Generate original C++ StereoDelayNode comparison cases."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/stereo-delay"
OUT.mkdir(parents=True, exist_ok=True)
binary = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"), "stereo-delay"], text=True).strip()
source_hash = hashlib.sha256((LEGACY / "dsp/core/nodes/StereoDelayNode.cpp").read_bytes()).hexdigest()
frames, sample_rate, step = 16384, 48000, 8192
with (OUT / "input.f32").open("wb") as output:
    for frame in range(frames):
        left = .6 if frame in (0, 3500, 11000) else 0.0
        right = -.5 if frame in (400, 4100, 11300) else 0.0
        if 6000 <= frame < 6800:
            left += .16 * math.sin(2 * math.pi * frame * 431 / sample_rate)
            right += .12 * math.sin(2 * math.pi * frame * 697 / sample_rate)
        output.write(struct.pack("<ff", left, right))

DEFAULT = [30.31, 45.37, .45, 0, 0, 4000, .5, .7, 0, 1, 0, 0, 0, 3, 6, 120]
def settings(**updates):
    result = DEFAULT.copy()
    names = "timeL timeR feedback crossfeed filter cutoff resonance mix pingpong width freeze ducking mode divisionL divisionR tempo".split()
    for key, value in updates.items(): result[names.index(key)] = value
    return result

specs = [
    ("stereo-echo", "Separate stereo taps", settings(), settings()),
    ("time-sweep", "Delay time smoothing", settings(timeL=20.27, timeR=60.43), settings(timeL=55.47, timeR=25.29)),
    ("crossfeed", "Crossfeed and feedback", settings(timeL=25.29, timeR=40.37, feedback=.65, crossfeed=.8), settings(timeL=25.29, timeR=40.37, feedback=.45, crossfeed=.25)),
    ("ping-width", "Ping-pong and stereo width", settings(timeL=20.27, timeR=35.43, pingpong=1, width=.2), settings(timeL=20.27, timeR=35.43, pingpong=0, width=.8)),
    ("filtered-duck", "Filtered and ducked feedback", settings(timeL=20.27, timeR=35.43, feedback=.6, filter=1, cutoff=1200, ducking=.7), settings(timeL=20.27, timeR=35.43, feedback=.4, filter=1, cutoff=3000, ducking=.25)),
    ("tempo-sync", "Synced divisions and tempo", settings(mode=1, divisionL=0, divisionR=1, tempo=237), settings(mode=1, divisionL=1, divisionR=0, tempo=293)),
    ("freeze", "Freeze and release", settings(timeL=25.29, timeR=35.43, feedback=1, freeze=0), settings(timeL=25.29, timeR=35.43, feedback=1, freeze=1)),
    ("dormant-bypass", "Dormant dry bypass", settings(timeL=25.29, timeR=35.43, feedback=0, crossfeed=0, mix=0), settings(timeL=25.29, timeR=35.43, feedback=.5, crossfeed=0, mix=.8)),
]
cases = []
for case_id, label, before, after in specs:
    output = f"{case_id}.f32"
    block = 128 if case_id != "time-sweep" else 64
    subprocess.run([binary, str(OUT / "input.f32"), str(OUT / output), str(sample_rate), str(block), str(step), str(frames), *(str(value) for value in before), *(str(value) for value in after)], check=True)
    cases.append({"id": case_id, "label": label, "before": before, "after": after, "blockSize": block, "output": output})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "legacy C++ StereoDelayNode.cpp scalar stereo",
    "sourceSha256": source_hash, "sampleRate": sample_rate, "channels": 2,
    "frames": frames, "stepFrame": step, "input": "input.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} C++ stereo delay cases to {OUT}")
