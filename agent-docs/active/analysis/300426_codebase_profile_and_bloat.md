# Manifold Codebase Profile & Structural Bloat — 2026-04-30

**Status:** Analysis  
**Audience:** Anyone planning refactors, splitting god objects, or assessing where cleanup pays off  
**Scope:** Runtime code only (`manifold/`, `dsp/`, `UserScripts/`, `web/`). Excludes `agent-docs/`, `prototypes/`, `tests/`, `test_plugins/`, `GrainFreeze_Prototype/`, `dsp_simd_test/`, `build/`, `build-dev/`, `external/`, `node_modules/`, `.cache/`, `.claude/`, `.pi/`, `.agents/`, lockfiles, caches.  
**Methodology:** Automated profiling via `tools/profiling/codebase_profile.py`, `function_profiler.py`, and `bloat_detector.py` — 3 Python scripts shipped alongside this report. Snapshot saved at `tools/profiling/snapshot_20260430_223206.json`.

---

## 1. Total Project Size

| Area | LOC | % | Files |
|------|-----:|---|------:|
| `UserScripts/` | 102,281 | 48% | 307 |
| `manifold/` | 83,398 | 39% | 253 |
| `dsp/` | 20,966 | 10% | 127 |
| `web/` | 5,696 | 3% | 7 |
| **Total** | **212,341** | **100%** | **694** |

### Growth Since April 19 Audit

| Metric | Apr 19 | Apr 30 | Delta |
|--------|--------|--------|-------|
| Total LOC | ~172,822 | 212,341 | **+39,519 (+23%)** |
| Lua | ~96,788 | 126,410 | +29,622 |
| C++ | ~50,938 | 59,029 | +8,091 |
| C headers | ~17,253 | 18,678 | +1,425 |
| TypeScript | ~3,771 | 3,771 | 0 |

### By Language

| Lang | LOC | % |
|------|-----:|---|
| Lua | 126,410 | 59.5% |
| C++ | 59,029 | 27.8% |
| C headers | 18,678 | 8.8% |
| TypeScript | 3,771 | 1.8% |
| JSON | 3,163 | 1.5% |
| CSS | 1,290 | 0.6% |

---

## 2. Manifold/ Breakdown

| Subsystem | LOC |
|-----------|-----:|
| `primitives/` | 36,987 |
| `ui/` | 29,908 |
| `core/` | 7,537 |
| `dsp/` | 2,535 |
| `SystemScripts/` | 1,811 |
| `headless/` | 1,775 |
| `shaders/` | 1,521 |
| `grpc/` | 854 |
| `highway/` | 195 |
| `engine/` | 169 |
| `android/` | 60 |
| `sources/` | 46 |

---

## 3. UserScripts/ Main/ Project Breakdown

| Area | LOC |
|------|-----:|
| `ui/behaviors/` | ~32,087 *(estimate from prior audit)* |
| `lib/` | ~21,492 |
| `dsp/` | ~3,307 |
| `editor/` | ~69 |
| `themes/` | ~9 |

*(Full per-file breakdown in Top 50 below)*

---

## 4. Top 50 Largest Files

