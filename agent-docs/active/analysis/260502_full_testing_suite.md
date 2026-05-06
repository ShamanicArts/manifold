# Full Codebase Testing Suite

**Date:** 2026-05-05
**Status:** Living reference — synced to the current suite at **66/66 passing**
**Scope:** Current test architecture, registered tests, golden-fixture workflow, operational commands, coverage boundaries, and the remaining work after the editor-live / `processBlock()` / ML-seam push.

---

## 1. Suite Snapshot

### Current numbers

| Metric | Value |
|---|---:|
| Registered CTest tests | **66** |
| Harness `.cpp` files (`manifold/headless` + `tests`) | **62** |
| Full-suite status | **66/66 passing** |
| DSP node coverage | **56 nodes under contract** |
| Lua binding families under behavior/registry coverage | **10 / 10** |
| ImGui host files with zero tests | **0** |
| Control / IPC files with zero tests | **0** |
| Shader pipeline files with zero tests | **0** |

### What is now covered directly

- DSP node behavior contracts
- DSP primitives
- graph runtime + graph support seams
- MIDI behavior + MIDI support seams + Lua MIDI bindings
- Lua registry + binding behavior + Lua engine lifecycle
- control / IPC / OSC / OSCQuery parser, registry, server, persistence, endpoint, and resolver layers
- all extracted ImGui support seams
- editor bootstrap / lifecycle / capture / export support seams
- live editor execution behavior through `manifold_editor_live_contract`
- processor-level `processBlock()` behavior through `manifold_processor_process_block_contract`
- ML pipeline backend + mask shaping seams through `manifold_ml_pipeline_contract` and `manifold_ml_mask_surface_support_contract`
- system paths + settings persistence
- shader/source/composite non-GL descriptor logic
- first EGL-backed draw-path smoke for:
  - `GeneratedSourceProvider`
  - `ShaderSurfaceProvider`
  - `CompositeSurfaceProvider`

### What is still not done

The remaining work is optional GL-facing polish instead of broad first-pass coverage gaps:

1. **Deeper GL lifecycle hardening**
   - provider prune/release behavior under active rendering
   - payload mutation without dimension change (texture key invalidation)
   - the current smoke covers happy-path drawing, broken-shader compile path, and resize/rebuild mutation

There is no longer a pure "zero-test" subsystem in the codebase. Every area has at least seam-level, pipeline-level, or smoke-level contract coverage.

---

## 2. Test Architecture

### 2.1. Test tiers

| Tier | Binary / Path | Primary job | Do **not** use it for |
|---|---|---|---|
| **Tier 0** | C++ harnesses in `manifold/headless/*Harness.cpp` and selected `tests/*.cpp` | deterministic local contracts and seam tests | proving full user-visible behavior |
| **Tier 1** | `ManifoldHeadless` | IPC protocol, state mutation, command semantics | editor/runtime-root correctness |
| **Tier 2** | `ManifoldHeadless --test-ui` | shell/editor wiring, renderer-switch semantics, UI bootstrap | real GL/input behavior |
| **Tier 3** | `Manifold_Standalone` | real renderer behavior, focus, overlays, real input smoke | fast isolated unit contracts |
| **Tier 4** | profiling / diagnostics | perf thresholds, backlog, timing regression checks | correctness of deterministic static state |

### 2.2. Contract-testing pattern

This remains the default testing pattern for new deterministic coverage:

```text
1. drive the system to a deterministic state
2. export a comprehensive JSON contract
3. save it as tests/fixtures/<name>_golden.json
4. re-export after changes
5. fail on drift unless the change is intentional
```

A good contract is:
- **deterministic**
- **comprehensive enough to catch drift**
- **fast enough for iteration**
- **specific about invariants when byte-identical output is unrealistic**

### 2.3. Where tests are registered

Tests are registered in `CMakeLists.txt` via `add_test(...)`.

For the current ground truth, do **not** trust stale line numbers in docs. Use:

```bash
ctest --test-dir build-dev -N
```

---

## 3. Registered Test Inventory

This is the current registered suite grouped by domain.

### 3.1. Scripting / bindings / Lua engine

| Domain | Registered tests |
|---|---|
| Lua registry + bindings | `manifold_lua_bindings_contract`, `manifold_lua_bindings_behavior_contract`, `manifold_lua_bindings_behavior_smoke` |
| Lua engine lifecycle | `manifold_lua_engine_contract` |

**What this proves:**
- sol2 registry shape is stable
- binding families behave, not just register
- script load / eval / reload paths are covered
- teardown regressions found during extraction stay pinned

### 3.2. Core / editor / system

