#!/usr/bin/env python3
from __future__ import annotations

import argparse
import signal
import sys
import time
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from harness import (  # noqa: E402
    ManagedManifoldProcess,
    SkipTest,
    TestFailure,
    approx_equal,
    repo_root,
)


class CoreE2EHarness:
    def __init__(self, headless_path: str, duration: float, sample_rate: float, block_size: int):
        self.repo_root = repo_root()
        binary_path = (self.repo_root / headless_path).resolve()
        self.process = ManagedManifoldProcess(
            binary_path,
            [
                "--duration",
                str(duration),
                "--blocksize",
                str(block_size),
                "--samplerate",
                str(sample_rate),
            ],
            cwd=self.repo_root,
            artifact_name="headless_core_e2e",
        )
        self.client = None

    def start(self) -> None:
        print("Starting ManifoldHeadless core harness...")
        self.process.start(timeout=10.0)
        self.client = self.process.create_client()
        print(f"Socket found: {self.process.socket_path}")
        print(f"Artifacts: {self.process.artifacts.base_dir}")

    def stop(self) -> None:
        if self.client is not None:
            self.client.close()
            self.client = None
        self.process.stop()

    def command(self, text: str) -> str:
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.command(text)

    def state(self):
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.state()

    def diagnose(self):
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.diagnose_payload()

    def get_value(self, path: str):
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.get_value(path)

    def eval(self, code: str) -> str:
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.eval(code)

    def write_failure_artifacts(self) -> None:
        try:
            self.process.artifacts.write_json("diagnose.json", self.diagnose())
        except Exception:
            pass
        try:
            self.process.artifacts.write_json("state.json", self.state())
        except Exception:
            pass


def expect_ok(response: str) -> str:
    if not response.startswith("OK"):
        raise TestFailure(f"expected OK response, got: {response}")
    return response


def expect_error(response: str) -> str:
    if not response.startswith("ERROR"):
        raise TestFailure(f"expected ERROR response, got: {response}")
    return response


def wait_for_param(harness: CoreE2EHarness, path: str, expected, tolerance=None, timeout: float = 1.0):
    deadline = time.time() + timeout
    last_value = None
    while time.time() < deadline:
        params = harness.state().get("params", {})
        last_value = params.get(path)
        if tolerance is None:
            if last_value == expected:
                return last_value
        else:
            try:
                if approx_equal(float(last_value), float(expected), tolerance):
                    return last_value
            except (TypeError, ValueError):
                pass
        time.sleep(0.05)
    raise TestFailure(f"expected {path}={expected!r}, got {last_value!r}")


def test_ping(harness: CoreE2EHarness):
    response = harness.command("PING")
    if response != "OK PONG":
        raise TestFailure(f"expected OK PONG, got {response}")


def test_state_json(harness: CoreE2EHarness):
    payload = harness.state()
    if payload.get("projectionVersion") != 2:
        raise TestFailure(
            f"expected projectionVersion=2, got {payload.get('projectionVersion')!r}"
        )
    if not isinstance(payload.get("params"), dict):
        raise TestFailure("expected params object")
    if not isinstance(payload.get("voices"), list):
        raise TestFailure("expected voices array")


def test_diagnose_json(harness: CoreE2EHarness):
    payload = harness.diagnose()
    if "socketPath" not in payload:
        raise TestFailure("expected socketPath field")


