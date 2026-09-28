#!/usr/bin/env python3
"""Render the assembled Main VST3 MIDI source in an isolated REAPER session."""

from array import array
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"
RATE = 48_000


def wait_for(path: Path) -> str:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if path.exists():
            content = path.read_text()
            if "FAILED" in content:
                raise AssertionError(content)
            if "done" in content:
                return content
        time.sleep(0.1)
    raise TimeoutError(f"REAPER did not finish {path}")


def run_setup(work: Path, config: Path, env: dict[str, str], script: str,
              name: str, project: Path | None = None) -> str:
    source = work / f"{name}.lua"
    source.write_text(script)
    report = work / f"{name}.txt"
    with (work / f"{name}.log").open("w") as log:
        command = ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                   "-noactivate"]
        if project is not None:
            command.append(str(project))
        command.append(str(source))
        process = subprocess.Popen(
            command, env=env, stdout=log,
            stderr=subprocess.STDOUT, start_new_session=True,
        )
        try:
            return wait_for(report)
        except TimeoutError as error:
            progress = report.read_text() if report.exists() else "report absent"
            raise TimeoutError(f"{error}; progress: {progress}; REAPER log: {(work / f'{name}.log').read_text()[-2500:]}") from error
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=5)


def main() -> None:
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") not in (None, ":0")
    assert BUNDLE.is_dir()
    with tempfile.TemporaryDirectory(prefix="manifold-main-vst3-reaper-") as directory:
        work = Path(directory)
        config = work / "reaper.ini"
        config.write_text(f"[reaper]\nvstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n")
        env = {**os.environ, "GDK_BACKEND": "x11", "PULSE_SERVER": "unix:/nonexistent",
               "PIPEWIRE_REMOTE": "manifold-disconnected"}
        project = work / "main-note.rpp"
        default_project = work / "main-default.rpp"
        setup = run_setup(work, config, env, f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',{RATE},true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local out=io.open('{work}/setup.txt','w')
out:write('track inserted\\n'); out:flush()
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Main',false,-1)
out:write('FX result=' .. tostring(fx) .. '\\n'); out:flush()
if fx<0 then out:write('FAILED: Manifold Main unavailable\\n'); out:close(); return end
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
 reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','main-default',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
 reaper.Main_SaveProjectEx(0,'{default_project}',0)
 local source_output=-1
 for index=0,reaper.TrackFX_GetNumParams(track,fx)-1 do
  local ok,name=reaper.TrackFX_GetParamName(track,fx,index)
  if ok and name=='Source Output' then source_output=index; break end
 end
 if source_output<0 then out:write('FAILED: Source Output parameter missing\\n'); out:close(); return end
 reaper.TrackFX_SetParamNormalized(track,fx,source_output,0.1)
 reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','main-note',true)
 reaper.Main_SaveProjectEx(0,'{project}',0)
 out:write('parameters=' .. tostring(reaper.TrackFX_GetNumParams(track,fx)) .. '\\n')
 out:write('sourceOutputIndex=' .. tostring(source_output) .. '\\n')
 out:write('sourceOutputValue=' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,source_output)) .. '\\n')
 out:write('done\\n'); out:close()
end
reaper.defer(finish_setup)
""", "setup")
        count = int(next(line.split("=", 1)[1] for line in setup.splitlines()
                         if line.startswith("parameters=")))
        assert count >= 204, setup
        source_index = int(next(line.split("=", 1)[1] for line in setup.splitlines()
                                if line.startswith("sourceOutputIndex=")))
        source_value = float(next(line.split("=", 1)[1] for line in setup.splitlines()
                                  if line.startswith("sourceOutputValue=")))
        assert abs(source_value - 0.1) < 1e-6, setup
        reopened = run_setup(work, config, env, f"""
local track=reaper.GetTrack(0,0)
local out=io.open('{work}/reopen.txt','w')
if not track or reaper.TrackFX_GetCount(track)~=1 then
 out:write('FAILED: Main not recalled\\n'); out:close(); return
