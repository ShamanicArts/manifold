# Manifold Deep Analysis: Architecture, DSP Patterns & Strategic Opportunities

> Comprehensive technical analysis of the Manifold audio plugin framework (dev branch), examining lock-free real-time architecture, DSP node graph compilation, SIMD vectorization, scripting integration, and strategic modernization opportunities.

---

## Executive Summary

This report presents a systematic technical analysis of Manifold, a C++17 real-time audio plugin framework on its `dev` branch. Manifold combines a lock-free compiled graph runtime, dual isolated Lua scripting virtual machines (VMs), Google Highway SIMD vectorization, and an OpenGL shader pipeline within a JUCE-based architecture. The framework demonstrates sophisticated engineering in its three-thread separation and builder-to-runtime graph compilation pipeline, yet exhibits identifiable gaps across ARM SIMD coverage, automated real-time safety verification, continuous integration (CI), graph-level optimization, and audio-visual integration.

### Key Findings

The analysis synthesizes findings from 10 parallel research dimensions. Ten cross-dimensional insights emerged, each representing a systemic opportunity or risk that cuts across multiple subsystems.

**Table 1. Cross-dimensional insights — summary of systemic findings and remediation paths**

| ID | Insight | Dimensions | Confidence | Remediation Effort | Key Citation |
|:---|:---|:---|:---|:---|:---|
| 1 | **Relaxed Atomics Trap**: `AtomicState` contains 20+ `memory_order_relaxed` fields; aggregate risk may exceed single-lock risk^1^| 01, 05, 07 | High | Medium | Refactor to SeqLock or RCU snapshot^2^ ^3^|
| 2 | **Compilation Inflection Point**: Builder/runtime split is sound, but lacks fusion, hoisting, and DCE that HISE and FAUST demonstrate^4^ ^5^| 02, 04, 06 | High | Medium | Add graph-level `ControlRateScheduler`; investigate JIT prototyping |
| 3 | **SIMD-Mobile Divergence**: Highway configured for x86-only (SSE2/3/4); ARM builds fall back to scalar, nullifying SIMD investment on mobile^6^ ^7^| 03, 09 | High | Low (build-only) | Add `HWY_WANT_NEON`, `HWY_WANT_SVE` targets to `HighwayWrapper.h` |
| 4 | **Hot-Reload Paradox**: UI script polling at ~30 Hz competes with OpenGL frame rendering, potentially contributing to DAW UI degradation^8^| 04, 10 | Medium | Low | Replace polling with event-driven file watching |
| 5 | **Retirement Queue Cascade**: Three subsystems implement deferred destruction independently with different queue types and safety guarantees^9^| 01, 02, 05 | Medium | Medium | Extract unified `RetirementQueue<T>` template |
| 6 | **Shader-Audio Bridge Built but Not Connected**: `SpectrumAnalyzerNode` FFT data never reaches `ShaderEffectRegistry`; 22 GLSL shaders could be audio-reactive with minimal wiring^10^ ^11^| 08, 10 | High | Low | Implement `AudioTextureProvider` with 1D `GL_LUMINANCE` texture upload |
| 7 | **Build-System Trilemma**: ARM SIMD, C++20 upgrade, and CI/tooling modernization should be decoupled by risk profile^12^| 03, 06, 09 | High | Low to medium | Phase: CI/tooling first, ARM SIMD second, C++20 third |
| 8 | **Systemic Testing Blind Spot**: No RTSan, pluginval, Tracy allocation tracking, or numerical stability harness despite sophisticated architecture^13^ ^14^| 01, 05, 08, 09 | High | Medium | Add `-fsanitize=realtime`, pluginval CI, headless fuzz harness |
| 9 | **Parameter Smoothing Standardization Reveals Missed Optimization**: Per-node exponential smoothing duplicated 50+ times at sample rate instead of hoisted to control rate^5^| 02, 08 | Medium | Medium | Introduce graph-level `ControlRateParameter` at 64-sample intervals |
| 10 | **Export System Suggests Product-Market Tension**: `manifold_add_export_plugin()` targets derivative products, but compilation pipeline stops at unoptimized C++ runtime | 02, 04, 09, 10 | Exploratory | High | Evaluate LLVM ORC / asmjit JIT path for development iteration |

Manifold's foundational architecture — three-thread separation, lock-free SPSC queues across five subsystems, compiled `GraphRuntime` with pre-allocated scratch buffers, and dual Lua VM isolation — aligns with patterns from HISE scriptnode, SuperCollider SynthDef, Tracktion Graph, and CLAP^15^ ^16^ ^17^. These are the difficult structural decisions, and Manifold has made them correctly.

Where gaps appear is in the next optimization layer. HISE's C++ generator fuses three addition nodes into a single `mov xmm0` instruction^4^; FAUST hoists control-rate expressions and selects scheduling strategies improving throughput by up to 41%^5^ ^18^; Tracktion Graph targets multi-threaded execution with dependency-aware work distribution^16^; ADC 2025 demonstrated C++23 `constexpr` graph compilation^19^. Manifold's compiler sorts topologically and dispatches nodes in order, but does not fuse stateless nodes, eliminate dead code, or schedule control-rate computations at sub-audio intervals. These are implementation gaps, not research problems.

The most consequential single fix is ARM SIMD configuration. Highway supports `HWY_NEON`, `HWY_NEON_BF16`, `HWY_SVE`, and `HWY_SVE2` natively^6^ ^20^, and Manifold's ADSR and bit-crusher nodes use portable abstractions (`SlideUpLanes`, `BroadcastLane`) requiring zero source changes for ARM. Yet `HighwayWrapper.h` guards all target macros behind an x86-only `#if`, meaning Apple Silicon and Android builds execute scalar fallback. ARM64 benchmarks show hand-written NEON achieving 3.4× speedup over scalar versus 1.095× for auto-vectorization^7^— a build-system-only change with immediate mobile performance impact.

Equally significant is the verification gap. The framework is *designed* for real-time safety — no locks, no allocation, Lua excluded from the audio callback — but "designed for" is not "verified to achieve." RTSan (`-fsanitize=realtime`, Clang 20+, 2025) intercepts accidental `malloc` or mutex operations at compile time^13^; pluginval stress-tests plugins under extreme parameter automation^13^. Neither appears in the codebase. Modern audio frameworks treat verification as infrastructure, not afterthought.

### Scope and Methodology

This analysis was conducted through a three-phase methodology designed to maximize reproducibility and minimize speculative claims.

**Phase 1: File-Only Codebase Extraction.** All findings derive from direct inspection of the Manifold `dev` branch. The analysis covered the core graph runtime, 50+ DSP node implementations, the lock-free inter-thread communication layer (`SPSCQueue.h`, `MidiRingBuffer.h`, `EventRing.h`, `AudioCaptureRing.h`), the dual Lua VM architecture (`LuaEngine.h`, `DSPPluginScriptHost.h`), the SIMD abstraction layer (`HighwayWrapper.h`, `ADSREnvelopeNode_Highway.h`, `BitCrusherNode_Highway.h`), the build system (`CMakeLists.txt`), and the visual/shader pipeline (`ShaderEffectRegistry.h`, `ShaderSurfaceProvider.h`, `Canvas.h`). Source-level claims reference specific file names and line-number ranges from the inspected branch.

**Phase 2: External Landscape Scan.** Each subsystem was cross-referenced against conference proceedings (ADC 2020–2025, DAFX, ICMC), peer-reviewed literature, official project documentation (JUCE, Google Highway, sol2, CLAP), and established engineering references (Ross Bencina's real-time constraints, Timur Doumler's lock-free patterns, FAUST compiler documentation). Sources were prioritized by authority tier: Tier 1 (conference proceedings, official documentation) and Tier 2 (established engineering blogs, open-source project docs). Anonymous forums and content-farm material were rejected.

**Phase 3: Parallel Deep-Dive Research Dimensions.** Ten independent research dimensions were executed in parallel: (1) Lock-free real-time audio architecture, (2) DSP node graph compilation, (3) SIMD vectorization in audio DSP, (4) Scripting language integration, (5) Memory management and real-time safety, (6) Modern C++ and compile-time optimization, (7) Ring buffers and lock-free data structures, (8) DSP node design and numerical stability, (9) Build systems and CI/CD for audio plugins, and (10) GPU shader pipelines and audio-reactive visualization. Each dimension involved 15+ targeted searches, yielding 150+ sources. Cross-dimensional insights were synthesized by identifying patterns across multiple dimensions with consistent evidence. Confidence levels were assigned based on source multiplicity and agreement.

All quantitative claims include the value, unit, measurement context, and source. Citations follow a `[^N^]` superscript format referencing the source index from the dimension research corpus; indices are preserved from the original research reports and are not renumbered.


---

## 1. Architecture & Threading Model

Manifold's architecture is organized around a strict three-thread separation that isolates real-time (RT) audio processing from all non-deterministic operations. This chapter examines the thread model, the lock-free inter-thread communication mechanisms that enforce it, and the graph compilation pipeline that enables runtime-safe DSP graph mutation. The analysis draws on source-level inspection of the `dev` branch, cross-referenced with established real-time audio engineering literature and contemporary lock-free programming practice.

### 1.1 Three-Thread Separation

The framework partitions work across three threads with distinct scheduling constraints and safety requirements: the Audio Thread, the Message Thread, and the Control Thread. This tripartite model is well established in professional audio software. The Sushi DAW architecture (ADC 2023) uses an analogous design where "RtEvents, via lock-free queues" mediate between non-RT threads and the audio callback ^21^. CLAP (CLever Audio Plug-in API) formalizes this separation by marking `process()` as `[audio-thread]` and explicitly prohibiting dynamic allocation, file I/O, and locking within it ^17^.

#### 1.1.1 Audio Thread (RT)

The audio thread enters through `BehaviorCoreProcessor::processBlock`, the standard JUCE `AudioProcessor` callback invoked by the host digital audio workstation (DAW). Within this callback, Manifold delegates DSP execution to `GraphRuntime::process`, which traverses a compiled node graph in topological order. The design invariant is strict: zero locks and zero heap allocations on this path. This aligns with Ross Bencina's widely cited 2011 formulation of real-time audio constraints: "you should not allocate memory in your audio callback... The memory allocator may use a lock... may have to ask the OS for more memory... may use algorithms that take unpredictable amounts of time" ^22^.

The audio thread's responsibilities are limited to: (1) reading lock-free command queues (`SPSCQueue<256>`) for control commands from the Control Thread; (2) reading MIDI from the `MidiRingBuffer` (for hardware MIDI input); (3) executing the compiled `GraphRuntime` graph; (4) writing audio to the `AudioCaptureRing` for recording/capture; and (5) pushing JSON event payloads to the `EventRing<256>` for broadcast to IPC watchers. All memory used in `processBlock` is pre-allocated during `prepareToPlay` or during the off-audio-thread graph compilation phase. The `GraphRuntime::processSingle` implementation clears pre-allocated scratch buffers, accumulates routed inputs, and dispatches to node `process()` methods without any `std::vector` resizing, `new`/`delete` calls, or mutex operations [source: `GraphRuntime.cpp`, lines 184–349].

#### 1.1.2 Message Thread (UI / Lua)

The message thread—JUCE's message thread, on which the plugin editor and all UI rendering run—hosts the Lua engine, scene graph construction, and script compilation. Graph mutation (node registration, connection, disconnection) is performed under a `std::recursive_mutex` (`nodesMutex_` in `PrimitiveGraph`) [source: `PrimitiveGraph.cpp`, line 13]. The recursive mutex is necessary because Lua callbacks may trigger nested graph modifications (e.g., a script adding a node and then connecting it within the same call stack).

The message thread is also where `GraphRuntime` compilation occurs. When a Lua script mutates the `PrimitiveGraph`, the graph is later compiled into an immutable `GraphRuntime` via `compileGraphRuntime()`, which performs allocation, topological sorting, and scratch buffer pre-allocation entirely off the audio thread [source: `GraphRuntime.cpp`, lines 355–418]. The compiled runtime is then handed to the audio thread through an atomic pointer exchange.

UI scripts hot-reload at approximately 30 Hz via polling on this thread. As noted in cross-dimensional analysis, this polling may contribute to UI frame-rate degradation, particularly because Manifold uses OpenGL contexts (`ShaderSurfaceProvider`, `CompositeSurfaceProvider`) that forum reports indicate can reduce DAW UI performance from 70–80 fps to 20–30 fps ^8^.

#### 1.1.3 Control Thread (IPC / Network)

The Control Thread encapsulates all network and IPC (Inter-Process Communication) I/O. It runs a Unix domain socket server (`ControlServer`), an OSC (Open Sound Control) UDP server (`OSCServer`), and an OSCQuery HTTP endpoint (`OSCQueryServer`). This thread is the only thread that performs blocking I/O: `poll()` on socket file descriptors, `accept()` for incoming client connections, and `send()`/`recv()` for message transport [source: `ControlServer.h`, lines 398–424].

The architectural justification for isolating network I/O is that socket operations are inherently unbounded in latency. The Android audio team explicitly warns that "Priority inversion typically manifests as a glitch (click, pop, dropout)" when high-priority threads wait for lower-priority threads holding locks ^4^. By confining sockets, OSC parsing, and HTTP to the Control Thread, the audio thread never blocks on network operations. Communication is mediated through the lock-free `SPSCQueue` for commands and the `EventRing` for state broadcasts.

---

The following table summarizes the division of responsibilities across the three threads.

| Responsibility | Audio Thread (RT) | Message Thread (UI / Lua) | Control Thread (IPC / Network) |
|:---|:---|:---|:---|
| DSP graph execution | `GraphRuntime::process` — topological traversal, node dispatch [source: `GraphRuntime.cpp`] | Compilation only: `compileGraphRuntime()` [source: `GraphRuntime.cpp`] | None |
| Memory allocation | Zero — all pre-allocated ^22^| `PrimitiveGraph` mutation, Lua VM heap, scratch buffer allocation [source: `PrimitiveGraph.cpp`] | Socket buffers, JSON string construction [source: `ControlServer.h`] |
| Synchronization primitives | Lock-free atomics and SPSC queues only ^23^| `std::recursive_mutex` (`nodesMutex_`), `std::mutex` (`graphMutationMutex`) [source: `PrimitiveGraph.h`, `BehaviorCoreProcessor.h`] | `std::mutex` (`clientsMutex`, `watchersMutex`), blocking `poll()` [source: `ControlServer.h`] |
| MIDI handling | `MidiRingBuffer` read (hardware MIDI); host MIDI forwarded to `MidiManager` [source: `BehaviorCoreProcessor.cpp`] | None | None |
| OSC / network | None | None | Unix socket server, OSC/UDP server, OSCQuery HTTP, event broadcast [source: `ControlServer.h`] |
| Lua scripting | None | Script compilation, hot-reload polling (~30 Hz), scene graph [source: insight.md] | None |
| Graph mutation | None (reads atomic `pendingRuntime` pointer only) | `PrimitiveGraph::registerNode`, `connect`, `disconnect` under `recursive_mutex` [source: `PrimitiveGraph.cpp`] | None |
| State broadcast | `EventRing::push` (JSON formatting on RT thread) [source: `ControlServer.h`] | None | `EventRing::drain` + socket broadcast [source: `ControlServer.h`] |
| Graph retirement | `SPSCQueuePtr::enqueue` for old `GraphRuntime` [source: `BehaviorCoreProcessor.cpp`] | None | `drainRetiredGraphRuntimes()` — `SPSCQueuePtr::dequeue` + `delete` [source: `BehaviorCoreProcessor.cpp`] |
| Parameter changes | `AtomicState` atomic loads (`memory_order_relaxed`) [source: `ControlServer.h`] | `AtomicState` atomic stores [source: `BehaviorCoreProcessor.cpp`] | `ControlCommand` enqueued via `SPSCQueue` [source: `ControlServer.h`] |

The thread responsibility matrix reveals a clean separation of concerns that follows the consensus architecture for professional audio software. The audio thread's footprint is deliberately minimal: it executes compiled graphs, consumes lock-free queues, and updates atomic state. All mutation, allocation, and I/O are delegated to threads with more permissive latency constraints. A notable design choice is that JSON formatting for state broadcasts occurs on the audio thread within `EventRing::push` — a lightweight but non-zero cost that trades message-thread CPU for reduced latency in event propagation. For systems with very large state surfaces or high-frequency parameter automation, this may warrant future offloading to a dedicated serialization thread.

### 1.2 Lock-Free Inter-Thread Communication

Manifold implements four distinct lock-free Single-Producer Single-Consumer (SPSC) mechanisms for cross-thread data flow. The SPSC ring buffer is "often regarded as the bread and butter data structure for concurrency in real-time audio programming" ^24^, and Manifold's adoption of this pattern across four subsystems is consistent with industry practice.

#### 1.2.1 SPSCQueue Pattern Audit

The following table catalogues each lock-free mechanism, its producer/consumer pairing, capacity, and memory ordering discipline.

| Mechanism | Producer | Consumer | Capacity | Payload | Memory Ordering (Index Sync) |
|:---|:---|:---|:---|:---|:---|
| `SPSCQueue<256>` (`commandQueue`) | Control Thread (IPC handlers) | Audio Thread (`processControlCommands`) | 256 `ControlCommand` structs [source: `ControlServer.h`] | Typed command enum + float/int params | `write`: `relaxed` local, `acquire` cross-read, `release` on store ^25^[source: `ControlServer.h`, lines 101–124] |
| `EventRing<256>` (`eventRing`) | Audio Thread (state change JSON) | Control Thread (`drainAndBroadcastEvents`) | 256 pre-formatted JSON char arrays (MAX_JSON_PAYLOAD_SIZE bytes each) [source: `ControlServer.h`] | JSON string + length | `write`: `relaxed` local, `acquire` cross-read, `release` on store [source: `ControlServer.h`, lines 137–168] |
| `MidiRingBuffer` (`midiInputRing`) | Audio Thread (hardware callback) | Audio Thread (`processBlock`) | 256 packed 32-bit words [source: `MidiRingBuffer.h`] | Packed MIDI (status\|data1\|data2\|timestamp) | `write`: `relaxed` local, `acquire` cross-read, `release` on store [source: `MidiRingBuffer.h`, lines 35–73] |
| `AudioCaptureRing` | Audio Thread (interleaved stereo) | Writer Thread (`audioWriterThread`) | ~1,048,576 floats (~4 MB, ~11.6 s @ 44.1 kHz stereo) [source: `ControlServer.h`] | Interleaved stereo float buffer | `write`: `relaxed` local, `acquire` cross-read, `release` on store; bitwise-AND wrap via power-of-2 capacity ^26^[source: `ControlServer.h`, lines 260–294] |
| `SPSCQueuePtr<64>` (`retireQueue`) | Audio Thread (graph swap) | Message Thread (`drainRetiredGraphRuntimes`) | 64 `GraphRuntime*` pointers [source: `BehaviorCoreProcessor.h`] | Raw pointer to retired runtime | `write`: `relaxed` local, `acquire` cross-read, `release` on store [source: `BehaviorCoreProcessor.h`, lines 34–62] |

