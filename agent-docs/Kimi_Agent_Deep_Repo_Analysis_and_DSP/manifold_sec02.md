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

This `prepare()` / `process()` split mirrors the de facto standard established by JUCE's `AudioProcessor` (JUCE 8.0.4, `prepareToPlay()` / `processBlock()`), Tracktion Graph's `prepareToPlay()` / `process()` [^77^], and Jamoma DSP's `preCalculate()` / `calculate()` [^136^]. The critical invariant is that `prepare()` may allocate, while `process()` must not. `GraphRuntime::prepare()` calls `prepare()` on every compiled node after allocating scratch buffers, and `GraphRuntime::process()` dispatches `process()` in topological order without any heap activity.

The `process()` signature receives `std::vector<AudioBufferView>` for inputs and `std::vector<WritableAudioBufferView>` for outputs. A node with stereo input and stereo output therefore receives a vector of length one containing a two-channel view. Multi-bus nodes (e.g., `CrossfaderNode` with two stereo inputs) receive a vector of length two, each element a two-channel view. The `numSamples` argument is guaranteed to be `<= maxBlockSize_` passed to `prepare()`, a guarantee maintained by the chunking subsystem described in Section 2.2.2.

Node instances also carry `std::atomic<bool>` visit flags (`visited_` and `visitInProgress_`) used by the topological sorter. While these atomics are mutated during compilation (off the audio thread), they reside on the node object and do not affect real-time safety during `process()`.

#### 2.1.2 Host-input fallthrough semantics: acceptsHostInputWhenUnconnected, wantsRawHostInputWhenUnconnected

The `IPrimitiveNode` interface declares two virtual boolean methods that control implicit host-input routing:

```cpp
virtual bool acceptsHostInputWhenUnconnected() const { return false; }
virtual bool wantsRawHostInputWhenUnconnected() const { return false; }
```

`acceptsHostInputWhenUnconnected()` determines whether a node whose input bus has no incoming graph connections should receive the host's input buffer automatically. `wantsRawHostInputWhenUnconnected()` further selects between the monitor-scaled host input (global passthrough with input-gain staging) and the raw capture-plane input (pre-monitor, pre-gain). The `GraphRuntime::processSingle()` implementation resolves this at block start: if a node has no incoming routes and opts in, the host buffer (or raw sidechain buffer) is copied into the node's input accumulator [^80^].

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

Each view is constructed from a `juce::AudioBuffer<float>` by copying only the pointer array (`getArrayOfReadPointers()` or `getArrayOfWritePointers()`) and the channel/sample counts. No audio samples are copied, and no heap allocation occurs during view construction. This zero-copy routing pattern is consistent with the Superpowered `AudiobufferPool` retain/release semantics [^105^] and the JUCE `AudioBuffer::setDataToReferTo()` idiom [^81^].

Views include bounds-checked accessors (`getSample`, `setSample`, `addSample`) that silently clamp out-of-range indices. While these guards prevent crashes from miswired graphs, they add branch instructions on every sample access. The SIMD-optimized Highway implementations bypass these accessors and operate on raw channel pointers directly, which is where Manifold extracts most of its vectorized throughput.

### 2.2 Topological Sort and Execution

#### 2.2.1 DFS-based topological sort with cycle detection: canonical algorithm, correct implementation

Manifold's `PrimitiveGraph` computes execution order via depth-first search (DFS) post-order traversal with an on-stack detection flag. The algorithm is the canonical textbook approach for DAG linearization, and it is the same strategy employed by Tracktion Graph ("post-ordered DFS") [^77^], SuperCollider's `SynthDef::topologicalSort` [^11^], and the ACE Studio multi-threaded engine [^51^].

The implementation in `PrimitiveGraph::buildTopologicalOrder()` uses the `visitInProgress_` atomic as a recursion-stack marker: if DFS encounters a node whose `visitInProgress_` flag is already set, a cycle exists and the sort aborts. This is essential because audio graphs naturally contain feedback topologies (compressor sidechains, resonators) that must be broken by explicit delay nodes rather than left as cycles. SuperCollider's UGen graph handles this through `SynthDef::cleanupTopoSort`, which removes redundant connections after sorting [^137^]. Manifold's `hasCycle()` and `validateConnection()` methods expose this check to the Lua scripting layer before compilation.

