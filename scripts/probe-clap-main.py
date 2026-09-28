#!/usr/bin/env python3
"""Exercise the dedicated Main CLAP class through its C ABI, without audio I/O."""

import ctypes as c
import argparse
import json
from pathlib import Path
import threading


ROOT = Path(__file__).resolve().parents[1]
SESSION = ROOT / "web/public/main-native-saved-session.json"


class Version(c.Structure):
    _fields_ = [("major", c.c_uint32), ("minor", c.c_uint32), ("revision", c.c_uint32)]


class Entry(c.Structure):
    _fields_ = [("version", Version), ("init", c.c_void_p), ("deinit", c.c_void_p), ("factory", c.c_void_p)]


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


class Params(c.Structure):
    _fields_ = [(name, c.c_void_p) for name in (
        "count", "info", "value", "to_text", "from_text", "flush")]


class Commands(c.Structure):
    _fields_ = [("enqueue", c.c_void_p)]


class Gui(c.Structure):
    _fields_ = [(name, c.c_void_p) for name in (
        "supported", "preferred", "create", "destroy", "scale", "size",
        "can_resize", "resize_hints", "adjust", "set_size", "parent",
        "transient", "title", "show", "hide")]


class ParamInfo(c.Structure):
    _fields_ = [("id", c.c_uint32), ("flags", c.c_uint32), ("cookie", c.c_void_p),
                ("name", c.c_char * 256), ("module", c.c_char * 1024),
                ("minimum", c.c_double), ("maximum", c.c_double), ("default", c.c_double)]


class AudioBuffer(c.Structure):
    _fields_ = [("data32", c.POINTER(c.POINTER(c.c_float))), ("data64", c.c_void_p),
                ("channels", c.c_uint32), ("latency", c.c_uint32), ("constant", c.c_uint64)]


class Process(c.Structure):
    _fields_ = [("steady", c.c_int64), ("frames", c.c_uint32), ("transport", c.c_void_p),
                ("inputs", c.c_void_p), ("outputs", c.POINTER(AudioBuffer)),
                ("input_count", c.c_uint32), ("output_count", c.c_uint32),
                ("events", c.c_void_p), ("out_events", c.c_void_p)]


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


def fn(pointer, result, *args):
    assert pointer
    return c.CFUNCTYPE(result, *args)(pointer)


def read_stream(payload):
    offset = 0

    @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
    def read(_stream, target, size):
        nonlocal offset
        count = min(size, len(payload) - offset)
        if count:
            c.memmove(target, payload[offset:offset + count], count)
            offset += count
        return count

    return Stream(None, c.cast(read, c.c_void_p)), read


