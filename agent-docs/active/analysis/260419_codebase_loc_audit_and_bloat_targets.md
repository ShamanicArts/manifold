# Manifold Codebase LOC Audit & Bloat Targets

## Status

**Status:** Analysis / cleanup worksheet  
**Date:** 2026-04-19  
**Audience:** Anyone doing structural cleanup, splitting god objects, or assessing where to invest refactoring effort  
**Scope:** Runtime code only (`manifold/`, `dsp/`, `UserScripts/`, `web/`). Excludes `agent-docs/`, `prototypes/`, `tests/`, `test_plugins/`, `GrainFreeze_Prototype/`, `dsp_simd_test/`, `build/`, `external/`, lockfiles, caches.  

---

## 1. Total Project Size

### Real Runtime Code

| Area | LOC | % |
|------|-----:|---|
| `UserScripts/` | 74,471 | 43% |
| `manifold/` | 73,605 | 43% |
| `dsp/` | 19,444 | 11% |
| `web/` | 5,302 | 3% |
| **Total** | **172,822** | **100%** |

### By Language

| Lang | LOC |
|------|-----:|
| Lua | 96,788 |
| C++ | 50,938 |
| C headers | 17,253 |
| TypeScript | 3,771 |
| JSON | 1,555 |
| CSS | 1,290 |

---

## 2. UserScripts/ Breakdown

### By Project

| Project | LOC | Notes |
|---------|-----:|-------|
| `Main/` | 56,977 | Primary product — MidiSynth + looper + rack |
| `RackModuleHost/` | 3,887 | Standalone rack module host |
| `ExperimentalUI/` | 4,051 | Experimental UI explorations |
| `DspLiveScripting/` | 2,942 | Live DSP scripting playground |
| `Standalone_Eq/` | 1,470 | Standalone EQ plugin |
| `WebcamViewer/` | 1,170 | Video input plugin |
| `Standalone_Filter/` | 874 | Standalone filter plugin |
| `Standalone_Sample/` | 573 | Standalone sampler plugin |
| *(12 more standalone plugins)* | ~3,424 | Arp, FX, NoteFilter, ScaleQuantizer, Transpose, VelocityMapper, LayoutModeDemo, RuntimeBenchmark |

**All UserScripts projects are runtime-loaded standalone plugins** (including VST exports). They are **not** statically `require()`'d by `manifold/` or `Main/` — they are discovered via `SystemPaths::getUserScriptsProjectsDir()` and loaded dynamically. **None are dead weight.**

### Main/ Project Breakdown

| Area | LOC |
|------|-----:|
| `ui/behaviors/` | 32,087 |
| `lib/` | 21,492 |
| `dsp/` | 3,307 |
| `editor/` | 69 |
| `themes/` | 9 |

---

## 3. Manifold/ Breakdown

| Subsystem | LOC |
|-----------|-----:|
| `ui/` | 30,014 |
| `primitives/` | 29,291 |
| `core/` | 7,294 |
| `dsp/` | 2,534 |
| `SystemScripts/` | 1,823 |
| `headless/` | 1,498 |
| `grpc/` | 854 |

### Primitives/ Breakdown

| Area | LOC |
|------|-----:|
| `scripting/` | 17,717 |
| `control/` | 5,634 |
| `ui/` | 2,144 |
| `video/` | 1,901 |
| `midi/` | 1,124 |
| `dsp/` | 447 |
| `core/` | 426 |

### UI/ Breakdown

| Area | LOC |
|------|-----:|
| `shell/` | 9,404 |
| `imgui/` | 9,043 |
| `widgets/` | 6,485 |

---

## 4. Top 20 Largest Single Files (Real Code)