| # | LOC | File | Type | Notes |
|---|-----:|------|------|-------|
| 1 | 4,337 | `manifold/core/BehaviorCoreProcessor.cpp` | C++ | Engine heart. 188 functions, 92.6% coverage, avg 21L/func |
| 2 | 4,239 | `manifold/ui/shell/methods_core.lua` | Lua | Shell god object. 141+ functions |
| 3 | 4,054 | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | C++ | Binding sink. 51 functions, avg 75L/func |
| 4 | 3,703 | `UserScripts/projects/avsamplerDOCKING/ui/behaviors/main.lua` | Lua | **Decomposition ongoing** |
| 5 | 3,529 | `web/remote-control/app.ts` | TS | Monolithic frontend. **Split planned** |
| 6 | 3,175 | `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua` | Lua | 4 parallel spec tables |
| 7 | 2,757 | `UserScripts/projects/Main/dsp/midisynth_integration.lua` | Lua | God function with 64 nested helpers |
| 8 | 2,746 | `UserScripts/projects/BappInstrument/dsp/default_dsp.lua` | Lua | **Throwaway — pending deletion** |
| 9 | 2,676 | `manifold/primitives/scripting/LuaEngine.cpp` | C++ | 9 concerns mixed |
| 10 | 2,603 | `manifold/core/BehaviorCoreEditor.cpp` | C++ | 58 functions, 92.3% coverage, avg 41L/func |
| 11 | 2,568 | `UserScripts/projects/BappInstrument/ui/behaviors/main.lua` | Lua | **Throwaway — pending deletion** |
| 12 | 2,525 | `manifold/ui/imgui/ImGuiDirectHost.cpp` | C++ | 96 functions, 88.8% coverage |
| 13 | 2,404 | `manifold/ui/shell/bindings.lua` | Lua | Shell display list builder |
| 14 | 2,375 | `UserScripts/projects/RackModuleHost/ui/behaviors/main.lua` | Lua | Standalone rack host |
| 15 | 2,219 | `UserScripts/projects/DspLiveScripting/ui/behaviors/main.lua` | Lua | Live scripting playground |
| 16 | 2,166 | `UserScripts/projects/Main/ui/behaviors/source_panel.lua` | Lua | DSP math mixed with UI |
| 17 | 1,920 | `manifold/ui/project_loader.lua` | Lua | 102 functions |
| 18 | 1,871 | `UserScripts/projects/ExperimentalUI/ui/legacy/experimental_legacy.lua` | Lua | Legacy experiment |
| 19 | 1,727 | `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` | C++ | 22 functions, avg 75L/func |
| 20 | 1,690 | `UserScripts/projects/WebcamViewer/ui/behaviors/main.lua` | Lua | Standalone webcam plugin |
| 21 | 1,682 | `UserScripts/projects/Main/lib/parameter_binder.lua` | Lua | 163 functions, 155 ≤10L |
| 22 | 1,589 | `UserScripts/projects/Main/ui/behaviors/rack_layout_engine.lua` | Lua | Layout + drag/drop |
| 23 | 1,579 | `UserScripts/projects/Main/lib/sample_synth.lua` | Lua | Sample synth lib |
| 24 | 1,522 | `UserScripts/projects/AVSampler/ui/behaviors/main.lua` | Lua | AVSampler standalone |
| 25 | 1,445 | `manifold/primitives/control/ControlServer.cpp` | C++ | 35 functions, `processCommand` is 915L |
| 26 | 1,437 | `UserScripts/projects/BappInstrument/dsp/default_dsp.full_attempt.lua` | Lua | **Throwaway** |
| 27 | 1,435 | `UserScripts/projects/Main/ui/behaviors/palette_browser.lua` | Lua | Palette browser |
| 28 | 1,379 | `UserScripts/projects/Main/lib/ui/rack_mod_popover.lua` | Lua | Mod popover |
| 29 | 1,344 | `manifold/primitives/control/OSCQuery.cpp` | C++ | 36 functions |
| 30 | 1,289 | `web/remote-control/style.css` | CSS | Stylesheet |
| 31 | 1,211 | `UserScripts/projects/Main/ui/behaviors/midisynth.lua` | Lua | MidiSynth behavior |
| 32 | 1,195 | `UserScripts/projects/Main/lib/modulation/runtime.lua` | Lua | Modulation runtime |
| 33 | 1,174 | `manifold/primitives/scripting/dsp_host/DSPHostParamRegistry.cpp` | C++ | Param registry |
| 34 | 1,146 | `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` | C++ | Shader surfaces |
| 35 | 1,141 | `manifold/primitives/video/VideoSynthPrimitive.cpp` | C++ | Video synth |
| 36 | 1,139 | `manifold/primitives/scripting/dsp_host/DSPHostBindingsFx.cpp` | C++ | FX bindings |
| 37 | 1,094 | `dsp/core/nodes/OscillatorNode.cpp` | C++ | Oscillator DSP |
| 38 | 1,086 | `dsp/core/nodes/SampleRegionPlaybackNode.cpp` | C++ | Sample playback |
| 39 | 1,055 | `UserScripts/projects/Main/ui/behaviors/fx_slot.lua` | Lua | FX slot behavior |
| 40 | 1,050 | `manifold/ui/ui_shell.lua` | Lua | Shell core |
| 41 | 1,045 | `UserScripts/projects/AVSamplerLab/ui/behaviors/main.lua` | Lua | AVSampler lab |
| 42 | 1,037 | `UserScripts/projects/Main/ui/behaviors/eq.lua` | Lua | EQ behavior |
| 43 | 1,022 | `dsp/core/nodes/OscillatorNode_Highway.h` | C++ | Highway oscillator |
| 44 | 1,015 | `manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp` | C++ | Core bindings |
| 45 | 948 | `manifold/ui/imgui/ImGuiRuntimeNodeHost.cpp` | C++ | Runtime node host |
| 46 | 927 | `UserScripts/projects/Main/ui/behaviors/rack_oscillator.lua` | Lua | Rack oscillator |
| 47 | 927 | `manifold/ui/imgui/RuntimeNodeRenderer.cpp` | C++ | Node renderer |
| 48 | 920 | `manifold/ui/shell/methods_layout.lua` | Lua | Layout methods |
| 49 | 910 | `manifold/SystemScripts/projects/Settings/ui/main.ui.lua` | Lua | Settings UI |
| 50 | 882 | `UserScripts/projects/Main/ui/behaviors/rack_sample.lua` | Lua | Rack sample |

