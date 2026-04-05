# DSPPluginScriptHost decomposition worksheet

Date: 2026-04-05

Primary subject:
- `manifold/primitives/scripting/DSPPluginScriptHost.cpp`
- `manifold/primitives/scripting/DSPPluginScriptHost.h`

Related files reviewed:
- `CMakeLists.txt`
- `manifold/primitives/scripting/ScriptableProcessor.h`
- `manifold/primitives/scripting/PrimitiveGraph.h`
- `manifold/primitives/scripting/PrimitiveGraph.cpp`
- `manifold/primitives/scripting/GraphRuntime.h`
- `dsp/core/nodes/PrimitiveNodes.h`
- `manifold/core/BehaviorCoreProcessor.h`
- `manifold/core/BehaviorCoreProcessor.cpp`
- `manifold/primitives/control/OSCEndpointRegistry.h`
- `manifold/primitives/control/ControlServer.h`
- Representative DSP Lua scripts under `manifold/dsp/` and `UserScripts/`

---

## 1. Executive summary

`DSPPluginScriptHost.cpp` is doing far too much in one translation unit.

It is currently:
- a Lua VM bootstrapper,
- a sol2 binding definition file,
- a DSP node factory registry,
- a graph object resolver,
- a parameter registration/binding system,
- an OSC/OSCQuery custom endpoint registrar,
- a deferred graph-mutation worker,
- a script loader/module loader,
- a loop-layer bundle builder,
- and a runtime telemetry/query adapter.

That all lives in one file of **5,783 lines**. The public header is only **73 lines**. The implementation is the problem.

In the current `build-dev` (`RelWithDebInfo`) build, the resulting object file is about **129 MiB**:
- `.text`: **1.04 MiB**
- `.debug_info`: **42.79 MiB**
- `.debug_str`: **38.74 MiB**
- `.debug_loclists`: **16.93 MiB**
- `.debug_line`: **5.75 MiB**

So the object is huge mostly because this TU instantiates a mountain of template-heavy sol2 binding code with debug info enabled. The emitted machine code is not the real bulk. The compile-time pain is dominated by **one giant debug-heavy template translation unit**.

### Bottom-line recommendation

Do **not** try to redesign the scripting API first. That would be cowboy bullshit and it would create unnecessary risk.

Instead:
1. **Keep `DSPPluginScriptHost.h` public API stable.**
2. **Explode `DSPPluginScriptHost.cpp` into private implementation files** grouped by responsibility and node domain.
3. **Introduce a private binding/load context** so helpers can be split cleanly without exposing internals.
4. **Preserve script-facing behavior exactly** in phase 1.
5. After the split is green, **deduplicate node binding definitions** so adding a node does not require edits in 4-6 places.

---

## 2. Why this work exists

This refactor is justified on two fronts:

### A. Compile-time / rebuild pain

`DSPPluginScriptHost.cpp` is compiled into the Manifold runtime source set and is heavily template-instantiated through sol2. In `build-dev` it is compiled with `-O2 -g`, so every change that forces this TU to rebuild regenerates a giant amount of DWARF debug info.

This is bad enough on its own. It gets worse because this TU pulls in almost the entire node universe through:
- `dsp/core/nodes/PrimitiveNodes.h` (**48 includes**), plus
- additional direct node includes.

That means many node/header changes can fan out into a full rebuild of this monster file.

### B. Maintainability / change risk

The file is structurally duplicated to hell.

The current implementation has:
- **45** active `new_usertype` registrations (**plus 1 commented-out `PitchDetectorNode` stub**),
- **49** legacy `ctx.primitives.*.new()` factory blocks,
- **49** direct type checks in `toPrimitiveNode`,
- **48** table-based type checks in `toPrimitiveNode`,
- **41** explicit `params.bind` dynamic-cast branches,
- a separate `LoopLayer` bundle with its own hand-written wrapper behavior,
- a global helper layer,
- and a custom module loader bootstrap.

Adding or changing one node type can require touching:
1. the usertype registration,
2. the legacy primitive factory,
3. the object resolver,
4. the parameter binding resolver,
5. sometimes global helpers,
6. sometimes bundle logic.

That is brittle, noisy, and easy to fuck up.

---

## 3. What DSPPluginScriptHost actually is

For someone new to the codebase: `DSPPluginScriptHost` is the bridge between Lua-authored DSP scripts and the C++ primitive graph runtime.

At a high level it does this:

1. Owns a Lua VM (`sol::state`)
2. Exposes C++ DSP nodes/functions into Lua
3. Lets a Lua script define `buildPlugin(ctx)`
4. Lets that script construct a mutable `PrimitiveGraph`
5. Compiles that graph into a `GraphRuntime`
6. Hands the compiled runtime back to `BehaviorCoreProcessor`
7. Exposes script-defined parameters as OSC/OSCQuery custom endpoints
8. Handles parameter updates, including deferred graph mutations
9. Exposes runtime/analysis data back to the processor/UI

