# Dimension 2: DSP Node Graph Compilation & Execution Models

## Research Report — Manifold Codebase Context

---

### Key Findings

1. **Builder-Time vs Runtime Separation is the Industry Standard Pattern**: Manifold's separation of `PrimitiveGraph` (mutable, message thread) from `GraphRuntime` (immutable, audio thread) directly mirrors architectures found in HISE Scriptnode, SuperCollider SynthDef, Tracktion Graph, and RNBO. The HISE documentation explicitly states: "Having an interpreter (and a graph based system like Max MSP is the same as a interpreter) that boils down to virtual function calls for each operation node has to be avoided at all costs" [^16^]. HISE's solution is a two-phase workflow: prototype in the node graph, then export to C++ for production.

2. **Topological Sort with DFS Post-Order is Universal**: Manifold's use of DFS topological sort with cycle detection is the canonical approach across frameworks. Tracktion Graph explicitly uses "post-ordered DFS" for execution ordering [^77^]. SuperCollider's `SynthDef` implements `cleanupTopoSort`, `initTopoSort`, and `topologicalSort` methods [^11^]. The ACE Studio blog describes using "post-order Depth-First Search (DFS)" to determine execution order in multi-threaded audio graphs [^51^].

3. **Compiled Graph Eliminates Virtual Function Call Overhead**: The core motivation for graph compilation is eliminating per-sample virtual dispatch. HISE's Scriptnode C++ generator uses meta-template programming to reproduce graphs as variadic templates, eliminating interpreter overhead [^16^][^70^]. The HISE documentation notes: "If you use 3 addition nodes... the interpreter will have to calculate three nodes individually. The generated Cpp code will boil them down to a single assembly instruction: `mov xmm0 1.04122`" [^17^].

4. **Scratch Buffer Pre-Allocation is Critical for Real-Time Safety**: Manifold's "pre-allocated scratch buffers" in `GraphRuntime` align with established best practices. The Superpowered SDK provides an `AudiobufferPool` class that "can allocate audio buffers from pre-allocated memory without any blocking" with retain/release semantics [^105^]. GStreamer's bufferpool documentation emphasizes: "We can not just reconfigure the existing bufferpool because there might still be outstanding buffers from the pool in the pipeline. Therefore we need to create a new bufferpool for the new configuration while we let the old pool drain" [^111^].

5. **Hot-Swap Requires Careful State Persistence**: Manifold's `requestGraphRuntimeSwap()` with atomic exchange parallels Tracktion Graph's "Continuity" problem. Tracktion's Dave Rowland explicitly warns: "If any nodes have latency, this means they will have a history of previous samples. If this history is not persisted between graphs, there will be a gap/inconsistency in playback and hence a glitch" [^77^]. Nodes must be "uniquely identifiable and the same between graphs" for continuity.

6. **Chunking/Block Subdivision is Common for Large Buffers**: Manifold's "chunking for blocks > maxBlockSize" matches the hybrid FIFO-to-fixed-block pattern widely recommended. A 2025 article on fixed vs variable buffer processing describes: "hybrids — accepting variable inputs externally but chunking internally via `while (pos < hostSamples) { processInternalBlock(subBlock); pos += blockToProcess; }` — bridge this by internalizing fixed benefits at minor latency cost" [^1^]. JUCE's `AudioProcessorGraph::prepareToPlay` documentation notes: "The actual block sizes that the host uses may be different each time the callback happens: completely variable block sizes can be expected from some hosts" [^80^].

7. **FAUST Provides the Most Advanced Compilation Model**: FAUST compiles functional DSP specifications to optimized C++ with automatic control-rate hoisting, delay-line strategy selection, and FIR/IIR reconstruction. The FAUST compiler "separately optimizes full-rate signals at the sampling rate... slowly varying signals (updated at the buffer rate outside of the inner loop)... and constant signals (evaluated once at initialization time)" [^17^]. FAUST's scheduling strategy options (`-ss` flag) include depth-first, breadth-first, and special modes, with benchmarked improvements of up to +41% when selecting the best mode per program [^21^].

8. **C++23/26 Enables Compile-Time Graph Construction**: An ADC 2025 talk on "Building an Optimized DSP Framework in Modern C++" explores using `constexpr` and `consteval` to construct and optimize directed graphs representing DSP signal flows at compile time, including handling feedback loops and delays [^2^]. This represents the frontier of what Manifold could evolve toward.