| Domain | Registered tests |
|---|---|
| system + settings | `manifold_system_paths_contract`, `manifold_settings_contract` |
| editor seams + live execution | `manifold_editor_bootstrap_support_contract`, `manifold_editor_lifecycle_support_contract`, `manifold_editor_capture_support_contract`, `manifold_export_support_contract`, `manifold_editor_live_contract` |
| processor state / smoke / process | `manifold_core_state_contract`, `manifold_core_midi_contract`, `manifold_core_sniff`, `manifold_state_projection`, `manifold_processor_process_block_contract` |
| ML seam contracts | `manifold_ml_pipeline_contract`, `manifold_ml_mask_surface_support_contract` |

**What this proves:**
- editor bootstrap decisions are deterministic
- editor lifecycle policy decisions are deterministic
- screenshot / recording data-shaping logic is deterministic
- live editor shell/renderer/perf-overlay state transitions are contracted under a running editor instance
- processor audio/MIDI/capture/playtime behavior is now contracted at the `processBlock()` level
- ML/ONNX request shaping, tensor packing, async inference plumbing, segmentation RGBA post-processing, and mask/composite payload shaping are now deterministic under fake backends
- system path and settings persistence behavior are sandbox-covered
- core state/midi projection remains stable

### 3.3. DSP / runtime / support seams

| Domain | Registered tests |
|---|---|
| DSP nodes | `manifold_dsp_node_contract` |
| DSP primitives | `manifold_dsp_primitive_contract` |
| graph runtime | `manifold_graph_runtime_contract`, `manifold_graph_runtime_support_contract` |
| DSP host lifecycle | `manifold_param_registry_contract`, `manifold_dsp_host_lifecycle_contract` |
| core support seams | `manifold_link_support_contract`, `manifold_state_serialization_support_contract`, `manifold_midi_support_contract`, `manifold_behavior_query_support_contract`, `manifold_behavior_param_support_contract`, `manifold_behavior_housekeeping_support_contract`, `manifold_dsp_slot_support_contract` |

**What this proves:**
- all 56 DSP nodes are contract-covered
- graph/runtime mutation and support logic is pinned
- extracted support helpers are no longer silent regression holes
- DSP host lifecycle and parameter endpoints are exercised directly

### 3.4. Control / IPC / OSC / project-level regression

| Domain | Registered tests |
|---|---|
| IPC / OSCQuery / project smoke | `manifold_headless_oscquery_contract`, `manifold_headless_ipc_core`, `manifold_headless_avsampler_docking_regression` |
| parser / resolver / queue | `manifold_command_parser`, `manifold_command_queue`, `manifold_endpoint_resolver` |
| registry / persistence / servers | `manifold_osc_endpoint_registry_contract`, `manifold_osc_settings_persistence_contract`, `manifold_control_server_contract`, `manifold_oscquery_server_contract`, `manifold_osc_server_contract`, `manifold_control_command_support_contract` |

**What this proves:**
- command parsing and routing works
- endpoint registration and persistence are stable
- OSC/OSCQuery/IPC server behavior is covered directly
- project-level shell regression coverage exists at least for avsamplerDOCKING

### 3.5. ImGui / direct host / UI support seams

| Domain | Registered tests |
|---|---|
| direct host | `manifold_direct_host_contract`, `manifold_surface_providers_draw_smoke` |
| geometry / theme / input / host seams | `manifold_runtime_node_geometry_contract`, `manifold_widget_geometry_contract`, `manifold_theme_support_contract`, `manifold_hierarchy_host_input_contract`, `manifold_text_input_host_support_contract`, `manifold_script_list_support_contract`, `manifold_perf_overlay_support_contract`, `manifold_tool_component_support_contract`, `manifold_runtime_node_host_support_contract`, `manifold_editor_shell_imgui_support_contract`, `manifold_inspector_host_state_support_contract`, `manifold_imgui_globals_contract`, `manifold_imgui_opengl_backend_smoke` |

**What this proves:**
- direct host behavior is covered at a meaningful integration level
- all extracted ImGui support seams are under contract
- GL backend smoke exists
- EGL-backed surface draw smoke now covers the first real shader/source/composite draw path execution

### 3.6. Shader / source / composite registry + support seams

| Domain | Registered tests |
|---|---|
| shader / source / composite support | `manifold_shader_surface_support_contract`, `manifold_texture_source_registry_contract`, `manifold_generated_source_support_contract`, `manifold_composite_surface_support_contract`, `manifold_shader_registry_contract` |

**What this proves:**
- descriptor parsing, payload shaping, signature construction, registry inventory, and sanitization logic are deterministic
- plus the draw-smoke harness now proves these providers also work in-context at the smoke level

### 3.7. Standalone perf / video

| Domain | Registered tests |
|---|---|
| standalone / perf | `manifold_standalone_direct_profile_sanity` |
| video | `manifold_video_sampler_storage`, `manifold_video_retrospective_capture` |

**What this proves:**
- direct renderer perf has a threshold smoke
- video storage / retrospective infrastructure is covered

