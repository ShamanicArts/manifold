# UI Shell Surface Descriptor Spec

## Status
Implementation contract. This is not a strategy doc.

Current implementation progress:
- shell surface registry is live
- `perfOverlay`, `hierarchyTool`, `scriptList`, `inspectorTool`, `scriptInspectorTool`, `mainScriptEditor`, and `inlineScriptEditor` are descriptor-backed
- `perfOverlay` is now a real ImGui/OpenGL-backed surface, not a JUCE-painted fake
- `inlineScriptEditor` geometry is now shell-authored from shell-side script inspector geometry instead of C++ host snapshot repair
- remaining debt is mostly in the C++ bridge (`syncImGuiHostsFromLuaShell()`) and Linux-specific host lifecycle policy

This file defines the concrete surface model needed to move the current UI from split ownership back to:

> **Shell-owned composition**

The point of this document is to let code change against a specific contract instead of drifting through more ad hoc host wiring.

---

## 1. Core rule

There is exactly one conceptual UI owner:

- **shell owns surfaces**
- **shell owns overlays**
- **shell owns visibility, bounds, z-order, and mode participation**

C++ and backend renderers do **not** own conceptual UI surfaces.
They only realize shell-owned surfaces using a specific backend.

---

## 2. Terminology

### Surface
A shell-owned conceptual UI region/window/panel/overlay.

Examples:
- runtime content region
- hierarchy panel
- inspector panel
- script list tool
- script editor tool
- perf overlay
- console overlay
- preview overlay

### Backend
The renderer/interaction implementation used to realize a surface.

Examples:
- `lua-canvas`
- `imgui`
- `juce-component`

### Realizer
The C++/backend object that renders a surface.

Examples:
- `rootCanvas` subtree for shell-native surfaces
- `ImGuiHost`
- `ImGuiHierarchyHost`
- `ImGuiInspectorHost`
- future unified ImGui tooling surface

### Payload
The semantic data a surface presents.

Examples:
- hierarchy rows
- inspector rows and selected property
- script document text
- perf snapshot

---

## 3. Surface descriptor shape

Every shell-owned surface must be representable by a descriptor with this shape.

```lua
{
  id = "perfOverlay",              -- stable shell-wide identifier
  kind = "overlay",                -- content | panel | tool | overlay
  backend = "imgui",               -- lua-canvas | imgui | juce-component
  visible = true,                   -- shell-owned visibility
  bounds = { x = 0, y = 0, w = 300, h = 200 },
  z = 100,                          -- shell-owned stacking intent
  mode = "global",                 -- global | performance | edit
  docking = "floating",            -- fill | docked-left | docked-right | docked-top | docked-bottom | floating
  interactive = true,
  modal = false,
  payloadKey = "perfOverlay",      -- shell state / semantic source identifier
  title = "Performance",
}
```

### Required fields
- `id`: stable unique surface identifier
- `kind`: conceptual role, not backend detail
- `backend`: current backend assignment
- `visible`: shell-owned visibility flag
- `bounds`: shell-owned placement rectangle
- `z`: shell-owned ordering intent
- `mode`: which app mode(s) the surface participates in
- `docking`: shell layout participation style
- `interactive`: whether it receives input
- `modal`: modal behavior flag
- `payloadKey`: semantic data source key

### Rules
1. Shell is the source of truth for every field above.
2. C++ may cache or realize these fields but may not invent them.
3. Backends may expose runtime state back to shell only through explicit shell-owned state fields.
4. A surface can change backend without changing conceptual ownership.

---

## 4. Bridge contract for C++

C++ may do the following:
- create backend realizers
- map shell surface descriptors to backend objects
- apply shell visibility/bounds/order to those backend objects
- forward generic interaction events back to shell
- provide backend capability info back to shell

C++ may **not** do the following:
- invent conceptual surfaces outside shell
- decide default surface existence policy
- decide overlay ownership policy
- decide mode participation policy
- silently compute layout as a second authority

If C++ needs a default, that default must live in shell-owned state.

---

## 5. Current surface inventory

This is the current inventory mapped into the descriptor model.

## 5.1 Shell-native surfaces already under shell ownership

### `runtimeContent`
- current owner: shell
- backend today: `lua-canvas`
- current object: `shell.content`
- kind: `content`
- mode: `performance`, `edit`
- docking: `fill`
- notes: adopted from `parentNode:getChild(0)`

