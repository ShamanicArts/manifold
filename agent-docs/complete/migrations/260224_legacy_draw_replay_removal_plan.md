# Legacy Draw Replay Removal Plan

Status: planning / removal map  
Date: 2026-03-14

Related docs:
- `agent-docs/RENDER_BACKEND_AGNOSTIC_UI_AUDIT.md`
- `agent-docs/IMGUI_CANVAS_DEPENDENCY_AUDIT.md`
- `agent-docs/IMGUI_RENDERER_MIGRATION_PLAN.md`

---

## 1. Problem Statement

The current retained runtime still contains a compatibility mechanism that replays legacy draw callbacks into retained display lists.

That mechanism was useful to get early direct-mode support working, but it is now one of the main things preventing the UI runtime from being honestly backend-neutral.

The issue is not just one function.

There is a **chain of automatic and explicit replay paths** spread across bindings and shell refresh logic:
- binding-level replay on `setBounds(...)`
- binding-level replay on `repaint()`
- binding-level replay on `setOnDraw(...)`
- shell-side recursive compatibility replay for non-direct modes
- Canvas `invokeDrawForRetained` compatibility wrappers

If this is removed sloppily, direct mode will regress hard. If it is left in place forever, backend-neutral architecture stays fake.

So the correct move is:

> map every replay trigger, narrow replay policy, make direct mode stop depending on it, then remove it from active retained hot paths.

---

## 2. What Legacy Replay Actually Means Here

Two distinct but related mechanisms exist.

### 2.1 RuntimeNode replay

For `RuntimeNode`, a Lua `onDraw` callback can be replayed without a live graphics context, and the callback can still build retained output by:
- calling `node:setDisplayList(...)`
- or emitting draw commands captured by `RuntimeDrawRecorder`

Relevant implementation:
- `manifold/primitives/scripting/bindings/LuaUIBindings.cpp:237-285`
- `manifold/primitives/scripting/bindings/LuaUIBindings.h:33-41`

### 2.2 Canvas replay wrapper

For `Canvas`, `setOnDraw(...)` also stores a second wrapper that can invoke the Lua callback with `currentGraphics == nullptr`, so `gfx.*` becomes a no-op while `node:setDisplayList(...)` still works.

Relevant implementation:
- `manifold/primitives/scripting/bindings/LuaUIBindings.cpp:739-764`

This is a compatibility bridge, not a real retained runtime contract.

---

## 3. Verified Replay Trigger Inventory

### 3.1 Automatic replay triggers in RuntimeNode bindings

#### A. `RuntimeNode:setBounds(...)`
File:
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp:322-329`

Current behavior:
- updates bounds
- if `onDraw` exists and size is non-zero, automatically calls `LuaUIBindings::invokeRuntimeNodeDrawForRetained(...)`

Impact:
- layout/bounds changes implicitly cause legacy draw replay
- this is the most visible hot-path offender

---

#### B. `RuntimeNode:repaint()`
File:
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp:428-433`

Current behavior:
- marks render dirty
- if `onDraw` exists and node has size, automatically replays retained draw

Impact:
- repaint becomes half invalidation, half legacy draw execution
- this blurs the runtime contract badly

---

#### C. `RuntimeNode:setOnDraw(...)`
File:
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp:569-579`

Current behavior:
- installs `onDraw`
- if valid and node already has non-zero bounds, immediately replays retained draw
- if invalid, clears display list

Impact:
- attach-time replay is currently used as a convenience bootstrapping path
- this one is less offensive than replay-on-bounds/repaint, but still part of the same coupling

---

#### D. `RuntimeNode:invokeDrawForRetained()`
File:
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp:584-586`

Current behavior:
- explicit public escape hatch that replays retained draw on demand

Impact:
- this is fine as a temporary compatibility/debug API
- but it should become opt-in legacy behavior, not normal runtime architecture

---

### 3.2 Shell-side explicit replay triggers

#### A. Recursive retained refresh helper
File:
- `manifold/ui/shell/methods_core.lua:206-216`

Current behavior:
- refreshes retained widgets via `widget:refreshRetained(...)`
- additionally calls `node:invokeDrawForRetained()` for non-direct renderers if available

Important note:
- this code is already explicitly avoiding replay in `imgui-direct`
- that is good and should be preserved

Impact:
- direct mode is partially protected here already
- legacy replace/overlay paths still depend on replay

---

#### B. Recursive retained animation/tick helper
File:
- `manifold/ui/shell/methods_core.lua:251-252`

