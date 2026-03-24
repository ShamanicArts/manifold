# Canvas & Deprecated Renderer Mode Removal - Dense Audit

**Objective:** Complete removal of Canvas class, LuaUIBindings, and deprecated renderer modes (Canvas, ImGuiOverlay, ImGuiReplace) while preserving the renderer switching infrastructure (which will only support ImGuiDirect).

**Date:** 2026-03-17

---

## 1. BEHAVIORCOREEDITOR.H - HEADER CHANGES

### File: `manifold/core/BehaviorCoreEditor.h`

| Line | Current Code | Action | Notes |
|------|--------------|--------|-------|
| 13 | `#include "../ui/imgui/ImGuiDirectHost.h"` | **KEEP** | Only needed ImGui host |
| 35-40 | `enum class RuntimeRendererMode { Canvas=0, ImGuiOverlay=1, ImGuiReplace=2, ImGuiDirect=3 };` | **MODIFY** | Reduce to single value: `enum class RuntimeRendererMode { ImGuiDirect = 0 };` |
| 46 | `RuntimeRendererMode runtimeRendererModeFromString(...)` | **MODIFY** | Always return ImGuiDirect, remove parsing logic |
| 48 | `const char* runtimeRendererModeToString(RuntimeRendererMode mode)` | **MODIFY** | Always return "imgui-direct" |
| 50 | `RootMode rootMode_ = RootMode::RuntimeNode;` | **REVIEW** | Consider removing RootMode entirely - only RuntimeNode is used |
| 66 | `Canvas rootCanvas{"root"};` | **DELETE** | Remove Canvas member |
| 72 | `ImGuiHost mainScriptEditorHost;` | **KEEP** | Still needed for editor |
| 73-77 | `ImGuiScriptListHost`, `ImGuiHierarchyHost`, `ImGuiInspectorHost`, etc. | **KEEP** | Tool hosts still needed |
| 78 | `ImGuiRuntimeNodeHost runtimeNodeDebugHost;` | **DELETE** | Only used for deprecated modes |
| 79 | `ImGuiDirectHost directHost_;` | **KEEP** | Primary renderer |
| 80 | `Canvas* errorNode = nullptr;` | **DELETE** | Canvas-based error display |

---

## 2. BEHAVIORCOREEDITOR.CPP - IMPLEMENTATION CHANGES

### File: `manifold/core/BehaviorCoreEditor.cpp`

#### Section A: runtimeRendererModeToString() Function

| Line | Code | Action |
|------|------|--------|
| 1154-1170 | `const char* BehaviorCoreEditor::runtimeRendererModeToString(...)` | **REPLACE** with single return statement: `return "imgui-direct";` |

#### Section B: runtimeRendererModeFromString() Function

| Line | Code | Action |
|------|------|--------|
| 1172-1201 | `RuntimeRendererMode BehaviorCoreEditor::runtimeRendererModeFromString(...)` | **REPLACE** with: `return RuntimeRendererMode::ImGuiDirect;` |

#### Section C: setRuntimeRendererMode() Function

| Line | Code | Action |
|------|------|--------|
| 1203-1233 | `void BehaviorCoreEditor::setRuntimeRendererMode(...)` | **SIMPLIFY** - Remove all mode switching logic, keep only ImGuiDirect setup |
| 1205-1207 | Auto-conversion check: `if (rootMode_ == RootMode::RuntimeNode && ...)` | **DELETE** - No longer needed |
| 1216 | `directHostNeedsInitialFocus_ = (runtimeRendererMode_ == RuntimeRendererMode::ImGuiDirect);` | **SIMPLIFY** - Always true |
| 1217 | `LuaRuntimeNodeBindings::setAllowAutomaticLegacyRetainedReplay(...)` | **DELETE** - No longer needed, always false |
| 1220-1230 | Canvas mode flush logic | **DELETE** - No Canvas mode |
| 1231 | `runtimeNodeDebugHost.setRootNode(...)` | **DELETE** - Remove debug host usage |

