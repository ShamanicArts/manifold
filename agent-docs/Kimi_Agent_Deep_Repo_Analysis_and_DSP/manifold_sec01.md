## 1. Architecture & Threading Model

Manifold's architecture is organized around a strict three-thread separation that isolates real-time (RT) audio processing from all non-deterministic operations. This chapter examines the thread model, the lock-free inter-thread communication mechanisms that enforce it, and the graph compilation pipeline that enables runtime-safe DSP graph mutation. The analysis draws on source-level inspection of the `dev` branch, cross-referenced with established real-time audio engineering literature and contemporary lock-free programming practice.

### 1.1 Three-Thread Separation

The framework partitions work across three threads with distinct scheduling constraints and safety requirements: the Audio Thread, the Message Thread, and the Control Thread. This tripartite model is well established in professional audio software. The Sushi DAW architecture (ADC 2023) uses an analogous design where "RtEvents, via lock-free queues" mediate between non-RT threads and the audio callback [^15^]. CLAP (CLever Audio Plug-in API) formalizes this separation by marking `process()` as `[audio-thread]` and explicitly prohibiting dynamic allocation, file I/O, and locking within it [^64^].

#### 1.1.1 Audio Thread (RT)

The audio thread enters through `BehaviorCoreProcessor::processBlock`, the standard JUCE `AudioProcessor` callback invoked by the host digital audio workstation (DAW). Within this callback, Manifold delegates DSP execution to `GraphRuntime::process`, which traverses a compiled node graph in topological order. The design invariant is strict: zero locks and zero heap allocations on this path. This aligns with Ross Bencina's widely cited 2011 formulation of real-time audio constraints: "you should not allocate memory in your audio callback... The memory allocator may use a lock... may have to ask the OS for more memory... may use algorithms that take unpredictable amounts of time" [^14^].

The audio thread's responsibilities are limited to: (1) reading lock-free command queues (`SPSCQueue<256>`) for control commands from the Control Thread; (2) reading MIDI from the `MidiRingBuffer` (for hardware MIDI input); (3) executing the compiled `GraphRuntime` graph; (4) writing audio to the `AudioCaptureRing` for recording/capture; and (5) pushing JSON event payloads to the `EventRing<256>` for broadcast to IPC watchers. All memory used in `processBlock` is pre-allocated during `prepareToPlay` or during the off-audio-thread graph compilation phase. The `GraphRuntime::processSingle` implementation clears pre-allocated scratch buffers, accumulates routed inputs, and dispatches to node `process()` methods without any `std::vector` resizing, `new`/`delete` calls, or mutex operations [source: `GraphRuntime.cpp`, lines 184–349].

#### 1.1.2 Message Thread (UI / Lua)

The message thread—JUCE's message thread, on which the plugin editor and all UI rendering run—hosts the Lua engine, scene graph construction, and script compilation. Graph mutation (node registration, connection, disconnection) is performed under a `std::recursive_mutex` (`nodesMutex_` in `PrimitiveGraph`) [source: `PrimitiveGraph.cpp`, line 13]. The recursive mutex is necessary because Lua callbacks may trigger nested graph modifications (e.g., a script adding a node and then connecting it within the same call stack).

The message thread is also where `GraphRuntime` compilation occurs. When a Lua script mutates the `PrimitiveGraph`, the graph is later compiled into an immutable `GraphRuntime` via `compileGraphRuntime()`, which performs allocation, topological sorting, and scratch buffer pre-allocation entirely off the audio thread [source: `GraphRuntime.cpp`, lines 355–418]. The compiled runtime is then handed to the audio thread through an atomic pointer exchange.

UI scripts hot-reload at approximately 30 Hz via polling on this thread. As noted in cross-dimensional analysis, this polling may contribute to UI frame-rate degradation, particularly because Manifold uses OpenGL contexts (`ShaderSurfaceProvider`, `CompositeSurfaceProvider`) that forum reports indicate can reduce DAW UI performance from 70–80 fps to 20–30 fps [^421^].

#### 1.1.3 Control Thread (IPC / Network)

The Control Thread encapsulates all network and IPC (Inter-Process Communication) I/O. It runs a Unix domain socket server (`ControlServer`), an OSC (Open Sound Control) UDP server (`OSCServer`), and an OSCQuery HTTP endpoint (`OSCQueryServer`). This thread is the only thread that performs blocking I/O: `poll()` on socket file descriptors, `accept()` for incoming client connections, and `send()`/`recv()` for message transport [source: `ControlServer.h`, lines 398–424].

