#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from harness import ArtifactBundle, ManagedManifoldProcess, ManifoldClient, TestFailure, repo_root, wait_for  # noqa: E402


SCENARIOS = [
    ("Performance", 'shell:setMode("performance")'),
    ("Edit + Hierarchy", 'shell:setMode("edit")\\nshell:setLeftPanelMode("hierarchy")'),
    ("Edit + Scripts", 'shell:setMode("edit")\\nshell:setLeftPanelMode("scripts")'),
]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compare standalone canvas vs imgui-direct profiling")
    parser.add_argument("--standalone", default="build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold",
                        help="Path to standalone executable")
    parser.add_argument("--window-size", default="2500x1308",
                        help="Initial window size passed via MANIFOLD_PROFILE_WINDOW_SIZE")
    parser.add_argument("--settle", type=float, default=2.5,
                        help="Seconds to settle after each scenario switch")
    parser.add_argument("--startup", type=float, default=5.0,
                        help="Seconds to wait after launch before first capture")
    parser.add_argument("--hypr-fullscreen", action="store_true",
                        help="Force the launched standalone window fullscreen via hyprctl")
    parser.add_argument("--output", help="Optional JSON output path")
    return parser.parse_args(argv[1:])


def ensure_shell(client: ManifoldClient) -> None:
    if not wait_for(lambda: client.eval("return type(shell)") == "OK table", timeout=6.0, step=0.05):
        raise TestFailure("shell never became available")


def ensure_renderer(client: ManifoldClient, renderer: str | None) -> None:
    expected = renderer or "canvas"
    if renderer is not None:
        response = client.command(f"UIRENDERER {renderer}")
        if not response.startswith("OK"):
            raise TestFailure(f"UIRENDERER {renderer} failed: {response}")
    if not wait_for(lambda: client.diagnose_payload().get("uiRendererMode") == expected, timeout=4.0, step=0.05):
        raise TestFailure(f"renderer mode did not settle to {expected}")


def set_mode(client: ManifoldClient, lua_code: str) -> None:
    response = client.eval(lua_code)
    if not response.startswith("OK"):
        raise TestFailure(f"EVAL failed: {response}")


def maybe_hypr_fullscreen(pid: int) -> bool:
    try:
        for _ in range(60):
            raw = subprocess.check_output(["hyprctl", "-j", "clients"], text=True)
            clients = json.loads(raw)
            for client in clients:
                if int(client.get("pid", -1)) != pid:
                    continue
                address = client.get("address")
                if not address:
                    continue
                subprocess.check_call(["hyprctl", "dispatch", "focuswindow", f"address:{address}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                subprocess.check_call(["hyprctl", "dispatch", "fullscreen", f"1,address:{address}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                return True
            time.sleep(0.1)
    except Exception:
        return False
    return False


def launch_and_capture(label: str, executable: Path, renderer: str | None, window_size: str,
                       startup_wait: float, settle_wait: float, hypr_fullscreen: bool):
    env = {"MANIFOLD_PROFILE_WINDOW_SIZE": window_size}
    if renderer is not None:
        env["MANIFOLD_RENDERER"] = renderer

    proc = ManagedManifoldProcess(
        executable,
        [],
        cwd=repo_root(),
        env=env,
        artifact_name=f"renderer_profile_{label.lower().replace(' ', '_')}"
    )
    client = None
    try:
        proc.start(timeout=15.0)
        if hypr_fullscreen and proc.proc is not None:
            maybe_hypr_fullscreen(proc.proc.pid)
        client = proc.create_client()
        ensure_shell(client)
        ensure_renderer(client, renderer)
        time.sleep(startup_wait)

        scenario_results = []
        for scenario_label, lua_code in SCENARIOS:
            client.reset_perf()
            set_mode(client, lua_code)
            time.sleep(settle_wait)
            diagnose = client.diagnose_payload()
            scenario_results.append({
                "label": scenario_label,
                "diagnose": diagnose,
            })

        final_snapshot = client.diagnose_payload()
        return {
            "label": label,
            "renderer": renderer or "canvas",
            "windowSize": window_size,
            "socketPath": proc.socket_path,
            "artifacts": str(proc.artifacts.base_dir),
            "scenarios": scenario_results,
            "finalSnapshot": final_snapshot,
            "logTail": proc.get_log_tail(8000),
        }
    finally:
        if client is not None:
            client.close()
        proc.stop()


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    executable = (repo_root() / args.standalone).resolve()
    if not executable.exists():
        print(f"Error: standalone executable not found: {executable}", file=sys.stderr)
        return 2

    bundle = ArtifactBundle("renderer_compare_profile")
    try:
        result = {
            "methodology": {
                "standalone": str(executable),
                "windowSize": args.window_size,
                "hyprFullscreen": args.hypr_fullscreen,
                "settleSeconds": args.settle,
                "startupSeconds": args.startup,
                "scenarios": [label for label, _ in SCENARIOS],
            },
            "canvas": launch_and_capture("Canvas", executable, None, args.window_size, args.startup, args.settle, args.hypr_fullscreen),
            "direct": launch_and_capture("Direct", executable, "imgui-direct", args.window_size, args.startup, args.settle, args.hypr_fullscreen),
        }
        output_path = Path(args.output) if args.output else bundle.path("renderer_compare_profile.json")
        output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(str(output_path))
        return 0
    except Exception as exc:
        bundle.write_text("failure.txt", str(exc))
        print(f"Error: {exc}", file=sys.stderr)
        print(f"Artifacts: {bundle.base_dir}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
