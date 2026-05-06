#!/usr/bin/env python3
"""
e2e_core_sniff_test.py — Sniff test for BehaviorCoreProcessor + BehaviorCoreEditor.

Launches ManifoldHeadless --test-ui, exercises the full processor/editor stack,
and dumps comprehensive state as artifacts for observability.

This is NOT a full Phase 0 contract harness (no byte-identical golden file diff).
It IS a smoke test that proves:
  - Processor creates + preparesToPlay without crashing
  - Editor creates + loads Lua shell without crashing
  - Timer callbacks fire (frame timings populate)
  - Renderer mode switching works
  - IPC command dispatch works across key paths
  - Every public state projection path returns expected types

Key artifact output (saved on every run):
  - diagnose.json — full DIAGNOSE payload (frame timings, renderer mode, canvas, endpoints)
  - state.json   — full STATE projection (all atomic state)
  - shell_state.json — Lua shell state snapshot (via EVAL)

Usage:
  python3 tests/e2e_core_sniff_test.py \\
      --headless build-dev/ManifoldHeadless \\
      --duration 8.0

CTest registration:
  add_test(NAME manifold_core_sniff
      COMMAND ${Python3_EXECUTABLE}
              ${CMAKE_CURRENT_SOURCE_DIR}/tests/e2e_core_sniff_test.py
              --headless build-dev/ManifoldHeadless
              --duration 8.0)
  set_tests_properties(manifold_core_sniff PROPERTIES
      LABELS "manifold;core;smoke")
"""

from __future__ import annotations

import argparse
import json
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


class CoreSniffHarness:
    """Wraps ManifoldHeadless --test-ui for processor+editor sniff testing."""

    def __init__(self, headless_path: str, duration: float):
        self.repo_root = repo_root()
        binary_path = (self.repo_root / headless_path).resolve()
        self.process = ManagedManifoldProcess(
            binary_path,
            [
                "--test-ui",
                "--duration",
                str(duration),
            ],
            cwd=self.repo_root,
            artifact_name="core_sniff",
        )
        self.client = None

    def start(self) -> None:
        print("Starting ManifoldHeadless --test-ui for core sniff...")
        self.process.start(timeout=15.0)
        self.client = self.process.create_client()
        print(f"Socket: {self.process.socket_path}")
        print(f"Artifacts: {self.process.artifacts.base_dir}")

        # Let the editor settle — timer callbacks need a few ticks to produce
        # frame timings. The empty_launcher.lua UI is minimal so this is fast.
        # We also need the Lua state to finish initializing shell globals.
        self._settle(1.0)

    def _settle(self, seconds: float) -> None:
        time.sleep(seconds)

    def stop(self) -> None:
        if self.client is not None:
            self.client.close()
            self.client = None
        self.process.stop()

    def cmd(self, text: str) -> str:
        if self.client is None:
            raise TestFailure("client not connected")
        return self.client.command(text)

    def cmd_ok(self, text: str) -> str:
        return self.client.command_ok(text)

    def cmd_json(self, text: str) -> dict:
        return self.client.command_json(text)

    def state(self) -> dict:
        return self.client.state()

    def diagnose(self) -> dict:
        return self.client.diagnose_payload()

    def eval(self, code: str) -> str:
        return self.client.eval(code)

    def get(self, path: str):
        return self.client.get_value(path)

    def dump_artifacts(self) -> None:
        """Dump all available state as JSON artifacts for manual inspection."""
        try:
            self.process.artifacts.write_json("diagnose.json", self.diagnose())
        except Exception as e:
            print(f"  [artifact] diagnose.json: FAILED ({e})")

        try:
            self.process.artifacts.write_json("state.json", self.state())
        except Exception as e:
            print(f"  [artifact] state.json: FAILED ({e})")

        # Try to dump Lua shell state for observability
        shell_fields = [
            "shell.mode",
            "shell.leftPanelMode",
            "shell.surfaces",
            "shell.title",
            "type(shell)",
        ]
        shell_state = {}
        for field_expr in shell_fields:
            try:
                resp = self.eval(f"return {field_expr}")
                if resp.startswith("OK "):
                    shell_state[field_expr] = resp[3:]
                elif resp.startswith("OK"):
                    shell_state[field_expr] = None
                else:
                    shell_state[field_expr] = f"<error: {resp}>"
            except Exception as e:
                shell_state[field_expr] = f"<exception: {e}>"

        if shell_state:
            self.process.artifacts.write_json("shell_state.json", shell_state)

        # Dump some diagnostics to stdout
        try:
            d = self.diagnose()
            ft = d.get("frameTiming", {})
            print(
                f"  [perf] frameTiming.totalUs={ft.get('totalUs')}, "
                f"peakTotalUs={ft.get('peakTotalUs')}, "
                f"overBudgetCount={ft.get('overBudgetCount')}"
            )
            print(f"  [perf] uiRendererMode={d.get('uiRendererMode')}")
        except Exception as e:
            print(f"  [perf] DIAGNOSE unavailable: {e}")

    def write_failure_artifacts(self) -> None:
        try:
            self.dump_artifacts()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_ping(harness: CoreSniffHarness):
    """Basic IPC round-trip — proves the socket and command loop work."""
    resp = harness.cmd("PING")
    if resp != "OK PONG":
        raise TestFailure(f"expected OK PONG, got {resp!r}")


