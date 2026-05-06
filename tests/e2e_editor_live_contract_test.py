#!/usr/bin/env python3
"""
e2e_editor_live_contract_test.py — Live editor execution contract.

Launches ManifoldHeadless --test-ui, drives real editor state (shell mode,
left panel, script editor, perf overlay, screenshot, renderer mode switch),
and snapshots the full editor contract after each transition. Validates that
the running editor responds deterministically to live control inputs.

Usage:
  python3 tests/e2e_editor_live_contract_test.py \\
      --headless build-dev/ManifoldHeadless \\
      --duration 20.0
"""

from __future__ import annotations

import argparse
import json
import signal
import struct
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from harness import (
    ManagedManifoldProcess,
    TestFailure,
    repo_root,
    wait_for,
)


class EditorLiveContractHarness:
    def __init__(self, headless_path: str, duration: float):
        self.repo_root = repo_root()
        binary_path = (self.repo_root / headless_path).resolve()
        self.process = ManagedManifoldProcess(
            binary_path,
            ["--test-ui", "--duration", str(duration)],
            cwd=self.repo_root,
            artifact_name="editor_live_contract",
        )
        self.client = None

        self.home_dir = self.process.artifacts.base_dir / "home"
        self.config_dir = self.home_dir / ".config"
        self.data_dir = self.home_dir / ".local" / "share"
        self.home_dir.mkdir(parents=True, exist_ok=True)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.process.env.update({
            "HOME": str(self.home_dir),
            "XDG_CONFIG_HOME": str(self.config_dir),
            "XDG_DATA_HOME": str(self.data_dir),
            "MANIFOLD_PROFILE_WINDOW_SIZE": "1000x640",
            "MANIFOLD_RENDERER": "imgui-direct",
        })

    def start(self) -> None:
        self.process.start(timeout=15.0)
        self.client = self.process.create_client()

        def editor_ready() -> bool:
            try:
                if self.client.command("EVAL return type(shell)") != "OK table":
                    return False
                es = self.client.command_json("EDITORSTATE")
                return es.get("usingLuaUi") is True and es.get("shell", {}).get("exists") is True
            except Exception:
                return False

        if not wait_for(editor_ready, timeout=6.0, step=0.05):
            raise TestFailure("editor state never became ready")

        def timer_ready() -> bool:
            try:
                d = self.client.diagnose_payload()
                return d.get("frameTiming", {}).get("frameCount", 0) >= 1
            except Exception:
                return False

        if not wait_for(timer_ready, timeout=4.0, step=0.05):
            raise TestFailure("editor timer never produced frame timings")

    def stop(self) -> None:
        if self.client is not None:
            self.client.close()
            self.client = None
        self.process.stop()

    def command(self, text: str) -> str:
        if self.client is None:
            raise TestFailure("client not connected")
        return self.client.command(text)

    def command_ok(self, text: str) -> str:
        if self.client is None:
            raise TestFailure("client not connected")
        return self.client.command_ok(text)

    def command_json(self, text: str) -> dict:
        if self.client is None:
            raise TestFailure("client not connected")
        return self.client.command_json(text)

    def eval(self, code: str) -> str:
        if self.client is None:
            raise TestFailure("client not connected")
        return self.client.eval(code)

    def editor_state(self) -> dict:
        return self.command_json("EDITORSTATE")

    def diagnose(self) -> dict:
        return self.client.diagnose_payload()

    def settle(self, seconds: float = 0.15) -> None:
        import time
        time.sleep(seconds)

    def write_failure_artifacts(self) -> None:
        try:
            self.process.artifacts.write_json("diagnose.json", self.diagnose())
        except Exception:
            pass
        try:
            self.process.artifacts.write_json("editor_state.json", self.editor_state())
        except Exception:
            pass


def canonical_json(payload: object) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def host_subset(editor_state: dict) -> dict:
    hosts = editor_state.get("hosts", {})
    result: dict = {}
    for name in (
        "mainScriptEditor", "scriptList", "hierarchy", "inspector",
        "scriptInspector", "perfOverlay", "runtimeNodeDebug", "directHost",
    ):
        h = hosts.get(name, {})
        result[name] = {
            "visible": bool(h.get("visible", False)),
            "x": int(h.get("x", 0)),
            "y": int(h.get("y", 0)),
            "w": int(h.get("w", 0)),
            "h": int(h.get("h", 0)),
        }
    return result


