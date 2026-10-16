#!/usr/bin/env python3
"""Compile a v2-owned benchmark against a separately built, read-only C++ tree.

First run:
  cmake -S /home/shamanic/dev/my-plugin -B /tmp/manifold-legacy-sample-perf-build -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
  cmake --build /tmp/manifold-legacy-sample-perf-build --target GraphRuntimePerfHarness -j4
Then run this script. It never writes into the historical checkout.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "projects/graph-workspace/authored-rack-sample-eight-voice-unison3.json"
SOURCE = ROOT / "tools/legacy_rack_sample_bench.cpp"
OLD_HARNESS = "manifold/headless/GraphRuntimePerfHarness.cpp"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build-dir", type=Path, default=Path("/tmp/manifold-legacy-sample-perf-build"))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--dry", action="store_true", help="Set all historical vocoders to dry mix")
    parser.add_argument("--trace", action="store_true", help="Emit per-block absolute sums for signal diagnosis")
    args = parser.parse_args()
    build = args.build_dir.resolve()
    harness = build / "GraphRuntimePerfHarness"
    if not harness.exists():
        parser.error(f"build historical GraphRuntimePerfHarness first: {harness}")

    fixture_bytes = FIXTURE.read_bytes()
    fixture = json.loads(fixture_bytes)
    assets = fixture["assets"]
    if len(assets) != 1 or assets[0]["frames"] != 4800 or assets[0]["sourceRate"] != 48000:
        parser.error("the expected 48 kHz Rack Sample PCM fixture changed")
    pcm = base64.b64decode(assets[0]["pcmF32Base64"], validate=True)
    if len(pcm) != 4800 * 2 * 4:
        parser.error("unexpected PCM size")
    commands = json.loads((build / "compile_commands.json").read_text())
    entry = next(item for item in commands if item["file"].endswith(OLD_HARNESS))
    compiler = shlex.split(entry["command"])
    old_root = Path(entry["file"]).resolve().parents[2]
    link_file = build / "CMakeFiles/GraphRuntimePerfHarness.dir/link.txt"
    link = shlex.split(link_file.read_text())
    old_object = "CMakeFiles/GraphRuntimePerfHarness.dir/manifold/headless/GraphRuntimePerfHarness.cpp.o"
    if old_object not in link:
        parser.error("historical harness link recipe changed")

    with tempfile.TemporaryDirectory(prefix="manifold-legacy-sample-") as temp:
        temp = Path(temp)
        pcm_path = temp / "sample.f32le"
        object_path = temp / "bench.o"
        binary_path = temp / "bench"
        pcm_path.write_bytes(pcm)
        old_source = entry["file"]
        compiler[compiler.index(old_source)] = str(SOURCE)
        compiler[compiler.index("-o") + 1] = str(object_path)
        subprocess.run(compiler, cwd=entry["directory"], check=True)
        link[link.index(old_object)] = str(object_path)
        link[link.index("-o") + 1] = str(binary_path)
        subprocess.run(link, cwd=build, check=True)
        command = [binary_path, pcm_path] + (["--dry"] if args.dry else []) + (["--trace"] if args.trace else [])
        runs = [json.loads(subprocess.check_output(command, cwd=build))
                for _ in range(1 if args.trace else 3)]

    median = lambda key: sorted(run[key] for run in runs)[len(runs) // 2]
    report = {
        "schemaVersion": 1,
        "fixture": str(FIXTURE.relative_to(ROOT)),
        "vocoderDry": args.dry,
        "signalTrace": args.trace,
        "fixtureSha256": hashlib.sha256(fixture_bytes).hexdigest(),
        "pcmSha256": hashlib.sha256(pcm).hexdigest(),
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "oldSourceRevision": subprocess.check_output(
            ["git", "-C", str(old_root), "rev-parse", "HEAD"], text=True).strip(),
        "oldKernelSha256": {
            name: hashlib.sha256((old_root / name).read_bytes()).hexdigest()
            for name in ("dsp/core/nodes/SampleRegionPlaybackNode.cpp",
                         "dsp/core/nodes/PhaseVocoderNode.cpp",
                         "manifold/primitives/scripting/GraphRuntime.cpp")
        },
        "compiler": subprocess.check_output([compiler[0], "--version"], text=True).splitlines()[0],
        "buildDir": str(build),
        "runs": runs,
        "medianOfRuns": {key: median(key) for key in
                         ("p50Us", "p95Us", "p99Us", "maxUs", "prepareMs")},
        "limits": "Same source PCM, voices, unison, FFT order, rate, block size, and trigger schedule; "
                  "historical C++ and v2 Rust kernels/graph adapters are different implementations. "
                  "Offline sequential timing is not a real device deadline guarantee.",
    }
    result = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(result)
    print(result, end="")


if __name__ == "__main__":
    main()
