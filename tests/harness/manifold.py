from __future__ import annotations

import glob
import json
import os
import platform
import shutil
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


class HarnessError(RuntimeError):
    pass


class LaunchError(HarnessError):
    pass


class TestFailure(AssertionError):
    pass


class SkipTest(RuntimeError):
    pass


REPO_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_ROOT = Path(os.environ.get("MANIFOLD_TEST_ARTIFACT_ROOT", "/tmp/manifold_test_artifacts"))


def repo_root() -> Path:
    return REPO_ROOT


def ensure_repo_on_path() -> None:
    root = str(REPO_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


@dataclass
class ArtifactBundle:
    name: str
    base_dir: Path = field(init=False)

    def __post_init__(self) -> None:
        ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        unique = f"{self.name}_{os.getpid()}_{timestamp}_{int(time.time_ns() % 1_000_000)}"
        self.base_dir = ARTIFACT_ROOT / unique
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def path(self, filename: str) -> Path:
        return self.base_dir / filename

    def write_text(self, filename: str, content: str) -> Path:
        path = self.path(filename)
        path.write_text(content, encoding="utf-8")
        return path

    def write_json(self, filename: str, payload: Any) -> Path:
        path = self.path(filename)
        path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        return path


def approx_equal(actual: float, expected: float, tolerance: float = 1e-3) -> bool:
    return abs(float(actual) - float(expected)) <= tolerance


def wait_for(predicate: Callable[[], bool], timeout: float = 2.0, step: float = 0.05) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if predicate():
                return True
        except Exception:
            pass
        time.sleep(step)
    return False


def _is_live_socket(path: str, timeout: float = 0.2) -> bool:
    probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    probe.settimeout(timeout)
    try:
        probe.connect(path)
        return True
    except (ConnectionRefusedError, FileNotFoundError, OSError):
        return False
    finally:
        probe.close()


def find_live_socket(explicit_path: str | None = None, cleanup_stale: bool = True) -> str:
    if explicit_path:
        if not os.path.exists(explicit_path):
            raise HarnessError(f"socket not found: {explicit_path}")
        if not _is_live_socket(explicit_path):
            raise HarnessError(f"socket is not live: {explicit_path}")
        return explicit_path

    candidates = sorted(glob.glob("/tmp/manifold_*.sock"), key=os.path.getmtime, reverse=True)
    if not candidates:
        raise HarnessError("no manifold socket found in /tmp")

    for path in candidates:
        if _is_live_socket(path):
            return path
        if cleanup_stale:
            try:
                os.unlink(path)
            except OSError:
                pass

    raise HarnessError("no live manifold socket found")


def has_gui_session() -> bool:
    system = platform.system()
    if system == "Linux":
        return bool(os.environ.get("WAYLAND_DISPLAY") or os.environ.get("DISPLAY"))
    return True


def require_gui_session(reason: str = "GUI session unavailable") -> None:
    if not has_gui_session():
        raise SkipTest(reason)


class ManifoldClient:
    def __init__(self, socket_path: str):
        self.socket_path = socket_path
        self.sock: socket.socket | None = None

    def connect(self) -> None:
        if self.sock is not None:
            return
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.socket_path)

    def close(self) -> None:
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

    def command(self, text: str) -> str:
        if self.sock is None:
            raise HarnessError("client is not connected")

        self.sock.sendall((text + "\n").encode("utf-8"))
        response = bytearray()
        while True:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise HarnessError("socket closed while waiting for response")
            response.extend(chunk)
            if response.endswith(b"\n"):
                break
        return response[:-1].decode("utf-8", errors="replace")

    def command_ok(self, text: str) -> str:
        response = self.command(text)
        if not response.startswith("OK"):
            raise TestFailure(f"expected OK response for {text!r}, got: {response}")
        return response

    def command_json(self, text: str) -> dict[str, Any]:
        response = self.command(text)
        if not response.startswith("OK "):
            raise TestFailure(f"expected JSON OK response for {text!r}, got: {response}")
        try:
            return json.loads(response[3:])
        except json.JSONDecodeError as exc:
            raise TestFailure(f"invalid JSON response for {text!r}: {exc}: {response[3:]}") from exc

    def state(self) -> dict[str, Any]:
        return self.command_json("STATE")

    def diagnose_payload(self) -> dict[str, Any]:
        return self.command_json("DIAGNOSE")

    def frame_timing(self) -> dict[str, Any]:
        payload = self.diagnose_payload()
        frame_timing = payload.get("frameTiming")
        if frame_timing is None:
            raise TestFailure("DIAGNOSE response does not contain frameTiming")
        return frame_timing

    def get_value(self, path: str) -> Any:
        payload = self.command_json(f"GET {path}")
        if "VALUE" not in payload:
            raise TestFailure(f"GET {path!r} missing VALUE field: {payload}")
        return payload["VALUE"]

    def eval(self, code: str) -> str:
        response = self.command(f"EVAL {code}")
        if response == "ERROR no lua engine":
            raise SkipTest("no lua engine attached")
        return response

    def reset_perf(self) -> None:
        response = self.command("PERF RESET")
        if response != "OK":
            raise TestFailure(f"PERF RESET failed: {response}")


