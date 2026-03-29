#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
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


MAIN_PROJECT = "UserScripts/projects/Main/manifold.project.json5"


class RackEqPaletteHarness:
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
            artifact_name="headless_rack_eq_palette",
        )
        self.client = None

    def start(self) -> None:
        print("Starting ManifoldHeadless EQ palette harness...")
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

    def command(self, text: str) -> str:
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.command(text)

    def eval(self, code: str) -> str:
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.eval(code)

    def get_value(self, path: str):
        if self.client is None:
            raise TestFailure("client is not connected")
        return self.client.get_value(path)

    def write_failure_artifacts(self) -> None:
        try:
            self.process.artifacts.write_text("process.log", self.process.get_log_text())
        except Exception:
            pass


def expect_ok(response: str, context: str) -> str:
    if not response.startswith("OK"):
        raise TestFailure(f"{context}: expected OK response, got: {response}")
    return response


def expect_eval(harness: RackEqPaletteHarness, code: str, expected: str, context: str) -> None:
    response = harness.eval(code)
    if response != expected:
        raise TestFailure(f"{context}: expected {expected!r}, got {response!r}")


def expect_json_value(harness: RackEqPaletteHarness, path: str, expected: float, context: str, tolerance: float = 1e-3) -> None:
    actual = harness.get_value(path)
    if not approx_equal(float(actual), float(expected), tolerance):
        raise TestFailure(f"{context}: expected {path}={expected}, got {actual}")


def load_main_project(harness: RackEqPaletteHarness) -> None:
    project_path = (harness.repo_root / MAIN_PROJECT).resolve()
    if not project_path.exists():
        raise TestFailure(f"missing Main project: {project_path}")

    expect_ok(harness.command(f"UISWITCH {project_path}"), "UISWITCH Main project")

    def hooks_ready() -> bool:
        return (
            harness.eval("return type(__midiSynthDeleteRackNode)") == "OK function"
            and harness.eval("return type(__midiSynthSpawnPaletteNode)") == "OK function"
            and harness.eval("return type(__midiSynthGetRackRouteDebug)") == "OK function"
        )

    if not wait_for(hooks_ready, timeout=5.0, step=0.05):
        raise TestFailure("Main rack hooks never became ready")


def assert_node_present(harness: RackEqPaletteHarness, node_id: str, present: bool, context: str) -> None:
    lua = (
        "local nodes=__midiSynthRackState and __midiSynthRackState.nodes or {} "
        f"for i=1,#nodes do if nodes[i] and nodes[i].id=='{node_id}' then return 1 end end return 0"
    )
    expected = "OK 1" if present else "OK 0"
    expect_eval(harness, lua, expected, context)


def find_dynamic_eq_id(harness: RackEqPaletteHarness) -> str:
    response = harness.eval(
        "local nodes=__midiSynthRackState and __midiSynthRackState.nodes or {} "
        "for i=1,#nodes do local id=tostring(nodes[i] and nodes[i].id or '') if id:match('^eq_inst_%d+$') then return id end end return ''"
    )
    if not response.startswith("OK "):
        raise TestFailure(f"failed to query dynamic EQ id: {response}")
    dynamic_id = response[3:]
    if not dynamic_id:
        raise TestFailure("expected a spawned dynamic EQ instance id, got empty string")
    return dynamic_id


def assert_audio_connection(harness: RackEqPaletteHarness, from_node: str, to_node: str, present: bool, context: str) -> None:
    lua = (
        "local route=__midiSynthGetRackRouteDebug() local c=route and route.uiConnections or {} "
        f"for i=1,#c do local conn=c[i] local from=conn and conn.from local to=conn and conn.to "
        f"if from and to and from.nodeId=='{from_node}' and to.nodeId=='{to_node}' then return 1 end end return 0"
    )
    expected = "OK 1" if present else "OK 0"
    expect_eval(harness, lua, expected, context)


def assert_stage_layout(harness: RackEqPaletteHarness, expected_count: int, expected_codes: list[int], context: str) -> None:
    count = harness.get_value("/midi/synth/rack/stageCount")
    if int(round(float(count))) != expected_count:
        raise TestFailure(f"{context}: expected stageCount={expected_count}, got {count}")
    for index, expected in enumerate(expected_codes, start=1):
        actual = harness.get_value(f"/midi/synth/rack/stage/{index}")
        if int(round(float(actual))) != expected:
            raise TestFailure(f"{context}: expected stage {index}={expected}, got {actual}")