9. **JUCE ProcessorChain vs AudioProcessorGraph Represent Two Extremes**: JUCE's `ProcessorChain` is a compile-time-fixed series pipeline (variadic template), while `AudioProcessorGraph` is a fully dynamic runtime graph with `addNode`/`removeNode`/`getConnections` APIs [^76^][^80^]. Manifold sits between these: builder-time dynamic, runtime compiled.

10. **Pull vs Push Architectures Have Different Tradeoffs**: Jamoma Audio Graph uses a pull-based architecture where "processing is driven by the object at the end of the chain" and "inlets are active" requesting audio from sources [^136^]. Apple's AUGraph and ChucK also use pull, with limitations (AUGraph doesn't permit fanning, ChucK is single-threaded). Most plugin frameworks (JUCE, Tracktion) use push. Manifold appears to use push given its compiled execution order.

11. **Graph-Level Optimizations (Fusion, Dead Code Elimination) Are Underexplored**: SuperCollider's `SynthDef` has `optimizeGraph` and UGen-level `performDeadCodeElimination` [^137^][^138^], but these operate at the UGen graph level, not on the audio server runtime. HISE's C++ generator performs some node fusion implicitly through template expansion. Vesa Norilo's DAFX paper proposes a formal grammar for "signal rate optimization" to deduce when nodes must be processed [^54^]. However, node fusion and DCE at the compiled graph level remain largely unexplored in open-source audio frameworks.

12. **Multi-Threaded Graph Execution Requires Dependency Tracking**: Tracktion Graph aims to "ensure nodes can be processed multi-threaded which scales independently of graph complexity" [^77^]. Sadek's AES paper on ARIA presents "a novel algorithm to automate high-level parallelization from graph-based data structures" yielding "effectively optimal cache performance" [^55^]. For multi-threaded execution, delay compensation becomes essential: "Calculate the Delay of Each Node... Determine the Maximum Path Delay... Add Compensatory Delays to Shorter Paths" [^51^].

---

### Major Sources & Authorities

| Source | Relevance |
|--------|-----------|
| **HISE Scriptnode Docs** [^16^][^17^][^70^] | Direct parallel to Manifold's builder/runtime split; C++ code generation from node graphs; JIT vs compiled tradeoffs |
| **Tracktion Graph ADC20 Talk** [^77^] | Topological processing library with latency compensation, node persistence across graph rebuilds, multi-threading aims |
| **SuperCollider SynthDef** [^11^][^12^][^137^] | UGen graph compilation to bytecode, topological sort, graph optimization, dead code elimination |
| **FAUST Documentation** [^17^][^19^][^20^][^21^] | Most sophisticated DSP compilation: control-rate hoisting, delay-line strategies, FIR/IIR reconstruction, scheduling modes |
| **RNBO Architecture** [^78^] | Code generation server model: Max sends graph description, server returns compiled code inserted into audio graph |
| **JUCE DSP Module** [^76^][^80^][^81^] | ProcessorChain (compile-time series) vs AudioProcessorGraph (runtime dynamic); buffer management APIs |
| **Jamoma Audio Graph DAFX Paper** [^136^][^139^] | Pull-based dynamic graph, multi-channel, runtime reconfiguration without recompilation, frame processing |
| **Vesa Norilo DAFX Paper** [^54^] | Formal grammar for audio graph analysis: scheduling, parallelization, signal rate optimization |
| **ACE Studio Multi-Threaded Blog** [^51^] | Modern practical guide: DFS post-order, delay compensation, work distribution, lock-free queues |
| **ADC 2025 Modern C++ Talk** [^2^] | C++23/26 constexpr graph compilation, expression templates, compile-time graph transformations |
| **Sadek AES Paper (ARIA)** [^55^] | Automatic parallelism from dataflow graphs, optimal cache performance extraction |
| **Donat-Bouillud/Kirsch Papers** [^52^][^53^][^58^] | Approximate computing in audio graphs: online degradation, quality/lateness tradeoffs, dataflow scheduling |
| **Superpowered AudiobufferPool** [^105^] | Real-time safe buffer pool with retain/release, lock-free allocation |
| **CLAM Framework** [^140^][^146^] | Processing objects in Network graph, typed ports, FlowControl scheduling, visual NetworkEditor |
| **Fixed vs Variable Buffer Article** [^1^] | Hybrid FIFO chunking strategy, real-time safety checklist, internal fixed-block processing |

---

### Patterns & Best Practices

1. **Two-Phase Compilation Pattern**: Prototype → Compile. HISE: design in node graph → export C++ → recompile. SuperCollider: write UGen graph function → compile SynthDef → send to server. RNBO: edit patcher → code generation server → compiled insertion. Manifold follows this with `PrimitiveGraph` → `prepare()` → `GraphRuntime`.

