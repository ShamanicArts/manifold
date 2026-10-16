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
    plugins=ROOT/'target/exports/arts.shamanic.manifold.three-tone/x86_64-unknown-linux-gnu'
    assert (plugins/'Manifold Three Tone.clap').exists()
    script=out/'review.lua';control=out/'control.lua';result=out/'control-result.json';saved=out/'edited.rpp'
    script.write_text(f"""
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local fx=reaper.TrackFX_AddByName(track,'{args.format.upper()}: Manifold Three Tone',false,-1)
assert(fx>=0,'Exported plug-in not found')
reaper.SetMediaTrackInfo_Value(track,'I_NCHAN',2)
reaper.GetSetMediaTrackInfo_String(track,'P_NAME','Exported Three Tone',true)
reaper.TrackFX_Show(track,0,3)
reaper.OnPlayButton()
local function step()
 local file=io.open('{control}','r')
 if file then local code=file:read('*a');file:close();os.remove('{control}');local ok,err=pcall(function() assert(load(code))() end);local reply=io.open('{result}','w');reply:write(ok and '{{"ok":true}}' or '{{"error":"command failed"}}');reply:close() end
 reaper.defer(step)
end
reaper.defer(step)
""")
    profile=ROOT/'artifacts/three-export/tmp'/out.name;profile.mkdir(parents=True,exist_ok=True)
    config=profile/'reaper.ini';config.write_text(f'[reaper]\nlinux_audio_mode=3\nverchk=0\nvstpath={plugins}\nvstpath64={plugins}\nclap_path_linux-x86_64={plugins}\n')
    ui_probe=out/'ui-action.json'
    env=dict(os.environ,GDK_BACKEND='x11',CLAP_PATH=str(plugins),LIBGL_ALWAYS_SOFTWARE='1',MANIFOLD_CREATOR_UI_PROBE=str(ui_probe));env.pop('WAYLAND_DISPLAY',None)
    logpath=out/'host.txt'
    def run_lua(code):
        result.unlink(missing_ok=True);control.write_text(code);until=time.monotonic()+10
        while not result.exists() and time.monotonic()<until:time.sleep(.05)
        if not result.exists():
            with (out/'host-stall-backtrace.txt').open('w') as trace:
                subprocess.run(['gdb','-q','-batch','-ex','thread apply all bt','-p',str(host.pid)],stdout=trace,stderr=subprocess.STDOUT,timeout=20)
        assert result.exists() and json.loads(result.read_text()).get('ok'),logpath.read_text()[-2000:]
    def picture(name):
        subprocess.run(['magick','import','-window','root',str(out/name)],check=True)
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
            for attempt in range(28):
                for window,title,size in titles():
                    if title.startswith(('About REAPER','REAPER New Version Notification')):
                        event=ClientMessage(33,0,1,x11.display,window,x11.lib.XInternAtom(x11.display,b'WM_PROTOCOLS',0),32,(c.c_long*5)(x11.lib.XInternAtom(x11.display,b'WM_DELETE_WINDOW',0),0,0,0,0))
                        x11.lib.XSendEvent(x11.display,window,0,0,c.byref(event));x11.lib.XFlush(x11.display)
                        x,y=x11.origin(window);x11.click(x+size[0]-80,y+size[1]-30)
                time.sleep(.5)
            (out/"windows-after.json").write_text(json.dumps(x11.window_titles()))
            for window,title,size in titles():
                if 'Manifold Three Tone' in title and 'Track 1' in title:
                    x11.lib.XRaiseWindow(x11.display,window)
            x11.lib.XSetInputFocus(x11.display,x11.editor(),1,0);x11.lib.XFlush(x11.display);time.sleep(.5)
            picture('editor-loading.png')
            state=request({'operation':'project.inspect'},'initial.json');assert state.get('source') and state.get('components'),state
            run_lua("reaper.OnStopButton();reaper.SetEditCurPos(0,false,false);reaper.OnPlayButton()")
            time.sleep(.3);picture('initial.png');record('before.wav')
            ui_probe.write_text(json.dumps({'path':'/ui/space/cutoff','key':'End'}));time.sleep(.5)
            human=request({'operation':'project.inspect'},'human-retained.json');assert human['revision']>state['revision'], 'Retained control did not edit the running graph'
            state=human;picture('human-retained.png')
            ui_probe.write_text(json.dumps({'scroll':'.custom-view-surface'}));time.sleep(.5)
            view=request({'operation':'view.inspect'},'three-view.json')
            assert view['mounted'] and view['canvas']['webgl2'] and not view['canvas']['contextLost'], view
            assert view['analysis']['rms']>0,view
            canvas=view['canvas']['rect'];origin=x11.origin(x11.editor())
            test=c.CDLL('libXtst.so.6');test.XTestFakeMotionEvent.argtypes=[c.c_void_p,c.c_int,c.c_int,c.c_int,c.c_ulong];test.XTestFakeButtonEvent.argtypes=[c.c_void_p,c.c_uint,c.c_int,c.c_ulong]
            x=int(origin[0]+canvas['x']+canvas['width']*.5);y=int(origin[1]+canvas['y']+canvas['height']*.5)
            test.XTestFakeMotionEvent(x11.display,-1,x,y,0);test.XTestFakeButtonEvent(x11.display,1,1,0);x11.lib.XFlush(x11.display);time.sleep(.1)
            for i in range(1,9):
                test.XTestFakeMotionEvent(x11.display,-1,x+i*7,y-i*4,0);x11.lib.XFlush(x11.display);time.sleep(.06)
            test.XTestFakeButtonEvent(x11.display,1,0,0);x11.lib.XFlush(x11.display);time.sleep(.5)
            state=request({'operation':'project.inspect'},'human-three-drag.json');assert state['revision']>human['revision'], 'Native Three.js pointer did not change actual graph'
            picture('three-drag.png')

            # Verify both members of a real creator batch reach the DAW's
            # automation parameters, not only the creator's target readback.
            state=request({'operation':'parameter.batch','edits':[{'path':'/ui/space/cutoff','value':1600},{'path':'/ui/space/pitch','value':330}],'expectedRevision':state['revision']},'batched-gesture.json')
            host_values=out/'host-gesture-values.json'
            run_lua(f"local t=reaper.GetTrack(0,0);local f=assert(io.open('{host_values}','w'));f:write(string.format('{{\"cutoff\":%.9f,\"pitch\":%.9f}}',reaper.TrackFX_GetParamNormalized(t,0,4),reaper.TrackFX_GetParamNormalized(t,0,1)));f:close()")
            reported=json.loads(host_values.read_text())
            assert abs(reported['cutoff']-(1600-80)/(8000-80))<.0001,reported
            assert abs(reported['pitch']-(330-55)/(880-55))<.0001,reported
            ui_probe.write_text(json.dumps({'view':'egui'}));time.sleep(1);picture('egui.png')
            ui_probe.write_text(json.dumps({'view':'retained'}));time.sleep(.25)
            # A real agent edits the same authored source/UI while the host plays.
            code=state['source'].replace("tone: '#38bdf8'", "tone: '#fb7185'").replace('IcosahedronGeometry(0.18, 1)', 'IcosahedronGeometry(0.24, 0)')
            edited=request({'operation':'source.apply','source':code,'expectedRevision':state['revision']},'agent-edit.json');assert edited['revision']>state['revision'] and '#fb7185' in edited['source']
            edited=request({'operation':'parameter.set','path':'/ui/space/cutoff','value':550,'expectedRevision':edited['revision']},'agent-cutoff.json')
            picture('agent-edit.png');record('after.wav')
            run_lua("reaper.TrackFX_SetParamNormalized(reaper.GetTrack(0,0),0,4,.35)")
            time.sleep(.4);automated=request({'operation':'project.inspect'},'host-automation.json')
            automated_value=next(p['value'] for p in automated['parameters'] if p['path']=='/ui/space/cutoff')
            assert abs(automated_value-550)>100, automated_value
            edited=request({'operation':'parameter.set','path':'/ui/space/cutoff','value':550,'expectedRevision':automated['revision']},'agent-after-automation.json')
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
            cutoff=next(p['value'] for p in recalled['parameters'] if p['path']=='/ui/space/cutoff');assert abs(cutoff-550)<.1,cutoff
            report={'accepted':True,'format':args.format,'isolatedDisplay':env['DISPLAY'],'audioRouting':sinks.strip(),'actualEditor':True,'liveAgentSourceAndParameterEdits':True,'editorCloseAndReopenRetainedSource':True,'actualDawSaveReopenedSourceAndCutoff':True,'nonSilentAudioAcrossEditsAndEditorClose':True,'liveRecordingRms':levels,'cutoff':cutoff,'humanControlsVerified':True,'hostAutomationVerified':True,'hostAutomatedCutoff':automated_value,'creatorBatchReportedToHost':reported,'retainedKeyboardGestureVerified':True,'threePointerGestureVerified':True,'nativeWebGL2Verified':True,'nativeOutputEnergyVerified':True,'eguiScreenshotCaptured':True}
            (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
        finally:
            if host.poll() is None:os.killpg(host.pid,signal.SIGTERM)
            host.wait(timeout=10)
if __name__=='__main__':main()