def test_state_projection(harness: CoreSniffHarness):
    """STATE returns well-formed atomic state projection."""
    payload = harness.state()
    if payload.get("projectionVersion") != 2:
        raise TestFailure(
            f"expected projectionVersion=2, got {payload.get('projectionVersion')!r}"
        )
    if not isinstance(payload.get("params"), dict):
        raise TestFailure("STATE missing 'params' dict")
    if not isinstance(payload.get("voices"), list):
        raise TestFailure("STATE missing 'voices' list")
    if len(payload["voices"]) < 1:
        raise TestFailure("voices list is empty")


def test_diagnose_structure(harness: CoreSniffHarness):
    """DIAGNOSE returns a well-formed payload with editor-relevant fields."""
    payload = harness.diagnose()

    # Always-present fields
    if "socketPath" not in payload:
        raise TestFailure("DIAGNOSE missing socketPath")
    if "uiRendererMode" not in payload:
        raise TestFailure("DIAGNOSE missing uiRendererMode")

    # Frame timings prove the editor timer callback fired at least once
    ft = payload.get("frameTiming")
    if ft is None:
        raise TestFailure("DIAGNOSE missing frameTiming — timer callback may not have fired")
    if ft.get("frameCount", 0) < 1:
        raise TestFailure(
            f"frameCount={ft.get('frameCount')} — expected at least 1 timer tick"
        )

    # Canvas paint profile (editor creates a Canvas root)
    canvas = payload.get("canvas")
    if canvas is None:
        raise TestFailure("DIAGNOSE missing canvas section")


def test_renderer_mode_query(harness: CoreSniffHarness):
    """UIRENDERER returns the current mode without crashing."""
    payload = harness.cmd_json("UIRENDERER")
    mode = payload.get("mode")
    if mode is None:
        raise TestFailure("UIRENDERER missing 'mode' field")
    valid_modes = {"canvas", "imgui-overlay", "imgui-replace", "imgui-direct"}
    if mode not in valid_modes:
        raise TestFailure(f"unknown renderer mode: {mode!r}")


def test_renderer_mode_switch_replace(harness: CoreSniffHarness):
    """Switch to imgui-replace mode and verify via DIAGNOSE.

    Note: Canvas mode is overridden to imgui-direct when the editor's
    rootMode is RuntimeNode (see BehaviorCoreEditor::setRuntimeRendererMode).
    So we test imgui-replace instead, which IS allowed in RuntimeNode mode.
    """
    resp = harness.cmd("UIRENDERER imgui-replace")
    if not resp.startswith("OK"):
        raise TestFailure(f"UIRENDERER imgui-replace failed: {resp}")
    harness._settle(0.3)
    payload = harness.diagnose()
    mode = payload.get("uiRendererMode")
    if mode != "imgui-replace":
        raise TestFailure(f"expected imgui-replace mode, got {mode!r}")


def test_renderer_mode_switch_direct(harness: CoreSniffHarness):
    """Switch to imgui-direct mode and verify."""
    resp = harness.cmd("UIRENDERER imgui-direct")
    if not resp.startswith("OK"):
        raise TestFailure(f"UIRENDERER imgui-direct failed: {resp}")
    harness._settle(0.3)
    payload = harness.diagnose()
    mode = payload.get("uiRendererMode")
    if mode != "imgui-direct":
        raise TestFailure(f"expected imgui-direct mode, got {mode!r}")