---

## 4. Golden Fixtures and Output Style

### 4.1. Fixture location

Golden files live under:

```text
tests/fixtures/
```

Examples added in the latest passes:
- `editor_lifecycle_support_contract_golden.json`
- `editor_capture_support_contract_golden.json`
- `processor_process_block_contract_golden.json`
- `ml_pipeline_contract_golden.json`
- `ml_mask_surface_support_contract_golden.json`
- `surface_providers_draw_smoke_contract_golden.json`

### 4.2. What belongs in a golden

Prefer exact JSON when the output is truly deterministic.

Prefer invariant fields instead of exact runtime values when a value naturally drifts, e.g.:
- timing in microseconds
- dynamic ports
- allocator byte counters that vary run-to-run

### 4.3. Known contract rule

If a contract fails because the behavior really changed, update the fixture **only after** confirming the new behavior is correct and intentional.

---

## 5. Operational Runbook

### 5.1. Build

Use the fast dev build:

```bash
cmake -S . -B build-dev -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build-dev --target Manifold_Standalone
```

### 5.2. Enumerate the suite

```bash
ctest --test-dir build-dev -N
```

### 5.3. Run the whole suite

```bash
ctest --test-dir build-dev --output-on-failure
```

### 5.4. Run one test

```bash
ctest --test-dir build-dev --output-on-failure -R manifold_editor_capture_support_contract
```

### 5.5. Run by label

```bash
ctest --test-dir build-dev -L contract
ctest --test-dir build-dev -L imgui
ctest --test-dir build-dev -L opengl
```

### 5.6. Regenerate a fixture

Typical harness flow:

```bash
./build-dev/EditorCaptureSupportContractHarness \
  > tests/fixtures/editor_capture_support_contract_golden.json
```

Or via verify mode in CTest/CMake registration.

### 5.7. Standalone smoke

```bash
./build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold
```

---

## 6. Current Coverage Boundary Notes

### 6.1. `BehaviorCoreEditor.cpp`

The editor is no longer zero-test.

It now has direct seam-level coverage for:
- bootstrap decisions
- lifecycle policy
- capture / recording data-shaping
- export support helpers

What is **still not covered** is the real live execution path:
- live shell sync under an active editor
- real component lifecycle (create/show/hide/destroy)
- end-to-end renderer-host behavior on the JUCE message thread

### 6.2. GL execution

GL execution is **not** a zero-test gap anymore.

What now exists:
- non-GL support contracts for descriptor/payload logic
- direct host contract coverage
- EGL-backed surface draw smoke through `ImGuiDirectHost`

What is **still shallow**:
- compile/link failure-path assertions
- resource rebuild / resize mutation paths
- more adversarial texture-routing cases

### 6.3. ML / ONNX

This remains the cleanest major hole.

---

## 7. Next Body of Work

The editor-live, `processBlock()`, and ML-seam slices are done. The remaining order is now just GL hardening.

### Slice 1 — GL hardening

**Goal:** deepen the existing draw-smoke coverage into real failure/mutation coverage.

**Target behaviors:**
- bad shader compile path
- FBO resize / rebuild behavior
- texture-routing mutation after payload changes
- provider prune/release lifecycle under active rendering
- ML mask provider texture-upload path under a real direct-host GL context

**Done when:**
- GL coverage includes both happy-path smoke and at least one failure/mutation path

---

## 8. Practical Rules for Future Test Work

- Prefer **extracted deterministic seams** first.
- If the remaining gap is genuinely runtime-bound, reuse existing harness machinery before inventing new infrastructure.
- Avoid unstable exact-timing goldens; use invariants where appropriate.
- If a new contract uncovers a real production bug, fix the bug instead of weakening the test.
- Re-run the **full suite** after any production-code seam extraction.
- Rebuild and smoke the standalone after editor/runtime changes.

---

## 9. Change Log

| Date | Change |
|---|---|
| 2026-05-05 | Synced this document to the current suite reality: **66 registered CTest tests**, **62 harness `.cpp` files**, current domain inventory, current coverage boundaries, and the remaining GL-hardening body of work. |
| 2026-05-05 | Added editor support coverage summary: bootstrap, lifecycle, capture, export support seams. |
| 2026-05-05 | Added live editor + processor coverage summary: `manifold_editor_live_contract` and `manifold_processor_process_block_contract`. |
| 2026-05-05 | Added ML seam coverage summary: `manifold_ml_pipeline_contract` and `manifold_ml_mask_surface_support_contract`. |
| 2026-05-05 | Added GL draw-smoke coverage summary: `SurfaceProvidersDrawSmokeHarness` exercising `generated_source`, `gpu_shader`, and `gpu_composite` through EGL-backed `ImGuiDirectHost` rendering. |
| 2026-05-02 | Initial document. |
