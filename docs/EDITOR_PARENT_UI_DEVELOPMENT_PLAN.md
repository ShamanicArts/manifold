# Editor and Parent UI Development Plan

## Purpose

Define the implementation plan for a Lua-first "parent shell" UI that sits above dynamic custom Lua views and enables in-plugin authoring workflows.

This plan covers:

1. a stable shared shell (navigation, status, mode control),
2. editor-facing workflows (object editing, script editing, run/stop, diagnostics),
3. code <-> editor round-trip direction.

## Context

Current DSP live scripting UI proves capability but is intentionally prototype-grade:

- useful for demonstrating runtime script compilation and graph swapping,
- not yet a durable product-level authoring environment,
- UI chrome/layout responsibilities are duplicated across scripts.

The next step is not "replace Lua" but "formalize shell + contracts." 

## Architectural Position

### Decision

Use **Lua + Canvas** as the primary implementation surface for the parent/editor UI.

### Why

- high iteration speed and hot-reload workflow already proven,
- existing widget and canvas primitives are sufficient for v1 shell/editor features,
- avoids premature lock-in to a heavier native rewrite.

### Native C++ Role (Still Critical)

- provide robust primitives and host integration,
- expose stable editor APIs to Lua (clipboard, file IO gates, diagnostics, runtime controls),
- own performance-sensitive rendering/input edges when needed.

## Target UX Model

The plugin UI becomes a single coherent product with mode-based content:

- **Shell layer (always visible):** top control bar, mode switch, status/errors, run/stop actions.
- **Content slot layer:** performance view, DSP authoring view, future visual editor view.
- **Inspector/tool panes:** contextual editors for selected object/parameter/binding.

This removes per-script chrome drift and layout inconsistency.

Implementation note:

- Parent shell should be host-managed and persistent across view switches.
- Child view scripts should work as content children with minimal/no shell-specific glue.
- Child scripts should only include explicit graph control logic when they intentionally take over/add to graph behavior.

## Core Principle: Shared Contract Before Feature Volume

Even with Lua-first implementation, define a canonical model contract early.

Minimum contract should represent:

- node identity (stable IDs),
- layout metadata,
- parameter schema and bindings,
- script references and generated code mapping.

This is required for long-term code <-> editor synchronization.

## Phase Plan

### Phase 0 - Shell Foundation

Create a reusable parent shell module with explicit slots:

- top bar (owned by shell)
- content container (owned by active view)
- optional side panel slots (inspector/diagnostics)

Define shell API:

- register view,
- activate view,
- surface status/error,
- global run/stop/reload actions.

### Phase 1 - Unified View Routing

Move existing UIs behind shell routing:

- `looper_ui.lua` as performance view,
- `dsp_live_scripting.lua` as authoring view,
- optional experimental views as hidden/dev routes.

Enforce layout ownership:

- shell owns global chrome and margins,
- views own only content slot internals.

### Phase 2 - Editor Core Features (V1)

Add high-value authoring basics:

- object selection model,
- basic inspector panel,
- script text panel with diagnostics,
- apply/revert workflow,
- graph/model summary pane.

Maintain existing run/stop and parameter generation flow.

### Phase 3 - Round-Trip Vertical Slice

Implement one constrained round-trip slice:

- code-defined object appears in editor,
- editor change updates model and regenerates code,
- reload preserves stable IDs and mappings.

This phase is the proof point for the editor vision.

### Phase 4 - Persistence and Project Structure

Add project/session persistence model:

- shell state,
- active view,
- editor model snapshot,
- script references and schema version.

### Phase 5 - Hardening

- tighten error reporting and recovery UX,
- add script crash counters/quarantine policy for repeated failures,
- improve diagnostics visibility and recovery controls.

## Proposed Module Layout (Lua-First)

Recommended additions under `looper/ui/` (names can be revised):

- `editor_shell.lua` - shell layout, mode routing, global controls
- `editor_state.lua` - canonical UI/editor state container
- `editor_router.lua` - view registration and lifecycle
- `editor_inspector.lua` - property/binding inspector widgets
- `editor_model.lua` - model/ID helpers for round-trip operations

Existing scripts become shell-mounted views, not shell owners.

## C++ API Surface Likely Needed

### Existing (already useful)

- runtime reload/apply endpoints
- graph diagnostics and debug params
- clipboard support in `LuaEngine`
- Canvas input and draw callbacks

### Expected additions

- explicit editor transaction APIs (begin/apply/revert)
- structured diagnostics feed for shell status bar/panels
- optional filesystem/project helpers with safe paths
- optional view/bootstrap fallback hooks for repeated load failures

## Core Files and Areas Expected to Change

### Lua UI Layer

- `looper/ui/dsp_live_scripting.lua`
- `looper/ui/looper_ui.lua`
- `looper/ui/looper_ui_old.lua` (if retained as legacy view)
- `looper/ui/looper_widgets.lua`
- `looper/ui/wiring_demo.lua` (likely fully deprecated)
- new shell/editor modules under `looper/ui/`

### Canvas and Lua Bindings

- `looper/primitives/ui/Canvas.h`
- `looper/primitives/ui/Canvas.cpp`
- `looper/primitives/scripting/LuaEngine.h`
- `looper/primitives/scripting/LuaEngine.cpp`

### Host Editor Bootstrap

- `looper/ui/LooperEditor.h`
- `looper/ui/LooperEditor.cpp`

### Documentation and Build Integration

- `CMakeLists.txt` (if new scripts/assets are packaged differently)
- UI architecture docs under `docs/` and `looper/ui/`

## Risks and Mitigations

1. Shell complexity overwhelms early iteration
   - Mitigation: shell v0 only includes navigation/status/content slot.

2. View scripts keep bypassing shell rules
   - Mitigation: enforce ownership boundaries (shell owns chrome/layout frame).

3. Editor/code mismatch over time
   - Mitigation: prioritize round-trip vertical slice early (Phase 3).

4. Error handling conflated with architecture work
   - Mitigation: keep graceful recovery as explicit hardening phase, not blocker for shell foundation.

## Acceptance Criteria

- One shared parent shell wraps all major views.
- Mode switching and global actions no longer depend on per-view ad hoc controls.
- V1 editor can inspect/edit/apply at least one stable model slice.
- Round-trip proof exists for at least one object category.
- Existing live Lua iteration speed remains intact.

## Relationship to Looper Decomposition Track

These tracks should progress in parallel:

- decomposition provides stable primitive building blocks,
- editor shell provides durable authoring surface.

Neither track blocks starting the other, but both benefit from a shared model contract and stable IDs.