def test_set_tempo(harness: CoreE2EHarness):
    expect_ok(harness.command("SET /core/behavior/tempo 142.5"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/tempo", 142.5, tolerance=1e-3)
    if not approx_equal(float(value), 142.5, 1e-3):
        raise TestFailure(f"expected 142.5, got {value}")


def test_set_layer(harness: CoreE2EHarness):
    expect_ok(harness.command("SET /core/behavior/layer 2"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/layer", 2)
    if value != 2:
        raise TestFailure(f"expected 2, got {value}")


def test_set_volume(harness: CoreE2EHarness):
    expect_ok(harness.command("SET /core/behavior/volume 0.73"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/volume", 0.73, tolerance=1e-3)
    if not approx_equal(float(value), 0.73, 1e-3):
        raise TestFailure(f"expected 0.73, got {value}")


def test_set_overdub(harness: CoreE2EHarness):
    expect_ok(harness.command("SET /core/behavior/overdub 1"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/overdub", 1)
    if value != 1:
        raise TestFailure(f"expected 1, got {value}")


def test_set_mode(harness: CoreE2EHarness):
    expect_ok(harness.command("SET /core/behavior/mode freeMode"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/mode", "freeMode")
    if value != "freeMode":
        raise TestFailure(f"expected freeMode, got {value}")


def test_trigger_rec(harness: CoreE2EHarness):
    response = harness.command("TRIGGER /core/behavior/rec")
    if response != "OK":
        raise TestFailure(f"expected OK, got {response}")


def test_unknown_path(harness: CoreE2EHarness):
    expect_error(harness.command("SET /core/behavior/nonexistent 42"))


def test_legacy_rejected(harness: CoreE2EHarness):
    expect_error(harness.command("TEMPO 120"))


def test_bad_coercion(harness: CoreE2EHarness):
    expect_error(harness.command("SET /core/behavior/tempo notanumber"))


def test_get_value(harness: CoreE2EHarness):
    payload = harness.client.command_json("GET /core/behavior/tempo")
    if "VALUE" not in payload:
        raise TestFailure(f"expected VALUE field, got {payload}")


def test_connection_stability(harness: CoreE2EHarness):
    for index in range(10):
        response = harness.command("PING")
        if response != "OK PONG":
            raise TestFailure(f"iteration {index}: expected OK PONG, got {response}")


def test_voices_structure(harness: CoreE2EHarness):
    payload = harness.state()
    voices = payload.get("voices")
    if not isinstance(voices, list):
        raise TestFailure("voices is not a list")
    if not voices:
        raise TestFailure("voices is empty")

    first = voices[0]
    required = {"id", "path", "state", "length", "position", "speed", "volume"}
    missing = sorted(required.difference(first.keys()))
    if missing:
        raise TestFailure(f"voices[0] missing keys: {', '.join(missing)}")


def test_eval_arithmetic(harness: CoreE2EHarness):
    response = harness.eval("return 1+1")
    if response != "OK 2":
        raise TestFailure(f"expected OK 2, got {response}")


def test_eval_string(harness: CoreE2EHarness):
    response = harness.eval('return "hello"')
    if response != "OK hello":
        raise TestFailure(f"expected OK hello, got {response}")


def test_eval_error(harness: CoreE2EHarness):
    response = harness.eval('error("boom")')
    if not response.startswith("ERROR"):
        raise TestFailure(f"expected ERROR response, got {response}")


def test_eval_nil(harness: CoreE2EHarness):
    response = harness.eval("return nil")
    if response != "OK":
        raise TestFailure(f"expected OK, got {response}")


def test_eval_globals(harness: CoreE2EHarness):
    response = harness.eval("return type(state)")
    if response != "OK table":
        raise TestFailure(f"expected OK table, got {response}")


def test_perf_reset(harness: CoreE2EHarness):
    harness.client.reset_perf()
    payload = harness.diagnose()
    frame_timing = payload.get("frameTiming")
    if frame_timing is None:
        raise SkipTest("no frame timing available (no editor/frame loop)")

    peak_total = frame_timing.get("peakTotalUs")
    if peak_total is None:
        raise TestFailure("frameTiming missing peakTotalUs")
    if int(peak_total) >= 50000:
        raise TestFailure(f"expected peakTotalUs < 50000 after reset, got {peak_total}")


TESTS = [
    test_ping,
    test_state_json,
    test_diagnose_json,
    test_set_tempo,
    test_set_layer,
    test_set_volume,
    test_set_overdub,
    test_set_mode,
    test_trigger_rec,
    test_unknown_path,
    test_legacy_rejected,
    test_bad_coercion,
    test_get_value,
    test_connection_stability,
    test_voices_structure,
    test_eval_arithmetic,
    test_eval_string,
    test_eval_error,
    test_eval_nil,
    test_eval_globals,
    test_perf_reset,
]


def install_signal_handlers(cleanup):
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Headless IPC core regression suite")
    parser.add_argument("--headless", default="build-dev/ManifoldHeadless", help="Path to ManifoldHeadless executable")
    parser.add_argument("--duration", type=float, default=30.0, help="Headless runtime duration in seconds")
    parser.add_argument("--samplerate", type=float, default=44100.0, help="Sample rate")
    parser.add_argument("--blocksize", type=int, default=512, help="Block size")
    return parser.parse_args(argv[1:])


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = CoreE2EHarness(args.headless, args.duration, args.samplerate, args.blocksize)
    install_signal_handlers(harness.stop)

    failures = []
    skipped = []
    passed = 0

    try:
        harness.start()

        for test in TESTS:
            name = test.__name__
            try:
                test(harness)
                passed += 1
                print(f"  PASS: {name}")
            except SkipTest as exc:
                skipped.append((name, str(exc)))
                print(f"  SKIP: {name}: {exc}")
            except TestFailure as exc:
                failures.append((name, str(exc)))
                print(f"  FAIL: {name}: {exc}")

        print(
            f"Headless IPC core tests: {passed}/{len(TESTS)} passed, {len(failures)} failed, {len(skipped)} skipped"
        )

        if failures:
            harness.write_failure_artifacts()
            log_tail = harness.process.get_log_tail()
            if log_tail:
                print("\nManifoldHeadless log tail:")
                print(log_tail)
            print(f"Artifacts: {harness.process.artifacts.base_dir}")
            return 1
        return 0
    except KeyboardInterrupt:
        print("Interrupted")
        return 2
    except Exception as exc:
        harness.write_failure_artifacts()
        print(f"Infrastructure error: {exc}")
        log_tail = harness.process.get_log_tail()
        if log_tail:
            print("\nManifoldHeadless log tail:")
            print(log_tail)
        print(f"Artifacts: {harness.process.artifacts.base_dir}")
        return 2
    finally:
        harness.stop()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
