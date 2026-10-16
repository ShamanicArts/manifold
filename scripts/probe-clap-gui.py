#!/usr/bin/env python3
"""Exercise the packaged CLAP GUI under an isolated X11 display.

Run through `weston --backend=headless --renderer=pixman --xwayland -- ...`.
No window is opened on the user's desktop.
"""

import ctypes as c
import json
import os
from pathlib import Path
import subprocess
import sys
import time


class Version(c.Structure):
    _fields_ = [("major", c.c_uint32), ("minor", c.c_uint32), ("revision", c.c_uint32)]


class Entry(c.Structure):
    _fields_ = [("version", Version), ("init", c.c_void_p), ("deinit", c.c_void_p), ("get_factory", c.c_void_p)]


class Factory(c.Structure):
    _fields_ = [("count", c.c_void_p), ("descriptor", c.c_void_p), ("create", c.c_void_p)]


class Host(c.Structure):
    _fields_ = [("version", Version), ("data", c.c_void_p), ("name", c.c_char_p),
                ("vendor", c.c_char_p), ("url", c.c_char_p), ("host_version", c.c_char_p),
                ("get_extension", c.c_void_p), ("restart", c.c_void_p),
                ("process", c.c_void_p), ("callback", c.c_void_p)]


class Plugin(c.Structure):
    _fields_ = [("descriptor", c.c_void_p), ("data", c.c_void_p), ("init", c.c_void_p),
                ("destroy", c.c_void_p), ("activate", c.c_void_p), ("deactivate", c.c_void_p),
                ("start", c.c_void_p), ("stop", c.c_void_p), ("reset", c.c_void_p),
                ("process", c.c_void_p), ("get_extension", c.c_void_p), ("main", c.c_void_p)]


class Window(c.Structure):
    _fields_ = [("api", c.c_char_p), ("xid", c.c_ulong)]


class Gui(c.Structure):
    _fields_ = [(name, c.c_void_p) for name in (
        "supported", "preferred", "create", "destroy", "scale", "size", "can_resize",
        "hints", "adjust", "set_size", "parent", "transient", "title", "show", "hide")]


class HostParams(c.Structure):
    _fields_ = [("rescan", c.c_void_p), ("clear", c.c_void_p), ("request_flush", c.c_void_p)]


class PluginParams(c.Structure):
    _fields_ = [(name, c.c_void_p) for name in (
        "count", "info", "get_value", "to_text", "from_text", "flush")]


class EventHeader(c.Structure):
    _fields_ = [("size", c.c_uint32), ("time", c.c_uint32), ("space", c.c_uint16),
                ("type", c.c_uint16), ("flags", c.c_uint32)]


class OutputEvents(c.Structure):
    _fields_ = [("ctx", c.c_void_p), ("push", c.c_void_p)]


class InputEvents(c.Structure):
    _fields_ = [("ctx", c.c_void_p), ("count", c.c_void_p), ("get", c.c_void_p)]


class ParamValue(c.Structure):
    _fields_ = [("header", EventHeader), ("param_id", c.c_uint32), ("cookie", c.c_void_p),
                ("note_id", c.c_int32), ("port", c.c_int16), ("channel", c.c_int16),
                ("key", c.c_int16), ("value", c.c_double)]


class State(c.Structure):
    _fields_ = [("save", c.c_void_p), ("load", c.c_void_p)]


class InputStream(c.Structure):
    _fields_ = [("ctx", c.c_void_p), ("read", c.c_void_p)]


def fn(pointer, result, *args):
    assert pointer, "missing CLAP callback"
    return c.CFUNCTYPE(result, *args)(pointer)