def enter_patch_mode(harness: RackEqPaletteHarness) -> None:
    expect_eval(harness, "__midiSynthRackState.viewMode='patch' return 1", "OK 1", "enter patch mode")
    if not wait_for(lambda: harness.eval("return __midiSynthRackState.viewMode") == "OK patch", timeout=2.0, step=0.05):
        raise TestFailure("patch mode never became active")


def patchbay_port_count_for_node(harness: RackEqPaletteHarness, node_id: str) -> int:
    response = harness.eval(
        "local reg=__midiSynthPatchbayPortRegistry or {} local count=0 "
        f"for _,v in pairs(reg) do if v and v.nodeId=='{node_id}' then count=count+1 end end return count"
    )
    if not response.startswith("OK "):
        raise TestFailure(f"failed to query patchbay registry for {node_id}: {response}")
    return int(float(response[3:]))


def wait_for_patchbay_ports(harness: RackEqPaletteHarness, node_id: str, minimum: int = 1, timeout: float = 2.0) -> None:
    if not wait_for(lambda: patchbay_port_count_for_node(harness, node_id) >= minimum, timeout=timeout, step=0.05):
        raise TestFailure(f"patchbay ports never appeared for {node_id}")


def assert_log_clean(harness: RackEqPaletteHarness) -> None:
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


def test_eq_palette_dynamic_and_canonical_lifecycle(harness: RackEqPaletteHarness) -> None:
    load_main_project(harness)
    enter_patch_mode(harness)

    assert_node_present(harness, "eq", True, "canonical EQ should exist on load")
    assert_audio_connection(harness, "fx2", "eq", True, "canonical fx2->eq route should exist")
    assert_audio_connection(harness, "eq", "__rackOutput", True, "canonical eq->output route should exist")
    assert_stage_layout(harness, 4, [1, 2, 3, 4], "canonical stage layout")

    expect_eval(
        harness,
        "return __midiSynthDeleteRackNode('placeholder1') and 1 or 0",
        "OK 1",
        "delete placeholder1 to free a rack slot",
    )

    expect_eval(
        harness,
        "return __midiSynthSpawnPaletteNode('eq', 2, 0) and 1 or 0",
        "OK 1",
        "spawn additional EQ into freed rack slot",
    )
    dynamic_eq_id = find_dynamic_eq_id(harness)
    assert_node_present(harness, dynamic_eq_id, True, "dynamic EQ instance should exist")
    wait_for_patchbay_ports(harness, dynamic_eq_id, minimum=4)
    assert_audio_connection(harness, "eq", dynamic_eq_id, True, "canonical eq should feed dynamic EQ")
    assert_audio_connection(harness, dynamic_eq_id, "__rackOutput", True, "dynamic EQ should feed output")
    assert_stage_layout(harness, 5, [1, 2, 3, 4, 101], "dynamic EQ stage layout")

    expect_ok(harness.command("SET /midi/synth/rack/eq/1/mix 0.25"), "set dynamic EQ mix")
    expect_ok(harness.command("SET /midi/synth/rack/eq/1/output 3"), "set dynamic EQ output")
    expect_ok(harness.command("SET /midi/synth/rack/eq/1/band/1/enabled 1"), "enable dynamic EQ band1")
    expect_ok(harness.command("SET /midi/synth/rack/eq/1/band/1/gain 6"), "set dynamic EQ band1 gain")
    expect_json_value(harness, "/midi/synth/rack/eq/1/mix", 0.25, "dynamic EQ mix roundtrip")
    expect_json_value(harness, "/midi/synth/rack/eq/1/output", 3.0, "dynamic EQ output roundtrip")
    expect_json_value(harness, "/midi/synth/rack/eq/1/band/1/enabled", 1.0, "dynamic EQ band1 enabled roundtrip")
    expect_json_value(harness, "/midi/synth/rack/eq/1/band/1/gain", 6.0, "dynamic EQ band1 gain roundtrip")

    expect_eval(
        harness,
        f"return __midiSynthDeleteRackNode('{dynamic_eq_id}') and 1 or 0",
        "OK 1",
        "delete spawned dynamic EQ",
    )
    assert_node_present(harness, dynamic_eq_id, False, "dynamic EQ should be absent after delete")
    assert_audio_connection(harness, "eq", dynamic_eq_id, False, "canonical eq -> dynamic eq route should be removed")
    assert_audio_connection(harness, "eq", "__rackOutput", True, "canonical eq -> output should be restored")
    assert_stage_layout(harness, 4, [1, 2, 3, 4], "stage layout after dynamic EQ delete")

    expect_eval(
        harness,
        "return __midiSynthSpawnPaletteNode('eq', 2, 0) and 1 or 0",
        "OK 1",
        "respawn dynamic EQ after delete",
    )
    dynamic_eq_id = find_dynamic_eq_id(harness)
    expect_json_value(harness, "/midi/synth/rack/eq/1/mix", 1.0, "dynamic EQ mix resets after respawn")
    expect_json_value(harness, "/midi/synth/rack/eq/1/output", 0.0, "dynamic EQ output resets after respawn")
    expect_json_value(harness, "/midi/synth/rack/eq/1/band/1/enabled", 0.0, "dynamic EQ band1 enabled resets after respawn")
    expect_json_value(harness, "/midi/synth/rack/eq/1/band/1/gain", 0.0, "dynamic EQ band1 gain resets after respawn")

    expect_eval(
        harness,
        f"return __midiSynthDeleteRackNode('{dynamic_eq_id}') and 1 or 0",
        "OK 1",
        "delete respawned dynamic EQ",
    )
    assert_stage_layout(harness, 4, [1, 2, 3, 4], "stage layout after second dynamic EQ delete")

    expect_eval(
        harness,
        "return __midiSynthDeleteRackNode('eq') and 1 or 0",
        "OK 1",
        "delete canonical EQ",
    )
    assert_node_present(harness, "eq", False, "canonical EQ should be absent after delete")
    assert_audio_connection(harness, "fx2", "eq", False, "fx2->eq should be gone after canonical delete")
    assert_stage_layout(harness, 3, [1, 2, 3], "stage layout after canonical EQ delete")

    expect_eval(
        harness,
        "return __midiSynthSpawnPaletteNode('eq', 1, 4) and 1 or 0",
        "OK 1",
        "respawn canonical EQ from palette",
    )
    assert_node_present(harness, "eq", True, "canonical EQ should be restored")
    assert_audio_connection(harness, "fx2", "eq", True, "fx2->eq should be restored")
    assert_audio_connection(harness, "eq", "__rackOutput", True, "eq->output should be restored")
    assert_stage_layout(harness, 4, [1, 2, 3, 4], "stage layout after canonical EQ respawn")

    assert_log_clean(harness)


