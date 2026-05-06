# AVSampler — ImGui Clip Grid Vertical Slices

**Date:** 2026-04-28
**Source docs:**
- `agent-docs/260427_avsampler_clip_grid_compositor_plan.md`
- `agent-docs/260428_avsampler_imgui_infrastructure_deep_dive.md`
- `UserScripts/projects/AVSampler/`

**Status:** APPROVED IMPLEMENTATION BREAKDOWN

**Decision:** Build the new ImGui clip-grid/compositor as vertical slices beside the existing AVSampler Canvas UI. Do not bulldoze the working sampler/ML/audio/shader backend. Each slice must add one observable behavior and keep the existing project usable.

---

## Current State Summary

`UserScripts/projects/AVSampler/` is currently a working retained-Canvas project with:

- webcam device handling
- ML segmentation and MoveNet pose inference
- pose OSC publishing and pose-to-param mapping
- retrospective A/V sampler capture
- poly/slice sample playback UI
- shader pipeline editing
- output viewport using existing surface providers
- waveform scrubbing
- MIDI input handling
- post-mix audio FX rack
- manual pane presets/resizing

The current Deck/Layers matrix is **not** the target clip grid. It is a static/decorative control surface. The target design introduces a real Resolume-style source/FX grid, a separate compositor layer stack, and a contextual param viewer.

The first goal is not a rewrite. The first goal is to prove the existing AVSampler can host real Lua-driven ImGui windows without regressing the current UI.

---

## Layers Identified

- **C++ ImGui host/bindings**
  - docking enable flag
  - window/table/child/widget bindings for Lua
  - item hit testing and ID scoping
  - eventual surface image bridge

- **Lua UI structure**
  - hidden/host RuntimeNode using `setOnImGuiFrame`
  - existing Canvas tree preserved as fallback
  - ImGui windows rendered on top of existing Canvas UI

- **Lua AVSampler domain model**
  - `ctx.clips`
  - `ctx.layers`
  - `ctx.selection`
  - `ctx.pinnedParams`
  - `ctx.previews`
  - sampler input/output source model

- **Surface/rendering integration**
  - `video_input`
  - `ml_composite`
  - `gpu_shader`
  - `gpu_composite`
  - later `imguiSurfaceImage` or hidden RuntimeNode texture bridge

- **Existing backend reuse**
  - current video sampler objects
  - current audio DSP graph
  - current ML pipelines
  - current shader list/pipeline builder
  - current MIDI handling
  - current FX rack

- **Verification and observability**
  - build `Manifold_Standalone` in tmux
  - launch/relaunch standalone in tmux
  - tolerate known UI-switch crash by checking tmux and relaunching
  - no `tail`/`head` on build or tmux output
  - use IPC/introspection if visible behavior is insufficient

---

## Slice 1: ImGui Overlay Scaffold

**Goal:** AVSampler shows one live ImGui tools window over the existing UI without breaking current functionality.

**Layers:**
- C++ ImGui host/bindings: enable docking and add minimal window bindings.
- Lua UI structure: install one `setOnImGuiFrame` callback.
- Verification: build and launch standalone; observe both old Canvas UI and new ImGui window.

**Checklist:**
- [ ] Add `io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;` in `manifold/ui/imgui/ImGuiDirectHost.cpp`.
- [ ] Add `imguiBegin(title, flags?)` binding in `manifold/primitives/scripting/bindings/LuaControlBindings.cpp`.
- [ ] Add `imguiEnd()` binding in `manifold/primitives/scripting/bindings/LuaControlBindings.cpp`.
- [ ] Add any missing basic constants needed by the simple window.
- [ ] Add a hidden/non-disruptive ImGui callback owner in `UserScripts/projects/AVSampler/ui/main.ui.lua` or reuse the root node if that is safer.
- [ ] Add a minimal `onImGuiFrame` callback in `UserScripts/projects/AVSampler/ui/behaviors/main.lua`.
- [ ] Render an `AVSampler Tools Prototype` window with status text.
- [ ] Build `Manifold_Standalone` in tmux window 2.
- [ ] Launch/relaunch standalone in tmux window 1.
- [ ] Verify the existing AVSampler UI still runs and the ImGui window appears.

**Done when:** AVSampler opens normally and a real ImGui window appears above the current Canvas UI.

**Depends on:** none

---

## Slice 2: Text-Only Real Clip Grid

**Goal:** A real clip/tap data model renders as a selectable ImGui grid, even before thumbnails.

**Layers:**
- C++ ImGui bindings: table/ID bindings.
- Lua domain model: default `ctx.clips` and `ctx.selection`.
- Lua ImGui rendering: text-only grid renderer.
- Verification: clicking cells changes selected state.

