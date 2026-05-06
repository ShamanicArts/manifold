# AVSampler — Clip Grid & Compositor Redesign

**Date:** 2026-04-27
**Source:** User planning session synthesizing Resolume-style clip grid, TouchDesigner multiMix compositor model, and existing Manifold surface/shader/FX infrastructure
**Author:** Agent
**Status:** IDEATION — architecture reference for future implementation agent

---

## Verified Findings / Corrections

These notes supersede any earlier UI layout assumptions:

- **This is NOT the existing AVSamplerLab project.** The current `UserScripts/projects/AVSamplerLab/` has a static 1280×1200 absolute-coordinate UI with a fake clip grid and fake layer strips. This redesign replaces that entirely.
- **Clip grid must be REAL.** Each cell holds a source or FX. Clicking a cell selects it. Cells show live thumbnails. The grid is scrollable in whichever direction it needs to.
- **Sources are ONLY in the base row/column.** Everything above/beside the base is FX. No sources appear elsewhere in the grid. There is only one row/column of sources. Beyond that, there are no more sources — just effects applied on top.
- **FX clips stack sequentially on sources.** Source → FX1 → FX2 → FX3. Each stage is a "tap" that the compositor can reference. This is signal processing, NOT compositing.
- **Compositor is a separate 1-column layer stack** (for now; N columns later). Each layer picks a source/tap via nested submenu. Each layer has opacity + blend mode. Compositing happens here, not in the FX stack.
- **ML models (segmentation, pose, depth) are FX clips.** They are not hardcoded views. A default stack might be Webcam → Segmentation → Pose, but users can delete/rearrange. Future ML outputs handled on per-FX basis.
- **Sampler is decoupled from clips.** The sampler captures from any tap in the stack and its output feeds into the compositor like any other source. MIDI triggers the sampler, not clips directly. The sampler's output can feed back as an input in the stack or as an input in the compositor.
- **ImGui + Canvas are complementary systems.** ImGui handles window chrome, docking, tables. Canvas renders widgets (sliders, knobs, labels) and video surfaces inside those windows. They manage different parts of the rendering UX.
- **Layout is flippable.** The grid can be horizontally or vertically oriented depending on user preference. The base row of sources can be top, bottom, left, or right. Grid scrolls in the direction it needs to.
- **Two defineSurface ImGui windows share one DockSpace.** The clip grid and param rack are ImGui windows inside a single surface with `backend = "imgui"`, `docking = "fill"`. They snap to each other.
- **No drag-and-drop for now.** FX assignment is via nested submenu. Reordering is delete/re-add. Orphaned FX clips sit unassigned until a source appears below them.
- **Click interaction model:** Click = select + overlay appears with icons. Right-click = context menu with nested submenus. Overlay shows extra actions without cluttering unselected layers.
- **Icons on clips indicate usage.** Icons show where clips are being used in the compositor or elsewhere.
- **Param viewer supports eye and pin.** Eye = show when selected. Pin = show always. Contextually show different param areas depending on which FX layers are up.
- **Preview windows are user-defined, not hardcoded.** Users spawn preview windows and point them at any tap. Default: 3 previews (raw, segmented, pose) auto-spawn on first open.
- **Start with existing 3 default views** and evolve from there.
- **Interaction style:** Resolume/DaVinci Resolve style nested submenus for source selection, FX assignment, and compositor layer input picking.
- **All rendering goes through ImGui for the tool surface.** Canvas widgets render inside ImGui panels. The main output viewport (composited result) is a Canvas Panel with a `gpu_composite` surface.

---

## Core Idea

A video sampler instrument with three distinct zones:

1. **Clip Pool Grid** — scrollable grid of cells. Base row/column = sources (webcam, sampler output, generators, files). Everything above/across = FX clips (shaders, ML models, color correction, etc.).
2. **Compositor** — 1-column layer stack (N layers default 4, architecture supports N). Each layer references a tap from the clip pool.
3. **Param Viewer** — context-sensitive panel. Shows params for selected clip/layer. Supports eye (show when selected) and pin (show always) toggles.

