# Phase 4 Graph Runtime Contract (Spec)

This document freezes the **minimal API + behavioral contract** required to implement Phase 4 (RT-safe graph execution + lock-free swap + 30ms crossfade) and to allow safe parallel work (engine vs scripting vs tests) without agents stepping on each other.

It is written to be sufficient even if chat context is lost.

## Goals

1. Audio thread executes graph with **no locks** and **no allocations**.
2. Graph updates are computed off-thread and applied via **atomic publish**.
3. Transition from old runtime to new runtime is a **30ms equal-power crossfade**.
4. Old runtime is **not deleted** on audio thread; it is retired and deleted off-thread.

## Non-goals (for first pass)

- Multi-bus, sidechain, MIDI graph
- Dynamic channel counts at runtime
- Sample-accurate graph topology changes mid-block
- Arbitrary fan-in/out beyond the current simple connection model

## Terminology

- **Builder graph**: mutable graph built on message/control thread.
- **Runtime graph**: immutable prepared structure used by audio thread.

## Hard RT Constraints

In the audio thread path (`processBlock` and anything it calls):

- No mutexes/locks
- No heap allocations / frees
- No `std::unordered_*`
- No `std::string` construction
- No `shared_ptr` refcount churn if avoidable

## Runtime Types

Namespace: `dsp_primitives`

### `class GraphRuntime`

**Construction / lifetime**

- `GraphRuntime` is allocated and prepared off-thread.
- `GraphRuntime` is treated as immutable after `prepare()`.

**Required API**

```cpp
namespace dsp_primitives {

class GraphRuntime {
public:
  GraphRuntime() = default;
  ~GraphRuntime() = default;

  // Called off audio thread. May allocate.
  void prepare(double sampleRate, int maxBlockSize, int numChannels);

  // Called on audio thread. Must be lock-free and allocation-free.
  // Processes `buffer` in place.
  void process(juce::AudioBuffer<float>& buffer);

  int getNumChannels() const noexcept;
  int getMaxBlockSize() const noexcept;
  double getSampleRate() const noexcept;
};

} // namespace dsp_primitives
```

**Behavioral contract**

- `process()` must not resize internal buffers; it must handle variable `buffer.getNumSamples()`.
- If `buffer.getNumSamples() > maxBlockSize`, runtime must process in chunks (internal loop) without allocating.
- `process()` must be deterministic given the same inputs + internal node state.

### Builder compilation entry point

The existing builder structure (currently `PrimitiveGraph`) must be able to compile a runtime:

```cpp
std::unique_ptr<dsp_primitives::GraphRuntime>
PrimitiveGraph::compileRuntime(double sampleRate, int maxBlockSize, int numChannels);
```

Contract:

- Runs off audio thread.
- Returns a fully prepared runtime (`prepare()` called) that is safe to publish.
- If compile fails, returns nullptr and provides a diagnostic string (optional).

## Swap / Crossfade Contract (Engine)

### Processor-facing API

`LooperProcessor` must expose a message-thread method:

```cpp
void requestGraphRuntimeSwap(std::unique_ptr<dsp_primitives::GraphRuntime> runtime);
```

Contract:

- May be called from message thread or control server thread.
- Must not block audio thread.
- Must publish the new runtime atomically.
- If a pending runtime is replaced before being consumed by audio thread, the replaced runtime must be deleted off the audio thread.

Optional helper for the UI/message thread:

```cpp
void drainRetiredGraphRuntimes();
```

### Crossfade behavior

- Fade duration: `fadeTotalSamples = int(sampleRate * 0.03)` (30ms)
- Curve: equal-power
  - `gOld = cos(t*pi/2)`
  - `gNew = sin(t*pi/2)`
- Fade begins only when `pendingRuntime` is non-null (meaning new runtime is already compiled + prepared).
- During fade, both runtimes run each block:
  - old -> scratchA
  - new -> scratchB
  - output = gOld*scratchA + gNew*scratchB
- First runtime activation is a special case:
  - if `activeRuntime == nullptr`, promote new runtime directly
  - do not start a fade from null

### Swap policy

- If another pending runtime arrives while fading:
  - do **not** interrupt the current fade
  - keep only the latest pending runtime
  - start a new fade after current fade completes

### Retirement

- When fade completes:
  - old runtime pointer is enqueued into a fixed-capacity SPSC retire queue
  - queue is drained off-thread and deletes those runtimes
- No deletion / free of graph runtimes may occur on the audio thread.

## Test Harness Contract

The test harness should be able to:

1. Create a `PrimitiveGraph` builder, wire a simple graph, compile to runtime.
2. Inject runtime into LooperProcessor via `requestGraphRuntimeSwap()`.
3. Render blocks and verify no discontinuity spike around swap.
4. Verify swap materially changes output when graph topology/node behavior changes.

## Regression Notes (Phase 4)

These invariants are mandatory and were added after a real regression where graph updates appeared to do nothing or behaved like stale routing.

1. Runtime immutability is strict.
   - `GraphRuntime::process()` must use only compiled route snapshots.
   - It must not read live builder graph connections (`getOutputConnections()`) on the audio thread.

2. Enable semantics must compile+publish.
   - Enabling graph processing is not just a boolean toggle.
   - The enable path must compile a runtime from the current builder graph and publish it.

3. First activation is not a fade.
   - Crossfade requires both old and new runtimes.
   - If there is no old runtime, activate the new runtime immediately and keep fade state clear.

No test may require real-time audio devices.
