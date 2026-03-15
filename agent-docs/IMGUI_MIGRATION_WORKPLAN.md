# ImGui Migration Work Plan

Status: **ARCHITECTURE RESET — previous approach was fundamentally wrong**
Companion doc: [IMGUI_CANVAS_DEPENDENCY_AUDIT.md](./IMGUI_CANVAS_DEPENDENCY_AUDIT.md)

---

## What Went Wrong

The previous workplan built an **imgui-replace** mode where:
- Canvas remained the source of truth for everything
- RuntimeNode was a mirror owned by Canvas
- Display lists were populated inside Canvas paint callbacks
- Input still flowed through Canvas/JUCE events
- A snapshot clone copied the entire tree every frame for thread safety

This created a parasite that cannot survive without its host. Every "fix" was a hack to work around Canvas being in the way:
- `invokeDrawForRetained` = "call Canvas paint callback without Canvas"
- `_syncConsoleOverlayRetained` = "rebuild console display list outside paint cycle"
- Snapshot cloning = "copy the entire tree because we can't render from the live tree"

**You cannot remove Canvas from this architecture.** If Canvas is deleted, RuntimeNode has no owner, no layout engine, no display list population, no event source.

The goal was: **prove ImGui is faster & better, then gut Canvas entirely**. The architecture built cannot reach that goal.

---

## ⛔ MANDATORY RULES ⛔

### Rule 1: RuntimeNode is the source of truth, not Canvas
Widgets write to RuntimeNode. Renderers (Canvas OR ImGui) read from RuntimeNode. Canvas is a consumer, not a producer.

### Rule 2: No shim modes
There is no "imgui-replace" mode where both systems run and neither works properly. There is Canvas mode (current, working) and ImGui mode (target, must work independently).

### Rule 3: Define the contract before writing code
The RuntimeNode API contract must be frozen before any renderer work begins. This was skipped last time and it poisoned everything.

### Rule 4: Vertical slice before horizontal migration
Prove the architecture works end-to-end on one real UI before migrating all widgets.

### Rule 5: The end state is Canvas deletion
If a change doesn't move toward removing Canvas, it's wrong.

---

## Current Reality

### What exists and is solid
- **RuntimeNode data model** — hierarchy, bounds, style, callbacks, display lists, dirty tracking, userData. ~80% of what a standalone node needs.
- **Widget `_syncRetained()` functions** — 14 widgets already build display lists directly on RuntimeNode without Canvas involvement.
- **RuntimeNodeRenderer** — OpenGL display list renderer. Works.
- **Hit testing** — works on RuntimeNode tree.
- **Input routing** — ImGuiRuntimeNodeHost routes mouse/keyboard to RuntimeNode callbacks. Works.
- **BaseWidget `_runtimeNodeOnly` path** — when parent is RuntimeNode (not Canvas), widgets skip Canvas entirely, create children on RuntimeNode, call `refreshRetained()` for display lists. This path exists and works.

### What is fundamentally wrong
- **Canvas owns RuntimeNode** — created in Canvas constructor, destroyed when Canvas dies
- **Shell creates Canvas children** — `ui_shell.lua` calls `node:addChild()` which returns Canvas, not RuntimeNode
- **469 `gfx.*` immediate-mode drawing calls** — exist inside `setOnDraw` callbacks, only fire during Canvas paint
- **Every widget has TWO complete rendering paths** — `onDraw()` with `gfx.*` (Canvas) and `_syncRetained()` with `setDisplayList()` (RuntimeNode). Dual maintenance forever.
- **Shell is 100% Canvas** — bindings.lua (252 gfx calls), methods_layout.lua (toFront/setTransform), methods_core.lua (grabKeyboardFocus/repaint)
- **Layout depends on JUCE** — `setBounds()` on Canvas triggers JUCE component layout, which syncs to RuntimeNode

### Canvas-only API usage (cannot work without Canvas)
| API | Call sites | Where |
|-----|-----------|-------|
| `gfx.*` immediate drawing | 469 | widgets (onDraw), shell canvases, experimental UI |
| `setOnDraw()` | 29 | shell canvases, widgets (base.lua), dropdown overlay, settings UI |
| `repaint()` on Canvas | ~149 | everywhere |
| `toFront()` | 14 | methods_layout.lua, methods_core.lua |
| `grabKeyboardFocus()` | 12 | bindings.lua, methods_core.lua |
| `setTransform()`/`clearTransform()` | 4 | methods_layout.lua (edit mode zoom) |
| `setOpenGLEnabled()`/`setOnGLRender()` | 4 | glsl.lua |
| `setInterceptsMouse()` | ~35 | ui_shell.lua, methods_layout.lua |

