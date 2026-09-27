#!/usr/bin/env python3
"""Compare REAPER's actual VST3 render with the native Rust FX graph.

Run on a disposable Xvfb display with MANIFOLD_ISOLATED_DISPLAY=1. The script
builds two temporary REAPER projects, renders their master mixes, and keeps
source/dry/wet WAVs plus measured differences under /tmp.
"""

from array import array
import json
import math
import os
from pathlib import Path
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time
import wave


ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"
OUTPUT = Path("/tmp/manifold-reaper-vst3-audio-proof")
RATE = 48_000
FRAMES = RATE
STEADY_START = 3_072


def run(*args: str, timeout: int = 45) -> None:
    subprocess.run(args, check=True, timeout=timeout, stdout=subprocess.DEVNULL)


def wait_for(path: Path, timeout: float = 20) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            result = path.read_text()
            if "FAILED" in result:
                raise AssertionError(result)
            if "done" in result:
                return result
        time.sleep(0.1)
    raise TimeoutError(f"REAPER did not write {path}")


def source_wav(path: Path) -> None:
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        samples = bytearray()
        for frame in range(FRAMES):
            left = round(12_000 * math.sin(2 * math.pi * 440 * frame / RATE))
            right = round(10_000 * math.sin(2 * math.pi * 660 * frame / RATE))
            samples.extend(struct.pack("<hh", left, right))
        output.writeframes(samples)


def make_project(work: Path, label: str, mix: float, env: dict[str, str]) -> list[float]:
    script = work / f"setup-{label}.lua"
    report = work / f"setup-{label}.txt"
    project = work / f"{label}.rpp"
    script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',{RATE},true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
reaper.SetOnlyTrackSelected(track)
reaper.SetEditCurPos(0,false,false)
reaper.InsertMedia('{work}/source.wav',0)
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Standalone FX',false,-1)
local out=io.open('{report}','w')
if fx<0 or reaper.CountMediaItems(0)~=1 then
 out:write('FAILED: FX or media missing\\n'); out:close(); return
end
reaper.TrackFX_SetParamNormalized(track,fx,0,2/20)
reaper.TrackFX_SetParamNormalized(track,fx,1,{mix})
reaper.TrackFX_SetParamNormalized(track,fx,2,0.8)
local start=reaper.time_precise()
local function finish()
if reaper.time_precise()-start<1 then reaper.defer(finish); return end
reaper.GetSetProjectInfo(0,'RENDER_SETTINGS',0,true)
reaper.GetSetProjectInfo(0,'RENDER_BOUNDSFLAG',0,true)
reaper.GetSetProjectInfo(0,'RENDER_STARTPOS',0,true)
reaper.GetSetProjectInfo(0,'RENDER_ENDPOS',1,true)
reaper.GetSetProjectInfo(0,'RENDER_SRATE',{RATE},true)
reaper.GetSetProjectInfo(0,'RENDER_CHANNELS',2,true)
reaper.GetSetProjectInfo(0,'RENDER_TAILFLAG',0,true)
reaper.GetSetProjectInfo(0,'RENDER_NORMALIZE',0,true)
reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{work}',true)
reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','{label}',true)
reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
reaper.Main_SaveProjectEx(0,'{project}',0)
for id=0,6 do
 out:write(id .. '=' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,id)) .. '\\n')