Current behavior:
- for non-direct renderers, recursively calls `invokeDrawForRetained()` if available

Impact:
- same story as above
- this is one of the reasons replace/overlay still limp along with hybrid content

---

### 3.3 Canvas-side replay compatibility

#### A. Canvas `invokeDrawForRetainedFn`
File:
- `manifold/primitives/ui/Canvas.h:44-45`
- `manifold/primitives/scripting/bindings/LuaUIBindings.cpp:739-764`

Current behavior:
- `Canvas:setOnDraw(...)` stores a wrapper that can later be replayed without `Graphics`

Impact:
- this preserves old Canvas-era script patterns longer than the architecture wants

---

## 4. Current Good News

Some groundwork is already in place.

### 4.1 Direct-mode shell recursion already avoids replay
- `manifold/ui/shell/methods_core.lua:213-216`
- `manifold/ui/shell/methods_core.lua:251-252`

The shell explicitly says:
- direct mode should not depend on Canvas-style replay
- only legacy replace/overlay should use `invokeDrawForRetained`

That is the correct direction.

### 4.2 Standard runtime widgets already have explicit retained sync
- `manifold/ui/widgets/base.lua:151-184`
- `manifold/ui/widgets/base.lua:247-270`

The `BaseWidget` path already models the right contract:
- setters / size changes / state changes call `refreshRetained(...)`
- `refreshRetained(...)` defers and then calls `_syncRetained(...)`

That is the architecture we want to expand.

