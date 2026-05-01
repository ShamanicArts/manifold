# Binding God Functions — Decomposition Worksheet

**Date:** 2026-05-01 (v2 — updated 2026-05-01)
**Status:** PHASE 0 COMPLETE — harness landed, goldens captured, extraction not started
**Audience:** Agents executing this work
**Reference session:** `.pi/agent/sessions/--home-shamanic-dev-my-plugin--/2026-05-01T17-58-25-743Z_019de4b1-1cce-7333-86f0-2116541929cc.jsonl`
**Prior art:** `agent-docs/260501_avsampler_docking_decomposition_plan.md` — same decomposition methodology, already shipped successfully
**Codebase audit:** `agent-docs/active/analysis/300426_codebase_profile_and_bloat.md` — full LOC profiling, function analysis, bloat targeting

---

## 1. Executive Summary

The Lua-C++ binding layer is suffering from the same god-object pathology that was already fixed in the avsamplerDOCKING Lua project. The fix pattern is proven, the methodology is identical, and the work is entirely parallelizable across two independent streams.

### The Problem

8 C++ files contain ~12,000 lines of sol2 binding registrations stuffed into single anonymous lambdas or monolithic functions. No composition, no domain boundaries, no review pressure. Everything from waveform analysis to ImGui menu bars to OSC endpoints to DSP parameter mappings shares the same monolithic registration point because nobody has built a mechanism to split them.

Additionally, `LuaEngine.cpp` (2,676L, 9 concern categories) has the same god-object pathology — it contains DSP primitive wrappers, file resolution helpers, serialization, runtime node management, event system, and OSC callback processing in one file. This is NOT a binding file but suffers from the same structural problem.

On the Lua side, `parameter_binder.lua` (1,682L, 163 functions, 155 of which are ≤10 lines) has 120 boilerplate path functions that should be table-driven. It's the exact same bloat pattern as the C++ binding files — procedural code doing data's job.

### The Three Streams

| Stream | Files | Type of Work | Risk |
|--------|-------|-------------|------|
| **A: Mechanical extraction** | `LuaControlBindings.cpp`, `LuaUIBindings.cpp`, `LuaMidiBindings.cpp`, `LuaRuntimeNodeBindings.cpp`, `LuaEngine.cpp` (partial) | Cut-paste function bodies into per-domain files. Compiler verifies correctness. | Low |
| **C: Data-driven refactor** | `DSPHostParamRegistry.cpp` (+ others indirectly) | Translate the inline `paramsTable["register"]` lambda's parameter spec processing into a declarative `ParamBinding` table. Behaviour must survive translation exactly. | High |
| **L: Lua-side decomposition** | `parameter_binder.lua` | Replace 120 boilerplate path functions with a single table-driven generator. Not a prerequisite for anything. | Low |

Streams A and C touch **zero overlapping source files**. They can run in parallel in separate `jj` workspaces. Stream L is independent and can be done anytime.

### The Critical Prerequisite (Blocking Both C++ Streams)

**Neither stream starts until the introspection harness exists.** This is non-negotiable. The headless build infrastructure already exists — this is not building something from scratch, it's writing a test that uses existing facilities. The harness must:

1. Walk the sol2 Lua registry before any extraction
2. Dump every registered function, usertype, constant, enum, and property to a JSON golden file
3. After each extraction, run again — the JSON must be byte-identical

For Stream C specifically, additionally snapshot the oscquery endpoint tree before/after to catch param path drift that the registry diff might miss.

This is the C++ equivalent of `__avsdExportContract()` from the avsampler decomposition. Without it you are extracting blind. With it, the compiler AND the harness prove correctness at every step.

---

## 2. Current Code Anatomy — Researched Findings

Before any extraction happens, here is the actual structure of every file involved, verified by reading the source.

### 2.1. `LuaControlBindings.cpp` — Already Partially Decomposed (Good News)

The header declares and the .cpp defines **9 separate static methods**, all in the same file:

| Method | Lines | Real Content | Extract To |
|--------|-------|-------------|------------|
| `registerCommandBindings` | 150 | Command parsing, `command()` function, legacy syntax warnings | `LuaCommandBindings.cpp` |
| `registerWaveformBindings` | 799 | `getLayerPeaks`, `getCapturePeaks`, `getSamplePeaks`, analysis data access | `LuaWaveformBindings.cpp` |
| `registerDspBindings` | 99 | DSP primitive constructors (GainNode, FilterNode, etc.) | `LuaDspBindings.cpp` |
| `registerGraphBindings` | 358 | Graph construction, node connection, runtime management | `LuaGraphBindings.cpp` |
| `registerOSCBindings` | 296 | OSC query, endpoint management, OSC value registration | `LuaOSCBindings.cpp` |
| `registerEventBindings` | 66 | Event listener registration | `LuaEventBindings.cpp` |
| `registerLinkBindings` | 84 | Ableton Link bindings | `LuaLinkBindings.cpp` |
| `registerUtilityBindings` | **1,422** | File I/O, settings, ImGui menu API, clipboard, debug, video, profiling, ML inference | `LuaUtilityBindings.cpp` + split out |
| `registerMidiBindings` | 399 | MIDI send/receive, device enumeration | `LuaMidiBindings.cpp` (ALREADY in own file) |

