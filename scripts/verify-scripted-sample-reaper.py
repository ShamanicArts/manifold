#!/usr/bin/env python3
"""Recall the actual SDK-saved Instrument package in isolated REAPER VST3.

Run with-headless-weston.py and with-private-null-audio.py. No plug-in editor is
opened. This proves package recall and host MIDI, not DAW script call dispatch.
"""
from array import array
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import time
import tempfile

repo = Path(__file__).resolve().parents[1]
label = os.environ.get("MANIFOLD_SCRIPT_SAMPLE_LABEL", "2026-09-30-scripted-samples-release-v1")
assert re.fullmatch(r"[a-z0-9-]+", label)
assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1", "require a disposable display"
assert os.environ.get("DISPLAY") not in (None, ":0"), "refuse the user's display"
sinks = subprocess.check_output(["pactl", "list", "short", "sinks"], text=True)
assert sinks.strip() and all("manifold_null" in line for line in sinks.strip().splitlines()), sinks
root = repo / "web/public/scripted-samples" / label
out = root / "reaper-vst3-v2"
out.mkdir(exist_ok=False)
bundle = out / "plugins/ManifoldFX.vst3/Contents/x86_64-linux"
bundle.mkdir(parents=True)
library = bundle / "ManifoldFX.so"
shutil.copyfile(root / "binaries/libmanifold_vst3.so", library)
package = root / "vst3-sdk/instrument/saved.manifold.json"
document = json.loads(package.read_text())
preset = out / "instrument.vstpreset"
commands = []

def run(command, log):
    commands.append(command)
    with (out / log).open("x") as stream:
        subprocess.run(command, cwd=repo, env=env, stdout=stream, stderr=subprocess.STDOUT, timeout=120, check=True)

env = dict(os.environ, GDK_BACKEND="x11", CARGO_BUILD_JOBS="2")
env.pop("WAYLAND_DISPLAY", None)
run(["cargo", "run", "--release", "-q", "-p", "manifold-vst3", "--example", "export_graph_preset", "--", str(package), str(preset)], "preset-export.txt")
# REAPER populates the config directory with private profile and registration
# files. Keep those outside both the repository and the served evidence tree.
profile = tempfile.TemporaryDirectory(prefix="manifold-sample-reaper-profile-")
config = Path(profile.name) / "reaper.ini"
config.write_text(f"[reaper]\nvstpath={out / 'plugins'}\nvstpath64={out / 'plugins'}\n")
ready = out / "ready.txt"
project = out / "instrument.rpp"
script = out / "setup.lua"
# Absolute paths here are generated from our fixed workspace, not user input.
script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local fx=reaper.TrackFX_AddByName(track,'VST3: Manifold Graph',false,-1)
local out=io.open('{ready}','w')
if fx<0 then out:write('FAILED: Graph VST3 unavailable');out:close();return end
local loaded=reaper.TrackFX_SetPreset(track,fx,'{preset}')
if not loaded then out:write('FAILED: package preset unavailable');out:close();return end
local item=reaper.CreateNewMIDIItemInProj(track,0,1,false)
local take=reaper.GetActiveTake(item)
reaper.MIDI_InsertNote(take,false,false,reaper.MIDI_GetPPQPosFromProjTime(take,0.125),reaper.MIDI_GetPPQPosFromProjTime(take,0.5),0,60,100,false)
reaper.MIDI_Sort(take)
local begun=reaper.time_precise()
local function finish()
 if reaper.time_precise()-begun<1 then reaper.defer(finish);return end
 for key,value in pairs({{RENDER_SETTINGS=0,RENDER_BOUNDSFLAG=0,RENDER_STARTPOS=0,RENDER_ENDPOS=1,RENDER_SRATE=48000,RENDER_CHANNELS=2,RENDER_TAILFLAG=0,RENDER_NORMALIZE=0}}) do reaper.GetSetProjectInfo(0,key,value,true) end
 reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{out}',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','instrument',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
 reaper.Main_SaveProjectEx(0,'{project}',0)
 local ok,mode=reaper.GetAudioDeviceInfo('MODE')
 out:write('device='..tostring(mode)..'\\nversion='..tostring(reaper.GetAppVersion())..'\\ndone');out:close()
