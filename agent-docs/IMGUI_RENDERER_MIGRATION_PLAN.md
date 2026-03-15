# ImGui Renderer Migration Plan

Status: planning / architecture handoff

Purpose: document the current architecture reality, identify what is already reusable, and lay out a practical migration from the current Canvas/JUCE software-drawing runtime toward an ImGui-backed runtime while preserving the existing Lua composition model.

---

## 1. Problem Statement

The current UI framework paradigm is not tenable as the long-term product path.

The core issue is not just that JUCE `Graphics` software drawing is slow. The actual problem is that the current runtime still treats `Canvas` as too close to the canonical truth for:

- structure
- layout
- input
- rendering
- editor introspection
- runtime identity

That coupling makes large/high-DPI scenes scale badly, makes renderer replacement harder than it should be, and keeps the current UI model only partially renderer-agnostic.

At the same time, the project already has important architecture pieces in place:

- Lua-driven composition
- shell-owned editor state and layout
- structured project loading/runtime
- widget metadata/schema exposure
- node identity work (`nodeId`, `widgetType`, input capabilities)
- surface descriptors
- existing ImGui tool hosts

This means the correct framing is **not** “rewrite everything around ImGui from scratch.”

The correct framing is:

> finish the separation that already exists, remove `Canvas` as the hidden canonical runtime object, and move the product UI runtime onto a single ImGui-backed renderer backend.

---

## 2. Current Architecture Reality

Today the editor stack is roughly:

```text
Lua widgets / shell
    -> Canvas-backed runtime tree
    -> JUCE input + JUCE Graphics paint
    -> some OpenGL custom rendering
    -> separate ImGui hosts for tooling
```

This already contains a real separation between:

- UI description/composition
- runtime/editor semantics
- concrete rendering

But that separation is incomplete.

### What is already strong

- `ui_shell.lua` and `methods_*.lua` hold real application/editor semantics
- widgets expose schema and metadata instead of being opaque draw blobs
- structured projects already produce a runtime layout tree
- the editor already knows about hierarchy, selection, inspector rows, and surface ownership
- ImGui is already proven in the app for tools

### What is still wrong

- Lua widgets fundamentally author against `Canvas`
- hierarchy and inspector often still walk live `Canvas` trees as truth
- draw hooks still rely on `gfx.*` and `setOnDraw()` semantics
- input routing is still heavily tied to `Canvas` callback APIs
- `Canvas` is trying to be both semantic node and backend component

---

## 3. Migration Goal

The target architecture should be:

```text
Lua widgets / shell
    -> retained semantic node tree
    -> layout / state / style resolution
    -> ImGui renderer backend
    -> optional custom GPU surface nodes
```

Not:

```text
Lua widgets / shell
    -> Canvas tree as canonical truth
    -> JUCE Graphics paint
    -> some ImGui on the side
```

This migration assumes a **single renderer backend** for the shipped product runtime:

- plugin UI
- standalone UI
- remote-connected rendering in another instance

In this plan, that backend is ImGui.

The important distinction is:

- **ImGui as renderer/backend**: good candidate
- **raw immediate-mode ImGui as the entire product UI model**: bad idea

The project should keep the existing higher-level Lua composition layer and put ImGui underneath it.

---

## 4. Guiding Principles

1. **Do not throw away the existing Lua composition model.** It already solves meaningful product problems.
2. **Do not keep `Canvas` as the hidden source of truth.** That is the main architectural debt.
3. **Keep shell semantics, selection semantics, schema semantics, and structured project semantics.** Those are product assets.
4. **Use ImGui as the concrete rendering backend, not as the user-facing authoring API.**
5. **Preserve a semantic node tree above the renderer.** That is what keeps remoting, inspection, and composition sane.
6. **Treat tool UI and product UI as separate concerns even if they share ImGui underneath.**
7. **Favor an adapter-first migration, but only with a strict cleanup boundary.** Fast does not mean sloppy.

---

## 5. Reuse / Adapt / Replace Matrix

## 5.1 Reuse almost directly

These subsystems are already close to the right layer and should largely survive the migration.

### `manifold/ui/ui_shell.lua`
Keep:
- shell creation
- top-level mode/state handling
- shell-owned composition state
- surface initialization/state

Why:
- it mostly represents app/editor semantics rather than render backend details

### `manifold/ui/shell/methods_layout.lua`
Keep:
- panel/content geometry logic
- shell layout decisions
- mode/layout transitions
- surface bounds calculation

Why:
- this is mostly layout policy, not rendering policy

### `manifold/ui/shell/methods_core.lua`
Keep:
- selection model
- inspector row construction
- script list semantics
- shell state transitions
- surface registry
- perf instrumentation concepts

