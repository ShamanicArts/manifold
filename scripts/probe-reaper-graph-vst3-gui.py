#!/usr/bin/env python3
"""Exercise the graph's original-widget editor in isolated REAPER/Xvfb.

Requires DISPLAY on a disposable Xvfb server, XTEST, and a built VST3 bundle.
"""

from array import array
import base64
import ctypes as c
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import wave


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web/public"
BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"


def wait_for(path: Path, token: str, timeout: float = 30) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            value = path.read_text()
            if "FAILED" in value:
                raise AssertionError(value)
            if token in value:
                return value
        time.sleep(0.1)
    raise TimeoutError(f"waiting for {path}: {path.read_text() if path.exists() else 'missing'}")


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
        self.root = x.XRootWindow(self.display, x.XDefaultScreen(self.display))
        x.XQueryTree.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong),
                                 c.POINTER(c.c_ulong), c.POINTER(c.POINTER(c.c_ulong)),
                                 c.POINTER(c.c_uint)]
        x.XQueryTree.restype = c.c_int
        x.XGetGeometry.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong),
                                   c.POINTER(c.c_int), c.POINTER(c.c_int),
                                   c.POINTER(c.c_uint), c.POINTER(c.c_uint),
                                   c.POINTER(c.c_uint), c.POINTER(c.c_uint)]
        x.XGetGeometry.restype = c.c_int
        x.XTranslateCoordinates.argtypes = [c.c_void_p, c.c_ulong, c.c_ulong,
                                             c.c_int, c.c_int, c.POINTER(c.c_int),
                                             c.POINTER(c.c_int), c.POINTER(c.c_ulong)]
        x.XTranslateCoordinates.restype = c.c_int
        x.XFree.argtypes = [c.c_void_p]
        x.XFlush.argtypes = [c.c_void_p]
        x.XFetchName.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_char_p)]
        x.XRaiseWindow.argtypes = [c.c_void_p, c.c_ulong]
        x.XSetInputFocus.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_ulong]
        x.XCloseDisplay.argtypes = [c.c_void_p]

    def children(self, window: int) -> list[int]:
        root, parent, items, count = c.c_ulong(), c.c_ulong(), c.POINTER(c.c_ulong)(), c.c_uint()
        assert self.lib.XQueryTree(self.display, window, c.byref(root),
                                   c.byref(parent), c.byref(items), c.byref(count))
        result = [items[i] for i in range(count.value)]
        if items:
            self.lib.XFree(items)
        return result

    def geometry(self, window: int) -> tuple[int, int]:
        root, x, y = c.c_ulong(), c.c_int(), c.c_int()
        width, height, border, depth = c.c_uint(), c.c_uint(), c.c_uint(), c.c_uint()
        assert self.lib.XGetGeometry(self.display, window, c.byref(root),
                                      c.byref(x), c.byref(y), c.byref(width),
                                      c.byref(height), c.byref(border), c.byref(depth))
        return width.value, height.value

    def editor(self) -> int:
        # The plug-in owns an exactly 800×600 embedded X11 child.
        pending = self.children(self.root)
        matches = []
        while pending:
            window = pending.pop()
            try:
                if self.geometry(window) == (800, 600):
                    matches.append(window)
                pending.extend(self.children(window))
            except AssertionError:
                continue
        assert matches, "no graph editor window found"
        # REAPER's FX wrapper, the companion shell, and its WebKit child can
        # all retain the requested editor size. The deepest child is drawn.
        return max(matches)

    def inventory(self) -> list[tuple[int, tuple[int, int]]]:
        pending = self.children(self.root)
        result = []
        while pending:
            window = pending.pop()
            try:
                size = self.geometry(window)
                if size[0] >= 400 and size[1] >= 200:
                    result.append((window, size))
                pending.extend(self.children(window))
            except AssertionError:
                continue
        return result

    def origin(self, window: int) -> tuple[int, int]:
        x, y, child = c.c_int(), c.c_int(), c.c_ulong()
        assert self.lib.XTranslateCoordinates(self.display, window, self.root, 0, 0,
                                               c.byref(x), c.byref(y), c.byref(child))
        return x.value, y.value

    def raise_fx(self) -> None:
        for window in self.children(self.root):
            name = c.c_char_p()
            if self.lib.XFetchName(self.display, window, c.byref(name)) and name.value:
                title = name.value.decode(errors="replace")
                self.lib.XFree(name)
                if "Manifold Graph" in title:
                    self.lib.XRaiseWindow(self.display, window)
                    self.lib.XFlush(self.display)
                    return
        raise AssertionError("REAPER graph FX window not found")

    def window_titles(self) -> list[tuple[int, str, tuple[int, int]]]:
        result = []
        for window in self.children(self.root):
            name = c.c_char_p()
            title = ""
            if self.lib.XFetchName(self.display, window, c.byref(name)) and name.value:
                title = name.value.decode(errors="replace")
                self.lib.XFree(name)
            result.append((window, title, self.geometry(window)))
        return result

    def drag(self, window: int) -> None:
        x, y = self.origin(window)
        test = c.CDLL("libXtst.so.6")
        test.XTestFakeMotionEvent.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int, c.c_ulong]
        test.XTestFakeButtonEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
        assert test.XTestFakeMotionEvent(self.display, -1, x + 115, y + 211, 0)
        assert test.XTestFakeButtonEvent(self.display, 1, 1, 0)
        self.lib.XFlush(self.display)
        time.sleep(0.1)
        assert test.XTestFakeMotionEvent(self.display, -1, x + 235, y + 211, 0)
        self.lib.XFlush(self.display)
        time.sleep(0.1)
        assert test.XTestFakeButtonEvent(self.display, 1, 0, 0)
        self.lib.XFlush(self.display)
        time.sleep(0.3)

    def click(self, x: int, y: int) -> None:
        test = c.CDLL("libXtst.so.6")
        test.XTestFakeMotionEvent.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int, c.c_ulong]
        test.XTestFakeButtonEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
        assert test.XTestFakeMotionEvent(self.display, -1, x, y, 0)
        assert test.XTestFakeButtonEvent(self.display, 1, 1, 0)
        assert test.XTestFakeButtonEvent(self.display, 1, 0, 0)
        self.lib.XFlush(self.display)

    def scroll_down(self, window: int, ticks: int) -> None:
        x, y = self.origin(window)
        test = c.CDLL("libXtst.so.6")
        test.XTestFakeMotionEvent.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int, c.c_ulong]
        test.XTestFakeButtonEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
        assert test.XTestFakeMotionEvent(self.display, -1, x + 700, y + 450, 0)
        for _ in range(ticks):
            assert test.XTestFakeButtonEvent(self.display, 5, 1, 0)
            assert test.XTestFakeButtonEvent(self.display, 5, 0, 0)
        self.lib.XFlush(self.display)

    def assign_first_slot(self, window: int, displayed: int) -> None:
        x, y = self.origin(window)
        self.click(x + 43, y + 211)
        self.lib.XSetInputFocus(self.display, window, 2, 0)
        self.lib.XFlush(self.display)
        time.sleep(0.1)
        test = c.CDLL("libXtst.so.6")
        test.XTestFakeKeyEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
        self.lib.XKeysymToKeycode.argtypes = [c.c_void_p, c.c_ulong]
        self.lib.XKeysymToKeycode.restype = c.c_ubyte
        def key(symbol: int, down: bool) -> None:
            code = self.lib.XKeysymToKeycode(self.display, symbol)
            assert code, f"unmapped keysym {symbol:#x}"
            assert test.XTestFakeKeyEvent(self.display, code, int(down), 0)
        key(0xffe3, True)  # Control_L
        key(ord('a'), True)
        key(ord('a'), False)
        key(0xffe3, False)
        for character in str(displayed):
            key(ord(character), True)
            key(ord(character), False)
        key(0xff09, True)  # Tab commits the number field.
        key(0xff09, False)
        self.lib.XFlush(self.display)

    def choose_file(self, window: int, path: Path) -> None:
        x, y = self.origin(window)
        self.click(x + 90, y + 125)
        time.sleep(0.8)
        chooser = next((window for window, title, _ in self.window_titles()
                        if title == "Select File"), None)
        assert chooser, "native file chooser did not open"
        self.lib.XSetInputFocus(self.display, chooser, 2, 0)
        self.lib.XFlush(self.display)
        test = c.CDLL("libXtst.so.6")
        test.XTestFakeKeyEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
        self.lib.XKeysymToKeycode.argtypes = [c.c_void_p, c.c_ulong]
        self.lib.XKeysymToKeycode.restype = c.c_ubyte
        def key(symbol: int, down: bool) -> None:
            code = self.lib.XKeysymToKeycode(self.display, symbol)
            assert code, f"unmapped keysym {symbol:#x}"
            assert test.XTestFakeKeyEvent(self.display, code, int(down), 0)
        key(0xffe3, True)  # Control_L
        key(ord("l"), True)
        key(ord("l"), False)
        key(0xffe3, False)
        self.lib.XFlush(self.display)
        time.sleep(0.2)
        for character in str(path):
            key(ord(character), True)
            key(ord(character), False)
        key(0xff0d, True)  # Return
        key(0xff0d, False)
        self.lib.XFlush(self.display)
        time.sleep(0.3)
        key(0xff0d, True)
        key(0xff0d, False)
        self.lib.XFlush(self.display)
        time.sleep(0.8)

    def capture(self, window: int, name: str) -> Path:
        target = PUBLIC / name
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab",
                        "-video_size", "1024x768", "-i", os.environ["DISPLAY"],
                        "-frames:v", "1", "-y", str(target)], check=True, timeout=15)
        return target

    def close(self) -> None:
        self.lib.XCloseDisplay(self.display)


