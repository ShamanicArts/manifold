# AVSampler DOCKING — Compositor, Grid Edits & UI Plan

**Date:** 2026-04-29
**Source:** Design discussion following Phase 1–3 implementation (dock windows, clip grid, selection/inspectors, async ML)
**Status:** DESIGN — detailed spec for compositor and grid interaction refinements

---

## Core Architecture

### The Dock Space

All panels live in a single ImGui DockSpace. The five top-level dock windows (Deck, Stage, Capture/Sources, Waveform, Parameters/Inspector) are unchanged. The compositor, grid, and inspectors all render as ImGui dock windows or sub-windows within this same DockSpace, following the same pattern.

Panels that exist now:
- **Deck** — hosts the clip grid + compositor (default arrangement)
- **Stage** — hosts Output + Preview viewport dock windows
- **Sources** — hosts Live/Seg/Pose viewports + Controls dock windows
- **Waveform** — hosts the waveform viewport dock window
- **Parameters** — hosts Source inspector, Effect inspector, Transport, Mapping/FX sub-windows

### Interaction Pattern

Every cell type (source, FX, compositor layer) uses the same visual language and interaction model. No unique chrome per type. Position in the stack tells you what it is — no redundant labels beyond what the content itself communicates.

**Selection drives the inspectors.** Click a source cell → Source inspector shows source controls (device, generator params, ML params, aspect). Click an FX cell → Effect inspector shows effect selector + param sliders. Click a compositor layer → Effect inspector shows blend mode, opacity, tap picker. One inspector, context-switches based on selection kind.

---

## Grid Changes

### Pre-initialized Cells

Sources and FX slots are pre-initialized as real cells. No "+" to create a cell — just click and assign.

**Empty source cell:**
- Exists as a real, clickable cell in the grid
- Renders dimmed / dark with "No Source" label
- Selected? Shows selection border ring
- Click or select → Source inspector shows empty state: "No source — select one to assign"
- Assigning a source fills the cell with live video

**Empty FX cell:**
- Exists as a real, clickable cell
- Renders dimmed / dark with "+ Add FX" label
- Click → Effect inspector shows effect selector
- Assigning an effect fills the cell with processed thumbnail

**Data model:**
```lua
ctx.clips[col][1] = { kind = "source", sourceType = nil, params = {} }  -- empty but real
ctx.clips[col][row+1] = { kind = "fx", effectIndex = nil, params = {}, enabled = false }  -- empty but real
```

Columns start with 1 empty source + 8 empty FX slots. A column with no source assigned simply shows the empty grid cell. No "+" to initialize it — the cell is already there.

### What "+" Means (Structural Growth)

The "+" icon/button is exclusively for adding new structure:

- **New column (+Col):** Adds a new column to the grid. That column starts with 1 empty source + 8 empty FX slots. The "+Col" button is in the grid toolbar.
- **New FX layer (+ FX):** Adds an additional FX layer above the existing stack. This grows the vertical extent of a column beyond the default 8 slots. The "+FX" button is in the grid toolbar, above the FX stack.

There is no "+" that initializes a pre-existing empty cell. Cells are already there — you just click and assign.

Note: The default 8 FX slots may be sufficient for most cases. The "+FX" button handles overflow.

### The "Output" Tap

Every column has an implicit terminating tap called "output." This tap always equals the result of processing the entire chain in that column (source + all enabled FX). The output tap is what compositor layers reference by default.

**Data model:**
- `ctx.clips[col]["output"] = { kind = "output", sourceColumn = col, tapIndex = nil }` — implicit, computed on read
- The tap index is dynamic: output = max(tap) = 1 + number_of_enabled_FX
- If no source is assigned, output = nil (no signal)

**Grid rendering:**
- Each column shows an implicit final cell at the top of the stack (or right end in left-to-right mode)
- This cell looks like the others — video thumbnail fills it — but has a small "OUT" indicator in the hover overlay
- It is read-only: selecting it shows the Effect inspector with a readout of the column chain, not editable params
- Compositor layers default to picking this tap

**Why this matters:**
- Compositor layers don't need to know the chain length
- Default compositor setup = every column's output feeds layer 1..N
- Adding/removing FX doesn't break compositor references

---

## Compositor

### Window

The compositor is an ImGui dock window (`Compositor###AVSD_compositor`) that lives in the same DockSpace as everything else. It defaults to being docked in the Deck panel's area alongside the grid, but the user can tear it out, move it, or dock it anywhere.

### Internal Layout

The compositor shows a stack of layer cells. The stack has its own orientation, independent of the grid:

- **Vertical stack (default):** Layers arranged top-to-bottom as rows
- **Horizontal row:** Layers arranged left-to-right as columns

The orientation is controlled by a toggle in the compositor's toolbar. This is separate from the grid's alignment control.

### Cells

Compositor layer cells use **exactly the same visual language** as grid cells. No special compositor-only chrome.

- Live video thumbnail fills the cell
- Hover overlay shows:
  - Eye icon (visibility toggle)
  - Small menu/pin icon (context menu: delete layer, preview this tap)
