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
    TestFailure,
    approx_equal,
    repo_root,
    wait_for,
)


HARNESS_DSP = "UserScripts/projects/DspLiveScripting/dsp/fx_slot_swap_harness.lua"
SLOT_A_SELECT = "/test/fxslot/slotA/select"
SLOT_B_SELECT = "/test/fxslot/slotB/select"
SLOT_A_WIDTH = "/test/fxslot/slotA/width/amount"
SLOT_B_GAIN = "/test/fxslot/slotB/gain/amount"


class FxSlotSwapE2EHarness:
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
            artifact_name="headless_fx_slot_swap",
        )
        self.client = None

    def start(self) -> None:
        print("Starting ManifoldHeadless FX-slot swap harness...")
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


def wait_for_numeric(harness: FxSlotSwapE2EHarness, path: str, expected: float, timeout: float = 1.5, tolerance: float = 1e-3):
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


def load_harness_script(harness: FxSlotSwapE2EHarness) -> None:
    script_path = (harness.repo_root / HARNESS_DSP).resolve()
    if not script_path.exists():
        raise TestFailure(f"missing harness DSP script: {script_path}")

    response = harness.eval(f'return loadDspScript("{lua_quote(script_path.as_posix())}") and 1 or 0')
    if response != "OK 1":
        error_response = harness.eval("return getDspScriptLastError()")
        raise TestFailure(f"loadDspScript failed: {response}; dsp error: {error_response}")

    def select_path_ready() -> bool:
        try:
            value = harness.get_value(SLOT_A_SELECT)
            return approx_equal(float(value), 0.0, 1e-3)
        except Exception:
            return False

    if not wait_for(select_path_ready, timeout=3.0, step=0.05):
        raise TestFailure("harness select path never became readable")


def assert_log_clean(harness: FxSlotSwapE2EHarness) -> None:
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


def test_load_and_defaults(harness: FxSlotSwapE2EHarness) -> None:
    load_harness_script(harness)
    wait_for_numeric(harness, SLOT_A_SELECT, 0.0)
    wait_for_numeric(harness, SLOT_B_SELECT, 0.0)


def test_inactive_param_write_then_select(harness: FxSlotSwapE2EHarness) -> None:
    expect_ok(harness.command(f"SET {SLOT_A_WIDTH} 1.3"), "SET slotA width amount")
    expect_ok(harness.command(f"SET {SLOT_A_SELECT} 1"), "SET slotA select -> width")
    wait_for_numeric(harness, SLOT_A_SELECT, 1.0)
    expect_ok(harness.command(f"SET {SLOT_B_GAIN} 0.6"), "SET slotB gain amount")
    expect_ok(harness.command(f"SET {SLOT_B_SELECT} 1"), "SET slotB select -> width")
    wait_for_numeric(harness, SLOT_B_SELECT, 1.0)


def test_interleaved_slot_toggles(harness: FxSlotSwapE2EHarness) -> None:
    for index in range(80):
        a_value = index % 2
        b_value = (index + 1) % 2
        expect_ok(harness.command(f"SET {SLOT_A_SELECT} {a_value}"), f"slotA toggle {index}")
        expect_ok(harness.command(f"SET {SLOT_B_SELECT} {b_value}"), f"slotB toggle {index}")
        wait_for_numeric(harness, SLOT_A_SELECT, float(a_value), timeout=1.0)
        wait_for_numeric(harness, SLOT_B_SELECT, float(b_value), timeout=1.0)
        ping = harness.command("PING")
        if ping != "OK PONG":
            raise TestFailure(f"iteration {index}: expected OK PONG, got {ping}")


def test_process_stays_alive(harness: FxSlotSwapE2EHarness) -> None:
    if harness.process.proc is None or harness.process.proc.poll() is not None:
        raise TestFailure("headless process exited during FX-slot swap test")
    assert_log_clean(harness)


TESTS = [
    test_load_and_defaults,
    test_inactive_param_write_then_select,
    test_interleaved_slot_toggles,
    test_process_stays_alive,
]


def install_signal_handlers(cleanup) -> None:
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Headless FX-slot additive swap regression suite")
    parser.add_argument("--headless", default="build-dev/ManifoldHeadless", help="Path to ManifoldHeadless executable")
    parser.add_argument("--duration", type=float, default=30.0, help="Headless runtime duration in seconds")
    parser.add_argument("--samplerate", type=float, default=44100.0, help="Sample rate")
    parser.add_argument("--blocksize", type=int, default=512, help="Block size")
    return parser.parse_args(argv[1:])


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = FxSlotSwapE2EHarness(args.headless, args.duration, args.samplerate, args.blocksize)
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

        print(f"FX-slot swap tests: {passed}/{len(TESTS)} passed, {len(failures)} failed")
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
