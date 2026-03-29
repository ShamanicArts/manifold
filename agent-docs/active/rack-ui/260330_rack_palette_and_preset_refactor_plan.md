# Rack Palette + Preset Refactor Plan

## Status

**Status:** Planning / Architecture Definition  
**Date:** 2026-03-30  
**Scope:** Main project rack system, palette/module spawning, preset serialization, future looper/super migration  
**Author:** Pi agent

---

## 1. Why This Document Exists

We now have enough real rack infrastructure in the Main/MidiSynth path that a **palette** is no longer fantasy. The rack has real layout, real patching, real modulation routes, and real DSP graph mutation.

But a **true module palette with arbitrary instancing** is **not** already finished. The codebase is in an in-between state:

- enough modularity exists to make palette work practical
- but several core assumptions are still fixed-rack and single-instance

This document records the current findings from reading the plans and code, and lays out the refactor required to support:

1. a real module palette
2. dynamic module instancing
3. future looper/super behavior migration into the rack
4. preset save/load **later**, on the final pass rather than during the runtime-spawn/delete work

---

## 2. Executive Summary

### 2.1 What is already in place

The following foundations are real and usable today:

- **Node spec metadata** already exists (`rack_midisynth_specs.lua`)
- **Rack layout logic** is generic enough for moving/reflowing nodes (`rack_layout.lua`)
- **Patchbay generation** is spec-driven (`patchbay_generator.lua`)
- **Audio/control routing** already mutates the real DSP graph
- **Modulation endpoint/route infrastructure** exists
- **Parameter metadata** is reusable and already moving toward module/preset/export use
- **Placeholders** already exist visually as future insertion points

### 2.2 What is not yet true

The current system is **not yet a true arbitrary module host** because:

- the rack container still has a **hardcoded list of shell widgets**
- node `id` is currently used as both:
  - the **instance identity**
  - the **module/spec identity**
- patchbay shell/spec mapping is still partially hardcoded
- DSP routing still assumes a fixed set of named modules (`oscillator`, `filter`, `fx1`, `fx2`, `eq`)
- default state/persistence still assumes the current fixed rack shape

### 2.3 Main conclusion

A **real palette-driven rack spawn path** is feasible now.

But the useful first work is **not** persistence. The useful first work is:

1. **runtime deletion support**, starting with placeholders
2. **runtime-safe shell/patchbay cleanup**
3. **palette drag -> rack spawn** using the **existing rack insertion model**

A **real arbitrary-instancing palette** still requires a deliberate identity/runtime refactor first, but the product-facing vertical slice should be built around:

- delete at runtime without the rack shitting itself
- drag from the palette in the utility split area into the rack
- keep canonical startup state unchanged for deterministic testing

### 2.4 Explicit constraints from current product direction

These constraints are now part of the plan:

- **Do not touch save/load or preset persistence until the final pass**
- **Canonical default rack state stays canonical during this refactor**
- **The palette lives in the utility split area**
- **Palette spawn reuses the existing rack insertion/reorder model**
- **Do not invent alternate click-to-open-slot or replace-placeholder UX if the intended UX is drag from palette to rack**

---

## 3. Files Reviewed

### Core rack metadata / structure
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_layout.lua`
- `UserScripts/projects/Main/ui/components/rack_container.lua`
- `UserScripts/projects/Main/ui/components/rack_node_shell.lua`

### Rack runtime / interaction / patchbay
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/lib/ui/rack_layout_manager.lua`
- `UserScripts/projects/Main/lib/ui/rack_controller.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua`
- `UserScripts/projects/Main/lib/ui/update_sync.lua`

### DSP / parameter side
- `UserScripts/projects/Main/lib/rack_audio_router.lua`
- `UserScripts/projects/Main/lib/parameter_binder.lua`
- `UserScripts/projects/Main/lib/fx_definitions.lua`

### Persistence snapshot
- `UserScripts/projects/Main/editor/runtime_state.lua`

### Planning docs
- `agent-docs/260330_modular_rack_audio_patching_working_doc.md`
- `agent-docs/260329_midisynth_architecture_refactor.md`
- `agent-docs/260401_midi_keyboard_dock_rework_plan.md`
- `agent-docs/complete/system/260224_visual_scripting_feasibility.md`

---

## 4. What the Current Rack Already Does Well

## 4.1 Node specs are real metadata, not vibes