---

## 5. God Function Inventory (≥80 lines)

150 functions across the codebase exceed 80 lines. The critical ones — those in permanent infrastructure, not throwaway code:

### Tier 1: Binding Registration Gobsmackers

These are the single biggest structural debt item. Each is an anonymous lambda passed to a registration function, acting as a mini-DSL inside a C++ callback.

| Lines | Location | What It Registers |
|-------|----------|-------------------|
| 1,421 | `LuaControlBindings.cpp:2634` | Waveform/analysis bindings |
| 1,110 | `DSPHostBindingsFx.cpp:28` | FX plugin bindings |
| 1,026 | `DSPHostParamRegistry.cpp:13` | Parameter mapping |
| 985 | `DSPHostBindingsCore.cpp:29` | Core DSP bindings |
| 798 | `LuaControlBindings.cpp:926` | Utility bindings (file I/O, settings, ImGui menus, etc.) |
| 677 | `DSPHostBindingsSynth.cpp:28` | Synth bindings |
| 535 | `LuaUIBindings.cpp:406` | Canvas bindings |
| 467 | `ShaderSurfaceProvider.cpp:569` | Shader surface rendering |
| 410 | `LuaUIBindings.cpp:1193` | OpenGL bindings |
| 399 | `LuaMidiBindings.cpp:32` | MIDI bindings |
| 390 | `DSPHostLoopLayerBundle.cpp:12` | Loop layer bundle bindings |
| 357 | `LuaControlBindings.cpp:1826` | Graph bindings |
| 340 | `LuaRuntimeNodeBindings.cpp:417` | Runtime node bindings |
| 295 | `LuaControlBindings.cpp:2185` | OSC bindings |

**Total in this category: ~9,500 lines** across 14 functions.

Pattern: each `register*Bindings` method receives a `state` lambda that builds an entire binding domain in one block. These should be split into per-domain compilation units — each domain file would naturally be 200-400 lines instead of 800-1400.

### Tier 2: Engine God Functions

| Lines | Function | File |
|-------|----------|------|
| 915 | `ControlServer::processCommand` | `ControlServer.cpp:532` |
| 492 | `BehaviorCoreEditor::timerCallback` | `BehaviorCoreEditor.cpp:1847` |
| 433 | `LuaEngine::loadScript` | `LuaEngine.cpp:780` |
| 351 | `BehaviorCoreProcessor::readExportPluginPath` | `BehaviorCoreProcessor.cpp:1055` |
| 332 | `BehaviorCoreProcessor::registerExportPluginEndpoints` | `BehaviorCoreProcessor.cpp:559` |
| 316 | `BehaviorCoreProcessor::processBlock` (lambda) | `BehaviorCoreProcessor.cpp:1702` |
| 304 | `BehaviorCoreEditor` constructor | `BehaviorCoreEditor.cpp:1430` |
| 272 | `LuaEngine::switchScript` | `LuaEngine.cpp:1561` |
| 215 | `LuaEngine::notifyUpdate` | `LuaEngine.cpp:1321` |