The entire UI is rendered inside **one ImGui surface** with internal DockSpace. Canvas widgets render inside ImGui windows. The main output viewport (composited result) is a Canvas Panel with a `gpu_composite` surface.

---

## Architecture

### High-Level Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ImGui Surface (shared DockSpace)                                            │
│ ┌────────────────────────────┐  ┌─────────────────────────────────────────┐ │
│ │ Clip Grid Window           │  │ Param Viewer Window                     │ │
│ │ ┌────┬────┬────┬────┐      │  │ ┌─────────────────────────────────────┐ │ │
│ │ │FX3 │FX3 │FX3 │FX3 │      │  │ │ Current Selection Params            │ │ │
│ │ ├────┼────┼────┼────┤      │  │ └─────────────────────────────────────┘ │ │
│ │ │FX2 │FX2 │FX2 │FX2 │      │  │ ┌─────────────────────────────────────┐ │ │
│ │ ├────┼────┼────┼────┤      │  │ │ Pinned: Webcam Params               │ │ │
│ │ │FX1 │FX1 │FX1 │FX1 │      │  │ └─────────────────────────────────────┘ │ │
│ │ ├────┼────┼────┼────┤      │  │ ┌─────────────────────────────────────┐ │ │
│ │ │SRC │SRC │SRC │SRC │      │  │ │ Pinned: Segmentation Params         │ │ │
│ │ └────┴────┴────┴────┘      │  │ └─────────────────────────────────────┘ │ │
│ └────────────────────────────┘  └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│ Main Output Viewport (Canvas Panel with gpu_composite surface)              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │                                                                         │ │
│ │   Layer 4 (glitch, screen, 0.5)                                        │ │
│ │     over Layer 3 (pose output, normal, 1.0)                            │ │
│ │       over Layer 2 (segmented webcam, normal, 1.0)                     │ │
│ │         over Layer 1 (sampler output, normal, 1.0)                     │ │
│ │                                                                         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Clip Pool Grid

The grid is the heart of the instrument. It is a scrollable table of cells.

**Orientation:** Can flip. Sources on left, FX to the right. Or sources on top, FX below. Grid scrolls in whichever direction it needs to. User preference controls this.

**Cell layout (horizontal orientation):**
```
┌────┬────┬────┬────┬────┐
│FX3 │FX3 │FX3 │FX3 │FX3 │  ← scrollable
├────┼────┼────┼────┼────┤
│FX2 │FX2 │FX2 │FX2 │FX2 │
├────┼────┼────┼────┼────┤
│FX1 │FX1 │FX1 │FX1 │FX1 │
├────┼────┼────┼────┼────┤
│SRC │SRC │SRC │SRC │SRC │  ← base row: sources only
└────┴────┴────┴────┴────┘
```

**Cell layout (vertical orientation):**
```
┌────┬────┬────┬────┐
│SRC │FX1 │FX2 │FX3 │  ← scrollable
├────┼────┼────┼────┤
│SRC │FX1 │FX2 │FX3 │
├────┼────┼────┼────┤
│SRC │FX1 │FX2 │FX3 │
├────┼────┼────┼────┤
│SRC │FX1 │FX2 │FX3 │
└────┴────┴────┴────┘
```

**Cell types:**
| Type | Content | Thumbnail |
|------|---------|-----------|
| Source | Webcam, Sampler output, Generator, File | Live feed or cached frame |
| FX | Shader, ML model, Color correction | Output after applying FX to source below |

**Cell state:**
```lua
{
  kind = "source" | "fx",
  sourceType = "webcam" | "sampler" | "generator" | "file",  -- sources only
  fxType = "glitch" | "segmentation" | "pose" | ...           -- FX only
  params = { ... },                                              -- FX-specific parameters
  color = 0xff22d3ee,                                           -- user-assignable border color
  name = "Webcam",                                               -- user label
  active = true,
  -- usage icons indicate where this clip is referenced
  usedInCompositor = { layerIndex = 1, layerIndex = 3 },       -- which compositor layers use this
}
```

