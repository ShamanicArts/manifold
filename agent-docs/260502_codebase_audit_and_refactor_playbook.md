# Codebase Audit & Refactor Playbook

**Date:** 2026-05-02
**Status:** Living reference — updated 2026-05-02 (Phase 1 ✅, Phase 2 🗑️)
**Scope:** Full structural audit of `manifold/`, `dsp/`, `UserScripts/`, `web/` runtime code.
**Refactor methodology:** Contract-first, golden snapshots, side-by-side migration, profile+test+refactor as one operation.

---

## 1. Methodology — What Works

Two refactoring rounds have proven a methodology that reliably prevents regressions. This section documents the pattern so future work can follow it without re-discovering it.

### 1.1. The Contract-First Pattern

Every refactoring operation follows this sequence:

```
Phase 0: Build the harness
  │  Create an introspection/export mechanism that captures the full
  │  contract of what you're about to change (API surface, state shape,
  │  endpoint tree, etc.). Save as JSON golden file.
  │
  ▼
Phase 1: Extract/refactor (mechanical)
  │  Move code verbatim. Zero behavior changes. "No while I'm here."
  │  Side-by-side: old code stays live until new code passes.
  │
  ▼
Phase 2: Verify contract
  │  Run harness again. Diff against golden file. Must be byte-identical.
  │  If not: fix the one thing that changed, re-run.
  │
  ▼
Phase 3: Cut old code
  │  Remove the original code only after contract passes.
  │
  ▼
Phase 4: Run full test suite + standalone smoke
  │  CTest regression suite + user loads a project + wiggles things.
```

This was proven in:
- **avsamplerDOCKING decomposition** (Lua project): `__avsdExportContract()` captured full project state, diffed before/after module extraction
- **Binding god functions decomposition** (C++): `LuaBindingHarness --write-contract/--verify-contract` captured sol2 registry, `e2e_oscquery_contract_test.py` captured oscquery endpoint tree

### 1.2. The Harness Infrastructure

The headless build (`ManifoldHeadless`) is the key enabler. It:
- Creates a real `BehaviorCoreProcessor` with real `ControlServer`
- Optionally creates a real `BehaviorCoreEditor` (`--test-ui`)
- Runs an audio callback loop for `--duration` seconds
- Opens a Unix socket at `/tmp/manifold_*.sock` for IPC
- Accepts `EVAL`, `GET`, `SET`, `DIAGNOSE`, `UISWITCH` commands

The Python test harness (`tests/harness/manifold.py`) wraps this:
- `ManagedManifoldProcess` — launch/stop lifecycle, artifact capture
- `ManifoldClient` — IPC over Unix socket with `command()`, `command_ok()`, `command_json()`
- `ArtifactBundle` — timestamped output directories under `/tmp/manifold_test_artifacts/`
- `wait_for()` — polling with timeout

### 1.3. What Makes a Good Contract

The contract must be:
- **Deterministic** — same inputs produce byte-identical output every time
- **Comprehensive** — covers everything the refactoring touches
- **Fragile to drift** — a missing function, wrong signature, or reordered registration produces a diff
- **Fast** — runs in under a second so it can be used iteratively

Bad contracts: screenshots, timing measurements, anything with random seeds.
Good contracts: sorted JSON snapshots of deterministic state, registry dumps, endpoint trees.

### 1.4. The "Both Wired" Pattern

For higher-risk refactors (Stream C, data-driven changes), keep the old code running alongside the new code with a comparison loop:

```cpp
// Run both, assert identical output
auto oldResult = oldPath(param);
auto newResult = newPath(param);
assert(oldResult == newResult);
```

Only cut the old code when comparison passes for every input.

### 1.5. Profile Before You Touch

Before any refactoring, establish the baseline:
- File sizes, function sizes, concern density (`tools/profiling/`)
- Build times
- Test pass rates
- Specific behavioral contract (harness golden file)

This catches the case where the refactoring accidentally changes behavior AND the case where it accidentally changes build characteristics.

---

## 2. Codebase Profile (Current)

**Generated:** 2026-05-02  
**Method:** Automated via `tools/profiling/codebase_profile.py`

