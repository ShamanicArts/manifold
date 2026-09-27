#!/usr/bin/env python3
"""Render the general Manifold Graph VST3 with a MIDI item in isolated REAPER.

Requires DISPLAY on a disposable Xvfb server and MANIFOLD_ISOLATED_DISPLAY=1.
Writes a playable host render and metrics to web/public for review.
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


ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"
REVIEW = ROOT / "web/public"
RATE = 48_000
NATIVE_BLOCK = 1_024


def wait_for(path: Path) -> str:
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        if path.exists():
            result = path.read_text()
            if "FAILED" in result:
                raise AssertionError(result)
            if "done" in result:
                return result
        time.sleep(0.1)
    raise TimeoutError(f"REAPER setup did not complete: {path}")


def main() -> None:
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") not in (None, ":0"), "refusing user's display"
    assert BUNDLE.is_dir(), "build the VST3 bundle first"
    assert sys.byteorder == "little"
    with tempfile.TemporaryDirectory(prefix="manifold-graph-reaper-") as directory:
        work = Path(directory)
        config = work / "reaper.ini"
        config.write_text(f"[reaper]\nvstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n")
        report = work / "setup.txt"
        project = work / "graph-note.rpp"
        script = work / "setup.lua"
        script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',{RATE},true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Graph',false,-1)
local out=io.open('{report}','w')
if fx<0 then out:write('FAILED: Manifold Graph unavailable\\n'); out:close(); return end
local item=reaper.CreateNewMIDIItemInProj(track,0,1,false)
local take=reaper.GetActiveTake(item)
local start=reaper.MIDI_GetPPQPosFromProjTime(take,0.125)
local finish=reaper.MIDI_GetPPQPosFromProjTime(take,0.5)
reaper.MIDI_InsertNote(take,false,false,start,finish,0,60,100,false)
reaper.MIDI_Sort(take)
local begun=reaper.time_precise()
local function finish_setup()
 if reaper.time_precise()-begun<1 then reaper.defer(finish_setup); return end
 reaper.GetSetProjectInfo(0,'RENDER_SETTINGS',0,true)
 reaper.GetSetProjectInfo(0,'RENDER_BOUNDSFLAG',0,true)
 reaper.GetSetProjectInfo(0,'RENDER_STARTPOS',0,true)
 reaper.GetSetProjectInfo(0,'RENDER_ENDPOS',1,true)
 reaper.GetSetProjectInfo(0,'RENDER_SRATE',{RATE},true)
 reaper.GetSetProjectInfo(0,'RENDER_CHANNELS',2,true)
 reaper.GetSetProjectInfo(0,'RENDER_TAILFLAG',0,true)
 reaper.GetSetProjectInfo(0,'RENDER_NORMALIZE',0,true)
 reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{work}',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','graph-note',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
 reaper.Main_SaveProjectEx(0,'{project}',0)
 out:write('fx=' .. tostring(fx) .. '\\n')
 out:write('parameters=' .. tostring(reaper.TrackFX_GetNumParams(track,fx)) .. '\\n')
 out:write('done\\n'); out:close()
end
reaper.defer(finish_setup)
""")
        env = {**os.environ, "GDK_BACKEND": "x11"}
        with (work / "setup.log").open("w") as log:
            process = subprocess.Popen(
                ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                 "-noactivate", str(script)], env=env, stdout=log,
                stderr=subprocess.STDOUT, start_new_session=True,
            )
            try:
                setup = wait_for(report)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        reported_parameters = int(next(line.split("=", 1)[1] for line in setup.splitlines()
                                       if line.startswith("parameters=")))
        # REAPER appends its own host controls after the plug-in's 128 slots.
        assert reported_parameters >= 128, setup
        with (work / "render.log").open("w") as log:
            subprocess.run(
                ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                 "-renderproject", str(project)], env=env, stdout=log,
                stderr=subprocess.STDOUT, timeout=45, check=True,
            )
        rendered = work / "graph-note.wav"
        assert rendered.exists(), (work / "render.log").read_text()[-1500:]
        raw = subprocess.check_output([
            "ffmpeg", "-v", "error", "-i", str(rendered), "-f", "f32le",
            "-acodec", "pcm_f32le", "-",
        ])
        samples = array("f")
        samples.frombytes(raw)
        channels = 2
        frames = len(samples) // channels
        assert frames == RATE, frames
        before = samples[: int(0.1 * RATE) * channels]
        sounding = samples[int(0.2 * RATE) * channels : int(0.45 * RATE) * channels]
        lead_peak = max(abs(sample) for sample in before)
        note_peak = max(abs(sample) for sample in sounding)
        note_rms = math.sqrt(sum(sample * sample for sample in sounding) / len(sounding))
        assert lead_peak < 1e-6, lead_peak
        assert note_peak > 0.001 and note_rms > 0.0001, (note_peak, note_rms)
        native_path = work / "native.f32"
        subprocess.run([
            "cargo", "run", "-q", "-p", "manifold-native", "--example",
            "render_graph_midi_audio", "--",
            str(ROOT / "projects/graph-workspace/note-voice.json"),
            str(native_path), str(NATIVE_BLOCK), "6000", "24000", "100",
        ], cwd=ROOT, check=True, timeout=120)
        native = array("f")
        native.frombytes(native_path.read_bytes())
        assert len(native) == len(samples)
        differences = [host - direct for host, direct in zip(samples, native)]
        parity_peak = max(abs(error) for error in differences)
        parity_rms = math.sqrt(sum(error * error for error in differences) / len(differences))
        assert parity_peak < 1e-7, (parity_peak, parity_rms)
        target = REVIEW / "graph-vst3-reaper-note.wav"
        target.write_bytes(rendered.read_bytes())
        metrics = {
            "host": "REAPER Linux VST3", "class": "Manifold Graph",
            "project": "note-voice.json", "rate": RATE, "frames": frames,
            "pluginParameters": 128, "reaperReportedParameters": reported_parameters,
            "midiPitch": 60,
            "noteStartSeconds": 0.125, "noteEndSeconds": 0.5,
            "beforeNotePeak": lead_peak, "notePeak": note_peak, "noteRms": note_rms,
            "nativeBlockFrames": NATIVE_BLOCK,
            "hostVsNativePeakError": parity_peak,
            "hostVsNativeRmsError": parity_rms,
            "render": target.name,
        }
        (REVIEW / "graph-vst3-reaper-note.json").write_text(json.dumps(metrics, indent=2) + "\n")
        print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
