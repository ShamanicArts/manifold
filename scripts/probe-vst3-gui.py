#!/usr/bin/env python3
"""Open the packaged VST3 view in an isolated X11 host and capture its child."""
import ctypes as c
import os
from pathlib import Path
import subprocess
import sys
import time

assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1", "run under disposable Weston"
assert os.environ.get("DISPLAY")
module = Path(sys.argv[1] if len(sys.argv) > 1 else "target/vst3/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so").resolve()

# The non-Windows VST3 TUID byte order is big endian per 32-bit word.
def uid(*words):
    return b"".join(word.to_bytes(4, "big") for word in words)

def method(pointer, index, result, *args):
    table = c.cast(pointer, c.POINTER(c.POINTER(c.c_void_p))).contents
    return c.CFUNCTYPE(result, c.c_void_p, *args)(table[index])

def call(pointer, index, result, *args):
    return method(pointer, index, result, *args)

x11 = c.CDLL("libX11.so.6")
x11.XOpenDisplay.argtypes = [c.c_char_p]
x11.XOpenDisplay.restype = c.c_void_p
display = x11.XOpenDisplay(None)
assert display
x11.XDefaultScreen.argtypes = [c.c_void_p]
x11.XDefaultScreen.restype = c.c_int
x11.XRootWindow.argtypes = [c.c_void_p, c.c_int]
x11.XRootWindow.restype = c.c_ulong
x11.XCreateSimpleWindow.argtypes = [c.c_void_p, c.c_ulong, c.c_int, c.c_int, c.c_uint, c.c_uint, c.c_uint, c.c_ulong, c.c_ulong]
x11.XCreateSimpleWindow.restype = c.c_ulong
root = x11.XRootWindow(display, x11.XDefaultScreen(display))
xid = x11.XCreateSimpleWindow(display, root, 24, 24, 500, 246, 0, 0, 0x2b2b2b)
x11.XMapWindow.argtypes = [c.c_void_p, c.c_ulong]
x11.XFlush.argtypes = [c.c_void_p]
x11.XMapWindow(display, xid)
x11.XFlush(display)

library = c.CDLL(str(module))
library.GetPluginFactory.restype = c.c_void_p
factory = library.GetPluginFactory()
assert factory
controller_cid = uid(0xA3D4C7B1,0x5F584B2B,0x89A3F18E,0x203AD8B7)
controller_iid = uid(0xDCD7BBE3,0x7742448D,0xA874AACC,0x979C759E)
controller = c.c_void_p()
result = call(factory, 6, c.c_int, c.c_char_p, c.c_char_p, c.POINTER(c.c_void_p))(
    factory, controller_cid, controller_iid, c.byref(controller))
assert result == 0 and controller.value, f"controller creation: {result}"

# Host COM objects: the frame's second interface exposes Linux::IRunLoop.
callbacks = []
runloop_iid = uid(0x18C35366,0x97764F1A,0x9C5B8385,0x7A871389)
unknown_iid = uid(0,0,0xC0000000,0x00000046)
timer = None
edits = []
class Interface(c.Structure):
    _fields_ = [("vtbl", c.POINTER(c.c_void_p))]
frame_methods = (c.c_void_p * 4)()
loop_methods = (c.c_void_p * 7)()
handler_methods = (c.c_void_p * 7)()
frame = Interface(c.cast(frame_methods, c.POINTER(c.c_void_p)))
loop = Interface(c.cast(loop_methods, c.POINTER(c.c_void_p)))
handler = Interface(c.cast(handler_methods, c.POINTER(c.c_void_p)))

@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_void_p, c.POINTER(c.c_void_p))
def query(self, iid, out):
    raw = c.string_at(iid, 16)
    if raw == runloop_iid:
        out[0] = c.addressof(loop)
    elif raw == unknown_iid:
        out[0] = self
    else:
        out[0] = None
        return -1
    return 0
@c.CFUNCTYPE(c.c_uint32, c.c_void_p)
def addref(_self): return 2
@c.CFUNCTYPE(c.c_uint32, c.c_void_p)
def release(_self): return 1
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_void_p, c.c_void_p)
def resize(_self, _view, _rect): return 1
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_void_p, c.c_int)
def register_event(_self, _event, _fd): return 1
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_void_p)
def unregister_event(_self, _event): return 1
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_void_p, c.c_uint64)
def register_timer(_self, event, _ms):
    global timer
    timer = event
    return 0
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_void_p)
def unregister_timer(_self, _event):
    global timer
    timer = None
    return 0
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_uint32)
def begin(_self, id): edits.append(("begin",id)); return 0
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_uint32, c.c_double)
def perform(_self, id, value): edits.append(("value",id,value)); return 0
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_uint32)
def end(_self, id): edits.append(("end",id)); return 0
@c.CFUNCTYPE(c.c_int, c.c_void_p, c.c_int)
def restart(_self, _flags): return 0
callbacks.extend([query,addref,release,resize,register_event,unregister_event,register_timer,unregister_timer,begin,perform,end,restart])
for table in (frame_methods,loop_methods,handler_methods):
    for index, function in enumerate((query,addref,release)):
        table[index] = c.cast(function,c.c_void_p)
