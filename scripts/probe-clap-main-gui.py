#!/usr/bin/env python3
"""Mount the packaged Main CLAP editor in an isolated headless Xwayland host.

This never opens a window on the user's desktop or an audio device.
"""

import argparse
import ctypes as c
import importlib.util
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time

from Xlib import X, display as xdisplay
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("main_clap_probe", ROOT / "scripts/probe-clap-main.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class Window(c.Structure):
    _fields_ = [("api", c.c_char_p), ("x11", c.c_uint64)]


def headless_display(directory, weston):
    env = os.environ.copy()
    env.pop("DISPLAY", None)
    env.pop("WAYLAND_DISPLAY", None)
    env["XDG_RUNTIME_DIR"] = directory
    log = Path(directory) / "weston.log"
    process = subprocess.Popen([
        weston, "--backend=headless", "--xwayland", "--renderer=pixman",
        "--fake-seat", "--no-config", "--socket=manifold-headless", f"--log={log}",
    ], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and process.poll() is None:
        if log.exists():
            match = re.search(r"xserver listening on display (:\d+)", log.read_text())
            if match:
                return process, match.group(1)
        time.sleep(0.05)
    raise RuntimeError(f"Headless Xwayland failed: {log.read_text() if log.exists() else 'no log'}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", type=Path, default=ROOT / "target/clap/ManifoldFX.clap")
    parser.add_argument("--weston", default="weston")
    parser.add_argument("--session", type=Path, default=ROOT / "web/public/main-native-saved-session.json")
    parser.add_argument("--screenshot", type=Path, help="Capture the mounted editor from isolated Xwayland")
    args = parser.parse_args()
    module = args.module.resolve()
    with tempfile.TemporaryDirectory(prefix="manifold-headless-") as directory:
        os.chmod(directory, 0o700)
        weston = None
        plugin_ptr = None
        gui = None
        parent = None
        x11 = None
        try:
            weston, display_name = headless_display(directory, args.weston)
            os.environ["XDG_RUNTIME_DIR"] = directory
            os.environ["WAYLAND_DISPLAY"] = "manifold-headless"
            os.environ["DISPLAY"] = display_name
            os.environ["WEBKIT_DISABLE_DMABUF_RENDERER"] = "1"
            x11 = xdisplay.Display(display_name)
            screen = x11.screen()
            parent = screen.root.create_window(
                0, 0, 1280, 780, 0, screen.root_depth, X.InputOutput,
                X.CopyFromParent, background_pixel=screen.black_pixel)
            parent.map()
            x11.sync()

            library = c.CDLL(str(module))
            entry = probe.Entry.in_dll(library, "clap_entry")
            assert probe.fn(entry.init, c.c_bool, c.c_char_p)(str(module).encode())
            factory_ptr = probe.fn(entry.factory, c.c_void_p, c.c_char_p)(b"clap.plugin-factory")
            factory = c.cast(factory_ptr, c.POINTER(probe.Factory)).contents
            descriptor_ptr = probe.fn(factory.descriptor, c.c_void_p, c.c_void_p, c.c_uint32)(factory_ptr, 2)
            descriptor = c.cast(descriptor_ptr, c.POINTER(probe.Descriptor)).contents
            callbacks = [0]

            @c.CFUNCTYPE(None, c.c_void_p)
            def request_callback(_host):
                callbacks[0] += 1

            host = probe.Host(probe.Version(1, 2, 0), None, b"Headless Main GUI probe",
                              b"Shamanic Arts", b"", b"1", None, None, None,
                              c.cast(request_callback, c.c_void_p))
            create = probe.fn(factory.create, c.c_void_p, c.c_void_p, c.POINTER(probe.Host), c.c_char_p)
            plugin_ptr = create(factory_ptr, c.byref(host), descriptor.id)
            assert plugin_ptr
            plugin = c.cast(plugin_ptr, c.POINTER(probe.Plugin)).contents
            assert probe.fn(plugin.init, c.c_bool, c.c_void_p)(plugin_ptr)
            state_ptr = probe.fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                plugin_ptr, b"clap.state")
            assert state_ptr
            state = c.cast(state_ptr, c.POINTER(probe.State)).contents
            source, keep_read = probe.read_stream(args.session.read_bytes())
            assert probe.fn(state.load, c.c_bool, c.c_void_p, c.POINTER(probe.Stream))(
                plugin_ptr, c.byref(source))
            assert probe.fn(plugin.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(
                plugin_ptr, 48000., 1, 128)
            gui_ptr = probe.fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.gui")
            assert gui_ptr
            gui = c.cast(gui_ptr, c.POINTER(probe.Gui)).contents
            assert probe.fn(gui.create, c.c_bool, c.c_void_p, c.c_char_p, c.c_bool)(
                plugin_ptr, b"x11", False)
            window = Window(b"x11", parent.id)
            assert probe.fn(gui.parent, c.c_bool, c.c_void_p, c.POINTER(Window))(
                plugin_ptr, c.byref(window)), "Main child webview failed to mount"
            assert probe.fn(gui.show, c.c_bool, c.c_void_p)(plugin_ptr)
            handled = 0
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                if callbacks[0] > handled:
                    handled = callbacks[0]
                    probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                if callbacks[0] >= 2:
                    break
                time.sleep(0.05)
            assert callbacks[0] >= 2, "Main webview did not acknowledge the Rust presentation"
            if args.screenshot:
                time.sleep(0.5)
                args.screenshot.parent.mkdir(parents=True, exist_ok=True)
                for window in [parent, *parent.query_tree().children]:
                    geometry = window.get_geometry()
                    try:
                        pixels = window.get_image(0, 0, geometry.width, geometry.height, X.ZPixmap, 0xffffffff)
                    except Exception:
                        continue
                    if pixels and any(pixels.data):
                        image = Image.frombytes("RGB", (geometry.width, geometry.height), pixels.data, "raw", "BGRX")
                        image.save(args.screenshot.resolve())
                        break
                else:
                    raise RuntimeError("Xwayland editor was acknowledged but no rendered window pixels were available")
            print(f"Main CLAP child editor mounted in isolated Xwayland and applied Rust presentation; host callbacks={callbacks[0]}.")
        finally:
            if plugin_ptr:
                plugin = c.cast(plugin_ptr, c.POINTER(probe.Plugin)).contents
                if gui:
                    probe.fn(gui.destroy, None, c.c_void_p)(plugin_ptr)
                probe.fn(plugin.deactivate, None, c.c_void_p)(plugin_ptr)
                probe.fn(plugin.destroy, None, c.c_void_p)(plugin_ptr)
            if parent:
                parent.destroy()
            if x11:
                x11.close()
            if weston:
                os.killpg(weston.pid, signal.SIGTERM)
                try:
                    weston.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(weston.pid, signal.SIGKILL)
                    weston.wait()


if __name__ == "__main__":
    main()