`rack_midisynth_specs.lua` already defines a meaningful spec catalog.

Each spec carries things like:

- `id`
- `name`
- `validSizes`
- `ports.inputs`
- `ports.outputs`
- `ports.params`
- `accentColor`
- `meta.componentId`
- `meta.componentRef`
- `meta.behavior`

This is already the backbone of a palette catalog.

### Why this matters

A palette needs a clean source of truth for:

- what modules exist
- how they look
- which ports they expose
- which params they expose
- which component renders them

That source of truth already exists.

---

## 4.2 Rack layout has become generic enough

`rack_layout.lua` and `rack_layout_manager.lua` already provide real layout logic:

- clone/sanitize node instances
- occupancy and collision logic
- row/column placement
- flow ordering
- constrained moves
- size handling
- shell relayout

This is not just a fixed-position view anymore.

### Why this matters

A palette does not need a brand new layout engine. It needs a way to:

- insert nodes
- position them
- resize them
- keep rows sane

Most of that is already here.

---

## 4.3 Patchbay UI is generated from specs

`patchbay_generator.lua` already uses the module spec metadata to create patchbay widgets and register ports.

This means the system already knows how to derive patchbay content from:

- inputs
- outputs
- parameter ports

### Why this matters

Once a module instance exists in the rack, the patchbay generation story is already strong. The main missing part is not patchbay semantics; it is **instance identity and dynamic shell hosting**.

---

## 4.4 The rack now drives real DSP/control behavior

The recent work means rack connections are no longer just pretty wires.

The system already supports:

- real audio graph mutation
- real control-route compilation
- modulation route evaluation
- live route amount updates
- separation of authored vs effective values

### Why this matters

A palette that spawns modules into this rack will be spawning into a real runtime, not a fake editor.

---

## 4.5 Parameter metadata is already moving toward preset/export use

`parameter_binder.lua` explicitly frames the metadata as reusable across:

- registration
- automation
- presets
- palette/export
- future modules

That is good architecture. It means preset/palette work can share the same metadata story instead of inventing another registry.

---

## 5. The Actual Blockers to a Real Palette

These are the real blockers. This is the part not to bullshit ourselves about.

## 5.1 Rack shells are still hardcoded

`rack_container.lua` still declares a fixed set of shell components:

- `adsrShell`
- `oscillatorShell`
- `filterShell`
- `fx1Shell`
- `fx2Shell`
- `eqShell`
- `placeholder1Shell`
- `placeholder2Shell`
- `placeholder3Shell`

`midisynth.lua` also keeps a fixed `RACK_SHELL_LAYOUT` table keyed by those same node IDs.

### Consequence

The system can move existing shells around, but it cannot yet truly:

- spawn a new shell on demand
- destroy a shell on demand
- host an arbitrary number of shells

This is the biggest UI/runtime blocker.

---

## 5.2 `node.id` is overloaded

Right now the code effectively assumes a node record like this:

```lua
{ id = "filter", row = 0, col = 3, ... }
```

But `id` is being used for two separate concepts:

1. **what kind of module it is**
2. **which concrete instance it is**

That is okay for a fixed rack. It falls apart for arbitrary spawning.

### Example of why this breaks

If we want two filters, both cannot just be:

```lua
{ id = "filter" }
```

because:

- connection endpoints use `nodeId`
- patchbay registration uses `nodeId`
- shell mappings use `nodeId`
- spec lookup uses `ctx._rackNodeSpecs[nodeId]`

So duplicate instances become impossible or degenerate into hacks.

### Required future shape

We need to split instance identity from module identity:

```lua
{
  instanceId = "node_17",
  specId = "filter",
  row = 1,
  col = 2,
  w = 2,
  h = 1,
  sizeKey = "1x2",
  meta = { ... }
}
```

This is the core refactor.

---

## 5.3 Patchbay runtime still has hardcoded shell/spec assumptions

`patchbay_generator.lua` still contains fixed assumptions like:

- `SHELL_TO_SPEC_ID`
- a hardcoded list of shell IDs in `syncPatchViewMode()`
- hardcoded shell/component name conventions for the current rack

### Consequence

Patchbay content generation itself is spec-driven, but shell lifecycle is not. The patchbay can render a module **inside a shell** once you give it one. It does not yet own a dynamic list of shells.

---

## 5.4 DSP audio routing is still fixed-rack specific

