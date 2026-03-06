#!/usr/bin/env python3
import json
import os
import signal
import socket
import subprocess
import sys
import time


class InfrastructureError(Exception):
    pass


class TestFailure(Exception):
    pass


class SkipTest(Exception):
    pass


class ManifoldHeadlessHarness:
    def __init__(self):
        self.repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
        self.binary_path = os.path.join(self.repo_root, "build-dev", "ManifoldHeadless")
        self.log_path = os.path.join("/tmp", f"manifold_headless_e2e_{os.getpid()}.log")
        self.log_handle = None
        self.proc = None
        self.sock_path = None
        self.sock = None

    def start(self):
        if not os.path.isfile(self.binary_path):
            raise InfrastructureError(f"ManifoldHeadless not found: {self.binary_path}")

        print("Starting ManifoldHeadless...")
        self.log_handle = open(self.log_path, "w+", encoding="utf-8")
        self.proc = subprocess.Popen(
            [
                self.binary_path,
                "--duration",
                "30",
                "--blocksize",
                "512",
                "--samplerate",
                "44100",
            ],
            cwd=self.repo_root,
            stdin=subprocess.DEVNULL,
            stdout=self.log_handle,
            stderr=self.log_handle,
            text=True,
        )

        deadline = time.time() + 10.0
        expected_socket = f"/tmp/manifold_{self.proc.pid}.sock"
        while time.time() < deadline:
            if os.path.exists(expected_socket):
                self.sock_path = expected_socket
                break
            if self.proc.poll() is not None:
                raise InfrastructureError(
                    f"ManifoldHeadless exited early with code {self.proc.returncode}"
                )
            time.sleep(0.05)

        if not self.sock_path:
            raise InfrastructureError(f"Timed out waiting for socket: {expected_socket}")

        print(f"Socket found: {self.sock_path}")
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.sock_path)

    def stop(self):
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

        if self.proc is not None:
            if self.proc.poll() is None:
                try:
                    self.proc.terminate()
                    self.proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.proc.kill()
                    self.proc.wait(timeout=5)
            self.proc = None

        if self.log_handle is not None:
            try:
                self.log_handle.close()
            except OSError:
                pass
            self.log_handle = None

    def send_command(self, command):
        if self.sock is None:
            raise InfrastructureError("socket is not connected")

        self.sock.sendall((command + "\n").encode("utf-8"))
        response = bytearray()
        while True:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise InfrastructureError("socket closed while waiting for response")
            response.extend(chunk)
            if response.endswith(b"\n"):
                break
        return response[:-1].decode("utf-8", errors="replace")

    def get_log_tail(self, max_chars=2000):
        if not os.path.exists(self.log_path):
            return ""
        with open(self.log_path, "r", encoding="utf-8", errors="replace") as handle:
            data = handle.read()
        return data[-max_chars:]


def expect_ok(response):
    if not response.startswith("OK"):
        raise TestFailure(f"expected OK response, got: {response}")
    return response


def expect_error(response):
    if not response.startswith("ERROR"):
        raise TestFailure(f"expected ERROR response, got: {response}")
    return response


def parse_ok_json(response):
    expect_ok(response)
    if not response.startswith("OK "):
        raise TestFailure(f"expected JSON body, got: {response}")
    body = response[3:]
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise TestFailure(f"invalid JSON response: {exc}: {body}") from exc


def parse_ok_body(response):
    expect_ok(response)
    return response[3:] if response.startswith("OK ") else ""


def approx_equal(actual, expected, tolerance=1e-3):
    return abs(actual - expected) <= tolerance


def fetch_state(harness):
    return parse_ok_json(harness.send_command("STATE"))


def fetch_diagnose(harness):
    return parse_ok_json(harness.send_command("DIAGNOSE"))


def wait_for_param(harness, path, expected, tolerance=None, timeout=1.0):
    deadline = time.time() + timeout
    last_value = None
    while time.time() < deadline:
        state = fetch_state(harness)
        params = state.get("params", {})
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


def eval_command(harness, code):
    response = harness.send_command(f"EVAL {code}")
    if response == "ERROR no lua engine":
        raise SkipTest("no lua engine attached (headless mode)")
    return response


def test_ping(harness):
    response = harness.send_command("PING")
    if response != "OK PONG":
        raise TestFailure(f"expected OK PONG, got {response}")


def test_state_json(harness):
    payload = fetch_state(harness)
    if payload.get("projectionVersion") != 2:
        raise TestFailure(
            f"expected projectionVersion=2, got {payload.get('projectionVersion')!r}"
        )
    if not isinstance(payload.get("params"), dict):
        raise TestFailure("expected params object")
    if not isinstance(payload.get("voices"), list):
        raise TestFailure("expected voices array")