It is used by `BehaviorCoreProcessor` as:
- the **default DSP slot** at `/core/behavior`, and
- additional **named slots** under `/core/slots/<slot>`.

That namespacing matters and must be preserved.

---

## 4. Build-process findings

## 4.1 Where it is built

`DSPPluginScriptHost.cpp` is part of `MANIFOLD_RUNTIME_SOURCES` in `CMakeLists.txt`.

That source set is used by:
- `Manifold`
- `ManifoldMobile` (Android path)
- `Tempus`

So this is not a one-off file only used by one toy target. It is a shared runtime source.

## 4.2 Relevant target setup

For `Manifold`:
- target: `juce_add_plugin(Manifold ...)`
- sources: `${MANIFOLD_RUNTIME_SOURCES}` includes `DSPPluginScriptHost.cpp`
- compile definitions include:
  - `SOL_ALL_SAFETIES_ON=1`
  - `SOL_SAFE_NUMERICS=0`
- link libraries include:
  - JUCE audio/gui/dsp modules
  - `sol2::sol2`
  - Lua target

## 4.3 Dev build characteristics

From `build-dev/build.ninja`, this TU is compiled roughly as:
- config: `RelWithDebInfo`
- flags: `-O2 -g -fno-omit-frame-pointer ...`
- no compile-time LTO on the dev object

So the giant object size is **not** a link-time optimization artifact in dev.
It is mostly a **debug info + template instantiation** artifact.

## 4.4 Object file evidence

Measured object:
- `build-dev/CMakeFiles/Manifold.dir/manifold/primitives/scripting/DSPPluginScriptHost.cpp.o`
- size: **~129 MiB**

Relevant section sizes:
- `.text`: **1.04 MiB**
- `.debug_info`: **42.79 MiB**
- `.debug_str`: **38.74 MiB**
- `.debug_loclists`: **16.93 MiB**
- `.debug_line`: **5.75 MiB**
- `.debug_rnglists`: **2.89 MiB**

There are also **~7,794 sol binding-related sections** in the object file (`sol::u_detail::binding...`), which is exactly the kind of template blow-up you would expect from packing all bindings into one TU.

### Implication

Splitting this file will not magically reduce total debug info emitted by every possible build from orbit, but it **will** localize recompilation. That is the real win:
- change one node binding file -> rebuild one smaller object
- change module-loader logic -> rebuild one smaller object
- change telemetry helpers -> rebuild one smaller object

That is the right fight.

---

## 5. Current structure breakdown

The file is not just large; it is concentrated.

### 5.1 Top-level layout by line range

| Lines | Section | Notes |
|---|---:|---|
| 1-38 | includes | pulls in graph/runtime, scripting, control, settings, behavior, and umbrella node header |
| 39-236 | anonymous-namespace helpers | path helpers, Lua table adapters, analysis/partial/debug marshalling |
| 237-283 | `Impl` struct | all state for VM, params, nodes, worker, source tracking |
| 284-461 | lifecycle helpers | ctor, compile/swap, deferred worker, dtor, initialise |
| 462-5221 | `loadScriptImpl` | **4,760 lines / 82.3% of file** |
| 5222-5782 | public access/query methods | load/reload, params, telemetry, spectrum, node lookup |

### 5.2 `loadScriptImpl` internal breakdown

| Lines | Responsibility |
|---|---|
| 462-516 | preflight, worker stop, graph existence, old-node cleanup, retired Lua VM handling |
| 517-556 | namespace path mapping, working-state setup |
| 557-1454 | `new_usertype` registrations |
| 1475-1783 | `toPrimitiveNode` object resolver |
| 1784-3294 | legacy `ctx.primitives.*.new()` factories |
| 3295-3385 | `ctx.graph` API |
| 3386-4270 | `ctx.params.register` / `ctx.params.bind` |
| 4271-4737 | `ctx.bundles.LoopLayer` |
| 4738-4936 | `ctx.host` + global helper functions |
| 4937-5054 | Lua package path + `loadDspModule` bootstrap |
| 5055-5129 | execute script, find `buildPlugin`, apply defaults |
| 5130-5221 | compile runtime, register OSC endpoints, commit new state |

### Implication

This is not a normal function that happens to be a bit long.
This is a **whole subsystem crammed into one function**.

---

## 6. Key findings

## 6.1 The public API is already fine

`DSPPluginScriptHost.h` is small and sane. It exposes a clean façade:
- initialization
- load/reload
- param access
- process callback
- layer/sample/spectrum introspection
- named node lookup

That means this refactor can be almost entirely private.

