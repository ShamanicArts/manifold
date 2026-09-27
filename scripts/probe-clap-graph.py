#!/usr/bin/env python3
"""Load the packaged Graph CLAP in a separate host process and exercise state/audio."""

import argparse
import ctypes as c
import json
from pathlib import Path


class Version(c.Structure):
    _fields_ = [("major", c.c_uint32), ("minor", c.c_uint32), ("revision", c.c_uint32)]


class Entry(c.Structure):
    _fields_ = [("version", Version), ("init", c.c_void_p), ("deinit", c.c_void_p), ("get_factory", c.c_void_p)]


class Factory(c.Structure):
    _fields_ = [("count", c.c_void_p), ("descriptor", c.c_void_p), ("create", c.c_void_p)]


class Descriptor(c.Structure):
    _fields_ = [("version", Version), ("id", c.c_char_p), ("name", c.c_char_p),
                ("vendor", c.c_char_p), ("url", c.c_char_p), ("manual", c.c_char_p),
                ("support", c.c_char_p), ("plugin_version", c.c_char_p),
                ("description", c.c_char_p), ("features", c.POINTER(c.c_char_p))]


class Host(c.Structure):
    _fields_ = [("version", Version), ("data", c.c_void_p), ("name", c.c_char_p),
                ("vendor", c.c_char_p), ("url", c.c_char_p), ("host_version", c.c_char_p),
                ("extension", c.c_void_p), ("restart", c.c_void_p), ("request_process", c.c_void_p),
                ("callback", c.c_void_p)]


class Plugin(c.Structure):
    _fields_ = [(name, c.c_void_p) for name in (
        "descriptor", "data", "init", "destroy", "activate", "deactivate", "start",
        "stop", "reset", "process", "get_extension", "main")]


class Stream(c.Structure):
    _fields_ = [("ctx", c.c_void_p), ("callback", c.c_void_p)]


class State(c.Structure):
    _fields_ = [("save", c.c_void_p), ("load", c.c_void_p)]


class AudioBuffer(c.Structure):
    _fields_ = [("data32", c.POINTER(c.POINTER(c.c_float))), ("data64", c.c_void_p),
                ("channels", c.c_uint32), ("latency", c.c_uint32), ("constant", c.c_uint64)]


class EventHeader(c.Structure):
    _fields_ = [("size", c.c_uint32), ("time", c.c_uint32), ("space", c.c_uint16),
                ("type", c.c_uint16), ("flags", c.c_uint32)]


class Note(c.Structure):
    _fields_ = [("header", EventHeader), ("note_id", c.c_int32), ("port", c.c_int16),
                ("channel", c.c_int16), ("key", c.c_int16), ("velocity", c.c_double)]


class InputEvents(c.Structure):
    _fields_ = [("ctx", c.c_void_p), ("count", c.c_void_p), ("get", c.c_void_p)]


class Process(c.Structure):
    _fields_ = [("steady", c.c_int64), ("frames", c.c_uint32), ("transport", c.c_void_p),
                ("inputs", c.c_void_p), ("outputs", c.POINTER(AudioBuffer)),
                ("input_count", c.c_uint32), ("output_count", c.c_uint32),
                ("events", c.POINTER(InputEvents)), ("out_events", c.c_void_p)]


