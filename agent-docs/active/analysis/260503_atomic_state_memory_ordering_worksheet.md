# AtomicState Memory Ordering — Decomposition Worksheet

**Date:** 2026-05-03 (v1)
**Status:** DRAFT — Researched findings complete, solution space documented
**Audience:** Agents evaluating or executing AtomicState refactor work
**Reference session:** `.pi/agent/sessions/--home-shamanic-dev-my-plugin--/2026-05-03T00-00-00-000Z_insight1_atomic_state.md`
**Prior art:**
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` — Insight #1: "The Relaxed Atomics Trap"
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim01.md` — Lock-free real-time audio architecture (full dimension research)
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim05.md` — Memory management & real-time safety
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim07.md` — Ring buffers & lock-free data structures
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/manifold_sec01.md` — Architecture & Threading Model (Section 1.2)
- `agent-docs/260501_binding_god_functions_decomposition_worksheet.md` — Prior worksheet methodology (harness-first approach)

---

## 1. Executive Summary

Manifold's cross-thread state synchronization uses two distinct patterns with different correctness properties:

1. **SPSC queues** (`SPSCQueue`, `EventRing`, `MidiRingBuffer`, `AudioCaptureRing`, `SPSCQueuePtr`) — use correct acquire-release memory ordering for cross-thread index synchronization. These are architecturally sound.

2. **`AtomicState`** — a struct containing 20 individual atomic fields in `ControlServer.h`, plus an additional 8 atomic fields per layer in `AtomicLayerState[MAX_LAYERS]`. All reads and writes use `std::memory_order_relaxed`. This is the concern.

The research (Kimi Insight #1, High confidence, derived from Dim01/Dim05/Dim07) identifies three compounding hazards:

- **False sharing**: 20+ densely-packed atomic fields on the same cache line cause cache-line bouncing when different cores write different fields
- **Implicit ordering dependencies**: If one relaxed field guards another (e.g., `isRecording` guarding `captureWritePos`), there is no happens-before guarantee between them
- **Cognitive burden**: No single developer can prove correctness of 20+ interrelated relaxed atomics as the codebase evolves

The SPSC queues themselves are also affected by the false-sharing risk — none of the five queue implementations explicitly pad their atomic read/write indices to cache-line boundaries.

Additionally, three separate subsystems implement deferred destruction (retirement queues) with different queue types, consumer threads, and safety guarantees — an inconsistency flagged as Insight #5.

### Scope

This worksheet covers:
- `AtomicState` / `AtomicLayerState` struct definitions and all cross-thread access sites
- All five SPSC queue implementations and their memory ordering discipline
- The three retirement queue subsystems (`GraphRuntime`, `DSPPluginScriptHost slots`, `pendingRuntime` replacement)
- `FrameTimings` atomics (separate concern but same relaxed-ordering pattern)

---

## 2. Researched Findings — Codebase Anatomy

### 2.1. `AtomicState` Struct Definition

**File:** `manifold/primitives/control/ControlServer.h`, lines 316–340

```cpp
struct AtomicState {
    static constexpr int MAX_LAYERS = scripting::LayerConfig::MAX_LAYERS;

    std::atomic<float> tempo{120.0f};
    std::atomic<float> targetBPM{120.0f};
    std::atomic<float> samplesPerBar{0.0f};
    std::atomic<double> sampleRate{44100.0};
    std::atomic<int> captureSize{0};
    std::atomic<int> captureWritePos{0};
    std::atomic<float> captureLevel{0.0f};
    std::atomic<bool> isRecording{false};
    std::atomic<bool> overdubEnabled{false};
    std::atomic<bool> forwardArmed{false};
    std::atomic<float> forwardBars{0.0f};
    std::atomic<bool> graphEnabled{false};
    std::atomic<int> recordMode{0};
    std::atomic<int> activeLayer{0};
    std::atomic<float> masterVolume{1.0f};
    std::atomic<float> inputVolume{1.0f};
    std::atomic<bool> passthroughEnabled{true};
    std::atomic<double> playTime{0.0};
    std::atomic<int> commitCount{0};
    std::atomic<double> uptimeSeconds{0.0};