**Good news:** the existing pImpl boundary gives us a clean seam.

## 6.2 The real problem is internal concentration

The current `Impl` state mixes:
- Lua VM lifetime
- parameter registry state
- named-node registry
- per-layer weak references
- deferred worker queue/thread
- script source bookkeeping

Those states are related, but they are not one responsibility. They need a private internal structure that can be shared across multiple `.cpp` files without bloating the public header.

## 6.3 Node registration is duplicated across multiple mechanisms

There are effectively several parallel systems for the same conceptual thing:

1. `new_usertype` registration
2. legacy `ctx.primitives.<Node>.new()` registration
3. `toPrimitiveNode` direct object resolution
4. `toPrimitiveNode` table-based `__node`/`__outputNode` resolution
5. `ctx.params.bind` explicit dynamic-cast method binding
6. generic table-method fallback for some wrapper objects

That is the core maintainability smell.

## 6.4 Legacy API compatibility is not optional

The repo currently contains **42** Lua scripts with `buildPlugin(...)`.
Of those:
- **39** use `ctx.primitives`
- **38** use `ctx.graph.connect`
- **37** use `ctx.params.bind`
- `UserScripts/projects/Main/...` uses `loadDspModule`, sample-analysis helpers, and more

So phase 1 must preserve:
- `ctx.primitives.*`
- `ctx.graph.*`
- `ctx.params.*`
- `ctx.bundles.LoopLayer`
- global helpers like `getSampleRegionPlaybackPeaks`, `getSampleRegionPlaybackPartials`, etc.
- module-loading behavior via `loadDspModule` / `resolveDspPath`

Breaking those during a mechanical split would be a stupid self-own.

## 6.5 The legacy primitive API is internally inconsistent

The `ctx.primitives.*.new()` API currently returns **two different shapes**:

- **20 nodes** return wrapper tables containing `__node` and lambda methods
- **29 nodes** return raw usertype/shared_ptr-style objects directly

The split point is basically around `SVFNode` onward.

That inconsistency is why the file needs both:
- table-based resolution paths, and
- raw-node resolution paths.

This is technical debt, and it is absolutely worth documenting before refactoring.

## 6.6 Exposure asymmetries already exist

Not all nodes are treated the same.

Examples:
- `MidiVoiceNode`, `MidiInputNode`, `ADSREnvelopeNode` appear in legacy primitive factories, but not in `new_usertype` registrations.
- `PitchDetectorNode` has a legacy factory, but the `new_usertype` registration is commented out.
- `params.bind` has explicit branches for many nodes, but not all exposed nodes.
- some nodes rely on generic table-method fallback instead of typed binding branches.

### Implication

There is no single source of truth for “what a node means in Lua”.
That is exactly what the future architecture needs to fix.

## 6.7 A few immediate header hygiene wins exist

This TU appears to carry unnecessary include baggage.

At minimum, these are worth validating and removing early:
- `../../core/BehaviorCoreProcessor.h` appears unused in this TU
- `../control/OSCQuery.h` appears unused in this TU
- direct includes of `MidiVoiceNode.h`, `MidiInputNode.h`, `ADSREnvelopeNode.h` are likely redundant because `PrimitiveNodes.h` already includes them

These are not the main fix, but they are cheap and worth doing.

## 6.8 One helper looks dead

`sampleDerivedAdditiveDebugToLua(...)` is defined but does not appear to be used in this TU.

That is not the main issue, but it is another sign that this file has accreted responsibilities over time.

---

## 7. Current responsibility map

This is the real responsibility inventory for the subsystem.

### 7.1 Lifecycle / host coordination
- create host state
- retire Lua VMs safely
- stop worker before reload
- unregister old nodes from graph
- compile graph runtime
- request runtime swap from processor
- pause/resume graph mutation on deferred topology changes

### 7.2 Lua VM bootstrapping
- open base/math/string/table/package libs
- create context tables
- expose helper globals
- configure package search path
- define `loadDspModule` / `resolveDspPath`

### 7.3 Binding surface definition
- register node usertypes
- register legacy primitive factories
- register graph API
- register params API
- register bundle API
- register host API
- register global helper functions

### 7.4 Parameter system
- define param metadata (`DspParamSpec`)
- clamp/default param values
- map internal/external paths
- create binding lambdas
- apply defaults
- handle `setParam`/`getParam`
- update OSC custom values
- register/unregister custom OSCQuery endpoints

### 7.5 Graph / node bookkeeping
- track owned nodes
- track named nodes
- track per-layer playback/gate/output weak refs
- resolve arbitrary Lua objects to `IPrimitiveNode`

### 7.6 Script execution
- run script source
- require `buildPlugin(ctx)`
- capture optional `onParamChange` and `process`
- commit new VM/runtime/state atomically enough for this design