The architectural justification for isolating network I/O is that socket operations are inherently unbounded in latency. The Android audio team explicitly warns that "Priority inversion typically manifests as a glitch (click, pop, dropout)" when high-priority threads wait for lower-priority threads holding locks [^17^]. By confining sockets, OSC parsing, and HTTP to the Control Thread, the audio thread never blocks on network operations. Communication is mediated through the lock-free `SPSCQueue` for commands and the `EventRing` for state broadcasts.

---

The following table summarizes the division of responsibilities across the three threads.

| Responsibility | Audio Thread (RT) | Message Thread (UI / Lua) | Control Thread (IPC / Network) |
|:---|:---|:---|:---|
| DSP graph execution | `GraphRuntime::process` — topological traversal, node dispatch [source: `GraphRuntime.cpp`] | Compilation only: `compileGraphRuntime()` [source: `GraphRuntime.cpp`] | None |
| Memory allocation | Zero — all pre-allocated [^14^] | `PrimitiveGraph` mutation, Lua VM heap, scratch buffer allocation [source: `PrimitiveGraph.cpp`] | Socket buffers, JSON string construction [source: `ControlServer.h`] |
| Synchronization primitives | Lock-free atomics and SPSC queues only [^12^] | `std::recursive_mutex` (`nodesMutex_`), `std::mutex` (`graphMutationMutex`) [source: `PrimitiveGraph.h`, `BehaviorCoreProcessor.h`] | `std::mutex` (`clientsMutex`, `watchersMutex`), blocking `poll()` [source: `ControlServer.h`] |
| MIDI handling | `MidiRingBuffer` read (hardware MIDI); host MIDI forwarded to `MidiManager` [source: `BehaviorCoreProcessor.cpp`] | None | None |
| OSC / network | None | None | Unix socket server, OSC/UDP server, OSCQuery HTTP, event broadcast [source: `ControlServer.h`] |
| Lua scripting | None | Script compilation, hot-reload polling (~30 Hz), scene graph [source: insight.md] | None |
| Graph mutation | None (reads atomic `pendingRuntime` pointer only) | `PrimitiveGraph::registerNode`, `connect`, `disconnect` under `recursive_mutex` [source: `PrimitiveGraph.cpp`] | None |
| State broadcast | `EventRing::push` (JSON formatting on RT thread) [source: `ControlServer.h`] | None | `EventRing::drain` + socket broadcast [source: `ControlServer.h`] |
| Graph retirement | `SPSCQueuePtr::enqueue` for old `GraphRuntime` [source: `BehaviorCoreProcessor.cpp`] | None | `drainRetiredGraphRuntimes()` — `SPSCQueuePtr::dequeue` + `delete` [source: `BehaviorCoreProcessor.cpp`] |
| Parameter changes | `AtomicState` atomic loads (`memory_order_relaxed`) [source: `ControlServer.h`] | `AtomicState` atomic stores [source: `BehaviorCoreProcessor.cpp`] | `ControlCommand` enqueued via `SPSCQueue` [source: `ControlServer.h`] |

The thread responsibility matrix reveals a clean separation of concerns that follows the consensus architecture for professional audio software. The audio thread's footprint is deliberately minimal: it executes compiled graphs, consumes lock-free queues, and updates atomic state. All mutation, allocation, and I/O are delegated to threads with more permissive latency constraints. A notable design choice is that JSON formatting for state broadcasts occurs on the audio thread within `EventRing::push` — a lightweight but non-zero cost that trades message-thread CPU for reduced latency in event propagation. For systems with very large state surfaces or high-frequency parameter automation, this may warrant future offloading to a dedicated serialization thread.

### 1.2 Lock-Free Inter-Thread Communication

Manifold implements four distinct lock-free Single-Producer Single-Consumer (SPSC) mechanisms for cross-thread data flow. The SPSC ring buffer is "often regarded as the bread and butter data structure for concurrency in real-time audio programming" [^182^], and Manifold's adoption of this pattern across four subsystems is consistent with industry practice.

#### 1.2.1 SPSCQueue Pattern Audit

The following table catalogues each lock-free mechanism, its producer/consumer pairing, capacity, and memory ordering discipline.

