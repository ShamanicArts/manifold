#!/usr/bin/env python3
"""Run a GUI review on its own X server, without opening desktop windows."""
import argparse
import os
import select
import signal
import subprocess
import tempfile
from pathlib import Path


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--xvfb',default='Xvfb')
    parser.add_argument('command',nargs=argparse.REMAINDER)
    args=parser.parse_args()
    command=args.command[1:] if args.command[:1]==['--'] else args.command
    if not command:parser.error('provide a command after --')
    with tempfile.TemporaryDirectory(prefix='manifold-x11-') as directory:
        reader,writer=os.pipe()
        with (Path(directory)/'server.log').open('w') as log:
            server=subprocess.Popen([args.xvfb,'-screen','0','1400x1000x24','-nolisten','tcp','-noreset','-displayfd',str(writer)],pass_fds=(writer,),stdout=log,stderr=log,start_new_session=True)
            os.close(writer)
            try:
                if not select.select([reader],[],[],10)[0]:raise RuntimeError('Xvfb did not start')
                display=os.read(reader,32).decode().strip()
                if not display.isdigit():raise RuntimeError((Path(directory)/'server.log').read_text())
                env=dict(os.environ,DISPLAY=':'+display,MANIFOLD_ISOLATED_DISPLAY='1',LIBGL_ALWAYS_SOFTWARE='1')
                env.pop('WAYLAND_DISPLAY',None)
                return subprocess.run(command,env=env).returncode
            finally:
                os.close(reader)
                if server.poll() is None:os.killpg(server.pid,signal.SIGTERM)
                server.wait(timeout=5)


if __name__=='__main__':raise SystemExit(main())