### 7.7 Telemetry / analysis
- layer peaks / loop length / mute
- synth sample peaks
- voice sample positions
- sample analysis / partial data
- additive debug state
- spectrum bands
- named node lookup

This should not be one file.

---

## 8. Proposed decomposition architecture

## 8.1 Refactor guardrails

These should be treated as hard rules for phase 1:

1. **No public API changes** in `DSPPluginScriptHost.h`
2. **No Lua script API changes** unless explicitly planned later
3. **No behavioral cleanup mixed into the split** unless it is required to preserve behavior
4. **No node-API redesign in the same pass**
5. **No ripping out legacy wrappers in phase 1**
6. **Keep namespacing behavior identical** for `/core/behavior` and `/core/slots/<slot>`
7. **Keep module loading behavior identical** (`loadDspModule`, `resolveDspPath`, package path)
8. **Keep deferred graph mutation semantics identical**

## 8.2 Recommended private module layout

Suggested private directory:

```text
manifold/primitives/scripting/dsp_host/
  DSPHostInternal.h
  DSPHostValueConverters.h
  DSPHostValueConverters.cpp
  DSPHostPathMapping.h
  DSPHostPathMapping.cpp
  DSPHostDeferredMutation.h
  DSPHostDeferredMutation.cpp
  DSPHostScriptBootstrap.h
  DSPHostScriptBootstrap.cpp
  DSPHostBindingsCore.cpp
  DSPHostBindingsSynth.cpp
  DSPHostBindingsFx.cpp
  DSPHostObjectResolver.h
  DSPHostObjectResolver.cpp
  DSPHostParamRegistry.h
  DSPHostParamRegistry.cpp
  DSPHostLoopLayerBundle.cpp
  DSPHostEndpointSync.cpp
  DSPHostTelemetry.cpp
```

And keep:

```text
manifold/primitives/scripting/DSPPluginScriptHost.cpp
```

as a thin façade/orchestrator.

## 8.3 What each proposed private module should own

### `DSPHostInternal.h`
Private shared types:
- internal `Impl` state definition
- `DspParamSpec`
- a private `LoadSession` / `BuildContext` struct for the in-progress script load
- helper callback typedefs / registries

This is the key seam that makes splitting possible without poisoning the public header.

### `DSPHostValueConverters.*`
Move these here:
- `sampleAnalysisToLua`
- `partialDataToLua`
- `temporalPartialDataToLua`
- `sampleDerivedAdditiveDebugToLua`
- `sampleDerivedAdditiveDebugFromLua`

### `DSPHostPathMapping.*`
Move these here:
- `sanitizePath`
- internal/external path mapping behavior
- registry-owned-category helper
- slot namespace path handling

### `DSPHostDeferredMutation.*`
Move these here:
- `compileRuntimeAndRequestSwap`
- `applyDeferredGraphMutation`
- `ensureDeferredWorkerStarted`
- `enqueueDeferredGraphMutation`
- `stopDeferredWorker`

This should become a small, isolated lifecycle/worker unit.

### `DSPHostScriptBootstrap.*`
Own:
- Lua VM creation/open-libraries
- package path setup
- `loadDspModule` / `resolveDspPath` bootstrap script
- creation of `ctx` tables (`primitives`, `graph`, `params`, `bundles`, `host`)
- script execution and `buildPlugin(ctx)` invocation

### `DSPHostBindingsCore.cpp`
Core transport/loop/control node bindings and compatibility wrappers:
- `PlayheadNode`
- `PassthroughNode`
- `GainNode`
- `LoopPlaybackNode`
- `SampleRegionPlaybackNode`
- `PlaybackStateGateNode`
- `RetrospectiveCaptureNode`
- `RecordStateNode`
- `QuantizerNode`
- `RecordModePolicyNode`
- `ForwardCommitSchedulerNode`
- `TransportStateNode`
- graph API

### `DSPHostBindingsSynth.cpp`
Synth/MIDI/sample-heavy node bindings and compatibility wrappers:
- `OscillatorNode`
- `SineBankNode`
- `MidiVoiceNode`
- `MidiInputNode`
- `ADSREnvelopeNode`
- sample-analysis helper exposure associated with sample playback

### `DSPHostBindingsFx.cpp`
FX/routing/analysis node bindings and compatibility wrappers:
- `ReverbNode`
- `FilterNode`
- `DistortionNode`
- `SVFNode`
- `StereoDelayNode`
- `CompressorNode`
- `WaveShaperNode`
- `ChorusNode`
- `StereoWidenerNode`
- `PhaserNode`
- `GranulatorNode`
- `PhaseVocoderNode`
- `StutterNode`
- `ShimmerNode`
- `MultitapDelayNode`
- `PitchShifterNode`
- `TransientShaperNode`
- `RingModulatorNode`
- `BitCrusherNode`
- `FormantFilterNode`
- `ReverseDelayNode`
- `EnvelopeFollowerNode`
- `PitchDetectorNode`
- `CrossfaderNode`
- `MixerNode`
- `NoiseGeneratorNode`
- `MSEncoderNode`
- `MSDecoderNode`
- `EQNode`
- `EQ8Node`
- `LimiterNode`
- `SpectrumAnalyzerNode`