**Key finding:** The extraction is even easier than the worksheet assumed. The methods already exist as named functions. Each takes `sol::state& lua, ILuaControlState& state` — the same two params. The move is literal cut-paste of an existing method body into a new file.

**`registerMidiBindings` is already in its own file** (`LuaMidiBindings.cpp`) but still scoped to `LuaControlBindings::`. Just needs re-scoping to a namespace.

**`registerUtilityBindings` is the real monster** at 1,422 lines. Its internal structure:
- Core utilities (getTime, getAudioClockInfo, etc.): ~200 lines
- File I/O + settings: ~200 lines
- Script listing cache: ~100 lines
- ImGui menu bar API: ~200 lines
- Debug/profiling: ~100 lines
- Video capture management: ~100 lines
- **ML inference (MANIFOLD_HAS_ML guard):** ~112 lines
- The rest: IPC, clipboard, etc.

### 2.2. `LuaUIBindings.cpp` — 3 Concern Areas

| Method | Lines | Content |
|--------|-------|---------|
| `registerCanvasBindings` | 535 | Canvas display list, widget creation, event routing |
| `registerOpenGLBindings` | 410 | OpenGL state management, shader compilation, texture operations |
| `registerGraphicsBindings` | 250 | Graphics primitives (rect, circle, line, text) |
| `registerConstants` | 124 | Constants, enums |

**Note:** The signature is `registerBindings(LuaCoreEngine& engine, Canvas* rootCanvas)` — different from `LuaControlBindings`. The extracted functions need a slightly different interface.

### 2.3. `LuaRuntimeNodeBindings.cpp` — 1 Concern

Single method: `registerBindings(LuaCoreEngine& engine, RuntimeNode* rootRuntime)` at 340 lines. Low priority — already a single concern. Only split if it makes sense structurally.

### 2.4. `LuaMidiBindings.cpp` — Already Extracted

Already lives in its own compilation unit. Just needs re-scoping from `LuaControlBindings::registerMidiBindings` to `lua_bindings::registerMidiBindings`.

### 2.5. `LuaEngine.cpp` — Additional Extraction Targets (Not a Binding File)

9 concern categories detected by bloat analyzer. Extraction targets:

| Code Block | Lines | Extract To |
|------------|-------|------------|
| DSP primitive wrappers (LoopBuffer, Playhead, Quantizer, CaptureBuffer) | ~65 (L45-110) | `bindings/LuaDspPrimitiveBindings.cpp` |
| File resolution helpers (`resolveSystemUiDir`, `resolveCompiledSystemUiDir`, `resolveProjectAssetRef`) | ~200 (L220-400) | `ScriptPathResolver.cpp` |
| Main `Impl` class | ~2,000 | Already coherent — don't split |

### 2.6. `DSPHost` Files — Already Per-File, NOT Bindings Lambdas

The DSPHost files are **not** `registerBindings` lambdas. They are individual named functions with different signatures:

| File | Function | Lines | Signature |
|------|----------|-------|-----------|
| `DSPHostBindingsCore.cpp` | `registerCoreBindings` | 989 | `(LoadSession&, PrimitiveGraphPtr, sol::table&, TrackNodeFn, PathMapperFn)` |
| `DSPHostBindingsSynth.cpp` | `registerSynthBindings` | 680 | `(LoadSession&, PrimitiveGraphPtr, sol::table&, TrackNodeFn)` |
| `DSPHostBindingsFx.cpp` | `registerFxBindings` | 1,113 | `(LoadSession&, PrimitiveGraphPtr, sol::table&, TrackNodeFn)` |
| `DSPHostParamRegistry.cpp` | `registerParamsApi` | 1,029 | `(LoadSession&, sol::table&, PathMapperFn, PathMapperFn)` |
| `DSPHostLoopLayerBundle.cpp` | `registerLoopLayerBundle` | 394 | `(LoadSession&, PrimitiveGraphPtr, sol::table&, TrackNodeFn, PathMapperFn)` |

All are declared in `DSPHostInternal.h` and called from `DSPPluginScriptHost.cpp:172-179`.

**These are already at file-per-concern granularity.** The problem isn't file structure — it's that each function body is large. `registerFxBindings` at 1,113 lines is just a sequence of `lua.new_usertype<FilterNode>(...)` registrations. `registerParamsApi` contains a 1,026-line inline lambda for `paramsTable["register"]`.