2. **Pre-Allocated, Pre-Sized Buffer Strategy**: All major frameworks pre-allocate in `prepare()` / `prepareToPlay()`. JUCE's `setSize` with `avoidReallocating=true`, Tracktion's `prepareToPlay` for "allocate buffers etc.", Superpowered's `AudiobufferPool` with pre-allocated memory. The "SAFE BUFFER" mnemonic emphasizes: "Allocate once, reuse always" [^1^].

3. **Topological Execution Order**: Post-order DFS is the de facto standard. Tracktion: "Post-ordered DFS" [^77^]. SuperCollider: `topologicalSort` then `cleanupTopoSort` [^11^]. ACE Studio: "post-order Depth-First Search (DFS)" [^51^]. Manifold's DFS topological sort with cycle detection is consistent.

4. **Node State Persistence Across Graph Rebuilds**: Tracktion explicitly requires that "history buffers will need to be persisted between graphs" and "each node must be uniquely identifiable and the same between graphs" [^77^]. Manifold's node interface with `prepare()` and `process()` allows this if node instances are reused or state is transferred.

5. **Control Rate vs Sample Rate Separation**: FAUST automatically hoists control parameters out of the sample loop: "the `vol` slider value is sampled before the actual DSP loop... GUI widget outputs are 'slow', expressions involving them are moved out of the inner-loop by the compiler" [^19^][^20^]. Manifold nodes could benefit from explicit control-rate scheduling.

6. **Lock-Free Communication Between Threads**: The ACE Studio article advocates "Use lock-free communication — Parameter updates via atomics or double-buffering, not mutexes" [^1^]. Manifold's use of `SPSCQueuePtr` for retired runtimes and atomic exchange for swaps follows this.

7. **Expression Templates for Node Fusion**: HISE's C++ generator "stole the template implementation from the `juce::dsp` module and extended it with different types" using variadic templates [^70^]. The ADC 2025 talk promotes "Expression Templates: Using C++'s template metaprogramming to defer computation, enabling optimized evaluation and graph transformations" [^2^].

8. **Delay Line Strategy Selection**: FAUST provides multiple delay-line implementation strategies (shift buffer, wrapping power-of-two, if-based wrapping) selected via compiler flags `-mcd` and `-dlt` [^19^][^20^]. This is an area where Manifold could offer similar configurability for nodes with delay memory.

---

### Controversies & Conflicting Claims

1. **JIT vs AOT Compilation for Audio DSP**: HISE initially avoided JIT ("embedding of existing toolchains (most likely LLVM) would be overkill") [^17^], but later introduced SNEX JIT compilation using asmjit [^102^]. Some C++ JIT experiments (ClangJIT) show JIT-specialized kernels can execute faster than generic AOT versions and use fewer registers [^109^]. However, JIT compilation in real-time audio contexts raises concerns about compilation time spikes and memory allocation during execution.

2. **Pull vs Push Graph Processing**: Jamoma advocates pull-based processing driven by terminal objects [^136^], while most plugin frameworks (JUCE, Tracktion) use push. Pull enables dynamic graph modification without global recompilation but may complicate parallelization and buffer management. Push aligns with compiled topological order and is more amenable to optimization.

3. **Fixed vs Variable Block Size**: The 2025 article advocates fixed internal blocks for "SIMD-friendly, cache-coherent" processing, while noting that "the VST3 specification explicitly permits variable block sizes" and hosts like FL Studio use variable buffering for PDC [^1^]. Manifold's chunking strategy is a hybrid reconciling these approaches.

4. **Node Fusion Viability**: HISE's C++ generator implicitly fuses some operations through template expansion, but explicit node fusion (e.g., combining Gain→Filter into a single optimized unit) is not widely implemented in open-source frameworks. The ADC 2025 talk suggests this is achievable with C++23 expression templates [^2^], but practical implementations remain limited.

5. **Graph Parallelization Overhead**: Sadek's AES paper shows automatic parallelism yields "effectively optimal cache performance" [^55^], but Norilo's DAFX paper warns: "there is significant scheduling overhead in parallel computation... it is typically ideal to parallelize as little as possible while still maintaining full utilization" [^54^]. Tracktion Graph aims for multi-threading but notes it is still a research target.

6. **SuperCollider's Manual Node Ordering vs Automatic**: A 2024 scsynth.org discussion reveals ongoing debate: "I think it's a design problem that order-of-execution is a user problem in SuperCollider, though I understand why it probably evolved that way. For single-threaded execution, graph execution order more or less has one correct analytical answer" [^147^]. Manifold's automatic topological sort avoids this user-facing complexity.