### `DSPHostObjectResolver.*`
Own the current `toPrimitiveNode` logic, but this should become registry-driven rather than a giant if-ladder.

### `DSPHostParamRegistry.*`
Own:
- `ctx.params.register`
- `ctx.params.bind`
- param metadata/value storage for a load session
- default value application setup
- typed param-binding registrars

### `DSPHostLoopLayerBundle.cpp`
Own the whole `ctx.bundles.LoopLayer.new(...)` construction.

This block has enough behavior and enough cross-node coupling to deserve its own file.

### `DSPHostEndpointSync.cpp`
Own:
- unregister old custom endpoints
- register new ones
- sync custom OSC values
- rebuild OSCQuery tree

### `DSPHostTelemetry.cpp`
Own the post-load public query methods:
- `computeLayerPeaks`
- `computeSynthSamplePeaks`
- `getVoiceSamplePositions`
- `getLatestSampleAnalysis`
- `getLatestSamplePartials`
- `getSampleDerivedAdditiveDebug`
- `refreshSampleDerivedAdditiveDebug`
- `getSpectrumBands`
- `getGraphNodeByPath`
- `getLayerOutputNode`

---

## 9. Recommended internal design pattern

The best internal shape is a **private load/build session object**.

Something like:

```cpp
struct DSPHostLoadSession {
  sol::state lua;
  lua_State* luaState = nullptr;

  std::unordered_map<std::string, DspParamSpec> paramSpecs;
  std::unordered_map<std::string, float> paramValues;
  std::unordered_map<std::string, std::function<void(float)>> paramBindings;

  std::unordered_map<std::string, std::string> externalToInternalPath;
  std::unordered_map<std::string, std::string> internalToExternalPath;

  std::unordered_map<std::string, std::weak_ptr<IPrimitiveNode>> namedNodes;
  std::vector<std::shared_ptr<IPrimitiveNode>> ownedNodes;

  std::vector<std::weak_ptr<LoopPlaybackNode>> layerPlaybackNodes;
  std::vector<std::weak_ptr<PlaybackStateGateNode>> layerGateNodes;
  std::vector<std::weak_ptr<GainNode>> layerOutputNodes;

  sol::function onParamChange;
  sol::function process;
  sol::table pluginTable;
};
```

Then each private `.cpp` contributes to that session.

### Why this is the right move

Right now `loadScriptImpl` has a giant pile of `newXxx` locals because the whole load transaction is in one function. That makes splitting hard.

A private load session makes splitting trivial:
- bindings populate session state
- bootstrap populates Lua state
- bundle builder populates node registries
- final commit swaps session state into `Impl`

That is the cleanest seam in the current design.

---

## 10. Function and method inventory with decomposition plan

### Note
This inventory covers the top-level helpers and every named `DSPPluginScriptHost` method in the TU.
It does **not** list every anonymous lambda individually; those are grouped under their owning registration blocks, because those blocks are the actual extraction units.

## 10.1 Anonymous-namespace helper inventory

| Function / type | Current role | Proposed home |
|---|---|---|
| `DspParamSpec` | param metadata structure | `DSPHostInternal.h` |
| `clampParamValue` | clamp against param spec ranges | `DSPHostParamRegistry.*` or `DSPHostPathMapping.*` |
| `sanitizePath` | normalize slash-prefixed paths | `DSPHostPathMapping.*` |
| `isRegistryOwnedCategory` | protects backend/query endpoints from script overwrite | `DSPHostEndpointSync.cpp` or `DSPHostPathMapping.*` |
| `tableNode<T>` | legacy wrapper-table to shared_ptr extractor | `DSPHostObjectResolver.*` |
| `sampleAnalysisToLua` | C++ -> Lua analysis table conversion | `DSPHostValueConverters.*` |
| `partialDataToLua` | C++ -> Lua partial table conversion | `DSPHostValueConverters.*` |
| `temporalPartialDataToLua` | C++ -> Lua temporal-partials conversion | `DSPHostValueConverters.*` |
| `sampleDerivedAdditiveDebugToLua` | C++ -> Lua additive debug conversion | `DSPHostValueConverters.*` (or remove if truly dead) |
| `sampleDerivedAdditiveDebugFromLua` | Lua -> C++ additive debug conversion | `DSPHostValueConverters.*` |