| Metric | Value |
|--------|-------|
| Total runtime LOC | 215,962 |
| Total files | 748 |
| Lua LOC | 129,018 (59.7%) |
| C++ LOC | 59,629 (27.6%) |
| C headers LOC | 19,091 (8.8%) |
| Files ≥ 1,000 lines | 44 files (85,395 lines — 40% of codebase) |
| Files ≥ 2,000 lines | 16 files |

### 2.1. Top-Level Breakdown

| Directory | Files | LOC | % |
|-----------|------:|----:|---|
| `UserScripts/` | 325 | 104,889 | 48.6% |
| `manifold/` | 289 | 84,411 | 39.1% |
| `dsp/` | 127 | 20,966 | 9.7% |
| `web/` | 7 | 5,696 | 2.6% |

### 2.2. Manifold/ Subsystem Breakdown

| Subsystem | LOC | Notes |
|-----------|-----|-------|
| `primitives/` | 37,502 | Bindings, control, scripting, video, shaders, MIDI |
| `ui/` | 29,936 | Shell, ImGui, widgets, project loader |
| `core/` | 7,537 | BehaviorCoreProcessor + Editor |
| `dsp/` | 2,535 | Manifold-level DSP (not the dsp/ library) |
| `headless/` | 2,245 | Harnesses + ManifoldHeadless |
| `SystemScripts/` | 1,811 | Settings UI |
| `shaders/` | 1,521 | Shader surface provider |
| `grpc/` | 854 | gRPC layer |

### 2.3. UserScripts/ Project Breakdown

| Project | LOC | Status |
|---------|-----|--------|
| `Main/` | 53,901 | Primary product |
| `BappInstrument/` | 7,571 | **Throwaway** — pending deletion |
| `avsamplerDOCKING/` | 6,395 | **Decomposed** — 14 modules, contract tested |
| `ExperimentalUI/` | 4,043 | Legacy |
| `RackModuleHost/` | 3,875 | Standalone rack host |
| `DspLiveScripting/` | 2,930 | Live scripting playground |
| `WebcamViewer/` | 2,432 | Standalone webcam plugin |
| `BappSourceLayerLab/` | 2,425 | **Throwaway** |
| *28 other standalone projects* | ~18,000 | Runtime-loaded VST plugins |

---

## 3. Completed Refactoring Work

### 3.1. ControlServer Command Dispatch Table

**Target:** `manifold/primitives/control/ControlServer.cpp:processCommand` (233L switch/if-else chain → dispatch table)

**Date:** 2026-05-02

**What was done:** Extracted all 17 command handlers from the monolithic `processCommand` function into named private member functions. Replaced the procedural prefix-check + switch dispatch with a `std::unordered_map<ParseResult::Kind, std::function>` dispatch map (function-local static, populated once via IIFE).

**Handlers created (17 total):**
- **4 prefix handlers** (short-circuit before parser): `handleDspRun`, `handlePerfReset`, `handleEval`, `handleDirectSet`
- **13 parsed handlers** (after `CommandParser::parse`): `handleEnqueue`, `handleQuery`, `handleWatch`, `handleInject`, `handleInjectionStatus`, `handleUISwitch`, `handleUIRenderer`, `handleScreenshot`, `handleRecordStart`, `handleRecordStop`, `handleRecordStatus`, `handleNoOpWarning`, `handleError`

**Net change:** `processCommand` 233L → ~35L inline orchestration + 17 extracted handlers (~500L total). Each handler is independently readable and testable. New commands require writing one handler function and adding one line to the dispatch map.

**Contract:** Existing `manifold_headless_ipc_core` (15 tests), `manifold_core_sniff` (19 tests), `manifold_core_state_contract`, and `manifold_headless_oscquery_contract` all pass unchanged — proving zero behavioral drift.

**Key lesson:** The dispatch map approach works cleanly for command handlers. The `std::function` + IIFE static pattern avoids startup ordering issues and keeps the map definition adjacent to `processCommand`.

### 3.2. VideoSynthPrimitive Dead Code Removal

**Target:** `manifold/primitives/video/VideoSynthPrimitive.cpp` (1,141L) + `.h`

