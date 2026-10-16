#!/usr/bin/env python3
"""Prove a browser-authored host slot controls Graph VST3 in isolated REAPER.

Run with DISPLAY on a disposable X server and MANIFOLD_ISOLATED_DISPLAY=1.
The input JSON is exported by verify-graph-workspace-browser.mjs.
"""

from array import array
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import wave


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web/public"
BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"
PROJECT = PUBLIC / "graph-host-slot-browser-project.json"
PRESET = PUBLIC / "graph-host-slot-browser.vstpreset"


def wait_for(path: Path, timeout: float = 30) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            value = path.read_text()
            if "FAILED" in value:
                raise AssertionError(value)
            if "done" in value:
                return value
        time.sleep(0.1)
    raise TimeoutError(f"REAPER did not complete {path}")


def audio(path: Path, env: dict[str, str], config: Path) -> array:
    with path.with_suffix(".log").open("w") as log:
        subprocess.run(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                        "-renderproject", str(path)], env=env, stdout=log,
                       stderr=subprocess.STDOUT, timeout=45, check=True)
    wav = path.with_suffix(".wav")
    assert wav.exists(), path.with_suffix(".log").read_text()[-1500:]
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(wav),
                                   "-f", "f32le", "-acodec", "pcm_f32le", "-"])
    frames = array("f")
    frames.frombytes(raw)
    assert len(frames) == 48_000 * 2, len(frames)
    return frames