## 10.2 `DSPPluginScriptHost` method inventory

| Method | Current role | Proposed home |
|---|---|---|
| `DSPPluginScriptHost()` | create `Impl` | thin façade `.cpp` |
| `compileRuntimeAndRequestSwap(...)` | compile current mutable graph and hand runtime to processor | `DSPHostDeferredMutation.*` |
| `applyDeferredGraphMutation(...)` | apply param mutation on worker, call `onParamChange`, compile runtime | `DSPHostDeferredMutation.*` |
| `ensureDeferredWorkerStarted()` | spawn worker thread | `DSPHostDeferredMutation.*` |
| `enqueueDeferredGraphMutation(...)` | queue deferred param mutation | `DSPHostDeferredMutation.*` |
| `stopDeferredWorker()` | stop and join worker | `DSPHostDeferredMutation.*` |
| `~DSPPluginScriptHost()` | stop worker, unregister owned nodes, clear retired Lua states | thin façade `.cpp` calling lifecycle helper |
| `initialise(...)` | attach processor and namespace base | thin façade `.cpp` or `DSPHostPathMapping.*` |
| `loadScriptImpl(...)` | entire script-load transaction | broken up across all private modules |
| `loadScript(...)` | file-backed load entrypoint | thin façade `.cpp` |
| `loadScriptFromString(...)` | string-backed load entrypoint | thin façade `.cpp` |
| `reloadCurrentScript()` | reload active source | thin façade `.cpp` |
| `isLoaded() const` | loaded-state query | thin façade `.cpp` |
| `markUnloaded()` | clear loaded/source flags | thin façade `.cpp` |
| `getLastError() const` | last-error query | thin façade `.cpp` |
| `getCurrentScriptFile() const` | source file query | thin façade `.cpp` |
| `hasParam(...) const` | param existence check + slot synthetic endpoints | `DSPHostParamRegistry.*` |
| `setParam(...)` | clamp/apply param, maybe defer mutation, update OSC custom value | `DSPHostParamRegistry.*` |
| `getParam(...) const` | read param value or synthetic slot telemetry | `DSPHostParamRegistry.*` |
| `process(...)` | invoke Lua `process` callback | thin façade `.cpp` or `DSPHostTelemetry.cpp` |
| `getLayerLoopLength(...) const` | weak-ref layer playback query | `DSPHostTelemetry.cpp` |
| `isLayerMuted(...) const` | weak-ref layer gate query | `DSPHostTelemetry.cpp` |
| `computeLayerPeaks(...) const` | delegate loop peaks to playback node | `DSPHostTelemetry.cpp` |
| `computeSynthSamplePeaks(...) const` | Lua callback query for sample peaks | `DSPHostTelemetry.cpp` |
| `getVoiceSamplePositions() const` | Lua callback query | `DSPHostTelemetry.cpp` |
| `getLatestSampleAnalysis(...) const` | node-first then Lua-fallback analysis query | `DSPHostTelemetry.cpp` |
| `getLatestSamplePartials(...) const` | node-first then Lua-fallback partial query | `DSPHostTelemetry.cpp` |
| `getSampleDerivedAdditiveDebug(...) const` | Lua callback query and conversion | `DSPHostTelemetry.cpp` |
| `refreshSampleDerivedAdditiveDebug(...)` | Lua callback refresh and conversion | `DSPHostTelemetry.cpp` |
| `getSpectrumBands() const` | aggregate max bands over owned spectrum nodes | `DSPHostTelemetry.cpp` |
| `getGraphNodeByPath(...) const` | named-node lookup | `DSPHostTelemetry.cpp` or `DSPHostObjectResolver.*` |
| `getLayerOutputNode(...) const` | path-based layer output lookup | `DSPHostTelemetry.cpp` |

## 10.3 `loadScriptImpl` extraction plan by sub-block

| Current block | Lines | Proposed target |
|---|---:|---|
| preflight / old-state cleanup | 462-516 | façade + `DSPHostScriptBootstrap.*` |
| load-session setup / path mapping | 517-556 | `DSPHostInternal.h` + `DSPHostPathMapping.*` |
| usertype registrations | 557-1454 | `DSPHostBindingsCore.cpp`, `DSPHostBindingsSynth.cpp`, `DSPHostBindingsFx.cpp` |
| `toPrimitiveNode` resolver | 1475-1783 | `DSPHostObjectResolver.*` |
| legacy primitive factories | 1784-3294 | same domain binding files, or compatibility-specific helpers |
| `ctx.graph` API | 3295-3385 | `DSPHostBindingsCore.cpp` or `DSPHostObjectResolver.*` |
| `ctx.params` API | 3386-4270 | `DSPHostParamRegistry.*` |
| `ctx.bundles.LoopLayer` | 4271-4737 | `DSPHostLoopLayerBundle.cpp` |
| `ctx.host` + global helpers | 4738-4936 | `DSPHostScriptBootstrap.*` |
| module loader/bootstrap script | 4937-5054 | `DSPHostScriptBootstrap.*` |
| script execute/build/default apply | 5055-5129 | `DSPHostScriptBootstrap.*` |
| runtime compile + endpoint sync + final commit | 5130-5221 | `DSPHostEndpointSync.cpp` + façade commit logic |

