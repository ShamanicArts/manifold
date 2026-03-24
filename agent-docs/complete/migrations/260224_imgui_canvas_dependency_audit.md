# Canvas Dependency Audit

Dense reference artifact for finding and fixing every Canvas dependency in the codebase.
Generated from combined agent + Kimi research, 2026-03-16.

---

## 1. Canvas-Only APIs — Complete Call Site Inventory

### 1.1 Immediate-Mode Drawing (`gfx.*`) — 469 total calls

These only work inside `setOnDraw` callbacks during Canvas `paint()`. They do NOT exist on RuntimeNode.

| File | gfx.* calls | Context |
|------|------------|---------|
| `manifold/ui/shell/bindings.lua` | 252 | Shell canvases: tree, dsp, script, tabs, inspector, console, preview |
| `manifold/ui/manifold_ui_experimental.lua` | 53 | Particle pad, matrix rain, EQ, wave, noise, kaleidoscope |
| `manifold/ui/dsp_live_scripting.lua` | 46 | Code editor, node graph |
| `manifold/ui/widgets/dropdown.lua` | 36 | Dropdown overlay rendering |
| `manifold/ui/manifold_settings_ui.lua` | 26 | Settings scrollbar, target list, script list |
| `manifold/ui/widgets/numberbox.lua` | 23 | Number display + editing |
| `manifold/ui/widgets/xypad_trails.lua` | 19 | Trail rendering (NO _syncRetained exists) |
| `manifold/ui/widgets/xypad.lua` | 17 | XY pad rendering |
| `manifold/ui/widgets/knob.lua` | 17 | Circle/arc/pointer/text drawing |
| `manifold/ui/ui_shell.lua` | 17 | Script overlay |
| `manifold/ui/widgets/slider.lua` | 13 | Track/thumb/value drawing |
| `manifold/ui/widgets/meter.lua` | 12 | Meter bar/peak drawing |
| `manifold/ui/widgets/tabhost.lua` | 11 | Tab bar/button drawing |
| `manifold/ui/widgets/waveform.lua` | 10 | Waveform peak drawing |
| `manifold/ui/widgets/segmented.lua` | 9 | Segment button drawing |
| `manifold/ui/shell/runtime_script_utils.lua` | 9 | Runtime script helpers |
| `manifold/ui/widgets/toggle.lua` | 7 | Toggle switch drawing |
| `manifold/ui/widgets/button.lua` | 7 | Button bg/border/text |
| `manifold/ui/widgets/donut.lua` | 6 | Donut arc drawing |
| `manifold/ui/widgets/panel.lua` | 4 | Panel bg/border |
| `manifold/ui/widgets/label.lua` | 4 | Text drawing |
| `manifold/ui/shell/methods_core.lua` | 1 | Misc |

### 1.2 `setOnDraw()` — 29 call sites

| File | Count | Nodes |
|------|-------|-------|
| `shell/bindings.lua` | 8 | treeCanvas, dspCanvas, scriptCanvas, mainTabBar, mainTabContent, inspectorCanvas, consoleOverlay, previewOverlay |
| `manifold_ui_experimental.lua` | 7 | editor, particlePad, eqCanvas, waveCanvas, noiseCanvas, kaleidoCanvas, graphCanvas |
| `manifold_settings_ui.lua` | 3 | scrollBar, targetListOverlay, scriptListOverlay |
| `dsp_live_scripting.lua` | 2 | editor, graphCanvas |
| `widgets/dropdown.lua` | 2 | dropdown overlay |
| `widgets/base.lua` | 2 | BaseWidget Canvas-mode rendering |
| `widgets/panel.lua` | 1 | Panel (referenced in comment) |
| `ui_shell.lua` | 1 | scriptOverlay |

### 1.3 `repaint()` — 149 call sites

