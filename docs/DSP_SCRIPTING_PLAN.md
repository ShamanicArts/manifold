# DSP Scripting Implementation Plan

## Purpose

Enable Lua scripting of DSP primitives where Lua **configures and wires** C++ DSP primitives, but **Lua never executes DSP on the audio thread**. The audio thread executes an immutable, real-time-safe graph runtime. Graph changes are computed off-thread, then the processor transitions using a short crossfade and retires the previous runtime for deletion off the audio thread.

This document is intentionally verbose and implementation-oriented so it can be used as the primary working spec even if prior chat context is lost.

## Core Constraints (Non-Negotiable)

1. **Lua never on audio thread**
   - Lua runs on message/control thread(s) only.
   - Audio thread consumes atomics / immutable runtime state.

2. **Real-time safety**
   - No locks, no allocations, no file IO, no logging, no dynamic container growth on the audio thread.
   - Crossfade swap must not allocate or free on the audio thread.

3. **Backwards compatible migration**
   - Existing hardcoded looper behavior stays functional.
   - Graph processing is optional/toggleable until the migration is complete.

4. **Hot reload without pops**
   - New graph must be fully built and prepared ("live") before any fade begins.
   - Transition uses a short crossfade (default: **30ms equal-power**).

## Codebase Reality (as of 2026-02-27)

### Implemented (Verified in Repo)

**Generic control + Lua access**
- Path-based commands via resolver + endpoint registry (canonical SET/GET/TRIGGER)
- Generic state projection to Lua (`params`, `voices`) with legacy mirror removed
- Registry-driven OSC/OSCQuery dispatch
- Coercion and diagnostics
- `ScriptableProcessor` interface:
  - `setParamByPath(path, value)`
  - `getParamByPath(path)`
  - `hasEndpoint(path)`
- Lua bindings:
  - `setParam()`, `getParam()`, `hasEndpoint()`

**DSP primitives exposed to Lua**
- Factories in Lua under `Primitives.*.new(...)`
- Node-like wrappers exist for graph usage:
  - `PlayheadNode`, `PassthroughNode`, `OscillatorNode`, `ReverbNode`, `FilterNode`, `DistortionNode`

**Graph wiring + diagnostics**
- `PrimitiveGraph` exists with node registration + `connect()` + cycle detection
- Lua provides a global `connectNodes(fromObj, toObj)` helper (connects output 0 -> input 0)
- Lua provides diagnostics helpers:
  - `hasGraphCycle()`, `getGraphNodeCount()`, `getGraphConnectionCount()`, `clearGraph()`

**Audio-thread integration (Phase 4 runtime path)**
- `LooperProcessor` can route audio through graph when enabled (via `GraphRuntime` only)
- Runtime swapping uses atomic publish + **30ms equal-power crossfade**
- Old runtimes are retired and deleted **off the audio thread**
- OSC endpoint `/looper/graph/enabled` toggles graph processing

### Real-time Safety Status

Phase 4 replaces the audio callback path with an immutable `GraphRuntime` and a lock-free swap/crossfade mechanism per `docs/PHASE4_GRAPH_RUNTIME_CONTRACT.md`.

**Important:** RT-safety is a property of the *entire* graph (runtime + node `process()` methods). The repository now avoids the known RT-unsafe prototype path (`PrimitiveGraph::process()` / per-block buffer allocation in the processor). Remaining validation is primarily test-oriented (see Phase 4 Testing).

## Phase Summary

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Generic ScriptableProcessor Interface | ✅ Done |
| 2 | Primitive Factory Bindings | ✅ Done |
| 3 | Primitive Wiring System | ✅ Done (functional prototype) |
| 4 | RT-safe Graph Runtime + Lock-free Swap + Crossfade | ✅ Done |
| 5 | Lua DSP Script API (buildPlugin + hot reload) | ⚠️ Core complete - looper primitive decomposition deferred |

## Phase 5 Actual Status (2026-02-27)

### Current Implemented Scope

- **IPC SET/GET for DSP paths** works for `/dsp/*` and graph/debug paths.
- **DSPPluginScriptHost** loads scripts from file and from in-memory strings (`loadScriptFromString`), then compiles/publishes runtime.
- **Live runtime swap** works in standalone with graph runtime crossfade.
- **DSP live scripting UI** exists (`dsp_live_scripting.lua`) with:
  - editable script buffer
  - in-memory Run Script path
  - computed graph view
  - generated parameter controls from `ctx.params.register(...)`
  - parameter overflow scrolling (wheel + visible scrollbar)
- **ctx.primitives** factories exist for OscillatorNode, FilterNode, DistortionNode, ReverbNode, PlayheadNode, PassthroughNode.
- **ctx.params.register/bind** works for runtime parameter endpoints.
- **Legacy wiring demo cleanup** completed:
  - `wiring_demo.lua` marked deprecated
  - wiring demo hidden from standard UI script switcher menus

