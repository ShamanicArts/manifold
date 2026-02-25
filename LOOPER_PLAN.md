# Looper Plugin: Design Specification

## Source References

**BespokeSynth Looper System:** `/home/shamanic/dev/bespokeDAW/BespokeSynth/Source/`

| File | Purpose |
|------|---------|
| `RollingBuffer.h/cpp` | Continuous circular capture with backwards-in-time reading |
| `LooperRecorder.h/cpp` | Manages loopers, retroactive commits, free recording, tempo inference |
| `Looper.h/cpp` | Loop playback with independent playheads |
| `VideoLooper.h/cpp` | Video clip capture synced to looper commits |
| `MediaDeviceDisplay.h/cpp` | Video ring buffer capture |
| `LooperCommitEventQueue.h` | Lock-free event bridge (audio thread → UI) |

---

## Core DSP Behaviors

### Continuous Capture

A rolling buffer continuously writes incoming audio. The write position (`offsetToNow`) always points to the most recent sample. Reading is done by specifying how many samples *ago* to read from, not by absolute position.

**Bespoke Implementation (RollingBuffer.cpp:39-44):**
```cpp
float RollingBuffer::GetSample(int samplesAgo, int channel)
{
   return mBuffer.GetChannel(channel)[(Size() + mOffsetToNow[channel] - samplesAgo) % Size()];
}
```

**Key insight:** The buffer wraps automatically. Reading `samplesAgo=0` gives the most recent sample.

### Retroactive Commit

**Bespoke Implementation (Looper.cpp:1023-1067):**

When a duration is selected (e.g., "4 bars"), the system:
1. Calculates how many samples back that duration represents
2. Finds the start position relative to `offsetToNow`
3. Copies from the rolling buffer into a layer's fixed buffer with crossfade
4. The layer begins playing immediately, synced to transport

**Critical detail (Looper.cpp:421-485):** Commits are processed incrementally over multiple audio frames to avoid blocking. Uses `LOOPER_COMMIT_FADE_SAMPLES = 200` for click prevention.

### Tempo Inference (First Loop)

**Bespoke Implementation (LooperRecorder.cpp:591-655):**

Given a recorded duration and a target BPM, evaluates each possible bar count (1/16 through 16) and calculates what tempo each would imply. The bar count that produces a tempo closest to the target is selected.

```cpp
for (int i = 0; i < kNumLooperLengthOptions; ++i)
{
   float numBars = Looper::GetNumBarsFromDropdownIndex(i);
   float beats = numBars * TheTransport->GetTimeSigTop();
   float tempo = beats / minutes;
   float distance = fabsf(tempo - targetTempo);
   // track best match
}
```

### Quantization (Free Mode)

**Bespoke Implementation (LooperRecorder.cpp:979-997):**

Snaps recorded duration to nearest legal division without changing tempo.

### Transport Sync

**Bespoke Implementation (Looper.cpp:265-268):**

```cpp
int sampsPerBar = int(mLoopLength / mNumBars);
mLoopPos = int(mLoopLength * fmod(TheTransport->GetMeasureTime(time), mNumBars) / mNumBars);
```

The loop position is derived from transport time, ensuring perfect sync even after tempo changes.

---

## Recording Modes

### First Loop (Bespoke: LooperRecorder.cpp:581-655)

The user records freely without a click. On stop:
- Analyzes the duration
- Infers what tempo would make this a clean bar count
- Sets the session tempo
- Commits the loop

### Free Mode (Bespoke: LooperRecorder.cpp:979-997)

The user records freely with an existing tempo. On stop:
- Finds the nearest legal division (bar, half-bar, etc.)
- Quantizes the loop length to that division
- Does not change tempo

### Traditional

Recording start and stop are quantized to bar boundaries. **Not yet fully implemented in either codebase.**

### Retrospective (Bespoke: LooperRecorder.cpp:923-940)

Audio is always being captured. The user presses a duration button (1/16 through 16 bars) and the last that-many-bars is immediately committed to the active layer.

---

## Layer System

**Bespoke Implementation (Looper.h:167-171):**

Each layer has:
- `ChannelBuffer* mBuffer` - Fixed buffer containing the loop audio
- `float mLoopPos` - Current playback position
- `float mNumBars` - Loop length in bars
- Speed, volume, mute, pan controls

**Key method (Looper.cpp:222-419):** `Process()` handles:
1. Loop position calculation from transport
2. Granular processing (if active)
3. Four-Tet slice processing (if active)
4. Beatwheel processing (if active)
5. Pitch shifting (if speed != 1)
6. Write input (overdub)
7. Output mixing

---

## Commit Event Bridge (Audio → UI)

**Bespoke Implementation (LooperCommitEventQueue.h):**

Lock-free single-producer/single-consumer queue for communicating commits from audio thread to UI:

```cpp
struct LooperCommitEvent
{
   char mLooperName[64];
   uint32_t mCommitSerial;
   double mCommitStartMs;
   double mCommitEndMs;
   double mCommitLengthMs;
   float mNumBars;
   float mTempo;
   float mCommitMsOffset;
};
```

**Usage (Looper.cpp:1048-1064):**
- Audio thread: `commitEventQueue->QueueEvent(event)` on commit
- UI thread: `commitEventQueue->GetEventsSince()` in `Poll()`

---

## Video Loop Sync

**Bespoke Implementation (VideoLooper.cpp, MediaDeviceDisplay.cpp):**

### Architecture
1. **MediaDeviceDisplay** - Captures video frames to a ring buffer (30-300s configurable)
2. **LooperCommitEventQueue** - Broadcasts commit events to subscribers
3. **VideoLooper** - Listens for commit events, slices video ring, plays back synced

### Video Ring Buffer (MediaDeviceDisplay.cpp:216-270)
```cpp
bool SliceVideoRing(double startTimestampMs, double endTimestampMs, VideoRingSlice& outSlice)
{
   // Find frames within time window
   // Copy to output slice
   // Return actual start/end times (may differ from requested)
}
```

### Playback Sync (VideoLooper.cpp:546-574)
```cpp
int GetPlaybackFrameIndex(const ClipMetadata& clip, double songTimeMs) const
{
   const double loopLengthMs = clip.mCommitEvent.mCommitLengthMs;
   const double loopStartMs = clip.mCommitEvent.mCommitStartMs;
   double loopPhaseMs = std::fmod(songTimeMs - loopStartMs, loopLengthMs);
   // Find nearest frame to target timestamp
}
```

---

## Current Implementation Status

