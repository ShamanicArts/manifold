# The Duda Review: Manifold Code Audit

*A comprehensive code review of the Manifold audio plugin/DSP runtime environment, conducted March 2025.*

---

## Executive Summary

**First, the important shit:** This is not "a looper with DSP." This is a **scriptable DSP runtime environment** that happens to include looper primitives. Think Reaktor meets Max/MSP but with Lua scripting and compiled lock-free graph execution. For a first plugin, the architecture is surprisingly mature. The core ideas are sound - lock-free graph compilation, Lua on message thread only, ImGui for dynamic UI.

**The caveat:** There are rough edges that need fixing before this ships to users. Raw pointer fuckery, manual memory management, and some questionable performance decisions that'll bite you when users abuse this in ways you can't predict.

**Verdict:** B+ for architectural vision, C+ for execution details. Fix the memory issues, profile before optimizing, and this becomes a serious platform.

---

## The Good (Don't Fuck This Up)

### 1. Lock-free Graph Architecture

The `GraphRuntime` compile-then-swap pattern is **exactly right**. You compile the node graph on the message thread (Lua side), pre-allocate all scratch buffers, then atomic-swap the runtime pointer for the audio thread. No locks in `processBlock()`. No allocations on the audio thread. This is how professional DSP should be done.

```cpp
// Message thread
auto newRuntime = compileGraphRuntime(graph, sr, blockSize, 2);
processor->requestGraphRuntimeSwap(std::move(newRuntime));

// Audio thread (in processBlock)
checkGraphRuntimeSwap();  // Atomic exchange, no locks
```

The `SPSCQueuePtr<>` for retiring old runtimes is smart - you don't delete from the audio thread, you queue for deletion on the message thread.

### 2. Lua VM Containment

You kept Lua on the **message thread only**. This is the most common mistake in scriptable plugins - people try to call sol2 from the audio thread and wonder why they get dropouts. You compile the graph to C++ node objects, then Lua just controls parameters from the message thread. Correct.

### 3. Node Topology Compilation

Building the routing table at compile time into a flat `RouteEntry` array means the audio thread just iterates - no graph traversal, no hash lookups during `process()`. For a 40-node graph, you're doing 40 array iterations instead of pointer-chasing through a graph structure. Cache-friendly.

### 4. ImGui for Dynamic UI

Using ImGui inside JUCE OpenGL contexts for the UI was the right call. When your UI is entirely user-scripted, JUCE's component hierarchy is a nightmare. ImGui's immediate mode means the Lua script can define arbitrary layouts without you having to instantiate JUCE components dynamically.

The `ImGuiHost` pattern - queueing JUCE events, processing them in `renderOpenGL()` - is correct. You're not fighting ImGui's single-context assumption.

### 5. The Slot System Architecture

Initially looked over-engineered, but now I get it. Named DSP slots (`/core/behavior`, `/core/slots/X`) with isolated Lua VMs and graphs enable:

- Multiple plugin instances in one host
- A/B testing different DSP algorithms
- Plugin-within-plugin architecture

The path rewriting (`/core/behavior` → `/core/slots/X`) is namespace isolation for OSC control. Complex, but the feature demands it.

---

## The Bad (Fix This Shit)

### 1. Raw Pointer Fuckery in GraphRuntime Swap

**Location:** `BehaviorCoreProcessor.h`, `requestGraphRuntimeSwap()`

```cpp
dsp_primitives::GraphRuntime* oldPending = pendingRuntime.exchange(
    runtime.release(), std::memory_order_release);
if (oldPending != nullptr) {
    delete oldPending;  // WHAT THE FUCK
}
```

This is 2025. You're manually `new`/`delete`ing in a C++17 codebase with `std::unique_ptr` available. If an exception happens in `exchange()`, you leak memory. If the audio thread sees a half-written pointer (even with atomics), you have UB.

**Fix:** Use `std::atomic<std::shared_ptr<GraphRuntime>>` or at least `std::unique_ptr` with a proper atomic exchange. The `std::atomic<std::shared_ptr>` specialization exists for exactly this use case.

```cpp
// Better:
std::atomic<std::shared_ptr<GraphRuntime>> pendingRuntime;

void requestGraphRuntimeSwap(std::shared_ptr<GraphRuntime> runtime) {
    auto old = pendingRuntime.exchange(std::move(runtime));
    // old goes out of scope naturally, no delete
}
```

### 2. The toPrimitiveNode Switch Statement From Hell