def contract_dump(harness: EditorLiveContractHarness) -> dict:
    es = harness.editor_state()
    diag = harness.diagnose()
    ft = diag.get("frameTiming", {})
    return {
        "editorContract": {
            "rootMode": es.get("rootMode"),
            "rendererMode": es.get("rendererMode"),
            "usingLuaUi": es.get("usingLuaUi"),
            "directHostNeedsInitialFocus": es.get("directHostNeedsInitialFocus"),
            "uiIdleSnapshotCaptured": es.get("uiIdleSnapshotCaptured"),
            "shell": {
                "mode": es.get("shell", {}).get("mode"),
                "leftPanelMode": es.get("shell", {}).get("leftPanelMode"),
                "editContentMode": es.get("shell", {}).get("editContentMode"),
                "scriptEditorPath": es.get("shell", {}).get("scriptEditorPath"),
                "scriptEditorFocused": es.get("shell", {}).get("scriptEditorFocused"),
                "perfOverlayVisible": es.get("shell", {}).get("perfOverlayVisible"),
                "perfOverlayActiveTab": es.get("shell", {}).get("perfOverlayActiveTab"),
            },
            "hosts": host_subset(es),
        },
        "diag": {
            "uiRendererMode": diag.get("uiRendererMode"),
            "frameCount": ft.get("frameCount", 0),
            "editorWidth": ft.get("editorWidth", 0),
            "editorHeight": ft.get("editorHeight", 0),
        },
    }


def write_contract(harness: EditorLiveContractHarness, path: Path) -> dict:
    c = contract_dump(harness)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(canonical_json(c), encoding="utf-8")
    print(f"Contract written to {path}")
    return c


def verify_contract(harness: EditorLiveContractHarness, golden_path: Path) -> bool:
    c = contract_dump(harness)
    actual = canonical_json(c)
    if not golden_path.exists():
        raise TestFailure(f"golden file does not exist: {golden_path}")
    expected = canonical_json(json.loads(golden_path.read_text(encoding="utf-8")))
    if expected == actual:
        print(f"Contract PASS ({golden_path})")
        return True
    actual_path = harness.process.artifacts.write_text("contract_mismatch.actual.json", actual)
    print(f"Contract MISMATCH: expected={golden_path} actual={actual_path}")
    return False


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_editor_initial_state(harness: EditorLiveContractHarness):
    """Editor is in RuntimeNode root mode with imgui-direct renderer."""
    es = harness.editor_state()
    assert es.get("rootMode") == "RuntimeNode", f"rootMode={es.get('rootMode')}"
    assert es.get("rendererMode") == "imgui-direct", f"rendererMode={es.get('rendererMode')}"
    assert es.get("usingLuaUi") is True, "usingLuaUi should be true"
    hosts = es.get("hosts", {})
    dh = hosts.get("directHost", {})
    assert dh.get("visible") is True, "directHost should be visible initially"
    print("OK editor initial state")


def test_shell_present(harness: EditorLiveContractHarness):
    """Lua shell global exists with expected structure."""
    resp = harness.eval("return type(shell)")
    assert resp == "OK table", f"shell type: {resp}"
    resp = harness.eval("return shell.mode")
    assert resp.startswith("OK "), f"shell.mode: {resp}"
    es = harness.editor_state()
    shell = es.get("shell", {})
    assert shell.get("exists") is True, "shell.exists should be true"
    print("OK shell present")


def test_set_mode_performance(harness: EditorLiveContractHarness):
    """Switch to performance mode and verify."""
    resp = harness.eval("shell:setMode('performance')")
    assert resp.startswith("OK") or resp.startswith("OK nil"), f"setMode: {resp}"
    harness.settle()
    es = harness.editor_state()
    assert es["shell"]["mode"] == "performance", f"mode={es['shell']['mode']}"
    harness.eval("shell:setMode('edit')")
    harness.settle()
    print("OK setMode performance")


def test_left_panel_toggle(harness: EditorLiveContractHarness):
    """Toggle left panel between hierarchy and scripts."""
    harness.eval("shell:setLeftPanelMode('hierarchy')")
    harness.settle()
    es = harness.editor_state()
    assert es["shell"]["leftPanelMode"] == "hierarchy"
    harness.eval("shell:setLeftPanelMode('scripts')")
    harness.settle()
    es = harness.editor_state()
    assert es["shell"]["leftPanelMode"] == "scripts"
    print("OK leftPanelMode toggle")


def test_perf_overlay_toggle(harness: EditorLiveContractHarness):
    """Toggle performance overlay on/off and verify state."""
    harness.eval("shell:setPerfOverlayVisible(true)")
    harness.settle()
    es = harness.editor_state()
    assert es["shell"]["perfOverlayVisible"] is True, "perfOverlay should be visible"
    hosts = es.get("hosts", {})
    assert hosts["perfOverlay"]["visible"] is True
    harness.eval("shell:setPerfOverlayVisible(false)")
    harness.settle()
    es = harness.editor_state()
    assert es["shell"]["perfOverlayVisible"] is False, "perfOverlay should be hidden"
    print("OK perfOverlay toggle")