**For Stream C:** The data-driven approach applies to `registerParamsApi` where the inline lambda processes parameter specs. For `registerCoreBindings` / `registerFxBindings` / `registerSynthBindings`, the content is usertype registrations — not a natural fit for data-driving. Those could be left as-is, or refactored to iterate over a usertype descriptor table. The latter is more work for marginal gain.

### 2.7. `parameter_binder.lua` — Lua-Side Analogue (Stream L)

The file has 163 functions, 155 of which are ≤10 lines. 120 of them follow this exact pattern:

```lua
function ParameterBinder.dynamicEqBasePath(slotIndex) return ... end
function ParameterBinder.dynamicEqMixPath(slotIndex) return ... end
-- 118 more of these
```

This is the same procedural-bloat-as-data problem as the C++ DSPHost params, but in Lua. The fix: a single table of path templates replaces 120 boilerplate functions.

### 2.8. CMake Structure

All binding files and DSPHost files live in a single CMake variable:

```cmake
# CMakeLists.txt:547-634
set(MANIFOLD_RUNTIME_SOURCES
    ...
    manifold/primitives/scripting/bindings/LuaUIBindings.h
    manifold/primitives/scripting/bindings/LuaUIBindings.cpp
    manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.h
    manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp
    manifold/primitives/scripting/bindings/LuaControlBindings.h
    manifold/primitives/scripting/bindings/LuaControlBindings.cpp
    manifold/primitives/scripting/bindings/LuaMidiBindings.cpp
    manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp
    manifold/primitives/scripting/dsp_host/DSPHostBindingsSynth.cpp
    manifold/primitives/scripting/dsp_host/DSPHostBindingsFx.cpp
    manifold/primitives/scripting/dsp_host/DSPHostParamRegistry.cpp
    manifold/primitives/scripting/dsp_host/DSPHostLoopLayerBundle.cpp
    ...)
```

Used by the `Manifold` library target (line 677), the standalone, the VST3 probe, and mobile builds. Adding new files is a single-line addition to this list.

### 2.9. Conditional Compilation

Only 1 `#if` block in `LuaControlBindings.cpp`:
- `#if MANIFOLD_HAS_ML` (lines 3060-3172) — ML inference bindings inside `registerUtilityBindings`

No platform-specific `#ifdef` blocks in the binding files. No `extern "C"` blocks except the standard sol2 header guard at the top.

### 2.10. `ILuaControlState&` Interface

The interface exposes everything the binding lambdas need:

- `getProcessor()` / `getMidiManager()` — processor and MIDI access
- `getCurrentScriptFile()` / `setPendingSwitchPath()` — script management
- `getManagedDspSlots()` / `getPersistentDspSlots()` — DSP slot tracking
- `getUiRegisteredOscEndpoints()` / `getUiRegisteredOscValues()` — OSC endpoint tracking
- `getOscCallbacks()` / `getOscCallbacksMutex()` — OSC callback management
- `getOscQueryHandlers()` / `getOscQueryHandlersMutex()` — OSC query handling
- Event listener getters (tempo, commit, recording, layer state, general state)
- `withLuaState(callback)` — thread-safe Lua state access
- `showDirectoryChooser` / `showFileChooser` — async UI dialogs
- Debug outline / copy-ID mode controls

The extracted binding functions take `sol::state&` directly (not `ILuaControlState&` for the state — some is captured implicitly via the `ILuaControlState&`). **Important:** The current static methods take `sol::state& lua, ILuaControlState& state` — the `ILuaControlState&` is needed for stateful operations like OSC callbacks, event listeners, and file choosers. The extraction preserves this signature.

---

## 3. Prior Art — What the avsampler Decomposition Taught Us

The avsamplerDOCKING decomposition shipped safely because of these rules. Every one applies to this work:

### 3.1. Side-by-Side Migration, Not In-Place

The original stayed live the entire time. Only when regression tests were green was the migration merged back.

**Apply here:** Stream A creates new files; the original lambda shrinks to a dispatch call. Stream C creates data tables while old procedural code continues to run.

### 3.2. The Contract IS the Specification

`__avsdExportContract()` produced a structured JSON snapshot. If two projects produced identical contract output for identical inputs, the decomposition was correct.

**Apply here:** The sol2 registry dump IS the contract. For Stream C additionally the oscquery endpoint tree.

### 3.3. Mechanical Extraction, Zero Behavior Changes

Move code, don't change it. When a test failed, only one variable changed — the file the code lived in.

**Apply here:** Stream A lambda bodies move verbatim. Stream C is inherently a representation change, so the rule is different: keep the old code running until comparison passes.

### 3.4. Dependency-Ordered Extraction