def dominant_frequency(frames: array) -> float:
    # Analyze a steady 8192-frame Hann window with a standard radix-2 FFT.
    count = 8192
    samples = [complex(frames[2 * (12_000 + index)] *
                       .5 * (1 - math.cos(2 * math.pi * index / (count - 1))))
               for index in range(count)]
    index = 0
    for position in range(1, count):
        bit = count >> 1
        while index & bit:
            index ^= bit
            bit >>= 1
        index ^= bit
        if position < index:
            samples[position], samples[index] = samples[index], samples[position]
    span = 2
    while span <= count:
        turn = complex(math.cos(-2 * math.pi / span), math.sin(-2 * math.pi / span))
        for start in range(0, count, span):
            phase = 1 + 0j
            for offset in range(span // 2):
                first = samples[start + offset]
                second = phase * samples[start + offset + span // 2]
                samples[start + offset] = first + second
                samples[start + offset + span // 2] = first - second
                phase *= turn
        span *= 2
    lower = math.ceil(100 * count / 48_000)
    upper = math.floor(3000 * count / 48_000)
    peak = max(range(lower, upper + 1), key=lambda bin: abs(samples[bin]))
    lower_log, center_log, upper_log = (math.log(max(abs(samples[bin]), 1e-20))
                                        for bin in (peak - 1, peak, peak + 1))
    curve = lower_log - 2 * center_log + upper_log
    offset = .5 * (lower_log - upper_log) / curve if curve else 0
    return (peak + offset) * 48_000 / count


def main() -> None:
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") not in (None, ":0"), "refusing user's display"
    assert BUNDLE.is_dir()
    assert sys.byteorder == "little"
    bundle = json.loads(PROJECT.read_text())
    assert any(binding == {"slot": 41, "nodeId": 4, "id": 1}
               for binding in bundle["hostBindings"])
    assert not any(binding["slot"] == 1 for binding in bundle["hostBindings"])
    subprocess.run(["cargo", "run", "-q", "-p", "manifold-vst3", "--example",
                    "export_graph_preset", "--", str(PROJECT), str(PRESET)],
                   cwd=ROOT, check=True, timeout=120)

    with tempfile.TemporaryDirectory(prefix="manifold-host-slot-") as directory:
        work = Path(directory)
        config = work / "reaper.ini"
        config.write_text(f"[reaper]\nvstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n")
        with wave.open(str(work / "silence.wav"), "wb") as source:
            source.setnchannels(2)
            source.setsampwidth(2)
            source.setframerate(48_000)
            source.writeframes(bytes(48_000 * 4))
        baseline = work / "baseline.rpp"
        changed = work / "changed.rpp"
        report = work / "setup.txt"
        script = work / "setup.lua"
        script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
reaper.SetOnlyTrackSelected(track)
reaper.SetEditCurPos(0,false,false)
reaper.InsertMedia('{work}/silence.wav',0)
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Graph',false,-1)
local out=io.open('{report}','w')
if fx<0 then out:write('FAILED: graph unavailable'); out:close(); return end
if not reaper.TrackFX_SetPreset(track,fx,'{PRESET}') then
 out:write('FAILED: preset load'); out:close(); return
end
local begun=reaper.time_precise()
local function finish()
 if reaper.time_precise()-begun<1 then reaper.defer(finish); return end
 local before=reaper.TrackFX_GetParamNormalized(track,fx,41)
 local vacant=reaper.TrackFX_GetParamNormalized(track,fx,1)
 reaper.GetSetProjectInfo(0,'RENDER_SETTINGS',0,true)
 reaper.GetSetProjectInfo(0,'RENDER_BOUNDSFLAG',0,true)
 reaper.GetSetProjectInfo(0,'RENDER_STARTPOS',0,true)
 reaper.GetSetProjectInfo(0,'RENDER_ENDPOS',1,true)
 reaper.GetSetProjectInfo(0,'RENDER_SRATE',48000,true)
 reaper.GetSetProjectInfo(0,'RENDER_CHANNELS',2,true)
 reaper.GetSetProjectInfo(0,'RENDER_TAILFLAG',0,true)
 reaper.GetSetProjectInfo(0,'RENDER_NORMALIZE',0,true)
 reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{work}',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','baseline',true)
 reaper.Main_SaveProjectEx(0,'{baseline}',0)
 reaper.TrackFX_SetParamNormalized(track,fx,41,0.1)
 local after=reaper.TrackFX_GetParamNormalized(track,fx,41)
 reaper.SetEditCurPos(0,false,false)
 reaper.OnPlayButton()
 local applied=reaper.time_precise()
 local function save_changed()
  if reaper.time_precise()-applied<1 then reaper.defer(save_changed); return end
  reaper.OnStopButton()
  reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','changed',true)
  reaper.Main_SaveProjectEx(0,'{changed}',0)
  out:write('before=' .. tostring(before) .. '\\n')
  out:write('vacant=' .. tostring(vacant) .. '\\n')
  out:write('after=' .. tostring(after) .. '\\n')
  out:write('done\\n'); out:close()
 end
 reaper.defer(save_changed)
end
reaper.defer(finish)
""")
        env = {**os.environ, "GDK_BACKEND": "x11"}
        env.pop("WAYLAND_DISPLAY", None)
        with (work / "setup.log").open("w") as log:
            process = subprocess.Popen(["reaper", "-cfgfile", str(config), "-newinst",
                                        "-nosplash", "-noactivate", str(script)],
                                       env=env, stdout=log, stderr=subprocess.STDOUT,
                                       start_new_session=True)
            try:
                values = dict(line.split("=", 1) for line in wait_for(report).splitlines()
                              if "=" in line)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        before = float(values["before"])
        after = float(values["after"])
        expected = (330 - 20) / (16_000 - 20)
        assert abs(before - expected) < 1e-4, (before, expected)
        assert abs(after - .1) < 1e-4, after
        source = audio(baseline, env, config)
        edited = audio(changed, env, config)
        base_hz = dominant_frequency(source)
        edited_hz = dominant_frequency(edited)
        assert abs(base_hz - 330) < 5, base_hz
        assert abs(edited_hz - 1618) < 10, edited_hz
        difference = max(abs(a - b) for a, b in zip(edited, source))
        assert difference > .05, difference
        result = {"project": PROJECT.name, "preset": PRESET.name,
                  "slot": 42, "previousSlot": 2, "initialNormalized": before,
                  "hostSetNormalized": after, "baselineFrequencyHz": base_hz,
                  "changedFrequencyHz": edited_hz, "peakAudioDifference": difference,
                  "freshProcessRender": True}
        (PUBLIC / "graph-host-slot-reaper-proof.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
