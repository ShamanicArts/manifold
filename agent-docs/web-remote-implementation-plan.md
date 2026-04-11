# Web Remote Control — Implementation Plan

## Goal

Make the existing web remote control app functional with three core features:

1. **Multi-target** — connect to multiple Manifold plugins simultaneously, navigate between them
2. **Layout view styling** — pixel-match the Lua widget visuals when rendering layout JSON
3. **Generic parameter view** — working control changes for discovered parameters

No framework migration. No React. No Preact. Just the existing vanilla JS app.

---

## Current State

### What works
- OSCQuery tree flattening
- WebSocket binary OSC decoding
- Generic control rendering (sliders, toggles, choices, XY pads, readouts)
- Layout tab renders `/ui/layout` JSON
- Custom surface tab
- Filter graph & EQ graph canvas renderers
- Live value updates via WebSocket
- Single-target connect/disconnect

### What's broken / missing
- Only one target at a time
- Layout view controls don't visually match Lua widgets
- Generic view styling is functional but doesn't match the Lua aesthetic
- No target navigation (tabs/pills for switching between connected plugins)

---

## Phase 1: Multi-Target Architecture

### Data model change
Current: single global `state` object with one host/port/tree/ws.

Target: **registry of connections**, each with its own state. A UI concept of "active target" that determines what the main panels display.

```
targets = Map<string, TargetState>

TargetState = {
  id: "127.0.0.1:9011",
  host: "127.0.0.1",
  port: 9011,
  name: "Manifold Filter",        // from layout.name or HOST_INFO.NAME
  accent: "#a78bfa",              // from layout theme or default
  hostInfo: {...},
  uiMeta: {...},
  paramMeta: Map,
  tree: {...},
  endpoints: [...],
  filteredEndpoints: [...],
  endpointMap: Map,
  values: Map,
  ws: WebSocket | null,
  layout: object | null,
  layoutState: object,
  currentSurface: [...],
  activeTab: "generic",
  search: "",
  connected: boolean,
}
```

Global UI state:
```
activeTargetId: string | null
```

### Navigation UI
Add a `<nav id="targetNav">` below the topbar. Shows a pill for each connected target:
- Pill shows target name + colored dot (accent from layout)
- Click pill → switches active target, re-renders all panels
- Small × on pill → disconnects that target
- "Connect" form stays in topbar, adds new targets

### Connection flow
1. User fills host:port, clicks Connect
2. App fetches HOST_INFO + tree + /ui/layout
3. Creates TargetState, adds to registry
4. Opens WebSocket for that target
5. Sets as active target
6. Adds nav pill
7. Renders panels for active target

### Switching targets
- Save current scroll position / tab state into current TargetState
- Switch activeTargetId
- Restore tab / search / scroll for new target
- Re-render all panels from new target's data

### Disconnection
- Close WebSocket for that target
- Remove from registry
- Remove nav pill
- Switch to another target if available

---

## Phase 2: Layout View Styling — Match Lua Widgets

### What the Lua widgets look like

#### Slider (compact mode)
- Filled rectangle slider
- `bg: #1e293b`, `colour: #38bdf8` (accent from layout/style)
- Rounded corners: 2px
- Label left-aligned, value right-aligned
- Text shadow: `0xb0000000` behind `0xfff8fafc` (label) and `0xffcbd5e1` (value)
- Font size: `min(10, max(7, h - 4))`
- Hover: brighten fill by 10
- Drag: brighten fill by 20
- Semi-transparent scrim overlay: `#44000000` (hover: `#50000000`)

#### Slider (normal mode)
- Thin track (6px high, centered vertically, 8px margin each side)
- Rounded track background
- Fill from left
- Thumb: 12×20 rounded rect (4px radius)
- Value text centered above track
- Same hover/drag brightening

#### Knob
- Circle with arc ring (270° sweep, -135° to +135°)
- Outer ring: background color
- 3-line arc track (outer/mid/inner)
- 3-line arc fill in accent color
- Pointer line from center toward arc edge
- Pointer dot (5×5 rounded) at tip
- Center dot (8×8)
- Value text below center
- Label text at bottom
- Drag: vertical mouse → value change

#### Toggle
- Rounded button
- `onColour: #0ea5e9`, `offColour: #475569`
- `radius: 4px`
- Label centered with text shadow
- Border: brighten(bg, 40)
- Hover: brighten bg by 25
- Pressed: darken bg by 20

#### Dropdown
- `bg: #1e293b`, `radius: 6px`
- Border: brighten(bg, 30)
- Selected text left-aligned (10px padding)
- Arrow indicator (▼/▲) right-aligned
- Overlay popup with option list, scrollbar if >10 items

#### SegmentedControl
- `bg: #1e293b`, `selectedBg: #38bdf8`
- Segments fill full width
- Border around whole control
- Selected segment in accent color

