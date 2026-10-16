#!/usr/bin/env python3
"""Bundle a measured exported VST3 proof with playable routing auditions."""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path
import shutil
import tarfile

ROOT = Path(__file__).resolve().parent.parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args()
    evidence = args.evidence.resolve()
    assert evidence.is_relative_to(ROOT / "web/public/vst3-io")
    report = json.loads((evidence / "report.json").read_text())
    assert report["accepted"] is True
    bundle = ROOT / "target/vst3/ManifoldFX.vst3"
    assert digest(bundle / "Contents/x86_64-linux/ManifoldFX.so") == report["moduleSha256"]
    package = ROOT / "web/public/packages/arbitrary-io.manifold.json"
    assert digest(package) == report["packageSha256"]
    daw = evidence / "reaper-review"
    daw_report=json.loads((daw / "report.json").read_text())
    assert daw_report["accepted"] is True and daw_report["actualDawSaveRetainedControllerAndIo"] is True
    assert daw_report["librarySha256"] == report["moduleSha256"]
    # Preserve the original measured RPP; make a separate relocatable review copy.
    project=(daw / "authored-io.rpp").read_text()
    input_paths=re.findall(r'FILE "([^"\n]*four-inputs.wav)"',project)
    assert input_paths and all(digest(Path(path))==digest(daw / "four-inputs.wav") for path in input_paths)
    for path in input_paths: project=project.replace(path,"four-inputs.wav")
    project=re.sub(r'RENDER_FILE "[^"\n]*"','RENDER_FILE "authored-io.wav"',project)
    portable=evidence / "authored-io-portable.rpp"
    portable.write_text(project)
    archive = evidence / "Manifold-authored-io-linux-x86_64.tgz"
    assert not archive.exists(), "retain accepted artifacts; use a fresh destination"
    with tarfile.open(archive, "w:gz") as output:
        output.add(bundle, arcname="ManifoldFX.vst3")
        output.add(package, arcname="arbitrary-io.manifold.json")
        output.add(evidence / "saved.manifold.json", arcname="recalled.manifold.json")
        output.add(portable,arcname="review/authored-io.rpp")
        for name in ["four-inputs.wav","authored-io.wav","recalled.manifold.json"]:
            output.add(daw / name,arcname="review/"+name)
    sources = ["crates/manifold-vst3/src/graph_io.rs", "crates/manifold-vst3/src/graph_processor.rs",
               "crates/manifold-vst3/src/graph_controller.rs", "crates/manifold-vst3/examples/support/declared_io.rs",
               "crates/manifold-vst3/examples/probe_packaged_vst3.rs", "scripts/publish-vst3-io-review.py",
               "crates/manifold-native/src/host_buffers.rs", "crates/manifold-native/src/io_automation.rs",
               "scripts/verify-declared-io-reaper.py", "scripts/with-headless-weston.py", "scripts/with-private-null-audio.py", "web/src/arbitrary-io.js", "web/arbitrary-io.html"]
    hashes = {}
    for source in sources:
        destination = evidence / "review-source" / source
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / source, destination)
        hashes[source] = digest(destination)
    logs = {"workspace-tests.txt": "/tmp/manifold-vst3-io-workspace-tests.txt",
            "release-callback-tests.txt": "/tmp/manifold-vst3-io-release-tests.txt",
            "vst3-build.txt": "/tmp/manifold-vst3-io-build.txt",
            "reaper-probe.txt": "/tmp/manifold-vst3-io-reaper-review.txt"}
    for destination, source in logs.items():
        shutil.copyfile(source, evidence / destination)
    manifest = {"moduleSha256": report["moduleSha256"], "archiveSha256": digest(archive),
                "packageSha256": report["packageSha256"], "dawReport": daw_report, "sources": hashes,
                "logs": {name: digest(evidence / name) for name in logs}}
    (evidence / "review-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    rows = ''.join(f'<tr><td>{port["direction"]}</td><td>{html.escape(port["name"])}</td><td>{port["channels"]}</td></tr>'
                   for port in report["ports"]["buses"])
    (evidence / "index.html").write_text(f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manifold · one authored graph across hosts</title><style>body{{color-scheme:dark;background:#111923;color:#e7eff8;font:17px/1.5 system-ui;max-width:1040px;margin:35px auto;padding:0 22px}}section{{background:#1c2b3d;border-radius:10px;padding:22px;margin:20px 0}}a{{color:#abd5ff}}table{{width:100%;border-collapse:collapse}}td,th{{text-align:left;padding:12px;border-bottom:1px solid #415972}}audio{{width:100%}}.result{{font-size:27px;color:#b0efc9}}h1{{font-size:32px}}small{{color:#bdcadb}}</style>
<h1>One authored graph across four audio hosts</h1><p>JavaScript authors and edits the graph. Rust processes it. The same saved package now declares its buses in the browser, native library, CLAP and VST3.</p>
<p><a href="/arbitrary-io.html?package=/vst3-io/{evidence.name}/reaper-review/recalled.manifold.json">Open the actual DAW save in the live editor</a> · <a href="/arbitrary-io.html">Default routing editor</a> · <a href="/main-wave-author.html">Play Main’s authored Wave branch</a></p>
<section><h2>Measured plug-in result</h2><p class="result">8,192 frames × 5 channels · zero differing samples</p>
<p>The actual exported VST3 callback matches the native, browser AudioWorklet and exported CLAP recordings exactly. Five live script swaps, cold package recall and another script edit passed. Malformed buffers retained the pending edit; invalid layouts retained the working graph.</p>
<table><thead><tr><th>Direction</th><th>Authored bus</th><th>Channels</th></tr></thead><tbody>{rows}</tbody></table>
<p><small>The graph retains its 3+1 input and 4+1 output groups. VST3 projects wider groups as named mono ports, avoiding inferred surround roles. The raw comparison above uses the offline exported SDK interface.</small></p></section>
<section><h2>Actual REAPER save and reopen</h2><p class="result">Five routed signals · largest sample error below 6.4e-8</p><p>REAPER 7.79 discovers all four input and five output channels, saves the actual JavaScript controller and channel maps, then reopens that saved project to render one second of audio. The sixth DAW track channel is verified silence.</p><p><a href="reaper-review/setup.png">See the isolated DAW</a> · <a href="reaper-review/report.json">DAW report</a> · <a href="reaper-review/recalled.manifold.json">Actual DAW-saved portable package</a> · <a href="reaper-review/authored-io.wav">Six-channel DAW render</a></p><p><small>This proves the measured package’s channel routing and recall in REAPER, with a private null sink and disposable display. DAW script calls and bus-changing preset import are not established by this probe. Full Main behavior and performance parity remain open.</small></p></section>
<section><h2>Hear the recalled graph</h2><p>Four host sine inputs pass through the measured VST3 callback. The saved JavaScript controller swaps the first two stem routes. These are routing auditions.</p>
<h3>Stems 1–2: 330 Hz / 220 Hz after the swap</h3><audio controls preload="none" src="stems-1-2.wav"></audio>
<h3>Stems 3–4: 440 Hz / optional 110 Hz input</h3><audio controls preload="none" src="stems-3-4.wav"></audio>
<h3>Independent mono send: original 220 Hz at half level</h3><audio controls preload="none" src="mono-send.wav"></audio></section>
<section><h2>Build and evidence</h2><p><a href="{archive.name}">Download the Linux VST3 build and packages</a> · <a href="saved.manifold.json">Recalled portable package</a> · <a href="/clap-io/2026-09-30-clap-io-v1/">CLAP build and evidence</a></p>
<p>Extract the archive; the complete ManifoldFX.vst3 directory includes the editor and its assets. Bus authoring is currently exposed through the graph API/package and the web editor.</p>
<p><a href="report.json">Exported interface report</a> · <a href="review-manifest.json">Measured binary/source hashes</a> · <a href="workspace-tests.txt">Workspace tests</a> · <a href="release-callback-tests.txt">Release callback heap guards</a> · <a href="vst3.f32">Raw five-channel recording</a></p></section>
<p>The complete legacy port remains active: broader DAW and native-device I/O, wider module ports, Main’s remaining branches and true LoopLayer/transport, egui and matched performance comparisons are still required.</p>
<script>for(const player of document.querySelectorAll('audio'))player.addEventListener('play',()=>{{for(const other of document.querySelectorAll('audio'))if(other!==player)other.pause();}});</script></html>''')
    print(json.dumps({"evidence": str(evidence), "archiveBytes": archive.stat().st_size, "archiveSha256": manifest["archiveSha256"]}))


if __name__ == "__main__":
    main()