---

### Relation to Manifold Codebase

1. **PrimitiveGraph ↔ GraphRuntime Split**: Manifold's architecture precisely matches the industry-validated builder/runtime split. The `std::recursive_mutex` on `PrimitiveGraph` allows safe mutation from the message thread, while `GraphRuntime` being "immutable after `prepare()`" ensures the audio thread sees a consistent, compiled graph. This mirrors HISE's interpreted graph → C++ export, SuperCollider's SynthDef compilation, and Tracktion's graph → `NodeGraph` transformation.

2. **DFS Topological Sort**: Manifold's use of DFS topological sort with cycle detection is the correct canonical approach, matching Tracktion Graph, SuperCollider, and the ACE Studio implementation. Cycle detection is essential since feedback loops in audio graphs (e.g., compressor sidechains, resonators) must be handled explicitly.

3. **Scratch Buffers**: Manifold's "pre-allocated scratch buffers" are the right approach for real-time safety. The relationship to `AudioBufferView` / `WritableAudioBufferView` suggests a lightweight, non-owning view pattern that minimizes allocation. This aligns with the Superpowered `AudiobufferPool` approach and the "Allocate once, reuse always" best practice.

4. **Swap Protocol**: The `requestGraphRuntimeSwap()` → atomic exchange → `SPSCQueuePtr` retirement pattern is a textbook lock-free graph replacement strategy. It parallels Tracktion's concern with "Continuity" — Manifold must ensure that node state (filter histories, delay lines, playhead positions) is preserved or gracefully transferred during swaps. The use of `SPSCQueuePtr` (single-producer single-consumer) is appropriate for the audio thread retiring old runtimes to a background cleanup thread.

5. **Chunking for Large Blocks**: Manifold's chunking when "blocks > maxBlockSize" correctly implements the hybrid FIFO-to-fixed-block pattern recommended for handling variable host buffer sizes while maintaining deterministic internal processing [^1^]. This is particularly important for nodes like FFT-based processors (PhaseVocoder, PitchDetector) that require fixed-size blocks.

6. **Node Interface Design**: The `process(inputs, outputs, numSamples)` + `prepare(sampleRate, maxBlockSize)` interface is the standard pattern across JUCE dsp, Tracktion Graph, and Jamoma DSP. The use of buffer views rather than owning buffers is consistent with modern zero-allocation DSP design.

7. **50+ Node Diversity**: With nodes ranging from simple (Filter, Distortion) to complex (LoopPlayback, RetrospectiveCapture, Quantizer, Playhead, Granulator, PhaseVocoder, PitchDetector), Manifold spans the full spectrum of DSP node complexity. The compiled `GraphRuntime` must handle stateful nodes with latency (Reverb, delay-based effects), event-driven nodes (Quantizer, Playhead), and analysis nodes (PitchDetector) uniformly.

8. **Potential Gaps vs State of the Art**:
   - **No explicit control-rate scheduling**: Unlike FAUST, which automatically hoists control-rate computations out of the sample loop, Manifold nodes likely process all inputs at sample rate. For nodes with slowly-varying parameters, this is inefficient.
   - **No node fusion**: Manifold's compiled runtime executes nodes individually. Frameworks like HISE's C++ generator and the ADC 2025 prototype show that fusing adjacent compatible nodes can yield significant speedups.
   - **No automatic parallelization**: Unlike Tracktion Graph's stated aim or Sadek's ARIA system, Manifold's `GraphRuntime` appears single-threaded. For large graphs on multi-core systems, this leaves performance on the table.
   - **Limited graph-level optimization**: SuperCollider's `optimizeGraph` and FAUST's extensive compiler options demonstrate the value of graph-level analysis. Manifold's compilation focuses on topological ordering and buffer allocation, not algebraic optimization.

---

### Recommended Improvements / Opportunities

1. **Implement Control-Rate Scheduling**: Add a `controlRate` property to nodes or ports, and have `GraphRuntime` hoist control-rate computations out of the per-sample loop. Follow FAUST's model: "expressions involving [slow outputs] are moved out of the inner-loop by the compiler" [^19^]. This would benefit parameter smoothing, LFOs, and envelope generators.

2. **Explore Node Fusion in Compilation**: During `prepare()`, analyze the graph for adjacent nodes that can be fused (e.g., Gain→Filter could become a single processor, or multiple math ops could fold into one expression). HISE's C++ generator demonstrates this: "3 addition nodes... the generated Cpp code will boil them down to a single assembly instruction" [^17^]. Consider an expression-template-like approach for the compiled runtime.

