#!/usr/bin/env python3
import glob
import json
import os
import socket
import sys
import time


class ProfileError(Exception):
    pass


def find_socket(explicit_path=None):
    if explicit_path:
        if not os.path.exists(explicit_path):
            raise ProfileError(f"socket not found: {explicit_path}")
        return explicit_path

    candidates = glob.glob("/tmp/manifold_*.sock")
    if not candidates:
        raise ProfileError(
            "no manifold socket found in /tmp. Start standalone Manifold or pass an explicit socket path."
        )
    return max(candidates, key=os.path.getmtime)


class Client:
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
            raise ProfileError("not connected")

        self.sock.sendall((text + "\n").encode("utf-8"))
        response = bytearray()
        while True:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ProfileError("socket closed while waiting for response")
            response.extend(chunk)
            if response.endswith(b"\n"):
                break
        return response[:-1].decode("utf-8", errors="replace")

    def eval(self, code):
        response = self.command(f"EVAL {code}")
        if response == "ERROR no lua engine":
            raise ProfileError(
                "this test requires the standalone with editor/LuaEngine, not headless"
            )
        return response

    def reset_perf(self):
        response = self.command("PERF RESET")
        if response != "OK":
            raise ProfileError(f"PERF RESET failed: {response}")

    def diagnose(self):
        response = self.command("DIAGNOSE")
        if not response.startswith("OK "):
            raise ProfileError(f"DIAGNOSE failed: {response}")
        payload = json.loads(response[3:])
        frame_timing = payload.get("frameTiming")
        if frame_timing is None:
            raise ProfileError("DIAGNOSE response does not contain frameTiming")
        return frame_timing


def ensure_shell_available(client):
    response = client.eval("return type(shell)")
    if response != "OK table":
        raise ProfileError(f"shell global unavailable: {response}")


def set_mode(client, lua_code):
    response = client.eval(lua_code)
    if not response.startswith("OK"):
        raise ProfileError(f"EVAL failed: {response}")


def capture_mode(client, label, lua_code):
    client.reset_perf()
    set_mode(client, lua_code)
    time.sleep(3.0)
    snapshot = client.diagnose()
    return {
        "label": label,
        "frameCount": snapshot.get("frameCount", 0),
        "totalUs": snapshot.get("totalUs", 0),
        "avgTotalUs": snapshot.get("avgTotalUs", 0),
        "peakTotalUs": snapshot.get("peakTotalUs", 0),
        "pushStateUs": snapshot.get("avgPushStateUs", 0),
        "eventUs": snapshot.get("avgEventListenersUs", 0),
        "uiUpdateUs": snapshot.get("avgUiUpdateUs", 0),
        "paintUs": snapshot.get("avgPaintUs", 0),
    }


def format_ms(value_us):
    return f"{float(value_us) / 1000.0:.2f}ms"


def print_table(rows):
    headers = [
        "Mode",
        "Frame",
        "Current Total",
        "Avg Total",
        "Peak Total",
        "Avg Push",
        "Avg Events",
        "Avg UI",
        "Avg Paint",
    ]

    table_rows = [
        [
            row["label"],
            str(row["frameCount"]),
            format_ms(row["totalUs"]),
            format_ms(row["avgTotalUs"]),
            format_ms(row["peakTotalUs"]),
            format_ms(row["pushStateUs"]),
            format_ms(row["eventUs"]),
            format_ms(row["uiUpdateUs"]),
            format_ms(row["paintUs"]),
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


def main(argv):
    try:
        socket_path = find_socket(argv[1] if len(argv) > 1 else None)
        client = Client(socket_path)
        client.connect()
        ensure_shell_available(client)

        rows = [
            capture_mode(client, "Performance", 'shell:setMode("performance")'),
            capture_mode(
                client,
                "Edit + Hierarchy",
                'shell:setMode("edit")\\nshell:setLeftPanelMode("hierarchy")',
            ),
            capture_mode(
                client,
                "Edit + Scripts",
                'shell:setMode("edit")\\nshell:setLeftPanelMode("scripts")',
            ),
        ]

        print_table(rows)
        return 0
    except ProfileError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    finally:
        if "client" in locals():
            client.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv))
