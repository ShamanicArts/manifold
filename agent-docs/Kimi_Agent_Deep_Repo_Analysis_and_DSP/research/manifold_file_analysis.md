# Manifold Codebase — Phase F File Analysis

## File Inventory

| Category | Files | Description |
|----------|-------|-------------|
| **Core Processor** | `manifold/core/BehaviorCoreProcessor.h/cpp` | Main JUCE AudioProcessor, thread coordinator |
| **DSP Graph** | `dsp/core/graph/PrimitiveNode.h` | Node interface, AudioBufferView abstractions |
| **Graph Runtime** | `manifold/primitives/scripting/GraphRuntime.h/cpp` | Compiled lock-free graph executor |
| **Primitive Graph** | `manifold/primitives/scripting/PrimitiveGraph.h/cpp` | Mutable builder graph (message thread) |
| **Control Server** | `manifold/primitives/control/ControlServer.h/cpp` | Unix socket IPC, SPSCQueue, EventRing, AtomicState |
| **Lua Engine** | `manifold/primitives/scripting/LuaEngine.h/cpp` | UI scripting VM (sol2 bindings) |
| **DSP Script Host** | `manifold/primitives/scripting/DSPPluginScriptHost.h/cpp` | DSP graph scripting VM |
| **Capture Buffer** | `manifold/primitives/dsp/CaptureBuffer.h` | Circular buffer for live input |
| **MIDI Ring** | `manifold/primitives/midi/MidiRingBuffer.h` | Lock-free MIDI SPSC ring buffer |
| **Highway Wrapper** | `manifold/highway/HighwayWrapper.h` | SIMD target configuration |
| **SIMD Nodes** | `dsp/core/nodes/ADSREnvelopeNode_Highway.h`, `BitCrusherNode_Highway.h` | Google Highway vectorized implementations |
| **Effect Nodes** | 50+ nodes in `dsp/core/nodes/` | Granulator, Reverb, Filter, PhaseVocoder, etc. |
| **Build System** | `CMakeLists.txt` | CMake with JUCE, Lua, Highway, Link, ImGui |
| **UI System** | `manifold/primitives/ui/Canvas.h/cpp`, `RuntimeNode.h/cpp` | Scene graph + ImGui backends |
| **Shader System** | `manifold/primitives/shaders/Shader*.h/cpp` | GLSL pipeline registry |
| **Video** | `manifold/primitives/video/VideoCaptureManager.h/cpp` | Video capture + synth primitives |

---

## Core Themes Extracted

### Theme 1: Lock-free Real-time Audio Architecture
The codebase implements a strict three-thread separation:
- **Audio Thread**: `processBlock()` → `GraphRuntime::process()` — zero locks, zero heap allocations
- **Message Thread**: Lua VM, UI rendering, graph compilation
- **Control Thread**: Unix socket IPC, OSC/UDP server, OSCQuery HTTP server

Key lock-free mechanisms:
- `SPSCQueue<256>`: Control → Audio command dispatch (legacy + resolver-oriented payloads)
- `EventRing<256>`: Audio → Control JSON event broadcast
- `AtomicState`: Lock-free state snapshots with per-layer atomic fields
- `SPSCQueuePtr<64>`: Retired `GraphRuntime` pointer queue for deferred destruction
- `MidiRingBuffer`: Packed 4-byte MIDI messages (status|data1|data2|timestampDelta)
- `AudioCaptureRing`: ~1M float ring buffer (~11.6s @ 44.1k stereo) for recording

Memory ordering used: `memory_order_relaxed` for most audio-thread reads/writes, `memory_order_acquire/release` for queue synchronization, `memory_order_acquire` for injection active flags.

### Theme 2: Compiled DSP Node Graph
The graph system separates **builder-time** (mutable, message thread) from **runtime** (immutable, audio thread):

1. **PrimitiveGraph** (mutable): `std::recursive_mutex`, nodes stored as `shared_ptr<IPrimitiveNode>`, DFS-based topological sort with cycle detection
2. **GraphRuntime** (immutable after `prepare()`): Compiled topological order, pre-allocated scratch buffers, routing table, chunking for blocks > maxBlockSize
3. **Swap protocol**: `requestGraphRuntimeSwap()` → atomic exchange in `processBlock` → retired runtime queued to `SPSCQueuePtr` → drained on message thread

Node interface (`IPrimitiveNode`):
- `process(inputs, outputs, numSamples)` — pure audio callback
- `prepare(sampleRate, maxBlockSize)` — pre-allocation only
- Host input semantics: `acceptsHostInputWhenUnconnected()`, `wantsRawHostInputWhenUnconnected()`

Buffer views (`AudioBufferView` / `WritableAudioBufferView`): Thin wrappers over `juce::AudioBuffer` with bounds-checked access, enabling zero-copy graph routing.

### Theme 3: SIMD Vectorization via Google Highway
The project uses Google's Highway library for portable SIMD, with a custom wrapper (`HighwayWrapper.h`) that:
- Enables `HWY_COMPILE_ALL_ATTAINABLE`
- Configures x86 targets: SSE2, SSE3, SSSE3, SSE4
- Fixes MSVC AVX3 issues for VS 2019+