**Checklist:**
- [ ] Add minimal table bindings:
  - [ ] `imguiBeginTable(id, columns, flags?)`
  - [ ] `imguiEndTable()`
  - [ ] `imguiTableNextRow(flags?, minHeight?)`
  - [ ] `imguiTableNextColumn()`
- [ ] Add ID bindings:
  - [ ] `imguiPushID(id)`
  - [ ] `imguiPopID()`
- [ ] Add table constants required by the first grid.
- [ ] Add `ctx.clips` with default columns:
  - [ ] Webcam source
  - [ ] Segmentation FX above Webcam
  - [ ] Pose FX above Segmentation
  - [ ] Sampler source
- [ ] Add `ctx.selection`.
- [ ] Render a base source row and FX rows above it in the ImGui window.
- [ ] Highlight/report the selected cell.
- [ ] Keep the old AVSampler UI functional.

**Done when:** clicking `Webcam`, `Segmentation`, `Pose`, or `Sampler` cells changes the selected cell and displays the selection in the ImGui window.

**Depends on:** Slice 1

---

## Slice 3: Compositor Layers With Hardcoded Tap Choices

**Goal:** A real compositor layer stack drives the main output using existing surface providers.

**Layers:**
- Lua domain model: `ctx.layers`.
- Surface integration: build a `gpu_composite` payload.
- Lua ImGui rendering: compositor layer list.
- Existing Canvas output viewport: receives the composite surface.

**Checklist:**
- [ ] Add `ctx.layers` with four default layers.
- [ ] Define hardcoded tap choices for MVP:
  - [ ] Webcam Raw
  - [ ] Webcam + Segmentation
  - [ ] Webcam + Pose / pose placeholder as available
  - [ ] Sampler Output
- [ ] Render a compositor panel in ImGui.
- [ ] Add simple controls for layer visible/opacity/blend mode.
- [ ] Rebuild and apply `gpu_composite` payload to `outputViewport.node`.
- [ ] Keep shader/global output fallback recoverable if the composite payload fails.

**Done when:** changing a compositor layer opacity or blend mode in ImGui visibly changes the main output viewport.

**Depends on:** Slice 2

---

## Slice 4: First Live ImGui Thumbnail

**Goal:** At least one clip grid cell shows a live video thumbnail inside ImGui.

**Layers:**
- C++/rendering: expose a surface-to-ImGui image path.
- Lua rendering: thumbnail payload for one cell.
- Verification: live webcam thumbnail updates inside ImGui.

**Checklist:**
- [ ] Choose the smallest safe texture bridge:
  - [ ] direct `imguiSurfaceImage(surfaceType, payload, w, h)`, or
  - [ ] hidden RuntimeNode texture bridge if direct payload resolution is too invasive.
- [ ] Implement only enough for `video_input` first.
- [ ] Render the Webcam source cell thumbnail.
- [ ] Keep text fallback if texture resolution fails.
- [ ] Verify no runaway surface allocation/GPU memory growth.

**Done when:** the Webcam source cell in the ImGui grid displays the live webcam feed.

**Depends on:** Slice 2

---

## Slice 5: Param Viewer for Current Selection

**Goal:** Selecting a clip or layer shows editable params in an ImGui param viewer.

**Layers:**
- C++ ImGui bindings: sliders/checks/combos.
- Lua domain model: selection-to-param mapping.
- Existing backend: writes existing `/avsampler/...` params and layer fields.
- Verification: edited params affect visible output.

**Checklist:**
- [ ] Add widget bindings:
  - [ ] `imguiSliderFloat(label, value, min, max, format?, flags?)`
  - [ ] `imguiCheckbox(label, value)`
  - [ ] `imguiBeginCombo(label, previewValue, flags?)`
  - [ ] `imguiEndCombo()`
- [ ] Render a `Param Viewer` ImGui window/section.
- [ ] Show current clip/layer selection at the top.
- [ ] For segmentation clip, expose gain/threshold/feather/invert.
- [ ] For compositor layer, expose visible/opacity/blend mode.
- [ ] Write changed values back to existing params/model.

**Done when:** selecting the Segmentation cell and moving threshold visibly changes segmentation.

**Depends on:** Slice 2

---

## Slice 6: Real Source/Tap Picker

**Goal:** Compositor layers choose any available source/tap from the real clip model instead of hardcoded choices.

**Layers:**
- Lua domain model: tap enumeration from `ctx.clips`.
- Lua ImGui rendering: source/tap picker.
- Surface integration: payload generation from selected tap.

