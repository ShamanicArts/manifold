#!/usr/bin/env python3
"""Exercise retrospective capture through real Graph editors in REAPER.

Run on an isolated X display with MANIFOLD_ISOLATED_DISPLAY=1 after building a plug-in.
The source graph is imported through the packaged WebKit editor, a pointer
presses its capture button, and the saved host state is rendered fresh.
"""

from array import array
import argparse
import base64
import json
import os
from pathlib import Path
import re
import runpy
import signal
import subprocess
import tempfile
import time
import wave


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "projects/graph-workspace/retrospective-multisource.json"
CLAP_MODULE = ROOT / "target/clap/ManifoldFX.clap"
VST3_BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"


def wait_for(path: Path, timeout: float = 15) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            return path.read_text()
        time.sleep(0.1)
    raise TimeoutError(f"waiting for {path}")


def state_from_project(path: Path, format_name: str) -> dict:
    text = path.read_text(errors="replace")
    if format_name == "clap":
        encoded = text.split("<STATE\n", 1)[1].split("\n        >", 1)[0]
        return json.loads(base64.b64decode("".join(encoded.split())))
    block = text.split('<VST "VST3: Manifold Graph', 1)[1]
    lines = block.splitlines()[1:]
    # REAPER writes a short VST3 header chunk first, followed by the plug-in's
    # base64 state chunk. The state begins with a small binary header and JSON.
    chunks = []
    for line in lines[1:]:
        chunk = line.strip()
        if not re.fullmatch(r"[A-Za-z0-9+/=]+", chunk):
            break
        chunks.append(chunk)
        if len(chunk) < 128:
            break
    decoded = base64.b64decode("".join(chunks))
    start = decoded.index(b"{")
    return json.JSONDecoder().raw_decode(decoded[start:].decode("utf-8", errors="replace"))[0]


def mute_host_stream(pid: int) -> None:
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        inputs = json.loads(subprocess.check_output(
            ["pactl", "-f", "json", "list", "sink-inputs"]))
        for stream in inputs:
            if stream.get("properties", {}).get("application.process.id") == str(pid):
                subprocess.run(["pactl", "set-sink-input-mute", str(stream["index"]), "1"],
                               check=True)
                return
        time.sleep(.1)
    raise AssertionError("REAPER did not open an identifiable PulseAudio stream")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--format", choices=("clap", "vst3"), default="vst3")
    args = parser.parse_args()
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") and os.environ["DISPLAY"] != ":0"
    if args.format == "clap":
        assert CLAP_MODULE.is_file(), "build the CLAP bundle first"
    else:
        assert VST3_BUNDLE.is_dir(), "build the VST3 bundle first"
    fx_name = "CLAP: Manifold Graph" if args.format == "clap" else "VST3: Manifold Graph"
    with tempfile.TemporaryDirectory(prefix="manifold-reaper-capture-editor-") as directory:
        work = Path(directory)
        home = work / "home"
        if args.format == "clap":
            (home / ".clap").mkdir(parents=True)
            (home / ".clap/ManifoldFX.clap").symlink_to(CLAP_MODULE)
        config = work / "reaper.ini"
        config.write_text("[reaper]\nlinux_audio_mode=3\n" +
                          (f"vstpath={VST3_BUNDLE.parent}\nvstpath64={VST3_BUNDLE.parent}\n"
                           if args.format == "vst3" else ""))
        source = work / "input.wav"
        with wave.open(str(source), "wb") as output:
            output.setnchannels(2)
            output.setsampwidth(2)
            output.setframerate(48000)
            output.writeframes((4096).to_bytes(2, "little", signed=True) * 2 * 48000 * 6)
        project = work / "capture.rpp"
        script = work / "host.lua"
        script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
reaper.SetOnlyTrackSelected(track)
reaper.SetEditCurPos(0,false,false)
reaper.InsertMedia('{source}',0)
local midi=reaper.CreateNewMIDIItemInProj(track,0,1,false)
local take=reaper.GetActiveTake(midi)
reaper.MIDI_InsertNote(take,false,false,
 reaper.MIDI_GetPPQPosFromProjTime(take,0.125),
 reaper.MIDI_GetPPQPosFromProjTime(take,0.5),0,60,100,false)
reaper.MIDI_Sort(take)
local fx=reaper.TrackFX_AddByName(track,'{fx_name}',false,-1)
local ready=io.open('{work / 'ready.txt'}','w')
if fx<0 then ready:write('FAILED: Graph plug-in missing'); ready:close(); return end
reaper.TrackFX_Show(track,fx,3)
local device_ok,device_mode=reaper.GetAudioDeviceInfo('MODE')
ready:write('done ' .. tostring(device_ok) .. ' ' .. tostring(device_mode)); ready:close()
local function poll()
 local command=io.open('{work / 'command.txt'}','r')
 if command then
  local value=command:read('*a'); command:close(); os.remove('{work / 'command.txt'}')
  if value=='play' then reaper.SetEditCurPos(0,false,false); reaper.OnPlayButton() end
  if value=='stop' then reaper.OnStopButton() end
  if value=='save' then
   reaper.Main_SaveProjectEx(0,'{project}',0)
  end
  local result=io.open('{work / 'result.txt'}','w')
  result:write(value .. ' ' .. tostring(reaper.GetPlayState()) .. ' ' .. tostring(reaper.GetPlayPosition()))
  result:close()
 end
 reaper.defer(poll)
