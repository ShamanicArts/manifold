#!/usr/bin/env python3
"""Record exact public Sample authors through release callbacks and exported SDKs.

No editor or audio device is opened. Use a fresh MANIFOLD_SCRIPT_SAMPLE_LABEL.
"""
import datetime
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

repo = Path(__file__).resolve().parents[1]
label = os.environ.get("MANIFOLD_SCRIPT_SAMPLE_LABEL", "2026-09-30-scripted-samples-release-v1")
if not re.fullmatch(r"[a-z0-9-]+", label):
    raise ValueError("Use a safe fresh evidence label")
root = repo / "web/public/scripted-samples" / label
root.mkdir(parents=True, exist_ok=False)
digest = lambda data: hashlib.sha256(data).hexdigest()
paths = ["Cargo.toml", "Cargo.lock", "crates/manifold-native/tests/support/scripted_samples.rs",
         "crates/manifold-native/tests/support/callback_heap.rs", "crates/manifold-project-js/tests/worker.rs",
         "crates/manifold-clap/examples/probe_scripted_samples.rs",
         "crates/manifold-vst3/examples/probe_packaged_vst3.rs",
         "crates/manifold-vst3/examples/support/automation.rs", "scripts/verify-scripted-sample-hosts.py",
         "scripts/generate-sample-author-packages.mjs", "scripts/check-project-packages.sh",
         "examples/projects/rack-sample-project.mjs", "examples/projects/sample-instrument-project.mjs",
         "projects/graph-workspace/rack-sample-project.bundle.js", "projects/graph-workspace/sample-instrument-project.bundle.js",
         "web/public/packages/rack-sample-author.manifold.json", "web/public/packages/sample-instrument-author.manifold.json"]
for crate in ("manifold-core", "manifold-native", "manifold-project-js", "manifold-clap", "manifold-vst3"):
    paths.append(f"crates/{crate}/Cargo.toml")
    paths += [str(path.relative_to(repo)) for path in sorted((repo / "crates" / crate / "src").rglob("*.rs"))]
hashes = {path: digest((repo / path).read_bytes()) for path in paths}
for path in paths:
    destination = root / "measured-source" / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(repo / path, destination)
env = dict(os.environ, CARGO_BUILD_JOBS="2", MANIFOLD_SCRIPT_SAMPLE_EVIDENCE_DIR=str(root))
commands = []

def run(command, name):
    commands.append({"command": command, "log": name})
    with (root / name).open("x") as log:
        completed = subprocess.run(command, cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT)
    if completed.returncode:
        raise RuntimeError(f"Probe failed ({completed.returncode}); evidence retained in {root / name}")

run(["cargo", "build", "--release", "-p", "manifold-clap", "-p", "manifold-vst3", "--lib",
     "--example", "probe_scripted_samples", "--example", "probe_packaged_vst3"], "release-build.txt")
binaries = root / "binaries"
binaries.mkdir()
for name in ("libmanifold_clap.so", "libmanifold_vst3.so"):
    shutil.copyfile(repo / "target/release" / name, binaries / name)
for name in ("probe_scripted_samples", "probe_packaged_vst3"):
    shutil.copy2(repo / "target/release/examples" / name, binaries / name)
binary_hashes = {path.name: digest(path.read_bytes()) for path in binaries.iterdir()}
run(["cargo", "test", "--release", "-p", "manifold-clap", "-p", "manifold-vst3", "--lib",
     "scripted_sample_package_matches_native", "--", "--nocapture"], "release-callback-tests.txt")
run(["cargo", "test", "--release", "-p", "manifold-clap", "-p", "manifold-vst3", "--lib",
     "script_parameter_rejection_after_deactivation_can_retry"], "release-inactive-tests.txt")
rack = str(root / "measured-source/web/public/packages/rack-sample-author.manifold.json")
instrument = str(root / "measured-source/web/public/packages/sample-instrument-author.manifold.json")
run([str(binaries / "probe_scripted_samples"), str(binaries / "libmanifold_clap.so"), rack, instrument], "clap-sdk.txt")
run([str(binaries / "probe_packaged_vst3"), "--samples", str(binaries / "libmanifold_vst3.so"), rack, instrument], "vst3-sdk.txt")
reports = {}
for host in ("clap", "vst3", "clap-sdk", "vst3-sdk"):
    for kind in ("rack", "instrument"):
        folder = root / host / kind
        report = json.loads((folder / "report.json").read_text())
        assert report["maxDifference"] == 0
        assert report["callbackAllocations"] == (None if host.endswith("sdk") else 0)
        assert report["callbackDeallocations"] == (None if host.endswith("sdk") else 0)
        assert (folder / "edited.wav").read_bytes() == (folder / "native-reference.wav").read_bytes()
        assert (folder / "edited.wav").read_bytes() == (root / "clap" / kind / "edited.wav").read_bytes()
        report["recordingSha256"] = digest((folder / "edited.wav").read_bytes())
        report["packageSha256"] = digest((folder / "saved.manifold.json").read_bytes())
        reports[f"{host}/{kind}"] = report
