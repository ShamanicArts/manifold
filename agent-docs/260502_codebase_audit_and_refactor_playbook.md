# Codebase Audit & Refactor Playbook

**Date:** 2026-05-02
**Status:** Living reference — updated as refactoring work completes
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

### 3.1. avsamplerDOCKING God Object Decomposition

**Target:** `UserScripts/projects/avsamplerDOCKING/ui/behaviors/main.lua` (4,457L → 852L)

**What was done:** Split a single-file god object with 197 `local` declarations (hitting Lua's 200-local limit, forcing 38 functions to be globals) into 14 focused modules in `core/` directory.

**Modules created:** `util.lua`, `constants.lua`, `state.lua`, `sources.lua`, `midi.lua`, `ml.lua`, `mapping.lua`, `shaders.lua`, `sampler.lua`, `grid.lua`, `compositor.lua`, `layout.lua`, `embeds.lua`, `params.lua`, `initflow.lua`, `testhooks.lua`, `profiler.lua`, `runtime.lua`

**Contract:** `__avsdExportContract()` captured full project state as JSON. Side-by-side migration in `avsamplerDOCKING_Migration` project. Merged when contract diff was empty.

**Net change:** `main.lua` 4,457L → 852L. 38 globals eliminated. Average module size ~200-400 lines.

**Key lesson:** The test harness must be written before the first extraction. Contract testing caught subtle state drift that visual inspection would have missed.

### 3.2. C++ Binding God Functions Decomposition

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

---

## 4. What Deeper Patterns Emerged

### 4.1. Binding Registration Pattern (C++)

The core problem in 8 C++ files was not that the code was wrong — it was that sol2's `registerBindings` lambda pattern provides no composition mechanism. Every new binding had to be added to an ever-growing lambda. The fix was to build the composition mechanism: per-domain free functions in per-domain files, called from a dispatch point.

**This pattern applies anywhere sol2 bindings are registered.** The DSPHost files (`DSPHostBindingsCore/Fx/Synth.cpp`) still have the same problem at the function level — each file is one 700-1100 line function. They weren't touched because the gain from further splitting (per-usertype files or data-driven registration) was marginal relative to work.

### 4.2. Data Masquerading as Code

`VideoSynthPrimitive.cpp` contains 942 lines of GLSL shader source code as C++ string literals. This is data living in code because there was no mechanism to load shader files at runtime. Every time a shader changes, it forces a recompile of the entire video synth primitive.

This is a cross-cutting pattern: wherever data (shaders, parameter spec tables, usertype descriptors) is embedded in C++ as string literals or `lua.new_usertype<>()` calls, refactoring is expensive because every change touches the C++ build.

### 4.3. The Big Switch

`ControlServer::processCommand` is a 915-line switch statement handling ~50 command types. Every new IPC command adds another `case` branch. A dispatch table (map command name → handler function) would make adding commands a one-line registration instead of a new `case` block.

### 4.4. Mixed Concern Engine Files

`BehaviorCoreProcessor.cpp` (4,337L, 10 concern categories) and `BehaviorCoreEditor.cpp` (2,603L, 8 concern categories) have well-factored internals (avg 21L and 41L per function respectively) but carry an enormous breadth of responsibilities. These are the next structural debt frontier, but splitting them is higher-risk than the binding work because they are the engine heart.

---

## 5. Remaining C++ Structural Debt (Priority Order)

| Priority | Target | Current Size | Pattern | Complexity | Harness Needed |
|----------|--------|-------------|---------|------------|----------------|
| 1 | `ControlServer::processCommand` | 915L switch | Big switch → dispatch table | Low | IPC command coverage |
| 2 | `VideoSynthPrimitive::shaderDefinitions` | 942L string literals | Data in code → shader files | Low | Shader load + compile test |
| 3 | `DSPHostBindingsCore/Fx/Synth` | ~2,800L total | Per-file god functions → data-driven | Medium | Existing oscquery contract |
| 4 | `ImGuiDirectHost.cpp` | 2,553L, 6 concerns | Mixed concerns → extract shader/GPU/video | Medium | Frame capture comparison |
| 5 | `BehaviorCoreProcessor/Editor` | 6,940L combined | Engine/editor mixed concerns | High | State projection contract |

### 5.1. Priority 1: `ControlServer::processCommand` — Dispatch Table

**Location:** `manifold/primitives/control/ControlServer.cpp:532`
**Size:** 915 lines, one function

**Current pattern:** A `if/else if` chain parsing a command string and dispatching to inline handlers. Every command type adds another branch.

**Target pattern:** A `std::map<std::string, CommandHandler>` populated at startup. Each command is a standalone handler function. `processCommand` does `auto it = handlers.find(cmdType); if (it != handlers.end()) it->second(args);`.

**Risk:** Low. Each handler is already a distinct code block within the switch. Extraction is mechanical.

**Harness needed:** Iterate all command types via IPC, capture response schema + state mutations. An iterative test that sends every command and validates response format would also serve as a completeness check (catches undocumented commands).

### 5.2. Priority 2: `VideoSynthPrimitive::shaderDefinitions` — Separate Shader Files

**Location:** `manifold/primitives/video/VideoSynthPrimitive.cpp:54`
**Size:** 942 lines of GLSL string literals

**Current pattern:** ~15 video effects defined as concatenated vertex+fragment shader strings. One massive `const char*` array at file scope.

**Target pattern:** Each shader pair in its own `.glsl` or `.vert`/`.frag` file, loaded at runtime by `VideoSynthPrimitive`. The C++ file contains loading logic, not shader source.

**Risk:** Low. Requires a shader load mechanism and a directory to store shader files. Loading could be done once at init and cached.

**Harness needed:** Load a shader, compile it, verify it produces expected output for known input. The existing `ShaderSurfaceProvider` already does compilation — this is testing the load path, not the compile.

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

**Files:** `BehaviorCoreProcessor.cpp` (4,337L), `BehaviorCoreEditor.cpp` (2,603L)

**Current pattern:** Engine and editor with 10 and 8 concern categories respectively. Well-factored internally (avg 21L and 41L per function) but carrying everything: lifecycle, export plugin config, graph management, MIDI, OSC, profiling, serialization, host params, memory snapshots.

**Target pattern:** Extract export plugin config to `ExportPluginConfig.cpp`, graph management to `BehaviorCoreGraphManager.cpp`, memory profiling to `ProfilingUtils.cpp`.

**Risk:** High. These are the most-coupled classes in the codebase. Every other system reaches into them. Splitting requires understanding all dependencies. Not recommended until lower-priority targets are cleared.

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
| 2026-05-02 | Initial document. Compiled from codebase profile v2, binding decomposition worksheet v3, avsampler decomposition plan, and manual source reading. |
