#!/usr/bin/env python3
"""Package the exact native review with the public, inspectable DSP programs."""
import argparse,hashlib,json,shutil,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--review',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--extra-review',type=Path,action='append',default=[]);args=p.parse_args()
report=json.loads((args.review/'report.json').read_text());assert report['accepted']
binary=ROOT/'target/release/manifold-app';assert hashlib.sha256(binary.read_bytes()).hexdigest()==report['binarySha256']
original=ROOT/report['package'];saved=args.review/'Native-FX-slots.manifold.json'
assert json.loads(saved.read_text())['control']==json.loads(original.read_text())['control']
assert not args.output.exists(),'Published archives are immutable'
stage=ROOT/'artifacts/primitive-transcription/package'/args.output.stem/'Manifold-DSP-library';stage.mkdir(parents=True,exist_ok=True)
shutil.copy2(binary,stage/'manifold-app');shutil.copy2(saved,stage/'Project-reviewed.manifold.json')
shutil.copytree(ROOT/'web/public/packages/primitives',stage/'primitives',dirs_exist_ok=True)
count=len(list((stage/'primitives').glob('*.json')))
browser=json.loads((ROOT/'web/public/primitive-delivery/2026-10-02/browser/library-report.json').read_text())
assert browser['accepted'] and browser['programCount']==count
assert {p['id']for p in browser['programs']}=={p.name.removesuffix('.manifold.json')for p in (stage/'primitives').glob('*.json')}
programs=stage/'authoring-programs';programs.mkdir(exist_ok=True)
for path in (stage/'primitives').glob('*.json'):
 package=json.loads(path.read_text());(programs/(path.stem+'.creator.js')).write_text(package['state']['liveAuthoring']['source']+'\n')
review=stage/'review';review.mkdir(exist_ok=True)
for name in ['report.json','live-native.mp4','native-width-selected.png','native-source-edited.png','audio-routing.json']:shutil.copy2(args.review/name,review/name)
for extra in args.extra_review:
 extra_report=json.loads((extra/'report.json').read_text())
 assert extra_report['accepted'] and extra_report['binarySha256']==report['binarySha256']
 destination=review/Path(extra_report['package']).name.removesuffix('.manifold.json');destination.mkdir(exist_ok=True)
 for path in extra.iterdir():
  if path.suffix in ('.json','.mp4','.png'):shutil.copy2(path,destination/path.name)
(stage/'README.md').write_text('''# Manifold DSP live scripting library

Run an authored program with the native egui creator:

    ./manifold-app primitives/fx-slots.manifold.json
    ./manifold-app primitives/sample-hold.manifold.json
    ./manifold-app Project-reviewed.manifold.json

Press Listen to enable output. External-input programs offer Saw/Noise input;
oscillator/CV compositions generate their own signal. Switch Gate on in ADSR.
Edit the highlighted project source and Apply live while audio is running.
The source creates ordinary public graph primitives and the shared UI controls.
Save/Open preserve the accepted source, graph and controls. Agent HTTP requests
are shown in the application; inspect the current revision before editing.

The 25 programs are in primitives/. Their complete editable source is
also in authoring-programs/. These .creator.js files are function bodies evaluated
with the public manifold author API; use the package/library binding to load them.
The exact native FX selection/source-edit review and video are in review/.
All programs were signal-tested natively with live source edits and cold recall;
25 were reviewed with running sound and egui in the BB browser. The native GUI
video specifically reviews the original lazy Gain/Width FX harness. Additional
native program reviews, when included, are in named review/ subdirectories.

This is a transcription batch, not completion of the original project inventory.
Full effect factories, sample/capture workflows, MIDI processing, transport,
original rack faces, full Main/looper and DAW parity remain in the project ledger.
No claim of glitch-free publication or matched original C++ performance is made.
'''.replace('25',str(count)))
manifest={str(f.relative_to(stage)):hashlib.sha256(f.read_bytes()).hexdigest()for f in stage.rglob('*')if f.is_file()}
(stage/'SHA256.json').write_text(json.dumps(manifest,indent=2)+'\n');args.output.parent.mkdir(parents=True,exist_ok=True)
with tarfile.open(args.output,'w:gz')as archive:archive.add(stage,arcname=stage.name)
result={'archive':args.output.name,'sha256':hashlib.sha256(args.output.read_bytes()).hexdigest(),'bytes':args.output.stat().st_size,'nativeExecutableSha256':report['binarySha256'],'programCount':len(list((stage/'primitives').glob('*.json'))),'files':manifest}
args.output.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='files'}))