3. **Investigate Multi-Threaded Execution**: Tracktion Graph's aim to "ensure nodes can be processed multi-threaded which scales independently of graph complexity" [^77^] is a valuable target. For Manifold, independent branches of the graph (e.g., parallel effect chains) could execute on worker threads with a lock-free task queue, following the ACE Studio pattern [^51^]. Delay compensation would need to be implemented for synchronized mixing.

4. **Add Graph-Level Dead Code Elimination**: During compilation, identify nodes whose outputs are not connected to any sink and eliminate them. SuperCollider's `performDeadCodeElimination` [^138^] and Vesa Norilo's formal grammar for subgraph analysis [^54^] provide precedent. This is particularly relevant for complex builder-time graphs where users may leave disconnected nodes.

5. **Optimize Buffer Allocation with Pooling**: While Manifold pre-allocates scratch buffers, consider a more sophisticated allocation strategy that reuses buffers across non-overlapping node lifetimes (graph coloring for buffer allocation). This could reduce the total scratch memory footprint, following techniques used in deep learning compilers for tensor memory planning [^116^].

6. **Leverage C++23/26 constexpr for Graph Metadata**: Following the ADC 2025 talk [^2^], consider using `constexpr` graph construction for type-safe node connection validation at compile time, or for generating optimized execution schedules for known-static subgraphs. This could apply to Manifold's built-in node library.

7. **Implement Latency Compensation**: If multi-threading or nodes with inherent latency (convolution, lookahead compressors) are added, implement delay compensation as described by ACE Studio: "Calculate the Delay of Each Node... Add Compensatory Delays to Shorter Paths" [^51^]. Tracktion Graph also includes latency compensation in its `createNodeGraph` function [^83^].

8. **Profile and Optimize Delay-Line Strategies**: For nodes with delay memory (Granulator, PhaseVocoder, RetrospectiveCapture), consider offering configurable delay-line strategies similar to FAUST's `-mcd` and `-dlt` options [^19^][^20^]. Power-of-two wrapping buffers may be faster for long delays, while shift buffers are better for short ones.

9. **Consider JIT Compilation for Rapid Prototyping**: Following HISE's SNEX approach [^102^], a JIT-compiled path (e.g., using LLVM ORC or asmjit) could enable faster iteration during development while retaining the compiled `GraphRuntime` for production. This would bridge the "irritating leap from prototyping to production code" [^17^].

10. **Formalize Graph Semantics**: Vesa Norilo's DAFX paper provides a formal set-theoretic grammar for audio graph analysis [^54^]. Adopting similar formalism for Manifold's graph model would enable rigorous optimization proofs and could inform automated parallelization and signal-rate inference.

---

### Raw Evidence Log

**Claim:** HISE Scriptnode explicitly avoids interpreter overhead by compiling node graphs to C++.
**Source:** HISE Scriptnode C++ Generator Documentation
**URL:** https://docs.hise.dev/scriptnode/manual/cpp_generator.html
**Date:** 2019-06-24
**Excerpt:** "Having an interpreter (and a graph based system like Max MSP is the same as a interpreter) that boils down to virtual function calls for each operation node has to be avoided at all costs (or at least the final product has to avoid it)."
**Confidence:** high

---

**Claim:** HISE's compiled C++ generator can fuse multiple simple nodes into single assembly instructions.
**Source:** HISE Scriptnode Rationale Documentation
**URL:** https://docs.hise.dev/scriptnode/index.html
**Date:** 2019-06-24
**Excerpt:** "If you use 3 addition nodes like this: [image] the interpreter will have to calculate three nodes individually. The generated Cpp code will boil them down to a single assembly instruction: `mov xmm0 1.04122`"
**Confidence:** high

---

**Claim:** SuperCollider SynthDef compiles UGen graph functions to bytecode with topological sort and graph optimization.
**Source:** SuperCollider 3.13.0 Help — SynthDef
**URL:** https://depts.washington.edu/dxscdoc/Help/Classes/SynthDef.html
**Date:** Unknown
**Excerpt:** "Create a SynthDef instance, evaluate the ugenGraphFunc and build the ugenGraph." Includes methods: `optimizeGraph`, `topologicalSort`, `cleanupTopoSort`, `performDeadCodeElimination`.
**Confidence:** high

---