### Tier 3: Lua God Functions (Permanent)

| Lines | Function | File |
|-------|----------|------|
| 413 | `onVoiceFreq` | `midisynth_integration.lua:2053` |
| 330 | `M.buildFxDefs` | `fx_definitions.lua:38` |
| 98 | `ParameterBinder.buildModulationTargetDescriptors` | `parameter_binder.lua:1481` |
| 83 | `shell:ensureRuntimeParamControlPool` | `methods_core.lua:1821` |
| 76 | `shell:syncToolSurfaces` | `methods_core.lua:641` |

*(The `midisynth_integration.lua` god function `M.buildSynth` at line 53 contains ~64 nested local functions. The outer function body cannot be reliably measured by the parser, but its scope spans lines 53–~2700 — effectively the entire file.)*

---

## 6. Bloat — Corrected Scope

### What to Actually Care About

The following exclusions are noted upfront:

| Excluded | Reason |
|----------|--------|
| `BappInstrument/` (7,571L) | Throwaway, pending deletion |
| `BappSourceLayerLab/` (2,425L) | Throwaway |
| Other `Bapp*` labs (~5,000L) | Throwaway |
| `avsamplerDOCKING/` (4,030L) | Already on decomposition roadmap |
| Highway/NH DSP duplication | Intentional — non-Highway nodes are not duplicates, they're the primary implementation. SIMD opt-in for hot paths is correct architecture. |
| Standalone plugin projects (~48K) | Runtime-loaded product catalog, not dead code |

With those subtracted, **the permanent infrastructure debt is concentrated in ~5 files totaling ~15K lines.**

---

### 6.1 Binding Registration Pattern — ~9,500 lines, 14 functions

**Files:**
- `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` — 4,054L, 4 massive lambdas (1,421 + 798 + 357 + 295)
- `manifold/primitives/scripting/dsp_host/DSPHostBindingsFx.cpp` — 1,139L, 1 massive lambda (1,110)
- `manifold/primitives/scripting/dsp_host/DSPHostParamRegistry.cpp` — 1,174L, 1 massive lambda (1,026)
- `manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp` — 1,015L, 1 massive lambda (985)
- `manifold/primitives/scripting/dsp_host/DSPHostBindingsSynth.cpp` — ~700L, 1 massive lambda (677)
- `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` — 1,727L, 2 large functions (535 + 410)
- `manifold/primitives/scripting/bindings/LuaMidiBindings.cpp` — ~500L, 1 large lambda (399)
- `manifold/primitives/scripting/dsp_host/DSPHostLoopLayerBundle.cpp` — ~500L, 1 large lambda (390)

**Problem:** The `register*Bindings(sol::state&)` pattern passes a lambda that registers everything for a domain in one shot. The lambdas grow without structure.

**Fix:** Split each into per-domain files. Each binding group (e.g., waveform, graph, OSC, utility) gets its own `.cpp` with a `registerXxxBindings(ILuaControlState&)` free function. Individual compilation units go from 800-1400L to 200-400L.

**ROI:** High. These files are pure boilerplate with no algorithmic complexity — splitting them is mechanical and unlikely to introduce bugs.

---

### 6.2 `BehaviorCoreProcessor.cpp` — 4,337 lines, 10 concerns

**The engine heart.** Lifecycle, DSP callback, graph management, export plugin config, MIDI, OSC, profiling, serialization, host params, memory snapshots.

**What's fine to leave:**
- `processBlock` (316L) — audio callback, needs to be there
- `prepareToPlay` / `releaseResources` — JUCE lifecycle
- Parameter path resolution — inherent complexity
- MIDI I/O — small, clean