### 4.3 Replay warnings are now live
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp`

A throttled warning was added in this work cycle when bounds changes trigger legacy replay. This gives immediate observability into lingering dependencies.

---

## 5. Architectural Goal For Replay Removal

### Desired end state

For active retained runtime operation, especially in direct mode:
- layout changes do **not** implicitly execute draw callbacks
- repaint requests do **not** implicitly execute draw callbacks
- attaching an `onDraw` callback does **not** become the normal retained bootstrap path
- retained output is built by explicit retained sync / invalidation / display payload APIs

### What should remain, temporarily

For legacy compatibility while migration continues:
- a clearly marked explicit compatibility path may remain for overlay/replace and debugging
- explicit `invokeDrawForRetained()` may remain temporarily behind policy checks
- Canvas replay support may remain until those modes are either ported or deleted

---

## 6. Recommended Removal Strategy

Do this in phases. Do **not** try to nuke the entire replay stack in one commit.

### Phase 0 — tighten observability first

#### Goals
- identify where replay still happens
- separate direct-path replay from legacy-only replay

#### Actions
1. keep the current throttled replay warnings
2. add warning points for the other automatic triggers if needed:
   - `RuntimeNode:repaint()` replay
   - `RuntimeNode:setOnDraw()` attach-time replay
3. classify warning sources by node id / surface / script

#### Exit criteria
- we know which active runtime nodes still depend on replay
- we know whether remaining replay is coming from direct path or only legacy modes

---

### Phase 1 — stop automatic replay in direct-mode hot paths

#### Goals
- direct mode no longer automatically replays on bounds/repaint
- explicit retained widgets continue working

#### Actions
1. gate replay in `RuntimeNode:setBounds(...)` by renderer policy
   - direct mode: no automatic replay
   - legacy non-direct modes: temporary compatibility allowed

2. gate replay in `RuntimeNode:repaint()` by renderer policy
   - same split as above

3. leave explicit `invokeDrawForRetained()` callable for temporary compatibility

#### Why this order
- this removes the hottest hidden coupling first
- it should not require deleting the escape hatch yet

#### Exit criteria
- default direct-mode startup and active first-party UIs work without automatic replay from `setBounds` or `repaint`
- replay warnings no longer fire in normal direct-mode shell usage

---

### Phase 2 — stop using `setOnDraw(...)` as retained bootstrap for RuntimeNode

#### Goals
- attaching an `onDraw` callback is no longer the normal retained initialization path

#### Actions
1. change `RuntimeNode:setOnDraw(...)` policy:
   - direct mode: do not immediately replay on attach
   - instead require explicit retained bootstrap / invalidate
2. preserve explicit compatibility path only where intentionally requested
3. ensure widgets/scripts that still rely on attach-time replay are migrated

#### Exit criteria
- runtime-node `onDraw` attachment is no longer silently performing retained initialization in direct mode

---

### Phase 3 — isolate replay to explicit legacy compatibility mode

#### Goals
- replay exists only as an opt-in compatibility path
- not as ambient runtime behavior

#### Actions
1. add a centralized replay policy helper in C++
   - e.g. `allowLegacyRetainedReplay(...)`
2. make all replay entry points go through that policy
3. allow replay only for:
   - legacy overlay/replace modes
   - explicitly tagged legacy nodes/scripts if needed

#### Useful implementation option
- node/userdata/tag-based opt-in for temporary legacy replay
- e.g. a node metadata flag like `_allowLegacyRetainedReplay = true`

#### Exit criteria
- replay is explicit, centrally controlled, and observable

---

### Phase 4 — delete active runtime dependence on replay

#### Goals
- active first-party runtime UI no longer needs replay at all

#### Actions
1. migrate remaining replay-dependent shell surfaces
2. port or delete remaining direct-mode fallback surfaces
3. eliminate replay warnings in all supported direct-mode first-party UIs

#### Exit criteria
- normal app startup in direct mode produces zero replay warnings
- benchmark, settings, LooperTabs, MidiSynth, default UI all run without replay dependence

---

### Phase 5 — remove or quarantine Canvas replay support

#### Goals
- Canvas replay wrapper no longer part of normal architecture

#### Actions
1. either delete Canvas `invokeDrawForRetainedFn`
2. or quarantine it behind clearly legacy-only build/runtime policy

#### Exit criteria
- backend-neutral retained runtime is not defined in terms of Canvas callback replay anymore

---

## 7. Implementation Notes

### 7.1 Centralize replay policy

Right now replay decisions are spread across call sites.
That is asking for bugs.

Introduce one policy decision path, e.g.:
- presentation mode check
- optional node-level legacy flag
- maybe script-level legacy mode flag

Then all of these should consult it:
- `RuntimeNode:setBounds(...)`
- `RuntimeNode:repaint()`
- `RuntimeNode:setOnDraw(...)`
- shell recursive compatibility replay
- explicit debug/legacy invoke entry points

### 7.2 Prefer capability/state checks over renderer-string logic where possible

The shell has already been moving away from renderer-name branching toward capability-based behavior.
That should continue.

But replay policy is one place where renderer/presentation mode still legitimately matters during transition.
So for now a centralized policy that knows about legacy presentation modes is acceptable.

### 7.3 Keep explicit invalidation APIs first-class

The long-term replacement for replay must remain:
- widget setters -> `refreshRetained(...)`
- layout changes -> explicit retained refresh
- runtime state changes -> retained payload rebuild
- explicit dirtying via `markRenderDirty()` only after retained payload is ready

Not:
- `repaint()` magically means "run draw function again"

---

## 8. Test Plan

### 8.1 Direct-mode correctness tests

Must pass in `imgui-direct` with no automatic replay dependence:
- default runtime UI
- settings UI
- runtime benchmark UI
- LooperTabs project
- MidiSynth project
- shell tab switching
- shell overlays that are still supposed to work in direct mode

### 8.2 Replay warning tests

Expected progression:
1. current state: warnings appear in some direct shell paths
2. after Phase 1: warnings disappear from normal direct usage
3. after later phases: warnings only appear in explicit legacy modes or not at all

### 8.3 Legacy mode containment tests

For any remaining supported non-direct modes:
- verify legacy compatibility still functions intentionally
- verify replay is coming only from allowed policy paths

### 8.4 Regression focus areas

The dangerous regressions are:
- blank nodes after bounds changes
- nodes that only appear after hover or resize
- shell surfaces that initialize empty until interaction
- tab contents not building on first activation
- replace/overlay modes silently depending on now-removed replay

---

## 9. Recommended Immediate Next Step

The next implementation step should be **Phase 1 only**:

1. introduce a centralized replay policy helper
2. disable automatic replay in `RuntimeNode:setBounds(...)` for direct mode
3. disable automatic replay in `RuntimeNode:repaint()` for direct mode
4. keep explicit invoke path and shell legacy guards intact for now
5. test default UI + LooperTabs + settings + benchmark in direct mode

That gives the highest architectural payoff with a contained blast radius.

Doing more than that in one jump would be cowboy bullshit.

---

## 10. Bottom Line

The repo is already halfway to the right answer:
- retained widgets exist
- direct-mode shell recursion already tries not to depend on replay
- active first-party scripts have been getting ported away from Canvas-era patterns

The remaining problem is that replay is still wired into too many generic runtime actions.

The real goal is simple:

> direct retained runtime must be driven by explicit retained invalidation and payload building, not by secretly replaying old draw callbacks whenever something changes.

That is the hinge between:
- "direct works today"
and
- "the architecture can honestly support another backend later."