| Feature | Status | Priority |
|---------|--------|----------|
| Continuous capture (CaptureBuffer) | ✓ Complete | - |
| Retrospective commit (COMMIT command) | ✓ Complete | - |
| First Loop tempo inference | ✓ Complete | - |
| Free Mode quantization | ✓ Complete | - |
| Layer playback (LooperLayer) | ✓ Complete | - |
| **ControlServer (IPC)** | ✓ Complete | - |
| **CLI client (looper-cli)** | ✓ Complete | - |
| **Atomic state snapshot** | ✓ Complete | - |
| **Commit event bridge** | ✓ Complete (via ControlServer EventRing) | - |
| Layer selection and commit | ✓ Complete | - |
| Clear individual layer | ✓ Complete | - |
| Mute/unmute | ✓ Complete | - |
| Speed control | ✓ Complete | - |
| Reverse playback | ✓ Complete | - |
| Retrospective commit at various bar sizes | ✓ Complete | - |
| **Transport sync** | ⚠ Partial (only speed=1.0) | **HIGH** |
| **Crossfade at loop boundaries** | ⚠ Minimal (wrap only, no JumpBlender) | **HIGH** |
| **Global STOP/PAUSE** | ✗ Missing (STOP only affects recording) | **HIGH** |
| Traditional mode (REC/STOP workflow) | ✓ Complete | MEDIUM |
| OVERDUB command | ✓ Complete | MEDIUM |
| CLEARALL command | ✓ Complete | MEDIUM |
| LAYER X STOP (stop without clearing) | ✓ Complete | MEDIUM |
| FORWARD <bars> (arm then retro commit) | ✓ Complete | MEDIUM |
| Canvas-based UI architecture | ✓ Complete (LooperEditor node tree + LuaEngine) | - |
| Segmented waveform capture plane (click-to-commit) | ✓ Complete (Bespoke-style strips + cumulative hit regions) | - |
| Overdub mode toggle semantics | ✓ Complete (`OVERDUB` toggle + explicit `OVERDUB 0/1`) | - |
| Overdub length behavior | ✓ Complete (expand if longer, wrap/tile if shorter) | - |
| Per-layer waveform visualization in GUI | ✓ Complete | MEDIUM |
| Manual tempo controls in GUI | ✓ Complete (`TMP-` / `TMP+`) | MEDIUM |
| Manual master + layer volume controls in GUI | ✓ Complete (`VOL-`/`VOL+`, per-layer `V-`/`V+`) | MEDIUM |
| **UI widgets: sliders** | ✓ Complete (built-in + user-extendable) | **HIGH** |
| **UI widgets: dropdowns/menus** | ✓ Complete (built-in + user-extendable) | **HIGH** |
| **UI widgets: knobs** | ✓ Complete (built-in + user-extendable) | MEDIUM |
| **UI widgets: toggles** | ✓ Complete (built-in + user-extendable) | MEDIUM |
| **UI widgets: meters** | ✓ Complete (built-in + user-extendable) | MEDIUM |
| **UI widgets: segmented controls** | ✓ Complete (built-in + user-extendable) | MEDIUM |
| looper-cli UI switch command | ✓ Complete (`UISWITCH <path>`) | MEDIUM |
| File loading into layers | ✗ Missing | MEDIUM |
| Video ring buffer | ✗ Missing | LOW |
| Video sync playback | ✗ Missing | LOW |
| **GrainFreeze rewrite (primitives arch)** | ✗ Planned | MEDIUM |

**Backend Test Results (2026-02-23, latest):**
- `tools/test-looper`: 31/31 tests pass
- `tools/test-looper-comprehensive`: 58/58 tests pass
- Verified working: inject, retrospective commit (0.25/0.5/1/2/4 bars), layer selection, clear layer, clear all, mute/unmute, speed, reverse, overdub toggle, overdub expand/wrap semantics, traditional REC/STOP, LAYER STOP

---

## Implementation Plan (Backend First)

### Phase 0: Observability Infrastructure (FIRST)

#### 0.1 ControlServer
**Goal:** IPC socket server for external observation and control

**Files:**
- `primitives/control/ControlServer.h`
- `primitives/control/ControlServer.cpp`

**Implementation:**
1. Unix socket creation on `prepareToPlay()`
2. Accept thread for incoming connections
3. Command parser with JSON responses
4. Lock-free command queue (audio thread → control)
5. Lock-free event queue (audio thread → broadcast)

#### 0.2 CLI Client
**Goal:** Command-line tool for inspection and control

**Files:**
- `tools/looper-cli` (Python)

**Commands:**
- `state` - Full JSON snapshot
- `watch` - Event stream
- `commit`, `tempo`, `layer`, `rec`, `stop`, etc.

#### 0.3 Atomic State Snapshot
**Goal:** Thread-safe state for external queries

**Add to LooperProcessor:**
```cpp
struct AtomicState {
    std::atomic<float> tempo{120.0f};
    std::atomic<int> captureWritePos{0};
    std::atomic<float> captureLevel{0.0f};
    std::atomic<bool> isRecording{false};
    // Layer states...
};
```

**Benefit:** Enables real-time observation while building subsequent phases.

---

### Phase 1: Core Audio Fixes (HIGH PRIORITY)

#### 1.1 Transport Sync
**Goal:** Loop position syncs to external transport (host tempo/position)

**Changes needed:**
- Add `juce::AudioPlayHead` integration to `LooperProcessor`
- Derive `playTime` from host position, not just sample count
- Update `LooperLayer::process()` to use transport-derived position

**Reference:** Bespoke `Looper::Process()` line 265-268

#### 1.2 Crossfade at Loop Boundaries
**Goal:** Eliminate clicks when looping

