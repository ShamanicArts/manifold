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


class ProfileError(RuntimeError):
    pass


SCENARIOS = [
    ("Performance", 'shell:setMode("performance")'),
    ("Edit + Hierarchy", 'shell:setMode("edit")\\nshell:setLeftPanelMode("hierarchy")'),
    ("Edit + Scripts", 'shell:setMode("edit")\\nshell:setLeftPanelMode("scripts")'),
]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Standalone UI profile capture")
    parser.add_argument("socket", nargs="?", help="Explicit socket path")
    parser.add_argument("--launch", help="Launch a standalone executable instead of attaching to an existing socket")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of a table")
    parser.add_argument("--renderer", help="Request UI renderer mode before profiling")
    parser.add_argument("--settle", type=float, default=3.0, help="Seconds to settle before capture")
    parser.add_argument("--startup", type=float, default=4.0, help="Seconds to wait after standalone launch")
    parser.add_argument("--require-gui", action="store_true", help="Skip with code 77 when no desktop GUI session is available")
    parser.add_argument("--max-avg-paint-us", type=int, help="Fail if any scenario avgPaintUs exceeds this")
    parser.add_argument("--max-canvas-repaint-lead-us", type=int, help="Fail if any scenario avgCanvasRepaintLeadUs exceeds this")
    parser.add_argument("--max-imgui-render-us", type=int, help="Fail if any scenario imgui.renderUs exceeds this")
    parser.add_argument("--max-over-budget-count", type=int, help="Fail if any scenario overBudgetCount exceeds this")
    return parser.parse_args(argv[1:])


def ensure_shell_available(client: ManifoldClient) -> None:
    response = client.eval("return type(shell)")
    if response != "OK table":
        raise ProfileError(f"shell global unavailable: {response}")


def ensure_renderer(client: ManifoldClient, renderer: str) -> None:
    response = client.command(f"UIRENDERER {renderer}")
    if not response.startswith("OK"):
        raise ProfileError(f"UIRENDERER {renderer} failed: {response}")

    if not wait_for(lambda: client.diagnose_payload().get("uiRendererMode") == renderer, timeout=3.0, step=0.05):
        payload = client.diagnose_payload()
        raise ProfileError(
            f"renderer mode did not become {renderer!r}: {payload.get('uiRendererMode')!r}"
        )


def set_mode(client: ManifoldClient, lua_code: str) -> None:
    response = client.eval(lua_code)
    if not response.startswith("OK"):
        raise ProfileError(f"EVAL failed: {response}")


def capture_mode(client: ManifoldClient, label: str, lua_code: str, settle_seconds: float):
    client.reset_perf()
    set_mode(client, lua_code)
    time.sleep(settle_seconds)
    payload = client.diagnose_payload()
    frame_timing = payload.get("frameTiming")
    if frame_timing is None:
        raise ProfileError(f"DIAGNOSE missing frameTiming payload: {payload}")
    imgui = payload.get("imgui", {})
    return {
        "label": label,
        "rendererMode": payload.get("uiRendererMode", "unknown"),
        "frameCount": frame_timing.get("frameCount", 0),
        "totalUs": frame_timing.get("totalUs", 0),
        "avgTotalUs": frame_timing.get("avgTotalUs", 0),
        "peakTotalUs": frame_timing.get("peakTotalUs", 0),
        "avgPushStateUs": frame_timing.get("avgPushStateUs", 0),
        "avgEventListenersUs": frame_timing.get("avgEventListenersUs", 0),
        "avgUiUpdateUs": frame_timing.get("avgUiUpdateUs", 0),
        "avgPaintUs": frame_timing.get("avgPaintUs", 0),
        "avgCanvasRepaintLeadUs": frame_timing.get("avgCanvasRepaintLeadUs", 0),
        "avgRenderDispatchUs": frame_timing.get("avgRenderDispatchUs", 0),
        "avgPresentUs": frame_timing.get("avgPresentUs", 0),
        "overBudgetCount": frame_timing.get("overBudgetCount", 0),
        "editorWidth": frame_timing.get("editorWidth", 0),
        "editorHeight": frame_timing.get("editorHeight", 0),
        "totalPaintAccumulatedUs": frame_timing.get("totalPaintAccumulatedUs", 0),
        "imgui": {
            "contextReady": imgui.get("contextReady", False),
            "wantCaptureMouse": imgui.get("wantCaptureMouse", False),
            "wantCaptureKeyboard": imgui.get("wantCaptureKeyboard", False),
            "frameCount": imgui.get("frameCount", 0),
            "renderUs": imgui.get("renderUs", 0),
            "vertexCount": imgui.get("vertexCount", 0),
            "indexCount": imgui.get("indexCount", 0),
        },
    }


