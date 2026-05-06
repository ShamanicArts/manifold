## 4. Scripting, Memory & Real-Time Safety

Audio plugin frameworks that expose scripting to end users face a fundamental tension: interpreted languages enable rapid iteration and expressive graph construction, yet their memory management characteristics are incompatible with real-time audio callbacks. Manifold resolves this by splitting scripting across two isolated Lua virtual machines (VMs), pre-allocating all audio-thread memory during initialization, and compiling Lua-defined graphs into lock-free C++ runtime structures. This chapter examines the dual-VM architecture, the memory allocation discipline, and the verification gaps between architectural intent and runtime guarantee.

### 4.1 Dual Lua VM Architecture

Manifold hosts two separate Lua 5.4 VMs, each bound to C++ through sol2 and restricted to the JUCE message thread. The separation is a safety boundary derived from industry consensus: garbage-collected scripting languages must never execute inside the audio callback. Cantabile's documentation states that ".NET expressions can't be used on the audio thread, because to call them would introduce the possibility of audio glitches if the .NET garbage collector happens to run" [^148^]. REAPER's ReaScript API enforces the same rule: "Must only call from the main thread" for every audio accessor [^137^]. Manifold internalizes this constraint by design — Lua never runs on the audio thread.

#### 4.1.1 LuaEngine (UI VM): Canvas/RuntimeNode Scene Graph

The `LuaEngine` class in `primitives/scripting/LuaEngine.h` hosts the UI-facing VM. It binds JUCE `Canvas` and `RuntimeNode` objects to Lua usertypes, exposes `command()` for `ControlServer` message posting, and pushes processor-state snapshots at every timer tick. The header comment is explicit: "ALL methods must be called on the message thread only." Hot-reload polls at approximately 30 Hz via `HOT_RELOAD_CHECK_INTERVAL = 30` in `LuaCoreEngine.cpp` [^121^]. HISE supports a similar "jump back to the interpreted version with a single click" workflow [^70^], and Cmajor's JIT plugin auto-rebuilds patches without restart [^68^]. The polling model trades a small deterministic CPU cost for simplicity. An event-driven file-watcher alternative — using `std::filesystem::last_write_time` with caching or platform-specific watchers — could reduce overhead to near zero, but the current mechanism is consistent with known working patterns in production audio software.

`LuaEngine` also handles OSC callbacks. When an OSC message arrives, `invokeOSCCallback()` executes on the message thread if a handler is registered. This queuing model mirrors SuperCollider's OSC-to-scsynth dispatch [^90^] and prevents message-thread work from spilling into sample-level timing. Synthesizer V Studio uses the same pattern: its scripting API distinguishes "data objects" (tracks, notes) from "UI state objects" (playback control), with all script execution confined to the message thread [^87^].

#### 4.1.2 DSPPluginScriptHost (DSP VM): buildPlugin(ctx) Graph Construction

`DSPPluginScriptHost` manages the DSP graph definition VM. User scripts implement `buildPlugin(ctx)`, returning a Lua table describing node topology, connections, and parameter bindings. The table compiles into a `GraphRuntime` — a frozen C++ object graph executing on the audio thread with no Lua involvement. The pattern is now standard in the field. HISE's scriptnode compiles visual graphs to C++ classes, collapsing three addition nodes into a single assembly instruction [^72^]; Cmajor exports LLVM-JIT patches to native C++ for production plugins [^68^]. Manifold follows the same paradigm — Lua defines structure, compiled C++ executes it.

This architecture sidesteps the performance chasm between interpreted and compiled DSP. Benchmarks from the music-dsp community show that pure Lua is approximately ten times slower than C for sample-level processing, and even LuaJIT — which compiles to native code via tracing JIT — introduces non-deterministic compilation pauses that are unacceptable in a real-time callback [^12^]. Faust, a domain-specific language for DSP, compiles to C++ at approximately 320% of hand-coded C speed [^56^]. By keeping Lua strictly off the audio thread and compiling graph definitions to C++ before execution, Manifold captures the ergonomics of scripting without paying its runtime penalty.

Graph mutations are deferred. `DSPPluginScriptHost` enqueues changes into a background worker (`ensureDeferredWorkerStarted()`), which compiles a new `GraphRuntime` and requests an atomic swap via `requestGraphRuntimeSwap()`. The old runtime retires to an `SPSCQueuePtr` rather than being destroyed inline, eliminating use-after-free hazards. This is the retirement-queue pattern recommended for lock-free audio systems [^20^]. The `BehaviorCoreProcessor` holds both an `activeRuntime` pointer (read by the audio thread) and a `pendingRetireRuntime` pointer (queued for destruction on the message thread), ensuring that the audio callback never observes a half-constructed or half-destroyed graph.