### `treePanel`
- current owner: shell
- backend today: `lua-canvas`
- current object: `shell.treePanel`
- kind: `panel`
- mode: `edit`
- docking: `docked-left`

### `inspectorPanel`
- current owner: shell
- backend today: `lua-canvas`
- current object: `shell.inspectorPanel`
- kind: `panel`
- mode: `edit`
- docking: `docked-right`

### `mainTabBar`
- current owner: shell
- backend today: `lua-canvas`
- current object: `shell.mainTabBar`
- kind: `panel`
- mode: `performance`, `edit`
- docking: `docked-top`

### `mainTabContent`
- current owner: shell
- backend today: `lua-canvas`
- current object: `shell.mainTabContent`
- kind: `content`
- mode: `performance`, `edit`
- docking: `fill`

### `previewOverlay`
- current owner: shell
- backend today: `lua-canvas`
- current object: `shell.previewOverlay`
- kind: `overlay`
- mode: `edit`
- docking: `floating`

### `consoleOverlay`
- current owner: shell
- backend today: `lua-canvas`
- current object: `shell.consoleOverlay`
- kind: `overlay`
- mode: `global`
- docking: `floating`
- notes: already uses shell-owned visibility and shell-owned bounds logic

---

## 5.2 Descriptor-backed tool surfaces currently realized by C++ backend hosts

### `mainScriptEditor`
- conceptual owner: shell descriptor
- backend today: `imgui`
- current object: `mainScriptEditorHost`
- kind: `tool`
- mode: `edit`
- docking target: shell-defined
- payload: script document

### `inlineScriptEditor`
- conceptual owner: shell descriptor
- backend today: `imgui`
- current object: `inlineScriptEditorHost`
- kind: `tool`
- mode: `edit`
- docking target: shell-defined
- payload: script document
- notes: shell geometry now comes from shell-side script inspector layout, not C++ host snapshot backfill

### `scriptList`
- conceptual owner: shell descriptor
- backend today: `imgui`
- current object: `scriptListHost`
- kind: `tool`
- mode: `edit`
- docking target: shell-defined
- payload: script rows

### `hierarchyTool`
- conceptual owner: shell descriptor
- backend today: `imgui`
- current object: `hierarchyHost`
- kind: `tool`
- mode: `edit`
- docking target: shell-defined
- payload: hierarchy rows

### `inspectorTool`
- conceptual owner: shell descriptor
- backend today: `imgui`
- current object: `inspectorHost`
- kind: `tool`
- mode: `edit`
- docking target: shell-defined
- payload: inspector data

### `scriptInspectorTool`
- conceptual owner: shell descriptor
- backend today: `imgui`
- current object: `scriptInspectorHost`
- kind: `tool`
- mode: `edit`
- docking target: shell-defined
- payload: script inspector data

### `perfOverlay`
- conceptual owner: shell descriptor
- backend today: `imgui`
- current object: `perfOverlayHost`
- kind: `overlay`
- mode: `global`
- docking target: `floating`
- payload: performance snapshot
- notes: first migration target, completed directionally

---

## 6. Current violations against the contract

### Violation 1: the C++ bridge still carries too much authority
The descriptor migration landed, but `BehaviorCoreEditor::syncImGuiHostsFromLuaShell()` still does too much:
- host action brokering
- payload assembly
- backend activation flag publication
- host-specific lifecycle policy

### Violation 2: layout authority is still partially split
Shell now owns descriptor visibility/bounds for the converted tool surfaces, but the rest of the app is still a mix of:
- shell-native imperative node layout
- descriptor-driven host layout
- backend-specific lifecycle behavior in C++

### Violation 3: backend activation still leaks into shell logic
Global flags like:
- `__manifoldImguiHierarchyActive`
- `__manifoldImguiScriptListActive`
- `__manifoldImguiInspectorActive`
- `__manifoldImguiInlineEditorActive`

still leak backend state into shell draw/input code.

### Violation 4: backend object naming muddied architectural roles
“host” is currently overloaded and obscures the distinction between:
- conceptual surface
- backend realizer
- semantic payload source

---

## 7. Target representation in shell

Shell should gain a surface registry, conceptually something like:

```lua
shell.surfaces = {
  runtimeContent = { ... },
  treePanel = { ... },
  inspectorPanel = { ... },
  mainTabBar = { ... },
  mainTabContent = { ... },
  previewOverlay = { ... },
  consoleOverlay = { ... },
  mainScriptEditor = { ... },
  inlineScriptEditor = { ... },
  scriptList = { ... },
  hierarchyTool = { ... },
  inspectorTool = { ... },
  scriptInspectorTool = { ... },
  perfOverlay = { ... },
}
```

