#!/usr/bin/env python3
"""Package an accepted offline CLAP proof for manual listening and download."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import shutil
import tarfile

ROOT = Path(__file__).resolve().parent.parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--browser-label", required=True)
    args = parser.parse_args()
    evidence = args.evidence.resolve()
    report = json.loads((evidence / "report.json").read_text())
    assert report["accepted"] is True
    assert digest(ROOT / "target/clap/ManifoldFX.clap") == report["moduleSha256"]
    assert digest(ROOT / "web/public/packages/arbitrary-io.manifold.json") == report["packageSha256"]
    assert evidence.is_relative_to(ROOT / "web/public/clap-io")
    assert all(character.isalnum() or character == '-' for character in args.browser_label)
    # Vite treats a .gz suffix as HTTP Content-Encoding. A .tgz filename
    # preserves the compressed archive bytes when a browser downloads it.
    archive = evidence / "Manifold-declared-io-linux-x86_64.tgz"
    if archive.exists():
        raise RuntimeError("Keep accepted bundles immutable; choose a fresh proof destination")
    with tarfile.open(archive, "w:gz") as bundle:
        for name in ["ManifoldFX.clap", "ManifoldFX-editor", "assets"]:
            bundle.add(ROOT / "target/clap" / name, arcname=name)
        bundle.add(ROOT / "web/public/packages/arbitrary-io.manifold.json", arcname="arbitrary-io.manifold.json")
    sources = [
        "crates/manifold-clap/src/graph.rs", "crates/manifold-clap/src/graph_io.rs",
        "crates/manifold-native/src/host_buffers.rs", "crates/manifold-native/src/io_automation.rs",
        "crates/manifold-native/src/lib.rs", "crates/manifold-native/tests/arbitrary_io.rs",
        "crates/manifold-project-js/tests/arbitrary_io.rs", "examples/projects/arbitrary-io-project.mjs",
        "projects/graph-workspace/arbitrary-io-project.bundle.js",
        "scripts/generate-arbitrary-io-package.mjs", "scripts/probe-clap-arbitrary-io.py",
        "scripts/publish-clap-io-review.py", "web/src/arbitrary-io.js",
    ]
    hashes = {}
    for source in sources:
        destination = evidence / "review-source" / source
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / source, destination)
        hashes[source] = digest(destination)
    logs = {
        "workspace-tests.txt": "/tmp/manifold-clap-io-final-workspace-tests.txt",
        "web-tests.txt": "/tmp/manifold-clap-io-web-tests.txt",
        "release-port-tests.txt": "/tmp/manifold-clap-io-release-port-tests.txt",
        "release-native-io-tests.txt": "/tmp/manifold-clap-io-release-native-tests.txt",
        "wasm-build.txt": "/tmp/manifold-clap-io-wasm-build.txt",
        "clap-build.txt": "/tmp/manifold-clap-io-package-build.txt",
    }
    for name, source in logs.items():
        shutil.copyfile(source, evidence / name)
    manifest = {"moduleSha256": report["moduleSha256"], "archiveSha256": digest(archive),
                "reviewSourceSnapshotHashes": hashes,
                "logHashes": {name: digest(evidence / name) for name in logs},
                "scope": report["scope"], "heapCounters": report["heapCounters"]}
    (evidence / "review-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    rows = ''.join(f'<tr><td>{direction}</td><td>{html.escape(port["name"])}</td><td>{port["channels"]}</td><td>{html.escape(port["type"] or "Discrete audio")}</td></tr>'
                   for direction, ports in report["ports"].items() for port in ports)
    (evidence / "index.html").write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manifold · authored buses in CLAP</title><style>body{{color-scheme:dark;background:#111923;color:#e7eff8;font:17px/1.5 system-ui;max-width:1040px;margin:35px auto;padding:0 22px}}section{{background:#1c2b3d;border-radius:10px;padding:22px;margin:20px 0}}a{{color:#abd5ff}}table{{width:100%;border-collapse:collapse}}td,th{{text-align:left;padding:12px;border-bottom:1px solid #415972}}audio{{width:100%}}.number{{font-size:28px;color:#b0efc9}}h1{{font-size:32px}}small{{color:#bdcadb}}</style>
<h1>One authored graph in the browser and CLAP</h1>
<p>The saved package declares three main input channels, an optional mono input, four independent outputs and a separate mono send. The same JavaScript controller owns its live routing in both hosts.</p>
<p><a href="/arbitrary-io.html">Open the live package editor</a> · <a href="/main-wave-author.html">Play Main’s Wave branch</a> · <a href="/packages/arbitrary-io.manifold.json">Download the portable package</a></p>
<section><h2>Actual exported CLAP host result</h2><p class="number">8,192 frames × 5 channels · zero differing samples</p>
<p>The CLAP recording matches both the fresh native library and actual browser AudioWorklet. Five live swaps, optional-input disconnection, rejected layouts and cold package recall passed. Malformed buffers left pending edits available for retry.</p>
<table><thead><tr><th>Direction</th><th>Saved bus</th><th>Channels</th><th>Host type</th></tr></thead><tbody>{rows}</tbody></table>
<p><small>This is an offline SDK host proof. A DAW, editor or audio device was not opened; performance and full Main parity are still unverified.</small></p></section>
<section><h2>Listen to the recalled routing</h2><p>Four changing sine inputs pass through the actual CLAP callback. The recalled script swaps the first two output routes. These are routing auditions, not Main’s synthesizer.</p>
<h3>Stem outputs 1–2</h3><p>330 Hz left, 220 Hz right after the saved swap.</p><audio controls preload="none" src="stems-1-2.wav"></audio>
<h3>Stem outputs 3–4</h3><p>440 Hz left and the optional 110 Hz input right.</p><audio controls preload="none" src="stems-3-4.wav"></audio>
<h3>Independent mono send</h3><p>The original 220 Hz input at half level.</p><audio controls preload="none" src="mono-send.wav"></audio></section>
<section><h2>Review the native build and proof</h2><p><a href="{archive.name}">Download the Linux x86_64 CLAP bundle</a> · <a href="saved.manifold.json">Download the recalled project package</a></p>
<p>Extract the bundle and keep its editor executable and assets beside ManifoldFX.clap. Bus authoring is exposed through the package/API; the existing plug-in editor has not gained a bus editor in this change.</p>
<p><a href="report.json">SDK report</a> · <a href="review-manifest.json">Binary/source/log hashes</a> · <a href="workspace-tests.txt">Workspace gate</a> · <a href="release-port-tests.txt">Release CLAP callback heap tests</a> · <a href="release-native-io-tests.txt">Release native I/O tests</a> · <a href="clap.f32">Raw five-channel recording</a> · <a href="/arbitrary-io/{args.browser_label}/report.json">Fresh browser/native report</a></p></section>
<p>Next: VST3 bus arrangements and DAW/device validation. Arbitrary module port widths, true Main looper/transport, egui and the complete legacy port remain open.</p>
<script>for(const player of document.querySelectorAll('audio'))player.addEventListener('play',()=>{{for(const other of document.querySelectorAll('audio'))if(other!==player)other.pause();}});</script></html>''')
    print(json.dumps({"evidence": str(evidence), "archiveBytes": archive.stat().st_size, "archiveSha256": manifest["archiveSha256"]}))


if __name__ == "__main__":
    main()