def main() -> None:
    max_sample_import = "--max-sample-import" in sys.argv
    multi_sample_import = "--multi-sample-import" in sys.argv
    large_sample_import = "--large-sample-import" in sys.argv or max_sample_import or multi_sample_import
    sample_import = "--sample-import" in sys.argv or large_sample_import
    sample_frames = 1_440_000 if max_sample_import else 480_000 if large_sample_import else 48_000
    sample_review = ("multi-sample" if multi_sample_import else "max-sample" if max_sample_import
                     else "large-sample" if large_sample_import else "sample")
    manual_picker = "--manual-picker" in sys.argv
    direct_import = "--direct-import" in sys.argv or sample_import or manual_picker
    slot_automation = "--slot-automation" in sys.argv
    slot_assign = "--slot-assign" in sys.argv or slot_automation
    host_slot_index = 1 if slot_automation else 41
    destination = 2 if slot_automation else 42
    assert not (slot_assign and direct_import), "run slot assignment as its own host probe"
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") and os.environ["DISPLAY"] != ":0"
    assert BUNDLE.is_dir(), "build the VST3 bundle first"
    assert sys.byteorder == "little", "the generated PCM fixture uses little-endian floats"
    x11 = X11()
    try:
        with tempfile.TemporaryDirectory(prefix="manifold-graph-editor-reaper-") as directory:
            work = Path(directory)
            project = work / "direct-import.rpp"
            imported_project = ROOT / "projects/graph-workspace/tone-texture.json"
            picker_project = Path(f"/tmp/manifoldimporttone{os.getpid()}.json")
            if manual_picker:
                picker_project.write_bytes(imported_project.read_bytes())
                imported_project = picker_project
            if direct_import:
                if sample_import:
                    bundle = json.loads((ROOT / "projects/graph-workspace/sample-voice.json").read_text())
                    pcm = array("f")
                    for frame in range(sample_frames):
                        value = 0.25 * math.sin(2 * math.pi * 440 * frame / 48_000)
                        pcm.extend((value, value))
                    bundle["assets"] = [{"nodeId": 5, "sourceRate": 48_000,
                                         "frames": sample_frames, "label": "440 Hz source",
                                         "pcmF32Base64": base64.b64encode(pcm.tobytes()).decode("ascii")}]
                    if multi_sample_import:
                        second = array("f")
                        for frame in range(sample_frames):
                            value = 0.25 * math.sin(2 * math.pi * 660 * frame / 48_000)
                            second.extend((value, value))
                        bundle["assets"].append({"nodeId": 7, "sourceRate": 48_000,
                                                 "frames": sample_frames, "label": "660 Hz source",
                                                 "pcmF32Base64": base64.b64encode(second.tobytes()).decode("ascii")})
                        bundle["signal"]["nodes"].extend([{"id": 7, "type": "sample-instrument"},
                                                            {"id": 8, "type": "sum2", "a": 1, "b": 1}])
                        connections = bundle["signal"]["connections"]
                        connections.remove({"from": 6, "to": 3, "inputPort": 0})
                        connections.extend([{"from": 4, "to": 7, "inputPort": 0},
                                            {"from": 6, "to": 8, "inputPort": 0},
                                            {"from": 7, "to": 8, "inputPort": 1},
                                            {"from": 8, "to": 3, "inputPort": 0}])
                        bundle["signal"]["initialParameters"].extend(
                            {**entry, "nodeId": 7} for entry in
                            bundle["signal"]["initialParameters"][:] if entry["nodeId"] == 5)
                    imported_project = work / "sample-voice-with-source.json"
                    imported_project.write_text(json.dumps(bundle, separators=(",", ":")))
                    if multi_sample_import:
                        subprocess.run(["cargo", "run", "-q", "-p", "manifold-native", "--example",
                                        "render_graph_midi_audio", "--", str(imported_project),
                                        str(work / "preflight.f32"), "1024", "6000", "24000", "100"],
                                       cwd=ROOT, check=True, timeout=120)
                else:
                    with wave.open(str(work / "silence.wav"), "wb") as source:
                        source.setnchannels(2)
                        source.setsampwidth(2)
                        source.setframerate(48_000)
                        source.writeframes(bytes(48_000 * 4))
            preset = work / "tone-texture.vstpreset"
            subprocess.run(["cargo", "run", "-q", "-p", "manifold-vst3", "--example",
                            "export_graph_preset", "--",
                            str(ROOT / "projects/graph-workspace/tone-texture.json"),
                            str(preset)], cwd=ROOT, check=True, timeout=120)
            config = work / "reaper.ini"
            config.write_text(f"[reaper]\nvstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n")
            script = work / "probe.lua"
            if sample_import or slot_assign:
                media_setup = """
local item=reaper.CreateNewMIDIItemInProj(track,0,1,false)
local take=reaper.GetActiveTake(item)
local start=reaper.MIDI_GetPPQPosFromProjTime(take,0.125)
local finish=reaper.MIDI_GetPPQPosFromProjTime(take,0.5)
reaper.MIDI_InsertNote(take,false,false,start,finish,0,60,100,false)
reaper.MIDI_Sort(take)
"""
            elif direct_import:
                media_setup = (f"reaper.SetOnlyTrackSelected(track); "
                               f"reaper.SetEditCurPos(0,false,false); "
                               f"reaper.InsertMedia('{work}/silence.wav',0)")
            else:
                media_setup = ""
            script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
{media_setup}
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Graph',false,-1)
local out=io.open('{work}/ready.txt','w')
if fx<0 then out:write('FAILED: Manifold Graph unavailable'); out:close(); return end
reaper.TrackFX_Show(track,fx,3)
out:write('done open'); out:close()
local function poll()
 local path='{work}/command.txt'
 local file=io.open(path,'r')
 if file then
  local command=file:read('*a'); file:close(); os.remove(path)
  local result=io.open('{work}/' .. command .. '.txt','w')
  if command=='automate' then
   reaper.TrackFX_SetParamNormalized(track,fx,0,0.2)
   result:write('done ' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,0)))
  elseif command=='slot-query' then
   result:write('done ' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,{host_slot_index})) .. ' ' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,0)))
  elseif command=='envelope' then
   local envelope=reaper.GetFXEnvelope(track,fx,1,true)
   if not envelope then result:write('FAILED: envelope unavailable')
   else
    reaper.InsertEnvelopePointEx(envelope,-1,0,0.75,0,0,false,true)
    reaper.InsertEnvelopePointEx(envelope,-1,1,0.75,0,0,false,true)
    reaper.Envelope_SortPointsEx(envelope,-1)
    reaper.GetSetEnvelopeInfo_String(envelope,'ACTIVE','1',true)
    reaper.SetTrackAutomationMode(track,1)
    result:write('done ' .. tostring(reaper.CountEnvelopePointsEx(envelope,-1)))
   end
  elseif command=='slot-set' then
   reaper.TrackFX_SetParamNormalized(track,fx,41,0.75)
   reaper.SetEditCurPos(0,false,false)
   reaper.OnPlayButton()
   result:write('done ' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,41)))
  elseif command=='slot-play' then
   reaper.SetEditCurPos(0,false,false)
   reaper.OnPlayButton()
   result:write('done playing')
  elseif command=='query' then
   result:write('done ' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,0)))
  elseif command=='preset' then
   local loaded=reaper.TrackFX_SetPreset(track,fx,'{preset}')
   result:write(loaded and 'done preset' or 'FAILED: preset load')
  elseif command=='save' then
   reaper.OnStopButton()
   reaper.GetSetProjectInfo(0,'RENDER_SETTINGS',0,true)
   reaper.GetSetProjectInfo(0,'RENDER_BOUNDSFLAG',0,true)
   reaper.GetSetProjectInfo(0,'RENDER_STARTPOS',0,true)
   reaper.GetSetProjectInfo(0,'RENDER_ENDPOS',1,true)
   reaper.GetSetProjectInfo(0,'RENDER_SRATE',48000,true)
   reaper.GetSetProjectInfo(0,'RENDER_CHANNELS',2,true)
   reaper.GetSetProjectInfo(0,'RENDER_TAILFLAG',0,true)
   reaper.GetSetProjectInfo(0,'RENDER_NORMALIZE',0,true)
   reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{work}',true)
   reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','direct-import',true)
   reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
   reaper.Main_SaveProjectEx(0,'{project}',0)
   result:write('done saved')
  else result:write('FAILED: unknown command') end
  result:close()
 end
 reaper.defer(poll)