**Checklist:**
- [ ] Implement `availableTaps(ctx)`.
- [ ] Generate user-facing tap names such as `Webcam Raw`, `Webcam + Segmentation`, `Webcam + Segmentation + Pose`.
- [ ] Add a source/tap picker UI per compositor layer.
- [ ] Store layer input as `{ sourceColumn, tapIndex }`.
- [ ] Rebuild composite payload from selected taps.
- [ ] Show explicit missing/orphan state if a layer points at a missing tap.

**Done when:** a compositor layer can switch between Webcam Raw, Webcam + Segmentation, Webcam + Pose, and Sampler output.

**Depends on:** Slice 3

---

## Slice 7: FX Clip Assignment MVP

**Goal:** Users can assign/change simple FX clips in the grid and the resulting tap changes.

**Layers:**
- Lua domain model: FX clip mutation.
- Existing shader/ML integration: segmentation, pose, shader effect options.
- Lua ImGui rendering: context/menu or button-based assignment.
- Surface payload building: changed FX modifies downstream tap output.

**Checklist:**
- [ ] Add right-click or button-based `Set FX` for FX cells.
- [ ] Support fixed MVP FX types:
  - [ ] Segmentation
  - [ ] Pose
  - [ ] Shader passthrough/effect
- [ ] Rebuild tap payloads after FX changes.
- [ ] Ensure selection and param viewer follow the changed FX type.
- [ ] Mark unsupported/missing FX payloads clearly instead of crashing.

**Done when:** changing an FX cell from Segmentation to a shader effect changes the available tap/output.

**Depends on:** Slice 5, Slice 6

---

## Slice 8: Sampler as Source + Tap Input

**Goal:** The sampler is represented as a source clip, and its capture input can be any tap.

**Layers:**
- Lua domain model: sampler source and sampler input tap.
- Existing video/audio sampler backend: reuse current `ctx.video` and `ctx.videoCap`.
- Lua ImGui rendering: sampler controls/input picker.
- Verification: capture from selected tap and use sampler output in compositor.

**Checklist:**
- [ ] Represent sampler output as a source clip in the base row.
- [ ] Add sampler input state `{ sourceColumn, tapIndex }`.
- [ ] Add sampler input picker in Param Viewer or sampler clip context UI.
- [ ] Use selected tap for video capture path where supported.
- [ ] Preserve existing MIDI/audio trigger behavior.
- [ ] Make sampler output compositor-selectable.

**Done when:** set sampler input to `Webcam + Segmentation`, capture, then select `Sampler` as a compositor input.

**Depends on:** Slice 6

---

## Slice 9: Preview Windows as User-Defined Tap Views

**Goal:** Raw/Seg/Pose previews become configurable ImGui preview windows instead of hardcoded Canvas panes.

**Layers:**
- Lua domain model: `ctx.previews`.
- Lua ImGui rendering: floating/dockable preview windows.
- Surface image rendering: preview draws selected tap.
- Existing defaults: spawn Raw, Segmented, Pose previews.

**Checklist:**
- [ ] Add `ctx.previews` with default Raw/Segmented/Pose entries.
- [ ] Render each preview as an ImGui window.
- [ ] Each preview points to `{ sourceColumn, tapIndex }`.
- [ ] Allow changing preview source/tap.
- [ ] Allow closing/reopening previews.
- [ ] Keep old raw/seg/pose Canvas panes until this is stable.

**Done when:** user can close Pose preview, spawn another preview, and point it at a different tap.

**Depends on:** Slice 4, Slice 6

---

## Slice 10: Persistence + Old UI Retirement Pass

**Goal:** New clip-grid/compositor state persists, and obsolete old panes can be hidden behind a feature/preset switch.

**Layers:**
- State persistence: clips/layers/previews/pins.
- Lua UI structure: Classic vs Clip Grid mode.
- Cleanup: hide fake deck matrix when new mode is active.
- Verification: restart restores state.

**Checklist:**
- [ ] Extend `.av_sampler.state` or introduce a new compatible state section.
- [ ] Persist clips/layers/previews/pinned params.
- [ ] Add a `Classic` vs `Clip Grid` mode/preset.
- [ ] Hide old fake deck matrix when Clip Grid mode is active.
- [ ] Keep fallback path for debugging.
- [ ] Verify restart restores clip grid/compositor state.

**Done when:** restart AVSampler and the clip grid/compositor layout restores correctly.

**Depends on:** Slices 2-9

---

## Dependency Graph

```text
1 → none
2 → 1
3 → 2
4 → 2
5 → 2
6 → 3
7 → 5, 6
8 → 6
9 → 4, 6
10 → 2, 3, 4, 5, 6, 7, 8, 9
```

The graph is acyclic. Topological order:

```text
1, 2, 3, 4, 5, 6, 7, 8, 9, 10
```