Leaves first (constants, util), then branches (state, sources), then trunk (runtime, initflow).

**Apply here:** For `LuaControlBindings.cpp`:
```
Layer 1 (no intra-binding deps):
  LuaCommandBindings.cpp    — standalone command parser wrapper
  LuaWaveformBindings.cpp   — standalone waveform analysis
  LuaMidiBindings.cpp       — standalone MIDI (already extracted)

Layer 2 (depends on utility types — utility may define types that others reference):
  LuaGraphBindings.cpp      — may reference utility-registered types
  LuaOSCBindings.cpp        — may reference utility-registered types

Layer 3 (sub-extractions from utility, after utility is stable):
  LuaImGuiBindings.cpp      — extracted from utility lambda
  LuaEventBindings.cpp      — extracted from utility lambda
  LuaLinkBindings.cpp       — extracted from utility lambda
  LuaDspBindings.cpp        — extracted from utility lambda
  LuaUtilityBindings.cpp    — what remains after sub-extractions
```

### 3.5. Two Testing Layers

| Layer | What It Catches | Automation |
|-------|----------------|------------|
| Harness (sol2 registry diff) | API surface drift, missing functions, wrong signatures | Fully automated — CI-able |
| Headless + live standalone | Runtime behaviour — DSP response, OSC round-trip, param mapping | Headless automated, standalone manual |

The avsampler `syncParamsFromHost` bug was invisible to the state snapshot harness because it only compared exported data. Only loading in a live session caught it. The sol2 registry dump catches 95% of Stream A issues. But Stream C's param bindings have runtime behaviour (min/max clamping, preprocess functions, OSC round-trip) that the registry dump can't see. The oscquery endpoint tree comparison catches some of this, but the user loading a DSP plugin and wiggling params catches the rest.

### 3.6. Temporary Namespace, Permanent Structure

"avsd" was a knowingly temporary namespace. The rename happened after the module count stabilized.

**Apply here:** Don't bikeshed names. Get the extraction done, names can change later.

---

## 4. The Harness — Phase 0 (MUST SHIP FIRST)

**Blocking dependency for both Stream A and Stream C.**

The headless build infrastructure already exists. This is writing a harness test that uses it — not building new infrastructure from scratch.

### 4.1. Two Harness Layers (Both Required)

Phase 0 is not one harness. It is two harnesses at different stack depths:

| Harness | Stack Depth | Purpose | Why |
|---------|-------------|---------|-----|
| **`LuaEngineMockHarness` contract mode** | In-process Lua engine only | Binding API surface contract | Fast, deterministic, minimal moving parts |
| **`ManifoldHeadless --test-ui` + Python IPC/HTTP test** | Processor + editor + UI shell + OSC/OSCQuery | Full-stack OSCQuery / endpoint contract | Closest headless equivalent to standalone |

This is the correct split proven from code:
- `LuaEngine::withLuaState(...)` and `LuaCoreEngine::getLuaState()` already expose locked Lua-state access
- `LuaEngineMockHarness.cpp` already instantiates the real `LuaEngine` and binding registration path
- `BehaviorCoreProcessor::prepareToPlay()` already starts `OSCServer` / `OSCQueryServer`
- `OSCQueryServer` already exposes `/info` and `/` as JSON tree exports

### 4.2. Lua Binding Contract (Mock Harness Layer)

**Implemented:** `LuaEngineMockHarness --write-contract/--verify-contract`

Contract strategy:
1. Create a baseline `LuaCoreEngine`, initialize it, and record the top-level globals from the standard libraries only
2. Create a real `LuaEngine`, initialize it with the mock processor/canvas root, and dump all top-level globals added by binding registration
3. For each added global, recursively dump a canonical JSON description of:
   - kind (`function`, `table`, `userdata`, `string`, `number`, etc.)
   - primitive value when applicable
   - table entries (sorted)
   - metatable entries for tables/userdata (sorted)
4. Compare against a checked-in golden file

**Important:** there is currently **no** existing binding contract exporter in the codebase. Phase 0 explicitly includes adding this exporter logic. This is the avsampler-style observability work for this decomposition.

### 4.3. Full-Stack OSCQuery Contract (Headless Layer)

**Implemented:** `tests/e2e_oscquery_contract_test.py` launches `ManifoldHeadless --test-ui`, forces deterministic OSC settings in an isolated temp HOME/XDG config, switches to a deterministic temp UI script that registers `/phase0/custom`, fetches `GET /info`, and diffs the tree against a golden file.

Why this layer exists:
- it exercises the real processor/editor/runtime stack
- it catches endpoint drift outside the narrow Lua binding surface
- it validates that custom endpoints registered through the UI layer actually appear in OSCQuery

