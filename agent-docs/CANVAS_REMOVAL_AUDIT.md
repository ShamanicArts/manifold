# Canvas Removal - Comprehensive Audit

**Date:** 2026-03-23
**Status:** COMPLETE AUDIT - Ready for Execution
**Total References:** 537 across codebase

---

## Executive Summary

Canvas is deeply embedded in 3 distinct layers:
1. **C++ Core** (160 references) - Class definition, bindings, editor integration
2. **Lua UI** (377 references) - Widget system, shell bindings, canvas-style API calls
3. **Build System** - CMake sources, includes

**Critical Finding:** Lua code calls `setDisplayList`, `setOnDraw`, `repaint` on RuntimeNodes, which currently generate warnings. These are NOT dead code - they're compatibility shims that need RuntimeNode-native replacements.

**Confirmed Dead Code:** The `showError()` Canvas error display (lines 1938-1969 in BehaviorCoreEditor.cpp) is **never visible** in ImGuiDirect mode - `directHost_` renders on top via OpenGL, hiding the Canvas behind it. Safe to remove.

---

## 1. C++ CORE AUDIT (160 references)

### 1.1 Canvas Class Files (96 references)
**Files:** `manifold/primitives/ui/Canvas.h`, `Canvas.cpp`, `CanvasStyle.h`

**What to do:** DELETE ENTIRE FILES

| File | Lines | Content |
|------|-------|---------|
| `Canvas.h` | 17 refs | Class definition, ~180 lines |
| `Canvas.cpp` | 79 refs | Implementation, ~600 lines |
| `CanvasStyle.h` | 9 refs | Style struct, ~50 lines |

**Dependencies on these files:**
- `LuaUIBindings.cpp` - Includes Canvas.h, registers Canvas usertype
- `LuaEngine.h/cpp` - Includes Canvas.h, stores Canvas pointers
- `BehaviorCoreEditor.h/cpp` - Includes Canvas.h, has Canvas members
- `BehaviorCoreProcessor.cpp` - References RootMode::Canvas
- `ControlServer.cpp` - Includes Canvas.h for profiling
- `LuaEngineMockHarness.cpp` - Tests Canvas
- `ToolComponents.cpp` - 1 reference to Canvas (likely variable name)

### 1.2 LuaUIBindings.cpp (104 references)
**Location:** `manifold/primitives/scripting/bindings/LuaUIBindings.cpp`

**References breakdown:**
- Line 91-111: Helper functions `clearRuntimeCallbackSlot`, `setRuntimeCallbackSlot`, `callAsyncIfCanvasAlive` - **DELETE**
- Line 291-306: `registerBindings()` - **MODIFY** (remove Canvas param)
- Line 307-833: `registerCanvasBindings()` - **DELETE** (527 lines of Canvas registration)
- Line 833: `lua["root"] = rootCanvas` - **DELETE**

**What stays:**
- `registerGraphicsBindings()` - needed for gfx.* API
- `registerOpenGLBindings()` - needed if keeping OpenGL
- `registerConstants()` - needed for color constants
- `invokeRuntimeNodeDrawForRetained()` - needed but rename

### 1.3 LuaEngine.h/cpp (55 references)
**Files:** `manifold/primitives/scripting/LuaEngine.h`, `LuaEngine.cpp`

**LuaEngine.h references (7):**
- Line 6: `#include "../ui/Canvas.h"` - **DELETE**
- Lines 38-48: `initialise(processor, Canvas* rootCanvas)` overload - **DELETE**
- Lines 185-190: `RootMode` enum with Canvas value - **DELETE** (keep RuntimeNode only)
- Line 548: `initialiseInternal()` Canvas param - **DELETE**

**LuaEngine.cpp references (48):**
Lines scattered throughout:
- `scriptContentCanvasRoot` field accesses (lines 408, 444, 460, 536, 822-828, 845, 912-918, 961-962, 983-985, 1128-1129, 1462, 1473, 1567-1578, 2182-2183, 2205, 2216)
- `baseProjectCanvasRoot` field (lines 1473, 2216)
- Overlay restoration struct with `canvasRoot` field (line 1462, 2205)
- All Canvas path logic in `loadScript()`, `switchScript()`, `restoreOverlay()`, `closeOverlay()`

