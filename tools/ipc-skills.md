# Manifold IPC Skills Guide

A practical guide for accessing and querying the Manifold application via its Unix domain socket IPC.

## Quick Start

```python
import socket, glob, os

# Find the most recent live socket
def find_socket():
    sockets = sorted(glob.glob('/tmp/manifold_*.sock'), key=os.path.getmtime, reverse=True)
    for path in sockets:
        try:
            probe = socket.socket(socket.AF_UNIX)
            probe.settimeout(0.2)
            probe.connect(path)
            probe.close()
            return path
        except:
            try: os.unlink(path)
            except: pass
    raise RuntimeError("No live manifold sockets")

# Execute a Lua script and return the result
def eval_lua(sock_path, script):
    # Collapse to single line (EVAL expects it)
    one_line = ' '.join(script.strip().split())
    cmd = f'EVAL {one_line}\n'
    
    s = socket.socket(socket.AF_UNIX)
    s.connect(sock_path)
    s.sendall(cmd.encode())
    result = s.recv(65536).decode()
    s.close()
    return result
```

## IPC Protocol Commands

| Command | Description | Example |
|---------|-------------|---------|
| `EVAL <lua>` | Execute Lua code, return result | `EVAL return _G.shell.mode` |
| `GET <path>` | Get OSCQuery path value | `GET /manifold/graph/enabled` |
| `SET <path> <value>` | Set OSCQuery path value | `SET /manifold/graph/enabled 1` |
| `STATE` | Full looper state JSON | `STATE` |
| `WATCH` | Stream events continuously | `WATCH` |
| `UISWITCH <path>` | Switch active UI script | `UISWITCH /path/to/ui.lua` |

## Response Format

All responses start with status followed by payload:
```
OK <result>
ERROR <message>
EVENT <json>    # For WATCH streams
```

---

## The Shell Object (`_G.shell`)

The shell is the primary interface for UI inspection and manipulation.

### Selection & Widgets

```lua
-- Get currently selected widgets
local sel = _G.shell.selectedWidgets  -- array of sol.Canvas*
local first = _G.shell.selectedWidget  -- first or nil

-- Get selection bounds
local bounds = _G.shell:getSelectionBounds()  -- {x,y,w,h}

-- Get source metadata for selected widget (for structured UI editing)
local src = _G.shell:getStructuredSourceForCanvas(widget, "bounds")
-- Returns: documentPath, nodeId, childNodeId, pathPrefix, globalId, kind

-- Hit test
local widget = _G.shell:hitTestWidget(x, y)
local is_selected = _G.shell:isCanvasSelected(widget)
```

### Canvas Widget Methods

On `sol.Canvas*` userdata (widgets from selection, hit test, tree rows):
```lua
local x, y, w, h = widget:getBounds()  -- 4 return values
local visible = widget:isVisible()
local width = widget:getWidth()
local height = widget:getHeight()
```

### Inspector State

```lua
local rows = _G.shell.inspectorRows  -- array of property rows
-- Each row: {key, value, path, isConfig, editorType, min, max, step, enumOptions, ...}

-- Example iteration:
for i, row in ipairs(rows) do
    print(row.key or "?", "=", row.value)
end
```

### Tree/Hierarchy

```lua
local rows = _G.shell.treeRows  -- array of hierarchy rows
-- Each row: {name, path, type, canvas, x, y, w, h, depth, children, record}

local root = _G.shell.treeRoot  -- root tree node
```

### Modes & State

```lua
-- Query current modes
local mode = _G.shell.mode              -- "edit", "select", etc.
local nav_mode = _G.shell.navMode       -- "select", etc.
local panel_mode = _G.shell.leftPanelMode  -- "hierarchy", "scripts", "dsp"
local edit_mode = _G.shell.editContentMode  -- "preview", etc.
local dev_mode = _G.shell.devModeEnabled   -- boolean

-- Check if structured project is active
local is_structured = _G.shell:isStructuredProjectActive()
```

### Viewport & Zoom

```lua
local zoom = _G.shell.currentZoom       -- e.g., 0.67
local pan_x = _G.shell.panX
local pan_y = _G.shell.panY
local vx = _G.shell.viewportDesignX
local vy = _G.shell.viewportDesignY
local vw = _G.shell.viewportDesignW
local vh = _G.shell.viewportDesignH
```

