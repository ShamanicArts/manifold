# ImGui Component System Plan

**Status:** active planning doc  
**Purpose:** define the first practical path from "ImGui hosts that work" to a real **scriptable, themeable, reusable component system** for Manifold tooling.

---

## 1. Decision

We are **not** treating Dear ImGui as a one-off editor hack or a second-class tooling sidecar.

We are using it as:

1. a **first-party UI backend**,
2. a basis for a **Manifold component/design system**,
3. and eventually a **Lua-scriptable UI surface** for internal tooling first, then broader authoring use.

The immediate goal is **not** to replace the runtime Canvas system.
The immediate goal is to build a **scriptable component system for the tooling stack** and expand from there.

---

## 2. Core Direction

### What we want

A system where we can define reusable widgets/components with:

- shared theme tokens,
- reusable styling,
- variants and states,
- Lua authoring without rebuilds,
- and a custom-draw escape hatch for richer visuals.

### What we are not doing first

We are **not** trying to build all of these immediately:

- a full Canvas replacement,
- a CSS clone,
- a full retained scene graph on top of ImGui,
- a full raw ImGui Lua API as the primary interface,
- or a giant generic layout engine rewrite.

That would be bloated bullshit for v1.

---

## 3. Architectural Model

The intended stack is:

```text
Dear ImGui backend
    ↓
Manifold theme/style layer
    ↓
Manifold primitive widgets
    ↓
Manifold tooling/domain components
    ↓
Lua-facing component API
    ↓
Optional raw/custom draw escape hatch
```

### Layer responsibilities

#### Layer 1 — Dear ImGui backend
Owns:
- rendering,
- input capture,
- basic widget internals,
- draw list primitives,
- OpenGL integration,
- thread-local context plumbing.

#### Layer 2 — Theme/style layer
Owns:
- semantic tokens,
- typography,
- spacing,
- radii,
- sizing,
- state-aware style resolution,
- scoped style application.

#### Layer 3 — Primitive widgets
Owns reusable building blocks such as:
- panel,
- section header,
- button,
- label,
- toggle,
- number field,
- text field,
- dropdown,
- slider,
- table,
- tree row,
- list row,
- badges,
- dividers.

#### Layer 4 — Tooling/domain components
Owns Manifold-specific reusable components such as:
- script list,
- hierarchy tree,
- property table,
- property editor,
- runtime param list,
- DSP graph view,
- inline code editor slot,
- editor shell sections.

#### Layer 5 — Lua-facing API
Owns the scriptable component API used by internal tooling scripts.
This should target **Manifold components first**, not raw ImGui directly.

#### Layer 6 — Escape hatch
Owns custom drawing and later raw ImGui exposure where needed.
This is how we support richer visuals and eventually canvas-like composition.

---

## 4. First Scope

The first supported scope is **internal/tooling UI only**.

### Target surfaces
- scripts list
- hierarchy tree
- hierarchy inspector
- scripts inspector
- editor shell controls/chrome
- debug/dev surfaces later

### Non-goals for v1
- user-authored runtime performance UI replacement
- docking/workspace system
- generalized visual editor for the new component system
- full layout abstraction overhaul
- total Canvas parity

---

## 5. Design Principles

### 5.1 Semantic theme tokens, not random hardcoded colours
Use names like:
- `panelBg`
- `panelBgAlt`
- `panelBorder`
- `text`
- `textMuted`
- `accent`
- `selectionBg`
- `selectionText`
- `hoverBg`
- `danger`

Avoid scattering literal style values all over host code.

### 5.2 Reusable components over giant host render functions
Each host should become composition of components, not one giant pile of `ImGui::*` calls.

### 5.3 High-level Lua API first
Primary Lua surface should be things like:
- `ui.panel`
- `ui.section`
- `ui.button`
- `ui.list`
- `ui.tree`
- `ui.propertyEditor`

Raw ImGui should be the escape hatch, not the foundation.

