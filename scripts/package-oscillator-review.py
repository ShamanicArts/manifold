#!/usr/bin/env python3
"""Package the exact reviewed native executable and its authored oscillator."""
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
ROOT=Path(__file__).resolve().parent.parent
public=ROOT/'web/public/oscillator-delivery/2026-10-01'
report=json.loads((public/'native-v3/report.json').read_text())
binary=ROOT/'target/debug/manifold-app'
assert report['accepted'] and hashlib.sha256(binary.read_bytes()).hexdigest()==report['binarySha256']
stage=ROOT/'artifacts/oscillator-v02/package/Manifold-oscillator-review'
stage.mkdir(parents=True,exist_ok=True)
shutil.copy2(binary,stage/'manifold-app')
shutil.copy2(public/'native-v3/StandaloneOsc-native-saved.manifold.json',stage/'StandaloneOsc.manifold.json')
shutil.copy2(public/'StandaloneOsc.package.manifold.json',stage/'StandaloneOsc-original.manifold.json')
for name in ['report.json','live-native.mp4','native-drag.png','native-output.wav']:
    shutil.copy2(public/'native-v3'/name,stage/name)
shutil.copy2(ROOT/'packages/manifold-author/examples/standalone-oscillator.mjs',stage/'oscillator-face.mjs')
shutil.copy2(ROOT/'packages/manifold-author/examples/rack-oscillator.mjs',stage/'rack-oscillator.mjs')
(stage/'README.md').write_text('''# Manifold oscillator review

Linux x86_64 development build. Run from this directory:

    ./manifold-app StandaloneOsc.manifold.json

Press Listen. The included edited project recalls a manual voice level of 0.77.
The original project starts with Manual Level at zero. The same authored graph,
controller and shared egui face are used in the browser and native QuickJS host.
Edit the controls/source live; Save/Open retain the bundled controller.

This is the exact executable reviewed by native-v3, without stripping. The
recording contains actual native pixels and private-sink live audio. This build
requires the installed platform audio/display libraries. CLAP/VST3 oscillator,
keyboard/MIDI/ADSR, original preview and performance/fidelity gates remain open.
''')
manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in stage.iterdir() if p.is_file() and p.name!='SHA256.json'}
(stage/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive=public/'Manifold-oscillator-linux-x86_64-r1.tgz'
with tarfile.open(archive,'w:gz') as tar:tar.add(stage,arcname=stage.name)
result={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'nativeReview':'native-v3','developmentProfile':True,'nativeExecutableSha256':report['binarySha256'],'files':manifest}
(archive.with_suffix('.json')).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='files'}))