- Selection shows a colored border ring (orange, matching FX cell selection)
- Position in the stack indicates layer ordering — layer 1 at bottom in vertical, layer 1 on left in horizontal

The cell **does not** show:
- Layer number label (position tells you this)
- Blend mode text
- Opacity value
- Any other data inline

Those controls belong in the Effect inspector when the layer is selected.

### Toolbar

The compositor window has its own toolbar, same visual style as the grid toolbar:
- **Orientation toggle** — vertical stack ↔ horizontal row
- **+Layer** — adds a new compositor layer
- **Delete** — removes the selected layer

### New Layer Defaults

When a new layer is added:
```lua
{
  kind = "compositor_layer",
  sourceColumn = 1,          -- first column
  tapIndex = nil,             -- nil means "output tap"
  blendMode = "normal",
  opacity = 1.0,
  visible = true,
  name = nil,                  -- auto: "Layer N"
}
```

### Selection → Inspector

Clicking a compositor layer selects it. The Effect inspector shows layer controls:

- **Column dropdown** — picks which grid column this layer pulls from
- **Tap dropdown** — picks which tap in that column. Options:
  - "Output" (default) — always the end of the chain
  - "Raw Source" (tap 0)
  - "FX 1" (tap 1)
  - "FX 2" (tap 2)
  - ... dynamically populated from the column's current FX count

- **Blend mode dropdown** — normal, add, screen, multiply, overlay, difference, etc.
- **Opacity slider** — 0 to 1
- **Visibility toggle** — eye icon (mirrored in cell overlay)

### Compositor Rendering (Pipeline)

The compositor blends layers bottom-to-top (or left-to-right in horizontal mode) using two-input sequential compositing:

```
accumulator = resolveTap(layer1.column, layer1.tap)
for layer = 2, N do
  layerTex = resolveTap(layer.column, layer.tap)
  accumulator = CompositeSurfaceProvider.blend(accumulator, layerTex, layer.blendMode, layer.opacity)
end
outputViewport = accumulator
```

`resolveTap(column, tap)` returns the appropriate texture:
- `tap = nil` ("output") → build full pipeline for that column
- `tap = 0` → raw source texture
- `tap = N` → build pipeline up to FX layer N

The compositor output replaces the current direct-assignment of the active column's pipeline to the output viewport.

### Default State

On first load (or when no compositor exists):
- 4 compositor layers
- Each layer assigned to column 1, output tap
- Blend modes: layer 1 = normal (opacity 1.0), layer 2 = add (0.5), layers 3+ = normal (0.0/disabled)
- This produces the same visible output as the current single-pipeline mode

---

## Visual Design

### Cell Rendering (All Cell Types)

All cells (source, FX, compositor layer) follow this unified rendering:

```
┌──────────────────────┐
│   [hover: eye icon]  │
│                      │
│    VIDEO THUMBNAIL   │  ← fills cell, aspect-boxed with fitBox()
│                      │
│          [menu icon] │  ← hover: small dots/gear
├──────────────────────┤
│  [semi-transparent   │  ← 20px dark bar, label text
│   dark bar w/ label] │
└──────────────────────┘
```