`rack_audio_router.lua` still assumes a canonical named chain:

- oscillator
- filter
- fx1
- fx2
- eq
- output

That was the correct vertical slice to prove real routing.

But it is not yet a generic per-instance rack router.

### Consequence

A future arbitrary-instancing rack needs a routing layer that works off:

- instance records
- instance port metadata
- per-instance DSP node bindings

not just fixed symbolic names.

---

## 5.5 Persistence still assumes a fixed rack shape

`runtime_state.lua` currently serializes the rack in a fixed-rack-flavored way.

That is acceptable for now and should stay that way during the runtime lifecycle work.

### Consequence

We should **not** touch save/load during the first runtime spawn/delete phases.

Persistence still matters architecturally, but it is a **final-pass concern** after:

- delete is stable
- spawn is stable
- identity/runtime cleanup is stable

At that point preset save/load should evolve toward saving:

- structural rack state
- connections
- module instance metadata
- per-module parameter state
- palette/spawned module choices

not just “the current fixed set of known nodes plus some params”.

---

## 6. What This Means for Presets

Preset work is explicitly **deferred until the final pass**.

That said, if we do the palette/instancing refactor correctly, preset work gets much cleaner when we finally touch it.

## 6.1 Current fixed-rack preset mindset

Right now the implicit mindset is:

- there is one oscillator
- one filter
- one FX1
- one FX2
- one EQ
- placeholders are decorative future slots

So saved state tends to be “parameter values for the known graph”.

## 6.2 Future preset mindset

A future rack-native preset should describe **a patch**, not just some slider values.

At minimum it needs:

```lua
{
  version = 1,
  modules = {
    {
      instanceId = "node_1",
      specId = "adsr",
      row = 0,
      col = 0,
      w = 1,
      h = 1,
      sizeKey = "1x1",
      state = { ... authored params ... },
    },
    {
      instanceId = "node_2",
      specId = "filter",
      row = 0,
      col = 2,
      w = 2,
      h = 1,
      sizeKey = "1x2",
      state = { cutoff = 2400, resonance = 0.8 },
    },
  },
  connections = {
    {
      kind = "audio",
      from = { nodeId = "node_3", portId = "out" },
      to = { nodeId = "node_2", portId = "in" },
    },
    {
      kind = "control",
      from = { nodeId = "node_1", portId = "env" },
      to = { nodeId = "node_2", portId = "cutoff" },
      amount = 0.6,
    },
  },
}
```

### Why this matters

This single representation can back:

- save/load
- undo/redo
- palette spawning
- module duplication
- migration from fixed rack to open rack
- future export/hosted-module work

---

## 7. Recommended Refactor Direction

The right refactor is **not** “build a palette UI and pray”.

The right refactor is:

1. make **runtime deletion** safe first
2. separate **instance identity** from **spec identity** enough to support real dynamic nodes
3. make shell hosting / patchbay cleanup dynamic
4. add **palette drag -> rack spawn** using the **existing insertion model**
5. leave persistence/presets for the final pass

---

## 8. Proposed Target Architecture

## 8.1 Node instance model

Replace the current implicit model:

```lua
{ id = "filter", ... }
```

with:

```lua
{
  instanceId = "node_17",
  specId = "filter",
  row = 1,
  col = 2,
  w = 2,
  h = 1,
  sizeKey = "1x2",
  meta = {
    title = "Filter",
    variant = nil,
  },
}
```

### Rules

- `instanceId` is unique in the rack
- `specId` points to the catalog entry in `ctx._rackNodeSpecs`
- all connections reference `instanceId`
- all patchbay registrations reference `instanceId`
- all UI shell bookkeeping references `instanceId`
- DSP bindings map from `instanceId` to live runtime objects

---

## 8.2 Module catalog model

Keep `rack_midisynth_specs.lua` as the canonical catalog, but make the usage explicit:

- `specId` → stable module type key
- spec metadata → palette/discovery/render contract
- instance state → user patch record

This is already close to how the code wants to behave.

---

## 8.3 Dynamic shell hosting

Instead of hardcoding `adsrShell`, `filterShell`, etc. directly in `rack_container.lua`, the rack container should become:

- a stable outer container
- stable row panels / rails / overlay host
- a dynamic child area for node shells

The runtime should instantiate a shell per active module instance.

### Shell creation inputs

Each shell can be created from:

- `instanceId`
- `specId`
- spec metadata
- node size/layout info
- optional instance-local title/variant state

### Why this matters

Once shell creation is dynamic, the rest of the rack infrastructure becomes much more honest. Right now it is pretending to be generic while still anchored to a static host tree.

---

## 8.4 Patchbay keyed by instanceId

Patchbay entries currently use spec-oriented IDs in several places. That should change.

Every registered patchbay endpoint should carry:

- `instanceId`
- `specId`
- `portId`
- `direction`
- `portType`
- `widget`

This lets us distinguish:

- two filter instances
- two FX slots
- a looper return and a vocal FX bridge even if they share visual shell code

---

## 8.5 DSP module registry keyed by instanceId

The DSP side should eventually expose/track live module bindings like:

```lua
ctx._rackRuntime = {
  modules = {
    ["node_17"] = {
      specId = "filter",
      inputNodes = {...},
      outputNodes = {...},
      params = {...},
    }
  }
}
```

This does **not** mean every module must immediately be fully dynamic. But the registry model should move in that direction.

---

## 8.6 Structural rack patch format

Make the rack’s saved form a real data model:

- `schemaVersion`
- `modules[]`
- `connections[]`
- optional rack-level metadata
- optional utility dock / view metadata separate from sonic state

### Important separation

Do **not** mix together:

- layout/editor state
- sonic patch state

Some UI state can still be saved, but patch presets should focus first on reproducible sound/routing/module structure.

---

## 9. Recommended Phases

## Phase 0 — Documentation + design lock

Goal: lock the runtime slice and stop inventing the wrong UX.

### Deliverables
- this document
- agreed naming (`instanceId`, `specId`)
- agreed rule that **save/load is deferred until the final pass**
- agreed rule that **canonical startup state remains canonical**
- agreed rule that the **palette lives in the utility split area**
- agreed rule that palette spawn **reuses the existing rack insertion/reorder model**

---

## Phase 1 — Runtime deletion support

Goal: prove that rack nodes can be deleted at runtime without the rack shitting itself.

### Required first proof
- deletion support for **placeholders at minimum**

### Changes
- add delete action path for rack nodes
- remove deleted node from active rack state
- clean up connections touching the deleted node
- clean up patchbay registrations / runtime widgets / wire hit regions for the deleted node
- rerun the existing rack layout/reflow path on the remaining nodes
- keep canonical startup unchanged; do not persist deletion

### Success criteria
- a placeholder can be deleted from the running rack
- the rack remains interactive and visually coherent
- patch view and perf view still work
- no stale wire hits / port registry entries / zombie shell state remain
- repeated delete operations do not crash or corrupt the runtime

---

## Phase 2 — Identity refactor for dynamic nodes

Goal: stop overloading `id` enough to support real runtime-spawned nodes.

### Changes
- introduce `instanceId` and `specId` to rack node records
- update `RackLayout.makeNodeInstance()` and related helpers
- update connection descriptors and runtime helpers to reference instance IDs
- update `ctx._rackNodeSpecs` usage to look up by `specId`
- update helpers like `firstAudioPortId()` and related lookups to resolve spec information without assuming `node.id == specId`

### Success criteria
- existing fixed rack still works
- deleted/runtime-spawned nodes can have stable distinct identity
- code no longer assumes `node.id` means both type and instance

---

## Phase 3 — Dynamic shell hosting + patchbay/runtime cleanup

Goal: make runtime node lifecycle honest.

### Changes
- refactor shell hosting so node shells can be created/removed from runtime state rather than existing only as a fixed hardcoded list
- make shell/widget lookup keyed by `instanceId`
- replace `SHELL_TO_SPEC_ID` assumptions
- make port registry store `instanceId` + `specId`
- update wire hit testing / popovers / drag/drop bookkeeping to use `instanceId`
- ensure deletion cleanup tears down shell content, patchbay content, and hit regions cleanly

### Success criteria
- shells can be deleted/removed from runtime without corrupting the rack
- patch/perf mode switching still works after delete
- patchbay remains stable after delete and later spawn

---

## Phase 4 — Palette drag -> rack spawn

Goal: expose real user-facing spawn using the intended UX.

### Required UX
- palette lives in the **utility split area**
- user drags from palette into the rack
- rack spawn uses the **same insertion model already used for rack drag/reorder**

