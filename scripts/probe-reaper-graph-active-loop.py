#!/usr/bin/env python3
"""Record an authored Graph loop in REAPER and save while VST3 or CLAP is active.

Run through with-headless-weston.py. This probe creates its own PipeWire server
with only a null sink, then reopens the host save and renders muted input.
"""

from array import array
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
import time
import wave


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "projects/graph-workspace/authored-live-loop-route.json"
REVIEW = ROOT / "web/public"


def wait_for(path: Path, timeout: float = 30) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            value = path.read_text(errors="replace")
            if value:
                return value
        time.sleep(0.05)
    raise TimeoutError(f"waiting for {path}")


def graph_state(path: Path, clap: bool) -> dict:
    text = path.read_text(errors="replace")
    if clap:
        if "<STATE\n" not in text:
            raise AssertionError(f"Graph CLAP state absent from {path}")
        block = text.split("<STATE\n", 1)[1].split("\n        >", 1)[0]
        state = json.loads(base64.b64decode("".join(block.split())))
        assert state.get("projectId") == "manifold.graph-workspace"
        return state
    match = re.search(r'<VST "VST3i?: Manifold Graph[^\n]*\n', text)
    if not match:
        raise AssertionError(f"Graph VST3 chunk absent from {path}")
    block = text[match.end():].split("\n    >", 1)[0]
    groups = []
    current = []
    for line in block.splitlines():
        encoded = line.strip()
        if re.fullmatch(r"[A-Za-z0-9+/=]{8,}", encoded):
            current.append(encoded)
            if len(encoded) < 128:
                groups.append(current)
                current = []
        elif current:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    for group in groups:
        try:
            decoded = base64.b64decode("".join(group), validate=True)
        except ValueError:
            continue
        for index, byte in enumerate(decoded):
            if byte != 123:
                continue
            try:
                state = json.JSONDecoder().raw_decode(decoded[index:].decode(errors="replace"))[0]
            except (ValueError, UnicodeDecodeError):
                continue
            if isinstance(state, dict) and state.get("projectId") == "manifold.graph-workspace":
                return state
    raise AssertionError(f"Graph JSON absent from {path}; chunk prefix: {block[:350]!r}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--clap", action="store_true", help="probe CLAP instead of VST3")
    args = parser.parse_args()
    plugin = "clap" if args.clap else "vst3"
    bundle = ROOT / ("target/clap/ManifoldFX.clap" if args.clap
                     else "target/vst3/ManifoldFX.vst3")
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") not in (None, ":0")
    assert bundle.is_file() if args.clap else bundle.is_dir()
    with tempfile.TemporaryDirectory(prefix=f"manifold-graph-{plugin}-loop-") as directory:
        work = Path(directory)
        home = work / "home"
        home.mkdir()
        runtime = work / "audio-runtime"
        runtime.mkdir(mode=0o700)
        env = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
               "XDG_RUNTIME_DIR": str(runtime), "PIPEWIRE_RUNTIME_DIR": str(runtime),
               "PIPEWIRE_REMOTE": "pipewire-0",
               "PULSE_SERVER": f"unix:{runtime}/pulse/native", "GDK_BACKEND": "x11"}
        env.pop("WAYLAND_DISPLAY", None)
        core_log = (work / "pipewire.log").open("w")
        pulse_log = (work / "pipewire-pulse.log").open("w")
        core = subprocess.Popen(["pipewire"], env=env, stdout=core_log,
                                stderr=subprocess.STDOUT)
        pulse = subprocess.Popen(["pipewire-pulse"], env=env, stdout=pulse_log,
                                 stderr=subprocess.STDOUT)
        host = None
        try:
            deadline = time.monotonic() + 6
            while not (runtime / "pulse/native").exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            assert (runtime / "pulse/native").exists(), "private audio server did not start"
            subprocess.run(["pactl", "load-module", "module-null-sink", "sink_name=manifold_null"],
                           env=env, check=True, capture_output=True)
            sinks = subprocess.check_output(["pactl", "list", "short", "sinks"],
                                            env=env, text=True)
            assert "manifold_null" in sinks and all("null" in line for line in sinks.strip().splitlines()), sinks
            preset = work / "graph-loop.vstpreset"
            if args.clap:
                (home / ".clap").mkdir()
                (home / ".clap/ManifoldFX.clap").symlink_to(bundle)
                env["MANIFOLD_GRAPH_IMPORT_PROBE"] = str(FIXTURE)
            else:
                subprocess.run(["cargo", "run", "-q", "-p", "manifold-vst3", "--example",
                                "export_graph_preset", "--", str(FIXTURE), str(preset)],
                               cwd=ROOT, check=True, timeout=90)
            config = work / "reaper.ini"
            config.write_text("[reaper]\n" +
                              ("" if args.clap else f"vstpath={bundle.parent}\nvstpath64={bundle.parent}\n"))
            source = work / "input.wav"
            frame = (6553).to_bytes(2, "little", signed=True) + (-9830).to_bytes(2, "little", signed=True)
            with wave.open(str(source), "wb") as wav:
                wav.setnchannels(2)
                wav.setsampwidth(2)
                wav.setframerate(48000)
                wav.writeframes(frame * (48000 * 4))
            silence = work / "silence.wav"
            with wave.open(str(silence), "wb") as wav:
                wav.setnchannels(2)
                wav.setsampwidth(2)
                wav.setframerate(48000)
                wav.writeframes(bytes(48000 * 4 * 4))
            active_project = work / "active.rpp"
            replay_project = work / "replay.rpp"
            script = work / "host.lua"
            plugin_name = "CLAP: Manifold Graph" if args.clap else "VST3: Manifold Graph"
            load_code = ("reaper.TrackFX_Show(track,fx,3)\nlocal loaded=true" if args.clap
                         else f"local loaded=reaper.TrackFX_SetPreset(track,fx,'{preset}')")
            startup_delay = 8 if args.clap else 1
            script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