#### 4.1.3 sol2 Configuration: SOL_ALL_SAFETIES_ON=1, SOL_SAFE_NUMERICS=0

`sol2` is configured with `SOL_ALL_SAFETIES_ON=1` in `LuaCoreEngine.cpp`, enabling safe usertype getters, reference validation, function-call arity checks, and numeric-range guards [^125^]. For a framework exposing C++ objects to user scripts, these checks catch nil dereferences, wrong-type arguments, and stack underflows. Real-world sol2 overhead is approximately 50 ns per C++ function call versus 1–2 ns for pure Lua [^67^] — negligible on the message thread at 30 Hz. Member function calls measure around 200 ns [^67^], still acceptable for graph construction where a single `buildPlugin(ctx)` call may define dozens of nodes in one invocation.

Manifold leaves `SOL_SAFE_NUMERICS` at its default 0, so float-to-double conversions are not precision-checked. This is appropriate: DSP graphs are overwhelmingly floating-point, and precision guards add overhead without catching meaningful bugs where `float` is the intentional type. The sol2 documentation notes that `SOL_ALL_SAFETIES_ON` "currently prioritizes safety over speed" [^117^]; relaxing numerics checks is a defensible tradeoff for float-heavy audio work.

| Aspect | LuaEngine (UI VM) | DSPPluginScriptHost (DSP VM) |
|--------|-------------------|------------------------------|
| Primary role | Canvas/RuntimeNode scene graph, ImGui-style UI | `buildPlugin(ctx)` DSP graph definition |
| Thread affinity | JUCE message thread only | JUCE message thread only |
| Hot-reload mechanism | ~30 Hz polling via `checkHotReload()` | Deferred mutation worker, atomic graph swap |
| C++ bindings | Canvas, Graphics, `command()`, file choosers | `ctx` API: `setParam`, `getParam`, `getSampleRate` |
| OSC integration | `invokeOSCCallback()` / `invokeOSCQueryCallback()` | None (graph-level param registry only) |
| Memory per usertype | ~4–8 KB per bound type [^101^] | Same overhead; graph compiled away before audio thread |
| Lifecycle guard | `std::recursive_mutex` around sol::state | `pendingSlotDestroy` retirement vector |
| Industry parallel | Synthesizer V Studio UI scripting [^87^] | HISE scriptnode C++ compilation [^72^] |

The two-VM model is an architectural firewall. A UI script bug — an infinite loop in `ui_update()`, a malformed Canvas node — cannot corrupt the DSP graph because the VMs share no state. The `DSPPluginScriptHost` does not expose Canvas bindings, and `LuaEngine` has no access to `GraphRuntime` internals. This separation directly mirrors SuperCollider's scsynth/sclang split [^90^] and Max/MSP's scheduler/audio-graph boundary, both proven in professional production environments for over two decades.

### 4.2 Memory Management Patterns

Real-time audio programming operates under one non-negotiable rule: no dynamic allocation in the audio callback. Bencina's canonical 2011 essay identifies three hazards: allocator locks contended by all threads; OS paging to or from disk; and unpredictable worst-case allocation timing [^20^]. Manifold enforces this rule through pre-allocation: every buffer, scratch region, and SIMD state vector is allocated in `prepare()` and reused without resize during `process()`.

#### 4.2.1 Pre-allocation Strategy: All Scratch Buffers in prepare()

`GraphRuntime::prepare()` in `primitives/scripting/GraphRuntime.cpp` is the central allocation site. For each compiled node, it creates a pair of `juce::AudioBuffer<float>` scratch buffers — input accumulation and output write-back — sized to `maxBlockSize_`. It also pre-allocates `chunkBuffer_`, `rawChunkBuffer_`, and `sidechainChunkBuffer_` for the chunked processing path when host blocks exceed `maxBlockSize_`. The `inputViews_` and `outputViews_` vectors are `reserve()`-d to maximum sizes, and `inputAccumulators_` are sized for the widest bus count across all nodes.

This implements the "3-scope rule": initialization scope holds all allocation; real-time scope holds zero; non-real-time scope holds heavy or non-deterministic work [^1^]. The `process()` and `processSingle()` methods operate entirely on pre-allocated memory. The chunked path uses `std::memcpy` between existing pointers, never `new` or `malloc`. A comment at line 67 of `GraphRuntime.cpp` is explicit: "Preallocate buffers used during processing (audio thread)."

