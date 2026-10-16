#!/usr/bin/env python3
"""Save Graph CLAP repeatedly while an isolated REAPER transport runs."""

import base64
from array import array
import argparse
import json
import os
from pathlib import Path
import runpy
import signal
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path,
                        help="import this authored graph through the original editor before playback")
    parser.add_argument("--count", type=int, default=8)
    args = parser.parse_args()
    assert 1 <= args.count <= 32
    source = json.loads(args.project.read_bytes()) if args.project else None
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") and os.environ["DISPLAY"] != ":0"
    module = ROOT / "target/clap/ManifoldFX.clap"
    assert module.is_file(), "build the CLAP bundle first"
    with tempfile.TemporaryDirectory(prefix="manifold-reaper-graph-clap-live-") as folder:
        work = Path(folder)
        home = work / "home"
        (home / ".clap").mkdir(parents=True)
        (home / ".clap/ManifoldFX.clap").symlink_to(module)
        config = work / "reaper.ini"
        config.write_text("[reaper]\n")
        ready = work / "ready.txt"
        script = work / "probe.lua"
        script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local item=reaper.CreateNewMIDIItemInProj(track,0,4,false)
local take=reaper.GetActiveTake(item)
local start=reaper.MIDI_GetPPQPosFromProjTime(take,0.125)
local finish=reaper.MIDI_GetPPQPosFromProjTime(take,0.5)
reaper.MIDI_InsertNote(take,false,false,start,finish,0,60,100,false)
reaper.MIDI_Sort(take)
local fx=reaper.TrackFX_AddByName(track,'CLAP: Manifold Graph',false,-1)
if fx<0 then
 local out=io.open('{ready}','w'); out:write('FAILED: Graph CLAP unavailable'); out:close(); return
