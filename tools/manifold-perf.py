#!/usr/bin/env python3
import glob
import json
import os
import socket
import sys
import time

BUDGET_US = 1000000.0 / 30.0
BAR_WIDTH = 32


class PerfError(Exception):
    pass


def parse_args(argv):
    once = False
    json_mode = False
    reset = False
    socket_path = None

    for arg in argv[1:]:
        if arg == "--once":
            once = True
        elif arg == "--json":
            json_mode = True
        elif arg == "--reset":
            reset = True
        elif arg.startswith("--"):
            raise PerfError(f"unknown flag: {arg}")
        elif socket_path is None:
            socket_path = arg
        else:
            raise PerfError(f"unexpected argument: {arg}")

    return once, json_mode, reset, socket_path


def find_socket(explicit_path=None):
    if explicit_path:
        if not os.path.exists(explicit_path):
            raise PerfError(f"socket not found: {explicit_path}")
        return explicit_path

    candidates = glob.glob("/tmp/manifold_*.sock")
    if not candidates:
        raise PerfError(
            "no manifold socket found in /tmp. Start Manifold or pass an explicit socket path."
        )
    return max(candidates, key=os.path.getmtime)


class ManifoldPerfClient:
    def __init__(self, socket_path):
        self.socket_path = socket_path
        self.sock = None

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)

    def close(self):
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

    def command(self, text):
        if self.sock is None:
            raise PerfError("not connected")

        self.sock.sendall((text + "\n").encode("utf-8"))
        response = bytearray()
        while True:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise PerfError("socket closed while waiting for response")
            response.extend(chunk)
            if response.endswith(b"\n"):
                break
        return response[:-1].decode("utf-8", errors="replace")

    def reset_peaks(self):
        response = self.command("PERF RESET")
        if response != "OK":
            raise PerfError(f"PERF RESET failed: {response}")

    def get_frame_timing(self):
        response = self.command("DIAGNOSE")
        if not response.startswith("OK "):
            raise PerfError(f"DIAGNOSE failed: {response}")
        try:
            payload = json.loads(response[3:])
        except json.JSONDecodeError as exc:
            raise PerfError(f"invalid DIAGNOSE JSON: {exc}") from exc

        frame_timing = payload.get("frameTiming")
        if frame_timing is None:
            raise PerfError("DIAGNOSE response does not contain frameTiming")
        return frame_timing


def us_to_ms(value_us):
    return float(value_us) / 1000.0


def percent_of_budget(value_us):
    return max(0.0, (float(value_us) / BUDGET_US) * 100.0)


def make_bar(value_us):
    ratio = min(max(float(value_us) / BUDGET_US, 0.0), 1.0)
    filled = int(round(ratio * BAR_WIDTH))
    filled = max(0, min(BAR_WIDTH, filled))
    return "[" + ("█" * filled) + ("░" * (BAR_WIDTH - filled)) + "]"


def format_row(label, value_us):
    return (
        f"    {label:<15} {us_to_ms(value_us):>5.1f}ms  "
        f"{make_bar(value_us)} {percent_of_budget(value_us):>3.0f}%"
    )


def render_snapshot(frame_timing):
    lines = []
    total_us = frame_timing.get("totalUs", 0)

    lines.append("═" * 55)
    lines.append("  MANIFOLD FRAME PROFILER")
    lines.append(
        f"  Frame #{frame_timing.get('frameCount', 0)}  |  Budget: {BUDGET_US / 1000.0:.1f}ms (30Hz)"
    )
    lines.append("═" * 55)
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

    if percent_of_budget(total_us) >= 80.0:
        lines.append("")
        lines.append("  WARNING: total frame time is above 80% of the 30Hz budget")

    return "\n".join(lines)


def main(argv):
    try:
        once, json_mode, reset, explicit_socket = parse_args(argv)
        socket_path = find_socket(explicit_socket)
    except PerfError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    client = ManifoldPerfClient(socket_path)
    try:
        client.connect()
        if reset:
            client.reset_peaks()

        while True:
            frame_timing = client.get_frame_timing()

            if json_mode:
                print(json.dumps(frame_timing, separators=(",", ":")))
            elif once:
                print(render_snapshot(frame_timing))
            else:
                sys.stdout.write("\x1b[2J\x1b[H")
                sys.stdout.write(render_snapshot(frame_timing))
                sys.stdout.write("\n")
                sys.stdout.flush()

            if once:
                return 0

            time.sleep(1.0)
    except KeyboardInterrupt:
        return 0
    except PerfError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