Slices 4 and 5 can proceed after Slice 2 independently of Slice 3, but Slice 3 should usually happen first because it proves the compositor data path before thumbnail polish.

---

## Machine-Readable Slice Schema

```yaml
slices:
  - id: 1
    name: "ImGui Overlay Scaffold"
    goal: "AVSampler shows one live ImGui tools window over the existing UI without breaking current functionality."
    layers: ["C++ ImGui host/bindings", "Lua UI structure", "Verification"]
    depends_on: []
    parallel_group: 1
    effort: "small"
  - id: 2
    name: "Text-Only Real Clip Grid"
    goal: "A real clip/tap data model renders as a selectable ImGui grid, even before thumbnails."
    layers: ["C++ ImGui bindings", "Lua domain model", "Lua ImGui rendering", "Verification"]
    depends_on: [1]
    parallel_group: 2
    effort: "medium"
  - id: 3
    name: "Compositor Layers With Hardcoded Tap Choices"
    goal: "A real compositor layer stack drives the main output using existing surface providers."
    layers: ["Lua domain model", "Surface integration", "Lua ImGui rendering", "Existing Canvas output viewport"]
    depends_on: [2]
    parallel_group: 3
    effort: "medium"
  - id: 4
    name: "First Live ImGui Thumbnail"
    goal: "At least one clip grid cell shows a live video thumbnail inside ImGui."
    layers: ["C++/rendering", "Lua rendering", "Verification"]
    depends_on: [2]
    parallel_group: 3
    effort: "medium"
  - id: 5
    name: "Param Viewer for Current Selection"
    goal: "Selecting a clip or layer shows editable params in an ImGui param viewer."
    layers: ["C++ ImGui bindings", "Lua domain model", "Existing backend", "Verification"]
    depends_on: [2]
    parallel_group: 3
    effort: "medium"
  - id: 6
    name: "Real Source/Tap Picker"
    goal: "Compositor layers choose any available source/tap from the real clip model instead of hardcoded choices."
    layers: ["Lua domain model", "Lua ImGui rendering", "Surface integration"]
    depends_on: [3]
    parallel_group: 4
    effort: "medium"
  - id: 7
    name: "FX Clip Assignment MVP"
    goal: "Users can assign/change simple FX clips in the grid and the resulting tap changes."
    layers: ["Lua domain model", "Existing shader/ML integration", "Lua ImGui rendering", "Surface payload building"]
    depends_on: [5, 6]
    parallel_group: 5
    effort: "medium"
  - id: 8
    name: "Sampler as Source + Tap Input"
    goal: "The sampler is represented as a source clip, and its capture input can be any tap."
    layers: ["Lua domain model", "Existing video/audio sampler backend", "Lua ImGui rendering", "Verification"]
    depends_on: [6]
    parallel_group: 5
    effort: "medium"
  - id: 9
    name: "Preview Windows as User-Defined Tap Views"
    goal: "Raw/Seg/Pose previews become configurable ImGui preview windows instead of hardcoded Canvas panes."
    layers: ["Lua domain model", "Lua ImGui rendering", "Surface image rendering", "Existing defaults"]
    depends_on: [4, 6]
    parallel_group: 5
    effort: "medium"
  - id: 10
    name: "Persistence + Old UI Retirement Pass"
    goal: "New clip-grid/compositor state persists, and obsolete old panes can be hidden behind a feature/preset switch."
    layers: ["State persistence", "Lua UI structure", "Cleanup", "Verification"]
    depends_on: [2, 3, 4, 5, 6, 7, 8, 9]
    parallel_group: 6
    effort: "medium"
```

---

## Quality Checks

- **Independence:** Each slice can merge without requiring the full redesign to be complete.
- **Observability:** Every slice has a visible UI behavior or directly verifiable rendering/state behavior.
- **No horizontal layers:** Bindings/types/models are introduced only when first used by an observable slice.
- **Coverage:** The plan covers ImGui scaffold, real clip grid, compositor, thumbnails, params, tap picker, FX assignment, sampler source/input, previews, and persistence.
- **Acyclic dependencies:** Dependency graph is a DAG.
- **Fallback:** Existing AVSampler Canvas UI stays alive until the new clip-grid mode is stable enough to replace it.

---

## Implementation Notes

- Use tmux session `Manifold`, window 1 for standalone, window 2 for builds/tests.
- Never use `head` or `tail` on build commands or tmux capture output.
- Known issue: switching UI can sometimes crash. Treat this as normal for now: check tmux, relaunch standalone, continue verification.
- For fast iteration, use `build-dev` and target `Manifold_Standalone`:

```bash
cmake -S . -B build-dev -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo
cmake --build build-dev --target Manifold_Standalone
```

- Run standalone from:

```bash
./build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold
```
