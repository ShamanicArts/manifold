#!/usr/bin/env python3
"""Render the Main sample branch study through native Rust for browser comparison."""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parent.parent
LEGACY = Path(os.environ.get("MANIFOLD_LEGACY_DIR", ROOT.parent / "my-plugin"))
OUT = ROOT / "web/public/reference/main-sample-blend"
OUT.mkdir(parents=True, exist_ok=True)
subprocess.run(["cargo", "build", "-p", "manifold-core", "--example", "render_main_sample_blend"], cwd=ROOT, check=True)
runner = ROOT / "target/debug/examples/render_main_sample_blend"
sources = [ROOT / path for path in [
    "crates/manifold-core/src/graph.rs", "crates/manifold-core/src/sample_region.rs",
    "crates/manifold-core/examples/render_main_gain_stage.rs",
    "crates/manifold-core/src/sine_bank.rs", "crates/manifold-core/src/oscillator.rs",
    "crates/manifold-core/src/main_directional.rs",
    "crates/manifold-core/src/temporal_partials.rs",
    "crates/manifold-core/src/phase_vocoder.rs",
    "crates/manifold-core/src/phrase_gain.rs", "crates/manifold-core/src/envelope_follower.rs",
    "crates/manifold-core/src/spectral_targets.rs", "crates/manifold-core/examples/render_main_sample_blend.rs",
    "projects/main-sample-blend/project.json",
]]
source_hash = hashlib.sha256(b"".join(path.read_bytes() for path in sources)).hexdigest()
source_rate, sample_frames = 48_000, 48_000
sample_path = OUT / "source.f32"
with sample_path.open("wb") as output:
    for frame in range(sample_frames):
        sample = .35 * math.sin(2 * math.pi * 220 * frame / source_rate) + .12 * math.sin(2 * math.pi * 440 * frame / source_rate)
        output.write(struct.pack("<ff", sample, sample * .9))
frames, block = 16_384, 128
(OUT / "input.f32").write_bytes(bytes(frames * 8))
legacy_follower = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-reference.sh"),
                                           "envelope-follower"], text=True).strip()
legacy_stage = subprocess.check_output(["bash", str(ROOT / "scripts/build-legacy-main-gain-stage-reference.sh")],
                                       text=True).strip()
