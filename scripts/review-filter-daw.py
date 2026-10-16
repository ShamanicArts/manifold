#!/usr/bin/env python3
"""Interact with the actual creator editor in an isolated REAPER instance.
Run with with-headless-weston.py and with-private-null-audio.py.
Keeps actual DAW saves, editor pictures, request responses and live recordings.
"""
import argparse,base64,json,os,re,shutil,signal,struct,subprocess,time,runpy,ctypes as c,urllib.request,urllib.error,wave,math
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--format',choices=['clap','vst3'],required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    assert os.environ.get('MANIFOLD_ISOLATED_DISPLAY')=='1'
    sinks=subprocess.check_output(['pactl','list','short','sinks'],text=True);assert sinks.strip() and all('manifold_null' in line for line in sinks.splitlines())
    out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    plugins=out/'plugins';plugins.mkdir(exist_ok=True)
    if args.format=='clap':
        shutil.copyfile(ROOT/'target/release/libmanifold_clap.so',plugins/'ManifoldFX.clap')
        shutil.copyfile(ROOT/'target/release/manifold-editor',plugins/'ManifoldFX-editor');(plugins/'ManifoldFX-editor').chmod(0o755)
        assets=plugins/'assets'
        template=ROOT/'web/public/clap-io/2026-10-01-clap-daw-v1/template/authored-io.rpp'
    else:
        bundle=plugins/'ManifoldFX.vst3';native=bundle/'Contents/x86_64-linux';native.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(ROOT/'target/release/libmanifold_vst3.so',native/'ManifoldFX.so');shutil.copyfile(ROOT/'target/release/manifold-editor',native/'ManifoldFX-editor');(native/'ManifoldFX-editor').chmod(0o755)
        assets=bundle/'Contents/Resources/assets'
        template=ROOT/'web/public/vst3-io/2026-10-01-vst3-io-v3/reaper-review/authored-io.rpp'
    assets.mkdir(parents=True,exist_ok=True)
    for file in ['fx-module.html','graph-module.html','main-looper.html','filter.html']:shutil.copyfile(ROOT/'web/dist'/file,assets/file)
    shutil.copytree(ROOT/'web/dist/assets',assets/'assets',dirs_exist_ok=True);shutil.copytree(ROOT/'web/dist/ui',assets/'ui',dirs_exist_ok=True)
    source=out/'saw.wav'
    with wave.open(str(source),'wb') as audio:
        audio.setnchannels(2);audio.setsampwidth(2);audio.setframerate(48000)
        audio.writeframes(b''.join(struct.pack('<hh',*([int(((i*110/48000)%1*2-1)*8000)]*2)) for i in range(48000)))
    package=(ROOT/'web/public/filter-delivery/2026-10-01/Filter.manifold.json').read_bytes()
    text=template.read_text();seed=out/'seed.rpp'
    if args.format=='clap':
        chunk=re.search(r'(<STATE\s*\n)(.*?)(\n\s*>\n)',text,re.S);encoded=base64.b64encode(package).decode();block='\n'.join('          '+encoded[i:i+128] for i in range(0,len(encoded),128));text=text[:chunk.start(2)]+block+text[chunk.end(2):]
    else:
        chunk=re.search(r'(<VST[^\n]*\n)(.*?)(\n\s*>\n)',text,re.S);groups=[];pending=[]
        for line in chunk[2].splitlines():
            pending.append(line.strip())
            if len(line.strip())<128:groups.append(base64.b64decode(''.join(pending)));pending=[]
        groups[1]=struct.pack('<II',len(package),1)+package+bytes(8);groups[0]=groups[0][:-12]+struct.pack('<I',len(groups[1]))+groups[0][-8:]
        block=[]
        for group in groups:
            encoded=base64.b64encode(group).decode();block.extend('        '+encoded[i:i+128] for i in range(0,len(encoded),128))
        text=text[:chunk.start(2)]+'\n'.join(block)+text[chunk.end(2):]
    text=re.sub(r'(?m)^(\s*FILE )"[^"]*"',lambda m:m[1]+'"'+str(source)+'"',text);seed.write_text(text)
    script=out/'review.lua';control=out/'control.lua';result=out/'control-result.json';saved=out/'edited.rpp'
    script.write_text(f"""
reaper.Main_openProject('{seed}')
local track=reaper.GetTrack(0,0)
reaper.SetMediaTrackInfo_Value(track,'I_NCHAN',2)
local item=reaper.GetTrackMediaItem(track,0)
reaper.SetMediaItemInfo_Value(item,'D_LENGTH',120)
reaper.SetMediaItemInfo_Value(item,'B_LOOPSRC',1)
reaper.TrackFX_Show(track,0,3)
reaper.OnPlayButton()
local function step()
 local file=io.open('{control}','r')
 if file then local code=file:read('*a');file:close();os.remove('{control}');local ok,err=pcall(function() assert(load(code))() end);local reply=io.open('{result}','w');reply:write(ok and '{{"ok":true}}' or '{{"error":"command failed"}}');reply:close() end
 reaper.defer(step)
end
reaper.defer(step)
""")
    profile=ROOT/'artifacts/filter-v01/tmp'/out.name;profile.mkdir(parents=True,exist_ok=True)
    config=profile/'reaper.ini';config.write_text(f'[reaper]\nlinux_audio_mode=3\nverchk=0\nvstpath={plugins}\nvstpath64={plugins}\nclap_path_linux-x86_64={plugins}\n')
    ui_probe=out/'ui-action.json'
    env=dict(os.environ,GDK_BACKEND='x11',CLAP_PATH=str(plugins),LIBGL_ALWAYS_SOFTWARE='1',MANIFOLD_CREATOR_UI_PROBE=str(ui_probe));env.pop('WAYLAND_DISPLAY',None)
    logpath=out/'host.txt'
    def run_lua(code):
        result.unlink(missing_ok=True);control.write_text(code);until=time.monotonic()+10
        while not result.exists() and time.monotonic()<until:time.sleep(.05)
        assert result.exists() and json.loads(result.read_text()).get('ok'),logpath.read_text()[-2000:]
    def picture(name):
        before=set(out.glob('wayland-screenshot-*.png'));subprocess.run(['weston-screenshooter'],cwd=out,env=os.environ,check=True);new=set(out.glob('wayland-screenshot-*.png'))-before;assert len(new)==1;new.pop().rename(out/name)
    def record(name):
        (out/(name+'.routing.json')).write_text(subprocess.check_output(['pactl','-f','json','list','sink-inputs'],env=env,text=True))
        subprocess.run(['ffmpeg','-v','error','-f','pulse','-i','manifold_null.monitor','-t','2','-y',str(out/name)],env=env,check=True)
    with logpath.open('w') as log:
        host=subprocess.Popen(['reaper','-cfgfile',str(config),'-newinst','-nosplash','-noactivate',str(script)],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            until=time.monotonic()+35;address=None
            while time.monotonic()<until and host.poll() is None:
                matches=re.findall(r'Manifold creator agent endpoint: (http://127\.0\.0\.1:\d+/__manifold/request)',logpath.read_text())
                if matches:address=matches[-1];break
                time.sleep(.1)
            assert address,logpath.read_text()[-4000:]
            print(f'{args.format} actual creator endpoint: {address}',flush=True)
            def request(command,name):
                message=urllib.request.Request(address,data=json.dumps(command).encode(),headers={'Content-Type':'application/json'})
                try:
                    with urllib.request.urlopen(message,timeout=35) as response:reply=json.load(response)
                except urllib.error.HTTPError as error:
                    body=error.read().decode();(out/name).write_text(body);raise RuntimeError(body) from error
                (out/name).write_text(json.dumps(reply,indent=2)+'\n');return reply
            x11=runpy.run_path(str(ROOT/'scripts/probe-reaper-graph-vst3-gui.py'))['X11']()
            class ClientMessage(c.Structure):
                _fields_=[('type',c.c_int),('serial',c.c_ulong),('send_event',c.c_int),('display',c.c_void_p),('window',c.c_ulong),('message_type',c.c_ulong),('format',c.c_int),('data',c.c_long*5)]
            x11.lib.XInternAtom.argtypes=[c.c_void_p,c.c_char_p,c.c_int];x11.lib.XInternAtom.restype=c.c_ulong
            x11.lib.XSendEvent.argtypes=[c.c_void_p,c.c_ulong,c.c_int,c.c_long,c.c_void_p]
            (out/"windows-before.json").write_text(json.dumps(x11.window_titles()))
            x11.lib.XGetWindowProperty.argtypes=[c.c_void_p,c.c_ulong,c.c_ulong,c.c_long,c.c_long,c.c_int,c.c_ulong,c.POINTER(c.c_ulong),c.POINTER(c.c_int),c.POINTER(c.c_ulong),c.POINTER(c.c_ulong),c.POINTER(c.POINTER(c.c_ubyte))]
            def titles():
                entries=[]
                for window,title,size in x11.window_titles():
                    actual,fmt,count,left,data=c.c_ulong(),c.c_int(),c.c_ulong(),c.c_ulong(),c.POINTER(c.c_ubyte)()
                    x11.lib.XGetWindowProperty(x11.display,window,x11.lib.XInternAtom(x11.display,b'_NET_WM_NAME',0),0,1024,0,0,c.byref(actual),c.byref(fmt),c.byref(count),c.byref(left),c.byref(data))
                    if data:
                        title=c.string_at(data,count.value).decode(errors='replace');x11.lib.XFree(data)
                    entries.append((window,title,size))
                return entries
            for attempt in range(12):
                for window,title,size in titles():
                    if title.startswith(('About REAPER','REAPER New Version Notification')):
                        event=ClientMessage(33,0,1,x11.display,window,x11.lib.XInternAtom(x11.display,b'WM_PROTOCOLS',0),32,(c.c_long*5)(x11.lib.XInternAtom(x11.display,b'WM_DELETE_WINDOW',0),0,0,0,0))
                        x11.lib.XSendEvent(x11.display,window,0,0,c.byref(event));x11.lib.XFlush(x11.display)
                        x,y=x11.origin(window);x11.click(x+size[0]-80,y+size[1]-30)
                time.sleep(.5)
            (out/"windows-after.json").write_text(json.dumps(x11.window_titles()))
            picture('editor-loading.png')
            state=request({'operation':'project.inspect'},'initial.json');assert state.get('source') and state.get('components'),state
            run_lua("reaper.OnStopButton();reaper.SetEditCurPos(0,false,false);reaper.OnPlayButton()")
            time.sleep(.3);picture('initial.png');record('before.wav')
            ui_probe.write_text(json.dumps({'path':'/plugin/params/cutoff','key':'End'}));time.sleep(.5)
            human=request({'operation':'project.inspect'},'human-retained.json');assert human['revision']>state['revision'], 'Retained control did not edit the running graph'
            state=human;picture('human-retained.png')
            # Verify both members of a real creator batch reach the DAW's
            # automation parameters, not only the creator's target readback.
            state=request({'operation':'parameter.batch','edits':[{'path':'/plugin/params/cutoff','value':900},{'path':'/plugin/params/resonance','value':.5}],'expectedRevision':state['revision']},'batched-gesture.json')
            host_values=out/'host-gesture-values.json'
            run_lua(f"local t=reaper.GetTrack(0,0);local f=assert(io.open('{host_values}','w'));f:write(string.format('{{\"cutoff\":%.9f,\"resonance\":%.9f}}',reaper.TrackFX_GetParamNormalized(t,0,1),reaper.TrackFX_GetParamNormalized(t,0,2)));f:close()")
            reported=json.loads(host_values.read_text())
            assert abs(reported['cutoff']-(900-80)/(16000-80))<.0001,reported
            assert abs(reported['resonance']-(.5-.1)/(2-.1))<.0001,reported
            ui_probe.write_text(json.dumps({'view':'egui'}));time.sleep(1);picture('egui.png')
            ui_probe.write_text(json.dumps({'view':'retained'}));time.sleep(.25)
            # A real agent edits the same authored source/UI while the host plays.
            code=state['source'].replace('graph.registerInstance("/plugin/output-level", level);','graph.registerInstance("/plugin/output-level", level);\ngraph.bindHostSlot(3, level, 0);').replace('label: "Output level"','label: "DAW live level"')
            edited=request({'operation':'source.apply','source':code,'expectedRevision':state['revision']},'agent-edit.json');assert edited['revision']>state['revision'] and 'DAW live level' in edited['source']
            edited=request({'operation':'parameter.set','path':'/plugin/params/cutoff','value':550,'expectedRevision':edited['revision']},'agent-cutoff.json')
            picture('agent-edit.png');record('after.wav')
            run_lua("reaper.TrackFX_SetParamNormalized(reaper.GetTrack(0,0),0,1,.35)")
            time.sleep(.4);automated=request({'operation':'project.inspect'},'host-automation.json')
            automated_value=next(p['value'] for p in automated['parameters'] if p['path']=='/plugin/params/cutoff')
            assert abs(automated_value-550)>100, automated_value
            edited=request({'operation':'parameter.set','path':'/plugin/params/cutoff','value':550,'expectedRevision':automated['revision']},'agent-after-automation.json')
            run_lua('reaper.TrackFX_Show(reaper.GetTrack(0,0),0,2)');record('editor-closed.wav')
            run_lua(f"reaper.Main_SaveProjectEx(0,'{saved}',0)")
            run_lua('reaper.TrackFX_Show(reaper.GetTrack(0,0),0,3)')
            until=time.monotonic()+15
            while time.monotonic()<until:
                matches=re.findall(r'Manifold creator agent endpoint: (http://127\.0\.0\.1:\d+/__manifold/request)',logpath.read_text())
                if matches and matches[-1]!=address:address=matches[-1];break
                time.sleep(.1)
            reopened=request({'operation':'project.inspect'},'editor-reopened.json');assert reopened['source']==edited['source']
            picture('editor-reopened.png')
            # Close the actual project and reopen its actual DAW save.
            run_lua(f"reaper.OnStopButton();reaper.Main_openProject('noprompt:{saved}');reaper.TrackFX_Show(reaper.GetTrack(0,0),0,3);reaper.OnPlayButton()")
            until=time.monotonic()+15
            while time.monotonic()<until:
                matches=re.findall(r'Manifold creator agent endpoint: (http://127\.0\.0\.1:\d+/__manifold/request)',logpath.read_text())
                if matches and matches[-1]!=address:address=matches[-1];break
                time.sleep(.1)
            recalled=request({'operation':'project.inspect'},'daw-recalled.json');assert recalled['source']==edited['source'];picture('daw-recalled.png');record('daw-recalled.wav')
            from array import array
            levels={}
            for name in ['before.wav','after.wav','editor-closed.wav','daw-recalled.wav']:
                with wave.open(str(out/name)) as audio:
                    samples=array('h');samples.frombytes(audio.readframes(audio.getnframes()));levels[name]=math.sqrt(sum(v*v for v in samples)/len(samples))/32768
                assert levels[name]>.00001, (name, levels)
            (out/'audio-levels.json').write_text(json.dumps(levels,indent=2)+'\n')
            cutoff=next(p['value'] for p in recalled['parameters'] if p['path']=='/plugin/params/cutoff');assert abs(cutoff-550)<.1,cutoff
            report={'accepted':True,'format':args.format,'isolatedDisplay':env['DISPLAY'],'audioRouting':sinks.strip(),'actualEditor':True,'liveAgentSourceAndParameterEdits':True,'editorCloseAndReopenRetainedSource':True,'actualDawSaveReopenedSourceAndCutoff':True,'nonSilentAudioAcrossEditsAndEditorClose':True,'liveRecordingRms':levels,'cutoff':cutoff,'humanControlsVerified':True,'hostAutomationVerified':True,'hostAutomatedCutoff':automated_value,'creatorBatchReportedToHost':reported,'retainedKeyboardGestureVerified':True,'retainedPointerGestureVerified':False,'eguiScreenshotCaptured':True}
            (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
        finally:
            if host.poll() is None:os.killpg(host.pid,signal.SIGTERM)
            host.wait(timeout=10)
if __name__=='__main__':main()