#### Section D: updateRuntimeRendererPresentation() Function

| Line | Code | Action |
|------|------|--------|
| 1241-1292 | `void BehaviorCoreEditor::updateRuntimeRendererPresentation()` | **MASSIVE SIMPLIFICATION** |
| 1243 | `const bool useDirect = (runtimeRendererMode_ == RuntimeRendererMode::ImGuiDirect);` | **DELETE** - Always true |
| 1246-1259 | Non-direct host setup block | **DELETE** - Only direct host needed |
| 1264-1291 | Switch statement with 4 cases | **REPLACE** with single ImGuiDirect case |

#### Section E: Constructor

| Line | Code | Action |
|------|------|--------|
| 1294 | `if (const char* envRenderer = std::getenv("MANIFOLD_RENDERER"))` | **DELETE** - Environment variable handling for deprecated modes |
| 1304-1313 | RootMode determination from env | **SIMPLIFY** - Always RuntimeNode |
| 1329 | `addChildComponent(rootCanvas); rootCanvas.setVisible(false);` | **DELETE** - No Canvas |
| 1330 | `else { addAndMakeVisible(rootCanvas); }` | **DELETE** |
| 1350 | `addAndMakeVisible(runtimeNodeDebugHost);` | **DELETE** - No debug host |
| 1351 | `addChildComponent(directHost_);` | **KEEP** - Make visible instead |
| 1352-1354 | `runtimeNodeDebugHost.setOnExitRequested(...)` | **DELETE** |
| 1444 | `LuaRuntimeNodeBindings::setAllowAutomaticLegacyRetainedReplay(...)` | **DELETE** |
| 1445-1453 | RootMode != RuntimeNode initialization | **DELETE** - Only RuntimeNode |
| 1459-1469 | Environment variable renderer mode setting | **SIMPLIFY** - Always ImGuiDirect |
| 1476-1478 | Auto-conversion to ImGuiDirect | **DELETE** - No longer needed |

#### Section F: timerCallback()

| Line | Code | Action |
|------|------|--------|
| 1622 | `setRuntimeRendererMode(runtimeRendererModeFromString(...))` | **SIMPLIFY** - Always ImGuiDirect |
| 1632 | `if (runtimeRendererMode_ != RuntimeRendererMode::Canvas)` | **DELETE** - Always true |
| 1645-1649 | Canvas vs ImGuiDirect render dispatch | **SIMPLIFY** - Always directHost_.renderNow() |
| 1696-1699 | Stats snapshot ternary for mode | **SIMPLIFY** - Always directHost_ |

#### Section G: syncImGuiHostsFromLuaShell()

| Line | Code | Action |
|------|------|--------|
| 1829 | `const std::string rendererModeLabel = runtimeRendererModeToString(runtimeRendererMode_);` | **SIMPLIFY** - Hardcode "imgui-direct" |

---

## 3. LUAUIBINDINGS.H - COMPLETE FILE REMOVAL

### File: `manifold/primitives/scripting/bindings/LuaUIBindings.h`

**ACTION:** **DELETE ENTIRE FILE**

Contents to remove:
- Class declaration `class LuaUIBindings`
- Static methods: `registerBindings`, `setDisplayListCallback`, `invokeRuntimeNodeDrawForRetained`, `noteRuntimeNodeDisplayListMutation`
- Private static methods: `registerCanvasBindings`, `registerGraphicsBindings`, `registerOpenGLBindings`, `registerConstants`

---

## 4. LUAUIBINDINGS.CPP - COMPLETE FILE REMOVAL

### File: `manifold/primitives/scripting/bindings/LuaUIBindings.cpp`

**ACTION:** **DELETE ENTIRE FILE** (1607 lines)

Key components being removed:
- Canvas Lua bindings (addChild, removeChild, setBounds, etc.)
- Graphics bindings (gfx.* immediate mode API)
- OpenGL bindings
- Canvas constants (Justify, colors, etc.)
- `invokeRuntimeNodeDrawForRetained` compatibility layer
- Display list mutation tracking