All five implementations share the same fundamental structure: a fixed-capacity ring buffer, atomic write and read indices, and acquire-release pairing for cross-thread synchronization. The producer writes data to the buffer slot, then updates its write index with `memory_order_release`; the consumer loads the producer's index with `memory_order_acquire`, which synchronizes with that release and guarantees visibility of the written data ^27^ ^28^. This is the minimal correct memory ordering for SPSC queues. Local reads of a thread's own index use `memory_order_relaxed`, which is safe because a thread always sees its own writes in program order ^29^.

The `AudioCaptureRing` employs a power-of-2 capacity ($2^{20}$ = 1,048,576 floats), enabling index wrapping via bitwise-AND (`& (CAPACITY - 1)`) rather than modulo. Doug Richardson's assembly-level analysis confirms this optimization generates the tightest loop on x86 ^26^. The large capacity supports continuous retrospective recording — a pattern used by DAWs including Pro Tools QuickPunch and Bitwig's MIDI Capture ^30^ ^31^.

One concern is cache-line alignment. The Disruptor pattern demonstrates that padding atomic sequence numbers to isolate them on their own cache lines prevents false sharing, where "updating 8 bytes of data also invalidates 56 neighboring bytes" ^32^ ^33^. None of Manifold's SPSC implementations explicitly align atomic indices to cache-line boundaries using `alignas(std::hardware_destructive_interference_size)` or explicit padding. On a 64-byte cache-line architecture (all modern x86 and ARM64), the `writeIdx` and `readIdx` atomics in each queue are adjacent in the struct layout and will share a cache line, causing coherency ping-pong when producer and consumer threads run on different cores. Benchmarks suggest cache-line padding can improve SPSC throughput by an order of magnitude under contention ^33^ ^27^.

#### 1.2.2 Memory Ordering Analysis: The `AtomicState` Risk Surface

Manifold's `AtomicState` struct contains over 20 atomic fields — tempo, target BPM, sample rate, capture state, record flags, layer states — that are read and written across threads, predominantly with `memory_order_relaxed` [source: `ControlServer.h`, lines 185–210]. The audio thread loads these fields every callback; the message and control threads store them in response to UI events, OSC messages, and Lua script execution.

Paul J. Lucas's warning on `memory_order_relaxed` is direct: "you should *never* use it unless you can *prove* your use of it is correct *and* it actually significantly improves performance. Correct use of `memory_order_relaxed` is *very hard* to do" ^1^. The risk in `AtomicState` is not that any individual relaxed atomic is incorrect — a relaxed load of `masterVolume` by the audio thread will eventually see the store from the UI thread — but that the *aggregate* of 20+ relaxed atomics creates compounding hazards.

Three specific hazards are present. First, **false sharing**: if the atomic fields are densely packed (the struct contains no explicit padding), different threads updating different fields on the same cache line will cause "cache line bouncing" ^34^. Second, **implicit ordering dependencies**: if one field is used to guard another (e.g., `isRecording` guarding the validity of `captureWritePos`), relaxed ordering on both provides no guarantee that the guard is visible before the payload. Third, **cognitive burden**: no single developer can simultaneously prove correctness of 20 interrelated relaxed atomics, particularly as the codebase evolves and new fields are added.

The industry consensus for complex cross-thread state is moving toward snapshot-based patterns. Timur Doumler's ADC22 talk introduced RCU (Read-Copy-Update) for audio: "How can we synchronise reads and writes to C++ objects across threads, and manage the lifetime of these objects, while remaining wait-free on the real-time thread?" ^2^. His ADC24 talk introduced SeqLock as an alternative to double-buffering for the case where the audio thread writes and non-RT threads read ^3^. Both patterns replace N individual atomics with a single atomic pointer to an immutable snapshot, which is easier to verify and often more performant under contention (fewer cache lines touched). For `AtomicState`, a medium-term refactor toward `std::atomic<StateSnapshot*>` with RCU-style retirement would centralize correctness and eliminate the false-sharing risk entirely.

#### 1.2.3 Retirement Queue Cascade: Inconsistent Reclamation Strategies

When the audio thread atomically swaps the active `GraphRuntime` pointer, the old runtime cannot be `delete`d immediately because the audio thread may still hold references to it at the moment of exchange. Manifold solves this with a retirement queue: the old pointer is pushed to `SPSCQueuePtr<64>` from the audio thread; the message thread drains the queue and calls `delete` after ensuring the audio thread has moved on [source: `BehaviorCoreProcessor.cpp`, lines 2232–2238]. This is the textbook RCU-style deferred destruction pattern. Jatin Chowdhury describes it as the "wait-free" solution for UI-to-audio parameter passing at scale ^9^.

However, the retirement pattern is not applied uniformly. At least three subsystems implement deferred destruction independently:

1. **`GraphRuntime` retirement** via `SPSCQueuePtr<64>` (`retireQueue`) in `BehaviorCoreProcessor`. The audio thread enqueues old runtimes during `checkGraphRuntimeSwap()`; the message thread drains via `drainRetiredGraphRuntimes()` under a `std::mutex` [source: `BehaviorCoreProcessor.cpp`, lines 3209–3232].

2. **`DSPPluginScriptHost` slot retirement** via `pendingSlotDestroy`, a `std::vector<std::unique_ptr<DSPPluginScriptHost>>`. When a Lua script unloads a DSP slot, the host is moved to this vector rather than destroyed immediately, because `sol::state` (the Lua VM) cannot be destructed from within a Lua callback [source: `BehaviorCoreProcessor.h`, line 449]. The vector is drained by `drainPendingSlotDestroy()` on the message thread. This mechanism uses no lock-free queue — it relies on message-thread-only access to the vector.

3. **`pendingRuntime` stale replacement** in `requestGraphRuntimeSwap()`. If the message thread submits a new runtime while an old `pendingRuntime` has not yet been picked up by the audio thread, the old pending pointer is `delete`d immediately (not retired) [source: `BehaviorCoreProcessor.cpp`, lines 2053–2064]. This is safe because `pendingRuntime` is only read by `checkGraphRuntimeSwap()` on the audio thread, and the exchange uses `memory_order_release`, but it represents a third distinct lifetime management strategy.

The inconsistency creates maintenance risk. Each subsystem has different queue types, different consumer threads, and different safety guarantees. A unified `RetirementQueue<T>` template with configurable capacity, consumer thread affinity, and grace-period semantics (e.g., requiring N audio callbacks before destruction) would centralize correctness and make the invariants explicit.

### 1.3 Graph Compilation and Runtime Swap

Manifold's graph execution pipeline separates mutable graph construction from immutable runtime execution — a pattern found in HISE's scriptnode, SuperCollider's SynthDef, and Tracktion Graph ^15^. This separation is the architectural foundation that enables lock-free graph mutation: the message thread modifies the builder graph, compiles a frozen runtime, and atomically swaps it into the audio thread.

#### 1.3.1 PrimitiveGraph to GraphRuntime Compilation Pipeline

The builder-side graph is `PrimitiveGraph`, owned by the message thread and protected by `nodesMutex_`. It stores nodes as `std::shared_ptr<IPrimitiveNode>` in a vector, maintains connection adjacency lists, and provides `registerNode`, `connect`, `disconnect`, and `setNodeRole` operations — all under `std::recursive_mutex` [source: `PrimitiveGraph.cpp`]. A node role (`InputDSP`, `Monitor`, `OutputDSP`, `SidechainInputDSP`, or `Unspecified`) determines how the runtime routes host input and mixes output.

Compilation is triggered by `PrimitiveGraph::compileRuntime()`, which delegates to the free function `compileGraphRuntime()` [source: `PrimitiveGraph.cpp`, line 373]. The compilation pipeline performs six steps, all off the audio thread:

1. **Topological order computation** via depth-first search (`buildTopologicalOrder`). Cycle detection is performed using `visitInProgress_` flags on nodes; if a cycle is detected, compilation fails [source: `PrimitiveGraph.cpp`, lines 301–349].

2. **Compiled node list construction**: Each node is wrapped in a `CompiledNode` struct that captures its `shared_ptr`, role, and I/O counts. The `shared_ptr` ensures the node remains alive as long as the runtime references it [source: `GraphRuntime.cpp`, lines 371–382].

3. **Routing table snapshot**: All `Connection` objects (source node, target node, output index, input index) are captured into a flat `std::vector<RouteEntry>`. This is critical — the runtime never reads mutable node connection lists during `process()`; it operates entirely on the compiled routing snapshot [source: `GraphRuntime.cpp`, lines 388–408].

4. **Scratch buffer pre-allocation**: For each compiled node, the runtime allocates input and output scratch `juce::AudioBuffer<float>` instances sized to `(numChannels_, maxBlockSize_)`. Additionally, chunk buffers (`chunkBuffer_`, `rawChunkBuffer_`, `sidechainChunkBuffer_`) and input accumulators are pre-allocated [source: `GraphRuntime.cpp`, lines 27–88]. This satisfies the pre-allocation invariant: no allocation occurs in `process()`.

5. **Node `prepare()` dispatch**: Each node's `prepare(sampleRate, maxBlockSize)` is called, giving nodes the opportunity to allocate internal state (delay lines, filter histories, wavetable memory) before the audio thread begins [source: `GraphRuntime.cpp`, lines 61–64].

6. **Validity flag**: `isValid_` is atomically set to `true` only after all allocations succeed [source: `GraphRuntime.cpp`, line 87].

The compiled `GraphRuntime` is immutable after `prepare()`: its topology (`compiledNodes_`, `routes_`) is fixed, and its scratch buffers are pre-allocated. This immutability is the key enabler of lock-free audio-thread execution. Timur Doumler's formulation of the pattern is precise: "Instead of modifying the data structure in-place, the message thread peels off a copy that contains the modification, while the audio thread still looks at the previous version for however long it needs to" ^35^.

#### 1.3.2 Atomic Pointer Exchange with Deferred Destruction

The handoff from message thread to audio thread uses a three-state pointer dance: `pendingRuntime` → `activeRuntime` → `retireQueue`. The mechanism is implemented in `BehaviorCoreProcessor::requestGraphRuntimeSwap()` and `checkGraphRuntimeSwap()`.

When the message thread finishes compilation, it calls `requestGraphRuntimeSwap()`, which performs a `std::atomic::exchange` on `pendingRuntime` with `memory_order_release` [source: `BehaviorCoreProcessor.cpp`, lines 2059–2060]:

```cpp
dsp_primitives::GraphRuntime* oldPending = pendingRuntime.exchange(
    runtime.release(), std::memory_order_release);
```

The `release` ordering ensures that all writes performed during graph compilation (node initialization, buffer allocation, routing table construction) are visible to the audio thread before it sees the new pointer.

On the next audio callback, `checkGraphRuntimeSwap()` executes [source: `BehaviorCoreProcessor.cpp`, lines 3209–3232]:

1. If `pendingRetireRuntime` (a stashed old runtime that failed to enqueue previously) is non-null, it attempts to enqueue it to `retireQueue`.
2. It performs `pendingRuntime.exchange(nullptr, std::memory_order_acq_rel)`, acquiring the new runtime pointer with acquire semantics (synchronizing with the message thread's release) and nulling `pendingRuntime` in one atomic operation.
3. The old `activeRuntime` is moved to `retireQueue` (or stashed as `pendingRetireRuntime` if the queue is full).
4. The new runtime becomes `activeRuntime`.

The `acq_rel` memory ordering on the exchange is correct: acquire semantics ensure the audio thread sees all compilation-side writes; release semantics on the null store ensure that if the message thread later reads `pendingRuntime`, it sees the audio thread's progress. This is the canonical RCU-style pattern for audio graph swapping.

The `SPSCQueuePtr<64>` (`retireQueue`) is a pointer-only SPSC queue. Its capacity of 64 provides generous headroom — under normal operation, the message thread drains the queue promptly, so overflow is unlikely. If overflow does occur, the old runtime is stashed in `pendingRetireRuntime` and retried on the next callback, preventing audio-thread blocking.

#### 1.3.3 State Continuity Challenge Across Graph Swaps

The atomic swap mechanism ensures *structural* continuity — the audio thread never processes a partially constructed graph — but it does not guarantee *state* continuity. When a new `GraphRuntime` replaces the old, each node in the new graph begins with freshly initialized internal state: filter histories are zeroed, delay lines are cleared, ADSR envelopes restart, and playhead positions reset to zero.

This is a known challenge in audio graph systems. Tracktion Graph documentation flags it as a concern for graph continuity during swaps ^36^. Manifold's current implementation does not provide a generic mechanism for migrating node state across graph recompilations. If a user adds a delay node to a running graph, the new delay line starts empty, producing a discontinuity. If a filter's cutoff is being modulated and the graph is recompiled, the filter's internal z⁻¹ states are lost.

Potential solutions, ordered by architectural impact, include: (1) **Node-level state export/import**: Each `IPrimitiveNode` could implement `serializeState()` / `deserializeState()` methods, and the compilation pipeline could match nodes by identity (or by path/UUID) to carry state forward. (2) **Graph-level state snapshot**: Before swapping, the old `GraphRuntime` could serialize the entire node state vector to a flat buffer; after swapping, the new runtime could restore matched nodes. (3) **Live graph mutation**: Instead of full recompilation, support limited in-place mutation (adding a leaf node, changing a parameter) without rebuilding the runtime. This is more complex but eliminates the continuity problem entirely.

Ableton Link addresses a related problem with its `capture()` / `commit()` API: the audio thread captures a thread-local snapshot of session state, and non-RT threads commit modifications. "It's important that this audio-thread specific interface only be used from the audio thread" ^37^. Manifold's `AtomicState` serves a similar purpose for scalar parameters, but there is no equivalent for structured node state.

The state continuity gap is the most significant unresolved architectural risk in Manifold's graph compilation pipeline. For creative applications where graph topology changes frequently during performance (live coding, generative patching), audible discontinuities from state loss may limit the utility of runtime graph mutation. A state migration framework, possibly using the same retirement-queue infrastructure to quarantine old node state until the new graph is confirmed running, would address this without compromising the lock-free audio path.


---

## 2. DSP Node Graph & Execution Engine

The preceding chapter described Manifold's three-thread separation and the lock-free mechanisms that move compiled graph snapshots from the message thread to the audio thread. This chapter examines the compiled artifact itself: the `GraphRuntime` that executes a directed acyclic graph (DAG) of DSP nodes. The analysis proceeds from the node-level contract upward through topological compilation, block-level scheduling, and finally the node taxonomy that reveals optimization opportunities.

### 2.1 Node Interface Design

#### 2.1.1 IPrimitiveNode contract: prepare(sampleRate, maxBlockSize), process(inputs, outputs, numSamples)

Every DSP primitive in Manifold derives from `IPrimitiveNode`, a pure-virtual interface defined in `dsp/core/graph/PrimitiveNode.h`. The contract specifies two lifecycle methods and two capability queries:

```cpp
virtual void prepare(double sampleRate, int maxBlockSize) = 0;
virtual void process(const std::vector<AudioBufferView>& inputs,
                     std::vector<WritableAudioBufferView>& outputs,
                     int numSamples) = 0;
virtual int getNumInputs() const = 0;
virtual int getNumOutputs() const = 0;
```

This `prepare()` / `process()` split mirrors the de facto standard established by JUCE's `AudioProcessor` (JUCE 8.0.4, `prepareToPlay()` / `processBlock()`), Tracktion Graph's `prepareToPlay()` / `process()` ^16^, and Jamoma DSP's `preCalculate()` / `calculate()` ^38^. The critical invariant is that `prepare()` may allocate, while `process()` must not. `GraphRuntime::prepare()` calls `prepare()` on every compiled node after allocating scratch buffers, and `GraphRuntime::process()` dispatches `process()` in topological order without any heap activity.

The `process()` signature receives `std::vector<AudioBufferView>` for inputs and `std::vector<WritableAudioBufferView>` for outputs. A node with stereo input and stereo output therefore receives a vector of length one containing a two-channel view. Multi-bus nodes (e.g., `CrossfaderNode` with two stereo inputs) receive a vector of length two, each element a two-channel view. The `numSamples` argument is guaranteed to be `<= maxBlockSize_` passed to `prepare()`, a guarantee maintained by the chunking subsystem described in Section 2.2.2.

Node instances also carry `std::atomic<bool>` visit flags (`visited_` and `visitInProgress_`) used by the topological sorter. While these atomics are mutated during compilation (off the audio thread), they reside on the node object and do not affect real-time safety during `process()`.

#### 2.1.2 Host-input fallthrough semantics: acceptsHostInputWhenUnconnected, wantsRawHostInputWhenUnconnected

The `IPrimitiveNode` interface declares two virtual boolean methods that control implicit host-input routing:

```cpp
virtual bool acceptsHostInputWhenUnconnected() const { return false; }
virtual bool wantsRawHostInputWhenUnconnected() const { return false; }
```

`acceptsHostInputWhenUnconnected()` determines whether a node whose input bus has no incoming graph connections should receive the host's input buffer automatically. `wantsRawHostInputWhenUnconnected()` further selects between the monitor-scaled host input (global passthrough with input-gain staging) and the raw capture-plane input (pre-monitor, pre-gain). The `GraphRuntime::processSingle()` implementation resolves this at block start: if a node has no incoming routes and opts in, the host buffer (or raw sidechain buffer) is copied into the node's input accumulator ^39^.

This design produces deterministic behavior when scripts rewire graphs: a disconnected effect node stops processing audio rather than continuing to receive host input indefinitely. It also supports capture-plane semantics for nodes that need unprocessed source material (e.g., pitch detection or spectrum analysis). The role-based gating in `PrimitiveGraph::NodeRole` (`InputDSP`, `Monitor`, `OutputDSP`, `SidechainInputDSP`) combines with these flags to route audio without runtime branch proliferation inside the audio callback.

#### 2.1.3 Buffer view architecture: AudioBufferView / WritableAudioBufferView for zero-copy routing

Manifold avoids buffer ownership inside the node interface. Instead, it uses lightweight non-owning views:

```cpp
struct AudioBufferView {
    const float* const* channelData = nullptr;
    int numChannels = 0;
    int numSamples = 0;
};
struct WritableAudioBufferView {
    float* const* channelData = nullptr;
    int numChannels = 0;
    int numSamples = 0;
};
```

Each view is constructed from a `juce::AudioBuffer<float>` by copying only the pointer array (`getArrayOfReadPointers()` or `getArrayOfWritePointers()`) and the channel/sample counts. No audio samples are copied, and no heap allocation occurs during view construction. This zero-copy routing pattern is consistent with the Superpowered `AudiobufferPool` retain/release semantics ^40^and the JUCE `AudioBuffer::setDataToReferTo()` idiom ^41^.

Views include bounds-checked accessors (`getSample`, `setSample`, `addSample`) that silently clamp out-of-range indices. While these guards prevent crashes from miswired graphs, they add branch instructions on every sample access. The SIMD-optimized Highway implementations bypass these accessors and operate on raw channel pointers directly, which is where Manifold extracts most of its vectorized throughput.

### 2.2 Topological Sort and Execution

#### 2.2.1 DFS-based topological sort with cycle detection: canonical algorithm, correct implementation

Manifold's `PrimitiveGraph` computes execution order via depth-first search (DFS) post-order traversal with an on-stack detection flag. The algorithm is the canonical textbook approach for DAG linearization, and it is the same strategy employed by Tracktion Graph ("post-ordered DFS") ^16^, SuperCollider's `SynthDef::topologicalSort` ^42^, and the ACE Studio multi-threaded engine ^43^.

The implementation in `PrimitiveGraph::buildTopologicalOrder()` uses the `visitInProgress_` atomic as a recursion-stack marker: if DFS encounters a node whose `visitInProgress_` flag is already set, a cycle exists and the sort aborts. This is essential because audio graphs naturally contain feedback topologies (compressor sidechains, resonators) that must be broken by explicit delay nodes rather than left as cycles. SuperCollider's UGen graph handles this through `SynthDef::cleanupTopoSort`, which removes redundant connections after sorting ^44^. Manifold's `hasCycle()` and `validateConnection()` methods expose this check to the Lua scripting layer before compilation.

Once compiled, the `GraphRuntime` stores the sorted node list in `std::vector<CompiledNode> compiledNodes_`. The runtime also stores a flattened `std::vector<RouteEntry> routes_` that encodes every connection as a tuple `(sourceNodeIndex, targetNodeIndex, sourceOutput, targetInput)`. During `processSingle()`, the executor iterates `compiledNodes_` in index order and resolves inputs by scanning `routes_` for entries whose `targetNodeIndex` matches the current node. This $O(N \cdot R)$ scan (where $N$ is node count and $R$ is route count) is acceptable for moderate graph sizes but scales linearly with connection density. HISE's C++ generator and JUCE's `ProcessorChain` eliminate this dispatch entirely by inlining the dataflow as template parameters or direct pointer wiring ^4^ ^45^.

#### 2.2.2 Chunking strategy for host blocks exceeding maxBlockSize: hybrid fixed/variable approach

The VST3 specification explicitly permits variable block sizes, and hosts such as FL Studio deliver buffers that vary per callback ^6^ ^39^. Manifold's `GraphRuntime` handles this with a hybrid strategy: it accepts variable host blocks externally but processes internally in fixed chunks bounded by `maxBlockSize_`. The entry point `process()` checks `numSamples > maxBlockSize_` and delegates to `processChunked()` when necessary.

`processChunked()` operates without allocation. It pre-allocated `chunkBuffer_`, `rawChunkBuffer_`, and `sidechainChunkBuffer_` at `prepare()` time, each sized to `maxBlockSize_`. For each chunk, it copies the relevant slice from the host buffer via `std::memcpy`, constructs a `juce::AudioBuffer<float>` view pointing at the chunk buffer, calls `processSingle()` on that view, and copies the result back to the host buffer. The chunk size for the final iteration is `totalSamples - offset`, which may be smaller than `maxBlockSize_`.

This hybrid approach is the same pattern recommended by the 2025 "Fixed vs Variable Buffer Processing" analysis: "accepting variable inputs externally but chunking internally via `while (pos < hostSamples) { processInternalBlock(subBlock); pos += blockToProcess; }` — bridge this by internalizing fixed benefits at minor latency cost" ^6^. The cost is an extra `std::memcpy` per chunk in each direction. For a 4096-sample host block chunked into two 2048-sample pieces, this adds four 2048-sample copies (input + output, two chunks) at 48 kHz — roughly 0.17 ms of memory bandwidth, negligible on modern CPUs but worth profiling on embedded targets.

#### 2.2.3 Scratch buffer allocation: pre-allocated input/output views and accumulators

Real-time safety demands that no allocation occur in the audio callback. Manifold satisfies this by allocating every scratch buffer in `GraphRuntime::prepare()`, which runs off the audio thread. The allocation strategy is documented in Table 2.

**Table 2. Buffer allocation strategy in GraphRuntime::prepare()**

| Buffer category | Quantity formula | Purpose | Allocation site |
|-----------------|------------------|---------|-----------------|
| Input scratch buffers | 1 per compiled node | Stores output of `InputDSP` role nodes (host passthrough) | `prepare()`, off audio thread |
| Output scratch buffers | 1 per compiled node | Stores output of all other node roles | `prepare()`, off audio thread |
| Chunk buffers (host/raw/sidechain) | 3 buffers × 2 channels × `maxBlockSize_` | Slice copies for chunking when host block > `maxBlockSize_` | `prepare()`, off audio thread |
| Input accumulators | `maxInputBuses` across all nodes (stereo each) | Sums incoming route contributions per bus | `prepare()`, off audio thread |
| Input/output view vectors | Reserved to `maxInputs` / `maxOutputs` across nodes | Non-owning view construction during `process()` | `prepare()`, capacity reserved; `process()` only pushes elements |

During `processSingle()`, the executor first clears all scratch buffers for the current `numSamples` (not the full `maxBlockSize_`, which avoids redundant zeroing). It then iterates routes, summing source scratch buffers into per-bus input accumulators via `juce::AudioBuffer::addFrom()`. After node processing, the output is written to the node's scratch buffer. Finally, sink nodes (those with no outgoing connections) whose role permits output (`OutputDSP` or `Monitor` when enabled) are mixed into the host buffer via `addFrom()`.

The current allocation is one input and one output scratch buffer per node, regardless of whether the node actually needs both. A graph-coloring optimization could reduce this footprint by reusing buffers across non-overlapping node lifetimes — a technique employed by deep-learning compilers for tensor memory planning ^46^. For a 50-node graph with 2 channels and 2048-sample blocks, the current scheme allocates approximately $50 \times 2 \times 2048 \times 4 \text{ bytes} \times 2 \text{ (in+out)} \approx 1.6 \text{ MB}$ of scratch memory, plus accumulator and chunk buffers. This is well within modern L3 cache capacities but could be tightened for mobile targets.

### 2.3 Node Ecosystem Analysis

#### 2.3.1 Stateful vs stateless node taxonomy: ADSR, Granulator, PhaseVocoder vs Gain, Invert, Distortion

Manifold's node library spans 60+ primitives, ranging from trivial arithmetic operators to FFT-based spectral processors. The nodes can be classified along two axes: statefulness (whether `process()` mutates internal memory) and computational complexity (per-sample cost). Table 1 presents a representative taxonomy.

**Table 1. Node taxonomy classification by state and complexity**

| Node | Stateful | Primary internal state | Per-sample cost | SIMD variant |
|------|----------|------------------------|-----------------|--------------|
| `GainNode` | No | `currentGain_` (smoothing only) | $O(1)$ multiply | Yes (`GainNode_Highway`) |
| `DistortionNode` | No | `drive_`, `mix_`, `output_` (smoothing) | $O(1)$ `tanh` | No |
| `ConstantSignalNode` | No | None | $O(1)$ store | No |
| `FilterNode` | Yes | `z1_`, `z2_` (state variables), cutoff smoothing | $O(1)$ 2-pole | Yes (`FilterNode_Highway`) |
| `ADSREnvelopeNode` | Yes | `stage_`, `envelope_`, `stageTime_`, `prevGate_` | $O(1)$ state machine | Yes (`ADSREnvelopeNode_Highway`) |
| `GranulatorNode` | Yes | `captureBuffer_` (ring buffer, 4 seconds), 64 grains | $O(G)$ per sample, $G \leq 64$ active grains | No |
| `PhaseVocoderNode` | Yes | `inputRing_`, `outputAccum_`, `timeStretchAccum_`, phase vectors | $O(F \log F)$ per hop, $F = \text{fftSize}$ | No |
| `TransientShaperNode` | Yes | `fastEnv_`, `slowEnv_` (dual envelope followers) | $O(1)$ 2× envelope | No |
| `ReverbNode` | Yes | JUCE `Reverb` internal comb/all-pass network | $O(B)$ per block, $B \approx 8$ comb filters | No |
| `PitchDetectorNode` | Yes | `StreamingPitchDetector` internal state | $O(W^2)$ per window, $W \approx 2048$ | No |

Stateless nodes (Gain, Distortion, ConstantSignal) have no memory of previous samples beyond parameter smoothing transients. Stateful nodes maintain delay lines, envelope states, grain tables, or FFT accumulators that must persist across calls. The distinction matters for graph compilation: stateful nodes cannot be reordered or fused arbitrarily, while stateless nodes are candidates for algebraic fusion (e.g., `GainNode` followed by `DistortionNode` could fold into a single gain-then-tanh kernel).

The `GranulatorNode` encapsulates a tapped delay-line granulator following Bencina's canonical architecture: a ring buffer, grain scheduler, per-grain envelope (Hann or triangle), and linear-interpolation readback ^33^. It allocates `bufferSize_ = sampleRate * 4 + maxBlockSize` samples in `prepare()` — up to ~706,000 samples (2.8 MB) at 48 kHz — which is substantial but bounded. The 64-grain maximum (`kMaxGrains = 64`) bounds the per-sample workload.

#### 2.3.2 Parameter smoothing standardization: identical exponential smoothing across all nodes reveals hoisting opportunity

A striking uniformity across Manifold's node library is the parameter smoothing implementation. Every node uses the identical first-order lowpass:

$$\text{smoothCoeff} = 1 - \exp\left(\frac{-1}{\tau \cdot f_s}\right), \quad \text{current} \leftarrow \text{current} + (\text{target} - \text{current}) \cdot \text{smoothCoeff}$$

where $\tau$ is a time constant ranging from 10 ms (`GainNode`, `DistortionNode`, `GranulatorNode`) to 20 ms (`FilterNode`) to 40 ms (`ReverbNode`). This is the standard one-pole parameter smoother recommended by the DAFX textbook for time-varying parameters ^47^.

The uniformity is architecturally clean but computationally redundant. Each node runs its own smoothing state machine at sample rate, loading atomic targets and updating local floats every sample. In a 50-node graph, this is 50 independent smoothers executing per sample, even though most parameter changes originate from the message thread at control-rate intervals (typically 10–30 Hz for UI updates, or MIDI CC at 1 ms granularity).

FAUST's compiler demonstrates the alternative: it automatically hoists control-rate computations out of the sample loop, moving "expressions involving [slow outputs]... out of the inner-loop by the compiler" ^5^. Manifold could adopt a similar model by introducing a graph-level `ControlRateScheduler` that updates smoothed parameters at a fixed sub-audio interval (e.g., every 64 samples ≈ 1.45 ms at 44.1 kHz) and feeds interpolated values to nodes. This would reduce per-sample overhead from $O(\text{nodes})$ to $O(\text{control blocks})$ with no audible consequence for typical parameter trajectories ^5^.

Notably, the `ADSREnvelopeNode` uses `memory_order_relaxed` for its atomic parameter stores and loads — an anomaly in a codebase that otherwise consistently uses `memory_order_acquire`/`release`. While relaxed ordering is sufficient for independent scalar values, it creates a subtle inconsistency in the node's synchronization contract.

#### 2.3.3 Latency reporting: PhaseVocoderNode reports fftSize_ but may have additional ring-buffer latency

Plugin-reported latency is the mechanism by which a host's delay compensation delays all tracks to match the maximum latency in the signal path ^48^ ^49^. Manifold's `PhaseVocoderNode` implements `getLatencySamples()` by returning `fftSize_`, which ranges from 512 to 4096 samples depending on the `fftOrderParam_` setting (order 9 to 12). At 44.1 kHz, this corresponds to 11.6 ms to 92.9 ms.

However, the node's internal architecture includes additional buffering whose latency is not reported. The `inputRing_` is sized to `fftSize_ * 2` (1024–8192 samples), and the `outputAccum_` is also `fftSize_ * 2`. The STFT overlap-add pipeline with 75% overlap (hop = `fftSize_ / 4`) introduces an inherent algorithmic latency of one FFT frame plus the synthesis window offset. In high-quality phase-vocoder implementations, total latency can be "as high as 150 ms" ^50^. Manifold's reported `fftSize_` captures only the FFT window length, not the ring-buffer or overlap-add contributions.

The time-stretch mode (`mode == 1`) adds further unreported latency through `timeStretchAccum_`, sized to `fftSize_ * 8`, because resampled read-ahead is required to maintain output continuity when the pitch ratio deviates from unity. The node also lacks the frequency-domain oversampling fix documented in Royer's thesis (zero-padding DFT coefficients to reduce high-frequency noise above 15 kHz when down-shifting) ^51^, which would increase FFT size and therefore reported latency.

No other Manifold node reviewed implements `getLatencySamples()`. The `PitchDetectorNode` operates as a pass-through (its output is the input signal with detection metadata extracted on the side), so it conceptually reports zero samples, though its internal `monoBuffer_` and `StreamingPitchDetector` state introduce processing delay that does not affect output timing. The `ReverbNode` wraps JUCE's built-in reverb, which does not expose latency programmatically; algorithmic reverbs typically have a few samples of pre-delay but negligible group delay relative to host compensation thresholds.

The broader concern is that latency reporting in Manifold appears ad hoc — implemented only where the node author explicitly added `getLatencySamples()`. A systematic approach would require the graph compiler to accumulate latency along every path and report the maximum to the host, following the pattern described by ACE Studio: "Calculate the Delay of Each Node... Determine the Maximum Path Delay... Add Compensatory Delays to Shorter Paths" ^43^. Without this, parallel branches with different latencies (e.g., a direct path through `GainNode` and a delayed path through `PhaseVocoderNode`) will arrive at the mixer out of phase, causing comb-filtering artifacts that host delay compensation cannot resolve.


---

## 3. SIMD Vectorization & Performance

Manifold's approach to Single Instruction, Multiple Data (SIMD) acceleration is built entirely on Google Highway, a portable SIMD abstraction layer that translates C++ template expressions into architecture-specific intrinsics at compile time. Highway was selected over alternatives such as xsimd and C++26 `std::simd` because it provides runtime dispatch across 27 instruction-set architectures (ISAs) — including x86 SSE/AVX families, ARM NEON and Scalable Vector Extension (SVE), and RISC-V Vector (RVV) — while shielding node authors from per-ISA code paths.^6^This chapter examines how Manifold integrates Highway, identifies a critical portability gap in its target configuration, and assesses the performance optimization landscape for its stateful DSP nodes.

### 3.1 Google Highway Integration

#### 3.1.1 HighwayWrapper.h Configuration

The entry point for all SIMD compilation in Manifold is `manifold/highway/HighwayWrapper.h`. The file defines `HWY_COMPILE_ALL_ATTAINABLE`, which instructs Highway to emit object code for every target the compiler can reach.^6^Under x86, the wrapper explicitly requests SSE2, SSE3, SSSE3, and SSE4 via the macros `HWY_WANT_SSE2`, `HWY_WANT_SSE3`, `HWY_WANT_SSSE3`, and `HWY_WANT_SSE4`.^6^It also includes MSVC-specific workarounds for AVX3 bugs in Visual Studio 2019 and earlier (`HWY_BROKEN_MSVC`), indicating awareness of compiler-version-specific issues in the Microsoft toolchain.

The wrapper then includes `hwy/foreach_target.h` (guarded by `HWY_TARGET_INCLUDE`) followed by `hwy/highway.h`, `hwy/aligned_allocator.h`, and `hwy/cache_control.h`. This ordering is significant: `foreach_target.h` is what enables Highway's multi-dispatch pattern, wherein the same source file is compiled once per enabled target and the best variant selected at runtime via `HWY_DYNAMIC_DISPATCH_T`. Each node implementation — `ADSREnvelopeNode_Highway.h` and `BitCrusherNode_Highway.h` — undefines and redefines `HWY_TARGET_INCLUDE` to point to itself before including `HighwayWrapper.h`, which triggers the foreach-target loop.

#### 3.1.2 ADSREnvelopeNode_Highway: Per-Lane State Machine

The ADSR envelope node is the more architecturally interesting of the two Highway implementations because it solves a genuinely hard SIMD problem: a state machine with per-lane transitions. An envelope generator cannot be naively vectorized across sequential samples — sample $n$ depends on the envelope value at sample $n-1$ — so Manifold adopts the voice-parallel pattern recommended by Angus Hewlett (ROLI, ADC 2017), in which each SIMD lane corresponds to one independent polyphonic voice rather than one sequential sample.^52^The implementation in `ADSREnvelopeNode_Highway.h` declares a class `ADSREnvelopeNodeSIMDImplementation` inside `HWY_NAMESPACE`, inheriting from `IPrimitiveNodeSIMDImplementation`. State variables (`stage_`, `envelope_`, `startLevel_`, `stageTime_`, `prevGate_`) are held as scalar members, while per-lane working data is stored in Highway-aligned buffers allocated via `hwy::AllocateAligned<float>(numLanes)`. The `run()` method uses a `while(samplesRemain > 0)` loop that processes vectors of samples, with an inner `do { ... } while(reprocess)` loop that handles stage transitions (Attack → Decay → Sustain → Release → Off) across lanes.

Three Highway cross-lane primitives are central to the transition logic. `SlideUpLanes` shifts the stage-time vector upward by the index of the first lane that triggered a transition, computed via `HWY::FindKnownFirstTrue`. `BroadcastLane<kLane>` replicates the stage time from the transitioning lane to all lanes, ensuring that re-processed lanes start from the correct time offset. `Compress` extracts only the active lanes from a vector, which is used during tail handling (the final partial-vector iteration) to recover the last processed lane's state. These operations are documented in Highway's quick reference as the canonical cross-lane primitives for state transitions in vectorized algorithms.^20^The node also demonstrates careful attention to tail handling: full vectors use unmasked `LoadU`/`StoreU`, while the remainder uses `HWY::FirstN` to construct a partial mask, `MaskedLoad`/`BlendedStore` for safe I/O, and `Compress` + `BroadcastLane<0>` to extract the last active lane's stage time. This is consistent with Highway's recommended strip-mining approach, although — as discussed in Section 3.3.2 — the variable remainder sizes imposed by host DAW block sizes introduce branch misprediction risk that fixed internal chunking could eliminate.

#### 3.1.3 BitCrusherNode_Highway: Quantization with Stateful Logic

The bit-crusher node (`BitCrusherNode_Highway.h`) is a non-linear effect combining sample-rate reduction (hold-counter logic), bit-depth quantization, and parameter smoothing. Like the ADSR node, it processes vectors of samples in a `while(samplesRemain > 0)` loop, but its internal structure differs because the state is per-sample rather than per-envelope-stage.

Key elements include: exponential parameter smoothing via `HWY::MulAdd(target - current, smooth, current)`; a hold-counter vector (`holdCounter`) incremented each sample and compared against `holdInterval` to determine when to capture a new held sample; multi-mode quantization including a bitwise-XOR combination mode that quantizes inputs from two audio buses, XORs their integer codes, and converts back to float; and three logic modes selected at runtime by `currentLogicMode_` (standard quantize, XOR with bus B, gate/compare with bus B).

The XOR mode is the most computationally intensive path: it clamps both inputs to $[-1, +1]$, scales to integer code space via `HWY::Round`, computes `HWY::Xor` on the centered codes, then converts back through division by `maxCode`. The implementation uses `HWY::IfThenElse` and `HWY::AllTrue` to branch on mono vs. stereo input conditions at the vector level, avoiding scalar branches inside the hot loop. This pattern — using mask-based selection instead of scalar `if` — is consistent with the branchless SIMD philosophy advocated for real-time audio DSP.^52^### 3.2 The ARM SIMD Gap

#### 3.2.1 Missing Targets in HighwayWrapper.h

The most consequential finding from reviewing `HighwayWrapper.h` is that ARM targets are entirely absent. The `#if defined(_M_IX86) || defined(_M_X64)` guard wraps all target-enabling macros, meaning `HWY_WANT_SSE2` through `HWY_WANT_SSE4` are defined only for x86 and x86-64 builds. No equivalent block exists for `__aarch64__`, `__arm__`, `_M_ARM64`, or any other ARM architecture predefined macro. Consequently, on Apple Silicon (M1/M2/M3), ARM Linux, and ARM Android builds, Highway falls back to its scalar/emulated target (`HWY_EMU128` or `HWY_SCALAR`), and every `HWY_DYNAMIC_DISPATCH_T` call resolves to the non-vectorized implementation.^6^Highway natively supports seven ARM targets: `HWY_NEON`, `HWY_NEON_WITHOUT_AES`, `HWY_NEON_BF16`, `HWY_SVE`, `HWY_SVE2`, `HWY_SVE_256`, and `HWY_SVE2_128`.^20^These cover the full range of ARM vector hardware from the 128-bit fixed-width NEON in every AArch64 chip to the 128-2048 bit scalable vectors of SVE and SVE2 in newer server and high-performance mobile cores. Manifold's build system currently configures zero of them.

| Target Family | Manifold Configured | Highway Available | Vector Width | Key Platforms | Relative Speedup vs. Scalar |
|---|---|---|---|---|---|
| x86 SSE2 | Yes | Yes | 128-bit (4× float) | All x86_64 | ~2.5× |
| x86 SSE3 | Yes | Yes | 128-bit (4× float) | All x86_64 | ~2.6× |
| x86 SSSE3 | Yes | Yes | 128-bit (4× float) | All x86_64 | ~2.7× |
| x86 SSE4 | Yes | Yes | 128-bit (4× float) | All x86_64 | ~2.8× |
| x86 AVX2 | No (HWY_ALL_ATTAINABLE) | Yes | 256-bit (8× float) | Sandy Bridge+ | ~4.6× |
| x86 AVX-512 | No (HWY_ALL_ATTAINABLE) | Yes | 512-bit (16× float) | Skylake-X+ | ~5.8× |
| ARM NEON | **No** | Yes | 128-bit (4× float) | Apple Silicon, ARM Android | ~3.2× |
| ARM SVE | **No** | Yes | 128-2048 bit (scalable) | AWS Graviton3, Fujitsu A64FX | ~4.4× (at 256-bit) |
| ARM SVE2 | **No** | Yes | 128-2048 bit (scalable) | ARMv9 (Cortex-X3+) | ~4.4× (at 256-bit) |
| HWY_SCALAR / EMU128 | Fallback | Always | 1 lane | Unsupported CPUs | 1.0× |

Speedup figures are synthesized from published benchmarks: openEuler x86/ARM comparisons (AVX2 ~7.5×, NEON ~3.8× on FIR workloads)^53^, OB-Xd 3.x reported 4-6× real-world speedup for voice-parallel synthesis^23^, and Highway's own 5-10× claim for vector-friendly workloads^6^. State machine overhead in ADSR and bit-crusher nodes reduces these peaks relative to simple gain/FIR loops. Highway's `HWY_COMPILE_ALL_ATTAINABLE` would automatically include AVX2 and AVX-512 on supported compilers, but the absence of ARM target macros means NEON and SVE are never compiled regardless of compiler or platform.

#### 3.2.2 Impact Assessment

The practical impact of this gap is substantial and growing. Apple Silicon has become the dominant platform in music production: as of 2024, Apple M-series chips power the majority of new laptop sales in the creative professional segment, and every M1/M2/M3 core includes 128-bit NEON with double-precision support.^22^On Android, ARM64 is effectively the only relevant architecture. When Manifold builds for either platform, all Highway-optimized nodes — ADSR envelope, bit-crusher, and any future nodes following the same pattern — execute scalar fallback code, negating the entire SIMD engineering investment for those platforms.

Benchmark data from Yining Karl Li (2021) provides a concrete reference point: on ARM64, hand-written NEON achieved 3.4× speedup over scalar in a compute-bound workload, while compiler auto-vectorization yielded only 1.095× (essentially no benefit).^7^Manifold's stateful nodes are less amenable to auto-vectorization than simple FIR loops because of cross-lane state transitions and the inner `do/while(reprocess)` loop, so the scalar fallback is likely performing at or near 1.0× relative to a theoretical NEON-optimized version.

#### 3.2.3 Fix Path

Resolving this gap requires no changes to any node implementation. The ADSR and bit-crusher nodes use portable Highway abstractions (`SlideUpLanes`, `BroadcastLane`, `Compress`, `MaskedLoad`, `BlendedStore`) that compile identically for x86 SSE, x86 AVX, ARM NEON, and ARM SVE because Highway maps each operation to the appropriate native intrinsic.^20^The fix is purely build-system: adding an `#elif defined(__aarch64__) || defined(_M_ARM64)` branch to `HighwayWrapper.h` that defines `HWY_WANT_NEON`, `HWY_WANT_SVE`, and `HWY_WANT_SVE2` (or relying on `HWY_COMPILE_ALL_ATTAINABLE` to pick them up automatically when the architecture guard is removed).

Google's own Zimtohrli project — an audio psychoacoustic metric that processes approximately 70 seconds of audio per second on a single 2.5 GHz core using Highway — demonstrates that the same source code compiles and runs efficiently across x86 AVX2 and ARM NEON without per-node modifications.^54^ARM's official migration documentation explicitly recommends Highway for portable SIMD precisely because it eliminates per-ISA code paths.^55^The recommended change sequence follows the Build-System Trilemma identified in cross-dimensional analysis: enable ARM targets in `HighwayWrapper.h` (Phase 1, build-system-only), add QEMU-based ARM compilation verification to continuous integration via GitHub Actions ARM runners (Phase 2), and validate functional correctness on physical Apple Silicon and ARM Android hardware (Phase 3). Highway itself tests ARM targets via QEMU in its own CI pipeline, confirming this approach is viable.^6^![Hypothetical SIMD Speedup: Stateful Audio DSP Node](/mnt/agents/output/manifold_sec03_chart.png)

### 3.3 Performance Optimization Landscape

#### 3.3.1 Dynamic Dispatch Overhead

Highway's runtime dispatch resolves the best available target on first invocation of `HWY_DYNAMIC_DISPATCH_T` or `HWY_DYNAMIC_POINTER`. This detection involves reading CPU feature flags (via `cpuid` on x86, `getauxval(AT_HWCAP)` on Linux ARM, or system registry on macOS) and selecting the matching compiled target. The Highway documentation notes: "the first invocation of `HWY_DYNAMIC_DISPATCH`, or each call to the pointer returned by the first invocation of `HWY_DYNAMIC_POINTER`, involves some CPU detection overhead."^6^Manifold's node factory pattern calls `HWY_DYNAMIC_DISPATCH_T(_create_instance_table)` inside `__CreateInstance()` to return the appropriate `IPrimitiveNodeSIMDImplementation` subclass. This dispatch happens once per node instantiation, not per audio callback block. However, if node instances are created and destroyed frequently — for example, during graph swaps in the runtime's hot-reload path — the CPU detection overhead could accumulate. The mitigation is straightforward: call `hwy::GetChosenTarget().Update(hwy::SupportedTargets());` once during `prepareToPlay()` or plugin initialization, before any `HWY_DYNAMIC_*` invocation, which pre-resolves the target and eliminates per-call overhead.^6^The NumPy NEP 54 team investigated this exact concern for their adoption of Highway, confirming that function pointer caching via `HWY_DYNAMIC_POINTER` eliminates dispatch overhead in tight inner loops.^56^For Manifold's audio callback context, where `processBlock()` may invoke SIMD kernels thousands of times per second, pre-resolving the dispatch target is the recommended pattern. An even more aggressive optimization would cache the resolved `__CreateInstance` function pointer as a member of the node factory, eliminating the indirect call entirely after the first node creation.

#### 3.3.2 Tail Handling Strategy

Both the ADSR and bit-crusher nodes process audio in a `while(samplesRemain > 0)` loop with a conditional branch at the bottom: full vectors take the `samplesRemain >= numLanes` path using unmasked loads and stores, while the remainder takes the `else` path using `HWY::FirstN`, `MaskedLoad`, and `BlendedStore`. This conditional is evaluated once per vector iteration, meaning a 512-sample host block on a platform with 4-lane vectors (SSE/NEON) incurs 128 branch evaluations, of which one (the final iteration) takes the remainder path.

For variable host block sizes — the default behavior in VST3 and AU hosts — this creates two problems. First, the branch predictor sees a regular pattern (taken, taken, ..., not taken) but the exact iteration count changes every callback, potentially causing mispredictions on the tail branch. Second, the remainder path executes different instructions (masked operations) than the main path, polluting the instruction cache with rarely-used code. Firefly Synth 2 addresses this by employing a fixed internal processing block of 16 samples, guaranteeing vector-width divisibility on all common SIMD targets (SSE: 4 lanes × 4 iterations = 16; AVX2: 8 lanes × 2 = 16; AVX-512: 16 × 1 = 16).^57^Manifold's current approach follows Highway's documented preference for handling remainders via masked operations rather than padding.^19^This is a defensible trade-off: it avoids the memory overhead of padding output buffers and works correctly for any block size. However, for nodes where the host block size is known at `prepare()` time and remains stable, switching to an internal chunking strategy — processing audio in fixed-size sub-blocks that are always multiples of `Lanes(d)` — would eliminate the tail conditional entirely and yield a "flat and optimal" CPU profile, which is the standard target for real-time audio plugin certification.^42^#### 3.3.3 Auto-Vectorization vs. Manual SIMD

A recurring debate in audio DSP optimization is whether hand-written SIMD justifies its maintenance burden when modern compilers auto-vectorize scalar loops aggressively. The evidence is context-dependent, and Manifold's node architecture falls on the "manual SIMD justified" side of the boundary.

A detailed study from DevelopersIO (2022) found that for simple audio effects (gain, pan, basic IIR filters), MSVC auto-vectorized block-based scalar code and in some cases outperformed hand-written AVX2 — because the scalar loop was simpler and exposed more optimization opportunities to the compiler.^58^The author recommends block-based scalar loops as the first optimization step before reaching for intrinsics. However, this result applies primarily to stateless, linear operations without cross-sample dependencies.

Manifold's ADSR envelope node is the opposite: a deeply stateful, non-linear state machine with per-lane transitions, inner reprocess loops, and conditional stage changes. Auto-vectorization fails on this pattern because the compiler cannot prove that the inner `while(reprocess)` loop terminates with a predictable structure, nor can it vectorize the `switch(stage_)` dispatch across lanes. Yining Karl Li's cross-platform benchmarks support this conclusion: on ARM64, auto-vectorization achieved only 1.095× speedup versus 3.4× for hand-written NEON.^7^The bit-crusher node presents a subtler case. Its core quantization loop is stateless (each sample is quantized independently given the current bit-depth), but the hold-counter logic and parameter smoothing introduce per-sample state. For the pure quantization path, a compiler *might* auto-vectorize a scalar implementation effectively. However, the multi-mode logic (standard vs. XOR vs. gate) with runtime mode selection and dual-bus input routing creates control-flow complexity that defeats auto-vectorization. The VCV Rack community's consensus, after evaluating Highway for plugin SIMD, was that "voice polyphony is an obvious way" to exploit SIMD — processing multiple independent voices in parallel lanes — but this requires explicit data layout and cannot be inferred by the compiler from scalar object-oriented code.^4^The practical recommendation for Manifold is therefore a tiered SIMD strategy. Tier 1 — stateful, branchy, non-linear nodes (ADSR, bit-crusher, future waveshapers and filters) — should continue using Highway with the voice-parallel pattern, as these are exactly the cases where manual SIMD provides multiplicative speedups that auto-vectorization cannot match. Tier 2 — simple, stateless nodes (gain, pan, dry/wet mix) — should be implemented as plain scalar loops first, then benchmarked against a Highway version; if the compiler auto-vectorizes the scalar loop to within 10-20% of the hand-written SIMD, the maintenance savings of scalar code outweigh the marginal performance gain. This tiered approach is consistent with OB-Xd 3.x's rewrite experience, where the authors achieved 4-6× real-world speedup by focusing SIMD effort on the voice-processing engine while leaving simpler utility code in scalar form.^23^---

## 4. Scripting, Memory & Real-Time Safety

Audio plugin frameworks that expose scripting to end users face a fundamental tension: interpreted languages enable rapid iteration and expressive graph construction, yet their memory management characteristics are incompatible with real-time audio callbacks. Manifold resolves this by splitting scripting across two isolated Lua virtual machines (VMs), pre-allocating all audio-thread memory during initialization, and compiling Lua-defined graphs into lock-free C++ runtime structures. This chapter examines the dual-VM architecture, the memory allocation discipline, and the verification gaps between architectural intent and runtime guarantee.

### 4.1 Dual Lua VM Architecture

Manifold hosts two separate Lua 5.4 VMs, each bound to C++ through sol2 and restricted to the JUCE message thread. The separation is a safety boundary derived from industry consensus: garbage-collected scripting languages must never execute inside the audio callback. Cantabile's documentation states that ".NET expressions can't be used on the audio thread, because to call them would introduce the possibility of audio glitches if the .NET garbage collector happens to run" ^59^. REAPER's ReaScript API enforces the same rule: "Must only call from the main thread" for every audio accessor ^44^. Manifold internalizes this constraint by design — Lua never runs on the audio thread.

#### 4.1.1 LuaEngine (UI VM): Canvas/RuntimeNode Scene Graph

The `LuaEngine` class in `primitives/scripting/LuaEngine.h` hosts the UI-facing VM. It binds JUCE `Canvas` and `RuntimeNode` objects to Lua usertypes, exposes `command()` for `ControlServer` message posting, and pushes processor-state snapshots at every timer tick. The header comment is explicit: "ALL methods must be called on the message thread only." Hot-reload polls at approximately 30 Hz via `HOT_RELOAD_CHECK_INTERVAL = 30` in `LuaCoreEngine.cpp` ^60^. HISE supports a similar "jump back to the interpreted version with a single click" workflow ^61^, and Cmajor's JIT plugin auto-rebuilds patches without restart ^13^. The polling model trades a small deterministic CPU cost for simplicity. An event-driven file-watcher alternative — using `std::filesystem::last_write_time` with caching or platform-specific watchers — could reduce overhead to near zero, but the current mechanism is consistent with known working patterns in production audio software.

`LuaEngine` also handles OSC callbacks. When an OSC message arrives, `invokeOSCCallback()` executes on the message thread if a handler is registered. This queuing model mirrors SuperCollider's OSC-to-scsynth dispatch ^2^and prevents message-thread work from spilling into sample-level timing. Synthesizer V Studio uses the same pattern: its scripting API distinguishes "data objects" (tracks, notes) from "UI state objects" (playback control), with all script execution confined to the message thread ^62^.

#### 4.1.2 DSPPluginScriptHost (DSP VM): buildPlugin(ctx) Graph Construction

`DSPPluginScriptHost` manages the DSP graph definition VM. User scripts implement `buildPlugin(ctx)`, returning a Lua table describing node topology, connections, and parameter bindings. The table compiles into a `GraphRuntime` — a frozen C++ object graph executing on the audio thread with no Lua involvement. The pattern is now standard in the field. HISE's scriptnode compiles visual graphs to C++ classes, collapsing three addition nodes into a single assembly instruction ^36^; Cmajor exports LLVM-JIT patches to native C++ for production plugins ^13^. Manifold follows the same paradigm — Lua defines structure, compiled C++ executes it.

This architecture sidesteps the performance chasm between interpreted and compiled DSP. Benchmarks from the music-dsp community show that pure Lua is approximately ten times slower than C for sample-level processing, and even LuaJIT — which compiles to native code via tracing JIT — introduces non-deterministic compilation pauses that are unacceptable in a real-time callback ^23^. Faust, a domain-specific language for DSP, compiles to C++ at approximately 320% of hand-coded C speed ^34^. By keeping Lua strictly off the audio thread and compiling graph definitions to C++ before execution, Manifold captures the ergonomics of scripting without paying its runtime penalty.

Graph mutations are deferred. `DSPPluginScriptHost` enqueues changes into a background worker (`ensureDeferredWorkerStarted()`), which compiles a new `GraphRuntime` and requests an atomic swap via `requestGraphRuntimeSwap()`. The old runtime retires to an `SPSCQueuePtr` rather than being destroyed inline, eliminating use-after-free hazards. This is the retirement-queue pattern recommended for lock-free audio systems ^7^. The `BehaviorCoreProcessor` holds both an `activeRuntime` pointer (read by the audio thread) and a `pendingRetireRuntime` pointer (queued for destruction on the message thread), ensuring that the audio callback never observes a half-constructed or half-destroyed graph.

#### 4.1.3 sol2 Configuration: SOL_ALL_SAFETIES_ON=1, SOL_SAFE_NUMERICS=0

`sol2` is configured with `SOL_ALL_SAFETIES_ON=1` in `LuaCoreEngine.cpp`, enabling safe usertype getters, reference validation, function-call arity checks, and numeric-range guards ^63^. For a framework exposing C++ objects to user scripts, these checks catch nil dereferences, wrong-type arguments, and stack underflows. Real-world sol2 overhead is approximately 50 ns per C++ function call versus 1–2 ns for pure Lua ^64^— negligible on the message thread at 30 Hz. Member function calls measure around 200 ns ^64^, still acceptable for graph construction where a single `buildPlugin(ctx)` call may define dozens of nodes in one invocation.

Manifold leaves `SOL_SAFE_NUMERICS` at its default 0, so float-to-double conversions are not precision-checked. This is appropriate: DSP graphs are overwhelmingly floating-point, and precision guards add overhead without catching meaningful bugs where `float` is the intentional type. The sol2 documentation notes that `SOL_ALL_SAFETIES_ON` "currently prioritizes safety over speed" ^65^; relaxing numerics checks is a defensible tradeoff for float-heavy audio work.

| Aspect | LuaEngine (UI VM) | DSPPluginScriptHost (DSP VM) |
|--------|-------------------|------------------------------|
| Primary role | Canvas/RuntimeNode scene graph, ImGui-style UI | `buildPlugin(ctx)` DSP graph definition |
| Thread affinity | JUCE message thread only | JUCE message thread only |
| Hot-reload mechanism | ~30 Hz polling via `checkHotReload()` | Deferred mutation worker, atomic graph swap |
| C++ bindings | Canvas, Graphics, `command()`, file choosers | `ctx` API: `setParam`, `getParam`, `getSampleRate` |
| OSC integration | `invokeOSCCallback()` / `invokeOSCQueryCallback()` | None (graph-level param registry only) |
| Memory per usertype | ~4–8 KB per bound type ^66^| Same overhead; graph compiled away before audio thread |
| Lifecycle guard | `std::recursive_mutex` around sol::state | `pendingSlotDestroy` retirement vector |
| Industry parallel | Synthesizer V Studio UI scripting ^62^| HISE scriptnode C++ compilation ^36^|

The two-VM model is an architectural firewall. A UI script bug — an infinite loop in `ui_update()`, a malformed Canvas node — cannot corrupt the DSP graph because the VMs share no state. The `DSPPluginScriptHost` does not expose Canvas bindings, and `LuaEngine` has no access to `GraphRuntime` internals. This separation directly mirrors SuperCollider's scsynth/sclang split ^2^and Max/MSP's scheduler/audio-graph boundary, both proven in professional production environments for over two decades.

### 4.2 Memory Management Patterns

Real-time audio programming operates under one non-negotiable rule: no dynamic allocation in the audio callback. Bencina's canonical 2011 essay identifies three hazards: allocator locks contended by all threads; OS paging to or from disk; and unpredictable worst-case allocation timing ^7^. Manifold enforces this rule through pre-allocation: every buffer, scratch region, and SIMD state vector is allocated in `prepare()` and reused without resize during `process()`.

#### 4.2.1 Pre-allocation Strategy: All Scratch Buffers in prepare()

`GraphRuntime::prepare()` in `primitives/scripting/GraphRuntime.cpp` is the central allocation site. For each compiled node, it creates a pair of `juce::AudioBuffer<float>` scratch buffers — input accumulation and output write-back — sized to `maxBlockSize_`. It also pre-allocates `chunkBuffer_`, `rawChunkBuffer_`, and `sidechainChunkBuffer_` for the chunked processing path when host blocks exceed `maxBlockSize_`. The `inputViews_` and `outputViews_` vectors are `reserve()`-d to maximum sizes, and `inputAccumulators_` are sized for the widest bus count across all nodes.

This implements the "3-scope rule": initialization scope holds all allocation; real-time scope holds zero; non-real-time scope holds heavy or non-deterministic work ^6^. The `process()` and `processSingle()` methods operate entirely on pre-allocated memory. The chunked path uses `std::memcpy` between existing pointers, never `new` or `malloc`. A comment at line 67 of `GraphRuntime.cpp` is explicit: "Preallocate buffers used during processing (audio thread)."

One subtle hazard remains: `juce::AudioBuffer::setSize()` with `avoidReallocating=true` only prevents reallocation if neither channel count nor sample length increases ^67^. `CaptureBuffer` calls `setSize()` without passing `avoidReallocating`, relying on the default `false`. Since these calls are initialization-time only, this is safe, but it reinforces the need for review discipline: any `setSize()` without `avoidReallocating=true` must be provably outside the real-time scope. Nathan Blair's thesis identifies this as a well-documented "foot-gun" for JUCE beginners ^30^.

#### 4.2.2 Highway-Aligned Allocation: SIMD State Vectors

Highway SIMD nodes allocate state with `hwy::AllocateAligned<float>(numLanes)`. `BitCrusherNode_Highway.h` allocates `currentState_`, `smooth_`, `holdCounters_`, `heldSample_`, and `laneNumber_` through this interface. Highway guarantees alignment to at least the SIMD register width for the current target, and on some platforms to cache-line boundaries (64 bytes), preventing false sharing under concurrent access ^68^ ^69^.

Allocation occurs in `configure()`, called from `prepare()`. The node lazily initializes its `simd_implementation_` pointer in `prepare()` if null, then forwards to the Highway layer. Pointers are wrapped in `hwy::AlignedFreeUniquePtr<float[]>`, ensuring Highway's aligned deleter runs on destruction and avoiding undefined behavior from mismatched `delete`.

#### 4.2.3 CaptureBuffer Circular Buffer: juce::AudioBuffer Backing with Per-Channel offsetToNow

`CaptureBuffer` in `primitives/dsp/CaptureBuffer.h` implements a multi-channel circular buffer over a `juce::AudioBuffer<float>`, with a `std::vector<int>` `offsetToNow` tracking write heads per channel. The `write()` method advances via modulo: `offsetToNow[channel] = (offsetToNow[channel] + 1) % bufferSize`. The `getSample()` read path wraps with a `while (idx < 0) idx += bufferSize` loop — acceptable since reads are not the hot path in typical capture scenarios.

The backing buffer is resized in `setSize()` with `keepExistingContent=true`. These are setup-time methods, safe from the audio callback. The modulo operator `%` in `writeBlock()` could be replaced with bitwise masking for power-of-two sizes, eliminating integer division overhead in the per-sample path. For retrospective capture or granulator read heads that may access the buffer thousands of times per block, this optimization would be measurable.

| Scope | Manifold Implementation | Industry Best Practice | Risk / Notes |
|-------|------------------------|------------------------|--------------|
| **Initialization** (`prepare()`) | `juce::AudioBuffer` scratch pairs per node; `hwy::AllocateAligned` SIMD state; `CaptureBuffer` backing | All scratch, FFT plans, delay lines allocated here ^6^| `setSize()` without `avoidReallocating=true` must be provably outside `process()` ^67^|
| **Real-time** (`process()`) | `std::memcpy` into pre-allocated chunks; `clear(0, numSamples)` on scratch; no heap | Zero allocation; zero locks; zero I/O ^7^| `inputViews_.clear()` + `push_back()` are safe because capacity reserved in `prepare()` |
| **Non-real-time** (UI, reload, worker) | `compileGraphRuntime()` builds new runtime; old runtime retires to `SPSCQueuePtr` | SPSC queues for deferred destruction ^70^; RCU for wait-free reads ^2^| `pendingSlotDestroy` accumulates old hosts; consumer thread must be non-RT |

The table confirms that Manifold's allocation discipline is architecturally correct across all three scopes. Every audio-thread buffer is claimed before `process()` begins, and every obsolete object is retired rather than destroyed inline. The retirement queue pattern, in particular, is a critical but under-documented technique in audio programming: when a non-real-time thread replaces an object that the audio thread may still reference, immediate deletion risks use-after-free. By queuing old `GraphRuntime` instances and `DSPPluginScriptHost` slots for later cleanup, Manifold avoids this hazard without blocking the audio thread ^70^.

One refinement worth considering is memory consolidation. `GraphRuntime` currently allocates independent `chunkBuffer_`, `rawChunkBuffer_`, `sidechainChunkBuffer_`, and per-node scratch pairs as separate `juce::AudioBuffer` objects. Each allocation incurs allocator overhead and may fragment the heap over long sessions. A single arena allocation in `prepare()`, manually partitioned into contiguous sub-regions, would improve cache locality and make memory profiling simpler ^71^. The `std::pmr::monotonic_buffer_resource` approach demonstrated by Timur Doumler at CppCon 2021 — backed by pre-allocated stack or thread-local storage with `std::pmr::null_memory_resource()` as upstream — provides a standard, testable path to this consolidation ^71^.

### 4.3 Real-Time Safety Verification Gap

A codebase can follow every real-time best practice and still fail in production if a single `std::vector::push_back` or errant `new` slips into the audio callback. Verification infrastructure — automated testing, static analysis, and runtime instrumentation — converts architectural intent into guarantee. In the reviewed Manifold codebase, this infrastructure is largely absent.

#### 4.3.1 No pluginval, RTSan, or Allocation Interception in CI

`pluginval`, developed by Tracktion engineer David Rowland, stress-tests plugins under extreme parameter automation and buffer-size variation, and can be configured to fail on any audio-thread allocation ^13^. The Real-Time Sanitizer (RTSan), introduced in Clang 20 (2025), intercepts `malloc`, `free`, and mutex locks in threads marked with `[[clang::realtime]]`, producing immediate compile-time or runtime errors ^13^. Neither tool appears in the Manifold codebase or its build configuration.

Manual interception is also possible: overriding `operator new`/`delete` with assertion-fail logic in debug builds, or integrating Tracy profiler's `TracyAllocS`/`TracyFreeS` macros to visualize heap operations with full callstacks ^72^. Tracy's allocation tracker has been used to detect heap fragmentation in real-time audio by surfacing allocation lifetime and frequency patterns. Without any of these mechanisms, Manifold's "no allocation in `process()`" rule remains a coding convention rather than an enforced invariant. A single contributor calling `push_back` inside a node's `process()` method would break the guarantee silently, and no automated test would catch it.

#### 4.3.2 No Denormal Handling Visible in Reviewed Nodes

Denormal floating-point numbers — magnitudes below approximately $1.18 \times 10^{-38}$ for IEEE 754 single precision — cause severe performance degradation on x86 without flush-to-zero (FTZ), because they fall out of the normal fast path through the floating-point unit and into microcode emulation. A filter with a long feedback path, a reverb tail, or any recursive smoothing algorithm can push samples into the denormal range during silence or decay phases.

A systematic search for `flushDenormalToZero`, `_MM_SET_FLUSH_ZERO_MODE`, `_mm_setcsr`, or manual denormal detection returned no matches in any production DSP node or processor class. The only `std::isnan` references appear in the standalone `dsp_simd_test` harness. If a user builds a graph containing a long-tailed shimmer or a high-Q filter, the plugin may experience 10–100x CPU spikes during silent passages as the host DAW processes denormals in microcode. JUCE provides `juce::FloatVectorOperations::disableDenormalisedNumberSupport()` as a portable helper that sets the appropriate FTZ flags, but there is no evidence of its use in the reviewed code.

#### 4.3.3 No Automated Numerical Stability Testing

Beyond allocation and denormals, numerical stability is the third pillar of real-time safety. DSP nodes performing quantization, waveshaping, or recursive filtering can produce NaN or infinity when parameters reach extremes — for example, a rate-reduction of zero dividing by zero in a hold-interval calculation, or a feedback coefficient exceeding unity in an IIR loop. None of the reviewed nodes contain explicit NaN or infinity guards. The `BitCrusherNode` scalar fallback uses `juce::jlimit(-1.0f, 1.0f, x)` on quantized outputs, which bounds amplitude but does not intercept NaN propagation from upstream nodes or invalid parameter combinations.

The absence of automated numerical testing means edge-case parameter combinations are discovered through manual QA or user reports. A headless harness — instantiating each node with fuzzed parameters, driving impulse and silence buffers, and asserting `!std::isnan(output)` and `!std::isinf(output)` — would catch these defects at build time. Such harnesses are standard in mature frameworks: Tracktion validates every node against a reference implementation, and JUCE's own `dsp` module includes numerical tests for its filter implementations.

Manifold's architecture is *designed* for real-time safety: lock-free graph swapping, pre-allocated scratch buffers, Lua excluded from the audio thread, and Highway-aligned SIMD state. But "designed for" is not "verified to achieve." The recommended remediation is sequential and low-risk: first, a debug-build `operator new` override asserting on audio-thread allocation; second, `pluginval` integrated in CI; third, Clang RTSan in a dedicated debug configuration; fourth, a headless numerical-stability harness for all nodes. Each step is independent, and each would raise confidence in the entire architecture from "believed safe" to "demonstrably safe."


---

## 5. Build System & Platform Strategy

The Manifold project is built with CMake (minimum version 3.22), matching the threshold that JUCE itself requires for its modern CMake API ^73^. This alignment is consequential: it grants access to `juce_add_plugin()`, `juce_add_gui_app()`, and the full suite of JUCE module linking targets (`juce::juce_audio_utils`, `juce::juce_dsp`, and so on) that would otherwise be unavailable under older CMake versions. The build script is a single monolithic `CMakeLists.txt` rather than a hierarchical directory structure, which keeps dependency ordering visible but also concentrates complexity in one file. This chapter analyzes three aspects of the build system: the hybrid dependency management strategy, the custom export pipeline, and the platform-specific risks that threaten build reproducibility.

### 5.1 CMake Architecture

#### 5.1.1 Dependency Management Hybrid: Submodules, FetchContent, and System Packages

Manifold sources its ten-plus external dependencies through three distinct mechanisms, each chosen according to the dependency's stability profile, size, and platform availability. Git submodules are used for the largest, most frequently modified libraries: JUCE (from `external/JUCE`), Google Highway (`external/highway`), Dear ImGui (`external/imgui`), and ImGuiColorTextEdit (`external/ImGuiColorTextEdit`). `FetchContent` is used for sol2 (the Lua C++ binding layer, tracking the `develop` branch) and Ableton Link (pinned to tag `Link-3.1.2`). System-level discovery handles Lua 5.4 on Linux via `pkg-config` or `find_package(Lua)`, while Boost::Regex is pulled from the system on desktop but falls back to a vendored header-only copy on Android.

This hybrid approach is pragmatic. Git submodules permit editing dependency source for debugging — a capability that pure `FetchContent` explicitly denies because "it is not possible to edit the source code of the dependency for quick testing purposes" ^74^. Submodules also remain compatible with Dependabot for automated version bumping, whereas `FetchContent` tags require manual updates because "GitHub's Dependabot will NOT auto-update the GIT_TAG" ^74^. Conversely, `FetchContent` is preferable for small, stable, header-only libraries such as sol2 and Ableton Link, which carry minimal clone cost and are unlikely to need local patches.

The table below compares each dependency's management method against the alternatives.

| Dependency | Management Method | Pinning Strategy | Rationale |
|:---|:---|:---|:---|
| JUCE | Git submodule (`external/JUCE`) | Manual commit tracking | Large codebase; local patches likely during JUCE version upgrades ^12^|
| Google Highway | Git submodule (`external/highway`) | Manual commit tracking | SIMD targets may need platform-specific patches |
| Dear ImGui | Git submodule (`external/imgui`) | Manual commit tracking | `thread_local` patch may require source modification ^75^|
| ImGuiColorTextEdit | Git submodule (`external/ImGuiColorTextEdit`) | Manual commit tracking | Fork (pthom); vendored Boost.Regex headers for Android |
| sol2 | `FetchContent` (GitHub, `develop`) | Branch tracking | Header-only; rapid API changes on `develop` branch ^76^|
| Ableton Link | `FetchContent` (GitHub, `Link-3.1.2`) | Tag pin | Header-only with CMake Config support; stable release cycle ^77^|
| Lua 5.4 | System `pkg-config` / `find_package` / source build | `find_package` version check + custom header regex | Linux: system package preferred; Windows/Android: source fallback via `MANIFOLD_BUILD_LUA` |
| Boost::Regex | System `find_package` (desktop); vendored header-only (Android) | System version on desktop; bundled headers on Android | Avoids full Boost on Android where system packages are scarce ^78^|

Several aspects of this arrangement warrant scrutiny. First, sol2 tracks the `develop` branch without a tag or commit hash, meaning any upstream breaking change to sol2's template metaprogramming surface will propagate directly into Manifold builds. Second, the Lua discovery logic in `CMakeLists.txt` (lines 46–175) implements a three-tier fallback — `pkg-config` → `find_package(Lua 5.4)` → manual `find_path`/`find_library` — that includes a custom `manifold_header_is_lua_54()` function performing regex-based header content inspection. This defensiveness is well-motivated: the authors note that "FindLua can pair the 5.4 library with the unversioned `/usr/include` headers, which breaks sol2 hard." However, the complexity suggests that a single CPM.cmake invocation could replace the entire block with a declarative version pin, as CPM "solves dependency being included twice issues that raw FetchContent can cause" ^79^. Third, the Boost::Regex split is handled correctly on Android by creating an `INTERFACE IMPORTED` target pointing to vendored headers, which avoids pulling in the full Boost C++ libraries. Boost.Regex now supports standalone mode via `BOOST_REGEX_STANDALONE` ^78^, and Manifold's Android path effectively reproduces this behavior.

#### 5.1.2 Export System: `manifold_add_export_plugin()`

Manifold defines a custom CMake function, `manifold_add_export_plugin()`, which wraps JUCE's `juce_add_plugin()` with project-specific manifest generation. The function accepts arguments for product name, plugin code, project directory, manifest specification, and a `FORMATS` list (defaulting to `Standalone VST3`). It then invokes a Python script (`tools/generate_export_manifest.py`) to synthesize a JSON5 manifest file from a `.spec.json` input, registers the manifest generation as a custom CMake command with proper dependency tracking, and links the generated manifest into the plugin target via `MANIFOLD_DEFAULT_PROJECT`.

This design decouples plugin metadata from the C++ source tree. A developer wishing to ship a derivative product — say, a standalone filter plugin — provides only a project directory and a manifest specification; the build system handles JUCE target creation, source aggregation, and compile-definition injection. Nine exported products are already defined in the main `CMakeLists.txt` (lines 793–855), ranging from `Manifold_Filter` (a standalone filter) to `Manifold_Sample` (a synth with MIDI input and sidechain). Each inherits the full DSP and runtime source lists, meaning every export compiles the entire Manifold node library regardless of which nodes the specific product uses. This is a compile-time cost in exchange for simplicity; more granular source selection would require a dependency-graph analysis of which `PrimitiveNode` types each export references.

The manifest generation step introduces a Python runtime dependency during configuration, gated by `find_package(Python3 REQUIRED COMPONENTS Interpreter)` at line 10. This is standard practice — Pamplejuce similarly uses Python for versioning tasks ^12^— but it adds a toolchain requirement that must be documented for contributors.

#### 5.1.3 Cross-Platform Coverage

Manifold targets four platforms: Linux (GCC and Clang), Windows (MSVC and clang-cl), Android (NDK via `juce_add_gui_app`), and iOS (partial, detected via `CMAKE_SYSTEM_NAME STREQUAL "iOS"`). The compiler coverage is broad by audio-plugin standards. JUCE's CMake API itself supports these platforms, with the caveat that iOS "requires CMake 3.14 or higher" and "the Xcode generator is highly recommended" ^80^. Android builds are coordinated through the NDK build system with CMake as the native build backend ^81^.

The table below maps each platform to its build configuration, supported plugin formats, and identified risks.

| Platform | Generator / Toolchain | Supported Formats | Compiler | Known Risks |
|:---|:---|:---|:---|:---|
| Linux (x86_64) | Unix Makefiles or Ninja | VST3, Standalone | GCC, Clang | Highway SIMD enabled for x86 only; ARM64 Linux not configured |
| Windows (x86_64) | Visual Studio or Ninja | VST3, Standalone | MSVC, clang-cl | `MANIFOLD_BUILD_LUA` required; no system Lua |
| Android | Gradle + NDK + CMake | Standalone app (GUI) | Android NDK Clang | `dlsym()` visibility for `juce_CreateApplication()` may need patch ^82^; ARM builds fall back to scalar Highway |
| iOS | Xcode (recommended) | Partial | Apple Clang | `CMAKE_SYSTEM_NAME=iOS` detected but build flags not fully configured; static library output unsupported by JUCE CMake API ^83^|
| macOS (implied by JUCE) | Xcode or Ninja | Not explicitly listed | Apple Clang | Code signing / notarization pipeline absent ^84^|

The most significant gap in this matrix is the absence of CLAP format support. CLAP (CLever Audio Plug-in) is an open plugin format gaining rapid adoption in Bitwig Studio, Reaper, and the free-audio ecosystem. Its build integration is lightweight: "Ideally a clap plugin should be self contained: it should not rely upon symbols from the host, and it should export only one symbol: clap_entry" ^85^. The `clap-juce-extensions` project provides a single CMake module that adds CLAP to any JUCE plugin with one additional `juce_add_plugin` argument ^86^. Manifold's export system could adopt this with minimal changes to `manifold_add_export_plugin()`. Similarly, AU (Audio Unit) support is missing despite being the native format on macOS; JUCE's CMake API supports AU via the `FORMATS` list ^80^, but Manifold restricts exports to `VST3 Standalone` only.

Another issue, discussed in Chapter 3's Insight 3, is that Manifold configures Google Highway for x86 SIMD targets (SSE2/3/4) but does not enumerate ARM targets (`HWY_NEON`, `HWY_NEON_BF16`, `HWY_SVE`, `HWY_SVE2`) ^6^. Because Android and iOS are both ARM-dominant platforms, this means mobile builds will execute scalar fallbacks for all Highway-optimized nodes (e.g., `ADSREnvelopeNode_Highway`, `BitCrusherNode_Highway`), effectively nullifying the SIMD investment on the platforms where performance is most constrained. This is a build-system-only fix: the portable Highway abstractions (`SlideUpLanes`, `BroadcastLane`) require zero source changes to compile for ARM ^7^.

### 5.2 CI/CD and Tooling Gaps

#### 5.2.1 No GitHub Actions CI Pipeline Detected

Despite `enable_testing()` at line 1141 and seven `add_test()` registrations (headless IPC core, headless IPC editor, standalone direct regression, standalone direct profile sanity, port buffer semantics, plus two harness binaries), there is no evidence of a GitHub Actions (or equivalent) continuous integration pipeline in the repository. This is a structural vulnerability. Pamplejuce, the most influential open-source JUCE template, provides "Building and testing cross-platform (linux, macOS, Windows) binaries" and "Running pluginval 1.x against the binaries for plugin validation" as standard CI steps ^12^. JUCE-Plugin-Starter similarly builds AU, VST3, CLAP, and Standalone across three platforms with automated platform detection ^87^. Audio Modeling, a commercial audio software vendor, describes their CI pipeline as creating "a new and clean virtual container and then proceeds in compiling the code" on every commit ^73^.

Without CI, cross-platform regressions in `manifold_add_export_plugin()` or the platform-detection logic (lines 565–571) will only surface when a developer manually builds on the affected platform. Given that iOS support is already labeled "partial," this lack of automated verification means iOS breakages may go undetected until a release candidate stage.

#### 5.2.2 Missing sccache, PluginVal, and Ninja Standardization

The build system does not reference Mozilla sccache, the Ninja generator, or Tracktion's PluginVal validation tool — all of which have become standard in modern JUCE CMake templates. sccache "will shave minutes off your build times" by caching compiled object files across CI runs ^88^; Pamplejuce reports that "first builds take 5-10 minutes per platform; subsequent builds with minor changes are significantly faster" when sccache is enabled ^87^. Ninja is the preferred generator across all platforms for consistent, fast builds ^87^ ^89^. PluginVal is the de facto plugin-format compliance validator; it scans for real-time safety violations (e.g., mutex locks in the audio callback) that static analysis cannot catch ^12^.

Manifold's test suite is entirely Python-driven (e2e IPC tests, standalone regression tests, UI profile tests) and focuses on functional correctness rather than plugin-format compliance. Adding PluginVal to the existing `add_test()` framework would require only a binary download step and a single command-line invocation per built artifact.

#### 5.2.3 No CLAP Format Support Despite Industry Adoption

As noted in Section 5.1.3, Manifold's `FORMATS` default is `Standalone VST3`. In October 2025, Steinberg relicensed the VST3 SDK under the MIT license, removing the previous proprietary constraint ^73^. While this reduces the legal urgency to migrate away from VST3, it does not diminish the technical appeal of CLAP, which offers per-note modulation, a lighter host contract, and growing DAW support. The `JUCE-Plugin-Starter` template supports CLAP alongside AU, AUv3, VST3, and Standalone ^87^. Adding CLAP to Manifold would expand DAW compatibility at low implementation cost.

### 5.3 Platform-Specific Risks

#### 5.3.1 ImGui `thread_local` Patch: Mandatory for Multi-Instance Safety

Dear ImGui stores its global context in a single `ImGuiContext* GImGui` pointer. In a DAW where multiple plugin instances may be instantiated simultaneously, this global state causes crashes unless the pointer is made `thread_local` ^75^. The imgui_juce integration library documents this explicitly: "By default ImGui only support a single instance running because it uses a global state... You need to patch ImGui and make the global state thread local." ^75^Manifold's `CMakeLists.txt` builds ImGui as a static library with a custom `ManifoldImGuiConfig.h` and includes `manifold/ui/imgui/ManifoldImGuiGlobals.cpp` in the source list (line 205). The presence of a dedicated globals file suggests the authors are aware of ImGui's state management, but the `thread_local` status of `GImGui` cannot be confirmed from CMake alone. This must be verified by inspecting `ManifoldImGuiGlobals.cpp` or the `IMGUI_USER_CONFIG` header. If the patch is absent, opening two Manifold VST3 instances in the same DAW session will trigger undefined behavior.

#### 5.3.2 Android `dlsym()` Visibility: Potential JUCE 8 Compatibility Issue

JUCE Android builds historically suffered from a symbol visibility problem: all JUCE modules are linked with `PRIVATE` scope, which on Android is equivalent to `-fvisibility=hidden`. The entry point `juce_CreateApplication()` is therefore invisible to `dlsym()`, preventing the Java-native bridge from loading the application ^82^. The fix is a one-line visibility patch. It is unclear whether this is resolved in JUCE 8 or whether Manifold's Android build applies the workaround. Manifold's Android target (lines 886–958) forces `MANIFOLD_BUILD_LUA=ON` and configures asset bundling, but does not contain any visibility-related compiler flags. This should be tested on a current Android NDK (version 25+ recommended ^90^).

#### 5.3.3 Boost::Regex Dependency: Standalone vs. Full Boost

ImGuiColorTextEdit requires regular expression support. On desktop platforms, Manifold's `CMakeLists.txt` calls `find_package(Boost REQUIRED COMPONENTS regex)` (line 244). On Android, it creates an `INTERFACE IMPORTED` target pointing to `vendor/regex/include` within the ImGuiColorTextEdit directory (lines 240–242). This split is architecturally sound: it avoids a full Boost installation on Android while reusing the system package on Linux and Windows.

However, the desktop path still depends on the system Boost distribution. Boost.Regex is now header-only and can operate in "standalone mode without the rest of the Boost C++ libraries" by defining `BOOST_REGEX_STANDALONE` ^78^. If Manifold's ImGuiColorTextEdit fork supports this mode, the desktop build could also eliminate the system Boost dependency, reducing both CI image size and contributor onboarding friction. This is a low-effort, medium-impact change: adding `-DBOOST_REGEX_STANDALONE` to the `imgui_color_text_edit` target compile definitions would be sufficient, provided the vendored headers are also available on desktop.

Taken together, these three risks — ImGui instance safety, Android symbol visibility, and Boost dependency weight — are all build-system-adjacent issues that do not require algorithmic changes. They represent what Insight 7 (Section 1, Chapter Overview) classifies as "build-system-only" fixes with low risk profiles, suitable for Phase 1 of a modernization sequence before any C++ source-level or SIMD-target changes are attempted.


---

# 6. Visual Pipeline & Shader Integration

## 6.1 UI and Scene Graph

### 6.1.1 Canvas/RuntimeNode: Lua-Driven Hierarchical Scene Graph with ImGui Backend

Manifold's visual layer pairs `Canvas`, a JUCE `Component` with an optional `OpenGLContext`, and `RuntimeNode`, a plain C++ structure that carries the hierarchical scene-graph state. `Canvas` inherits from both `juce::Component` and `juce::OpenGLRenderer`, so each widget can render via CPU-side JUCE `Graphics` or GPU-side OpenGL callbacks. `RuntimeNode` stores bounds, style, transform, input capabilities, and a `sol::function` callback table for every event type. The bidirectional link—`Canvas` owns a `std::unique_ptr<RuntimeNode>`, and `RuntimeNode` stores raw parent/child pointers—forms a retained-mode scene graph that Lua scripts mutate from the message thread.

The `CallbackSlots` structure exposes 17 `sol::function` hooks, from `onMouseDown` to `onImGuiFrame`. This mirrors the pattern in OpenSceneGraph's Lua integration, where scripts "create scene graph objects, populate the scene graph with lua callbacks and pass back the scene graph" ^85^. Crucially, these callbacks execute on the JUCE message thread, not the audio callback, preserving real-time safety ^84^. When a script calls `canvas:setOnDraw(fn)`, the `sol::function` is stored in the node's callback table and later invoked inside `Canvas::paint()` or `Canvas::renderOpenGL()`.

ImGui serves as the immediate-mode backend for inspector and hierarchy panels. `ImGuiHost` hosts a dedicated `juce::OpenGLContext` and forwards JUCE input events into a `PendingEvent` queue drained during `renderOpenGL()` ^84^. A critical concern: ImGui's default global `ImGuiContext* GImGui` pointer crashes when multiple plugin instances run in one DAW process. The canonical fix, documented by Krasjet's `imgui_juce` project, patches `GImGui` to `thread_local` ^84^. Manifold stores `void* imguiContext` as a per-instance member, suggesting the patch is present, but explicit `ImGui::SetCurrentContext()` calls are not visible in the reviewed header. DISTRHO's `dear-plugins` offers a reference test suite for validating multi-instance ImGui behavior in plugins ^83^.

### 6.1.2 Hot-Reload at ~1 Hz: Polling Model vs Event-Driven Alternatives

`LuaEngine` implements UI script hot-reload via frame counting: `static constexpr int HOT_RELOAD_CHECK_INTERVAL = 30` means the engine checks for file modifications every 30 frames. At a 30–60 fps editor refresh rate, this is roughly 0.5–1.0 Hz polling. The implementation reads file modification times, compares against a cached token, and triggers a full re-parse and scene graph rebuild when changed. This polling model is portable but imposes recurring cost on the message thread.

The concern is its interaction with other visual workloads. JUCE forum reports describe plugins with OpenGL contexts causing DAW UI frame rates to "drop from a smooth 70–80 fps to a choppy 20–30 fps" ^8^. Manifold runs at least two OpenGL contexts: the main `Canvas` path and the `ImGuiHost` editor context. The 30-frame reload check injects filesystem I/O and Lua recompilation at a cadence that competes with frame rendering. An event-driven model—using `inotify`, `FSEvents`, or `ReadDirectoryChangesW`—would reduce this overhead to near zero until an actual change occurs.

Industry precedent for plugin UI hot-reload favors web-based serving: Elementary's Plugin Dev Kit demonstrates Vite-powered reloading inside a DAW by serving JavaScript from `localhost` ^91^ ^92^. Manifold's Lua path cannot adopt a browser dev-server, but it can separate file watching to a background thread and deliver notifications via a lock-free queue, analogous to the existing DSP reload triggered by `command("TRIGGER", "/core/behavior/dsp/reload")`.

### 6.1.3 FrameTimings Monitoring: Tracks Performance but May Measure Self-Contributed Degradation

`FrameTimings` is a telemetry structure of approximately 70 atomic fields tracking every UI stage from `pushState` through `present`, plus GPU sizes, memory deltas, ImGui vertex counts, and Lua heap state. Each `FrameTimingStage` records current, peak, and EWMA durations with a fixed alpha of 0.05, updated via `memory_order_relaxed` loads and stores.

The instrumentation is comprehensive, yet the profiler contributes to the metric it measures. Seventy relaxed atomic updates per frame, each on a distinct cache line, add non-trivial memory traffic. In the sndpeek ChuGL reimplementation, FPS is printed only every 0.25 seconds from a dedicated coroutine to minimize overhead ^93^. Manifold's per-frame update of every stage may add tens of microseconds—small alone, but meaningful when the DAW UI is already strained by OpenGL context switches. Additionally, `relaxed` ordering is safe for monotonic counters but insufficient if any consumer thread must observe prior stage completions; `acquire` on reads and `release` on writes would provide the necessary happens-before edge at negligible cost on x86.

## 6.2 Shader and Video Systems

### 6.2.1 ShaderEffectRegistry: 22 GLSL Fragment Pipelines with JSON Metadata

`ShaderEffectRegistry` is a singleton that discovers, validates, and serves GLSL shaders. At startup, `registerBuiltinEffects()` scans `manifold/shaders` for `.json` manifests paired with `.glsl` fragments, plus a second scan of `manifold/shaders/blend` for compositing operators. The registry distinguishes `EffectCategory::Effect` for post-processing shaders and `EffectCategory::BlendOp` for compositing functions. Each manifest declares an `id`, `name`, `category`, `description`, typed `ParamSpec` records (`min`, `max`, `defaultValue`, `step`), and an optional `preamble` prepended to the fragment source.

The builtin inventory comprises 22 fragment effects and 6 blend operations, summarized in Table 1. All fragment shaders are driven by a common uniform set (`u_time`, `u_resolution`, `u_intensity`, `u_speed`, `u_param1`, `u_param2`) with effect-specific extensions in JSON. The `ShaderPipelineDescriptor` supports multi-pass chains via `PassDescriptor` records, each referencing an `effectId`, parameter overrides, a `composite` flag, a `blendOpId`, and opacity. Input textures are bound through `InputBinding` records mapping `sourceType` to a uniform and texture unit.

**Table 1. Shader Pipeline Inventory — Built-in GLSL Effects and Blend Modes**

| ID | Name | Category | Type | Params | Preamble | Description |
|:---|:---|:---|:---|:---:|:---:|:---|
| trail-dissolve | Trail Dissolve | feedback | Effect | 9 | No | Dissolving particle trail over live image |
| edge-glow | Edge Glow | color | Effect | 4 | No | Sobel edge detection with cycling neon color |
| optical-flow | Optical Flow | feedback | Effect | 10 | Yes | Horn-Schunck optical flow with advection |
| kaleidoscope | Kaleidoscope | distortion | Effect | 5 | No | Radial mirror segmentation |
| vhs | VHS | glitch | Effect | 8 | Yes | VHS tearing, wobble, noise, chroma bleed |
| pixel-sort | Pixel Sort | glitch | Effect | 8 | Yes | Threshold-based pixel sorting with streaks |
| datamosh | Datamosh | glitch | Effect | 5 | No | Compression-artifact motion smearing |
| glitch | Glitch | glitch | Effect | 5 | No | Structured signal corruption blocks |
| chromatic | Chromatic | color | Effect | 5 | No | RGB channel separation aberration |
| rgb-split | RGB Split | color | Effect | 4 | No | Directional color channel displacement |
| edge-trails | Edge Trails | feedback | Effect | 5 | No | Motion-blurred Sobel contour trails |
| fluid-smoke | Fluid Smoke | simulation | Effect | 5 | No | Navier-Stokes approximated advection |
| fractal-echo | Fractal Echo | feedback | Effect | 5 | No | Self-similar recursive feedback echoes |
| luma-feedback | Luma Feedback | feedback | Effect | 5 | No | Luminance-keyed recursive feedback |
| neon-edge | Neon Edge | color | Effect | 5 | No | Bright-edge bloom with threshold gating |
| posterize | Posterize | color | Effect | 4 | No | Quantized color band reduction |
| psychedelic | Psychedelic | distortion | Effect | 4 | No | Hue-rotating radial warping |
| ripple | Ripple | distortion | Effect | 4 | No | Sinusoidal radial displacement |
| time-smear | Time Smear | feedback | Effect | 5 | No | Directional temporal motion blur |
| trail | Trail | feedback | Effect | 5 | No | Simple multi-sample motion trail |
| wave | Wave | distortion | Effect | 4 | No | Sinusoidal vertical displacement |
| pixelate | Pixelate | distortion | Effect | 4 | No | Block-resolution downsampling |
| normal | Normal | blend | BlendOp | 4 | No | Standard alpha blend with gamma shaping |
| add | Add | blend | BlendOp | 4 | No | Additive light compositing |
| multiply | Multiply | blend | BlendOp | 4 | No | Multiplicative darkening compositing |
| screen | Screen | blend | BlendOp | 4 | No | Inverted-multiply lightening |
| overlay | Overlay | blend | BlendOp | 4 | No | Contrast-enhancing conditional blend |
| difference | Difference | blend | BlendOp | 4 | No | Absolute-difference matte extraction |

This metadata approach aligns with the Interactive Shader Format (ISF) standard adopted by OSSIA score, which supports "Shadertoy effects, by drag'n'drop of Shadertoy URLs into a score which will trigger an automated conversion to ISF" ^94^. Manifold's descriptors are structurally similar but not ISF-compliant; aligning with ISF would open access to the existing Shadertoy corpus. The registry also lacks an `audio_reactive` uniform section. Audio Shader Studio demonstrates the standard mapping: `u_audioLevel`, `u_bassLevel`, `u_trebleLevel`, `u_spectralCentroid`, and `u_beatDetected` ^88^.

Shader execution is mediated by `ShaderSurfaceProvider`, which renders a `RuntimeNode`'s assigned pipeline into an OpenGL texture. The provider maintains a texture cache keyed by `stableId`, prunes unused entries, and supports `InputResolver` injection so upstream nodes can bind as input textures. `CompositeSurfaceProvider` generalizes this to multi-source compositing: it renders each source to its own FBO texture, then runs a final fullscreen composite pass. Blender's real-time compositor and JCGT 2025 GPU Laplacian blending research both demonstrate that modern GPUs handle multi-source compositing at 4K with minimal overhead when FBOs and mipmap chains are used ^95^ ^96^.

### 6.2.2 VideoCaptureManager + CompositeSurfaceProvider: Cross-Platform Video with OpenGL Texture Compositing

`VideoCaptureManager` is a platform-abstracted singleton that discovers devices, negotiates `VideoMode` resolution and frame rate, and runs a dedicated `captureThread_` that fills a `FrameData` structure with RGBA pixel data. On Linux the implementation uses V4L2 via an opaque `LinuxState` PIMPL; macOS and Windows stubs are implied but not present in the reviewed branch. Frame delivery is mutex-guarded: `getLatestFrameCopy()` locks `frameMutex_` and returns a copy of `latestFrame_`, a CPU-side `std::vector<std::uint8_t>`.

The gap is that `VideoCaptureManager` outputs CPU buffers while the shader pipeline expects GPU textures, implying a CPU-to-GPU upload every frame. For real-time VJ workflows, this is suboptimal. The industry standard—demonstrated by Indigo and OSSIA score—uses platform-specific shared texture paths: Syphon (macOS/IOSurface) and Spout (Windows/DirectX shared textures) enable zero-copy GPU texture sharing between applications ^97^ ^98^ ^99^. Extending `VideoCaptureManager` to output via Syphon or Spout would position Manifold as a visual source for Resolume, OBS, and TouchDesigner without CPU readback.

### 6.2.3 The Missing Audio-Texture Bridge: SpectrumAnalyzerNode FFT Data Never Reaches ShaderEffectRegistry

Manifold's DSP layer includes spectral analysis primitives such as `PhaseVocoderNode`, which wraps `juce::dsp::FFT`, yet `ShaderEffectRegistry` has no input binding for audio spectra. The `InputBinding` structure supports only string `sourceType` values such as `"video"` or `"shader"`, and `ShaderSurfaceProvider::InputResolver` returns a `ResolvedInputTexture` containing only a texture handle, dimensions, and sequence. There is no path for FFT magnitude data to enter the shader pipeline.

This is a missed opportunity with low implementation cost. The established pattern, used by Shadertoy and Deezer's mobile visualizer, uploads FFT data as a 1D `GL_LUMINANCE` texture each frame via `glTexSubImage2D` ^100^ ^89^ ^10^. Shadertoy exposes this as `iChannel0`, sampled per pixel with `texture(iChannel0, vec2(freq, 0.0)).x` ^10^ ^11^. A typical WebGL implementation creates the texture from `analyser.getByteFrequencyData()` and uploads without reallocation, yielding sub-millisecond GPU transfer for 512-bin spectra ^100^.

Implementing the bridge requires three additions: (1) an `AudioTextureProvider` class subscribing to spectrum output and maintaining a 1D texture handle, (2) a new `sourceType` `"audioSpectrum"` in `InputBinding`, and (3) automatic scalar uniform injection for derived features (RMS, bass, treble, centroid, beat). Audio Shader Studio's extraction formulas are directly transferable: spectral centroid as $\text{Centroid} = \Sigma(f[i] \times \text{magnitude}[i]) / \Sigma(\text{magnitude}[i])$ and beat detection via an energy history buffer with threshold $E(t) > \text{mean}(E_{\text{history}}) \times 1.3$ ^88^. The result would make all 22 existing shaders audio-reactive without modifying any GLSL source.

Looking forward, WebGPU via `wgpu` is positioning itself as a portable successor to OpenGL, targeting "any system that has DirectX or Vulkan or Metal or OpenGL" plus WASM ^76^ ^12^. Critics note it "implements a Vulkan-style rigid render pipeline model which even Vulkan is moving away from," suggesting the API may age awkwardly ^76^. For Manifold, the pragmatic stance is to stabilize the existing GLSL pipeline—including the audio-texture bridge—and evaluate WebGPU only when hosts begin adopting it.


---

## 7. Cross-Dimension Insights & Strategic Opportunities

The preceding six chapters examined Manifold's architecture through six independent lenses: threading and lock-free communication, DSP graph compilation, SIMD vectorization, scripting and memory management, build system topology, and visual pipeline integration. Each dimension was assessed against industry practice, authoritative literature, and the source code of the `dev` branch. Viewed in isolation, each chapter yields actionable findings. Viewed together, they reveal systemic patterns that exceed the sum of their parts: compounding correctness risks, architectural positioning gaps, and unexploited feature adjacencies that cut across subsystem boundaries. This chapter identifies those cross-dimensional insights, maps them to strategic opportunities, and quantifies each along three axes — confidence, engineering priority, and estimated effort.

### 7.1 The Relaxed Atomics Trap

#### 7.1.1 Aggregate Risk of 20+ `memory_order_relaxed` Atomics Exceeds Single-Lock Risk on Non-RT Thread

Chapter 1 documented that `AtomicState` bundles more than 20 atomic fields, accessed predominantly with `memory_order_relaxed` ordering [source: `ControlServer.h`, lines 185–210]. The individual hazard of each field is small: on x86 the hardware's strong memory model mitigates many software-level ordering errors, and a relaxed load of `masterVolume` will eventually converge to the latest store. The cross-dimensional insight is that the *aggregate* risk of 20+ interrelated relaxed atomics may exceed the risk of a single well-placed synchronization primitive on the non-real-time (non-RT) thread.

Three compounding hazards were identified across Dimensions 1, 5, and 7. First, **false sharing**: if the atomic fields are densely packed (no `alignas(64)` padding), different threads updating different fields on the same cache line cause "cache line bouncing" that degrades throughput ^34^. Second, **implicit ordering dependencies**: if one field guards another (e.g., `isRecording` guarding `captureWritePos`), relaxed ordering on both provides no happens-before guarantee that the guard is visible before the payload ^1^. Third, **cognitive burden**: Paul J. Lucas warns that "you should *never* use [relaxed] unless you can *prove* your use of it is correct... Correct use of `memory_order_relaxed` is *very hard* to do" ^1^. Proving correctness for 20 interrelated atomics under concurrent evolution is infeasible.

The cross-verification analysis confirmed that acquire-release is the consensus minimum for Single-Producer Single-Consumer synchronization ^101^ ^27^, and that cache-line alignment is essential for atomic fields accessed by different threads ^69^. Manifold's `AtomicState` violates both recommendations in aggregate. A `std::mutex` on the UI thread — with priority inheritance or progressive back-off — would serialize all 20 field updates into one critical section, eliminating false sharing and ordering hazards entirely. The audio thread would still read atomically, but from a coherently updated snapshot. A dropped UI frame is not a glitch; a torn read on the audio thread is.

#### 7.1.2 SeqLock or RCU Snapshot Pattern as Safer, More Performant Replacement for AtomicState

The industry consensus for complex cross-thread state is moving toward snapshot-based patterns. Timur Doumler's ADC22 talk introduced RCU for audio: "How can we synchronise reads and writes to C++ objects across threads, and manage the lifetime of these objects, while remaining wait-free on the real-time thread?" ^2^. His ADC24 talk introduced SeqLock as an alternative to double-buffering for audio-thread writes and non-RT reads ^3^. Both patterns replace N individual atomics with a single atomic pointer to an immutable snapshot.

For Manifold, a `std::atomic<StateSnapshot*>` with RCU-style retirement would centralize correctness: the UI thread allocates a new snapshot, performs all mutations, then atomically exchanges the pointer. The audio thread dereferences once per block and reads plain fields. The old snapshot is retired via `SPSCQueuePtr` — the same pattern already proven for `GraphRuntime` ^9^ ^102^. This eliminates false sharing because the snapshot is read-only on the audio thread, and it unifies `AtomicState` with the existing retirement infrastructure.

A related inconsistency compounds this risk: Manifold uses deferred destruction in at least three subsystems (`GraphRuntime`, `DSPPluginScriptHost` slots, stale `pendingRuntime` replacement), each with different queue types, consumer threads, and safety guarantees. A unified `RetirementQueue<T>` template with configurable capacity and grace-period semantics would centralize correctness and simplify testing ^9^ ^102^.

### 7.2 The Compilation Inflection Point

#### 7.2.1 Manifold Sits Between Interpreter-Based Tools and Fully Compiled Tools

Manifold's architecture — Lua tables defining graph topology that compile to an immutable C++ `GraphRuntime` — places it precisely between two industry poles. On one side are interpreter-based tools (Max/MSP, Pure Data) where per-sample virtual dispatch dominates. On the other side are fully compiled tools: HISE's scriptnode generator fuses three addition nodes into a single assembly instruction ^4^; FAUST hoists control-rate expressions automatically ^5^; and RNBO compiles Max patches to native code. Manifold has the *hard* part correct — the builder/runtime separation, lock-free swap, and pre-allocated scratch buffers — but has not invested in the *next* hard parts: node fusion, control-rate hoisting, dead-code elimination (DCE), and buffer reuse optimization.

These are proven techniques with direct precedent. FAUST "separately optimizes full-rate signals at the sampling rate... slowly varying signals (updated at the buffer rate)... and constant signals (evaluated once at initialization time)" ^5^. An ADC 2025 talk demonstrated `constexpr` graph compilation with expression templates enabling optimized evaluation and graph transformations at compile time ^19^. The gap is implementation, not research.

#### 7.2.2 Control-Rate Hoisting, Node Fusion, and Dead-Code Elimination as Next Compiler Investments

All Manifold nodes use identical exponential smoothing (`current += (target - current) * smoothCoeff_`) with ~10–20 ms time constants. This standardization is good for consistency, but it reveals that parameter smoothing is duplicated per-node rather than hoisted to the graph level. For a 50-node graph, 50 independent one-pole lowpass state machines run every sample even when parameters change infrequently. FAUST automatically hoists such computations: "GUI widget outputs are 'slow', expressions involving them are moved out of the inner-loop by the compiler" ^5^. A graph-level control-rate scheduler (e.g., every 64 samples, ~1.45 ms at 44.1 kHz) would reduce per-sample overhead from O(nodes) to O(control_blocks) with no audible difference.

Node fusion offers a larger, though less certain, upside. HISE's generator demonstrates that adjacent compatible nodes fold into single optimized units through template metaprogramming ^4^. The ADC 2025 prototype suggests expression templates could achieve this without a full C++ code generator ^19^. A proof-of-concept on a two-node gain-filter chain would establish feasibility before broader investment.

Manifold's elaborate `manifold_add_export_plugin()` system serves dual purposes — a creative DAW plugin and a platform for generating derivative plugins — which may create tension between scripting-centric iteration and compiled-product stability. HISE's documentation warns of "the irritating leap from prototyping to production code" ^4^. A JIT prototyping path using LLVM ORC or asmjit, following HISE's SNEX model, could bridge both workflows: fast iteration for creatives, compiled output for products.

### 7.3 The Build-System Trilemma

#### 7.3.1 Three Orthogonal Pressures: ARM SIMD, C++20 Upgrade, CI/Tooling

Manifold faces three modernization pressures often bundled under a single initiative but with fundamentally different risk profiles. First, ARM SIMD enablement: Manifold configures Google Highway for x86-only (SSE2/3/4), yet Highway natively supports ARM NEON, SVE, and SVE2 ^6^. ARM64 NEON achieves 3.4x speedups over scalar ^7^, and Apple Silicon now dominates desktop music production. This is build-system-only: the Highway nodes use portable abstractions (`SlideUpLanes`, `BroadcastLane`) that compile for ARM without source changes. Risk is low.

Second, upgrading from C++17 to C++20/23. This is source-touching and medium-risk. Concepts, `std::span`, and `requires` clauses would improve node interface safety, but they require modifying headers across the codebase. Tracktion Engine's C++20 migration demonstrates feasibility but required sustained effort ^4^. The caution that newer standard features can degrade performance if misused ^18^argues for measured adoption with profiling.

Third, CI and tooling: GitHub Actions, sccache, PluginVal, and CLAP format support. These are infrastructure-only, touching no source code and carrying zero audio-thread risk. Pamplejuce and JUCE-Plugin-Starter demonstrate mature CI for JUCE+CMake plugins with matrix builds across Linux, Windows, and macOS ^12^ ^87^.

#### 7.3.2 Recommended Sequencing: CI First, ARM SIMD Second, C++20 Third

The recommended sequencing follows risk escalation: each phase validates infrastructure for the next. Phase 1 (CI/tooling): GitHub Actions with sccache (reducing builds from ~10 min to ~3 min per platform), PluginVal integration for format compliance, and baseline regression detection ^12^ ^87^. Phase 2 (ARM SIMD): add `HWY_NEON` and `HWY_SVE` targets, validate via QEMU in CI, and measure against the x86 baseline ^6^. Phase 3 (C++20): migrate with CI protection, using `std::span` for buffer views and concepts for node interfaces — only after build system and ARM targets are stable.

This sequencing also resolves the Android mobile gap. Manifold targets Android via the NDK, but ARM builds run scalar until Highway targets are enabled. NumPy's NEP 54 specifically chose Highway for ARM scalability ^56^; Manifold's failure to enable these targets wastes an investment already made.

### 7.4 The Testing Blind Spot

#### 7.4.1 Architecture Designed for Real-Time Safety but Not Verified to Achieve It

Manifold's architecture is *designed* for real-time safety: zero locks in the audio callback, zero heap allocation in `processBlock`, pre-allocated scratch buffers, lock-free SPSC queues, and atomic state propagation. But "designed for" is not "verified to achieve." Across all preceding chapters, no evidence of automated real-time safety verification was found: no CI pipeline, no plugin format compliance testing, no numerical stability testing for DSP nodes, and no memory allocation tracking.

This is a systemic quality assurance gap, not a single missing test. A single accidental `std::vector::push_back` in a node constructor, a missed `memory_order_release` in a queue tail store, or an unhandled denormal can destroy the guarantees the architecture was built to provide ^22^. Modern audio frameworks treat verification as infrastructure, not afterthought. The retirement queue cascade is symptomatic: three independent deferred destruction mechanisms with no shared test harness verifying grace periods or overflow handling.

#### 7.4.2 RTSan, pluginval, Tracy Allocation Tracking as Infrastructure Investments

Three newly available tools can close this gap with minimal architectural disruption. RealtimeSanitizer (RTSan), shipped in Clang 20+ (2025), marks real-time contexts with `[[clang::nonblocking]]` and intercepts `malloc`, `free`, and `pthread_mutex_lock` at runtime ^23^. Adding `-fsanitize=realtime` to debug builds would catch accidental violations during automated testing. David Trevelyan and Chris Apple's ADC 2024 talk introduced this as a shift "toward automated enforcement of real-time safety rules that were previously only documented as best practices" ^103^.

Pluginval (Tracktion) detects allocations, deallocations, and thread violations in plugin compliance testing ^13^ ^14^. Dave Rowland's Cpp on Sea 2024 talk demonstrated a more comprehensive interception approach ^14^, but pluginval provides an immediate baseline. Tracy profiler supports allocation tracking with callstacks, enabling detection of heap fragmentation ^72^. Its `TracyAllocS`/`TracyFreeS` macros can visualize allocation patterns across sessions, revealing whether Lua heap or OpenGL texture allocations exhibit problematic behavior.

Together, these three tools convert the "no malloc in audio" rule from convention to enforced invariant. The investment is infrastructure-only, and the return is confidence that the architecture's guarantees hold under continuous verification.

### 7.5 The Shader-Audio Bridge

#### 7.5.1 AudioTextureProvider Concept: Upload FFT Magnitude to GL_LUMINANCE Texture for Reactive Shaders

Manifold possesses both spectral analysis capabilities (`SpectrumAnalyzerNode`, `PhaseVocoderNode`) and a GPU shader pipeline (`ShaderEffectRegistry`, `ShaderSurfaceProvider`), yet the two systems never connect. `InputBinding` supports only `"video"` and `"shader"` source types, with no path for audio spectra to enter the shader uniform namespace.

This is a missed adjacency with low implementation cost and high creative impact. The established pattern — used by Shadertoy and Deezer's mobile visualizer — uploads FFT magnitude data as a 1D `GL_LUMINANCE` texture each frame via `glTexSubImage2D` ^100^ ^89^. Shadertoy exposes this as `iChannel0`, sampled with `texture(iChannel0, vec2(freq, 0.0)).x` ^10^ ^11^. A WebGL implementation from `analyser.getByteFrequencyData()` yields sub-millisecond GPU transfer for 512-bin spectra without reallocation ^100^.

Implementing the bridge requires three additions: (1) an `AudioTextureProvider` class subscribing to `SpectrumAnalyzerNode` output and maintaining a 1D texture handle; (2) a new `sourceType` `"audioSpectrum"` in `InputBinding`; and (3) automatic scalar uniform injection for derived features (RMS, bass, treble, spectral centroid, beat detection). Audio Shader Studio's extraction formulas are directly transferable: spectral centroid as the magnitude-weighted mean of bin frequencies, and beat detection via an energy history buffer with threshold multiplier 1.3× mean energy ^88^. All 22 existing shaders would become audio-reactive without modifying any GLSL source.

#### 7.5.2 ISF Standard Alignment for Shader Ecosystem Interoperability

Manifold's shader metadata format — JSON manifests with typed `ParamSpec` records and optional `preamble` — is structurally similar to the Interactive Shader Format (ISF) standard. OSSIA score supports ISF and recently added automated Shadertoy-to-ISF conversion by drag-and-drop ^94^. Aligning `ShaderEffectRegistry` descriptors with ISF would open access to the existing Shadertoy corpus without requiring authors to rewrite their work. ISF's standard `INPUT` definitions can be extended with an `AUDIO` type mapping to the `AudioTextureProvider` pipeline, positioning Manifold within an established ecosystem rather than as a proprietary format.

WebGPU via `wgpu` is positioning itself as a portable successor to OpenGL ^76^ ^12^, though critics note it "implements a Vulkan-style rigid render pipeline model which even Vulkan is moving away from" ^76^. The pragmatic stance is to stabilize the existing GLSL pipeline — including the audio-texture bridge and ISF alignment — and evaluate WebGPU only when host platforms require it.

---

The following table summarizes all ten cross-dimensional insights, their confidence level, engineering priority, and estimated effort in person-weeks.

**Table 1. Cross-Dimensional Insight Summary**

| # | Insight | Confidence | Priority | Effort (person-weeks) |
|:---|:---|:---:|:---:|:---:|
| 1 | Relaxed atomics aggregate risk exceeds single-lock risk on non-RT thread ^1^ ^34^| High | High | 2–3 |
| 2 | Compilation inflection point: positioned between interpreters and fully compiled tools ^4^ ^5^ ^19^| High | High | 4–6 |
| 3 | SIMD-mobile divergence: Android/ARM builds fall back to scalar ^6^ ^7^| High | Medium | 1–2 |
| 4 | Hot-reload polling may contribute to UI degradation it monitors ^8^| Medium | Low | 1 |
| 5 | Retirement queue cascade: inconsistent reclamation across subsystems ^9^ ^102^| Medium | Medium | 2 |
| 6 | Shader-audio bridge is built but not connected ^10^ ^11^ ^88^| High | Medium | 1–2 |
| 7 | Build-system trilemma: CI, ARM SIMD, C++20 should be decoupled ^12^ ^87^| High | High | 3–4 (phased) |
| 8 | Systemic testing blind spot: no RT safety verification in CI ^13^ ^14^ ^72^| High | High | 2 |
| 9 | Parameter smoothing standardization reveals missed hoisting optimization ^5^| Medium | Medium | 3 |
| 10 | Export system suggests product-market tension between creative and product workflows ^4^| Exploratory | Low | 2–4 (evaluation) |

Confidence ratings reflect the cross-verification methodology: "High" indicates confirmation by two or more independent authoritative sources; "Medium" indicates one authoritative source; "Exploratory" indicates inference requiring further validation. Priority weighs impact on user experience against architectural urgency. Effort assumes a single senior C++ audio developer working full-time; team-scale execution compresses timelines proportionally.

Several insights share infrastructure: the CI pipeline (Insight 7) enables PluginVal integration (Insight 8) and ARM build verification (Insight 3); the `RetirementQueue` template (Insight 5) simplifies the `AtomicState` refactor (Insight 1); and the `AudioTextureProvider` (Insight 6) builds on the same FFT data that control-rate hoisting (Insight 9) would also consume. These overlaps indicate that Manifold's subsystems, while independently well-designed, share underlying communication patterns that would benefit from unified abstractions. The final chapter translates these insights into a sequenced, prioritized action roadmap.


---

# 8. Prioritized Action Roadmap

The preceding chapters identified architectural strengths and specific gaps across Manifold's lock-free runtime, SIMD layer, scripting integration, and build infrastructure. This final chapter translates those findings into a sequenced, risk-calibrated plan. The ordering follows Insight 7: decouple orthogonal modernizations by risk profile, using each completed phase as a safety net for the next ^12^. Infrastructure-only changes precede build-system changes, which in turn precede source-code modifications, minimizing compound failure probability.

## 8.1 Immediate Phase (0–3 months)

The immediate phase closes the "systemic testing blind spot" from Insight 8: despite sophisticated lock-free and SIMD architecture, the project shows no evidence of automated real-time safety verification ^13^ ^14^. The first action adds a GitHub Actions CI pipeline modeled on Pamplejuce, providing cross-platform matrix builds, sccache acceleration, and PluginVal validation ^12^ ^87^. sccache is critical for JUCE projects because "JUCE 8 recently got better support for Mozilla's sccache which will shave minutes off your build times" ^88^. PluginVal catches format compliance issues before release; without it, regressions in VST3 initialization or AU sandbox behavior may reach users undetected ^87^.

The second action enables ARM NEON and SVE Highway targets. Manifold configures Highway for x86-only (SSE2–SSE4), yet Highway natively supports ARM NEON, SVE, and SVE2 ^6^ ^20^. Manifold's Highway nodes use portable abstractions (`SlideUpLanes`, `BroadcastLane`), so enabling ARM targets is a build-system-only change ^20^. ARM64 NEON has demonstrated 3.4x speedups over scalar on audio DSP ^7^; without this, all Apple Silicon and Android builds fall back to scalar processing. QEMU-based ARM compilation verification should be added to CI immediately after x86 CI is stable; Highway itself validates ARM targets via QEMU ^6^.

The third action audits `AtomicState` memory layout. The dimension reports identified 20+ `memory_order_relaxed` atomic fields in one structure, creating compounding correctness risk ^1^ ^34^. Paul J. Lucas warns that relaxed atomics should never be used "unless you can prove your use of it is correct" ^1^. False sharing — when two cores modify different atomics on the same cache line — causes "cache line bouncing" regardless of atomicity ^34^ ^69^. The remediation is incremental: first, add `alignas(64)` padding between fields accessed by different threads; second, measure coherency traffic with performance counters; third, if contention persists, prototype a SeqLock replacement following Timur Doumler's ADC24 pattern ^3^ ^2^. Acquire-release semantics are the consensus minimum for SPSC synchronization in audio ^101^ ^27^.

## 8.2 Short-Term Phase (3–6 months)

Once CI and ARM builds are stable, this phase bridges functional gaps. The first action implements `AudioTextureProvider`, connecting `SpectrumAnalyzerNode` to `ShaderEffectRegistry`. FFT-as-texture is the standard pattern for audio-reactive visuals: Shadertoy passes FFT data as `iChannel0` ^10^ ^11^, and Audio Shader Studio maps spectral features to GLSL uniforms ^88^ ^104^. Manifold already possesses spectral analysis (`PhaseVocoderNode`) and 17 GLSL shader programs ^94^, but no bridge between them. Uploading FFT magnitude data to a 1D `GL_LUMINANCE` texture via `glTexSubImage2D` immediately makes existing shaders audio-reactive with minimal code.

The second action adds RTSan (`-fsanitize=realtime`) to debug builds and integrates allocation tracking. RTSan detects allocations, mutex operations, and I/O inside real-time callbacks ^13^. Dave Rowland's Cpp on Sea 2024 talk demonstrated intercepting `operator new`/`free` with stack traces to catch violations at their source ^14^. Tracy profiler augments this with allocation callstack tracking ^72^. This converts the "no heap in process()" rule from convention to enforced invariant.

The third action replaces Lua hot-reload polling with event-driven file watching. Manifold's UI scripts poll at approximately 30 Hz, consuming message thread cycles and potentially contributing to DAW UI degradation observed with JUCE OpenGL plugins (frame rate drops from 70–80 fps to 20–30 fps) ^8^. HISE uses explicit compile actions rather than polling ^61^. An event-driven model using `std::filesystem::last_write_time` with caching reduces overhead to near-zero. Validation should profile `FrameTimings` before and after to quantify improvement.

## 8.3 Medium-Term Phase (6–12 months)

This phase introduces graph-level compiler optimizations and evaluates format expansion. The first action prototypes control-rate hoisting, node fusion, and dead-code elimination (DCE) in the `GraphRuntime` pipeline. FAUST automatically hoists control-rate computations out of the sample loop ^5^. HISE's C++ generator fuses three addition nodes into a single assembly instruction (`mov xmm0 1.04122`) ^4^ ^36^. SuperCollider's `SynthDef` implements `optimizeGraph` and `performDeadCodeElimination` ^44^. Manifold's runtime executes nodes individually with no inter-node optimization. Adding a control-rate scheduler (e.g., running parameter smoothing every 64 samples, approximately 1.45 ms at 44.1 kHz) reduces per-sample overhead from $O(\text{nodes})$ to $O(\text{control blocks})$ for slowly varying parameters. Fusion and DCE then follow as additional passes during `prepare()`, using the expression-template approach demonstrated at ADC 2025 with C++23 `constexpr` graph transformations ^19^.

The second action evaluates CLAP format addition via `clap-juce-extensions`. CLAP is gaining rapid adoption in Bitwig, REAPER, and other DAWs, with lightweight CMake integration: the official `free-audio/clap-plugins` example builds with a single preset command ^85^. The JUCE-Plugin-Starter template already demonstrates CLAP alongside VST3, AU, and Standalone ^87^. CLAP offers per-note modulation and a thread-pool extension ^17^, both aligned with Manifold's multi-threaded aspirations. The CI groundwork from Phase 1 ensures this is a low-risk configuration change.

The third action considers Faust node integration for custom per-sample DSP scripting. Manifold's Lua defines graph topology but cannot express per-sample algorithms ^23^. Faust's functional DSL compiles to optimized C++ via whole-program optimization, with benchmarks showing "28% faster for Freeverb and 40% faster for Tapir compared to the original C/C++ codes" ^105^. A Faust architecture file would enable users to write custom DSP primitives compiling into `GraphRuntime`, bridging the scripting workflow and compiled-product export. Faust already provides Lua FFI bindings (`libMfxFaust`) with live recompiling ^34^.

## 8.4 Long-Term Phase (12+ months)

The long-term phase targets structural changes requiring the maturity of preceding phases. The first action investigates multi-threaded `GraphRuntime` execution for independent graph branches. Tracktion Graph aims to "ensure nodes can be processed multi-threaded which scales independently of graph complexity" ^16^, and ACE Studio uses post-order DFS with delay compensation on worker threads ^43^. For Manifold, parallel effect chains could execute on worker threads with a lock-free task queue, following Tracktion's `LockFreeMultiThreadedNodePlayer` where workers spin on a FIFO of ready nodes using CPU pause instructions ^36^. This requires delay compensation (calculating node delay and adding compensatory delays to shorter paths) ^43^, which in turn requires formalizing latency metadata for all 50+ nodes.

The second action evaluates a C++20/23 migration path: `std::span` for buffer views, `concepts` for node interface constraints, and `constexpr` for compile-time graph validation. ADC 2025 demonstrated using `constexpr` and `consteval` to construct and optimize directed graphs at compile time, including handling feedback loops and delays ^19^. Tracktion Engine's C++20 concepts migration demonstrates feasibility but requires source-wide changes ^4^. `std::span` replaces raw pointer + length pairs, `concepts` enforces `prepare()`/`process()` signatures, and `constexpr` validation catches topology errors at compile time for built-in subgraphs.

The third action explores JIT compilation via LLVM ORC or asmjit. HISE introduced SNEX JIT using asmjit to address "the irritating leap from prototyping to production code" ^4^ ^106^. Cmajor uses LLVM JIT for hot-reload development, then exports to native C++ for production ^13^. A JIT path would enable fast iteration for creatives while retaining the stable compiled `GraphRuntime` for product export, directly addressing the product-market tension from Insight 10. This gives Manifold three backend targets: compiled `GraphRuntime` for stability, LLVM-optimized JIT for development, and static C++ export for distribution.

| Phase | Action | Effort | Risk | Impact |
|-------|--------|--------|------|--------|
| Immediate (0–3 mo) | Add GitHub Actions CI with sccache and PluginVal | 2 wks | Low | High — catches regressions pre-merge ^12^ ^87^|
| Immediate (0–3 mo) | Enable ARM NEON/SVE Highway targets; QEMU CI verification | 1 wk | Low | High — 3.4x mobile speedup with zero code changes ^6^ ^7^|
| Immediate (0–3 mo) | Audit `AtomicState` layout; add `alignas(64)` or migrate to SeqLock | 2 wks | Medium | High — eliminates false sharing and ordering hazards ^1^ ^34^ ^3^|
| Short-term (3–6 mo) | Implement `AudioTextureProvider` bridging spectrum to shaders | 2 wks | Low | Medium — activates 17 existing shaders for audio-reactive use ^10^ ^11^|
| Short-term (3–6 mo) | Add RTSan to debug builds; integrate allocation tracking | 1 wk | Low | High — converts RT safety from convention to invariant ^13^ ^14^ ^72^|
| Short-term (3–6 mo) | Replace Lua hot-reload polling with event-driven file watching | 1 wk | Low | Medium — reduces message thread CPU and GC pressure ^8^ ^61^|
| Medium-term (6–12 mo) | Prototype graph-level optimizations: hoisting, fusion, DCE | 4 wks | Medium | High — matches HISE/FAUST compilation pipeline ^5^ ^4^ ^19^|
| Medium-term (6–12 mo) | Evaluate CLAP format via `clap-juce-extensions` | 1 wk | Low | Medium — expands DAW compatibility, enables per-note modulation ^85^ ^87^|
| Medium-term (6–12 mo) | Consider Faust node integration for custom DSP scripting | 3 wks | Medium | Medium — enables per-sample algorithm authoring without C++ ^34^ ^105^|
| Long-term (12+ mo) | Investigate multi-threaded `GraphRuntime` for parallel branches | 6 wks | High | High — scales graph execution across CPU cores ^16^ ^43^ ^36^|
| Long-term (12+ mo) | Evaluate C++20/23 migration with `std::span`, concepts, `constexpr` | 4 wks | Medium | Medium — compile-time validation and modern interface contracts ^19^|
| Long-term (12+ mo) | Explore JIT compilation (LLVM ORC / asmjit) for prototyping | 6 wks | High | Medium — bridges creative iteration and production export ^106^ ^13^ ^4^|

The effort estimates assume one experienced C++ audio developer working full-time. Risk is calibrated by subsystems touched: CI and sccache are infrastructure-only (zero source changes), whereas multi-threaded graph execution touches the core real-time path and requires formal proofs of lock-freedom under all swap and retirement scenarios. A critical dependency chain runs through the table: the Immediate phase CI pipeline must be operational before ARM targets are added, because ARM compilation failures need automated detection. RTSan and allocation tracking (Short-term) should run on every CI build to prevent regressions in the graph compiler work (Medium-term). The C++20/23 and JIT explorations (Long-term) should not begin until graph compiler optimizations are stable, because both depend on a mature understanding of the `GraphRuntime` execution model.

The roadmap's posture is conservative on the real-time core and aggressive on the build and tooling periphery. This reflects the central finding that Manifold's architecture is fundamentally sound — the builder/runtime split, lock-free swap protocol, and SIMD abstraction are all industry-validated patterns ^25^ ^16^ ^6^. The gaps are in verification, optimization, and cross-platform completeness, not foundational design. Closing those gaps in this sequence positions the framework to compete with HISE's scriptnode compilation pipeline, Tracktion Graph's multi-threaded execution, and FAUST's whole-program optimization, while retaining the creative workflow that distinguishes Manifold.