**Date:** 2026-05-02

**What was done:** Discovered that the entire `VideoSynthPrimitive` class was dead code — not included in any CMake target, not referenced by any file in the codebase. The live shader system (`ShaderEffectRegistry` in `manifold/primitives/shaders/`) already loaded shaders from `manifold/shaders/*.json` + `*.glsl` files at runtime. The playbook's Phase 2 analysis was stale.

**Action:** Deleted both files. 1,141 lines of dead GLSL string literals removed. All 9 tests pass, all targets build clean.

**Lesson:** The codebase profile lists file sizes but doesn't distinguish compiled vs. dead files. Cross-reference CMakeLists.txt `target_sources` when analyzing refactoring targets.

### 3.3. BehaviorCoreProcessor MIDI Support Extraction + Contract Harness

**Targets:**
- `manifold/core/BehaviorCoreProcessor.cpp` (3,894L → 3,794L)
- `manifold/core/MidiSupport.h` (new, 281L)
- `manifold/headless/BehaviorCoreMidiContractHarness.cpp` (new, 286L)
- `tests/fixtures/core_midi_golden.json` (3.1K)

**Date:** 2026-05-03

**What was done:** Added a dedicated deterministic MIDI contract harness, then extracted the processor's MIDI helper logic into a header-only support layer without changing `BehaviorCoreProcessor`'s ownership model. The processor still owns the legacy hardware-device members and rings; the refactor only moved mechanical helper logic out of the god file.

**Harness:** `BehaviorCoreMidiContractHarness --write-contract/--verify-contract` creates a real `BehaviorCoreProcessor`, injects deterministic MIDI input (`note on`, `CC`, `pitch bend`, `program change`, `note off`), captures `MidiManager` channel/voice state, drains the input ring, emits outgoing MIDI through the public `sendMidi*` API, drains output, and diffs against `tests/fixtures/core_midi_golden.json`.

**What was extracted to `MidiSupport.h`:**
- MIDI device enumeration helpers
- Open/close helpers for the processor-owned hardware device handles
- Hardware callback → ring-buffer enqueue logic
- `sendMidiMessage` / `sendMidiNoteOn` / `sendMidiNoteOff` / `sendMidiCC` / `sendMidiPitchBend` / `sendMidiProgramChange` helper logic
- `processMidiInput()` + `drainMidiOutput()` helper logic
- Processor MIDI contract serialization helper used by `exportStateContract()`

**Contract:** New `manifold_core_midi_contract` test passes. Existing `manifold_core_state_contract` was expanded (MIDI manager nested state) and refreshed. Full `ctest -R manifold -E manifold_standalone_direct_profile_sanity --output-on-failure` remains green (9/9).

**Key lesson:** The MIDI concern has two different risk classes: pure helper logic and real hardware device routing. The helper slice can be extracted safely under a synthetic contract harness. Device ownership/routing should not be moved until a hardware-path guard exists.

### 3.4. avsamplerDOCKING God Object Decomposition

**Target:** `UserScripts/projects/avsamplerDOCKING/ui/behaviors/main.lua` (4,457L → 852L)

