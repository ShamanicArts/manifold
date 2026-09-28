#!/usr/bin/env python3
"""Open the packaged original Main view in isolated REAPER/Weston."""

import ctypes as c
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "target/vst3/ManifoldFX.vst3"


def x11_windows() -> list[tuple[int, str, int, int]]:
    x = c.CDLL("libX11.so.6")
    x.XOpenDisplay.argtypes = [c.c_char_p]
    x.XOpenDisplay.restype = c.c_void_p
    display = x.XOpenDisplay(None)
    assert display
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
    x.XFree.argtypes = [c.c_void_p]
    x.XCloseDisplay.argtypes = [c.c_void_p]
    root = x.XRootWindow(display, x.XDefaultScreen(display))
    _, parent, children, count = c.c_ulong(), c.c_ulong(), c.POINTER(c.c_ulong)(), c.c_uint()
    root_out = c.c_ulong()
    assert x.XQueryTree(display, root, c.byref(root_out), c.byref(parent),
                        c.byref(children), c.byref(count))
    result = []
    for index in range(count.value):
        window = children[index]
        name = c.c_char_p()
        if not x.XFetchName(display, window, c.byref(name)) or not name.value:
            continue
        root_geom, px, py = c.c_ulong(), c.c_int(), c.c_int()
        width, height, border, depth = c.c_uint(), c.c_uint(), c.c_uint(), c.c_uint()
        if x.XGetGeometry(display, window, c.byref(root_geom), c.byref(px), c.byref(py),
                          c.byref(width), c.byref(height), c.byref(border), c.byref(depth)):
            result.append((window, name.value.decode(errors="replace"),
                           width.value, height.value))
        x.XFree(name)
    x.XFree(children)
    x.XCloseDisplay(display)
    return result


def main() -> None:
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") not in (None, ":0")
    assert os.environ.get("WAYLAND_DISPLAY")
    assert BUNDLE.is_dir()
    with tempfile.TemporaryDirectory(prefix="manifold-main-vst3-gui-") as directory:
        work = Path(directory)
        config = work / "reaper.ini"
        config.write_text(f"[reaper]\nvstpath={BUNDLE.parent}\nvstpath64={BUNDLE.parent}\n")
        script = work / "open.lua"
        script.write_text(f"""
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Main',false,-1)
local out=io.open('{work}/ready.txt','w')
if fx<0 then out:write('FAILED: Main unavailable'); out:close(); return end
reaper.TrackFX_Show(track,fx,3)
out:write('done opened Main'); out:close()
""")
        env = {**os.environ, "GDK_BACKEND": "x11",
               "PULSE_SERVER": "unix:/nonexistent", "PIPEWIRE_REMOTE": "manifold-disconnected"}
        with (work / "reaper.log").open("w") as log:
            process = subprocess.Popen(
                ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash",
                 "-noactivate", str(script)], env=env,
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
            )
            try:
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    report = work / "ready.txt"
                    if report.exists():
                        result = report.read_text()
                        assert "FAILED" not in result, result
                        if "done" in result:
                            break
                    time.sleep(0.1)
                else:
                    raise TimeoutError((work / "reaper.log").read_text()[-2000:])
                deadline = time.monotonic() + 20
                editor = None
                while time.monotonic() < deadline:
                    children = subprocess.check_output(["ps", "--ppid", str(process.pid),
                                                        "-o", "pid=,args="], text=True)
                    editor = next((line.strip() for line in children.splitlines()
                                   if "ManifoldFX-editor" in line), None)
                    if editor:
                        break
                    time.sleep(0.1)
                assert editor, (work / "reaper.log").read_text()[-2500:]
                time.sleep(2)
                assert process.poll() is None, "REAPER closed before screenshot"
                print(f"X11 windows: {x11_windows()}")
                target = ROOT / "web/public/main-vst3-reaper-editor.png"
                parent = int(editor.split()[2])
                capture = subprocess.run(
                    ["ffmpeg", "-v", "error", "-f", "x11grab", "-window_id", str(parent),
                     "-video_size", "1280x780", "-i", os.environ["DISPLAY"],
                     "-frames:v", "1", "-y", str(target)],
                    env=env, capture_output=True, text=True, timeout=15,
                )
                if capture.returncode != 0:
                    raise AssertionError(f"X11 capture failed: {capture.stderr}")
                print(f"Main editor child: {editor}\nScreenshot: {target}\n")
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)


if __name__ == "__main__":
    main()