def format_ms(value_us) -> str:
    return f"{float(value_us) / 1000.0:.2f}ms"


def print_table(rows) -> None:
    headers = [
        "Mode",
        "Renderer",
        "Frame",
        "Size",
        "Avg Total",
        "Peak Total",
        "Avg UI",
        "Avg Paint",
        "Canvas Lead",
        "ImGui Render",
        "Over Budget",
        "Vertices",
        "Indices",
    ]

    table_rows = [
        [
            row["label"],
            row["rendererMode"],
            str(row["frameCount"]),
            f"{row['editorWidth']}x{row['editorHeight']}",
            format_ms(row["avgTotalUs"]),
            format_ms(row["peakTotalUs"]),
            format_ms(row["avgUiUpdateUs"]),
            format_ms(row["avgPaintUs"]),
            format_ms(row["avgCanvasRepaintLeadUs"]),
            format_ms(row["imgui"]["renderUs"]),
            str(row["overBudgetCount"]),
            str(row["imgui"]["vertexCount"]),
            str(row["imgui"]["indexCount"]),
        ]
        for row in rows
    ]

    widths = []
    for index, header in enumerate(headers):
        width = len(header)
        for row in table_rows:
            width = max(width, len(row[index]))
        widths.append(width)

    def render_row(values):
        return " | ".join(value.ljust(widths[index]) for index, value in enumerate(values))

    separator = "-+-".join("-" * width for width in widths)

    print(render_row(headers))
    print(separator)
    for row in table_rows:
        print(render_row(row))


def validate_thresholds(args: argparse.Namespace, rows) -> None:
    failures = []
    for row in rows:
        if args.max_avg_paint_us is not None and float(row["avgPaintUs"]) > float(args.max_avg_paint_us):
            failures.append(
                f"{row['label']}: avgPaintUs {row['avgPaintUs']} > {args.max_avg_paint_us}"
            )
        if args.max_canvas_repaint_lead_us is not None and float(row["avgCanvasRepaintLeadUs"]) > float(args.max_canvas_repaint_lead_us):
            failures.append(
                f"{row['label']}: avgCanvasRepaintLeadUs {row['avgCanvasRepaintLeadUs']} > {args.max_canvas_repaint_lead_us}"
            )
        if args.max_imgui_render_us is not None and float(row["imgui"]["renderUs"]) > float(args.max_imgui_render_us):
            failures.append(
                f"{row['label']}: imgui.renderUs {row['imgui']['renderUs']} > {args.max_imgui_render_us}"
            )
        if args.max_over_budget_count is not None and int(row["overBudgetCount"]) > int(args.max_over_budget_count):
            failures.append(
                f"{row['label']}: overBudgetCount {row['overBudgetCount']} > {args.max_over_budget_count}"
            )
    if failures:
        raise TestFailure("; ".join(failures))



def main(argv: list[str]) -> int:
    args = parse_args(argv)
    client = None
    launched = None
    try:
        if args.launch:
            if args.require_gui:
                require_gui_session("standalone profile test requires a desktop GUI session")
            executable = str((repo_root() / args.launch).resolve())
            env = {}
            if args.renderer:
                env["MANIFOLD_RENDERER"] = args.renderer
            launched = ManagedManifoldProcess(
                executable,
                [],
                cwd=repo_root(),
                env=env,
                artifact_name="standalone_ui_profile",
            )
            launched.start(timeout=15.0)
            socket_path = launched.socket_path
            time.sleep(args.startup)
        else:
            socket_path = find_live_socket(args.socket)

        client = ManifoldClient(socket_path)
        client.connect()
        ensure_shell_available(client)

        if args.renderer:
            ensure_renderer(client, args.renderer)

        rows = [capture_mode(client, label, code, args.settle) for label, code in SCENARIOS]
        validate_thresholds(args, rows)

        if args.json:
            print(json.dumps(rows, indent=2, sort_keys=True))
        else:
            print_table(rows)
        return 0
    except SkipTest as exc:
        print(f"SKIP: {exc}", file=sys.stderr)
        return 77
    except (ProfileError, TestFailure) as exc:
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