def main():
    assert os.environ.get("DISPLAY"), "run inside a disposable X11 display"
    module = Path(sys.argv[1] if len(sys.argv) > 1 else "target/clap/ManifoldFX.clap").resolve()
    x11 = c.CDLL("libX11.so.6")
    x11.XOpenDisplay.argtypes = [c.c_char_p]
    x11.XOpenDisplay.restype = c.c_void_p
    display = x11.XOpenDisplay(None)
    assert display, "X11 display unavailable"
    x11.XDefaultScreen.argtypes = [c.c_void_p]
    x11.XDefaultScreen.restype = c.c_int
    x11.XRootWindow.argtypes = [c.c_void_p, c.c_int]
    x11.XRootWindow.restype = c.c_ulong
    x11.XCreateSimpleWindow.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_int,
                                       c.c_uint, c.c_uint, c.c_uint, c.c_ulong, c.c_ulong]
    x11.XCreateSimpleWindow.restype = c.c_ulong
    root = x11.XRootWindow(display, x11.XDefaultScreen(display))
    xid = x11.XCreateSimpleWindow(display, root, 24, 24, 500, 246, 0, 0, 0x2b2b2b)
    assert xid
    x11.XMapWindow.argtypes = [c.c_void_p, c.c_ulong]
    x11.XFlush.argtypes = [c.c_void_p]
    x11.XMapWindow(display, xid)
    x11.XFlush(display)

    library = c.CDLL(str(module))
    entry = Entry.in_dll(library, "clap_entry")
    assert fn(entry.init, c.c_bool, c.c_char_p)(str(module).encode())
    factory_ptr = fn(entry.get_factory, c.c_void_p, c.c_char_p)(b"clap.plugin-factory")
    factory = c.cast(factory_ptr, c.POINTER(Factory)).contents
    callback_count = 0
    flush_count = 0

    @c.CFUNCTYPE(None, c.c_void_p)
    def request_flush(_host):
        nonlocal flush_count
        flush_count += 1

    host_params = HostParams(None, None, c.cast(request_flush, c.c_void_p))

    @c.CFUNCTYPE(c.c_void_p, c.c_void_p, c.c_char_p)
    def get_extension(_host, extension_id):
        return c.addressof(host_params) if extension_id == b"clap.params" else None

    @c.CFUNCTYPE(None, c.c_void_p)
    def request_callback(_host):
        nonlocal callback_count
        callback_count += 1

    host = Host(Version(1, 2, 0), None, b"Manifold GUI probe", b"Shamanic Arts",
                b"", b"0.1", c.cast(get_extension, c.c_void_p), None, None,
                c.cast(request_callback, c.c_void_p))
    plugin_ptr = fn(factory.create, c.c_void_p, c.c_void_p, c.POINTER(Host), c.c_char_p)(
        factory_ptr, c.byref(host), b"arts.shamanic.manifold.standalone-fx")
    assert plugin_ptr, "CLAP factory refused instance"
    plugin = c.cast(plugin_ptr, c.POINTER(Plugin)).contents
    try:
        assert fn(plugin.init, c.c_bool, c.c_void_p)(plugin_ptr)
        document = json.loads(Path("projects/standalone-fx-module/project.json").read_text())
        values = [7, 0.72, 0.8, 0.3, 0.4, 0.5, 0.6]
        document["signal"]["initialParameters"] = [
            {"nodeId": 2, "id": index, "value": value}
            for index, value in enumerate(values)
        ]
        document["typeParameters"] = {str(index): [0.5, 0.5, 0.2, 0.6, 0.4]
                                      for index in range(21)}
        document["typeParameters"]["7"] = values[2:]
        encoded = json.dumps(document).encode()
        offset = 0

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def read_state(_stream, target, capacity):
            nonlocal offset
            count = min(capacity, len(encoded) - offset)
            if count:
                c.memmove(target, encoded[offset:offset + count], count)
            offset += count
            return count

        state_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.state")
        state = c.cast(state_ptr, c.POINTER(State)).contents
        stream = InputStream(None, c.cast(read_state, c.c_void_p))
        assert fn(state.load, c.c_bool, c.c_void_p, c.POINTER(InputStream))(plugin_ptr, c.byref(stream))
        gui_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.gui")
        assert gui_ptr, "CLAP GUI extension missing"
        gui = c.cast(gui_ptr, c.POINTER(Gui)).contents
        assert fn(gui.supported, c.c_bool, c.c_void_p, c.c_char_p, c.c_bool)(plugin_ptr, b"x11", False)
        assert fn(gui.create, c.c_bool, c.c_void_p, c.c_char_p, c.c_bool)(plugin_ptr, b"x11", False)
        width, height = c.c_uint32(), c.c_uint32()
        assert fn(gui.size, c.c_bool, c.c_void_p, c.POINTER(c.c_uint32), c.POINTER(c.c_uint32))(
            plugin_ptr, c.byref(width), c.byref(height))
        assert (width.value, height.value) == (500, 246)
        window = Window(b"x11", xid)
        assert fn(gui.parent, c.c_bool, c.c_void_p, c.POINTER(Window))(plugin_ptr, c.byref(window))
        assert fn(gui.show, c.c_bool, c.c_void_p)(plugin_ptr)
        time.sleep(3)
        x11.XQueryTree.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong),
                                   c.POINTER(c.c_ulong), c.POINTER(c.POINTER(c.c_ulong)),
                                   c.POINTER(c.c_uint)]
        x11.XQueryTree.restype = c.c_int
        x11.XFree.argtypes = [c.c_void_p]
        top, parent, children, count = c.c_ulong(), c.c_ulong(), c.POINTER(c.c_ulong)(), c.c_uint()
        assert x11.XQueryTree(display, xid, c.byref(top), c.byref(parent),
                              c.byref(children), c.byref(count))
        child_ids = [children[i] for i in range(count.value)]
        if children:
            x11.XFree(children)
        print(f"X11 children: {[hex(child) for child in child_ids]}", flush=True)
        assert child_ids, "editor companion did not create an X11 child"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab",
                        "-window_id", hex(child_ids[0]), "-i", os.environ["DISPLAY"],
                        "-frames:v", "1", "-y", "/tmp/manifold-clap-editor-child.png"],
                       check=True, timeout=15)
        params_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.params")
        params = c.cast(params_ptr, c.POINTER(PluginParams)).contents
        mix_event = ParamValue(EventHeader(c.sizeof(ParamValue), 0, 0, 5, 0),
                               1, None, -1, -1, -1, -1, 0.2)

        @c.CFUNCTYPE(c.c_uint32, c.c_void_p)
        def input_count(_events):
            return 1

        @c.CFUNCTYPE(c.c_void_p, c.c_void_p, c.c_uint32)
        def input_get(_events, index):
            return c.addressof(mix_event) if index == 0 else None

        inputs = InputEvents(None, c.cast(input_count, c.c_void_p), c.cast(input_get, c.c_void_p))
        fn(params.flush, None, c.c_void_p, c.POINTER(InputEvents), c.c_void_p)(
            plugin_ptr, c.byref(inputs), None)
        current_mix = c.c_double()
        assert fn(params.get_value, c.c_bool, c.c_void_p, c.c_uint32, c.POINTER(c.c_double))(
            plugin_ptr, 1, c.byref(current_mix))
        assert abs(current_mix.value - 0.2) < 1e-6
        time.sleep(0.3)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "x11grab",
                        "-window_id", hex(child_ids[0]), "-i", os.environ["DISPLAY"],
                        "-frames:v", "1", "-y", "/tmp/manifold-clap-editor-automated.png"],
                       check=True, timeout=15)
        if "--gesture" in sys.argv:
            probe_gesture(x11, display, plugin, plugin_ptr)
        assert fn(gui.hide, c.c_bool, c.c_void_p)(plugin_ptr)
        assert fn(gui.show, c.c_bool, c.c_void_p)(plugin_ptr)
        fn(gui.destroy, None, c.c_void_p)(plugin_ptr)
        print(f"CLAP GUI lifecycle passed: {width.value}x{height.value}; callbacks={callback_count}")
    finally:
        fn(plugin.destroy, None, c.c_void_p)(plugin_ptr)
        fn(entry.deinit, None)()
        x11.XDestroyWindow.argtypes = [c.c_void_p, c.c_ulong]
        x11.XDestroyWindow(display, xid)
        x11.XCloseDisplay.argtypes = [c.c_void_p]
        x11.XCloseDisplay(display)