frame_methods[3] = c.cast(resize,c.c_void_p)
for index, function in enumerate((register_event,unregister_event,register_timer,unregister_timer),3):
    loop_methods[index] = c.cast(function,c.c_void_p)
for index, function in enumerate((begin,perform,end,restart),3):
    handler_methods[index] = c.cast(function,c.c_void_p)

try:
    assert call(controller, 3, c.c_int, c.c_void_p)(controller, None) == 0
    assert call(controller, 16, c.c_int, c.c_void_p)(controller, c.addressof(handler)) == 0
    assert call(controller, 15, c.c_int, c.c_uint32, c.c_double)(controller, 0, 7./20.) == 0
    assert call(controller, 15, c.c_int, c.c_uint32, c.c_double)(controller, 1, 0.72) == 0
    view = call(controller, 17, c.c_void_p, c.c_char_p)(controller, b"editor")
    assert view, "packaged editor view unavailable"
    try:
        assert call(view, 3, c.c_int, c.c_char_p)(view, b"X11EmbedWindowID") == 0
        assert call(view, 12, c.c_int, c.c_void_p)(view, c.addressof(frame)) == 0
        assert timer, "host timer not registered"
        assert call(view, 4, c.c_int, c.c_void_p, c.c_char_p)(view, xid, b"X11EmbedWindowID") == 0
        for _ in range(150):
            if timer:
                method(timer, 3, None)(timer)
            time.sleep(0.02)
        x11.XQueryTree.argtypes = [c.c_void_p, c.c_ulong, c.POINTER(c.c_ulong),c.POINTER(c.c_ulong),c.POINTER(c.POINTER(c.c_ulong)),c.POINTER(c.c_uint)]
        x11.XQueryTree.restype = c.c_int
        x11.XFree.argtypes = [c.c_void_p]
        top,parent,children,count = c.c_ulong(),c.c_ulong(),c.POINTER(c.c_ulong)(),c.c_uint()
        assert x11.XQueryTree(display,xid,c.byref(top),c.byref(parent),c.byref(children),c.byref(count))
        child_ids = [children[i] for i in range(count.value)]
        if children: x11.XFree(children)
        assert child_ids, "VST3 editor did not create an X11 child"
        output = Path("/tmp/manifold-vst3-editor-child.png")
        subprocess.run(["ffmpeg","-loglevel","error","-f","x11grab","-window_id",hex(child_ids[0]),"-i",os.environ["DISPLAY"],"-frames:v","1","-y",str(output)],check=True,timeout=15)
        assert call(controller, 15, c.c_int, c.c_uint32, c.c_double)(controller, 1, 0.2) == 0
        for _ in range(20):
            if timer: method(timer, 3, None)(timer)
            time.sleep(0.02)
        automated = Path("/tmp/manifold-vst3-editor-automated.png")
        subprocess.run(["ffmpeg","-loglevel","error","-f","x11grab","-window_id",hex(child_ids[0]),"-i",os.environ["DISPLAY"],"-frames:v","1","-y",str(automated)],check=True,timeout=15)
        print(f"VST3 view attached: X11 child {child_ids[0]:#x}, initial {output}, host automation {automated}, edits={edits}",flush=True)
        assert call(view, 5, c.c_int)(view) == 0
        assert call(view, 12, c.c_int, c.c_void_p)(view, None) == 0
        assert timer is None
    finally:
        call(view, 2, c.c_uint32)(view)
finally:
    call(controller, 16, c.c_int, c.c_void_p)(controller, None)
    call(controller, 4, c.c_int)(controller)
    call(controller, 2, c.c_uint32)(controller)
    call(factory, 2, c.c_uint32)(factory)
    x11.XDestroyWindow.argtypes = [c.c_void_p, c.c_ulong]
    x11.XDestroyWindow(display,xid)
    x11.XCloseDisplay.argtypes = [c.c_void_p]
    x11.XCloseDisplay(display)
