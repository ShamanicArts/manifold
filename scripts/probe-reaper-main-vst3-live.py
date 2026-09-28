#!/usr/bin/env python3
"""Exercise original Main looper and Sample widgets in isolated REAPER.

Run under a headless Weston wrapper with MANIFOLD_ISOLATED_DISPLAY=1. A private
PipeWire/Pulse server supplies only auto_null; no user audio device is opened.
"""

from array import array
import base64
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time
import wave

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"


def wait_for(path: Path, predicate=lambda value: True, timeout: float = 20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            try:
                value = path.read_text()
                if value and predicate(value):
                    return value
            except (OSError, ValueError):
                pass
        time.sleep(.08)
    raise TimeoutError(f"waiting for {path}")


def saved_main(path: Path) -> dict:
    text = path.read_text(errors="replace")
    match = re.search(r'<VST "VST3i?: Manifold Main[^\n]*\n', text)
    assert match, "REAPER Main VST3 state chunk missing"
    lines = text[match.end():].splitlines()[1:]
    chunks = []
    for line in lines:
        encoded = line.strip()
        if not re.fullmatch(r"[A-Za-z0-9+/=]+", encoded):
            break
        chunks.append(encoded)
        if len(encoded) < 128:
            break
    decoded = base64.b64decode("".join(chunks))
    start = decoded.index(b"{")
    return json.JSONDecoder().raw_decode(decoded[start:].decode(errors="replace"))[0]


def status(path: Path, predicate, timeout: float = 20) -> dict:
    return json.loads(wait_for(path, lambda text: predicate(json.loads(text)), timeout))


def pcm_peak(value: dict) -> float:
    samples = array("f")
    samples.frombytes(base64.b64decode(value["pcmF32Base64"]))
    assert len(samples) == value["frames"] * 2
    return max((abs(sample) for sample in samples), default=0.0)


def main() -> None:
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") not in (None, ":0")
    assert BUNDLE.is_dir()
    with tempfile.TemporaryDirectory(prefix="manifold-main-vst3-live-") as directory:
        work = Path(directory)
        home = work / "home"
        home.mkdir()
        runtime = work / "audio-runtime"
        runtime.mkdir(mode=0o700)
        audio_env = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
                     "XDG_RUNTIME_DIR": str(runtime),
                     "PIPEWIRE_RUNTIME_DIR": str(runtime),
                     "PIPEWIRE_REMOTE": "pipewire-0",
                     "PULSE_SERVER": f"unix:{runtime}/pulse/native"}
        audio_env.pop("WAYLAND_DISPLAY", None)
        core_log = (work / "pipewire.log").open("w")
        pulse_log = (work / "pipewire-pulse.log").open("w")
        core = subprocess.Popen(["pipewire"], env=audio_env,
                                stdout=core_log, stderr=subprocess.STDOUT)
        pulse = subprocess.Popen(["pipewire-pulse"], env=audio_env,
                                 stdout=pulse_log, stderr=subprocess.STDOUT)
        process = None
        try:
            deadline = time.monotonic() + 5
            while not (runtime / "pulse/native").exists() and time.monotonic() < deadline:
                time.sleep(.05)
            assert (runtime / "pulse/native").exists(), "private Pulse socket did not start"
            subprocess.run(["pactl", "load-module", "module-null-sink", "sink_name=manifold_null"],
                           env=audio_env, check=True, capture_output=True)
            sinks = subprocess.check_output(["pactl", "list", "short", "sinks"],
                                            env=audio_env, text=True)
            assert "manifold_null" in sinks and all("null" in line for line in sinks.strip().splitlines()), sinks
            sources = subprocess.check_output(["pactl", "list", "short", "sources"],
                                              env=audio_env, text=True)
            assert "manifold_null.monitor" in sources, sources
            config = work / "reaper.ini"
            config.write_text("[reaper]\n"
                              f"vstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n")
            source = work / "input.wav"
            with wave.open(str(source), "wb") as output:
                output.setnchannels(2)
                output.setsampwidth(2)
                output.setframerate(48000)
                output.writeframes((4096).to_bytes(2, "little", signed=True) * 2 * 48000 * 8)
            project = work / "main-live.rpp"
            script = work / "host.lua"
            script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
