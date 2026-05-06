#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import signal
import sys
import time
from pathlib import Path
from typing import Any, Callable

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from harness import ManagedManifoldProcess, TestFailure, repo_root, wait_for  # noqa: E402


class AvSamplerDockingHarness:
    def __init__(self, headless_path: str, duration: float, sample_rate: float, block_size: int):
        self.repo_root = repo_root()
        self.binary_path = (self.repo_root / headless_path).resolve()
        self.process_args = [
            "--duration",
            str(duration),
            "--blocksize",
            str(block_size),
            "--samplerate",
            str(sample_rate),
            "--test-ui",
        ]
        self.process = self._make_process()
        self.client = None

    def _make_process(self) -> ManagedManifoldProcess:
        return ManagedManifoldProcess(
            self.binary_path,
            list(self.process_args),
            cwd=self.repo_root,
            artifact_name="headless_avsampler_docking_regression",
        )

    def start(self) -> None:
        print("Starting ManifoldHeadless A/V sampler docking harness...")
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

    def restart(self) -> None:
        self.stop()
        self.process = self._make_process()
        self.start()

    def switch_project(self, relative_project: str) -> Path:
        project_path = (self.repo_root / relative_project).resolve()
        response = self.client.command(f"UISWITCH {project_path}")
        if not response.startswith("OK"):
            raise TestFailure(f"UISWITCH failed for {project_path}: {response}")

        def ready() -> bool:
            return (
                self.client.eval("return getCurrentScriptPath()") == f"OK {project_path}"
                and self.client.eval("return type(__avsdExportContract)") == "OK function"
                and self.client.eval("return type(__avsdAction)") == "OK function"
                and self.client.eval("return type(__avsdCtx)") == "OK table"
            )

        if not wait_for(ready, timeout=8.0, step=0.1):
            current = self.client.eval("return getCurrentScriptPath()")
            raise TestFailure(f"project never became export-ready for {project_path}: {current}")
        time.sleep(0.15)
        return project_path

    def export_contract(self, name: str) -> dict[str, Any]:
        path = self.process.artifacts.path(f"{name}.json")
        response = self.client.eval(f"return __avsdExportContract('{path.as_posix()}')")
        if response != f"OK {path.as_posix()}":
            raise TestFailure(f"contract export failed for {name}: {response}")
        return json.loads(path.read_text(encoding="utf-8"))

    def action(self, action: str, *args: Any) -> str:
        lua_args = ", ".join(lua_literal(arg) for arg in args)
        payload = f"return __avsdAction({lua_literal(action)}"
        if lua_args:
            payload += ", " + lua_args
        payload += ")"
        response = self.client.eval(payload)
        if not response.startswith("OK"):
            raise TestFailure(f"action failed {action} {args}: {response}")
        time.sleep(0.05)
        return response

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)


INITIAL_PROJECT = "UserScripts/projects/AVSampler/manifold.project.json5"
DOCKING_PROJECT = "UserScripts/projects/avsamplerDOCKING/manifold.project.json5"
MIGRATION_PROJECT = "UserScripts/projects/avsamplerDOCKING/manifold.project.json5"


ScenarioFn = Callable[[AvSamplerDockingHarness, dict[str, Any]], None]


def lua_literal(value: Any) -> str:
    if value is None:
        return "nil"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return repr(value)
    text = str(value).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{text}'"



def approx_equal(actual: float, expected: float, tol: float = 1e-6) -> bool:
    return abs(float(actual) - float(expected)) <= tol



def remove_path(payload: dict[str, Any], path: list[str]) -> None:
    cur: Any = payload
    for key in path[:-1]:
        if not isinstance(cur, dict) or key not in cur:
            return
        cur = cur[key]
    if isinstance(cur, dict):
        cur.pop(path[-1], None)



def normalized_contract(payload: dict[str, Any]) -> dict[str, Any]:
    cloned = json.loads(json.dumps(payload))
    for path in (
        ["projectPath"],
        ["profile"],
        ["clock", "playTimeSamples"],
    ):
        remove_path(cloned, path)
    return cloned