---

## 11. Node binding inventory

This is the practical inventory of script-facing node exposure that has to survive the refactor.

## 11.1 Usertype registrations (`new_usertype`)

Count: **45 active** usertypes, plus **1 commented-out `PitchDetectorNode` stub**

Registered usertypes include:
- `PlayheadNode`
- `PassthroughNode`
- `GainNode`
- `LoopPlaybackNode`
- `SampleRegionPlaybackNode`
- `PlaybackStateGateNode`
- `RetrospectiveCaptureNode`
- `RecordStateNode`
- `QuantizerNode`
- `RecordModePolicyNode`
- `ForwardCommitSchedulerNode`
- `TransportStateNode`
- `OscillatorNode`
- `SineBankNode`
- `ReverbNode`
- `FilterNode`
- `DistortionNode`
- `SVFNode`
- `StereoDelayNode`
- `CompressorNode`
- `WaveShaperNode`
- `ChorusNode`
- `StereoWidenerNode`
- `PhaserNode`
- `GranulatorNode`
- `PhaseVocoderNode`
- `StutterNode`
- `ShimmerNode`
- `MultitapDelayNode`
- `PitchShifterNode`
- `TransientShaperNode`
- `RingModulatorNode`
- `BitCrusherNode`
- `FormantFilterNode`
- `ReverseDelayNode`
- `EnvelopeFollowerNode`
- `CrossfaderNode`
- `MixerNode`
- `NoiseGeneratorNode`
- `MSEncoderNode`
- `MSDecoderNode`
- `EQNode`
- `EQ8Node`
- `LimiterNode`
- `SpectrumAnalyzerNode`

Special case:
- `PitchDetectorNode` usertype block exists only as commented-out code.

## 11.2 Legacy `ctx.primitives.*.new()` factories

Count: **49**

Factory-only nodes not mirrored in usertypes:
- `MidiVoiceNode`
- `MidiInputNode`
- `ADSREnvelopeNode`

Factory return-shape split:
- wrapper-table factories: **20**
- raw-node factories: **29**

That split is a major compatibility constraint.

## 11.3 `toPrimitiveNode` resolver surface

The resolver currently has:
- **49** direct typed checks for raw objects
- **48** typed checks for wrapped `sol::table` objects (`__node` / `__outputNode`)

That logic should become **registry-driven**, not hard-coded if-ladders.

## 11.4 Explicit `params.bind` typed coverage

Explicit dynamic-cast binding branches exist for **41** node types.

Notable nodes without explicit typed branches include:
- `PassthroughNode`
- `SampleRegionPlaybackNode`
- `ForwardCommitSchedulerNode`
- `SineBankNode`
- `MidiVoiceNode`
- `MidiInputNode`
- `ADSREnvelopeNode`
- `MSDecoderNode`

Some of those still work through generic table-method fallback, which is exactly the sort of hidden asymmetry that should be documented before refactoring.

## 11.5 Recommended domain grouping for extraction

### Core / loop / transport
- `PlayheadNode`
- `PassthroughNode`
- `GainNode`
- `LoopPlaybackNode`
- `SampleRegionPlaybackNode`
- `PlaybackStateGateNode`
- `RetrospectiveCaptureNode`
- `RecordStateNode`
- `QuantizerNode`
- `RecordModePolicyNode`
- `ForwardCommitSchedulerNode`
- `TransportStateNode`
- `LoopLayer` bundle

### Synth / MIDI / sample-derived synthesis
- `OscillatorNode`
- `SineBankNode`
- `MidiVoiceNode`
- `MidiInputNode`
- `ADSREnvelopeNode`
- sample/partial/temporal analysis helper exposure tied to sample playback

### FX / routing / analysis
- `ReverbNode`
- `FilterNode`
- `DistortionNode`
- `SVFNode`
- `StereoDelayNode`
- `CompressorNode`
- `WaveShaperNode`
- `ChorusNode`
- `StereoWidenerNode`
- `PhaserNode`
- `GranulatorNode`
- `PhaseVocoderNode`
- `StutterNode`
- `ShimmerNode`
- `MultitapDelayNode`
- `PitchShifterNode`
- `TransientShaperNode`
- `RingModulatorNode`
- `BitCrusherNode`
- `FormantFilterNode`
- `ReverseDelayNode`
- `EnvelopeFollowerNode`
- `PitchDetectorNode`
- `CrossfaderNode`
- `MixerNode`
- `NoiseGeneratorNode`
- `MSEncoderNode`
- `MSDecoderNode`
- `EQNode`
- `EQ8Node`
- `LimiterNode`
- `SpectrumAnalyzerNode`

