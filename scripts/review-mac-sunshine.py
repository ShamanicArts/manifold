#!/usr/bin/env python3
"""Capture the existing paired Mac Sunshine desktop on an isolated local display.

Requires the private audio and isolated X11 wrappers. No remote app is quit on
stream disconnect. Read the observed screenshot before supplying mouse input.
"""
import os
from pathlib import Path
import signal
import subprocess
import time
assert os.environ.get('MANIFOLD_ISOLATED_DISPLAY')=='1'
assert os.environ.get('PULSE_SINK')=='manifold_null'
out=Path('artifacts/three-export/mac-sunshine').resolve();out.mkdir(parents=True,exist_ok=True)
stop=out/'stop';stop.unlink(missing_ok=True)
config=Path(os.environ['XDG_CONFIG_HOME'])/'Moonlight Game Streaming Project'
config.mkdir(parents=True,exist_ok=True)
__import__('shutil').copyfile('/home/shamanic/.config/Moonlight Game Streaming Project/Moonlight.conf',config/'Moonlight.conf')
(config/'Moonlight.conf').chmod(0o600)
env={**os.environ,'GDK_BACKEND':'x11','QT_QPA_PLATFORM':'xcb','SDL_VIDEODRIVER':'x11','LIBGL_ALWAYS_SOFTWARE':'1'}
with (out/'stream.log').open('w') as log:
    client=subprocess.Popen(['/usr/bin/moonlight','stream','192.168.0.140','Desktop','--resolution','1280x720','--fps','15','--bitrate','4000','--display-mode','windowed','--video-codec','H.264','--video-decoder','software','--no-quit-after','--no-audio-on-host','--absolute-mouse','--capture-system-keys','never'],env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    (out/'display.json').write_text(__import__('json').dumps({'display':env['DISPLAY'],'pid':client.pid,'audioServer':env['PULSE_SERVER'],'isolated':True}))
    try:
        deadline=time.monotonic()+1800
        while client.poll() is None and not stop.exists() and time.monotonic()<deadline:
            subprocess.run(['magick','import','-window','root',str(out/'next.png')],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if (out/'next.png').exists(): (out/'next.png').replace(out/'current.png')
            time.sleep(2)
    finally:
        if client.poll() is None:os.killpg(client.pid,signal.SIGTERM)
        client.wait(timeout=10)