def test_diagnose_json(harness):
    payload = fetch_diagnose(harness)
    if "socketPath" not in payload:
        raise TestFailure("expected socketPath field")


def test_set_tempo(harness):
    expect_ok(harness.send_command("SET /core/behavior/tempo 142.5"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/tempo", 142.5, tolerance=1e-3)
    if not approx_equal(float(value), 142.5, 1e-3):
        raise TestFailure(f"expected 142.5, got {value}")


def test_set_layer(harness):
    expect_ok(harness.send_command("SET /core/behavior/layer 2"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/layer", 2)
    if value != 2:
        raise TestFailure(f"expected 2, got {value}")


def test_set_volume(harness):
    expect_ok(harness.send_command("SET /core/behavior/volume 0.73"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/volume", 0.73, tolerance=1e-3)
    if not approx_equal(float(value), 0.73, 1e-3):
        raise TestFailure(f"expected 0.73, got {value}")


def test_set_overdub(harness):
    expect_ok(harness.send_command("SET /core/behavior/overdub 1"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/overdub", 1)
    if value != 1:
        raise TestFailure(f"expected 1, got {value}")


def test_set_mode(harness):
    expect_ok(harness.send_command("SET /core/behavior/mode freeMode"))
    time.sleep(0.1)
    value = wait_for_param(harness, "/core/behavior/mode", "freeMode")
    if value != "freeMode":
        raise TestFailure(f"expected freeMode, got {value}")


def test_trigger_rec(harness):
    response = harness.send_command("TRIGGER /core/behavior/rec")
    if response != "OK":
        raise TestFailure(f"expected OK, got {response}")


def test_unknown_path(harness):
    expect_error(harness.send_command("SET /core/behavior/nonexistent 42"))


def test_legacy_rejected(harness):
    expect_error(harness.send_command("TEMPO 120"))


def test_bad_coercion(harness):
    expect_error(harness.send_command("SET /core/behavior/tempo notanumber"))


def test_get_value(harness):
    body = parse_ok_body(harness.send_command("GET /core/behavior/tempo"))
    if not body:
        raise TestFailure("expected non-empty GET body")


def test_connection_stability(harness):
    for index in range(10):
        response = harness.send_command("PING")
        if response != "OK PONG":
            raise TestFailure(f"iteration {index}: expected OK PONG, got {response}")


def test_voices_structure(harness):
    payload = fetch_state(harness)
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


def test_eval_arithmetic(harness):
    response = eval_command(harness, "return 1+1")
    if response != "OK 2":
        raise TestFailure(f"expected OK 2, got {response}")


def test_eval_string(harness):
    response = eval_command(harness, 'return "hello"')
    if response != "OK hello":
        raise TestFailure(f"expected OK hello, got {response}")


def test_eval_error(harness):
    response = eval_command(harness, 'error("boom")')
    if not response.startswith("ERROR"):
        raise TestFailure(f"expected ERROR response, got {response}")


def test_eval_nil(harness):
    response = eval_command(harness, "return nil")
    if response != "OK":
        raise TestFailure(f"expected OK, got {response}")


def test_eval_globals(harness):
    response = eval_command(harness, "return type(state)")
    if response != "OK table":
        raise TestFailure(f"expected OK table, got {response}")


def test_perf_reset(harness):
    expect_ok(harness.send_command("PERF RESET"))
    payload = fetch_diagnose(harness)
    frame_timing = payload.get("frameTiming")
    if frame_timing is None:
        raise SkipTest("no frame timing available (no editor/frame loop)")

    peak_total = frame_timing.get("peakTotalUs")
    if peak_total is None:
        raise TestFailure("frameTiming missing peakTotalUs")
    if int(peak_total) >= 50000:
        raise TestFailure(f"expected peakTotalUs < 50000 after reset, got {peak_total}")


def install_signal_handlers(cleanup):
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


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


def main():
    harness = ManifoldHeadlessHarness()
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
            f"E2E IPC Tests: {passed}/{len(TESTS)} passed, {len(failures)} failed, {len(skipped)} skipped"
        )

        if failures:
            log_tail = harness.get_log_tail()
            if log_tail:
                print("\nManifoldHeadless stderr (last 2000 chars):")
                print(log_tail)
            return 1
        return 0
    except KeyboardInterrupt:
        print("Interrupted")
        return 2
    except InfrastructureError as exc:
        print(f"Infrastructure error: {exc}")
        log_tail = harness.get_log_tail()
        if log_tail:
            print("\nManifoldHeadless stderr (last 2000 chars):")
            print(log_tail)
        return 2
    finally:
        harness.stop()


if __name__ == "__main__":
    sys.exit(main())
