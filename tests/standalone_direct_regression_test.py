#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from harness import (  # noqa: E402
    ManagedManifoldProcess,
    ManifoldClient,
    SkipTest,
    TestFailure,
    find_live_socket,
    repo_root,
    require_gui_session,
    wait_for,
)


class RegressionError(RuntimeError):
    pass


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Standalone direct-mode regression stress test")
    parser.add_argument("--socket", help="Connect to an existing standalone socket")
    parser.add_argument("--launch", help="Launch a standalone executable instead of reusing an existing socket")
    parser.add_argument("--renderer", default="imgui-direct", help="Renderer mode to enforce")
    parser.add_argument("--iterations", type=int, default=24, help="Number of mode-switch iterations")
    parser.add_argument("--settle", type=float, default=0.12, help="Delay between scripted steps")
    parser.add_argument("--require-gui", action="store_true", help="Skip with code 77 when no desktop GUI session is available")
    return parser.parse_args(argv[1:])


def ensure_shell_available(client: ManifoldClient) -> None:
    last_response = None

    def shell_ready() -> bool:
        nonlocal last_response
        try:
            last_response = client.eval("return type(shell)")
            return last_response == "OK table"
        except SkipTest as exc:
            last_response = str(exc)
            return False

    if not wait_for(shell_ready, timeout=6.0, step=0.05):
        raise RegressionError(f"shell global unavailable: {last_response}")


def ensure_renderer(client: ManifoldClient, renderer: str) -> None:
    response = client.command(f"UIRENDERER {renderer}")
    if not response.startswith("OK"):
        raise RegressionError(f"UIRENDERER {renderer} failed: {response}")
    if not wait_for(lambda: client.diagnose_payload().get("uiRendererMode") == renderer, timeout=4.0, step=0.05):
        payload = client.diagnose_payload()
        raise RegressionError(
            f"renderer mode did not become {renderer!r}: {payload.get('uiRendererMode')!r}"
        )


def eval_ok(client: ManifoldClient, code: str) -> None:
    response = client.eval(code)
    if not response.startswith("OK"):
        raise RegressionError(f"EVAL failed: {response}")


def cycle_modes(client: ManifoldClient, iterations: int, settle: float) -> None:
    for index in range(iterations):
        eval_ok(client, 'shell:setMode("edit")\\nshell:setLeftPanelMode("hierarchy")')
        time.sleep(settle)
        eval_ok(client, 'shell:setMode("edit")\\nshell:setLeftPanelMode("scripts")')
        time.sleep(settle)
        eval_ok(client, 'shell:setMode("performance")')
        time.sleep(settle)

        if (index + 1) % 6 == 0:
            eval_ok(
                client,
                'if shell.setPerfOverlayVisible then shell:setPerfOverlayVisible(true) shell:setPerfOverlayVisible(false) end\\n'
                'if shell.setConsoleVisible then shell:setConsoleVisible(true) shell:setConsoleVisible(false) end',
            )
            time.sleep(settle)

        diag = client.diagnose_payload()
        if diag.get("uiRendererMode") is None:
            raise RegressionError(f"DIAGNOSE missing uiRendererMode at iteration {index}: {diag}")


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    launched = None
    client = None

    try:
        if args.launch:
            if args.require_gui:
                require_gui_session("standalone direct regression test requires a desktop GUI session")
            executable = str((repo_root() / args.launch).resolve())
            launched = ManagedManifoldProcess(
                executable,
                [],
                cwd=repo_root(),
                env={"MANIFOLD_RENDERER": args.renderer},
                artifact_name="standalone_direct_regression",
            )
            launched.start(timeout=15.0)
            socket_path = launched.socket_path
            print(f"Launched standalone: {executable}")
            print(f"Socket: {socket_path}")
            print(f"Artifacts: {launched.artifacts.base_dir}")
        else:
            socket_path = find_live_socket(args.socket)
            print(f"Using existing socket: {socket_path}")

        client = ManifoldClient(socket_path)
        client.connect()
        ensure_shell_available(client)
        ensure_renderer(client, args.renderer)
        cycle_modes(client, args.iterations, args.settle)

        payload = client.diagnose_payload()
        frame_timing = payload.get("frameTiming", {})
        if int(frame_timing.get("frameCount", 0)) <= 0:
            raise TestFailure(f"frame timing did not advance: {payload}")

        print(json.dumps(
            {
                "rendererMode": payload.get("uiRendererMode"),
                "frameTiming": frame_timing,
                "imgui": payload.get("imgui", {}),
            },
            indent=2,
            sort_keys=True,
        ))
        return 0
    except SkipTest as exc:
        print(f"SKIP: {exc}", file=sys.stderr)
        return 77
    except (RegressionError, TestFailure) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        if launched is not None:
            try:
                launched.artifacts.write_text("failure.txt", str(exc))
                if client is not None:
                    launched.artifacts.write_json("diagnose.json", client.diagnose_payload())
            except Exception:
                pass
        return 1
    finally:
        if client is not None:
            client.close()
        if launched is not None:
            launched.stop()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