**What could move out:**
- `registerExportPluginEndpoints` (332L) — endpoint bloat
- `readExportPluginPath` (351L) — mixed export plugin logic
- Memory profiling (49L) — Linux-only `smaps_rollup` + `mallinfo2` embedded in core

**Fix priority: Low.** 188 functions with 92.6% coverage and avg 21L/func means the internals are well-factored even if the file is large. The 49 lines of Linux memory profiling are trivial to extract but also trivial to leave.

---

### 6.3 `methods_core.lua` — 4,239 lines, 141+ functions

**Shell god object.** Console commands, dev hotkeys, script inspector data fetching, runtime param pools, surface geometry, selection logic.

**Fix:** Split by concern:
- `shell_console.lua` — console, dev hotkeys
- `shell_inspector.lua` — script inspector, runtime params
- `shell_surface.lua` — surface geometry, tool surfaces
- `shell_selection.lua` — hit-test, selection, tree

**ROI:** Medium. The functions are already small (avg ~7.5L detected, though the parser misses many). The problem is navigation — finding anything in 4K lines of shell methods is tedious.

---

### 6.4 `LuaEngine.cpp` — 2,676 lines, 9 concerns

**Mixed concerns:**
- DSP primitive wrappers (LoopBuffer, Playhead, Quantizer) — ~65L
- File resolution helpers — ~80L
- Serialization/deserialization — major chunk
- Runtime node management
- Event listener system
- OSC callback processing

**Fix:**
- Move DSP wrappers to `bindings/LuaDspPrimitiveBindings.cpp`
- Extract file resolution to `ScriptPathResolver.cpp`

**ROI:** Medium. The wrappers and file resolution are small but logically independent.

---

### 6.5 `parameter_binder.lua` — 1,682 lines, 163 functions

155 of 163 functions are ≤10 lines. This file is a textbook case of code generation gone manual — 120 functions that just return a path string:

```lua
function ParameterBinder.dynamicEqBasePath(slotIndex) return ... end
function ParameterBinder.dynamicEqMixPath(slotIndex) return ... end
-- 118 more of these
```

**Fix:** Table-driven generation. A single table of path templates replaces all 120 functions.

**ROI:** High. Collapses ~1,000 lines of boilerplate into ~50 lines of data. Pure mechanical transformation.

---

### 6.6 `source_panel.lua` — 2,166 lines, 67 functions

DSP math (additive synthesis partials, tanh/fold distortion curves, driven wave weighting) mixed with UI callbacks.

**Fix:** Move math to `lib/`:
- `lib/additive_math.lua`
- `lib/drive_curves.lua`
- `lib/partial_morph.lua`

**ROI:** Medium. Makes the math testable independently of the UI.

---

## 7. Function Size Distribution

Data from 20 largest files (≥1,500 lines) analyzed:

| File | Functions | Small (≤10) | Medium (11-50) | Large (>50) | Avg Size |
|------|----------:|------------:|---------------:|------------:|---------:|
| `BehaviorCoreProcessor.cpp` | 188 | 117 | 57 | 14 | 21 |
| `methods_core.lua` | 141 | 119 | 20 | 2 | 7 |
| `LuaControlBindings.cpp` | 51 | 26 | 16 | 9 | 75 |
| `avsamplerDOCKING/main.lua` | 170 | 104 | 65 | 1 | 11 |
| `LuaEngine.cpp` | 78 | 52 | 13 | 13 | 29 |
| `BehaviorCoreEditor.cpp` | 58 | 15 | 31 | 12 | 41 |
| `ImGuiDirectHost.cpp` | 96 | 42 | 45 | 9 | 23 |
| `project_loader.lua` | 102 | 92 | 10 | 0 | 7 |
| `parameter_binder.lua` | 163 | 155 | 7 | 1 | 5 |

**Takeaway:**
- C++ files have healthy distribution — most functions are small, a few are large (the binding lambdas).
- Lua files skew heavily toward small functions, but the parser underreports size due to nested `do/end`.
- The binding registration lambdas are the only genuine "god functions" in C++.

---

## 8. Functional Concern Density

