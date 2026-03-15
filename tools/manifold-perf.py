#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TESTS_DIR = REPO_ROOT / "tests"
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from harness import ManifoldClient, TestFailure, find_live_socket  # noqa: E402


BUDGET_US = 1_000_000.0 / 30.0
BAR_WIDTH = 32


class PerfError(RuntimeError):
    pass


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Manifold diagnostics/perf monitor")
    parser.add_argument("socket", nargs="?", help="Explicit socket path")
    parser.add_argument("--once", action="store_true", help="Render once and exit")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    parser.add_argument("--reset", action="store_true", help="Reset perf peaks before reading")
    return parser.parse_args(argv[1:])


def us_to_ms(value_us) -> float:
    return float(value_us) / 1000.0


def percent_of_budget(value_us) -> float:
    return max(0.0, (float(value_us) / BUDGET_US) * 100.0)


def make_bar(value_us) -> str:
    ratio = min(max(float(value_us) / BUDGET_US, 0.0), 1.0)
    filled = int(round(ratio * BAR_WIDTH))
    filled = max(0, min(BAR_WIDTH, filled))
    return "[" + ("█" * filled) + ("░" * (BAR_WIDTH - filled)) + "]"


def format_row(label: str, value_us) -> str:
    return (
        f"    {label:<15} {us_to_ms(value_us):>5.1f}ms  "
        f"{make_bar(value_us)} {percent_of_budget(value_us):>3.0f}%"
    )


def render_snapshot(payload: dict) -> str:
    frame_timing = payload.get("frameTiming")
    if frame_timing is None:
        raise PerfError("DIAGNOSE response does not contain frameTiming")

    imgui = payload.get("imgui", {})
    total_us = frame_timing.get("totalUs", 0)

    lines = []
    lines.append("═" * 68)
    lines.append("  MANIFOLD PERF / DIAGNOSTICS")
    lines.append(
        f"  Renderer: {payload.get('uiRendererMode', 'unknown')}  |  Frame #{frame_timing.get('frameCount', 0)}  |  Budget: {BUDGET_US / 1000.0:.1f}ms (30Hz)"
    )
    lines.append("═" * 68)
    lines.append("")
    lines.append("  CURRENT FRAME:")
    lines.append(format_row("Total:", total_us))
    lines.append(format_row("pushStateToLua:", frame_timing.get("pushStateUs", 0)))
    lines.append(format_row("eventListeners:", frame_timing.get("eventListenersUs", 0)))
    lines.append(format_row("ui_update:", frame_timing.get("uiUpdateUs", 0)))
    lines.append(format_row("paint:", frame_timing.get("paintUs", 0)))
    lines.append("")
    lines.append("  AVERAGES:")
    lines.append(format_row("Total:", frame_timing.get("avgTotalUs", 0)))
    lines.append(format_row("pushStateToLua:", frame_timing.get("avgPushStateUs", 0)))
    lines.append(format_row("eventListeners:", frame_timing.get("avgEventListenersUs", 0)))
    lines.append(format_row("ui_update:", frame_timing.get("avgUiUpdateUs", 0)))
    lines.append(format_row("paint:", frame_timing.get("avgPaintUs", 0)))
    lines.append("")
    lines.append("  PEAKS:")
    lines.append(format_row("Total:", frame_timing.get("peakTotalUs", 0)))
    lines.append(format_row("pushStateToLua:", frame_timing.get("peakPushStateUs", 0)))
    lines.append(format_row("eventListeners:", frame_timing.get("peakEventListenersUs", 0)))
    lines.append(format_row("ui_update:", frame_timing.get("peakUiUpdateUs", 0)))
    lines.append(format_row("paint:", frame_timing.get("peakPaintUs", 0)))
    lines.append("")
    lines.append("  IMGUI:")
    lines.append(f"    Context ready     {imgui.get('contextReady', False)}")
    lines.append(f"    Capture mouse     {imgui.get('wantCaptureMouse', False)}")
    lines.append(f"    Capture keyboard  {imgui.get('wantCaptureKeyboard', False)}")
    lines.append(f"    Render            {us_to_ms(imgui.get('renderUs', 0)):>5.1f}ms")
    lines.append(f"    Vertices          {imgui.get('vertexCount', 0)}")
    lines.append(f"    Indices           {imgui.get('indexCount', 0)}")
    lines.append(f"    Frame count       {imgui.get('frameCount', 0)}")

    if percent_of_budget(total_us) >= 80.0:
        lines.append("")
        lines.append("  WARNING: total frame time is above 80% of the 30Hz budget")

    return "\n".join(lines)


def main(argv: list[str]) -> int:
    client = None
    try:
        args = parse_args(argv)
        socket_path = find_live_socket(args.socket)
        client = ManifoldClient(socket_path)
        client.connect()

        if args.reset:
            client.reset_perf()

        while True:
            payload = client.diagnose_payload()

            if args.json:
                print(json.dumps(payload, indent=2, sort_keys=True))
            elif args.once:
                print(render_snapshot(payload))
            else:
                sys.stdout.write("\x1b[2J\x1b[H")
                sys.stdout.write(render_snapshot(payload))
                sys.stdout.write("\n")
                sys.stdout.flush()

            if args.once:
                return 0

            time.sleep(1.0)
    except KeyboardInterrupt:
        return 0
    except (PerfError, TestFailure) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        if client is not None:
            client.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