def fail_diff(label: str, left: dict[str, Any], right: dict[str, Any]) -> None:
    left_text = json.dumps(left, indent=2, sort_keys=True)
    right_text = json.dumps(right, indent=2, sort_keys=True)
    raise TestFailure(f"{label} mismatch\n--- left ---\n{left_text}\n--- right ---\n{right_text}")



def choose_effect_index(contract: dict[str, Any]) -> int:
    effects = contract.get("effects", [])
    return 2 if len(effects) >= 2 else 1



def scenario_baseline(harness: AvSamplerDockingHarness, before: dict[str, Any]) -> None:
    harness.action("seam_reset")
    harness.action("force_refresh")
    harness.sleep(0.15)



def scenario_transport_waveform(harness: AvSamplerDockingHarness, before: dict[str, Any]) -> None:
    harness.action("seam_reset")
    harness.action("set_param", "/avsampler/mode", 0)
    harness.action("set_param", "/avsampler/speed", 1.5)
    harness.action("set_param", "/avsampler/output", 1.1)
    harness.action("set_param", "/avsampler/root_note", 62)
    harness.action("set_param", "/avsampler/voice_count", 4)
    harness.action("set_param", "/avsampler/pitch_tracking", 0)
    harness.action("set_param", "/avsampler/play_start", 0.2)
    harness.action("set_param", "/avsampler/loop_start", 0.1)
    harness.action("set_param", "/avsampler/loop_end", 0.8)
    harness.action("set_param", "/avsampler/crossfade", 0.12)
    harness.action("set_param", "/avsampler/one_shot", 1)
    harness.action("set_selected_slice", 5)
    harness.action("seam_set_sampler_metrics", 16, 3.5, 4096, 0.2)
    harness.action("seam_set_playback", "poly", 1, True, 0.33)
    harness.action("seam_set_playback", "poly", 2, True, 0.66)
    harness.action("force_refresh")
    harness.sleep(0.15)



def scenario_source_grid(harness: AvSamplerDockingHarness, before: dict[str, Any]) -> None:
    effect_index = choose_effect_index(before)
    harness.action("seam_reset")
    harness.action("add_column", "ml", "segmented")
    harness.action("set_source_selection_col", 2)
    harness.action("set_source_param", 1, 1.8)
    harness.action("set_source_param", 2, 0.25)
    harness.action("set_source_param", 3, 0.4)
    harness.action("set_source_param", 4, 0.05)
    harness.action("col_add_fx", 2, effect_index)
    harness.action("select_grid_cell", 2, 2)
    harness.action("set_shader_param", 1, 0.61)
    harness.action("add_column", "columntap", 2, 1)
    harness.action("force_refresh")
    harness.sleep(0.15)



def scenario_compositor(harness: AvSamplerDockingHarness, before: dict[str, Any]) -> None:
    effect_index = choose_effect_index(before)
    harness.action("seam_reset")
    harness.action("add_column", "ml", "pose")
    harness.action("col_add_fx", 2, effect_index)
    harness.action("set_compositor_layer", 2, "sourceColumn", 2)
    harness.action("set_compositor_layer", 2, "tapIndex", 1)
    harness.action("set_compositor_layer", 2, "opacity", 0.5)
    harness.action("set_compositor_layer", 2, "visible", True)
    harness.action("set_compositor_layer", 2, "select", 1)
    harness.action("set_compositor_layer", 3, "sourceColumn", 1)
    harness.action("set_compositor_layer", 3, "tapIndex", 2)
    harness.action("set_compositor_layer", 3, "opacity", 0.35)
    harness.action("set_compositor_layer", 3, "visible", True)
    harness.action("force_refresh")
    harness.sleep(0.15)



def scenario_pose_mapping_midi(harness: AvSamplerDockingHarness, before: dict[str, Any]) -> None:
    harness.action("seam_reset")
    harness.action("set_mapping_field", 1, "enable", True)
    harness.action("set_mapping_field", 1, "source", 52)
    harness.action("set_mapping_field", 1, "target", 1)
    harness.action("set_mapping_field", 1, "min", 0.1)
    harness.action("set_mapping_field", 1, "max", 0.9)
    harness.action("set_mapping_field", 1, "invert", False)
    harness.action("seam_set_webcam_open", True)
    harness.action("seam_set_frame_info", True, 101, 640, 480)
    harness.action("seam_set_pose_preset", "spread")
    harness.action("seam_queue_midi", "note_on", 64, 111)
    harness.sleep(0.25)
    harness.action("force_refresh")
    harness.action("seam_queue_midi", "note_off", 64, 0)
    harness.sleep(0.25)
    harness.action("force_refresh")