Caveat:
- drain out remaining direct `Canvas`-truth assumptions over time

### `manifold/ui/project_loader.lua`
Keep:
- structured project runtime
- layout tree concepts
- instance/source metadata
- component composition/runtime model

Why:
- this is already close to the retained semantic model the future runtime needs

### Existing ImGui tool hosts
Keep:
- `ImGuiHost`
- `ImGuiHierarchyHost`
- `ImGuiInspectorHost`
- `ImGuiScriptListHost`
- `ImGuiPerfOverlayHost`

Why:
- they prove ImGui viability in the current stack
- they are already solving the tool-surface problem

---

## 5.2 Reuse with a new backing node/runtime object

These are valuable, but too tied to `Canvas` to survive unchanged.

### `manifold/ui/widgets/base.lua`
Keep conceptually:
- `BaseWidget` class model
- config storage
- editor metadata storage
- exposed params/schema merge
- enable/visible semantics

Change:
- stop binding directly to `Canvas`
- stop assuming `setOnDraw()` is the authored render contract
- target a backend-neutral runtime node API instead

### `manifold/ui/widgets/*.lua`
Keep:
- widget state/behavior semantics
- config/schema logic
- composition patterns

Change:
- convert direct draw logic into renderer-agnostic props or explicit render payloads
- stop treating JUCE draw hooks as the canonical runtime contract

### `manifold/ui/shell/inspector_utils.lua`
Keep:
- path/config helpers
- schema/value helpers
- geometry helpers

Change:
- make hierarchy walking operate on semantic runtime nodes instead of live `Canvas` objects

### `manifold/ui/shell/bindings.lua`
Keep:
- behavior semantics
- action routing semantics
- fallback UX semantics where still needed

Change heavily:
- remove direct `gfx.*` rendering as main path
- remove direct `Canvas` event binding as the default runtime path
- split semantic binding from renderer binding

---

## 5.3 Replace / demote aggressively

These are the core problem areas.

### `manifold/primitives/ui/Canvas.h/.cpp`
Demote from canonical runtime type.

Keep only as inspiration / compatibility source for:
- node identity concepts
- input capability concepts
- metadata storage concepts
- versioning concepts
- render payload concepts

Stop using it as:
- semantic UI node
- canonical child tree
- primary input target graph
- primary product UI render target

### `manifold/primitives/scripting/bindings/LuaUIBindings.cpp`
Rewrite the Lua-facing UI contract.

Today it tells Lua:
- the UI substrate is `Canvas`
- rendering happens through `Canvas` callbacks
- input is directly attached to `Canvas`

That must change.

Lua should target a semantic runtime node API instead.

### Product UI runtime in `BehaviorCoreEditor.*`
Keep:
- tool-host orchestration
- shell surface syncing
- host composition management

Replace:
- `rootCanvas` as product runtime authority
- repaint-driven product UI rendering through Canvas tree

---

## 6. The Critical Missing Abstraction

The most important refactor is to introduce a backend-neutral runtime node contract.

Call it whatever you want:
- `UiNode`
- `RuntimeNode`
- `ViewNode`

The name does not matter. The contract does.

It should own:
- stable id
- widget type
- children
- bounds/layout rect
- visibility
- style props
- semantic state
- input handlers
- editor metadata
- render payload / custom surface payload
- version counters

### Why this matters

Right now Lua widgets target `Canvas`.

That makes backend replacement fake.

Once Lua/widgets/shell target a semantic node contract instead:
- `Canvas` can disappear or become an adapter
- hierarchy/inspector stop depending on JUCE component objects
- ImGui becomes a sane backend swap instead of a giant sidecar hack

---

## 7. Proposed Runtime Split

## 7.1 Semantic layer
Owns:
- node tree
- widget identity
- bounds/style/state
- metadata/schema
- event declarations
- custom render payloads

## 7.2 Renderer backend layer
Owns:
- concrete ImGui rendering
- concrete hit zones / interaction mapping
- texture/image/surface composition
- custom GPU/3D viewport presentation inside the UI

## 7.3 Optional compatibility adapter layer
Temporary only.

Could allow:
- old code targeting `Canvas`-ish calls to feed the new node model
- incremental migration of widgets/shell code

But this should be treated as a bridge, not the future.

---

## 8. How ImGui Fits Cleanly

ImGui should become the single product runtime renderer backend.

That means:
- standard controls render through ImGui primitives/widgets
- custom widgets can render through ImGui draw lists
- GPU content can render to textures/surfaces and be shown inside ImGui regions
- tool UI and product UI can share underlying infrastructure without sharing authored semantics

### Important constraint

Users should still author the higher-level Lua widget model.

