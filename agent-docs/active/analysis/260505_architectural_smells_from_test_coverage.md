# Architectural Smells Surfaced by Test Coverage

**Date:** 2026-05-05 (v1)
**Status:** COMPLETE — Findings documented from the comprehensive test-coverage pass (260503–260505)
**Audience:** Agents planning or executing architectural refactoring work
**Reference session:** `.pi/agent/sessions/--home-shamanic-dev-my-plugin--/2026-05-03T00-00-00-000Z_testing_coverage_analysis.md`
**Prior art:**
- `agent-docs/260502_full_testing_suite.md` — Full codebase testing suite (living reference)
- `agent-docs/260503_codebase_test_coverage_gap_worksheet.md` — Coverage gap worksheet (v27)
- `agent-docs/260503_atomic_state_memory_ordering_worksheet.md` — Prior AtomicState research
- `agent-docs/260501_binding_god_functions_decomposition_worksheet.md` — Prior decomposition methodology

---

## 1. Executive Summary

The comprehensive test-coverage pass (66 registered CTest tests, ~60 harness `.cpp` files) did more than just pin down behavior. It exposed structural problems that were previously invisible because there was no safety net to refactor under.

Six architectural smells were surfaced. They fall into two categories:

**Correctness holes** (testing proved the bug exists but didn't fix it):
1. Destructor ordering between Lua state and sol2 object handles

**Structural quality problems** (testing now enables the refactor):
2. `BehaviorCoreProcessor` god-class (177 KB, 13 inline support headers)
3. `ImGuiDirectHost` god-object (EGL context, providers, renderer, node tree, input)
4. `VideoCaptureManager` hard singleton
5. `AtomicState` shared monolith
6. Golden-file contract brittleness

Each section below describes the smell, how testing surfaced it, and what the testing now enables for a fix.

---

## 2. Destructor Ordering (Correctness Hole)

### The Smell

Every harness that creates a `BehaviorCoreProcessor` must exit via `std::_Exit(0)` to avoid a crash during destruction. The stack trace is consistent: `DSPPluginScriptHost`'s `sol::state` (owned via `Impl`) gets destroyed while `RuntimeNode` objects still hold `sol::object` handles referencing into that Lua VM. The VM dies first, the dangling handles get cleaned up second, and you get a use-after-free inside sol2 internals.

### How Testing Surfaced It

- `BehaviorCoreProjectionHarness` — crashes on normal `return 0` exit, works with `_Exit(0)`
- `DSPHostLifecycleContractHarness` — same pattern, documented in its file header
- All harnesses that create a processor for lifecycle/slot/DSP-host testing use `_Exit(0)`

This blocks ASan coverage on every harness that touches the processor, because `_Exit` bypasses ASan's leak detection.

### What Testing Now Enables

The `LuaEngineContractHarness` and `DSPHostLifecycleContractHarness` exercise the lifecycle paths. A structured destructor audit — destroy the Lua VM first, then everything holding sol references — could be verified by re-enabling those harnesses under ASan. The fix for the UI side was already done (`clearAttachedUiLuaState` in `LuaEngine.cpp`). The DSP host side needs the same treatment.

**Production changes needed:**
- Centralize `sol::state` destruction ordering in `DSPPluginScriptHost` destructor
- Clear all `RuntimeNode` sol references before destroying the Lua VM in the DSP host path
- Re-test harnesses under ASan without `_Exit`

---

## 3. BehaviorCoreProcessor God-Class

### The Smell

`BehaviorCoreProcessor.cpp` is the largest `.cpp` file in the codebase at 177 KB. During the binding god-functions decomposition (May 1–2), 13 support headers were extracted from it — `LinkSupport.h`, `MidiSupport.h`, `GraphRuntimeSupport.h`, `StateSerializationSupport.h`, `ControlCommandSupport.h`, `DspSlotSupport.h`, `BehaviorQuerySupport.h`, `BehaviorParamSupport.h`, `BehaviorHousekeepingSupport.h`, and several others.

However, every one of these is an **inline function header** — they all take raw pointers back into the processor's state. The processor class still owns every piece of state directly. This is delegation without decomposition. The support headers are a mechanical extraction that proves extraction is possible, but the god-class structure itself never changed.

### How Testing Surfaced It

- `manifold_processor_process_block_contract` — pins the audio output shape directly
- `manifold_core_state_contract` — pins the processor state schema
- `manifold_dsp_host_lifecycle_contract` — pins the slot/lifecycle API behavior
- Without these contracts, any attempt to split the processor would be blind

### What Testing Now Enables

The `processBlock()` contract is the critical enabler. It proves the output shape is stable. You can now:

1. Pull `CaptureBuffer` + capture-related state into a `CaptureEngine` object
2. Pull `dspSlots` + slot lifecycle into a `DspSlotManager`
3. Pull `linkSync` + Link-related state into the `LinkSync` class proper
4. Verify each extraction by re-running the process-block contract

The support headers are already the extraction lines. What's missing is the actual object decomposition — turning them from inline functions into real bounded objects that the processor composites rather than owns.

---

## 4. ImGuiDirectHost God-Object

### The Smell

`ImGuiDirectHost` owns everything: the EGL context, all surface providers (`videoSurfaceProvider_`, `generatedSourceProvider_`, `shaderSurfaceProvider_`, `compositeSurfaceProvider_`, `mlMaskSurfaceProvider_`), the `RuntimeNodeRenderer`, the live node tree, input state, frame timing, screenshot capture, and embedded panel state.

Like the processor, we extracted support headers (`DirectHostRenderSupport.h`, `DirectHostGlLifecycleSupport.h`, `DirectHostRuntimeSupport.h`, etc.), but again the state never moved. The class is ~300 lines of declarations with everything stuffed into it.

### How Testing Surfaced It

- `manifold_direct_host_contract` — covers host-level contract including surface info, stats, and screenshot
- `manifold_surface_providers_draw_smoke` — covers EGL-backed rendering through all three surface providers
- Both tests proved that the extraction seams work and the contracts are deterministic

### What Testing Now Enables

The draw-smoke contract is the critical enabler. You could split `ImGuiDirectHost` into:

| Proposed class | Responsibility |
|---------------|---------------|
| `SurfaceHost` | Provider registry, texture routing, surface info queries |
| `FrameHost` | EGL lifecycle, ImGui context, rendering loop, screenshots |
| `NodeHost` | Node tree management, input dispatch, hit-testing |

Each split could be verified by the existing smoke contract — if the screenshot pixels don't change and the surface handles match, the refactor didn't break anything.

---

## 5. VideoCaptureManager Hard Singleton

### The Smell

`VideoCaptureManager::instance()` returns a global singleton. Every consumer in the codebase calls it directly:

- `VideoSurfaceProvider::prepareTexture()`
- `MLMaskSurfaceProvider::prepareTexture()`
- `LuaUtilityBindings.cpp` — multiple video device calls
- `VideoRetrospectiveCapture.cpp`

There is no way to inject a fake frame source without changing production code. This makes deterministic testing of video-dependent paths impossible — every test that touches a video surface either needs a real camera or a real video file.

### How Testing Surfaced It

During the ML seam pass, we added a `FrameSupplier` injection point into `MLMaskSurfaceProvider`:

```cpp
using FrameSupplier = std::function<manifold::video::FrameData()>;

MLMaskSurfaceProvider(PipelineFactory pipelineFactory,
                       FrameSupplier frameSupplier = {});
```

This allowed the `MLMaskSurfaceProviderContractHarness` (EGL-backed) to inject a fake frame without touching `VideoCaptureManager`. The pattern worked immediately — the provider used the injected frame instead of calling `instance()`.

### What Testing Now Enables

The same `FrameSupplier` injection pattern could be applied to `VideoSurfaceProvider`. Once injected:

- `manifold_video_surface_contract` could be added with deterministic RGBA frames
- No real camera or video file needed
- The existing draw-smoke harness could exercise video surfaces deterministically

The production code path just calls the function pointer. If none is provided, it falls back to the singleton as before. Zero behavior change for production users.

---

## 6. AtomicState Shared Monolith

### The Smell

`AtomicState` in `ControlServer.h` is a single struct with 25+ `std::atomic` fields used as a raw communication buffer between the audio thread and the message thread:

```cpp
struct AtomicState {
    std::atomic<float> tempo;
    std::atomic<float> targetBPM;
    std::atomic<float> samplesPerBar;
    std::atomic<double> sampleRate;
    std::atomic<int> captureSize;
    std::atomic<int> captureWritePos;
    std::atomic<float> captureLevel;
    std::atomic<bool> isRecording;
    std::atomic<bool> overdubEnabled;
    std::atomic<bool> forwardArmed;
    std::atomic<float> forwardBars;
    std::atomic<bool> graphEnabled;
    std::atomic<int> recordMode;
    std::atomic<int> activeLayer;
    std::atomic<float> masterVolume;
    std::atomic<float> inputVolume;
    std::atomic<bool> passthroughEnabled;
    std::atomic<double> playTime;
    std::atomic<int> commitCount;
    std::atomic<double> uptimeSeconds;
    AtomicLayerState layers[MAX_LAYERS];
};
```

The fields are ordered by accretion — when someone needed a new signal, they added a field. There are no ownership boundaries. Any thread can read or write any field. All operations use `std::memory_order_relaxed`, which is correct for independent counters but incorrect when one field's value logically depends on another's.

This intersects with the existing `260503_atomic_state_memory_ordering_worksheet.md` which covers the false-sharing and ordering hazards in detail.

### How Testing Surfaced It

- `manifold_behavior_param_support_contract` — reads atomic state through the param dispatch path
- `manifold_processor_process_block_contract` — reads atomic state after processing, verifies values
- Both contracts exercise specific field groups, not the whole struct
- No single test validates the struct as a whole, because the whole struct has no single consumer

### What Testing Now Enables

The param-support and process-block contracts read specific domain clusters of fields. This means you could:

1. Group fields by domain: `TransportState` (tempo, targetBPM, playTime), `MixState` (masterVolume, inputVolume, passthroughEnabled), `CaptureState` (captureSize, captureWritePos, captureLevel), `LayerStates[]`
2. Extract each group into its own struct with domain-specific read/write logic
3. The process-block contract verifies the audio output shape after each extraction
4. The param-support contract verifies that param dispatch still reaches the right fields

This would also fix the false-sharing problem by separating cache-line-hot fields (written every block) from cache-line-cold fields (written only on user action).

---

## 7. Golden-File Contract Brittleness

### The Smell

Byte-identical golden-file comparison is the core testing pattern. It catches drift perfectly. But it also catches meaningless differences: float representation changes across compilers, field reordering from `DynamicObject`, whitespace changes from `JSON::toString`.

Every golden is a maintenance commitment. Adding a new deterministic value to a system that has a golden means regenerating the golden — which means verifying manually that the change is correct.

### How Testing Surfaced It

- `export_support_contract_golden.json` — had to be stabilized by replacing exact `pssBytes` matching with invariant assertions (`pssPositive`, `privPositive`) because allocator counters vary between runs
- `surface_providers_draw_smoke_contract_golden.json` — used `lastRenderUsPositive` boolean instead of exact timing values
- `manifold_editor_live_contract` — Python test with invariant assertions, not a golden file
- Every stable golden that uses exact float values will eventually drift if the float computation path changes

### What Testing Now Enables

The existing golden suite can be maintained as-is, but new contracts should prefer:

1. **Invariant assertions** for timing, port numbers, allocator bytes, and other runtime-drifting values
2. **Boolean existence checks** (`captureLevel > 0.0` instead of exact `0.25`)
3. **Shape checks** (array length, object key presence) for deeply nested output that is structurally stable but numerically varied

The golden format itself is not the problem — it's excellent for catching behavioral drift. The risk is accumulation. 66 goldens is manageable. 200 goldens might not be.

---

## 8. Priority Order

| Priority | Item | Why |
|----------|------|-----|
| **1** | Destructor ordering fix | Clearest correctness hole. Blocks ASan coverage. Fix is known. |
| 2 | `BehaviorCoreProcessor` decomposition | Largest structural payoff. The process-block contract enables it. |
| 3 | `ImGuiDirectHost` split | Second-largest structural payoff. The draw-smoke contract enables it. |
| 4 | `VideoCaptureManager` injection | ML seam already proved the pattern. Mechanical follow-through. |
| 5 | `AtomicState` grouping | Already researched in prior worksheet. Less urgent than god-classes. |
| 6 | Golden contract monitoring | Watch item. Action only if golden count becomes a burden. |

---

## 9. Production Changes Made During Coverage Pass

The following production code changes were made during testing and are **not** regressions — they are bug fixes or test-enabling seams:

| File | Change | Motivation |
|------|--------|------------|
| `manifold/primitives/dsp/Playhead.h` | Fixed infinite loop in `setPosition()` when `length==0` | Bug found by `DspPrimitiveContractHarness` |
| `dsp/core/nodes/StutterNode.cpp` | Seeded `juce::Random` with fixed seed `12345` | Eliminated non-determinism in `DspNodeContractHarness` |
| `manifold/primitives/scripting/LuaEngine.cpp` | Added `clearAttachedUiLuaState()` | Fixed teardown crash from `RuntimeNode` sol refs outliving Lua VM |
| `manifold/primitives/scripting/bindings/LuaMidiBindings.cpp` | Changed `toBcp()` from `static_cast` to `dynamic_cast` | Test-safe null return with existing guards |
| `manifold/primitives/ml/MLPipeline.h/.cpp` | Injected `IMLInferenceBackend` seam | `MLPipelineContractHarness` determinism |
| `manifold/primitives/ml/MLMaskSurfaceProvider.h/.cpp` | Injected `PipelineFactory` + `FrameSupplier` | Provider testability without real ONNX model or camera |
| `manifold/ui/imgui/ImGuiDirectHost.h` | Added `makeEglContextCurrent()` public method | GL resize test without context leaking |
| `manifold/core/BehaviorCoreEditor.h/.cpp` | Added `refreshCachedStateContract()` / `getCachedStateContract()` / `setEditorStateProvider()` | `EDITORSTATE` IPC observability seam |
| `manifold/primitives/control/ControlServer.h/.cpp` | Added `setEditorStateProvider()` / `getEditorStateJson()` | Editor state IPC query support |
| `manifold/primitives/control/CommandParser.h` | Registered `EDITORSTATE` / `EDITOR_CONTRACT` query verbs | IPC route for live editor contract |
