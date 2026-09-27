#!/usr/bin/env python3
"""Import Tone Texture through the CLAP editor in REAPER, save, reopen, render."""

from array import array
import json
import os
from pathlib import Path
import runpy
import signal
import shutil
import subprocess
import tempfile
import time
import wave


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web/public"


def wait_for(path: Path, prefix: str, timeout: float = 15) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            result = path.read_text()
            if result.startswith(prefix):
                return result
            if result.startswith("FAILED"):
                raise AssertionError(result)
        time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for {path}")


def main():
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1", "use isolated X display"
    assert os.environ.get("DISPLAY") and os.environ["DISPLAY"] != ":0"
    module = ROOT / "target/clap/ManifoldFX.clap"
    assert module.is_file(), "build the CLAP bundle first"
    source = ROOT / "projects/graph-workspace/tone-texture.json"
    with tempfile.TemporaryDirectory(prefix="manifold-reaper-graph-clap-editor-") as folder:
        work = Path(folder)
        home = work / "home"
        (home / ".clap").mkdir(parents=True)
        (home / ".clap/ManifoldFX.clap").symlink_to(module)
        config = work / "reaper.ini"
        config.write_text("[reaper]\n")
        silence = work / "silence.wav"
        with wave.open(str(silence), "wb") as stream:
            stream.setnchannels(2)
            stream.setsampwidth(2)
            stream.setframerate(48000)
            stream.writeframes(bytes(48000 * 4))
        project = work / "editor-import.rpp"
        ready, saved = work / "ready.txt", work / "saved.txt"
        script = work / "probe.lua"
        script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
reaper.SetOnlyTrackSelected(track)
reaper.SetEditCurPos(0,false,false)
reaper.InsertMedia('{silence}',0)
local fx=reaper.TrackFX_AddByName(track,'CLAP: Manifold Graph',false,-1)
local out=io.open('{ready}','w')
if fx<0 then out:write('FAILED: Graph CLAP unavailable'); out:close(); return end
reaper.TrackFX_Show(track,fx,3)
out:write('done ' .. tostring(fx)); out:close()
local function poll()
 local command=io.open('{work / 'save-command.txt'}','r')
 if command then
  command:close()
  reaper.GetSetProjectInfo(0,'RENDER_SETTINGS',0,true)
  reaper.GetSetProjectInfo(0,'RENDER_BOUNDSFLAG',0,true)
  reaper.GetSetProjectInfo(0,'RENDER_STARTPOS',0,true)
  reaper.GetSetProjectInfo(0,'RENDER_ENDPOS',1,true)
  reaper.GetSetProjectInfo(0,'RENDER_SRATE',48000,true)
  reaper.GetSetProjectInfo(0,'RENDER_CHANNELS',2,true)
  reaper.GetSetProjectInfo(0,'RENDER_TAILFLAG',0,true)
  reaper.GetSetProjectInfo(0,'RENDER_NORMALIZE',0,true)
  reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{work}',true)
  reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','editor-import',true)
  reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
  reaper.Main_SaveProjectEx(0,'{project}',0)
  local result=io.open('{saved}','w'); result:write('done'); result:close()
  return
 end
 reaper.defer(poll)
end
reaper.defer(poll)
""")
        env = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
               "GDK_BACKEND": "x11", "MANIFOLD_GRAPH_IMPORT_PROBE": str(source)}
        with (work / "host.log").open("w") as log:
            process = subprocess.Popen(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                                        "-noactivate", str(script)], env=env,
                                       stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                wait_for(ready, "done")
                time.sleep(4)
                x11 = runpy.run_path(str(Path(__file__).with_name("probe-reaper-graph-vst3-gui.py")))["X11"]()
                editor = x11.editor()
                capture = PUBLIC / "graph-clap-reaper-editor-tone-import.png"
                subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab",
                                "-window_id", hex(editor), "-i", os.environ["DISPLAY"],
                                "-frames:v", "1", "-y", str(capture)], check=True, timeout=20)
                assert capture.stat().st_size > 10000
                x11.close()
                (work / "save-command.txt").write_text("save")
                wait_for(saved, "done")
                assert project.is_file() and project.stat().st_size > 1000
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        render_env = {key: value for key, value in env.items() if key != "MANIFOLD_GRAPH_IMPORT_PROBE"}
        with (work / "render.log").open("w") as log:
            subprocess.run(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                            "-renderproject", str(project)], env=render_env, stdout=log,
                           stderr=subprocess.STDOUT, timeout=45, check=True)
        wav = work / "editor-import.wav"
        assert wav.is_file(), (work / "render.log").read_text()[-1500:]
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(wav),
                                       "-f", "f32le", "-acodec", "pcm_f32le", "-"])
        actual = array("f"); actual.frombytes(raw)
        native = work / "native.f32"
        subprocess.run(["cargo", "run", "-q", "-p", "manifold-native", "--example",
                        "render_graph_midi_audio", "--", str(source), str(native),
                        "1024", "6000", "24000", "0"], cwd=ROOT, check=True, timeout=120)
        expected = array("f"); expected.frombytes(native.read_bytes())
        assert len(actual) == len(expected) == 48000 * 2, (len(actual), len(expected))
        peak = max(abs(value) for value in actual)
        error = max(abs(left - right) for left, right in zip(actual, expected))
        if not (peak > 0.01 and error < 1e-6):
            debug = Path("/tmp/manifold-reaper-graph-clap-debug")
            debug.mkdir(exist_ok=True)
            for name in ("host.log", "render.log", "editor-import.rpp", "reaper-clap-linux-x86_64.ini"):
                if (work / name).is_file(): shutil.copy2(work / name, debug / name)
            raise AssertionError((peak, error, str(debug)))
        target = PUBLIC / "graph-clap-reaper-editor-import.wav"
        target.write_bytes(wav.read_bytes())
        metrics = {"host": "REAPER Linux CLAP", "project": source.name,
                   "import": "original widget editor JSON file input", "savedAndReopened": True,
                   "renderFrames": 48000, "channels": 2, "peak": peak,
                   "peakErrorVsNative": error, "render": target.name,
                   "editorScreenshot": capture.name}
        (PUBLIC / "graph-clap-reaper-editor-import.json").write_text(json.dumps(metrics, indent=2) + "\n")
        print(json.dumps(metrics))


if __name__ == "__main__":
    main()