def render(plugin_ptr, plugin, events=None, input_value=None):
    left = (c.c_float * 128)()
    right = (c.c_float * 128)()
    channels = (c.POINTER(c.c_float) * 2)(left, right)
    output = AudioBuffer(channels, None, 2, 0, 0)
    if input_value is None:
        host_input = None
        input_count = 0
    else:
        input_left = (c.c_float * 128)(*([input_value] * 128))
        input_right = (c.c_float * 128)(*([input_value] * 128))
        source_channels = (c.POINTER(c.c_float) * 2)(input_left, input_right)
        source = AudioBuffer(source_channels, None, 2, 0, 0)
        host_input = c.cast(c.pointer(source), c.c_void_p)
        input_count = 1
    block = Process(0, 128, None, host_input, c.pointer(output), input_count, 1,
                    c.cast(c.pointer(events), c.c_void_p) if events else None, None)
    assert fn(plugin.process, c.c_int32, c.c_void_p, c.POINTER(Process))(
        plugin_ptr, c.byref(block)) == 1
    return tuple(float(sample) for channel in (left, right) for sample in channel)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", type=Path, default=ROOT / "target/clap/ManifoldFX.clap")
    args = parser.parse_args()
    module = args.module.resolve()
    library = c.CDLL(str(module))
    entry = Entry.in_dll(library, "clap_entry")
    assert fn(entry.init, c.c_bool, c.c_char_p)(str(module).encode())
    factory_ptr = fn(entry.factory, c.c_void_p, c.c_char_p)(b"clap.plugin-factory")
    factory = c.cast(factory_ptr, c.POINTER(Factory)).contents
    assert fn(factory.count, c.c_uint32, c.c_void_p)(factory_ptr) == 3
    descriptor_ptr = fn(factory.descriptor, c.c_void_p, c.c_void_p, c.c_uint32)(factory_ptr, 2)
    descriptor = c.cast(descriptor_ptr, c.POINTER(Descriptor)).contents
    assert descriptor.id == b"arts.shamanic.manifold.main"
    host = Host(Version(1, 2, 0), None, b"Main probe", b"Shamanic Arts", b"", b"1",
                None, None, None, None)
    create = fn(factory.create, c.c_void_p, c.c_void_p, c.POINTER(Host), c.c_char_p)
    session = SESSION.read_bytes()
    original = json.loads(session)
    assert original["layers"][0]["frames"] == 6000

    plugin_ptr = create(factory_ptr, c.byref(host), descriptor.id)
    assert plugin_ptr
    plugin = c.cast(plugin_ptr, c.POINTER(Plugin)).contents
    try:
        assert fn(plugin.init, c.c_bool, c.c_void_p)(plugin_ptr)
        gui_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.gui")
        assert gui_ptr, "packaged Main CLAP GUI extension missing"
        gui = c.cast(gui_ptr, c.POINTER(Gui)).contents
        assert fn(gui.supported, c.c_bool, c.c_void_p, c.c_char_p, c.c_bool)(
            plugin_ptr, b"x11", False)
        width, height = c.c_uint32(), c.c_uint32()
        assert fn(gui.size, c.c_bool, c.c_void_p, c.POINTER(c.c_uint32), c.POINTER(c.c_uint32))(
            plugin_ptr, c.byref(width), c.byref(height))
        assert (width.value, height.value) == (1280, 780)
        assert fn(gui.create, c.c_bool, c.c_void_p, c.c_char_p, c.c_bool)(
            plugin_ptr, b"x11", False)
        fn(gui.destroy, None, c.c_void_p)(plugin_ptr)
        state_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.state")
        assert state_ptr
        state = c.cast(state_ptr, c.POINTER(State)).contents
        params_ptr = fn(plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(plugin_ptr, b"clap.params")
        assert params_ptr
        params = c.cast(params_ptr, c.POINTER(Params)).contents
        parameter_count = fn(params.count, c.c_uint32, c.c_void_p)(plugin_ptr)
        assert parameter_count > 200
        info = ParamInfo()
        found_master = False
        for index in range(parameter_count):
            assert fn(params.info, c.c_bool, c.c_void_p, c.c_uint32, c.POINTER(ParamInfo))(
                plugin_ptr, index, c.byref(info))
            if info.id == 271:
                assert info.name == b"Output" and info.module == b"Source"
                assert info.default == 1.0 and info.minimum == 0 and info.maximum == 2
                found_master = True
        assert found_master
        source, keep_read = read_stream(session)
        assert fn(state.load, c.c_bool, c.c_void_p, c.POINTER(Stream))(plugin_ptr, c.byref(source))
        value = c.c_double()
        assert fn(params.value, c.c_bool, c.c_void_p, c.c_uint32, c.POINTER(c.c_double))(
            plugin_ptr, 271, c.byref(value))
        assert abs(value.value - 0.6) < 1e-5
        assert fn(plugin.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(
            plugin_ptr, 48000., 1, 128)
        assert fn(plugin.start, c.c_bool, c.c_void_p)(plugin_ptr)
        first = render(plugin_ptr, plugin)
        assert max(abs(sample) for sample in first) > 0.01
        master_edit = ParamValue(EventHeader(c.sizeof(ParamValue), 64, 0, 5, 0),
                                 271, None, -1, -1, -1, -1, 0.25)

        @c.CFUNCTYPE(c.c_uint32, c.c_void_p)
        def param_count(_list):
            return 1

        @c.CFUNCTYPE(c.c_void_p, c.c_void_p, c.c_uint32)
        def param_get(_list, index):
            return c.addressof(master_edit) if index == 0 else None

        param_events = InputEvents(None, c.cast(param_count, c.c_void_p), c.cast(param_get, c.c_void_p))
        render(plugin_ptr, plugin, param_events)
        assert fn(params.value, c.c_bool, c.c_void_p, c.c_uint32, c.POINTER(c.c_double))(
            plugin_ptr, 271, c.byref(value))
        assert abs(value.value - 0.25) < 1e-6
        running = threading.Event()
        running.set()
        started = threading.Event()
        worker_errors = []

        def process_while_saving():
            try:
                while running.is_set():
                    render(plugin_ptr, plugin)
                    started.set()
            except Exception as error:
                worker_errors.append(error)

        worker = threading.Thread(target=process_while_saving)
        worker.start()
        try:
            assert started.wait(2), "audio callback did not start"
            live_saved = bytearray()

            @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
            def live_write(_stream, data, size):
                live_saved.extend(c.string_at(data, size))
                return size

            live_sink = Stream(None, c.cast(live_write, c.c_void_p))
            assert fn(state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(
                plugin_ptr, c.byref(live_sink)), "active audio save failed"
            live = json.loads(live_saved)
            assert live["layers"][0]["pcmF32Base64"] == original["layers"][0]["pcmF32Base64"]
            assert abs(live["rack"]["source"]["output"] - 0.25) < 1e-6
        finally:
            running.clear()
            worker.join(timeout=3)
        assert not worker.is_alive() and not worker_errors, worker_errors
        fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
        saved = bytearray()

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def write(_stream, data, size):
            saved.extend(c.string_at(data, size))
            return size

        sink = Stream(None, c.cast(write, c.c_void_p))
        assert fn(state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(plugin_ptr, c.byref(sink))
        exported = json.loads(saved)
        assert exported["id"] == "manifold.main-looper"
        assert exported["version"] == 16
        assert exported["layers"][0]["pcmF32Base64"] == original["layers"][0]["pcmF32Base64"]
        assert exported["sample"]["pcmF32Base64"] == original["sample"]["pcmF32Base64"]
        assert exported["rack"]["lfos"][1]["shape"] == 3
        assert exported["rack"]["atv"]["amount"] == original["rack"]["atv"]["amount"]

        second_ptr = create(factory_ptr, c.byref(host), descriptor.id)
        assert second_ptr
        second = c.cast(second_ptr, c.POINTER(Plugin)).contents
        try:
            assert fn(second.init, c.c_bool, c.c_void_p)(second_ptr)
            second_state_ptr = fn(second.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                second_ptr, b"clap.state")
            second_state = c.cast(second_state_ptr, c.POINTER(State)).contents
            restored_stream, keep_restored = read_stream(bytes(saved))
            assert fn(second_state.load, c.c_bool, c.c_void_p, c.POINTER(Stream))(
                second_ptr, c.byref(restored_stream))
            assert fn(second.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(
                second_ptr, 48000., 1, 128)
            assert fn(plugin.start, c.c_bool, c.c_void_p)(plugin_ptr)
            assert fn(second.start, c.c_bool, c.c_void_p)(second_ptr)
            next_original = render(plugin_ptr, plugin)
            reopened = render(second_ptr, second)
            difference = max(abs(a - b) for a, b in zip(next_original, reopened))
            assert difference < 1e-7, (difference, next_original[:8], reopened[:8],
                                       original["layers"][0]["position"],
                                       exported["layers"][0]["position"])
            master_edit.param_id = 16  # Layer 1 volume
            master_edit.value = 0.25
            altered = render(plugin_ptr, plugin, param_events)
            reference = render(second_ptr, second)
            assert max(abs(altered[i] - reference[i]) for i in
                       [*range(64), *range(128, 192)]) < 1e-7
            assert max(abs(altered[i] - reference[i]) for i in
                       [*range(64, 128), *range(192, 256)]) > 0.01
            assert fn(params.value, c.c_bool, c.c_void_p, c.c_uint32, c.POINTER(c.c_double))(
                plugin_ptr, 16, c.byref(value))
            assert abs(value.value - 0.25) < 1e-6
            command_ptr = fn(second.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                second_ptr, b"shamanic.manifold.main.commands/1")
            assert command_ptr
            commands = c.cast(command_ptr, c.POINTER(Commands)).contents
            enqueue = fn(commands.enqueue, c.c_bool, c.c_void_p, c.c_uint32, c.c_float)
            assert not enqueue(second_ptr, 9, 4.0), "invalid layer must be rejected"
            assert not enqueue(second_ptr, 7, 0.3), "invalid segment size must be rejected"
            assert enqueue(second_ptr, 9, 0.0), "clear Layer 1 command was rejected"
            assert max(abs(sample) for sample in render(second_ptr, second)) == 0
            fn(second.stop, None, c.c_void_p)(second_ptr)
            cleared_save = bytearray()

            @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
            def clear_write(_stream, data, size):
                cleared_save.extend(c.string_at(data, size))
                return size

            clear_sink = Stream(None, c.cast(clear_write, c.c_void_p))
            assert fn(second_state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(
                second_ptr, c.byref(clear_sink))
            assert json.loads(cleared_save)["layers"][0]["frames"] == 0
            fn(second.deactivate, None, c.c_void_p)(second_ptr)
        finally:
            fn(second.destroy, None, c.c_void_p)(second_ptr)
        empty = (ROOT / "projects/main-looper/default-session-v15.json").read_bytes()
        empty_stream, keep_empty_read = read_stream(empty)
        assert fn(state.load, c.c_bool, c.c_void_p, c.POINTER(Stream))(
            plugin_ptr, c.byref(empty_stream)), "active session replacement failed"
        render(plugin_ptr, plugin)  # the old runtime finishes this block
        replaced = render(plugin_ptr, plugin)
        assert max(abs(sample) for sample in replaced) == 0
        pending_stream, keep_pending_read = read_stream(session)
        assert fn(state.load, c.c_bool, c.c_void_p, c.POINTER(Stream))(
            plugin_ptr, c.byref(pending_stream))
        fn(plugin.stop, None, c.c_void_p)(plugin_ptr)
        stopped_saved = bytearray()

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def stopped_write(_stream, data, size):
            stopped_saved.extend(c.string_at(data, size))
            return size

        stopped_sink = Stream(None, c.cast(stopped_write, c.c_void_p))
        assert fn(state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(
            plugin_ptr, c.byref(stopped_sink))
        assert json.loads(stopped_saved)["layers"][0]["pcmF32Base64"] == original["layers"][0]["pcmF32Base64"]
        fn(plugin.deactivate, None, c.c_void_p)(plugin_ptr)
        deactivated_saved = bytearray()

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def deactivated_write(_stream, data, size):
            deactivated_saved.extend(c.string_at(data, size))
            return size

        deactivated_sink = Stream(None, c.cast(deactivated_write, c.c_void_p))
        assert fn(state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(
            plugin_ptr, c.byref(deactivated_sink))
        assert json.loads(deactivated_saved)["layers"][0]["pcmF32Base64"] == original["layers"][0]["pcmF32Base64"]
        voice_ptr = create(factory_ptr, c.byref(host), descriptor.id)
        assert voice_ptr
        voice = c.cast(voice_ptr, c.POINTER(Plugin)).contents
        try:
            assert fn(voice.init, c.c_bool, c.c_void_p)(voice_ptr)
            voice_params_ptr = fn(voice.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                voice_ptr, b"clap.params")
            voice_params = c.cast(voice_params_ptr, c.POINTER(Params)).contents
            master_edit.header.time = 0
            master_edit.param_id = 271
            master_edit.value = 0.5
            fn(voice_params.flush, None, c.c_void_p, c.POINTER(InputEvents), c.c_void_p)(
                voice_ptr, c.byref(param_events), None)
            assert fn(voice_params.value, c.c_bool, c.c_void_p, c.c_uint32,
                      c.POINTER(c.c_double))(voice_ptr, 271, c.byref(value))
            assert abs(value.value - 0.5) < 1e-6
            preactivation_saved = bytearray()

            @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
            def preactivation_write(_stream, data, size):
                preactivation_saved.extend(c.string_at(data, size))
                return size

            voice_state_ptr = fn(voice.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                voice_ptr, b"clap.state")
            voice_state = c.cast(voice_state_ptr, c.POINTER(State)).contents
            preactivation_sink = Stream(None, c.cast(preactivation_write, c.c_void_p))
            assert fn(voice_state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(
                voice_ptr, c.byref(preactivation_sink))
            assert abs(json.loads(preactivation_saved)["rack"]["source"]["output"] - 0.5) < 1e-6
            assert fn(voice.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(
                voice_ptr, 48000., 1, 128)
            assert fn(voice.start, c.c_bool, c.c_void_p)(voice_ptr)
            note = Note(EventHeader(c.sizeof(Note), 64, 0, 0, 0), -1, 0, 0, 60, 0.8)

            @c.CFUNCTYPE(c.c_uint32, c.c_void_p)
            def event_count(_list):
                return 1

            @c.CFUNCTYPE(c.c_void_p, c.c_void_p, c.c_uint32)
            def event_get(_list, index):
                return c.addressof(note) if index == 0 else None

            events = InputEvents(None, c.cast(event_count, c.c_void_p), c.cast(event_get, c.c_void_p))
            onset = render(voice_ptr, voice, events)
            assert max(abs(sample) for sample in onset[:64]) == 0
            assert max(abs(sample) for sample in onset[64:128]) > 1e-7
            fn(voice.stop, None, c.c_void_p)(voice_ptr)
            fn(voice.reset, None, c.c_void_p)(voice_ptr)
            assert fn(voice.start, c.c_bool, c.c_void_p)(voice_ptr)
            cleared = render(voice_ptr, voice)
            assert max(abs(sample) for sample in cleared) == 0, max(abs(sample) for sample in cleared)
            fn(voice.stop, None, c.c_void_p)(voice_ptr)
            fn(voice.deactivate, None, c.c_void_p)(voice_ptr)
        finally:
            fn(voice.destroy, None, c.c_void_p)(voice_ptr)
        capture_ptr = create(factory_ptr, c.byref(host), descriptor.id)
        assert capture_ptr
        capture = c.cast(capture_ptr, c.POINTER(Plugin)).contents
        try:
            assert fn(capture.init, c.c_bool, c.c_void_p)(capture_ptr)
            capture_state = c.cast(fn(capture.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                capture_ptr, b"clap.state"), c.POINTER(State)).contents
            capture_commands = c.cast(fn(capture.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                capture_ptr, b"shamanic.manifold.main.commands/1"), c.POINTER(Commands)).contents
            capture_enqueue = fn(capture_commands.enqueue, c.c_bool, c.c_void_p, c.c_uint32, c.c_float)
            assert fn(capture.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(
                capture_ptr, 48000., 1, 128)
            assert fn(capture.start, c.c_bool, c.c_void_p)(capture_ptr)
            assert capture_enqueue(capture_ptr, 0, 0.0), "First Loop record was rejected"
            master_edit.param_id = 0  # Active Layer; same-block host edit precedes Record
            master_edit.value = 1.0
            master_edit.header.time = 0
            render(capture_ptr, capture, param_events, input_value=0.25)
            assert capture_enqueue(capture_ptr, 1, 0.0), "First Loop stop was rejected"
            playback_peak = max(max(abs(sample) for sample in render(capture_ptr, capture))
                                for _ in range(20))
            assert playback_peak > 0.1, playback_peak
            fn(capture.stop, None, c.c_void_p)(capture_ptr)
            captured_save = bytearray()

            @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
            def captured_write(_stream, data, size):
                captured_save.extend(c.string_at(data, size))
                return size

            captured_sink = Stream(None, c.cast(captured_write, c.c_void_p))
            assert fn(capture_state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(
                capture_ptr, c.byref(captured_sink))
            captured = json.loads(captured_save)
            assert captured["layers"][0]["frames"] == 0
            assert captured["layers"][1]["frames"] > 128
            fn(capture.deactivate, None, c.c_void_p)(capture_ptr)
        finally:
            fn(capture.destroy, None, c.c_void_p)(capture_ptr)
        patch_ptr = create(factory_ptr, c.byref(host), descriptor.id)
        assert patch_ptr
        patch = c.cast(patch_ptr, c.POINTER(Plugin)).contents
        try:
            assert fn(patch.init, c.c_bool, c.c_void_p)(patch_ptr)
            patch_state = c.cast(fn(patch.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)(
                patch_ptr, b"clap.state"), c.POINTER(State)).contents
            browser_patch = json.loads((ROOT / "web/public/main-audio-patch-saved-session.json").read_bytes())
            patch_stream, keep_patch_read = read_stream(json.dumps(browser_patch).encode())
            assert fn(patch_state.load, c.c_bool, c.c_void_p, c.POINTER(Stream))(
                patch_ptr, c.byref(patch_stream))
            assert fn(patch.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(
                patch_ptr, 48000., 1, 128)
            assert fn(patch.start, c.c_bool, c.c_void_p)(patch_ptr)
            render(patch_ptr, patch)
            fn(patch.stop, None, c.c_void_p)(patch_ptr)
            patched_save = bytearray()

            @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
            def patched_write(_stream, data, size):
                patched_save.extend(c.string_at(data, size))
                return size

            patched_sink = Stream(None, c.cast(patched_write, c.c_void_p))
            assert fn(patch_state.save, c.c_bool, c.c_void_p, c.POINTER(Stream))(
                patch_ptr, c.byref(patched_sink))
            assert json.loads(patched_save)["rackDocument"]["connections"] == browser_patch["rackDocument"]["connections"]
            fn(patch.deactivate, None, c.c_void_p)(patch_ptr)
        finally:
            fn(patch.destroy, None, c.c_void_p)(patch_ptr)
        print("Main CLAP: packaged v16 state, browser Patch cable import/export, parameters, timed automation, First Loop, and sample-identical reopen passed.")
    finally:
        fn(plugin.destroy, None, c.c_void_p)(plugin_ptr)


if __name__ == "__main__":
    main()