Auto-detected by scanning for concern-relevant keywords across files ≥800 lines. 46 files flagged with ≥4 concern categories.

| Flags | Files | Worst Offender | Concern Count |
|-------|-------|----------------|:-------------:|
| 10 | 1 | `BehaviorCoreProcessor.cpp` | profiling, osc, dsp, config, graph, midi, ui, serialization, video, file_io |
| 9 | 1 | `LuaEngine.cpp` | osc, ui, graph, file_io, config, profiling, dsp, video, midi |
| 8 | 1 | `BehaviorCoreEditor.cpp` | profiling, config, graph, video, ui, file_io, dsp, osc |
| 7 | 2 | `methods_core.lua`, `midisynth_integration.lua` | — |
| 6 | 6 | `avsamplerDOCKING/main.lua`, `app.ts`, `ImGuiDirectHost.cpp`, etc. | — |
| 5 | 16 | `LuaUIBindings.cpp`, `project_loader.lua`, `bindings.lua`, etc. | — |
| 4 | 19 | various | — |

**Interpretation:** Concern density is a proxy for "will this be a pain in the ass to navigate." A file with 7+ concerns (4 files) genuinely needs splitting. Files with 4-5 concerns may be fine if the concerns are small and well-separated internally.

---

## 9. Priority Ranking

| Priority | Target | Lines | Fix Complexity | Real Impact |
|----------|--------|-------|----------------|-------------|
| 1 | Split binding registration lambdas into per-domain files | ~9,500 | Medium (mechanical) | High — removes 14 untestable god lambdas |
| 2 | Table-drive `parameter_binder.lua` path functions | ~1,000 | Low | High — collapses 120 functions to data |
| 3 | Split `methods_core.lua` by concern | 4,239 | Medium | Medium — navigation improvement |
| 4 | Move `source_panel.lua` DSP math to `lib/` | ~400 | Low | Medium — enables isolated testing |
| 5 | Extract DSP wrappers and file resolution from `LuaEngine.cpp` | ~150 | Low | Medium |
| 6 | Move memory profiling from `BehaviorCoreProcessor.cpp` | ~49 | Low | Low (but trivial) |

---

## 10. Not Bloat (Confirmed)

| Item | Reason |
|------|--------|
| `BehaviorCoreProcessor.cpp` at 4,337L | Engine heart. 188 well-factored functions, 92.6% coverage, avg 21L. Don't touch. |
| `BehaviorCoreEditor.cpp` at 2,603L | Editor class. 58 functions, 92.3% coverage. Justified complexity. |
| `ImGuiDirectHost.cpp` at 2,525L | OpenGL/ImGui host. 96 functions, 88.8% coverage. Inherent complexity. |
| DSP Highway vs Non-Highway | Not duplication. Highway is opt-in SIMD hot path for 7 nodes. Other 48 nodes don't need it. |
| UserScripts standalone projects (~48K) | Runtime-loaded VST plugins. Product catalog. |
| BappInstrument/* | Throwaway. Do not refactor, do delete when done. |
| `avsamplerDOCKING/main.lua` | On roadmap for decomposition. Flag as "in progress." |
| `web/remote-control/app.ts` | On roadmap for splitting. |
| `tests/`, `test_plugins/`, `agent-docs/` | Not shipped. |

---

## 11. Tooling

Three Python scripts in `tools/profiling/` generated this report:

| Script | Purpose | Usage |
|--------|---------|-------|
| `codebase_profile.py` | Full LOC audit, file tree, top-N, file types, snapshot/diff | `python3 tools/profiling/codebase_profile.py --report` |
| `function_profiler.py` | C++/Lua function extraction, size distribution, coverage | `python3 tools/profiling/function_profiler.py --top-funcs 10` |
| `bloat_detector.py` | Mixed concern detection, god function finder | `python3 tools/profiling/bloat_detector.py` |

Snapshot saved at `tools/profiling/snapshot_20260430_223206.json`. Run `--diff` against it to track changes.

---

*Generated 2026-04-30 from live profiling scripts. Next audit: run `codebase_profile.py --snapshot && codebase_profile.py --report && bloat_detector.py` to update.*
