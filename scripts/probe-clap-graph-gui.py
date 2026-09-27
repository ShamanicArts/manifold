#!/usr/bin/env python3
"""Exercise the actual Graph CLAP widget child under isolated Xwayland."""

import ctypes as c
import json
import os
from pathlib import Path
import runpy
import subprocess
import time


def main():
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1", "use a disposable X display"
    assert os.environ.get("DISPLAY"), "missing X display"
    types = runpy.run_path(str(Path(__file__).with_name("probe-clap-gui.py")))
    Version, Entry, Factory, Host, Plugin, Window, Gui, State = (
        types[name] for name in ("Version", "Entry", "Factory", "Host", "Plugin", "Window", "Gui", "State"))
    fn = types["fn"]
    module = Path("target/clap/ManifoldFX.clap").resolve()
    import_path = Path("projects/graph-workspace/tone-texture.json").resolve()
    x11 = c.CDLL("libX11.so.6")
    x11.XOpenDisplay.argtypes = [c.c_char_p]
    x11.XOpenDisplay.restype = c.c_void_p
    display = x11.XOpenDisplay(None)
    assert display, "Xwayland unavailable"
    x11.XDefaultScreen.argtypes = [c.c_void_p]
    x11.XDefaultScreen.restype = c.c_int
    x11.XRootWindow.argtypes = [c.c_void_p, c.c_int]
    x11.XRootWindow.restype = c.c_ulong
    x11.XCreateSimpleWindow.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_int,
                                       c.c_uint, c.c_uint, c.c_uint, c.c_ulong, c.c_ulong]
    x11.XCreateSimpleWindow.restype = c.c_ulong
    xid = x11.XCreateSimpleWindow(display, x11.XRootWindow(display, 0),
                                  20, 20, 800, 600, 0, 0, 0x121a2f)
    x11.XMapWindow.argtypes = [c.c_void_p, c.c_ulong]
    x11.XMapWindow(display, xid)
    x11.XFlush.argtypes = [c.c_void_p]
    x11.XFlush(display)
    library = c.CDLL(str(module))
    entry = Entry.in_dll(library, "clap_entry")
    assert fn(entry.init, c.c_bool, c.c_char_p)(str(module).encode())
    factory_ptr = fn(entry.get_factory, c.c_void_p, c.c_char_p)(b"clap.plugin-factory")
    factory = c.cast(factory_ptr, c.POINTER(Factory)).contents
    callbacks = 0

    @c.CFUNCTYPE(None, c.c_void_p)
    def request_callback(_host):
        nonlocal callbacks
        callbacks += 1

    host = Host(Version(1, 2, 0), None, b"Graph GUI probe", b"Manifold", b"", b"1",
                None, None, None, c.cast(request_callback, c.c_void_p))
    plugin_ptr = fn(factory.create, c.c_void_p, c.c_void_p, c.POINTER(Host), c.c_char_p)(
        factory_ptr, c.byref(host), b"arts.shamanic.manifold.graph")
    assert plugin_ptr
    plugin = c.cast(plugin_ptr, c.POINTER(Plugin)).contents
    os.environ["MANIFOLD_GRAPH_IMPORT_PROBE"] = str(import_path)
    try:
        assert fn(plugin.init, c.c_bool, c.c_void_p)(plugin_ptr)
        gui_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.gui")
        assert gui_ptr
        gui = c.cast(gui_ptr, c.POINTER(Gui)).contents
        assert fn(gui.supported, c.c_bool, c.c_void_p, c.c_char_p, c.c_bool)(plugin_ptr, b"x11", False)
        assert fn(gui.create, c.c_bool, c.c_void_p, c.c_char_p, c.c_bool)(plugin_ptr, b"x11", False)
        width, height = c.c_uint32(), c.c_uint32()
        assert fn(gui.size, c.c_bool, c.c_void_p, c.POINTER(c.c_uint32), c.POINTER(c.c_uint32))(
            plugin_ptr, c.byref(width), c.byref(height))
        assert (width.value, height.value) == (800, 600)
        window = Window(b"x11", xid)
        assert fn(gui.parent, c.c_bool, c.c_void_p, c.POINTER(Window))(plugin_ptr, c.byref(window))
        assert fn(gui.show, c.c_bool, c.c_void_p)(plugin_ptr)
        state_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.state")
        state = c.cast(state_ptr, c.POINTER(State)).contents
        data = bytearray()

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def write(_stream, source, count):
            data.extend(c.string_at(source, count))
            return count

        class OutputStream(c.Structure):
            _fields_ = [("ctx", c.c_void_p), ("write", c.c_void_p)]
        stream = OutputStream(None, c.cast(write, c.c_void_p))
        target = json.loads(import_path.read_text())
        imported = False
        for _ in range(100):
            fn(plugin.main, None, c.c_void_p)(plugin_ptr)
            data.clear()
            assert fn(state.save, c.c_bool, c.c_void_p, c.c_void_p)(plugin_ptr, c.byref(stream))
            document = json.loads(data)
            if len(document["signal"]["nodes"]) == len(target["signal"]["nodes"]):
                imported = True
                break
            time.sleep(0.1)
        assert imported, "editor file input did not import Tone Texture"
        graph_types = runpy.run_path(str(Path(__file__).with_name("probe-clap-graph.py")))
        AudioBuffer, Process = graph_types["AudioBuffer"], graph_types["Process"]
        assert fn(plugin.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(
            plugin_ptr, 48000., 1, 128)
        assert fn(plugin.start, c.c_bool, c.c_void_p)(plugin_ptr)
        left, right = (c.c_float * 128)(), (c.c_float * 128)()
        channels = (c.POINTER(c.c_float) * 2)(left, right)
        output_bus = AudioBuffer(channels, None, 2, 0, 0)
        block = Process(0, 128, None, None, c.pointer(output_bus), 0, 1, None, None)
        assert fn(plugin.process, c.c_int32, c.c_void_p, c.POINTER(Process))(
            plugin_ptr, c.byref(block)) == 1
        audio_peak = max(abs(value) for channel in (left, right) for value in channel)
        assert 0.00001 < audio_peak < 10, audio_peak
        time.sleep(0.6)
        fn(plugin.main, None, c.c_void_p)(plugin_ptr)
        x11.XQueryTree.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong),
                                   c.POINTER(c.c_ulong), c.POINTER(c.POINTER(c.c_ulong)), c.POINTER(c.c_uint)]
        x11.XQueryTree.restype = c.c_int
        x11.XFree.argtypes = [c.c_void_p]
        root, parent, children, count = c.c_ulong(), c.c_ulong(), c.POINTER(c.c_ulong)(), c.c_uint()
        assert x11.XQueryTree(display, xid, c.byref(root), c.byref(parent), c.byref(children), c.byref(count))
        assert count.value > 0, "editor child window missing"
        child = children[0]
        x11.XFree(children)
        output = Path("web/public/graph-clap-original-editor.png")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab", "-window_id", hex(child),
                        "-i", os.environ["DISPLAY"], "-frames:v", "1", "-y", str(output)],
                       check=True, timeout=20)
        assert output.stat().st_size > 10000
        EventHeader, ParamValue, InputEvents, PluginParams = (
            types[name] for name in ("EventHeader", "ParamValue", "InputEvents", "PluginParams"))
        params_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.params")
        params = c.cast(params_ptr, c.POINTER(PluginParams)).contents
        event = ParamValue(EventHeader(c.sizeof(ParamValue), 0, 0, 5, 0),
                           0x0100_0001, None, -1, -1, -1, -1, 0.9)

        @c.CFUNCTYPE(c.c_uint32, c.c_void_p)
        def input_count(_events):
            return 1

        @c.CFUNCTYPE(c.c_void_p, c.c_void_p, c.c_uint32)
        def input_get(_events, index):
            return c.addressof(event) if index == 0 else None

        events = InputEvents(None, c.cast(input_count, c.c_void_p), c.cast(input_get, c.c_void_p))
        fn(params.flush, None, c.c_void_p, c.POINTER(InputEvents), c.c_void_p)(
            plugin_ptr, c.byref(events), None)
        current = c.c_double()
        assert fn(params.get_value, c.c_bool, c.c_void_p, c.c_uint32, c.POINTER(c.c_double))(
            plugin_ptr, 0x0100_0001, c.byref(current))
        assert abs(current.value - 0.9) < 1e-6
        for _ in range(8):
            fn(plugin.main, None, c.c_void_p)(plugin_ptr)
            time.sleep(0.08)
        automated = Path("web/public/graph-clap-host-automation.png")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab", "-window_id", hex(child),
                        "-i", os.environ["DISPLAY"], "-frames:v", "1", "-y", str(automated)],
                       check=True, timeout=20)
        assert automated.stat().st_size > 10000
        assert automated.read_bytes() != output.read_bytes(), "editor did not repaint host value"
        print(json.dumps({"editor_size": [width.value, height.value],
                          "imported_nodes": len(document["signal"]["nodes"]),
                          "imported_controls": len(document["signal"]["initialParameters"]),
                          "automated_slot": 0x0100_0001, "automated_value": current.value,
                          "imported_audio_peak": audio_peak,
                          "callbacks": callbacks, "screenshots": [str(output), str(automated)]}))
        assert fn(gui.hide, c.c_bool, c.c_void_p)(plugin_ptr)
        assert fn(gui.show, c.c_bool, c.c_void_p)(plugin_ptr)
        fn(gui.destroy, None, c.c_void_p)(plugin_ptr)
    finally:
        if 'audio_peak' in locals():
            fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
            fn(plugin.deactivate, None, c.c_void_p)(plugin_ptr)
        fn(plugin.destroy, None, c.c_void_p)(plugin_ptr)
        fn(entry.deinit, None)()
        x11.XDestroyWindow.argtypes = [c.c_void_p, c.c_ulong]
        x11.XDestroyWindow(display, xid)
        x11.XCloseDisplay.argtypes = [c.c_void_p]
        x11.XCloseDisplay(display)


if __name__ == "__main__":
    main()