Widgets call `self.node:repaint()` (72 sites — RuntimeNode-compatible via `markRenderDirty()`).
Shell/behavior code calls `canvas:repaint()` directly (~60 sites — Canvas-only, triggers JUCE paint cycle).
Remaining ~17 are in settings/experimental UIs.

### 1.4 `toFront()` — 14 call sites

All in shell code. Used for z-ordering overlays.

| File | Count | Nodes |
|------|-------|-------|
| `shell/methods_layout.lua` | 9 | content, mainTabContent, mainTabBar, previewOverlay, treePanel, inspectorPanel, scriptOverlay |
| `shell/methods_core.lua` | 2 | consoleOverlay |
| `ui_shell.lua` | 1 | scriptOverlay |
| `shell/methods_layout.lua` | 2 | additional content/panel refs |

**RuntimeNode equivalent:** `setZOrder(int)` exists but nothing currently uses it for ordering. Renderer must sort children by zOrder.

### 1.5 `grabKeyboardFocus()` — 12 call sites

| File | Count | Nodes |
|------|-------|-------|
| `shell/bindings.lua` | 8 | Various canvas nodes on click |
| `shell/methods_core.lua` | 3 | consoleOverlay, inspectorCanvas, mainTabContent |
| `dsp_live_scripting.lua` | 1 | Editor canvas |

**RuntimeNode equivalent:** `grabKeyboardFocus()` exists in LuaRuntimeNodeBindings (sets focusable=true, keyboard=true, isFocused=true). Renderer must respect `isFocused()` for keyboard routing.

### 1.6 `setTransform()` / `clearTransform()` — 4 call sites

All in `shell/methods_layout.lua`. Used for edit mode zoom/pan of content.

```lua
self.content:setTransform(scale, scale, tx, ty)   -- line 321, 632
self.content:clearTransform()                       -- line 324, 636
```

**RuntimeNode equivalent:** Does not exist. Must be added for edit mode support.

### 1.7 `setInterceptsMouse()` — ~35 call sites

Both Canvas and RuntimeNode have this. Canvas version calls `juce::Component::setInterceptsMouseClicks()` AND syncs to RuntimeNode `inputCapabilities`. RuntimeNode version sets capabilities directly.

Most call sites are in `ui_shell.lua` (9) and `shell/methods_layout.lua` (4).

### 1.8 OpenGL APIs — 4 call sites

All in `widgets/glsl.lua`:
```lua
self.node:setOpenGLEnabled(true)
self.node:setOnGLContextCreated(function() ... end)
self.node:setOnGLContextClosing(function() ... end)
self.node:setOnGLRender(function(node) ... end)
```

Canvas-only. RuntimeNode has `customSurfaceType` and `customRenderPayload` for this.

---

## 2. Widget Dual-Path Analysis

Every widget (except xypad_trails and glsl) has TWO complete rendering implementations:

| Widget | `onDraw` (Canvas) | `_syncRetained` (RuntimeNode) | `setDisplayList` calls |
|--------|-------------------|------------------------------|----------------------|
| button.lua | 7 gfx calls | Yes | 1 |
| label.lua | 4 gfx calls | Yes | 1 |
| panel.lua | 4 gfx calls | Yes | 1 |
| toggle.lua | 7 gfx calls | Yes | 1 |
| meter.lua | 12 gfx calls | Yes | 1 |
| slider.lua | 13 gfx calls | Yes | 2 |
| knob.lua | 17 gfx calls | Yes | 1 |
| numberbox.lua | 23 gfx calls | Yes | 1 |
| segmented.lua | 9 gfx calls | Yes | 1 |
| dropdown.lua | 36 gfx calls | Yes | 2 |
| donut.lua | 6 gfx calls | Yes | 1 |
| waveform.lua | 10 gfx calls | Yes | 1 |
| tabhost.lua | 11 gfx calls | Yes | 1 |
| xypad.lua | 17 gfx calls | Yes | 1 |
| xypad_trails.lua | 19 gfx calls | **NO** | 0 |
| glsl.lua | 0 gfx calls | **NO** (uses GL) | 0 |

