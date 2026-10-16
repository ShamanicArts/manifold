#!/usr/bin/env python3
"""Exercise the exported CLAP ABI offline: no GUI or audio device is opened."""
import argparse
import ctypes as c
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import time

spec = importlib.util.spec_from_file_location("clap_sdk", Path(__file__).with_name("probe-clap-graph.py"))
sdk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sdk)
fn = sdk.fn


class Ports(c.Structure):
    _fields_ = [("count", c.c_void_p), ("get", c.c_void_p)]


class PortInfo(c.Structure):
    _fields_ = [("id", c.c_uint32), ("name", c.c_char * 256), ("flags", c.c_uint32),
                ("channels", c.c_uint32), ("type", c.c_char_p), ("pair", c.c_uint32)]


class HostPorts(c.Structure):
    _fields_ = [("supported", c.c_void_p), ("rescan", c.c_void_p)]


class Script(c.Structure):
    _fields_ = [("set", c.c_void_p), ("status", c.c_void_p), ("call", c.c_void_p)]


class Hosted:
    def __init__(self, factory, supported=True):
        self.rescans = []
        self.active = False

        @c.CFUNCTYPE(c.c_bool, c.c_void_p, c.c_uint32)
        def supports(_host, flag):
            return supported and flag in (1, 2, 4, 8, 16, 32)

        @c.CFUNCTYPE(None, c.c_void_p, c.c_uint32)
        def rescan(_host, flags):
            assert not self.active
            self.rescans.append(flags)

        self.host_ports = HostPorts(c.cast(supports, c.c_void_p), c.cast(rescan, c.c_void_p))

        @c.CFUNCTYPE(c.c_void_p, c.c_void_p, c.c_char_p)
        def extension(_host, identifier):
            return c.addressof(self.host_ports) if identifier == b"clap.audio-ports" else None

        self.callbacks = (supports, rescan, extension)
        self.host = sdk.Host(sdk.Version(1, 2, 0), None, b"Manifold declared-bus SDK probe",
                             b"Shamanic Arts", b"", b"1", c.cast(extension, c.c_void_p), None, None, None)
        self.pointer = fn(factory.create, c.c_void_p, c.c_void_p, c.POINTER(sdk.Host), c.c_char_p)(
            c.byref(factory), c.byref(self.host), b"arts.shamanic.manifold.graph")
        assert self.pointer
        self.plugin = c.cast(self.pointer, c.POINTER(sdk.Plugin)).contents
        assert fn(self.plugin.init, c.c_bool, c.c_void_p)(self.pointer)
        get = fn(self.plugin.get_extension, c.c_void_p, c.c_void_p, c.c_char_p)
        self.state = c.cast(get(self.pointer, b"clap.state"), c.POINTER(sdk.State)).contents
        self.ports = c.cast(get(self.pointer, b"clap.audio-ports"), c.POINTER(Ports)).contents
        self.script = c.cast(get(self.pointer, b"manifold.project.script.v1"), c.POINTER(Script)).contents

    def load(self, source):
        offset = 0

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def read(_stream, target, size):
            nonlocal offset
            count = min(size, len(source) - offset)
            c.memmove(target, source[offset:offset + count], count)
            offset += count
            return count

        stream = sdk.Stream(None, c.cast(read, c.c_void_p))
        return fn(self.state.load, c.c_bool, c.c_void_p, c.POINTER(sdk.Stream))(self.pointer, c.byref(stream))

    def save(self):
        result = bytearray()

        @c.CFUNCTYPE(c.c_int64, c.c_void_p, c.c_void_p, c.c_uint64)
        def write(_stream, source, size):
            result.extend(c.string_at(source, size))
            return size

        stream = sdk.Stream(None, c.cast(write, c.c_void_p))
        assert fn(self.state.save, c.c_bool, c.c_void_p, c.POINTER(sdk.Stream))(self.pointer, c.byref(stream))
        return bytes(result)

    def describe(self):
        result = {}
        for input_, direction in ((True, "inputs"), (False, "outputs")):
            count = fn(self.ports.count, c.c_uint32, c.c_void_p, c.c_bool)(self.pointer, input_)
            ports = []
            for index in range(count):
                info = PortInfo()
                assert fn(self.ports.get, c.c_bool, c.c_void_p, c.c_uint32, c.c_bool, c.POINTER(PortInfo))(
                    self.pointer, index, input_, c.byref(info))
                ports.append(dict(id=info.id, name=info.name.decode(), channels=info.channels,
                                  flags=info.flags, type=info.type.decode() if info.type else None, inPlacePair=info.pair))
            result[direction] = ports
        return result

    def activate(self):
        assert fn(self.plugin.activate, c.c_bool, c.c_void_p, c.c_double, c.c_uint32, c.c_uint32)(self.pointer, 48000., 1, 128)
        assert fn(self.plugin.start, c.c_bool, c.c_void_p)(self.pointer)
        self.active = True

    def stop(self):
        if self.active:
            fn(self.plugin.stop, None, c.c_void_p)(self.pointer)
            fn(self.plugin.deactivate, None, c.c_void_p)(self.pointer)
            self.active = False

    def close(self):
        if self.pointer:
            self.stop()
            fn(self.plugin.destroy, None, c.c_void_p)(self.pointer)
            self.pointer = None

    def call(self, method):
        generation = c.c_uint64()
        accepted = fn(self.script.call, c.c_bool, c.c_void_p, c.c_char_p, c.c_void_p, c.c_size_t, c.POINTER(c.c_uint64))(
            self.pointer, method.encode(), b"[]", 2, c.byref(generation))
        return accepted, generation.value

    def status(self, generation):
        return fn(self.script.status, c.c_uint32, c.c_void_p, c.c_uint64)(self.pointer, generation)

    def render(self, values, optional=True, malformed=False):
        # The first four output buffers are also the host's input buffers.
        frames = len(values[0])
        pcm = [(c.c_float * frames)(*channel) for channel in values] + [(c.c_float * frames)(*([99.] * frames))]
        pointers = (c.POINTER(c.c_float) * 5)(*pcm)
        at = lambda index: c.cast(c.byref(pointers, index * c.sizeof(c.c_void_p)), c.POINTER(c.POINTER(c.c_float)))
        inputs = (sdk.AudioBuffer * 2)(sdk.AudioBuffer(at(0), None, 3, 0, 0),
            sdk.AudioBuffer(at(3) if optional else None, None, 1 if optional else 0, 0, 0))
        outputs = (sdk.AudioBuffer * 2)(sdk.AudioBuffer(at(0), None, 3 if malformed else 4, 0, 0), sdk.AudioBuffer(at(4), None, 1, 0, 0))
        block = sdk.Process(-1, frames, None, c.cast(inputs, c.c_void_p), outputs, 2, 2, None, None)
        status = fn(self.plugin.process, c.c_int32, c.c_void_p, c.POINTER(sdk.Process))(self.pointer, c.byref(block))
        return status, [[float(sample) for sample in channel] for channel in pcm]

    def retire(self):
        fn(self.plugin.main, None, c.c_void_p)(self.pointer)