---

## 5. CANVAS.H - COMPLETE FILE REMOVAL

### File: `manifold/primitives/ui/Canvas.h`

**ACTION:** **DELETE ENTIRE FILE**

Key class components being removed:
- `class Canvas : public juce::Component, public juce::OpenGLRenderer`
- All callback std::functions (onDraw, onMouseDown, etc.)
- OpenGL rendering support
- Paint profiling system
- Canvas hierarchy (addChild, removeChild, etc.)
- RuntimeNode bridge methods

---

## 6. CANVAS.CPP - COMPLETE FILE REMOVAL

### File: `manifold/primitives/ui/Canvas.cpp`

**ACTION:** **DELETE ENTIRE FILE**

---

## 7. CANVASSTYLE.H - REVIEW FOR REMOVAL

### File: `manifold/primitives/ui/CanvasStyle.h`

**ACTION:** **REVIEW** - May be needed by RuntimeNode or can be merged into RuntimeNode.h

---

## 8. LUARUNTIMENODEBINDINGS.CPP - CLEANUP

### File: `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp`

| Line | Code | Action |
|------|------|--------|
| 2 | `#include "LuaUIBindings.h"` | **DELETE** |
| 28 | `bool allowAutomaticLegacyRetainedReplay()` | **DELETE** - Always false now |
| 314 | `void LuaRuntimeNodeBindings::setAllowAutomaticLegacyRetainedReplay(bool allow)` | **DELETE** |
| 342-345 | `if (allowAutomaticLegacyRetainedReplay()...)` block | **DELETE** - No legacy replay |
| 448-451 | `if (allowAutomaticLegacyRetainedReplay()...)` block | **DELETE** |
| 468 | `LuaUIBindings::noteRuntimeNodeDisplayListMutation(node);` | **DELETE** |
| 477 | `LuaUIBindings::noteRuntimeNodeDisplayListMutation(node);` | **DELETE** |
| 597-599 | `if (allowAutomaticLegacyRetainedReplay()...)` block | **DELETE** |
| 605 | `"invokeDrawForRetained"` binding | **DELETE** - No longer needed |

---

## 9. LUARUNTIMENODEBINDINGS.H - CLEANUP

### File: `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.h`

| Line | Code | Action |
|------|------|--------|
| 9 | `static void setAllowAutomaticLegacyRetainedReplay(bool allow);` | **DELETE** |

---

## 10. LUAENGINE.CPP - CLEANUP

### File: `manifold/primitives/scripting/LuaEngine.cpp`

| Line | Code | Action |
|------|------|--------|
| 16 | `#include "bindings/LuaUIBindings.h"` | **DELETE** |
| 535-537 | `LuaUIBindings::registerBindings(...)` call | **DELETE** |
| 706-711 | RootMode conditional initialization | **SIMPLIFY** - Only RuntimeNode path |

---

## 11. CONTROL SERVER - CLEANUP

### File: `manifold/primitives/control/ControlServer.h`

| Line | Code | Action |
|------|------|--------|
| 278 | `void setCurrentUIRendererMode(int mode) { uiRendererMode_ = mode; }` | **MODIFY** - Validate mode==3 or ignore |
| 281 | `int getCurrentUIRendererMode() const { return uiRendererMode_; }` | **MODIFY** - Always return 0 (ImGuiDirect) |

### File: `manifold/primitives/control/ControlServer.cpp`

| Line | Code | Action |
|------|------|--------|
| 175-177 | `case 1: return "imgui-overlay"; case 2: return "imgui-replace"; case 3: return "imgui-direct";` | **SIMPLIFY** - Only case 0: return "imgui-direct" |
| 195-201 | String to mode conversion | **SIMPLIFY** - Always return 0 |
| 608 | Mode query response | **SIMPLIFY** |
| 664-670 | Mode setting cases 0-3 | **SIMPLIFY** - Accept any, treat as 0 |
| 702, 841 | Mode in JSON output | **SIMPLIFY** - Hardcode "imgui-direct" |