**Claim:** SynthDefs separate compilation from instantiation for efficiency.
**Source:** SuperCollider Help — SynthDefs versus Synths
**URL:** https://doc.sccode.org/Guides/SynthDefsVsSynths.html
**Date:** Unknown
**Excerpt:** "A SynthDef takes a ugenGraphFunc and compiles it to a kind of bytecode (sort of like Java bytecode) which can be understood by the server app... If the def being used in a new Synth is already compiled and loaded, there is much less of a CPU spike when creating a new Synth than there was in SC2."
**Confidence:** high

---

**Claim:** FAUST compiler automatically hoists control-rate computations out of the sample loop.
**Source:** FAUST Documentation — Optimizing the Code
**URL:** https://faustdoc.grame.fr/manual/optimizing/
**Date:** 2020-04-10
**Excerpt:** "In the generated C++ code for `compute`, the `vol` slider value is sampled before the actual DSP loop, by reading the `fHslider0` field kept in a local `fSlow0` variable... GUI widget outputs are 'slow', expressions involving them are moved out of the inner-loop by the compiler."
**Confidence:** high

---

**Claim:** FAUST provides 6 scheduling modes with benchmarked performance improvements up to +41%.
**Source:** HAL INRIA Paper — A New Intermediate Representation for FAUST
**URL:** https://hal.science/hal-03124677/document
**Date:** Unknown
**Excerpt:** "Compared to the current scalar mode, we have the following improvement on average: mode 0 average improvement: 22%, mode 1: 25%, mode 2: 29%, mode 3: 23%, mode 4: 25%, mode 5: 25%... considering the mode giving the best result for each test... we get an average improvement of +41%."
**Confidence:** high

---

**Claim:** FAUST delay lines can use multiple strategies selected by compiler flags.
**Source:** FAUST Documentation — Optimizing the Code (Grame)
**URL:** https://faustdoc.grame.fr/manual/optimizing/
**Date:** 2020-04-10
**Excerpt:** "For very short delay lines of up to two samples, the first strategy is implemented by manually shifting the buffer. Then a shift loop is generated for delay from 2 up to `-mcd <n>` samples... For delays values bigger than `-mcd <n>` samples, the second strategy is implemented by either using arrays of power-of-two sizes accessed using mask based index computation... or using a wrapping index moved by an if based method."
**Confidence:** high

---

**Claim:** RNBO uses a code generation server to compile patch graphs to C++ which is then inserted into the audio graph.
**Source:** Cycling '74 — RNBO Architecture
**URL:** https://rnbo.cycling74.com/learn/architecture
**Date:** Unknown
**Excerpt:** "Whenever you make a change to a RNBO patcher, Max sends the graph description of the patch to the code generation server. Code comes back, which Max compiles and inserts into the audio graph."
**Confidence:** high

---

**Claim:** Tracktion Graph uses post-ordered DFS for topological execution and requires node state persistence across graph rebuilds.
**Source:** ADC20 Talk — Introducing Tracktion Graph (Dave Rowland)
**URL:** https://data.audio.dev/talks/2020/introducing-tracktion-graph/slides.pdf
**Date:** 2020
**Excerpt:** "If any nodes have latency, this means they will have a history of previous samples. If this history is not persisted between graphs, there will be a gap/inconsistency in playback and hence a glitch. In order to avoid these discontinuities, any history buffers will need to be persisted between graphs."
**Confidence:** high

---

**Claim:** Tracktion Graph aims for multi-threaded execution that scales independently of graph complexity.
**Source:** Tracktion Graph ADC20 Talk
**URL:** https://data.audio.dev/talks/2020/introducing-tracktion-graph/slides.pdf
**Date:** 2020
**Excerpt:** "Ensure nodes can be processed multi-threaded which scales independently of graph complexity. In theory this should give us the best CPU utilisation."
**Confidence:** high

---

**Claim:** JUCE ProcessorChain is a variadic template for compile-time-fixed series pipelines.
**Source:** JUCE Documentation — ProcessorChain
**URL:** https://docs.juce.com/master/classjuce_1_1dsp_1_1ProcessorChain.html
**Date:** Unknown
**Excerpt:** "This variadically-templated class lets you join together any number of processor classes into a single processor which will call process() on them all in sequence."
**Confidence:** high

---

**Claim:** JUCE AudioProcessorGraph supports dynamic node addition/removal at runtime.
**Source:** JUCE Module Docs — AudioProcessorGraph
**URL:** https://ccrma.stanford.edu/~jos/juce_modules/classAudioProcessorGraph.html
**Date:** Unknown
**Excerpt:** "Node::Ptr addNode(std::unique_ptr<AudioProcessor> newProcessor, NodeID nodeId={})... Node::Ptr removeNode(NodeID)... std::vector<Connection> getConnections() const"
**Confidence:** high