for host, library in (("clap-sdk", "libmanifold_clap.so"), ("vst3-sdk", "libmanifold_vst3.so")):
    manifest = json.loads((root / host / "manifest.json").read_text())
    assert manifest["librarySha256"] == binary_hashes[library]
for path, expected in hashes.items():
    assert digest((repo / path).read_bytes()) == expected, f"Source changed during recording: {path}"
for name, expected in binary_hashes.items():
    assert digest((binaries / name).read_bytes()) == expected
report = {"recordedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "commands": commands,
          "sourceHashes": hashes, "binaryHashes": binary_hashes, "reports": reports,
          "scope": "Release Rust callback heap guards plus dynamically loaded CLAP/VST3 SDK PCM/state proof, compared to the same native JS author. No C++ oracle, DAW, audio device, host deadlines or cross-library allocator measurement in this run."}
(root / "publication-report.json").write_text(json.dumps(report, indent=2) + "\n")
players = []
for host in ("clap-sdk", "vst3-sdk"):
    for kind in ("rack", "instrument"):
        folder = f"{host}/{kind}"
        item = reports[folder]
        players.append(f'<section><h2>{html.escape(host.upper())} {kind.title()}</h2><p>{item["frames"]:,} stereo frames match the native JS host exactly.</p><audio controls preload="none" src="{folder}/edited.wav"></audio><p><a href="{folder}/saved.manifold.json">Download saved project package</a> · <a href="{folder}/report.json">Report</a></p>')
        if kind == "rack":
            players.append(f'<p>Fresh controller recall:</p><audio controls preload="none" src="{folder}/reopened.wav"></audio>')
        players.append('</section>')
sources = ''.join(f'<li><a href="measured-source/{path}">{html.escape(path)}</a></li>' for path in paths)
(root / "index.html").write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scripted Sample release host evidence</title>
<style>body{{font:16px system-ui;max-width:1000px;margin:40px auto;padding:0 24px;background:#151820;color:#e4e8f1}}a{{color:#9dcaff}}audio{{display:block;max-width:100%;margin:12px 0}}section{{border:1px solid #3a4354;padding:20px;margin:20px 0;border-radius:8px}}details{{margin:24px 0}}</style>
<h1>One scripted Sample project across release hosts</h1><p><a href="/native-sample-authoring.html">Play, edit, and recall these plug-in saves in the browser</a></p>
<p>The exact public Rack and Instrument packages run through exported CLAP and VST3 interfaces, without opening an editor or audio device. The Rack includes 16-target batches, eight gates, twelve topology edits, new PCM and fresh controller recall. Instrument includes timed notes, nine PCM publications, invalid target/offset rejection and continued authoring.</p>
<p>Separate release callback tests observe zero Rust allocations and deallocations. Dynamic-library probes do not observe private allocator counters. These references are v2; actual legacy project parity, complete Main, egui, DAW script automation and callback deadline evidence remain open.</p>
{''.join(players)}<h2>Evidence</h2><ul><li><a href="publication-report.json">Reports and source/binary hashes</a></li><li><a href="release-callback-tests.txt">Release callback heap tests</a></li><li><a href="clap-sdk.txt">CLAP exported-interface log</a></li><li><a href="vst3-sdk.txt">VST3 exported-interface log</a></li><li><a href="binaries/libmanifold_clap.so">Measured CLAP shared library</a></li><li><a href="binaries/libmanifold_vst3.so">Measured VST3 shared library</a></li></ul>
<details><summary>Measured source</summary><ul>{sources}</ul></details>
<script>for(const player of document.querySelectorAll('audio'))player.addEventListener('play',()=>{{for(const other of document.querySelectorAll('audio'))if(other!==player)other.pause();}});</script></html>''')
print(json.dumps({"review": str(root), "reports": reports}))
