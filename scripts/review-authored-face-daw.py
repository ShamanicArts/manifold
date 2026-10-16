#!/usr/bin/env python3
"""Open the archive downloaded from the browser in real REAPER, privately.

Verifies default accepted source/values for both formats, live edits and actual
DAW save/reopen, with editor pictures and non-silent private output recordings.
"""
import argparse
from array import array
import ctypes as c
import json
import math
import os
from pathlib import Path
import re
import runpy
import signal
import subprocess
import tarfile
import time
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--captured', type=Path, required=True)
    parser.add_argument('--product-id', default='local.manifold.orbit')
    parser.add_argument('--parameter', default='/ui/space/cutoff')
    parser.add_argument('--input-file', type=Path, help='Actual DAW media input for reviewing an exported effect')
    parser.add_argument('--spectrum', action='store_true', help='Require native FFT telemetry and sounding field response')
    parser.add_argument('--format', choices=['clap', 'vst3'])
    args = parser.parse_args()
    assert os.environ.get('MANIFOLD_ISOLATED_DISPLAY') == '1'
    sinks = subprocess.check_output(['pactl', 'list', 'short', 'sinks'], text=True)
    assert sinks.strip() and all('manifold_null' in line for line in sinks.splitlines())
    out = args.output.resolve(); out.mkdir(parents=True, exist_ok=True)
    plugins = out / 'downloaded'; plugins.mkdir(exist_ok=True)
    with tarfile.open(args.archive) as archive:
        archive.extractall(plugins, filter='data')
    package = next(plugins.glob('*/project.manifold.json'))
    plugin_root = package.parent
    build = json.loads((plugin_root / 'manifest.json').read_text())
    product = build['product']
    document = json.loads(package.read_text())
    source = document['state']['liveAuthoring']['source']
    captured=json.loads(args.captured.read_text())
    assert captured['project']['source']==source
    expected_layout=captured['webView']['layout']
    initial_values = {(p['nodeId'], p['id']): p['value']
                      for p in captured['project']['graph']['signal']['initialParameters']}
    expected_values = {p['path']: initial_values.get((p['nodeId'], p['id']), p['default'])
                       for p in captured['project']['graph']['endpoints'] if p['kind'] == 'parameter'}
    assert product['id'] == args.product_id
    reports = []
    x11 = runpy.run_path(str(ROOT / 'scripts/probe-reaper-graph-vst3-gui.py'))['X11']()
    x11.lib.XRaiseWindow.argtypes = [c.c_void_p, c.c_ulong]
    for fmt in [args.format] if args.format else ['clap', 'vst3']:
        folder = out / fmt; folder.mkdir(exist_ok=True)
        control, done = folder / 'control.lua', folder / 'done.txt'
        saved = folder / 'saved.rpp'
        script = folder / 'review.lua'
        input_lua = ''
        if args.input_file:
            media = str(args.input_file.resolve()).replace('\\', '\\\\').replace("'", "\\'")
            input_lua = f"reaper.InsertMedia('{media}',0)\nreaper.GetSet_LoopTimeRange(true,false,0,8,false)\nreaper.GetSetRepeat(1)"
        script.write_text(f"""
reaper.InsertTrackAtIndex(0,true)
local t=reaper.GetTrack(0,0)
local fx=reaper.TrackFX_AddByName(t,'{fmt.upper()}: {product['name']}',false,-1)
assert(fx>=0,'Browser-exported product not found')
reaper.TrackFX_Show(t,fx,3)
{input_lua}
reaper.OnPlayButton()
local function step()
 local f=io.open('{control}','r')
 if f then local code=f:read('*a');f:close();os.remove('{control}');local ok,err=pcall(function()assert(load(code))()end);local r=assert(io.open('{done}','w'));r:write(ok and 'ok' or tostring(err));r:close() end
 reaper.defer(step)
end
reaper.defer(step)
""")
        ini = folder / 'reaper.ini'
        ini.write_text(f'[reaper]\nlinux_audio_mode=3\nverchk=0\nvstpath={plugin_root}\nvstpath64={plugin_root}\nclap_path_linux-x86_64={plugin_root}\n')
        log_path = folder / 'host.log'
        env = {**os.environ, 'GDK_BACKEND':'x11', 'CLAP_PATH':str(plugin_root), 'LIBGL_ALWAYS_SOFTWARE':'1'}
        env.pop('WAYLAND_DISPLAY', None)

        def lua(code):
            done.unlink(missing_ok=True); control.write_text(code)
            deadline = time.monotonic() + 15
            while not done.exists() and time.monotonic() < deadline: time.sleep(.05)
            assert done.exists() and done.read_text() == 'ok', 'REAPER control failed'

        def endpoint(previous=None):
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                found = re.findall(r'Manifold creator agent endpoint: (http://\S+)', log_path.read_text())
                if found and found[-1] != previous: return found[-1]
                time.sleep(.1)
            raise AssertionError(log_path.read_text()[-2000:])

        def request(command, file):
            response = urllib.request.urlopen(urllib.request.Request(address, data=json.dumps(command).encode(),
                headers={'Content-Type':'application/json'}), timeout=20)
            value = json.load(response); (folder / file).write_text(json.dumps(value, indent=2)+'\n'); return value

        def picture(name):
            lua('reaper.TrackFX_Show(reaper.GetTrack(0,0),0,3)')
            # A loaded WebGL context can precede window mapping/first paint.
            # Wait for actual visible pixels, and raise only this isolated FX.
            time.sleep(1)
            for window, title, _size in x11.window_titles():
                if product['name'] in title and 'Track 1' in title:
                    x11.lib.XRaiseWindow(x11.display, window)
            x11.lib.XFlush(x11.display)
            time.sleep(.2)
            subprocess.run(['magick','import','-window','root',str(folder / name)],check=True,env=env)

        def record(name):
            routing = json.loads(subprocess.check_output(['pactl','-f','json','list','sink-inputs'],env=env,text=True))
            assert all(item['sink'] == int(sinks.split()[0]) for item in routing), routing
            subprocess.run(['ffmpeg','-v','error','-f','pulse','-i','manifold_null.monitor','-t','2','-y',str(folder / name)],check=True,env=env)
            with wave.open(str(folder / name)) as audio:
                samples=array('h');samples.frombytes(audio.readframes(audio.getnframes()))
                rms=math.sqrt(sum(v*v for v in samples)/len(samples))/32768
                assert rms>.00001, rms
            return rms

        with log_path.open('w') as log:
            host = subprocess.Popen(['reaper','-cfgfile',str(ini),'-newinst','-nosplash','-noactivate',str(script)],
                env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                address = endpoint()
                # Close only the isolated DAW's evaluation prompt.
                time.sleep(.6)
                for window, title, size in x11.window_titles():
                    if 'REAPER' in title and 'Track 1' not in title and 400 <= size[0] <= 700:
                        x,y=x11.origin(window); x11.click(x+size[0]-80,y+size[1]-30)
                lua('reaper.OnStopButton();reaper.SetEditCurPos(0,false,false);reaper.OnPlayButton()')
                state = request({'operation':'project.inspect'},'default.json')
                assert state['source'] == source
                values = {p['path']:p['value'] for p in state['parameters']}
                assert all(abs(values[path]-value)<.01 for path,value in expected_values.items()), (values,expected_values)
                studio_paths = {item['path'] for item in expected_layout if item.get('id') == 'voice-count' or item['path'] == '/ui/space/filter/mode'}
                assert studio_paths.issubset(values), values
                view = request({'operation':'view.inspect'},'default-view.json')
                if args.spectrum:
                    deadline=time.monotonic()+15
                    while time.monotonic()<deadline and (not view.get('visual') or int(view['visual'].get('frame',0))<4 or float(view['visual'].get('energy',0))<=.01):
                        time.sleep(.1)
                        view=request({'operation':'view.inspect'},'default-view.json')
                assert view['mounted'] and view['canvas']['webgl2'] and not view['canvas']['contextLost']
                assert view['role']=='instrument' and view['layout']==expected_layout
                assert studio_paths.issubset({item['path'] for item in view['controls']})
                assert view['face']['width'] > 700 and not view['studio']['inspector'] and not view['studio']['script']
                assert view['face']['y']+view['face']['height'] <= 600, 'Authored face extends beyond the actual DAW editor'
                assert view['analysis']['rms']>.00001, view
                if args.spectrum:
                    assert len(view['analysis']['bands']) == 32 and view['analysis']['peakHz'] > 0
                    assert any(value > .01 for value in view['analysis']['bands'])
                    assert view['visual']['particleCount'] == '10000'
                    assert float(view['visual']['energy']) > .01
                    assert product['category'] == 'Fx'
                    assert values['/nacre/audition'] == -1

                picture('default.png')
                subprocess.run(['magick','import','-window',str(x11.editor()),str(folder / 'plugin.png')],check=True,env=env)
                initial_rms = record('default.wav')
                window = x11.editor()
                origin = x11.origin(window)
                held_values = None
                if args.spectrum:
                    test = c.CDLL('libXtst.so.6')
                    test.XTestFakeMotionEvent.argtypes = [c.c_void_p,c.c_int,c.c_int,c.c_int,c.c_ulong]
                    test.XTestFakeButtonEvent.argtypes = [c.c_void_p,c.c_uint,c.c_int,c.c_ulong]
                    field_x = origin[0]+int(view['face']['x']+float(view['visual']['fieldX']))
                    field_y = origin[1]+int(view['face']['y']+float(view['visual']['fieldY']))
                    test.XTestFakeMotionEvent(x11.display,-1,field_x,field_y,0)
                    test.XTestFakeButtonEvent(x11.display,1,1,0);x11.lib.XFlush(x11.display)
                    try:
                        time.sleep(.15)
                        test.XTestFakeMotionEvent(x11.display,-1,field_x+65,field_y-35,0);x11.lib.XFlush(x11.display)
                        deadline=time.monotonic()+8
                        while time.monotonic()<deadline:
                            held=request({'operation':'project.inspect'},'held-field.json')
                            held_values={p['path']:p['value'] for p in held['parameters']}
                            if held_values['/nacre/focus']>values['/nacre/focus'] and held_values['/nacre/shift']>values['/nacre/shift']:break
                            time.sleep(.1)
                        assert held_values['/nacre/focus']>values['/nacre/focus'] and held_values['/nacre/shift']>values['/nacre/shift']
                        held_view=request({'operation':'view.inspect'},'held-field-view.json')
                        assert held_view['visual']['held']=='true' and held_view['analysis']['rms']>.00001
                        picture('held-field.png')
                    finally:
                        test.XTestFakeButtonEvent(x11.display,1,0,0);x11.lib.XFlush(x11.display)
                for key,flag in [('show-inspector','inspector'),('show-script','script')]:
                    button=view['studio']['buttons'][key]
                    x11.click(origin[0]+int(button['x']+button['width']/2),origin[1]+int(button['y']+button['height']/2))
                    time.sleep(.5)
                    toggled=request({'operation':'view.inspect'},flag+'-visible.json')
                    assert toggled['studio'][flag],toggled
                    picture(flag+'.png')
                    button=toggled['studio']['buttons'][key]
                    x11.click(origin[0]+int(button['x']+button['width']/2),origin[1]+int(button['y']+button['height']/2))
                    time.sleep(.2)
                    view=request({'operation':'view.inspect'},flag+'-closed.json')
                    assert not view['studio'][flag]

                knob=next(c['rect'] for c in view['controls'] if c['path']==args.parameter)
                x11.click(origin[0]+int(knob['x']+knob['width']*.82),origin[1]+int(knob['y']+knob['height']/2))
                time.sleep(.5)
                pointer_edit=request({'operation':'project.inspect'},'face-pointer-edit.json')
                pointer_cutoff=next(p['value'] for p in pointer_edit['parameters'] if p['path']==args.parameter)
                assert pointer_cutoff>2000 and abs(pointer_cutoff-expected_values[args.parameter])>.01,pointer_cutoff
                state=pointer_edit
                edited = request({'operation':'parameter.set','path':args.parameter,'value':2345,
                    'expectedRevision':state['revision']},'live-edit.json')
                lua(f"reaper.Main_SaveProjectEx(0,'{saved}',0)")
                lua(f"reaper.OnStopButton();reaper.Main_openProject('noprompt:{saved}');reaper.TrackFX_Show(reaper.GetTrack(0,0),0,3);reaper.OnPlayButton()")
                address = endpoint(address)
                recalled = request({'operation':'project.inspect'},'recalled.json')
                assert recalled['source'] == source
                cutoff=next(p['value'] for p in recalled['parameters'] if p['path']==args.parameter)
                assert abs(cutoff-2345)<.01
                recalled_values = {p['path']:p['value'] for p in recalled['parameters']}
                assert studio_paths.issubset(recalled_values)
                deadline = time.monotonic()+15
                while time.monotonic()<deadline:
                    view=request({'operation':'view.inspect'},'recalled-view.json')
                    painted = not args.spectrum or (int((view.get('visual') or {}).get('frame',0))>=4 and float(view['visual']['energy'])>.01)
                    if view['mounted'] and view['canvas']['webgl2'] and not view['canvas']['contextLost'] and painted:break
                    time.sleep(.1)
                assert view['mounted'] and view['canvas']['webgl2'] and not view['canvas']['contextLost']
                assert view['role']=='instrument' and view['layout']==expected_layout
                assert view['face']['width'] > 700 and not view['studio']['inspector'] and not view['studio']['script']
                picture('recalled.png'); recalled_rms = record('recalled.wav')
                lua('reaper.TrackFX_Show(reaper.GetTrack(0,0),0,2)')
                closed_rms = record('editor-closed.wav')
                report = {'format':fmt,'actualDownloadedArchive':str(args.archive),'productId':product['id'],
                    'defaultEditedSource':True,'authoredLayoutVerified':expected_layout,'faceIsDefault':True,'exportedValues':expected_values,'actualWebGL2':True,
                    'studioCreatedBindings':sorted(studio_paths),
                    'editorClosedRms':closed_rms,
                    'nativeSpectrum':view.get('analysis') if args.spectrum else None, 'visual':view.get('visual') if args.spectrum else None,
                    'fieldTargetsChangedWhileHeld':held_values,
                    'inputFile':str(args.input_file) if args.input_file else None,
                    'facePointerCutoff':pointer_cutoff,'liveEditAndDawRecallCutoff':cutoff,'initialRms':initial_rms,'recalledRms':recalled_rms,'audioRouting':sinks.strip()}
                (folder / 'report.json').write_text(json.dumps(report,indent=2)+'\n'); reports.append(report)
                print(json.dumps(report),flush=True)
            finally:
                if host.poll() is None: os.killpg(host.pid,signal.SIGTERM)
                try: host.wait(timeout=10)
                except subprocess.TimeoutExpired: os.killpg(host.pid,signal.SIGKILL); host.wait()
    reports = [json.loads(file.read_text()) for file in out.glob('*/report.json')]
    (out / 'report.json').write_text(json.dumps(reports,indent=2)+'\n')


if __name__ == '__main__': main()
