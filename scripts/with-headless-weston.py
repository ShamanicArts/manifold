#!/usr/bin/env python3
"""Run a GUI probe on a disposable Weston/Xwayland display.

The child inherits only the disposable DISPLAY/WAYLAND_DISPLAY. Probes that
process audio must separately provide and verify a private null sink.
"""

import argparse
import os
from pathlib import Path
import re
import signal
import subprocess
import tempfile
import time


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("provide a command after --")

    with tempfile.TemporaryDirectory(prefix="manifold-isolated-display-") as directory:
        os.chmod(directory, 0o700)
        log = Path(directory) / "weston.log"
        env = os.environ.copy()
        env.pop("DISPLAY", None)
        env.pop("WAYLAND_DISPLAY", None)
        env["XDG_RUNTIME_DIR"] = directory
        weston = subprocess.Popen([
            "weston", "--backend=headless", "--xwayland", "--renderer=pixman",
            "--width=1400", "--height=1000", "--fake-seat", "--no-config",
            "--socket=manifold-headless", f"--log={log}",
        ], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True)
        try:
            deadline = time.monotonic() + 10
            display = None
            while time.monotonic() < deadline and weston.poll() is None:
                if log.exists():
                    match = re.search(r"xserver listening on display (:\d+)", log.read_text())
                    if match:
                        display = match.group(1)
                        break
                time.sleep(0.05)
            if display is None:
                raise RuntimeError(f"Weston did not start Xwayland: {log.read_text() if log.exists() else 'no log'}")
            env.update({"DISPLAY": display, "WAYLAND_DISPLAY": "manifold-headless",
                        "MANIFOLD_ISOLATED_DISPLAY": "1", "WEBKIT_DISABLE_DMABUF_RENDERER": "1"})
            return subprocess.run(command, env=env, check=False).returncode
        finally:
            if weston.poll() is None:
                os.killpg(weston.pid, signal.SIGTERM)
            weston.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