| Mechanism | Producer | Consumer | Capacity | Payload | Memory Ordering (Index Sync) |
|:---|:---|:---|:---|:---|:---|
| `SPSCQueue<256>` (`commandQueue`) | Control Thread (IPC handlers) | Audio Thread (`processControlCommands`) | 256 `ControlCommand` structs [source: `ControlServer.h`] | Typed command enum + float/int params | `write`: `relaxed` local, `acquire` cross-read, `release` on store [^16^] [source: `ControlServer.h`, lines 101–124] |
| `EventRing<256>` (`eventRing`) | Audio Thread (state change JSON) | Control Thread (`drainAndBroadcastEvents`) | 256 pre-formatted JSON char arrays (MAX_JSON_PAYLOAD_SIZE bytes each) [source: `ControlServer.h`] | JSON string + length | `write`: `relaxed` local, `acquire` cross-read, `release` on store [source: `ControlServer.h`, lines 137–168] |
| `MidiRingBuffer` (`midiInputRing`) | Audio Thread (hardware callback) | Audio Thread (`processBlock`) | 256 packed 32-bit words [source: `MidiRingBuffer.h`] | Packed MIDI (status\|data1\|data2\|timestamp) | `write`: `relaxed` local, `acquire` cross-read, `release` on store [source: `MidiRingBuffer.h`, lines 35–73] |
| `AudioCaptureRing` | Audio Thread (interleaved stereo) | Writer Thread (`audioWriterThread`) | ~1,048,576 floats (~4 MB, ~11.6 s @ 44.1 kHz stereo) [source: `ControlServer.h`] | Interleaved stereo float buffer | `write`: `relaxed` local, `acquire` cross-read, `release` on store; bitwise-AND wrap via power-of-2 capacity [^186^] [source: `ControlServer.h`, lines 260–294] |
| `SPSCQueuePtr<64>` (`retireQueue`) | Audio Thread (graph swap) | Message Thread (`drainRetiredGraphRuntimes`) | 64 `GraphRuntime*` pointers [source: `BehaviorCoreProcessor.h`] | Raw pointer to retired runtime | `write`: `relaxed` local, `acquire` cross-read, `release` on store [source: `BehaviorCoreProcessor.h`, lines 34–62] |

All five implementations share the same fundamental structure: a fixed-capacity ring buffer, atomic write and read indices, and acquire-release pairing for cross-thread synchronization. The producer writes data to the buffer slot, then updates its write index with `memory_order_release`; the consumer loads the producer's index with `memory_order_acquire`, which synchronizes with that release and guarantees visibility of the written data [^250^][^251^]. This is the minimal correct memory ordering for SPSC queues. Local reads of a thread's own index use `memory_order_relaxed`, which is safe because a thread always sees its own writes in program order [^18^].

The `AudioCaptureRing` employs a power-of-2 capacity ($2^{20}$ = 1,048,576 floats), enabling index wrapping via bitwise-AND (`& (CAPACITY - 1)`) rather than modulo. Doug Richardson's assembly-level analysis confirms this optimization generates the tightest loop on x86 [^186^]. The large capacity supports continuous retrospective recording — a pattern used by DAWs including Pro Tools QuickPunch and Bitwig's MIDI Capture [^218^][^219^].

One concern is cache-line alignment. The Disruptor pattern demonstrates that padding atomic sequence numbers to isolate them on their own cache lines prevents false sharing, where "updating 8 bytes of data also invalidates 56 neighboring bytes" [^183^][^189^]. None of Manifold's SPSC implementations explicitly align atomic indices to cache-line boundaries using `alignas(std::hardware_destructive_interference_size)` or explicit padding. On a 64-byte cache-line architecture (all modern x86 and ARM64), the `writeIdx` and `readIdx` atomics in each queue are adjacent in the struct layout and will share a cache line, causing coherency ping-pong when producer and consumer threads run on different cores. Benchmarks suggest cache-line padding can improve SPSC throughput by an order of magnitude under contention [^189^][^250^].

#### 1.2.2 Memory Ordering Analysis: The `AtomicState` Risk Surface

Manifold's `AtomicState` struct contains over 20 atomic fields — tempo, target BPM, sample rate, capture state, record flags, layer states — that are read and written across threads, predominantly with `memory_order_relaxed` [source: `ControlServer.h`, lines 185–210]. The audio thread loads these fields every callback; the message and control threads store them in response to UI events, OSC messages, and Lua script execution.

Paul J. Lucas's warning on `memory_order_relaxed` is direct: "you should *never* use it unless you can *prove* your use of it is correct *and* it actually significantly improves performance. Correct use of `memory_order_relaxed` is *very hard* to do" [^59^]. The risk in `AtomicState` is not that any individual relaxed atomic is incorrect — a relaxed load of `masterVolume` by the audio thread will eventually see the store from the UI thread — but that the *aggregate* of 20+ relaxed atomics creates compounding hazards.