See [IMGUI_CANVAS_DEPENDENCY_AUDIT.md](./IMGUI_CANVAS_DEPENDENCY_AUDIT.md) for the complete file-by-file breakdown.

---

## Architecture: What Should Have Been Built

```
Current (wrong):
  Lua widgets → Canvas → mirrors to RuntimeNode → ImGui reads snapshot
  Canvas is owner, producer, layout engine, event source

Target (correct):
  Lua widgets → RuntimeNode (source of truth)
                    ↓                    ↓
              Canvas backend       ImGui backend
              (reads + renders)    (reads + renders)
```

### The inversion
1. **RuntimeNode becomes standalone** — not owned by Canvas, constructable independently
2. **Widgets write to RuntimeNode** — `_syncRetained()` becomes the primary path, `onDraw()` becomes the legacy path
3. **Layout operates on RuntimeNode tree** — Lua layout code calls `node:setBounds()` directly
4. **Canvas becomes a renderer** — reads RuntimeNode tree, draws via JUCE Graphics
5. **ImGui becomes a renderer** — reads RuntimeNode tree, draws via OpenGL
6. **Either renderer can be active** — they consume the same tree independently

---

## Phase Plan (Corrected)

### Phase 1: Freeze the RuntimeNode contract

**Goal:** Define exactly what RuntimeNode must support for widgets, layout, and renderers to target it directly.

**Deliverable:** A concrete API contract document + any missing methods added to RuntimeNode.

**What RuntimeNode already has:**
- Identity: stableId, nodeId, widgetType
- Hierarchy: createChild, addChild, removeChild, getChildren, findById, findByStableId
- Geometry: setBounds, getBounds, setClipRect
- Style: setStyle (background, border, cornerRadius, opacity, padding)
- Visibility: setVisible, isVisible, setZOrder
- Input: CallbackSlots (onMouseDown/Drag/Up/Move/Wheel, onClick, onDoubleClick, onKeyPress, onMouseEnter/Exit, onValueChanged, onToggled)
- Input capabilities: setInputCapabilities (pointer, wheel, keyboard, focusable, interceptsChildren)
- Rendering: setDisplayList, setCustomSurfaceType, setCustomRenderPayload
- State: isHovered/isPressed/isFocused + setters
- Dirty tracking: structure/props/render version counters, bubble to parent
- Storage: userData key/value

**What RuntimeNode is missing for standalone operation:**
- `toFront()`/`toBack()` equivalent → use `setZOrder()` + renderer respects it
- `grabKeyboardFocus()` equivalent → renderer-side focus management
- `repaint()` semantics → `markRenderDirty()` already exists, renderer polls versions
- `setTransform()` → needed for edit mode zoom/pan
- Construction without Canvas parent

**Tasks:**
- [ ] Define which missing APIs to add vs handle in renderer
- [ ] Document the contract as a reference
- [ ] Verify RuntimeNode can be constructed and used without Canvas

### Phase 2: Make RuntimeNode independently constructable

**Goal:** RuntimeNode can exist without a Canvas parent. The Lua global `root` can be either Canvas or RuntimeNode.

**Tasks:**
- [ ] Ensure RuntimeNode constructor works standalone (it already does — `RuntimeNode(name)`)
- [ ] Add RuntimeNode construction path in LuaEngine that doesn't require Canvas
- [ ] BaseWidget `_runtimeNodeOnly` path already works — verify it handles all widget types
- [ ] Add `setTransform()` to RuntimeNode if needed for edit mode

### Phase 3: Vertical slice — one real UI through RuntimeNode-only

**Goal:** Prove the architecture by rendering a real project UI where widgets target RuntimeNode directly (not through Canvas), and either Canvas or ImGui renders it.

**Approach:**
- Pick the LooperTabs project (it uses standard widgets: panels, buttons, knobs, sliders, waveforms, segmented controls)
- Create an `imgui-direct` renderer mode where:
  - Shell creates RuntimeNode tree directly (no Canvas children)
  - Widgets use `_runtimeNodeOnly` path
  - ImGui renderer reads live tree (no snapshot cloning)
  - Input routes through ImGui host to RuntimeNode callbacks
