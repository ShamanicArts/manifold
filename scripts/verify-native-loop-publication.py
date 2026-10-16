#!/usr/bin/env python3
"""Retain offline callback audio, actual sources and logs; opens no audio device."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("label", help="new evidence directory name; existing directories are rejected")
args = parser.parse_args()
if not re.fullmatch(r"[a-z0-9-]+", args.label):
    parser.error("label must contain only lowercase letters, digits and hyphens")
out = ROOT / "web/public/native-loop-publication" / args.label
out.mkdir(parents=True, exist_ok=False)
source = out / "measured-source"
source.mkdir()
paths = [
    "Cargo.lock", "scripts/verify-native-loop-publication.py",
    "crates/manifold-core/src/loop_capture.rs", "crates/manifold-core/src/graph.rs",
    "crates/manifold-native/src/project.rs", "crates/manifold-native/src/lib.rs",
    "crates/manifold-native/src/author.rs", "crates/manifold-native/tests/owned_loop_publication.rs",
    "crates/manifold-native/tests/support/callback_heap.rs",
    "crates/manifold-native/tests/support/loop_publication.rs",
    "crates/manifold-clap/src/graph.rs", "crates/manifold-vst3/src/graph_processor.rs",
    "crates/manifold-project-js/src/native_host.rs", "crates/manifold-project-js/src/lib.rs",
    "crates/manifold-project-js/tests/native_owned_loops.rs",
    "packages/manifold-author/index.js", "packages/manifold-author/sample-assets.js",
    "packages/manifold-author/examples/four-layer-loops.mjs",
    "packages/manifold-author/examples/loop-authoring.mjs",
    "projects/graph-workspace/loop-authoring-project.bundle.js",
    "projects/graph-workspace/authored-live-loop-route.json",
]
digest = lambda data: hashlib.sha256(data).hexdigest()
hashes = {}
for path in paths:
    data = (ROOT / path).read_bytes()
    destination = source / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    hashes[path] = digest(data)
commands = [
    ["cargo", "test", "-p", "manifold-native", "--test", "owned_loop_publication"],
    ["cargo", "test", "-p", "manifold-clap", "-p", "manifold-vst3", "owned_loop_publication_matches_native"],
    ["cargo", "test", "-p", "manifold-project-js", "--test", "native_owned_loops"],
]
env = {**os.environ, "MANIFOLD_NATIVE_LOOP_EVIDENCE_DIR": str(out)}
logs = []
for index, command in enumerate(commands):
    name = f"test-{index + 1}.log"
    print("Running", " ".join(command), flush=True)
    with (out / name).open("w") as log:
        subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    logs.append(name)
assert all(digest((ROOT / path).read_bytes()) == expected for path, expected in hashes.items()), "Sources changed during proof"
hosts = []
for host, expected_frames in [("clap", 57344), ("vst3", 57344), ("native-js", 57472)]:
    folder = out / host
    report = json.loads((folder / "report.json").read_text())
    edited = (folder / "edited.wav").read_bytes()
    reference = (folder / "reference.wav").read_bytes()
    assert edited == reference
    assert edited[:4] == b"RIFF" and edited[8:12] == b"WAVE"
    assert len(edited) == 44 + expected_frames * 8
    assert report["frames"] == expected_frames
    assert all(report[key] == 0 for key in ["differingSamples", "maxDifference", "callbackAllocations", "callbackDeallocations"])
    report["files"] = {name: digest((folder / name).read_bytes()) for name in ["edited.wav", "reference.wav", "saved-project.json", "report.json"]}
    hosts.append(report)
manifest = {"label": args.label, "scope": "Offline debug test binaries call actual native/CLAP/VST3 callback entry points. No device, real DAW or C++ comparison. Native JS uses the public four-layer module; plug-in tests use a different one-loop workload.",
            "toolchain": subprocess.check_output(["rustc", "--version"], text=True).strip(),
            "commands": commands, "logs": logs, "sourceHashes": hashes, "hosts": hosts}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
sections = []
for report in hosts:
    host = report["host"]
    sections.append(f'<section><h2>{html.escape(host)}</h2><p>{report["frames"]:,} identical stereo frames · 48 kHz · zero measured callback allocations or frees.</p>'
                    f'<p>{html.escape(report["scope"])}</p><p><a href="{host}/saved-project.json">Saved project + PCM</a> · <a href="{host}/report.json">Report</a></p>'
                    f'<label>Edited <audio controls preload="none" src="{host}/edited.wav"></audio></label>'
                    f'<label>Reference <audio controls preload="none" src="{host}/reference.wav"></audio></label></section>')
(out / "index.html").write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Manifold — native loop publication evidence</title><style>
body{background:#111820;color:#e6edf3;font:16px/1.5 system-ui;max-width:900px;margin:40px auto;padding:0 24px}a{color:#9dcfff}section{border-top:1px solid #3c4857;padding:18px 0}label{display:flex;align-items:center;gap:20px;margin:12px 0}audio{width:100%;max-width:580px}code{overflow-wrap:anywhere}</style>
<h1>Native loop publication</h1><p>The shared Rust engine keeps its take through graph edits, overdubbing, host stop and reopen. Listen to each edited stream and its unchanged reference below. Playback starts only when you press play.</p>
<p><a href="/prepared-loops.html">Open the live browser graph editor</a> · <a href="manifest.json">Sources, hashes, commands and scope</a></p>
<p>These are offline callback tests. The plug-in recordings use one loop; native JavaScript uses the public four-layer author module. They are separate signal comparisons, with no hardware or legacy C++ performance claim.</p>
''' + "\n".join(sections) + '''
<h2>Reproduce</h2><p><code>python scripts/verify-native-loop-publication.py YOUR-NEW-LABEL</code></p>
<p>Native JS snapshots currently require stopped audio. Main's full authored composition, Sample resource publication, egui and complete legacy parity remain in progress.</p>
<script>for(const player of document.querySelectorAll('audio'))player.addEventListener('play',()=>{for(const other of document.querySelectorAll('audio'))if(other!==player)other.pause()})</script></html>''')
print(json.dumps({"output": str(out), "hosts": [{"host": h["host"], "frames": h["frames"]} for h in hosts]}), flush=True)