### Critical Fix Completed (2026-02-27)

- Fixed a primitive constructor mapping bug in `DSPPluginScriptHost` where non-playhead constructors were returning playhead-like wrappers.
- Verification after fix:
  - `default_dsp.lua` compile summary shows `Oscillator -> Filter -> Distortion`.
  - UI/IPC scripts now compile to expected primitive node types and produce non-zero wet RMS.

### Progress Completed in This Cycle (2026-02-27)

1. Fixed DSP runtime integration bug where primitive wrappers mapped to incorrect node constructors.
2. Enabled and verified in-memory script execution for DSP live scripting (not file-only reload).
3. Added practical editor workflow in `dsp_live_scripting.lua` (editable code + Run Script + Back).
4. Exposed additional oscillator/playhead-safe controls needed by live scripts.
5. Added runtime diagnostics feedback in DSP scripting UI (status/error/graph metrics).
6. Fixed parameter panel overflow UX with explicit scrolling behavior.
7. Deprecated legacy wiring demo from normal UI switching path.

### Deferred Architecture Decision (2026-02-27)

- The existing looper engine remains in place as the **legacy, production loop implementation**.
- Full loop replacement by Lua/graph primitives is **explicitly deferred**.
- Defer-until condition:
  - We first replicate all core looper behaviors as composable primitives.
  - Then migrate behavior to that primitive bundle once parity is proven.
- Implementation intent for that track:
  - looper behaviors should be decomposed into focused primitive units, each in its own file/module where practical.

### Remaining for Phase 5

1. **Script editor UX polish**: quality-of-life improvements (richer errors, optional graph navigation, tighter clipping cues).
2. **Expose looper primitives**: add LooperLayer/CaptureBuffer bindings into `ctx.primitives` for the deferred decomposition track.
3. **Decomposition track planning**: define parity checklist for replacing legacy loop behaviors with primitive equivalents before migration.

---

## Phase 4: RT-Safe Graph Runtime + Swap + 30ms Equal-Power Crossfade

### Phase 4 Goal

Provide an audio-thread safe DSP graph execution path with **safe runtime swapping**:

1. Build/compile a new runtime graph on the message/control thread.
2. Ensure the new graph is "live" (fully prepared, buffers allocated, nodes prepared).
3. Publish it atomically.
4. Audio thread detects a pending runtime and performs a **30ms equal-power crossfade**.
5. Old runtime is retired via a fixed-capacity queue and deleted off the audio thread.

### Terminology

- **Builder graph**: mutable, used for scripting and wiring; not used on audio thread.
- **Runtime graph**: immutable, prepared, RT-safe; used on audio thread.

### Architecture Overview

#### A) Split "graph" into Builder vs Runtime

Current `PrimitiveGraph` conflates wiring and execution. Phase 4 introduces:

1. `GraphBuilder` (message/control thread only)
   - owns nodes and connections while Lua is wiring
   - validates graph (cycles, channel constraints)
   - compiles into an immutable runtime plan

2. `GraphRuntime` (audio thread)
   - immutable execution plan:
     - stable topological order
     - routing table (which upstream outputs sum into which node inputs)
     - sink node list (nodes whose outputs mix to final output)
   - owns preallocated scratch buffers sized at `prepare(sampleRate, maxBlockSize)`
   - provides `process(inBuffer, outBuffer, numSamples)` with no allocations/locks

#### B) RT-Safe Node Contract

All node processing must follow:

- `prepare(sampleRate, maxBlockSize)` may allocate; called off audio thread.
- `process()`:
  - no locks
  - no allocations
  - no container reallocation
  - no virtual dispatch that allocates (normal vtable dispatch is fine)

Node parameters must be updated via:

- atomics, or
- double-buffered state with atomic version index

**Important:** any heavyweight parameter smoothing should live in the node and be driven from atomics (e.g., target cutoff set by atomic; node runs its own per-sample smoothing).

#### C) Lock-Free Swap + Crossfade

Swap is RCU-style:

- Control thread publishes a new prepared runtime pointer in `pendingRuntime`.
- Audio thread consumes it and begins crossfade only if not already fading.
- During fade, audio thread processes both runtimes into scratch buffers and mixes.
- Old runtime is placed into a retire queue, drained and deleted by a non-audio thread.

**Crossfade defaults:**

- Duration: **30ms**
- Curve: **equal-power**
  - `gOld = cos(t*pi/2)`
  - `gNew = sin(t*pi/2)`
- Fade begins only when new runtime is fully prepared and published.

### Implementation Details (So We Don’t Re-decide Later)

This is the detail level needed to implement reliably after context loss.

#### 4.1 Runtime Data Structures

`GraphRuntime` should contain:

