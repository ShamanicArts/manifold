# Canvas Dependency Audit - UPDATED (2026-03-17)

This audit compares the current codebase state against the previous audit from 2026-03-16.
The project has made **significant progress** toward RuntimeNode/ImGui-only operation.

---

## Executive Summary

| Metric | Previous (Audit 1) | Current (Audit 2) | Change |
|--------|-------------------|-------------------|--------|
| **Supported Renderer** | Canvas | **ImGuiDirect ONLY** | ✅ Migrated |
| Shell gfx.* calls | 252 | **17** (-93%) | ✅ Mostly migrated |
| Shell setOnDraw | 29 | **17** (-41%) | ✅ In progress |
| Shell setDisplayList | Minimal | **22** | ✅ Actively using retained mode |
| Widget gfx.* calls | ~469 total | **195** (-58%) | ✅ Significant progress |
| Widget setOnDraw | Many | **17** | ✅ Mostly migrated |
| Widget _syncRetained | Partial | **17 widgets** | ✅ Near complete |
| xypad_trails.lua | Present | **DELETED** | ✅ Removed |
| MidiSynth keyboard.lua | Canvas-only | **MIGRATED** | ✅ Display lists |
| MidiSynth envelope.lua | Canvas-only | **MIGRATED** | ✅ Display lists |

**Important:** Only `ImGuiDirect` renderer mode is fully supported. `Canvas`, `ImGuiOverlay`, and `ImGuiReplace` modes are deprecated/transitional:
- `Canvas` mode → **rejected** at runtime
- `ImGuiOverlay` mode → **auto-converts** to `ImGuiDirect`
- `ImGuiReplace` mode → **transitional/not fully supported**

---

## 1. C++ Infrastructure - COMPLETE

### Dual Root System Implemented
```cpp
// BehaviorCoreEditor.h - RootMode enum
enum class RootMode { Canvas = 0, RuntimeNode = 1 };

// Default constructor now uses RuntimeNode
explicit BehaviorCoreEditor(BehaviorCoreProcessor& ownerProcessor,
                            RootMode rootMode = RootMode::RuntimeNode);
```

### Renderer Modes (ONLY ImGuiDirect is Supported)
```cpp
enum class RuntimeRendererMode {
    Canvas = 0,           // DEPRECATED - auto-converts to ImGuiDirect
    ImGuiOverlay = 1,     // DEPRECATED - auto-converts to ImGuiDirect
    ImGuiReplace = 2,     // DEPRECATED - transitional, not fully supported
    ImGuiDirect = 3,      // **ONLY SUPPORTED MODE** - Direct ImGui rendering
};
```

**Important:** When `RootMode::RuntimeNode` is active (the default), both `Canvas` and `ImGuiOverlay` modes are **automatically converted** to `ImGuiDirect`:
```cpp
if (rootMode_ == RootMode::RuntimeNode
    && (mode == RuntimeRendererMode::Canvas || mode == RuntimeRendererMode::ImGuiOverlay)) {
    mode = RuntimeRendererMode::ImGuiDirect;
}
```

The console command `renderer canvas` is **rejected** with error message: "canvas renderer is deprecated and not a supported shell target".

### RuntimeNode API - COMPLETE
All previously missing APIs have been implemented:

| API | Previous Status | Current Status |
|-----|----------------|----------------|
| `setTransform()` / `clearTransform()` | ❌ Missing | ✅ **IMPLEMENTED** |
| `setZOrder()` / `getZOrder()` | ✅ Exists | ✅ **USED** |
| `grabKeyboardFocus()` | ✅ Exists | ✅ **USED** |
| `repaint()` → `markRenderDirty()` | ✅ Exists | ✅ **USED** |
| `setDisplayList()` | ✅ Exists | ✅ **HEAVILY USED** |
| `isHovered()` / `isPressed()` / `isFocused()` | ✅ Exists | ✅ **USED** |

### ImGui Host Infrastructure - COMPLETE
- `ImGuiDirectHost` - Primary renderer (new since audit)
- `ImGuiRuntimeNodeHost` - Debug/preview renderer
- `ImGuiHierarchyHost` - Tree view (replaces Canvas tree)
- `ImGuiScriptListHost` - Script list (replaces Canvas script list)
- `ImGuiInspectorHost` - Inspector panel (replaces Canvas inspector)
- `ImGuiPerfOverlayHost` - Performance overlay
- `RuntimeNodeRenderer` - Display list compiler/renderer

---

## 2. Shell Canvas Dependencies - MOSTLY MIGRATED

### 2.1 Shell Files Status