---

**Claim:** Jamoma Audio Graph uses pull-based processing with active inlets requesting from passive outlets.
**Source:** Jamoma Audio Graph Layer DAFX Paper
**URL:** https://www.jamoma.org/publications/attachments/jamoma-audiograph-DAFx.pdf
**Date:** Unknown
**Excerpt:** "Since Jamoma Audio Graph is using a pull-based architecture, an object's outlets are passive. They are simply buffers storing the output calculated by the wrapped unit generator... Unlike the outlets, the inlets are active. When asked for a vector of audio by the unit generator, the inlets each request audio from each of their sources."
**Confidence:** high

---

**Claim:** Jamoma Audio Graph supports dynamic graph modification without global recompilation.
**Source:** Jamoma Audio Graph Layer DAFX Paper
**URL:** https://www.jamoma.org/publications/attachments/jamoma-audiograph-DAFx.pdf
**Date:** Unknown
**Excerpt:** "Connections may be created or dropped at any time before, after or during the graph being processed. That is to say that there is no global signal chain compilation; the graph may dynamically change over the course of its operation and performance."
**Confidence:** high

---

**Claim:** Multi-threaded audio graphs use post-order DFS for execution order and require delay compensation.
**Source:** ACE Studio Blog — Multi-Threaded Audio Processing
**URL:** https://acestudio.ai/blog/multi-threaded-audio-processing/
**Date:** 2024-10-28
**Excerpt:** "The execution order of nodes is established using post-order Depth-First Search (DFS)... Delay compensation involves calculating the delay for each node and adding 'compensatory delays' where needed to ensure signals align at each critical point in the graph."
**Confidence:** high

---

**Claim:** A formal grammar based on set theory can analyze audio graph scheduling, parallelization, and signal rate.
**Source:** Vesa Norilo — A Grammar for Analyzing and Optimizing Audio Graphs (DAFx)
**URL:** http://recherche.ircam.fr/pub/dafx11/Papers/35_e.pdf
**Date:** Unknown
**Excerpt:** "This paper presents a formal grammar for discussing data flows and dependencies in audio processing graphs... three central problems in audio graph processing are examined: scheduling, automatic parallelization, and signal rate inferral."
**Confidence:** high

---

**Claim:** Automatic parallelism from dataflow graphs can yield optimal cache performance.
**Source:** Sadek — Automatic Parallelism for Dataflow Graphs (AES)
**URL:** http://ict.usc.edu/pubs/Automatic%20Parallelism%20for%20Dataflow%20Graphs.pdf
**Date:** 2010-11
**Excerpt:** "This paper presents a novel algorithm to automate high-level parallelization from graph-based data structures representing data flow... Additionally, the parallel execution paths extracted are shown to give effectively optimal cache performance."
**Confidence:** high

---

**Claim:** Approximate computing can degrade audio graph quality online to preserve real-time constraints.
**Source:** Donat-Bouillud/Kirsch — Approximate audio processing in an audio graph (Inria HAL)
**URL:** https://inria.hal.science/hal-01496384/document
**Date:** Unknown
**Excerpt:** "Given a multirate dataflow graph of processing nodes which has to be scheduled in real-time, we aim at choosing one or several nodes for which to degrade computations while preserving realtime constraints."
**Confidence:** high

---

**Claim:** Modern C++23/26 enables compile-time graph construction and optimization.
**Source:** ADC 2025 — Building an Optimized DSP Framework in Modern C++
**URL:** https://conference.audio.dev/session/2025/building-an-optimized-dsp-framework-in-modern-c/
**Date:** 2025-11-12
**Excerpt:** "Features like enhanced `constexpr` and `consteval` execution enable a single, descriptive and clear representation of audio DSP algorithms to generate multiple optimized versions... Compile-time Graph Transformations: Leveraging `constexpr` to construct and optimize directed graphs representing DSP signal flows, including handling feedback loops and delays."
**Confidence:** high

---

**Claim:** Hybrid fixed-internal-block processing via FIFO is recommended for variable host buffer sizes.
**Source:** Fixed vs Variable Buffer Processing in Real-Time Audio DSP
**URL:** https://medium.com/@12264447666.williamashley/fixed-vs-variable-buffer-processing-in-real-time-audio-dsp-performance-determinism-and-66da78390b0f
**Date:** 2025-10-30
**Excerpt:** "hybrids — accepting variable inputs externally but chunking internally via `while (pos < hostSamples) { processInternalBlock(subBlock); pos += blockToProcess; }` — bridge this by internalizing fixed benefits at minor latency cost."
**Confidence:** high

