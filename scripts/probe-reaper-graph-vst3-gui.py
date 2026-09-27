#!/usr/bin/env python3
"""Exercise the graph's original-widget editor in isolated REAPER/Xvfb.

Requires DISPLAY on a disposable Xvfb server, XTEST, and a built VST3 bundle.
"""

import ctypes as c
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time


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

    def drag(self, window: int) -> None:
        x, y = self.origin(window)
        test = c.CDLL("libXtst.so.6")
        test.XTestFakeMotionEvent.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int, c.c_ulong]
        test.XTestFakeButtonEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
        assert test.XTestFakeMotionEvent(self.display, -1, x + 115, y + 197, 0)
        assert test.XTestFakeButtonEvent(self.display, 1, 1, 0)
        self.lib.XFlush(self.display)
        time.sleep(0.1)
        assert test.XTestFakeMotionEvent(self.display, -1, x + 235, y + 197, 0)
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

    def capture(self, window: int, name: str) -> Path:
        target = PUBLIC / name
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab",
                        "-video_size", "1024x768", "-i", os.environ["DISPLAY"],
                        "-frames:v", "1", "-y", str(target)], check=True, timeout=15)
        return target

    def close(self) -> None:
        self.lib.XCloseDisplay(self.display)


def main() -> None:
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") and os.environ["DISPLAY"] != ":0"
    assert BUNDLE.is_dir(), "build the VST3 bundle first"
    x11 = X11()
    try:
        with tempfile.TemporaryDirectory(prefix="manifold-graph-editor-reaper-") as directory:
            work = Path(directory)
            preset = work / "tone-texture.vstpreset"
            subprocess.run(["cargo", "run", "-q", "-p", "manifold-vst3", "--example",
                            "export_graph_preset", "--",
                            str(ROOT / "projects/graph-workspace/tone-texture.json"),
                            str(preset)], cwd=ROOT, check=True, timeout=120)
            config = work / "reaper.ini"
            config.write_text(f"[reaper]\nvstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n")
            script = work / "probe.lua"
            script.write_text(f"""
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
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
  elseif command=='query' then
   result:write('done ' .. tostring(reaper.TrackFX_GetParamNormalized(track,fx,0)))
  elseif command=='preset' then
   local loaded=reaper.TrackFX_SetPreset(track,fx,'{preset}')
   result:write(loaded and 'done preset' or 'FAILED: preset load')
  else result:write('FAILED: unknown command') end
  result:close()
 end
 reaper.defer(poll)
end
reaper.defer(poll)
""")
            env = {**os.environ, "GDK_BACKEND": "x11"}
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
    finally:
        x11.close()


if __name__ == "__main__":
    main()