| File | gfx.* calls | setOnDraw | setDisplayList | Status |
|------|------------|-----------|----------------|--------|
| `shell/bindings.lua` | 252 → **8** | 8 → **8** | **14** | 🟡 In progress |
| `ui_shell.lua` | 53 → **3** | 1 → **1** | **2** | 🟢 Nearly done |
| `shell/methods_layout.lua` | 0 | 0 | **2** | 🟢 Migrated |
| `shell/methods_core.lua` | 6 | 8 | **4** | 🟡 In progress |

### 2.2 Canvas-Only APIs in Shell

| API | Count | Location | Status |
|-----|-------|----------|--------|
| `setTransform()` / `clearTransform()` | 4 | `methods_layout.lua` lines 323, 326, 635, 639 | 🟡 Canvas-only, needs RuntimeNode equivalent |
| `toFront()` | ~9 | `base_utils.lua` `safeToFront()` wrapper | 🟢 Wrapper handles both Canvas + RuntimeNode |
| `grabKeyboardFocus()` | ~3 | `base_utils.lua` `safeGrabKeyboardFocus()` | 🟢 Wrapper handles both |
| `repaint()` | ~60 | Throughout shell | 🟢 Works on both (RuntimeNode has `markRenderDirty()`) |

### 2.3 Global Flags for ImGui Host Coordination

The shell now checks these globals to skip Canvas rendering when ImGui hosts are active:
- `_G.__manifoldImguiHierarchyActive` - Tree view
- `_G.__manifoldImguiScriptListActive` - Script list  
- `_G.__manifoldImguiInspectorActive` - Inspector panel

These are set by C++ when the ImGui hosts are rendering the respective panels.

---

## 3. Widget Dual-Path Analysis - COMPLETE

All widgets now have BOTH `onDraw()` (Canvas) and `_syncRetained()` (RuntimeNode) implementations:

| Widget | onDraw (gfx.*) | _syncRetained | Notes |
|--------|---------------|---------------|-------|
| `button.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `label.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `panel.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `toggle.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `meter.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `slider.lua` | ✅ Yes | ✅ Yes | Both paths active (Slider + VSlider) |
| `knob.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `numberbox.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `segmented.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `dropdown.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `donut.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `waveform.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `tabhost.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `xypad.lua` | ✅ Yes | ✅ Yes | Both paths active |
| `xypad_trails.lua` | ✅ Yes | **REMOVED** | ✅ **FILE DELETED** |
| `glsl.lua` | ✅ Yes | N/A | Uses OpenGL directly |
| `gl_surface.lua` | ✅ Yes | ✅ Yes | Both paths active |