def wav(path, channels):
    data = b"".join(struct.pack("<" + "f" * len(channels), *frame) for frame in zip(*channels))
    count = len(channels)
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 3, count, 48000, 48000 * count * 4, count * 4, 32) + b"data" + struct.pack("<I", len(data))
    path.write_bytes(header + data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--module", type=Path, required=True)
    parser.add_argument("--package", type=Path, required=True)
    parser.add_argument("--comparison", type=Path, required=True, help="fresh browser/native comparison capsule")
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    args.evidence.mkdir(parents=True, exist_ok=False)
    report = dict(accepted=False, recordedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), editorOpened=False,
                  audioDeviceOpened=False, scope="exported CLAP bus discovery, process, live script and state ABI; not a DAW/device or performance proof")
    library = c.CDLL(str(args.module.resolve()))
    entry = sdk.Entry.in_dll(library, "clap_entry")
    assert fn(entry.init, c.c_bool, c.c_char_p)(str(args.module.resolve()).encode())
    factory = c.cast(fn(entry.get_factory, c.c_void_p, c.c_char_p)(b"clap.plugin-factory"), c.POINTER(sdk.Factory)).contents
    hosted = None
    try:
        package = args.package.read_bytes()
        hosted = Hosted(factory)
        assert hosted.load(package)
        report["initialRescans"] = hosted.rescans.copy()
        assert report["initialRescans"]
        report["ports"] = hosted.describe()
        assert [p["channels"] for p in report["ports"]["inputs"]] == [3, 1]
        assert [p["channels"] for p in report["ports"]["outputs"]] == [4, 1]
        hosted.activate()
        values = [[value] * 128 for value in (.125, -.25, .375, -.5)]
        pcm = bytearray()
        for _ in range(64):
            status, channels = hosted.render(values)
            assert status == 1
            pcm.extend(b"".join(struct.pack("<5f", *frame) for frame in zip(*channels)))
        (args.evidence / "clap.f32").write_bytes(pcm)
        for target in ("native", "browser"):
            reference = (args.comparison / f"{target}.f32").read_bytes()
            assert bytes(pcm) == reference, f"CLAP differs from {target}"
        report["comparison"] = dict(frames=8192, channels=5, nativeDifferingSamples=0, browserDifferingSamples=0)
        status, output = hosted.render(values, optional=False)
        assert status == 1
        assert [channel[0] for channel in output] == [.125, -.25, .375, 0., .0625]
        report["optionalDisconnectedValues"] = [channel[0] for channel in output]
        for index in range(5):
            accepted, generation = hosted.call("swap")
            assert accepted and hosted.status(generation) == 0
            status, output = hosted.render(values, malformed=True)
            assert status == 0 and output[4] == [99.] * 128 and hosted.status(generation) == 0
            status, output = hosted.render(values)
            assert status == 1 and hosted.status(generation) == 1
            assert [channel[0] for channel in output] == ([-.25, .125, .375, -.5, .0625] if index % 2 == 0 else [.125, -.25, .375, -.5, .0625])
            hosted.retire()
        report["liveSwaps"] = 5
        assert hosted.rescans == report["initialRescans"]
        report["activePortRescans"] = 0
        before = json.loads(hosted.save())
        for method in ("requestDifferentLayout", "requireAux"):
            assert not hosted.call(method)[0]
            assert json.loads(hosted.save()) == before
        saved = hosted.save()
        (args.evidence / "saved.manifold.json").write_bytes(saved)
        hosted.close()
        hosted = Hosted(factory)
        assert hosted.load(saved)
        assert hosted.describe() == report["ports"]
        hosted.activate()
        assert hosted.render(values)[1][0] == [-.25] * 128
        report["coldRecall"] = True
        # Audition real changing signals through the recalled four-channel bus.
        tape = [[] for _ in range(5)]
        for block in range(750):
            values = [[.12 * math.sin(2 * math.pi * frequency * (block * 128 + frame) / 48000) for frame in range(128)] for frequency in (220, 330, 440, 110)]
            status, channels = hosted.render(values)
            assert status == 1
            for destination, source in zip(tape, channels):
                destination.extend(source)
        wav(args.evidence / "stems-1-2.wav", tape[:2])
        wav(args.evidence / "stems-3-4.wav", tape[2:4])
        wav(args.evidence / "mono-send.wav", tape[4:])
        report["audition"] = dict(frames=96000, signal="four host sine inputs, authored output swap and half-level mono send; routing audition, not Main synthesis")
        report["rescans"] = hosted.rescans
        hosted.close()
        hosted = Hosted(factory, supported=False)
        before = hosted.save()
        assert not hosted.load(package) and hosted.save() == before
        report["hostRejectionPreservesState"] = True
        report["moduleSha256"] = hashlib.sha256(args.module.read_bytes()).hexdigest()
        report["packageSha256"] = hashlib.sha256(package).hexdigest()
        report["comparisonReportSha256"] = hashlib.sha256((args.comparison / "report.json").read_bytes()).hexdigest()
        report["heapCounters"] = "guarded in separate Rust callback tests; not observed across this shared-library boundary"
        report["accepted"] = True
        print(json.dumps(report))
    finally:
        if hosted is not None:
            hosted.close()
        fn(entry.deinit, None)()
        (args.evidence / "report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