This grouping is the sweet spot.

Do **not** make one file per node on the first pass. That is over-splitting and it will create its own maintenance tax.

---

## 12. Proposed implementation order

## Phase 0: Baseline and safety net

Before touching structure:
- capture current object size / section sizes
- capture working scripts that must still load
- identify 3-5 smoke scripts to keep green:
  - a simple oscillator script
  - a graph/FX script
  - a `LoopLayer` script
  - a `loadDspModule`-based script
  - a sample-analysis-heavy script (`midisynth_integration`/`sample_synth` path)

If needed, add a focused harness for `DSPPluginScriptHost` load/param/query behavior.

## Phase 1: Mechanical split with zero behavior change

1. create private internal header for `Impl` + `LoadSession`
2. move value converters/path helpers out
3. move deferred mutation logic out
4. move telemetry query methods out
5. split `loadScriptImpl` into private helpers but preserve exact flow
6. split bindings by domain while preserving exact exported Lua API

At the end of this phase:
- behavior should be the same
- compile locality should be much better
- file sizes should be sane

## Phase 2: Remove multi-site node-definition duplication

Introduce a private descriptor/registry pattern so each node’s Lua exposure lives in one place.

Ideal end state: adding a node means editing **one domain file**, not 5 disconnected ladders.

That descriptor should drive:
- usertype registration
- legacy factory registration
- resolver support
- typed param binding support

## Phase 3: Optional cleanup once the split is stable

Only after phase 1 is green:
- remove dead helpers
- remove unused includes
- normalize raw-node vs wrapper-table factory internals where possible
- decide whether some legacy wrappers can be deprecated later

Do **not** do this in the initial split.

---

## 13. Risk areas to watch closely

### 13.1 Lua state lifetime
The current file explicitly keeps retired Lua states alive because destroying a VM during nested Lua/shared_ptr lifetimes can crash.

That behavior is important. Do not casually “clean it up” without understanding why it exists.

### 13.2 Slot namespacing
`/core/behavior` vs `/core/slots/<slot>` mapping affects:
- param registration
- param lookup
- named node lookup
- synthetic slot telemetry paths

Path behavior must stay identical.

### 13.3 Legacy wrapper vs raw-node compatibility
A ton of scripts rely on `ctx.primitives` and the current system supports both wrapper tables and raw nodes. That compatibility behavior is ugly, but it is real.

### 13.4 Endpoint registration
Custom endpoints are synchronized into:
- `OSCEndpointRegistry`
- `OSCServer`
- `OSCQueryServer`

That coordination should be isolated, not re-implemented ad hoc in several new files.

### 13.5 `LoopLayer` bundle
`LoopLayer` is not just sugar. It creates and names multiple nodes, fills per-layer weak-ref vectors, and provides script-visible behavior like commit/forwardCommit/tickForwardCommit.

It deserves its own module and tests.

### 13.6 Module loading bootstrap
`loadDspModule` and package path setup are used by real project scripts under `UserScripts/projects/Main/dsp/`. Breaking that would silently fuck a lot of behavior scripts.

---

## 14. What I would do first in actual implementation

If I were doing the code refactor next, my first concrete steps would be:

1. Create `dsp_host/DSPHostInternal.h`
2. Move helper conversion/path functions out of the main file
3. Move deferred worker/runtime swap logic out
4. Move telemetry query methods out
5. Split `loadScriptImpl` into helper calls without changing logic order
6. Extract bindings into three domain files:
   - core
   - synth
   - fx
7. Extract `LoopLayer` bundle and endpoint sync
8. Only then consider a registry/descriptor cleanup

That order gets the compile-time win early without making the refactor stupidly risky.

---

## 15. Final recommendation

This file should be decomposed now.

Not because giant files are aesthetically ugly, but because the current shape is concretely causing:
- heavy rebuild cost,
- template/debug-info bloat in one TU,
- repeated binding logic across multiple ladders,
- inconsistent script object shapes,
- and a high-risk maintenance surface.

The good news is that the public class boundary is already small and stable. The decomposition can be private and staged.

### Recommended target state

- `DSPPluginScriptHost.h` remains the stable façade
- `DSPPluginScriptHost.cpp` becomes small orchestration code
- private implementation moves into focused modules
- node bindings are grouped by domain
- resolver + param binding logic becomes registry-driven over time
- script-facing compatibility remains intact throughout phase 1

That is the sane way to fix this without breaking the world.
