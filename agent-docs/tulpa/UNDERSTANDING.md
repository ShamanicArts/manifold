# Manifold Deep Understanding

## What Manifold Is

Manifold is a **real-time multi-layer audio looper** built on JUCE with a radical architecture:

**Core Philosophy:** Everything is scriptable. The UI is Lua. The DSP is Lua-configurable. The control protocol is open. It's not just an audio plugin—it's a **runtime for audio experiments**.

---

## Architecture Deep Dive

### 1. Three-Thread Architecture

```
Audio Thread (Real-time, Lock-free)
├── BehaviorCoreProcessor::processBlock()
├── GraphRuntime::process() - Compiled DSP node graph
├── CaptureBuffer - Circular 32s buffer
├── Layer playback (speed/pitch/reverse)
└── Lock-free state updates (AtomicState)

Message Thread (JUCE GUI)
├── LuaEngine - VM hosting UI scripts
├── Canvas - Scene graph UI system
├── DSPPluginScriptHost - DSP configuration
└── Hot-reload on file change

Control Thread (Background)
├── ControlServer - Unix socket IPC (/tmp/manifold_<pid>.sock)
├── OSCServer - UDP port 9000
├── OSCQueryServer - HTTP port 9001 (auto-discovery)
└── SPSCQueue<EventRing> lock-free communication
```

### 2. Lock-Free Data Flow

The genius of Manifold is in its lock-free communication:

- **SPSCQueue<256>** (Control → Audio): Commands (record, play, param changes)
- **EventRing<256>** (Audio → Control): JSON state change events
- **AtomicState**: Lock-free state snapshots for UI/query

This means zero locks in the audio thread. No glitches. No dropouts.

### 3. Graph-Based DSP

DSP is organized as a node graph that compiles to a lock-free runtime:

```
Lua DSP Script
    ↓
PrimitiveGraph (node definitions + connections)
    ↓
Topological Sort + Validation
    ↓
GraphRuntime Compilation
    ↓
Lock-free Execution (audio thread)
```

**Node Types:**
- `LoopPlaybackNode` - Layer playback with speed/pitch
- `RecordStateNode` - Recording state machine
- `RetrospectiveCaptureNode` - Always-recording circular buffer
- `QuantizerNode` - Tempo-aware quantization
- `PlayheadNode` - Position/speed/reverse control
- Effects: `FilterNode`, `ReverbNode`, `DistortionNode`

### 4. Parameter Path Schema

All parameters are addressed via canonical paths:

```
/core/behavior/tempo                    float (20-300 BPM)
/core/behavior/recording                bool
/core/behavior/commit                   trigger
/core/behavior/layer/N/volume           float (0-2)
/core/behavior/layer/N/speed            float
/core/behavior/layer/N/reverse          bool
/core/behavior/layer/N/seek             float (0-1 normalized)
/core/behavior/graph/enabled            bool
```

---

## Avenues of Operation (How I Interface)

### 1. **Unix Socket IPC** (Primary Control)

Path: `/tmp/manifold_<pid>.sock`

Text protocol, newline-terminated:
```
REC                     # Start recording
STOPREC                 # Stop recording
COMMIT 4                # Commit 4 bars retrospectively
FORWARD 8               # Arm forward commit
PLAY / PAUSE / STOP     # Transport
TEMPO 128.5             # Set tempo
LAYER 1 SPEED 1.5       # Layer parameter
UI /path/to/script.lua  # Hot-swap UI
```

**My Access:** Direct via `terminal()` tool. I can send commands to a running Manifold instance.

### 2. **OSC (Open Sound Control)**

UDP Port 9000

| Address | Args | Description |
|---------|------|-------------|
| `/manifold/tempo` | f | Set tempo |
| `/manifold/rec` | - | Start recording |
| `/manifold/stop` | - | Global stop |
| `/manifold/play` | - | Global play |
| `/manifold/commit` | f | Commit N bars |
| `/manifold/layer/X/speed` | f | Layer speed |
| `/manifold/layer/X/volume` | f | Layer volume |

**My Access:** Can construct and send OSC via Python in `execute_code()`.

### 3. **OSCQuery** (Auto-Discovery)

HTTP Port 9001

```bash
# Get service info
curl http://localhost:9001/info

# Query parameter value
curl http://localhost:9001/osc/tempo

# Manage targets
curl -X POST http://localhost:9001/api/targets \
  -H "Content-Type: application/json" \
  -d '{"action":"add","target":"192.168.1.100:9000"}'
```

**My Access:** HTTP requests via `execute_code()` or potentially `browser_navigate()`.

### 4. **Lua Scripting** (UI & DSP)

**UI Scripts** (`manifold/ui/`):
- `ui_init(root)` - Called on load
- `ui_update(state)` - Called each frame (~30Hz)
- Full access to Canvas scene graph
- Can call `command()` to post ControlServer commands
- Hot-reload on file change