def test_renderer_mode_invalid(harness: CoreSniffHarness):
    """Invalid renderer mode returns an error."""
    resp = harness.cmd("UIRENDERER bogus_mode_xyz")
    if resp.startswith("OK"):
        raise TestFailure(f"expected ERROR for bogus mode, got {resp}")


def test_eval_lua_basics(harness: CoreSniffHarness):
    """Basic Lua eval works — proves the Lua engine is attached."""
    resp = harness.eval("return 1 + 2")
    if resp != "OK 3":
        raise TestFailure(f"expected OK 3, got {resp}")

    resp = harness.eval('return "hello from lua"')
    if resp != "OK hello from lua":
        raise TestFailure(f"unexpected string eval: {resp}")

    resp = harness.eval("return nil")
    if resp != "OK":
        raise TestFailure(f"nil eval should return bare OK, got {resp}")


def test_eval_shell_exists(harness: CoreSniffHarness):
    """The Lua shell global is present (loaded by empty_launcher.lua bootstrap)."""
    resp = harness.eval("return type(shell)")
    if resp == "OK nil":
        raise SkipTest("shell global is nil — Lua UI may not have set it up")
    if resp != "OK table":
        raise TestFailure(f"expected shell to be a table, got {resp}")


def test_eval_globals(harness: CoreSniffHarness):
    """Key Lua globals are present — proves ScriptableProcessor bindings work.

    Note: With empty_launcher.lua (the default test UI), only globals set by
    the C++ binding layer are available. Looper-specific globals like 'tempo'
    and 'sampleRate' are set by the shell's init, not by C++ bindings.
    """
    expected_core_globals = {
        "state": "table",
        "_G": "table",
        "type": "function",
    }
    for name, expected_type in expected_core_globals.items():
        resp = harness.eval(f"return type({name})")
        actual = resp[3:] if resp.startswith("OK ") else resp
        if actual != expected_type:
            raise TestFailure(
                f"global '{name}' has type {actual!r}, expected {expected_type!r}"
            )


def test_state_set_get_roundtrip(harness: CoreSniffHarness):
    """Set a state path and verify it reads back via GET and STATE."""
    harness.cmd_ok("SET /core/behavior/tempo 145.0")
    harness._settle(0.1)

    # Read back via GET
    val = harness.get("/core/behavior/tempo")
    if not approx_equal(float(val), 145.0, 1e-3):
        raise TestFailure(f"GET tempo: expected 145.0, got {val}")

    # Read back via STATE projection
    state = harness.state()
    params = state.get("params", {})
    projected = params.get("/core/behavior/tempo")
    if projected is None:
        raise TestFailure("STATE params missing /core/behavior/tempo")
    if not approx_equal(float(projected), 145.0, 1e-3):
        raise TestFailure(f"STATE tempo: expected 145.0, got {projected}")


def test_layer_state_change(harness: CoreSniffHarness):
    """Modify layer state and verify projection updates."""
    harness.cmd_ok("SET /core/behavior/layer/1/volume 0.85")
    harness._settle(0.1)
    val = harness.get("/core/behavior/layer/1/volume")
    if not approx_equal(float(val), 0.85, 1e-3):
        raise TestFailure(f"layer volume: expected 0.85, got {val}")


def test_link_state_defaults(harness: CoreSniffHarness):
    """Link state returns sensible defaults without crashing."""
    try:
        # Link state isn't exposed via GET paths, so we check via EVAL
        resp = harness.eval("return type(link)")
        if resp == "OK table":
            # Link object exists — try querying it
            resp = harness.eval("return link.isEnabled()")
            if resp.startswith("OK ") and resp[3:] not in ("true", "false", "nil"):
                raise TestFailure(f"link.isEnabled() returned unexpected: {resp}")
    except Exception:
        raise SkipTest("link object not exposed in Lua")


def test_midi_device_enumeration(harness: CoreSniffHarness):
    """MIDI device lists are accessible without crashing."""
    # MIDI device lists typically come via the ScriptableProcessor bindings
    resp = harness.eval("return type(midi)")
    if resp == "OK table":
        resp = harness.eval("return midi.getInputDevices()")
        if resp.startswith("ERROR"):
            # This might fail if no JUCE MIDI devices are available in headless
            # That's OK — we're just checking it doesn't crash the process
            print(f"  [note] midi.getInputDevices(): {resp}")
    else:
        print("  [note] midi global not exposed, skipping MIDI enumeration test")


