# Editor UI Working Document

## Vision: Chataigne-Style Visual Authoring Environment

The Editor is a **self-hosted visual authoring environment** (comparable to Chataigne, TouchOSC, or Open Stage Control) that enables users to:

1. **Visually design UI layouts** - Drag/drop widgets, resize, arrange
2. **Wire widgets to DSP parameters** - Connect UI controls to audio processing
3. **Author Lua behavior** - Write scripts, define callbacks, create reusable components
4. **See live previews** - UI updates in real-time as you edit
5. **Manage projects** - Organize UI files, DSP scripts, assets, mappings

### Key Principle

The Editor is **not** just a code editor with a preview. It is a **visual control surface designer** where:
- Non-coders can build UIs by dragging widgets and setting properties
- Coders can dive into Lua for advanced behavior
- Both workflows coexist in the same environment

---

## Architecture

### The Hierarchy

```
SHELL (ui_shell.lua) - ALWAYS PRESENT, NEVER RELOADED
├── Top bar: [Performance] [Edit] toggle, Master/Input controls, Settings
├── Content Area (switches based on mode):
│   ├── PERFORMANCE MODE: User's full UI (looper_ui.lua, etc.)
│   └── EDIT MODE: Editor layout with Canvas Preview showing the same UI
└── State management, mode routing
```

**The Rule:** The Shell is the persistent parent. It NEVER gets swapped. User UIs are children that the Shell manages.

### Mode-Based Layout

**PERFORMANCE MODE:**
```
┌─────────────────────────────────────────────────────────────┐
│ MANIFOLD  [Performance] [Edit]  Master  Input  Settings     │  ← SHELL
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           USER'S UI (looper_ui.lua, etc.)                   │  ← FULL SIZE
│           Full control, no editor chrome                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**EDIT MODE:**
```
┌─────────────────────────────────────────────────────────────┐
│ MANIFOLD  [Performance] [Edit]  Master  Input  Settings     │  ← SHELL
├──────────┬────────────────────────────┬─────────────────────┤
│ PROJECT  │      CANVAS PREVIEW        │    INSPECTOR        │
│  TREE    │                            │                     │
│          │   ┌────────────────────┐   │  Type: Button       │
│ 📁 ui/   │   │  USER'S UI         │   │  Label: "REC"       │
│  📄 main │   │  (live preview)    │   │  BG: #ff7f1d1d      │
│ 📁 dsp/  │   │  - clickable       │   │  [on_click code]    │
│          │   │  - editable        │   │                     │
└──────────┴───┴────────────────────┴───┴─────────────────────┘
     ↑              ↑                        ↑
  File tree    The UI being edited      Properties + Script Editor