### Changes
- build palette UI from `ctx._rackNodeSpecs`
- add palette drag source state
- connect palette drag state into the existing rack insertion targeting logic
- on drop, create a runtime node instance and insert it into rack state
- ensure spawned module renders in both perf and patch views
- keep startup canonical and non-persistent

### Success criteria
- user can drag at least one module from the utility split palette into the rack
- rack insertion targeting behaves like existing rack insertion/reorder targeting
- spawned module appears correctly and participates in patchbay/runtime behavior
- repeated spawn/delete cycles remain stable

---

## Phase 5 — Broader instancing and DSP generalization

Goal: extend beyond the first runtime lifecycle slice.

### Changes
- support a wider range of spawnable module types
- generalize more of the DSP/runtime side away from the current fixed named-module assumptions
- expand arbitrary instancing only after spawn/delete fundamentals are solid

---

## Phase 6 — Structural preset/persistence model (final pass)

Goal: touch save/load only after runtime lifecycle work is proven.

### Changes
- define serialized patch schema version
- persist modules by `instanceId/specId`
- persist connections structurally
- persist per-module param/authored state
- add migration layer from current runtime_state format

### Success criteria
- load/save round-trips a dynamic rack structure
- old fixed-rack states can be migrated
- testing remains sane because this happens after spawn/delete behavior is already stable

---

## 10. What Not To Do

These are the bad ideas.

## 10.1 Do not bolt palette UI onto the current fixed shell map

That would create a fake palette where the UI pretends modules are arbitrary but the runtime still only knows about nine hardcoded shells.

That is bullshit and will rot immediately.

## 10.2 Do not keep using `id` as both type and instance

This is the most important architectural no-go.

If we skip this split, presets, duplication, patchbay routing, and dynamic spawning all become cursed special-case code.

## 10.3 Do not overgeneralize the DSP graph first

The fixed-chain audio router was the correct proof slice. We should not now panic and rewrite the whole DSP scheduler before the identity/persistence model is in place.

## 10.4 Do not touch save/load early just because the future model is obvious

The future preset model matters, but touching save/load before runtime delete/spawn is stable will make testing a fucking nightmare.

Keep canonical startup canonical until the final persistence pass.

## 10.5 Do not mix editor-only state with sonic patch state without intent

Keyboard size, utility dock view mode, current patch tab page, etc. can be saved if useful, but they should not contaminate the core definition of a rack patch.

---

## 11. Practical Implications for Looper / Super Migration

This refactor is not just about palette eye candy.

It is the architectural bridge for moving the rest of Main into the rack model.

### Why it matters for looper/super work

We expect to eventually port behaviors and audio paths from:

- Looper
- Donut / Super pages

into the rack-native architecture.

That migration will want modules like:

- host input
- vocal FX
- looper layer input
- looper layer return
- monitor/output bridge
- utility analyzers / scopes

Those are exactly the kinds of things that benefit from:

- instance-safe identities
- spec-driven UI
- preset-serializable module graphs
- palette discoverability

So this refactor is infrastructure for the larger project direction, not a side quest.

---

## 12. Proposed Immediate Next Steps

1. **Freeze the runtime slice**
   - phase 1 is deletion support first
   - save/load is explicitly out until the final pass
   - palette UX is drag from utility split area into the rack
   - rack spawn reuses the existing insertion model

2. **Implement deletion support first**
   - start with placeholders
   - prove cleanup + relayout + patchbay stability

3. **Refactor identity/runtime bookkeeping enough for dynamic nodes**
   - `instanceId/specId`
   - instance-aware patchbay/runtime cleanup

4. **Implement real palette drag source in the utility split area**
   - wire it into the existing rack insertion targeting path

5. **Only touch persistence on the final pass**
   - after repeated spawn/delete cycles are stable

---

## 13. Bottom Line

The rack is finally modular enough that palette work is worth planning seriously.

But the current code is still sitting on one crucial fixed-rack assumption:

> the node type and the node instance are the same thing

That assumption must die before we can have a clean palette, clean presets, and clean future module migration.

### Final recommendation

Proceed with a focused refactor in this order:

1. **runtime deletion support first**
2. **instance identity split for dynamic nodes**
3. **dynamic shell/patchbay cleanup**
4. **palette drag -> rack spawn using the existing insertion model**
5. **broader DSP generalization as needed**
6. **structural preset model on the final pass**

That is the non-stupid route.