def scenario_capture_free_record(harness: AvSamplerDockingHarness, before: dict[str, Any]) -> None:
    harness.action("seam_reset")
    harness.action("seam_set_capture_metrics", 12, 640, 480, 1048576)
    harness.action("seam_set_clock", 48000, 0, 120)
    harness.action("widget_change", "captureMode", True)
    harness.action("widget_click", "captureNow")
    harness.action("seam_set_clock", 48000, 96000, 120)
    harness.action("widget_click", "captureNow")
    harness.action("force_refresh")
    harness.sleep(0.15)



def scenario_remove_cleanup(harness: AvSamplerDockingHarness, before: dict[str, Any]) -> None:
    effect_index = choose_effect_index(before)
    harness.action("seam_reset")
    harness.action("add_column", "ml", "segmented")
    harness.action("col_add_fx", 2, effect_index)
    harness.action("col_remove_fx", 2, 1)
    harness.action("remove_column", 2)
    harness.action("force_refresh")
    harness.sleep(0.15)


SCENARIOS: list[tuple[str, ScenarioFn]] = [
    ("baseline", scenario_baseline),
    ("transport_waveform", scenario_transport_waveform),
    ("source_grid", scenario_source_grid),
    ("compositor", scenario_compositor),
    ("pose_mapping_midi", scenario_pose_mapping_midi),
    ("capture_free_record", scenario_capture_free_record),
    ("remove_cleanup", scenario_remove_cleanup),
]



def run_scenario(harness: AvSamplerDockingHarness, project: str, scenario_name: str, scenario_fn: ScenarioFn) -> tuple[dict[str, Any], dict[str, Any]]:
    label = Path(project).parent.name
    harness.restart()
    harness.switch_project(project)
    before = harness.export_contract(f"{label}_{scenario_name}_before")
    scenario_fn(harness, before)
    after = harness.export_contract(f"{label}_{scenario_name}_after")
    return before, after



def test_initial_project_smoke(harness: AvSamplerDockingHarness) -> None:
    harness.switch_project(INITIAL_PROJECT)
    before = harness.export_contract("initial_project_before")
    harness.action("set_shader_layer", 3)
    harness.action("set_shader_param", 2, 0.42)
    harness.action("set_selected_slice", 4)
    harness.action("set_mapping_field", 1, "min", 0.15)
    after = harness.export_contract("initial_project_after")

    if before["selectedSlice"] == after["selectedSlice"]:
        raise TestFailure("initial project selectedSlice did not change under smoke actions")
    if after["selectedSlice"] != 4:
        raise TestFailure(f"initial project selectedSlice expected 4, got {after['selectedSlice']}")
    if after["shader"]["activeLayer"] != 3:
        raise TestFailure(f"initial project active layer expected 3, got {after['shader']['activeLayer']}")