### Widgets missing `_syncRetained`:
- **xypad_trails.lua** — 19 gfx calls, no retained path at all
- **glsl.lua** — uses OpenGL directly, needs custom surface handling

### BaseWidget rendering dispatch (base.lua lines 130-137):
```lua
if self.node.setOnDraw then
    -- Canvas mode: immediate drawing
    self.node:setOnDraw(function(node)
        self._hovered = node:isMouseOver()
        self:onDraw(node:getWidth(), node:getHeight())
    end)
else
    -- RuntimeNode-only mode: retained display lists
    self:refreshRetained()
end
```

The `_runtimeNodeOnly` flag (set when parent is RuntimeNode) determines which path. When parent is Canvas, `self.node` IS a Canvas and has `setOnDraw`. When parent is RuntimeNode, `self.node` IS a RuntimeNode and doesn't have `setOnDraw`.

---

## 3. Shell Canvas Creation

In `ui_shell.lua`, the shell creates all its canvases via `Canvas:addChild()`:

```lua
-- These all return Canvas objects, NOT RuntimeNode
shell.treeCanvas    = shell.treePanel.node:addChild("treeCanvas")
shell.dspCanvas     = shell.treePanel.node:addChild("dspCanvas")
shell.scriptCanvas  = shell.treePanel.node:addChild("scriptCanvas")
shell.mainTabBar    = parentNode:addChild("mainTabBar")
shell.mainTabContent = parentNode:addChild("mainTabContent")
shell.previewOverlay = parentNode:addChild("editorPreviewOverlay")
shell.consoleOverlay = parentNode:addChild("devConsoleOverlay")
shell.inspectorCanvas = shell.inspectorPanel.node:addChild("inspectorCanvas")
```

`parentNode` is `root` which is the root Canvas set in LuaEngine.cpp line 527:
```cpp
lua["root"] = pImpl->rootCanvas;
```

**Key distinction:**
- `Canvas:addChild(name)` → returns `Canvas*` (LuaUIBindings.cpp line 222)
- `RuntimeNode:addChild(name)` / `RuntimeNode:createChild(name)` → returns `RuntimeNode*` (LuaRuntimeNodeBindings.cpp)

When the shell calls `node:addChild()` on a Canvas parent, it gets back Canvas children. All subsequent `setOnDraw`, `toFront`, `grabKeyboardFocus` etc. work because the objects ARE Canvas instances.

**To migrate:** If `root` becomes a RuntimeNode instead of Canvas, then `addChild()` returns RuntimeNode, and all Canvas-only API calls (`setOnDraw`, `toFront`, `grabKeyboardFocus`) will fail at runtime.

---

## 4. C++ Canvas Ownership Chain

```
BehaviorCoreEditor (JUCE AudioProcessorEditor)
    └── rootCanvas_ (Canvas*, created in constructor)
            └── LuaEngine::initialise(processor, rootCanvas)
                    └── lua["root"] = rootCanvas
                    └── LuaUIBindings::registerBindings(engine, rootCanvas)
                    └── LuaRuntimeNodeBindings::registerBindings(engine, rootCanvas)
                            └── lua["rootRuntime"] = rootCanvas->getRuntimeNode()
```

Canvas is created in `BehaviorCoreEditor` constructor. LuaEngine receives it. Lua gets both `root` (Canvas) and `rootRuntime` (RuntimeNode pointer from root Canvas).

**To migrate:** BehaviorCoreEditor needs to create a RuntimeNode root (or both Canvas and RuntimeNode roots) and pass the appropriate one to LuaEngine based on renderer mode.

---

## 5. RuntimeNode API Surface (Complete)