#### NumberBox
- +/- buttons on sides
- `bg: #1e293b`, `colour: #38bdf8`
- Separator lines between buttons and value
- Label above value (smaller)
- Value centered (larger, accent color)
- Drag on value area for fine control
- Double-click resets to default

#### Label
- Configurable color, font size, alignment
- Default: `#9ca3af`, 13px, center-left

#### Panel
- bg + border + radius container
- Transparent by default

### Implementation approach

**For layout view specifically:**

The layout JSON already specifies `type`, `x`, `y`, `w`, `h`, `style`, `bind`. The current `renderLayoutNode()` renders these as positioned `<div>` elements. The fix is:

1. **Slider in layout view** — replace the generic compact-slider CSS with a canvas-based or pure-div renderer that draws the exact same visuals as the Lua compact slider:
   - Background fill rounded rect
   - Accent fill rounded rect (width = t * w)
   - Semi-transparent scrim
   - Label text (left, white)
   - Value text (right, light gray)
   - All with the style colours from the layout JSON (or defaults)

2. **Toggle in layout view** — render as a filled rounded button matching the Lua Toggle:
   - Background = onColour or offColour based on value
   - Border = brighten(bg, 40)
   - Centered label with shadow

3. **Dropdown in layout view** — render as a styled select/dropdown:
   - Background fill
   - Border
   - Selected text left
   - Arrow right
   - Click opens overlay with options

4. **Label in layout view** — already close, just ensure font size and color match

5. **Panel in layout view** — already works, just ensure radius and border match

6. **XY pad in layout view** — already has a renderer, ensure colours come from style

### CSS changes needed

Add `.layout-node.slider`, `.layout-node.toggle`, `.layout-node.dropdown`, `.layout-node.knob` classes with specific overrides. These should pull colours from the node's `style` object (set as CSS custom properties via JS).

### Slider rendering detail

For the compact slider in layout view, use this approach:
```html
<div class="layout-node slider" style="left:...;top:...;width:...;height:...;--bg:#1e293b;--colour:#38bdf8;">
  <div class="lua-slider-track"></div>
  <div class="lua-slider-fill" style="width:50%"></div>
  <div class="lua-slider-scrim"></div>
  <span class="lua-slider-label">Cutoff</span>
  <span class="lua-slider-value">0.75</span>
  <input type="range" min="0" max="1000" value="750">
</div>
```

All sized absolutely within the layout-node container. The fill width is `t * 100%`. Colors from CSS custom properties `--bg` and `--colour`.

---

## Phase 3: Generic Parameter View — Working Changes

### What's needed
The generic view already renders controls and sends values. The main issues are:

1. **Styling consistency** — use the same Lua-matched styling from Phase 2 for generic sliders, toggles, etc.
2. **Value feedback** — ensure WebSocket updates re-render controls correctly
3. **Debounced writes** — already implemented with queued writes, verify it works

### Grouping
Current grouping by path prefix is fine. Maybe improve labels:
- `/plugin/params/*` → "Main Parameters"
- Named groups from parameter metadata if available

---

## File Changes Summary

### `index.html`
- Add `<nav id="targetNav">` between topbar and statusbar
- Remove single connect form if multi-target replaces it (or keep for adding targets)

### `style.css`
- Add `.target-nav` styles (pill bar for connected targets)
- Add `.lua-slider-*` classes for Lua-matched slider rendering
- Add `.lua-toggle-*` classes for Lua-matched toggle rendering  
- Add `.lua-dropdown-*` classes for Lua-matched dropdown rendering
- Add `.layout-node.slider`, `.layout-node.toggle`, `.layout-node.dropdown` overrides
- Refine existing generic control styles to match Lua aesthetic

### `app.js`
- Refactor `state` into `targets` registry + `activeTargetId`
- Add target CRUD (connect, disconnect, switch)
- Add nav pill rendering
- Update all existing functions to operate on active target's state
- Update `renderLayoutNode()` to render Lua-matched widgets:
  - Slider → compact filled-rect with label/value overlay
  - Toggle → filled button with state colors
  - Dropdown → styled select matching Lua visuals
  - Label → font-size and color from style
- Ensure all DOM updates go through active target's data
- WebSocket management per-target

---

## Execution Order

1. **Multi-target refactor** — biggest structural change, do first
   - Refactor state model
   - Add target registry
   - Add nav UI
   - Wire up connect/disconnect/switch
   
2. **Layout view styling** — visual work
   - Update `renderLayoutNode()` for each widget type
   - Add CSS for Lua-matched controls
   - Test with all three layout JSONs (Filter, EQ, FX)

3. **Generic view polish** — ensure it works end-to-end
   - Apply consistent styling
   - Verify WebSocket value updates re-render
   - Verify writes flow correctly

4. **Test** — connect to all three running plugins simultaneously
   - Standalone Filter (port 9011)
   - Standalone EQ (port 9021)
   - Standalone FX (port 9031)
   - Verify navigation between them
   - Verify layout view matches Lua visuals
   - Verify generic view works for parameter changes