follower_meters = "follower-meters-cpp.f32"
subprocess.run([legacy_follower, str(sample_path),
                str(ROOT / "target/legacy-reference/main-follower-audio.f32"),
                str(OUT / follower_meters),
                "5", "5", "80", "80", "2", "2", "40", "40", "0", "0",
                str(source_rate), str(block), str(frames // 2), str(frames)], check=True)
cases = []
for case in [
    ("sample", "Sample branch alone · dry vocoder", 1, 1.0, 0.0, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1),
    ("add", "Add branch alone", 1, 0.0, 1.0, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1),
    ("morph", "Morph branch alone", 2, 0.0, 1.0, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1),
    ("blend", "Sample + Morph at equal gain", 2, 0.5, 0.5, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1),
    ("pvoc-bin", "Sample · bin-map +7 st", 1, 1.0, 0.0, [0, 7, 1, 1, 11], [0, .18], [220, 0, 1, 1], 1),
    ("pvoc-hq", "Sample · stretch/resample +7 st", 1, 1.0, 0.0, [1, 7, 1, 1, 11], [0, .18], [220, 0, 1, 1], 1),
    ("pvoc-time", "Sample · 1.5× time stretch", 1, 1.0, 0.0, [1, 0, 1.5, 1, 11], [0, .18], [220, 0, 1, 1], 1),
    ("phrase-full", "Morph · full sample phrase contour", 2, 0.0, 1.0, [0, 0, 1, 0, 11], [1, .18], [220, 0, 1, 1], 1),
    ("phrase-half", "Morph · half phrase contour", 2, 0.0, 1.0, [0, 0, 1, 0, 11], [.5, .18], [220, 0, 1, 1], 1),
    ("wave-only", "Saw wave base alone", 1, 1.0, 0.0, [0, 0, 1, 0, 11], [0, .18], [220, .35, 1, -1], 1),
    ("wave-sample-mid", "Equal-power wave/sample centre", 1, 1.0, 0.0, [0, 0, 1, 0, 11], [0, .18], [220, .35, 1, 0], 1),
    ("wave-sample-morph", "Wave/sample base plus Morph bank", 2, .7, .5, [0, 0, 1, 0, 11], [0, .18], [330, .35, 3, -.35], 1),
    ("add-wave", "Wave-derived additive A", 1, 0.0, 1.0, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], -1),
    ("add-mid", "Wave/source additive centre", 1, 0.0, 1.0, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 0),
    ("depth-base", "Linked depth · base only", 1, .25, .75, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1, 0),
    ("depth-mid", "Linked depth · equal branches", 1, .25, .75, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1, .5),
    ("depth-add", "Linked depth · Add only", 1, .25, .75, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1, 1),
    ("legacy-amp25", "Old sample path · voice amp .25", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1, 0, .5),
    ("legacy-amp50", "Old sample path · voice amp .5", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1, 0, 1),
    ("legacy-amp75", "Old sample path · voice amp .75", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [220, 0, 1, 1], 1, 0, 1.5),
    ("voice-wave25", "Linked voice amp .25 · base wave", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [220, .25, 1, -1], 1, 0, .5, .5),
    ("voice-wave75", "Linked voice amp .75 · base wave", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [220, .75, 1, -1], 1, 0, 1.5, 1),
    ("voice-add25", "Linked voice amp .25 · source Add", 1, 0, 1, [0, 0, 1, 0, 11], [0, .18], [220, .25, 1, 1], 1, 1, .5, .5),
    ("voice-add75", "Linked voice amp .75 · source Add", 1, 0, 1, [0, 0, 1, 0, 11], [0, .18], [220, .75, 1, 1], 1, 1, 1.5, 1),
    ("voice-mix50", "Linked voice amp .5 · base and Add", 1, .5, .5, [0, 0, 1, 0, 11], [0, .18], [220, .5, 1, 0], 0, .5, 1, 1),
    ("sync-off", "Raw sample sync · free wave", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, -1], 1, 0, 1, .5, 0),
    ("sync-on", "Raw sample sync · reset wave", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, -1], 1, 0, 1, .5, 1),
    ("fm-normal", "FM control · normal baseline", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, 0], 1, .8, 1, .5, 0, 0, 1, 1, 1),
    ("fm-both", "FM · both directions", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, 0], 1, .8, 1, .5, 0, 2, 1, 1, 1),
    ("fm-wave-to-sample", "FM · wave moves sample speed", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, 1], 1, .8, 1, .5, 0, 2, 1, 0, 1),
    ("fm-sample-to-wave", "FM · sample cursor moves wave pitch", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, -1], 1, .8, 1, .5, 0, 2, 0, 1, 1),
    ("sync-retrigger", "Sync · restart sample on phase wrap", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, 1], 1, 0, 1, .5, 0, 3, .5, 0, 1),
    ("sync-play", "Sync · continue sample on phase wrap", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, 1], 1, 0, 1, .5, 0, 3, .5, 0, 0),
    ("sync-wave", "Sync · wave-facing hard reset", 1, 1, 0, [0, 0, 1, 0, 11], [0, .18], [330, .5, 1, -1], 1, 0, 1, .5, 0, 3, .5, 0, 1),
]:
    case_id, label, mode, sample_gain, bank_gain, pvoc, phrase, wave, add_blend = case[:9]
    depth = case[9] if len(case) > 9 else None
    sample_stage_gain = case[10] if len(case) > 10 else 1.0
    bank_level = case[11] if len(case) > 11 else .5
    wave_sync = case[12] if len(case) > 12 else 0
    direction_mode = case[13] if len(case) > 13 else 0
    wave_to_sample = case[14] if len(case) > 14 else .5
    sample_to_wave = case[15] if len(case) > 15 else 0
    retrigger = case[16] if len(case) > 16 else 1
    output, target = f"{case_id}.f32", f"{case_id}-target.f32"
    subprocess.run([runner, str(sample_path), str(OUT / output), str(OUT / target), str(mode),
                    str(sample_gain), str(bank_gain), str(frames), *map(str, pvoc), *map(str, phrase), *map(str, wave), str(add_blend),
                    str(depth if depth is not None else .5), str(int(depth is not None)), str(sample_stage_gain), str(bank_level), str(wave_sync),
                    str(direction_mode), str(wave_to_sample), str(sample_to_wave), str(retrigger)], check=True)
    legacy_stage_file = None
    if case_id.startswith("legacy-amp"):
        legacy_stage_file = f"{case_id}-cpp.f32"
        subprocess.run([legacy_stage, str(sample_path), str(OUT / legacy_stage_file),
                        str(sample_stage_gain / 2), "0", str(frames), str(block)], check=True)
    cases.append({"id": case_id, "label": label, "mode": mode, "sampleGain": sample_gain,
                  "bankGain": bank_gain, "vocoder": pvoc, "phrase": phrase, "wave": wave, "addBlend": add_blend,
                  "linkedDepth": depth,
                  "sampleStageGain": sample_stage_gain, "bankLevel": bank_level, "waveSync": wave_sync,
                  "directionMode": direction_mode, "waveToSample": wave_to_sample, "sampleToWave": sample_to_wave,
                  "sampleRetrigger": retrigger, "legacyStage": legacy_stage_file,
                  "target": target, "output": output, "followerMeter": follower_meters if direction_mode == 0 else None,
                  "blockSize": block})
(OUT / "manifest.json").write_text(json.dumps({
    "version": 1, "reference": "native Rust Main sample blend study", "sourceSha256": source_hash,
    "legacyFollowerSha256": hashlib.sha256((LEGACY / "dsp/core/nodes/EnvelopeFollowerNode.cpp").read_bytes()).hexdigest(),
    "legacyStageSha256": hashlib.sha256(b"".join(path.read_bytes() for path in [
        ROOT / "tools/legacy-main-gain-stage-reference.cpp",
        LEGACY / "dsp/core/nodes/GainNode.cpp",
        LEGACY / "dsp/core/nodes/CrossfaderNode.cpp",
        LEGACY / "dsp/core/nodes/MixerNode.cpp",
    ])).hexdigest(),
    "sampleRate": source_rate, "sampleSourceRate": source_rate, "sampleFrames": sample_frames,
    "sample": "source.f32", "channels": 2, "frames": frames, "stepFrame": frames // 2,
    "input": "input.f32", "waveTarget": "wave-target.f32", "cases": cases,
}, indent=2) + "\n")
print(f"Wrote {len(cases)} native Rust Main sample blend cases to {OUT}")
