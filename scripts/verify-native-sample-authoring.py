#!/usr/bin/env python3
"""Record actual native JS Sample callbacks in a fresh immutable review directory."""
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
label = os.environ.get("MANIFOLD_NATIVE_SAMPLE_LABEL", "2026-09-30-native-samples-v3")
if not re.fullmatch(r"[a-z0-9-]+", label):
    raise ValueError("Use a safe fresh evidence label")
root = repo / "web/public/native-samples" / label
root.mkdir(parents=True, exist_ok=False)
paths = [
    "Cargo.lock", "crates/manifold-project-js/Cargo.toml",
    "crates/manifold-project-js/src/lib.rs", "crates/manifold-project-js/src/native_host.rs",
    "crates/manifold-project-js/src/worker.rs", "crates/manifold-project-js/tests/native_samples.rs",
    "crates/manifold-native/src/lib.rs", "crates/manifold-native/src/project.rs",
    "crates/manifold-native/tests/support/callback_heap.rs",
    "crates/manifold-core/src/graph.rs", "crates/manifold-core/src/sample_region.rs",
    "crates/manifold-core/src/sample_instrument.rs", "crates/manifold-core/src/phase_vocoder.rs",
    "packages/manifold-author/index.js", "packages/manifold-author/sample-assets.js",
    "packages/manifold-author/catalog.generated.js",
    "packages/manifold-author/examples/rack-sample-eight-voice.mjs",
    "packages/manifold-author/examples/sample-voice-chain.mjs",
    "examples/projects/rack-sample-project.mjs", "examples/projects/sample-instrument-project.mjs",
    "projects/graph-workspace/rack-sample-project.bundle.js",
    "projects/graph-workspace/sample-instrument-project.bundle.js",
    "scripts/verify-native-sample-authoring.py",
]
digest = lambda data: hashlib.sha256(data).hexdigest()
hashes = {path: digest((repo / path).read_bytes()) for path in paths}
for path in paths:
    destination = root / "measured-source" / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(repo / path, destination)
env = dict(os.environ, MANIFOLD_NATIVE_SAMPLE_EVIDENCE_DIR=str(root))
command = ["cargo", "test", "-p", "manifold-project-js", "--test", "native_samples", "--", "--nocapture"]
with (root / "native-tests.txt").open("w") as log:
    completed = subprocess.run(command, cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT)
if completed.returncode:
    raise RuntimeError(f"Native probe failed; evidence retained at {root}")
for path, expected in hashes.items():
    assert digest((repo / path).read_bytes()) == expected, f"Source changed during recording: {path}"
rack = json.loads((root / "report.json").read_text())
instrument = json.loads((root / "instrument/report.json").read_text())
assert rack["maxDifference"] == instrument["heldMaxDifference"] == 0
assert instrument["newNoteMaxDifference"] > 0.001
report = {
    "recordedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "command": command, "rack": rack, "instrument": instrument, "sourceHashes": hashes,
    "revision": subprocess.check_output(["jj", "log", "-r", "@", "--no-graph", "-T", "change_id ++ \" \" ++ commit_id"], cwd=repo, text=True),
    "scope": "Native library JS control/audio handle. No audio devices, native/Wasm numerical comparison or C++ oracle in this run. CLAP/VST3 script event/batch dispatch remains open.",
}
(root / "publication-report.json").write_text(json.dumps(report, indent=2) + "\n")
players = [
    ("Rack with 12 live unity edits", "edited.wav"), ("Rack without those edits", "reference.wav"),
    ("Rack reopened and activated by a fresh JS controller", "reopened.wav"),
    ("Instrument with new PCM publications", "instrument/edited.wav"),
    ("Instrument retaining its original source", "instrument/reference.wav"),
]
audio = "\n".join(f'<h3>{html.escape(title)}</h3><audio controls preload="none" src="{path}"></audio><a href="{path}">Download WAV</a>' for title, path in players)
sources = "\n".join(f'<li><a href="measured-source/{path}">{html.escape(path)}</a></li>' for path in paths)
(root / "index.html").write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Native JS Sample evidence</title>
<style>body{{font:16px system-ui;max-width:1000px;margin:40px auto;padding:0 24px;background:#151820;color:#e4e8f1}}a{{color:#9dcaff}}audio{{display:block;max-width:100%;margin:10px 0}}pre{{white-space:pre-wrap}}h3{{margin-top:28px}}</style>
<h1>Native JS Sample authoring</h1><p><a href="/native-sample-authoring.html">Interact with the same authored entries in the browser</a></p>
<p>Rack: {rack['frames']:,} stereo frames match the untouched v2 reference exactly. Instrument: {instrument['heldFrames']:,} held-note frames match despite PCM publications; subsequent new-source notes intentionally differ. All measured Rust callbacks allocate and deallocate zero times.</p>
<p>Native library evidence; C++ parity, matched host performance and actual release DAW script events/batches remain open. Browser UI is a review harness; egui migration remains open.</p>{audio}
<h2>State and reports</h2><ul><li><a href="saved-project.json">Rack graph + shared PCM</a></li><li><a href="instrument/saved-project.json">Instrument graph + new PCM</a></li><li><a href="publication-report.json">Full report and source hashes</a></li><li><a href="native-tests.txt">Actual callback test log</a></li></ul><details><summary>Measured source</summary><ul>{sources}</ul></details>
<script>for(const player of document.querySelectorAll('audio'))player.addEventListener('play',()=>{{for(const other of document.querySelectorAll('audio'))if(other!==player)other.pause();}});</script></html>''')
print(json.dumps({"review": str(root), "rack": rack, "instrument": instrument}))
