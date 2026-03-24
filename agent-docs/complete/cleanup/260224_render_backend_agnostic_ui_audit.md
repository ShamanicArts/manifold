# Render-Backend Agnostic UI Audit

Status: working audit / architecture reference  
Date: 2026-03-14

Related docs:
- `agent-docs/IMGUI_CANVAS_DEPENDENCY_AUDIT.md`
- `agent-docs/IMGUI_RENDERER_MIGRATION_PLAN.md`
- `agent-docs/UI_SYSTEM_DESIGN.md`

---

## 1. Canonical Target (Clarified)

The canonical goal is **not** "ImGui as the forever UI system."

The canonical goal is:

> a renderer-backend agnostic UI architecture whose semantic/runtime model is independent of the concrete presenter.

Today, the active presenter is `imgui-direct`. In the future, that presenter could be:
- ImGui
- a WGPU-backed renderer
- a remote renderer
- another retained GPU renderer

The architecture should therefore make the following layer canonical:

```text
Lua widgets / shell / structured project runtime
    -> retained semantic node tree
    -> explicit layout / style / input / invalidation model
    -> backend adapter / presenter
```

Not:

```text
Lua widgets
    -> Canvas semantics or ImGui semantics
    -> renderer-specific hacks
    -> hidden fallback behavior
```

### Practical implication

`imgui-direct` is the current default presentation path, but it should be treated as a **backend adapter**, not the product architecture.

The real long-term source of truth should be:
- retained semantic nodes
- widget/runtime metadata
- explicit invalidation / refresh
- backend-neutral display payloads and custom surface hooks

---

## 2. What Was Confirmed In This Audit Cycle

This audit was informed by:
- direct-mode bug fixing work done in the same session
- repo grep / targeted file reads
- cross-checking with additional model audits in tmux
- verification of exact file/line references before documenting

### Already fixed during this work

These findings were already validated and fixed in code before this document was written:

1. **Shell init invalidation bug**
   - `manifold/primitives/scripting/LuaEngine.cpp`
   - post-init was clearing deferred refreshes instead of flushing them
   - fixed by switching from `clearDeferredRefreshes` to `flushDeferredRefreshes`

2. **Settings UI queue corruption**
   - `manifold/ui/manifold_settings_ui.lua`
   - `rebuildTabContent()` was nuking the shared shell deferred queue
   - fixed by removing the clear and using flush after rebuild

3. **Settings direct-mode stale/hover-heal bug**
   - `manifold/ui/manifold_settings_ui.lua`
   - raw `widget.node:setBounds(...)` calls were bypassing retained refresh
   - fixed via helper routing through widget `setBounds(...)`

4. **MidiSynth active direct-incompatible keyboard path**
   - `UserScripts/projects/MidiSynth_uiproject/ui/behaviors/main.lua`
   - active keyboard rendering used `setOnDraw + gfx`
   - fixed by porting to retained display-list rendering

5. **LooperTabs Donut tab-switch slowdown**
   - `manifold/ui/widgets/dropdown.lua`
   - `manifold/ui/widgets/donut.lua`
   - `UserScripts/projects/LooperTabs/ui/behaviors/donut_shared_state.lua`
   - fixed by reducing retained churn and adding no-op guards

6. **Benchmark testing contract was wrong**
   - ad-hoc benchmark UI was causing shell/shared-header bugs
   - replaced with `manifold/ui/runtime_node_benchmark.lua` as a shell-hosted performance view

---

## 3. Verified Remaining Findings

Only verified findings are listed below. Several speculative claims from side-audits were discarded.

### 3.1 Structural migration blockers

#### A. RuntimeNode/direct still depends on legacy draw-callback replay

