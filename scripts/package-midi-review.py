#!/usr/bin/env python3
"""Publish only the exact binary and controller from a successful real MIDI review."""
import argparse,hashlib,json,shutil,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--review',type=Path,required=True);p.add_argument('--binary',type=Path,required=True);p.add_argument('--archive',required=True);p.add_argument('--publish',required=True);args=p.parse_args()
review=args.review.resolve();binary=args.binary.resolve();report=json.loads((review/'report.json').read_text());assert report['accepted'] and hashlib.sha256(binary.read_bytes()).hexdigest()==report['binarySha256']
public=ROOT/'web/public/oscillator-delivery/2026-10-01';stage=ROOT/'artifacts/oscillator-v02'/Path(args.archive).stem/'Manifold-oscillator-review';assert not (public/args.archive).exists();stage.mkdir(parents=True,exist_ok=True)
shutil.copy2(binary,stage/'manifold-app');shutil.copy2(review/'Oscillator-midi.manifold.json',stage/'Oscillator.manifold.json')
# Edited saved package must contain the exact current controller before packaging.
original=ROOT/'web/public/packages/oscillator-creator.manifold.json';saved=json.loads((stage/'Oscillator.manifold.json').read_text());assert saved['control']==json.loads(original.read_text())['control'];shutil.copy2(original,stage/'Oscillator-original.manifold.json')
for name in ['report.json','live-native-midi.mp4','midi-held.png','disconnected.png','midi-output.wav','released.wav','sent.jsonl']:shutil.copy2(review/name,stage/name)
for name in ['standalone-oscillator.mjs','rack-oscillator.mjs','oscillator-preview.mjs']:shutil.copy2(ROOT/'packages/manifold-author/examples'/name,stage/name)
shutil.copy2(ROOT/'packages/manifold-author/midi-control.js',stage/'midi-control.js')
(stage/'README.md').write_text('''# Manifold authored MIDI instrument

Linux x86_64 optimized release build. Run:

    ./manifold-app Oscillator.manifold.json

Press Listen. Refresh MIDI, then select your input. MIDI notes and sustain use
the same editable authored graph as the pointer/computer keyboard. Device
selection/disconnect releases only that input. CC123 releases keys (respecting
sustain); CC120 silences only its MIDI channel. The included edited graph adds
a gain node; source edits, controls and UI use the public creator API. Waveform and drive
previews use the public curve binding in retained and egui.

This exact executable passed actual native egui selection and ALSA virtual-port
review, including held notes through a graph edit, pedal, channel release, device
disconnect and an independent agent-owned note. The real screen/audio recording
and source are included. This is virtual protocol evidence, not a physical MIDI
keyboard or DAW test. Events publish at block boundaries following control-thread
acknowledgement; hardware timestamp/sample scheduling remains open.

Original full face/animated preview, Main Wave composition, CLAP/VST3 oscillator interaction
and matched C++/Rust/Wasm performance remain open. This is not full-port or
glitch-free completion. Platform audio/display libraries must be installed.
''')
manifest={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in stage.iterdir() if f.is_file()};(stage/'SHA256.json').write_text(json.dumps(manifest,indent=2))
archive=public/args.archive
with tarfile.open(archive,'w:gz') as tar:tar.add(stage,arcname=stage.name)
result={'archive':archive.name,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'bytes':archive.stat().st_size,'nativeReview':args.publish,'developmentProfile':False,'nativeExecutableSha256':report['binarySha256'],'files':manifest};archive.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
shutil.copytree(review,public/args.publish,dirs_exist_ok=True);print(json.dumps({k:v for k,v in result.items() if k!='files'}))