They should **not** be forced to script raw ImGui calls.

The product-facing layer stays:
- Panels
- Labels
- Buttons
- Knobs
- Sliders
- Lists
- Tabs
- Overlays
- Waveforms
- Meters
- Shader/3D surface nodes

ImGui is just the thing that draws them.

---

## 9. Custom Drawing / GPU / 3D

The existing migration should preserve support for advanced visuals.

Recommended split:

### Normal widgets
Represented semantically and rendered by ImGui backend.

### Custom 2D visuals
Represented as:
- explicit semantic render payloads, or
- backend-neutral draw primitive payloads that the ImGui renderer consumes

### GPU / shader / 3D visuals
Represented as dedicated semantic surface nodes:
- `ShaderSurface`
- `Viewport3D`
- `WaveformSurface`
- etc.

The ImGui backend then:
- renders or references the underlying surface/texture
- places it in the correct rect
- routes input to it

This avoids pretending the whole authored UI must become a 3D engine.

---

## 10. What This Means for Remote/Session Rendering

The migration does **not** require a second renderer target.

The same shipped app/runtime can:
- render its own local authoritative session
- connect to another authoritative instance and render that session instead

The critical requirement is still a semantic runtime model with stable identity, because that is what makes session sync/inspection/control coherent.

The migration does **not** require:
- a browser thin client
- a second renderer backend
- a different authored UI representation

It only requires that the canonical UI/session truth stop being “live JUCE Canvas tree objects.”

---

## 11. Recommended Migration Strategy

The right plan is **adapter-first, cleanup-driven**.

Do not boil the ocean. Do not preserve hidden Canvas truth either.

## Phase 1 — freeze the semantic node contract
Define the backend-neutral runtime node API that widgets/shell should target.

Deliverable:
- concrete node contract doc / implementation skeleton

## Phase 2 — bind Lua/widgets to the semantic node contract
Update `BaseWidget`, widgets, and Lua bindings so authored UI stops fundamentally targeting `Canvas`.

Deliverables:
- Lua-facing runtime node bindings
- compatibility bridge where necessary

## Phase 3 — move hierarchy/inspector/shell traversal to semantic nodes
Stop walking the live `Canvas` tree as truth.

Deliverables:
- hierarchy walkers use semantic nodes
- selection/inspector logic uses semantic ids/nodes

## Phase 4 — implement ImGui renderer backend for product UI
Build a renderer that consumes the semantic node tree.

Deliverables:
- panels/text/buttons/sliders/toggles/lists/tabs/etc.
- custom draw support
- surface node support

## Phase 5 — integrate advanced surfaces
Map shader/3D/custom GPU nodes into the ImGui renderer runtime.

Deliverables:
- offscreen texture/surface integration
- input routing for those surfaces

## Phase 6 — demote or delete Canvas runtime usage
Once the semantic node + ImGui backend path is credible, remove `Canvas` from being the product UI authority.

---

## 12. Risks

## Risk 1: fake backend swap
Keeping `Canvas` as the real truth while merely drawing some things through ImGui will preserve the core architectural problem.

## Risk 2: over-rewrite
Rewriting shell/widget semantics before freezing the runtime node contract wastes time and increases risk.

## Risk 3: raw-ImGui leakage into authored API
If users start authoring raw immediate-mode ImGui directly, composition and long-term UX/DX will degrade.

## Risk 4: hybrid hell
If both Canvas runtime truth and ImGui runtime truth remain alive for too long, debugging and behavior ownership will get worse.

---

## 13. Practical Recommendation

The strongest realistic path is:

> keep the existing higher-level Lua composition system, keep the structured project/runtime work, finish the semantic/runtime separation, and replace the product UI rendering/input substrate with a single ImGui-backed runtime.

This reuses the parts of the system that are already valuable and replaces the exact parts that are currently making the architecture non-tenable.

---

## 14. Immediate Next Actions

1. Define and agree the semantic runtime node contract.
2. Audit Lua widget APIs and list which ones are actually semantic vs secretly Canvas-bound.
3. Prototype one vertical slice:
   - Panel
   - Label
   - Button
   - Knob
   - List
   - one custom GPU surface
   rendered through the new ImGui backend from the semantic node model.
4. Once that works, migrate hierarchy/selection traversal off Canvas.
5. Only then start wider widget migration.

---

## 15. Bottom Line

The current system already has enough of the right architecture that an ImGui-backed future is credible.

The work is not “replace everything.”

The work is:

> stop treating `Canvas` as the hidden canonical runtime object, preserve the existing semantic/editor/shell strengths, and put ImGui underneath a cleaned-up retained node/runtime model.

That is the real migration.
