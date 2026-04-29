---
name: manifold-testing
description: Testing, introspection, and control of the Manifold audio plugin via IPC, OSC, OSCQuery, and EVAL. Use when working with Manifold to verify functionality, switch projects, test DSP scripts, or debug issues.
---

# Manifold Testing Skill

**Reference Document:** `agent-docs/complete/midi-osc/260224_introspection_and_control_systems.md` (read this for complete details)

## Quick Start

### Find Active Socket
```bash
SOCKET=$(ls -t /tmp/manifold_*.sock 2>/dev/null | head -1)
echo "Using: $SOCKET"
```

### Health Check
```bash
echo "PING" | timeout 2 nc -U "$SOCKET"              # → OK PONG
echo "GET /core/behavior/tempo" | timeout 2 nc -U "$SOCKET"
echo "EVAL return shell.mode" | timeout 2 nc -U "$SOCKET"
echo "EVAL return getCurrentScriptPath()" | timeout 2 nc -U "$SOCKET"
```

### Project Switch
```bash
echo "UISWITCH /home/shamanic/dev/my-plugin/UserScripts/projects/DspLiveScripting/manifold.project.json5" | timeout 2 nc -U "$SOCKET"
sleep 3
echo "EVAL return getCurrentScriptPath()" | timeout 2 nc -U "$SOCKET"
```

## Key Interfaces

| Interface | Command | Port/Path |
|-----------|---------|-----------|
| **IPC** | `echo "CMD" \| timeout 2 nc -U /tmp/manifold_*.sock` | Unix socket |
| **OSC** | UDP packets | Port `9000` |
| **OSCQuery** | HTTP/WebSocket | Port `9001` |
| **gRPC** | **NOT IMPLEMENTED** | - |

## Common EVAL Commands

```bash
# Read parameter
echo "EVAL return getParam('/core/behavior/tempo')" | timeout 2 nc -U "$SOCKET"

# Set parameter
echo "EVAL setParam('/core/behavior/tempo', 140)" | timeout 2 nc -U "$SOCKET"

# List DSP scripts
echo "EVAL local s=listDspScripts() return #s" | timeout 2 nc -U "$SOCKET"

# Check DSP errors
echo "EVAL return getDspScriptLastError()" | timeout 2 nc -U "$SOCKET"

# Get MIDI devices
echo "EVAL local d=Midi.inputDevices() return #d" | timeout 2 nc -U "$SOCKET"

# Check shell mode
echo "EVAL return shell.mode" | timeout 2 nc -U "$SOCKET"
```

## Available Projects

- `UserScripts/projects/Main/manifold.project.json5`
- `UserScripts/projects/DspLiveScripting/manifold.project.json5`
- `UserScripts/projects/ExperimentalUI/manifold.project.json5`
- `UserScripts/projects/RuntimeBenchmark/manifold.project.json5`

## Build Commands (tmux)

```bash
# Build in VST-Plug session, window 2
tmux send-keys -t "VST-Plug:2" "cd /home/shamanic/dev/my-plugin/build-dev && ninja Manifold_Standalone" Enter

# Check progress
tmux capture-pane -p -t "VST-Plug:2" | tail -20
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `ERROR no lua engine` | Headless mode | Use standalone with GUI |
| `ERROR lua engine not initialized` | VM not created | Check editor initialized |
| Socket not found | Not running | `ps aux \| grep manifold` |
| OSC not responding | Port blocked | `ss -ulnp \| grep :9000` |
| `nc` hangs / no response | Socket closed or app busy | Wrap with `timeout 2` (already in examples above) |

## Reference

For complete documentation of all interfaces, protocols, error codes, and testing workflows, read:

**`agent-docs/complete/midi-osc/260224_introspection_and_control_systems.md`**
