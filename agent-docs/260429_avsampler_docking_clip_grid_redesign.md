# AVSampler DOCKING — Clip Grid, Compositor & Param Viewer Redesign

**Date:** 2026-04-29
**Source:** Conversation analysis comparing existing `avsamplerDOCKING` against `260427_avsampler_clip_grid_compositor_plan.md`
**Author:** Agent
**Status:** DESIGN — detailed implementation reference for the clip grid + compositor + param viewer refactor

---

## Core Realizations

This document supersedes assumptions from earlier planning sessions. The following points are critical context:

### The existing docking layout is correct

`avsamplerDOCKING` has five docked ImGui panels (Deck, Stage/Output, Capture/Sources, Waveform, Parameters/Inspector) with three layout presets (deck, stage, inspector). **None of this shell needs to change.** The layout system, toolbar, panel management, and ImGui DockSpace infrastructure are all production-ready. The refactor is about what renders *inside* these panels, not the panels themselves.

### What's real vs what's placeholder

**Real and functional (just needs wiring):**
- Webcam capture, device selection, ML models (segmentation, pose)
- Shader pipeline (`shaders.buildPipeline()`) with 8 layers × 9 params — layers are processed **sequentially**, each chaining off the previous. This IS the tap model already.
- Source selection (webcam or generators like FBM, Noise, Plasma, Checker) — generators now expose their params properly
- Sampler (capture, polyphonic/sliced playback, waveform)
- FX rack (embedded from Main project's `fx_slot` component)
- ImGui docking with window persistence, layout presets
- `imguiRetainedPanel` for embedding Canvas RuntimeNodes inside ImGui windows
- Source param sliders (sourceParam1-4) now working with normalized↔display range mapping
- Double-click reset on sliders
- Text clipping on dropdown/display list drawText

**Placeholder / needs full replacement:**
- **Deck panel content** — the 3×8 voice playback cell visualization is a placeholder. Must become the clip pool grid.
- **Param viewer** — currently static sections (transport, poly/slice, shader, mapping, fx). Must become context-sensitive with eye/pin.
- **Compositor** — doesn't exist. Only one sequential shader chain feeds the stage output. No multi-layer compositing.

### Everything renders inside one ImGui host

The `avsamplerDOCKING` project uses a single `defineSurface` with `backend = "imgui"` and `docking = "fill"`. All docked panels share one ImGui context and one DockSpace. This is correct and matches the plan's requirement for shared docking between clip grid and param viewer.

---

## Architecture

### High-Level Data Flow

```
Webcam / Generators / Sampler Output
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│ Clip Pool Grid (columns of sequentially chained FX)       │
│                                                           │
│ Column 1:  Webcam → Segmentation → Pose → Glitch          │
│ Column 2:  Sampler → Chromatic → Edge Glow               │
│ Column 3:  Generator (Noise)                              │
│ Column 4:  (empty)                                        │
│                                                           │
│ Each column outputs N+1 taps (raw + each FX stage).       │
└──────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│ Compositor (layer stack, N layers, default 4)             │
│                                                           │
│ Layer 4: [tap picker] [blend mode] [opacity]              │
│ Layer 3: [tap picker] [blend mode] [opacity]              │
│ Layer 2: [tap picker] [blend mode] [opacity]              │
│ Layer 1: [tap picker] [blend mode] [opacity]              │
│                                                           │
│ Outputs a single blended result via CompositeSurface.      │
└──────────────────────────────────────────────────────────┘
    │
    ▼
Main Output Viewport (Canvas Panel with `gpu_composite` surface)
```

### The Clip Pool Grid

A scrollable grid of cells. Each **column** is an independent signal processing chain. Each **row** is a sequential stage in that chain.

```
            scroll direction ────►
        ┌─────┬─────┬─────┬─────┬─────┐
        │FX3  │FX3  │FX3  │FX3  │  +  │  ◄── stack FX upward
        ├─────┼─────┼─────┼─────┼─────┤       (empty cells = add)
        │FX2  │FX2  │FX2  │     │     │
        ├─────┼─────┼─────┼─────┼─────┤
        │FX1  │FX1  │     │     │     │
        ├─────┼─────┼─────┼─────┼─────┤
        │SRC  │SRC  │SRC  │     │     │  ◄── base row: sources only
        └─────┴─────┴─────┴─────┴─────┘
```

#### Three Grid Alignments

The grid can be flipped to any of three orientations. The data model (`clips[col][row]`) doesn't change — only the render loop transposes axes.

| Alignment | Source position | FX direction | Use case |
|-----------|---------------|--------------|----------|
| **Bottom-up** | Bottom row | Stack upward | Default, traditional mixer/channel strip metaphor |
| **Left-to-right** | Left column | Extend right | Wide monitors, horizontal scrolling |
| **Top-down** | Top row | Stack downward | Compact desk setups, inspector-style |

A **grid toolbar** (embedded in the deck panel's header or as an internal row) lets the user switch alignment. The toolbar could also expose:
- Grid density / cell size preset
- Show/hide empty cells
- Scroll direction indicator
- Number of source columns

#### Cell Data Model

```lua
-- clips[col][row] where row 1 = source, row 2+ = FX
ctx.clips = {
  [1] = {
    [1] = { kind = "source", sourceType = "webcam",  name = "Webcam",  params = { device = 0 } },
    [2] = { kind = "fx",     fxType = "segmentation", name = "Seg",    params = { threshold = 0.5, feather = 0.15 } },
    [3] = { kind = "fx",     fxType = "pose",         name = "Pose",   params = { confidence = 0.3 } },
  },
  [2] = {
    [1] = { kind = "source", sourceType = "generator", name = "Noise", params = { scale = 12, speed = 0.8, contrast = 1.0 } },
  },
  -- ...
}
```

#### Cell Visuals

- Each cell shows a **live thumbnail** of that tap's output
- Source cells show base input (webcam, generator output, sampler playback)
- FX cells show the result AFTER that FX is applied to the source + preceding FX chain below it
- Selected cells show a highlighted border
- Orphaned FX (source deleted below them) show dimmed/grayed with a "no source" indicator
- Empty cells show a "+" or "Add" placeholder

#### Taps

Each column has N+1 taps (N = number of FX clips):

```
Tap 0: Raw source output
Tap 1: Post-FX1
Tap 2: Post-FX2
...
Tap N: Post-FXN (final column output)
```

Taps are what the compositor references. Tap naming should show both:
- Auto-generated: "Webcam + Segmentation + Pose"
- Index: "Tap 2"

#### Adding/Removing Clips

- **Add source:** Right-click empty base cell → "Add Source" → nested menu (Webcam, Sampler, Generator → submenu, File → browser)
- **Add FX:** Right-click cell above a source/existing FX → "Add FX" → nested menu with categories (Shaders, ML, Color)
- **Remove:** Right-click → "Delete". Source deletion orphans FX above; compositor layers referencing orphaned taps show "missing source"

#### Click Interaction

- **Left-click** = select cell. Overlay appears with action icons (preview, assign to compositor, pin params, delete)
- **Right-click** = context menu with nested submenus (Add FX above, Delete, Set as Sampler Input, Rename, etc.)

---

### The Compositor

A 1-column layer stack (N layers, default 4, architecture supports arbitrary N). Each layer picks a tap from any column and blends it with the layer below.

```
Layer 4: [thumbnail] [name] [source/tap picker▼] [opacity━━━] [blend▼]
Layer 3: [thumbnail] [name] [source/tap picker▼] [opacity━━━] [blend▼]
Layer 2: [thumbnail] [name] [source/tap picker▼] [opacity━━━] [blend▼]
Layer 1: [thumbnail] [name] [source/tap picker▼] [opacity━━━] [blend▼]
```

#### Layer State

```lua
ctx.layers = {
  {
    sourceColumn = 1,
    tapIndex = 0,        -- 0 = raw, 1 = post-FX1, etc.
    blendMode = "normal",
    opacity = 1.0,
    visible = true,
    name = "Layer 1",
  },
  -- ... up to N layers
}
```

#### Blend Modes

Reuse existing composite blend ops from `CompositeSurfaceProvider`:
- normal, add, screen, multiply, overlay, difference, etc.
- All alpha-aware

#### Compositor Placement

The compositor could live:
1. **Inside the deck panel** — as a strip below or to the side of the grid
2. **Inside the stage panel** — as an overlay or side panel next to the output viewport
3. **As its own docked window** — spawned from the toolbar, dockable anywhere

Decision deferred until implementation — the docked window approach is most flexible and matches the "cheap to create" ImGui dock window philosophy.

#### Compositing Implementation

Use the existing `CompositeSurfaceProvider` with dynamic input count. Each compositor layer produces a texture (via the shader/fx pipeline for its chosen tap), and the compositor blends them bottom-to-top:

```
Layer 4 texture → CompositeProvider.blend(layer3_output, layer4, layer4.blendMode, layer4.opacity)
    → output to layer3 input
...repeat down to Layer 1
    → final output to gpu_composite surface
```

---

### The Param Viewer

The params panel (currently in the "Parameters / Inspector" dock window) becomes context-sensitive. Instead of static sections, it shows param sections based on current selection and pinned state.

#### Section Types

| Source | Shows |
|--------|-------|
| Source clip (when selected) | Source-specific params: webcam device, generator params, sampler controls |
| FX clip (when selected) | FX-specific params: shader uniforms, ML thresholds/gain/feather |
| Compositor layer (when selected) | Source/tap picker, opacity slider, blend mode dropdown |
| Sampler (when selected) | Capture window, retro/free mode, trigger, play/stop |

#### Eye & Pin Model

- **Eye (👁):** Section visible only when that clip/layer is selected. Disappears on selection change.
- **Pin (📌):** Section stays visible regardless of selection. Scrollable list of all pinned sections.

Each param section header has eye and pin icons. Click to toggle.

#### ImGui Sub-Docking for Params

Current params panel renders all sections stacked vertically. With ImGui sub-docking, the params panel becomes its own internal DockSpace:

```
┌─────────────────────────────────────┐
│ Parameters/Inspector (ImGui Dock)   │
│ ┌──────────────────┐ ┌──────────┐  │
│ │ Current Selection │ │ Pinned   │  │
│ │ (docking window)  │ │ (docking │  │
│ │                   │ │  window) │  │
│ └──────────────────┘ └──────────┘  │
│ ┌──────────────────────────────┐   │
│ │ Pinned: Webcam Params        │   │
│ │ (docking window, user move)  │   │
│ └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

Users can rearrange, resize, tear off, or close each param section independently. Same dock infrastructure as the main panels, just nested.

---

### Preview Windows

Currently the deck/stage/sources panels have hardcoded viewports (raw webcam, segmented, pose, preview stage). These should become **spawnable ImGui docking windows**.

A preview window is:
- A small ImGui dock window (no title bar, minimal chrome)
- Contains a `video_input` surface rendered via `imguiRetainedPanel`
- Points at any tap from any column
- User can rename, resize, close, or re-point it
- Default: 3 previews spawn on first open (raw, segmented, pose)

**Spawn mechanism:** Right-click any cell → "Preview this tap" → new preview window appears. Or use the toolbar.

---

### Selection Model

```lua
ctx.selection = {
  kind = "clip",           -- "clip", "layer", "preview"
  column = 1,              -- for clips
  row = 1,                 -- for clips (1 = source)
  layerIndex = nil,        -- for layers
}

ctx.pinnedParams = {
  { kind = "clip", column = 1, row = 1 },
  { kind = "layer", layerIndex = 2 },
}
```

Selection is the bridge between the grid and the param viewer. When a cell is clicked, `ctx.selection` updates, and the param viewer re-renders to show that clip's params. Pinned sections persist independently.

---

## Infrastructure Needed

### What exists and can be reused

| Component | Status |
|-----------|--------|
| `ImGuiDirectHost` with single-context DockSpace | ✅ Working |
| `imguiDockBuilderSplitNode`, `imguiDockBuilderDockWindow` | ✅ Working |
| `imguiRetainedPanel(node, w, h, fit)` | ✅ Working — renders Canvas RuntimeNode inside ImGui window |
| `shaders.buildPipeline(layers, fitMode, source)` | ✅ Working — builds sequential FX chain for a source+tap |
| `CompositeSurfaceProvider` with blend modes | ✅ Working |
| `sources.list()` returning generator specs with params | ✅ Working |
| `shaders.listEffects()` returning effect specs with params | ✅ Working |
| `ml.infer()` for segmentation/pose | ✅ Working |
| `video_input` surface for webcam/sampler playback | ✅ Working |
| Slider widget with normalized↔display range mapping | ✅ Fixed |
| Double-click reset on sliders | ✅ Fixed in `ImGuiDirectHost.cpp` |
| Text clipping on compiled DrawText | ✅ Fixed in `ImGuiDirectHost.cpp` |
| Source param sliders with proper range mapping | ✅ Fixed |

### Video Viewports as ImGui Dock Windows

**Current state:** The Sources, Stage, and Waveform dock panels contain hardcoded Canvas viewport widgets (liveViewport, segViewport, poseViewport, outputViewport, previewStage, waveform) positioned absolutely inside their parent embed panels via `setBounds()` calls in `layoutInputsEmbed()`, `layoutStageEmbed()`, etc.

**Target state:** Every video surface viewport becomes its own ImGui docking window inside the relevant dock panel. Users can rearrange, resize, tear off, or close them freely.

#### Why

- Users may want the composited output viewport larger and the source previews smaller
- A user doing heavy ML work might want all three ML viewports (raw, segmented, pose) visible at once in a 2×2 grid
- A user doing shader design might want the output viewport to fill the stage panel entirely and previews minimized
- Tearing a preview out of the dock into its own floating window is natural ImGui behavior
- Zero extra cost — ImGui docking already exists, `imguiRetainedPanel` already renders surfaces inside ImGui windows

#### How

Each viewport becomes a dedicated ImGui dock window spawned inside the relevant parent panel's DockSpace:

```lua
local function renderViewportDockWindows(ctx, parentDockspaceId)
  -- Stage panel windows
  if imguiBegin("Output###AVSD_output_viewport", imguiWindowFlags_NoTitleBar) then
    imguiRetainedPanel(ctx.widgets.outputViewport.node,
      imguiGetContentRegionAvail().x, imguiGetContentRegionAvail().y, true)
  end
  imguiEnd()

  if imguiBegin("Preview###AVSD_preview_viewport", imguiWindowFlags_NoTitleBar) then
    imguiRetainedPanel(ctx.widgets.previewStage.node,
      imguiGetContentRegionAvail().x, imguiGetContentRegionAvail().y, true)
  end
  imguiEnd()

  -- Sources panel windows
  if imguiBegin("Raw###AVSD_raw_viewport", imguiWindowFlags_NoTitleBar) then
    imguiRetainedPanel(ctx.widgets.liveViewport.node,
      imguiGetContentRegionAvail().x, imguiGetContentRegionAvail().y, true)
  end
  imguiEnd()
  -- ... seg, pose, waveform, etc.
end
```

#### What this replaces

The current `renderEmbeddedPanel()` pattern for Sources, Stage, and Waveform panels calls a single `layoutXxxEmbed()` function that positions all viewports via `setBounds()`. With dock windows, the embed panel just creates an internal DockSpace and the viewports dock into it. The `layoutXxxEmbed()` functions shrink to just setting up the DockSpace.

#### Layout transition

On first load, auto-dock the viewports into sensible default positions that match the current layout. This preserves backward compatibility. Users who don't rearrange anything see the same arrangement they had before. Users who want to customize just drag the window tabs.

#### Dock window IDs

Each viewport gets a stable `###AVSD_...` ID so ImGui remembers their docking positions across sessions:
- `Output###AVSD_output_viewport`
- `Preview###AVSD_preview_viewport`
- `Live###AVSD_live_viewport`
- `Segmented###AVSD_seg_viewport`
- `Pose###AVSD_pose_viewport`
- `Waveform###AVSD_waveform_viewport`

### What needs to be added or modified

#### 1. Grid layout + rendering (inside deck panel)

The deck panel currently renders a 3×8 voice playback grid with labels and thumbnails. This entire `layoutDeckEmbed` function (~130 lines) needs to be replaced with the clip pool grid renderer.

**New function: `layoutClipGrid(ctx, w, h)`**

Responsibilities:
- Read `ctx.gridAlignment` (bottom-up, left-to-right, top-down)
- Compute cell sizes based on available space and number of columns/rows
- Render each cell as an interactive ImGui element:
  - Source cell: dropdown for source type + live thumbnail
  - FX cell: dropdown for FX effect + live thumbnail of processed output
  - Empty cell: "+" placeholder with right-click → "Add" menu
- Handle click → selection → overlay display
- Handle right-click → context menu

**Cell rendering:** Each cell is rendered via `imguiRetainedPanel` with a Canvas Panel node that has:
- A `video_input` surface for the thumbnail (pointed at the appropriate tap)
- Overlay display list for selection state, icons, name label

**Thumbnail rendering:** Each tap in a column produces a texture. FX cell thumbnails show the source + all FX below them (sequential rendering). The shader pipeline already does this — the issue is rendering N independent pipelines (one per column) instead of just one.

**Key decision:** Render all column pipelines to textures every frame, or render on demand. For N columns with M FX each, we need N pipelines rendering simultaneously. The `gpu_shader` surface provider already handles multiple instances via node stable IDs, so parallel rendering is feasible.

#### 2. Multi-column shader pipeline

Currently, `updateShader()` builds one pipeline for the active layer's source + effects. The grid model needs one pipeline per column.

**New function: `renderColumnTap(ctx, col, tapIndex)` → texture handle**

For each column:
1. Identify the source clip at row 1
2. Build a sequential pipeline of all FX clips from row 2 up to `tapIndex`
3. Execute the pipeline via `shaders.buildPipeline()`
4. Return the resulting texture handle

This can be called lazily — only for columns that have visible cells or are referenced by the compositor.

**Optimization:** Cache pipeline results per column and re-render only when params change. The existing versioning on shader params already supports this pattern.

#### 3. Compositor rendering

**New function: `renderCompositor(ctx)` → texture handle**

1. For each compositor layer (bottom to top):
   a. Get the tap texture via `renderColumnTap(ctx, layer.sourceColumn, layer.tapIndex)`
   b. Blend with the accumulated result using `layer.blendMode` and `layer.opacity`
2. Set the final result on the stage viewport's `gpu_composite` surface

**CompositeSurfaceProvider integration:** The existing compositor blends two textures at a time. For N layers, blend sequentially: layer1 → layer2 → layer3 → layer4. Each blend step uses the provider's existing two-input pipeline.

#### 4. Context-sensitive param viewer

Replace the current static sections in `renderParametersPanel()` with a dynamic system:

```lua
local function renderParamSections(ctx)
  -- Always show section for selected item
  if ctx.selection.kind == "clip" then
    renderClipParams(ctx, ctx.selection.column, ctx.selection.row)
  elseif ctx.selection.kind == "layer" then
    renderLayerParams(ctx, ctx.selection.layerIndex)
  end

  -- Show pinned sections
  for _, pin in ipairs(ctx.pinnedParams) do
    if pin.kind == "clip" then
      renderClipParams(ctx, pin.column, pin.row)  -- with pin indicator
    elseif pin.kind == "layer" then
      renderLayerParams(ctx, pin.layerIndex)       -- with pin indicator
    end
  end
end
```

Each param section is rendered inside an ImGui child window or collapsible header, with eye/pin icons in the header.

#### 5. ImGui sub-docking for params area

Modify the "Parameters / Inspector" dock window to contain its own internal DockSpace:

```lua
local function renderParametersPanel(ctx)
  local dockspaceId = imguiGetID("AVSD_ParamDockspace")
  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)

  -- Each param section becomes a dockable window
  for _, section in ipairs(currentParamSections(ctx)) do
    if imguiBegin("##param_section_" .. section.id, imguiWindowFlags_NoCollapse) then
      renderParamSection(section)
    end
    imguiEnd()
  end
end
```

This replaces the current static `imguiSeparatorText("Transport / MIDI")` + `renderEmbeddedPanel(...)` pattern.

#### 6. Preview windows as dock windows

Preview windows are spawned from the toolbar or cell overlays. Each preview is an ImGui dock window with an embedded `video_input` surface:

```lua
local function spawnPreview(ctx, column, tapIndex, label)
  local id = "avPreview_" .. tostring(#ctx.previews + 1)
  table.insert(ctx.previews, {
    id = id,
    label = label or ("Tap " .. tapIndex),
    column = column,
    tapIndex = tapIndex,
  })
  -- Layout sub will create the window and render the surface
end
```

In `renderFrame()`, iterate `ctx.previews` and render each as a dock window:

```lua
for _, preview in ipairs(ctx.previews) do
  if imguiBegin("Preview: " .. preview.label .. "###" .. preview.id, imguiWindowFlags_None) then
    local avail = imguiGetContentRegionAvail()
    -- Render the tap's output into this window
    local tex = resolveTapTexture(preview.column, preview.tapIndex)
    imguiImage(tex, avail.x, avail.y)  -- or imguiRetainedPanel with video_input
  end
  imguiEnd()
end
```

**Note:** `imguiImage(textureId, w, h)` doesn't exist yet in the Lua bindings. This needs to be added (or use the existing surface rendering via retained panels). Retained panel with `video_input` surface pointed at the tap's output is the cleaner approach.

#### 7. Nested submenu system

Right-click context menus need nested submenu support. The plan describes multi-level menus for:
- Adding sources (Source type → submenu for webcam/generator/file)
- Adding FX (Category → submenu for specific effects)
- Compositor layer tap picking (Source column → submenu for tap)

ImGui's `imguiBeginMenu` / `imguiMenuItem` are already bound. The pattern:

```lua
if imguiBeginMenu("Add FX") then
  if imguiBeginMenu("Shaders") then
    for _, effect in ipairs(ctx.effects) do
      if imguiMenuItem(effect.name) then
        addFxToCell(ctx, col, row, effect)
      end
    end
    imguiEndMenu()
  end
  if imguiBeginMenu("ML") then
    -- segmentation, pose, etc.
  end
  imguiEndMenu()
end
```

#### 8. Grid toolbar

A small toolbar at the top or side of the deck panel containing:

```lua
-- Alignment selector
if imguiBeginCombo("Align", currentAlignmentLabel) then
  if imguiSelectable("Bottom-Up") then ctx.gridAlignment = "bottom-up" end
  if imguiSelectable("Left-to-Right") then ctx.gridAlignment = "left-to-right" end
  if imguiSelectable("Top-Down") then ctx.gridAlignment = "top-down" end
  imguiEndCombo()
end

-- Grid controls
imguiSameLine()
if imguiButton("+ Column") then addEmptyColumn(ctx) end
imguiSameLine()
if imguiButton("Spawn Preview") then spawnPreviewDialog(ctx) end
```

---

## Data Model

### Initial State

```lua
-- Grid state
ctx.gridAlignment = "bottom-up"  -- "bottom-up" | "left-to-right" | "top-down"
ctx.clips = {}
ctx.nextColumnId = 1

-- Initialize with one webcam column on first open
ctx.clips[1] = { [1] = { kind = "source", sourceType = "webcam", name = "Webcam", params = { device = 0 } } }

-- Compositor
ctx.layers = {
  { sourceColumn = 1, tapIndex = 0, blendMode = "normal", opacity = 1.0, visible = true, name = "Layer 1" },
  { sourceColumn = 1, tapIndex = 1, blendMode = "normal", opacity = 1.0, visible = true, name = "Layer 2" },
  { sourceColumn = 1, tapIndex = 2, blendMode = "normal", opacity = 1.0, visible = true, name = "Layer 3" },
  { sourceColumn = 1, tapIndex = 3, blendMode = "screen", opacity = 0.5, visible = true, name = "Layer 4" },
}

-- Selection
ctx.selection = { kind = "clip", column = 1, row = 1 }
ctx.pinnedParams = {}

-- Preview windows
ctx.previews = {}

-- Sampler state (reuse existing)
-- ctx.sampler FROM EXISTING CODE
```

### Key Operations

| Operation | Effect |
|-----------|--------|
| Add source column | Insert new column with row 1 = source cell, empty FX above |
| Delete source column | Remove column. FX orphaned. Compositor layers referencing it show "missing". |
| Add FX to column | Insert FX cell above last non-empty row in column |
| Remove FX from column | Delete FX cell. Compositor layers referencing higher taps adjust. |
| Select cell | Update `ctx.selection`. Param viewer re-renders. Cell shows highlight. |
| Pin params | Add to `ctx.pinnedParams`. Section persists in param viewer. |
| Unpin params | Remove from `ctx.pinnedParams`. Section hides (unless it's the selected item). |
| Change alignment | Just update `ctx.gridAlignment`. Render loop transposes grid. |
| Spawn preview | Add to `ctx.previews`. New dock window appears. |
| Set sampler input | Pick column + tap. Sampler captures from that tap. |

---

## Files That Need Changes

### Primary — behavior rewrite

| File | What changes |
|------|-------------|
| `UserScripts/projects/avsamplerDOCKING/ui/behaviors/main.lua` | Major additions: grid model, compositor, tap resolution, context-sensitive params, nested menus, preview management, selection model, eye/pin. Much of the existing code (webcam, ML, shader, sampler, waveform, transport) stays — it just gets reorganized and wired into the grid/compositor model. |

### Primary — UI definition

| File | What changes |
|------|-------------|
| `UserScripts/projects/avsamplerDOCKING/ui/main.ui.lua` | The `deckChildren()` function (~130 rows of voice playback grid) gets replaced with a minimal clip grid container. `shaderChildren()` may need adjustment for the new param viewer. New components for compositor layers, preview windows, grid cells. |

### Binding additions (if needed)

| File | What changes |
|------|-------------|
| `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | May need: `imguiImage(textureId, w, h)` for direct texture rendering in preview windows, `imguiBeginChild`/`imguiEndChild` for scrollable grid regions, `imguiIsItemHovered`/`imguiIsItemClicked` for enhanced cell interaction. Check if these already exist. |

### No changes expected

| File | Reason |
|------|--------|
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | All needed infrastructure (retained panels, surface providers, docking) already works. Double-click fix already applied. |
| `manifold/ui/widgets/dropdown.lua` | Root node anchoring fix already applied. |
| `manifold/primitives/shaders/ShaderEffectRegistry.cpp` | Already using MANIFOLD_SOURCE_DIR. Returns correct param specs. |
| `manifold/primitives/sources/TextureSourceRegistry.cpp` | Already using MANIFOLD_SOURCE_DIR. Returns correct param specs. |

---

## Implementation Order (Recommended)

This is not prescriptive — just a dependency-ordered walk through the pieces.

### Phase 1: Data model + selection bridge

1. Add `ctx.clips`, `ctx.layers`, `ctx.selection`, `ctx.pinnedParams`, `ctx.previews`, `ctx.gridAlignment` to init
2. Wire selection changes to update the param viewer sections
3. Wire eye/pin toggles to param section visibility
4. Replace static param sections with dynamic `renderParamSections(ctx)`

**Done when:** Clicking a clip cell shows that clip's params. Pinning keeps them visible. Unselecting hides unpinned sections.

### Phase 2: Video viewports → ImGui dock windows

5. Replace `renderEmbeddedPanel()` / `layoutXxxEmbed()` for Sources, Stage, and Waveform panels with internal DockSpaces
6. Each viewport (liveViewport, segViewport, poseViewport, outputViewport, previewStage, waveform) becomes its own dock window with `imguiRetainedPanel` rendering
7. Set up default docking positions matching current layout
8. Wire up user-spawned preview windows using the same pattern (dock window + `video_input` surface)

**Done when:** Viewports are in ImGui dock windows that can be rearranged by dragging tabs. Default layout matches the old hardcoded positions.

### Phase 3: Grid rendering

9. Replace `layoutDeckEmbed()` with `layoutClipGrid()` that renders cells from `ctx.clips`
10. Implement the three alignment modes in the render loop
11. Cell thumbnails: render each tap's output via the shader pipeline
12. Empty cell placeholders with click-to-add

**Done when:** The deck panel shows a real grid with live thumbnails. Changing alignment reflows the grid. Empty cells show "+" and are clickable.

### Phase 4: Cell interaction

13. Left-click selects cell → overlay with action icons
14. Right-click context menu with nested submenus
15. Adding sources (webcam, sampler, generator, file)
16. Adding FX (shaders, ML, color → nested by category)
17. Deleting clips with orphan handling

**Done when:** Full Resolume-style interaction works. Sources and FX can be added/removed. Orphaned FX show correctly.

### Phase 5: Grid toolbar

18. Alignment picker in toolbar
19. Column add/remove
20. Preview spawn button

### Phase 6: Compositor

21. Compositor layer rendering inside the stage panel or as a dock window
22. Tap picker (nested menu: column → tap) on each compositor layer
23. Blend mode dropdown, opacity slider
24. Wire compositor output to the main stage viewport via `gpu_composite`

**Done when:** Adding layers with different taps and blend modes produces a blended output in the stage viewport.

### Phase 7: Polish

25. Tap naming (auto-generated labels)
26. Cell color customization
27. State persistence (save grid + compositor layout)
28. Performance optimization (cached column pipelines)

---

## Open Questions (for the user)

1. **Compositor placement:** Inside the deck panel? Stage panel? Own dock window? Or toggleable.
2. **Default grid state:** 4 source columns? 8? Just 1 with "add" cues?
3. **Cell size:** Fixed pixel size per cell, or responsive to window size? Fixed cells with grid scrolling is the more Resolume-like approach.
4. **Compositor layer count:** 4 default? Configurable?
5. **Preview limits:** Any max? Or unlimited with performance caveat?
6. **File sources:** Do we add file video/image loading now, or start with webcam + generators + sampler only?
7. **Per-column pipeline caching:** Cache column outputs until a param changes in that column, or re-render every frame?
8. **ML as FX:** Segmentation and pose need to be converted from hardcoded viewports to FX clip types that produce a processed texture. The `ml_composite` surface already exists. Just needs to be selectable as an FX type in the grid.