Three specific hazards are present. First, **false sharing**: if the atomic fields are densely packed (the struct contains no explicit padding), different threads updating different fields on the same cache line will cause "cache line bouncing" [^56^]. Second, **implicit ordering dependencies**: if one field is used to guard another (e.g., `isRecording` guarding the validity of `captureWritePos`), relaxed ordering on both provides no guarantee that the guard is visible before the payload. Third, **cognitive burden**: no single developer can simultaneously prove correctness of 20 interrelated relaxed atomics, particularly as the codebase evolves and new fields are added.

The industry consensus for complex cross-thread state is moving toward snapshot-based patterns. Timur Doumler's ADC22 talk introduced RCU (Read-Copy-Update) for audio: "How can we synchronise reads and writes to C++ objects across threads, and manage the lifetime of these objects, while remaining wait-free on the real-time thread?" [^90^]. His ADC24 talk introduced SeqLock as an alternative to double-buffering for the case where the audio thread writes and non-RT threads read [^95^]. Both patterns replace N individual atomics with a single atomic pointer to an immutable snapshot, which is easier to verify and often more performant under contention (fewer cache lines touched). For `AtomicState`, a medium-term refactor toward `std::atomic<StateSnapshot*>` with RCU-style retirement would centralize correctness and eliminate the false-sharing risk entirely.

#### 1.2.3 Retirement Queue Cascade: Inconsistent Reclamation Strategies

When the audio thread atomically swaps the active `GraphRuntime` pointer, the old runtime cannot be `delete`d immediately because the audio thread may still hold references to it at the moment of exchange. Manifold solves this with a retirement queue: the old pointer is pushed to `SPSCQueuePtr<64>` from the audio thread; the message thread drains the queue and calls `delete` after ensuring the audio thread has moved on [source: `BehaviorCoreProcessor.cpp`, lines 2232–2238]. This is the textbook RCU-style deferred destruction pattern. Jatin Chowdhury describes it as the "wait-free" solution for UI-to-audio parameter passing at scale [^10^].

However, the retirement pattern is not applied uniformly. At least three subsystems implement deferred destruction independently:

1. **`GraphRuntime` retirement** via `SPSCQueuePtr<64>` (`retireQueue`) in `BehaviorCoreProcessor`. The audio thread enqueues old runtimes during `checkGraphRuntimeSwap()`; the message thread drains via `drainRetiredGraphRuntimes()` under a `std::mutex` [source: `BehaviorCoreProcessor.cpp`, lines 3209–3232].

2. **`DSPPluginScriptHost` slot retirement** via `pendingSlotDestroy`, a `std::vector<std::unique_ptr<DSPPluginScriptHost>>`. When a Lua script unloads a DSP slot, the host is moved to this vector rather than destroyed immediately, because `sol::state` (the Lua VM) cannot be destructed from within a Lua callback [source: `BehaviorCoreProcessor.h`, line 449]. The vector is drained by `drainPendingSlotDestroy()` on the message thread. This mechanism uses no lock-free queue — it relies on message-thread-only access to the vector.

3. **`pendingRuntime` stale replacement** in `requestGraphRuntimeSwap()`. If the message thread submits a new runtime while an old `pendingRuntime` has not yet been picked up by the audio thread, the old pending pointer is `delete`d immediately (not retired) [source: `BehaviorCoreProcessor.cpp`, lines 2053–2064]. This is safe because `pendingRuntime` is only read by `checkGraphRuntimeSwap()` on the audio thread, and the exchange uses `memory_order_release`, but it represents a third distinct lifetime management strategy.

The inconsistency creates maintenance risk. Each subsystem has different queue types, different consumer threads, and different safety guarantees. A unified `RetirementQueue<T>` template with configurable capacity, consumer thread affinity, and grace-period semantics (e.g., requiring N audio callbacks before destruction) would centralize correctness and make the invariants explicit.

### 1.3 Graph Compilation and Runtime Swap

Manifold's graph execution pipeline separates mutable graph construction from immutable runtime execution — a pattern found in HISE's scriptnode, SuperCollider's SynthDef, and Tracktion Graph [^66^]. This separation is the architectural foundation that enables lock-free graph mutation: the message thread modifies the builder graph, compiles a frozen runtime, and atomically swaps it into the audio thread.

#### 1.3.1 PrimitiveGraph to GraphRuntime Compilation Pipeline