---

## 12. COMMAND PARSER - CLEANUP

### File: `manifold/primitives/control/CommandParser.h`

| Line | Code | Action |
|------|------|--------|
| 698-724 | UIRENDERER command parsing | **SIMPLIFY** - Accept any input, return success with "imgui-direct" |
| 724 | Error message: `"usage: UIRENDERER <canvas|imgui-overlay|imgui-replace|imgui-direct>"` | **UPDATE** - `"UIRENDERER always returns imgui-direct (other modes deprecated)"` |

---

## 13. LUA CONTROL BINDINGS - CLEANUP

### File: `manifold/primitives/scripting/bindings/LuaControlBindings.cpp`

| Line | Code | Action |
|------|------|--------|
| 65-71 | Mode to string cases | **SIMPLIFY** - Only return "imgui-direct" |
| 78-80 | Validation logic | **SIMPLIFY** - Always valid |
| 86-90 | String to mode conversion | **SIMPLIFY** - Always return "imgui-direct" |
| 1331-1348 | `setUIRendererMode` Lua binding | **SIMPLIFY** - Accept any, always set mode 0, return true |
| 1349-1356 | `getUIRendererMode` Lua binding | **SIMPLIFY** - Always return "imgui-direct" |

---

## 14. IMGUI HOSTS - REVIEW

### File: `manifold/ui/imgui/ImGuiRuntimeNodeHost.h/.cpp`

**ACTION:** **DELETE** - Only used for deprecated ImGuiOverlay/ImGuiReplace modes

Components:
- `ImGuiRuntimeNodeHost` class
- `PresentationMode::DebugPreview` and `Replace`
- All snapshot/hit-test code for non-direct rendering

### File: `manifold/ui/imgui/ImGuiHost.h/.cpp`

**ACTION:** **KEEP** - Used for tool windows (script editor, inspector, etc.)

### File: `manifold/ui/imgui/ImGuiDirectHost.h/.cpp`

**ACTION:** **KEEP** - Primary renderer

---

## 15. SHELL LUA - CLEANUP

### Files: `manifold/ui/shell/*.lua`

| File | Line | Code | Action |
|------|------|------|--------|
| `methods_core.lua` | ~214-216 | `invokeDrawForRetained` compatibility check | **DELETE** |
| `methods_core.lua` | ~251-252 | `invokeDrawForRetained` in tickRetainedRecursive | **DELETE** |
| `base_utils.lua` | ~91-98 | `safeToFront()` wrapper | **SIMPLIFY** - Remove Canvas branch |
| All shell files | Various | `if node.setOnDraw then` checks | **SIMPLIFY** - Assume setOnDraw always exists OR remove setOnDraw path entirely |

---

## 16. WIDGETS - CLEANUP

### Files: `manifold/ui/widgets/*.lua`

| File | Action |
|------|--------|
| `base.lua` | **MODIFY** - Remove Canvas-only path, keep only `_syncRetained` |
| `button.lua` | **MODIFY** - Delete `onDraw()` method |
| `label.lua` | **MODIFY** - Delete `onDraw()` method |
| `panel.lua` | **MODIFY** - Delete `onDraw()` method |
| `toggle.lua` | **MODIFY** - Delete `onDraw()` method |
| `meter.lua` | **MODIFY** - Delete `onDraw()` method |
| `slider.lua` | **MODIFY** - Delete `onDraw()` methods |
| `knob.lua` | **MODIFY** - Delete `onDraw()` method |
| `numberbox.lua` | **MODIFY** - Delete `onDraw()` method |
| `segmented.lua` | **MODIFY** - Delete `onDraw()` method |
| `dropdown.lua` | **MODIFY** - Delete `onDraw()` method |
| `donut.lua` | **MODIFY** - Delete `onDraw()` method |
| `waveform.lua` | **MODIFY** - Delete `onDraw()` method |
| `tabhost.lua` | **MODIFY** - Delete `onDraw()` method |
| `xypad.lua` | **MODIFY** - Delete `onDraw()` method |
| `glsl.lua` | **REVIEW** - May need custom surface handling |
| `gl_surface.lua` | **REVIEW** - May need custom surface handling |