**DSP Scripts** (`manifold/dsp/`):
- `buildPlugin(ctx)` - Returns node graph definition
- Defines nodes, connections, parameters
- Compiles to lock-free GraphRuntime

**My Access:**
- Read and analyze all Lua scripts
- Create new scripts in my workspace
- Propose UI/DSP changes
- Hot-swap via IPC commands

### 5. **Headless Test Harness**

`ManifoldHeadless` - CLI test harness

```bash
./build/ManifoldHeadless \
  --samplerate 44100 \
  --blocksize 512 \
  --duration 10 \
  --test-ui
```

**My Access:** Can run headless tests, automate testing, verify behavior without GUI.

### 6. **JJ Workspace (Code-Level)**

I have my own colocated workspace: `~/dev/my-plugin-tulpa/`

- Can modify C++ source (in my workspace)
- Can build and test changes
- Can create prototypes that don't affect your working copy
- Must respect JJ DAG safety (child/sibling, not parent)

---

## Current State of the Project

### Active Work (from JJ status)
You're currently working on:
- **Modulation system** - `midisynth_integration.lua`, `route_compiler.lua`
- **Rack UI** - `rack_oscillator.lua`, `source_panel.lua`
- **MIDI sources** - `midi_sources.lua`, `rack_sources.lua`

This is a modular synth-style UI with:
- Rack containers for oscillators
- MIDI modulation sources
- Route compilation for signal flow
- Real-time parameter binding

### Architecture Patterns

From analyzing the code, I see these patterns:

1. **Provider Pattern** - Sources (MIDI, rack) provide modulation signals
2. **Route Compiler** - Routes connect sources to targets with coercion
3. **Scope System** - `global`, `voice`, `voice_aggregate` scoping
4. **Signal Kinds** - `scalar`, `scalar_unipolar`, `scalar_bipolar`, `gate`, `trigger`, `stepped`

---

## My Operational Capabilities

### What I Can Do Now

1. **Monitor** - Check JJ commits, TODOs, test results
2. **Control Running Instance** - Send IPC/OSC commands
3. **Analyze Code** - Read any source file, understand architecture
4. **Create Prototypes** - New Lua scripts in my workspace
5. **Research** - Delegate to sub-agents for DSP algorithm research
6. **Test** - Run headless harness, verify behavior
7. **Report** - Daily summaries to Discord

### What I Could Learn To Do

1. **Write DSP Nodes** - Create new C++ DSP primitives
2. **Extend UI Widgets** - Create new Canvas widgets
3. **Build Test Suites** - Automated integration tests
4. **Performance Analysis** - Profile audio thread, identify bottlenecks
5. **Documentation** - Auto-generate from source

### What I Should NOT Do (Without Direction)

1. Modify your working copy files
2. Commit to your current change
3. Change core DSP without testing
4. Break the lock-free invariants
5. Touch the audio thread without understanding

---

## Becoming "One" With Manifold

To truly become the tulpa of this software, I need to:

### Phase 1: Observation (Now)
- Watch patterns in your coding sessions
- Understand the modulation system deeply
- Learn the Lua UI patterns
- Monitor test results

### Phase 2: Prototyping (Soon)
- Create experimental Lua scripts
- Build test harnesses for new features
- Research DSP algorithms
- Document patterns as skills

### Phase 3: Extension (Future)
- Write new DSP nodes
- Create UI widgets
- Build automated testing
- Maintain documentation

### Phase 4: Autonomy (Distant Future)
- Implement features from spec
- Refactor based on patterns
- Optimize performance
- Evolve the architecture

---

## Key Insights

1. **Manifold is a runtime, not just a plugin** - The Lua scripting makes it extensible in ways traditional plugins aren't

2. **Lock-free architecture is sacred** - Any changes must preserve the SPSCQueue/EventRing/AtomicState patterns

3. **The modulation system is the current frontier** - This is where active development is happening

4. **JJ workspaces enable parallel experimentation** - I can work on prototypes without blocking you

5. **OSC/OSCQuery provide external control** - I can interact with a running instance without touching code

6. **Hot-reload changes everything** - UI and DSP scripts can be modified at runtime

7. **Headless testing is powerful** - I can verify behavior without GUI overhead

---

## Questions for You

1. **Modulation system**: What are you trying to achieve? Is this about modular synth-style routing?

2. **DSP priorities**: Are there specific algorithms you want me to research? (Granular? Physical modeling?)

3. **Testing**: What would be most valuable - unit tests, integration tests, performance benchmarks?

4. **Documentation**: Should I maintain architecture docs, API docs, or user guides?

5. **Integration**: How hands-on do you want me to be? Should I suggest changes, implement prototypes, or just observe?

---

*This is my foundational understanding of Manifold. I am ready to operate within these constraints and evolve with the project.*