### 5.4 Custom draw is a first-class primitive
`ImDrawList` gives enough power to make heavily styled widgets and canvas-like objects.
We should embrace that, but without prematurely rebuilding the entire UI engine around it.

### 5.5 Stable model state outside render functions
Selections, open/closed sections, active property, graph pan, filters, and editor state need to live in explicit model/state, not vanish into immediate-mode chaos.

---

## 6. Phased Plan

## Phase 0 — lock the v1 target

### Goal
Define the first practical component-system contract so implementation does not drift.

### Deliverables
A small design note that pins down:
- what counts as a component,
- what counts as a style token,
- what counts as a variant,
- what state lives in model vs widget-local helpers,
- and what the first Lua API will expose.

### Exit criteria
We can explain the stack clearly without hand-wavy bullshit.

---

## Phase 1 — theme/style foundation

### Goal
Stop embedding ad hoc style logic inside each host.

### Implement
C++ theme/style layer for ImGui:
- `ThemeTokens`
- component style structs
- variant overrides
- typography helpers
- spacing helpers
- scoped style helpers

### First token groups
- colours
- spacing
- radius
- typography
- sizing

### First shared primitives
- tool panel
- section header
- selectable row
- button
- label/text
- divider
- input wrapper
- child/scroll region wrapper

### Exit criteria
Scripts list, hierarchy, and inspector all pull styling from one shared system.

---

## Phase 2 — reusable primitive widgets

### Goal
Create a reusable primitive widget layer on top of the style system.

### Primitive widget set
- `Panel`
- `SectionHeader`
- `Button`
- `Toggle`
- `TextField`
- `NumberField`
- `Dropdown`
- `Slider`
- `SelectableRow`
- `Table`
- `Tree`
- `Badge`

### Rule
Primitive widgets accept:
- data/value,
- variant,
- callbacks,
- disabled/read-only state,
- optional instance overrides.

### Exit criteria
Current host code stops repeating row/button/section styling patterns manually.

---

## Phase 3 — tooling/domain components

### Goal
Extract the current tooling surfaces into reusable Manifold-specific components.

### First domain components
- `ScriptList`
- `HierarchyTree`
- `PropertyTable`
- `PropertyEditor`
- `RuntimeParamList`
- `DspGraphView`
- `InlineCodeEditorSlot`
- `ToolInspectorPanel`

### Expected result
Current ImGui hosts become thin composition layers over reusable domain widgets instead of hand-built one-offs.

### Exit criteria
At least scripts list, hierarchy tree, and both inspector modes are composed from reusable components.

---

## Phase 4 — Lua-facing component API

### Goal
Expose the component system to Lua for **system/tooling stack authoring first**.

### API shape
Prefer a high-level API like:

```lua
ui.panel({ variant = "sidebar" }, function()
  ui.section("Scripts")
  ui.scriptList(model.scripts, { onSelect = onSelect, onOpen = onOpen })
end)
```

and:

```lua
ui.panel({ variant = "inspector" }, function()
  ui.section("Selected Value")
  ui.propertyEditor(model.activeProperty)

  ui.section("Properties")
  ui.propertyTable(model.rows)
end)
```

### First exposed Lua widgets
- panel
- section
- text
- button
- list
- tree
- table
- property editor
- slider
- number
- dropdown
- toggle

### Exit criteria
At least one internal/tooling panel is Lua-authored using the new component API without rebuilding C++.

---

## Phase 5 — custom draw / canvas-like primitives

### Goal
Support richer widgets and custom visuals using `ImDrawList`.

### Add drawing primitives
- rect / rounded rect
- line / polyline
- circle
- text
- image
- clip rect
- hit region helper
- hover/active/focus state helper

### Why
This is the bridge toward:
- custom tabs,
- transport controls,
- graph widgets,
- meters,
- waveform-ish controls,
- and eventually canvas-like scripted objects.

### Exit criteria
Lua or C++ components can define custom-styled widgets without falling straight into raw backend spaghetti.