end
reaper.defer(poll)
""")
        env = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
               "GDK_BACKEND": "x11", "MANIFOLD_GRAPH_IMPORT_PROBE": str(SOURCE),
               "MANIFOLD_GRAPH_CAPTURE_PROBE": str(work / "capture-go")}
        def command(value: str) -> str:
            (work / "result.txt").unlink(missing_ok=True)
            (work / "command.txt").write_text(value)
            return wait_for(work / "result.txt", 10)

        with (work / "host.log").open("w") as log:
            process = subprocess.Popen(
                ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                 "-noactivate", str(script)], env=env, stdout=log,
                stderr=subprocess.STDOUT, start_new_session=True)
            try:
                ready = wait_for(work / "ready.txt", 20)
                assert ready == "done true PulseAudio", ready
                x11 = runpy.run_path(str(ROOT / "scripts/probe-reaper-graph-vst3-gui.py"))["X11"]()
                try:
                    # Private REAPER profiles can show a release-notes modal.
                    for _ in range(8):
                        for window, title, _ in x11.window_titles():
                            if title.startswith("REAPER New Version Notification"):
                                x11.lib.XRaiseWindow(x11.display, window)
                                x11.lib.XFlush(x11.display)
                                time.sleep(.2)
                                x11.click(670, 360)
                            elif title.startswith("About REAPER"):
                                x11.lib.XRaiseWindow(x11.display, window)
                                x11.lib.XFlush(x11.display)
                                time.sleep(3)
                                x11.click(490, 395)
                        time.sleep(.25)
                    deadline = time.monotonic() + 70
                    while True:
                        assert process.poll() is None, (work / "host.log").read_text()[-2000:]
                        command("save")
                        imported = len(state_from_project(project, args.format)["signal"]["nodes"]) == 9
                        if imported:
                            break
                        assert time.monotonic() < deadline, "editor import never reached REAPER state"
                        time.sleep(1)
                    assert command("play").startswith("play 1"), "REAPER transport did not start"
                    mute_host_stream(process.pid)
                    time.sleep(3)
                    (work / "capture-go.status").unlink(missing_ok=True)
                    (work / "capture-go").write_text("go")
                    if args.format == "vst3":
                        time.sleep(.5)
                        command("stop")
                    status = wait_for(work / "capture-go.status", 15)
                    assert status.startswith("Freezing"), status
                    if args.format == "vst3":
                        command("play")
                    time.sleep(3)
                    command("stop")
                    deadline = time.monotonic() + 30
                    while True:
                        time.sleep(.5)
                        command("save")
                        state = state_from_project(project, args.format)
                        if state and state.get("assets"):
                            break
                        assert time.monotonic() < deadline, "editor capture did not publish an asset"
                    asset = state["assets"][0]
                    assert asset["nodeId"] == 5 and asset["frames"] == 96000, asset
                    pcm = array("f")
                    pcm.frombytes(base64.b64decode(asset["pcmF32Base64"]))
                    peak = max(abs(sample) for sample in pcm)
                    assert .45 < peak < .55, peak
                    screenshot = ROOT / f"web/public/graph-{args.format}-reaper-capture-editor.png"
                    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab",
                                    "-window_id", hex(x11.editor()), "-i", os.environ["DISPLAY"],
                                    "-frames:v", "1", "-y", str(screenshot)],
                                   check=True, timeout=20)
                    assert screenshot.stat().st_size > 10000
                finally:
                    x11.close()
            except Exception:
                print((work / "host.log").read_text(errors="replace")[-2000:])
                raise
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        render_env = {key: value for key, value in env.items()
                      if key not in ("MANIFOLD_GRAPH_IMPORT_PROBE", "MANIFOLD_GRAPH_CAPTURE_PROBE")}
        with (work / "render.log").open("w") as log:
            subprocess.run(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                            "-renderproject", str(project)], env=render_env,
                           stdout=log, stderr=subprocess.STDOUT, check=True, timeout=45)
        rendered = work / "capture.wav"
        assert rendered.is_file(), (work / "render.log").read_text()[-2000:]
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(rendered),
                                       "-f", "f32le", "-acodec", "pcm_f32le", "-"])
        samples = array("f")
        samples.frombytes(raw)
        render_peak = max(abs(sample) for sample in samples)
        assert render_peak > .01, render_peak
        direct_project = work / "captured.json"
        direct_project.write_text(json.dumps(state))
        direct_audio = work / "native.f32"
        subprocess.run(["cargo", "run", "-q", "-p", "manifold-native", "--example",
                        "render_graph_midi_audio", "--", str(direct_project), str(direct_audio),
                        "1024", "6000", "24000", "100"], cwd=ROOT, check=True, timeout=120)
        expected = array("f")
        expected.frombytes(direct_audio.read_bytes())
        assert len(expected) == 48000 * 2 and len(samples) >= len(expected)
        parity_error = max(abs(actual - reference)
                           for actual, reference in zip(samples, expected))
        lead_peak = max(abs(sample) for sample in samples[:4800 * 2])
        assert lead_peak < 1e-6 and parity_error < 1e-5, (lead_peak, parity_error)
        result = {"host": f"REAPER Linux {args.format.upper()}", "editorGesture": "Capture to instrument",
                  "sourceNode": 6, "instrumentNode": 5, "captureFrames": asset["frames"],
                  "capturePeak": peak, "savedAndReopened": True,
                  "freshRenderFrames": len(samples) // 2, "freshRenderPeak": render_peak,
                  "leadPeak": lead_peak, "peakErrorVsNative": parity_error,
                  "editorScreenshot": screenshot.name}
        (ROOT / f"web/public/graph-{args.format}-reaper-capture-editor.json").write_text(
            json.dumps(result, indent=2) + "\n")
        print(json.dumps(result))


if __name__ == "__main__":
    main()