**Important:** unlike the Lua binding contract, the OSCQuery export seam mostly already exists:
- `OSCEndpointRegistry::getAllEndpoints()`
- `OSCQueryServer::buildTree()`
- `OSCQueryServer::buildOSCQueryInfo()`
- HTTP `GET /info`

So this side of Phase 0 is mostly harness/test plumbing, not invasive production surgery.

### 4.4. Phase 0 May Require Minimal C++ Export Helpers

Phase 0 is allowed to add **minimal introspection/export seams** in production C++ if the harness cannot derive a stable enough contract from existing APIs.

Priority order:
1. Use existing seams first (`withLuaState`, `/info`, endpoint registry)
2. If that is insufficient, add the smallest possible helper dedicated to stable export
3. Do **not** add random debug logging or broad invasive hooks

This is the same principle as avsampler: observability first, then decomposition.

### 4.5. Golden File Location

```
tests/fixtures/lua_bindings_golden.json
tests/fixtures/dsphost_oscquery_golden.json
```

### 4.6. Integration

```cmake
add_test(
    NAME manifold_lua_bindings_contract
    COMMAND $<TARGET_FILE:LuaEngineMockHarness>
            --verify-contract ${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures/lua_bindings_golden.json)

add_test(
    NAME manifold_headless_oscquery_contract
    COMMAND ${Python3_EXECUTABLE} ${CMAKE_CURRENT_SOURCE_DIR}/tests/e2e_oscquery_contract_test.py
            --headless build-dev/ManifoldHeadless)
```

---

## 5. Stream A — Mechanical Extraction of Lua Binding Files

### 5.1. Files Involved

| File | Lines | Current Methods | Target State |
|------|-------|----------------|-------------|
| `LuaControlBindings.cpp` | 4,054 | 9 static methods | ~50 lines (dispatch only) |
| `LuaUIBindings.cpp` | 1,727 | 4 methods | ~40 lines (dispatch only) |
| `LuaMidiBindings.cpp` | 399 | 1 method (already extracted) | Re-scope from `LuaControlBindings::` to namespace |
| `LuaRuntimeNodeBindings.cpp` | 340 | 1 method | Leave as-is (single concern) |
| `LuaEngine.cpp` | 2,676 | ~2,000 lines of Impl + ~65 wrappers + ~200 path resolver | Extract wrappers + path resolver |

### 5.2. New Files Created (Stream A)

From `LuaControlBindings.cpp`:
```
bindings/LuaCommandBindings.{h,cpp}     — registerCommandBindings (150L)
bindings/LuaWaveformBindings.{h,cpp}     — registerWaveformBindings (799L)  
bindings/LuaGraphBindings.{h,cpp}        — registerGraphBindings (358L)
bindings/LuaOSCBindings.{h,cpp}         — registerOSCBindings (296L)
bindings/LuaEventBindings.{h,cpp}       — registerEventBindings (66L)
bindings/LuaLinkBindings.{h,cpp}        — registerLinkBindings (84L)
bindings/LuaDspBindings.{h,cpp}         — registerDspBindings (99L)
bindings/LuaUtilityBindings.{h,cpp}     — registerUtilityBindings after sub-extractions
bindings/LuaImGuiBindings.{h,cpp}       — ImGui menu bar API from utility (est ~200L)
```

From `LuaUIBindings.cpp`:
```
bindings/LuaCanvasBindings.{h,cpp}      — registerCanvasBindings (535L)
bindings/LuaOpenGLBindings.{h,cpp}      — registerOpenGLBindings (410L)
bindings/LuaGraphicsBindings.{h,cpp}    — registerGraphicsBindings (250L)
```

From `LuaEngine.cpp`:
```
bindings/LuaDspPrimitiveBindings.{h,cpp}  — DSP wrappers (~65L)
scripting/ScriptPathResolver.{h,cpp}      — file resolution (~200L)
```

**Total: ~16 new .cpp/.h pairs** (including .h files = ~32 files). 20+ in the `bindings/` directory is fine. If it feels crowded, subdirectories can be added later — file moves are cheap when the architecture is good.

### 5.3. The Extraction Pattern

Each new file follows the same template:

```cpp
// LuaWaveformBindings.h
#pragma once
#include <sol/sol.hpp>

class ILuaControlState;

namespace lua_bindings {
void registerWaveformBindings(sol::state& lua, ILuaControlState& state);
}

// LuaWaveformBindings.cpp
#include "LuaWaveformBindings.h"
#include "../ILuaControlState.h"
// ... domain-specific includes ...

namespace lua_bindings {
void registerWaveformBindings(sol::state& lua, ILuaControlState& state) {
    // MOVED VERBATIM from LuaControlBindings::registerWaveformBindings
    lua["getLayerPeaks"] = [&state, &lua](int layerIdx, int numBuckets) -> sol::table {
        // ... exact same code ...
    };
    // ...
}
```