end
out:write('done\\n'); out:close()
end
reaper.defer(finish)
""")
    with (work / f"setup-{label}.log").open("w") as log:
        process = subprocess.Popen(
            ["reaper", "-cfgfile", str(work / "reaper.ini"), "-newinst",
             "-nosplash", "-noactivate", str(script)], env=env,
            stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
        )
        try:
            text = wait_for(report)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)
    values = {int(key): float(value) for key, value in
              (line.split("=", 1) for line in text.splitlines() if "=" in line)}
    assert len(values) == 7, values
    with (work / f"render-{label}.log").open("w") as log:
        subprocess.run(
            ["reaper", "-cfgfile", str(work / "reaper.ini"), "-newinst",
             "-nosplash", "-renderproject", str(project)], env=env,
            stdout=log, stderr=subprocess.STDOUT, timeout=45, check=True,
        )
    rendered = work / f"{label}.wav"
    assert rendered.exists(), f"REAPER did not render {rendered}"
    return [values[index] for index in range(7)]


def raw_f32(path: Path) -> array:
    values = array("f")
    values.frombytes(path.read_bytes())
    assert len(values) == FRAMES * 2, (path, len(values))
    return values


def difference(a: array, b: array, start_frame: int = 0) -> tuple[float, float]:
    errors = (float(left) - float(right) for left, right in
              zip(a[start_frame * 2:], b[start_frame * 2:]))
    peak = 0.0
    energy = 0.0
    count = 0
    for error in errors:
        peak = max(peak, abs(error))
        energy += error * error
        count += 1
    return peak, math.sqrt(energy / count)


def main() -> None:
    assert sys.byteorder == "little", "raw f32 comparison requires little endian"
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") and os.environ["DISPLAY"] != ":0"
    assert BUNDLE.is_dir(), "build the VST3 bundle first"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "GDK_BACKEND": "x11"}
    with tempfile.TemporaryDirectory(prefix="manifold-reaper-audio-") as directory:
        work = Path(directory)
        (work / "reaper.ini").write_text(
            f"[reaper]\nvstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n"
        )
        source_wav(work / "source.wav")
        dry_values = make_project(work, "dry", 0.0, env)
        wet_values = make_project(work, "wet", 0.7, env)
        assert abs(wet_values[0] - 0.1) < 1e-5
        assert abs(wet_values[1] - 0.7) < 1e-5
        assert abs(wet_values[2] - 0.8) < 1e-5
        for label in ("source", "dry", "wet"):
            shutil.copyfile(work / f"{label}.wav", OUTPUT / f"{label}.wav")
            run("ffmpeg", "-v", "error", "-i", str(work / f"{label}.wav"),
                "-f", "f32le", "-acodec", "pcm_f32le", "-y",
                str(work / f"{label}.f32"))
        authored = json.loads((ROOT / "projects/standalone-fx-module/project.json").read_text())
        for label, values in (("dry", dry_values), ("wet", wet_values)):
            doc = json.loads(json.dumps(authored))
            parameters = doc["signal"]["initialParameters"]
            for index, normalized in enumerate(values):
                value = round(normalized * 20) if index == 0 else normalized
                entry = next((item for item in parameters if item["nodeId"] == 2
                              and item["id"] == index), None)
                if entry is None:
                    parameters.append({"nodeId": 2, "id": index, "value": value})
                else:
                    entry["value"] = value
            project = work / f"native-{label}.json"
            project.write_text(json.dumps(doc))
            run("cargo", "run", "-q", "-p", "manifold-native", "--example",
                "render_fx_host_audio", "--", str(project),
                str(work / "source.f32"), str(work / f"native-{label}.f32"), "512",
                timeout=120)
        dry, wet = raw_f32(work / "dry.f32"), raw_f32(work / "wet.f32")
        native_dry = raw_f32(work / "native-dry.f32")
        native_wet = raw_f32(work / "native-wet.f32")
        dry_error = difference(dry, native_dry)
        wet_error = difference(wet, native_wet)
        steady_error = difference(wet, native_wet, STEADY_START)
        effect = difference(wet, dry)
        assert dry_error[0] < 2e-7, dry_error
        assert steady_error[0] < 2e-6, steady_error
        assert effect[1] > 0.05, effect
        for label in ("dry", "wet", "native-dry", "native-wet"):
            shutil.copyfile(work / f"{label}.f32", OUTPUT / f"{label}.f32")
        report = {
            "host": "REAPER Linux VST3", "effect": "WaveShaper", "rate": RATE,
            "frames": FRAMES, "steadyStartFrame": STEADY_START,
            "dryVsNative": {"peak": dry_error[0], "rms": dry_error[1]},
            "wetVsNativeFull": {"peak": wet_error[0], "rms": wet_error[1]},
            "wetVsNativeAfterStartup": {"peak": steady_error[0], "rms": steady_error[1]},
            "wetVsDry": {"peak": effect[0], "rms": effect[1]},
            "wetHostParameters": wet_values,
        }
        (OUTPUT / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))
        print(OUTPUT)


if __name__ == "__main__":
    main()