**Click interaction:**
- **Click** = select cell. Overlay appears with icons:
  - Preview icon (spawn a preview window for this tap)
  - Assign to compositor icon (nested submenu: pick layer)
  - Pin params icon (pin this clip's params in the viewer)
  - Delete icon
- **Right-click** = context menu (Add FX above, Delete, Rename, Set as Sampler Input, etc.)
- **Nested submenu** for adding new sources/FX. Resolume/DaVinci style.

**Orphaned FX behavior:** If a source is deleted, FX clips stacked above it become orphaned. They remain visible in the grid but show a "no source" state (dimmed, grayed out, or with a warning icon). If a new source is added below them in the same column, they re-attach automatically and resume processing.

### Effect Stack & Taps

Each column in the grid is an independent processing chain. This is NOT compositing — it is sequential signal processing.

```
Source (webcam)
    → FX1 (segmentation)
        → FX2 (pose)
            → FX3 (glitch)
                → output
```

Each arrow is a **tap**. The compositor can reference any tap:
- "Webcam Raw" (source output, tap 0)
- "Webcam + Segmentation" (post-FX1, tap 1)
- "Webcam + Segmentation + Pose" (post-FX2, tap 2)
- "Webcam + Segmentation + Pose + Glitch" (post-FX3, tap 3)

**Tap naming:** Could be auto-generated ("Webcam + Segmentation") or index-based ("Tap 1", "Tap 2"). UI should probably show both: "Webcam + Segmentation + Pose" as primary label, "Tap 2" as secondary.

**FX clip thumbnails:** Every FX cell shows a live thumbnail of the output AFTER that FX is applied. So the FX2 cell shows "source + FX1 + FX2", not just "FX2 applied to nothing." This lets you visually trace the chain.

**Adding FX:** Right-click empty cell above a source or existing FX → "Add FX" → nested submenu with categories (Shaders, ML, Color, etc.). FX appears above with live thumbnail.

**Default stack:** On first open, auto-populate with the 3 default views as FX on a webcam source: Webcam → Segmentation → Pose. User can delete any of these.

### Compositor

Single column for now. N layers (default 4, architecture supports arbitrary N).

```
Layer 4: [thumbnail] [name] [source/tap picker] [opacity slider] [blend dropdown]
Layer 3: [thumbnail] [name] [source/tap picker] [opacity slider] [blend dropdown]
Layer 2: [thumbnail] [name] [source/tap picker] [opacity slider] [blend dropdown]
Layer 1: [thumbnail] [name] [source/tap picker] [opacity slider] [blend dropdown]
```

**Layer state:**
```lua
{
  sourceColumn = 1,       -- which column in the clip grid
  tapIndex = 2,           -- which tap (0 = raw, 1 = post-FX1, etc.)
  blendMode = "normal",   -- normal, add, multiply, screen, difference, overlay
  opacity = 1.0,
  visible = true,
  name = "Layer 1",
}
```

**Blend modes:** Reuse existing composite blend ops from `CompositeSurfaceProvider`: normal, add, screen, multiply, overlay, difference. All alpha-aware.

**Click interaction:**
- **Click layer** = select it. Overlay appears with source picker icon. Param viewer shows layer params (blend mode, opacity, source/tap).
- **Click source picker icon** = nested submenu:
  - Level 1: pick source (all source clips in base row)
  - Level 2: pick tap (all available taps for that source)
- **Layer thumbnail:** Shows live preview of what that layer is outputting.

**Future: 2-column compositor:** Each column is a sub-composition. Column A output blends with Column B output at master opacity. This enables parallel mixing. Not in MVP.

### Sampler Integration

The sampler is a **source clip** that appears in the base row. It is decoupled from the clip grid conceptually — it just happens to be a source.

- **Sampler output** = a source clip in the base row. It can be referenced by compositor layers and FX stacks like any source.
- **Sampler input** = selected via right-click → "Set Input" → nested menu: pick stack column → pick tap. The sampler captures from that tap.
- **Sampler params** = capture window, retro/free mode, trigger, play/stop. Existing AVSamplerLab behavior reused.
- **MIDI** triggers the sampler's playback (note on/off, velocity). The sampler output then feeds into the compositor.
- **Sampler output as FX input:** The sampler's output can also feed back into an FX stack as a source. This enables resampling effects.

### Param Viewer

Context-sensitive panel inside the ImGui DockSpace. Shares DockSpace with clip grid so they snap together.

**Layout:**
```
┌─────────────────────────────────────┐
│ Current Selection: Webcam + Pose    │  ← always at top, shows selected clip/layer
│ [param1] [param2] [param3] ...      │
├─────────────────────────────────────┤
│ 📌 Pinned: Webcam Params            │  ← pinned sections stay visible
│ [param1] [param2] ...               │
├─────────────────────────────────────┤
│ 👁 FX: Segmentation                 │  ← eye sections show when source is selected
│ [threshold] [feather] ...           │
├─────────────────────────────────────┤
│ 📌 Pinned: Layer 2 (Compositor)     │  ← can pin compositor layers too
│ [opacity] [blend mode] ...          │
└─────────────────────────────────────┘
```

**Param section types:**
| Source | Shows |
|--------|-------|
| Source clip | Source-specific params (webcam device, generator params, file path) |
| FX clip | FX-specific params (shader uniforms, ML threshold/gain/feather, etc.) |
| Compositor layer | Source/tap picker, opacity slider, blend mode dropdown |
| Sampler | Capture window, retro/free mode, trigger, play controls |

**Eye vs Pin:**
- **Eye** (👁): Section shows only when that clip/layer is selected. Disappears when you select something else.
- **Pin** (📌): Section stays visible regardless of selection. Scrollable list of all pinned sections.

**Pinning interaction:** Each param section has an eye icon and a pin icon in its header. Click eye = toggle visibility-on-selection. Click pin = toggle always-visible.

### Preview Windows

User-defined, not hardcoded. Spawned from clip overlay or param viewer.

- Each preview is a small Canvas Panel with a `video_input` surface
- Pointed at any tap in any stack
- Label is user-defined
- Can be moved, resized, closed
- **Default previews (3 views):** The existing raw webcam, segmented, and pose views become default previews that auto-spawn on first open. These are NOT hardcoded UI elements — they are just default preview windows that users can close or reconfigure.

**Preview interaction:** Right-click preview → "Set Source" → nested menu: pick stack column → pick tap. Or drag from clip overlay.

---

## UI Layout Architecture

### ImGui Surface

One `defineSurface` call creates the main tools surface:

```lua
shell:defineSurface("avTools", {
  id = "avTools",
  kind = "tool",
  backend = "imgui",
  visible = true,
  bounds = { x = 0, y = 0, w = 1600, h = 1000 },
  z = 50,
  mode = "global",
  docking = "fill",
  interactive = true,
  modal = false,
  payloadKey = "avTools",
  title = "AVSampler",
})
```

Inside this surface, Lua draws ImGui windows that dock to each other:
- `ClipGrid` window
- `ParamViewer` window

**Why one surface, not multiple?** `ImGuiDirectHost` creates one ImGui context per host. Each `defineSurface` with `backend = "imgui"` becomes its own host. Two separate surfaces cannot share a DockSpace. To get snapping between clip grid and param viewer, they must be in the same ImGui context.

### Canvas Integration

Canvas widgets render inside ImGui windows via the existing `RuntimeNodeRenderer` + `ImGuiDirectHost` pipeline.

- The `onImGuiFrame` callback on the root RuntimeNode fires inside the ImGui render loop
- Lua can draw ImGui commands (Begin, End, Table, etc.)
- Canvas nodes (Panels with surfaces) are rendered as `drawImage` commands using the surface provider texture handles
- The main output viewport is a Canvas Panel in the main UI tree, NOT in the ImGui surface

**Key binding needed:** `imguiSurfaceImage(surfaceType, payload, w, h)` — draws a Canvas surface inside an ImGui window at the current cursor position.

### Main Output Viewport

The composited output is NOT in the ImGui surface. It is a Canvas Panel in the main UI tree with a `gpu_composite` surface. This is the big video output the user watches. It lives behind or alongside the ImGui tool windows.

---

## Interaction Model Detail

### Adding a Source

1. Right-click empty base cell → "Add Source" → nested submenu
2. Options:
   - Webcam → spawns device picker dialog
   - Sampler → creates sampler source clip
   - Generator → nested submenu (plasma, noise, etc.)
   - File → file browser dialog
3. Source appears in base cell with live thumbnail
4. Icons appear on cell showing usage (if assigned to compositor)

### Adding FX to a Source

1. Click source cell → select it
2. Right-click cell above it (or empty cell above) → "Add FX"
3. Nested submenu with categories:
   - Shaders → list from `shaders.listEffects()`
   - ML → Segmentation, Pose, Depth
   - Color → Brightness, Contrast, Hue, etc.
4. FX appears above with thumbnail showing processed output

### Assigning to Compositor

1. Click compositor layer → select it
2. Click source picker icon in overlay
3. Nested submenu:
   - Level 1: list all source clips in base row
   - Level 2: list all available taps for selected source
4. Layer now shows that tap's output
5. Icon on the source clip updates to show it's used in compositor layer N

### Sampler Capture Flow

1. Sampler source clip exists in base row (or user creates one)
2. Right-click sampler → "Set Input" → nested menu
3. Pick stack column → pick tap
4. Trigger sampler via MIDI note or UI button
5. Sampler captures from that tap, plays back
6. Sampler output (a new source clip) appears in base row or updates existing

### Deleting a Source

1. Right-click source → "Delete"
2. Source removed from base row
3. FX clips above it become orphaned (dimmed, warning icon)
4. Compositor layers referencing this source show "missing source" state
5. If a new source is added in the same column, orphaned FX re-attach

---

## Existing Code to Leverage

### Surface / Rendering

| File | Role |
|------|------|
| `manifold/primitives/shaders/ShaderSurfaceProvider.h/.cpp` | `gpu_shader` surface; effect pipeline rendering |
| `manifold/primitives/composite/CompositeSurfaceProvider.h/.cpp` | `gpu_composite` surface; blend modes with alpha |
| `manifold/primitives/video/VideoSurfaceProvider.h/.cpp` | `video_input` surface; live webcam or sampler playback |
| `manifold/primitives/ml/MLMaskSurfaceProvider.h/.cpp` | `ml_composite` surface; segmentation with transparent bg |
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | Renders ImGui on top of Canvas; handles surface textures |
| `manifold/ui/imgui/RuntimeNodeRenderer.cpp` | Renders Canvas nodes as ImGui draw commands |

### Scripting / UI

| File | Role |
|------|------|
| `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | `ml.load()`, `ml.infer()`, `shaders.buildPipeline()`, `shaders.listEffects()`, `sources.list()` |
| `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp` | `setOnImGuiFrame()`, `setCustomSurface()` |
| `manifold/ui/layout_engine.lua` | `stack-x`, `stack-y`, `grid`, `overlay` layouts for Canvas widgets inside ImGui windows |
| `manifold/ui/shell/methods_core.lua` | `shell:defineSurface()`, `shell:updateSurface()` |

### Reference Projects

| Project | What It Proves |
|---------|----------------|
| `UserScripts/projects/WebcamViewer/` | `shaders.buildPipeline()`, A/B shader stacks, `gpu_composite`, `ml_composite` |
| `UserScripts/projects/MLLab/` | MoveNet pose, `ml.infer()`, skeleton overlay, keypoint publishing |
| `UserScripts/projects/VideoSamplerLab/` | Mono sampler, audio-synced capture, MIDI trigger, `video_input` surface |
| `UserScripts/projects/VideoPolySamplerLab/` | 8-voice poly, shared capture, per-voice `SampleRegionPlaybackNode` |
| `UserScripts/projects/DspLiveScripting/` | `shell:defineSurface()` with `backend = "imgui"`, `docking = "fill"` |
| `UserScripts/projects/AVSamplerLab/` | Existing (to be replaced) — webcam, segmentation, pose, shader, mapping, FX rack |

---

## ImGui Bindings Gap Analysis

**Currently exposed to Lua (`LuaControlBindings.cpp`):**
- `imguiButton`, `imguiText`, `imguiSameLine`, `imguiSelectable`
- `imguiBeginMainMenuBar`, `imguiBeginMenu`, `imguiBeginPopup`
- `imguiPushStyleColor`, `imguiSetNextWindowSize/Pos`
- `imguiSeparator`, `imguiMenuItem`

**Must add for this redesign:**

| Binding | Purpose |
|---------|---------|
| `imguiBegin(title, flags)` / `imguiEnd()` | Create ImGui windows for clip grid, param viewer |
| `imguiBeginChild(id, w, h, border, flags)` / `imguiEndChild()` | Scrollable regions inside windows |
| `imguiBeginTable(id, columns, flags)` / `imguiEndTable()` | The clip grid itself |
| `imguiTableNextRow()` / `imguiTableNextColumn()` | Iterating grid cells |
| `imguiTableSetupColumn(label, flags, width)` | Column sizing |
| `imguiSliderFloat(label, value, min, max)` | Param sliders |
| `imguiDragFloat(label, value, speed, min, max)` | Fine-grained params |
| `imguiInputFloat(label, value)` | Numeric input |
| `imguiInputText(label, text, maxLength)` | Text input (names, file paths) |
| `imguiCheckbox(label, value)` | Toggle params |
| `imguiBeginCombo(label, preview)` / `imguiEndCombo()` | Dropdowns (blend modes, source picker) |
| `imguiSelectable(label, selected, flags, w, h)` | Already exists, used for grid cells |
| `imguiDockSpace(id, size, flags)` | Create dockable region |
| `imguiDockSpaceOverViewport(id, flags)` | Full-viewport dock space |
| `imguiSurfaceImage(surfaceType, payload, w, h)` | Draw Canvas surface inside ImGui window |
| `imguiIsItemClicked(button)` / `imguiIsItemHovered()` | Click detection on cells |
| `imguiGetMousePos()` / `imguiGetWindowPos()` | Positioning overlays |
| `imguiPushStyleVar(idx, value)` / `imguiPopStyleVar(count)` | Styling |
| `imguiPushID(id)` / `imguiPopID()` | ID scopes for duplicate widgets |
| `imguiGetContentRegionAvail()` | Already exists — query remaining space |

**Note on `imguiSurfaceImage`:** This needs a hook in `ImGuiDirectHost` to resolve surface type + payload to a texture handle. The surface providers already upload GPU textures. We need to expose the resolution function to the Lua callback context.

---

## Data Model

### Lua State Tables (Behavior Script)

```lua
-- Clip pool grid: columns are independent stacks
-- clips[col][row] where row 1 = base (source), row 2+ = FX
ctx.clips = {
  [1] = {
    [1] = { kind = "source", sourceType = "webcam", name = "Webcam", params = { device = 0 } },
    [2] = { kind = "fx", fxType = "segmentation", name = "Segment", params = { threshold = 0.5, feather = 0.15 } },
    [3] = { kind = "fx", fxType = "pose", name = "Pose", params = { confidence = 0.3 } },
  },
  [2] = {
    [1] = { kind = "source", sourceType = "sampler", name = "Sampler", params = {} },
  },
  -- ...
}

-- Compositor layers. 1 = bottom (first blended), N = top.
ctx.layers = {
  {
    sourceColumn = 1,
    tapIndex = 0,        -- 0 = raw source, 1 = post-FX1, etc.
    blendMode = "normal",
    opacity = 1.0,
    visible = true,
    name = "Layer 1",
  },
  {
    sourceColumn = 1,
    tapIndex = 3,        -- post all FX
    blendMode = "screen",
    opacity = 0.5,
    visible = true,
    name = "Layer 2",
  },
  -- ... up to N layers
}

-- Current selection
ctx.selection = {
  kind = "clip",       -- "clip", "layer", "preview"
  column = 1,          -- for clips
  row = 1,             -- for clips
  layerIndex = nil,    -- for layers
}

-- Pinned param sections
ctx.pinnedParams = {
  { kind = "clip", column = 1, row = 1 },
  { kind = "layer", layerIndex = 2 },
}

-- Preview windows
ctx.previews = {
  {
    id = "preview_raw",
    label = "Raw",
    column = 1,
    tapIndex = 0,
    visible = true,
  },
  {
    id = "preview_seg",
    label = "Segmented",
    column = 1,
    tapIndex = 1,
    visible = true,
  },
  {
    id = "preview_pose",
    label = "Pose",
    column = 1,
    tapIndex = 2,
    visible = true,
  },
}

-- Sampler state (reused from existing AVSamplerLab)
ctx.sampler = {
  inputColumn = 1,
  inputTapIndex = 2,
  captureSeconds = 4,
  mode = "retro",      -- "retro" or "free"
  -- ... existing sampler params
}
```

---

## Open Questions

1. **Tap naming:** Auto-generated ("Webcam + Segmentation") or just "Tap 1", "Tap 2"? Probably show both.
2. **Default source count:** How many empty source slots on first open? 4? 8?
3. **Grid density:** Fixed cell size in pixels, or responsive to window size?
4. **Compositing implementation:** Use existing `CompositeSurfaceProvider` with multiple inputs, or write a custom fullscreen compositor shader?
5. **State persistence:** New JSON format, or extend existing `.av_sampler_lab.state`?
6. **ML FX outputs:** Segmentation = RGBA, Pose = RGBA skeleton, Depth = grayscale/heatmap. Standardize all to RGBA? Yes for now.
7. **Icons:** Custom icons for clip overlay actions? Or text labels? Text labels are fine for MVP.
8. **Preview window limits:** Max N previews? Or unlimited? Unlimited, but performance may degrade.
9. **2-column compositor:** When do we add this? After single-column is solid.
10. **Drag-and-drop:** Future feature after MVP. Nested menu is primary interaction.
11. **Audio FX rack:** Keep existing post-mix FX rack? Or move FX into the clip grid model? Keep existing rack as master bus FX.
12. **MIDI mapping:** How does MIDI note map to sampler trigger vs compositor layer mute/solo? Sampler only for now.

---

## File Changes Summary

| File | Action |
|------|--------|
| `UserScripts/projects/AVSamplerLab/ui/main.ui.lua` | Complete rewrite — minimal Canvas tree, main output viewport only |
| `UserScripts/projects/AVSamplerLab/ui/behaviors/main.lua` | Major refactor — clip/layer model, compositor, ImGui window drawing, param viewer |
| `UserScripts/projects/AVSamplerLab/dsp/default_dsp.lua` | Likely stays similar; may add second FX rack for per-source vs master FX |
| `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | Add ImGui bindings (Begin/End, Table, Slider, DockSpace, SurfaceImage) |
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | Add surface texture resolution hook for `imguiSurfaceImage` |

---

## Quality Checks

- **Independence:** This plan does not depend on unbuilt C++ features. ImGui bindings must be added first, but that's scoped.
- **Observability:** Each slice should have visible behavior. The clip grid shows thumbnails. The compositor shows blended output.
- **No horizontal layers:** Don't build "all UI" or "all DSP" first. Build end-to-end features.
- **Acyclic dependencies:** Layout shell → clip grid → compositor → param viewer → FX assignment → sampler integration.
- **Concrete acceptance:** Each slice has a "done when" tied to visible/audible behavior.