def fn(pointer, result, *args):
    assert pointer
    return c.CFUNCTYPE(result, *args)(pointer)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", type=Path, default=Path("target/clap/ManifoldFX.clap"))
    parser.add_argument("--project", type=Path, default=Path("projects/graph-workspace/note-voice.json"))
    args = parser.parse_args()
    project = args.project.read_bytes()
    document = json.loads(project)
    midi = next((node["id"] for node in document["signal"]["nodes"]
                 if node["type"] == "midi-input"), None)
    library = c.CDLL(str(args.module.resolve()))
    entry = Entry.in_dll(library, "clap_entry")
    assert fn(entry.init, c.c_bool, c.c_char_p)(str(args.module.resolve()).encode())
    factory_ptr = fn(entry.get_factory, c.c_void_p, c.c_char_p)(b"clap.plugin-factory")
    factory = c.cast(factory_ptr, c.POINTER(Factory)).contents
    assert fn(factory.count, c.c_uint32, c.c_void_p)(factory_ptr) == 2
    ids = []
    for index in range(2):
        descriptor = fn(factory.descriptor, c.c_void_p, c.c_void_p, c.c_uint32)(factory_ptr, index)
        ids.append(c.cast(descriptor, c.POINTER(Descriptor)).contents.id.decode())
    assert ids == ["arts.shamanic.manifold.standalone-fx", "arts.shamanic.manifold.graph"]
    host = Host(Version(1, 2, 0), None, b"Graph probe", b"Shamanic Arts", b"", b"1",
                None, None, None, None)
    plugin_ptr = fn(factory.create, c.c_void_p, c.c_void_p, c.POINTER(Host), c.c_char_p)(
        factory_ptr, c.byref(host), ids[1].encode())
    assert plugin_ptr
    plugin = c.cast(plugin_ptr, c.POINTER(Plugin)).contents
    try:
        assert fn(plugin.init, c.c_bool, c.c_void_p)(plugin_ptr)
        state_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.state")
        state = c.cast(state_ptr, c.POINTER(State)).contents
        offset = 0

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def read(_stream, target, size):
            nonlocal offset
            count = min(size, len(project) - offset)
            if count:
                c.memmove(target, project[offset:offset + count], count)
                offset += count
            return count

        input_stream = Stream(None, c.cast(read, c.c_void_p))
        assert fn(state.load, c.c_bool, c.c_void_p, c.POINTER(Stream))(plugin_ptr, c.byref(input_stream))
        assert offset == len(project)
        assert fn(plugin.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(
            plugin_ptr, 48000., 1, 128)
        assert fn(plugin.start, c.c_bool, c.c_void_p)(plugin_ptr)
        left, right = (c.c_float * 128)(), (c.c_float * 128)()
        channels = (c.POINTER(c.c_float) * 2)(left, right)
        output = AudioBuffer(channels, None, 2, 0, 0)
        note = Note(EventHeader(c.sizeof(Note), 0, 0, 0, 0), -1, 0, 0, 60, 0.8)

        @c.CFUNCTYPE(c.c_uint32, c.c_void_p)
        def event_count(_events):
            return 1 if midi is not None else 0

        @c.CFUNCTYPE(c.c_void_p, c.c_void_p, c.c_uint32)
        def event_get(_events, index):
            return c.addressof(note) if midi is not None and index == 0 else None

        events = InputEvents(None, c.cast(event_count, c.c_void_p), c.cast(event_get, c.c_void_p))
        block = Process(0, 128, None, None, c.pointer(output), 0, 1, c.pointer(events), None)
        assert fn(plugin.process, c.c_int32, c.c_void_p, c.POINTER(Process))(
            plugin_ptr, c.byref(block)) == 1
        peak = max(abs(value) for channel in (left, right) for value in channel)
        assert peak > 0.00001 and peak < 10, peak
        saved = bytearray()

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def write(_stream, source, size):
            saved.extend(c.string_at(source, size))
            return size

        output_stream = Stream(None, c.cast(write, c.c_void_p))
        assert fn(state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(plugin_ptr, c.byref(output_stream))
        assert json.loads(saved)["projectId"] == document["projectId"]
        print(json.dumps({"factory_ids": ids, "project_bytes": len(project),
                          "saved_bytes": len(saved), "audio_peak": peak, "midi_node": midi}))
    finally:
        fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
        fn(plugin.deactivate, None, c.c_void_p)(plugin_ptr)
        fn(plugin.destroy, None, c.c_void_p)(plugin_ptr)
        fn(entry.deinit, None)()


if __name__ == "__main__":
    main()