reaper.SetOnlyTrackSelected(track)
reaper.SetEditCurPos(0,false,false)
reaper.InsertMedia('{source}',0)
local item=reaper.GetTrackMediaItem(track,0)
local fx=reaper.TrackFX_AddByName(track,'{plugin_name}',false,-1)
local out=io.open('{work / 'ready.txt'}','w')
if fx<0 then out:write('FAILED: Graph {plugin.upper()} missing'); out:close(); return end
{load_code}
local ok,mode=reaper.GetAudioDeviceInfo('MODE')
local _,p0=reaper.TrackFX_GetParamName(track,fx,0)
local _,p1=reaper.TrackFX_GetParamName(track,fx,1)
out:write(tostring(loaded)..' '..tostring(ok)..' '..tostring(mode)..' '..p0..' '..p1)
out:close()
reaper.GetSetProjectInfo(0,'RENDER_SETTINGS',0,true)
reaper.GetSetProjectInfo(0,'RENDER_BOUNDSFLAG',0,true)
reaper.GetSetProjectInfo(0,'RENDER_STARTPOS',0,true)
reaper.GetSetProjectInfo(0,'RENDER_ENDPOS',1,true)
reaper.GetSetProjectInfo(0,'RENDER_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'RENDER_CHANNELS',2,true)
reaper.GetSetProjectInfo(0,'RENDER_TAILFLAG',0,true)
reaper.GetSetProjectInfo(0,'RENDER_NORMALIZE',0,true)
reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{work}',true)
reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','replay',true)
reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
local phase=0
local began=reaper.time_precise()
local function tick()
 local position=reaper.GetPlayPosition()
 if phase==0 and reaper.time_precise()-began>{startup_delay} then
  reaper.SetEditCurPos(0,false,false); reaper.OnPlayButton(); phase=1
 elseif phase==1 and position>.25 then
  reaper.TrackFX_SetParamNormalized(track,fx,0,1); phase=2
 elseif phase==2 and position>.75 then
  reaper.TrackFX_SetParamNormalized(track,fx,0,0); phase=3
 elseif phase==3 and position>.9 then
  reaper.TrackFX_SetParamNormalized(track,fx,1,1); phase=4
 elseif phase==4 and position>1.2 then
  reaper.Main_SaveProjectEx(0,'{active_project}',0)
  local play_state=reaper.GetPlayState()
  local silent_source=reaper.PCM_Source_CreateFromFile('{silence}')
  reaper.SetMediaItemTake_Source(reaper.GetActiveTake(item),silent_source)
  reaper.Main_SaveProjectEx(0,'{replay_project}',0)
  local done=io.open('{work / 'done.txt'}','w')
  done:write(tostring(play_state)..' '..tostring(position)); done:close()
  return
 end
 reaper.defer(tick)
end
reaper.defer(tick)
""")
            with (work / "reaper.log").open("w") as log:
                host = subprocess.Popen(["pw-jack", "reaper", "-cfgfile", str(config),
                    "-newinst", "-nosplash", "-noactivate", str(script)], env=env,
                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                ready = wait_for(work / "ready.txt")
                assert ready.startswith("true true JACK"), ready
                completed = wait_for(work / "done.txt", timeout=25)
                play_state, position = completed.split()
                assert int(play_state) & 1 and float(position) > 1.2, completed
            active = graph_state(active_project, args.clap)
            replay = graph_state(replay_project, args.clap)
            take = next(asset for asset in active.get("assets", []) if asset["nodeId"] == 2)
            assert take["frames"] > 10000, take["frames"]
            samples = array("f")
            samples.frombytes(base64.b64decode(take["pcmF32Base64"]))
            assert len(samples) == take["frames"] * 2
            assert max(abs(value) for value in samples) > 0.1
            assert replay["assets"] == active["assets"]
            controls = active["signal"]["initialParameters"]
            assert next(p["value"] for p in controls if p["nodeId"] == 2 and p["id"] == 1) == 1
            assert next(p["value"] for p in replay["signal"]["initialParameters"]
                        if p["nodeId"] == 2 and p["id"] == 1) == 1
            if host.poll() is None:
                os.killpg(host.pid, signal.SIGTERM)
            host.wait(timeout=5)
            host = None
            render_env = {key: value for key, value in env.items()
                          if key != "MANIFOLD_GRAPH_IMPORT_PROBE"}
            roundtrip = work / "roundtrip.rpp"
            if args.clap:
                reopen_script = work / "reopen.lua"
                reopen_script.write_text(f"""
reaper.Main_openProject('{replay_project}')
local begun=reaper.time_precise()
local function tick()
 if reaper.time_precise()-begun<2 then reaper.defer(tick); return end
 local track=reaper.GetTrack(0,0)
 reaper.Main_SaveProjectEx(0,'{roundtrip}',0)
 local out=io.open('{work / 'roundtrip.txt'}','w')
 out:write(tostring(reaper.TrackFX_GetParamNormalized(track,0,1))..' '..
           tostring(reaper.TrackFX_GetEnabled(track,0)))
 out:close()
end
reaper.defer(tick)
""")
                with (work / "reopen.log").open("w") as log:
                    host = subprocess.Popen(["pw-jack", "reaper", "-cfgfile", str(config),
                        "-newinst", "-nosplash", "-noactivate", str(reopen_script)],
                        env=render_env, stdout=log, stderr=subprocess.STDOUT,
                        start_new_session=True)
                    roundtrip_status = wait_for(work / "roundtrip.txt", timeout=20)
                reopened_state = graph_state(roundtrip, True)
                assert roundtrip_status == "1.0 true", roundtrip_status
                assert reopened_state["assets"] == replay["assets"]
                assert next(p["value"] for p in reopened_state["signal"]["initialParameters"]
                            if p["nodeId"] == 2 and p["id"] == 1) == 1
                if host.poll() is None:
                    os.killpg(host.pid, signal.SIGTERM)
                host.wait(timeout=5)
                host = None
            with (work / "render.log").open("w") as log:
                subprocess.run(["pw-jack", "reaper", "-cfgfile", str(config), "-newinst",
                    "-nosplash", "-renderproject", str(replay_project)], env=render_env,
                    stdout=log, stderr=subprocess.STDOUT, check=True, timeout=60)
            rendered = work / "replay.wav"
            assert rendered.is_file(), (work / "render.log").read_text(errors="replace")[-1200:]
            raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(rendered),
                                           "-f", "f32le", "-acodec", "pcm_f32le", "-"])
            audio = array("f")
            audio.frombytes(raw)
            assert len(audio) == 48000 * 2, len(audio)
            left = audio[::2]
            right = audio[1::2]
            peak = max(abs(value) for value in audio)
            if peak <= .15:
                debug = Path(tempfile.mkdtemp(prefix=f"manifold-{plugin}-loop-failed-"))
                for path in (active_project, replay_project, work / "render.log", work / "reaper.log", rendered):
                    shutil.copyfile(path, debug / path.name)
                print(f"Host replay debug retained at {debug}")
            assert peak > .15, {"peak": peak, "ready": ready,
                "activeFrames": take["frames"], "replayAssets": len(replay["assets"]),
                "renderLog": (work / "render.log").read_text(errors="replace")[-1500:]}
            assert abs(sum(left[:4096])/4096 - .2) < .03
            assert abs(sum(right[:4096])/4096 + .3) < .03
            report = {"host": f"REAPER Graph {plugin.upper()}", "audioSink": "private PipeWire null sink",
                      "savedDuringPlayback": True, "reopenedHostState": True,
                      "playPositionSeconds": float(position),
                      "takeFrames": take["frames"],
                      "takeSha256": hashlib.sha256(base64.b64decode(take["pcmF32Base64"])).hexdigest(),
                      "freshRenderFrames": len(audio)//2,
                      "freshRenderPeak": peak,
                      "replayFile": f"graph-{plugin}-reaper-loop-active-replay.wav"}
            shutil.copyfile(rendered, REVIEW / report["replayFile"])
            (REVIEW / f"graph-{plugin}-reaper-loop-active-state.json").write_text(
                json.dumps(report, indent=2) + "\n")
            print(json.dumps(report))
        finally:
            if host is not None and host.poll() is None:
                os.killpg(host.pid, signal.SIGTERM)
                host.wait(timeout=5)
            for process in (pulse, core):
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=5)
            core_log.close()
            pulse_log.close()


if __name__ == "__main__":
    main()