The original `LuaControlBindings.cpp` shrinks to:

```cpp
#include "LuaWaveformBindings.h"
#include "LuaGraphBindings.h"
// ... etc ...

void LuaControlBindings::registerBindings(LuaCoreEngine& engine, ILuaControlState& state) {
    auto& lua = engine.getLuaState();
    lua_bindings::registerCommandBindings(lua, state);
    lua_bindings::registerWaveformBindings(lua, state);
    lua_bindings::registerDspBindings(lua, state);
    if (auto* processor = state.getProcessor()) {
        if (!processor->isExportPlugin()) {
            lua_bindings::registerGraphBindings(lua, state);
        }
    }
    lua_bindings::registerOSCBindings(lua, state);
    lua_bindings::registerEventBindings(lua, state);
    lua_bindings::registerLinkBindings(lua, state);
    lua_bindings::registerUtilityBindings(lua, state);
    lua_bindings::registerMidiBindings(lua, state);
}
```

### 5.4. Risk in Stream A

**Very low.** The compiler catches everything:
- Missing include → compile error
- Wrong namespace → compile error  
- Mangled function signature → compile error
- Forgot to dispatch a method → linker error (undefined reference)

The harness is belt-and-suspenders. The compiler is the primary correctness tool.

### 5.5. Acceptance Per Extraction Step

1. Build succeeds (new files link correctly)
2. `LuaBindingHarness --verify-golden` passes (registry dump identical)
3. (Optional) User confirms no regressions in standalone

---

## 6. Stream C — Data-Driven DSPHost Parameter Bindings

### 6.1. Files Involved

The Stream C analysis in the original worksheet assumed the DSPHost files followed the `registerBindings` lambda pattern. They don't. Each file is a single named function:

| File | Function | Lines | What It Registers |
|------|----------|-------|-------------------|
| `DSPHostBindingsCore.cpp` | `registerCoreBindings` | 989 | ~15 usertypes (PlayheadNode, GainNode, MixerNode, etc.) with their methods |
| `DSPHostBindingsSynth.cpp` | `registerSynthBindings` | 680 | ~10 usertypes (OscillatorNode, WaveShaperNode, etc.) |
| `DSPHostBindingsFx.cpp` | `registerFxBindings` | 1,113 | ~15 usertypes (ReverbNode, FilterNode, ChorusNode, etc.) |
| `DSPHostParamRegistry.cpp` | `registerParamsApi` | 1,029 | The `paramsTable["register"]` and `paramsTable["bind"]` lambdas |
| `DSPHostLoopLayerBundle.cpp` | `registerLoopLayerBundle` | 394 | Loop layer usertypes |

### 6.2. What Stream C Actually Is

**Stream C is NOT about splitting files.** The files are already split by domain. The problem is that each function body is a god function.

There are two distinct sub-problems:

**Sub-problem 1: Usertype registration blocks** (`registerCoreBindings`, `registerFxBindings`, `registerSynthBindings`, `registerLoopLayerBundle`)

Each is a sequence of `lua.new_usertype<FooNode>(...)` calls. These CAN be data-driven — iterate over a table of usertype descriptors — but the gain is modest. Each usertype has different methods, so the descriptor table ends up with conditional logic anyway.

**Decision:** Leave these as-is for now. They are already at reasonable granularity (one file per DSP domain). If build times become an issue, then consider per-usertype files or data-driven registration.

**Sub-problem 2: The inline param registration lambda** (`registerParamsApi`)

This is the high-value target. The 1,026-line `paramsTable["register"]` lambda processes parameter spec options from Lua:

```cpp
paramsTable["register"] = [&](const std::string &rawPath, sol::table options) {
    const std::string externalPath = mapInternalToExternal(rawPath);
    DspParamSpec spec;
    if (options["type"].valid())     spec.typeTag = options["type"].get<std::string>();
    if (options["min"].valid())      spec.rangeMin = options["min"].get<float>();
    if (options["max"].valid())      spec.rangeMax = options["max"].get<float>();
    if (options["default"].valid())  spec.defaultValue = options["default"].get<float>();
    if (options["access"].valid())   spec.access = options["access"].get<int>();
    // ... more options processing ...
    newParamSpecs[externalPath] = spec;
    newParamValues[externalPath] = spec.defaultValue;
    // ... path mapping bookkeeping ...
};
```

This lambda IS the data-driven target — but NOT by replacing it with a C++ data table. The lambda is called at runtime from Lua, not at compile time. The bindings are dynamic — each DSP plugin registers its own params at runtime via Lua.

**The real data-driving target is the parameter specs themselves, which are defined in Lua scripts.** Currently each plugin DSP script contains ~50-200 inline `params.register()` calls. These could be declarative data in the Lua scripts. But that's a Lua-side refactor, not a C++ one.