Once compiled, the `GraphRuntime` stores the sorted node list in `std::vector<CompiledNode> compiledNodes_`. The runtime also stores a flattened `std::vector<RouteEntry> routes_` that encodes every connection as a tuple `(sourceNodeIndex, targetNodeIndex, sourceOutput, targetInput)`. During `processSingle()`, the executor iterates `compiledNodes_` in index order and resolves inputs by scanning `routes_` for entries whose `targetNodeIndex` matches the current node. This $O(N \cdot R)$ scan (where $N$ is node count and $R$ is route count) is acceptable for moderate graph sizes but scales linearly with connection density. HISE's C++ generator and JUCE's `ProcessorChain` eliminate this dispatch entirely by inlining the dataflow as template parameters or direct pointer wiring [^17^][^76^].

#### 2.2.2 Chunking strategy for host blocks exceeding maxBlockSize: hybrid fixed/variable approach

The VST3 specification explicitly permits variable block sizes, and hosts such as FL Studio deliver buffers that vary per callback [^1^][^80^]. Manifold's `GraphRuntime` handles this with a hybrid strategy: it accepts variable host blocks externally but processes internally in fixed chunks bounded by `maxBlockSize_`. The entry point `process()` checks `numSamples > maxBlockSize_` and delegates to `processChunked()` when necessary.

`processChunked()` operates without allocation. It pre-allocated `chunkBuffer_`, `rawChunkBuffer_`, and `sidechainChunkBuffer_` at `prepare()` time, each sized to `maxBlockSize_`. For each chunk, it copies the relevant slice from the host buffer via `std::memcpy`, constructs a `juce::AudioBuffer<float>` view pointing at the chunk buffer, calls `processSingle()` on that view, and copies the result back to the host buffer. The chunk size for the final iteration is `totalSamples - offset`, which may be smaller than `maxBlockSize_`.

This hybrid approach is the same pattern recommended by the 2025 "Fixed vs Variable Buffer Processing" analysis: "accepting variable inputs externally but chunking internally via `while (pos < hostSamples) { processInternalBlock(subBlock); pos += blockToProcess; }` — bridge this by internalizing fixed benefits at minor latency cost" [^1^]. The cost is an extra `std::memcpy` per chunk in each direction. For a 4096-sample host block chunked into two 2048-sample pieces, this adds four 2048-sample copies (input + output, two chunks) at 48 kHz — roughly 0.17 ms of memory bandwidth, negligible on modern CPUs but worth profiling on embedded targets.

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

The current allocation is one input and one output scratch buffer per node, regardless of whether the node actually needs both. A graph-coloring optimization could reduce this footprint by reusing buffers across non-overlapping node lifetimes — a technique employed by deep-learning compilers for tensor memory planning [^116^]. For a 50-node graph with 2 channels and 2048-sample blocks, the current scheme allocates approximately $50 \times 2 \times 2048 \times 4 \text{ bytes} \times 2 \text{ (in+out)} \approx 1.6 \text{ MB}$ of scratch memory, plus accumulator and chunk buffers. This is well within modern L3 cache capacities but could be tightened for mobile targets.

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

The `GranulatorNode` encapsulates a tapped delay-line granulator following Bencina's canonical architecture: a ring buffer, grain scheduler, per-grain envelope (Hann or triangle), and linear-interpolation readback [^189^]. It allocates `bufferSize_ = sampleRate * 4 + maxBlockSize` samples in `prepare()` — up to ~706,000 samples (2.8 MB) at 48 kHz — which is substantial but bounded. The 64-grain maximum (`kMaxGrains = 64`) bounds the per-sample workload.

#### 2.3.2 Parameter smoothing standardization: identical exponential smoothing across all nodes reveals hoisting opportunity

A striking uniformity across Manifold's node library is the parameter smoothing implementation. Every node uses the identical first-order lowpass:

$$\text{smoothCoeff} = 1 - \exp\left(\frac{-1}{\tau \cdot f_s}\right), \quad \text{current} \leftarrow \text{current} + (\text{target} - \text{current}) \cdot \text{smoothCoeff}$$