One subtle hazard remains: `juce::AudioBuffer::setSize()` with `avoidReallocating=true` only prevents reallocation if neither channel count nor sample length increases [^239^]. `CaptureBuffer` calls `setSize()` without passing `avoidReallocating`, relying on the default `false`. Since these calls are initialization-time only, this is safe, but it reinforces the need for review discipline: any `setSize()` without `avoidReallocating=true` must be provably outside the real-time scope. Nathan Blair's thesis identifies this as a well-documented "foot-gun" for JUCE beginners [^218^].

#### 4.2.2 Highway-Aligned Allocation: SIMD State Vectors

Highway SIMD nodes allocate state with `hwy::AllocateAligned<float>(numLanes)`. `BitCrusherNode_Highway.h` allocates `currentState_`, `smooth_`, `holdCounters_`, `heldSample_`, and `laneNumber_` through this interface. Highway guarantees alignment to at least the SIMD register width for the current target, and on some platforms to cache-line boundaries (64 bytes), preventing false sharing under concurrent access [^36^][^284^].

Allocation occurs in `configure()`, called from `prepare()`. The node lazily initializes its `simd_implementation_` pointer in `prepare()` if null, then forwards to the Highway layer. Pointers are wrapped in `hwy::AlignedFreeUniquePtr<float[]>`, ensuring Highway's aligned deleter runs on destruction and avoiding undefined behavior from mismatched `delete`.

#### 4.2.3 CaptureBuffer Circular Buffer: juce::AudioBuffer Backing with Per-Channel offsetToNow

`CaptureBuffer` in `primitives/dsp/CaptureBuffer.h` implements a multi-channel circular buffer over a `juce::AudioBuffer<float>`, with a `std::vector<int>` `offsetToNow` tracking write heads per channel. The `write()` method advances via modulo: `offsetToNow[channel] = (offsetToNow[channel] + 1) % bufferSize`. The `getSample()` read path wraps with a `while (idx < 0) idx += bufferSize` loop — acceptable since reads are not the hot path in typical capture scenarios.

The backing buffer is resized in `setSize()` with `keepExistingContent=true`. These are setup-time methods, safe from the audio callback. The modulo operator `%` in `writeBlock()` could be replaced with bitwise masking for power-of-two sizes, eliminating integer division overhead in the per-sample path. For retrospective capture or granulator read heads that may access the buffer thousands of times per block, this optimization would be measurable.

| Scope | Manifold Implementation | Industry Best Practice | Risk / Notes |
|-------|------------------------|------------------------|--------------|
| **Initialization** (`prepare()`) | `juce::AudioBuffer` scratch pairs per node; `hwy::AllocateAligned` SIMD state; `CaptureBuffer` backing | All scratch, FFT plans, delay lines allocated here [^1^] | `setSize()` without `avoidReallocating=true` must be provably outside `process()` [^239^] |
| **Real-time** (`process()`) | `std::memcpy` into pre-allocated chunks; `clear(0, numSamples)` on scratch; no heap | Zero allocation; zero locks; zero I/O [^20^] | `inputViews_.clear()` + `push_back()` are safe because capacity reserved in `prepare()` |
| **Non-real-time** (UI, reload, worker) | `compileGraphRuntime()` builds new runtime; old runtime retires to `SPSCQueuePtr` | SPSC queues for deferred destruction [^290^]; RCU for wait-free reads [^90^] | `pendingSlotDestroy` accumulates old hosts; consumer thread must be non-RT |

The table confirms that Manifold's allocation discipline is architecturally correct across all three scopes. Every audio-thread buffer is claimed before `process()` begins, and every obsolete object is retired rather than destroyed inline. The retirement queue pattern, in particular, is a critical but under-documented technique in audio programming: when a non-real-time thread replaces an object that the audio thread may still reference, immediate deletion risks use-after-free. By queuing old `GraphRuntime` instances and `DSPPluginScriptHost` slots for later cleanup, Manifold avoids this hazard without blocking the audio thread [^290^].

One refinement worth considering is memory consolidation. `GraphRuntime` currently allocates independent `chunkBuffer_`, `rawChunkBuffer_`, `sidechainChunkBuffer_`, and per-node scratch pairs as separate `juce::AudioBuffer` objects. Each allocation incurs allocator overhead and may fragment the heap over long sessions. A single arena allocation in `prepare()`, manually partitioned into contiguous sub-regions, would improve cache locality and make memory profiling simpler [^285^]. The `std::pmr::monotonic_buffer_resource` approach demonstrated by Timur Doumler at CppCon 2021 — backed by pre-allocated stack or thread-local storage with `std::pmr::null_memory_resource()` as upstream — provides a standard, testable path to this consolidation [^285^].