SIMD pattern observed in `ADSREnvelopeNode_Highway.h`:
- Per-lane state machine processing (Attack/Decay/Sustain/Release stages)
- `HWY::SlideUpLanes`, `HWY::BroadcastLane`, `HWY::Compress` for cross-lane state transitions
- `HWY::MaskedLoad` / `HWY::BlendedStore` for tail handling
- Lane-count-aware `configure()` with `hwy::AllocateAligned<float>(numLanes)`
- `HWY_ATTR` on `run()` and `configure()`

SIMD pattern in `BitCrusherNode_Highway.h`:
- State smoothing across lanes (parameter interpolation)
- Bitwise operations (`HWY::Xor`) on quantized integer codes
- Cross-lane hold-counter logic with `HWY::SlideMaskUpLanes`

### Theme 4: Lua-C++ Multi-VM Scripting Architecture
Two separate Lua VMs:
- **LuaEngine** (UI VM): sol2 bindings for Canvas/RuntimeNode scene graph, hot-reload at ~30Hz timer, OSC callback dispatch, file chooser dialogs
- **DSPPluginScriptHost** (DSP VM): `buildPlugin(ctx)` graph construction, deferred mutation worker, parameter registry, synth/FX bindings

Key design: `SOL_ALL_SAFETIES_ON=1`, `SOL_SAFE_NUMERICS=0`. Lua NEVER called from audio thread — graph is compiled to C++ runtime.

### Theme 5: Memory Management & Real-time Constraints
Pre-allocation strategy:
- `GraphRuntime::prepare()` allocates all `juce::AudioBuffer<float>` scratch buffers
- `inputAccumulators_`, `inputViews_`, `outputViews_` pre-sized
- `chunkBuffer_`, `rawChunkBuffer_`, `sidechainChunkBuffer_` for internal chunking
- Highway-aligned allocation via `hwy::AllocateAligned<float>(numLanes)`

Retirement pattern:
- Old `GraphRuntime` pointers queued via `SPSCQueuePtr` (not destroyed immediately)
- `drainRetiredGraphRuntimes()` called on message thread safe boundary
- Same pattern for `DSPPluginScriptHost` slots (`pendingSlotDestroy` vector)

### Theme 6: JUCE Plugin Export Architecture
CMake function `manifold_add_export_plugin()` generates standalone plugin projects from JSON5 manifests:
- Param aliases map VST-facing paths to internal OSC-style paths
- View modes: compact/split with configurable dimensions
- OSC settings per-exported plugin
- Supports: Filter, EQ8, FX, Arp, ScaleQuantizer, Transpose, VelocityMapper, NoteFilter, Sample

### Theme 7: Shader/Video Integration
- `ShaderEffectRegistry`: GLSL pipeline descriptors with JSON metadata
- `ShaderSurfaceProvider`: OpenGL-rendered shader surfaces
- `VideoCaptureManager`: Cross-platform video capture with `VideoSynthPrimitive`
- `CompositeSurfaceProvider`: Composites multiple texture sources

---

## Cross-File Architecture Patterns

| Pattern | Files | Description |
|---------|-------|-------------|
| PImpl | `LuaEngine.h`, `DSPPluginScriptHost.h`, `GraphRuntime.cpp` | Implementation hiding, breaking header cycles |
| Atomic snapshots | `ControlServer.h`, `BehaviorCoreProcessor.h` | `AtomicState` with 20+ atomic fields |
| SPSC rings everywhere | `ControlServer.h`, `MidiRingBuffer.h`, `BehaviorCoreProcessor.h` | Same lock-free idiom repeated |
| Retirement queues | `BehaviorCoreProcessor.h` | `SPSCQueuePtr` for safe deferred destruction |
| Host-input fallthrough | `PrimitiveNode.h`, `GraphRuntime.h` | Unconnected nodes receive host input via semantic flags |

---

## Gaps Identified (External Research Needed)

1. **SIMD portability**: Highway is used but only x86 targets configured; ARM NEON/AArch64 missing from wrapper
2. **Lock-free correctness**: No formal verification of SPSCQueue memory ordering; `memory_order_relaxed` dominant
3. **Graph compilation optimization**: No evidence of buffer reuse analysis (live variable analysis), node fusion, or dead code elimination
4. **Real-time safety verification**: No static analysis or runtime checking for heap allocations in `process()` paths
5. **Alternative DSP frameworks**: No comparison to RNBO, Max/MSP gen~, SuperCollider SynthDef, or CLAP's extensible DSP
6. **Modern C++ audio patterns**: Uses C++17 but could benefit from `std::span`, concepts, or coroutines for async control
7. **Cache optimization**: No explicit cache-line alignment for atomic fields or buffer layouts
8. **Testing strategy**: Headless harnesses exist but no unit testing framework visible for individual nodes

---

## Consolidated Theme List for Research Dimensions

1. Lock-free real-time audio architecture (SPSC queues, atomics, memory ordering)
2. DSP node graph compilation and execution models
3. SIMD vectorization patterns in audio DSP (Highway, alternatives)
4. Scripting language integration in real-time systems (Lua, sol2)
5. Memory management and allocation-free constraints
6. Modern audio plugin framework architecture (beyond JUCE)
7. Circular/ring buffer design patterns for audio
8. Granular synthesis and advanced DSP algorithms
9. Cross-platform build systems for audio software
10. Visual feedback systems in audio tools (shaders, GL)