    AtomicLayerState layers[MAX_LAYERS];
};
```

**Total count:** 20 standalone atomic fields + `MAX_LAYERS` × 8 atomic fields in `AtomicLayerState`.

**Key observation:** All fields use the default `memory_order_seq_cst` in their constructor (via `{}` initialization), but **all explicit loads and stores use `memory_order_relaxed`**. The struct itself has no `alignas(64)` or other cache-line padding.

### 2.2. `AtomicLayerState` Struct Definition

**File:** `manifold/primitives/control/ControlServer.h`, lines 302–314

```cpp
struct AtomicLayerState {
    std::atomic<int> state{0};
    std::atomic<int> length{0};
    std::atomic<int> playheadPos{0};
    std::atomic<float> speed{1.0f};
    std::atomic<bool> reversed{false};
    std::atomic<float> volume{1.0f};
    std::atomic<float> numBars{0.0f};
    std::atomic<bool> muted{false};
};
```

Same pattern: no padding, all operations use relaxed ordering.

### 2.3. All AtomicState Store Sites (relaxed)

Every cross-thread store to `AtomicState` fields uses `memory_order_relaxed`:

| File | Function | Fields Written | Line(s) |
|------|----------|---------------|---------|
| `BehaviorHousekeepingSupport.h` | `initialiseAtomicState()` | ALL 20 fields + ALL layer fields | 78–103 |
| `BehaviorParamSupport.h` | `handlePathParam()` | `tempo`, `samplesPerBar`, `targetBPM`, `masterVolume`, `inputVolume`, `passthroughEnabled`, `isRecording`, `overdubEnabled`, `activeLayer`, `recordMode`, `forwardArmed`, `forwardBars`, `commitCount`, layer state/length/playheadPos/numBars | 82–255 |
| `BehaviorCoreProcessor.cpp` | `processBlock()` (audio thread) | `tempo`, `samplesPerBar`, `graphEnabled`, `captureSize`, `captureWritePos`, `playTime`, `uptimeSeconds` | 870–950 |
| `BehaviorCoreProcessor.h` | `setGraphProcessingEnabled()` | `graphEnabled` | 144 |
| `GraphRuntimeSupport.h` | Graph enable/disable | `graphEnabled` | 39, 57 |

### 2.4. All AtomicState Load Sites (relaxed)

| File | Function/Purpose | Fields Read | Line(s) |
|------|-----------------|-------------|---------|
| `BehaviorQuerySupport.h` | `getTempo()`, `getTargetBPM()`, `getMasterVolume()`, `getInputVolume()`, etc. | `tempo`, `targetBPM`, `samplesPerBar`, `masterVolume`, `inputVolume`, `passthroughEnabled`, `isRecording`, `overdubEnabled`, `activeLayer`, `forwardArmed`, `forwardBars`, `recordMode`, `commitCount` | 244–302 |
| `BehaviorCoreProcessor.cpp` | `processBlock()` — audio thread reads | `inputVolume`, `masterVolume`, layer state fields, `playTime`, `uptimeSeconds` | 870–950 |
| `BehaviorHousekeepingSupport.h` | `scheduleForwardCommitIfNeeded()` | `forwardArmed`, `forwardBars`, `samplesPerBar` | 43–78 |
| `BehaviorParamSupport.h` | Various param getters/setters | `activeLayer`, `playTime`, layer state | 82–350+ |
| `OSCQuery.cpp` | OSCQuery tree building | Various state fields | 1097 |
| `OSCServer.cpp` | OSC message handling | Various state fields | 302 |
| `ControlServer.cpp` | Recording sample rate | `sampleRate` | 1319 |

### 2.5. Implicit Ordering Dependencies (Hazard #2)

Several fields in `AtomicState` have semantic relationships that are not enforced by memory ordering:

| Guard Field | Guarded Field(s) | Scenario |
|-------------|------------------|----------|
| `isRecording` | `captureWritePos`, layer state/length | Audio thread reads `isRecording == true` but sees stale `captureWritePos` from previous recording |
| `overdubEnabled` | Layer state | Reader sees `overdubEnabled == true` but layer state not yet transitioned to overdub mode |
| `forwardArmed` | `forwardBars` | Reader sees `forwardArmed == true` but `forwardBars` is still 0 from a previous transaction |
| `activeLayer` | `layers[activeLayer]` fields | Reader loads `activeLayer` value N, then reads `layers[N]` which the writer intended for a different index |
| `graphEnabled` | graph state in `BehaviorCoreProcessor` | Reader enables graph but graph runtime hasn't been swapped yet |

**Example from source** (`BehaviorParamSupport.h`, lines 129–155):
```cpp
const int activeLayer = juce::jlimit(
    0, maxLayers - 1, state.activeLayer.load(std::memory_order_relaxed));

