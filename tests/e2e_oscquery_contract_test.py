#!/usr/bin/env python3
from __future__ import annotations

import argparse
import http.client
import json
import signal
import socket
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
if str(TESTS_DIR) not in sys.path:
    sys.path.insert(0, str(TESTS_DIR))

from harness import (  # noqa: E402
    ManagedManifoldProcess,
    TestFailure,
    repo_root,
    wait_for,
)


CONTRACT_SCRIPT = """\
function ui_init(root)
  if osc and osc.registerEndpoint then
    osc.registerEndpoint("/phase0/custom", {
      type = "f",
      range = {0.0, 1.0},
      access = 3,
      description = "Phase 0 contract endpoint"
    })
  end

  if osc and osc.setValue then
    osc.setValue("/phase0/custom", 0.5)
  end
end

function ui_update(state)
  if osc and osc.setValue then
    osc.setValue("/phase0/custom", 0.5)
  end
end
"""


class OscQueryContractHarness:
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
            artifact_name="headless_oscquery_contract",
        )
        self.client = None

        self.home_dir = self.process.artifacts.base_dir / "home"
        self.config_dir = self.home_dir / ".config"
        self.data_dir = self.home_dir / ".local" / "share"
        self.home_dir.mkdir(parents=True, exist_ok=True)
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.process.env.update(
            {
                "HOME": str(self.home_dir),
                "XDG_CONFIG_HOME": str(self.config_dir),
                "XDG_DATA_HOME": str(self.data_dir),
            }
        )

    def start(self) -> None:
        self.process.start(timeout=12.0)
        self.client = self.process.create_client()

        def lua_ready() -> bool:
            return self.client.command("EVAL return 1") == "OK 1"

        if not wait_for(lua_ready, timeout=4.0, step=0.05):
            raise TestFailure("lua engine never became ready")

    def stop(self) -> None:
        if self.client is not None:
            self.client.close()
            self.client = None
        self.process.stop()

    def http_get(self, port: int, path: str) -> tuple[int, str]:
        conn = http.client.HTTPConnection("127.0.0.1", port, timeout=2.0)
        try:
            conn.request("GET", path)
            response = conn.getresponse()
            return response.status, response.read().decode("utf-8", errors="replace")
        finally:
            conn.close()

    def eval_ok(self, code: str) -> str:
        response = self.client.eval(code)
        if not response.startswith("OK"):
            raise TestFailure(f"expected OK eval response for {code!r}, got: {response}")
        return response

    def command_ok(self, text: str) -> str:
        response = self.client.command(text)
        if not response.startswith("OK"):
            raise TestFailure(f"expected OK response for {text!r}, got: {response}")
        return response

    def write_failure_artifacts(self) -> None:
        try:
            if self.client is not None:
                self.process.artifacts.write_json("diagnose.json", self.client.diagnose_payload())
        except Exception:
            pass
        try:
            if self.client is not None:
                self.process.artifacts.write_json("state.json", self.client.state())
        except Exception:
            pass


def reserve_tcp_port() -> int:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def reserve_udp_port() -> int:
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


def canonical_json(payload: object) -> str:
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def tree_has_path(tree: dict, path: str) -> bool:
    node = tree
    for segment in [segment for segment in path.split("/") if segment]:
        contents = node.get("CONTENTS")
        if not isinstance(contents, dict) or segment not in contents:
            return False
        node = contents[segment]
    return True


def configure_oscquery(harness: OscQueryContractHarness, osc_port: int, query_port: int) -> None:
    response = harness.eval_ok(
        f"return osc.setSettings({{inputPort={osc_port}, queryPort={query_port}, oscEnabled=true, oscQueryEnabled=true}})"
    )
    if response != "OK true":
        raise TestFailure(f"osc.setSettings failed: {response}")

    def http_ready() -> bool:
        try:
            status, body = harness.http_get(query_port, "/?HOST_INFO")
            if status != 200:
                return False
            payload = json.loads(body)
            return payload.get("OSC_PORT") == osc_port and payload.get("WS_PORT") == query_port
        except Exception:
            return False

    if not wait_for(http_ready, timeout=5.0, step=0.1):
        raise TestFailure(f"OSCQuery server never came up on port {query_port}")