end
local ok,name=reaper.TrackFX_GetFXName(track,0,'')
if not ok or not string.find(name,'Manifold Main',1,true) then
 out:write('FAILED: wrong recalled class ' .. tostring(name) .. '\\n'); out:close(); return
end
out:write('parameters=' .. tostring(reaper.TrackFX_GetNumParams(track,0)) .. '\\n')
out:write('sourceOutputValue=' .. tostring(reaper.TrackFX_GetParamNormalized(track,0,{source_index})) .. '\\n')
out:write('done\\n'); out:close()
""", "reopen", project)
        recalled_value = float(next(line.split("=", 1)[1] for line in reopened.splitlines()
                                    if line.startswith("sourceOutputValue=")))
        assert abs(recalled_value - 0.1) < 1e-6, (
            reopened, (work / "setup.log").read_text()[-1000:],
            (work / "reopen.log").read_text()[-1000:])
        with (work / "default-render.log").open("w") as log:
            subprocess.run(["reaper", "-cfgfile", str(config), "-newinst",
                            "-nosplash", "-renderproject", str(default_project)],
                           env=env, stdout=log, stderr=subprocess.STDOUT,
                           timeout=60, check=True)
        baseline = work / "main-default.wav"
        assert baseline.exists(), (work / "default-render.log").read_text()[-1500:]
        baseline_raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i",
                                                str(baseline), "-f", "f32le", "-acodec",
                                                "pcm_f32le", "-"])
        baseline_samples = array("f")
        baseline_samples.frombytes(baseline_raw)
        assert len(baseline_samples) == RATE * 2
        baseline_note = baseline_samples[int(0.2 * RATE) * 2:int(0.45 * RATE) * 2]
        baseline_peak = max(map(abs, baseline_note))
        assert baseline_peak > 0.01, baseline_peak
        with (work / "render.log").open("w") as log:
            subprocess.run(["reaper", "-cfgfile", str(config), "-newinst",
                            "-nosplash", "-renderproject", str(project)],
                           env=env, stdout=log, stderr=subprocess.STDOUT,
                           timeout=60, check=True)
        rendered = work / "main-note.wav"
        assert rendered.exists(), (work / "render.log").read_text()[-1500:]
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i",
                                       str(rendered), "-f", "f32le", "-acodec",
                                       "pcm_f32le", "-"])
        samples = array("f")
        samples.frombytes(raw)
        assert len(samples) == RATE * 2, len(samples)
        before = samples[:int(0.1 * RATE) * 2]
        note = samples[int(0.2 * RATE) * 2:int(0.45 * RATE) * 2]
        lead_peak = max(map(abs, before))
        note_peak = max(map(abs, note))
        note_rms = math.sqrt(sum(value * value for value in note) / len(note))
        assert lead_peak < 1e-6, lead_peak
        assert note_peak > 0.001 and note_rms > 0.0001, (note_peak, note_rms)
        assert 0.1 < note_peak / baseline_peak < 0.35, (note_peak, baseline_peak)
        report = {"host": "REAPER Linux VST3", "class": "Manifold Main",
                  "sampleRate": RATE, "frames": RATE,
                  "hostParameterCount": count, "midiNote": 60,
                  "sourceOutputIndex": source_index,
                  "sourceOutputSavedAndReopened": recalled_value,
                  "defaultNotePeak": baseline_peak,
                  "editedToDefaultPeakRatio": note_peak / baseline_peak,
                  "noteStartSeconds": 0.125, "noteEndSeconds": 0.5,
                  "beforeNotePeak": lead_peak, "notePeak": note_peak,
                  "noteRms": note_rms, "render": "main-vst3-reaper-note.wav"}
        review = ROOT / "web/public"
        (review / report["render"]).write_bytes(rendered.read_bytes())
        (review / "main-vst3-reaper-note.json").write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