- Keep `canvas` mode working exactly as-is (zero changes to Canvas path)

**Renderer architecture for imgui-direct:**

`ImGuiRuntimeNodeHost` was designed for the `imgui-replace` shim. It uses JUCE's GL render thread with `setContinuousRepainting(true)`, which means `renderOpenGL()` runs on a separate thread from Lua. This forced snapshot cloning (full deep-copy of the RuntimeNode tree every frame) for thread safety. This clone is the #1 performance killer (~80ms/frame for a real UI).

**imgui-direct MUST NOT use this pattern.** The correct approach:

Create `ImGuiDirectHost` — a new JUCE component that:
1. Owns an `OpenGLContext` with `setContinuousRepainting(false)` (GL thread does NOT auto-render)
2. Exposes a `renderNow()` method called from the **message thread** timer callback
3. `renderNow()` calls `openGLContext.makeActive()`, renders ImGui from the **live** RuntimeNode tree, swaps buffers, deactivates context
4. **No snapshot, no clone, no mutex** — rendering and Lua both run on the message thread
5. Input routing reads the live tree directly (same thread)

This is fundamentally different from `ImGuiRuntimeNodeHost` and cannot be achieved by patching it. It requires a new component.

**Tasks:**
- [x] New renderer mode `imgui-direct` (separate from broken `imgui-replace`)
- [x] Shell creates RuntimeNode root when mode is `imgui-direct`
- [x] Widget construction passes RuntimeNode parent → triggers `_runtimeNodeOnly` path
- [x] Layout calls `node:setBounds()` on RuntimeNode directly
- [ ] **Create `ImGuiDirectHost` component** — message-thread GL rendering, reads live tree, no snapshot
- [ ] Input routes to RuntimeNode callbacks via `ImGuiDirectHost`
- [ ] Clean exit (OpenGL context detaches before tree destruction)
- [ ] Verify: all widgets render, all interactions work, performance is good

**Success criteria:**
- LooperTabs project renders correctly in imgui-direct
- All widgets interactive (clicks, drags, keyboard)
- No Canvas involvement in the rendering path
- Performance equal or better than Canvas mode

### Phase 4: Shell migration

**Goal:** Shell canvases (tree, dsp, script, inspector, console, preview, tabs) render through RuntimeNode instead of Canvas `setOnDraw` + `gfx.*`.

**The shell is the hardest part** — 252 `gfx.*` calls in bindings.lua alone. These are inside `setOnDraw` callbacks doing immediate-mode drawing (tree hierarchy visualization, DSP node graph, script list, inspector properties, console text, preview overlay).

**Approach:**
- Convert each shell canvas from `setOnDraw` + `gfx.*` to building display lists via `setDisplayList()`
- This is the same conversion that `_syncRetained()` does for widgets
- Shell canvases are: treeCanvas, dspCanvas, scriptCanvas, mainTabBar, mainTabContent, inspectorCanvas, consoleOverlay, previewOverlay

**Tasks:**
- [ ] Convert treeCanvas rendering to display list
- [ ] Convert dspCanvas rendering to display list
- [ ] Convert scriptCanvas rendering to display list
- [ ] Convert mainTabBar rendering to display list
- [ ] Convert mainTabContent rendering to display list
- [ ] Convert inspectorCanvas rendering to display list
- [ ] Convert consoleOverlay rendering to display list (partially done)
- [ ] Convert previewOverlay rendering to display list
- [ ] Replace `toFront()` calls with `setZOrder()` + renderer z-order support
- [ ] Replace `grabKeyboardFocus()` with RuntimeNode focus API
- [ ] Replace `setTransform()`/`clearTransform()` with RuntimeNode transform

### Phase 5: Delete Canvas `onDraw` paths from widgets

**Goal:** Widgets have ONE rendering path, not two.

Each widget currently has:
- `onDraw(w, h)` — Canvas immediate mode with `gfx.*` calls
- `_syncRetained(w, h)` — RuntimeNode display list building

Delete `onDraw()` from every widget. `_syncRetained()` becomes the only path.