### Undo/Redo

```lua
local undo_count = #_G.shell.undoStack
local redo_count = #_G.shell.redoStack

_G.shell:undo()
_G.shell:redo()
_G.shell:recordHistory()
```

### Tabs

```lua
local tabs = _G.shell.mainTabs  -- array of {id, name, ...}
local active_id = _G.shell.activeMainTabId
local active_path = _G.shell.activeTabContentPath

_G.shell:activateMainTab(tab_id)
```

### Actions

```lua
-- Selection
_G.shell:setSelection(widgets)
_G.shell:selectWidget(widget)
_G.shell:toggleCanvasSelection(widget)

-- Mode changes
_G.shell:setMode("edit")
_G.shell:setLeftPanelMode("hierarchy")
_G.shell:setDevModeEnabled(true)

-- Persist structured UI changes
_G.shell:persistStructuredBoundsForCanvas(widget)
_G.shell:persistStructuredConfigForCanvas(widget)

-- Console
_G.shell:toggleConsole()
_G.shell:setConsoleVisible(true)
_G.shell:executeConsoleCommand("print('hello')")
_G.shell:appendConsoleLine("log message")

-- Script editor
_G.shell:openScriptEditor()
_G.shell:closeScriptEditor()
_G.shell:saveScriptEditor()
_G.shell:reloadScriptEditor()
```

---

## Structured UI Functions (Global)

For working with structured UI projects:

```lua
-- Query
local docs = getStructuredUiDocuments()
local files = getStructuredUiProjectFiles()
local status = getStructuredUiProjectStatus()
-- status: {dirtyCount, documentCount, manifestPath, projectRoot, uiRoot, lastError, ...}

local value = getStructuredUiNodeValue(documentPath, nodeId, path)

-- Modify
setStructuredUiNodeValue(documentPath, nodeId, path, value)
removeStructuredUiNodeValue(documentPath, nodeId, path)

-- Save
saveStructuredUiDocument(documentPath)
saveStructuredUiAll()

-- Reload
reloadStructuredUiProject()
```

---

## DSP/Graph Functions (Global)

```lua
-- Loading
loadDspScript(path)
loadDspScriptInSlot(slot, path)
loadDspScriptFromString(code)
loadDspScriptFromStringInSlot(slot, code)
reloadDspScript(path)

-- Unloading
unloadDspSlot(slot)

-- State
isDspScriptLoaded(path)
isDspSlotLoaded(slot)
isDspSlotPersistOnUiSwitch(slot)
setDspSlotPersistOnUiSwitch(slot, persist)

-- Graph inspection
getGraphNodeCount()
getGraphConnectionCount()
hasGraphCycle()
listEndpoints()
hasEndpoint(node, endpoint)

-- Graph manipulation
connectNodes(from_node, from_ep, to_node, to_ep)
clearGraph()

-- Processing
isGraphProcessingEnabled()
setGraphProcessingEnabled(enabled)

-- Parameters
getParam(path)
setParam(path, value)
```

---

## Global Namespaces

### `gfx` - Drawing Primitives

```lua
gfx:setColour(rgba)
gfx:fillAll()
gfx:fillRect(x, y, w, h)
gfx:fillRoundedRect(x, y, w, h, radius)
gfx:drawRect(x, y, w, h)
gfx:drawRoundedRect(x, y, w, h, radius)
gfx:drawLine(x1, y1, x2, y2)
gfx:drawHorizontalLine(y, x1, x2)
gfx:drawVerticalLine(x, y1, y2)
gfx:setFont(font)
gfx:drawText(text, x, y)
```

### `looper` - Looper Callbacks

```lua
looper.onRecordingChanged = function(is_recording) end
looper.onTempoChanged = function(bpm) end
looper.onLayerStateChanged = function(layer_idx, state) end
looper.onStateChanged = function(state) end
looper.onCommit = function(layer_idx) end
```

### `link` - Ableton Link

