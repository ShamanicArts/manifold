# Graph Compiler Optimization — Decomposition Worksheet

**Date:** 2026-05-03 (v1)
**Status:** DRAFT — Researched findings complete, solution space documented
**Audience:** Agents evaluating or executing graph compiler optimization work
**Prior art:**
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` — Insight #2 (Compilation Inflection Point), Insight #9 (Parameter Smoothing Hoisting)
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim02.md` — DSP Node Graph Compilation (full dimension research)
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/manifold_sec02.md` — DSP Node Graph & Execution Engine
- `agent-docs/260503_atomic_state_memory_ordering_worksheet.md` — Prior worksheet methodology

---

## 1. Executive Summary

Manifold's graph compilation pipeline (`PrimitiveGraph::compileRuntime()` → `compileGraphRuntime()` → `GraphRuntime::prepare()`) performs exactly four steps: topological sort, node list snapshot, routing table snapshot, and buffer pre-allocation with node prepare. It is a correct and minimal compiler — but it performs **no optimization passes**.

The research identifies four specific optimization opportunities, all of which are standard practice in competing frameworks (HISE, FAUST, SuperCollider, Tracktion) and all of which slot cleanly into the existing compilation pipeline:

| Optimization | What It Does | Frameworks That Do It | Estimated Impact |
|-------------|-------------|----------------------|-------------------|
| **Node fusion** | Collapse linear chains of stateless nodes into single dispatch units | HISE C++ generator, JUCE ProcessorChain, ADC 2025 expression templates | Eliminates scratch buffers, route scans, addFrom copies, virtual calls per internal node |
| **Control-rate hoisting** | Move parameter smoothing from per-sample loop to per-control-block update (~1.45ms intervals) | FAUST (automatic, +41% throughput), SuperCollider | Eliminates 64 atomic loads + 64 smoothing steps per parameter per block |
| **Dead code elimination** | Remove nodes whose outputs are not connected to any sink | SuperCollider `performDeadCodeElimination`, formal graph analysis (Norilo DAFX) | Reduces graph size, eliminates wasted scratch allocation and dispatch |
| **State continuity** | Preserve node state (delay lines, filter histories, envelopes) across graph recompilation | Tracktion Graph (explicit requirement), HISE (node identity persistence) | Eliminates audible glitches on graph topology changes |

### Current Compilation Pipeline

The existing pipeline lives in `compileGraphRuntime()` at `manifold/primitives/scripting/GraphRuntime.cpp:354-433`:

```
1. getTopologicalOrder()        // DFS post-order with cycle detection
2. Build compiledNodes_         // Vector of (shared_ptr, role, I/O counts)
3. Build routes_                // Flattened (src, tgt, out, in) tuples
4. runtime->prepare()           // Allocate scratch, node->prepare()
```

Optimizations would be added as additional passes between steps 3 and 4.

### Scope

This worksheet covers:
- All four optimization passes and their architectural impact
- The `compileGraphRuntime()` function and surrounding swap mechanism
- The `IPrimitiveNode` interface (what traits or methods would need to change)
- The `GraphRuntime::processSingle()` dispatch loop (what the fused/optimized path looks like)
- The parameter smoothing pattern duplicated across 50+ nodes (`current += (target - current) * smoothingCoeff`)
- Stateful vs stateless node taxonomy

---

## 2. Researched Findings — Codebase Anatomy

### 2.1. Compilation Pipeline

**File:** `manifold/primitives/scripting/PrimitiveGraph.cpp` (line 372)
**File:** `manifold/primitives/scripting/GraphRuntime.cpp` (lines 354–433)

The pipeline has no optimization passes and no access to the previous `GraphRuntime` for state continuity:

```cpp
std::unique_ptr<GraphRuntime> compileGraphRuntime(
    PrimitiveGraph& graph, double sampleRate, int maxBlockSize, int numChannels) {
    
    auto runtime = std::make_unique<GraphRuntime>();
    
    // Step 1: Topological order
    auto topoOrder = graph.getTopologicalOrder();
    
    // Step 2: Build compiled node list
    for (auto& node : topoOrder) {
        CompiledNode compiled;
        compiled.node = node;
        compiled.role = graph.getNodeRole(node);
        compiled.inputCount = node->getNumInputs();
        compiled.outputCount = node->getNumOutputs();
        runtime->compiledNodes_.push_back(std::move(compiled));
    }

    // Step 3: Build routing table
    for (size_t srcIdx = 0; srcIdx < runtime->compiledNodes_.size(); ++srcIdx) {
        // ... resolve connections by pointer identity ...
        runtime->routes_.push_back(route);
    }

    // Step 4: Prepare runtime (no optimizations)
    runtime->prepare(sampleRate, maxBlockSize, numChannels);
    
    return runtime;
}
```

### 2.2. Node Interface

**File:** `dsp/core/graph/PrimitiveNode.h`

The `IPrimitiveNode` interface is minimal — no optimization-relevant methods exist:

```cpp
class IPrimitiveNode {
    virtual const char* getNodeType() const = 0;
    virtual int getNumInputs() const = 0;
    virtual int getNumOutputs() const = 0;
    virtual void prepare(double sampleRate, int maxBlockSize) = 0;
    virtual void process(inputs, outputs, numSamples) = 0;
    virtual bool acceptsHostInputWhenUnconnected() const { return false; }
    virtual bool wantsRawHostInputWhenUnconnected() const { return false; }
    // ...
};
```

There is no:
- `isStateless()` / `isFusible()` — to identify nodes safe for fusion
- `hasControlRateParams()` / `updateControlRate()` — for control-rate scheduling
- `getNodeId()` / `transferStateFrom()` — for state continuity
- `serializeState()` / `deserializeState()` — for state export/import

### 2.3. Per-Node Parameter Smoothing Pattern

**File:** Various in `dsp/core/nodes/*.cpp`

Every stateful node duplicates the same exponential smoothing pattern. For example:

**GainNode** (`dsp/core/nodes/GainNode.cpp`, lines 32–48):
```cpp
// In prepare():
smoothingCoeff_ = 1.0 - std::exp(-1.0 / (0.01 * sampleRate));

// In process(), per sample:
float target = muted_ ? 0.0f : targetGain_.load(std::memory_order_acquire);
for (int i = 0; i < numSamples; ++i) {
    currentGain_ += (target - currentGain_) * smoothingCoeff_;
    output[i] = input[i] * currentGain_;
}
```

**StereoDelayNode** (`dsp/core/nodes/StereoDelayNode.cpp`, lines 49–103):
Six separate smoothing coefficients in `prepare()`:
```cpp
timeSmoothingCoeff_     = 1.0 - exp(-1.0 / (0.02 * sampleRate));
feedbackSmoothingCoeff_ = 1.0 - exp(-1.0 / (0.01 * sampleRate));
filterSmoothingCoeff_   = 1.0 - exp(-1.0 / (0.01 * sampleRate));
mixSmoothingCoeff_      = 1.0 - exp(-1.0 / (0.01 * sampleRate));
widthSmoothingCoeff_    = 1.0 - exp(-1.0 / (0.01 * sampleRate));
duckingSmoothingCoeff_  = 1.0 - exp(-1.0 / (0.01 * sampleRate));
```

At 48kHz with a 64-sample block, each smoothed parameter does:
- 64 atomic loads (`acquire` ordering)
- 64 exponential smoothing iterations (`+= (target - current) * coeff`)
- 64 audio processing operations that use the smoothed value

For StereoDelayNode with 6 smoothed parameters: 384 atomic loads + 384 smoothing steps per block, even when no parameters changed.

### 2.4. Graph Runtime Node Dispatch

**File:** `manifold/primitives/scripting/GraphRuntime.cpp` (lines 184–353)

The `processSingle()` method is well-structured for fusion:

```cpp
for (size_t nodeIdx = 0; nodeIdx < numNodes; ++nodeIdx) {
    // 1. Clear input scratch (memset)
    // 2. Clear output scratch (memset)
    // 3. Clear input accumulators (memset)
    // 4. Scan routes_ for matches (O(R))
    // 5. addFrom source buffers (memcpy/add)
    // 6. Optional host input copy (memcpy)
    // 7. Build input view vectors
    // 8. Build output view vectors
    // 9. compiled.node->process(inputViews_, outputViews_, numSamples)  // virtual call
}
```

For a fused chain, steps 1–8 would be skipped for all internal nodes. The fused group would:
- Allocate one shared scratch buffer for the entire chain
- Internal nodes write directly into each other's input
- One view construction per fused group instead of per internal node
- One virtual call per fused group

### 2.5. Graph Swap Mechanism

**File:** `manifold/core/GraphRuntimeSupport.h`

The swap path is:
```
requestGraphRuntimeSwap()  → pendingRuntime.exchange(new, release)
checkGraphRuntimeSwap()    → pendingRuntime.exchange(nullptr, acq_rel) → old → retireQueue
drainRetiredGraphRuntimes() → retireQueue.dequeue() → delete old runtime
```

There is no state transfer between old and new runtimes. The new runtime is created from scratch in `compileGraphRuntime()`, all nodes get fresh `prepare()` calls, and all accumulated state is lost.

The `requestGraphRuntimeSwap()` function currently takes no reference to the old runtime:
```cpp
inline void requestGraphRuntimeSwap(
    std::atomic<dsp_primitives::GraphRuntime*>& pendingRuntime,
    std::unique_ptr<dsp_primitives::GraphRuntime> runtime);
```

For state continuity, it would need access to the currently active runtime before the swap completes.

### 2.6. Stateful Node Inventory

Nodes with internal state that would be lost on graph recompilation:

| Node | State Lost | File |
|------|-----------|------|
| `StereoDelayNode` | `delayBuffer_` (audio samples), write index, 6 smoothed params | `dsp/core/nodes/StereoDelayNode.cpp` |
| `ReverbNode` | Reverb tail buffers (allpass, comb filters) | `dsp/core/nodes/ReverbNode.cpp` |
| `FilterNode` | z⁻¹ registers (previous sample history) | `dsp/core/nodes/FilterNode.cpp` |
| `SVFNode` | z⁻¹ registers (state variable filter) | `dsp/core/nodes/SVFNode.cpp` |
| `ChorusNode` | Delay line buffers, LFO phase | `dsp/core/nodes/ChorusNode.cpp` |
| `PhaserNode` | Allpass filter state, LFO phase | `dsp/core/nodes/PhaserNode.cpp` |
| `FlangerNode` | Delay line buffer, LFO phase | `dsp/core/nodes/FlangerNode.cpp` |
| `ADSREnvelopeNode` | Phase counter, current level, state machine | `dsp/core/nodes/ADSREnvelopeNode.cpp` |
| `GranulatorNode` | Grain position, window buffer, grain envelope | `dsp/core/nodes/GranulatorNode.cpp` |
| `PhaseVocoderNode` | FFT history ring buffer, overlap-add state | `dsp/core/nodes/PhaseVocoderNode.cpp` |
| `PitchShifterNode` | Overlap-add buffers, phase accumulator | `dsp/core/nodes/PitchShifterNode.cpp` |
| `LoopPlaybackNode` | Playhead position, loop state, direction | `dsp/core/nodes/LoopPlaybackNode.cpp` |
| `SampleRegionPlaybackNode` | Playhead position, current region | `dsp/core/nodes/SampleRegionPlaybackNode.cpp` |
| `GainNode` | `currentGain_` (smoothed value) | `dsp/core/nodes/GainNode.cpp` |
| `StereoWidenerNode` | Smoothed parameters | `dsp/core/nodes/StereoWidenerNode.cpp` |
| `CompressorNode` | Envelope follower state, gain reduction | `dsp/core/nodes/CompressorNode.cpp` |
| `LimiterNode` | Envelope follower state, gain reduction | `dsp/core/nodes/LimiterNode.cpp` |
| `EnvelopeFollowerNode` | Envelope state | `dsp/core/nodes/EnvelopeFollowerNode.cpp` |
| `ShimmerNode` | Pitch shifter buffers, reverb tail | `dsp/core/nodes/ShimmerNode.cpp` |
| `MultitapDelayNode` | Delay line buffers | `dsp/core/nodes/MultitapDelayNode.cpp` |
| `ReverseDelayNode` | Capture buffer | `dsp/core/nodes/ReverseDelayNode.cpp` |

### 2.7. Stateless Node Inventory

Nodes that are mathematically pure — output depends only on current input — and are safe for fusion:

| Node | File |
|------|------|
| `GainNode` (if smoothing extracted) | `dsp/core/nodes/GainNode.cpp` |
| `PassthroughNode` | `dsp/core/nodes/PassthroughNode.cpp` |
| `DistortionNode` | `dsp/core/nodes/DistortionNode.cpp` |
| `BitCrusherNode` | `dsp/core/nodes/BitCrusherNode.cpp` |
| `RingModulatorNode` | `dsp/core/nodes/RingModulatorNode.cpp` |
| `NoiseGeneratorNode` | `dsp/core/nodes/NoiseGeneratorNode.cpp` |
| `CrossfaderNode` | `dsp/core/nodes/CrossfaderNode.cpp` |
| `MixerNode` | `dsp/core/nodes/MixerNode.cpp` |
| `MSEncoderNode` | `dsp/core/nodes/MSEncoderNode.cpp` |
| `MSDecoderNode` | `dsp/core/nodes/MSDecoderNode.cpp` |
| `InvertNode` | `dsp/core/nodes/InvertNode.cpp` |
| `ConstantSignalNode` | `dsp/core/nodes/ConstantSignalNode.cpp` |
| `WaveShaperNode` | `dsp/core/nodes/WaveShaperNode.cpp` |

---

## 3. Solution Space

This section describes the known approaches identified by the research. It does not prescribe which to use.

### 3.1. Node Fusion

**Research sources:**
- Dim02 — HISE C++ generator fuses 3 addition nodes into `mov xmm0 1.04122`
- Dim02 — JUCE ProcessorChain variadic template for compile-time series pipelines
- Dim02 — ADC 2025 C++23 expression templates for graph transformations

**Three phases of fusion, increasing in complexity:**

**Phase 1 — Chain collapse:** Detect linear chains of single-input, single-output, stateless nodes during `compileGraphRuntime()`. Replace N `CompiledNode` entries with one `FusedNodeGroup` that holds internal node pointers. In `processSingle()`, the fused group uses one shared scratch buffer and dispatches internal nodes without route scans, accumulator copies, or view reconstruction between each internal step.

**Phase 2 — Algebraic fusion:** Recognize specific type combinations (Gain→Gain→Gain, Gain→Invert→Gain, etc.) and pre-compute coefficients at compile time. The fused group collapses to a single multiply, a single `tanh()` call in a combined loop, etc.

**Phase 3 — Expression templates:** The graph topology becomes a C++ type via variadic templates. No virtual dispatch, no intermediate buffers, no runtime type checks. This follows JUCE's `ProcessorChain` pattern but applied to runtime-discovered chains.

**Interface changes required:**
- `IPrimitiveNode::isFusible() → bool` (default false, stateless nodes override to true)
- New class: `FusedNodeGroup` implementing `IPrimitiveNode`
- Fusion analysis pass in `compileGraphRuntime()`

### 3.2. Control-Rate Hoisting

**Research sources:**
- Dim02 — FAUST: "expressions involving [slow outputs] are moved out of the inner-loop by the compiler"
- Dim02 — FAUST scheduling mode selection improves throughput by up to +41%
- Insight #9 — Parameter smoothing duplicated 50+ times at sample rate

**Architecture:**

A `ControlRateScheduler` in `GraphRuntime` that fires `updateControlRate()` on each node once per control block (typically every 64 samples = ~1.45ms at 44.1kHz). The per-sample `process()` becomes lighter — no atomic loads, no smoothing math, just the audio arithmetic.

**Two approaches:**

**Approach A — Per-node control-rate update:**
```cpp
// Control rate (every 64 samples):
if (controlCounter == 0) {
    for each node with control-rate params:
        node->updateControlRate();
}

// Sample rate (every block):
for each node in topological order:
    node->process(inputViews_, outputViews_, numSamples);
```

**Approach B — Graph-level parameter cache:**
The graph runtime itself pre-computes parameter values at control rate and stores them in a flat array. Nodes read from this array instead of doing their own atomic loads. Eliminates the per-node `updateControlRate()` virtual call in favor of a single graph-level pass.

**Interface changes required:**
- `IPrimitiveNode::hasControlRateParams() → bool` (default false)
- `IPrimitiveNode::updateControlRate() → void` (default no-op)
- `GraphRuntime` gains a `controlCounter_` and a control-rate pre-pass in `processSingle()`
- Or: a graph-level `ControlRateParameter` type and a scheduler that hoists smoothing graph-wide

**The FAUST reference:** "GUI widget outputs are 'slow', expressions involving them are moved out of the inner-loop by the compiler." This is determined automatically by signal-rate analysis — Manifold would need either explicit node annotations or a similar analysis pass.

### 3.3. Dead Code Elimination

**Research sources:**
- Dim02 — SuperCollider SynthDef `performDeadCodeElimination()`
- Dim02 — Vesa Norilo DAFX formal grammar for subgraph analysis

**What it catches:**
- Orphan nodes — nodes whose outputs connect to nothing (not sinks)
- Orphan chains — entire subgraphs whose root output connects to nothing
- Unused sidechain inputs — sidechain nodes whose output isn't used

**Implementation approach:**

In `compileGraphRuntime()`, after topological sort but before buffer allocation, walk the graph backwards from all sink nodes (OutputDSP, Monitor when enabled). Any node not reachable from a sink is dead code and can be removed from `compiledNodes_` and `routes_`.

**GraphRuntime already has a partial implementation:** `processSingle()` already checks `hasOutgoing` to determine sink nodes. The DCE pass would do this at compile time instead of runtime, preventing dead nodes from consuming scratch buffer slots and dispatch cycles.

**Interface changes required:**
- No changes to `IPrimitiveNode` — analysis is purely topological
- DCE pass in `compileGraphRuntime()` before `prepare()`

### 3.4. State Continuity Across Graph Swaps

**Research sources:**
- Dim02 — Tracktion Graph: "If any nodes have latency, this means they will have a history of previous samples. If this history is not persisted between graphs, there will be a gap/inconsistency in playback and hence a glitch."
- Manifold sec01 §1.3.3 — The state continuity challenge

**Architecture:**

Add stable identity to nodes and a state transfer mechanism between old and new runtimes.

**Minimal approach — node identity + state transfer:**

```cpp
// IPrimitiveNode additions:
virtual std::string getNodeId() const { return ""; }  // Empty = no identity
virtual void transferStateFrom(IPrimitiveNode* oldNode) {}  // Default no-op
```

In `compileGraphRuntime()`, the function would need access to the old runtime:

```cpp
std::unique_ptr<GraphRuntime> compileGraphRuntime(
    PrimitiveGraph& graph,
    double sampleRate,
    int maxBlockSize,
    int numChannels,
    GraphRuntime* oldRuntime = nullptr  // NEW: for state continuity
);
```

After compilation, before `prepare()`:

```cpp
// State continuity pass:
if (oldRuntime) {
    for (auto& newNode : runtime->compiledNodes_) {
        auto& newNodeId = newNode.node->getNodeId();
        if (newNodeId.empty()) continue;
        for (auto& oldNode : oldRuntime->compiledNodes_) {
            if (oldNode.node->getNodeId() == newNodeId) {
                newNode.node->transferStateFrom(oldNode.node.get());
                break;
            }
        }
    }
}
```

**Node identity strategies:**
- Explicit path-based IDs from Lua (e.g., the `paramBase` string)
- UUIDs assigned at node creation (automatically generated, unique per instance)
- Combined: explicit paths when available, auto-generated UUIDs as fallback

**The swap path change:**
`requestGraphRuntimeSwap()` and `checkGraphRuntimeSwap()` currently don't expose the old runtime to the compilation function. The swap path in `BehaviorCoreProcessor` would need to pass `activeRuntime` into the compilation call.

---

## 4. Files Touched

### Primary

| File | Role | Workstream |
|------|------|------------|
| `manifold/primitives/scripting/GraphRuntime.cpp` | `compileGraphRuntime()`, `processSingle()`, `prepare()` | All — fusion analysis pass, DCE pass, control-rate scheduler, state transfer pass |
| `manifold/primitives/scripting/GraphRuntime.h` | `GraphRuntime` class, `CompiledNode`, `RouteEntry` | All — may need `FusedNodeGroup` variant, `controlCounter_`, old-runtime reference |
| `manifold/primitives/scripting/PrimitiveGraph.h` | `PrimitiveGraph` class | State continuity — may need node identity methods |
| `manifold/primitives/scripting/PrimitiveGraph.cpp` | PrimitiveGraph methods | State continuity — compileRuntime() may need oldRuntime param |
| `dsp/core/graph/PrimitiveNode.h` | `IPrimitiveNode` interface | All — new virtual methods: `isFusible()`, `hasControlRateParams()`, `updateControlRate()`, `getNodeId()`, `transferStateFrom()` |
| `manifold/core/GraphRuntimeSupport.h` | `requestGraphRuntimeSwap()`, `checkGraphRuntimeSwap()` | State continuity — needs to pass old runtime to compilation |

### Secondary — stateless nodes (one-line `isFusible()` override)

All files in `dsp/core/nodes/*.cpp` for:
`GainNode`, `PassthroughNode`, `DistortionNode`, `BitCrusherNode`, `RingModulatorNode`, `NoiseGeneratorNode`, `CrossfaderNode`, `MixerNode`, `MSEncoderNode`, `MSDecoderNode`, `InvertNode`, `ConstantSignalNode`, `WaveShaperNode`

### Secondary — stateful nodes (may need `getNodeId()` + `transferStateFrom()`)

All files in `dsp/core/nodes/*.cpp` for:
`StereoDelayNode`, `ReverbNode`, `FilterNode`, `SVFNode`, `ChorusNode`, `PhaserNode`, `FlangerNode`, `ADSREnvelopeNode`, `GranulatorNode`, `PhaseVocoderNode`, `PitchShifterNode`, `LoopPlaybackNode`, `SampleRegionPlaybackNode`, `GainNode`, `StereoWidenerNode`, `CompressorNode`, `LimiterNode`, `EnvelopeFollowerNode`, `ShimmerNode`, `MultitapDelayNode`, `ReverseDelayNode`

### Secondary — parameter smoothing extraction (for control-rate hoisting)

Same list of stateful nodes. Each currently computes `smoothingCoeff_ = 1.0 - exp(-1.0 / (time * sampleRate))` in `prepare()` and applies per-sample smoothing in `process()`.

---

## 5. Research References

### Primary Sources (Kimi Research)

| Document | Section | Relevance |
|----------|---------|-----------|
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` | Insight #2 | Compilation Inflection Point — fusion, hoisting, DCE gaps (High confidence) |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` | Insight #9 | Parameter Smoothing Hoisting — 50+ duplicated exponential smoothing at sample rate (Medium confidence) |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim02.md` | All | Full dimension research: HISE, FAUST, SuperCollider, Tracktion, expression templates |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/manifold_sec02.md` | §2.1–2.3 | Node interface, buffer views, topological sort, chunking, scratch allocation |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/manifold_sec01.md` | §1.3.3 | State continuity challenge across graph swaps |

### External Authorities (via Kimi Research)

| Authority | Source | Claim |
|-----------|--------|-------|
| HISE Scriptnode C++ Generator | Dim02 | Fuses 3 addition nodes into `mov xmm0 1.04122` |
| FAUST compiler | Dim02 | Automatic control-rate hoisting, +41% throughput with scheduling selection |
| SuperCollider SynthDef | Dim02 | `optimizeGraph()`, `performDeadCodeElimination()` |
| Tracktion Graph (Dave Rowland, ADC20) | Dim02 | "history buffers will need to be persisted between graphs" |
| ADC 2025 Modern C++ Talk | Dim02 | C++23 `constexpr` graph compilation, expression templates |
| Vesa Norilo DAFX Paper | Dim02 | Formal grammar for subgraph analysis, signal-rate inference |
| JUCE ProcessorChain | Dim02 | Variadic template compile-time series pipeline |
| ACE Studio Blog | Dim02 | Post-order DFS, delay compensation, lock-free communication |

---

## 6. Test / Validation Infrastructure

### Existing

| Asset | What It Does |
|-------|-------------|
| `GraphRuntime::processSingle()` | The dispatch loop — measure per-node vs fused dispatch latency |
| `StateProjectionHarness` | Load test project, run graph, capture output |
| `LuaEngineMockHarness` | Contract golden file verification (from prior worksheet) |
| `ManifoldHeadless` | Headless standalone for benchmarking |

### Potential Validation Approaches

- **Fusion correctness test:** Compile a graph with fused and non-fused paths, compare output sample-by-sample. The fused path must produce bit-identical output.
- **Control-rate fidelity test:** For nodes with control-rate hoisting, verify that the output at 64-sample control rate converges to within -120dB of the sample-rate-smoothed output for typical parameter trajectories.
- **DCE correctness test:** Compile a graph with disconnected nodes before and after DCE. Verify identical output from connected paths.
- **State continuity test:** Create a graph with a delay line, fill it with audio, recompile the graph, verify the delay buffer contents are preserved.
- **Performance regression harness:** Before/after comparison of `processSingle()` latency for standard graph topologies.

---

## 7. Risk Register

| # | Risk | Severity | Notes |
|---|------|----------|-------|
| 1 | Fusion changes output of floating-point operations due to different evaluation order | Medium | Algebraic fusion (e.g., Gain×Gain×Gain) may produce different rounding than sequential processing. Acceptable for audio but must be documented. |
| 2 | Control-rate hoisting adds 1.45ms latency to parameter changes | Low | Inaudible for volume, filter cutoff, reverb mix. May need per-parameter control-rate exemption for real-time performance params. |
| 3 | State continuity pass increases `compileGraphRuntime()` time | Low | The pass runs off the audio thread and is O(N²) in node count for the naive matching approach. Can be O(N log N) with a hash map. |
| 4 | DCE removes nodes that the user expects to see in the debug UI | Low | DCE should be informational — report eliminated nodes to Lua for debugging. |
| 5 | Fusion makes debugging harder — intermediate values invisible | Medium | Add a fusion disable flag per graph or per node for debugging. |
| 6 | `transferStateFrom()` requires `dynamic_cast` for node type matching | Low | Alternative: use the existing `getNodeType()` string for type checking before casting. |

---

## 8. Workstream Overview

The four optimizations are independent in analysis but share a common landing zone in `compileGraphRuntime()`. Recommended sequencing:

### Phase 1 — Dead Code Elimination (simplest, no interface changes)
- Add DCE pass in `compileGraphRuntime()` between steps 3 and 4
- No changes to `IPrimitiveNode` or any node
- Verifiable: same output for connected graphs, smaller scratch allocation

### Phase 2 — Control-Rate Hoisting (broadest impact, needs testing)
- Add `controlCounter_` and control-rate pre-pass to `GraphRuntime::processSingle()`
- Add `hasControlRateParams()` / `updateControlRate()` to `IPrimitiveNode`
- Extract smoothing from 50+ nodes into `updateControlRate()`
- Compare output with sample-rate smoothing for convergence

### Phase 3 — Node Fusion (biggest compile-time change)
- Add `isFusible()` to `IPrimitiveNode`
- Implement `FusedNodeGroup` as a pseudo-node
- Add fusion analysis pass in `compileGraphRuntime()`
- Proof: Gain→Gain→Gain chain produces bit-identical output

### Phase 4 — State Continuity (most invasive, depends on node identity)
- Add `getNodeId()` to `IPrimitiveNode`
- Add `transferStateFrom()` to stateful nodes
- Modify `requestGraphRuntimeSwap()` to pass old runtime to compiler
- Add state continuity pass in `compileGraphRuntime()`

---

## 9. Success Criteria

The graph compiler optimization is successful when:

### Fusion
- [ ] Linear chains of stateless nodes produce bit-identical output before and after fusion
- [ ] Fused chains use fewer scratch buffers, fewer route scans, fewer virtual calls
- [ ] `FusedNodeGroup` implements `IPrimitiveNode` and is transparent to the runtime
- [ ] Algebraic fusion (Gain→Gain→Gain → one multiply) is verified

### Control-Rate Hoisting
- [ ] Control-rate scheduler fires at configurable interval (default 64 samples)
- [ ] `updateControlRate()` produces the same smoothed value trajectory as per-sample smoothing (within -120dB)
- [ ] Per-node `process()` no longer does atomic loads or smoothing math for control-rate parameters
- [ ] Frequency-domain and time-domain nodes interoperate correctly with control-rate scheduling

### Dead Code Elimination
- [ ] Unconnected nodes are removed from `compiledNodes_` and `routes_`
- [ ] Output-role sinks are preserved; orphan non-sinks are eliminated
- [ ] Sidechain nodes whose output is unused are eliminated
- [ ] No change in output for any connected graph topology

### State Continuity
- [ ] Delay line contents are preserved across graph recompilation
- [ ] Filter z⁻¹ states are preserved across graph recompilation
- [ ] Envelope position is preserved across graph recompilation
- [ ] Nodes without identity (newly created) initialize fresh state as expected
- [ ] Topology changes (node added/removed) don't crash or produce worse output than before

---

## 10. Change Log

| Date | Change |
|------|--------|
| 2026-05-03 | Initial worksheet created. Four optimization workstreams documented from Kimi research. Stateful/stateless node inventories compiled from source. Current compilation pipeline and node dispatch traced with line numbers. Solution space documented with concrete interface and code-change shapes. |
