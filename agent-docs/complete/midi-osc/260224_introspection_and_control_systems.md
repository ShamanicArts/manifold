# Manifold Introspection, Discovery & Control Systems

Comprehensive documentation of IPC, OSC, OSCQuery, CLI, gRPC, and EVAL interfaces.

**Last Updated:** 2026-03-24

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [IPC (Unix Domain Sockets)](#ipc-unix-domain-sockets)
3. [Command Parser & CLI](#command-parser--cli)
4. [OSC (Open Sound Control)](#osc-open-sound-control)
5. [OSCQuery](#oscquery)
6. [gRPC Status](#grpc-status)
7. [EVAL - Lua Execution](#eval---lua-execution)
8. [Testing Workflows](#testing-workflows)
9. [Troubleshooting](#troubleshooting)

---

## Executive Summary

| Interface | Status | Port/Path | Purpose |
|-----------|--------|-----------|---------|
| **IPC** | ✅ Active | `/tmp/manifold_<pid>.sock` | Primary control interface |
| **OSC** | ✅ Active | UDP 9000 | Real-time parameter control |
| **OSCQuery** | ✅ Active | HTTP/WebSocket 9001 | Discovery and monitoring |
| **gRPC** | ❌ Disabled | - | Defined but not running |
| **MIDI** | ✅ Active | Device-dependent | Musical control |

**Key Finding:** EVAL was broken in ImGui-direct mode due to `isScriptLoaded()` check. Fixed by adding `isInitialized()` method and changing the check.

---

## IPC (Unix Domain Sockets)

### Socket Location

```
/tmp/manifold_<pid>.sock
```

### Finding Active Socket

```bash
ls -t /tmp/manifold_*.sock | head -1
```

### Protocol

- Line-based text protocol
- Responses: `OK [result]` or `ERROR [message]`
- Supports multiple simultaneous clients

### Core Commands

```bash
# Health check
echo "PING" | nc -U /tmp/manifold_*.sock
# → OK PONG

# Get full state
echo "STATE" | nc -U /tmp/manifold_*.sock

# Get parameter
echo "GET /core/behavior/tempo" | nc -U /tmp/manifold_*.sock
# → OK {"VALUE": 120}

# Set parameter
echo "SET /core/behavior/tempo 135" | nc -U /tmp/manifold_*.sock

# Trigger action
echo "TRIGGER /core/behavior/rec" | nc -U /tmp/manifold_*.sock

# Watch mode (streams events)
echo "WATCH" | nc -U /tmp/manifold_*.sock

# Switch project
echo "UISWITCH /path/to/project.manifold.project.json5" | nc -U /tmp/manifold_*.sock

# EVAL (Lua execution)
echo "EVAL return 2+2" | nc -U /tmp/manifold_*.sock
# → OK 4
```

---

## Command Parser & CLI

### Syntax Styles

**Canonical (Modern):**
```
SET /core/behavior/tempo 120
GET /core/behavior/layer/0/speed
TRIGGER /core/behavior/rec
```

**Legacy (Rejected):**
```
TEMPO 120
LAYER 0 SPEED 1.5
```
Returns: `ERROR legacy command removed: TEMPO. Use SET/GET/TRIGGER /path syntax.`

### Error Codes

| Code | Meaning |
|------|---------|
| `W_PATH_UNKNOWN` | Path doesn't exist |
| `W_ACCESS_DENIED` | Wrong access mode |
| `W_RANGE_CLAMPED` | Value was clamped |
| `W_COERCE_LOSSY` | Type coercion with data loss |

---

## OSC (Open Sound Control)

### Configuration

Default ports (from `.manifold.settings.json`):
- Input: 9000
- OSCQuery: 9001

### Testing

```python
import struct, socket

addr = b'/core/behavior/tempo\x00\x00\x00\x00'
typetag = b',f\x00\x00'
value = struct.pack('>f', 135.0)

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.sendto(addr + typetag + value, ('127.0.0.1', 9000))
```

---

## OSCQuery

### HTTP Interface

```bash
# Full endpoint tree (284KB JSON)
curl http://localhost:9001/

# Specific value
curl "http://localhost:9001/core/behavior/tempo?VALUE"
# → {"VALUE": 120}
```

### WebSocket Support

Upgrade to WebSocket for real-time streaming:
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:9001/
```

---

## gRPC Status

**NOT IMPLEMENTED**

Proto defined in `proto/manifold.proto` but server not running. Port 50051 not listening.

---

## EVAL - Lua Execution

### Overview

Arbitrary Lua code execution via IPC. Fixed in ImGui-direct mode by changing `isScriptLoaded()` to `isInitialized()`.

### Available Functions

**Parameters:**
- `getParam(path)` - Read parameter
- `setParam(path, value)` - Write parameter

**DSP:**
- `listDspScripts()` - Get available scripts
- `getDspScriptLastError()` - Check for errors
- `loadDspScriptFromString(code, name, slot)`

**Files:**
- `readTextFile(path)`
- `writeTextFile(path, text)`
- `getCurrentScriptPath()`

**OSC:**
- `osc.getSettings()`
- `osc.getStatus()`
- `osc.send(address, ...)`

**MIDI:**
- `Midi.inputDevices()`
- `Midi.openInput(index)`
- `Midi.closeInput(index)`

**UI:**
- `shell.mode` - "performance" or "edit"
- `root:getNumChildren()`
- `command("UISWITCH /path")`

### Examples

```bash
# Arithmetic
echo "EVAL return 2+2" | nc -U /tmp/manifold_*.sock
# → OK 4

# Read parameter
echo "EVAL return getParam('/core/behavior/tempo')" | nc -U /tmp/manifold_*.sock

# Set parameter
echo "EVAL setParam('/core/behavior/tempo', 140)" | nc -U /tmp/manifold_*.sock

# List DSP scripts
echo "EVAL local s=listDspScripts() return #s" | nc -U /tmp/manifold_*.sock
# → OK 36

# Switch project
echo "EVAL command('UISWITCH /path/to/project')" | nc -U /tmp/manifold_*.sock

# Check mode
echo "EVAL return shell.mode" | nc -U /tmp/manifold_*.sock
# → OK performance
```

---

## Testing Workflows

### Health Check

```bash
#!/bin/bash
SOCKET=$(ls -t /tmp/manifold_*.sock | head -1)

echo "PING: $(echo 'PING' | timeout 1 nc -U $SOCKET)"
echo "Tempo: $(echo 'GET /core/behavior/tempo' | timeout 1 nc -U $SOCKET)"
echo "Mode: $(echo 'EVAL return shell.mode' | timeout 1 nc -U $SOCKET)"
```

### Project Switch Test

```bash
#!/bin/bash
SOCKET=$(ls -t /tmp/manifold_*.sock | head -1)
PROJECT="$1"

# Switch
echo "UISWITCH $PROJECT" | nc -U $SOCKET
sleep 3

# Verify
CURRENT=$(echo "EVAL return getCurrentScriptPath()" | nc -U $SOCKET | sed 's/OK //')
echo "Current: $CURRENT"

# Check errors
ERROR=$(echo "EVAL return getDspScriptLastError()" | nc -U $SOCKET | sed 's/OK //')
[ -z "$ERROR" ] && echo "✓ No errors" || echo "✗ Error: $ERROR"
```

---

## Troubleshooting

### "ERROR no lua engine"
Manifold not running with editor. Use standalone, ensure GUI shown.

### "ERROR lua engine not initialized"
Lua VM not created. Check `luaEngine.initialise()` called.

### Socket Not Found
```bash
ps aux | grep manifold
ls -la /tmp/manifold_*.sock
```

### OSC Not Responding
```bash
ss -ulnp | grep :9000
cat ~/.local/share/Manifold/settings.json
```

### Build Issues (ImGuiColorTextEdit)
Submodule was updated to rewrite without LanguageDefinitions.cpp. Reset to compatible commit:
```bash
cd external/ImGuiColorTextEdit
git checkout fde0208
```

---

## EVAL Fix Details

**Problem:** `isScriptLoaded()` returned false in ImGui-direct mode.

**Root Cause:** ImGui-direct initializes Lua VM but doesn't load a traditional script.

**Solution:** Added `isInitialized()` check:

1. `LuaCoreEngine.h` - Added `bool isInitialized() const;`
2. `LuaCoreEngine.cpp` - Added `return pImpl->lua != nullptr;`
3. `LuaEngine.h` - Added declaration
4. `LuaEngine.cpp` - Added implementation
5. `ControlServer.cpp` - Changed check from `isScriptLoaded()` to `isInitialized()`

---

**Document Version:** 1.0
**Author:** Agent Analysis
**Date:** 2026-03-24