The builder-side graph is `PrimitiveGraph`, owned by the message thread and protected by `nodesMutex_`. It stores nodes as `std::shared_ptr<IPrimitiveNode>` in a vector, maintains connection adjacency lists, and provides `registerNode`, `connect`, `disconnect`, and `setNodeRole` operations — all under `std::recursive_mutex` [source: `PrimitiveGraph.cpp`]. A node role (`InputDSP`, `Monitor`, `OutputDSP`, `SidechainInputDSP`, or `Unspecified`) determines how the runtime routes host input and mixes output.

Compilation is triggered by `PrimitiveGraph::compileRuntime()`, which delegates to the free function `compileGraphRuntime()` [source: `PrimitiveGraph.cpp`, line 373]. The compilation pipeline performs six steps, all off the audio thread:

1. **Topological order computation** via depth-first search (`buildTopologicalOrder`). Cycle detection is performed using `visitInProgress_` flags on nodes; if a cycle is detected, compilation fails [source: `PrimitiveGraph.cpp`, lines 301–349].

2. **Compiled node list construction**: Each node is wrapped in a `CompiledNode` struct that captures its `shared_ptr`, role, and I/O counts. The `shared_ptr` ensures the node remains alive as long as the runtime references it [source: `GraphRuntime.cpp`, lines 371–382].

3. **Routing table snapshot**: All `Connection` objects (source node, target node, output index, input index) are captured into a flat `std::vector<RouteEntry>`. This is critical — the runtime never reads mutable node connection lists during `process()`; it operates entirely on the compiled routing snapshot [source: `GraphRuntime.cpp`, lines 388–408].

4. **Scratch buffer pre-allocation**: For each compiled node, the runtime allocates input and output scratch `juce::AudioBuffer<float>` instances sized to `(numChannels_, maxBlockSize_)`. Additionally, chunk buffers (`chunkBuffer_`, `rawChunkBuffer_`, `sidechainChunkBuffer_`) and input accumulators are pre-allocated [source: `GraphRuntime.cpp`, lines 27–88]. This satisfies the pre-allocation invariant: no allocation occurs in `process()`.

5. **Node `prepare()` dispatch**: Each node's `prepare(sampleRate, maxBlockSize)` is called, giving nodes the opportunity to allocate internal state (delay lines, filter histories, wavetable memory) before the audio thread begins [source: `GraphRuntime.cpp`, lines 61–64].

6. **Validity flag**: `isValid_` is atomically set to `true` only after all allocations succeed [source: `GraphRuntime.cpp`, line 87].

The compiled `GraphRuntime` is immutable after `prepare()`: its topology (`compiledNodes_`, `routes_`) is fixed, and its scratch buffers are pre-allocated. This immutability is the key enabler of lock-free audio-thread execution. Timur Doumler's formulation of the pattern is precise: "Instead of modifying the data structure in-place, the message thread peels off a copy that contains the modification, while the audio thread still looks at the previous version for however long it needs to" [^89^].

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

This is a known challenge in audio graph systems. Tracktion Graph documentation flags it as a concern for graph continuity during swaps [^72^]. Manifold's current implementation does not provide a generic mechanism for migrating node state across graph recompilations. If a user adds a delay node to a running graph, the new delay line starts empty, producing a discontinuity. If a filter's cutoff is being modulated and the graph is recompiled, the filter's internal z⁻¹ states are lost.

Potential solutions, ordered by architectural impact, include: (1) **Node-level state export/import**: Each `IPrimitiveNode` could implement `serializeState()` / `deserializeState()` methods, and the compilation pipeline could match nodes by identity (or by path/UUID) to carry state forward. (2) **Graph-level state snapshot**: Before swapping, the old `GraphRuntime` could serialize the entire node state vector to a flat buffer; after swapping, the new runtime could restore matched nodes. (3) **Live graph mutation**: Instead of full recompilation, support limited in-place mutation (adding a leaf node, changing a parameter) without rebuilding the runtime. This is more complex but eliminates the continuity problem entirely.

Ableton Link addresses a related problem with its `capture()` / `commit()` API: the audio thread captures a thread-local snapshot of session state, and non-RT threads commit modifications. "It's important that this audio-thread specific interface only be used from the audio thread" [^88^]. Manifold's `AtomicState` serves a similar purpose for scalar parameters, but there is no equivalent for structured node state.

The state continuity gap is the most significant unresolved architectural risk in Manifold's graph compilation pipeline. For creative applications where graph topology changes frequently during performance (live coding, generative patching), audible discontinuities from state loss may limit the utility of runtime graph mutation. A state migration framework, possibly using the same retirement-queue infrastructure to quarantine old node state until the new graph is confirmed running, would address this without compromising the lock-free audio path.