### Already exists and works standalone:
```
Identity:       stableId, nodeId, widgetType
Hierarchy:      createChild, addChild, removeChild, clearChildren, getParent, getChildren, findById, findByStableId
Geometry:       setBounds, getBounds, getWidth, getHeight, setClipRect, clearClipRect
Visibility:     setVisible, isVisible, setZOrder, getZOrder
Style:          setStyle({background, border, borderWidth, cornerRadius, opacity, padding})
Callbacks:      onMouseDown/Drag/Up/Move/Wheel, onClick, onDoubleClick, onKeyPress, onMouseEnter/Exit, onValueChanged, onToggled
Input caps:     setInputCapabilities({pointer, wheel, keyboard, focusable, interceptsChildren})
State:          isHovered/isPressed/isFocused + setters
Rendering:      setDisplayList, getDisplayList, clearDisplayList, setCustomSurfaceType, setCustomRenderPayload
Dirty tracking: getStructureVersion, getPropsVersion, getRenderVersion, markStructureDirty, markPropsDirty, markRenderDirty (bubbles to parent)
Storage:        setUserData, getUserData, hasUserData, clearUserData
```

### Missing for standalone operation:
| Need | Current source | RuntimeNode status | Action needed |
|------|---------------|-------------------|---------------|
| Transform (scale/translate) | Canvas `setTransform()` via JUCE `AffineTransform` | Not present | Add `setTransform(sx, sy, tx, ty)` / `getTransform()` |
| Z-ordering (toFront) | Canvas `toFront()` via JUCE component ordering | `setZOrder(int)` exists | Renderer must sort by zOrder |
| Keyboard focus request | Canvas `grabKeyboardFocus()` via JUCE | `grabKeyboardFocus()` in Lua bindings (sets caps+state) | Renderer must route keys to focused node |
| Repaint request | Canvas `repaint()` triggers JUCE paint | `markRenderDirty()` exists | Renderer polls version counters |
| Mouse-over query | Canvas `isMouseOverOrDragging()` via JUCE | `isHovered()` exists | Renderer sets hovered state via hit-test |
| Name | Canvas `getName()` via JUCE Component | Not exposed | Add if needed, or use nodeId |

### Lua bindings comparison:

| Binding | Canvas (LuaUIBindings) | RuntimeNode (LuaRuntimeNodeBindings) |
|---------|----------------------|-------------------------------------|
| addChild | Returns `Canvas*` | Returns `RuntimeNode*` |
| setBounds | Calls JUCE setBounds + syncs to RuntimeNode | Sets directly on RuntimeNode |
| setOnDraw | Sets Canvas paint callback | **Does not exist** |
| setOnMouseDown | Sets Canvas std::function + mirrors to RuntimeNode CallbackSlots | Sets CallbackSlots directly |
| repaint | Calls JUCE repaint() | Calls markRenderDirty() |
| grabKeyboardFocus | Calls JUCE grabKeyboardFocus() | Sets focusable+keyboard caps + isFocused |
| toFront | Calls JUCE toFront() | **Does not exist** (use setZOrder) |
| setTransform | Calls JUCE setTransform() | **Does not exist** |
| setStyle | Sets CanvasStyle + syncs to RuntimeNode StyleState | Sets StyleState directly |
| setInterceptsMouse | Sets JUCE intercepts + syncs to RuntimeNode caps | Sets caps directly |
| setOpenGLEnabled | Enables JUCE OpenGL rendering | **Does not exist** |
| setOnGLRender | Sets Canvas GL callback | **Does not exist** |
| isMouseOver | Calls JUCE isMouseOverOrDragging() | Returns isHovered() |

---

## 6. Behavior System (UserScripts) Canvas Dependencies

### MidiSynth keyboard (keyboard.lua)
- Uses `g:setColor()`, `g:fillRect()`, `g:drawRect()` — Canvas immediate mode via Graphics object
- Callbacks set on widget table (`ctx.widgets.canvas.onMouseDown = fn`) NOT through `canvas:setOnMouseDown(fn)` — so they don't mirror to RuntimeNode
- **No setOnDraw, no display list, no _syncRetained**
- Completely Canvas-dependent