reaper.SetOnlyTrackSelected(track)
reaper.SetEditCurPos(0,false,false)
reaper.InsertMedia('{source}',0)
local item=reaper.GetTrackMediaItem(track,0)
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Main',false,-1)
local ready=io.open('{work / 'ready.txt'}','w')
if fx<0 then ready:write('FAILED: Main plug-in missing'); ready:close(); return end
reaper.TrackFX_Show(track,fx,3)
local ok,mode=reaper.GetAudioDeviceInfo('MODE')
ready:write('done ' .. tostring(ok) .. ' ' .. tostring(mode)); ready:close()
local function poll()
 local request=io.open('{work / 'command.txt'}','r')
 if request then
  local value=request:read('*a'); request:close(); os.remove('{work / 'command.txt'}')
  if value=='play' then reaper.SetEditCurPos(0,false,false); reaper.OnPlayButton() end
  if value=='stop' then reaper.OnStopButton() end
  if value=='mute-input' then reaper.SetMediaItemInfo_Value(item,'B_MUTE',1) end
  if value=='save' then reaper.Main_SaveProjectEx(0,'{project}',0) end
  local out=io.open('{work / 'result.txt'}','w')
  out:write(value .. ' ' .. tostring(reaper.GetPlayState()) .. ' ' .. tostring(reaper.GetPlayPosition()))
  out:close()
 end
 reaper.defer(poll)