class ManagedManifoldProcess:
    def __init__(
        self,
        executable: str | Path,
        args: list[str] | None = None,
        *,
        cwd: str | Path | None = None,
        env: dict[str, str] | None = None,
        artifact_name: str = "manifold_process",
    ):
        self.executable = str(executable)
        self.args = list(args or [])
        self.cwd = str(cwd or REPO_ROOT)
        self.env = dict(os.environ)
        if env:
            self.env.update(env)
        self.artifacts = ArtifactBundle(artifact_name)
        self.log_path = self.artifacts.path("process.log")
        self.proc: subprocess.Popen[str] | None = None
        self._log_handle = None
        self.socket_path: str | None = None

    def start(self, timeout: float = 10.0) -> str:
        if not shutil.which(self.executable) and not os.path.isfile(self.executable):
            raise LaunchError(f"executable not found: {self.executable}")

        self._log_handle = open(self.log_path, "w+", encoding="utf-8")
        self.proc = subprocess.Popen(
            [self.executable, *self.args],
            cwd=self.cwd,
            stdin=subprocess.DEVNULL,
            stdout=self._log_handle,
            stderr=self._log_handle,
            text=True,
            env=self.env,
        )

        expected_socket = f"/tmp/manifold_{self.proc.pid}.sock"
        deadline = time.time() + timeout
        while time.time() < deadline:
            if os.path.exists(expected_socket) and _is_live_socket(expected_socket):
                self.socket_path = expected_socket
                return expected_socket
            if self.proc.poll() is not None:
                raise LaunchError(
                    f"process exited early with code {self.proc.returncode}; log: {self.log_path}\n"
                    f"{self.get_log_tail()}"
                )
            time.sleep(0.05)

        raise LaunchError(f"timed out waiting for socket {expected_socket}; log: {self.log_path}")

    def stop(self, timeout: float = 5.0) -> None:
        if self.proc is not None and self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=timeout)
        self.proc = None

        if self._log_handle is not None:
            try:
                self._log_handle.close()
            except OSError:
                pass
            self._log_handle = None

    def get_log_text(self) -> str:
        if not self.log_path.exists():
            return ""
        return self.log_path.read_text(encoding="utf-8", errors="replace")

    def get_log_tail(self, max_chars: int = 4000) -> str:
        data = self.get_log_text()
        if len(data) <= max_chars:
            return data
        return data[-max_chars:]

    def create_client(self) -> ManifoldClient:
        if self.socket_path is None:
            raise HarnessError("process has not been started")
        client = ManifoldClient(self.socket_path)
        client.connect()
        return client