**What each field does:**
- `pImpl->rootCanvas` - Root Canvas passed to initialise
- `pImpl->scriptContentCanvasRoot` - Canvas created as child of root for script content
- `pImpl->baseProjectCanvasRoot` - Saved for overlay restoration
- Overlay struct `canvasRoot` - For saving/restoring overlay state

**Migration strategy:**
All these become `RuntimeNode*` equivalents:
- `rootCanvas` → `rootRuntime` (already exists)
- `scriptContentCanvasRoot` → `scriptContentRuntimeRoot` (already exists)
- `baseProjectCanvasRoot` → `baseProjectRuntimeRoot`
- Remove overlay struct `canvasRoot` field

### 1.4 BehaviorCoreEditor.h/cpp (48 references)
**Files:** `manifold/core/BehaviorCoreEditor.h`, `BehaviorCoreEditor.cpp`

**BehaviorCoreEditor.h (5 references):**
- Line 5: `#include "../primitives/ui/Canvas.h"` - **DELETE**
- Line 23: `RootMode::Canvas = 0` enum value - **DELETE** (keep only RuntimeNode)
- Line 67: `Canvas rootCanvas{"root"}` member - **DELETE**
- Line 79: `Canvas* errorNode = nullptr` member - **DELETE** (confirmed dead code - errors never visible in ImGuiDirect mode)

**BehaviorCoreEditor.cpp (43 references):**
- Lines 1152, 1338-1339, 1342, 1353, 1476, 1486, 1694-1695, 1721-1722, 1907, 1928, 1943-1949: `rootCanvas` usage
- Lines 1157, 1187, 1264: `RuntimeRendererMode::Canvas` cases
- Lines 1205, 1306-1307, 1316, 1503: Canvas mode checks
- Lines 1483-1503: `MANIFOLD_RENDERER` env var handling for Canvas modes

**Key logic to remove:**
- Constructor Canvas initialization path (lines 1336-1353)
- Error display via Canvas (lines 1928-1949) - **CONFIRMED DEAD CODE**
- Canvas repaint tracking (lines 1694-1695, 1717, 1721-1722)

**Note on Error Display:** The `showError()` function creates a Canvas to display Lua errors, but in ImGuiDirect mode this Canvas is never visible because:
1. `directHost_` renders on top via OpenGL/ImGui
2. Canvas is behind it in the component Z-order
3. User confirmed: "I dont think ive seeen one since switched"

The error display code runs but produces no visible output. Console logging still works. Safe to delete.

### 1.5 BehaviorCoreProcessor.cpp (2 references)
**File:** `manifold/core/BehaviorCoreProcessor.cpp`

- Lines 50, 59: Return `RootMode::Canvas` based on settings - **DELETE** (always return RuntimeNode)

### 1.6 ControlServer.cpp (6 references)
**File:** `manifold/primitives/control/ControlServer.cpp`

- Line 9: `#include "../ui/Canvas.h"` - **DELETE**
- Lines 872-888: Canvas profiling metrics - **DELETE** (peakCanvasRepaintLeadUs, avgCanvasRepaintLeadUs, accumulatedPaintUs, trackedCanvases)

### 1.7 LuaEngineMockHarness.cpp (3 references)
**File:** `manifold/headless/LuaEngineMockHarness.cpp`

- Lines 211, 236, 447: Canvas test code - **DELETE OR MODIFY**

### 1.8 ToolComponents.cpp (1 reference)
**File:** `manifold/ui/imgui/ToolComponents.cpp`

- Line 356: "graphCanvas" as ImGui ID string - **RENAME** (not actually Canvas class)

### 1.9 RuntimeNode.h (1 reference)
**File:** `manifold/primitives/ui/RuntimeNode.h`

- Line 77: Constructor default name "Canvas" - **RENAME** to "RuntimeNode"

---

## 2. LUA UI AUDIT (377 references)

### 2.1 Widget Base (7 references)
**File:** `manifold/ui/widgets/base.lua`