end
reaper.defer(finish)
""")
command = ["reaper", "-cfgfile", str(config), "-newinst", "-nosplash", "-noactivate", str(script)]
commands.append(command)
with (out / "setup.txt").open("x") as log:
    host = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline and host.poll() is None:
            if ready.exists() and any(marker in ready.read_text() for marker in ('done','FAILED')):
                break
            time.sleep(.1)
        setup = ready.read_text() if ready.exists() else ""
        assert "done" in setup and "FAILED" not in setup, (setup, (out / "setup.txt").read_text()[-2000:])
        maps = Path(f"/proc/{host.pid}/maps").read_text()
        relevant = '\n'.join(line for line in maps.splitlines() if str(library) in line)
        assert relevant, "the requested isolated release library was not mapped in REAPER"
        (out / "loaded-library-maps.txt").write_text(relevant + '\n')
    finally:
        if host.poll() is None:
            os.killpg(host.pid, signal.SIGTERM)
        host.wait(timeout=10)

text = project.read_text()
# VST3 component/controller chunks are groups of wrapped base64 lines.
groups, current = [], []
for line in text.splitlines():
    encoded = line.strip()
    if re.fullmatch(r"[A-Za-z0-9+/=]{8,}", encoded):
        current.append(encoded)
        if len(encoded) < 128:
            groups.append(current);current=[]
    elif current:
        groups.append(current);current=[]
if current: groups.append(current)
saved = None
for group in groups:
    try: decoded = base64.b64decode(''.join(group), validate=True)
    except ValueError: continue
    for index, byte in enumerate(decoded):
        if byte != 123: continue
        try: candidate = json.JSONDecoder().raw_decode(decoded[index:].decode(errors='replace'))[0]
        except ValueError: continue
        if isinstance(candidate,dict) and candidate.get('format') == 'manifold.package':
            saved = candidate;break
    if saved is not None: break
assert saved is not None, 'Manifold package not retained in the actual REAPER project'
assert saved['control'] == document['control']
assert saved['state']['assets'] == document['state']['assets']
(out / "recalled.manifold.json").write_text(json.dumps(saved))
(out / "native-project.json").write_text(json.dumps(saved['state']))
run(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash", "-renderproject", str(project)], "render.txt")
wav = out / "instrument.wav"
assert wav.exists(), (out / "render.txt").read_text()[-2000:]
raw = subprocess.check_output(["ffmpeg","-v","error","-i",str(wav),"-f","f32le","-acodec","pcm_f32le","-"])
actual = array('f');actual.frombytes(raw)
run(["cargo","run","--release","-q","-p","manifold-native","--example","render_graph_midi_audio","--",str(out / 'native-project.json'),str(out / 'native.f32'),"1024","6000","24000","100"], "native-reference.txt")
expected = array('f');expected.frombytes((out / 'native.f32').read_bytes())
assert len(actual) == len(expected) == 96000
error = max(abs(a-b) for a,b in zip(actual,expected))
peak = max(abs(v) for v in actual)
assert peak > .001 and error < 1e-6, (peak,error)
exe = Path(shutil.which('reaper')).resolve()
digest = lambda data: hashlib.sha256(data).hexdigest()
report = {"host":"REAPER Linux VST3","setup":setup,"audioRouting":sinks.strip(),"isolatedDisplay":os.environ['DISPLAY'],
          "pluginEditorOpened":False,"dawScriptCallsTested":False,"packageControllerRetained":True,"savedPCMRetained":True,
          "sampleRate":48000,"frames":48000,"noteOnFrame":6000,"noteOffFrame":24000,"velocity":100,
          "maximumErrorVsNative":error,"peak":peak,"librarySha256":digest(library.read_bytes()),
          "reaperExecutable":str(exe),"reaperSha256":digest(exe.read_bytes()),"inputPackageSha256":digest(package.read_bytes()),
          "recordingSha256":digest(wav.read_bytes()),"commands":commands}
(out / "report.json").write_text(json.dumps(report,indent=2)+'\n')
source_paths = ['scripts/verify-scripted-sample-reaper.py','scripts/with-headless-weston.py',
                'scripts/with-private-null-audio.py','crates/manifold-native/examples/render_graph_midi_audio.rs',
                'crates/manifold-vst3/examples/export_graph_preset.rs']
source_hashes = {}
for path in source_paths:
    destination = root / 'measured-source' / path
    destination.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(repo / path,destination)
    source_hashes[path] = digest(destination.read_bytes())
(out / 'reference-manifest.json').write_text(json.dumps({'sourceHashes':source_hashes,
    'nativeReferenceBinarySha256':digest((repo / 'target/release/examples/render_graph_midi_audio').read_bytes()),
    'recipe':'python scripts/with-headless-weston.py python scripts/with-private-null-audio.py python scripts/verify-scripted-sample-reaper.py'},indent=2))
print(json.dumps(report,indent=2))
