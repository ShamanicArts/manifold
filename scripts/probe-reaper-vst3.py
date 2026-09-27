#!/usr/bin/env python3
"""Exercise Standalone FX VST3 in a disposable X11 REAPER session.

Requires a separate Xvfb display with XTEST, REAPER, ffmpeg, and a built
`target/vst3/ManifoldFX.vst3` bundle. Never run against the user's display.
The private REAPER resource directory is discarded after the probe.
"""

import ctypes as c
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"
OUTPUT = Path("/tmp/manifold-reaper-vst3-proof")


def wait_for(path: Path, marker: str, timeout: float = 25) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            content = path.read_text()
            if marker in content:
                return content
            if "FAILED" in content:
                raise AssertionError(content)
        time.sleep(0.1)
    evidence = {item.name: item.read_text()[-1500:] for item in path.parent.glob("*.log")}
    evidence.update({item.name: item.read_text()[-300:] for item in path.parent.glob("*.txt")})
    raise TimeoutError(f"missing {marker!r} in {path}; evidence={evidence}")


def command(work: Path, name: str) -> str:
    response = work / f"{name}.txt"
    response.unlink(missing_ok=True)
    (work / "command.txt").write_text(name)
    return wait_for(response, "done")


def host_env() -> dict[str, str]:
    return {**os.environ, "GDK_BACKEND": "x11"}


class X11:
    def __init__(self):
        self.lib = c.CDLL("libX11.so.6")
        x = self.lib
        x.XOpenDisplay.argtypes = [c.c_char_p]
        x.XOpenDisplay.restype = c.c_void_p
        self.display = x.XOpenDisplay(None)
        assert self.display, "isolated X11 display unavailable"
        x.XDefaultScreen.argtypes = [c.c_void_p]
        x.XDefaultScreen.restype = c.c_int
        x.XRootWindow.argtypes = [c.c_void_p, c.c_int]
        x.XRootWindow.restype = c.c_ulong
        x.XQueryTree.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong),
                                 c.POINTER(c.c_ulong), c.POINTER(c.POINTER(c.c_ulong)),
                                 c.POINTER(c.c_uint)]
        x.XQueryTree.restype = c.c_int
        x.XFetchName.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_char_p)]
        x.XFetchName.restype = c.c_int
        x.XGetGeometry.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong),
                                   c.POINTER(c.c_int), c.POINTER(c.c_int),
                                   c.POINTER(c.c_uint), c.POINTER(c.c_uint),
                                   c.POINTER(c.c_uint), c.POINTER(c.c_uint)]
        x.XGetGeometry.restype = c.c_int
        x.XRaiseWindow.argtypes = [c.c_void_p, c.c_ulong]
        x.XFlush.argtypes = [c.c_void_p]
        x.XFree.argtypes = [c.c_void_p]
        x.XCloseDisplay.argtypes = [c.c_void_p]
        self.root = x.XRootWindow(self.display, x.XDefaultScreen(self.display))

    def fx_window(self) -> tuple[int, int, int]:
        root, parent, children, count = c.c_ulong(), c.c_ulong(), c.POINTER(c.c_ulong)(), c.c_uint()
        assert self.lib.XQueryTree(self.display, self.root, c.byref(root),
                                   c.byref(parent), c.byref(children), c.byref(count))
        matches = []
        for i in range(count.value):
            name = c.c_char_p()
            window = children[i]
            if self.lib.XFetchName(self.display, window, c.byref(name)) and name.value:
                if b"Manifold Standalone FX" in name.value:
                    matches.append(window)
                self.lib.XFree(name)
        if children:
            self.lib.XFree(children)
        assert len(matches) == 1, f"expected one REAPER FX window, got {matches}"
        window = matches[0]
        root_out, x, y = c.c_ulong(), c.c_int(), c.c_int()
        width, height, border, depth = c.c_uint(), c.c_uint(), c.c_uint(), c.c_uint()
        assert self.lib.XGetGeometry(self.display, window, c.byref(root_out),
                                      c.byref(x), c.byref(y), c.byref(width),
                                      c.byref(height), c.byref(border), c.byref(depth))
        return window, x.value, y.value

    def raise_fx(self) -> tuple[int, int]:
        window, x, y = self.fx_window()
        self.lib.XRaiseWindow(self.display, window)
        self.lib.XFlush(self.display)
        return x, y

    def drag_room(self, start: int = 310, end: int = 410) -> None:
        x, y = self.raise_fx()
        test = c.CDLL("libXtst.so.6")
        test.XTestFakeMotionEvent.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int, c.c_ulong]
        test.XTestFakeMotionEvent.restype = c.c_int
        test.XTestFakeButtonEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
        test.XTestFakeButtonEvent.restype = c.c_int
        assert test.XTestFakeMotionEvent(self.display, -1, x + start, y + 150, 0)
        assert test.XTestFakeButtonEvent(self.display, 1, 1, 0)
        self.lib.XFlush(self.display)
        time.sleep(0.1)
        assert test.XTestFakeMotionEvent(self.display, -1, x + end, y + 150, 0)
        self.lib.XFlush(self.display)
        time.sleep(0.1)
        assert test.XTestFakeButtonEvent(self.display, 1, 0, 0)
        self.lib.XFlush(self.display)
        time.sleep(0.4)

    def capture(self, filename: str) -> Path:
        self.raise_fx()
        target = OUTPUT / filename
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab",
                        "-video_size", "1024x768", "-i", os.environ["DISPLAY"],
                        "-frames:v", "1", "-y", str(target)],
                       check=True, timeout=15)
        return target

    def close(self) -> None:
        self.lib.XCloseDisplay(self.display)