def test_eq_palette_occupied_insert_patchbay(harness: RackEqPaletteHarness) -> None:
    load_main_project(harness)
    enter_patch_mode(harness)

    expect_eval(
        harness,
        "return __midiSynthSpawnPaletteNode('eq', 0, 3) and 1 or 0",
        "OK 1",
        "spawn dynamic EQ into occupied chain between oscillator and filter",
    )
    dynamic_eq_id = find_dynamic_eq_id(harness)
    assert_audio_connection(harness, "oscillator", dynamic_eq_id, True, "oscillator should feed dynamic EQ when inserted into occupied slot")
    assert_audio_connection(harness, dynamic_eq_id, "filter", True, "dynamic EQ should feed filter when inserted into occupied slot")
    wait_for_patchbay_ports(harness, dynamic_eq_id, minimum=4)
    assert_log_clean(harness)


TESTS = [
    test_eq_palette_dynamic_and_canonical_lifecycle,
    test_eq_palette_occupied_insert_patchbay,
]


def install_signal_handlers(cleanup) -> None:
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Headless EQ palette/delete rack regression suite")
    parser.add_argument("--headless", default="build-dev/ManifoldHeadless", help="Path to ManifoldHeadless executable")
    parser.add_argument("--duration", type=float, default=35.0, help="Headless runtime duration in seconds")
    parser.add_argument("--samplerate", type=float, default=44100.0, help="Sample rate")
    parser.add_argument("--blocksize", type=int, default=512, help="Block size")
    return parser.parse_args(argv[1:])


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = RackEqPaletteHarness(args.headless, args.duration, args.samplerate, args.blocksize)
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

        print(f"EQ palette tests: {passed}/{len(TESTS)} passed, {len(failures)} failed")
        if failures:
            harness.write_failure_artifacts()
            print(f"Artifacts: {harness.process.artifacts.base_dir}")
            return 1
        return 0
    except KeyboardInterrupt:
        print("Interrupted")
        return 2
    except Exception as exc:
        harness.write_failure_artifacts()
        print(f"Infrastructure error: {exc}")
        print(f"Artifacts: {harness.process.artifacts.base_dir}")
        return 2
    finally:
        harness.stop()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