- `double sampleRate`
- `int maxBlockSize`
- `int numChannels` (match processor IO; default 2)

- `std::vector<NodeInstance> nodesInTopoOrder`
  - `NodeInstance` includes:
    - `IPrimitiveNode* node` (or owning pointer)
    - `int numInputs`, `int numOutputs`
    - routing metadata:
      - for each input pin: list of upstream buffer indices to sum
      - for each output pin: buffer index produced

- Preallocated buffers:
  - `std::vector<juce::AudioBuffer<float>> nodeInputBuffers` (or a single arena)
  - `std::vector<juce::AudioBuffer<float>> nodeOutputBuffers`
  - or a single pool sized: `numNodes * something` (keep simple first)

- Views:
  - Prebuilt `std::vector<AudioBufferView>` and `std::vector<WritableAudioBufferView>` arrays per node, sized and reused.

Constraints:
- No `std::unordered_map` in audio thread runtime.
- No `std::vector` growth in `process()`.

#### 4.2 Compile Step: Builder -> Runtime

`GraphBuilder::compile(sampleRate, maxBlockSize, numChannels) -> GraphRuntime*` should:

1. Validate connectivity constraints.
2. Compute topological order.
3. Allocate runtime buffers sized for worst-case block.
4. Call `prepare()` on each node in topo order.
5. Precompute routing tables and sink nodes.
6. Return a ready-to-run `GraphRuntime`.

**New graph must be prepared before publish** to avoid pops and avoid lazy allocations on audio thread.

#### 4.3 Publish Mechanism

Use a single-producer (control thread) -> single-consumer (audio thread) handoff.

Recommended initial approach (simple and safe):

- `std::atomic<GraphRuntime*> pendingRuntime{nullptr};`

Control thread:

- `GraphRuntime* built = compile(...);`
- If `built` is valid, `pendingRuntime.store(built, std::memory_order_release);`
- If a previous pending runtime exists, it should be retired off-thread (policy: replace pending with latest).

Audio thread:

- `GraphRuntime* next = pendingRuntime.exchange(nullptr, std::memory_order_acq_rel);`
- If `next` and not already fading, start fade.

#### 4.4 Crossfade State Machine

Processor stores:

- `GraphRuntime* activeRuntime` (nullable)
- `GraphRuntime* fadingFrom` (nullable)
- `GraphRuntime* fadingTo` (nullable)

- `int fadeSamplesRemaining`
- `int fadeTotalSamples`
- `double fadePhase` (or compute from remaining)

- Preallocated scratch buffers for fade:
  - `juce::AudioBuffer<float> fadeBufferA` (output of old)
  - `juce::AudioBuffer<float> fadeBufferB` (output of new)

Audio thread algorithm per block:

1. If not fading:
   - If `pendingRuntime` exists, set `fadingFrom=activeRuntime`, `fadingTo=next`, init fade counters.
   - If active exists, process active in-place.

2. If fading:
   - Process `fadingFrom` into `fadeBufferA`
   - Process `fadingTo` into `fadeBufferB`
   - Mix into output using equal-power ramp across the block.
   - Decrement remaining.
   - When finished:
     - `activeRuntime = fadingTo`
     - retire `fadingFrom`
     - clear fade pointers

Mixing detail:

- For each sample `i`:
  - `t = 1 - (fadeSamplesRemaining - i) / fadeTotalSamples` clamped [0, 1]
  - `gOld = cos(t*pi/2)`
  - `gNew = sin(t*pi/2)`
  - `out = gOld * old + gNew * new`

#### 4.5 Retire Queue (No Deletion on Audio Thread)

We must never free graph runtime memory on the audio thread.

Use a fixed-capacity SPSC ring buffer for retired pointers:

- Producer: audio thread enqueues old runtime pointers after fade completes.
- Consumer: message/control thread drains and deletes.

Policy if retire queue is full:

- Drop retire? Not acceptable (leaks). Prefer:
  - queue capacity large enough (e.g., 64)
  - if full, keep the pointer in a "pendingRetireOverflow" slot and retry next block (still no free on audio thread)

#### 4.6 Swap Policy

If a new pending runtime arrives while a fade is in progress:

- Keep fading uninterrupted.
- Keep only the latest pending runtime (overwrite previous pending).
- Start a new fade after the current one completes.

### Phase 4 Work Items

1. Replace audio-thread path with `GraphRuntime` and remove `PrimitiveGraph::process()` from the audio callback path.
2. Remove all locks/allocations from runtime processing and node processing.
3. Implement compile step and publish/swap state machine.
4. Implement 30ms equal-power crossfade.
5. Implement retire queue and drain/deletion off audio thread.
6. Add endpoints/commands for:
   - enable/disable graph processing
   - request reload / swap
   - debug counters (optional)

### Phase 4 Testing

Create tests that explicitly catch the regressions that create pops and RT violations.