**Options:**
1. **Simple:** Short crossfade at loop points (like Bespoke's `LOOPER_COMMIT_FADE_SAMPLES`)
2. **Better:** `JumpBlender` class from Bespoke (crossfades on any position jump)
3. **Best:** `SwitchAndRamp` from Bespoke (click-free source switching)

**Reference:** Bespoke `JumpBlender.h/cpp`, `SwitchAndRamp.h/cpp`

**Minimal implementation (add to LooperLayer):**
```cpp
void process(float* left, float* right, int numSamples) {
   for (int i = 0; i < numSamples; ++i) {
      int pos = playhead.getPosition();
      int nextPos = (pos + 1) % length;
      
      // Crossfade near loop boundary
      float fadeOut = 1.0f, fadeIn = 1.0f;
      const int fadeSamples = 64;
      if (pos > length - fadeSamples) {
         fadeOut = 1.0f - (length - pos) / (float)fadeSamples;
         fadeIn = (length - pos) / (float)fadeSamples;
      }
      
      float sample = buffer.getSample(pos, 0) * fadeOut + 
                     buffer.getSample(nextPos, 0) * fadeIn;
      // ...
   }
}
```

#### 1.3 Commit Event Queue
**Goal:** Broadcast commit events for video sync

**Implementation:**
```cpp
// LooperCommitEventQueue.h (new file)
struct LooperCommitEvent {
   double commitStartMs;
   double commitEndMs;
   float numBars;
   float tempo;
};

class LooperCommitEventQueue {
   std::array<LooperCommitEvent, 256> events;
   std::atomic<int> writeIndex{0};
   std::atomic<int> readIndex{0};
   // ... lock-free SPSC queue
};
```

**Test:** Unit test verifying queue operations under simulated audio thread load.

---

### Phase 2: Layer Controls (MEDIUM PRIORITY)

#### 2.1 Per-Layer Volume/Pan/Mute
- Already in `LooperLayer` (`volume` member)
- Need UI controls

#### 2.2 Speed/Reverse
- `Playhead` already has `speed` and `reversed`
- Need pitch correction option (like Bespoke's `PitchShifter`)

#### 2.3 Overdub
- `LoopBuffer::overdubFrom()` exists
- Need UI toggle

---

### Phase 3: Video Sync (LOW PRIORITY - depends on Phase 1)

#### 3.1 Video Ring Buffer
- Port `MediaDeviceDisplay::CameraState::VideoRingFrame` pattern
- Platform-specific capture (JUCE has `CameraDevice`)

#### 3.2 VideoLooper Module
- Listen to `LooperCommitEventQueue`
- Slice video ring on commit
- Sync playback to audio loop phase

---

### Phase 4: UI System + UX Rebuild (HIGH PRIORITY NOW)

#### 4.1 Single Primitive UI Architecture (Canvas-first)

**Intent:** Build the looper UI from one core primitive (`Canvas`) and compose
behavior/data on top, instead of hand-painting bespoke widgets in
`LooperEditor`.

**Principles:**
1. One base UI node type (`Canvas`) with style + children + paint hook + events
2. Behavior layering (click, toggle, value, hover, drag) attached to nodes
3. Data binding from backend state snapshot (`ControlServer` state model)
4. Command dispatch from UI interactions to existing control protocol
5. Composition over custom widget subclasses

**Target outcome:** Users/developers can assemble different UI layouts from the
same primitive model rather than rewriting editor paint logic per feature.

#### 4.2 Segmented Capture Plane (Bespoke-style reference)

**Intent:** Make the waveform/capture area itself the primary interaction
surface.

**Behavior spec:**
1. Render capture waveform as a segmented plane at legal musical divisions
   (e.g. 1/16, 1/8, 1/4, 1/2, 1, 2, 4, 8, 16 bars)
2. Each segment acts as a button: click segment = commit that segment length
3. In `traditional`/forward workflows, click can arm forward capture for that
   segment length (wait N bars, then retro commit N bars)
4. Visual overlays show active layer, commit target, playhead phase, and armed
   forward capture status

**Rationale:** This mirrors Bespoke's fast "capture plane" feel where visual
audio context and commit action are the same control.

#### 4.3 UI Feature Coverage (backend parity)

Implement clear UI affordances for already-working backend commands:
- layer select
- mute/unmute
- speed
- reverse
- stop (without clear)
- clear layer / clear all
- overdub
- mode select (`firstLoop`, `freeMode`, `traditional`, `retrospective`)
- forward arm (`FORWARD`)

#### 4.4 UI Cleanup / Refactor Plan

1. Replace manual paint hit-testing in `LooperEditor` with Canvas node tree
2. Introduce a small view-model snapshot that mirrors `STATE` fields used by UI
3. Keep command wiring one-way: UI -> command queue, state -> UI render
4. Preserve real-time safety: no blocking calls from audio thread path
5. Maintain headless + CLI test harness as source of behavioral truth

#### 4.5 Acceptance Criteria

1. GUI can trigger every command covered by `tools/test-looper-comprehensive`
2. Segmented capture plane is interactive and commits expected bar lengths
3. UI state stays consistent with backend `STATE` snapshot under rapid changes
4. No regressions in headless test suite (`31/31` + `58/58`)

---

## Observability & Control Server

### Architecture

Run the looper backend as an observable service with IPC control:

```
┌─────────────────────────────────────────────────────────────────┐
│                      DAW / Standalone Process                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    LooperProcessor                         │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │                  ControlServer                       │   │  │
│  │  │  - Unix socket: /tmp/looper_$PID.sock              │   │  │
│  │  │  - Accepts commands (audio thread safe)             │   │  │
│  │  │  - Broadcasts state changes to subscribers          │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               ▲
                               │ Unix socket (IPC)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                          CLI Client                              │
│   $ looper-cli state                                             │
│   $ looper-cli commit 2.0                                        │
│   $ looper-cli watch                                             │
│   $ looper-cli tempo 120                                         │
│   $ looper-cli layer 1 speed 0.5                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Protocol

Line-based text protocol over Unix socket:

**Commands:**

```
STATE                           → Full state snapshot as JSON
COMMIT <bars>                   → Retrospective commit N bars
FORWARD <bars>                  → Wait N bars, then retrospective commit N bars
TEMPO <bpm>                     → Set tempo
LAYER <index>                   → Select active layer
REC                             → Start recording
OVERDUB [0|1]                   → Toggle overdub mode (or set explicit off/on)
STOP                            → Stop recording
CLEAR [<layer>]                 → Clear layer (or active)
CLEARALL                        → Clear all layers
LAYER <idx> MUTE <0|1>          → Mute/unmute layer
LAYER <idx> SPEED <factor>      → Set playback speed
LAYER <idx> REVERSE <0|1>       → Set reverse playback
LAYER <idx> VOLUME <0-1>        → Set layer volume
LAYER <idx> STOP                → Stop playback without clearing
WATCH                           → Subscribe to events (persistent connection)
DIAGNOSE                        → Diagnostic snapshot with internal metrics
PING                            → Health check
```

**Responses:**

```
OK [data]                        → Command succeeded
ERROR <message>                  → Command failed
EVENT <json>                     → Async event (for WATCH connections)
```

### State Snapshot Schema

```json
{
  "tempo": 120.0,
  "samplesPerBar": 88200,
  "captureSize": 1411200,
  "captureWritePos": 45678,
  "captureLevel": 0.42,
  "isRecording": false,
  "recordMode": "firstLoop",
  "activeLayer": 0,
  "layers": [
    {
      "index": 0,
      "state": "playing",
      "length": 88200,
      "playheadPos": 44100,
      "speed": 1.0,
      "reversed": false,
      "volume": 1.0,
      "muted": false,
      "bars": 1.0
    },
    {
      "index": 1,
      "state": "empty",
      "length": 0,
      "playheadPos": 0,
      "speed": 1.0,
      "reversed": false,
      "volume": 1.0,
      "muted": false,
      "bars": 0.0
    }
  ],
  "transportBeat": 4.5,
  "commitCount": 3,
  "uptime": 45.2
}
```

### Event Stream (WATCH mode)

```json
EVENT {"type":"commit","layer":0,"bars":1.0,"tempo":120.0}
EVENT {"type":"position","beat":4.5,"sample":198450}
EVENT {"type":"tempo","bpm":120.0}
EVENT {"type":"layer_state","layer":0,"state":"playing"}
EVENT {"type":"record_start","mode":"firstLoop"}
EVENT {"type":"record_stop","duration":2.5}
```

### Implementation: ControlServer

```cpp
// primitives/control/ControlServer.h

class ControlServer {
public:
    ControlServer(LooperProcessor& owner);
    ~ControlServer();
    
    void start();  // Called from prepareToPlay
    void stop();   // Called from releaseResources
    
    // Called from audio thread - must be lock-free
    void broadcastEvent(const std::string& event);
    
private:
    void acceptThread();
    void handleClient(int clientFd);
    void processCommand(const std::string& cmd, int clientFd);
    
    LooperProcessor& owner;
    std::string socketPath;
    int serverFd = -1;
    std::atomic<bool> running{false};
    std::thread acceptThreadHandle;
    std::vector<int> clientFds;
    std::mutex clientsMutex;
    
    // Lock-free event queue (audio thread → server thread)
    static constexpr int kEventQueueSize = 256;
    std::array<std::string, kEventQueueSize> eventQueue;
    std::atomic<int> eventWriteIdx{0};
    std::atomic<int> eventReadIdx{0};
};
```

### Implementation: CLI Client

```python
#!/usr/bin/env python3
# tools/looper-cli

import socket
import sys
import json
import argparse

SOCKET_PATH_TEMPLATE = "/tmp/looper_{}.sock"

def find_socket():
    """Find looper socket by scanning /tmp"""
    import glob
    sockets = glob.glob("/tmp/looper_*.sock")
    if not sockets:
        print("No looper process found", file=sys.stderr)
        sys.exit(1)
    return sockets[0]

def send_command(sock_path, command, watch=False):
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(sock_path)
    sock.sendall((command + "\n").encode())
    
    if watch:
        # Continuous event stream
        while True:
            data = sock.recv(4096)
            if not data:
                break
            print(data.decode(), end='')
    else:
        # Single response
        response = sock.recv(65536).decode()
        print(response)
    sock.close()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="*", help="Command to send")
    parser.add_argument("--watch", "-w", action="store_true", help="Watch events")
    parser.add_argument("--socket", "-s", help="Socket path")
    args = parser.parse_args()
    
    sock_path = args.socket or find_socket()
    cmd = " ".join(args.command) if args.command else "STATE"
    
    if args.watch:
        cmd = "WATCH"
    
    send_command(sock_path, cmd, watch=args.watch)

if __name__ == "__main__":
    main()
```

### Usage Examples

```bash
# Get current state
$ looper-cli state
{"tempo":120.0,"layers":[...],"captureLevel":0.42}

# Watch real-time events
$ looper-cli watch
EVENT {"type":"position","beat":4.5}
EVENT {"type":"commit","layer":0,"bars":1.0}
...

# Commit last 2 bars
$ looper-cli commit 2.0
OK

# Set tempo
$ looper-cli tempo 120
OK

# Control layers
$ looper-cli layer 1 speed 0.5
OK
$ looper-cli layer 1 reverse 1
OK
$ looper-cli layer 1 mute 0
OK

# Recording
$ looper-cli rec
OK
$ looper-cli stop
OK

# Diagnostics
$ looper-cli diagnose
{"captureWritePos":12345,"queueDepth":0,"dropCount":0,...}
```

### Audio Thread Safety

All control server operations must be audio-thread safe:

1. **Commands → Looper:** Use lock-free SPSC queue
   - Audio thread polls queue once per block
   - Commands are serialized, executed between blocks

2. **Events → Clients:** Use lock-free MPSC queue
   - Audio thread pushes events to queue
   - Server thread drains queue, broadcasts to clients
   - If queue full, drop event (don't block audio)

3. **State queries:** Atomic snapshot
   - Looper maintains atomic snapshot updated each block
   - Server reads atomics, never locks

```cpp
// Audio thread (processBlock)
void LooperProcessor::processBlock(...) {
    // ... audio processing ...
    
    // Process pending commands (non-blocking)
    Command cmd;
    while (commandQueue.dequeue(cmd)) {
        executeCommand(cmd);
    }
    
    // Update atomic state snapshot
    atomicState.tempo = tempo;
    atomicState.playheadPos = playheadPos;
    // ...
    
    // Broadcast events if needed
    if (justCommitted) {
        controlServer.broadcastEvent(formatCommitEvent());
    }
}
```

### Build Integration

```cmake
# Control server (linked into plugin)
target_sources(Looper PRIVATE
    primitives/control/ControlServer.cpp
)

# CLI client (standalone)
add_subdirectory(tools/looper-cli)
```

---

## Testing Strategy

### Backend Unit Tests
1. **CaptureBuffer:** Read/write wraparound, samplesAgo correctness
2. **LoopBuffer:** Copy from capture, overdub, crossfade
3. **Playhead:** Position, speed, reverse, looping
4. **TempoInference:** Known durations → expected tempo/bar combos
5. **Quantizer:** Quantize to nearest legal division
6. **CommitEventQueue:** SPSC correctness under load

### Integration Tests
1. Record first loop → verify tempo inference
2. Retrospective commit → verify loop plays synced
3. Multiple layers → verify independent playback
4. Transport change → verify loops stay synced

### Manual Testing
1. DAW tempo change → loops stay in sync
2. Click-free loop boundaries
3. No audio glitches during commit

---

## Architecture Vision: Modular Plugin Framework

### Goal

The Looper is not just a single plugin — it's a reference implementation of a modular audio plugin architecture. The primitives in `primitives/` (dsp, control, ui, scripting) are designed to be reusable building blocks for multiple plugins.

**Target:**
- Multiple plugins from same base components
- Shared DSP primitives (CaptureBuffer, LoopBuffer, Playhead, etc.)
- Shared control infrastructure (ControlServer, command protocol)
- Shared UI primitives (Canvas, CanvasStyle, LuaEngine)
- Each plugin configures and composes these blocks differently

**Current plugins:**
- **Looper** - Loop station with retrospective capture, layers, transport sync
- **GrainFreeze** - Granular synthesizer (prototype, to be rewritten using this architecture)

**GrainFreeze rewrite:** The current GrainFreeze implementation was an initial JUCE prototype. It should be refactored to use the primitives architecture:
- Move granular DSP into reusable primitives
- Use ControlServer for external control
- Use Canvas/LuaEngine for UI
- Share common infrastructure with Looper

---

## Critical Issues & Gaps (2026-02-23 Assessment)

### HIGH PRIORITY

#### 1. Transport Sync is Incomplete

**Current state:** Only layers at speed `1.0` sync to host transport. Non-integer speeds will drift.

**What's needed:**
- Full phase model for all playback speeds
- Proper sample-accurate sync after tempo changes
- Consider: derive position from transport time for all speeds, not just 1.0
- Reference: Bespoke `Looper::Process()` line 265-268 uses transport time directly

**Impact:** Creative use of speed variations (0.5x, 2x, etc.) will desync from DAW transport.

#### 2. Crossfade is Minimal

**Current state:** Basic fade at wrap points only. No handling for:
- Speed changes mid-playback
- Sudden position jumps
- Click-free source switching

**What's needed:**
- Implement `JumpBlender` from Bespoke (crossfades on any position jump)
- Consider `SwitchAndRamp` for click-free source switching
- Handle crossfade on speed change, not just loop wrap

**Reference:** `BespokeSynth/Source/JumpBlender.h`, `SwitchAndRamp.h`

#### 3. STOP Does Not Pause Transport

**Current state:** `STOP` command and UI stop button only affect recording state. They do NOT:
- Pause transport
- Stop layer playback
- Have any effect on the audio engine when not recording

**What's needed:**
- Global pause/stop that halts all layer playback
- Transport-aware stop (respect DAW transport state)
- Clear semantics: does STOP mean "pause" or "stop and reset"?
- UI affordance for transport state

**Impact:** Users expect STOP to actually stop audio. Currently it's only useful during recording.

### MEDIUM PRIORITY

#### 4. UI Widget Library Incomplete

**Current state:** All controls are buttons. The minimal UI demonstrated sliders work, but we need more:

**Missing widgets:**
- **Sliders** - For continuous values (volume, speed, grain size, etc.)
- **Dropdowns/menus** - For mode selection, preset selection
- **Modals/dialogs** - For confirmations, settings
- **Popovers** - For contextual options
- **Text input** - For naming, precise value entry
- **Meters** - For visualizing levels

**Canvas already supports custom paint hooks** - need to build widget abstractions on top.

#### 5. No File Loading

**Current state:** Can't load audio files into layers. Only way to get audio is live capture.

**What's needed:**
- `LOAD <filepath> [layer]` command
- File browser UI (or drag-drop)
- Format support via JUCE AudioFormatManager

### LOW PRIORITY

#### 6. Video Sync

**Current state:** Not implemented. Planned but deprioritized.

---

## Next Steps (Prioritized)

### Phase 5: Transport & Playback Fixes (IMMEDIATE)

#### 5.1 Global Stop/Pause Behavior
- Implement `PAUSE` command that stops all layer playback
- Make `STOP` actually stop audio, not just recording
- Add transport state to atomic snapshot
- UI: play/pause button, transport indicator

#### 5.2 Complete Transport Sync
- Derive loop position from transport for all speeds
- Handle tempo changes gracefully
- Test: speed changes stay synced, tempo changes stay synced

#### 5.3 Full Crossfade System
- Port `JumpBlender` from Bespoke
- Crossfade on speed changes
- Crossfade on manual position jumps (if we add seek)

### Phase 6: UI Widget Library

#### 6.1 Slider Component
- Continuous value control
- Drag gesture handling
- Optional value display
- Style customization (color, size)

#### 6.2 Dropdown/Menu Component
- List of options
- Expandable/collapsible
- Keyboard navigation

#### 6.3 Modal/Dialog System
- Overlay that captures input
- Confirmation dialogs
- Settings panels

#### 6.4 Meters
- Level meters (peak, RMS)
- Waveform meters
- Spectrogram (future)

### Phase 7: GrainFreeze Rewrite

Migrate the granular synth to use the primitives architecture:
1. Extract granular DSP into `primitives/dsp/GranularEngine.h`
2. Add ControlServer support for external control
3. Build UI with Canvas + LuaEngine
4. Share tempo inference, quantizer with Looper (optional)

### Phase 8: File Operations

- `LOAD` command for loading audio into layers
- `SAVE` command for exporting layer content
- Drag-drop file support in UI
- Preset/state persistence

---

## Key Learnings from BespokeSynth

1. **Commits are incremental:** Bespoke spreads commit copy over multiple audio frames (Looper.cpp:417-418) to avoid blocking
2. **Position from transport:** Loop position is always derived from transport time, never accumulated
3. **Commit events are broadcast:** Any module can listen for commits (video, visualization, etc.)
4. **Crossfade is essential:** Even simple crossfade eliminates most clicks
5. **Float bar count:** `mNumBars` as float enables sub-bar loops (1/16, 1/8, etc.)

---

## Implemented: ControlServer & Observability (Phase 0)

### Overview

The ControlServer provides full runtime observability and control of the looper
via Unix domain sockets. Any external process can connect, query state, send
commands, and subscribe to a real-time event stream. The audio thread is never
blocked — all communication uses lock-free data structures.

### Files

| File | Purpose |
|------|---------|
| `primitives/control/ControlServer.h` | Header: lock-free queues, AtomicState, server class |
| `primitives/control/ControlServer.cpp` | Implementation: socket server, command parser, JSON builder |
| `tools/looper-cli` | Python CLI client for observation and control |

### Architecture

```
Audio Thread (processBlock)          Server Threads
┌────────────────────────┐          ┌────────────────────────┐
│                        │          │                        │
│  1. processControlCmds │◄──SPSC───│  parse client command  │◄── Unix socket
│     (drain cmd queue)  │  queue   │  enqueue ControlCommand│
│                        │          │                        │
│  2. audio processing   │          │                        │
│                        │          │                        │
│  3. updateAtomicState  │──atomics─▶  read AtomicState     │──▶ JSON to client
│     (write atomics)    │          │  (STATE/DIAGNOSE)      │
│                        │          │                        │
│  4. pushEvent          │──Event───▶  broadcast thread      │──▶ EVENT to watchers
│     (on commits, etc.) │  Ring    │  drains every 10ms     │
└────────────────────────┘          └────────────────────────┘
```

### Lock-Free Data Structures

**`SPSCQueue<256>`** — Single-producer single-consumer command queue
- Producer: server thread (on client command)
- Consumer: audio thread (in `processControlCommands()`)
- Struct: `ControlCommand { Type, intParam, floatParam }`

**`EventRing<256>`** — Single-producer event broadcast ring
- Producer: audio thread (on commit, tempo change, record start/stop)
- Consumer: broadcast thread (drains to watcher connections)
- Struct: `ControlEvent { char json[512], int length }`

**`AtomicState`** — Atomic snapshot updated every audio block
- All fields are `std::atomic<>`, read with `memory_order_relaxed`
- Contains: tempo, samplesPerBar, captureWritePos, captureLevel, isRecording,
  recordMode, activeLayer, masterVolume, playTime, commitCount, uptimeSeconds
- Per-layer: state, length, playheadPos, speed, reversed, volume, numBars

### Socket Protocol

Line-based text over Unix socket at `/tmp/looper_<pid>.sock`.

**Query commands (read from AtomicState, no queue):**

| Command | Response | Notes |
|---------|----------|-------|
| `STATE` | `OK {json}` | Full state snapshot |
| `PING` | `OK PONG` | Health check |
| `DIAGNOSE` | `OK {json}` | Internal metrics, connected clients |

**Control commands (enqueued to SPSC, executed next audio block):**

| Command | Example | Effect |
|---------|---------|--------|
| `COMMIT <bars>` | `COMMIT 2.0` | Retrospective commit N bars |
| `FORWARD <bars>` | `FORWARD 1.0` | Arm now, then commit N bars after N bars elapse |
| `TEMPO <bpm>` | `TEMPO 130` | Set tempo |
| `REC` | `REC` | Start recording |
| `OVERDUB [0\|1]` | `OVERDUB` / `OVERDUB 1` / `OVERDUB 0` | Toggle/set overdub mode |
| `STOP` | `STOP` | Stop recording |
| `CLEAR [layer]` | `CLEAR 1` | Clear layer (-1 or omit = active) |
| `CLEARALL` | `CLEARALL` | Clear all layers |
| `MODE <mode>` | `MODE freeMode` | Set record mode |
| `VOLUME <0-2>` | `VOLUME 0.8` | Set master volume |
| `TARGETBPM <bpm>` | `TARGETBPM 120` | Set target BPM for inference |
| `LAYER <idx>` | `LAYER 1` | Select active layer |
| `LAYER <idx> MUTE <0\|1>` | `LAYER 0 MUTE 1` | Mute/unmute |
| `LAYER <idx> SPEED <f>` | `LAYER 0 SPEED 0.5` | Set playback speed |
| `LAYER <idx> REVERSE <0\|1>` | `LAYER 0 REVERSE 1` | Set reverse |
| `LAYER <idx> VOLUME <0-2>` | `LAYER 0 VOLUME 0.7` | Set layer volume |
| `LAYER <idx> STOP` | `LAYER 0 STOP` | Stop playback, keep buffer |
| `LAYER <idx> CLEAR` | `LAYER 0 CLEAR` | Clear specific layer |

**Event stream:**

| Command | Behavior |
|---------|----------|
| `WATCH` | Subscribes connection to event broadcast |

Events are pushed as `EVENT {json}\n` lines:

```json
EVENT {"type":"commit","layer":0,"bars":2.0,"tempo":120.00}
EVENT {"type":"tempo","bpm":130.00}
EVENT {"type":"record_start","mode":"firstLoop"}
EVENT {"type":"record_stop","duration":3.2500}
```

### CLI Client Usage

```bash
# Auto-discovers socket from /tmp/looper_*.sock
./tools/looper-cli                     # show state (default)
./tools/looper-cli state               # full JSON snapshot
./tools/looper-cli ping                # health check
./tools/looper-cli diagnose            # internal metrics
./tools/looper-cli watch               # stream events (Ctrl+C to stop)
./tools/looper-cli commit 2.0          # retrospective commit 2 bars
./tools/looper-cli forward 1.0         # arm forward capture for 1 bar
./tools/looper-cli tempo 130           # set tempo
./tools/looper-cli rec                 # start recording
./tools/looper-cli overdub             # toggle overdub mode
./tools/looper-cli overdub 1           # force overdub on
./tools/looper-cli overdub 0           # force overdub off
./tools/looper-cli stop                # stop recording
./tools/looper-cli layer 1             # select layer 1
./tools/looper-cli layer 0 speed 0.5   # half-speed layer 0
./tools/looper-cli layer 0 reverse 1   # reverse layer 0
./tools/looper-cli layer 0 mute 1      # mute layer 0
./tools/looper-cli layer 0 stop        # stop layer playback, keep audio
./tools/looper-cli clear               # clear active layer
./tools/looper-cli clearall            # clear all layers
./tools/looper-cli mode freeMode       # set record mode

# Explicit socket path
./tools/looper-cli -s /tmp/looper_12345.sock state
```

### Processor Integration

In `LooperProcessor::processBlock()` (called every audio block):

1. `processControlCommands()` — drains SPSC queue, executes commands
2. Normal audio processing (capture, layer mix, output)
3. `updateAtomicState(buffer)` — writes all atomics including per-layer state and input RMS level
4. `pushEvent()` — called by `commitRetrospective()`, `startRecording()`, `stopRecording()`, `setTempo()` to broadcast events

### Audio Thread Safety

- Commands are **never executed synchronously** from the server thread. They are
  enqueued and processed at the start of the next audio block.
- State queries read only from `std::atomic<>` fields — no locks, no allocation.
- Events are written to a fixed-size ring buffer. If full, events are silently
  dropped (audio thread must never block).
- Server threads use `poll()` with timeouts, never busy-wait.
- Socket cleanup happens in `releaseResources()` and the destructor.

### Audio Injection (Simulated Mic Input)

The `INJECT` command enables autonomous testing by feeding audio files into the
CaptureBuffer as if they arrived from a microphone. This is critical for testing
the record/commit/tempo-inference pipeline without a human or physical audio input.

**Commands:**

| Command | Example | Effect |
|---------|---------|--------|
| `INJECT <filepath>` | `INJECT /tmp/test.wav` | Load WAV/AIFF/FLAC, drain into CaptureBuffer |
| `INJECTION_STATUS` | `INJECTION_STATUS` | Check progress (active, readPos, totalSamples) |

**How it works:**

1. Server thread reads the audio file using JUCE's AudioFormatManager
2. Samples are stored in an `InjectionBuffer` (shared memory)
3. `injectionActive` atomic flag is set
4. Audio thread calls `drainInjection()` each block, writing samples into
   CaptureBuffer at the audio block rate (same as real mic input)
5. When all samples are drained, `injectionActive` is cleared and an
   `injection_done` event is broadcast

**Important timing note:** During injection, real input is currently suppressed
so the capture buffer receives only injected samples. This makes autonomous tests
deterministic. After injection finishes, normal input capture resumes, so commit
promptly in manual workflows. Typical sequence:

```bash
looper-cli inject /tmp/audio.wav          # start injection
looper-cli injection_status               # poll until done
looper-cli commit 2.0                     # commit immediately
```

**Events broadcast:**

```json
EVENT {"type":"injection_start","file":"test.wav","samples":176400,"sampleRate":44100,"channels":1}
EVENT {"type":"injection_done"}
```

### Bug Fixes Applied During Implementation

1. **SIGFPE in `Playhead::getPosition()`**: `% length` with `length=0` caused
   floating point exception. Fixed by adding `if (length == 0) return 0;` guard.
2. **Stack buffer overflow in `processBlock()`**: Fixed `float layerMix[4096]`
   stack arrays (overflow if block size > 4096) by switching to `std::vector`.

---

## Implemented: Core Audio + Layer Controls (2026-02-23)

### Shipped in this pass

1. **Traditional mode now functional**
   - `REC`/`STOP` in `traditional` mode now captures and quantizes the recorded
     duration, then commits to the active layer.

2. **Forward capture built on retrospective architecture**
   - Added `FORWARD <bars>` command.
   - Behavior: arm at time `t0`, wait `N` bars, then perform retro commit of the
     last `N` bars (matching the requested model: "wait X bars then capture X bars retro").

3. **Overdub mode implemented**
   - Added `OVERDUB` as a mode toggle with explicit set support (`OVERDUB 0/1`).
   - Overdub now applies across commit workflows instead of acting as a one-shot record mode.
   - Overdub length behavior: expand loop if overdub phrase is longer; wrap/tile phrase across loop if shorter.

4. **Layer stop without clear implemented**
   - Added `LAYER <idx> STOP` command and new `stopped` layer state.
   - Stops playback and resets playhead while preserving loop audio.

5. **Clear all layers implemented**
   - Added `CLEARALL` command.

6. **Loop boundary crossfade added**
   - Added basic wrap-point crossfade in `LooperLayer::process()`.
   - Significantly reduces click risk at loop boundaries for forward and reverse playback.

7. **Transport sync integration (partial)**
   - Added host `AudioPlayHead` position/tempo read in process block.
   - When host transport is playing, layers at speed `1.0` are phase-aligned to
     host sample timeline each block.
   - This is a practical first pass and is intentionally conservative.

8. **Real-time safety improvement**
   - Moved per-block temporary mix buffers to reusable scratch vectors to avoid
     repeated allocate/free churn every callback.

### Validation

- Headless harness build + run successful.
- `tools/test-looper`: **31/31 pass**.
- `tools/test-looper-comprehensive`: **58/58 pass** (including overdub toggle + expand/wrap semantics and newly added
  command paths and traditional/forward behavior).
- GUI standalone launched and controlled live over socket; verified runtime
  behavior with `looper-cli` commands while GUI was open.

---

## Implemented: UI Interaction + Behavior Alignment (2026-02-23 latest)

### 1) Canvas-based looper editor shipped

- `LooperEditor` moved from manual paint/hit-test to a composed `Canvas` node tree.
- UI actions are routed through the same command path as CLI/server (command queue),
  preserving consistent backend behavior.

### 2) Capture plane now matches Bespoke interaction model

- Capture visualization uses fixed strip cells with disjoint age ranges (`1/16` through `16`).
- Commit selection uses cumulative right-anchored hit regions (right = now, left = older).
- Segment click routing bug (wrong z-order selecting long durations) was fixed by
  ordering overlays so shortest-duration targets are topmost where regions overlap.

### 3) Overdub behavior model finalized for current default workflow

- `OVERDUB` is a toggle mode, not a one-shot recording path.
- Toggle state is exposed in state snapshots as `overdubEnabled`.
- Overdub applies to commit workflows in all relevant modes.
- Length semantics:
  - overdub phrase longer than loop -> loop expands to phrase length,
  - overdub phrase shorter than loop -> phrase wraps/tiles across full loop.

### 4) Practical GUI controls added for live operation

- Top controls: `TMP-`/`TMP+` (manual tempo), `VOL-`/`VOL+` (master volume), plus existing mode/record/clear actions.
- Per-layer controls now include volume steps (`V-`/`V+`) in addition to speed, mute, reverse, stop, clear.
- Per-layer waveform rendering added inside layer rows with moving playhead marker.

### 5) Verification status after latest changes

- `tools/test-looper`: **31/31 pass**
- `tools/test-looper-comprehensive`: **58/58 pass**
- Includes new overdub semantics checks (toggle, expand on long overdub, preserve length on short overdub).

---

## Project Assessment (2026-02-23)

### What's Working

**Methodology** - Observability-first approach (ControlServer, headless harness, CLI) enables autonomous iteration. Tests prove behavior.

**Architecture discipline** - One-way data flow, lock-free audio thread safety, pre-allocated buffers. No state drift between GUI and backend.

**Honest documentation** - `CLAUDE_THOUGHTS_LOOPER.md` tracks mistakes openly. Self-awareness speeds debugging.

**Canvas + Lua pivot** - UI now scriptable with hot-reload. Separates product from framework, enables fast iteration without recompiling.

### What Needs Work

**Transport sync** - Only speed-1.0 layers sync. Non-integer speeds drift. Need full phase model.

**Crossfade** - Minimal wrap-point fade only. Need JumpBlender for speed changes and jumps.

**STOP behavior** - Doesn't actually stop audio. Only affects recording state. Users expect pause/stop.

**UI widgets** - All controls are buttons. Need sliders, dropdowns, modals, meters.

### Immediate Priorities

1. **Fix STOP** - Make it actually stop/pause audio
2. **Complete transport sync** - All speeds, tempo changes
3. **Add sliders** - First non-button widget
4. **JumpBlender** - Full crossfade system

### Long-term Direction

The primitives architecture is designed for **multiple plugins** from shared building blocks:
- Looper is the reference implementation
- GrainFreeze should be rewritten to use the same primitives
- Future plugins can reuse DSP, control, and UI infrastructure

---

## Implemented: Transport Controls - STOP/PAUSE/PLAY (2026-02-24)

### Problem Statement

The STOP button was broken - it sent `StopRecording` instead of stopping layer playback. Users expected it to halt all audio, not just recording. Additionally, there was no PAUSE functionality - only STOP (which clears recording state) but no way to pause and resume from the same position.

### What Was Wrong

1. **STOP command was incorrect** - The UI's STOP button sent a command that only affected recording state, not layer playback. When not recording, pressing STOP did nothing audible.

2. **Paused state was missing** - The backend had no concept of "paused" - only playing, stopped, empty, recording. No way to halt playback at current position and resume later.

3. **UI didn't expose play state** - The UI checked for `current_state.isPlaying` which doesn't exist in the state schema. Play state must be derived from the layers array.

4. **Command routing confusion** - UI commands go through LuaEngine.cpp, not directly to ControlServer. The mapping between UI commands and backend commands wasn't complete.

### Implementation

**1. Backend changes:**

- Added `GlobalStop`, `GlobalPlay`, `GlobalPause`, `LayerPlay`, `LayerPause` command types to ControlServer.h
- Modified ControlServer.cpp: STOP command now maps to GlobalStop (stops all layers), added STOPREC for stopping recording
- Added `Paused` state to LooperLayer.h with `pause()` and modified `play()` methods
- Added `paused` to `layerStateToString` in ControlServer.cpp
- Updated LuaEngine.cpp to map PLAY → GlobalPlay, PAUSE → GlobalPause, STOP → GlobalStop, STOPREC → StopRecording

**2. LooperLayer changes (LooperLayer.h):**
- Added `Paused` enum value to LayerState
- Added `pause()` method that stops playhead but preserves buffer content
- Modified `play()` to handle transition from Paused state (resume from current position)

**3. LooperProcessor changes (LooperProcessor.cpp):**
- Added command handlers for GlobalPlay, GlobalPause, LayerPlay, LayerPause
- GlobalPlay: starts all non-empty, non-recording layers
- GlobalPause: pauses all playing layers
- LayerPlay/LayerPause: per-layer control

**4. LuaEngine changes (LuaEngine.cpp):**
- Added "paused" case to state mapping
- Added PLAY → GlobalPlay, PAUSE → GlobalPause, STOP → GlobalStop command mappings
- Added STOPREC → StopRecording mapping

**5. UI changes (looper_ui.lua):**
- Added global PLAY/PAUSE button
- Added per-layer PLAY button that toggles to PAUSE when playing
- Added "paused" state display (text + color)
- Playhead now visible when paused

**6. Test fix (tools/test-looper):**
- Changed STOP to STOPREC in tests since STOP now means GlobalStop

### Key Learnings

1. **UI command routing** - The Lua UI doesn't send commands directly to ControlServer. Commands go through LuaEngine.cpp which maps string commands to ControlCommand types. This is a two-layer system.

2. **State checking** - UI can't check `isPlaying` directly. Must check `layers[i].state == "playing"`.

3. **JUCE pitfalls** - Remembered from AGENTS.md: `resized()` is called before constructor completes, component visibility requires `addAndMakeVisible()`.

4. **tmux workflow** - When GUI is running, must Ctrl+C to kill it before rebuilding. Use `capture-pane` to verify command execution.

### Test Results

- `tools/test-looper`: 31/31 pass
- `tools/test-looper-comprehensive`: 58/58 pass
- CLI tests verify: GlobalStop stops all layers, Play/Pause toggle correctly

### Remaining Issues

- STOP now resets playhead to 0? Need to verify this behavior is correct (STOP should stop and reset, PAUSE should pause in place)
- Per-layer PLAY button needs visual toggle state (shows PLAY when stopped, PAUSE when playing)

---

## Implemented: OpenGL Support for Hardware-Accelerated Rendering (2026-02-24)

### Overview

The Canvas widget now supports hardware-accelerated OpenGL rendering for 3D graphics, shader effects, and high-performance visualizations. This enables GPU-accelerated UI elements alongside the existing 2D Canvas rendering.

### Files Added/Modified

| File | Purpose |
|------|---------|
| `primitives/ui/Canvas.h` | Extended Canvas to inherit from OpenGLRenderer, added OpenGL context management |
| `primitives/ui/Canvas.cpp` | Implementation of OpenGL lifecycle (create, render, destroy, auto-cleanup) |
| `primitives/scripting/LuaEngine.cpp` | Added Lua bindings for OpenGL functions and constants |
| `looper/ui/looper_ui_experimental.lua` | Example UI with rotating 3D cube demonstrating OpenGL integration |
| `CMakeLists.txt` | Added `juce::juce_opengl` to link libraries |

### Architecture

**Canvas OpenGL Integration:**
- Canvas inherits from both `juce::Component` and `juce::OpenGLRenderer`
- OpenGL mode is opt-in via `setOpenGLEnabled(bool)`
- When enabled, Canvas creates an `OpenGLContext` and attaches it to itself
- Context auto-creates when component becomes visible and has size
- Context auto-destroys via multiple safety mechanisms

**Automatic Cleanup (Framework handles this - users don't need to):**
1. Canvas destructor - always disables OpenGL
2. `removeChild()` - disables OpenGL before detaching
3. `parentHierarchyChanged()` - detects loss of parent, disables OpenGL
4. `clearChildren()` - recursively disables OpenGL on all descendants

**Lua API:**

```lua
-- Enable OpenGL on a canvas
local glCanvas = parent:addChild("myGLCanvas")
glCanvas:setOpenGLEnabled(true)
glCanvas:setOnGLRender(function(canvas)
    gl.viewport(0, 0, canvas:getWidth(), canvas:getHeight())
    gl.clearColor(0.1, 0.1, 0.2, 1.0)
    gl.clear(GL.COLOR_BUFFER_BIT)
    
    gl.rotate(animTime * 60, 0, 0, 1)
    gl.begin(GL.TRIANGLES)
    gl.color3(1, 0, 0)
    gl.vertex2(0, 0.8)
    gl.color3(0, 1, 0)
    gl.vertex2(-0.7, -0.6)
    gl.color3(0, 0, 1)
    gl.vertex2(0.7, -0.6)
    gl["end"]()
end)
```

**Available Functions:**
- `gl.clear`, `gl.clearColor`, `gl.viewport`
- `gl.enable`, `gl.disable`, `gl.blendFunc`, `gl.depthFunc`
- `gl.matrixMode`, `gl.loadIdentity`, `gl.pushMatrix`, `gl.popMatrix`
- `gl.translate`, `gl.rotate`, `gl.scale`
- `gl.begin`, `gl["end"]`, `gl.vertex2`, `gl.vertex3`, `gl.color3`, `gl.color4`
- `gl.texCoord2`, `gl.normal3`

**Constants:** Available in `GL.*` table (e.g., `GL.COLOR_BUFFER_BIT`, `GL.TRIANGLES`, `GL.DEPTH_TEST`)

**Note:** Use `gl["end"]` instead of `gl.end` (Lua reserved keyword).

### Example: looper_ui_experimental.lua

The experimental UI includes a fifth panel demonstrating OpenGL with a rotating wireframe cube:
- Cyan front face, magenta back face
- Yellow connecting edges  
- Colorful side faces (orange, blue, green, pink)
- Smooth rotation animation (30°/sec X axis, 45°/sec Y axis)
- Runs alongside 2D Canvas elements (particles, matrix rain, XY pad, EQ visualizer)

### Implementation Details

**C++ Side:**
- Canvas manages `std::unique_ptr<juce::OpenGLContext>` lifecycle
- Implements `juce::OpenGLRenderer` callbacks: `newOpenGLContextCreated()`, `renderOpenGL()`, `openGLContextClosing()`
- Auto-creates context in `visibilityChanged()` and `resized()` when conditions met
- Uses raw GL function calls (legacy immediate mode for simplicity)

**Lua Bindings:**
- Added `setOpenGLEnabled()`, `isOpenGLEnabled()` to Canvas userdata
- Added `setOnGLRender()`, `setOnGLContextCreated()`, `setOnGLContextClosing()` callbacks
- Exposed GL functions via `gl` table in Lua global namespace
- Exposed GL constants via `GL` table
- Used `juce::gl` namespace to avoid GL symbol conflicts

### Build Changes

Added to `CMakeLists.txt`:
```cmake
target_link_libraries(Looper
    PRIVATE
        ...
        juce::juce_opengl  # NEW
        ...
)
```

Also added `Canvas.cpp` to target sources (was header-only before).

### Testing

- OpenGL cube renders correctly in experimental UI
- UI switching works - OpenGL contexts clean up automatically when switching back to standard UI
- No crashes or memory leaks during rapid UI switching
- 2D and 3D rendering coexist in same UI without interference

### Key Technical Decisions

1. **Legacy OpenGL (immediate mode):** Used `glBegin`/`glEnd` style for simplicity in Lua bindings. Modern shader-based approach would require more complex setup.

2. **Auto-cleanup via multiple mechanisms:** Rather than requiring users to manually disable OpenGL, the framework detects removal/destruction through multiple lifecycle hooks and cleans up automatically.

3. **Separate `gl` and `GL` tables:** Functions in `gl.*`, constants in `GL.*` for clarity and to match common OpenGL conventions.

4. **Defer context creation:** Context is only created when component is showing AND has valid size, preventing initialization errors.

---

## Addendum: Full OpenGL Pipeline + Stability Fix (2026-02-24, later)

### Scope Completed

OpenGL support is now expanded from immediate-mode demo support to a full programmable-pipeline API surface suitable for real UI composition work:

- 2D + 3D mixed UI rendering support through Canvas + OpenGL callbacks
- Shader/program lifecycle support (compile, link, logs, use)
- Vertex/index buffer workflows (VBO/IBO/VAO)
- Uniforms including matrix upload
- Texture upload/bind/sampling
- Framebuffer/renderbuffer flows for post-processing
- Draw arrays/elements + common state controls

### API Surface Added (Lua `gl` table)

**Shader/Program**
- `createShader`, `shaderSource`, `compileShader`, `getShaderCompileStatus`, `getShaderInfoLog`, `deleteShader`
- `createProgram`, `attachShader`, `detachShader`, `linkProgram`, `getProgramLinkStatus`, `getProgramInfoLog`, `useProgram`, `deleteProgram`
- `getAttribLocation`, `getUniformLocation`, `uniform1f/2f/3f/4f`, `uniform1i`, `uniformMatrix4`

**Buffers / Vertex Input**
- `createBuffer`, `deleteBuffer`, `bindBuffer`
- `bufferDataFloat`, `bufferSubDataFloat`, `bufferDataUInt16`
- `createVertexArray`, `bindVertexArray`, `deleteVertexArray`
- `enableVertexAttribArray`, `disableVertexAttribArray`, `vertexAttribPointer`
- `drawArrays`, `drawElements`

**Textures / FBO / Post-FX**
- `createTexture`, `deleteTexture`, `activeTexture`, `bindTexture`, `texParameteri`
- `texImage2DRGBA`, `texSubImage2DRGBA`, `generateMipmap`
- `createFramebuffer`, `deleteFramebuffer`, `bindFramebuffer`, `framebufferTexture2D`, `checkFramebufferStatus`, `drawBuffers`
- `createRenderbuffer`, `deleteRenderbuffer`, `bindRenderbuffer`, `renderbufferStorage`, `framebufferRenderbuffer`
- `blitFramebuffer`

**State/Utility**
- `clearColor`, `clear`, `viewport`, `enable`, `disable`, `blendFunc`, `blendEquation`, `depthFunc`, `depthMask`, `clearDepth`, `scissor`, `cullFace`, `lineWidth`, `getError`

### Experimental UI Demonstration

`looper_ui_experimental.lua` now demonstrates a real 2-pass GPU pipeline:

1. **Pass 1 (offscreen scene):** procedural shader renders into FBO color texture
2. **Pass 2 (screen pass):** post-process shader samples FBO texture and applies screen effects

The panel now exercises retained GPU resources and context lifecycle:
- `setOnGLContextCreated` -> allocates shaders/buffers/FBO resources
- `setOnGLRender` -> executes scene + post FX passes
- `setOnGLContextClosing` -> releases all GL resources

### Build/Validation Notes

- Build was executed via tmux CLI flow and completed successfully for:
   - `Looper_Standalone`
   - `Looper_VST3`
   - `LooperHeadless`
- Lua scripts were copied to `build/Looper_artefacts/Release/Standalone/` for runtime parity.

### Critical Stability Fix Applied

After enabling the richer GL path, entering experimental UI could crash with `SIGSEGV`.

**Root cause:** Lua VM access from multiple threads:
- JUCE message thread (`notifyUpdate`, hot-reload, script switching)
- JUCE OpenGL render thread (`onGLRender`, `onGLContextCreated`, `onGLContextClosing`)

Lua state is not thread-safe by default. Concurrent access caused memory corruption/segfault.

**Fix:** added serialized Lua access in `LuaEngine` using `std::recursive_mutex` across all Lua state/function access paths (UI callbacks, GL callbacks, script load/switch/reload, resized/update/state push).

### Current Status (OpenGL)

- OpenGL UI framework support: **feature-complete for 2D/3D mixed UI + post-processing workflows**
- Experimental UI demonstrates retained resources + screen-shader post FX
- Runtime stability issue identified and fixed via Lua access serialization