| LOC | File |
|-----:|------|
| 4,303 | `manifold/core/BehaviorCoreProcessor.cpp` |
| 4,239 | `manifold/ui/shell/methods_core.lua` |
| 3,529 | `web/remote-control/app.ts` |
| 3,175 | `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua` |
| 3,006 | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` |
| 2,757 | `UserScripts/projects/Main/dsp/midisynth_integration.lua` |
| 2,676 | `manifold/primitives/scripting/LuaEngine.cpp` |
| 2,564 | `manifold/ui/imgui/ImGuiDirectHost.cpp` |
| 2,414 | `manifold/core/BehaviorCoreEditor.cpp` |
| 2,404 | `manifold/ui/shell/bindings.lua` |
| 2,375 | `UserScripts/projects/RackModuleHost/ui/behaviors/main.lua` |
| 2,219 | `UserScripts/projects/DspLiveScripting/ui/behaviors/main.lua` |
| 2,166 | `UserScripts/projects/Main/ui/behaviors/source_panel.lua` |
| 1,971 | `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` |
| 1,920 | `manifold/ui/project_loader.lua` |
| 1,871 | `UserScripts/projects/ExperimentalUI/ui/legacy/experimental_legacy.lua` |
| 1,753 | `dsp_simd_test/TestNodesApp/main.cpp` |
| 1,720 | `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` *(note: 749 LuaRuntimeNodeBindings + 1720 LuaUIBindings)* |
| 1,682 | `UserScripts/projects/Main/lib/parameter_binder.lua` |
| 1,589 | `UserScripts/projects/Main/ui/behaviors/rack_layout_engine.lua` |

---

## 5. Bloat & Mixed Concern Targets

### Tier 1: Architectural Debt

---

#### 5.1 `LuaControlBindings.cpp` — 3,006 lines, 8 concerns in one file

**Location:** `manifold/primitives/scripting/bindings/LuaControlBindings.cpp`

| Section | Lines | What it does |
|---------|-------|--------------|
| `registerWaveformBindings` | 638 | Waveform peaks, sample analysis, partials, test tones |
| `registerUtilityBindings` | 621 | File I/O, settings, **ImGui menu API**, clipboard, debug, **video** |
| `registerGraphBindings` | 359 | DSP graph construction |
| `registerOSCBindings` | 297 | OSC query, endpoint management |
| `registerCommandBindings` | 138 | Command parsing |
| `registerDspBindings` | 100 | DSP primitive constructors |
| `registerEventBindings` | 67 | Event system |
| `registerLinkBindings` | 85 | Ableton Link |

**Problem:** Binding kitchen sink. Waveform analysis, graph construction, OSC, and ImGui menu bar API all live together.

**Fix:** Split into per-domain files:
- `LuaWaveformBindings.cpp`
- `LuaGraphBindings.cpp`
- `LuaOSCBindings.cpp`
- `LuaImGuiBindings.cpp`
- `LuaUtilityBindings.cpp`
- `LuaEventBindings.cpp`
- `LuaLinkBindings.cpp`
- `LuaDspBindings.cpp`

---

#### 5.2 `midisynth_integration.lua` — 2,757 lines, ONE function with 64 nested locals

**Location:** `UserScripts/projects/Main/dsp/midisynth_integration.lua`

`M.buildSynth(ctx, options)` contains everything:

| Concern | Evidence |
|---------|----------|
| DSP graph building | `Node.new`, `connect`, `setGain` (lines ~53-300) |
| Rack audio routing | `rack`, `stage`, `source`, `sequence` (lines ~300-660) |
| Sample analysis / partials | `partial`, `sample`, `analysis`, `peaks`, `temporal` (lines ~660-1100) |
| Additive synthesis | `additive`, `driven`, `waveform`, `morph` (lines ~1100-1600) |
| Voice management | `voice`, `gate`, `frequency`, `amplitude` (lines ~1600-2200) |
| Schema/parameters | `schema`, `param`, `path`, `bind` (lines ~2200-2700) |

**Problem:** A single function doing graph construction, sample FFT analysis, additive partial morphing, and voice dispatch.

**Fix:** Split into modules:
- `graph_builder.lua`
- `sample_analyzer.lua`
- `additive_engine.lua`
- `voice_manager.lua`
- `rack_router.lua`

---

#### 5.3 `BehaviorCoreProcessor.cpp` — 4,303 lines, profiler + graph engine + DSP callback

**Location:** `manifold/core/BehaviorCoreProcessor.cpp`

| Method | Lines | Notes |
|--------|-------|-------|
| `registerExportPluginEndpoints` | 404 | Endpoint registration bloat |
| `parameterChanged` | 430 | Massive parameter dispatch |
| Graph mutation + control + serialization | ~2,300 | `requestGraphRuntimeSwap` onward |
| `processBlock` | 330 | DSP callback — fine |
| Memory profiling | 49 | Linux-specific `smaps_rollup` + `mallinfo2` |

**Problem:** 49 lines of Linux-only memory profiling embedded in the core processor. Graph mutation, control commands, and serialization are ~2,300 lines of mixed runtime logic.

**Fix:**
- Move memory profiling to `ProfilingUtils.cpp`
- Extract graph mutation/control logic to `BehaviorCoreGraphManager.cpp` or similar

---

### Tier 2: Files Doing Too Much

---

#### 5.4 `methods_core.lua` — 4,239 lines, 211 functions (shell god object)

**Location:** `manifold/ui/shell/methods_core.lua`

Categories by keyword density:

| Concern | Hits |
|---------|------|
| Script/DSP runtime param controls | 195 |
| Surface/window management | 143 |
| Selection/hit-test/tree | 169 |
| Dev/debug/inspector | 125 |
| Console | 123 |
| Animation | 16 |

**Problem:** Console commands, dev hotkeys, script inspector data fetching, runtime param control pools, surface geometry, and selection logic all in one module.

**Fix:** Split by concern:
- `shell_console.lua` (console, dev hotkeys)
- `shell_inspector.lua` (script inspector, runtime params)
- `shell_surface.lua` (surface geometry, tool surfaces)
- `shell_selection.lua` (hit-test, selection, tree)

---

#### 5.5 `rack_midisynth_specs.lua` — 3,175 lines, 4 parallel tables

**Location:** `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`

Tables that must be kept in sync:
- `MODULE_META_DEFAULTS` (~314 lines)
- `MODULE_PARAM_REMAP_DEFAULTS`
- `MODULE_CONTROL_PORT_DEFAULTS`
- `RACK_MODULE_SPECS` (~1,102 lines)

**Problem:** Add a new rack module? Edit 4 tables. Maintenance bomb.

**Fix:** Collapse into one table per module, or generate from a single source of truth (JSON or a builder function).

---

#### 5.6 `source_panel.lua` — 2,166 lines, 67 functions

**Location:** `UserScripts/projects/Main/ui/behaviors/source_panel.lua`

| Concern | Hits |
|---------|------|
| Waveform/preview rendering | 207 |
| Additive synthesis math | 110 |
| Drive/distortion transfer functions | 53 |
| UI callbacks (mouse, draw, key) | 36 |

**Problem:** A UI behavior file containing additive synthesis partial math, driven wave weighting, temporal frame preview, and tanh/fold distortion curves.

**Fix:** Move DSP math to `lib/`:
- `lib/additive_math.lua`
- `lib/drive_curves.lua`
- `lib/partial_morph.lua`

---

#### 5.7 `ImGuiDirectHost.cpp` — 2,564 lines

**Location:** `manifold/ui/imgui/ImGuiDirectHost.cpp`

| Concern | Hits |
|---------|------|
| Shader surface compilation/rendering | 140 |
| ImGui tree rendering | 205 |
| Drag/input handling | 142 |
| GPU memory estimation | 72 |
| Video surface rendering | 41 |
| Display list rendering | 7 |

**Problem:** Shader compiler, video surface manager, GPU memory tracker, display list renderer, and input handler all in one C++ class.

**Fix:** Extract shader surface code to `ShaderSurfaceManager.cpp`.

---

#### 5.8 `LuaEngine.cpp` — 2,676 lines

**Location:** `manifold/primitives/scripting/LuaEngine.cpp`

Mixed contents:
- **DSP primitive wrappers** at top: `LoopBufferWrapper`, `PlayheadWrapper`, `CaptureBufferWrapper`, `QuantizerWrapper` (lines 45-110)
- **File resolution helpers**: `resolveCompiledSystemUiDir`, `resolveSystemUiDir`, `resolveProjectAssetRef` (lines 220-400)
- **LuaEngine::Impl**: Huge pimpl with serialization, runtime node management, script loading
- **State serialization/deserialization**

**Fix:**
- Move DSP wrappers to `bindings/LuaDspPrimitiveBindings.cpp`
- Extract file resolution to `ScriptPathResolver.cpp`

---

#### 5.9 `LuaUIBindings.cpp` — 1,720 lines

**Location:** `manifold/primitives/scripting/bindings/LuaUIBindings.cpp`

| Section | Lines |
|---------|-------|
| Canvas bindings | 536 |
| OpenGL bindings | 411 |
| Graphics bindings | 251 |
| Constants | 123 |

**Problem:** OpenGL API bindings mixed with Canvas widget bindings.

**Fix:** Extract OpenGL to `LuaOpenGLBindings.cpp`.

---

#### 5.10 `app.ts` — 3,529 lines, monolithic frontend

**Location:** `web/remote-control/app.ts`

Single file does: OSC discovery, HTTP proxy, WebSocket management, DOM rendering, drag/drop, inspector panel, device tree, parameter sidebar, custom surface editor.

**Fix:** Split into modules:
- `discovery.ts`
- `osc-client.ts`
- `renderer.ts`
- `inspector.ts`
- `drag-drop.ts`

---

### Tier 3: Duplication & Waste

---

#### 5.11 DSP Nodes: Highway vs Non-Highway Duplication

**Location:** `dsp/core/nodes/`

Every `_Highway.h` has a matching non-highway `.cpp` + `.h`:

| Node | Highway | Non-Highway | Ratio |
|------|---------|-------------|-------|
| ADSREnvelopeNode | 523 | 254 | 2.1x |
| BitCrusherNode | 581 | 235 | 2.5x |
| FilterNode | 250 | 178 | 1.4x |
| GainNode | 191 | 135 | 1.4x |
| MixerNode | 279 | 241 | 1.2x |
| OscillatorNode | 1,022 | 1,227 | 0.8x |
| WaveShaperNode | 437 | 493 | 0.9x |

**Problem:** Two parallel implementations of the same DSP nodes. ~3,283 lines of Highway + ~2,763 lines of non-Highway = ~6K lines for 7 nodes. The non-Highway OscillatorNode is *bigger* than the Highway version.

**Fix:** Use Highway as the default path and delete non-Highway implementations where Highway is smaller or comparable. OscillatorNode and WaveShaperNode non-Highway paths are larger — they might contain features Highway lacks, so audit before deleting.

---

#### 5.12 Rack Behavior + Rack Module Split

| Behavior (UI) | Lines | Functions | Module (DSP) | Lines | Functions |
|---------------|-------|-----------|--------------|-------|-----------|
| `rack_oscillator.lua` | 927 | 55 | `rack_modules/oscillator.lua` | 272 | 12 |
| `rack_sample.lua` | 882 | 63 | `rack_modules/sample.lua` | 562 | 24 |
| `rack_blend_simple.lua` | 164 | 13 | `rack_modules/blend_simple.lua` | 223 | 5 |

**Problem:** UI behavior files are 2-4x larger than the DSP modules they control. Behaviors handle parameter sync, preview rendering, modulation widget sync, and manual controls.

**Fix:** Not urgent — the behaviors are UI-heavy by nature. But some boilerplate could be genericized into a `RackModuleBehaviorBase`.

---

#### 5.13 `parameter_binder.lua` — 1,682 lines, 120 dynamic path functions

**Location:** `UserScripts/projects/Main/lib/parameter_binder.lua`

120 functions follow this pattern:
```lua
function ParameterBinder.dynamicEqBasePath(slotIndex) return ... end
function ParameterBinder.dynamicEqMixPath(slotIndex) return ... end
-- etc, 120 times
```

**Fix:** Table-driven generation. A single table of path templates could replace 120 boilerplate functions.

---

#### 5.14 `rack_layout_engine.lua` — 1,589 lines

**Location:** `UserScripts/projects/Main/ui/behaviors/rack_layout_engine.lua`

| Concern | Hits |
|---------|------|
| Layout/pagination | 231 |
| Drag/drop | 164 |
| Shell/widget bounds | 106 |

**Problem:** Layout math, pagination dot rendering, drag ghost management, and shell widget lookup all in one file.

**Fix:** Extract drag/drop system to `rack_drag_system.lua`.

---

### Tier 4: Not Bloat

---

#### 5.15 UserScripts Standalone Projects

**These are NOT bloat.** All 17 projects in `UserScripts/projects/` are runtime-loaded standalone plugins (including VST exports). They are discovered dynamically via `SystemPaths::getUserScriptsProjectsDir()` and loaded on demand. They do not need to be statically `require()`'d by `manifold/` or `Main/` to be valid.

| Count | What they are |
|-------|---------------|
| 16 | Standalone plugin projects exported as VST |
| 1 | `Main/` — the primary MidiSynth + looper + rack product |

**Do not delete or move these.** They are the product catalog.

---

## 6. Priority Ranking

| Priority | Target | Lines | Fix Complexity | Impact |
|----------|--------|-------|----------------|--------|
| 1 | Split `LuaControlBindings.cpp` into per-domain files | 3,006 | Medium | High maintainability |
| 2 | Split `midisynth_integration.lua` mega-function | 2,757 | Medium | High testability |
| 3 | Flatten `rack_midisynth_specs.lua` parallel tables | 3,175 | Low | High maintainability |
| 4 | Move `source_panel.lua` DSP math to `lib/` | 2,166 | Low | Medium |
| 5 | Split `methods_core.lua` by concern | 4,239 | High | High maintainability |
| 6 | Merge/delete non-Highway DSP node dupes | ~2,763 | Medium | LOC reduction |
| 7 | Extract ImGui API from `LuaControlBindings` | ~621 | Low | Medium |
| 8 | Extract OpenGL from `LuaUIBindings` | ~411 | Low | Medium |
| 9 | Table-drive `parameter_binder.lua` | 1,682 | Low | LOC reduction |
| 10 | Extract shader surfaces from `ImGuiDirectHost` | ~800 | Medium | Medium |
| 11 | Move memory profiling out of `BehaviorCoreProcessor` | ~49 | Low | Low |
| 12 | Split `web/remote-control/app.ts` | 3,529 | Medium | Medium |

---

## 7. Safe-to-Ignore (Not Bloat)

| Thing | Why it's fine |
|-------|---------------|
| `BehaviorCoreProcessor.cpp` at 4,303 lines | It's the engine heart. Lifecycle + DSP callback + graph management in one place is acceptable for a processor class. |
| `BehaviorCoreEditor.cpp` at 2,414 lines | Editor class handling multiple renderer modes, ImGui sync, and JUCE component lifecycle. Justified. |
| UserScripts standalone projects (~17,714 lines) | They are runtime-loaded standalone VST plugins. Product catalog, not dead code. |
| `tests/` and `test_plugins/` | Test infrastructure. Unlimited LOC is fine here. |
| `agent-docs/` (~59,584 lines) | Documentation and specs. Not shipped. |
