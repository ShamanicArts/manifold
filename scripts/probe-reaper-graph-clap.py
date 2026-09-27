#!/usr/bin/env python3
"""REAPER CLAP: save a MIDI graph project, reopen, render, compare native Rust."""

from array import array
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web/public"


def main():
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1", "use an isolated X display"
    assert os.environ.get("DISPLAY") and os.environ["DISPLAY"] != ":0"
    module = ROOT / "target/clap/ManifoldFX.clap"
    assert module.is_file(), "build with scripts/build-clap.sh first"
    with tempfile.TemporaryDirectory(prefix="manifold-reaper-graph-clap-") as folder:
        work = Path(folder)
        home = work / "home"
        (home / ".clap").mkdir(parents=True)
        (home / ".clap/ManifoldFX.clap").symlink_to(module)
        config = work / "reaper.ini"
        config.write_text("[reaper]\n")
        project = work / "graph-clap.rpp"
        ready = work / "ready.txt"
        script = work / "probe.lua"
        script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local item=reaper.CreateNewMIDIItemInProj(track,0,1,false)
local take=reaper.GetActiveTake(item)
local start=reaper.MIDI_GetPPQPosFromProjTime(take,0.125)
local finish=reaper.MIDI_GetPPQPosFromProjTime(take,0.5)
reaper.MIDI_InsertNote(take,false,false,start,finish,0,60,100,false)
reaper.MIDI_Sort(take)
local fx=reaper.TrackFX_AddByName(track,'CLAP: Manifold Graph',false,-1)
local out=io.open('{ready}','w')
if fx<0 then out:write('FAILED: Graph CLAP unavailable'); out:close(); return end
reaper.GetSetProjectInfo(0,'RENDER_SETTINGS',0,true)
reaper.GetSetProjectInfo(0,'RENDER_BOUNDSFLAG',0,true)
reaper.GetSetProjectInfo(0,'RENDER_STARTPOS',0,true)
reaper.GetSetProjectInfo(0,'RENDER_ENDPOS',1,true)
reaper.GetSetProjectInfo(0,'RENDER_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'RENDER_CHANNELS',2,true)
reaper.GetSetProjectInfo(0,'RENDER_TAILFLAG',0,true)
reaper.GetSetProjectInfo(0,'RENDER_NORMALIZE',0,true)
reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{work}',true)
reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','graph-clap',true)
reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
reaper.Main_SaveProjectEx(0,'{project}',0)
out:write('done ' .. tostring(fx)); out:close()
""")
        env = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
               "GDK_BACKEND": "x11"}
        with (work / "host.log").open("w") as log:
            process = subprocess.Popen(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                                        "-noactivate", str(script)], env=env,
                                       stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                for _ in range(150):
                    if ready.exists() or process.poll() is not None:
                        break
                    time.sleep(0.1)
                result = ready.read_text() if ready.exists() else ""
                assert result.startswith("done 0"), (result, (work / "host.log").read_text()[-1500:])
                assert project.is_file() and project.stat().st_size > 1000
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        with (work / "render.log").open("w") as log:
            subprocess.run(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                            "-renderproject", str(project)], env=env, stdout=log,
                           stderr=subprocess.STDOUT, check=True, timeout=45)
        wav = work / "graph-clap.wav"
        assert wav.is_file(), (work / "render.log").read_text()[-1500:]
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(wav),
                                       "-f", "f32le", "-acodec", "pcm_f32le", "-"])
        actual = array("f"); actual.frombytes(raw)
        native = work / "native.f32"
        subprocess.run(["cargo", "run", "-q", "-p", "manifold-native", "--example",
                        "render_graph_midi_audio", "--",
                        str(ROOT / "projects/graph-workspace/note-voice.json"), str(native),
                        "1024", "6000", "24000", "100"], cwd=ROOT, check=True, timeout=120)
        expected = array("f"); expected.frombytes(native.read_bytes())
        assert len(actual) == len(expected) == 48_000 * 2, (len(actual), len(expected))
        peak = max(abs(sample) for sample in actual)
        error = max(abs(left - right) for left, right in zip(actual, expected))
        assert peak > 0.01 and error < 1e-6, (peak, error)
        target = PUBLIC / "graph-clap-reaper-note-voice.wav"
        target.write_bytes(wav.read_bytes())
        metrics = {"host": "REAPER Linux CLAP", "project": "note-voice.json",
                   "savedAndReopened": True, "renderFrames": 48000, "channels": 2,
                   "peak": peak, "peakErrorVsNative": error, "render": target.name}
        (PUBLIC / "graph-clap-reaper-note-voice.json").write_text(json.dumps(metrics, indent=2) + "\n")
        print(json.dumps(metrics))


if __name__ == "__main__":
    main()
