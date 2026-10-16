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
    assert source.startswith('// Exported from the website') and '#34d399' in source
    assert product['id'] == 'local.manifold.website-three-tone'
    reports = []
    x11 = runpy.run_path(str(ROOT / 'scripts/probe-reaper-graph-vst3-gui.py'))['X11']()
    x11.lib.XRaiseWindow.argtypes = [c.c_void_p, c.c_ulong]
    for fmt in [args.format] if args.format else ['clap', 'vst3']:
        folder = out / fmt; folder.mkdir(exist_ok=True)
        control, done = folder / 'control.lua', folder / 'done.txt'
        saved = folder / 'saved.rpp'
        script = folder / 'review.lua'
        script.write_text(f"""
reaper.InsertTrackAtIndex(0,true)
local t=reaper.GetTrack(0,0)
local fx=reaper.TrackFX_AddByName(t,'{fmt.upper()}: {product['name']}',false,-1)
assert(fx>=0,'Browser-exported product not found')
reaper.TrackFX_Show(t,fx,3)
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
                assert abs(values['/ui/space/pitch']-440)<.01 and abs(values['/ui/space/cutoff']-1234)<.01,values
                view = request({'operation':'view.inspect'},'default-view.json')
                assert view['mounted'] and view['canvas']['webgl2'] and not view['canvas']['contextLost']
                assert view['analysis']['rms']>.00001, view
                picture('default.png'); initial_rms = record('default.wav')
                edited = request({'operation':'parameter.set','path':'/ui/space/cutoff','value':2345,
                    'expectedRevision':state['revision']},'live-edit.json')
                lua(f"reaper.Main_SaveProjectEx(0,'{saved}',0)")
                lua(f"reaper.OnStopButton();reaper.Main_openProject('noprompt:{saved}');reaper.TrackFX_Show(reaper.GetTrack(0,0),0,3);reaper.OnPlayButton()")
                address = endpoint(address)
                recalled = request({'operation':'project.inspect'},'recalled.json')
                assert recalled['source'] == source
                cutoff=next(p['value'] for p in recalled['parameters'] if p['path']=='/ui/space/cutoff')
                assert abs(cutoff-2345)<.01
                deadline = time.monotonic()+15
                while time.monotonic()<deadline:
                    view=request({'operation':'view.inspect'},'recalled-view.json')
                    if view['mounted'] and view['canvas']['webgl2'] and not view['canvas']['contextLost']:break
                    time.sleep(.1)
                assert view['mounted'] and view['canvas']['webgl2'] and not view['canvas']['contextLost']
                picture('recalled.png'); recalled_rms = record('recalled.wav')
                report = {'format':fmt,'actualDownloadedArchive':str(args.archive),'productId':product['id'],
                    'defaultEditedSource':True,'defaultPitch':440,'defaultCutoff':1234,'actualWebGL2':True,
                    'liveEditAndDawRecallCutoff':cutoff,'initialRms':initial_rms,'recalledRms':recalled_rms,'audioRouting':sinks.strip()}
                (folder / 'report.json').write_text(json.dumps(report,indent=2)+'\n'); reports.append(report)
                print(json.dumps(report),flush=True)
            finally:
                if host.poll() is None: os.killpg(host.pid,signal.SIGTERM)
                try: host.wait(timeout=10)
                except subprocess.TimeoutExpired: os.killpg(host.pid,signal.SIGKILL); host.wait()
    reports = [json.loads(file.read_text()) for file in out.glob('*/report.json')]
    (out / 'report.json').write_text(json.dumps(reports,indent=2)+'\n')


if __name__ == '__main__': main()