**What was done:** Split a single-file god object with 197 `local` declarations (hitting Lua's 200-local limit, forcing 38 functions to be globals) into 14 focused modules in `core/` directory.

**Modules created:** `util.lua`, `constants.lua`, `state.lua`, `sources.lua`, `midi.lua`, `ml.lua`, `mapping.lua`, `shaders.lua`, `sampler.lua`, `grid.lua`, `compositor.lua`, `layout.lua`, `embeds.lua`, `params.lua`, `initflow.lua`, `testhooks.lua`, `profiler.lua`, `runtime.lua`

**Contract:** `__avsdExportContract()` captured full project state as JSON. Side-by-side migration in `avsamplerDOCKING_Migration` project. Merged when contract diff was empty.

**Net change:** `main.lua` 4,457L → 852L. 38 globals eliminated. Average module size ~200-400 lines.

**Key lesson:** The test harness must be written before the first extraction. Contract testing caught subtle state drift that visual inspection would have missed.

### 3.5. C++ Binding God Functions Decomposition

**Target files:**
- `LuaControlBindings.cpp` (4,054L → 32L)
- `LuaUIBindings.cpp` (1,727L → 83L)
- `LuaMidiBindings.cpp` (re-scoped to namespace)
- `LuaEngine.cpp` (partial — DSP wrappers + path resolver extracted, 2,676L → 2,364L)

**What was done:** 9 static methods from `LuaControlBindings.cpp` moved to individual files. 4 methods from `LuaUIBindings.cpp` moved to individual files. DSP primitive wrappers and file resolution helpers extracted from `LuaEngine.cpp`.

**Files created (23 new .cpp/.h pairs):**
- `LuaCommandBindings`, `LuaWaveformBindings`, `LuaGraphBindings`, `LuaOSCBindings`, `LuaEventBindings`, `LuaLinkBindings`, `LuaDspBindings`, `LuaUtilityBindings`, `LuaImGuiBindings` (from `LuaControlBindings.cpp`)
- `LuaCanvasBindings`, `LuaGraphicsBindings`, `LuaOpenGLBindings`, `LuaUIConstantsBindings` (from `LuaUIBindings.cpp`)
- `LuaUIBindingHelpers`, `LuaWaveformHelpers`, `LuaUtilityHelpers`, `LuaPrimitiveWrapperHelpers` (shared helpers)
- `LuaDspPrimitiveBindings`, `ScriptPathResolver` (from `LuaEngine.cpp`)
- `LuaMidiBindings.h` (re-scoped from `LuaControlBindings::` to `lua_bindings::`)

**Contract (Phase 0):** Two harnesses built:
1. `LuaEngineMockHarness --write-contract/--verify-contract` — dumps full sol2 Lua registry to `tests/fixtures/lua_bindings_golden.json` (426K)
2. `tests/e2e_oscquery_contract_test.py` — dumps OSCQuery endpoint tree to `tests/fixtures/dsphost_oscquery_golden.json` (29K)

**Stream C (DSPHostParamRegistry):** Inline lambdas extracted to named `handleParamRegister()` and `handleParamBind()` functions. Both contract tests pass before and after.

**Net change:** `LuaControlBindings.cpp` 4,054L → 32L. `LuaUIBindings.cpp` 1,727L → 83L. Overall codebase grew slightly (+54 files, +3,621 lines) due to declaration overhead in new files.

### 3.3. What Was Attempted and Reverted

**`parameter_binder.lua` table-driven refactor (Stream L):**
- Attempted: Collapse 120 boilerplate path functions into a `PATH_TEMPLATES` data table + generator
- Failure: Closure-capture bug in the generator caused SIGSEGV on project load
- Action: Reverted. Snapshot fixture (`tests/fixtures/parameter_binder_path_snapshot.txt`) and tool (`tools/snapshot_parameter_binder_paths.lua`) remain in place
- Lesson: The data model must carry explicit path segments rather than deriving them from function names. Returning requires a different approach.

### 3.4. BehaviorCoreProcessor Link Support Extraction

**Target:** `manifold/core/BehaviorCoreProcessor.cpp` (3,794L → 3,795L + `manifold/core/LinkSupport.h` (73L))

**Date:** 2026-05-03

**What was done:** Extracted all 14 Ableton Link delegate methods from `BehaviorCoreProcessor` into a header-only support layer without changing processor ownership. Every Link method was a one-liner delegation to `linkSync` — the safest extraction in the codebase.

**File created:** `manifold/core/LinkSupport.h` containing `isLinkEnabled`, `setLinkEnabled`, `isLinkTempoSyncEnabled`, `setLinkTempoSyncEnabled`, `isLinkStartStopSyncEnabled`, `setLinkStartStopSyncEnabled`, `getLinkNumPeers`, `isLinkPlaying`, `getLinkBeat`, `getLinkPhase`, `requestLinkTempo`, `requestLinkStart`, `requestLinkStop`, `processLinkPendingRequests`.

**Net change:** 12 method bodies replaced with delegation calls to `manifold::link_support::*`. File line count effectively unchanged (+1 for the include). Behavior preserved through existing `manifold_core_state_contract` (exports every Link field) and the full 9-test suite.

**Contract:** Existing `manifold_core_state_contract` covers every Link field (`/link/enabled`, `/link/tempoSync`, `/link/startStopSync`, `/link/peers`, `/link/playing`, `/link/beat`, `/link/phase`). Contract diff is empty before and after extraction. Full `ctest -R manifold -E manifold_standalone_direct_profile_sanity` remains green (9/9).

**Key lesson:** This was the cleanest extraction in the codebase. Every method was a one-liner delegation. The state contract provides complete coverage. Zero risk.

---

## 4. What Deeper Patterns Emerged

### 4.1. Binding Registration Pattern (C++)

The core problem in 8 C++ files was not that the code was wrong — it was that sol2's `registerBindings` lambda pattern provides no composition mechanism. Every new binding had to be added to an ever-growing lambda. The fix was to build the composition mechanism: per-domain free functions in per-domain files, called from a dispatch point.

**This pattern applies anywhere sol2 bindings are registered.** The DSPHost files (`DSPHostBindingsCore/Fx/Synth.cpp`) still have the same problem at the function level — each file is one 700-1100 line function. They weren't touched because the gain from further splitting (per-usertype files or data-driven registration) was marginal relative to work.

### 4.2. Data Masquerading as Code (Historical)

`VideoSynthPrimitive.cpp` formerly contained 942 lines of GLSL shader source code as C++ string literals — data living in code because there was no mechanism to load shader files at runtime. 

**This file has been deleted.** It was dead code (never compiled into any target). The live shader system (`ShaderEffectRegistry` in `manifold/primitives/shaders/`) already loads shaders from `manifold/shaders/*.json` + `*.glsl` files at runtime, using `MANIFOLD_SOURCE_DIR` for path resolution. The live system supports both builtin effects (loaded at startup) and runtime effects (loaded from `UserScripts/shaders/`).

The cross-cutting pattern still applies: wherever data (parameter spec tables, usertype descriptors) is embedded in C++ as `lua.new_usertype<>()` calls, refactoring is expensive because every change touches the C++ build.

### 4.3. The Big Switch (Historical)

`ControlServer::processCommand` was a 233-line command handler wall (the earlier 915-line estimate was stale). This has now been refactored into extracted handlers plus a dispatch table. The underlying lesson still stands: inline command walls grow badly, and a registration/dispatch mechanism is the right composition point for IPC command handling.

### 4.4. Mixed Concern Engine Files

`BehaviorCoreProcessor.cpp` (4,337L, 10 concern categories) and `BehaviorCoreEditor.cpp` (2,603L, 8 concern categories) have well-factored internals (avg 21L and 41L per function respectively) but carry an enormous breadth of responsibilities. These are the next structural debt frontier, but splitting them is higher-risk than the binding work because they are the engine heart.

---

## 5. Remaining C++ Structural Debt (Priority Order)

| Priority | Target | Current Size | Pattern | Complexity | Harness Needed | Status |
|----------|--------|-------------|---------|------------|----------------|--------|
| ~~1~~ | ~~`ControlServer::processCommand`~~ | ~~915L~~ | ~~Switch → dispatch table~~ | ~~Low~~ | ~~IPC command coverage~~ | ✅ **Complete** (233L real, 17 handlers extracted) |
| ~~2~~ | ~~`VideoSynthPrimitive::shaderDefinitions`~~ | ~~942L~~ | ~~Data in code → shader files~~ | ~~Low~~ | ~~Shader compile test~~ | 🗑️ **Deleted** (dead code, live system already file-based) |
| 3 | `DSPHostBindingsCore/Fx/Synth` | ~2,800L total | Per-file god functions → data-driven | Medium | Existing oscquery contract | Pending |
| 4 | `ImGuiDirectHost.cpp` | 2,553L, 6 concerns | Mixed concerns → extract shader/GPU/video | Medium | Frame capture comparison | Pending |
| 5 | `BehaviorCoreProcessor/Editor` | 6,398L combined + 1,094L support headers | Engine/editor mixed concerns | High | State projection + MIDI + Link contracts | ⚙️ Partial — Phases 5a + 5b + 5d support slices complete |

### ~~5.1. Priority 1: `ControlServer::processCommand` — Dispatch Table~~ ✅ COMPLETE

**Date:** 2026-05-02
**Location:** `manifold/primitives/control/ControlServer.cpp:532`
**Actual size:** 233 lines (not 915 — playbook estimate was stale)

**What was done:** Extracted 17 command handlers into named private member functions. Replaced prefix checks + switch with a dispatch map (`std::unordered_map<ParseResult::Kind, std::function>`) populated once on first call via static IIFE.

**Before:** 233L of inline prefix checks + switch on `ParseResult::Kind` + inline handler code. Adding a new command meant adding a new `case` block.

**After:** `processCommand` is ~35L of orchestration. Each handler is a standalone named function. New commands require writing one handler function and adding one line to the dispatch map.

**Contract:** All 9 CTest tests pass unchanged: `manifold_headless_ipc_core` (15 IPC round-trip tests), `manifold_core_sniff` (19 smoke tests), `manifold_core_state_contract`, `manifold_headless_oscquery_contract`.

**Harness delivered:** The existing IPC test suite now serves as regression guard for the dispatch table. No new harness was needed.

### ~~5.2. Priority 2: `VideoSynthPrimitive::shaderDefinitions` — Separate Shader Files~~ 🗑️ DELETED

**Date:** 2026-05-02
**Location:** `manifold/primitives/video/VideoSynthPrimitive.cpp` (now deleted)
**Actual size:** 1,141 lines (not 942 — playbook estimate was low)

**What was found:** The entire `VideoSynthPrimitive` class was dead code — not included in any CMake `target_sources()`, not referenced by any `.cpp`, `.h`, or `.lua` file in the codebase. The live shader system (`ShaderEffectRegistry` in `manifold/primitives/shaders/`) already loads shaders from `manifold/shaders/*.json` + `*.glsl` files at runtime via `MANIFOLD_SOURCE_DIR`. 18 effects are already shipped as paired `.json`/`.glsl` files.

**Action:** Both `VideoSynthPrimitive.cpp` and `.h` deleted. 1,141 lines removed. All targets build clean, all 9 tests pass.

**Lesson:** The codebase profile (`tools/profiling/`) counts source files regardless of whether they're compiled. Always cross-reference against `CMakeLists.txt` `target_sources` when identifying refactoring targets.

### 5.3. Priority 3: DSPHost Binding Files — Data-Driven Usertype Registration

**Files:** `DSPHostBindingsCore.cpp` (1,015L), `DSPHostBindingsFx.cpp` (1,139L), `DSPHostBindingsSynth.cpp` (706L)

**Current pattern:** Each file is one function that registers ~10-15 usertypes via individual `lua.new_usertype<FooNode>(...)` calls. ~30 lines per usertype for method + property registration.

**Target pattern:** A table of usertype descriptors:

```cpp
struct UsertypeDef {
    const char* name;
    std::function<void(sol::state&)> registerer;
};

static const UsertypeDef kFxUsertypes[] = {
    {"ReverbNode", [](sol::state& lua) {
        lua.new_usertype<ReverbNode>("ReverbNode",
            sol::constructors<std::shared_ptr<ReverbNode>()>(),
            "setRoomSize", &ReverbNode::setRoomSize,
            // ...
        );
    }},
    // ...
};
```

**Risk:** Medium. Each usertype's method set must survive translation exactly. The existing oscquery contract test covers the effects of registration but not the registration itself — a new harness that captures the set of registered usertypes and their methods would be needed.

**Note:** Deferred from the binding work because the gain is marginal — the files are already at per-domain granularity. Worth doing if build times become a concern (each file instantiates sol2 templates for all its usertypes).

### 5.4. Priority 4: `ImGuiDirectHost.cpp` — Mixed Concern Extraction

**Location:** `manifold/ui/imgui/ImGuiDirectHost.cpp`
**Size:** 2,553 lines, 96 functions, 6 concern categories

**Current pattern:** One class handling shader surface compilation, ImGui tree rendering, GPU memory tracking, video surface management, display list rendering, and input handling.

**Target pattern:** Extract shader surface compilation to `ShaderSurfaceManager.cpp`, GPU memory tracking to `GpuMemoryTracker.cpp`. `ImGuiDirectHost` stays as the orchestrator.

**Risk:** Medium. Requires understanding the lifecycle dependencies between shader surfaces, video surfaces, and ImGui contexts.

### 5.5. Priority 5: `BehaviorCoreProcessor` / `BehaviorCoreEditor` Splitting

**Files:** `BehaviorCoreProcessor.cpp` (4,337L → 3,794L), `BehaviorCoreEditor.cpp` (2,603L), new `manifold/core/ExportPluginConfigSupport.h` (740L), new `manifold/core/MidiSupport.h` (281L)

**Current pattern:** Engine and editor with 10 and 8 concern categories respectively. Well-factored internally (avg 21L and 41L per function) but carrying everything: lifecycle, export plugin config, graph management, MIDI, OSC, profiling, serialization, host params, memory snapshots.

**Progress (2026-05-03):** **Phase 5a complete + Phase 5b support slice complete** — export plugin config and MIDI helper logic have both been extracted into support layers without changing `BehaviorCoreProcessor` ownership.

**What was extracted to `ExportPluginConfigSupport.h`:**
- Export config data model: `ExportParamAlias`, `ExportPluginConfig`
- Manifest parsing + config resolution
- Alias/path lookup helpers
- Host parameter setup, binding, sync, change propagation, snapshot replay
- Export UI default-state computation
- Basic `/plugin/ui/*` path read/apply logic
- OSC runtime settings + port-pair selection
- Export UI endpoint spec table (data-driven replacement for the handwritten registration wall)
- Export plugin contract serialization helper
- One-shot memory snapshot helper logic for export-related baselines/deltas

**What remains in `BehaviorCoreProcessor`:**
- Export state ownership (`hostParams_`, atomics, config instance)
- MIDI state ownership (`midiInputDevice`, `midiOutputDevice`, rings, `midiThruEnabled`, `midiManager_`)
- Actual server / registry side effects (`oscServer`, `oscQueryServer`, endpoint registry mutation)
- Trivial public getters / setters
- Higher-level processor orchestration

**Contract:** `BehaviorCoreProjectionHarness` + `manifold_core_state_contract` remain green after the export + MIDI support extractions, and the new `BehaviorCoreMidiContractHarness` adds a dedicated deterministic guard for MIDI manager state, input-ring contents, and outgoing MIDI event encoding. `manifold_headless_ipc_core`, `manifold_headless_oscquery_contract`, `manifold_core_sniff`, and the full `ctest -R manifold -E manifold_standalone_direct_profile_sanity --output-on-failure` suite all pass after the extraction.

**Target pattern:** Continue with the same approach for later slices — keep ownership in `BehaviorCoreProcessor` until a seam is proven, then extract orchestration or state holders only when the contract harness says it is safe. Candidate next slices remain graph management and editor host management. MIDI device ownership/routing is still deferred until a hardware-path contract exists.

**Link extraction complete (2026-05-03):** 14 Link methods extracted to `LinkSupport.h`. Cleanest extraction in the codebase — every method was a one-liner delegation. State contract provides complete coverage.

**State serialization extraction complete (2026-05-03):** Extracted all IStateSerializer helpers + method bodies (except `getStateInformation`/`setStateInformation`) to `StateSerializationSupport.h` (~700L). Registered `StateProjectionHarness.cpp` as CTest `manifold_state_projection` (695 checks, passes). Full suite remains green (10/10).

**Risk:** Still high at the whole-class level, but the export plugin config slice and the MIDI helper slice have now been de-risked under contract.

---

## 6. Tools for the Next Refactor

### 6.1. Profiling Tools (`tools/profiling/`)

| Tool | Purpose |
|------|---------|
| `codebase_profile.py` | Full LOC audit, file tree, top-N, file types, snapshot/diff |
| `function_profiler.py` | C++/Lua function extraction, size distribution, coverage |
| `bloat_detector.py` | Mixed concern detection, god function finder |

Usage: `python3 tools/profiling/codebase_profile.py --snapshot` before refactoring, `--diff <snapshot>` after to see exactly what changed.

### 6.2. Snapshot System

Snapshots are JSON files saved to `tools/profiling/snapshot_*.json`. The `--diff` mode compares file counts and sizes between two snapshots:

```
python3 tools/profiling/codebase_profile.py --diff tools/profiling/snapshot_20260430_223206.json
```

This catches unintended file growth, new god files, and removed files.

### 6.3. Contract Tests

Two contract test patterns are established:

**C++ harness contract:**
```cpp
LuaEngineMockHarness --write-contract golden.json   # baseline
LuaEngineMockHarness --verify-contract golden.json   # verify
```

**Python e2e contract:**
```python
python3 tests/e2e_oscquery_contract_test.py \
    --headless build-dev/ManifoldHeadless \
    --verify-golden tests/fixtures/dsphost_oscquery_golden.json
```

---

## 7. How to Pick Up Refactoring Work

### Entry Point for New Agents

1. **Read the worksheet** for the specific refactoring target (e.g., `agent-docs/260501_binding_god_functions_decomposition_worksheet.md`)
2. **Check the current codebase profile** — run `tools/profiling/codebase_profile.py` to see current state
3. **Run the existing test suite** — `ctest -R manifold` to establish baseline pass rate
4. **Build the harness first** — Phase 0 is non-negotiable. No extraction before the contract exists.
5. **Extract mechanically** — move code, don't change it. Side-by-side migration.
6. **Verify contract** — harness diff must be empty
7. **Run full test suite** — CTest + standalone smoke

### What NOT to Do

- Don't skip the harness phase
- Don't "clean up while you're in there" — mechanical extraction only
- Don't refactor what's marked as throwaway (Bapp* projects)
- Don't try to refactor `BehaviorCoreProcessor` or `BehaviorCoreEditor` without explicit authorization — highest risk in the codebase

### Deferred Targets (Not Worth Doing)

| Target | Reason |
|--------|--------|
| `LuaRuntimeNodeBindings.cpp` (756L) | Single coherent concern, not a god file |
| `DSPHostLoopLayerBundle.cpp` (394L) | Small, single concern |
| `LuaEngine.cpp` main `Impl` (2,000L) | Coherent runtime class, invasive surgery |
| `parameter_binder.lua` (1,682L) | Attempted and reverted — different data model needed |

---

## 8. Change Log

| Date | Change |
|------|--------|
| 2026-05-03 | Completed Phase 5b support slice of Priority 5: added `BehaviorCoreMidiContractHarness` + `core_midi_golden.json`, extracted MIDI helper logic to `manifold/core/MidiSupport.h`, reduced `BehaviorCoreProcessor.cpp` from 3,894L to 3,794L, expanded the core-state MIDI subcontract, and kept the full non-standalone manifold suite green (9/9).
| 2026-05-03 | Completed Phase 5d support slice of Priority 5: extracted 14 Ableton Link delegate methods from `BehaviorCoreProcessor` into `manifold/core/LinkSupport.h`. Safest extraction in the codebase — every method was a one-liner delegation. State contract provides complete coverage. Full suite remains green (9/9). |
| 2026-05-02 | Completed Phase 5a of Priority 5: `BehaviorCoreProcessor` export plugin config support extraction. Added `ExportPluginConfigSupport.h`, reduced `BehaviorCoreProcessor.cpp` from 4,337L to 3,894L, replaced handwritten export endpoint wall with extracted spec table, and kept all contract / IPC / OSCQuery / manifold regression tests green. |
| 2026-05-02 | Initial document. Compiled from codebase profile v2, binding decomposition worksheet v3, avsampler decomposition plan, and manual source reading. |
| 2026-05-02 | **Phase 1 complete:** `ControlServer::processCommand` dispatch table extraction. 17 handlers extracted, 233L → ~35L orchestration. All 9 tests pass. |
| 2026-05-02 | **Phase 2 resolved:** `VideoSynthPrimitive.cpp` was dead code (never compiled). Live shader system already loads from `manifold/shaders/*.json`/`*.glsl` at runtime. Deleted both `.cpp` and `.h` (1,141L removed). All targets build clean. |