**Location:** `DSPPluginScriptHost.cpp`, ~60 cases

```cpp
if (obj.is<std::shared_ptr<dsp_primitives::PlayheadNode>>()) {
    return obj.as<std::shared_ptr<dsp_primitives::PlayheadNode>>();
}
if (obj.is<std::shared_ptr<dsp_primitives::PassthroughNode>>()) {
    return obj.as<std::shared_ptr<dsp_primitives::PassthroughNode>>();
}
// ... 58 more of these
```

This screams "I don't understand sol2 type erasure." You're using sol2's `std::is` and `std::as` for every node type when they all inherit from `IPrimitiveNode`. 

**Fix:** Register a single usertype for `IPrimitiveNode` and use `std::dynamic_pointer_cast` in a helper, or better yet, sol2 has type conversion operators. This file is unmaintainable - every new node type requires editing this switch.

### 3. Memory Ordering Paranoia Without Understanding

**Location:** Various DSP nodes

```cpp
cutoffHz_.store(..., std::memory_order_release);
// ... later ...
cutoffHz_.load(..., std::memory_order_acquire);
```

You're using acquire/release for single atomic values without any corresponding data structure synchronization. For a single atomic float that only needs atomicity (not ordering guarantees), `std::memory_order_relaxed` is fine. The compiler won't reorder this past a lock or another atomic in a way that breaks single-variable atomicity.

**The real issue:** You're paying for memory fences you don't need. On x86, this is free (acquire/release are just compiler barriers). On ARM, you're inserting `dmb` instructions that cost cycles.

**Fix:** Audit every atomic. Ask: "Do I need ordering between multiple variables, or just atomicity for this one?" If just atomicity, use `relaxed`.

### 4. DSP Node Virtual Dispatch in Audio Loop

**Location:** `GraphRuntime::processSingle()`

```cpp
compiled.node->process(inputViews_, outputViews_, numSamples);
```

Every node call is a virtual dispatch. For 40 nodes in a graph, that's 40 vtable lookups per block. Not the end of the world, but:

- It defeats branch prediction if node types are interleaved
- It's a cache miss if the vtable isn't in cache
- Serum doesn't virtual-dispatch in the voice path for a reason

**Fix:** Measure first. If profiling shows this is hot, consider:
- Type-erased function pointers ( store `void(*processFn)(void*, ...)` )
- `std::variant` for small fixed sets of node types
- SoA (Structure of Arrays) for SIMD batching across nodes

Don't optimize until it's a problem, but be aware this is a potential hotspot.

### 5. No SIMD Anywhere

**Location:** `FilterNode.cpp`, `DistortionNode.cpp`, etc.

Sample-by-sample scalar processing:

```cpp
for (int i = 0; i < numSamples; ++i) {
    cutoffHz_ += (targetCutoff - cutoffHz_) * smoothingCoeff_;
    // ... filter math ...
}
```

Modern CPUs have 4-wide (SSE) or 8-wide (AVX) float vectors. You're using 1/4 to 1/8 of the available compute. JUCE's `dsp::SIMDRegister` makes this accessible.

**Fix:** Not urgent for first release, but for a "DSP runtime," SIMD in the heavy nodes (filter, reverb, granulator) is expected. At minimum, process 4 samples at a time with `float4` vectors.

### 6. Lua VM Destruction Crashes (You Know About This)

**Location:** `DSPPluginScriptHost.cpp`

```cpp
// Keep old Lua VMs alive to avoid tearing down a VM during nested Lua call stacks.
std::vector<sol::state> retiredLuaStates;
```

You have a `retiredLuaStates` queue (limited to 4) because destroying sol2 states causes crashes. That's a band-aid on a fundamental ownership problem. You're holding `shared_ptr` to C++ nodes from Lua, and Lua is holding userdata that references C++ state.

**The crash:** When you destroy the Lua VM, it garbage collects userdata that calls back into C++. If that C++ code tries to touch the now-destroying Lua state, you get UB.

**Fix:** Fix the ownership model:
- Use `std::weak_ptr` from Lua land for nodes
- Explicitly null out all node references in Lua before destroying the VM
- Or use a proper Lua sandbox that doesn't allow C++ callbacks during destruction

The retired queue is fine for a beta, but don't ship with this. It's a memory leak (4 Lua VMs retained) and doesn't actually fix the race - it just makes it less likely.

---

## The Ugly (This Is Gonna Hurt)

### 1. AtomicState Monolith

**Location:** `ControlServer.h` (implied by usage)