def test_renderer_mode_switch(harness: EditorLiveContractHarness):
    """Switch renderer modes via IPC and verify via editor state."""
    harness.command_ok("UIRENDERER imgui-replace")
    harness.settle(0.3)
    es = harness.editor_state()
    assert es.get("rendererMode") == "imgui-replace", f"rendererMode={es.get('rendererMode')}"
    harness.command_ok("UIRENDERER imgui-direct")
    harness.settle(0.3)
    es = harness.editor_state()
    assert es.get("rendererMode") == "imgui-direct", f"rendererMode={es.get('rendererMode')}"
    print("OK renderer mode switch")


def test_screenshot_request(harness: EditorLiveContractHarness):
    """SCREENSHOT command returns a valid path and creates a file."""
    shot_path = harness.process.artifacts.base_dir / "editor_screenshot.png"
    resp = harness.command(f"SCREENSHOT {shot_path}")
    assert resp.startswith("OK"), f"screenshot: {resp}"
    harness.settle(0.3)
    assert shot_path.exists(), f"screenshot file not found: {shot_path}"
    with open(shot_path, "rb") as f:
        sig = f.read(8)
    assert sig == b"\x89PNG\r\n\x1a\n", "screenshot is not a PNG"
    w, h = struct.unpack(">II", open(shot_path, "rb").read()[16:24])
    assert w > 0 and h > 0, f"bad screenshot dimensions: {w}x{h}"
    print(f"OK screenshot {w}x{h}")


def test_frame_timings_exist(harness: EditorLiveContractHarness):
    """DIAGNOSE frame timings have non-trivial values."""
    d = harness.diagnose()
    ft = d.get("frameTiming", {})
    assert ft.get("frameCount", 0) >= 2, f"frameCount={ft.get('frameCount')}"
    assert ft.get("totalUs", 0) > 0, "totalUs should be > 0"
    assert ft.get("editorWidth", 0) > 0, "editorWidth > 0"
    assert ft.get("editorHeight", 0) > 0, "editorHeight > 0"
    print("OK frame timings")


def test_editor_state_query(harness: EditorLiveContractHarness):
    """EDITORSTATE returns valid JSON with all expected fields."""
    es = harness.editor_state()
    for key in ("rootMode", "rendererMode", "usingLuaUi", "hosts", "shell"):
        assert key in es, f"missing key: {key}"
    hosts = es.get("hosts", {})
    for name in ("directHost", "mainScriptEditor", "perfOverlay"):
        assert name in hosts, f"missing host: {name}"
    print("OK editor state query")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Editor live contract harness")
    parser.add_argument("--headless", default="build-dev/ManifoldHeadless", help="Path to ManifoldHeadless")
    parser.add_argument("--duration", type=float, default=20.0, help="Runtime duration in seconds")
    return parser.parse_args(argv[1:])


def install_signal_handlers(cleanup) -> None:
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")
    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = EditorLiveContractHarness(args.headless, args.duration)
    install_signal_handlers(harness.stop)

    try:
        harness.start()

        tests = [
            ("editor_initial_state", test_editor_initial_state),
            ("shell_present", test_shell_present),
            ("set_mode_performance", test_set_mode_performance),
            ("left_panel_toggle", test_left_panel_toggle),
            ("perf_overlay_toggle", test_perf_overlay_toggle),
            ("renderer_mode_switch", test_renderer_mode_switch),
            ("screenshot_request", test_screenshot_request),
            ("frame_timings_exist", test_frame_timings_exist),
            ("editor_state_query", test_editor_state_query),
        ]

        passed = 0
        failed = 0
        for name, func in tests:
            try:
                func(harness)
                passed += 1
            except Exception as exc:
                harness.write_failure_artifacts()
                print(f"FAIL {name}: {exc}")
                failed += 1

        print(f"\n{passed}/{passed + failed} tests passed")
        return 0 if failed == 0 else 1

    except KeyboardInterrupt:
        print("Interrupted")
        return 2
    except Exception as exc:
        harness.write_failure_artifacts()
        print(f"Fatal failure: {exc}")
        log_tail = harness.process.get_log_tail()
        if log_tail:
            print("\nLog tail:\n")
            print(log_tail)
        print(f"Artifacts: {harness.process.artifacts.base_dir}")
        return 1
    finally:
        harness.stop()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
