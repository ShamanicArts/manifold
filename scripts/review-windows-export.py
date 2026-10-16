#!/usr/bin/env python3
"""Open actual Windows REAPER and PE plug-ins in an isolated Proton prefix."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time
assert os.environ.get('MANIFOLD_ISOLATED_DISPLAY')=='1'
assert os.environ.get('PULSE_SINK')=='manifold_null'
root=Path(__file__).resolve().parents[1]
out=root/'artifacts/three-export/windows-proton';out.mkdir(parents=True,exist_ok=True)
(out/'stop').unlink(missing_ok=True)
# Earlier failed development scans must not mask this built module.
(out/'reaper-clap-win64.ini').unlink(missing_ok=True)
cache=out/'reaper-vstplugins64.ini'
if cache.exists(): cache.write_text('\n'.join(line for line in cache.read_text().splitlines() if not line.startswith('Manifold_Three_Tone'))+'\n')
prefix=out/'compat';prefix.mkdir(exist_ok=True)
proton=Path('/home/shamanic/.local/share/Steam/steamapps/common/Proton - Experimental/proton')
host=Path('/home/shamanic/.cache/manifold/hosts/reaper-windows/reaper.exe')
plugins=root/'target/exports/arts.shamanic.manifold.three-tone/x86_64-pc-windows-gnu'
# Keep the GNU loader next to each module; test without a host-folder copy.
loader=next(Path('/home/shamanic/.cargo/registry/src').glob('*/webview2-com-sys-0.39.1/x64/WebView2Loader.dll'))
for dest in [plugins,plugins/'Manifold Three Tone.vst3/Contents/x86_64-win']:shutil.copyfile(loader,dest/'WebView2Loader.dll')
(host.parent/'WebView2Loader.dll').unlink(missing_ok=True)
def win(path):return 'Z:'+str(path.resolve()).replace('/','\\')
config=out/'reaper.ini';config.write_text('[reaper]\nverchk=0\nvstpath64='+win(plugins)+'\nclap_path_win64='+win(plugins)+'\n')
script=out/'review.lua';reply=out/'loaded.txt';control=out/'control.lua';done=out/'done.txt'
script.write_text(f"""
reaper.Audio_Quit()
reaper.InsertTrackAtIndex(0,true)
local track=reaper.GetTrack(0,0)
local clap=reaper.TrackFX_AddByName(track,'CLAP: Manifold Three Tone',false,-1)
local vst=reaper.TrackFX_AddByName(track,'VST3: Manifold Three Tone',false,-1)
local file=io.open('{reply.as_posix()}','w');file:write('CLAP=',clap,' VST3=',vst);file:close()
if clap>=0 then reaper.TrackFX_Show(track,clap,3) end
local function step()
 local file=io.open('{control.as_posix()}','r')
 if file then local code=file:read('*a');file:close();os.remove('{control.as_posix()}');local ok,err=pcall(function() assert(load(code))() end);local f=io.open('{done.as_posix()}','w');f:write(ok and 'ok' or tostring(err));f:close() end
 reaper.defer(step)
end
reaper.defer(step)
""")
env={**os.environ,'GDK_BACKEND':'x11','STEAM_COMPAT_DATA_PATH':str(prefix),'STEAM_COMPAT_CLIENT_INSTALL_PATH':'/home/shamanic/.local/share/Steam','STEAM_COMPAT_APP_ID':'0','SteamAppId':'0','WINEDEBUG':'-all','CLAP_PATH':win(plugins)}
env['WEBVIEW2_BROWSER_EXECUTABLE_FOLDER']=win(Path('/home/shamanic/.cache/manifold/hosts/webview2-154/runtime/Microsoft.WebView2.FixedVersionRuntime.154.0.4258.53.x64'))
env['MANIFOLD_WEBVIEW_BROWSER_ARGS']='--no-sandbox --use-angle=swiftshader --enable-unsafe-swiftshader --disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection'
env['MANIFOLD_WEBVIEW_DATA_DIRECTORY']=win(out/'webview-data')
env.pop('WAYLAND_DISPLAY',None)
with (out/'host.log').open('w') as log:
 child=subprocess.Popen([str(proton),'run',str(host),'-cfgfile',win(config),'-newinst','-nosplash','-noactivate',win(script)],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 (out/'display.json').write_text(__import__('json').dumps({'display':env['DISPLAY'],'pid':child.pid,'prefix':str(prefix),'audioServer':env['PULSE_SERVER'],'isolated':True}))
 try:
  deadline=time.monotonic()+900
  while time.monotonic()<deadline and not (out/'stop').exists():
   subprocess.run(['magick','import','-window','root',str(out/'current.png')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   time.sleep(2)
 finally:
  if child.poll() is None:os.killpg(child.pid,signal.SIGTERM)
  child.wait(timeout=10)
  # Wine reparents native children; retire this prefix, never a user's prefix.
  subprocess.run([str(proton.parent/'files/bin/wineserver'),'-k'],env={**env,'WINEPREFIX':str(prefix/'pfx')},timeout=10,check=False)