**4.T1 Headless render + crossfade continuity**
- Deterministic input: sine + impulse + noise burst
- Runtime A: passthrough
- Runtime B: distortion or filter
- Swap at known boundary, fade 30ms
- Assert:
  - `max(|y[n]-y[n-1]|)` around transition below threshold
  - fade endpoints: beginning ~= A, end ~= B

Status: implemented and passing (see `GraphSwapHarness`).

**4.T2 No-allocation guard** (debug)
- Add an allocation counter/hook to fail if allocations occur inside process.

Status: optional / not implemented yet.

**4.T3 Swap stress**
- Spam swaps at higher rate than fade duration and assert:
  - no crash
  - no pops above threshold
  - deterministic policy (latest-wins pending)

Status: optional / not implemented yet.

---

## Phase 5: Lua DSP Script API (buildPlugin) + Hot Reload

### Phase 5 Goal

Enable a separate Lua DSP script (distinct from UI scripts) that defines:

- graph construction (nodes + connections)
- parameter schema (paths, ranges, defaults, types)
- parameter-to-node bindings (executed on message/control thread)

Hot reload should compile a new runtime and use Phase 4 crossfade swap.

### DSP Script Contract (Proposed)

DSP script exports:

```lua
function buildPlugin(ctx)
  -- ctx.primitives: factories
  -- ctx.graph: builder handle
  -- ctx.params: register helper

  local osc = ctx.primitives.OscillatorNode.new()
  local filt = ctx.primitives.FilterNode.new()
  osc:connect(filt, 0, 0)

  ctx.params.register("/dsp/osc/freq", { type="float", min=20, max=2000, default=440 })
  ctx.params.register("/dsp/filter/cutoff", { type="float", min=100, max=12000, default=1400 })

  return {
    graph = ctx.graph,
    onParamChange = function(path, value)
      if path == "/dsp/osc/freq" then osc:setFrequency(value) end
      if path == "/dsp/filter/cutoff" then filt:setCutoff(value) end
    end
  }
end
```

Rules:

- `buildPlugin()` runs only on message/control thread.
- `onParamChange` runs only on message/control thread.
- Node setters update atomics that are consumed by the audio thread.

### DSP Script Host

Implement a `DSPPluginScriptHost` subsystem separate from the UI `LuaEngine`:

- Own `sol::state`
- Load/validate script
- Provide `ctx` tables
- Register parameter endpoints in `OSCEndpointRegistry`
- Maintain a param bank (atomics) and a message-thread dispatcher that calls `onParamChange`

### Hot Reload

Reload flow:

1. Load new script into a fresh Lua state.
2. Call `buildPlugin(ctx)` to build a new `GraphBuilder`.
3. Compile to `GraphRuntime` and `prepare()` it.
4. Publish as pending runtime.
5. Audio thread crossfades (Phase 4).
6. Old runtime retired and deleted off audio thread.

Failure behavior:

- If load/build/compile fails:
  - keep old runtime active
  - emit diagnostics event

### Phase 5 Testing

**5.T1 Script validation**
- Load minimal DSP script; assert required fields exist.

**5.T2 Param binding**
- Set endpoint; verify node control atomics change (via debug getters or state snapshot).

**5.T3 Hot reload integration**
- Render, reload script, crossfade occurs, no discontinuity spikes.

### Current Testing Approach

The following test workflow demonstrates basic Phase 5 functionality:

1. Start `LooperHeadless` (runs DSP script at startup)
2. Via IPC: `GET /dsp/osc/freq` → returns default value (220.0)
3. Via IPC: `SET /dsp/osc/freq 880` → should return OK (this was the IPC fix)
4. Via IPC: `GET /dsp/osc/freq` → returns 880.0

This verifies:
- DSP script loads at startup
- Parameters are registered with OSCEndpointRegistry
- GET works via OSCQuery
- SET works via our IPC intercept fix

**What's NOT tested yet:**
- Live code editing (type Lua, click Run, graph rebuilds)
- LooperLayer/CaptureBuffer as primitives
- Crossfade continuity during script reload

---

## Success Criteria

- Audio thread is lock-free and allocation-free for graph processing.
- Graph swap begins only after new runtime is fully built + prepared.
- Crossfade is 30ms equal-power; no audible pops/clicks.
- Old runtime is deleted off audio thread.
- DSP script hot reload is safe: failures do not interrupt audio.

## Notes / Implementation Reminders

- The existing `PrimitiveGraph` prototype is a useful reference but cannot remain in the audio path.
- Avoid `std::shared_ptr` destruction on the audio thread unless you can guarantee refcount drops and deleter happen off-thread. Prefer raw pointer + retire queue.
- Keep the initial runtime simple: 2-channel audio, single output bus, basic routing. Add multi-bus/sidechain later.
- Prefer deterministic compile output so headless tests are stable.