---

## 17. CMAKE FILES - CLEANUP

### File: `CMakeLists.txt` (and related)

**ACTION:** Remove references to:
- `Canvas.cpp` / `Canvas.h`
- `LuaUIBindings.cpp` / `LuaUIBindings.h`
- `ImGuiRuntimeNodeHost.cpp` / `ImGuiRuntimeNodeHost.h`
- Any Canvas-only sources

---

## REMOVAL SUMMARY BY FILE

### COMPLETE FILE DELETION (8 files):
1. `manifold/primitives/ui/Canvas.h`
2. `manifold/primitives/ui/Canvas.cpp`
3. `manifold/primitives/scripting/bindings/LuaUIBindings.h`
4. `manifold/primitives/scripting/bindings/LuaUIBindings.cpp`
5. `manifold/ui/imgui/ImGuiRuntimeNodeHost.h`
6. `manifold/ui/imgui/ImGuiRuntimeNodeHost.cpp`
7. `manifold/primitives/ui/CanvasStyle.h` (review first)
8. `manifold/primitives/ui/CanvasStyle.cpp` (if exists)

### MAJOR MODIFICATION (4 files):
1. `manifold/core/BehaviorCoreEditor.h` - Remove Canvas, debug host, simplify enum
2. `manifold/core/BehaviorCoreEditor.cpp` - Massive simplification (~500 lines)
3. `manifold/primitives/scripting/LuaEngine.cpp` - Remove Canvas bindings
4. `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp` - Remove legacy replay

### MINOR MODIFICATION (6 files):
1. `manifold/primitives/control/ControlServer.h`
2. `manifold/primitives/control/ControlServer.cpp`
3. `manifold/primitives/control/CommandParser.h`
4. `manifold/primitives/scripting/bindings/LuaControlBindings.cpp`
5. `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.h`
6. `manifold/ui/shell/*.lua` - Remove transitional code

### WIDGET CLEANUP (15 files):
All widget files need `onDraw()` methods removed.

---

## ESTIMATED CODE REDUCTION

| Category | Lines Before | Lines After | Reduction |
|----------|--------------|-------------|-----------|
| C++ Canvas/UI bindings | ~2500 | 0 | 2500 |
| BehaviorCoreEditor | ~2000 | ~1000 | 1000 |
| Lua widgets onDraw | ~800 | 0 | 800 |
| Shell transitional | ~300 | 100 | 200 |
| **TOTAL** | **~5600** | **~1100** | **~4500** |

---

## POST-REMOVAL ARCHITECTURE

```
BehaviorCoreEditor
├── ImGuiDirectHost (primary renderer - RuntimeNode → ImGui)
├── ImGuiHost (tool windows - script editor, etc.)
├── ImGui*Host (hierarchy, inspector, script list, perf overlay)
└── LuaEngine
    └── RuntimeNode (root)
        └── Widgets (display lists only)
```

**No Canvas. No immediate mode gfx.* API. No transitional renderer modes.**

---

## RISK ASSESSMENT

| Risk | Level | Mitigation |
|------|-------|------------|
| Breaking Lua scripts using gfx.* | HIGH | Audit UserScripts for gfx usage first |
| Breaking custom widgets | MEDIUM | All core widgets have _syncRetained |
| OpenGL surfaces | MEDIUM | Need custom surface type verification |
| Build system | LOW | Straightforward CMake changes |

---

## DEPENDENCY CHAIN

```
Canvas removal
  → LuaUIBindings removal
    → gfx.* API removal
      → widget onDraw() removal
        → shell setOnDraw cleanup
          → BehaviorCoreEditor simplification
            → ControlServer/CommandParser simplification
```

Execute in reverse order for safe incremental removal, or all at once with verification.