def stop_reaper(process: subprocess.Popen) -> None:
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
    process.wait(timeout=5)


def main() -> None:
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1", "requires disposable display"
    assert os.environ.get("DISPLAY") and os.environ["DISPLAY"] != ":0", "refusing user display"
    assert BUNDLE.is_dir(), "build the VST3 bundle first"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    x11 = X11()
    try:
        with tempfile.TemporaryDirectory(prefix="manifold-reaper-") as directory:
            work = Path(directory)
            config = work / "reaper.ini"
            config.write_text(f"[reaper]\nvstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n")
            project = work / "saved.rpp"
            create = work / "create.lua"
            create.write_text(f"""
local log=io.open('{work}/created.txt','w')
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Standalone FX',false,-1)
if fx<0 then log:write('FAILED: plug-in not found\\n'); log:close(); return end
reaper.TrackFX_SetParamNormalized(track,fx,0,7/20)
reaper.TrackFX_SetParamNormalized(track,fx,1,0.72)
local start=reaper.time_precise()
local function show()
 if reaper.time_precise()-start<1 then reaper.defer(show); return end
 reaper.TrackFX_Show(track,fx,3)
 log:write('opened\\n'); log:close()
 local function poll()
  local f=io.open('{work}/command.txt','r')
  if f then
   local cmd=f:read('*a'); f:close(); os.remove('{work}/command.txt')
   local out=io.open('{work}/' .. cmd .. '.txt','w')
   if cmd=='mix' then
    out:write('done ' .. tostring(reaper.TrackFX_SetParamNormalized(track,fx,1,0.2)) .. '\\n')
   elseif cmd=='query' then
    out:write('done ' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,2)) .. '\\n')
   elseif cmd=='save' then
    reaper.Main_SaveProjectEx(0,'{project}',0)
    out:write('done saved\\n')
   else out:write('FAILED: unknown command\\n') end
   out:close()
  end
  reaper.defer(poll)
 end
 reaper.defer(poll)
end
reaper.defer(show)
""")
            with (work / "reaper-output.log").open("w") as log:
                process = subprocess.Popen(
                    ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                     "-noactivate", str(create)], env=host_env(),
                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                )
                try:
                    wait_for(work / "created.txt", "opened")
                    time.sleep(1)
                    initial = x11.capture("reaper-initial.png")
                    assert "true" in command(work, "mix")
                    time.sleep(0.3)
                    automated = x11.capture("reaper-automated.png")
                    x11.drag_room()
                    room = float(command(work, "query").split()[1])
                    assert 0.6 < room < 0.8, f"Room drag not received by REAPER: {room}"
                    gesture = x11.capture("reaper-gesture.png")
                    command(work, "save")
                    wait_for(project, "ManifoldFX.vst3")
                finally:
                    stop_reaper(process)

            reopen = work / "reopen.lua"
            reopen.write_text(f"""
local tr=reaper.GetTrack(0,0)
local fx=tr and reaper.TrackFX_GetCount(tr) or 0
local f=io.open('{work}/reopened.txt','w')
if fx~=1 then f:write('FAILED: wrong FX count'); f:close(); return end
for id=0,2 do f:write(id .. '=' .. tostring(reaper.TrackFX_GetParamNormalized(tr,0,id)) .. '\\n') end
local start=reaper.time_precise()
local function show()
 if reaper.time_precise()-start<1 then reaper.defer(show); return end
 reaper.TrackFX_Show(tr,0,3)
 f:write('opened\\n'); f:close()
 local running=false
 local high=false
 local low=false
 local replaying=false
 local replay_end=0
 local replay_min,replay_max=1,0
 local replay_samples=0
 local function poll()
  local input=io.open('{work}/command.txt','r')
  if input then
   local cmd=input:read('*a'); input:close(); os.remove('{work}/command.txt')
   if cmd=='automation' then
    local env=reaper.GetFXEnvelope(tr,0,1,true)
    local point_times={{0,0.5,2.5,3,5}}
    local point_values={{0.2,0.8,0.8,0.2,0.2}}
    for idx=1,#point_times do
     reaper.InsertEnvelopePointEx(env,-1,point_times[idx],point_values[idx],0,0,false,true)
    end
    reaper.Envelope_SortPointsEx(env,-1)
    reaper.SetEditCurPos(0,false,false)
    reaper.OnPlayButton()
    running=true
    local out=io.open('{work}/automation.txt','w')
    out:write('done envelope with ' .. tostring(reaper.CountEnvelopePointsEx(env,-1)) .. ' points\\n')
    out:close()
   elseif cmd=='record' then
    local env=reaper.GetFXEnvelope(tr,0,2,true)
    reaper.GetSetEnvelopeInfo_String(env,'ARM','1',true)
    reaper.GetSetEnvelopeInfo_String(env,'ACTIVE','1',true)
    reaper.GetSetEnvelopeInfo_String(env,'VISIBLE','1',true)
    reaper.SetTrackAutomationMode(tr,3)
    reaper.SetEditCurPos(6,false,false)
    reaper.OnPlayButton()
    local out=io.open('{work}/record.txt','w')
    out:write('done ' .. tostring(reaper.GetTrackAutomationMode(tr)) .. '\\n')
    out:close()
   elseif cmd=='record-stop' then
    reaper.OnStopButton()
    reaper.SetTrackAutomationMode(tr,1)
    local env=reaper.GetFXEnvelope(tr,0,2,false)
    local count=reaper.CountEnvelopePointsEx(env,-1)
    local minimum,maximum=1,0
    for index=0,count-1 do
     local ok,t,value=reaper.GetEnvelopePointEx(env,-1,index)
     if ok then minimum=math.min(minimum,value); maximum=math.max(maximum,value) end
    end
    reaper.Main_SaveProjectEx(0,'{project}',0)
    local out=io.open('{work}/record-stop.txt','w')
    out:write('done ' .. tostring(count) .. ' ' .. tostring(minimum) .. ' ' .. tostring(maximum) .. '\\n')
    out:close()
   elseif cmd=='replay' then
    local env=reaper.GetFXEnvelope(tr,0,2,false)
    local count=reaper.CountEnvelopePointsEx(env,-1)
    local first,last=math.huge,0
    for index=0,count-1 do
     local ok,t=reaper.GetEnvelopePointEx(env,-1,index)
     if ok then first=math.min(first,t); last=math.max(last,t) end
    end
    reaper.SetEditCurPos(math.max(0,first-0.2),false,false)
    reaper.OnPlayButton()
    replay_end=last+0.3
    replay_min,replay_max,replay_samples=1,0,0
    replaying=true
   end
  end
  if running then
   local position=reaper.GetPlayPosition()
   if position>1.2 and not high then
    high=true
    local out=io.open('{work}/automation-high.txt','w')
    out:write('done ' .. tostring(reaper.TrackFX_GetParamNormalized(tr,0,1)) .. '\\n')
    out:close()
   elseif position>3.4 and not low then
    low=true
    local out=io.open('{work}/automation-low.txt','w')
    out:write('done ' .. tostring(reaper.TrackFX_GetParamNormalized(tr,0,1)) .. '\\n')
    out:close()
    reaper.OnStopButton()
   end
  end
  if replaying then
   local value=reaper.TrackFX_GetParamNormalized(tr,0,2)
   replay_min=math.min(replay_min,value)
   replay_max=math.max(replay_max,value)
   replay_samples=replay_samples+1
   if reaper.GetPlayPosition()>replay_end then
    replaying=false
    reaper.OnStopButton()
    local out=io.open('{work}/replay.txt','w')
    out:write('done ' .. tostring(replay_min) .. ' ' .. tostring(replay_max) .. ' ' .. tostring(replay_samples) .. '\\n')
    out:close()
   end
  end
  reaper.defer(poll)
 end
 reaper.defer(poll)
end
reaper.defer(show)
""")
            with (work / "reopen-output.log").open("w") as log:
                process = subprocess.Popen(
                    ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                     "-noactivate", str(project), str(reopen)], env=host_env(),
                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                )
                try:
                    state = wait_for(work / "reopened.txt", "opened")
                    values = {int(key): float(value) for key, value in
                              (line.split("=", 1) for line in state.splitlines() if "=" in line)}
                    assert abs(values[0] - 0.35) < 1e-5
                    assert abs(values[1] - 0.2) < 1e-5
                    assert abs(values[2] - room) < 1e-5
                    time.sleep(1)
                    recalled = x11.capture("reaper-reopened.png")
                    assert "5 points" in command(work, "automation")
                    high = float(wait_for(work / "automation-high.txt", "done").split()[1])
                    assert 0.75 < high < 0.85, f"high automation not applied: {high}"
                    high_capture = x11.capture("reaper-automation-high.png")
                    low = float(wait_for(work / "automation-low.txt", "done").split()[1])
                    assert 0.15 < low < 0.25, f"low automation not applied: {low}"
                    low_capture = x11.capture("reaper-automation-low.png")
                    assert command(work, "record").split()[1] == "3"
                    time.sleep(0.5)
                    x11.drag_room(310, 350)
                    time.sleep(0.5)
                    record_capture = x11.capture("reaper-recorded-gesture.png")
                    recorded = command(work, "record-stop").split()
                    count, minimum, maximum = int(recorded[1]), float(recorded[2]), float(recorded[3])
                    assert count >= 2 and minimum < 0.4 and maximum > 0.4, recorded
                    replayed = command(work, "replay").split()
                    replay_min, replay_max = float(replayed[1]), float(replayed[2])
                    assert replay_min < 0.4 and replay_max > 0.4, replayed
                finally:
                    stop_reaper(process)
            print(f"REAPER VST3: host Mix .72→.20; Room drag→{room:.3f}; saved/reopened {values}")
            print(f"automation envelope: Mix {high:.3f}→{low:.3f} during playback")
            print(f"recorded Room gesture: {count} envelope points, range {minimum:.3f}–{maximum:.3f}")
            print(f"replayed Room envelope: {replay_min:.3f}–{replay_max:.3f}")
            for path in (initial, automated, gesture, recalled, high_capture, low_capture, record_capture):
                print(path)
    finally:
        x11.close()


if __name__ == "__main__":
    main()
