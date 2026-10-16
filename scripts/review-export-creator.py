#!/usr/bin/env python3
"""Exercise the exported creator inside an already running private REAPER review.

Run on the Mac with --profile review, or beside the isolated Proton review.
The corresponding review Lua must be running. Screenshots/physical gestures
are captured separately; this script only claims the operations it performs.
"""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile', type=Path, required=True)
    parser.add_argument('--platform', choices=['mac', 'proton'], required=True)
    parser.add_argument('--format', choices=['clap', 'vst3'], required=True)
    args = parser.parse_args()
    profile = args.profile.resolve()
    out = profile / args.format
    out.mkdir(exist_ok=True)
    index = 0 if args.format == 'clap' else 1

    def lua(code):
        done = profile / 'done.txt'
        done.unlink(missing_ok=True)
        (profile / 'control.lua').write_text(code)
        deadline = time.monotonic() + 25
        while not done.exists() and time.monotonic() < deadline:
            time.sleep(.1)
        assert done.exists(), 'REAPER control loop did not respond'
        assert done.read_text() == 'ok', done.read_text()

    def endpoints():
        if args.platform == 'mac':
            return re.findall(r'Manifold creator agent endpoint: (http://\S+)',
                              (profile / 'host.log').read_text())[::-1]
        sockets = subprocess.check_output(['ss', '-ltnp'], text=True)
        return ['http://127.0.0.1:' + port + '/__manifold/request'
                for port in re.findall(r'127\.0\.0\.1:(\d+).*wineserver', sockets)]

    def request(command, name):
        deadline = time.monotonic() + 15
        last = 'No creator endpoint'
        while time.monotonic() < deadline:
            for address in endpoints():
                try:
                    response = urllib.request.urlopen(urllib.request.Request(
                        address, data=json.dumps(command).encode(),
                        headers={'Content-Type': 'application/json'}), timeout=3)
                    result = json.load(response)
                    (out / name).write_text(json.dumps(result, indent=2) + '\n')
                    return result
                except (urllib.error.URLError, OSError) as error:
                    last = str(error)
                    if isinstance(error, urllib.error.HTTPError):
                        last = error.read().decode()
            time.sleep(.15)
        raise AssertionError(last)

    if args.platform == 'proton':
        routing = json.loads((profile / 'display.json').read_text())
        assert routing['isolated']
        sinks = subprocess.check_output(['pactl', '--server', routing['audioServer'],
                                         'list', 'short', 'sinks'], text=True)
        assert sinks.strip() and all('manifold_null' in line for line in sinks.splitlines())
        lua('reaper.Audio_Init()')
    else:
        lua("local ok,mode=reaper.GetAudioDeviceInfo('MODE');"
            "assert(ok and mode=='Dummy Audio','Review requires Dummy Audio')")
    lua(f"local t=reaper.GetTrack(0,0);reaper.TrackFX_Show(t,{1-index},2);"
        f"reaper.TrackFX_SetEnabled(t,{1-index},false);reaper.TrackFX_SetEnabled(t,{index},true);"
        f"reaper.TrackFX_Show(t,{index},3);reaper.OnPlayButton()")
    state = request({'operation': 'project.inspect'}, 'initial.json')
    view = request({'operation': 'view.inspect'}, 'initial-view.json')
    assert view['mounted'] and view['canvas']['webgl2'] and not view['canvas']['contextLost'], view
    assert view['analysis']['rms'] > .00001, view
    state = request({'operation': 'parameter.batch', 'edits': [
        {'path': '/ui/space/cutoff', 'value': 1600},
        {'path': '/ui/space/pitch', 'value': 330}],
        'expectedRevision': state['revision']}, 'parameter-batch.json')
    norm = out / 'host-values.txt'
    lua(f"local t=reaper.GetTrack(0,0);local f=assert(io.open('{norm.as_posix()}','w'));"
        f"f:write(reaper.TrackFX_GetParamNormalized(t,{index},4),' ',"
        f"reaper.TrackFX_GetParamNormalized(t,{index},1));f:close()")
    values = [float(value) for value in norm.read_text().split()]
    for value, path, plain in zip(values, ['/ui/space/cutoff', '/ui/space/pitch'], [1600, 330]):
        parameter = next(p for p in state['parameters'] if p['path'] == path)
        expected = (plain - parameter['min']) / (parameter['max'] - parameter['min'])
        assert abs(value - expected) < .0001, (path, value, expected)
    source = state['source'].replace("tone: '#38bdf8'", "tone: '#fb7185'").replace(
        'IcosahedronGeometry(0.18, 1)', 'IcosahedronGeometry(0.24, 0)')
    assert source != state['source'], 'Start from the original exported project'
    edited = request({'operation': 'source.apply', 'source': source,
                      'expectedRevision': state['revision']}, 'source-edit.json')
    assert edited['source'] == source
    lua(f"reaper.TrackFX_SetParamNormalized(reaper.GetTrack(0,0),{index},4,.35)")
    automated = request({'operation': 'project.inspect'}, 'host-automation.json')
    cutoff = next(p['value'] for p in automated['parameters'] if p['path'] == '/ui/space/cutoff')
    assert abs(cutoff - 2852) < .1, cutoff
    edited = request({'operation': 'parameter.set', 'path': '/ui/space/cutoff',
                      'value': 550, 'expectedRevision': automated['revision']}, 'final-edit.json')
    saved = out / 'edited.rpp'
    lua(f"reaper.TrackFX_Show(reaper.GetTrack(0,0),{index},2);"
        f"reaper.Main_SaveProjectEx(0,'{saved.as_posix()}',0)")
    time.sleep(.5)
    lua(f"reaper.TrackFX_Show(reaper.GetTrack(0,0),{index},3)")
    reopened = request({'operation': 'project.inspect'}, 'editor-reopened.json')
    assert reopened['source'] == source
    lua(f"reaper.OnStopButton();reaper.Main_openProject('noprompt:{saved.as_posix()}');"
        f"reaper.TrackFX_Show(reaper.GetTrack(0,0),{index},3);reaper.OnPlayButton()")
    recalled = request({'operation': 'project.inspect'}, 'daw-recalled.json')
    assert recalled['source'] == source
    cutoff = next(p['value'] for p in recalled['parameters'] if p['path'] == '/ui/space/cutoff')
    assert abs(cutoff - 550) < .1, cutoff
    view = request({'operation': 'view.inspect'}, 'recalled-view.json')
    assert view['canvas']['webgl2'] and not view['canvas']['contextLost'], view
    assert view['analysis']['rms'] > .00001, view
    clock = out / 'host-clock.txt'
    lua(f"local f=assert(io.open('{clock.as_posix()}','w'));"
        "local ok,mode=reaper.GetAudioDeviceInfo('MODE');"
        "f:write(tostring(mode),' ',reaper.GetPlayState(),' ',reaper.GetPlayPosition());f:close()")
    report = {'platform': args.platform, 'format': args.format,
              'actualEditorWebGL2': True, 'sourceEditAccepted': True,
              'creatorBatchReachedHost': {'cutoff': values[0], 'pitch': values[1]},
              'hostAutomationCutoff': 2852, 'editorReopenAndDawRecall': True,
              'recalledCutoff': cutoff, 'initialRms': state['analysis']['rms'],
              'recalledRms': view['analysis']['rms'], 'hostClock': clock.read_text()}
    (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    main()