end
reaper.defer(poll)
""")
            loop_probe = work / "main-loop-command"
            sample_probe = work / "main-sample-command"
            env = {**audio_env, "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
                   "GDK_BACKEND": "x11", "MANIFOLD_MAIN_LOOP_PROBE": str(loop_probe),
                   "MANIFOLD_MAIN_SAMPLE_PROBE": str(sample_probe)}

            def command(value: str) -> str:
                (work / "result.txt").unlink(missing_ok=True)
                (work / "command.txt").write_text(value)
                return wait_for(work / "result.txt", timeout=10)

            with (work / "reaper.log").open("w") as log:
                process = subprocess.Popen(
                    ["pw-jack", "reaper", "-cfgfile", str(config), "-newinst", "-nosplash", "-noactivate", str(script)],
                    env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                ready = wait_for(work / "ready.txt", timeout=25)
                assert ready == "done true JACK", ready
                status(Path(f"{loop_probe}.status"), lambda data: len(data.get("layers", [])) == 4)
                assert command("play").startswith("play 1")
                time.sleep(.6)
                assert float(command("position").split()[-1]) > .25
                loop_probe.write_text("rec")
                status(Path(f"{loop_probe}.status"), lambda data: data.get("recording") is True)
                time.sleep(1.0)
                loop_probe.write_text("rec")
                committed = status(Path(f"{loop_probe}.status"),
                                   lambda data: data.get("recording") is False and data["layers"][0]["length"] > 0)
                time.sleep(2.0)
                sample_probe.write_text("retro")
                update = status(Path(f"{sample_probe}.status"), lambda data: data.get("phase") in ("published", "rejected"), 25)
                assert update["phase"] == "published", update
                assert command("mute-input").startswith("mute-input 1")
                deadline = time.monotonic() + 20
                last_error = None
                while time.monotonic() < deadline:
                    command("save")
                    try:
                        state = saved_main(project)
                        if state["layers"][0]["frames"] > 0 and state["sample"]["frames"] > 0:
                            break
                        last_error = ("state frames", state["layers"][0]["frames"], state["sample"]["frames"])
                    except (OSError, ValueError, IndexError, KeyError) as error:
                        last_error = repr(error)
                    time.sleep(.3)
                else:
                    if project.exists():
                        (Path("/tmp/manifold-main-vst3-live-failed.rpp")).write_bytes(project.read_bytes())
                    print("Last Main save observation:", last_error)
                    print("Loop status:", {"recording": committed["recording"],
                                           "frames": committed["layers"][0]["length"]})
                    print("Sample update:", update)
                    raise AssertionError("Main live loop and Sample PCM did not reach REAPER save")
                loop_frames = state["layers"][0]["frames"]
                sample_frames = state["sample"]["frames"]
                loop_peak = pcm_peak(state["layers"][0])
                sample_peak = pcm_peak(state["sample"])
                assert loop_frames > 1000 and sample_frames > 1000
                assert loop_peak > .01 and sample_peak > .01, (loop_peak, sample_peak)
                children = subprocess.check_output(["ps", "--ppid", str(process.pid),
                                                    "-o", "pid=,args="], text=True)
                editor = next((line.strip() for line in children.splitlines()
                               if "ManifoldFX-editor" in line), None)
                if editor:
                    parent = int(editor.split()[2])
                    screenshot = ROOT / "web/public/main-vst3-reaper-live.png"
                    capture = subprocess.run(["ffmpeg", "-v", "error", "-f", "x11grab",
                        "-window_id", str(parent), "-video_size", "1280x780",
                        "-i", os.environ["DISPLAY"], "-frames:v", "1", "-y", str(screenshot)],
                        env=env, capture_output=True, text=True, timeout=15)
                    assert capture.returncode == 0 and screenshot.stat().st_size > 10_000, capture.stderr
                command("stop")
                print("Saved Main live capture:", loop_frames, sample_frames, loop_peak, sample_peak)
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
                process = None
                render_env = {key: value for key, value in env.items()
                              if key not in ("MANIFOLD_MAIN_LOOP_PROBE", "MANIFOLD_MAIN_SAMPLE_PROBE")}
                with (work / "render.log").open("w") as render_log:
                    rendered = subprocess.run(
                        ["pw-jack", "reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                         "-renderproject", str(project)],
                        env=render_env, stdout=render_log, stderr=subprocess.STDOUT, timeout=60)
                assert rendered.returncode == 0, (work / "render.log").read_text()[-1500:]
                render_file = work / "main-live.wav"
                assert render_file.is_file(), (work / "render.log").read_text()[-1500:]
                raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(render_file),
                                               "-f", "f32le", "-acodec", "pcm_f32le", "-"])
                audio = array("f")
                audio.frombytes(raw)
                render_peak = max(abs(sample) for sample in audio)
                assert render_peak > .01, render_peak
                review_audio = ROOT / "web/public/main-vst3-reaper-live-render.ogg"
                subprocess.run(["ffmpeg", "-v", "error", "-i", str(render_file),
                    "-c:a", "libopus", "-b:a", "96k", "-y", str(review_audio)],
                    check=True, timeout=20)
                report = {"host":"REAPER VST3", "audioSink":"private PipeWire null sink",
                          "editorActions":["First Loop REC", "REC stop", "Sample Retro Cap"],
                          "loopFrames":loop_frames, "loopPeak":loop_peak,
                          "sampleFrames":sample_frames, "samplePeak":sample_peak,
                          "savedAndReopened":True, "freshRenderFrames":len(audio)//2,
                          "freshRenderPeak":render_peak}
                (ROOT / "web/public/main-vst3-reaper-live.json").write_text(json.dumps(report,indent=2)+"\n")
                print(json.dumps(report))
        except Exception:
            if (work / "reaper.log").exists():
                print((work / "reaper.log").read_text(errors="replace")[-2500:])
            raise
        finally:
            if process is not None:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
            pulse.terminate()
            core.terminate()
            pulse.wait(timeout=5)
            core.wait(timeout=5)
            pulse_log.close()
            core_log.close()


if __name__ == "__main__":
    main()