def load_contract_script(harness: OscQueryContractHarness) -> Path:
    script_path = harness.process.artifacts.write_text("phase0_oscquery_contract.lua", CONTRACT_SCRIPT)
    harness.command_ok(f"UISWITCH {script_path}")
    return script_path


def collect_tree(harness: OscQueryContractHarness, query_port: int) -> dict:
    status, body = harness.http_get(query_port, "/info")
    if status != 200:
        raise TestFailure(f"GET /info failed: status={status} body={body!r}")
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise TestFailure(f"OSCQuery tree is not valid JSON: {exc}: {body[:400]!r}") from exc


def build_contract_tree(harness: OscQueryContractHarness) -> dict:
    osc_port = reserve_udp_port()
    query_port = reserve_tcp_port()
    configure_oscquery(harness, osc_port, query_port)
    load_contract_script(harness)

    latest_tree: dict = {}

    def custom_endpoint_ready() -> bool:
        nonlocal latest_tree
        try:
            latest_tree = collect_tree(harness, query_port)
            return tree_has_path(latest_tree, "/phase0/custom") and tree_has_path(latest_tree, "/core/behavior/tempo")
        except Exception:
            return False

    if not wait_for(custom_endpoint_ready, timeout=5.0, step=0.1):
        raise TestFailure("contract script endpoint never appeared in OSCQuery tree")

    harness.process.artifacts.write_json("oscquery_tree_actual.json", latest_tree)
    return latest_tree


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="OSCQuery contract harness")
    parser.add_argument("--headless", default="build-dev/ManifoldHeadless", help="Path to ManifoldHeadless executable")
    parser.add_argument("--duration", type=float, default=30.0, help="Headless runtime duration in seconds")
    parser.add_argument("--samplerate", type=float, default=44100.0, help="Sample rate")
    parser.add_argument("--blocksize", type=int, default=512, help="Block size")
    parser.add_argument("--write-golden", help="Write canonical OSCQuery tree JSON to this path")
    parser.add_argument("--verify-golden", help="Verify canonical OSCQuery tree JSON against this path")
    args = parser.parse_args(argv[1:])

    if bool(args.write_golden) == bool(args.verify_golden):
        parser.error("exactly one of --write-golden or --verify-golden is required")
    return args


def install_signal_handlers(cleanup) -> None:
    def handler(signum, _frame):
        cleanup()
        raise KeyboardInterrupt(f"signal {signum}")

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    harness = OscQueryContractHarness(args.headless, args.duration, args.samplerate, args.blocksize)
    install_signal_handlers(harness.stop)

    try:
        harness.start()
        tree = build_contract_tree(harness)
        canonical = canonical_json(tree)

        if args.write_golden:
            path = Path(args.write_golden)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(canonical, encoding="utf-8")
            print(f"OSCQuery contract written to {path}")
            return 0

        golden_path = Path(args.verify_golden)
        if not golden_path.exists():
            raise TestFailure(f"golden file does not exist: {golden_path}")

        expected = canonical_json(json.loads(golden_path.read_text(encoding="utf-8")))
        if expected != canonical:
            actual_path = harness.process.artifacts.write_text("oscquery_tree_mismatch.actual.json", canonical)
            raise TestFailure(
                f"OSCQuery contract mismatch: expected={golden_path} actual={actual_path}"
            )

        print(f"OSCQuery contract PASS ({golden_path})")
        return 0
    except KeyboardInterrupt:
        print("Interrupted")
        return 2
    except Exception as exc:
        harness.write_failure_artifacts()
        print(f"OSCQuery contract failure: {exc}")
        log_tail = harness.process.get_log_tail()
        if log_tail:
            print("\nManifoldHeadless log tail:\n")
            print(log_tail)
        print(f"Artifacts: {harness.process.artifacts.base_dir}")
        return 1
    finally:
        harness.stop()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