### 4.3 Real-Time Safety Verification Gap

A codebase can follow every real-time best practice and still fail in production if a single `std::vector::push_back` or errant `new` slips into the audio callback. Verification infrastructure — automated testing, static analysis, and runtime instrumentation — converts architectural intent into guarantee. In the reviewed Manifold codebase, this infrastructure is largely absent.

#### 4.3.1 No pluginval, RTSan, or Allocation Interception in CI

`pluginval`, developed by Tracktion engineer David Rowland, stress-tests plugins under extreme parameter automation and buffer-size variation, and can be configured to fail on any audio-thread allocation [^68^]. The Real-Time Sanitizer (RTSan), introduced in Clang 20 (2025), intercepts `malloc`, `free`, and mutex locks in threads marked with `[[clang::realtime]]`, producing immediate compile-time or runtime errors [^68^]. Neither tool appears in the Manifold codebase or its build configuration.

Manual interception is also possible: overriding `operator new`/`delete` with assertion-fail logic in debug builds, or integrating Tracy profiler's `TracyAllocS`/`TracyFreeS` macros to visualize heap operations with full callstacks [^276^]. Tracy's allocation tracker has been used to detect heap fragmentation in real-time audio by surfacing allocation lifetime and frequency patterns. Without any of these mechanisms, Manifold's "no allocation in `process()`" rule remains a coding convention rather than an enforced invariant. A single contributor calling `push_back` inside a node's `process()` method would break the guarantee silently, and no automated test would catch it.

#### 4.3.2 No Denormal Handling Visible in Reviewed Nodes

Denormal floating-point numbers — magnitudes below approximately $1.18 \times 10^{-38}$ for IEEE 754 single precision — cause severe performance degradation on x86 without flush-to-zero (FTZ), because they fall out of the normal fast path through the floating-point unit and into microcode emulation. A filter with a long feedback path, a reverb tail, or any recursive smoothing algorithm can push samples into the denormal range during silence or decay phases.

A systematic search for `flushDenormalToZero`, `_MM_SET_FLUSH_ZERO_MODE`, `_mm_setcsr`, or manual denormal detection returned no matches in any production DSP node or processor class. The only `std::isnan` references appear in the standalone `dsp_simd_test` harness. If a user builds a graph containing a long-tailed shimmer or a high-Q filter, the plugin may experience 10–100x CPU spikes during silent passages as the host DAW processes denormals in microcode. JUCE provides `juce::FloatVectorOperations::disableDenormalisedNumberSupport()` as a portable helper that sets the appropriate FTZ flags, but there is no evidence of its use in the reviewed code.

#### 4.3.3 No Automated Numerical Stability Testing

Beyond allocation and denormals, numerical stability is the third pillar of real-time safety. DSP nodes performing quantization, waveshaping, or recursive filtering can produce NaN or infinity when parameters reach extremes — for example, a rate-reduction of zero dividing by zero in a hold-interval calculation, or a feedback coefficient exceeding unity in an IIR loop. None of the reviewed nodes contain explicit NaN or infinity guards. The `BitCrusherNode` scalar fallback uses `juce::jlimit(-1.0f, 1.0f, x)` on quantized outputs, which bounds amplitude but does not intercept NaN propagation from upstream nodes or invalid parameter combinations.

The absence of automated numerical testing means edge-case parameter combinations are discovered through manual QA or user reports. A headless harness — instantiating each node with fuzzed parameters, driving impulse and silence buffers, and asserting `!std::isnan(output)` and `!std::isinf(output)` — would catch these defects at build time. Such harnesses are standard in mature frameworks: Tracktion validates every node against a reference implementation, and JUCE's own `dsp` module includes numerical tests for its filter implementations.

Manifold's architecture is *designed* for real-time safety: lock-free graph swapping, pre-allocated scratch buffers, Lua excluded from the audio thread, and Highway-aligned SIMD state. But "designed for" is not "verified to achieve." The recommended remediation is sequential and low-risk: first, a debug-build `operator new` override asserting on audio-thread allocation; second, `pluginval` integrated in CI; third, Clang RTSan in a dedicated debug configuration; fourth, a headless numerical-stability harness for all nodes. Each step is independent, and each would raise confidence in the entire architecture from "believed safe" to "demonstrably safe."