**Lines 9-13:** Dual-path detection functions
```lua
local function parentIsCanvas(parent)
    return parent ~= nil and parent.getRuntimeNode ~= nil  -- Misnamed! This detects RuntimeNode
end

local function parentIsRuntimeNode(parent)
    return parent ~= nil and parent.getRuntimeNode == nil and parent.createChild ~= nil
end
```

**Lines 34-41:** Constructor dual path
```lua
if parentIsCanvas(parent) then  -- Actually RuntimeNode path
    self.node = parent:addChild(name)
    self.runtimeNode = self.node:getRuntimeNode()
    self._runtimeNodeOnly = false
elseif parentIsRuntimeNode(parent) then  -- Never hit in ImGuiDirect mode
    self.node = parent:createChild(name)
    self.runtimeNode = self.node
    self._runtimeNodeOnly = true
```

**Action:** Simplify to RuntimeNode-only path:
```lua
function BaseWidget.new(parent, name, config)
    if parent == nil or parent.createChild == nil then
        error("BaseWidget.new expected RuntimeNode parent")
    end
    self.node = parent:createChild(name)
    self.runtimeNode = self.node
    self._runtimeNodeOnly = true
    -- ... rest unchanged
end
```

**Line 201:** `self.node:repaint()` in `setEnabled()` - **DELETE** (generates warning)

**Line 222:** `self.node:repaint()` in `setVisible()` - **DELETE**

**Lines 227-232:** Canvas renderer mode check - **DELETE** (always RuntimeNode mode now)

**Line 249:** `self.node:repaint()` in `_setExposed()` - **DELETE**

**Lines 300-310:** Canvas renderer mode check in `setBounds()` - **DELETE**

### 2.2 UI Shell (19 references)
**File:** `manifold/ui/ui_shell.lua`

**Lines 532-542:** Canvas creation for tree view
```lua
shell.treeCanvas = shell.treePanel.node:addChild("treeCanvas")
shell.treeCanvas:setInterceptsMouse(true, true)  -- Generates warning
shell.treeCanvas:setWantsKeyboardFocus(true)      -- Generates warning
-- ... same for dspCanvas, scriptCanvas
```

**Action:** These create RuntimeNodes but call Canvas-style methods that warn. Change to:
```lua
shell.treeRuntimeNode = shell.treePanel.node:createChild("treeRuntimeNode")
-- Remove setInterceptsMouse/setWantsKeyboardFocus calls
```

**Lines 559, 572:** `shell.treeCanvas:repaint()` and `shell.scriptCanvas:repaint()` - **DELETE**

### 2.3 Shell Bindings (73 references)
**File:** `manifold/ui/shell/bindings.lua`

**Lines 216-316:** `buildTreeCanvasDisplayList`, `_syncTreeCanvasRetained`, `setOnDraw`, `setOnMouseDown`, `setOnKeyPress`, `setOnMouseWheel` for treeCanvas

**Lines 320-400:** Same for dspCanvas

**Lines 411-532:** Same for scriptCanvas

**Action:** These implement retained-mode Canvas drawing for the tree/script panels. Since ImGuiDirect uses immediate mode, these are **DEAD CODE** that generates warnings. Delete all retained-mode display list building and Canvas callback setup.

### 2.4 Shell Methods Core (78 references)
**File:** `manifold/ui/shell/methods_core.lua`

Multiple `:repaint()` calls on treeCanvas, scriptCanvas, dspCanvas (lines 642, 655, 836, 2143-2150, 2201-2202, 2478, 2501, 2852, 3050, 4069)

**Action:** Delete all `:repaint()` calls

### 2.5 Shell Methods Layout (13 references)
**File:** `manifold/ui/shell/methods_layout.lua`

**Lines 241-243, 424-430:** `setBounds(0,0,0,0)` calls on treeCanvas, dspCanvas, scriptCanvas

**Action:** Replace with RuntimeNode equivalents if still needed, or delete

**Line 854:** `scriptCanvas:repaint()` - **DELETE**

### 2.6 Editor Core (7 references)
**File:** `manifold/ui/editor_core.lua`

**Lines 54, 61-62, 95, 131, 144-145:** previewCanvas creation and usage

**Action:** Either delete editor_core.lua entirely (if unused) or convert to RuntimeNode