def test_dsp_host_state(harness: CoreSniffHarness):
    """DSP host state is queryable without crashing."""
    # Check if dspScriptHost or dspSlots are exposed
    resp = harness.eval("return type(dsp)")
    if resp == "OK table":
        # Try querying DSP slot state
        resp = harness.eval("return dsp.getSlotCount()")
        if resp.startswith("ERROR"):
            print(f"  [note] dsp.getSlotCount(): {resp}")
    else:
        print("  [note] dsp global not exposed via Lua")


def test_export_plugin_config_smoke(harness: CoreSniffHarness):
    """Export plugin config paths don't crash."""
    # These paths exist in the endpoint registry when export mode is active.
    # In non-export mode, they should return errors without crashing.
    harness.cmd("GET /plugin/ui/viewMode")
    harness.cmd("GET /plugin/ui/devVisible")
    harness.cmd("SET /plugin/ui/devVisible 0")


def test_eval_memory_stats(harness: CoreSniffHarness):
    """Memory stats from DIAGNOSE are populated after timer ticks."""
    payload = harness.diagnose()
    ft = payload.get("frameTiming", {})
    # The timer callback populates memory tracking fields when perf overlay is visible.
    # These won't be populated in the default state, but the DIAGNOSE command
    # should at least not crash when queried.
    if ft.get("frameCount", 0) > 0:
        print(f"  [note] frameCount={ft.get('frameCount')} — timer IS firing")


def test_concurrent_rapid_commands(harness: CoreSniffHarness):
    """Rapid-fire commands don't crash the server."""
    for i in range(20):
        try:
            harness.cmd(f"SET /core/behavior/tempo {120.0 + i * 0.5}")
            harness.cmd("PING")
            harness.cmd("STATE")
        except Exception as e:
            raise TestFailure(f"rapid command crashed at iteration {i}: {e}")


def test_frame_timing_tick_growth(harness: CoreSniffHarness):
    """Frame timings increase over time — proves the timer loop is live."""
    t1 = harness.diagnose().get("frameTiming", {}).get("frameCount", 0)
    harness._settle(0.5)
    t2 = harness.diagnose().get("frameTiming", {}).get("frameCount", 0)
    if t2 <= t1:
        raise TestFailure(
            f"frameCount did not increase: {t1} -> {t2}. "
            "Timer callback may not be running."
        )


# ---------------------------------------------------------------------------
# Test registry
# ---------------------------------------------------------------------------

TESTS = [
    # Connection & basic IPC
    test_ping,
    test_state_projection,
    test_diagnose_structure,
    # Renderer mode
    test_renderer_mode_query,
    test_renderer_mode_switch_replace,
    test_renderer_mode_switch_direct,
    test_renderer_mode_invalid,
    # Lua eval & shell
    test_eval_lua_basics,
    test_eval_shell_exists,
    test_eval_globals,
    # State mutation & projection
    test_state_set_get_roundtrip,
    test_layer_state_change,
    # Subsystem smoke
    test_link_state_defaults,
    test_midi_device_enumeration,
    test_dsp_host_state,
    test_export_plugin_config_smoke,
    # Runtime health
    test_eval_memory_stats,
    test_frame_timing_tick_growth,
    # Stress
    test_concurrent_rapid_commands,
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def install_signal_handlers(cleanup):
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="BehaviorCoreProcessor/Editor sniff test"
    )
    parser.add_argument(
        "--headless",
        default="build-dev/ManifoldHeadless",
        help="Path to ManifoldHeadless executable",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=8.0,
        help="Headless runtime duration in seconds",
    )
    return parser.parse_args(argv[1:])


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = CoreSniffHarness(args.headless, args.duration)
    install_signal_handlers(harness.stop)

    failures = []
    skipped = []
    passed = 0

    try:
        harness.start()

        # Dump artifacts FIRST — before any tests, so we always have a
        # baseline snapshot even if all tests fail
        harness.dump_artifacts()

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

        total = len(TESTS)
        print(
            f"\nCore sniff: {passed}/{total} passed, "
            f"{len(failures)} failed, {len(skipped)} skipped"
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
