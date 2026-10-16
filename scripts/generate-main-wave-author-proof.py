#!/usr/bin/env python3
"""Compare a public authored Main voice with the actual legacy C++ node route."""
import hashlib, json, math, os, struct, subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
LEGACY = ROOT.parent / 'my-plugin'
LABEL = os.environ.get('MANIFOLD_MAIN_WAVE_PROOF_LABEL', '2026-09-30-main-wave-author-v1')
if not LABEL.replace('-', '').isalnum(): raise ValueError('Invalid evidence label')
OUT = ROOT / 'web/public/main-wave-author' / LABEL
OUT.mkdir(parents=True, exist_ok=False)
cpp = subprocess.check_output([str(ROOT / 'scripts/build-legacy-main-wave-voice-reference.sh')], text=True).strip()
subprocess.run(['cargo','build','-p','manifold-project-js','--example','render_authored_actions','--release'],cwd=ROOT,check=True)
native = ROOT / 'target/release/examples/render_authored_actions'
package = ROOT / 'web/public/packages/main-wave-author.manifold.json'
frequency = struct.unpack('<f',struct.pack('<f',440*2**((60-69)/12)))[0]
def wav(path, pcm):
    header=struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF',len(pcm)+36,b'WAVE',b'fmt ',16,3,2,48000,384000,8,32,b'data',len(pcm))
    path.write_bytes(header+pcm)
cases=[]
for name,waveform,blend,block in [('sine',0,-1,128),('saw',1,-1,17),('midpoint',0,0,511),('triangle',3,.7,128)]:
    source=f"""
import {{createGraphWorkspace}} from './packages/manifold-author/index.js';
import {{addMainWaveVoice}} from './packages/manifold-author/examples/main-wave-graph.mjs';
const g=createGraphWorkspace();const v=addMainWaveVoice(g,{{index:1,firstNodeId:10}});
g.setParameter(v.oscillator,0,{waveform});g.setParameter(v.oscillator,1,{frequency});
g.setParameter(v.mix,0,{blend});g.setParameter(v.direction,0,{blend});
g.connect(v.output.output('out'),g.output.input('in'));console.log(JSON.stringify(g.toProject()));
"""
    state=json.loads(subprocess.check_output(['node','--input-type=module','-'],input=source,text=True,cwd=ROOT))
    frames=block*math.ceil(8192/block)
    recipe={'package':str(package),'state':state,'block':block,'actions':[{'method':'set','args':['/midi/synth/voice/1/amp',.4],'blocks':frames//block}]}
    recipe_path=OUT/f'{name}-recipe.json';recipe_path.write_text(json.dumps(recipe,indent=2)+'\n')
    actual_path=OUT/f'{name}-rust.f32';old_path=OUT/f'{name}-cpp.f32'
    result=json.loads(subprocess.check_output([str(native),str(recipe_path),str(actual_path)],text=True,cwd=ROOT))
    subprocess.run([cpp,str(old_path),str(frequency),'.4',str(waveform),str(blend),str(frames),str(block)],check=True)
    actual=struct.unpack(f'<{frames*2}f',actual_path.read_bytes());old=struct.unpack(f'<{frames*2}f',old_path.read_bytes())
    diff=[a-b for a,b in zip(actual,old)];maximum=max(map(abs,diff));rms=math.sqrt(sum(d*d for d in diff)/len(diff))
    if maximum>2e-5: raise AssertionError(f'{name}: max error {maximum}')
    for kind,path in [('cpp',old_path),('rust',actual_path)]:wav(OUT/f'{name}-{kind}.wav',path.read_bytes())
    cases.append({'name':name,'waveform':waveform,'position':blend,'block':block,'frames':frames,'maximumError':maximum,'rmsError':rms,'callbackHeapGuarded':result['callbackHeapGuarded']})
sources=['packages/manifold-author/examples/main-wave-graph.mjs','packages/manifold-author/examples/main-voice-control.mjs','examples/projects/main-wave-project.mjs','packages/manifold-author/index.js','crates/manifold-core/src/graph.rs','crates/manifold-core/src/oscillator.rs','crates/manifold-core/src/node_catalog.rs','crates/manifold-core/src/parameter_catalog.rs','crates/manifold-native/src/project.rs','crates/manifold-native/src/author.rs','crates/manifold-project-js/examples/render_authored_actions.rs','tools/legacy-main-wave-voice-reference.cpp','scripts/build-legacy-main-wave-voice-reference.sh','scripts/generate-main-wave-author-proof.py','projects/graph-workspace/main-wave-project.bundle.js','web/public/packages/main-wave-author.manifold.json']
hashes={}
for source in sources:
    data=(ROOT/source).read_bytes();target=OUT/'measured-source'/source;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);hashes[source]=hashlib.sha256(data).hexdigest()
legacy={}
for name in ['OscillatorNode.cpp','CrossfaderNode.cpp','MixerNode.cpp']:
    data=(LEGACY/'dsp/core/nodes'/name).read_bytes();legacy[name]=hashlib.sha256(data).hexdigest()
report={'scope':'public authored Wave-only voice versus actual legacy C++ oscillator/crossfader/mixer route; no full Main, looper, sample or UI parity claim','sampleRate':48000,'cases':cases,'sourceHashes':hashes,'legacyHashes':legacy,'binaryHashes':{'nativeRenderer':hashlib.sha256(native.read_bytes()).hexdigest(),'legacyRenderer':hashlib.sha256(Path(cpp).read_bytes()).hexdigest()}}
(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
players=''.join(f'<section><h2>{c["name"]}</h2><p>Original C++</p><audio controls preload="none" src="{c["name"]}-cpp.wav"></audio><p>Authored Rust graph</p><audio controls preload="none" src="{c["name"]}-rust.wav"></audio><p>Maximum error: {c["maximumError"]:.3g}; block: {c["block"]}</p></section>' for c in cases)
(OUT/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Main authored Wave evidence</title><style>body{color:#eee;background:#131821;font:16px system-ui;max-width:900px;margin:40px auto}section{padding:20px;border-bottom:1px solid #456}a{color:#9de}</style><h1>Main authored Wave evidence</h1><p>Wave-only legacy branch, built with the public graph API. Full Main and arbitrary host audio channel layouts remain unfinished.</p><p><a href="/main-wave-author.html">Live creator</a> · <a href="report.json">Signal report and hashes</a> · <a href="browser-report.json">Browser report</a></p>'+players+'<script>document.addEventListener("play",e=>{for(const a of document.querySelectorAll("audio"))if(a!==e.target)a.pause()},true)</script>')
print(json.dumps(cases,indent=2))