---

## Phase 6 — live theme loading and editor-shell cleanup

### Goal
Make the component system practical for iteration and use it to clean up the editor shell.

### Implement
- theme definitions loaded from Lua tables first
- live reload for theme changes
- style cache invalidation
- optional font atlas rebuild when typography changes

### Then apply to editor shell
Use the new system to restyle/refine:
- editor shell controls
- tabs
- status rows
- save/reload/close affordances
- inline inspector editor framing
- shell consistency with scripts list/hierarchy/inspector

### Exit criteria
The main tooling shell reads as one coherent design system instead of several working but unrelated subsystems.

---

## 7. Immediate First Milestone

## Milestone: Tooling Design System v1

### Build now
1. shared theme token structs
2. style helper/scopes
3. primitive styled widgets
4. reusable:
   - `ToolPanel`
   - `SectionHeader`
   - `SelectableRow`
   - `PropertyRow`
   - `PropertyEditor`
5. migrate current tooling hosts to those shared pieces

### Why this first
Because it gives immediate value without overbuilding:
- consistent visuals,
- less duplicated code,
- clear substrate for Lua scripting next,
- and cleaner editor refinement later.

---

## 8. Suggested File/Module Direction

### C++ theme/style layer
Possible files:
- `manifold/ui/imgui/Theme.h`
- `manifold/ui/imgui/Theme.cpp`
- `manifold/ui/imgui/StyleScope.h`
- `manifold/ui/imgui/StyleScope.cpp`
- `manifold/ui/imgui/WidgetPrimitives.h`
- `manifold/ui/imgui/WidgetPrimitives.cpp`
- `manifold/ui/imgui/ToolComponents.h`
- `manifold/ui/imgui/ToolComponents.cpp`

### Lua-facing API layer
Possible files later:
- `manifold/ui/imgui/ui_imgui.lua`
- `manifold/ui/imgui/ui_theme.lua`
- `manifold/ui/imgui/ui_components.lua`

This does **not** need to land as a giant initial framework dump. It can be grown incrementally out of the current hosts.

---

## 9. Key Open Questions

These need answering during implementation, not avoided.

### 9.1 State ownership
Where do we keep state for:
- tree expansion,
- filter text,
- section collapse,
- graph pan,
- transient widget edit state?

Default answer: keep durable state in model/shell, only tiny ephemeral interaction state inside helper widgets.

### 9.2 Layout model
How much layout abstraction do we add in v1?

Default answer: minimal wrappers around ImGui layout first, no giant layout DSL yet.

### 9.3 Raw ImGui exposure timing
When do we expose raw ImGui to Lua?

Default answer: after the high-level Manifold component API is usable enough that raw mode remains an escape hatch.

### 9.4 Canvas-like ambitions
How far do we push custom draw primitives toward a canvas model?

Default answer: start with styled custom widgets and draw blocks; do not promise a full retained scene graph yet.

---

## 10. Anti-Goals / Failure Modes

### Do not do this
- build a fake CSS engine first
- expose only raw ImGui and call that a system
- hardcode theme data into each host forever
- attempt full Canvas parity before the tooling system is stable
- bury persistent state inside random static locals in render code
- build a huge generic framework before proving the first tooling panels

These are all good ways to waste time and end up with a fancy pile of shit.

---

## 11. Immediate Next Actions

1. create the shared ImGui theme/style layer
2. move current tooling hosts onto shared primitives
3. extract domain components from those hosts
4. define the first Lua component API for internal tooling only
5. add custom draw primitives after the component API is real
6. use the resulting system to clean up the editor shell

That is the sane path.

---

## 12. Success Criteria

This plan is working if we reach a point where:

- tooling hosts share one coherent style system,
- components are reusable instead of host-specific hacks,
- Lua can author internal tool panels without rebuilds,
- custom-draw widgets are possible without framework hell,
- and the editor shell refinement sits on top of the same system instead of fighting it.