Files:
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp:310-317`
- `manifold/primitives/scripting/bindings/LuaUIBindings.h:33`
- `manifold/primitives/scripting/bindings/LuaUIBindings.cpp:739-764`

What is happening:
- `RuntimeNode:setBounds(...)` still replays retained draw generation if an `onDraw` callback exists.
- Lua bindings explicitly preserve a legacy fallback where Canvas-style draw callbacks are invoked without a `Graphics` context so `node:setDisplayList(...)` can still run.

Why this matters:
- This is a transitional compatibility crutch.
- It keeps old immediate-style code limping along in direct mode.
- It prevents the retained runtime tree from being a clean backend-neutral contract.

Why this blocks backend-agnostic architecture:
- A backend-neutral runtime should not depend on replaying renderer-era draw callbacks during bounds changes.
- Explicit invalidation should rebuild retained payloads.
- Layout changes should not implicitly mean "run old draw hook again."

Required direction:
- move retained rebuilds to explicit invalidation / retained refresh
- gate legacy draw replay behind explicit compatibility mode and logging
- remove replay from the hot path once active widgets are migrated

---

#### B. Overlay / replace modes still structurally require Canvas root

Files:
- `manifold/core/BehaviorCoreProcessor.cpp:46-55`
- `manifold/core/BehaviorCoreEditor.cpp:1225-1260`

What is happening:
- `imgui-overlay` and `imgui-replace` still map to `RootMode::Canvas`
- only `imgui-direct` gets a pure `RuntimeNode` root path

Why this matters:
- Making direct the default is useful, but it does not remove Canvas as a structural dependency.
- As long as overlay/replace require Canvas root, Canvas is still part of the architecture, not just a legacy backend.

Why this blocks backend-agnostic architecture:
- renderer mode should be presentation policy over one semantic runtime model
- root-runtime choice should not be permanently entangled with one presentation backend

Required direction:
- make non-canvas renderer modes consume the same retained runtime root
- treat overlay/replace as presentation variants, not alternate canonical runtimes
- decide whether overlay/replace survive long-term at all

---

### 3.2 Active direct-mode invalidation / refresh bugs still present

#### A. `midi_tab.lua` still bypasses widget retained refresh via raw node bounds

File:
- `manifold/ui/midi_tab.lua:93, 101, 132, 144, 154, 162, 192, 202, 210, 224, 238, 253, 269, 281, 289, 295, 303`

What is happening:
- real widget wrappers are created (`Panel`, `Label`, `Dropdown`, `Toggle`, `Button`)
- layout is then applied with `widget.node:setBounds(...)` everywhere

Why this matters:
- this bypasses `BaseWidget:setBounds(...)`
- retained refresh/invalidation can be skipped in direct mode
- this is the same bug class that previously caused settings UI stale/hover-heal behavior

Required direction:
- add a helper like the settings UI helper and route all widget layout through widget `setBounds(...)`

---

#### B. Shell runtime-param control layout still bypasses widget retained refresh

Files:
- `manifold/ui/shell/bindings.lua:1202-1204`
- `manifold/ui/shell/methods_core.lua:1743, 1747, 1751`

What is happening:
- runtime param control widgets (`minus`, `slider`, `plus`) are positioned/hidden via raw `.node:setBounds(...)`

Why this matters:
- same invalidation bug class as above
- these are active shell controls, not dead debug junk

Required direction:
- route these through widget-level bounds helpers
- ban raw `.node:setBounds(...)` for widget wrappers in active UI code

---

### 3.3 Medium-severity performance / architecture debt

#### A. `TabHost` still forces synchronous deferred refresh drains

File:
- `manifold/ui/widgets/tabhost.lua:48, 281, 346`

What is happening:
- tab finalize / tab switching calls `flushDeferredRefreshesNow()`

Why this matters:
- deferred work becomes sync interaction work
- frame spikes and asymmetric tab-switch behavior become more likely
- ordering bugs are hidden instead of being modeled properly

Required direction:
- move toward mark-dirty + next-frame commit
- keep forced sync only in narrow initialization cases if absolutely necessary

---

#### B. Editor hot paths still flush deferred retained work synchronously

Files:
- `manifold/core/BehaviorCoreEditor.cpp:1148`
- `manifold/core/BehaviorCoreEditor.cpp:1562`
- `manifold/core/BehaviorCoreEditor.cpp:1812`
- `manifold/primitives/scripting/LuaEngine.cpp:899`

What is happening:
- mode change, timer loop, resize/init paths force `flushDeferredRefreshes`

Why this matters:
- this is transitional glue, but it means correctness still depends on synchronous global queue draining
- current direct mode works partly because the system brute-forces queue convergence

Required direction:
- move toward explicit staged retained commits
- renderer should consume a stable retained tree, not depend on emergency global drains

---

#### C. Capture-plane behaviors are still hybrid and churny

Files:
- `UserScripts/projects/LooperTabs/ui/behaviors/shared_capture_plane.lua:12, 20, 295-298`
- `UserScripts/projects/LooperTabs/ui/behaviors/looper_capture_plane.lua:12, 20, 242-245`
- `UserScripts/projects/LooperTabs/ui/behaviors/donut_capture_plane.lua:12, 20, 221-224`

What is happening:
- these behaviors still special-case canvas renderer checks
- they optionally attach `setOnDraw`
- they also rebuild retained display lists on update

Important nuance:
- these are **not** currently hard direct-mode breakage
- they already produce retained display lists
- but they still expose renderer-specific behavior and redraw churn

Why this matters:
- renderer-agnostic scripts should not need to know whether the presenter is canvas or direct
- these behaviors are a visible example of the wrong abstraction boundary

Required direction:
- replace `rendererModeIsCanvas()` + `setOnDraw` pattern with a backend-neutral redraw/invalidate helper
- let scripts describe retained payloads or surface data without branching on renderer

---

### 3.4 Lower-priority but real cleanup

#### A. Shell still keeps dual immediate-mode fallbacks alive in several surfaces

Files:
- `manifold/ui/ui_shell.lua:412-413`
- `manifold/ui/shell/bindings.lua:256, 350, 454, 735, 742, 1388, 1784, 1943`

What is happening:
- shell surfaces still maintain `setOnDraw` fallback paths in parallel with retained sync logic

Why this matters:
- this is not an immediate product blocker if retained sync is authoritative
- but it allows immediate and retained paths to diverge quietly

Required direction:
- make retained sync authoritative
- isolate or remove mirrored immediate fallback paths once equivalent retained behavior is verified

---

#### B. Shell console renderer UX still privileges old modes

File:
- `manifold/ui/shell/methods_core.lua:1079, 1189-1217`

What is happening:
- renderer help text still omits `imgui-direct`
- toggle semantics still think in terms of `canvas <-> imgui-replace`

Why this matters:
- the UI says one thing while the architecture is trying to become something else
- this makes exercising the intended path more annoying than it should be

Required direction:
- add `imgui-direct` to help/usage
- make direct the primary non-canvas target for shell UX

---

#### C. Canvas-default assumptions are still scattered in Lua shell/widget code

Files:
- `manifold/ui/widgets/base.lua:218-223, 264-269`
- `manifold/ui/shell/methods_core.lua:117-127`
- `manifold/ui/shell/methods_layout.lua:701-704`

What is happening:
- unknown/missing renderer mode tends to silently default to `"canvas"`

Why this matters:
- this hides capability-plumbing bugs
- it blurs the real contract between semantic runtime and presenter

Required direction:
- default from actual runtime capabilities / root type where possible
- fail loudly in retained/runtime-node-only contexts instead of silently pretending canvas

---

## 4. Things Explicitly Checked And Not Escalated

### A. MidiSynth active UI path

Result:
- no remaining active `setOnDraw`, `gfx.*`, or raw widget `.node:setBounds(...)` findings were identified under:
  - `UserScripts/projects/MidiSynth_uiproject/ui`

Interpretation:
- the active MidiSynth direct-compat path looks clean enough for this audit pass

### B. `project_loader.lua`

Relevant code:
- `manifold/ui/project_loader.lua:1059, 1205`

Result:
- it already prefers `widget:setBounds(...)`
- only falls back to `node:setBounds(...)` when no widget API exists

Interpretation:
- this is not the same bug class as the active widget-bound bypasses above

### C. `runtime_node_benchmark.lua`

Relevant code:
- `manifold/ui/runtime_node_benchmark.lua:252`

Result:
- benchmark animation moves raw nodes with `item.node:setBounds(...)`

Interpretation:
- this is expected benchmark/test code acting on raw nodes, not widget wrappers
- not the same retained invalidation issue

---

## 5. Core Architectural Rules Emerging From This Work

These rules should guide further cleanup and any future backend work.

### Rule 1: Semantic runtime tree is canonical

The canonical model should be:
- semantic node hierarchy
- explicit bounds / style / input / state
- explicit retained render payloads
- optional custom-surface payloads

The canonical model should **not** be:
- JUCE `Canvas`
- ImGui draw calls
- one renderer's callback semantics

### Rule 2: Widgets must invalidate explicitly, not via renderer-era draw replay

Retained refresh should happen through:
- widget setters
- explicit invalidation helpers
- layout system changes
- model/state transitions

Not through:
- "set bounds, then if onDraw exists replay legacy draw callback"

### Rule 3: Widget layout must go through widget APIs

For widget wrappers in active UI code:
- use `widget:setBounds(...)`
- or use a helper that resolves to widget `setBounds(...)`

Do **not** use:
- `widget.node:setBounds(...)`

unless the object is intentionally a raw node, not a widget wrapper.

### Rule 4: Scripts should not branch on backend in active paths

Bad:
- `if renderer == canvas then setOnDraw(...) else setDisplayList(...) end`

Better:
- backend-neutral helper / retained payload builder / custom surface payload

### Rule 5: Presenter modes should not imply different semantic roots

Long-term goal:
- one semantic runtime
- multiple presenters/backends
- optional presentation variants over that runtime

Not:
- one runtime for canvas, a different runtime for direct, and hidden translation glue between them

---

## 6. Recommended Backlog Order

### Tier 1 — immediate correctness

1. Fix raw widget bounds in:
   - `manifold/ui/midi_tab.lua`
   - `manifold/ui/shell/bindings.lua`
   - `manifold/ui/shell/methods_core.lua`

2. Update shell renderer console UX:
   - `manifold/ui/shell/methods_core.lua`

### Tier 2 — architecture cleanup with visible payoff

3. Replace capture-plane renderer branching with backend-neutral redraw helpers:
   - `UserScripts/projects/LooperTabs/ui/behaviors/*capture_plane.lua`

4. Reduce `TabHost` synchronous flush dependency:
   - `manifold/ui/widgets/tabhost.lua`

### Tier 3 — backend-agnostic runtime cleanup

5. Remove legacy draw replay from active retained hot path:
   - `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp`
   - `manifold/primitives/scripting/bindings/LuaUIBindings.cpp/.h`

6. Stop requiring Canvas root for non-canvas presentation modes:
   - `manifold/core/BehaviorCoreProcessor.cpp`
   - `manifold/core/BehaviorCoreEditor.cpp`

7. Replace canvas-default assumptions with capability-aware logic:
   - `manifold/ui/widgets/base.lua`
   - `manifold/ui/shell/methods_core.lua`
   - `manifold/ui/shell/methods_layout.lua`

---

## 7. Bottom Line

The current work proved that direct mode can be the default and that many active Lua paths can be made retained-safe.

But the real architectural target is bigger:

> keep the Lua/UI composition model, keep the retained semantic runtime, and make the concrete renderer backend replaceable.

Right now the main remaining architectural bullshit is:
- legacy draw replay still in the runtime-node path
- raw widget `.node:setBounds(...)` still present in active Lua UI
- Canvas root still structurally required for some non-canvas presentation modes

Until those are cleaned up, the system is **more backend-agnostic than before**, but not yet honestly backend-neutral.