### Shared capture plane (shared_capture_plane.lua)
- Uses `setOnDraw` callback that calls `getCapturePeaks()` and builds display list via `setDisplayList()`
- **Already builds display lists** — the `invokeDrawForRetained` hack works for this
- Migration: extract display list building out of `setOnDraw`, call directly

### Other behaviors
- Oscillator, filter, effects, envelope behaviors in MidiSynth — use standard widgets
- LooperTabs behaviors — use standard widgets + capture plane behavior

---

## 7. Migration Checklist Per File

### Priority 1: Shell canvases (blocks everything)

- [ ] `shell/bindings.lua` — Convert 8 `setOnDraw` callbacks (252 gfx calls) to `setDisplayList()` builders
- [ ] `ui_shell.lua` — Change shell canvas creation from `Canvas:addChild()` to `RuntimeNode:createChild()`
- [ ] `shell/methods_layout.lua` — Replace 14 `toFront()` with `setZOrder()`, replace 4 `setTransform()`/`clearTransform()` with RuntimeNode equivalent
- [ ] `shell/methods_core.lua` — Replace `grabKeyboardFocus()` with RuntimeNode focus, replace `repaint()` with `markRenderDirty()`

### Priority 2: Widget onDraw deletion (after shell works)

- [ ] `widgets/base.lua` — Remove `setOnDraw` path, make `_syncRetained` the only path
- [ ] `widgets/button.lua` — Delete `onDraw()` method (7 gfx calls)
- [ ] `widgets/label.lua` — Delete `onDraw()` method (4 gfx calls)
- [ ] `widgets/panel.lua` — Delete `onDraw()` method (4 gfx calls)
- [ ] `widgets/toggle.lua` — Delete `onDraw()` method (7 gfx calls)
- [ ] `widgets/meter.lua` — Delete `onDraw()` method (12 gfx calls)
- [ ] `widgets/slider.lua` — Delete `onDraw()` method (13 gfx calls)
- [ ] `widgets/knob.lua` — Delete `onDraw()` and all draw helpers (17 gfx calls)
- [ ] `widgets/numberbox.lua` — Delete `onDraw()` method (23 gfx calls)
- [ ] `widgets/segmented.lua` — Delete `onDraw()` method (9 gfx calls)
- [ ] `widgets/dropdown.lua` — Delete `onDraw()` method + overlay drawing (36 gfx calls)
- [ ] `widgets/donut.lua` — Delete `onDraw()` method (6 gfx calls)
- [ ] `widgets/waveform.lua` — Delete `onDraw()` method (10 gfx calls)
- [ ] `widgets/tabhost.lua` — Delete `onDraw()` method (11 gfx calls)
- [ ] `widgets/xypad.lua` — Delete `onDraw()` method (17 gfx calls)
- [ ] `widgets/xypad_trails.lua` — **Must ADD `_syncRetained` first** (19 gfx calls, no retained path)

### Priority 3: Settings/experimental UIs

- [ ] `manifold_settings_ui.lua` — 26 gfx calls, 3 setOnDraw callbacks
- [ ] `manifold_ui_experimental.lua` — 53 gfx calls, 7 setOnDraw callbacks
- [ ] `dsp_live_scripting.lua` — 46 gfx calls, 2 setOnDraw callbacks

### Priority 4: C++ infrastructure

- [ ] `BehaviorCoreEditor` — Create RuntimeNode root path alongside Canvas root
- [ ] `LuaEngine` — Support RuntimeNode-only initialization
- [ ] `LuaUIBindings` — Keep for backward compatibility during migration, remove after
- [ ] `Canvas.h/.cpp` — Delete after all consumers migrated

### Priority 5: Behavior system

- [ ] `MidiSynth keyboard.lua` — Add `_syncRetained` or `setOnDraw` + `setDisplayList`
- [ ] `shared_capture_plane.lua` — Extract display list building from `setOnDraw`