def test_docking_contract_coverage(harness: AvSamplerDockingHarness) -> None:
    expected_keys = {
        "rendererMode",
        "layoutPreset",
        "gridAlignment",
        "selection",
        "waveform",
        "preview",
        "midi",
        "fx",
        "hostParams",
        "columns",
        "compositor",
        "testSeams",
    }
    for scenario_name, scenario_fn in SCENARIOS:
        before, after = run_scenario(harness, DOCKING_PROJECT, scenario_name, scenario_fn)
        missing = sorted(expected_keys - set(after.keys()))
        if missing:
            raise TestFailure(f"{scenario_name}: contract missing keys {missing}")
        if scenario_name == "transport_waveform":
            if not approx_equal(after["hostParams"]["speed"], 1.5):
                raise TestFailure("transport_waveform: speed did not stick")
            if after["hostParams"]["voiceCount"] != 4:
                raise TestFailure("transport_waveform: voiceCount did not stick")
            if not approx_equal(after["preview"]["position"], 0.33):
                raise TestFailure(f"transport_waveform: preview position mismatch {after['preview']}")
            if after["waveform"]["polyPlayheads"][0] != 0.33:
                raise TestFailure("transport_waveform: poly playhead 1 mismatch")
        elif scenario_name == "source_grid":
            if len(after["columns"]) != 3:
                raise TestFailure(f"source_grid: expected 3 columns, got {len(after['columns'])}")
            if after["columns"][1]["source"]["kind"] != "ml":
                raise TestFailure("source_grid: column 2 source should be ml")
            if after["columns"][2]["source"]["kind"] != "columntap":
                raise TestFailure("source_grid: column 3 source should be columntap")
            if after["selection"] != {"col": 2, "row": 2}:
                raise TestFailure(f"source_grid: grid selection mismatch {after['selection']}")
        elif scenario_name == "compositor":
            layer2 = after["compositor"]["layers"][1]
            layer3 = after["compositor"]["layers"][2]
            if not layer2["visible"] or not approx_equal(layer2["opacity"], 0.5):
                raise TestFailure(f"compositor: layer2 mismatch {layer2}")
            if not layer3["visible"] or layer3["tapIndex"] != 2:
                raise TestFailure(f"compositor: layer3 mismatch {layer3}")
        elif scenario_name == "pose_mapping_midi":
            if after["midi"]["lastMidi"] != "NOTE OFF 64":
                raise TestFailure(f"pose_mapping_midi: expected NOTE OFF 64, got {after['midi']['lastMidi']}")
            if after["midi"]["note"] != 64:
                raise TestFailure("pose_mapping_midi: midi note param mismatch")
            if after["pose"]["values"].get("/avsampler/pose/both_hands/spread", 0) <= 0.5:
                raise TestFailure("pose_mapping_midi: spread seam did not propagate")
        elif scenario_name == "capture_free_record":
            if after["captureRecording"]:
                raise TestFailure("capture_free_record: captureRecording should be false after stop")
            if not approx_equal(after["sampler"]["durationSeconds"], 2.0, 1e-4):
                raise TestFailure(f"capture_free_record: duration mismatch {after['sampler']}")
            if after["sampler"]["frameCount"] != 12:
                raise TestFailure("capture_free_record: sampler frame count mismatch")
        elif scenario_name == "remove_cleanup":
            if len(after["columns"]) != 1:
                raise TestFailure(f"remove_cleanup: expected 1 column, got {len(after['columns'])}")



def test_migration_matches_docking(harness: AvSamplerDockingHarness) -> None:
    for scenario_name, scenario_fn in SCENARIOS:
        docking_before, docking_after = run_scenario(harness, DOCKING_PROJECT, f"parity_{scenario_name}", scenario_fn)
        migration_before, migration_after = run_scenario(harness, MIGRATION_PROJECT, f"parity_{scenario_name}", scenario_fn)

        docking_before_norm = normalized_contract(docking_before)
        docking_after_norm = normalized_contract(docking_after)
        migration_before_norm = normalized_contract(migration_before)
        migration_after_norm = normalized_contract(migration_after)

        if docking_before_norm != migration_before_norm:
            fail_diff(f"baseline parity {scenario_name}", docking_before_norm, migration_before_norm)
        if docking_after_norm != migration_after_norm:
            fail_diff(f"post-scenario parity {scenario_name}", docking_after_norm, migration_after_norm)


TESTS = [
    test_initial_project_smoke,
    test_docking_contract_coverage,
    test_migration_matches_docking,
]



def install_signal_handlers(cleanup) -> None:
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)



def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="A/V sampler docking headless regression suite")
    parser.add_argument("--headless", default="build-dev/ManifoldHeadless", help="Path to ManifoldHeadless executable")
    parser.add_argument("--duration", type=float, default=60.0, help="Headless runtime duration in seconds")
    parser.add_argument("--samplerate", type=float, default=44100.0, help="Sample rate")
    parser.add_argument("--blocksize", type=int, default=512, help="Block size")
    return parser.parse_args(argv[1:])



def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = AvSamplerDockingHarness(args.headless, args.duration, args.samplerate, args.blocksize)
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
    finally:
        harness.stop()

    if failures:
        print("\nFailures:")
        for name, message in failures:
            print(f"- {name}: {message}")
        return 1

    print(f"\nPASS {passed}/{len(TESTS)} tests")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
