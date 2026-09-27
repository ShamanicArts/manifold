#!/usr/bin/env python3
"""Publish the REAPER/native render comparison as a small audio review page."""

from array import array
import json
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
PROOF = Path("/tmp/manifold-reaper-vst3-audio-proof")
PUBLIC = ROOT / "web/public"
PREFIX = "standalone-fx-reaper-audio"


def samples(name: str) -> array:
    values = array("f")
    values.frombytes((PROOF / name).read_bytes())
    return values


def waveform(values: array, start: int = 12_000, count: int = 512) -> str:
    points = []
    for index in range(count):
        sample = values[2 * (start + index)]
        points.append(f"{'M' if index == 0 else 'L'}{index * 900 / (count - 1):.1f},{110 - sample * 180:.1f}")
    return " ".join(points)


def startup_error(wet: array, native: array) -> str:
    points = []
    for index in range(256):
        start = index * 16
        end = start + 16
        peak = max(abs(wet[2 * frame + channel] - native[2 * frame + channel])
                   for frame in range(start, end) for channel in (0, 1))
        points.append(f"{'M' if index == 0 else 'L'}{index * 900 / 255:.1f},{174 - peak * 8000:.1f}")
    return " ".join(points)


def main() -> None:
    metrics = json.loads((PROOF / "metrics.json").read_text())
    dry = samples("dry.f32")
    wet = samples("wet.f32")
    native = samples("native-wet.f32")
    native_512 = samples("native-wet-512.f32")
    for label in ("source", "dry", "wet"):
        shutil.copyfile(PROOF / f"{label}.wav", PUBLIC / f"{PREFIX}-{label}.wav")
    shutil.copyfile(PROOF / "metrics.json", PUBLIC / f"{PREFIX}-metrics.json")
    page = """<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Manifold · REAPER audio render proof</title>
  <style>
    :root { font-family: system-ui, sans-serif; color: #dce5ed; background: #0b1220; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(980px, calc(100% - 36px)); margin: 0 auto; padding: 36px 0 80px; }
    header { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 18px; border-bottom: 1px solid #334155; font-size: 12px; }
    a { color: #8fe2e7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .eyebrow { color: #8fe2e7; text-transform: uppercase; letter-spacing: .1em; font: 11px ui-monospace, monospace; margin-top: 28px; }
    h1 { font-size: clamp(30px, 5vw, 54px); font-weight: 500; letter-spacing: -.04em; margin: 8px 0 14px; }
    h2 { font-size: 22px; font-weight: 500; margin: 42px 0 12px; }
    p { color: #aebdcc; line-height: 1.6; }
    .lead { max-width: 780px; font-size: 16px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 28px 0; }
    .card { border: 1px solid #334155; background: #111d2e; padding: 18px; }
    .card b { display: block; color: #f1f6f8; font-size: 24px; font-weight: 500; }
    .card span { display: block; color: #9fb1c0; font-size: 12px; line-height: 1.5; margin-top: 7px; }
    .audio { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .audio section { border: 1px solid #334155; padding: 15px; min-width: 0; }
    .audio b { display: block; font-weight: 500; margin-bottom: 10px; }
    audio { width: 100%; height: 34px; }
    svg { display: block; width: 100%; height: auto; border: 1px solid #334155; background: #101b2b; }
    .legend { display: flex; gap: 20px; flex-wrap: wrap; font-size: 12px; color: #afbfcb; }
    .legend i { display: inline-block; width: 12px; height: 3px; vertical-align: middle; margin-right: 5px; }
    .note { border-left: 2px solid #caab77; padding: 2px 0 2px 16px; }
    code { color: #c7e5e3; }
    @media (max-width: 650px) { .grid, .audio { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header><span>MANIFOLD / AUDIO HOST CHECKPOINT</span><a href="/standalone-fx-reaper-proof.html">REAPER editor and automation proof ↗</a></header>
    <p class="eyebrow">Standalone FX · WaveShaper · REAPER VST3</p>
    <h1>A real DAW render against the Rust graph.</h1>
    <p class="lead">REAPER rendered a one-second stereo source through the packaged Standalone FX VST3. The same authored project and source were rendered by native Rust. Separate bypass and wet renders make both the host audio path and the effect audible and measurable.</p>
    <div class="grid">
      <div class="card"><b>@@DRY@@</b><span>Largest dry REAPER/native sample difference, full second</span></div>
      <div class="card"><b>@@WET@@</b><span>Largest wet REAPER/native difference, full second with 1,024-frame Rust blocks</span></div>
      <div class="card"><b>@@EFFECT@@</b><span>Wet versus bypass RMS difference</span></div>
    </div>
    <h2>Listen to the three renders</h2>
    <p>The source has a 440 Hz left tone and a 660 Hz right tone. The bypass and WaveShaper files are actual REAPER master renders at 48 kHz, 24-bit stereo.</p>
    <div class="audio">
      <section><b>Source</b><audio controls preload="metadata" src="/standalone-fx-reaper-audio-source.wav"></audio></section>
      <section><b>Bypass · REAPER</b><audio controls preload="metadata" src="/standalone-fx-reaper-audio-dry.wav"></audio></section>
      <section><b>WaveShaper · REAPER</b><audio controls preload="metadata" src="/standalone-fx-reaper-audio-wet.wav"></audio></section>
    </div>
    <h2>The steady waveform</h2>
    <p>Left channel, 512 samples beginning at frame 12,000. The Rust and REAPER wet traces overlap at this scale.</p>
    <svg viewBox="0 0 900 220" role="img" aria-label="Dry waveform and overlapping REAPER and native Rust WaveShaper outputs">
      <path d="M0,110 L900,110" stroke="#334155" fill="none" />
      <path d="@@DRY_PATH@@" stroke="#72889b" stroke-width="1.5" fill="none" />
      <path d="@@NATIVE_PATH@@" stroke="#d7b171" stroke-width="2.4" fill="none" />
      <path d="@@WET_PATH@@" stroke="#7fdee4" stroke-width="1.3" fill="none" />
    </svg>
    <p class="legend"><span><i style="background:#72889b"></i>REAPER bypass</span><span><i style="background:#7fdee4"></i>REAPER WaveShaper</span><span><i style="background:#d7b171"></i>native Rust WaveShaper</span></p>
    <h2>Why the first comparison differed</h2>
    <p>A 512-frame native reference differs from REAPER by up to <code>@@ALTERNATE@@</code> during startup; the 1,024-frame reference matches the entire wet render to <code>@@WET@@</code>. The original C++ WaveShaper advances one shared smoothing state through the left channel before the right. Rust preserves that behavior, so its startup response depends on block partition. This plot shows the 512-frame comparison over the first 4,096 frames.</p>
    <svg viewBox="0 0 900 190" role="img" aria-label="Error caused by comparing the REAPER render to a 512-frame native reference during the first 4096 samples">
      <path d="M0,174 L900,174" stroke="#334155" fill="none" />
      <path d="@@ERROR_PATH@@" stroke="#caab77" stroke-width="2" fill="none" />
    </svg>
    <p class="note">This comparison covers WaveShaper at 48 kHz in one REAPER render configuration. The full wet and bypass renders match their 1,024-frame native references to 24-bit WAV quantization. Other effect types and host buffer layouts require their own comparisons. Preserving the legacy channel-first smoothing is a deliberate porting decision that can be revisited.</p>
    <p>Repeat with <code>DISPLAY=:88 MANIFOLD_ISOLATED_DISPLAY=1 python3 scripts/probe-reaper-vst3-audio.py</code>. <a href="/standalone-fx-reaper-audio-metrics.json">Open the measured values ↗</a></p>
  </main>
</body>
</html>
"""
    substitutions = {
        "@@DRY@@": f"{metrics['dryVsNative']['peak']:.3g}",
        "@@WET@@": f"{metrics['wetVsNativeFull']['peak']:.3g}",
        "@@EFFECT@@": f"{metrics['wetVsDry']['rms']:.3f}",
        "@@ALTERNATE@@": f"{metrics['wetVsNativeAt512']['peak']:.4f}",
        "@@DRY_PATH@@": waveform(dry),
        "@@WET_PATH@@": waveform(wet),
        "@@NATIVE_PATH@@": waveform(native),
        "@@ERROR_PATH@@": startup_error(wet, native_512),
    }
    for marker, value in substitutions.items():
        page = page.replace(marker, value)
    output = PUBLIC / f"{PREFIX}-proof.html"
    output.write_text(page)
    print(output)


if __name__ == "__main__":
    main()