### Required shell API shape
Shell needs explicit functions to:
- register/update a surface descriptor
- query all descriptors
- query a descriptor by id
- update bounds/visibility/order/state for a descriptor
- mark payload changes

Minimum useful Lua API:

```lua
shell:defineSurface(id, descriptor)
shell:updateSurface(id, patch)
shell:getSurface(id)
shell:getSurfaceDescriptors()
```

This does not need to be fancy. It just needs to become the canonical source.

---

## 8. Backend assignment rules

### `lua-canvas`
Use for shell-native widget/canvas surfaces.
Examples:
- `runtimeContent`
- `treePanel`
- `inspectorPanel`
- `consoleOverlay`
- `previewOverlay`

### `imgui`
Use for tooling/editor/inspection/overlay surfaces.
Examples:
- `mainScriptEditor`
- `inlineScriptEditor`
- `scriptList`
- `hierarchyTool`
- `inspectorTool`
- `scriptInspectorTool`
- `perfOverlay`

### `juce-component`
Temporary escape hatch only.
Should not be used to create new shell architecture exceptions.

---

## 9. First migration target: `perfOverlay`

This was the first surface to move because it was the clearest architectural cheat.

## Previous bad state
- shell owned only `visible` and `activeTab`
- C++ mounted and placed the overlay
- backend was JUCE paint, not real ImGui

## Current state
- shell owns the `perfOverlay` descriptor
- C++ reads descriptor visibility/bounds/title and realizes it
- backend is real ImGui/OpenGL
- interaction (`tab`, `close`, `bounds`) round-trips back into shell state

## Target state
Shell surface descriptor:

```lua
shell:defineSurface("perfOverlay", {
  id = "perfOverlay",
  kind = "overlay",
  backend = "imgui",
  visible = false,
  bounds = { x = 0, y = 0, w = 420, h = 300 },
  z = 100,
  mode = "global",
  docking = "floating",
  interactive = true,
  modal = false,
  payloadKey = "perfOverlay",
  title = "Performance",
})
```

Shell state payload remains:
- `shell.perfOverlay.visible`
- `shell.perfOverlay.activeTab`
- optionally later: `shell.perfOverlay.bounds`

C++ responsibility becomes:
- query shell descriptor for `perfOverlay`
- realize it using ImGui backend
- apply shell visibility/bounds
- return interaction events (tab changes / close) back to shell state

C++ must stop doing:
- default conceptual ownership for perf overlay
- default independent placement policy outside shell
- JUCE-painted overlay fakery

---

## 10. Transitional rules during migration

Because the current code is already messy, migration will be staged.
These rules prevent new architectural damage while the move is underway.

### Rule 1
No new conceptual UI surface may be introduced only in C++.
It must first exist as a shell descriptor.

### Rule 2
If an existing backend object remains separate, it must be treated as a realizer for a shell-owned surface, not as an independent panel owner.

### Rule 3
Any default bounds/visibility/z-order computed in C++ during transition must be promoted back into shell-owned state as soon as the first conversion lands.

### Rule 4
No new JUCE-painted overlay exceptions.

### Rule 5
Do not expand host-specific config proliferation in `syncImGuiHostsFromLuaShell()`.
That function should move toward applying surface descriptors, not adding more special-case structs.

---

## 11. Immediate implementation tasks

### Task 1
Keep shrinking `BehaviorCoreEditor::syncImGuiHostsFromLuaShell()` from a god-function into a descriptor/payload bridge.

### Task 2
Continue expanding descriptor coverage beyond host-backed tools to the remaining shell-composed surfaces.

### Task 3
Replace draw-authored shell geometry with shell layout/state methods wherever it still survives.

### Task 4
Remove backend activation globals from shell control logic.

### Task 5
Keep Linux-safe host lifecycle policy explicit without letting it become a second composition authority.

---

## 12. Done means

This spec is being obeyed when:
- shell defines `perfOverlay` as a surface descriptor
- C++ reads and realizes that descriptor instead of inventing the overlay shape
- perf overlay is genuinely ImGui-backed
- no new conceptual UI surface is added outside shell
- `syncImGuiHostsFromLuaShell()` gets smaller in authority, not larger
