#!/usr/bin/env python3
"""Package the exact accepted DAW review bundles alongside the native creator."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tarfile
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--clap-review', type=Path, required=True)
    parser.add_argument('--vst3-review', type=Path, required=True)
    parser.add_argument('--native-review', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    reviews = {kind: getattr(args, kind + '_review').resolve() for kind in ('clap', 'vst3')}
    reports = {kind: json.loads((path / 'report.json').read_text()) for kind, path in reviews.items()}
    for kind, report in reports.items():
        assert report['accepted'] and report['format'] == kind
        assert report['creatorBatchReportedToHost'] and report['nonSilentAudioAcrossEditsAndEditorClose']
    native_review=args.native_review.resolve()
    native_report=json.loads((native_review/'report.json').read_text())
    assert native_report['accepted'] and native_report['releaseMatchesSamePositionClick']
    assert native_report['binarySha256']==hashlib.sha256((ROOT/'target/debug/manifold-app').read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    scratch = ROOT / 'artifacts/filter-v01/tmp'
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='native-package-', dir=scratch) as directory:
        bundle = Path(directory) / 'Manifold-review'
        bundle.mkdir()
        shutil.copy2(ROOT / 'target/debug/manifold-app', bundle / 'manifold-app')
        subprocess.run(['strip', '--strip-debug', str(bundle / 'manifold-app')], check=True)
        for kind, path in reviews.items():
            shutil.copytree(path / 'plugins', bundle / kind)
            evidence = bundle / 'evidence' / kind
            evidence.mkdir(parents=True)
            for name in ('report.json', 'audio-levels.json', 'host-gesture-values.json', 'daw-recalled.png', 'daw-recalled.wav'):
                shutil.copy2(path / name, evidence / name)
            saved = re.sub(r'(?m)^(\s*FILE )"[^"]*"', r'\1"saw.wav"', (path / 'edited.rpp').read_text())
            (evidence / 'Filter-edited.rpp').write_text(saved)
            shutil.copy2(path / 'saw.wav', evidence / 'saw.wav')
        shutil.copy2(ROOT / 'web/public/filter-delivery/2026-10-01/Filter.manifold.json', bundle / 'Filter.manifold.json')
        native_evidence=bundle/'evidence/native';native_evidence.mkdir(parents=True)
        for name in ('report.json','live-native.mp4','native-drag.png','startup-recalled.png','reopened-package.json','after-rejection.json','Filter-native-saved.manifold.json'):
            shutil.copy2(native_review/name,native_evidence/name)
        (bundle / 'README.md').write_text('''# Manifold Filter review update 3

Linux x86_64. Run `./manifold-app` for the native Rust egui creator; monitoring
starts muted, and Listen enables it. This executable uses the development profile
with debug sections stripped. It is not a release performance benchmark.

The `clap` and `vst3` directories contain the exact bundles exercised in REAPER.
For CLAP keep ManifoldFX.clap, ManifoldFX-editor and assets together in the same
plug-in directory. For VST3 install the entire ManifoldFX.vst3 bundle.
These plug-in editors use the shared retained/egui-Wasm web presentation with
native Rust audio; direct native egui embedding in DAW windows remains open.

In both DAW hosts, source/UI edits, incoming automation, atomic creator batch
reporting to host parameters, editor close/reopen, and actual DAW source/parameter
save/reopen passed. Actual recordings were non-silent in all four stages.
The retained keyboard event was exercised through the actual component handler.
Physical pointer dragging and interactive egui controls inside the native DAW
editor remain unverified. These recordings do not prove glitch-free continuity.
Browser dragging was exercised separately with delayed acknowledgements.

Native standalone pointer gestures, release position, actual Open/Save buttons,
package startup recall, corrupt-package rejection and stale prior-project
request rejection were exercised in the actual egui application. Its coalesced
UI gestures use atomic parameter batches through the existing audio host.
Open a package with `./manifold-app Filter.manifold.json`, or enter its path in
the application's file field and press Open. Save keeps the controller bundle,
digest and package identity with the actual accepted graph/source/UI.
The evidence/native folder contains the real interaction video and saved package.
Native standalone still needs file/device input and broader device formats.
It currently offers saw/noise input and float32 output.
The Filter package and actual edited REAPER projects are included. The complete
legacy port and V01 fidelity/performance acceptance gates remain open.
''')
        files = {str(path.relative_to(bundle)): hashlib.sha256(path.read_bytes()).hexdigest()
                 for path in bundle.rglob('*') if path.is_file()}
        (bundle / 'files.sha256.json').write_text(json.dumps(files, indent=2) + '\n')
        with tarfile.open(args.output, 'w:gz') as archive:
            archive.add(bundle, arcname=bundle.name)
    manifest = {'archive': args.output.name, 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
                'bytes': args.output.stat().st_size, 'nativeStandaloneProfile': 'development, debug sections stripped',
                'clapSource': str(reviews['clap'].relative_to(ROOT)), 'vst3Source': str(reviews['vst3'].relative_to(ROOT)),
                'vst3Included': True, 'fullPortComplete': False, 'files': files}
    manifest['nativeSource']=str(native_review.relative_to(ROOT))
    args.output.with_suffix('.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({key: value for key, value in manifest.items() if key != 'files'}))


if __name__ == '__main__':
    main()