end
reaper.defer(poll)
""")
            env = {**os.environ, "GDK_BACKEND": "x11"}
            if direct_import and not manual_picker:
                env["MANIFOLD_GRAPH_IMPORT_PROBE"] = str(imported_project)
            with (work / "reaper.log").open("w") as log:
                process = subprocess.Popen(
                    ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                     "-noactivate", str(script)], env=env, stdout=log,
                    stderr=subprocess.STDOUT, start_new_session=True,
                )
                try:
                    wait_for(work / "ready.txt", "done")
                    for _ in range(100):
                        try:
                            window = x11.editor()
                            break
                        except AssertionError:
                            time.sleep(0.1)
                    else:
                        raise AssertionError(f"REAPER graph editor absent: {x11.inventory()}; "
                                             f"log: {(work / 'reaper.log').read_text()[-2500:]}")
                    time.sleep(1)
                    # A fresh private REAPER profile may show a release-notes
                    # modal above the editor. Dismiss its Close button.
                    x11.click(672, 360)
                    time.sleep(0.3)
                    x11.raise_fx()
                    if slot_assign:
                        if slot_automation:
                            (work / "command.txt").write_text("envelope")
                            envelope_values = wait_for(work / "envelope.txt", "done").split()
                            assert int(envelope_values[1]) == 2
                        x11.assign_first_slot(window, destination)
                        time.sleep(1)
                        (work / "command.txt").write_text("slot-query")
                        slot_values = wait_for(work / "slot-query.txt", "done").split()
                        assigned = float(slot_values[1])
                        vacant = float(slot_values[2])
                        if slot_automation:
                            assert abs(assigned - 31 / 48) < 1e-4, slot_values
                            # Give the existing Read-mode envelope a processing interval.
                            (work / "command.txt").write_text("slot-play")
                            wait_for(work / "slot-play.txt", "done")
                        else:
                            assert abs(assigned - 31 / 48) < 1e-4, slot_values
                            assert abs(vacant) < 1e-5, slot_values
                            (work / "command.txt").write_text("slot-set")
                            changed = float(wait_for(work / "slot-set.txt", "done").split()[1])
                            assert abs(changed - 0.75) < 1e-5, changed
                        time.sleep(1.2)
                        if slot_automation:
                            (work / "slot-query.txt").unlink()
                            (work / "command.txt").write_text("slot-query")
                            changed = float(wait_for(work / "slot-query.txt", "done").split()[1])
                            assert abs(changed - .75) < 1e-4, changed
                        slot_capture = x11.capture(window, "graph-vst3-reaper-editor-slot-automation.png"
                                                   if slot_automation else "graph-vst3-reaper-editor-slot-assign.png")
                        (work / "command.txt").write_text("save")
                        wait_for(work / "save.txt", "done")
                        print(f"REAPER editor slot 1 -> {destination}: initial={assigned:.6f}, old slot={vacant:.6f}, changed={changed:.6f}; capture: {slot_capture}")
                    elif direct_import:
                        if manual_picker:
                            x11.choose_file(window, imported_project)
                        if large_sample_import:
                            deadline = time.monotonic() + 120
                            while True:
                                (work / "query.txt").unlink(missing_ok=True)
                                (work / "command.txt").write_text("query")
                                value = float(wait_for(work / "query.txt", "done", 90).split()[1])
                                if abs(value - .5) < 1e-4:
                                    break
                                if time.monotonic() > deadline:
                                    raise AssertionError(f"large project did not reach REAPER; slot 0={value}")
                                time.sleep(.5)
                        else:
                            time.sleep(1)
                            (work / "command.txt").write_text("query")
                            value = float(wait_for(work / "query.txt", "done").split()[1])
                        if not sample_import:
                            assert value < 0.1, f"direct JSON import did not reach the host: slot 0={value}"
                        imported = x11.capture(window, f"graph-vst3-reaper-editor-{sample_review}-import.png"
                                               if sample_import else "graph-vst3-reaper-editor-direct-import.png")
                        if multi_sample_import:
                            x11.scroll_down(window, 7)
                            time.sleep(.4)
                            x11.capture(window, "graph-vst3-reaper-editor-multi-sample-secondary.png")
                        (work / "command.txt").write_text("save")
                        wait_for(work / "save.txt", "done")
                        print(f"REAPER direct JSON import: slot 0={value:.3f}; capture: {imported}")
                    else:
                        initial = x11.capture(window, "graph-vst3-reaper-editor-initial.png")
                        (work / "command.txt").write_text("automate")
                        before = float(wait_for(work / "automate.txt", "done").split()[1])
                        assert abs(before - 0.2) < 1e-5, before
                        time.sleep(0.3)
                        automated = x11.capture(window, "graph-vst3-reaper-editor-automated.png")
                        x11.drag(window)
                        (work / "command.txt").write_text("query")
                        after = float(wait_for(work / "query.txt", "done").split()[1])
                        assert after > before + 0.2, f"widget drag not received by REAPER: {before} -> {after}"
                        gesture = x11.capture(window, "graph-vst3-reaper-editor-gesture.png")
                        (work / "command.txt").write_text("preset")
                        wait_for(work / "preset.txt", "done")
                        time.sleep(0.5)
                        x11.raise_fx()
                        imported = x11.capture(window, "graph-vst3-reaper-editor-imported.png")
                        print(f"REAPER graph original widget: slot 0 {before:.3f} -> {after:.3f}; "
                              f"captures: {initial}, {automated}, {gesture}, {imported}")
                finally:
                    if process.poll() is None:
                        os.killpg(process.pid, signal.SIGTERM)
                    process.wait(timeout=5)
            if slot_assign:
                assert project.exists(), "REAPER did not save assigned graph state"
                with (work / "render.log").open("w") as log:
                    subprocess.run(["reaper", "-cfgfile", str(config), "-newinst",
                                    "-nosplash", "-renderproject", str(project)],
                                   env=env, stdout=log, stderr=subprocess.STDOUT,
                                   timeout=45, check=True)
                rendered = work / "direct-import.wav"
                assert rendered.exists(), (work / "render.log").read_text()[-1500:]
                raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(rendered),
                                               "-f", "f32le", "-acodec", "pcm_f32le", "-"])
                actual = array("f")
                actual.frombytes(raw)
                expected_project = json.loads((ROOT / "projects/graph-workspace/note-voice.json").read_text())
                next(entry for entry in expected_project["signal"]["initialParameters"]
                     if entry["nodeId"] == 5 and entry["id"] == 0)["value"] = 12
                if slot_automation:
                    next(entry for entry in expected_project["signal"]["initialParameters"]
                         if entry["nodeId"] == 6 and entry["id"] == 0)["value"] = round(vacant * 3)
                native_project = work / "note-transpose-12.json"
                native_project.write_text(json.dumps(expected_project))
                native_path = work / "note-transpose-12.f32"
                subprocess.run(["cargo", "run", "-q", "-p", "manifold-native", "--example",
                                "render_graph_midi_audio", "--", str(native_project),
                                str(native_path), "1024", "6000", "24000", "100"],
                               cwd=ROOT, check=True, timeout=120)
                expected = array("f")
                expected.frombytes(native_path.read_bytes())
                assert len(actual) == len(expected) == 48_000 * 2
                error = max(abs(a - b) for a, b in zip(actual, expected))
                peak = max(abs(value) for value in actual)
                assert peak > .01 and error < 1e-7, (peak, error)
                target = PUBLIC / ("graph-vst3-reaper-editor-slot-automation.wav" if slot_automation
                                   else "graph-vst3-reaper-editor-slot-assign.wav")
                target.write_bytes(rendered.read_bytes())
                metrics = {"host": "REAPER Linux VST3",
                           "assignment": f"original widget editor slot 1 to {destination}",
                           **({"existingEnvelopeSlot": 2, "envelopePointNormalized": .75}
                              if slot_automation else {}),
                           "normalizedBefore": assigned, "oldSlotAfter": vacant,
                           "normalizedAfter": changed, "savedAndReopened": True,
                           "renderFrames": 48_000, "channels": 2,
                           "peak": peak, "peakErrorVsNative": error,
                           "render": target.name}
                (PUBLIC / ("graph-vst3-reaper-editor-slot-automation.json" if slot_automation
                           else "graph-vst3-reaper-editor-slot-assign.json")).write_text(
                    json.dumps(metrics, indent=2) + "\n")
                print(f"Fresh REAPER render after native editor assignment: peak={peak:.6f}, peak error vs Rust={error:.2g}; {target}")
            if direct_import:
                assert project.exists(), "REAPER did not save imported graph state"
                render_env = {key: value for key, value in env.items()
                              if key != "MANIFOLD_GRAPH_IMPORT_PROBE"}
                with (work / "render.log").open("w") as log:
                    subprocess.run(["reaper", "-cfgfile", str(config), "-newinst",
                                    "-nosplash", "-renderproject", str(project)],
                                   env=render_env, stdout=log, stderr=subprocess.STDOUT,
                                   timeout=45, check=True)
                rendered = work / "direct-import.wav"
                assert rendered.exists(), (work / "render.log").read_text()[-1500:]
                def samples(path: Path) -> array:
                    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(path),
                                                   "-f", "f32le", "-acodec", "pcm_f32le", "-"])
                    result = array("f")
                    result.frombytes(raw)
                    return result
                actual = samples(rendered)
                if sample_import:
                    native_path = work / "sample-native.f32"
                    subprocess.run(["cargo", "run", "-q", "-p", "manifold-native",
                                    "--example", "render_graph_midi_audio", "--",
                                    str(imported_project), str(native_path), "1024", "6000",
                                    "24000", "100"], cwd=ROOT, check=True, timeout=120)
                    expected = array("f")
                    expected.frombytes(native_path.read_bytes())
                else:
                    expected = samples(PUBLIC / "graph-vst3-reaper-tone.wav")
                assert len(actual) == len(expected) == 48_000 * 2
                peak = max(abs(value) for value in actual)
                error = max(abs(a - b) for a, b in zip(actual, expected))
                assert peak > 0.01 and error < 1e-7, (peak, error)
                second_contribution = None
                if multi_sample_import:
                    muted = json.loads(imported_project.read_text())
                    muted["assets"][1]["pcmF32Base64"] = base64.b64encode(
                        bytes(sample_frames * 8)).decode("ascii")
                    muted_path = work / "second-source-muted.json"
                    muted_path.write_text(json.dumps(muted, separators=(",", ":")))
                    muted_audio = work / "second-source-muted.f32"
                    subprocess.run(["cargo", "run", "-q", "-p", "manifold-native", "--example",
                                    "render_graph_midi_audio", "--", str(muted_path),
                                    str(muted_audio), "1024", "6000", "24000", "100"],
                                   cwd=ROOT, check=True, timeout=120)
                    silent_second = array("f")
                    silent_second.frombytes(muted_audio.read_bytes())
                    second_contribution = math.sqrt(sum((a - b) ** 2 for a, b in
                                                        zip(expected, silent_second)) / len(expected))
                    assert second_contribution > .01, second_contribution
                target = PUBLIC / (f"graph-vst3-reaper-{sample_review}-import.wav" if sample_import
                                   else "graph-vst3-reaper-direct-import.wav")
                target.write_bytes(rendered.read_bytes())
                reference = "native Rust" if sample_import else "preset render"
                metrics = {
                    "host": "REAPER Linux VST3",
                    "project": imported_project.name if sample_import else "tone-texture.json",
                    "projectBytes": imported_project.stat().st_size,
                    "import": "editor JSON file input", "savedAndReopened": True,
                    "renderFrames": 48_000, "channels": 2, "peak": peak,
                    "reference": reference, "peakError": error,
                    "assetFrames": sample_frames if sample_import else 0,
                    **({"assetCount": 2, "secondAssetContributionRms": second_contribution}
                       if multi_sample_import else {}),
                    "render": target.name,
                }
                (PUBLIC / (f"graph-vst3-reaper-{sample_review}-import.json" if sample_import
                           else "graph-vst3-reaper-direct-import.json")).write_text(
                    json.dumps(metrics, indent=2) + "\n")
                print(f"Fresh REAPER render after direct import: peak={peak:.6f}, "
                      f"peak error vs {reference}={error:.2g}; {target}")
            if manual_picker:
                picker_project.unlink(missing_ok=True)
    finally:
        x11.close()


if __name__ == "__main__":
    main()
