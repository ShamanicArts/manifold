#!/usr/bin/env python3
"""Load the packaged Graph CLAP in a separate host process and exercise state/audio."""

import argparse
import ctypes as c
import json
from pathlib import Path
import threading


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


class ParamValue(c.Structure):
    _fields_ = [("header", EventHeader), ("param_id", c.c_uint32), ("cookie", c.c_void_p),
                ("note_id", c.c_int32), ("port", c.c_int16), ("channel", c.c_int16),
                ("key", c.c_int16), ("value", c.c_double)]


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
    parser.add_argument("--reset", action="store_true", help="verify external CLAP reset and retrigger")
    parser.add_argument("--live-saves", type=int, default=0,
                        help="save while another thread runs audio blocks")
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
    assert fn(factory.count, c.c_uint32, c.c_void_p)(factory_ptr) == 3
    ids = []
    for index in range(3):
        descriptor = fn(factory.descriptor, c.c_void_p, c.c_void_p, c.c_uint32)(factory_ptr, index)
        ids.append(c.cast(descriptor, c.POINTER(Descriptor)).contents.id.decode())
    assert ids == ["arts.shamanic.manifold.standalone-fx", "arts.shamanic.manifold.graph",
                   "arts.shamanic.manifold.main"]
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
        with_note = True
        live_events = []

        @c.CFUNCTYPE(c.c_uint32, c.c_void_p)
        def event_count(_events):
            return len(live_events) if live_events else (1 if midi is not None and with_note else 0)

        @c.CFUNCTYPE(c.c_void_p, c.c_void_p, c.c_uint32)
        def event_get(_events, index):
            if live_events:
                return c.addressof(live_events[index]) if index < len(live_events) else None
            return c.addressof(note) if midi is not None and with_note and index == 0 else None

        events = InputEvents(None, c.cast(event_count, c.c_void_p), c.cast(event_get, c.c_void_p))
        block = Process(0, 128, None, None, c.pointer(output), 0, 1, c.pointer(events), None)
        assert fn(plugin.process, c.c_int32, c.c_void_p, c.POINTER(Process))(
            plugin_ptr, c.byref(block)) == 1
        peak = max(abs(value) for channel in (left, right) for value in channel)
        assert peak > 0.00001 and peak < 10, peak
        reset_metrics = {}
        if args.reset:
            assert midi is not None, "reset audio probe requires a MIDI instrument"
            original = tuple(float(value) for channel in (left, right) for value in channel)
            fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
            fn(plugin.reset, None, c.c_void_p)(plugin_ptr)
            fn(plugin.reset, None, c.c_void_p)(plugin_ptr)
            assert fn(plugin.start, c.c_bool, c.c_void_p)(plugin_ptr)
            with_note = False
            assert fn(plugin.process, c.c_int32, c.c_void_p, c.POINTER(Process))(
                plugin_ptr, c.byref(block)) == 1
            silence_peak = max(abs(value) for channel in (left, right) for value in channel)
            assert silence_peak == 0.0, silence_peak
            with_note = True
            assert fn(plugin.process, c.c_int32, c.c_void_p, c.POINTER(Process))(
                plugin_ptr, c.byref(block)) == 1
            retrigger_error = max(abs(value - original[index])
                                  for index, value in enumerate(float(sample)
                                      for channel in (left, right) for sample in channel))
            assert retrigger_error < 1e-7, retrigger_error
            reset_metrics = {"reset_silence_peak": silence_peak,
                             "retrigger_peak_error": retrigger_error}
        saved = bytearray()

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def write(_stream, source, size):
            saved.extend(c.string_at(source, size))
            return size

        output_stream = Stream(None, c.cast(write, c.c_void_p))
        def save_state():
            saved.clear()
            assert fn(state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(
                plugin_ptr, c.byref(output_stream))
            result = json.loads(saved)
            assert result["projectId"] == document["projectId"]
            assert len(result["signal"]["nodes"]) == len(document["signal"]["nodes"])
            return result

        save_state()
        live_metrics = {}
        if args.live_saves:
            assert args.live_saves > 0
            with_note = False
            voice = next((node["id"] for node in document["signal"]["nodes"]
                          if node["type"] == "voice-synth"), None)
            expected_pairs = None
            if voice is not None:
                live_events = [ParamValue(EventHeader(c.sizeof(ParamValue), 0, 0, 5, 0),
                                          0x01000002 + slot, None, -1, -1, -1, -1, 0.)
                               for slot in range(2)]

                def saved_pair(result):
                    entries = result["signal"]["initialParameters"]
                    return tuple(next(float(entry["value"]) for entry in entries
                                      if entry["nodeId"] == voice and entry["id"] == index)
                                 for index in (1, 2))

                expected_pairs = set()
                for values in ((0.2, 0.8), (0.8, 0.2)):
                    for event, value in zip(live_events, values):
                        event.value = value
                    assert fn(plugin.process, c.c_int32, c.c_void_p, c.POINTER(Process))(
                        plugin_ptr, c.byref(block)) == 1
                    expected_pairs.add(saved_pair(save_state()))
                assert len(expected_pairs) == 2, expected_pairs

            stop = threading.Event()
            started = threading.Event()
            counts = {"blocks": 0}
            errors = []

            def render_blocks():
                try:
                    while not stop.is_set():
                        if live_events:
                            values = (0.2, 0.8) if counts["blocks"] & 1 == 0 else (0.8, 0.2)
                            for event, value in zip(live_events, values):
                                event.value = value
                        status = fn(plugin.process, c.c_int32, c.c_void_p, c.POINTER(Process))(
                            plugin_ptr, c.byref(block))
                        if status != 1:
                            raise AssertionError(f"audio process status {status}")
                        counts["blocks"] += 1
                        started.set()
                except BaseException as error:
                    errors.append(error)
                    started.set()

            thread = threading.Thread(target=render_blocks, name="clap-audio-probe")
            thread.start()
            try:
                assert started.wait(5), "audio thread did not begin"
                for _ in range(args.live_saves):
                    result = save_state()
                    if expected_pairs is not None:
                        assert saved_pair(result) in expected_pairs, saved_pair(result)
            finally:
                stop.set()
                thread.join(timeout=10)
            assert not thread.is_alive(), "audio thread did not stop"
            assert not errors, errors
            assert counts["blocks"] >= 2, counts
            live_metrics = {"live_saves": args.live_saves, "live_audio_blocks": counts["blocks"],
                            "paired_automation": expected_pairs is not None}
        print(json.dumps({"factory_ids": ids, "project_bytes": len(project),
                          "saved_bytes": len(saved), "audio_peak": peak, "midi_node": midi,
                          **reset_metrics, **live_metrics}))
    finally:
        fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
        fn(plugin.deactivate, None, c.c_void_p)(plugin_ptr)
        fn(plugin.destroy, None, c.c_void_p)(plugin_ptr)
        fn(entry.deinit, None)()


if __name__ == "__main__":
    main()
