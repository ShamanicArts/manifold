#!/usr/bin/env python3
"""Run an audio probe against a disposable PipeWire server with one null sink."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit("usage: with-private-null-audio.py COMMAND [ARGS...]")
    with tempfile.TemporaryDirectory(prefix="manifold-private-audio-") as directory:
        work = Path(directory)
        runtime = work / "runtime"
        runtime.mkdir(mode=0o700)
        alsa = work / "alsa.conf"
        alsa.write_text("pcm.!default { type pulse }\nctl.!default { type pulse }\nseq.!default { type hw }\n")
        env = {**os.environ, "XDG_RUNTIME_DIR": str(runtime),
               "XDG_STATE_HOME": str(work / "state"), "XDG_CONFIG_HOME": str(work / "config"),
               "PIPEWIRE_RUNTIME_DIR": str(runtime), "PIPEWIRE_REMOTE": "pipewire-0",
               "PULSE_SERVER": f"unix:{runtime}/pulse/native",
               "PULSE_SINK": "manifold_null",
               "ALSA_CONFIG_PATH": str(alsa)}
        logs = [(work / name).open("w") for name in ("pipewire.log", "pipewire-pulse.log", "wireplumber.log")]
        core = subprocess.Popen(["pipewire"], env=env, stdout=logs[0], stderr=subprocess.STDOUT)
        pulse = subprocess.Popen(["pipewire-pulse"], env=env, stdout=logs[1], stderr=subprocess.STDOUT)
        policy = subprocess.Popen(["wireplumber", "--profile", "policy"],
                                  env=env, stdout=logs[2], stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 8
            while not (runtime / "pulse/native").exists() and time.monotonic() < deadline:
                time.sleep(0.05)
            if not (runtime / "pulse/native").exists():
                raise RuntimeError("private PipeWire Pulse socket did not start")
            subprocess.run(["pactl", "load-module", "module-null-sink", "sink_name=manifold_null"],
                           env=env, check=True, capture_output=True)
            sinks = subprocess.check_output(["pactl", "list", "short", "sinks"], env=env, text=True)
            if not sinks.strip() or any("manifold_null" not in line for line in sinks.strip().splitlines()):
                raise RuntimeError(f"private audio routing is not isolated: {sinks}")
            print(f"Private audio routing verified: {sinks.strip()}", flush=True)
            return subprocess.run(sys.argv[1:], env=env, check=False).returncode
        finally:
            for process in (policy, pulse, core):
                process.terminate()
            for process in (policy, pulse, core):
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            for stream in logs:
                stream.close()


if __name__ == "__main__":
    raise SystemExit(main())