- **Cell background:** The thumbnail is the background. No solid fill behind it.
- **Hover overlay:** Eye and menu icons appear at ~40% opacity by default, 80% on hover. Small icons (14-16px). Positioned top-left (eye) and top-right (menu) with subtle dark pill backgrounds for readability.
- **Label bar:** Semi-transparent dark bar at the bottom (0xaa000000), 20px tall. Text in white, 11px.
- **Selection:** 2px border ring. Color per type:
  - Source cell: cyan (#22d3ee)
  - FX cell: orange (#f97316)
  - Compositor layer: orange (#f97316)
  - Output tap: purple or white (#a78bfa TBD)
- **Empty state:** Dimmed to ~30% opacity. Label shows "No Source" or "+ Add FX" in grey.
- **Disabled/hidden:** Further dimmed, eye icon shows crossed-out.

### Overlay Actions

Hover overlay shows:
- **Eye icon** (top-left): visibility toggle
- **Context menu** (top-right): opens a small ImGui popup menu with:
  - "Preview this tap" → spawns preview dock window
  - "Pin to inspector" → pins this cell's params in the Effect inspector
  - "Delete" (for FX/compositor, not source)

---

## Data Model Changes

### New `ctx.clips` Model (Existing + Output Tap)

```lua
-- ctx.clips[col][row] — row 1 = source, row 2..N = FX, "output" = terminating tap
-- Unassigned slots exist but have nil content:
ctx.clips = {}
ctx.clips[1] = {}
ctx.clips[1][1] = { kind = "source", sourceType = nil, name = "No Source" }  -- empty but real
for i = 2, 9 do
  ctx.clips[1][i] = { kind = "fx", effectIndex = nil, name = "+", params = {}, enabled = false }
end
ctx.clips[1]["output"] = { kind = "output", sourceColumn = 1 }

ctx.gridAlignment = "bottom-up"
```

### New `ctx.compositor` State

```lua
ctx.compositor = {
  orientation = "vertical",  -- "vertical" (rows) | "horizontal" (columns)
  layers = {
    { sourceColumn = 1, tapIndex = nil, blendMode = "normal", opacity = 1.0,  visible = true },
    { sourceColumn = 1, tapIndex = nil, blendMode = "add",    opacity = 0.5,  visible = true },
    { sourceColumn = 1, tapIndex = nil, blendMode = "normal", opacity = 0.0,  visible = false },
    { sourceColumn = 1, tapIndex = nil, blendMode = "normal", opacity = 0.0,  visible = false },
  }
}
```

### `ctx.selection` Update

Selection already drives the inspectors. Compositor adds a new selection kind:

```lua
ctx.selection = { kind = "compositor", layerIndex = 1 }
-- Existing:
-- ctx.selection = { kind = "clip", col = 1, row = 2 }
```

The Effect inspector checks `ctx.selection.kind`:
- `"clip"` with `row == 1` → redundant (Source inspector handles it)
- `"clip"` with `row > 1` → show FX controls
- `"compositor"` → show compositor layer controls (blend mode, opacity, tap picker)

---

## Compositor Toolbar

The compositor window renders its own toolbar inline, matching the grid toolbar's visual style:

```lua
-- Orientation toggle button
[=] [Vertical]  or  [>] [Horizontal]
-- Layer management
[+Layer] [Delete]

-- Same visual: active state colored cyan, inactive as clickable text
```

---

## Files

### Primary changes — Behaviors

| File | What changes |
|------|-------------|
| `main.lua` | Add compositor data model init. Add `renderCompositorPanel()` with dock window, toolbar, layer cell rendering. Add `compositorOutput()` for blend rendering. Modify `selection` handling for compositor kind. Modify Effect inspector for compositor layer controls. Modify grid cell init for pre-initialized empty cells. Add output tap as implicit final cell. Modify `renderFrame()` to include compositor panel. |

### Primary changes — UI definition

| File | What changes |
|------|-------------|
| `main.ui.lua` | Verify deck embed / grid container accommodates the grid + compositor arrangement. No new widgets needed for compositor since it renders as an ImGui dock window with dynamic cells, not embedded Canvas nodes. |

### No changes expected

| File | Reason |
|------|--------|
| `ImGuiDirectHost.cpp` | Dock window rendering, retained panels, viewport rendering all work |
| `RuntimeNodeRenderer.cpp` | Grid cell rendering via retained panels works |
| `ShaderSurfaceProvider.cpp` | Pipeline building, texture resolution, compositor blend — all exist |

---

## Implementation Order

### Slice A: Pre-initialized Cells + Empty Cell State

- Modify grid init so source cells and FX cells exist from the start with nil content
- Render empty cells as dimmed with "No Source" / "+" label
- Click empty cell → inspector shows assignment controls (source picker / effect selector)
- The "+" in toolbar stays for structural growth (new column, new FX layer)

**Done when:** Grid shows 4 columns, each with 1 empty source + 8 empty FX slots. Click an empty source cell → Source inspector shows "select a source". Pick one → thumbnail appears. Click an empty FX cell → Effect inspector shows effect selector. Pick one → processed thumbnail appears.

### Slice B: Output Tap

- Add implicit "output" tap per column
- Render final cell at end of each column stack with "OUT" indicator
- `resolveTap(col, nil)` returns full pipeline result
- Update compositor layer defaults to reference output taps

**Done when:** Grid shows a terminating cell at the top of each stack. Click it → read-only. Compositor layers default to "output."

### Slice C: Compositor Window + Cells

- Add `ctx.compositor` data model with 4 default layers
- Render compositor as ImGui dock window in the deck area
- Render layer cells matching grid visual language (thumbnails, hover overlay, selection)
- Wire selection → Effect inspector shows compositor controls
- Orientation toggle in compositor toolbar
- +Layer / Delete buttons

**Done when:** A compositor window appears in the deck panel. Shows 4 layer cells with live thumbnails. Click a layer → Effect inspector shows blend mode dropdown, opacity slider, tap picker. Add a layer → 5th cell appears. Delete a layer → it disappears. Toggle orientation → layers reflow from vertical to horizontal.

### Slice D: Compositor Output Pipeline

- Implement `compositorOutput(ctx)` — blend all visible layers bottom-to-top
- Modify output viewport to consume compositor output instead of direct pipeline
- Handle edge cases: no layers visible, column with no source, tap index beyond chain length

**Done when:** Compositor drives the output viewport. Layer 1 = column 1 output, normal, 1.0. Layer 2 = column 1 output, add, 0.5 → blended result shows. Change layer 2 to column 2 output → blend updates. Disable layer 2 → output shows layer 1 only. Enable all 4 → full 4-layer blend.

### Slice E: Inline Hover Overlays

- Add eye icon to all cell types (grid + compositor)
- Add context menu popup (preview, pin, delete)
- Unify the overlay rendering so all cells use the same code path

**Done when:** Hover any cell → eye icon appears top-left, menu dots top-right. Click eye → component hides. Click menu → "Preview", "Pin", "Delete" appear. Works identically for source, FX, and compositor cells.
