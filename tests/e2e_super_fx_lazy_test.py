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
SUPER_RUNTIME_DSP = "UserScripts/projects/Main/dsp/super_slot_runtime.lua"
VOCAL_SELECT = "/core/super/vocal/slot/select"
LAYER0_SELECT = "/core/super/layer/0/fx/select"
LAYER1_SELECT = "/core/super/layer/1/fx/select"
LAYER2_SELECT = "/core/super/layer/2/fx/select"
LAYER3_SELECT = "/core/super/layer/3/fx/select"


class SuperFxLazyE2EHarness:
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
            artifact_name="headless_super_fx_lazy",
        )
        self.client = None

    def start(self) -> None:
        print("Starting ManifoldHeadless Super FX lazy harness...")
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


def wait_for_numeric(harness: SuperFxLazyE2EHarness, path: str, expected: float, timeout: float = 2.5, tolerance: float = 1e-3):
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


def load_main_and_super(harness: SuperFxLazyE2EHarness) -> None:
    main_path = (harness.repo_root / MAIN_DSP).resolve()
    super_path = (harness.repo_root / SUPER_RUNTIME_DSP).resolve()
    if not main_path.exists():
        raise TestFailure(f"missing Main DSP script: {main_path}")
    if not super_path.exists():
        raise TestFailure(f"missing Super runtime DSP script: {super_path}")

    response = harness.eval(f'return loadDspScript("{lua_quote(main_path.as_posix())}") and 1 or 0')
    if response != "OK 1":
        error_response = harness.eval("return getDspScriptLastError()")
        raise TestFailure(f"loadDspScript(Main) failed: {response}; dsp error: {error_response}")

    response = harness.eval(f'return loadDspScriptInSlot("{lua_quote(super_path.as_posix())}", "super") and 1 or 0')
    if response != "OK 1":
        raise TestFailure(f"loadDspScriptInSlot(super) failed: {response}")

    def super_paths_ready() -> bool:
        try:
            v = harness.get_value(VOCAL_SELECT)
            a = harness.get_value(LAYER0_SELECT)
            return approx_equal(float(v), 0.0, 1e-3) and approx_equal(float(a), 0.0, 1e-3)
        except Exception:
            return False

    if not wait_for(super_paths_ready, timeout=4.0, step=0.05):
        raise TestFailure("Super slot select paths never became readable")


def assert_log_clean(harness: SuperFxLazyE2EHarness) -> None:
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


def test_load_and_defaults(harness: SuperFxLazyE2EHarness) -> None:
    load_main_and_super(harness)
    wait_for_numeric(harness, VOCAL_SELECT, 0.0)
    wait_for_numeric(harness, LAYER0_SELECT, 0.0)


def test_select_and_stay_alive(harness: SuperFxLazyE2EHarness) -> None:
    expect_ok(harness.command(f"SET {VOCAL_SELECT} 20"), "SET vocal select -> widener")
    wait_for_numeric(harness, VOCAL_SELECT, 20.0)
    expect_ok(harness.command(f"SET {LAYER0_SELECT} 13"), "SET layer0 select -> granulator")
    wait_for_numeric(harness, LAYER0_SELECT, 13.0)
    expect_ok(harness.command(f"SET {LAYER1_SELECT} 17"), "SET layer1 select -> compressor")
    wait_for_numeric(harness, LAYER1_SELECT, 17.0)


def test_interleaved_toggles(harness: SuperFxLazyE2EHarness) -> None:
    values = [0, 20, 7, 13, 17]
    layer_paths = [LAYER0_SELECT, LAYER1_SELECT, LAYER2_SELECT, LAYER3_SELECT]
    for index in range(24):
        vocal_value = values[index % len(values)]
        expect_ok(harness.command(f"SET {VOCAL_SELECT} {vocal_value}"), f"vocal toggle {index}")
        wait_for_numeric(harness, VOCAL_SELECT, float(vocal_value), timeout=2.0)
        for layer_idx, path in enumerate(layer_paths):
            layer_value = values[(index + layer_idx) % len(values)]
            expect_ok(harness.command(f"SET {path} {layer_value}"), f"layer toggle {index}:{layer_idx}")
            wait_for_numeric(harness, path, float(layer_value), timeout=2.0)
        ping = harness.command("PING")
        if ping != "OK PONG":
            raise TestFailure(f"iteration {index}: expected OK PONG, got {ping}")


def test_process_stays_alive(harness: SuperFxLazyE2EHarness) -> None:
    if harness.process.proc is None or harness.process.proc.poll() is not None:
        raise TestFailure("headless process exited during Super FX lazy test")
    assert_log_clean(harness)


TESTS = [
    test_load_and_defaults,
    test_select_and_stay_alive,
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
    parser = argparse.ArgumentParser(description="Headless Super-slot lazy FX regression suite")
    parser.add_argument("--headless", default="build-dev/ManifoldHeadless", help="Path to ManifoldHeadless executable")
    parser.add_argument("--duration", type=float, default=40.0, help="Headless runtime duration in seconds")
    parser.add_argument("--samplerate", type=float, default=44100.0, help="Sample rate")
    parser.add_argument("--blocksize", type=int, default=512, help="Block size")
    return parser.parse_args(argv[1:])


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = SuperFxLazyE2EHarness(args.headless, args.duration, args.samplerate, args.blocksize)
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

        print(f"Super FX lazy tests: {passed}/{len(TESTS)} passed, {len(failures)} failed")
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
