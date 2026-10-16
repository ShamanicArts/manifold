#!/usr/bin/env python3
"""Package the exact executable from the accepted keyboard product review."""
import argparse,hashlib,json,shutil,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
public=ROOT/'web/public/oscillator-delivery/2026-10-01'
p=argparse.ArgumentParser()
p.add_argument('--review',type=Path,default=ROOT/'artifacts/oscillator-v02/native-keyboard-v9')
p.add_argument('--binary',type=Path,default=ROOT/'target/debug/manifold-app')
p.add_argument('--publish',default='keyboard-v1/native')
p.add_argument('--archive',default='Manifold-oscillator-linux-x86_64-r2.tgz')
p.add_argument('--optimized',action='store_true')
args=p.parse_args();review=args.review.resolve();binary=args.binary.resolve()
report=json.loads((review/'report.json').read_text())
assert report['accepted'] and hashlib.sha256(binary.read_bytes()).hexdigest()==report['binarySha256']
published=public/args.publish;published.mkdir(parents=True,exist_ok=True)
for file in review.iterdir():
 if file.is_file():shutil.copy2(file,published/file.name)
stage=ROOT/'artifacts/oscillator-v02'/Path(args.archive).stem/'Manifold-oscillator-review';stage.mkdir(parents=True,exist_ok=True)
shutil.copy2(binary,stage/'manifold-app')
shutil.copy2(review/'Oscillator-native-saved.manifold.json',stage/'Oscillator.manifold.json')
shutil.copy2(public/'keyboard-v1/Oscillator.package.manifold.json',stage/'Oscillator-original.manifold.json')
for name in ['report.json','live-native.mp4','native-held.png','native-envelope.png','native-output.wav','released-output.wav']:
 shutil.copy2(review/name,stage/name)
shutil.copy2(ROOT/'packages/manifold-author/examples/standalone-oscillator.mjs',stage/'oscillator-face.mjs')
shutil.copy2(ROOT/'packages/manifold-author/examples/rack-oscillator.mjs',stage/'rack-oscillator.mjs')
(stage/'README.md').write_text('''# Manifold playable oscillator review

Linux x86_64 PROFILE build. Run:

    ./manifold-app Oscillator.manifold.json

Press Listen, click the keyboard, then play A/D/G. Edit the original oscillator
controls and ADSR live. The included edited project has an additional gain node
and an edited sustain target. Save/Open preserve source, controls and the bundled
JavaScript controller. Oscillator-original.manifold.json is the original graph.

This is the exact unstripped executable from the adjacent accepted report. The video
contains actual native egui pixels and private-sink live audio. Source compilation
and publication measured PUBLICATION_MS ms in this run while audio kept
playing. This is not a glitch-free or native-versus-Wasm performance proof.
Hardware/DAW MIDI, Main Wave composition, legacy face/preview fidelity and
CLAP/VST3 oscillator interaction remain open. Platform audio/display libraries
must be installed. This increment does not complete the whole Manifold port.
'''.replace('PROFILE','optimized release' if args.optimized else 'development').replace('PUBLICATION_MS',str(round(report['sourcePublicationMs'],1))))
manifest={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in stage.iterdir() if p.is_file() and p.name!='SHA256.json'}
(stage/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n')
archive=public/args.archive
with tarfile.open(archive,'w:gz') as tar:tar.add(stage,arcname=stage.name)
result={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'nativeReview':args.publish,'developmentProfile':not args.optimized,'nativeExecutableSha256':report['binarySha256'],'files':manifest}
archive.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='files'}))