def probe_gesture(x11, display, plugin, plugin_ptr):
    # Xwayland 24 requires an emulated-input portal for XTEST. This opt-in
    # probe works on Xvfb or an X server that permits synthetic input.
    x_test = c.CDLL("libXtst.so.6")
    x_test.XTestFakeMotionEvent.argtypes = [c.c_void_p, c.c_int, c.c_int, c.c_int, c.c_ulong]
    x_test.XTestFakeButtonEvent.argtypes = [c.c_void_p, c.c_uint, c.c_int, c.c_ulong]
    x_test.XTestFakeMotionEvent(display, -1, 340, 145, 0)
    x_test.XTestFakeButtonEvent(display, 1, 1, 0)
    x_test.XTestFakeMotionEvent(display, -1, 440, 145, 0)
    x_test.XTestFakeButtonEvent(display, 1, 0, 0)
    x11.XFlush(display)
    time.sleep(0.5)
    params_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.params")
    params = c.cast(params_ptr, c.POINTER(PluginParams)).contents
    emitted = []

    @c.CFUNCTYPE(c.c_bool, c.c_void_p, c.POINTER(EventHeader))
    def push(_list, event):
        emitted.append(event.contents.type)
        return True

    output = OutputEvents(None, c.cast(push, c.c_void_p))
    fn(params.flush, None, c.c_void_p, c.c_void_p, c.POINTER(OutputEvents))(
        plugin_ptr, None, c.byref(output))
    print(f"Native widget events: {emitted}", flush=True)
    assert 7 in emitted and 5 in emitted and 8 in emitted, "widget gesture did not reach CLAP host"


if __name__ == "__main__":
    main()