**Tasks:**
- [ ] Remove `onDraw` from BaseWidget contract
- [ ] Remove `setOnDraw` from BaseWidget constructor
- [ ] Delete `onDraw`, `drawBackground`, `drawArc`, `drawPointer`, `drawValueText`, `drawLabelText` etc. from each widget
- [ ] Delete `drawCircleApprox`, `drawArcApprox` helper functions from knob.lua
- [ ] Verify Canvas mode still works (Canvas renderer must consume display lists)

### Phase 6: Canvas as display list consumer

**Goal:** Canvas mode renders from display lists instead of `gfx.*` immediate mode.

Currently Canvas renders via `paint()` → `onDraw` callback → `gfx.*` calls. After Phase 5 deletes `onDraw`, Canvas needs to render from display lists like ImGui does.

**Tasks:**
- [ ] Canvas `paint()` reads `node->getDisplayList()` and draws via JUCE Graphics
- [ ] Or: Canvas mode uses the same OpenGL RuntimeNodeRenderer that ImGui uses
- [ ] Verify Canvas mode produces identical visual output
- [ ] Performance validation

### Phase 7: Delete Canvas

**Goal:** Remove Canvas from the codebase.

**Tasks:**
- [ ] Remove Canvas.h / Canvas.cpp
- [ ] Remove LuaUIBindings Canvas registration
- [ ] Remove Canvas references from LuaEngine
- [ ] Remove Canvas references from BehaviorCoreEditor
- [ ] Update Lua `root` to be RuntimeNode everywhere
- [ ] Clean up any remaining Canvas references

### Phase 8: Advanced surfaces

**Goal:** GLSL widgets, custom GPU rendering, OpenGL surfaces work through RuntimeNode.

**Tasks:**
- [ ] RuntimeNode custom surface rendering in ImGui backend
- [ ] Shader compilation and execution
- [ ] Offscreen texture integration
- [ ] Input routing to custom surfaces

---

## Dependency Graph

```
Phase 1 (Contract)
    ↓
Phase 2 (Standalone RuntimeNode)
    ↓
Phase 3 (Vertical Slice)          ← PROVE IT WORKS HERE
    ↓
Phase 4 (Shell Migration)
    ↓
Phase 5 (Delete widget onDraw)
    ↓
Phase 6 (Canvas consumes display lists)
    ↓
Phase 7 (Delete Canvas)           ← END STATE
    ↓
Phase 8 (Advanced Surfaces)
```

---

## What happens to the existing imgui-replace code

The existing `imgui-replace` mode, `ImGuiRuntimeNodeHost`, snapshot cloning, and `invokeDrawForRetained` hack are **not on the path forward**. They can stay in the codebase temporarily as reference but should not receive further fixes.

The new `imgui-direct` mode (Phase 3) replaces them entirely with a clean architecture.

**Salvageable from existing code:**
- `RuntimeNodeRenderer` display list rendering — reuse directly
- Hit testing logic — reuse directly
- Input routing logic — reuse with modifications (no snapshot, use live tree)
- Display list format — keep as-is

**Not salvageable:**
- Snapshot cloning (`makeSnapshot`) — unnecessary when rendering from live tree on same thread
- `invokeDrawForRetained` — hack to call Canvas paint without Canvas
- `_syncConsoleOverlayRetained` — hack to rebuild console outside paint cycle
- The entire concept of Canvas hidden behind ImGui

---

## Risk Checkpoints

### After Phase 3 (Vertical Slice)
- [ ] One real project renders through ImGui without Canvas
- [ ] All widgets interactive
- [ ] Performance equal or better than Canvas
- [ ] Canvas mode completely unaffected

### After Phase 5 (Widget onDraw deletion)
- [ ] All widgets have single rendering path
- [ ] No `gfx.*` calls remain in widget files
- [ ] Both Canvas and ImGui modes work from display lists

### After Phase 7 (Canvas deletion)
- [ ] Canvas.h/cpp deleted from codebase
- [ ] All UIs render through ImGui
- [ ] All interactions work
- [ ] Performance is better than old Canvas path
- [ ] No regressions in shipped functionality

---

## Success Criteria

1. **Canvas is deleted from the codebase**
2. **All UIs render correctly through ImGui**
3. **Performance is better than Canvas/JUCE** (especially at scale/high-DPI)
4. **Widget authoring API is cleaner** (single rendering path, no dual maintenance)
5. **Custom visuals (shaders, waveforms) work**
6. **Editor tooling (hierarchy, inspector, selection) works**
7. **No regression in shipped functionality**