```

---

## Current State (2026-03-04)

### Completed: Shell Mode Switching with Scaled Preview

**What Works:**
- Shell owns all main elements: header, content, tree panel, inspector panel
- Mode toggle (Performance | Edit) switches layout correctly
- **Edit mode**: Content is scaled to fit preview area using transforms
- **Performance mode**: Content is full size
- C++ defers to Shell for content positioning when Shell is active

**Key Architecture Decision:**
- Content bounds at (0, 0) with design size
- Transform handles BOTH scale AND position: `setTransform(scale, scale, previewX, contentY)`
- C++ `LuaEngine::notifyResized` no longer calls `setBounds` on scriptContentRoot when Shell is active

### Completed: Canvas API Extensions

| Method | Purpose |
|--------|---------|
| `toFront(grabFocus)` | Bring canvas to front of z-order |
| `toBack()` | Send canvas to back of z-order |
| `setTransform(sx, sy, tx, ty)` | Apply scale + translate transform |
| `clearTransform()` | Remove transform |
| `adoptChild(canvas)` | Reparent a canvas from another parent |

### Completed: Widget Metadata Storage

- `Canvas::setUserData(key, value)` - Store arbitrary Lua data
- `Canvas::getUserData(key)` - Retrieve or return nil
- All widgets store `_editorMeta` with type, config, callbacks

---

## Current Shell Architecture

```
parentNode (rootCanvas from C++)
├── scriptContentRoot (child 0) - Shell references as shell.content
├── shell.panel (header bar with mode toggle, knobs, settings)
├── shell.treePanel (visible in Edit mode)
└── shell.inspectorPanel (visible in Edit mode)
```

**Performance Mode:**
- treePanel/inspectorPanel hidden (bounds 0,0,0,0)
- content at full size, no transform

**Edit Mode:**
- treePanel on left (180px)
- inspectorPanel on right (220px)  
- content scaled to fit center preview area
- Transform: `setTransform(scale, scale, previewX, contentY)`

### Key Code Locations

| File | Purpose |
|------|---------|
| `manifold/ui/ui_shell.lua` | Shell implementation, mode switching, layout |
| `manifold/primitives/scripting/LuaEngine.cpp` | C++ side, defers to Shell when active |
| `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` | Canvas Lua bindings |
| `manifold/ui/looper_ui.lua` | Example user UI (unchanged, works in both modes) |

---

## Priority Reset (Agreed)

This is the active ordering going forward:

1. **Dev console now (moved earlier)**
   - `~` inline console for fast testing/debug authoring
   - command shortcuts for endpoint inspection (`get/set/trigger`), undo/redo, selection inspection
   - copy/paste workflows for identifiers into console and external chat/docs

2. **Parameter exposure framework (new foundation phase)**
   - unify what is editable across:
     - widget style params
     - custom canvas-draw style params (e.g. donut ring colours)
     - behavior params (e.g. XY friction/spring/damping)
   - remove "random" inspector feel by making exposure explicit instead of inferred only

3. **Then map/design-heavy work**
   - Widget ↔ DSP mapping UI
   - Lua behavior authoring linkages

4. **Deeper model work stays later**
   - persistence/save-load
   - codegen/round-trip

## Task List

### Phase 1: Shell Foundation ✅ COMPLETE

**Task 1.1: Canvas UserData API**
- [x] Implement `setUserData(key, value)` in C++
- [x] Implement `getUserData(key)` in C++
- [x] Implement `hasUserData(key)` in C++
- [x] Implement `clearUserData(key)` in C++
- [x] Expose all methods to Lua bindings
- [x] Test via LuaEngineMockHarness

**Task 1.2: Widget Metadata Storage**
- [x] Add `_storeEditorMeta()` to BaseWidget
- [x] Store type name in `_editorMeta`
- [x] Store config table in `_editorMeta`
- [x] Store callback references in `_editorMeta`
- [x] Add schema metadata for inspector-driven editing

**Task 1.3: Shell Ownership & Mode Routing**
- [x] Shell owns top-level layout and mode switching
- [x] C++ defers `scriptContentRoot` positioning when shared Shell is active
- [x] Settings overlay remains usable in both modes and forced top-most

---

### Phase 2: Visual Editing Core ✅ COMPLETE (v1)

**Task 2.1: Hierarchy Tree**
- [x] Build hierarchy walker (`walkHierarchy`)
- [x] Render tree rows with depth indentation
- [x] Highlight selected rows and keep tree in sync
- [x] Debounce refresh during rapid edits

**Task 2.2: Preview Selection**
- [x] Click-to-select in preview with design-space hit test
- [x] Selection outlines rendered in overlay
- [x] Multi-select model (`selectedWidgets` + active selection)
- [x] Ctrl-drag marquee selection
- [x] Ctrl-click toggle add/remove
- [x] Marquee requires full containment (prevents accidental background grabs)

**Task 2.3: Transform Interactions**
- [x] Shift-drag move for selected widget/group
- [x] Resize handles in preview
- [x] Group bounding box + per-widget preview outlines
- [x] Inspector X/Y/W/H edits apply live

**Task 2.4: Inspector Editing**
- [x] Schema-driven property rows (fallback to inferred rows)
- [x] Typed editors: number/color/bool/enum/text
- [x] Live apply to widget config and runtime setters
- [x] Multi-select shared/mixed row semantics (`<mixed>`)

---

### Phase 3: Navigation & Workspace 🔄 IN PROGRESS

**Task 3.1: Zoom/Pan Controls**
- [x] Header zoom controls and Fit action
- [x] Alt+wheel zoom, +/-/0 keyboard zoom
- [x] Pan mode drag
- [x] Preview grid overlay (dot grid)

**Task 3.2: Workspace/Viewport Separation**
- [x] Initial workspace extension + runtime viewport frame rendering
- [x] Pan clamping scaffold
- [ ] Final symmetric workspace model (clean coordinate origin)
- [ ] Frame Viewport / Frame Selection commands
- [ ] Stabilize placement semantics to avoid layout regressions

---

### Phase 4: Editing Safety ✅ PARTIAL

**Task 4.1: Undo/Redo Core**
- [x] Add undo/redo stacks in Shell
- [x] Snapshot scene/selection history capture
- [x] Record history for move/resize/bounds/config/selection edits
- [x] Bind Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
- [ ] Add visible history feedback in UI
- [ ] Add coalescing/merge policy for rapid numeric edits

---

### Phase 5: Dev Console + Exposure Foundation (Current Priority)

**Task 5.0: Shell Tab Host + Scripts Surface (carried forward)**
- [x] Add first-class UI-script tab model in `ui_shell.lua`
- [x] In Performance mode: tabs consume full content area
- [x] In Edit mode: tabs are visible in preview workflow, but hidden while script editor surface is open
- [x] Script/DSP entries open dedicated edit surfaces on double-click

**Task 5.1: Left Panel Expansion (keep current widget tree intact)**
- [x] Widget hierarchy tree remains the primary edit tree
- [x] Left area streamlined to `Hierarchy` | `Scripts`
- [x] Single-click selects and populates inspector; double-click opens editor surface
- [x] Script list filtering to loaded/current/global scope (settings excluded)

**Task 5.2: Inline Dev Console (`~`) — moved earlier**
- [x] `~` toggles inline console overlay in dev-enabled shell
- [x] Console command MVP: `help`, `clear`, `get/set/trigger`, `undo/redo`, `sel`, `copyid`, `ui`, `lua`
- [x] Dev copy/paste shortcuts: Ctrl+Shift+C copies active identifier; Ctrl+Shift+V pastes clipboard into console input
- [ ] Add command palette aliases + richer diagnostics panes

**Task 5.3: Parameter Exposure Framework (new)**
- [x] Define unified exposure API for non-standard UI style/behavior params
- [x] `BaseWidget:exposeParams(specs)` - Declare custom editable params
- [x] `BaseWidget:getExposedParams()` - Retrieve declared params
- [x] `BaseWidget:_getExposed(path)` / `_setExposed(path, value)` - Getter/setter contract
- [x] `BaseWidget:_mergeExposedIntoSchema()` - Merge into editor metadata
- [x] `isPathExposed()` / `getInspectorValue()` helpers in ui_shell.lua
- [x] Inspector reads exposed params via `_getExposed` when available
- [x] Inspector writes exposed params via `_setExposed` when available
- [x] Added `DonutWidget` with exposed ringColour, playheadColour, bgColour, thickness
- [x] Added `XYPadWidget` with exposed handleColour, trailColour, bgColour, gridColour, showTrails
- [x] Added `MatrixRainWidget` (experimental) with exposed cols, charSize, speed, spawnRate, color
- [x] Added `GLSLWidget` base class for OpenGL shader rendering
- [x] Added `PostFXWidget` (extends GLSLWidget) with exposed intensity, aberration, scanlines, waveSpeed, ringSpeed
- [x] `exposeParams` now appends to existing params instead of replacing
- [x] Fixed GL constant naming (GL.COLOR_BUFFER_BIT vs gl.COLOR_BUFFER_BIT)
- [x] Fixed shader compile status checks (getShaderCompileStatus vs getShaderiv)

---

### Phase 6: Mapping + Behavior Authoring (Design-heavy)

**Task 6.1: Widget ↔ DSP Mapping UI**
- [ ] Visual mapping workflow from selected widget property to DSP endpoint
- [ ] Mapping inspector/editor (min/max, curve, mode)
- [ ] Live mapping preview and conflict handling

**Task 6.2: Lua Behavior Authoring Integration**
- [x] Script editing surface (double-click Scripts row → center editor surface)
- [x] Syntax highlighting style derived from `dsp_live_scripting.lua`
- [x] Basic file workflow: load, edit, save, reload, close (Esc/Ctrl+W)
- [ ] Link selected widget to script snippets
- [ ] Safe apply/reload workflow with runtime error reporting

---

### Phase 7: Persistence & Round-Trip (Deep model)

**Task 7.1: Save/Load Project State**
- [ ] Serialize editable UI scene (hierarchy, bounds, config, metadata)
- [ ] Persist mappings + editor camera/workspace state
- [ ] Load and reconstruct reliably

**Task 7.2: Code Generation / Round Trip**
- [ ] Generate Lua from visual edits
- [ ] Import existing Lua back into editable representation
- [ ] Round-trip validation tests

---

### Phase 8: Runtime Tiering (Normal / Dev / Super Dev)

**Task 8.1: Runtime Modes**
- [ ] Define `Normal`, `Dev`, `Super Dev` shell modes
- [ ] Gate editor chrome/advanced controls by mode
- [ ] Move advanced/settings surfaces into tabs in Dev modes

**Task 8.2: Editable Scope by Mode**
- [ ] Normal: only user-facing edit surfaces
- [ ] Dev: editable active UI + loaded DSP + runtime diagnostics
- [ ] Super Dev: editable system Lua (`ui_shell.lua`, core UI modules, infra scripts)

---

## Summary Checklist

| Phase | Status | Key Deliverable |
|-------|--------|-----------------|
| 1. Shell Foundation | ✅ Complete | Persistent shell + mode routing |
| 2. Visual Editing Core | ✅ Complete (v1) | Tree, selection, inspector, multi-select editing |
| 3. Navigation & Workspace | 🔄 In Progress | Zoom/pan working; workspace model needs final pass |
| 4. Editing Safety | ✅ Partial | Undo/redo core implemented |
| 5. Dev Console + Exposure Foundation | ✅ Complete | `~` console + parameter exposure + Donut/XYPad/MatrixRain/GLSL widgets |
| 6. Mapping + Behavior Authoring | ⏳ Next | Widget↔DSP mapping + behavior-linked authoring |
| 7. Persistence & Round-Trip | ⏳ Later | Save/load + codegen/round-trip |
| 8. Runtime Tiering | ⏳ Later | Normal/Dev/Super-Dev gating |

---

## Technical Notes

### Transform Math

Content uses bounds at origin with transform for positioning:
```lua
self.content:setBounds(0, 0, designW, designH)
self.content:setTransform(scale, scale, previewX, contentY)
```

The transform is `scale(sx, sy).translated(tx, ty)`:
- Point (0,0) → (0*sx + tx, 0*sy + ty) = (tx, ty)
- So content top-left appears at (previewX, contentY)
- Content is scaled by `scale` factor

### C++ Deference to Shell

In `LuaEngine.cpp`, when Shell is active:
```cpp
// Only position scriptContentRoot if Shell is NOT managing it
if (pImpl->scriptContentRoot != nullptr && !pImpl->hasSharedShell) {
    pImpl->scriptContentRoot->setBounds(...);
}
```

This ensures Shell has full control over content positioning in both modes.

---

## References

- Chataigne: https://benjamin.kuperberg.fr/chataigne/
- TouchOSC: https://hexler.net/touchosc
- Open Stage Control: https://openstagecontrol.ammd.net/