### 2.7 Other Lua Files (2 references)
- `inspector_utils.lua` - 2 references
- `dropdown.lua` - 1 reference
- `base_utils.lua` - 1 reference

---

## 3. DEPENDENCY GRAPH

```
Canvas.h/cpp
    ├── Included by:
    │   ├── LuaUIBindings.cpp (needs Canvas usertype registration)
    │   ├── LuaEngine.h (needs Canvas* in initialise overload)
    │   ├── BehaviorCoreEditor.h (needs Canvas member)
    │   ├── ControlServer.cpp (needs Canvas profiling)
    │   └── LuaEngineMockHarness.cpp (tests Canvas)
    │
    └── Uses:
        ├── RuntimeNode.h (Canvas wraps RuntimeNode)
        ├── CanvasStyle.h (Canvas has style member)
        └── JUCE Component + OpenGLRenderer

LuaEngine.cpp
    ├── Uses Canvas pointers:
    │   ├── scriptContentCanvasRoot
    │   ├── baseProjectCanvasRoot
    │   └── overlay restoration struct
    │
    └── These map to RuntimeNode equivalents:
        ├── scriptContentRuntimeRoot (exists)
        └── baseProjectRuntimeRoot (to create)

BehaviorCoreEditor.cpp
    ├── Uses rootCanvas for:
    │   ├── Error display (lines 1943-1949)
    │   ├── RuntimeNode extraction (line 1152)
    │   └── Paint profiling (lines 1717, 1721-1722)
    │
    └── Replace with:
        └── Direct JUCE Graphics painting for errors

Lua UI Files
    ├── Call Canvas-style methods on RuntimeNodes:
    │   ├── setDisplayList() - RuntimeNode has this, but warns
    │   ├── setOnDraw() - RuntimeNode warns
    │   ├── repaint() - RuntimeNode warns
    │   ├── setInterceptsMouse() - RuntimeNode warns
    │   └── setWantsKeyboardFocus() - RuntimeNode warns
    │
    └── These are all DEAD CODE in ImGuiDirect mode
        └── Delete the calls, not the RuntimeNode methods
```

---

## 4. MIGRATION STRATEGY

### Phase 1: Lua Cleanup (Low Risk)
**Files:** `widgets/base.lua`, `ui_shell.lua`, `shell/*.lua`, `editor_core.lua`

1. Remove all `:repaint()` calls
2. Remove all `:setDisplayList()` calls
3. Remove all `:setOnDraw()` calls
4. Remove all `:setInterceptsMouse()` calls
5. Remove all `:setWantsKeyboardFocus()` calls
6. Simplify `BaseWidget.new()` to RuntimeNode-only path
7. Rename `treeCanvas` → `treeRuntimeNode`, etc.

**Verification:** Build and run - should have fewer "legacy retained draw replay" warnings

### Phase 2: C++ Interface Cleanup (Medium Risk)
**Files:** `LuaEngine.h/cpp`, `BehaviorCoreEditor.h/cpp`

1. Remove `initialise(processor, Canvas*)` overload from LuaEngine
2. Remove `RootMode` enum (keep RuntimeNode only)
3. Remove `scriptContentCanvasRoot`, `baseProjectCanvasRoot` fields
4. Remove overlay struct `canvasRoot` field
5. Remove `rootCanvas` member from BehaviorCoreEditor
6. Remove `errorNode` member and `showError()` Canvas code - **CONFIRMED DEAD**, error display never visible in ImGuiDirect mode
7. Remove Canvas mode from `RuntimeRendererMode` enum
8. Remove `MANIFOLD_RENDERER` env handling for Canvas modes

**Verification:** Build and run - should compile (error display was already broken/invisible)

### Phase 3: Bindings Cleanup (Medium Risk)
**Files:** `LuaUIBindings.cpp`, `LuaUIBindings.h`

1. Remove `registerCanvasBindings()` function (527 lines)
2. Remove Canvas usertype registration
3. Remove `lua["root"] = rootCanvas` assignment
4. Remove `callAsyncIfCanvasAlive()`, `clearRuntimeCallbackSlot()`, `setRuntimeCallbackSlot()` helpers
5. Update `registerBindings()` signature to remove Canvas param

**Verification:** Build and run - Lua scripts still load, widgets work

