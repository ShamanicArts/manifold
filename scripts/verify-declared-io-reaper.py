#!/usr/bin/env python3
"""Try SDK-saved authored buses in isolated REAPER, retaining failures too.

Run through with-headless-weston.py and with-private-null-audio.py. Uses a
temporary plug-in/profile; no user installation or editor is changed/opened.
"""
from array import array
import argparse
import base64
import re
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import signal
import struct
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--host-label", default="reaper")
    parser.add_argument("--seed-project", type=Path)
    parser.add_argument("--format", choices=["vst3", "clap"], default="vst3")
    parser.add_argument("--package", type=Path)
    parser.add_argument("--seed-only", action="store_true")
    args = parser.parse_args()
    assert all(c.isalnum() or c == "-" for c in args.host_label)
    assert os.environ.get("MANIFOLD_ISOLATED_DISPLAY") == "1"
    assert os.environ.get("DISPLAY") not in (None, ":0")
    sinks = subprocess.check_output(["pactl", "list", "short", "sinks"], text=True)
    assert sinks.strip() and all("manifold_null" in line for line in sinks.strip().splitlines())
    capsule = args.evidence.resolve()
    out = capsule / args.host_label
    out.mkdir(exist_ok=False)
    library = out / ("plugins/ManifoldFX.clap" if args.format=="clap" else "plugins/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so")
    library.parent.mkdir(parents=True)
    shutil.copyfile(ROOT / ("target/clap/ManifoldFX.clap" if args.format=="clap" else "target/vst3/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so"), library)
    package = args.package.resolve() if args.package else capsule / "saved.manifold.json"
    preset = out / "authored-io.vstpreset"
    if args.format=="vst3": subprocess.run(["cargo", "run", "--release", "-q", "-p", "manifold-vst3", "--example", "export_graph_preset", "--", str(package), str(preset)], cwd=ROOT, check=True)
    rate, frames = 48000, 48000
    inputs = [[math.sin(i/rate*math.tau*frequency)*.12 for frequency in [220,330,440,110]] for i in range(frames)]
    pcm = b''.join(struct.pack('<4f', *frame) for frame in inputs)
    source = out / "four-inputs.wav"
    source.write_bytes(b'RIFF'+struct.pack('<I',36+len(pcm))+b'WAVEfmt '+struct.pack('<IHHIIHH',16,3,4,rate,rate*16,16,32)+b'data'+struct.pack('<I',len(pcm))+pcm)
    ready, project, script = out / "setup.json", out / "authored-io.rpp", out / "setup.lua"
    create = f"""
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
reaper.SetMediaTrackInfo_Value(track,'I_NCHAN',6)
reaper.SetMediaTrackInfo_Value(reaper.GetMasterTrack(0),'I_NCHAN',6)
reaper.SetOnlyTrackSelected(track)
reaper.InsertMedia('{source}',0)
local fx=reaper.TrackFX_AddByName(track,'{args.format.upper()}: Manifold Graph',false,-1)
local loaded=fx>=0 {"and reaper.TrackFX_SetPreset(track,fx,'"+str(preset)+"')" if args.format=='vst3' else ''}
"""
    if args.seed_project:
        template = args.seed_project.read_text()
        state=package.read_bytes()
        if args.format=="clap":
            chunk=re.search(r'(<STATE\s*\n)(.*?)(\n\s*>\n)',template,re.S)
            assert chunk is not None, "template has no CLAP state"
            encoded=base64.b64encode(state).decode()
            block='\n'.join('          '+encoded[i:i+128] for i in range(0,len(encoded),128))
            seeded=out / 'seeded.rpp'
            seeded.write_text(template[:chunk.start(2)]+block+template[chunk.end(2):])
        else:
            chunk = re.search(r'(<VST[^\n]*\n)(.*?)(\n\s*>\n)', template, re.S)
            groups, pending = [], []
            for line in chunk[2].splitlines():
                pending.append(line.strip())
                if len(line.strip())<128:
                    groups.append(base64.b64decode(''.join(pending))); pending=[]
            assert len(groups)==3 and groups[1][8:9]==b'{'
            state = package.read_bytes()
            groups[1] = struct.pack('<II',len(state),1)+state+bytes(8)
            assert struct.unpack('<I',groups[0][-12:-8])[0] > 0
            groups[0] = groups[0][:-12]+struct.pack('<I',len(groups[1]))+groups[0][-8:]
            encoded = []
            for group in groups:
                block=base64.b64encode(group).decode()
                encoded.extend('        '+block[i:i+128] for i in range(0,len(block),128))
            seeded = out / 'seeded.rpp'
            seeded.write_text(template[:chunk.start(2)]+'\n'.join(encoded)+template[chunk.end(2):])
        create=f"reaper.Main_openProject('{seeded}')\nlocal track=reaper.GetTrack(0,0)\nlocal fx=0\nlocal loaded=true\n"
    script.write_text(f"""
reaper.GetSetProjectInfo(0,'PROJECT_SRATE',48000,true)
reaper.GetSetProjectInfo(0,'PROJECT_SRATE_USE',1,true)
{create}
local begun=reaper.time_precise()
local function finish()
 if reaper.time_precise()-begun<1 then reaper.defer(finish);return end
 local retval,inputs,outputs=reaper.TrackFX_GetIOSize(track,fx)
 if loaded and inputs==4 and outputs==5 then
  for pin=0,3 do reaper.TrackFX_SetPinMappings(track,fx,0,pin,1<<pin,0) end
  for pin=0,4 do reaper.TrackFX_SetPinMappings(track,fx,1,pin,1<<pin,0) end
 end
 for key,value in pairs({{RENDER_SETTINGS=0,RENDER_BOUNDSFLAG=0,RENDER_STARTPOS=0,RENDER_ENDPOS=1,RENDER_SRATE=48000,RENDER_CHANNELS=6,RENDER_TAILFLAG=0,RENDER_NORMALIZE=0}}) do reaper.GetSetProjectInfo(0,key,value,true) end
 reaper.GetSetProjectInfo_String(0,'RENDER_FILE','{out}',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_PATTERN','authored-io',true)
 reaper.GetSetProjectInfo_String(0,'RENDER_FORMAT','evaw',true)
 reaper.Main_SaveProjectEx(0,'{project}',0)
 local out=io.open('{ready}','w')
 out:write('{{"presetLoaded":'..tostring(loaded)..',"inputs":'..tostring(inputs)..',"outputs":'..tostring(outputs)..',"version":"'..reaper.GetAppVersion()..'"}}');out:close()
end
reaper.defer(finish)
""")
    with tempfile.TemporaryDirectory(prefix="manifold-io-reaper-profile-") as profile:
        config = Path(profile) / "reaper.ini"
        config.write_text(f"[reaper]\nvstpath={out / 'plugins'}\nvstpath64={out / 'plugins'}\nclap_path_linux-x86_64={out / 'plugins'}\n")
        env = dict(os.environ, GDK_BACKEND="x11", CLAP_PATH=str(out / "plugins"))
        env.pop("WAYLAND_DISPLAY", None)
        with (out / "setup.txt").open("x") as log:
            host = subprocess.Popen(["reaper", "-cfgfile", str(config), "-newinst", "-nosplash", "-noactivate", str(script)], env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                deadline = time.monotonic()+35
                while not ready.exists() and host.poll() is None and time.monotonic()<deadline:
                    time.sleep(.1)
                setup = json.loads(ready.read_text()) if ready.exists() else {"error":"setup timed out"}
                maps = Path(f"/proc/{host.pid}/maps").read_text() if host.poll() is None else ""
                relevant = '\n'.join(line for line in maps.splitlines() if str(library) in line)
                (out / "loaded-library-maps.txt").write_text(relevant+'\n')
                assert relevant, "measured library was not mapped in REAPER"
                subprocess.run(["ffmpeg","-v","error","-f","x11grab","-video_size","1400x1000","-i",env["DISPLAY"],"-frames:v","1",str(out / "setup.png")], env=env,check=True)
            finally:
                if host.poll() is None: os.killpg(host.pid,signal.SIGTERM)
                host.wait(timeout=10)
        report = {"accepted":False,"hostFormat":args.format,"setup":setup,"audioRouting":sinks.strip(),"isolatedDisplay":env["DISPLAY"],"editorOpened":False,"coldProjectSeeded":args.seed_project is not None,"librarySha256":hashlib.sha256(library.read_bytes()).hexdigest(),"packageSha256":hashlib.sha256(package.read_bytes()).hexdigest()}
        if not args.seed_only and setup.get("presetLoaded") and setup.get("inputs")==4 and setup.get("outputs")==5:
            saved_text=project.read_text()
            if args.format=="clap":
                saved_chunk=re.search(r'(<STATE\s*\n)(.*?)(\n\s*>\n)',saved_text,re.S)
                recalled=json.loads(base64.b64decode(''.join(saved_chunk[2].split())))
            else:
                saved_chunk=re.search(r'(<VST[^\n]*\n)(.*?)(\n\s*>\n)',saved_text,re.S)
                saved_groups,pending=[],[]
                for line in saved_chunk[2].splitlines():
                    pending.append(line.strip())
                    if len(line.strip())<128:
                        saved_groups.append(base64.b64decode(''.join(pending)));pending=[]
                payload=saved_groups[1]
                length=struct.unpack('<I',payload[:4])[0]
                recalled=json.loads(payload[8:8+length])
            original=json.loads(package.read_text())
            assert recalled['format']=='manifold.package'
            assert recalled['control']==original['control']
            assert recalled['state']['signal']['io']==original['state']['signal']['io']
            (out / 'recalled.manifold.json').write_text(json.dumps(recalled,indent=2)+'\n')
            report['actualDawSaveRetainedControllerAndIo']=True
            report['renderReopensActualDawSave']=True
            with (out / "render.txt").open("x") as log:
                subprocess.run(["reaper","-cfgfile",str(config),"-newinst","-nosplash","-renderproject",str(project)],env=env,stdout=log,stderr=subprocess.STDOUT,timeout=60,check=True)
            wav = out / "authored-io.wav"
            raw = subprocess.check_output(["ffmpeg","-v","error","-i",str(wav),"-f","f32le","-acodec","pcm_f32le","-"])
            actual=array('f');actual.frombytes(raw)
            expected=[v for a,b,c,d in inputs for v in [b,a,c,d,a*.5,0]]
            assert len(actual)==len(expected), (len(actual),len(expected))
            errors=[max(abs(actual[frame*6+c]-expected[frame*6+c]) for frame in range(frames)) for c in range(6)]
            report.update({"frames":frames,"channels":6,"maximumChannelErrors":errors,"accepted":max(errors)<.000001,"recordingSha256":hashlib.sha256(wav.read_bytes()).hexdigest()})
        else:
            report["failure"]="DAW did not discover the authored four input/five output channels after preset recall"
        (out / "report.json").write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report,indent=2))
        if not report["accepted"] and not args.seed_only: raise SystemExit(1)


if __name__ == "__main__":
    main()
