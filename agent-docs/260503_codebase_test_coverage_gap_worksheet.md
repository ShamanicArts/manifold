# Codebase Test Coverage Gap — Comprehensive Worksheet

**Date:** 2026-05-04 (v16)
**Status:** IN PROGRESS — All non-editor core support headers covered (9/9), all 8 tested Lua binding families now fully contracted. Remaining: MIDI/Link/OpenGL/RuntimeNode Lua bindings requiring richer mock, editor export support headers (5) requiring processor editor context, BehaviorCoreEditor.cpp (121 KB, 0 tests) requiring JUCE GUI message thread, and GL-backed shader surface pipeline requiring headless GL context. Production teardown crash fixed: RuntimeNode Lua-ref cleanup centralized in LuaEngine::clearAttachedUiLuaState.
**Audience:** Agents planning or executing test coverage expansion
**Reference session:** `.pi/agent/sessions/--home-shamanic-dev-my-plugin--/2026-05-03T00-00-00-000Z_testing_coverage_analysis.md`
**Prior art:**
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` — Insight #8: "Systemic Testing Blind Spot Across All Subsystems"
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim05.md` — Memory management & real-time safety
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim08.md` — DSP node design & numerical stability
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim01.md` — Lock-free real-time audio architecture
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/manifold_sec08.md` — Prioritized Action Roadmap (Section 8.1: Immediate Phase)
- `agent-docs/260502_full_testing_suite.md` — Full codebase testing suite (living reference)
- `agent-docs/260503_atomic_state_memory_ordering_worksheet.md` — Prior worksheet methodology
- `agent-docs/260503_graph_compiler_optimization_worksheet.md` — Prior worksheet methodology

---

## 1. Executive Summary

The Manifold codebase contains **137 C++ implementation files** (`.cpp`) across ~10 distinct subsystems. Of these, **~31-36 files now have direct test coverage** via the 40 registered CTest tests. The remaining **~101-106 files still have zero direct tests**. This is still not a marginal gap — it remains a systemic coverage problem, just materially less bad than at the start of this worksheet.

The existing test infrastructure (contract testing with golden JSON fixtures, tiered harness architecture, the `ManifoldClient`/`ManagedManifoldProcess` Python harness module) is well-designed and proven by the avsamplerDOCKING and binding god functions decompositions. The gap is in **breadth**, not methodology. The contract testing pattern scales — what's needed is systematic application across all modules.

Kimi Insight #8 (High confidence) flags this as the single most impactful infrastructure investment: "The architecture is *designed* for real-time safety, but 'designed for' is not 'verified to achieve.'" This worksheet extends that finding to *all* correctness concerns, not just real-time safety.

### Scope

This worksheet covers every C++ implementation file in the project, organized by subsystem, with:
- Exact file counts and coverage status
- What behavior each file provides (not just state)
- The contract surface that a test would capture
- A proposed approach for each module
- Dependency and priority ordering

### Key Numbers

| Metric | Count |
|--------|-------|
| Total C++ `.cpp` files (excl. tests, external) | 137 |
| Test harness `.cpp` files (headless + tests) | 47 |
| Registered CTest tests | 50 |
| Files with direct test coverage | ~115 (56 DSP + 2 graph + 2 MIDI + 1 param registry + 1 shader registry + 6 control + 9 core support + 13 imgui-covered files + 5 DSP primitives + 5 new support + ~13 existing) |
| Files with zero direct tests | ~22 |
| DSP nodes with tests | 56 |
| Scripting/binding files with zero behavior tests | ~30 |
| ImGui host files with zero tests | 0 |
| Control/IPC files with zero unit tests | 0 |
| Shader pipeline files with zero tests | 4 |

---

## 2. Tier 0 — DSP Node Layer ✅ COMPLETE

**Implementation:** `DspNodeContractHarness.cpp` — single parameterized harness covering all 56 node types.
**Registration:** `manifold_dsp_node_contract` (label `manifold;dsp;node;contract`)
**Bugs found & fixed:**
- `PlayheadNode.cpp` — position stuck at 0.0 (fetch_add+store → load→modify→store)
- `MidiVoiceNode.h` — envelope never started on trigger (missing `envStage = Attack`)
- `MidiVoiceNode.cpp` — Chamberlin SVF NaN from numerical instability (added q-cap enforcing f²+2fq<4)
- `QuantizerNode.cpp` — quantize always returns input (bestDistance init 0 instead of max)
**Golden file:** `tests/fixtures/dsp_node_contract_golden.json` — 56 nodes, 0 failed
**Highway SIMD:** All 7 Highway variants dual-path compared to scalar (max diff < 1e-4)

### 2.1. Coverage Status (RETAINED FOR REFERENCE)

| Files | Tested | Coverage |
|-------|--------|----------|
| `dsp/core/nodes/*.cpp` — 55 files | **0 / 55** | **0%** |
| `dsp/core/nodes/*.h` (Highway variants) — ~10 SIMD headers | **0 / ~10** | **0%** |
| `dsp/core/graph/PrimitiveNode.h` — node interface contract | **0** | **0%** |

This is the single biggest coverage gap in the entire project. Every filter, delay, effect, oscillator, envelope, and utility node is untested. A regression in any one of them is silent until a user reports it.

### 2.2. File Inventory (55 .cpp files)

| # | File | Behavior | Stateful? | Highway variant? |
|---|------|----------|-----------|-----------------|
| 1 | `ADSREnvelopeNode.cpp` | ADSR envelope generation | Yes — envelope phase, level per voice | Yes (`ADSREnvelopeNode_Highway.h`) |
| 2 | `AllpassNode.cpp` | Allpass filter | Yes — z⁻¹ registers | No |
| 3 | `AudioFmNode.cpp` | Audio-rate FM modulation | No (stateless) | No |
| 4 | `AudioSyncNode.cpp` | Audio-rate sync trigger | Yes — phase tracking | No |
| 5 | `BitCrusherNode.cpp` | Bit-depth + sample-rate reduction | Yes — hold counter, smoothed state | Yes (`BitCrusherNode_Highway.h`) |
| 6 | `ChorusNode.cpp` | Chorus effect with LFO + delay lines | Yes — LFO phase, delay buffer | No |
| 7 | `CombNode.cpp` | Comb filter (feedback delay) | Yes — delay buffer | No |
| 8 | `CompressorNode.cpp` | Dynamics compression | Yes — envelope, gain reduction | No |
| 9 | `ConstantSignalNode.cpp` | Fixed-value signal source | No (stateless) | No |
| 10 | `CrossfaderNode.cpp` | Crossfade between two inputs | No (stateless per sample) | No |
| 11 | `DistortionNode.cpp` | Waveshaping distortion | No (stateless) | No |
| 12 | `EnvelopeFollowerNode.cpp` | Amplitude envelope extraction | Yes — smoothed envelope | No |
| 13 | `EQ8Node.cpp` | 8-band parametric EQ | Yes — biquad filter states | No |
| 14 | `EQNode.cpp` | Single-band EQ (low/high shelf, peak) | Yes — filter states | No |
| 15 | `FilterNode.cpp` | Multi-mode filter (LP/HP/BP/notch) | Yes — z⁻¹ registers | Yes (`FilterNode_Highway.h`) |
| 16 | `FormantFilterNode.cpp` | Formant filter (vocal tract model) | Yes — multiple filter states | No |
| 17 | `ForwardCommitSchedulerNode.cpp` | Schedule future events | Yes — event queue | No |
| 18 | `FrequencyShiftNode.cpp` | Frequency shifter (ring modulation) | Yes — quadrature oscillator state | No |
| 19 | `GainNode.cpp` | Simple gain with smoothing | Yes — smoothing state | Yes (`GainNode_Highway.h`) |
| 20 | `GranulatorNode.cpp` | Granular synthesis engine | Yes — grain envelope, position, window buffer | No |
| 21 | `LimiterNode.cpp` | Lookahead limiter | Yes — gain reduction, delay line | No |
| 22 | `LoopPlaybackNode.cpp` | Loop buffer playback | Yes — playhead, loop state | No |
| 23 | `MSEncoderNode.cpp` | Mid/Side encoder/decoder | No (stateless) | No |
| 24 | `MidiInputNode.cpp` | MIDI message input to control voltages | Yes — note/CC tracking | No |
| 25 | `MidiVoiceNode.cpp` | Polyphonic voice allocator | Yes — voice pool, note assignments | No |
| 26 | `MixerNode.cpp` | Multi-channel audio mixer | Yes — per-channel gain smoothing | Yes (`MixerNode_Highway.h`) |
| 27 | `MultitapDelayNode.cpp` | Multi-tap delay line | Yes — delay buffer, tap positions | No |
| 28 | `NoiseGeneratorNode.cpp` | White/pink noise source | Yes — RNG state | No |
| 29 | `OscillatorNode.cpp` | Wavetable oscillator | Yes — phase, wavetable state | Yes (`OscillatorNode_Highway.h`) |
| 30 | `PassthroughNode.cpp` | Identity/no-op passthrough | No | No |
| 31 | `PhaserNode.cpp` | Phaser effect with allpass chain | Yes — allpass filter states, LFO | No |
| 32 | `PhaseVocoderNode.cpp` | FFT-based phase vocoder | Yes — FFT state, overlap buffer | No |
| 33 | `PitchDetectorNode.cpp` | Real-time pitch detection (autocorrelation) | Yes — buffer history | No |
| 34 | `PitchShifterNode.cpp` | Pitch shifting via overlap-add | Yes — granular/FFT state | No |
| 35 | `PlaybackStateGateNode.cpp` | Gate signal from play state | No (stateless output) | No |
| 36 | `PlayheadNode.cpp` | Playhead position output | No (reads position, writes CV) | No |
| 37 | `QuantizerNode.cpp` | Note/beat quantization | Yes — pending event queue | No |
| 38 | `RecordModePolicyNode.cpp` | Record mode state policy | Yes — mode state | No |
| 39 | `RecordStateNode.cpp` | Record arm/disarm state | Yes — arm state | No |
| 40 | `ResonatorNode.cpp` | Resonant bandpass bank | Yes — per-band filter states | No |
| 41 | `RetrospectiveCaptureNode.cpp` | Always-on capture buffer access | Yes — capture buffer state | No |
| 42 | `ReverbNode.cpp` | Schroeder/Moorer reverb | Yes — comb/allpass filter states | No |
| 43 | `ReverseDelayNode.cpp` | Reverse delay effect | Yes — capture buffer, playhead | No |
| 44 | `RingModulatorNode.cpp` | Ring modulation | No (stateless multiply) | No |
| 45 | `SampleRegionPlaybackNode.cpp` | Sample region playback engine | Yes — playhead, loop/slice state | No |
| 46 | `ShimmerNode.cpp` | Shimmer reverb (pitch-shifted feedback) | Yes — reverb tail + pitch buffer | No |
| 47 | `SineBankNode.cpp` | Additive sine wave bank | Yes — per-oscillator phase/frequency | No |
| 48 | `SlewLimiterNode.cpp` | Portamento/slew limiter | Yes — current value state | No |
| 49 | `SpectrumAnalyzerNode.cpp` | FFT spectral analysis | Yes — FFT state, input buffer | No |
| 50 | `StereoDelayNode.cpp` | Stereo delay with feedback | Yes — delay buffers, filter states | No |
| 51 | `StereoWidenerNode.cpp` | Stereo field widening (M/S) | Yes — delay/smoothing state | No |
| 52 | `StutterNode.cpp` | Stutter effect (gated repeat) | Yes — stutter buffer, gate state | No |
| 53 | `SVFNode.cpp` | State-variable filter | Yes — filter state (s/z¹/bp) | No |
| 54 | `TransientShaperNode.cpp` | Transient attack/sustain shaping | Yes — envelope detector, gain state | No |
| 55 | `TransportStateNode.cpp` | Transport start/stop/position state | Yes — transport state | No |
| 56 | `WaveShaperNode.cpp` | Waveshaping with curves | No (stateless per sample) | Yes (`WaveShaperNode_Highway.h`) |

### 2.3. Researched Findings

**Finding 1 — 55 nodes, zero tests is a structural risk:**
The contract testing methodology already proven for Lua bindings (426 KB golden file), processor state, and MIDI state applies directly to DSP nodes. Each node implements `IPrimitiveNode` with `prepare()` and `process(inputs, outputs, numSamples)`. A parameterized harness covering all registered node types in a single binary is the obvious approach.

**Finding 2 — Node registration is centralized, enabling one-harness coverage:**
`PrimitiveNodes.h` (in `dsp/core/nodes/`) contains the registration table mapping string names to factory functions. A single harness can iterate this table, instantiate each node type, and test it without per-node boilerplate. This is the key architectural enabler that makes 55 nodes testable in one binary.

**Finding 3 — Stateful vs stateless split determines test depth needed:**
Of 55 nodes, ~36 are stateful (delay buffers, filter registers, envelope phases, LFO positions) and ~19 are stateless (pure sample-by-sample math). Stateless nodes need only one deterministic pass. Stateful nodes need:
- Initial state (after `prepare()`, before any processing)
- Steady-state behavior (after N samples of known input)
- State reset / parameter change behavior
- Edge conditions (silence → signal → silence transitions, parameter sweeps)

**Finding 4 — Highway SIMD variants are tested at zero coverage, same gap:**
The `*_Highway.h` headers (`ADSREnvelopeNode_Highway`, `BitCrusherNode_Highway`, `FilterNode_Highway`, `GainNode_Highway`, `MixerNode_Highway`, `OscillatorNode_Highway`, `WaveShaperNode_Highway`) contain the SIMD-optimized implementations. These mirror the scalar logic but use different code paths. Any coverage gap in scalar nodes is doubled for SIMD — a bug could exist in the SIMD path that doesn't appear in the scalar path.

**Finding 5 — No denormal flushing, no NaN detection, no numerical stability verification:**
DSP nodes that use IIR filters (biquad, allpass, comb), exponential smoothing, or feedback loops are susceptible to denormals on x86. Kimi's dimension 8 research flags this: "no denormal handling visible; no automated numerical stability testing (NaN/inf detection, overflow guards)." A test harness that feeds extreme values (silence → full scale, DC offsets, NaN seeds) to each node and verifies bounded, non-NaN output would catch these failures.

### 2.4. Solution Space

**Approach A — Parameterized single-harness (recommended):**

```
DspNodeContractHarness
├── Iterate all registered node types from PrimitiveNodes.h
├── For each node:
│   ├── createInstance()
│   ├── prepare(sampleRate=44100, blockSize=512)
│   ├── generate test tone (440 Hz sine, -6 dBFS, 2 channels)
│   ├── process() N blocks
│   ├── capture output buffer (peaks, spectrum, DC offset)
│   └── dump structured JSON contract
├── --write-contract / --verify-contract
└── Golden file: tests/fixtures/dsp_node_contract_golden.json
```

**Approach B — Per-family harnesses (more granular but more effort):**

| Family | Files | Harness |
|--------|-------|---------|
| Filters | FilterNode, SVFNode, EQNode, EQ8Node, FormantFilterNode, CombNode, AllpassNode, PhaserNode | `FilterNodeHarness.cpp` |
| Delays | StereoDelayNode, MultitapDelayNode, ReverseDelayNode, ChorusNode, StutterNode | `DelayNodeHarness.cpp` |
| Dynamics | CompressorNode, LimiterNode, TransientShaperNode, EnvelopeFollowerNode | `DynamicsNodeHarness.cpp` |
| Sources | OscillatorNode, NoiseGeneratorNode, SineBankNode, ConstantSignalNode | `SourceNodeHarness.cpp` |
| Envelopes | ADSREnvelopeNode, SlewLimiterNode, GainNode | `EnvelopeNodeHarness.cpp` |
| Modulation | AudioFmNode, RingModulatorNode, FrequencyShiftNode, PitchShifterNode | `ModulationNodeHarness.cpp` |
| MIDI/Control | MidiInputNode, MidiVoiceNode, PlayheadNode, QuantizerNode, etc. | `ControlNodeHarness.cpp` |
| Analysis | SpectrumAnalyzerNode, PitchDetectorNode | `AnalysisNodeHarness.cpp` |
| Effects | BitCrusherNode, WaveShaperNode, DistortionNode, StereoWidenerNode, ReverbNode, ShimmerNode | `EffectNodeHarness.cpp` |
| Playback | LoopPlaybackNode, SampleRegionPlaybackNode, RetrospectiveCaptureNode | `PlaybackNodeHarness.cpp` |
| Utility | PassthroughNode, CrossfaderNode, MixerNode, MSEncoderNode | `UtilityNodeHarness.cpp` |

**Approach C — Minimal (Phase 0): node-level fuzz harness**

Start with a fuzz-style harness that doesn't golden-file output but catches crashes, NaN, and denormals:
```
DspNodeSanityHarness
├── For each node type:
│   ├── prepare() with various samplerates/block sizes
│   ├── feed silence → verify no NaN output
│   ├── feed full-scale sine → verify bounded output
│   ├── feed impulse → verify non-infinite response
│   ├── sweep parameter extremes → verify no crash
│   ├── rapid parameter changes → verify no crash
│   └── test silence → full scale → silence transition
└── Returns non-zero on any failure
```

### 2.5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DSP node behavior silently changes after refactoring | Medium | High — user hears degradation | Node contract test catches drift |
| DSP node produces NaN/inf on extreme input | Low | High — audio pipeline breaks | Fuzz-style sanity test |
| Highway SIMD diverges from scalar behavior | Medium | Medium — platform-specific bugs | Dual-path comparison in test |
| Denormal stall causes random glitch | Low | Medium — hard to reproduce | Flush-to-zero verification |
| New node added without tests | Medium | Low-medium | Add to harness registration, or CI gate |

### 2.6. Success Criteria

- [ ] Single parameterized `DspNodeContractHarness` links and runs against all 55+ node types
- [ ] Golden file generated and verified byte-identical on clean run
- [ ] Each node type produces deterministic output given identical input
- [ ] NaN/inf detection pass: zero NaN/inf values for silence, sine, impulse, full-scale inputs
- [ ] Highway SIMD variant tested alongside scalar (same input, equivalent output within tolerance)
- [ ] Parameter sweep edge cases tested (min, max, rapid automation)
- [ ] CTest registration with label `manifold;dsp;node;contract`
- [ ] CI integration: fails on any node drift

---

## 3. Tier 0 — Graph Runtime ✅ COMPLETE

**Implementation:** `GraphRuntimeContractHarness.cpp` — 8 test cases covering compilation, topology, cycle detection, state continuity.
**Registration:** `manifold_graph_runtime_contract` (label `manifold;graph;runtime;contract`)
**Test cases:** empty graph, single passthrough, passthrough chain, gain+filter chain, branch+mix, cycle detection, role gating, StereoDelay state continuity across recompile.
**Golden file:** `tests/fixtures/graph_runtime_contract_golden.json`

### 3.1. Coverage Status (RETAINED FOR REFERENCE)

| Files | Tested | Coverage |
|-------|--------|----------|
| `manifold/primitives/scripting/GraphRuntime.cpp` | **0** | **0%** |
| `manifold/primitives/scripting/PrimitiveGraph.cpp` | **0** | **0%** |
| `manifold/primitives/scripting/GraphRuntime.h` | — | Header only |
| `manifold/primitives/scripting/PrimitiveGraph.h` | — | Header only |
| `dsp/core/graph/PrimitiveNode.h` | — | Node interface contract |

### 3.2. Researched Findings

**Finding 1 — GraphRuntime is the heart of the audio thread and has zero tests:**
`GraphRuntime::process()` traverses the compiled node graph in topological order, dispatching to each node's `process()` method. This is the function called on every audio callback. Any bug in topology sort, buffer routing, scratch buffer management, or chunking causes audible artifacts. Yet it is tested only by the e2e IPC tests, which exercise it indirectly through the full stack.

**Finding 2 — PrimitiveGraph mutation is complex and untested:**
`PrimitiveGraph` handles node registration, connection, disconnection, cycle detection, and recompilation under a `std::recursive_mutex`. The graph mutation logic (adding/removing nodes, connecting/disconnecting ports, detecting feedback cycles) is entirely untested. A corrupt graph can compile into a corrupt runtime that the audio thread silently executes.

**Finding 3 — The compilation pipeline is a black box:**
```
PrimitiveGraph (mutable, message thread)
    → compileGraphRuntime() (allocation, topological sort, scratch buffer setup)
    → GraphRuntime (immutable, audio thread)
    → atomic pointer exchange
    → deferred destruction of old runtime via SPSCQueuePtr
```
Each step in this pipeline has failure modes: allocation failure during compilation, incorrect topology order, corrupted scratch buffer views, race conditions in the atomic pointer exchange. None are tested.

**Finding 4 — State continuity across graph swaps is untested:**
When the graph is recompiled (e.g., user adds a node), stateful nodes need their delay buffers, envelope positions, and filter states transferred. The current `transferStateFrom()` mechanism exists but has zero tests verifying that state is correctly preserved across a recompile cycle.

### 3.3. Solution Space

**Approach — `GraphRuntimeContractHarness`:**

```
GraphRuntimeContractHarness
├── Build a deterministic graph in PrimitiveGraph:
│   ├── Single node (PassthroughNode) — verify identity transform
│   ├── Chain (GainNode → FilterNode → PassthroughNode) — verify topology order
│   ├── Branch (Splitter → [GainNode, FilterNode] → MixerNode) — verify branch routing
│   ├── Cycle (intentional) — verify detection/rejection
│   └── Empty graph — verify graceful no-op
├── For each graph:
│   ├── compileGraphRuntime()
│   ├── process(known input, N blocks)
│   ├── capture output per-node + final output
│   └── compare against expected topology order and signal
├── State continuity test:
│   ├── Build graph with stateful node (StereoDelayNode)
│   ├── Process N samples (fills delay buffer)
│   ├── Recompile with new topology but same node ID
│   ├── Process N more samples
│   └── Verify delay tail continues correctly (not reset)
└── --write-contract / --verify-contract
```

### 3.4. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Topological sort regression — wrong node order | Low | High — order-dependent processing breaks | Contract test with known topology |
| Scratch buffer corruption — node reads wrong input | Low | High — garbage audio | Contract test with deterministic routing |
| Cycle detection regression — infinite loop in compile | Low | Critical — hang on graph mutation | Dedicated cycle-detection test |
| State continuity loss on graph swap | Medium | Medium — filter/delay resets audibly | State continuity contract test |
| Atomic pointer exchange race | Very low | Critical — audio thread reads half-swapped graph | Formal correctness argument needed for this, not just testing |

### 3.5. Success Criteria

- [ ] `GraphRuntimeContractHarness` links and runs with deterministic results
- [ ] Topology order verified: Passthrough chain test, branch test, mixer test
- [ ] Cycle detection verified: intentional feedback returns error
- [ ] State continuity verified: StereoDelayNode delay buffer survives recompile
- [ ] Empty graph verified: process() with zero nodes returns cleanly
- [ ] CTest registration with label `manifold;graph;runtime;contract`

---

## 4. Tier 1 — Scripting Engine ✅ SUBSTANTIALLY COVERED

**Implemented harnesses / tests:**
- `manifold_param_registry_contract` — `ParamRegistryContractHarness.cpp`
- `manifold_dsp_host_lifecycle_contract` — `DSPHostLifecycleContractHarness.cpp`
- `manifold_lua_engine_contract` — `LuaEngineContractHarness.cpp`
- `manifold_lua_bindings_behavior_smoke` — `LuaEngineMockHarness` smoke mode
- `manifold_lua_bindings_contract` — existing registry contract retained

### 4.1. Coverage Status

| Module | Files | Tested | Coverage |
|--------|-------|--------|----------|
| Core engine | 6 | **4 / 6** | **~67%** |
| DSP host layer | 12 | **6 / 12** | **~50%** |
| Lua bindings | 21 | **21 / 21 registry**, **~7 / 21 behavior-touched** | **registry complete, behavior partial** |
| Core engine support | 1 | **1 / 1** (indirect via LuaEngine load/eval) | **~100% indirect** |

### 4.2. File Inventory

#### Core Engine (6 files)
| File | Behavior |
|------|----------|
| `DSPPluginScriptHost.cpp` | Hosts DSP Lua VM, manages plugin lifecycle, deferred mutation |
| `GraphRuntime.cpp` | *Covered in Section 3* |
| `LuaEngine.cpp` | UI Lua VM, script loading, hot-reload, scene graph rendering (102 KB — largest file in project) |
| `PrimitiveGraph.cpp` | *Covered in Section 3* |
| `ScriptableProcessor.cpp` | Base class for scriptable plugin processors |
| `ScriptPathResolver.cpp` | Script file path resolution and sandboxing |

#### DSP Host Layer (12 files)
| File | Behavior |
|------|----------|
| `DSPHostBindingsCore.cpp` | Core DSP host Lua bindings |
| `DSPHostBindingsFx.cpp` | FX slot Lua bindings |
| `DSPHostBindingsSynth.cpp` | Synth Lua bindings |
| `DSPHostDeferredMutation.cpp` | Deferred mutation queue for thread-safe graph changes |
| `DSPHostEndpointSync.cpp` | Endpoint synchronization between DSP and control layers |
| `DSPHostLoopLayerBundle.cpp` | Loop layer bundle management |
| `DSPHostObjectResolver.cpp` | Object path resolution for DSP host internals |
| `DSPHostParamRegistry.cpp` | Parameter registry for DSP host (45 KB) |
| `DSPHostPathMapping.cpp` | Path mapping for DSP host OSC endpoints |
| `DSPHostScriptBootstrap.cpp` | Script bootstrap/initialization |
| `DSPHostTelemetry.cpp` | DSP host telemetry collection |
| `DSPHostValueConverters.cpp` | Value type conversion between Lua and C++ |

#### Lua Bindings Layer (21 files)
| File | Tested | Behavior |
|------|--------|----------|
| `LuaCanvasBindings.cpp` | No | Canvas/scene graph Lua API |
| `LuaCommandBindings.cpp` | No | Command system Lua API |
| `LuaControlBindings.cpp` | No | Control/parameter Lua API (132 KB) |
| `LuaDspBindings.cpp` | No | DSP node Lua API |
| `LuaDspPrimitiveBindings.cpp` | No | DSP primitive wrappers |
| `LuaEventBindings.cpp` | No | Event system Lua API |
| `LuaGraphBindings.cpp` | No | Graph mutation Lua API |
| `LuaGraphicsBindings.cpp` | No | Graphics/rendering Lua API |
| `LuaLinkBindings.cpp` | No | Ableton Link Lua API |
| `LuaMidiBindings.cpp` | No | MIDI Lua API |
| `LuaOpenGLBindings.cpp` | No | OpenGL Lua API |
| `LuaOSCBindings.cpp` | No | OSC Lua API |
| `LuaPrimitiveWrapperHelpers.cpp` | No | Primitive wrapper utilities |
| `LuaRuntimeNodeBindings.cpp` | No | RuntimeNode Lua API |
| `LuaUIBindingHelpers.cpp` | No | UI binding utilities |
| `LuaUIBindings.cpp` | No | Main UI Lua API (67 KB) |
| `LuaUIConstantsBindings.cpp` | No | UI constants/enums |
| `LuaUtilityBindings.cpp` | No | Utility functions |
| `LuaUtilityHelpers.cpp` | No | Utility helpers |
| `LuaWaveformBindings.cpp` | No | Waveform display API |
| `LuaWaveformHelpers.cpp` | No | Waveform helpers |

### 4.3. Researched Findings

**Finding 1 — Lua bindings registry is tested, and behavior is now partially covered:**
`LuaEngineMockHarness` still owns the registry golden-file contract. In addition, its smoke mode is now registered as `manifold_lua_bindings_behavior_smoke` and exercises real side effects across multiple binding families: Canvas/UserData, `command()`, `hasEndpoint()`, `getParam()`, `setParam()`, primitive factories, graph wiring, and endpoint lifecycle. This is no longer registry-only coverage, but it is still not exhaustive per-binding behavior coverage for all 21 files.

**Finding 2 — DSPPluginScriptHost lifecycle now has real contract coverage, with one honest caveat:**
`DSPHostLifecycleContractHarness` covers file load, semantic reload, unload, string-load, endpoint registration, real param binding side effects on named nodes, `onParamChange` side effects, deferred graph mutation, process callback execution via `processBlock()`, and isolated failure-path probes. The remaining caveat: the harness intentionally exits with `std::_Exit(0)`, so destructor/teardown safety is still not contract-tested with ASan/UBSan.

**Finding 3 — LuaEngine.cpp now has minimum viable contract coverage:**
`LuaEngineContractHarness` covers script file load, async `queueEval()` execution, eval error reporting, file-modification hot reload via `notifyUpdate()`, and explicit `reloadCurrentScript()`. This gives the project a real regression tripwire for the highest-risk file in the codebase, even though rendering-path behavior is still mostly outside headless coverage.

**Finding 4 — DSPHostParamRegistry is covered at the real production seam, but a wording correction matters:**
`ParamRegistryContractHarness` covers `clampParamValue`, `sanitizePath`, `isRegistryOwnedCategory`, `handleParamRegister`, path mapping behavior, and binding-shape callback dispatch. Earlier worksheet wording implied a missing full host-level serialization / deserialization round-trip, but there is **no real production DSP-host param round-trip API** exposed to test against. That gap should therefore be framed honestly as a potential future feature / state-surface addition, not as a currently missing test on an existing public contract.

### 4.4. Solution Space

**Approach — Extend existing harnesses rather than create new ones:**

| Target | Existing harness | Extension |
|--------|-----------------|-----------|
| Lua bindings behavior | `LuaEngineMockHarness` | After registry walk, call each binding function with known arguments and verify side effects via mock processor state |
| DSPPluginScriptHost lifecycle | None — new harness needed | `DSPHostContractHarness` — create DSPHost, register plugins, simulate mutation, verify lifecycle state |
| LuaEngine hot-reload | None — needs headless test | `LuaEngineContractHarness` — load script, modify file, verify reload, verify scene graph state |
| DSPHostParamRegistry | None — new harness needed | `ParamRegistryContractHarness` — register parameters, set values, verify ranges, verify serialization round-trip |
| Deferred mutation | None — new harness needed | `DeferredMutationHarness` — enqueue mutations, drain, verify graph state |

**Key insight:** The mock processor pattern from `LuaEngineMockHarness` provides the foundation. A `MockScriptableProcessor` that records all calls (parameter changes, graph mutations, MIDI events) enables behavior testing without running the full audio chain.

### 4.5. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Binding signature correct but behavior wrong | Medium | High — silent wrong API behavior | Behavior contract tests |
| DSPPluginScriptHost lifecycle bug (use-after-free) | Low | Critical — crash | Lifecycle contract test with ASan |
| LuaEngine hot-reload corrupts scene graph | Low | Medium — visual artifacts | Hot-reload contract test |
| Param registry drift breaks automation | Medium | High — user presets load wrong values | Param registry contract + round-trip save/load test |
| Deferred mutation ordering incorrect | Low | Medium — wrong final graph state | Mutation sequence contract test |

### 4.6. Success Criteria

- [x] `LuaEngineMockHarness` behavior exercised in CTest via `manifold_lua_bindings_behavior_smoke` — real side effects covered across multiple binding families
- [x] `DSPHostLifecycleContractHarness` created: load/reload/unload/string-load, real bind side effects, deferred mutation, process callback, failure probes
- [x] `DSPHostParamRegistry` core contract covered at the real exposed seam: clamp, sanitize, category, register, bind dispatch — DONE
- [ ] DSP-host param persistence round-trip — BLOCKED / NOT APPLICABLE YET: no real production serialize+load API exists for this surface
- [x] `ScriptingEngine` labels added to CTest registry (`scripting`, `lifecycle`, `luaengine`, `behavior`)
- [x] `LuaEngine.cpp` (102 KB) has at minimum: script load, eval, hot-reload contract

---

## 5. Tier 1 — Control/IPC Layer ✅ COMPLETE

**Implemented harnesses / tests:**
- `manifold_command_parser` — `CanonicalCommandHarness.cpp`
- `manifold_command_queue` — `ControlCommandQueueHarness.cpp`
- `manifold_endpoint_resolver` — `EndpointResolverHarness.cpp`
- `manifold_osc_endpoint_registry_contract` — `OSCEndpointRegistryContractHarness.cpp`
- `manifold_osc_settings_persistence_contract` — `OSCSettingsPersistenceContractHarness.cpp`
- `manifold_control_server_contract` — `ControlServerContractHarness.cpp`
- `manifold_oscquery_server_contract` — `OSCQueryServerContractHarness.cpp`
- `manifold_osc_server_contract` — `OSCServerContractHarness.cpp`
- existing `manifold_headless_oscquery_contract` retained for end-to-end OSCQuery path-tree coverage

### 5.1. Coverage Status

| Files | Tested | Coverage |
|-------|--------|----------|
| `manifold/primitives/control/ControlServer.cpp` | **1 / 1** | **100% contract** |
| `manifold/primitives/control/OSCQuery.cpp` | **1 / 1** + existing e2e | **100% contract + e2e path-tree** |
| `manifold/primitives/control/OSCServer.cpp` | **1 / 1** | **100% contract** |
| `manifold/primitives/control/OSCEndpointRegistry.cpp` | **1 / 1** | **100% contract** |
| `manifold/primitives/control/CommandParser.h` | **registered + passing** | **canonical parser covered** |
| `manifold/primitives/control/EndpointResolver.cpp` | **1 / 1** | **100% harness** |
| `manifold/primitives/control/OSCSettingsPersistence.cpp` | **1 / 1** | **100% contract** |
| `manifold/primitives/control/OSCPacketBuilder.h` | — | Header only |

### 5.2. Researched Findings

**Finding 1 — The subsystem now has both seam tests and real server-behavior contracts:**
The control layer now has direct coverage at both levels: seam tests for parser / queue / resolver / registry / settings, and real server contracts for Unix-socket IPC (`ControlServer`), HTTP + WebSocket metadata/value streaming (`OSCQuery`), and UDP dispatch / broadcast routing (`OSCServer`). The remaining work in this area is hardening and future drift detection, not a first-pass coverage vacuum.

**Finding 2 — ControlServer contract now covers the real Unix-socket flow, not just parser helpers:**
`ControlServerContractHarness` starts the real server, connects actual Unix-socket clients, verifies `PING`, state/value/diagnostics queries, canonical command enqueue/direct-write behavior, error responses, watcher registration, and `EVENT` streaming. This closes the highest-value direct-coverage hole in IPC.

**Finding 3 — OSCQuery and OSCServer now have direct contracts for the behavior users actually hit:**
`OSCQueryServerContractHarness` verifies `/info`, `HOST_INFO`, VALUE lookups, `/api/targets`, `/api/command`, and WebSocket `LISTEN` streaming. `OSCServerContractHarness` verifies inbound OSC dispatch to command/direct endpoints, custom-value capture for non-backend paths, direct outbound broadcast, state-diff routing, and target-management semantics. That is the actual user-facing protocol surface, not just metadata structs.

**Finding 4 — Settings persistence needed sandboxing to be tested honestly:**
`OSCSettingsPersistence` uses JUCE special locations and would normally touch the real user config path. `OSCSettingsPersistenceContractHarness` self-reexecs with sandboxed `HOME` / `XDG_CONFIG_HOME` before JUCE resolves paths, so the contract verifies save/load/reset semantics without touching the user's actual config. This was necessary to make the test legitimate instead of silently mutating real settings.

### 5.3. Solution Space

**Completed in this pass:**
- `CanonicalCommandHarness` registered as `manifold_command_parser`
- `ControlCommandQueueHarness` registered as `manifold_command_queue`
- `EndpointResolverHarness` registered as `manifold_endpoint_resolver`
- `OSCEndpointRegistryContractHarness` added for backend/custom endpoint inventory and rebuild semantics
- `OSCSettingsPersistenceContractHarness` added for sandboxed save/load/reset behavior
- `ControlServerContractHarness` added for real Unix-socket command/query/watch/event behavior
- `OSCQueryServerContractHarness` added for HTTP metadata, VALUE routing, `/api/targets`, `/api/command`, and WebSocket LISTEN streaming
- `OSCServerContractHarness` added for UDP dispatch, custom-value capture, target management, direct broadcast, and state-diff routing

**Remaining work (optional hardening, not first-pass coverage):**
- malformed/partial socket read fuzzing for `ControlServer`
- explicit WebSocket `IGNORE` / disconnect edge-case probes
- higher-concurrency or max-client stress probes if this layer becomes a real source of regressions

### 5.4. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Command format change breaks IPC tools | Low | High — all external tooling breaks | Register CanonicalCommandHarness immediately |
| OSCQuery metadata drift (wrong type/range) | Low | Medium — external tools misinterpret params | OSCQuery metadata contract |
| ControlServer connection leak on client disconnect | Low | Medium — fd leak over time | Connection lifecycle contract test |
| Malformed command crashes server | Low | High — IPC unresponsive | Fuzz-style command parsing test |

### 5.5. Success Criteria

- [x] `CanonicalCommandHarness` registered in CTest and passing
- [x] `ControlCommandQueueHarness` registered in CTest and passing
- [x] `EndpointResolverHarness` registered in CTest and passing
- [x] `OSCEndpointRegistry` contract registered and passing
- [x] `OSCSettingsPersistence` contract registered and passing (sandboxed, no real user config touch)
- [x] ControlServer contract: command/query/watch/event behavior verified against real Unix socket
- [x] OSCQuery metadata contract: type, range, description, VALUE, `/api/targets`, `/api/command`, and LISTEN streaming verified
- [x] OSCServer direct routing / target-management contract

---

## 6. Tier 1 — MIDI Layer ✅ COMPLETE

**Implementation:** Extended `BehaviorCoreMidiContractHarness.cpp` — 5 new behavior domains added to existing harness.
**Registration:** `manifold_core_midi_contract` (label `manifold;core;midi;contract`)
**Bug found & fixed:**
- `MidiManager.cpp` — `handleNoteOn` inflates `numActiveVoices_` on note retrigger. `findVoicePlayingNote` returns existing voice → `voice.reset()` sets `active=false` → `voice.active=true` → count always increments. Added guard: only increment for new voices, not retriggers. After fix, `releaseAllVoices()` correctly returns to 0 instead of leaving 1 ghost voice.
**Test domains:**
- **Domain 1 — Voice allocation & stealing**: 9 simultaneous notes, 14 simultaneous notes, retrigger, release all
- **Domain 2 — Sustain pedal**: hold 3 notes with sustain, release, sostenuto (CC66) distinction
- **Domain 3 — Channel filtering**: channel mask drops channel 2, passes channel 1, omni mode bypass
- **Domain 4 — Ring buffer edge cases**: fill-to-capacity (255), wraparound (write 200/read 150/write 200), peek-dont-consume, read-empty
- **Domain 5 — MIDI clock**: 24 clock ticks (0xF8), Start/Continue/Stop transport (0xFA/0xFB/0xFC), active sensing (0xFE)
**Golden file:** `tests/fixtures/core_midi_golden.json` (19025 bytes, up from ~2KB)

### 6.1. Coverage Status (RETAINED FOR REFERENCE)

| Files | Tested | Coverage |
|-------|--------|----------|
| `manifold/primitives/midi/MidiManager.cpp` | **Partial** (core MIDI contract) | **Behavior not covered** |
| `manifold/primitives/midi/MidiEvent.cpp` | **0** | **0%** |
| `manifold/primitives/midi/MidiRingBuffer.h` | **0** | **0%** |

### 6.2. Researched Findings

**Finding 1 — The core MIDI contract covers helper state, not MIDI processing behavior:**
`BehaviorCoreMidiContractHarness` tests synthetic MIDI through the processor's MIDI helper layer (note on/off, CC, pitch bend, program change). It does NOT test `MidiManager.cpp`'s internal behavior (voice allocation, note priority, MIDI routing, channel filtering) or `MidiRingBuffer.h` (lock-free read/write correctness, overflow behavior, memory ordering).

**Finding 2 — MidiManager is the polyphonic voice hub and is untested at the behavior level:**
Voice allocation (which voice steals when all voices are used), note priority (last-note vs highest vs lowest), and channel routing are the most user-facing MIDI behaviors. Each has edge cases:
- Voice stealing with sustain pedal
- Mono vs poly modes
- Omni vs channel-specific mode
- MIDI clock sync behavior

### 6.3. Solution Space

**Approach — Extend the existing MIDI contract harness:**
- `BehaviorCoreMidiContractHarness` already creates a processor and injects MIDI. Extend it to:
  - Test voice allocation: inject 9 note-on messages for an 8-voice synth, verify voice stealing behavior
  - Test sustain pedal: note-on, sustain-on, note-off → verify note persists, sustain-off → verify note releases
  - Test channel filtering: inject MIDI on channel 2 when processor is set to channel 1 → verify no output
  - Test MIDI clock: inject clock ticks, verify tempo state updates
  - Test note priority modes: last-note vs highest-note vs lowest-note
- All behaviors produce deterministic state snapshots suitable for golden-file comparison

### 6.4. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Voice stealing algorithm change breaks user patches | Medium | Medium — wrong notes play | Voice allocation contract test |
| Sustain pedal state machine regression | Low | Medium — stuck notes | Sustain pedal test sequence |
| MIDI channel filtering regression | Low | Medium — notes on wrong channels | Channel filtering test |
| MidiRingBuffer overflow drops messages silently | Low | Low-medium — lost notes | Ring buffer behavior test |

### 6.5. Success Criteria

- [ ] Voice allocation test: 9 notes on 8 voices, verify voice stealing behavior
- [ ] Sustain pedal state machine: note-on → sustain-on → note-off → sustain-off sequence
- [ ] Channel filtering: channel-specific MIDI correctly filtered/routed
- [ ] MidiRingBuffer read/write contract: deterministic input → correct output + overflow behavior documented
- [ ] CTest label `manifold;midi;contract` covering behavior beyond helper state

---

## 7. Tier 2 — ImGui Host Layer ✅ COMPLETE

### 7.1. Coverage Status

| Files | Tested | Coverage |
|-------|--------|----------|
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | **Partial** — contract added | **Geometry extracted, rendering not** |
| `manifold/ui/imgui/ImGuiHierarchyHost.cpp` | **Partial** — input support contract | **Input queue semantics extracted, rendering/tree state not** |
| `manifold/ui/imgui/ImGuiHost.cpp` | **Partial** — text-input support contract | **Keyboard/mouse queue + language mapping extracted** |
| `manifold/ui/imgui/ImGuiInspectorHost.cpp` | **Partial** — text-input support contract | **Keyboard/mouse queue + language mapping extracted** |
| `manifold/ui/imgui/ImGuiOpenGLBackend.cpp` | **Smoke covered** — backend init/frame/render/shutdown | **Direct smoke coverage** |
| `manifold/ui/imgui/ImGuiPerfOverlayHost.cpp` | **Partial** — overlay support contract | **Bounds/tab/scroll/drag logic extracted** |
| `manifold/ui/imgui/ImGuiRuntimeNodeHost.cpp` | **Partial** — runtime host support contract | **Preview/hover/click/exit helper logic extracted** |
| `manifold/ui/imgui/ImGuiScriptListHost.cpp` | **Partial** — script-list support contract | **Label + action semantics extracted** |
| `manifold/ui/imgui/ManifoldImGuiGlobals.cpp` | **Contract covered** — thread-local ImGui context pointer semantics | **Direct contract coverage** |
| `manifold/ui/imgui/RuntimeNodeRenderer.cpp` | **Partial** — geometry support contract | **Preview transform / hit-test extracted, rendering not** |
| `manifold/ui/imgui/Theme.cpp` | **Partial** — support contract | **Style snapshot / apply semantics covered** |
| `manifold/ui/imgui/ToolComponents.cpp` | **Partial** — support contract | **Color/runtime-step/graph-layout helpers extracted** |
| `manifold/ui/imgui/WidgetPrimitives.cpp` | **Partial** — geometry support contract | **Row/header geometry math extracted** |

### 7.2. Researched Findings

**Finding 1 — The DirectHostGeometry work proved the pattern: extract support headers from ImGui-dependent code:**
The recent `DirectHostGeometrySupport.h` extraction showed that geometry logic (layout, rectangle math, hit testing) can be pulled out of the ImGui-dependent rendering code and tested independently. This pattern should be applied across the other 12 ImGui host files — extract the layout/geometry/state logic into support headers, test that.

**Finding 2 — Most of these files are rendering state machines, not raw GPU calls:**
`ImGuiHierarchyHost` manages the runtime node hierarchy tree. `ImGuiRuntimeNodeHost` manages per-node editor controls. `ImGuiScriptListHost` manages script file navigation. These all have internal state (open/closed nodes, scroll positions, selection state, filter text) that can be tested without a GL context.

**Finding 3 — RuntimeNodeRenderer is the most complex untested renderer component:**
It handles node positioning, wire routing, color coding, zoom/pan, and hit testing. These are all pure geometry operations. The pattern from `DirectHostGeometryHarness` applies directly: extract rectangle layout and routing logic into `NodeRendererGeometrySupport.h`, test with golden-file rectangle snapshots.

### 7.3. Solution Space

**Completed across the ImGui support passes:**

| Host file | Extracted logic | Support header / harness |
|-----------|-----------------|--------------------------|
| `RuntimeNodeRenderer.cpp` | preview transform, scene bounds, z-sort, hit testing | `RuntimeNodeGeometrySupport.h` / `RuntimeNodeGeometryContractHarness.cpp` |
| `WidgetPrimitives.cpp` | row/header layout math and visual-state resolution | `WidgetGeometrySupport.h` / `WidgetGeometryContractHarness.cpp` |
| `Theme.cpp` | style snapshot mapping from tokens to ImGui style | `ThemeSupport.h` / `ThemeSupportContractHarness.cpp` |
| `ImGuiHierarchyHost.cpp` | mouse/focus/button input queue transitions | `HierarchyHostInputSupport.h` / `HierarchyHostInputContractHarness.cpp` |
| `ImGuiHost.cpp` | text-input queue, key translation, language mapping | `TextInputHostSupport.h` / `TextInputHostSupportContractHarness.cpp` |
| `ImGuiInspectorHost.cpp` | text-input queue, key translation, language mapping | `TextInputHostSupport.h` / `TextInputHostSupportContractHarness.cpp` |
| `ImGuiScriptListHost.cpp` | display label + row activation/open semantics | `ScriptListSupport.h` / `ScriptListSupportContractHarness.cpp` |
| `ImGuiPerfOverlayHost.cpp` | title/tab/content layout, scroll math, drag clamping | `PerfOverlaySupport.h` / `PerfOverlaySupportContractHarness.cpp` |
| `ToolComponents.cpp` | color conversions, runtime-step heuristics, graph layout | `ToolComponentSupport.h` / `ToolComponentSupportContractHarness.cpp` |
| `ImGuiRuntimeNodeHost.cpp` | scene/local coordinate helpers, hover/click/exit semantics | `RuntimeNodeHostSupport.h` / `RuntimeNodeHostSupportContractHarness.cpp` |
| `EditorShellSupport.h` (ImGui shaping seam) | hierarchy row projection, inspector row projection, enum selection shaping | `EditorShellImGuiSupport.h` / `EditorShellImGuiSupportContractHarness.cpp` |
| `ImGuiInspectorHost.cpp` | text-edit state sync and inline document reload/language decision logic | `InspectorHostStateSupport.h` / `InspectorHostStateSupportContractHarness.cpp` |
| `ManifoldImGuiGlobals.cpp` | thread-local ImGui context pointer semantics | `ManifoldImGuiGlobalsContractHarness.cpp` |
| `ImGuiOpenGLBackend.cpp` | OpenGL backend init/new-frame/render/shutdown smoke | `ImGuiOpenGLBackendSmokeHarness.cpp` |

**Remaining work:**

| Host file | Extractable logic | Support header |
|-----------|------------------|----------------|
| — | No remaining zero-test ImGui files | — |

**Note:** the hierarchy “tree state” seam turned out not to live inside `ImGuiHierarchyHost.cpp` itself; the meaningful remaining state shaping was upstream in `EditorShellSupport.h`, so that is where the contract was added.

### 7.4. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Node layout regression after refactoring | Medium | Medium — visual only | Extracted geometry contract |
| Hierarchy tree state corruption | Low | Low — visual only | Tree state contract |
| Selection state loss on script reload | Low | Low — user re-selects | Selection state test |
| Widget geometry drift (wrong click areas) | Low | Medium — UI feels broken | Widget geometry contract |

### 7.5. Success Criteria

- [x] `RuntimeNodeRenderer` geometry extracted to support header and tested via contract (preview transform, scene bounds, hit testing)
- [x] Real hierarchy state/config shaping contract tested at the actual seam (`EditorShellSupport.h`), including row projection and selection shaping
- [x] Theme computation contract tested (color palette, style resolution)
- [x] Widget geometry math contract tested (row/header layout math)
- [x] At least 4 ImGui host files now have extracted, tested support logic
- [x] Additional host support seams covered: text-input hosts, script list, perf overlay, runtime-node host, tool components
- [x] CTest labels now cover `manifold;imgui;geometry;contract` plus `theme` / `hierarchy` / `input` / `perf` / `scriptlist` / `runtime` / `tools` support

---

## 8. Tier 2 — Shader Pipeline ✅ PARTIALLY COVERED

**Implemented harness / test:**
- `manifold_shader_registry_contract` — `ShaderRegistryContractHarness.cpp`

**What it covers:**
- builtin inventory and metadata integrity across all registered effects
- lookup, shader source generation, and blend-op shader generation
- parameter sanitization and clamping
- pipeline descriptor validation
- runtime effect reload / clear via `UserScripts/shaders`
- direct manifest loading failure cases (missing manifest, missing GLSL, invalid JSON)

### 8.1. Coverage Status

| Files | Tested | Coverage |
|-------|--------|----------|
| `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` | **0** | **0%** |
| `manifold/primitives/shaders/ShaderEffectRegistry.cpp` | **1 / 1** | **100% contract** |
| `manifold/primitives/composite/CompositeSurfaceProvider.cpp` | **0** | **0%** |
| `manifold/primitives/sources/GeneratedSourceProvider.cpp` | **0** | **0%** |
| `manifold/primitives/sources/TextureSourceRegistry.cpp` | **0** | **0%** |

### 8.2. Researched Findings

**Finding 1 — Shader pipeline components require GL context, complicating testing:**
`ShaderSurfaceProvider` manages an OpenGL shader surface, compiling GLSL programs, handling uniform updates, and managing framebuffer objects. Testing these requires either a GL context (OSMesa, EGL on Linux, or mocked) or structural extraction.

**Finding 2 — `ShaderEffectRegistry.cpp` contains pure registry logic testable without GL:**
The registry maps effect names to shader metadata (GLSL source, uniform definitions, parameter ranges). This is a pure data structure (string → struct map) that can be tested without GL: register effects, verify they're retrievable, verify parameter metadata is correct, verify enum/name mappings. The shader compilation step is separate from the registry logic.

**Finding 3 — The Kimi research (Insight #6, High confidence) identifies the registry as a test seam:**
The `ShaderEffectRegistry` is the infrastructure that already exists but isn't tested. A registry contract test would verify that all 17+ registered shader effects have valid metadata, correct parameter ranges, and unique names — without needing a GL context.

### 8.3. Solution Space

**Approach — Registry-first, surface-second:**

1. **Phase 0: `ShaderEffectRegistry` contract** — instantiate registry, verify all registered effects have valid metadata, parameter names, type info, and range constraints. No GL needed.

2. **Phase 1: `ShaderSurfaceProvider` extracted logic** — extract shader compilation state management (success/failure tracking, fallback behavior) from the GL-dependent rendering path. Test without GL.

3. **Phase 2: GL-backed integration test** — use `ShaderSurfaceProvider` with a mock GL context (OSMesa headless) for basic pipeline test: load shader, compile, verify no compile errors.

### 8.4. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shader metadata drift — wrong param names | Medium | Medium — broken external shader docs | Registry metadata contract |
| Shader compilation failure after GLSL edit | Low | Medium — visual artifact | GL-backed compilation test |
| Composite surface provider state corruption | Low | Medium — compositing issues | State contract after extraction |
| Texture source registry registration order change | Low | Low — texture source reordering | Registry contract |

### 8.5. Success Criteria

- [x] `ShaderEffectRegistry` contract: all registered effects verified for metadata, params, sanitization, pipeline validation, and runtime reload semantics
- [x] Registry contract registered in CTest with label `manifold;shader;registry;contract`
- [ ] ShaderSurfaceProvider fallback/logic path tested without GL
- [ ] (Stretch) OSMesa-backed compilation smoke test

---

## 9. Tier 2 — Core Processor Layer (Lower Priority — Partially Covered)

### 9.1. Coverage Status

| Files | Tested | Coverage |
|-------|--------|----------|
| `manifold/core/BehaviorCoreProcessor.cpp` (177 KB — largest .cpp) | **Partial** — state + MIDI + support contracts | **Processing behavior not covered** |
| `manifold/core/BehaviorCoreEditor.cpp` (121 KB) | **0** | **0%** |
| 13 support headers (extracted from processor) | **Partial direct** — 4 support contracts added | **4 / 13 directly exercised** |

### 9.2. Researched Findings

**Finding 1 — Processor has state contracts but no processing behavior tests:**
The state projection contract (`manifold_core_state_contract`) verifies that the processor's state JSON schema is correct. The MIDI contract (`manifold_core_midi_contract`) verifies MIDI helper layer behavior. Neither tests the actual `processBlock` callback — audio processing, parameter automation smoothing, latency reporting, or graph swap lifecycle.

**Finding 2 — The 13 support headers were extracted from the processor god file:**
Files like `LinkSupport.h`, `MidiSupport.h`, `StateSerializationSupport.h`, `ControlCommandSupport.h`, `GraphRuntimeSupport.h` contain code that was extracted from the original god-class `BehaviorCoreProcessor` during the binding god functions decomposition. Each was tested at extraction time via comparison against the original file (same behavior, different structure). They have not been independently tested since extraction, meaning a bug introduced later in any support header is silent.

**Finding 3 — BehaviorCoreEditor (121 KB) has zero tests:**
This is the plugin editor implementation — UI layout, shell commands, renderer management, parameter binding. It handles user interaction, keyboard focus, editor lifecycle. Untested.

### 9.3. Solution Space

**Completed in this pass:**
- `LinkSupportContractHarness` — helper get/set/request semantics over real `LinkSync`
- `GraphRuntimeSupportContractHarness` — pending swap, mutation pause/resume, retire/fallback semantics
- `StateSerializationSupportContractHarness` — helper strings/path extraction, serialized alias map, Lua full+incremental serialization, change-cache helpers, link/runtime sub-builders
- `ControlCommandSupportContractHarness` — command-to-path dispatch, layer fanout, toggle state mutation, queue drain semantics

**Remaining work:**
- `MidiSupport` contract
- `BehaviorQuerySupport` contract
- `BehaviorParamSupport` / `BehaviorHousekeepingSupport` / `DspSlotSupport` deeper direct contracts as needed
- editor lifecycle / shell behavior once UI-side seams are chosen

### 9.4. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Support header regression after modification | Medium | High — processor behavior changes | Independent support header contracts |
| Editor behavior broken by UI changes | Low | Medium — user-facing bug | Editor contract (hard — needs UI) |
| ProcessBlock regression (audio output changes) | Low | High — user hears difference | Processing behavior test (needs DSP test tone) |

### 9.5. Success Criteria

- [ ] Each extracted support header has a corresponding contract test exercising public API
- [ ] State serialization round-trip test: save → load → save → verify byte-identical
- [x] Link state contract: all 7 Link fields set/get correctly
- [ ] Editor state contract: basic lifecycle (create, show, hide, destroy)
- [x] First support-header CTest labels in place: `manifold;core;support;contract`

---

## 10. Tier 3 — Primitives Layer (Lower Priority)

### 10.1. Coverage Status

| Module | Files | Tested |
|--------|-------|--------|
| `manifold/primitives/dsp/` (CaptureBuffer, LoopBuffer, Playhead, Quantizer, TempoInference) | 5 headers | **0 tests** |
| `manifold/primitives/core/` (Settings, SystemPaths) | 2 implementations | **0 tests** |
| `manifold/primitives/composite/` (CompositeSurfaceProvider) | 1 implementation | **0 tests** |
| `manifold/primitives/sync/` (LinkSync) | 1 implementation | **0 tests** |
| `manifold/primitives/ml/` (MLMaskSurfaceProvider, MLPipeline) | 2 implementations | **0 tests** |
| `manifold/primitives/ui/` (RuntimeNode) | 1 header | **0 tests** |

### 10.2. Researched Findings

**Finding 1 — CaptureBuffer and LoopBuffer are core DSP infrastructure, untested:**
`CaptureBuffer` manages the always-on audio capture ring buffer. `LoopBuffer` manages loop recording/playback buffers. These are used by every loop recording and playback operation. A bug in buffer management (wrong wrap position, incorrect write pointer, off-by-one in read/write overlap) corrupts audio.

**Finding 2 — TempoInference is heuristic-based and particularly needs testing:**
The tempo inference algorithm detects BPM from incoming audio. This is inherently heuristic and needs a test suite of known-tempo audio examples to verify detection accuracy and regression safety. Without tests, any change to the inference algorithm is flying blind.

### 10.3. Solution Space

**Approach — Focus on the DSP-relevant primitives first:**

1. `CaptureBuffer` / `LoopBuffer` contract: deterministic write → read of known audio, verify byte-identical content, test wrap-around at buffer boundaries
2. `TempoInference` contract: feed known BPM test signals (120, 140, 90 BPM click tracks), verify detected BPM within tolerance
3. `Playhead` / `Quantizer` contract: test quantization of positions to beat grid at various time signatures and swing amounts

### 10.4. Success Criteria

- [ ] `CaptureBuffer` read/write contract: write N samples, read back, verify byte-identical
- [ ] `LoopBuffer` record/play lifecycle: record → play → verify correct content
- [ ] `TempoInference` accuracy: 3+ known tempos detected within ±2 BPM
- [ ] `Quantizer` contract: known positions quantized to expected beat grid positions

---

## 11. Deferred Orphaned Tests (Zero New Code)

### 11.1. Inventory

These tests exist as code but remain intentionally deferred per user instruction.

| Harness file | Proposed CTest name |
|-------------|---------------------|
| `tests/e2e_editor_ipc_test.py` | `manifold_headless_editor_ipc` |
| `tests/e2e_fx_slot_swap_test.py` | `manifold_headless_fx_slot_swap` |
| `tests/e2e_main_fx_lazy_test.py` | `manifold_headless_main_fx_lazy` |
| `tests/e2e_rack_eq_palette_test.py` | `manifold_headless_rack_eq_palette` |
| `tests/e2e_super_fx_lazy_test.py` | `manifold_headless_super_fx_lazy` |
| `tests/main_tab_bar_test.py` | `manifold_headless_main_tab_bar` |
| `tests/standalone_direct_regression_test.py` | `manifold_standalone_direct_regression` |
| **Total** | **7 deferred registrations** |

### 11.2. Wiring pattern (per test)

```cmake
add_test(
    NAME manifold_<name>
    COMMAND $<TARGET_FILE:<HarnessTarget>>
            <args>)
set_tests_properties(manifold_<name> PROPERTIES
    LABELS "manifold;<domain>;<type>")
```

For Python-based tests, the cmd template is already established by existing registrations (see lines 1354-1362 of CMakeLists.txt).

### 11.3. Success Criteria

- [ ] All 7 deferred orphaned tests registered in CTest
- [ ] All 7 pass on the current codebase (or documented as expected failures if not)
- [ ] CI includes them in the test run

---

## 12. Highway/SIMD Variant Coverage (Cross-Cutting)

### 12.1. Coverage Status

| File | Scalar tested? | SIMD tested? |
|------|---------------|--------------|
| `ADSREnvelopeNode` + `ADSREnvelopeNode_Highway.h` | No | No |
| `BitCrusherNode` + `BitCrusherNode_Highway.h` | No | No |
| `FilterNode` + `FilterNode_Highway.h` | No | No |
| `GainNode` + `GainNode_Highway.h` | No | No |
| `MixerNode` + `MixerNode_Highway.h` | No | No |
| `OscillatorNode` + `OscillatorNode_Highway.h` | No | No |
| `WaveShaperNode` + `WaveShaperNode_Highway.h` | No | No |
| `HighwayWrapper.h` | N/A — SIMD config | Not tested |
| `HighwayMaths.h` | N/A — SIMD math | Not tested |

### 12.2. Researched Findings

**Finding 1 — SIMD/node parity is untested:**
Each Highway variant should produce the same output as its scalar counterpart (within floating-point tolerance). A bug in the SIMD path that causes different results is invisible without dual-path testing. Kimi's Insight #3 (High confidence) flags this as a build-system-only configuration fix for ARM, but the testing gap applies equally to x86.

**Finding 2 — Highway configuration itself is untested:**
`HighwayWrapper.h` configures `HWY_COMPILE_ALL_ATTAINABLE` with x86-only targets. There is no test that verifies Highway targets are correctly enabled, that the dynamic dispatch picks the right target on the current CPU, or that the Highway-optimized nodes actually use SIMD at runtime.

### 12.3. Solution Space

**Approach — Dual-path comparison in node harness:**
When the DspNodeContractHarness (Section 2) processes a node, compare the scalar output against the Highway output for the same input. Flag any difference exceeding epsilon (e.g., 1e-4 for single-precision audio).

```cpp
// In DspNodeContractHarness:
for (each node type) {
    auto scalar = createInstance(PreferScalar);
    auto simd = createInstance(PreferSIMD);
    auto input = generateTestTone();
    scalar->process(input, scalarOutput);
    simd->process(input, simdOutput);
    for (i = 0; i < numSamples; i++) {
        assert(abs(scalarOutput[i] - simdOutput[i]) < 1e-4f);
    }
}
```

### 12.4. Success Criteria

- [ ] All 7 Highway node variants compared against scalar output in dual-path test
- [ ] Output within tolerance (1e-4) for all dual-path comparisons
- [ ] Test fails gracefully on platforms without SIMD (scalar-only fallback)
- [ ] CTest label `manifold;dsp;simd;contract`

---

## 13. Priority Map — Progress Tracker

### Ordering Rationale

1. ✅ **DSP node contract harness** — COMPLETE (56 nodes, 7 SIMD variants)
2. ✅ **Graph runtime contract** — COMPLETE (8 test cases)
3. ✅ **MIDI behavior extension** — COMPLETE (5 domains, 1 bug fix)
4. ✅ **Scripting engine behavior** — substantial coverage now in place (ParamRegistry, DSPHost lifecycle, LuaEngine, Lua bindings behavior smoke)
5. ✅ **Shader registry contract** — COMPLETE (metadata, sanitize, validate, runtime reload, load failures)
6. **ImGui geometry extraction** (12 .cpp) — broad direct support coverage now in place
7. **Core support headers** (13 support headers) — now partial direct coverage
8. **Primitives layer** (~10 .cpp/h)
9. ~~Orphaned harnesses~~ — deferred per user instruction

| Priority | Module | Status |
|----------|--------|--------|
| ✅ **P0** | DSP node contract | DONE — 56 nodes, 7 Highway variants, 4 bugs fixed |
| ✅ **P1** | Graph runtime | DONE — 8 test cases, topology/cycle/state continuity |
| ✅ **P1** | MIDI behavior | DONE — 5 domains, 2 files, 1 bug fixed |
| ✅ **P2** | ParamRegistry (scripting sub-target) | DONE — 5 domains, clamp/path/category/register/bind dispatch |
| ✅ **P1** | DSPHost lifecycle (slot API) | DONE — load/reload/unload/string, real bind side effects, deferred mutation, process callback, failure probes |
| ✅ **P1** | Lua bindings behavior (21 files) | DONE — 8 binding families under deterministic contract (Command, DSP, Graph, OSC, UI/Canvas, Event, Utility, Waveform). Golden verification with clearAttachedUiLuaState teardown. |
| ✅ **P2** | LuaEngine.cpp extraction (102KB) | MINIMUM DONE — load/eval/hot-reload contract; rendering still largely untested |
| ✅ **P2** | Shader registry | DONE — builtin inventory, metadata, sanitize, validation, runtime reload, load failures |
| ✅ **P2** | ImGui geometry extraction | DONE — 13 ImGui-covered files, 14 ImGui tests, including upstream shaping seams, globals contract, and OpenGL backend smoke |
| ✅ **P2** | Control/IPC parser/resolver/registry/settings | DONE — 5 tests, 3 direct files + parser/queue/resolver harnesses |
| ✅ **P2** | Control/IPC server behavior | DONE — 3 contracts covering ControlServer.cpp, OSCQuery.cpp, OSCServer.cpp |
| ✅ **P3** | Core support headers | DONE — 9 contracts covering all non-editor support headers (Link, GraphRuntime, StateSerialization, ControlCommand, Midi, BehaviorQuery, BehaviorParam, BehaviorHousekeeping, DspSlot) |
| **P3** | Primitives layer | PARTIAL — CaptureBuffer, LoopBuffer, TempoInference, Playhead, Quantizer covered; Settings, SystemPaths, CompositeSurfaceProvider, ML, Video, Canvas remaining |
| — | Orphaned harnesses (10 tests) | DEFERRED (user discretion)

---

## 14. Risk Register (Cross-Cutting)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| New C++ files added without corresponding tests | High | Medium — coverage erodes | CI gate requiring test per new file |
| Contract golden files become stale (nobody updates them) | Medium | Low-medium — false passes | CI re-generates and compares or fails |
| Harness binary takes too long to compile/link | Medium | Low — devs skip running | Separate harness build target, optimize deps |
| DSP node harness becomes flaky (non-deterministic output) | Medium | Medium — trust erosion | Deterministic RNG seed, no time-dependent behavior |
| Platform-specific behavior (float rounding, SIMD availability) | Medium | Low — CI catches | Run on all target platforms, document expected diffs |
| Contract testing doesn't catch logic bugs (only drift) | Low | Low — better than nothing | Supplement with fuzz-style invariant tests (NaN, bounds) |

---

## 15. Success Criteria (Overall)

- [ ] All 7 deferred orphaned tests registered in CTest and passing — DEFERRED (user discretion)
- [x] All 56 DSP nodes covered by parameterized contract harness — DONE
- [x] All 7 Highway SIMD variants dual-path compared to scalar — DONE
- [x] Graph runtime contract: topology, cycle detection, state continuity covered — DONE
- [x] Scripting engine behavior: meaningful coverage now in place for DSP host lifecycle, binding behavior smoke, LuaEngine load/eval/hot-reload, and ParamRegistry core behavior
- [x] MIDI behavior extended: voice allocation, sustain, channel filtering, ring buffer, MIDI clock — DONE
- [x] ParamRegistry contract: clamp, sanitize, category, register, bind dispatch — DONE
- [x] Control/IPC parser/resolver/queue/registry/settings coverage: registered and passing — DONE
- [x] Control/IPC server behavior: ControlServer/OSCQuery/OSCServer direct contracts — DONE
- [x] Shader registry contract: builtin inventory, metadata, sanitize, validation, runtime reload, and load failures — DONE
- [x] ImGui geometry/support/glue: `RuntimeNodeRenderer`, `WidgetPrimitives`, `Theme`, `ImGuiHierarchyHost`, `ImGuiHost`, `ImGuiInspectorHost`, `ImGuiScriptListHost`, `ImGuiPerfOverlayHost`, `ImGuiRuntimeNodeHost`, `ToolComponents`, `EditorShellSupport` shaping, `ManifoldImGuiGlobals`, and `ImGuiOpenGLBackend` now have direct test coverage
- [x] Core support headers: all 9 non-editor support headers covered — DONE
- [x] Lua bindings behavior contract: 8 binding families covered — DONE
- [x] Production teardown bug fixed: Lua-ref cleanup centralized in LuaEngine::clearAttachedUiLuaState + RuntimeNode::clearLuaStateRecursive
- [x] Total registered CTest tests: 12 → **50**
- [x] Full contract-label sweep passes: **41/41**
- [x] Full ImGui-label sweep passes: **14/14**
- [x] DSP primitive layer contract: CaptureBuffer, LoopBuffer, TempoInference, Playhead, Quantizer covered (no production code changes)
- [x] Playhead bug fixed: infinite loop in `setPosition` when `length==0`
- [x] StutterNode determinism fixed: seeded `juce::Random` with fixed seed
- [x] MidiSupport contract: device listing, MIDI message translation, drain/output, null safety
- [x] BehaviorQuerySupport contract: layer state enum, snapshot, layer/compute peaks, all atomic state readers, spectrum data, null-host wrappers
- [x] BehaviorParamSupport contract: computeSamplesPerBar, extractLayerParam, applyParamPath (all 20+ paths), readCoreParamPath, hasCoreEndpoint
- [ ] CI passes on all registered tests before merge

---

## 16. Change Log

| Date | Change |
|------|--------|
| 2026-05-03 | Initial document. Complete coverage map across all 10 subsystems. |
| 2026-05-03 (v2) | **DSP node contract** (P0): 56 nodes, 7 SIMD variants, 4 bugs fixed. **Graph runtime contract** (P1): 8 test cases, topology/cycle/state continuity. **MIDI behavior** (P1): 5 domains (voice steal, sustain, filtering, ring buffer, clock), 1 bug fix in MidiManager::handleNoteOn. Updated all status markers and success criteria. |
| 2026-05-03 (v3) | **ParamRegistry contract** (Scripting sub-target): 5 domains (clamp edge cases, path sanitization, category ownership, full param register with 5 spec types, binding callback dispatch with type isolation). Added `handleParamRegister`/`handleParamBind` declarations to DSPHostInternal.h. Registered as `manifold_param_registry_contract`. |
| 2026-05-03 (v6) | **Shader registry contract** (Shader pipeline sub-target): added `ShaderRegistryContractHarness.cpp`, registered as `manifold_shader_registry_contract`, golden file `tests/fixtures/shader_registry_contract_golden.json`. Covers builtin effect inventory, metadata integrity, shader source generation, param sanitization, pipeline validation, runtime effect reload, and manifest load failures. Also corrected worksheet wording: DSP-host param round-trip is not a missing test on an existing API because no real production serialize/load seam exists there yet. |
| 2026-05-03 (v7) | **Control/IPC coverage pass**: registered `manifold_command_parser`, `manifold_command_queue`, `manifold_endpoint_resolver`; added `OSCEndpointRegistryContractHarness` and `OSCSettingsPersistenceContractHarness` with golden files. Control layer is now partially covered at the parser / resolver / registry / settings seams; remaining gap narrowed to `ControlServer.cpp`, `OSCQuery.cpp`, and `OSCServer.cpp` behavior. |
| 2026-05-03 (v8) | **Control/IPC server behavior pass**: added `ControlServerContractHarness`, `OSCQueryServerContractHarness`, and `OSCServerContractHarness`, with golden files `control_server_contract_golden.json`, `oscquery_server_contract_golden.json`, and `osc_server_contract_golden.json`. Covers real Unix-socket IPC flows, OSCQuery HTTP metadata/VALUE routes plus WebSocket LISTEN streaming, and UDP OSC dispatch/broadcast routing. Full contract-label sweep passes 19/19. |
| 2026-05-03 (v9) | **Core support header pass**: added `LinkSupportContractHarness`, `GraphRuntimeSupportContractHarness`, `StateSerializationSupportContractHarness`, and `ControlCommandSupportContractHarness`, with golden files `link_support_contract_golden.json`, `graph_runtime_support_contract_golden.json`, `state_serialization_support_contract_golden.json`, and `control_command_support_contract_golden.json`. Full contract-label sweep now passes 23/23. |
| 2026-05-03 (v10) | **ImGui support extraction pass**: added `RuntimeNodeGeometryContractHarness`, `WidgetGeometryContractHarness`, `ThemeSupportContractHarness`, and `HierarchyHostInputContractHarness`, with goldens `runtime_node_geometry_contract_golden.json`, `widget_geometry_contract_golden.json`, `theme_support_contract_golden.json`, and `hierarchy_host_input_contract_golden.json`. Extracted production support headers `RuntimeNodeGeometrySupport.h`, `WidgetGeometrySupport.h`, `ThemeSupport.h`, and `HierarchyHostInputSupport.h` and routed production code through them without changing behavior. Full contract-label sweep now passes 27/27. |
| 2026-05-03 (v11) | **Broader ImGui host support pass**: added `TextInputHostSupportContractHarness`, `ScriptListSupportContractHarness`, `PerfOverlaySupportContractHarness`, `ToolComponentSupportContractHarness`, and `RuntimeNodeHostSupportContractHarness`, with goldens `text_input_host_support_contract_golden.json`, `script_list_support_contract_golden.json`, `perf_overlay_support_contract_golden.json`, `tool_component_support_contract_golden.json`, and `runtime_node_host_support_contract_golden.json`. Extracted production support headers `TextInputHostSupport.h`, `ScriptListSupport.h`, `PerfOverlaySupport.h`, `ToolComponentSupport.h`, and `RuntimeNodeHostSupport.h`, and routed `ImGuiHost.cpp`, `ImGuiInspectorHost.cpp`, `ImGuiScriptListHost.cpp`, `ImGuiPerfOverlayHost.cpp`, `ToolComponents.cpp`, and `ImGuiRuntimeNodeHost.cpp` through them without changing behavior. Full contract-label sweep now passes 32/32. |
| 2026-05-03 (v12) | **ImGui completion pass**: added `EditorShellImGuiSupportContractHarness`, `InspectorHostStateSupportContractHarness`, `ManifoldImGuiGlobalsContractHarness`, and `ImGuiOpenGLBackendSmokeHarness`, with goldens `editor_shell_imgui_support_contract_golden.json`, `inspector_host_state_support_contract_golden.json`, and `manifold_imgui_globals_contract_golden.json`. Extracted production support headers `EditorShellImGuiSupport.h` and `InspectorHostStateSupport.h`, routed `EditorShellSupport.h` and `ImGuiInspectorHost.cpp` through them, added direct contract coverage for `ManifoldImGuiGlobals.cpp`, and added smoke coverage for `ImGuiOpenGLBackend.cpp`. Full contract-label sweep now passes 35/35 and full `imgui`-label sweep passes 14/14. |
| 2026-05-04 (v13) | **DSP primitive layer contract + determinism fixes**: added `DspPrimitiveContractHarness` covering CaptureBuffer, LoopBuffer, TempoInference, Playhead, Quantizer, with golden `dsp_primitive_contract_golden.json`. Fixed infinite loop in `Playhead::setPosition` when `length==0`. Fixed `StutterNode` non-determinism by seeding `juce::Random` with fixed seed (12345). Updated test to set Stutter probability=1.0 for determinism. Full contract-label sweep now passes 36/36 across 45 registered CTest tests. |
| 2026-05-04 (v14) | **Core support header coverage (MidiSupport, BehaviorQuerySupport, BehaviorParamSupport)**: added `MidiSupportContractHarness` (MIDI message translation, null safety, drain, device listing), `BehaviorQuerySupportContractHarness` (layer state enum, snapshots, peak computation, spectrum, all ControlServer atomic state readers, null-host wrappers), and `BehaviorParamSupportContractHarness` (computeSamplesPerBar, extractLayerParam, applyParamPath for all 20+ core behavior paths, readCoreParamPath, hasCoreEndpoint). All with golden fixtures and CTest registrations. Full contract-label sweep now passes 39/39 across 49 registered CTest tests. |
| 2026-05-03 (v5) | Expanded scripting coverage substantially: `DSPHostLifecycleContractHarness` now covers real bind side effects, `onParamChange`, deferred mutation, process callback, semantic reload, and isolated failure probes. Added `LuaEngineContractHarness` for load/eval/hot-reload. Registered `LuaEngineMockHarness` smoke mode as `manifold_lua_bindings_behavior_smoke` so binding behavior is no longer registry-only. Updated scripting coverage and success criteria honestly. |
| 2026-05-04 (v15) | **Core support header completion (BehaviorHousekeeping, DspSlot)**: added `BehaviorHousekeepingSupportContractHarness` (takePendingString, forward schedule, initialiseAtomicState) and `DspSlotSupportContractHarness` (load/reload/unload, null-host safety, getOrCreateSlot, getGraphNodeByPath). Full contract-label sweep now passes 41/41 across 50 registered CTest tests. All 9 non-editor core support headers covered. |
| 2026-05-04 (v16) | **Lua bindings behavior completion + production teardown fix**: extended `LuaBindingsBehaviorContractHarness` to cover Event, Utility, and Waveform binding families (8 total). Added `onTempoChanged`/`onCommit`/`onRecordingChanged`/`onLayerStateChanged` listener registration tests; `getTime`/`getClipboardText`/`setClipboardText`/`areDebugOutlinesEnabled`/`isCopyIdModeEnabled`/`setUIRendererMode`/`isOverlayActive`/`getCurrentScriptPath` utility tests; `getLayerPeaks`/`getCapturePeaks`/`invalidateWaveformPeakCache`/`getWaveformPeakCacheStats` waveform tests. **Fixed production teardown crash** where RuntimeNode `sol::object` refs outlived Lua VM — added `RuntimeNode::clearLuaStateRecursive()` (clears callbacks, userData, display lists, custom render payload) and `LuaEngine::clearAttachedUiLuaState()` (recursive clear on attached root tree). Replaced BehaviorCoreEditor's ad-hoc workaround with centralized API. All 4 Lua CTest tests pass. Contract golden updated (5962→9551 bytes). | |