`AtomicState` has 50+ atomic members - tempo, volume, layers[4] with their own sub-state, recording state, etc. This isn't a state structure, it's a "I gave up on design" structure.

**Problems:**
- No way to snapshot consistent state (what if tempo changes between reading tempo and samplesPerBar?)
- Cache thrashing - 50 atomics spread across cache lines
- No type safety - everything is float or int, easy to confuse paths

**Fix:** Group related state into structs and use single atomic pointers to swap them:

```cpp
struct TransportState {
    float tempo;
    float samplesPerBar;
    // ... other transport-related ...
};

std::atomic<std::shared_ptr<TransportState>> transportState;
```

Or use a seqlock pattern for bulk reads:

```cpp
struct alignas(64) AtomicState {  // cache line align
    std::atomic<uint64_t> sequence{0};
    // ... non-atomic members ...
    
    State read() const {
        uint64_t seq1, seq2;
        State result;
        do {
            seq1 = sequence.load(std::memory_order_acquire);
            result = *this;  // copy all
            seq2 = sequence.load(std::memory_order_acquire);
        } while (seq1 != seq2 || (seq1 & 1));
        return result;
    }
};
```

### 2. Chunking Memcpy Overhead

**Location:** `GraphRuntime::processChunked()`

When `numSamples > maxBlockSize`, you memcpy the entire buffer:

```cpp
for (int ch = 0; ch < numChannels_; ++ch) {
    std::memcpy(chunkBuffer_.getWritePointer(ch),
                buffer.getReadPointer(srcCh) + offset,
                chunkSize * sizeof(float));
}
```

You're touching every sample twice before any processing happens. For large block sizes, this is significant overhead.

**Fix:** Pass `AudioBuffer<float>` views by pointer+offset instead of copying. Create a lightweight `AudioBufferView` that holds pointer + start offset + numSamples, and pass that to nodes. Most DSP can handle non-contiguous channel pointers.

### 3. Missing Denormal Protection

**Location:** DSP node `process()` methods

You have `juce::ScopedNoDenormals` in `processBlock()`, but individual nodes don't protect themselves. If someone uses your nodes outside the main processor (direct API call, testing, etc.), they hit denormal hell on Intel CPUs.

**Fix:** Either:
- Document that nodes must only be called from the main process loop (weak)
- Add `ScopedNoDenormals` to each node's `process()` (safer)
- Use DAZ/FTZ intrinsics at node entry (fastest)

### 4. Slot Unload Is Broken

**Location:** `BehaviorCoreProcessor::unloadDspSlot()`

```cpp
const bool ok = it->second->loadScriptFromString(
    "function buildPlugin(ctx) return {} end", "unload:" + slot);
if (ok) {
    it->second->markUnloaded();
}
```

You unload by loading an empty script and marking unloaded. But the Lua VM is still alive. The slot is still in the map. The OSC endpoints are still registered (I assume). This is a zombie slot.

**The TODO comment admits it:** "replace this empty-script unload + markUnloaded() split with a proper slot lifecycle model."