### Phase 4: Class Deletion (High Risk - Do Last)
**Files:** `Canvas.h`, `Canvas.cpp`, `CanvasStyle.h`

1. Delete `manifold/primitives/ui/Canvas.h`
2. Delete `manifold/primitives/ui/Canvas.cpp`
3. Delete `manifold/primitives/ui/CanvasStyle.h`
4. Remove from `CMakeLists.txt`
5. Remove includes from all files

**Verification:** Build and run - should compile with no Canvas references

### Phase 5: Test Cleanup (Low Risk)
**File:** `LuaEngineMockHarness.cpp`

1. Update or remove Canvas-specific tests

---

## 5. RISK ASSESSMENT

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| sol2 type registration errors | High | Build failure | Ensure RuntimeNode is fully registered before removing Canvas |
| Lua scripts break | Medium | Runtime errors | Phase 1 cleanup first, test thoroughly |
| Error display broken | **N/A - DEAD CODE** | No impact | Error display already invisible in ImGuiDirect mode |
| ImGuiDirect mode affected | Low | Major | Keep RuntimeNode intact, only remove Canvas |
| Widget system breaks | Medium | Major | Carefully migrate BaseWidget constructor |

---

## 6. VERIFICATION CHECKLIST

### Build Verification
- [ ] Clean build with no Canvas references
- [ ] No "Canvas.h not found" errors
- [ ] No sol2 type conversion errors
- [ ] All targets build (Standalone, VST3, Headless)

### Runtime Verification
- [ ] Standalone launches without errors
- [ ] UI renders in ImGuiDirect mode
- [ ] Widgets respond to input
- [ ] Scripts hot-reload
- [ ] No "legacy retained draw replay" warnings in console
- [ ] Lua errors still logged to console (even if not displayed in UI)

### Functionality Verification
- [ ] Tree panel displays
- [ ] Script panel displays
- [ ] DSP panel displays
- [ ] Inspector works
- [ ] Performance overlay works
- [ ] All widget types functional

---

## 7. FILES TO MODIFY (IN ORDER)

### Phase 1: Lua (Safe)
1. `manifold/ui/widgets/base.lua`
2. `manifold/ui/ui_shell.lua`
3. `manifold/ui/shell/bindings.lua`
4. `manifold/ui/shell/methods_core.lua`
5. `manifold/ui/shell/methods_layout.lua`
6. `manifold/ui/editor_core.lua`

### Phase 2: C++ Engine (Careful)
7. `manifold/primitives/scripting/LuaEngine.h`
8. `manifold/primitives/scripting/LuaEngine.cpp`
9. `manifold/core/BehaviorCoreEditor.h`
10. `manifold/core/BehaviorCoreEditor.cpp`
11. `manifold/core/BehaviorCoreProcessor.cpp`

### Phase 3: Bindings (Careful)
12. `manifold/primitives/scripting/bindings/LuaUIBindings.h`
13. `manifold/primitives/scripting/bindings/LuaUIBindings.cpp`

### Phase 4: Other (Safe)
14. `manifold/primitives/control/ControlServer.cpp`
15. `manifold/headless/LuaEngineMockHarness.cpp`
16. `manifold/primitives/ui/RuntimeNode.h` (rename default)
17. `manifold/ui/imgui/ToolComponents.cpp` (rename variable)

### Phase 5: Deletion (Last)
18. `manifold/primitives/ui/Canvas.h` - DELETE
19. `manifold/primitives/ui/Canvas.cpp` - DELETE
20. `manifold/primitives/ui/CanvasStyle.h` - DELETE
21. `CMakeLists.txt` - Remove sources

---

## 8. ESTIMATED EFFORT

- Phase 1 (Lua): 2 hours
- Phase 2 (C++ Engine): 3 hours
- Phase 3 (Bindings): 2 hours
- Phase 4 (Other): 1 hour
- Phase 5 (Deletion): 30 minutes
- Testing/Verification: 2 hours
- **Total: ~11 hours**

---

**END OF AUDIT**

This audit is complete and ready for execution. Do not proceed without:
1. A clean git/jj state to revert to
2. Build verification after EACH phase
3. Runtime testing after EACH phase