end
{"reaper.TrackFX_Show(track,fx,3)" if source else ""}
reaper.SetEditCurPos(0,false,false)
reaper.GetSetProjectInfo(0,'RENDER_SETTINGS',0,true)
reaper.GetSetProjectInfo(0,'RENDER_BOUNDSFLAG',0,true)
reaper.GetSetProjectInfo(0,'RENDER_STARTPOS',0,true)
reaper.GetSetProjectInfo(0,'RENDER_ENDPOS',1,true)
reaper.GetSetProjectInfo(0,'RENDER_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'RENDER_CHANNELS',2,true)
reaper.GetSetProjectInfo(0,'RENDER_TAILFLAG',0,true)
reaper.GetSetProjectInfo(0,'RENDER_NORMALIZE',0,true)
reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{work}',true)
reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','live-final',true)
reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
local index=0
local next_time=0
local out=io.open('{ready}','w')
local function tick()
 if reaper.time_precise()<next_time then reaper.defer(tick); return end
 if index<{args.count} then
  local a=(index%2==0) and 0.2 or 0.8
  local b=(index%2==0) and 0.8 or 0.2
  reaper.TrackFX_SetParamNormalized(track,fx,2,a)
  reaper.TrackFX_SetParamNormalized(track,fx,3,b)
  local path='{work}/save-' .. tostring(index) .. '.rpp'
  reaper.Main_SaveProjectEx(0,path,0)
  out:write(index .. ' ' .. reaper.GetPlayState() .. ' ' .. reaper.GetPlayPosition() .. ' ' .. a .. ' ' .. b .. '\\n')
  out:flush()
  index=index+1
  next_time=reaper.time_precise()+0.1
  reaper.defer(tick)
 else
  out:write('done\\n'); out:close()
 end
end
local boot_time=reaper.time_precise()
local import_bytes={args.project.stat().st_size if args.project else 0}
local next_check=boot_time+5
local function start_transport()
 if import_bytes>10000000 then
  if reaper.time_precise()<next_check then reaper.defer(start_transport); return end
  local check='{work}/import-check.rpp'
  reaper.Main_SaveProjectEx(0,check,0)
  local file=io.open(check,'rb')
  local size=file and file:seek('end') or 0
  if file then file:close() end
  if size<import_bytes*1.2 then
   if reaper.time_precise()-boot_time>300 then
    out:write('FAILED: large graph did not reach REAPER state\\n'); out:close(); return
   end
   next_check=reaper.time_precise()+5
   reaper.defer(start_transport); return
  end
 elseif reaper.time_precise()-boot_time<{12 if source else 2} then
  reaper.defer(start_transport); return
 end
 reaper.OnPlayButton()
 next_time=reaper.time_precise()+0.2
 reaper.defer(tick)
end
reaper.defer(start_transport)
""")
        env = {**os.environ, "HOME": str(home), "XDG_CONFIG_HOME": str(home / ".config"),
               "GDK_BACKEND": "x11"}
        if args.project:
            env["MANIFOLD_GRAPH_IMPORT_PROBE"] = str(args.project.resolve())
        with (work / "host.log").open("w") as log:
            process = subprocess.Popen(
                ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash", "-noactivate",
                 str(script)], env=env, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True)
            try:
                if source:
                    x11 = runpy.run_path(str(ROOT / "scripts/probe-reaper-graph-vst3-gui.py"))["X11"]()
                    try:
                        for _ in range(8):
                            for window, title, _ in x11.window_titles():
                                if title.startswith("REAPER New Version Notification"):
                                    x11.lib.XRaiseWindow(x11.display, window)
                                    x11.lib.XFlush(x11.display)
                                    time.sleep(0.2)
                                    x11.click(670, 360)
                                elif title.startswith("About REAPER"):
                                    x11.lib.XRaiseWindow(x11.display, window)
                                    x11.lib.XFlush(x11.display)
                                    time.sleep(3)
                                    x11.click(490, 395)
                            time.sleep(0.25)
                    finally:
                        x11.close()
                for _ in range(3300 if source and args.project.stat().st_size > 10_000_000 else
                               600 if source else 300):
                    if ready.exists() and "done" in ready.read_text():
                        break
                    if ready.exists() and "FAILED" in ready.read_text():
                        break
                    if process.poll() is not None:
                        break
                    time.sleep(0.1)
                result = ready.read_text() if ready.exists() else ""
                assert result.endswith("done\n"), (result, (work / "host.log").read_text()[-1500:])
                saves = sorted(work.glob("save-*.rpp"))
                assert len(saves) == args.count, len(saves)
                positions = []
                for line in result.splitlines()[:-1]:
                    index, play_state, position, a, b = line.split()
                    assert int(play_state) & 1, line
                    assert float(position) > 0, line
                    positions.append(float(position))
                assert len(positions) == args.count and all(
                    later > earlier for earlier, later in zip(positions, positions[1:])
                ), positions
                pairs = []
                last_state = None
                for path in saves:
                    text = path.read_text(errors="replace")
                    state_lines = text.split("<STATE\n", 1)[1].split("\n        >", 1)[0]
                    state = json.loads(base64.b64decode("".join(state_lines.split())))
                    assert state["projectId"] == "manifold.graph-workspace"
                    if source:
                        assert len(state["signal"]["nodes"]) == len(source["signal"]["nodes"]), (
                            len(state["signal"]["nodes"]), len(source["signal"]["nodes"]),
                            (work / "host.log").read_text(errors="replace")[-2000:])
                        assert state.get("assets") == source.get("assets"), "saved sample assets changed"
                    last_state = state
                    if not source:
                        values = state["signal"]["initialParameters"]
                        pairs.append([next(entry["value"] for entry in values
                                           if entry["nodeId"] == 6 and entry["id"] == local)
                                      for local in (1, 2)])
                if not source:
                    expected = ((0.4008, 1.6002), (1.6002, 0.4008))
                    for pair in pairs[1:]:
                        assert any(all(abs(value - target) < 1e-4
                                       for value, target in zip(pair, candidate))
                                   for candidate in expected), pair
                    assert all(any(all(abs(value - target) < 1e-4
                                       for value, target in zip(pair, candidate))
                                   for pair in pairs[1:]) for candidate in expected)
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        assert last_state is not None
        final_json = work / "final-graph.json"
        final_json.write_text(json.dumps(last_state))
        with (work / "render.log").open("w") as log:
            render_env = {key: value for key, value in env.items()
                          if key != "MANIFOLD_GRAPH_IMPORT_PROBE"}
            subprocess.run(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                            "-renderproject", str(saves[-1])], env=render_env, stdout=log,
                           stderr=subprocess.STDOUT, check=True, timeout=45)
        wav = work / "live-final.wav"
        assert wav.is_file(), (work / "render.log").read_text()[-1500:]
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(wav),
                                       "-f", "f32le", "-acodec", "pcm_f32le", "-"])
        actual = array("f"); actual.frombytes(raw)
        native = work / "native.f32"
        velocity = 100 if any(node["type"] == "midi-input"
                              for node in last_state["signal"]["nodes"]) else 0
        subprocess.run(["cargo", "run", "-q", "-p", "manifold-native", "--example",
                        "render_graph_midi_audio", "--", str(final_json), str(native),
                        "1024", "6000", "24000", str(velocity)], cwd=ROOT, check=True, timeout=120)
        expected_audio = array("f"); expected_audio.frombytes(native.read_bytes())
        assert len(actual) == len(expected_audio) == 48_000 * 2
        peak = max(abs(sample) for sample in actual)
        error = max(abs(left - right) for left, right in zip(actual, expected_audio))
        assert peak > 0.001 and error < 1e-6, (peak, error)
        metrics = {"host": "REAPER Linux CLAP", "live_saves": args.count,
                   "project_bytes": args.project.stat().st_size if args.project else 1153,
                   "first_play_position": positions[0], "last_play_position": positions[-1],
                   "saved_bytes": [path.stat().st_size for path in saves],
                   "saved_attack_decay": pairs if not source else None,
                   "saved_nodes": len(last_state["signal"]["nodes"]),
                   "saved_assets": len(last_state.get("assets", [])),
                   "fresh_render_frames": 48_000,
                   "fresh_render_peak": peak, "peak_error_vs_native": error}
        report = ("graph-clap-reaper-large-live-state.json" if args.project.stat().st_size > 10_000_000
                  else "graph-clap-reaper-import-live-state.json") if source else "graph-clap-reaper-live-state.json"
        (ROOT / "web/public" / report).write_text(
            json.dumps(metrics, indent=2) + "\n")
        print(json.dumps(metrics))


if __name__ == "__main__":
    main()