```lua
link:isEnabled()
link:setEnabled(bool)
link:getBeat()
link:getPhase()
link:requestTempo(bpm)
link:isPlaying()
link:requestStart()
link:requestStop()
link:isTempoSyncEnabled()
link:setTempoSyncEnabled(bool)
link:isStartStopSyncEnabled()
link:setStartStopSyncEnabled(bool)
link:getNumPeers()
```

### `Midi` - MIDI API

```lua
-- Constants
Midi.NOTE_ON, Midi.NOTE_OFF, Midi.CONTROL_CHANGE, Midi.PITCH_BEND, ...
Midi.CC_MODWHEEL, Midi.CC_SUSTAIN, Midi.CC_VOLUME, ...

-- Device enumeration
Midi:inputDevices()
Midi:outputDevices()

-- Open/close
Midi:openInput(device_idx)
Midi:openOutput(device_idx)
Midi:closeInput()
Midi:closeOutput()

-- Send
Midi:sendNoteOn(note, vel, channel)
Midi:sendNoteOff(note, vel, channel)
Midi:sendCC(cc, value, channel)
Midi:sendPitchBend(value, channel)
Midi:sendProgramChange(program, channel)
Midi:sendAllNotesOff()
Midi:sendAllSoundOff()

-- Receive (callbacks)
Midi:onNoteOn(function(note, vel, channel) end)
Midi:onNoteOff(function(note, vel, channel) end)
Midi:onControlChange(function(cc, value, channel) end)
Midi:onPitchBend(function(value, channel) end)
Midi:onMidiEvent(function(event) end)

-- Utilities
Midi:noteToFrequency(note)
Midi:frequencyToNote(freq)
Midi:noteName(note)

-- Learn
Midi:learn(callback)
Midi:unlearn()
Midi:getMappings()
```

### `osc` - OSC API

```lua
-- Targets
osc:addTarget(host, port)
osc:removeTarget(host, port)

-- Send
osc:send(address, ...)
osc:sendTo(host, port, address, ...)

-- Receive
osc:registerEndpoint(address, types)
osc:removeEndpoint(address)
osc:onMessage(function(msg) end)

-- OSCQuery
osc:onQuery(function(path) end)
osc:getValue(path)
osc:setValue(path, value)

-- Settings
osc:getSettings()
osc:setSettings(settings)
osc:getStatus()
```

### `settings` - App Settings

```lua
settings:getConfigPath()
settings:getUserScriptsDir()
settings:setUserScriptsDir(path)
settings:browseForUserScriptsDir()
settings:getDevScriptsDir()
settings:setDevScriptsDir(path)
settings:getDspScriptsDir()
settings:setDspScriptsDir(path)
settings:browseForDspScriptsDir()
settings:getOscPort()
settings:setOscPort(port)
settings:getOscQueryPort()
settings:setOscQueryPort(port)
settings:save()
```

### `state` - Runtime State

```lua
state.numVoices
state.projectionVersion
state.params      -- table
state.voices      -- table
state.spectrum    -- table
state.link        -- table (Link state subset)
```

### `Primitives` - DSP Primitives

```lua
Primitives.CaptureBuffer
Primitives.LoopBuffer
Primitives.Playhead
Primitives.Quantizer
Primitives.OscillatorNode
Primitives.FilterNode
Primitives.SVFNode
Primitives.DistortionNode
Primitives.ReverbNode
Primitives.StereoDelayNode
Primitives.PassthroughNode
Primitives.PlayheadNode
```

---

## Other Useful Globals

```lua
-- File I/O
readTextFile(path)
writeTextFile(path, content)
listFilesRecursive(path)

-- Clipboard
getClipboardText()
setClipboardText(text)

-- Time
getTime()

-- Script info
getCurrentScriptPath()

-- Console output (from Lua)
print(...)
```

---

## Python Helper Class

A reusable client class for scripts:

```python
import socket, glob, os

class ManifoldClient:
    def __init__(self, sock_path=None):
        self.sock_path = sock_path or self._find_socket()
    
    def _find_socket(self):
        sockets = sorted(glob.glob('/tmp/manifold_*.sock'), 
                        key=os.path.getmtime, reverse=True)
        for path in sockets:
            try:
                probe = socket.socket(socket.AF_UNIX)
                probe.settimeout(0.2)
                probe.connect(path)
                probe.close()
                return path
            except:
                try: os.unlink(path)
                except: pass
        raise RuntimeError("No live manifold sockets")
    
    def cmd(self, command):
        """Send a raw IPC command."""
        s = socket.socket(socket.AF_UNIX)
        s.connect(self.sock_path)
        s.sendall((command + '\n').encode())
        s.settimeout(2.0)
        response = ""
        try:
            while True:
                chunk = s.recv(65536)
                if not chunk: break
                response += chunk.decode()
                if '\n' in response: break
        except socket.timeout:
            pass
        finally:
            s.close()
        return response.strip()
    
    def eval(self, script):
        """Execute Lua and return result."""
        one_line = ' '.join(script.strip().split())
        return self.cmd(f'EVAL {one_line}')
    
    def get(self, path):
        """Get OSCQuery value."""
        resp = self.cmd(f'GET {path}')
        if not resp.startswith('OK '):
            raise RuntimeError(f'GET failed: {resp}')
        import json
        payload = json.loads(resp[3:])
        return payload.get('VALUE')
    
    def set(self, path, value):
        """Set OSCQuery value."""
        return self.cmd(f'SET {path} {value}')
    
    def state(self):
        """Get full looper state."""
        import json
        resp = self.cmd('STATE')
        if resp.startswith('OK '):
            return json.loads(resp[3:])
        raise RuntimeError(f'STATE failed: {resp}')
```

### Usage Examples

```python
cli = ManifoldClient()

# Get current shell mode
result = cli.eval('return _G.shell.mode')
print(result)  # "OK edit"

# Get selection bounds
result = cli.eval('''
    local s = _G.shell
    local b = s:getSelectionBounds()
    return b.x..','..b.y..','..b.w..','..b.h
''')

# Check graph state
enabled = cli.get('/manifold/graph/enabled')

# Switch UI
cli.cmd('UISWITCH /path/to/ui.lua')

# Get looper state
state = cli.state()
print(state['tempo'], state['is_recording'])
```

---

## Common Patterns

### Get Selected Widget Source Info

```python
script = '''
local shell = _G.shell
local w = shell.selectedWidgets and shell.selectedWidgets[1]
if not w then return 'NO_SELECTION' end
local src = shell:getStructuredSourceForCanvas(w, 'bounds') or {}
local x,y,w_,h_ = w:getBounds()
return table.concat({
    tostring(src.documentPath or ''),
    tostring(src.nodeId or ''),
    tostring(src.childNodeId or ''),
    tostring(src.pathPrefix or ''),
    tostring(x), tostring(y), tostring(w_), tostring(h_)
}, '|')
'''
result = cli.eval(script)
# Returns: /path/to/file.lua|nodeId|childNodeId|pathPrefix|x|y|w|h
```

### Wait for Condition

```python
import time

def wait_for(cli, predicate, timeout=2.0, step=0.05):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if predicate(cli):
                return True
        except:
            pass
        time.sleep(step)
    return False

# Usage:
wait_for(cli, lambda c: c.eval('return _G.shell.mode') == 'OK edit')
```

### Stream Events

```python
import threading

def watch_events(cli, callback):
    def worker():
        s = socket.socket(socket.AF_UNIX)
        s.connect(cli.sock_path)
        s.sendall(b'WATCH\n')
        buf = ""
        while True:
            data = s.recv(4096)
            if not data: break
            buf += data.decode()
            while '\n' in buf:
                line, buf = buf.split('\n', 1)
                if line.startswith('EVENT '):
                    import json
                    callback(json.loads(line[6:]))
    t = threading.Thread(target=worker, daemon=True)
    t.start()
    return t
```

---

## Debugging Tips

1. **Check socket exists**: `ls -la /tmp/manifold_*.sock`
2. **Stale sockets**: The `_find_socket` helper auto-cleans sockets that fail to connect
3. **Response truncation**: Max response is 65536 bytes; for larger data, query in chunks
4. **Lua errors**: Response will be `ERROR <message>` with line number
5. **Type conversion**: Lua returns strings via IPC; parse as needed in Python
6. **Single-line EVAL**: Scripts must collapse to single line; use single quotes inside Lua