### 3.1 BaseWidget Rendering Dispatch (base.lua lines 130-150)
```lua
if (not self._runtimeNodeOnly) and self.node.setOnDraw then
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

The `_runtimeNodeOnly` flag determines which path. When parent is RuntimeNode, `setOnDraw` is NOT called.

---

## 4. Behavior System (UserScripts) - PARTIALLY MIGRATED

### 4.1 MidiSynth Keyboard (keyboard.lua)
- **Status**: 🔴 **STILL CANVAS-ONLY**
- Uses `g:setColor()`, `g:fillRect()`, `g:drawRect()` via Graphics object
- Uses `ctx.widgets.canvas.onMouseDown = fn` (NOT through `canvas:setOnMouseDown()`)
- **No setOnDraw, no display list, no _syncRetained**
- **Action needed**: Add `_syncRetained` or migrate to display list building

### 4.2 Shared Capture Plane (shared_capture_plane.lua)
- **Status**: 🟢 **MIGRATED**
- Uses `setOnDraw` callback that builds display list via `setDisplayList()`
- The `invokeDrawForRetained` hack works for this
- Already builds display lists properly

### 4.3 MidiSynth Project - MIGRATED ✅

The MidiSynth project has been **migrated to RuntimeNode display list pattern**:

| File | Migration Status | Pattern Used |
|------|-----------------|--------------|
| `keyboard.lua` | ✅ **MIGRATED** | `buildKeyboardDisplay()` + `setDisplayList()` + `setOnDraw()` |
| `envelope.lua` | ✅ **MIGRATED** | `buildEnvelopeDisplay()` + `setDisplayList()` + `setOnDraw()` |
| `spectrum.ui.lua` | 🟡 **UNUSED** | `type = "Canvas"` widget defined but no behavior implemented |

**Migration Pattern Applied:**
```lua
-- Build display list for RuntimeNode mode
local function buildKeyboardDisplay(ctx, w, h)
    local display = {}
    -- White keys
    display[#display+1] = {cmd="fillRect", x=x, y=y, w=w, h=h, color=0xFFFFFFFF}
    display[#display+1] = {cmd="drawRect", x=x, y=y, w=w, h=h, thickness=1, color=0xFFAAAAAA}
    -- Black keys...
    return display
end

-- Canvas immediate mode (for Canvas renderer)
local function drawKeyboardCanvas(ctx, w, h)
    gfx.setColour(0xFFFFFFFF)
    gfx.fillRect(x, y, w, h)
    -- ...
end

-- In behavior init - RuntimeNode style callbacks:
if canvas.setOnMouseDown then
    canvas:setOnMouseDown(function(mx, my) ctx:handleMouseDown(mx, my) end)
end
if canvas.setOnMouseUp then
    canvas:setOnMouseUp(function(mx, my) ctx:handleMouseUp(mx, my) end)
end
if canvas.setOnMouseDrag then
    canvas:setOnMouseDrag(function(mx, my, dx, dy) ctx:handleMouseDrag(mx, my) end)
end

-- Dual-path rendering:
if canvas.setOnDraw then
    -- Canvas mode: immediate rendering
    canvas:setOnDraw(function(node)
        drawKeyboardCanvas(ctx, node:getWidth(), node:getHeight())
    end)
end
-- RuntimeNode mode: retained display list
ctx:refreshKeyboardDisplay()  -- calls setDisplayList(buildKeyboardDisplay(...))
```

**Key Changes Made:**
1. Replaced property-style callbacks (`canvas.onMouseDown = fn`) with RuntimeNode methods (`canvas:setOnMouseDown(fn)`)
2. Replaced `g:setColor()`/`g:fillRect()` with display list table building
3. Added `_build*Display()` functions that return display list tables
4. Added dual-path rendering: `setOnDraw` for Canvas, `setDisplayList` for RuntimeNode
5. Added transparent style setup for RuntimeNode mode

### 4.4 UserScripts Project Widgets - FULLY MIGRATED ✅

The `UserScripts/projects/ExperimentalUI/ui/widgets/` directory contains 7 custom widgets. **ALL are fully migrated** to dual-path rendering:

| Widget | _buildDisplay | onDraw (Canvas) | _syncRetained (RuntimeNode) | Status |
|--------|---------------|-----------------|----------------------------|--------|
| `eq_visualizer.lua` | ✅ | `Visual.renderDisplayList()` | `setDisplayList()` | 🟢 Migrated |
| `kaleidoscope.lua` | ✅ | `Visual.renderDisplayList()` | `setDisplayList()` | 🟢 Migrated |
| `matrix_rain.lua` | ✅ | `Visual.renderDisplayList()` | `setDisplayList()` | 🟢 Migrated |
| `particle_emitter.lua` | ✅ | `Visual.renderDisplayList()` | `setDisplayList()` | 🟢 Migrated |
| `vector_field.lua` | ✅ | `Visual.renderDisplayList()` | `setDisplayList()` | 🟢 Migrated |
| `waveform_ring.lua` | ✅ | `Visual.renderDisplayList()` | `setDisplayList()` | 🟢 Migrated |
| `xy_trails.lua` | ✅ | `Visual.renderDisplayList()` | `setDisplayList()` | 🟢 Migrated |
| `visual_utils.lua` | N/A | Helper: `renderDisplayList()` | Helper: `setTransparentStyle()` | 🟢 Migrated |

All widgets use the `visual_utils.lua` helper pattern:
- `_buildDisplay(w, h)` returns a display list table
- `onDraw()` calls `Visual.renderDisplayList(self:_buildDisplay(w, h))` for Canvas mode
- `_syncRetained()` calls `self.node:setDisplayList(self:_buildDisplay(w, h))` for RuntimeNode mode

**The ExperimentalUI project is 100% RuntimeNode-compatible.**

---

## 5. Remaining Canvas Dependencies by Priority

### Priority 1: CRITICAL (Blocks Canvas Removal)

- [x] ~~**`xypad_trails.lua`**~~ - **FILE REMOVED**
- [x] ~~**`UserScripts/projects/MidiSynth_uiproject/keyboard.lua`**~~ - **MIGRATED to display lists**
- [x] ~~**`UserScripts/projects/MidiSynth_uiproject/envelope.lua`**~~ - **MIGRATED to display lists**
- [ ] **`shell/bindings.lua`** - Complete migration of 8 remaining `setOnDraw` callbacks
- [ ] **`shell/methods_core.lua`** - Complete migration of 8 remaining `setOnDraw` callbacks

### Priority 2: HIGH (Clean Architecture)

- [ ] **Remove Canvas fallback in widgets** - Once Canvas is deprecated, delete `onDraw()` methods
- [ ] **`setTransform()`/`clearTransform()`** - Currently Canvas-only in shell layout

### Priority 3: MEDIUM (Cleanup)

- [ ] **`LuaUIBindings.cpp`** - Keep for backward compatibility, deprecate after full migration
- [ ] **`Canvas.h/cpp`** - Delete after all consumers migrated
- [ ] **Remove `invokeDrawForRetained` hack** - No longer needed after full migration

### Priority 4: LOW (Future Work)

- [ ] **GLSL widget** - Needs custom surface handling for pure RuntimeNode mode
- [ ] **OpenGL integration** - Verify `customSurfaceType`/`customRenderPayload` APIs work standalone

---

## 6. Migration Checklist Summary

### ✅ COMPLETED
- [x] C++ RuntimeNode has all required APIs (transform, z-order, focus, display lists)
- [x] `ImGuiDirectHost` is the default renderer
- [x] All standard widgets have `_syncRetained()` implementations
- [x] Shell uses `setDisplayList()` for tree/script/inspector canvases
- [x] Dual-path `BaseWidget` system working
- [x] ImGui hosts for hierarchy/script list/inspector/perf overlay
- [x] Renderer mode switching via console commands
- [x] Safe wrappers for `toFront()` and `grabKeyboardFocus()`

### 🟡 IN PROGRESS
- [ ] Final migration of shell `setOnDraw` callbacks to pure display lists

### 🔴 NOT STARTED (Cleanup Phase)
- [ ] Remove `Canvas` class entirely (from `manifold/primitives/ui/`)
- [ ] Delete `LuaUIBindings` (Canvas Lua bindings)
- [ ] Remove deprecated renderer modes (`ImGuiOverlay`, `ImGuiReplace`)
- [ ] Remove `invokeDrawForRetained` compatibility layer
- [ ] Remove transitional code paths that auto-convert deprecated modes

---

## 7. Key Files Changed Since Previous Audit

### New Files (ImGui Infrastructure)
- `manifold/ui/imgui/ImGuiDirectHost.h/cpp` - Primary renderer
- `manifold/ui/imgui/RuntimeNodeRenderer.h/cpp` - Display list compiler
- `manifold/ui/imgui/ImGuiHierarchyHost.h/cpp` - Tree panel
- `manifold/ui/imgui/ImGuiScriptListHost.h/cpp` - Script list panel
- `manifold/ui/imgui/ImGuiInspectorHost.h/cpp` - Inspector panel

### Modified Files (Dual-Path Support)
- `manifold/ui/widgets/base.lua` - Dual-path rendering dispatch
- `manifold/ui/widgets/*.lua` - All widgets now have `_syncRetained()`
- `manifold/ui/shell/bindings.lua` - Display list builders for tree/script canvases
- `manifold/primitives/ui/RuntimeNode.h/cpp` - Added transform, z-order, focus APIs
- `manifold/primitives/scripting/LuaEngine.cpp` - Dual root initialization

---

## 8. Console Commands for Renderer Mode

```lua
-- Check current mode
renderer status

-- Switch to supported mode
renderer imgui-direct      -- ONLY SUPPORTED MODE - pure ImGui

-- Deprecated modes (auto-convert to imgui-direct or rejected):
renderer imgui-overlay     -- DEPRECATED - converts to imgui-direct
renderer imgui-replace     -- DEPRECATED - not fully supported
renderer canvas            -- REJECTED - error: "canvas renderer is deprecated"
```

**Note:** The only fully functional renderer mode is `imgui-direct`. All other modes exist in the codebase for backward compatibility but are either auto-converted to `imgui-direct` or rejected at runtime.

---

## Conclusion

The codebase has made **dramatic progress** since the previous audit:

1. **ONLY ImGuiDirect is supported** - Canvas, ImGuiOverlay, and ImGuiReplace are deprecated
2. **All standard widgets support RuntimeNode mode** via `_syncRetained()`
3. **Shell panels use ImGui hosts** coordinated via global flags
4. **RuntimeNode has all required APIs** for standalone operation

**Architecture Reality:**
- `ImGuiDirect` is the **only supported renderer mode**
- `Canvas`, `ImGuiOverlay`, and `ImGuiReplace` modes exist for backward compatibility but:
  - `Canvas` mode is **rejected** at runtime with error
  - `ImGuiOverlay` mode is **auto-converted** to `ImGuiDirect`
  - `ImGuiReplace` mode is **transitional/not fully supported**

**Remaining blockers for complete Canvas code removal:**
1. Final cleanup of shell `setOnDraw` callbacks (in `shell/bindings.lua` and `shell/methods_core.lua`)
2. Removal of deprecated `Canvas` class and `LuaUIBindings`

The architecture is now **ImGuiDirect-only** with transitional code paths that should be removed.