---

**Claim:** Real-time audio buffer pools with retain/release semantics enable lock-free allocation.
**Source:** Superpowered SDK — AudiobufferPool Class
**URL:** https://docs.superpowered.com/reference/latest/audiobuffer-pool/
**Date:** Unknown
**Excerpt:** "AudiobufferPool can allocate audio buffers from pre-allocated memory without any blocking. Every buffer has a retain count which can be incremented by calling `retain` and decremented by calling `release`."
**Confidence:** high

---

**Claim:** CLAM audio framework views systems as Processing objects connected in a Network graph.
**Source:** CLAM Paper — Developing Cross-Platform Audio and Music Applications
**URL:** https://amatria.in/pubs/9d0455-icmc05-clam.pdf
**Date:** Unknown
**Excerpt:** "We can view a CLAM system as a set of Processing objects connected in a graph called Network. Processing objects are connected through intermediate channels. These channels are the only mechanism for communicating between Processing objects."
**Confidence:** high

---

**Claim:** HISE introduced SNEX JIT compilation for scriptnode graphs using asmjit.
**Source:** HISE SNEX Documentation
**URL:** https://docs.hise.dev/scriptnode/manual/snex.html
**Date:** Unknown
**Excerpt:** "Unlike the HiseScript language, which is interpreted, the scriptnode expressions are JIT compiled and run in almost native speed (several orders of magnitude above HiseScript performance). The JIT compiler uses the awesome `asmjit` library to emit the assembly instructions."
**Confidence:** high

---

**Claim:** HISE C++ generator uses variadic templates stolen from JUCE dsp module.
**Source:** HISE Scriptnode C++ Generator
**URL:** https://docs.hise.dev/scriptnode/manual/cpp_generator.html
**Date:** 2019-06-24
**Excerpt:** "The code generator uses the same principle and combines it with meta-template programming to reproduce the graph using variadic templates for each container type. To be honest, I stole the template implementation from the `juce::dsp` module and extended it with different types."
**Confidence:** high

---

**Claim:** SuperCollider community debates whether manual node ordering should be automatic.
**Source:** scsynth.org — Question on Graph / Topological Sort
**URL:** https://scsynth.org/t/question-on-graph-topological-sort/9505
**Date:** 2024-05-10
**Excerpt:** "I think it's a design problem that order-of-execution is a user problem in SuperCollider, though I understand why it probably evolved that way. For single-threaded execution, graph execution order more or less has one correct analytical answer."
**Confidence:** medium

---

**Claim:** GStreamer bufferpool requires creating a new pool when renegotiating, letting the old pool drain.
**Source:** GStreamer Documentation — Bufferpool
**URL:** https://gstreamer.freedesktop.org/documentation/additional/design/bufferpool.html
**Date:** Unknown
**Excerpt:** "We can not just reconfigure the existing bufferpool because there might still be outstanding buffers from the pool in the pipeline. Therefore we need to create a new bufferpool for the new configuration while we let the old pool drain."
**Confidence:** high

---

**Claim:** The "SAFE BUFFER" checklist emphasizes separating real-time and non-real-time tasks, allocating once, using fixed internal blocks, and lock-free communication.
**Source:** Fixed vs Variable Buffer Processing in Real-Time Audio DSP
**URL:** https://medium.com/@12264447666.williamashley/fixed-vs-variable-buffer-processing-in-real-time-audio-dsp-performance-determinism-and-66da78390b0f
**Date:** 2025-10-30
**Excerpt:** "S Separate real-time and non-real-time tasks... A Allocate once, reuse always... F Fixed internal blocks... U Use lock-free communication..."
**Confidence:** high

---

**Claim:** Deep learning compilers use subgraph optimization including operator fusion and constant folding.
**Source:** Science Partner Journal — Compiler Technologies in Deep Learning Co-Design
**URL:** https://spj.science.org/doi/10.34133/icomputing.0040
**Date:** 2023-06-19
**Excerpt:** "Optimization of deep learning compilers enables better mapping of the neural network workload to hardware... graph-level optimization technologies... such as layout optimization, operator fusion, and constant folding."
**Confidence:** high

---

*Report compiled from 20+ independent web searches covering academic papers (DAFx, ICMC, AES, ADC), official framework documentation (JUCE, HISE, FAUST, SuperCollider, Tracktion, RNBO, Jamoma, CLAM), engineering blogs, and conference proceedings.*