where $\tau$ is a time constant ranging from 10 ms (`GainNode`, `DistortionNode`, `GranulatorNode`) to 20 ms (`FilterNode`) to 40 ms (`ReverbNode`). This is the standard one-pole parameter smoother recommended by the DAFX textbook for time-varying parameters [^337^].

The uniformity is architecturally clean but computationally redundant. Each node runs its own smoothing state machine at sample rate, loading atomic targets and updating local floats every sample. In a 50-node graph, this is 50 independent smoothers executing per sample, even though most parameter changes originate from the message thread at control-rate intervals (typically 10–30 Hz for UI updates, or MIDI CC at 1 ms granularity).

FAUST's compiler demonstrates the alternative: it automatically hoists control-rate computations out of the sample loop, moving "expressions involving [slow outputs]... out of the inner-loop by the compiler" [^19^]. Manifold could adopt a similar model by introducing a graph-level `ControlRateScheduler` that updates smoothed parameters at a fixed sub-audio interval (e.g., every 64 samples ≈ 1.45 ms at 44.1 kHz) and feeds interpolated values to nodes. This would reduce per-sample overhead from $O(\text{nodes})$ to $O(\text{control blocks})$ with no audible consequence for typical parameter trajectories [^19^].

Notably, the `ADSREnvelopeNode` uses `memory_order_relaxed` for its atomic parameter stores and loads — an anomaly in a codebase that otherwise consistently uses `memory_order_acquire`/`release`. While relaxed ordering is sufficient for independent scalar values, it creates a subtle inconsistency in the node's synchronization contract.

#### 2.3.3 Latency reporting: PhaseVocoderNode reports fftSize_ but may have additional ring-buffer latency

Plugin-reported latency is the mechanism by which a host's delay compensation delays all tracks to match the maximum latency in the signal path [^242^][^247^]. Manifold's `PhaseVocoderNode` implements `getLatencySamples()` by returning `fftSize_`, which ranges from 512 to 4096 samples depending on the `fftOrderParam_` setting (order 9 to 12). At 44.1 kHz, this corresponds to 11.6 ms to 92.9 ms.

However, the node's internal architecture includes additional buffering whose latency is not reported. The `inputRing_` is sized to `fftSize_ * 2` (1024–8192 samples), and the `outputAccum_` is also `fftSize_ * 2`. The STFT overlap-add pipeline with 75% overlap (hop = `fftSize_ / 4`) introduces an inherent algorithmic latency of one FFT frame plus the synthesis window offset. In high-quality phase-vocoder implementations, total latency can be "as high as 150 ms" [^222^]. Manifold's reported `fftSize_` captures only the FFT window length, not the ring-buffer or overlap-add contributions.

The time-stretch mode (`mode == 1`) adds further unreported latency through `timeStretchAccum_`, sized to `fftSize_ * 8`, because resampled read-ahead is required to maintain output continuity when the pitch ratio deviates from unity. The node also lacks the frequency-domain oversampling fix documented in Royer's thesis (zero-padding DFT coefficients to reduce high-frequency noise above 15 kHz when down-shifting) [^310^], which would increase FFT size and therefore reported latency.

No other Manifold node reviewed implements `getLatencySamples()`. The `PitchDetectorNode` operates as a pass-through (its output is the input signal with detection metadata extracted on the side), so it conceptually reports zero samples, though its internal `monoBuffer_` and `StreamingPitchDetector` state introduce processing delay that does not affect output timing. The `ReverbNode` wraps JUCE's built-in reverb, which does not expose latency programmatically; algorithmic reverbs typically have a few samples of pre-delay but negligible group delay relative to host compensation thresholds.

The broader concern is that latency reporting in Manifold appears ad hoc — implemented only where the node author explicitly added `getLatencySamples()`. A systematic approach would require the graph compiler to accumulate latency along every path and report the maximum to the host, following the pattern described by ACE Studio: "Calculate the Delay of Each Node... Determine the Maximum Path Delay... Add Compensatory Delays to Shorter Paths" [^51^]. Without this, parallel branches with different latencies (e.g., a direct path through `GainNode` and a delayed path through `PhaseVocoderNode`) will arrive at the mixer out of phase, causing comb-filtering artifacts that host delay compensation cannot resolve.
