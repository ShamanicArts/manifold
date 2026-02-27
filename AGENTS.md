# Looper Plugin - Development Notes

## Overview

This is a **JUCE-based audio looper plugin** with a sophisticated real-time architecture and fully scriptable Lua UI. The project now consists of two plugins:

- **Looper** - The main focus: a multi-layer looper with scriptable UI, external control, and lock-free real-time processing
- **GrainFreeze_Prototype/** - Original granular synth (archived, reference only)

## Architecture

### Core Design
- **Lock-free real-time safety** - No locks in audio thread
- **Scriptable UI** - Full UI in Lua, hot-swappable at runtime
- **External control** - Unix socket IPC for CLI/remote control
- **Primitives-based** - Reusable DSP/UI components

### Key Components

| Component | Purpose |
|-----------|---------|
| `LooperProcessor` | Main audio processor (JUCE), owns 4 layers |
| `LooperLayer` | Individual loop with playhead, speed, reverse, volume |
| `ControlServer` | Unix socket at `/tmp/looper.sock`, lock-free queues |
| `Canvas` | Scene graph UI system (hierarchical nodes) |
| `LuaEngine` | sol2-based Lua bindings for UI scripting |
| `CaptureBuffer` | Circular buffer for live input capture |
| `Quantizer` | Tempo-aware loop length quantization |

### Lock-Free Data Flow

```
Control Thread (UI/CLI)          Audio Thread
       |                               |
       v                               v
[SPSCQueue<256>]  ───────────►  [processControlCommands()]
       ↑                               |
       |                               v
[EventRing<256>]  ◄──────────── [pushEvent() JSON]
       |
[AtomicState] ◄───────────────── [updateAtomicState()]
```

## Build Commands

```bash
# IMPORTANT: For fast iteration, use the dev build directory.
# It avoids LTO/IPO link-time overhead and is dramatically faster.

# Dev (fast iteration)
cmake -S . -B build-dev -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build-dev --target Looper_Standalone

# Release-style (slow clean links due to LTO)
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --target Looper_Standalone
```

## Running

### Standalone Looper
```bash
./build-dev/Looper_artefacts/RelWithDebInfo/Standalone/Looper
```

### VST3
```bash
./build-dev/Looper_artefacts/RelWithDebInfo/VST3/Looper.vst3
```

## UI System

The UI is entirely Lua-based with two main files:

- `looper/ui/looper_ui.lua` - **Default UI** (minimal, modern)
- `looper/ui/looper_ui_old.lua` - Original full-featured UI (reference)

### Widget Library (`looper_widgets.lua`)

Full OOP inheritance - users can extend any widget:

```lua
local W = require("looper_widgets")
local MySlider = W.Slider:extend()
function MySlider:drawTrack(x, y, w, h)
  -- Custom drawing
end
```

**Built-in widgets:**
- `BaseWidget` (extendable), `Button`, `Label`, `Panel`
- `Slider`, `VSlider`, `Knob` (rotary), `Toggle`
- `Dropdown`, `WaveformView` (with scrubbing), `Meter`, `SegmentedControl`, `NumberBox`

**Critical:** All coordinates use `math.floor()` to satisfy sol2's strict typing (Lua doubles → C++ ints).

### UI Switching

Click the ⚙ (settings) button in the header to switch between UI scripts at runtime.

## Command Protocol

CLI via `looper-cli` or direct socket:
- `REC`, `STOPREC`, `COMMIT <bars>`, `FORWARD <bars>`
- `PLAY`, `PAUSE`, `STOP`
- `LAYER <idx> SPEED <val>`, `LAYER <idx> REVERSE <0|1>`
- `TEMPO <bpm>`, `MODE <firstLoop|freeMode|traditional|retrospective>`
- `UI <path>` - Hot-swap UI script

### OSC (Open Sound Control)

Network control via UDP on port 9000:

| OSC Address | Arguments | Description |
|-------------|-----------|-------------|
| `/looper/tempo` | float bpm | Set tempo |
| `/looper/commit` | float bars | Commit N bars retrospectively |
| `/looper/forward` | float bars | Arm forward commit |
| `/looper/rec` | - | Start recording |
| `/looper/stop` | - | Global stop |
| `/looper/play` | - | Global play |
| `/looper/pause` | - | Global pause |
| `/looper/overdub` | int 0/1 or none | Toggle/set overdub |
| `/looper/layer/X/speed` | float | Layer speed |
| `/looper/layer/X/volume` | float | Layer volume |
| `/looper/layer/X/mute` | int 0/1 | Layer mute |
| `/looper/layer/X/reverse` | int 0/1 | Layer reverse |

### OSCQuery

HTTP server on port 9001 for auto-discovery:

- `GET /info` - Full OSCQuery service info (all endpoints)
- `GET /osc/tempo` - Query current tempo
- `GET /osc/recording` - Query recording state
- `POST /api/targets` - Add/remove OSC out targets

## Record Modes

| Mode | Behavior |
|------|----------|
| **FirstLoop** | Auto-detect tempo from first recording |
| **FreeMode** | Quantize to nearest legal length |
| **Traditional** | Record now, commit retrospectively |
| **Retrospective** | Capture always running, commit on demand |

## JUCE Pitfalls

### resized() called before constructor completes
JUCE's `AudioProcessorEditor` base class calls `resized()` during construction, BEFORE derived class members are initialized. 

**Fix:** Call `resized()` manually at the end of your constructor, or add null checks:
```cpp
void resized() {
    if (sliders.isEmpty()) return;  // Not constructed yet
    // ... layout code
}
```

### Component visibility
Always call `addAndMakeVisible()` after creating components, or they won't render.

## Debug Logging
Debug logs are written to `/tmp/grainfreeze_debug.log` when DEBUG is defined.

## File Organization

```
looper/
├── engine/           # Audio processing
│   ├── LooperProcessor.cpp/h
│   └── LooperLayer.h
├── ui/              # Editor + Lua scripts
│   ├── LooperEditor.cpp/h
│   ├── looper_ui.lua          # Default UI
│   ├── looper_ui_old.lua      # Original UI
│   └── looper_widgets.lua     # Widget library
├── primitives/
│   ├── control/     # ControlServer, CommandParser
│   ├── dsp/         # CaptureBuffer, LoopBuffer, Playhead
│   └── scripting/   # LuaEngine
└── headless/        # Test harness

GrainFreeze_Prototype/  # Archived granular synth
├── PluginProcessor.cpp/h
├── PluginEditor.cpp/h
├── GranularEngine.h
└── EffectsProcessor.h
```

## Development Workflow

After modifying Lua files, copy them to the build directory:
```bash
cp looper/ui/*.lua build/Looper_artefacts/Release/Standalone/
```

Or restart the plugin which auto-loads from the source directory.

### Tmux Workflow (Long-running Processes)

Use **tmux session 0** with **windows 1 and 2** for all long-running commands:

```bash
# Check current sessions
ls -t /tmp/looper_*.sock

# Capture pane output (before/after commands)
tmux capture-pane -p -t 0:1
tmux capture-pane -p -t 0:2

# Send commands to windows
tmux send-keys -t 0:1 'command here' Enter
tmux send-keys -t 0:2 'make -j$(nproc)' Enter

# Kill/restart standalone
tmux send-keys -t 0:1 C-c
sleep 2
tmux send-keys -t 0:1 './Looper_artefacts/Release/Standalone/Looper 2>&1' Enter
```

**Window assignments:**
- **Window 1 (0:1)**: Looper standalone process
- **Window 2 (0:2)**: Build commands, tests, other processes

**Never use head/tail** on tmux capture output - it obfuscates the shell state.

### JJ Version Control Workflow

This project uses **Jujutsu (jj)** for version control. The working copy is often a merge commit; preserve that shape and split changes out of `@` with `-A`.

```bash
# 1) Inspect state before rewriting
jj st
jj diff --name-only
jj obslog -r @ --limit 20

# 2) Remove build noise first (if present)
jj file untrack build-dev

# 3) Split docs onto docs lineage, code onto code lineage
jj split -r @ -A <docs_parent> -m "docs(scope): description" <docs files...>
jj split -r @ -A <code_parent> -m "feat(scope): description" <code files...>

# 4) Keep splitting @ until only intended remainder (often empty merge)
jj split -r @ -A <latest_code_commit> -m "feat(scope): next chunk" <files...>

# 5) Verify each split and final graph
jj show --name-only <change_id>
jj log -r "@ | @- | @-- | bookmarks()" --limit 20
jj st

# 6) Move docs bookmark when docs split advances
jj bookmark move agent-docs --to <docs_change_id>
```

**Key points:**
- Use `jj obslog -r @` to understand operation history before and after big rewrites
- Use `jj split -r @ -A <parent>` to insert commits without collapsing the merge working head
- For docs streams, split after docs parent and move `agent-docs` bookmark to the new docs commit
- Validate file grouping with `jj show --name-only <change_id>` after each split
- Recovery is cheap: `jj undo` reverts the last operation safely

## Testing Rules

**NEVER create standalone test harness binaries** (e.g. `DspScriptHostHarness.cpp`, `GraphSwapHarness.cpp`). These pollute the build, test things in unrealistic environments, and waste time debugging red herrings. Use `LooperHeadless` + `looper-cli` for all integration testing. This is a hard rule.

**Existing harnesses** (`LuaEngineMockHarness`, `EndpointResolverHarness`, etc.) test isolated subsystems without the full processor — these are acceptable. The distinction: unit-testing a parser or resolver in isolation is fine; creating a fake "mini-processor" that partially recreates `LooperProcessor` is not.

## Socket Location

The ControlServer creates a Unix socket at `/tmp/looper.sock`. If the process crashes, you may need to manually remove stale sockets:
```bash
rm /tmp/looper.sock
```