**Fix:** Actually destroy the slot: remove from map, destroy Lua VM (safely - see #6 above), unregister endpoints. If that crashes, fix the crash instead of working around it.

### 5. Graph Runtime Validation

**Location:** `GraphRuntime::process()`

```cpp
if (!isValid_.load()) {
    buffer.clear();
    return;
}
```

If the graph fails validation, you clear the buffer (silence). This is a debugging nightmare - "why is my plugin silent?" with no error message.

**Fix:** Log the error (from message thread). Or pass error state to the UI. Or at least have a debug mode that asserts. Silent failure is the worst failure.

---

## Architecture Deep Dive

### Threading Model

You have three threads:

1. **Audio Thread** - `processBlock()`, lock-free, reads atomic state, processes graph
2. **Message Thread** - JUCE main thread, Lua execution, graph compilation, OSC handling
3. **Control Thread** - OSC server, Unix socket IPC, broadcasts state changes

This is correct. The SPSC queues between threads are properly sized (256 entries). The atomic state snapshots work for UI/query.

**One concern:** The control thread does OSC parsing. Complex OSC bundles could take time. Consider moving OSC parsing to a thread pool or the message thread, using the control thread only for socket I/O.

### Node Graph Design

Nodes have:
- `prepare(sampleRate, maxBlockSize)` - called off audio thread, can allocate
- `process(inputs, outputs, numSamples)` - called on audio thread, must be lock-free
- Input/output counts fixed at construction

This is the right contract. The `AudioBufferView` abstraction for inputs/outputs is smart - no heap allocation for buffer views.

**Connection model:** Nodes hold `weak_ptr` to targets, routes stored separately in `GraphRuntime`. This prevents reference cycles and allows the runtime to optimize routing.

### Lua Binding Strategy

Using sol2 with `std::shared_ptr` node types:

```cpp
newLua.new_usertype<dsp_primitives::FilterNode>(
    "FilterNode",
    sol::constructors<std::shared_ptr<dsp_primitives::FilterNode>()>(),
    "setCutoff", &dsp_primitives::FilterNode::setCutoff,
    // ...
);
```

This works but has overhead:
- `shared_ptr` reference counting on every node creation
- Type registration boilerplate for every node

**Alternative:** Use sol2's usertype inheritance and `std::unique_ptr` where possible. Or consider a more data-driven approach where nodes are just IDs and Lua calls `graph:setParam(nodeId, "cutoff", value)`.

### UI State Sync Pattern

Your Lua "shell" drives UI state via tables:

```lua
shell.surfaces.mainScriptEditor = {
    visible = true,
    bounds = {x=0, y=0, w=800, h=600}
}
```

C++ polls this in `timerCallback()` and syncs to ImGui hosts. This is immediate-mode UI done correctly - Lua declares intent, C++ executes.

**Performance concern:** You're copying a lot of data every 60Hz frame. Profile this with many panels open. If it's slow, consider dirty flags or delta updates.

---

## First Plugin Perspective

**This is your first plugin?** Then fuck, this is impressive.

Most first plugins:
- Crash when resized
- Leak memory like a sieve  
- Have 500ms UI latency
- Clip at 0dB and call it "analog warmth"

You built:
- Lock-free graph compilation
- Multi-VM Lua scripting with hot reload
- A proper node-based DSP runtime
- OSC/OSCQuery control surface support
- Ableton Link sync

That's "I've been thinking about this for a year" territory, not "my first JUCE tutorial."

**The mistakes you made are the right mistakes:**
- Over-engineering the slot system (but you had a reason)
- Memory ordering paranoia (better than not caring)
- Manual memory management (you learned from it)

These are fixable. The architecture is sound.

---

## Recommendations by Priority

### P0 (Ship Blockers)

1. **Fix the raw pointer in `requestGraphRuntimeSwap()`** - Use `std::atomic<std::shared_ptr>>` or proper `unique_ptr` exchange.

2. **Fix Lua VM destruction** - Use weak_ptr from Lua or explicit nulling. Don't ship with `retiredLuaStates` as a "fix."

3. **Add error handling for invalid graphs** - Don't silently clear buffer. Log, assert in debug, surface to UI.

### P1 (Before Beta)

4. **Refactor `toPrimitiveNode`** - Use proper sol2 type erasure, not a 60-case switch.

5. **Audit atomics** - Use `relaxed` where ordering isn't needed. Document where ordering IS needed.

6. **Fix slot unload** - Actually destroy slots, don't just load empty scripts.

### P2 (Before 1.0)

7. **Refactor AtomicState** - Group into structs, use seqlock or atomic pointers for snapshots.

8. **SIMD in heavy nodes** - Filter, reverb, granulator should use `dsp::SIMDRegister`.

9. **Optimize chunking** - Use buffer views instead of memcpy.

### P3 (Nice to Have)

10. **Virtual dispatch optimization** - Measure first, then consider function pointer or variant approaches.

11. **Osc parsing off control thread** - Move to thread pool or message thread.

---

## Conclusion

**Manifold is a serious piece of engineering disguised as a first plugin.**

The core architecture - lock-free graph compilation, Lua scripting containment, ImGui dynamic UI - is correct. These aren't beginner decisions; they show understanding of real-time constraints and plugin lifecycle.

The rough edges are exactly what I'd expect from someone building a **system** instead of a **product**:
- Manual memory management (you were figuring out ownership)
- Over-engineered slots (you were exploring the design space)
- Missing SIMD (you prioritized flexibility over speed)

**My advice:** Fix the P0 issues, ship a beta to brave users, iterate. Don't let perfect be the enemy of "actually released." The foundation is solid enough to build on.

And for fuck's sake, fix that `delete` before I have an aneurysm.

---

*Review conducted by Steve Duda (persona), March 2025.*
*Codebase: Manifold Audio Plugin/DSP Runtime*
*Lines reviewed: ~15,000 C++ across core DSP, scripting, and UI systems*