### 6.3. Corrected Stream C Scope

**The high-risk "translate ~200 imperative param registrations to declarative data" from the original worksheet doesn't apply to the C++ layer.** The param registrations happen at runtime via Lua, not at compile time via C++.

What CAN be done in C++ to clean up `registerParamsApi`:

1. **Extract the `register` and `bind` lambdas** into named helper functions (already possible — they just aren't named yet because they're inline)
2. **Extract the `DspParamSpec` option-parsing logic** into a dedicated function
3. **Validate the option parsing** — currently it directly accesses `options["key"]` with no error handling for unknown keys

This is a much lower-risk operation than the original worksheet contemplated. It's Stream A-style mechanical extraction, not a representation change.

**Conclusion:** Stream C as originally conceived (data-driven param tables replacing procedural registrations) doesn't apply because the registrations are runtime Lua calls. The actual work in the DSPHost files is:
- Mechanical extraction of the inline lambdas in `registerParamsApi` into named functions
- Optionally, data-driving the usertype registrations in `registerCoreBindings`/`registerFxBindings`/`registerSynthBindings` (deferred — lower priority)

### 6.4. Updated Risk Assessment

| Original Risk | Updated Assessment |
|---------------|-------------------|
| Param translation errors (wrong ID, missing range, lost preprocess) | **Not applicable** — params are registered from Lua at runtime, not from C++ data tables |
| Representation change (procedural → declarative) | **Not applicable** — the C++ code doesn't contain the param declarations, Lua scripts do |
| Inline lambda extraction in `registerParamsApi` | **Low risk** — mechanical extraction, same as Stream A |

---

## 7. Stream L — Lua-Side `parameter_binder.lua` Decomposition

### 7.1. The Problem

```
ParameterBinder.dynamicEqBasePath(slotIndex)       -- 5 lines
ParameterBinder.dynamicEqMixPath(slotIndex)         -- 5 lines
ParameterBinder.dynamicEqSidechainPath(slotIndex)   -- 5 lines
ParameterBinder.dynamicFxBasePath(slotIndex)        -- 5 lines
ParameterBinder.dynamicFxMixPath(slotIndex)         -- 5 lines
ParameterBinder.dynamicFilterBasePath(slotIndex)    -- 5 lines
-- ... 114 more of these ...
```

155 of 163 functions are ≤10 lines. 120 of them return a path string.

### 7.2. The Fix

```lua
-- Instead of 120 functions:
local PATH_TEMPLATES = {
    eq = {"Base", "Mix", "Sidechain"},
    fx = {"Base", "Mix", "Sidechain"},
    filter = {"Base", "Mix", "Sidechain"},
    rack_oscillator = {"Base", "Mix"},
    rack_sample = {"Base", "Mix"},
    -- ... templates for all module types ...
}

function ParameterBinder.dynamicPath(moduleType, suffix, slotIndex)
    return "/path/to/" .. moduleType .. "_" .. suffix .. "/" .. slotIndex
end
```

Collapses 120 functions × ~5 lines = ~600 lines into ~50 lines of data + 5 lines of code.

### 7.3. Not a Prerequisite

Stream L doesn't block anything. Can be done independently at any time. The harness for this is: run the headless standalone, load a project that uses parameter_binder, verify the same paths are generated for the same inputs.

---

## 8. Parallel Execution Strategy (jj Workspaces)

Stream A and Stream C (corrected) and Stream L touch completely disjoint source files:

| Thing | Stream A | Stream C | Stream L |
|-------|----------|----------|----------|
| Source files modified | Binding files in `bindings/` | DSPHost files in `dsp_host/` | `parameter_binder.lua` |
| New files | ~16 .cpp/.h pairs | 0 (extraction only) | 0 |
| CMakeLists.txt | Adds files | No changes | No changes |
| Risk | Low | Low (corrected) | Low |

**The only thing all streams share is the harness.** Ship it first on trunk.

### Setup

```bash
# Step 1: Build the harness on trunk, commit it
jj new -m "harness: sol2 binding introspection + golden file"

# Step 2: Fork workspaces from that commit
jj new -m "stream-a: mechanical extraction of lua binding files"
jj new -m "stream-c: inline lambda extraction in dsphost params"  # from same parent
jj new -m "stream-l: table-driven parameter_binder.lua"           # from same parent
```

### Merge Order

Stream L first (simplest, Lua-only, no build changes). Stream A next (mechanical, compiler-verified). Stream C last (DSPHost — most invasive testing needed). Or any order — no merge conflicts.

---

## 9. Pre-Flight Checklist

Before any extraction happens, verify:

- [ ] **Harness exists** — headless test that dumps sol2 registry + oscquery tree, saves golden files
- [ ] **Verify current method signatures** — each binding method signature is confirmed by reading source (DONE in §2)
- [ ] **Map cross-domain type references** — verify that usertypes registered in one domain aren't referenced by another domain's bindings (sol2 requires registration order)
- [ ] **Identify all conditional compilation guards** — verified: only `#if MANIFOLD_HAS_ML` in utility bindings (DONE in §2.9)
- [ ] **Verify CMake structure supports new files** — single `MANIFOLD_RUNTIME_SOURCES` list, flat addition (DONE in §2.8)
- [ ] **Audit capture state** — confirm each lambda captures nothing that can't be passed through `sol::state&` + `ILuaControlState&`. The current static methods already take these two params, so this is trivially guaranteed.
- [ ] **Decide directory structure** — `bindings/` stays flat (current convention). Subdirs later if it gets crowded.
- [ ] **Define abort threshold** — per extraction step: build fails OR harness diff is non-empty. That's it.

---

## 10. Risk Register (Updated)

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Cross-domain type ordering: extracted module A registers a type that module B needs, but B loads before A | **LOW** | Extraction order: utility first, then standalone domains, then dependent domains. Compiler catches missing types. |
| 2 | Conditional compilation missed in extracted module (e.g., `#if MANIFOLD_HAS_ML` doesn't make it into the new file) | **LOW** | Only one `#if` block exists (ML). Migrate it with the utility binding extraction. |
| 3 | Harness doesn't capture enough detail to catch all regressions | **MEDIUM** | Two-layer validation: registry diff + oscquery tree diff + user manual smoke test |
| 4 | Sol2 registry iteration is unreliable or misses certain registration types | **MEDIUM** | Prototype the harness first. If sol2 registry walk can't be made reliable, fall back to compile-time instrumentation. |
| 5 | Debug info bloat: new .cpp files each compile sol2 template instantiations | **LOW** | Templates are already instantiated — they're just in one file now. Total compile time redistributes but doesn't increase meaningfully. |
| 6 | CMakeLists.txt merge conflict across streams | **LOW** | All streams touch different areas or different lines. 30-second resolution. |
| 7 | `parameter_binder.lua` refactor misses a path edge case | **LOW** | Contract test: run with a known project config, compare generated paths against golden file. |

---

## 11. Success Criteria

This worksheet is complete when all are true:

### Harness
- [x] `LuaEngineMockHarness --write-contract/--verify-contract` exists, produces `tests/fixtures/lua_bindings_golden.json`, and is registered as `manifold_lua_bindings_contract`
- [x] `tests/e2e_oscquery_contract_test.py` exists, produces `tests/fixtures/dsphost_oscquery_golden.json`, and is registered as `manifold_headless_oscquery_contract`

### Stream A
- [ ] `LuaControlBindings.cpp` is ≤80 lines (dispatch only) with 9 domain-specific modules created
- [ ] `LuaUIBindings.cpp` is ≤40 lines (dispatch only) with 3 domain-specific modules created
- [ ] `LuaMidiBindings.cpp` re-scoped from `LuaControlBindings::` to `lua_bindings::`
- [ ] `LuaEngine.cpp` has DSP wrappers extracted to `bindings/LuaDspPrimitiveBindings.cpp`
- [ ] `LuaEngine.cpp` has file resolution extracted to `scripting/ScriptPathResolver.cpp`
- [ ] Golden file diff is empty after every extraction step

### Stream C
- [ ] `DSPHostParamRegistry.cpp` inline lambdas extracted to named functions
- [ ] Golden file diff + oscquery tree diff both empty after extraction

### Stream L
- [ ] `parameter_binder.lua` collapsed 120 boilerplate functions to data-driven generator
- [ ] Headless project load generates identical paths before/after

### General
- [ ] Build passes for all targets including `Manifold_Standalone`
- [ ] User confirms no regressions in standalone (DSP wiggle test, OSC round-trip)

---

## 12. Change Log

| Date | Change |
|------|--------|
| 2026-05-01 | Initial worksheet created. Harness defined as blocking prerequisite. Streams A and C defined. |
| 2026-05-01 | **v2 update:** Added actual code research findings (source reading, method sizes, signatures, CMake structure). Added Stream L (`parameter_binder.lua`). Corrected Stream C analysis — DSPHost files are already per-file, the param registrations are runtime Lua calls, not C++ data. Added `LuaEngine.cpp` to Stream A scope. Added Pre-Flight Checklist. Updated risk register. Removed time estimates. |
| 2026-05-02 | **Phase 0 complete:** Added canonical Lua binding contract mode to `manifold/headless/LuaEngineMockHarness.cpp`, added `tests/e2e_oscquery_contract_test.py`, captured `tests/fixtures/lua_bindings_golden.json` and `tests/fixtures/dsphost_oscquery_golden.json`, wired both into `CMakeLists.txt`, and verified both with `ctest`. |