state.isRecording.store(recording, std::memory_order_relaxed);

if (recording) {
    state.layers[activeLayer].state.store(
        static_cast<int>(ScriptableLayerState::Recording),
        std::memory_order_relaxed);
    // ...
}
```

Here `isRecording` is intended to guard the layer state transition, but there is no happens-before between the layer state store and any subsequent reader that sees `isRecording == true`.

### 2.6. False Sharing Surface (Hazard #1)

The `AtomicState` struct dense-packs 20 sequential atomic fields. On a 64-byte cache-line architecture, this means:

- `AtomicState` itself fits in roughly 120 bytes (20 × ~6 bytes average, plus 8 per layer × MAX_LAYERS)
- The audio thread writes `playTime`, `uptimeSeconds`, `captureWritePos`, `captureSize`, `tempo` in processBlock
- The message/control threads write `masterVolume`, `inputVolume`, `isRecording`, `recordMode`, `activeLayer`, etc.
- When different cores write different fields on the same cache line, there is cache-line bouncing

None of the five SPSC queue implementations explicitly pad their `writeIdx` and `readIdx` atomics with `alignas(std::hardware_destructive_interference_size)`.

### 2.7. SPSC Queue Memory Ordering Audit

All five queue implementations acquire-release pairing **is correct** for cross-thread index synchronization. However, they share a common pattern:

| Queue | File | Producer | Consumer | Cross-thread order | Notes |
|-------|------|----------|----------|-------------------|-------|
| `SPSCQueue<256>` | `ControlServer.h:80-103` | Control Thread | Audio Thread | `store(release)` / `load(acquire)` | Correct |
| `EventRing<256>` | `ControlServer.h:126-155` | Audio Thread | Control Thread | `store(release)` / `load(acquire)` | Correct |
| `MidiRingBuffer` | `MidiRingBuffer.h` | Audio Thread | Audio Thread (same thread) | `store(release)` / `load(acquire)` | Correct, but SPSC on same thread — acquire/release are conservative but harmless |
| `AudioCaptureRing` | `ControlServer.h:288-330` | Audio Thread | Writer Thread | `store(release)` / `load(acquire)` | Correct |
| `SPSCQueuePtr<64>` | `BehaviorCoreProcessor.h:38-60` | Audio Thread | Message Thread | `store(release)` / `load(acquire)` | Correct |

**Caveats:**
- None of the queues pad `writeIdx`/`readIdx` to separate cache lines. The Disruptor pattern shows this can improve throughput by an order of magnitude under contention.
- `AudioCaptureRing` uses `std::array<float, CAPACITY>` (~4 MB) as a member. This is pre-allocated on the stack/struct. Fine for real-time, but the index atomics `writeIdx`/`readIdx` sit right next to each other in the struct layout.

### 2.8. The Retirement Queue Cascade (Insight #5)

Three separate deferred-destruction mechanisms exist:

| Mechanism | File | Queue Type | Consumer Thread | Safety Guarantee |
|-----------|------|-----------|----------------|-----------------|
| `GraphRuntime` retirement via `retireQueue` | `BehaviorCoreProcessor.h:420` | `SPSCQueuePtr<64>` (lock-free) | Message Thread (`drainRetiredGraphRuntimes()`) | Lock-free enqueue, mutex-protected drain |
| `DSPPluginScriptHost` slot retirement via `pendingSlotDestroy` | `BehaviorCoreProcessor.h:430` | `std::vector<std::unique_ptr<...>>` (not lock-free) | Message Thread (`drainPendingSlotDestroy()`) | Message-thread-only vector access |
| `pendingRuntime` stale replacement | `BehaviorCoreProcessor.cpp:2053-2064` | Immediate `delete` (no queue) | Message Thread | Safe because only read by audio thread via atomic exchange, but different policy |

Each has different capacity, different overflow behavior, and different grace-period semantics. A unified `RetirementQueue<T>` template would centralize correctness.

### 2.9. `FrameTimings` Atomics

**File:** `manifold/primitives/ui/FrameTimings.h` (referenced in `ControlServer.h`)

`FrameTimings` contains ~25 additional atomic fields (timing stages, peak tracking, counters), all read and written with `memory_order_relaxed` (visible at `ControlServer.cpp` lines 978–1015). These are single-thread-usage (message thread only for most fields) but use relaxed atomics for no clear reason other than convention.

---

## 3. Solution Space

This section describes the known solution approaches identified by the research. It does not prescribe which to use — that is a design decision for the executor.

### 3.1. SeqLock (Seqlock)

**Source research:**
- `research/manifold_dim01.md` — Timur Doumler ADC24 talk on SeqLock as alternative to double-buffering
- `research/manifold_dim05.md` — SeqLock for wait-free writes
- `research/manifold_insight.md` — Insight #1 cites Doumler's ADC24 SeqLock talk

**What it is:**
A version counter with two copies of data. The writer increments the version (making it odd), writes data, then increments again (making it even). The reader reads the version twice — if both reads match and are even, the data is consistent.

**Why it might apply:**
AtomicState's access pattern is primarily **audio thread reads, non-RT thread writes**. SeqLock is designed for this exact pattern (Doumler's ADC24 talk introduced it specifically as "wait-free thread synchronisation" for audio). The reader retries in a loop if the version is odd or changes between reads — this is wait-free on the audio thread.

**Tradeoffs:**
- Reader may spin if a write is in progress (but writes are fast — just a few float/int stores)
- Writer does more work (version counter + copy)
- Replaces N atomics with 1 version counter + data copy

### 3.2. RCU Snapshot (Read-Copy-Update)

**Source research:**
- `research/manifold_dim01.md` — Timur Doumler ADC22 talk on RCU for audio
- `research/manifold_dim05.md` — RCU for wait-free reads with deferred reclamation
- `research/manifold_sec01.md` — Manifold already uses RCU-style retirement for GraphRuntime

**What it is:**
State is an immutable snapshot struct. The writer allocates a new snapshot, copies current values, modifies, then atomically swaps a pointer. The reader loads the pointer and reads directly. Old snapshots are retired via a queue and freed after a grace period.

**Why it might apply:**
- Matches Manifold's existing retirement infrastructure (`SPSCQueuePtr`, already used for `GraphRuntime`)
- Audio thread does one atomic load (`acquire`) — that's it
- No false sharing — snapshot is read-only once live
- Zero contention — different generations are different objects

**Tradeoffs:**
- Heap allocation per snapshot (but on non-RT thread, so fine)
- More memory usage (two copies alive during swap)
- Requires grace-period management (already have this via `SPSCQueuePtr`)

### 3.3. Single Atomic Pointer to Immutable Snapshot (RCU-lite)

**Source research:**
- `research/manifold_dim01.md` — Jatin Chowdhury "Wait-Free Programming" on atomic pointer exchange
- `research/manifold_sec01.md` — Section 1.3.2 on the existing `pendingRuntime` → `activeRuntime` swap pattern

**What it is:**
The simplest refactor. Replace N atomics with `std::atomic<StateSnapshot*>`. The snapshot is an immutable struct. Writer copies, modifies, swaps. Reader reads pointer, reads through it. Old snapshot retired via existing `SPSCQueuePtr`.

**Why it might apply:**
It's the same pattern Manifold already uses for graph runtime swapping. The infrastructure (`SPSCQueuePtr<64>` with `drainRetiredGraphRuntimes`) already exists. The change is: instead of writing 20 individual atomics, construct a single snapshot struct and swap.

**Tradeoffs:**
- Most invasive to current architecture — all `atomicState.field.load(...)` sites become `snapshot->field`
- Grace period management adds complexity
- More memory allocation (but off RT thread)

### 3.4. Cache-Line Alignment Only (Minimal Fix)

**Source research:**
- `research/manifold_dim01.md` — "Placing atomic variables used by different threads to the same cache line may make application slower compared to placing them to two different cache lines"
- `research/manifold_dim07.md` — Disruptor pattern, cache-line padding for atomic indices

**What it is:**
Add `alignas(std::hardware_destructive_interference_size)` or explicit padding between groups of atomic fields that are written by different threads. No architectural change, just false-sharing mitigation.

**Why it might apply:**
Lowest risk, smallest change. Addresses Hazard #1 (false sharing) while leaving Hazards #2 and #3 (ordering, cognitive burden) unresolved.

**Tradeoffs:**
- Does not fix ordering hazards
- Does not fix cognitive burden
- But it's a clear improvement with zero architectural change

### 3.5. Unified Retirement Queue Template

**Source research:**
- `research/manifold_insight.md` — Insight #5: Retirement Queue Cascade
- `research/manifold_sec01.md` — Section 1.2.3 on inconsistent reclamation strategies

**What it is:**
Extract a `RetirementQueue<T>` template with configurable capacity, consumer thread affinity, and grace-period semantics. Replace the three current implementations (`SPSCQueuePtr`, `pendingSlotDestroy` vector, `pendingRuntime` immediate delete).

**Why it might apply:**
The inconsistency creates maintenance risk. Each subsystem has different overflow behavior, different thread-safety properties, and different documentation.

---

## 4. Files Touched

### Primary (would need modification in any AtomicState refactor)

| File | Role | Lines of Interest |
|------|------|-------------------|
| `manifold/primitives/control/ControlServer.h` | `AtomicState`, `AtomicLayerState`, all SPSC queues, `AudioCaptureRing` | 80–340 (struct defs), 288–330 (AudioCaptureRing) |
| `manifold/core/BehaviorQuerySupport.h` | All AtomicState reads | 244–302 (13 relaxed loads) |
| `manifold/core/BehaviorParamSupport.h` | All AtomicState writes (param paths) | 82–350+ (~100 relaxed stores) |
| `manifold/core/BehaviorHousekeepingSupport.h` | `initialiseAtomicState()`, `scheduleForwardCommitIfNeeded()` | 43–103 (all relaxed) |
| `manifold/core/BehaviorCoreProcessor.h` | `SPSCQueuePtr`, `pendingRuntime`, `retireQueue`, `pendingSlotDestroy`, `setGraphProcessingEnabled()` | 36–60 (SPSCQueuePtr), 144, 173, 411–430 |
| `manifold/core/BehaviorCoreProcessor.cpp` | Audio thread AtomicState updates, `processBlock()` layer state | 847–950, 1059+ |
| `manifold/core/ControlCommandSupport.h` | `applyControlCommand()` | 154 (dispatches to param support) |
| `manifold/core/GraphRuntimeSupport.h` | `graphEnabled` stores | 39, 57 |
| `manifold/primitives/midi/MidiRingBuffer.h` | MidiRingBuffer SPSC | 28–107 |

### Secondary (read AtomicState fields)

| File | Lines of Interest |
|------|-------------------|
| `manifold/primitives/control/OSCQuery.cpp` | 1097 |
| `manifold/primitives/control/OSCServer.cpp` | 302 |
| `manifold/primitives/control/ControlServer.cpp` | 1319 |
| `manifold/headless/StateProjectionHarness.cpp` | 41 |

### Retirement Queue Cascade (if unified)

| File | Lines of Interest |
|------|-------------------|
| `manifold/core/BehaviorCoreProcessor.h` | 36–60 (`SPSCQueuePtr`), 173, 411–430 |
| `manifold/core/BehaviorCoreProcessor.cpp` | 2053–2064 (`pendingRuntime`), 2232–2238, 3209–3232 (`drainRetiredGraphRuntimes`) |
| `manifold/primitives/scripting/DSPPluginScriptHost.h` | (slot retirement via `pendingSlotDestroy`) |

---

## 5. Research References

### Primary Sources (Kimi Research)

| Document | Section | Relevance |
|----------|---------|-----------|
| `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` | Insight #1 | The "Relaxed Atomics Trap" — 3 compounding hazards, confidence high |
| `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim01.md` | All | Lock-free architecture, RCU, SeqLock, SPSC patterns, Paul Lucas warning, cache-line alignment |
| `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim05.md` | All | Memory management, 3-scope rule, allocation-free constraints, deferred destruction |
| `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim07.md` | All | Ring buffer design, acquire-release semantics, false sharing, AbstractFifo |
| `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/manifold_sec01.md` | §1.2 | SPSC queue audit, retirement queue cascade, AtomicState risk surface |
| `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/manifold_sec00.md` | Executive Summary | Table of 10 insights with confidence, effort, citations |

### External Authorities (via Kimi Research)

| Authority | Source | Claim |
|-----------|--------|-------|
| Paul J. Lucas, "Advanced Thread Safety in C++" | Dim01 | "you should *never* use **relaxed** unless you can *prove* your use of it is correct" |
| Timur Doumler, ADC22 | Dim01 | RCU for audio: wait-free reads of complex data on RT thread |
| Timur Doumler, ADC24 | Dim01, Dim05 | SeqLock as alternative to double-buffering for audio-thread writes |
| Jatin Chowdhury, "Wait-Free Programming From Scratch" (2025) | Dim01 | Atomic pointer exchange, deferred deletion for parameter updates |
| Ross Bencina, "Real-time audio programming 101" (2011) | Dim01, Dim05 | Foundational: no malloc, no locks, no I/O in audio callback |
| IN-COM Data Systems | Dim01 | SPSC queue design: acquire-release, separate cache lines for indices |
| Disruptor pattern | Dim07 | Padding atomic indices to cache-line boundaries prevents false sharing |
| Dave Rowland, ADC25 | Dim07 | Lock-free queue taxonomy, benchmarking including `juce::AbstractFifo` |
| Boost.Lockfree | Dim01 | SPSC queue with release-acquire for index synchronization |

---

## 6. Test / Validation Infrastructure

### Existing

| Asset | File | What It Does |
|-------|------|-------------|
| `LuaEngineMockHarness` | `manifold/headless/LuaEngineMockHarness.cpp` | In-process Lua engine, contract golden file verification (from prior worksheet) |
| `ManifoldHeadless` | `manifold/headless/ManifoldHeadless.cpp` | Headless standalone for IPC/OSC testing |
| `StateProjectionHarness` | `manifold/headless/StateProjectionHarness.cpp` | Loads a test project, reads AtomicState |
| OSCQuery `/info` endpoint | `manifold/primitives/control/OSCQuery.cpp` | Exposes state tree via HTTP |

### Potential Validation Approaches (not prescriptive)

- AtomicState snapshot contract test: capture the full AtomicState to a JSON golden file before and after refactor, diff to prove no field goes missing
- Headless test that exercises the full param path (IPC set → AtomicState store → audio thread read → OSC broadcast)
- Cache-line alignment verification: static_assert or runtime check that key atomics are on separate cache lines
- Thread sanitizer runs on test builds to catch any missed ordering

---

## 7. Risk Register

| # | Risk | Severity | Notes |
|---|------|----------|-------|
| 1 | Changing AtomicState layout affects all cross-thread communication | High | Every load/store site must be updated. Missed sites cause subtle bugs. A contract/harness is essential. |
| 2 | SeqLock reader spin on audio thread could cause glitch under contention | Medium | Writes are fast (scalar stores), but if a write is interrupted mid-transaction, the reader spins. Need to measure worst-case. |
| 3 | RCU snapshot allocation on non-RT thread is fine, but grace-period timing could delay reclamation | Low | Existing `SPSCQueuePtr` infrastructure handles this. Capacity of 64 provides headroom. |
| 4 | Snapshot approach increases memory pressure | Low | One extra copy of ~120 bytes per snapshot. Trivial. |
| 5 | Refactor scope creep — fixing ordering AND cache-line alignment AND retirement queues in one pass increases risk | Medium | The Kimi research flags these as separate insights (#1 and #5). Consider sequencing: AtomicState ordering fix first, retirement queue unification second. |

---

## 8. Success Criteria

The AtomicState memory ordering refactor is successful when all of the following are true:

- [ ] Every `AtomicState`/`AtomicLayerState` field is read and written with at least `acquire`/`release` semantics, OR a snapshot/SeqLock pattern replaces the individual atomics entirely
- [ ] No regression in audio-thread latency (measured via `FrameTimings` before/after in headless or standalone)
- [ ] All existing IPC/OSC param paths produce identical values before and after refactor (golden file diff)
- [ ] SPSC queue `writeIdx`/`readIdx` atomics are reviewed for cache-line alignment and padded if determined necessary
- [ ] (If pursued) Retirement queue implementations are unified behind a single `RetirementQueue<T>` template

---

## 9. Change Log

| Date | Change |
|------|--------|
| 2026-05-03 | Initial worksheet created. Full codebase audit of AtomicState access sites. All SPSC queue memory ordering verified. Three retirement mechanisms catalogued. Solution space documented from Kimi research. |
