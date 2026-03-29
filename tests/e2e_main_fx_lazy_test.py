#!/usr/bin/env python3
from __future__ import annotations

import argparse
import signal
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from harness import (  # noqa: E402
    ManagedManifoldProcess,
    TestFailure,
    approx_equal,
    repo_root,
    wait_for,
)


MAIN_DSP = "UserScripts/projects/Main/dsp/main.lua"
FX1_TYPE = "/midi/synth/fx1/type"
FX1_MIX = "/midi/synth/fx1/mix"
FX1_P0 = "/midi/synth/fx1/p/0"
FX2_TYPE = "/midi/synth/fx2/type"
FX2_MIX = "/midi/synth/fx2/mix"
FX2_P0 = "/midi/synth/fx2/p/0"


class MainFxLazyE2EHarness:
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
                "--test-ui",
            ],
            cwd=self.repo_root,
            artifact_name="headless_main_fx_lazy",
        )
        self.client = None

    def start(self) -> None:
        print("Starting ManifoldHeadless Main FX lazy harness...")
        self.process.start(timeout=12.0)
        self.client = self.process.create_client()
        print(f"Socket found: {self.process.socket_path}")
        print(f"Artifacts: {self.process.artifacts.base_dir}")

        if not wait_for(lambda: self.client.command("EVAL return 1") == "OK 1", timeout=4.0, step=0.05):
            raise TestFailure("lua engine never became ready")

    def stop(self) -> None:
        if self.client is not None:
            self.client.close()
            self.client = None
        self.process.stop()

    def eval(self, code: str) -> str:
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.eval(code)

    def command(self, text: str) -> str:
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.command(text)

    def state(self) -> dict:
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.state()

    def get_value(self, path: str):
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.get_value(path)

    def write_failure_artifacts(self) -> None:
        try:
            self.process.artifacts.write_json("state.json", self.state())
        except Exception:
            pass
        try:
            self.process.artifacts.write_text("process.log", self.process.get_log_text())
        except Exception:
            pass


def lua_quote(path: str) -> str:
    return path.replace("\\", "\\\\").replace('"', '\\"')


def expect_ok(response: str, context: str) -> str:
    if not response.startswith("OK"):
        raise TestFailure(f"{context}: expected OK response, got: {response}")
    return response


def wait_for_numeric(harness: MainFxLazyE2EHarness, path: str, expected: float, timeout: float = 2.0, tolerance: float = 1e-3):
    last_value = None

    def predicate() -> bool:
        nonlocal last_value
        try:
            last_value = harness.get_value(path)
            return approx_equal(float(last_value), float(expected), tolerance)
        except Exception:
            return False

    if not wait_for(predicate, timeout=timeout, step=0.05):
        raise TestFailure(f"expected {path}={expected}, got {last_value}")


def load_main_script(harness: MainFxLazyE2EHarness) -> None:
    script_path = (harness.repo_root / MAIN_DSP).resolve()
    if not script_path.exists():
        raise TestFailure(f"missing Main DSP script: {script_path}")

    response = harness.eval(f'return loadDspScript("{lua_quote(script_path.as_posix())}") and 1 or 0')
    if response != "OK 1":
        error_response = harness.eval("return getDspScriptLastError()")
        raise TestFailure(f"loadDspScript failed: {response}; dsp error: {error_response}")

    def fx_paths_ready() -> bool:
        try:
            a = harness.get_value(FX1_TYPE)
            b = harness.get_value(FX2_TYPE)
            return approx_equal(float(a), 0.0, 1e-3) and approx_equal(float(b), 0.0, 1e-3)
        except Exception:
            return False

    if not wait_for(fx_paths_ready, timeout=4.0, step=0.05):
        raise TestFailure("Main FX type paths never became readable")


def assert_log_clean(harness: MainFxLazyE2EHarness) -> None:
    log_text = harness.process.get_log_text()
    bad_fragments = [
        "Owner died",
        "stack smashing detected",
        "signal SIGABRT",
        "terminated by signal SIGABRT",
    ]
    for fragment in bad_fragments:
        if fragment in log_text:
            raise TestFailure(f"process log contains crash fragment: {fragment}")


def test_load_and_defaults(harness: MainFxLazyE2EHarness) -> None:
    load_main_script(harness)
    wait_for_numeric(harness, FX1_TYPE, 0.0)
    wait_for_numeric(harness, FX2_TYPE, 0.0)


def test_select_and_param_write(harness: MainFxLazyE2EHarness) -> None:
    expect_ok(harness.command(f"SET {FX1_MIX} 1.0"), "SET fx1 mix")
    expect_ok(harness.command(f"SET {FX1_TYPE} 4"), "SET fx1 type -> widener")
    wait_for_numeric(harness, FX1_TYPE, 4.0)
    expect_ok(harness.command(f"SET {FX1_P0} 0.8"), "SET fx1 p0")

    expect_ok(harness.command(f"SET {FX2_MIX} 1.0"), "SET fx2 mix")
    expect_ok(harness.command(f"SET {FX2_TYPE} 10"), "SET fx2 type -> pitch shift")
    wait_for_numeric(harness, FX2_TYPE, 10.0)
    expect_ok(harness.command(f"SET {FX2_P0} 0.2"), "SET fx2 p0")


def test_interleaved_toggles(harness: MainFxLazyE2EHarness) -> None:
    fx1_values = [0, 4, 10, 18]
    fx2_values = [0, 17, 5, 8]
    for index in range(40):
        a_value = fx1_values[index % len(fx1_values)]
        b_value = fx2_values[index % len(fx2_values)]
        expect_ok(harness.command(f"SET {FX1_TYPE} {a_value}"), f"fx1 toggle {index}")
        expect_ok(harness.command(f"SET {FX2_TYPE} {b_value}"), f"fx2 toggle {index}")
        wait_for_numeric(harness, FX1_TYPE, float(a_value), timeout=2.0)
        wait_for_numeric(harness, FX2_TYPE, float(b_value), timeout=2.0)
        ping = harness.command("PING")
        if ping != "OK PONG":
            raise TestFailure(f"iteration {index}: expected OK PONG, got {ping}")


def test_process_stays_alive(harness: MainFxLazyE2EHarness) -> None:
    if harness.process.proc is None or harness.process.proc.poll() is not None:
        raise TestFailure("headless process exited during Main FX lazy test")
    assert_log_clean(harness)


TESTS = [
    test_load_and_defaults,
    test_select_and_param_write,
    test_interleaved_toggles,
    test_process_stays_alive,
]


def install_signal_handlers(cleanup) -> None:
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Headless Main-project lazy FX-slot regression suite")
    parser.add_argument("--headless", default="build-dev/ManifoldHeadless", help="Path to ManifoldHeadless executable")
    parser.add_argument("--duration", type=float, default=35.0, help="Headless runtime duration in seconds")
    parser.add_argument("--samplerate", type=float, default=44100.0, help="Sample rate")
    parser.add_argument("--blocksize", type=int, default=512, help="Block size")
    return parser.parse_args(argv[1:])


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = MainFxLazyE2EHarness(args.headless, args.duration, args.samplerate, args.blocksize)
    install_signal_handlers(harness.stop)

    failures = []
    passed = 0

    try:
        harness.start()
        for test in TESTS:
            name = test.__name__
            try:
                test(harness)
                passed += 1
                print(f"  PASS: {name}")
            except TestFailure as exc:
                failures.append((name, str(exc)))
                print(f"  FAIL: {name}: {exc}")
                break

        print(f"Main FX lazy tests: {passed}/{len(TESTS)} passed, {len(failures)} failed")
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
    raise SystemExit(main(sys.argv))
