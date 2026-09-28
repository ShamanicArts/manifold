#!/usr/bin/env python3
"""Mount the packaged Main CLAP editor in an isolated headless Xwayland host.

This never opens a window on the user's desktop or an audio device.
"""

import argparse
import base64
import ctypes as c
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import struct
import subprocess
import tempfile
import time

from Xlib import X, display as xdisplay
from Xlib.ext import xtest
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
        "--width=1280", "--height=780",
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
    parser.add_argument("--exercise-live", action="store_true", help="Record First Loop through in-memory host blocks")
    parser.add_argument("--exercise-sample", action="store_true", help="Click the original Source Cap and capture native Retro Live audio")
    parser.add_argument("--exercise-free-sample", action="store_true", help="Use the original Free/STOP Source controls on native host input")
    parser.add_argument("--import-session", type=Path, help="Choose this Main JSON through the original embedded Open session input")
    parser.add_argument("--import-while-processing", action="store_true", help="Keep native host blocks running during the file import")
    parser.add_argument("--exercise-export", action="store_true", help="Click the original Download control and save native Main JSON")
    parser.add_argument("--exercise-layout", action="store_true", help="Toggle Main Rack/Patch through the actual child editor and save host state")
    parser.add_argument("--exercise-drag", action="store_true", help="Drag Source onto Filter in the actual child editor and save host state")
    parser.add_argument("--exercise-width", action="store_true", help="Click Filter compact width in the actual child editor and save host state")
    args = parser.parse_args()
    assert not (args.exercise_sample and args.exercise_free_sample)
    assert not args.exercise_drag or args.exercise_layout
    assert not args.exercise_width or args.exercise_drag
    assert not args.import_while_processing or args.import_session
    assert not (args.import_while_processing and (args.exercise_sample or args.exercise_free_sample))
    sample_exercise = args.exercise_sample or args.exercise_free_sample
    module = args.module.resolve()
    with tempfile.TemporaryDirectory(prefix="manifold-headless-") as directory:
        os.chmod(directory, 0o700)
        os.environ["PULSE_SERVER"] = "unix:/tmp/manifold-main-gui-probe-no-audio"
        weston = None
        plugin_ptr = None
        gui = None
        parent = None
        x11 = None
        try:
            weston, display_name = headless_display(directory, args.weston)
            sample_probe = Path(directory) / "main-sample-request"
            if sample_exercise:
                os.environ["MANIFOLD_MAIN_SAMPLE_PROBE"] = str(sample_probe)
            if args.import_session:
                import_probe = Path(directory) / "main-import.json"
                import_probe.write_bytes(args.import_session.read_bytes())
                os.environ["MANIFOLD_MAIN_IMPORT_PROBE"] = str(import_probe)
            if args.exercise_export:
                export_probe = Path(directory) / "main-export.json"
                os.environ["MANIFOLD_MAIN_EXPORT_PROBE"] = str(export_probe)
            if args.exercise_layout:
                layout_probe = Path(directory) / "main-layout-request"
                os.environ["MANIFOLD_MAIN_LAYOUT_PROBE"] = str(layout_probe)
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
            if sample_exercise:
                assert probe.fn(plugin.start, c.c_bool, c.c_void_p)(plugin_ptr)
            if args.import_while_processing:
                assert probe.fn(plugin.start, c.c_bool, c.c_void_p)(plugin_ptr)
            if args.exercise_sample:
                for _ in range(800):
                    probe.render(plugin_ptr, plugin, input_value=0.4)
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
            if args.exercise_layout:
                time.sleep(0.5)  # Let the initial native presentation finish in the child.
                layout_probe.write_text("toggle")
                result_path = Path(f"{layout_probe}.result")
                result = None
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if callbacks[0] > handled:
                        handled = callbacks[0]
                        probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                    if result_path.exists():
                        try:
                            result = json.loads(result_path.read_text())
                            break
                        except json.JSONDecodeError:
                            pass
                    time.sleep(0.02)
                assert result and result["ok"], f"Main Rack/Patch editor gesture failed: {result}"
                saved_layout = bytearray()

                @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
                def write_layout_state(_stream, data, size):
                    saved_layout.extend(c.string_at(data, size))
                    return size

                sink = probe.Stream(None, c.cast(write_layout_state, c.c_void_p))
                assert probe.fn(state.save, c.c_bool, c.c_void_p, c.POINTER(probe.Stream))(
                    plugin_ptr, c.byref(sink))
                saved_document = json.loads(saved_layout)["rackDocument"]
                original_document = json.loads(args.session.read_bytes())["rackDocument"]
                assert saved_document["viewMode"] != original_document["viewMode"]
                assert saved_document["modules"] == original_document["modules"]
                assert saved_document["connections"] == original_document["connections"]
                print("Actual child Main Rack/Patch button updated packaged CLAP session state.")
                if args.exercise_drag:
                    # Coordinates are inside the fixed-size 1280x780 Main child.
                    # XTEST sends real pointer events to isolated Xwayland;
                    # JavaScript in the webview does not synthesize the gesture.
                    result_path.unlink()
                    root_id = screen.root.id
                    origin = parent.translate_coords(screen.root, 0, 0)
                    ox, oy = origin.x, origin.y
                    for _ in range(10):
                        xtest.fake_input(x11, X.MotionNotify, root=root_id, x=900 - ox, y=288 - oy)
                        x11.sync()
                        time.sleep(0.05)
                        pointer = screen.root.query_pointer()
                        if (pointer.root_x, pointer.root_y) == (900 - ox, 288 - oy):
                            break
                    assert (pointer.root_x, pointer.root_y) == (900 - ox, 288 - oy), (
                        f"Xwayland pointer did not reach Main header: {pointer.root_x},{pointer.root_y}")
                    xtest.fake_input(x11, X.ButtonPress, 1, root=root_id, x=900 - ox, y=288 - oy)
                    x11.sync()
                    for step in range(1, 11):
                        xtest.fake_input(x11, X.MotionNotify, root=root_id, x=900 - 45 * step - ox, y=288 - oy)
                        x11.sync()
                        time.sleep(0.03)
                    xtest.fake_input(x11, X.ButtonRelease, 1, root=root_id, x=450 - ox, y=288 - oy)
                    x11.sync()
                    result = None
                    deadline = time.monotonic() + 15
                    while time.monotonic() < deadline:
                        if callbacks[0] > handled:
                            handled = callbacks[0]
                            probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                        if result_path.exists():
                            try:
                                result = json.loads(result_path.read_text())
                                break
                            except json.JSONDecodeError:
                                pass
                        time.sleep(0.02)
                    assert result and result["ok"], f"Main child header drag failed: {result}"
                    saved_layout.clear()
                    assert probe.fn(state.save, c.c_bool, c.c_void_p, c.POINTER(probe.Stream))(
                        plugin_ptr, c.byref(sink))
                    dragged = json.loads(saved_layout)["rackDocument"]
                    before = {item["id"]: item for item in original_document["modules"]}
                    after = {item["id"]: item for item in dragged["modules"]}
                    assert after["oscillator"]["col"] == before["filter"]["col"]
                    assert after["filter"]["col"] == before["oscillator"]["col"]
                    assert dragged["connections"] == original_document["connections"]
                    assert dragged["viewMode"] == saved_document["viewMode"]
                    print("Actual child Source header drag swapped saved Source/Filter cells in packaged CLAP state.")
                    if args.exercise_width:
                        result_path.unlink()
                        xtest.fake_input(x11, X.MotionNotify, root=root_id, x=1168 - ox, y=288 - oy)
                        x11.sync()
                        time.sleep(.08)
                        xtest.fake_input(x11, X.ButtonPress, 1, root=root_id)
                        x11.sync()
                        xtest.fake_input(x11, X.ButtonRelease, 1, root=root_id)
                        x11.sync()
                        result = None
                        deadline = time.monotonic() + 15
                        while time.monotonic() < deadline:
                            if callbacks[0] > handled:
                                handled = callbacks[0]
                                probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                            if result_path.exists():
                                try:
                                    result = json.loads(result_path.read_text())
                                    break
                                except json.JSONDecodeError:
                                    pass
                            time.sleep(0.02)
                        assert result and result["ok"], f"Main child Filter width click failed: {result}"
                        saved_layout.clear()
                        assert probe.fn(state.save, c.c_bool, c.c_void_p, c.POINTER(probe.Stream))(
                            plugin_ptr, c.byref(sink))
                        compact = json.loads(saved_layout)["rackDocument"]
                        compact_filter = next(item for item in compact["modules"] if item["id"] == "filter")
                        assert compact_filter["w"] == 1 and compact_filter["h"] == 1
                        assert compact["connections"] == dragged["connections"]
                        print("Actual child Filter width click saved its compact face in packaged CLAP state.")
            if args.exercise_export:
                deadline = time.monotonic() + 15
                exported = None
                while time.monotonic() < deadline:
                    if callbacks[0] > handled:
                        handled = callbacks[0]
                        probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                    if export_probe.exists():
                        try:
                            exported = json.loads(export_probe.read_bytes())
                            break
                        except json.JSONDecodeError:
                            pass
                    time.sleep(0.02)
                assert exported, "Original Download Main session did not write complete JSON"
                expected = json.loads(args.session.read_bytes())
                assert [layer["pcmF32Base64"] for layer in exported["layers"]] == [
                    layer["pcmF32Base64"] for layer in expected["layers"]]
                assert exported["sample"]["pcmF32Base64"] == expected["sample"]["pcmF32Base64"]
                print(f"Original Download Main session wrote {export_probe.stat().st_size} native JSON bytes.")
            if args.import_session:
                result_path = Path(f"{import_probe}.result")
                result = None
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    if args.import_while_processing:
                        probe.render(plugin_ptr, plugin, input_value=0.0)
                    if callbacks[0] > handled:
                        handled = callbacks[0]
                        probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                    if result_path.exists():
                        try:
                            result = json.loads(result_path.read_text())
                            break
                        except json.JSONDecodeError:
                            pass
                    time.sleep(0.02)
                assert result and result["ok"], f"Original Open session input failed: {result}"
                if args.import_while_processing:
                    for _ in range(4):
                        probe.render(plugin_ptr, plugin, input_value=0.0)
                    probe.fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
                saved_import = bytearray()

                @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
                def write_import_state(_stream, data, size):
                    saved_import.extend(c.string_at(data, size))
                    return size

                sink = probe.Stream(None, c.cast(write_import_state, c.c_void_p))
                assert probe.fn(state.save, c.c_bool, c.c_void_p, c.POINTER(probe.Stream))(
                    plugin_ptr, c.byref(sink))
                expected = json.loads(args.import_session.read_bytes())
                actual = json.loads(saved_import)
                assert [layer["frames"] for layer in actual["layers"]] == [
                    layer["frames"] for layer in expected["layers"]]
                assert actual["sample"]["frames"] == expected["sample"]["frames"]
                assert [layer["pcmF32Base64"] for layer in actual["layers"]] == [
                    layer["pcmF32Base64"] for layer in expected["layers"]]
                assert actual["sample"]["pcmF32Base64"] == expected["sample"]["pcmF32Base64"]
                print("Original Open session input imported Main JSON into native CLAP state.")
            if sample_exercise:
                status_path = Path(f"{sample_probe}.status")
                def wait_sample_phase(target, input_value):
                    nonlocal handled
                    observed = None
                    deadline = time.monotonic() + 15
                    while time.monotonic() < deadline:
                        probe.render(plugin_ptr, plugin, input_value=input_value)
                        if callbacks[0] > handled:
                            handled = callbacks[0]
                            probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                        if status_path.exists():
                            try:
                                observed = json.loads(status_path.read_text())
                            except json.JSONDecodeError:
                                pass  # the editor may be writing the next status
                            if observed and observed.get("phase") in (target, "rejected"):
                                return observed
                        time.sleep(0.002)
                    return observed

                if args.exercise_free_sample:
                    sample_probe.write_text("free:start")
                    started = wait_sample_phase("free-started", 0.4)
                    assert started and started.get("phase") == "free-started", (
                        f"Source Free did not arm: {started}")
                    for _ in range(30):
                        probe.render(plugin_ptr, plugin, input_value=0.7)
                    sample_probe.write_text("free:stop")
                    sample_status = wait_sample_phase("published", 0.7)
                else:
                    sample_probe.write_text("retro")
                    sample_status = wait_sample_phase("published", 0.4)
                assert sample_status and sample_status.get("phase") == "published", (
                    f"Source Cap did not publish a native Sample: {sample_status}")
                probe.fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
                saved = bytearray()

                @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
                def write_sample_state(_stream, data, size):
                    saved.extend(c.string_at(data, size))
                    return size

                sink = probe.Stream(None, c.cast(write_sample_state, c.c_void_p))
                assert probe.fn(state.save, c.c_bool, c.c_void_p, c.POINTER(probe.Stream))(
                    plugin_ptr, c.byref(sink))
                document = json.loads(saved)
                frames = document["sample"]["frames"]
                if args.exercise_sample:
                    assert frames == 96000, f"Source Cap saved {frames} frames, expected one bar"
                else:
                    assert 30 * 128 <= frames < 48000, f"Source Free saved {frames} frames"
                assert document["sample"]["pcmF32Base64"], "Source Cap saved no PCM"
                pcm = base64.b64decode(document["sample"]["pcmF32Base64"])
                peak = max(abs(sample[0]) for sample in struct.iter_unpack("<f", pcm))
                assert peak > (0.65 if args.exercise_free_sample else 0.35)
                settle = time.monotonic() + 0.7
                while time.monotonic() < settle:
                    if callbacks[0] > handled:
                        handled = callbacks[0]
                        probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                    time.sleep(0.02)
                mode = "Free/STOP" if args.exercise_free_sample else "Retro Cap"
                print(f"Original Source {mode} published and saved {frames} native frames.")
            if args.exercise_live:
                assert probe.fn(plugin.start, c.c_bool, c.c_void_p)(plugin_ptr)
                command_ptr = probe.fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                    plugin_ptr, b"shamanic.manifold.main.commands/1")
                assert command_ptr
                commands = c.cast(command_ptr, c.POINTER(probe.Commands)).contents
                enqueue = probe.fn(commands.enqueue, c.c_bool, c.c_void_p, c.c_uint32, c.c_float)
                assert enqueue(plugin_ptr, 0, 0.0)
                for _ in range(16):
                    probe.render(plugin_ptr, plugin, input_value=0.7)
                assert enqueue(plugin_ptr, 1, 0.0)
                for _ in range(45):
                    probe.render(plugin_ptr, plugin, input_value=0.15)
                probe.fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
                saved = bytearray()

                @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
                def write_state(_stream, data, size):
                    saved.extend(c.string_at(data, size))
                    return size

                sink = probe.Stream(None, c.cast(write_state, c.c_void_p))
                assert probe.fn(state.save, c.c_bool, c.c_void_p, c.POINTER(probe.Stream))(
                    plugin_ptr, c.byref(sink))
                assert json.loads(saved)["layers"][0]["frames"] > 0, "First Loop host take did not commit"
                settle = time.monotonic() + 0.6
                while time.monotonic() < settle:
                    if callbacks[0] > handled:
                        handled = callbacks[0]
                        probe.fn(plugin.main, None, c.c_void_p)(plugin_ptr)
                    time.sleep(0.05)
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
