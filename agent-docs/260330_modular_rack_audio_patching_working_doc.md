# Modular Rack Audio Patching Working Document

## Status

**Status:** Working design / implementation doc  
**Date:** 2026-03-30  
**Audience:** Someone new to the codebase who needs enough context to implement real rack audio patching  
**Scope:** Current rack/patchbay state, what already exists in Manifold core, what is missing, recommended implementation strategy, alternatives, risks, milestones, and long-term vision

## Progress Update — Slice 1 Implemented

The first vertical slice is now proven working.

### Completed
- Real **audible EQ bypass/insert** via runtime DSP graph mutation
- UI patch view and DSP route state are now linked for the EQ tail route
- Hidden route param `/midi/synth/rack/audio/eqRouteMode` drives DSP graph rebuild/rebind
- DSP host now recompiles/swaps graph runtime on rack-audio route changes
- Right-side row terminal now behaves as a real visual output target instead of dead space
- Row terminals are row-semantic rather than incorrectly belonging to a single node
- **Ctrl-click on ports/rails** performs hard disconnect
- **Shift-click on ports/rails** performs splice/bypass of the owning node
- Placeholder modules now expose passthrough audio `in`/`out` ports
- Rack wire state is intentionally **not persisted yet** so testing remains deterministic

### Proven behavior
- Visually bypassing EQ now also bypasses EQ **audibly**
- Re-inserting EQ restores EQ audibly
- Runtime graph mutation is working in the maintained Main project path, not just in theory

### Important current boundary
This is still a constrained first slice, not a generalized modular graph system.
The proven real path is the fixed-chain audio routing workflow, starting with EQ-tail mutation and node splice semantics through the current rack model.

---

## 1. Executive Summary

We already have more infrastructure than it might look like at first glance.

The important correction is this:

## The core DSP graph mutation layer already exists in Manifold.

This is not speculative. The engine already supports:

- `ctx.graph.connect(...)`
- `ctx.graph.disconnect(...)`
- `ctx.graph.disconnectAll(...)`

via `PrimitiveGraph` in core.

That means the next problem is **not** “invent dynamic graph mutation.”
The real problem is:

- bind the **rack/patchbay UI connection model**
- to the **actual DSP graph**
- in a way that is incremental, debuggable, and compatible with the longer-term modular vision

The short-term opportunity is very real:

## We are close to making the existing rack patch actual audio.

The recommended first milestone is:

- prove real audio routing with a simple existing chain node
- start with **EQ bypass/reroute**
- when EQ is disconnected, route upstream directly to output
- when EQ is connected, restore the normal path

That will prove that:

- rack wires are no longer only decorative/editor state
- the patchbay model can drive real DSP graph mutation
- the codebase is ready for incremental audio patchability across the existing known rack modules

This document covers the whole vision, but the practical recommendation is:

## Start with audio routing for the current fixed rack modules. Defer modulation engine work until audio patching is real.

That means:

- do **not** block on modulation
- do **not** block on full palette/module hosting before proving the first audio path
- do **not** overbuild a generalized matrix before the first real chain reroute exists

---

## 2. Why This Matters

The long-term vision discussed in planning is larger than a prettier rack UI.

The actual target is:

- draggable rack modules
- patchable audio routing
- patchable modulation routing
- module palette / instantiation
- reusable and eventually hostable modules/projects
- standalone/exportable modules built on the same runtime

The current refactors matter because they made that vision plausible instead of fantasy.

They gave us:

- clearer DSP ownership boundaries
- clearer rack/patchbay UI boundaries
- parameter metadata and node spec metadata
- separation between patchbay generation, patchbay runtime, and rack controller glue
- enough modularity to stop fighting the god object before every change

The next important step is to stop treating the rack wires as visual fiction and start making them mutate real DSP routing.

---

## 3. The Big Picture Vision

## 3.1 Near-term vision

Make the **existing current rack** patch actual audio.

That means existing known nodes such as:

- oscillator
- filter
- fx1
- fx2
- eq
- output / sink

can be:

- connected
- disconnected
- rerouted in constrained ways
- saved/restored as actual routing state

This is not the same thing as “fully generalized modular synth platform,” but it is the correct first real milestone.

## 3.2 Mid-term vision

Add:

- module insertion/removal
- module palette
- multiple instances of modules
- proper persistence of rack connection state
- more generalized audio routing semantics

## 3.3 Long-term vision

Add:

- modulation engine
- generalized port typing and rules
- hosted child-project modules
- reusable module/project contracts
- standalone/exportable module projects that can also be hosted in composition projects like Main

This doc is mostly about the **audio-first bridge** from where we are now to that larger vision.

---

## 4. Critical Correction: What Already Exists in Core

This is the most important thing to understand if you are new to the task.

## 4.1 PrimitiveGraph already supports mutation

Relevant core files:

- `manifold/primitives/scripting/PrimitiveGraph.h`
- `manifold/primitives/scripting/PrimitiveGraph.cpp`

Key API already present:

- `connect(from, outputIndex, to, inputIndex)`
- `disconnect(from, outputIndex, to, inputIndex)`
- `disconnectAll(node)`
- `validateConnection(...)`
- cycle detection / topological rebuild support

This matters because we do **not** need to invent a fake bypass-only routing mechanism just to prove the rack concept.
We can use the actual graph mutation engine Manifold already exposes.

## 4.2 DspLiveScripting proves the runtime is already meant for dynamic graph work

Relevant files:

- `UserScripts/projects/DspLiveScripting/manifold.project.json5`
- `UserScripts/projects/DspLiveScripting/dsp/default_dsp.lua`
- `UserScripts/projects/DspLiveScripting/ui/behaviors/main.lua`

That project exists specifically as a live DSP scripting environment and is strong evidence that runtime graph mutation is already part of Manifold’s intended core capabilities.

So the architectural question is no longer “is dynamic graph mutation a thing in Manifold?”
It is.

The question is now:

- how do we connect the rack editor’s connection model to real DSP mutation cleanly?

---

## 5. Current Rack / Patchbay State

The rack UI is not empty scaffolding. A lot is already there.

## 5.1 Rack layout and node metadata

Relevant files:

- `UserScripts/projects/Main/ui/behaviors/rack_layout.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`

Current capabilities:

- rack state model exists
- nodes are draggable/movable
- node specs exist with ports and metadata
- default rack state exists
- default connection descriptors exist
- port metadata includes types and parameter mapping hints

## 5.2 Patchbay generation and runtime coordination

Relevant files:

- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_wire_layer.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`

Current capabilities:

- patchbay widgets are generated from node specs
- patchbay pages are instantiated dynamically
- ports are registered into a runtime registry
- wire overlay is rendered from registered ports and connection descriptors
- drag-to-connect interaction exists
- delete-on-port interaction exists
- rack edge terminals and relay rails exist visually

## 5.3 What current wire interactions actually do

Right now the wire system mostly manipulates **UI-side connection descriptors**.

Connections live in:

- `ctx._rackConnections`

Default connections are created from:

- `MidiSynthRackSpecs.defaultConnections()`

New drag-created wires are currently added by `RackWireLayer.finishWireDrag(...)` with metadata like:

- `pending = true`
- `source = "ui-dummy-wire"`

This is the crucial current limitation:

## Current wires are largely editor/runtime-UI state, not authoritative DSP routing state.

That is the gap this task needs to close.

---

## 6. Current Fixed Chain Reality

Today MidiSynth’s maintained DSP path is still effectively a known fixed chain, even though the rack UI is more flexible visually.

At a high level the path is conceptually like:

- synthesis / voice mix
- filter
- fx1
- fx2
- eq
- spectrum / out
- optional send into Main looper integration

The exact node ownership now lives across the refactored DSP modules, but the important point is:

## The rack UI currently represents a chain that is mostly still pre-wired in script.

That means the first real audio patching effort is not “invent freeform audio modularity from nothing.”
It is:

- expose and control that existing chain as a mutable routing graph

That is a much more tractable first target.

---

## 7. What Is Real Already vs What Is Still Missing

## 7.1 Already real

- runtime DSP graph mutation in core
- draggable rack modules
- node specs with ports/params metadata
- patchbay widget generation
- patchbay runtime port registry
- visual wires
- wire drag/drop interaction
- UI-side connection model
- refactored DSP/UI architecture that is now modular enough to work in

## 7.2 Still missing for real rack audio patching

- authoritative mapping from rack ports to real DSP primitive nodes/buses
- canonical ownership of connection state on the DSP side
- a bridge from UI connection edits to DSP graph mutation
- constrained routing rules for existing chain modules
- persistence for rack audio connections
- sync/reconciliation between UI connection state and actual DSP graph state

## 7.3 Still intentionally deferred

- generalized modulation engine
- arbitrary multi-rate modulation semantics
- full module palette with arbitrary instancing
- hosted-project module contract for the rack as a general system

These are important, but they are not the first thing to build.

---

## 8. Why Audio First Is the Right Strategy

The recommended implementation direction is:

## Make audio routing real first. Do modulation later.

Why:

### 8.1 It proves the rack is not decorative
If audio rerouting works, the rack becomes a real instrument interface instead of a visual mockup.

### 8.2 It uses the engine capability we already have
Graph mutation already exists. We should exploit that now.

### 8.3 It keeps scope sane
A modulation engine is not just “more wires.”
It needs:

- source semantics
- target semantics
- scale/offset/polarity
- fan-in / fan-out rules
- smoothing
- rate domain decisions
- aggregation behavior

That is a separate design pass.

### 8.4 It makes later modulation design more grounded
Once audio patching is real, the eventual modulation engine can use the same rack/connection model instead of being designed in the abstract.

---

## 9. Recommended First Milestone

## 9.1 EQ disconnect / reconnect proof

This is the suggested first real vertical slice.

Goal:

### When EQ is connected
The chain behaves normally:
- `fx2 -> eq -> output`

### When EQ is disconnected
Audio reroutes around it:
- `fx2 -> output`

### When EQ is reconnected
The normal path is restored:
- `fx2 -> eq -> output`

This proves:

- UI connection state can drive DSP graph mutation
- a rack node can leave/re-enter the real audio path
- fallback routing can be made deterministic
- the patchbay has become functionally meaningful

## 9.2 Why EQ is the right first target

- late in the chain
- small blast radius
- easy to hear
- easy to reason about
- doesn’t immediately complicate upstream voice/mix concerns
- creates a clean bypass-around-node pattern we can reuse

---

## 10. Codebase Map for This Task

If you are new to the codebase, these are the most relevant files.

## 10.1 Core graph mutation

- `manifold/primitives/scripting/PrimitiveGraph.h`
- `manifold/primitives/scripting/PrimitiveGraph.cpp`

Purpose:
- low-level connect/disconnect behavior
- cycle validation
- runtime recompilation/preparation behavior

## 10.2 Existing maintained MidiSynth DSP

- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `UserScripts/projects/Main/lib/sample_synth.lua`
- `UserScripts/projects/Main/lib/fx_slot.lua`
- `UserScripts/projects/Main/lib/parameter_binder.lua`

Purpose:
- current source of truth for DSP behavior
- current known chain ownership
- parameter schema/dispatch

## 10.3 Rack layout and metadata

- `UserScripts/projects/Main/ui/behaviors/rack_layout.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`

Purpose:
- node specs
- connection descriptors
- rack state
- layout / occupancy / node instance model

## 10.4 Patchbay and wire UI

- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_wire_layer.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`

Purpose:
- dynamic patchbay UI generation
- port registration
- wire drag/drop
- UI connection model
- rack state controller glue

## 10.5 Reference live-graph environment

- `UserScripts/projects/DspLiveScripting/`

Purpose:
- proof that dynamic graph mutation is part of Manifold’s intended runtime model

---

## 11. The Central Architectural Question

The real design problem is:

## Where should authoritative rack audio routing state live?

There are several viable approaches.

---

## 12. Approach Options

## 12.1 Option A — UI owns connection edits, DSP owns actual route rebuild (recommended first pass)

### Model
- UI continues to edit a connection list / graph description
- that graph description is serialized into a DSP-consumable state representation
- DSP receives connection state changes
- DSP mutates `ctx.graph` accordingly
- DSP becomes authoritative for actual audio routing

### Why it is good
- fits current code split: UI and DSP are already separate runtimes
- preserves the patchbay as an editor front-end
- DSP remains the only place that actually mutates audio graph state
- easy to test and reason about
- does not require inventing a whole new runtime bridge model first

### What it needs
- a connection serialization format
- a parameter or state path for connection graph data
- DSP-side route application code
- UI↔DSP sync strategy

### Downsides
- requires designing a representation for connection state
- may be slightly clunky if every little drag change becomes a full route-apply event
- needs careful sync so UI and DSP don’t drift

### Recommendation
This is the best first approach for the current codebase.

---

## 12.2 Option B — Direct UI-to-DSP command bridge for connect/disconnect operations

### Model
- UI emits explicit commands like:
  - connect port A to port B
  - disconnect route X
- DSP applies them incrementally to the graph

### Why it is good
- more immediate and command-like
- avoids rebuilding the whole route graph for every change

### Downsides
- requires a command transport between UI and DSP runtimes
- harder to recover from drift/state mismatch
- harder to persist and reconstruct unless there is still a canonical graph model somewhere

### Recommendation
Useful later, but not the best first pass unless a very clean command channel already exists for this exact use case.

---

## 12.3 Option C — Rebuild routing from a canonical DSP-side chain/graph model on every relevant change

### Model
- DSP owns a canonical audio routing model
- UI edits high-level desired connections
- DSP recomputes the actual chain and reconnects as needed

### Why it is good
- authoritative source of truth lives where audio graph mutation happens
- easier to validate constrained routing rules
- good for a fixed known chain of modules

### Downsides
- requires a clean internal route model on DSP side
- might reconnect more than strictly necessary

### Recommendation
Strongly compatible with Option A. In practice, Option A + C together are likely the right first implementation.

---

## 12.4 Option D — Full generalized modular routing engine first

### Model
- build a fully generic graph/runtime system now
- arbitrary modules, arbitrary instances, arbitrary routes
- then bind rack UI to that

### Why it is tempting
- sounds architecturally pure

### Why it is a bad first move
- huge scope
- delays the first real proof
- likely to create overbuilt abstractions without enough empirical pressure

### Recommendation
Do not do this first.

---

## 13. Recommended Strategy

## 13.1 Recommended first-pass architecture

Use a hybrid of Option A and Option C:

### UI side
- patchbay edits a connection list
- connection list becomes a canonical serialized rack audio state
- UI sends that state to DSP

### DSP side
- DSP owns a route application layer
- DSP validates the desired route graph against supported rules
- DSP applies connect/disconnect operations to `ctx.graph`
- DSP can re-derive fallback chain routes deterministically

This is the simplest robust path for the first real milestone.

---

## 14. Important Near-Term Scope Constraint

## For the first implementation, constrain the problem to existing known chain modules.

That means the first patchable audio system does **not** need to support:

- arbitrary new module instances
- multiple EQs
- multiple filters
- arbitrary graph fan-out
- arbitrary multi-input audio mixing behaviors

Instead, first support the current known set:

- oscillator / synth output
- filter
- fx1
- fx2
- eq
- output

And define routing rules for those only.

This keeps the system small enough to prove quickly.

---

## 15. Proposed Data Model Changes

## 15.1 Current UI connection descriptors

Connections currently look conceptually like:

```lua
{
  id = "fx2_to_eq",
  kind = "audio",
  from = { nodeId = "fx2", portId = "out" },
  to = { nodeId = "eq", portId = "in" },
  meta = { source = "fixed-dsp-chain" }
}
```

This is a decent start, but it is currently mostly editor state.

## 15.2 What is needed

We need a canonical connection representation for audio routing that can be:

- edited by UI
- validated by DSP
- persisted/reloaded
- applied to the real graph

Recommended fields:

```lua
{
  id = "fx2_to_eq",
  kind = "audio",
  from = { nodeId = "fx2", portId = "out" },
  to = { nodeId = "eq", portId = "in" },
  enabled = true,
  meta = {
    source = "user" or "default" or "system",
    version = 1,
  }
}
```

### Important note
For the first pass, do not overload this with modulation semantics.
Keep it clean and audio-specific.

## 15.3 DSP-side route graph model

DSP should probably not apply UI descriptors directly one-by-one as its only internal representation.

Recommended:
- parse connection descriptors
- build an internal route model
- validate it
- derive actual connect/disconnect operations from it

That route model can be tiny and fixed-chain-aware at first.

---

## 16. Mapping Rack Ports to Actual DSP Primitives

This is the most concrete missing system.

A rack connection like:

- `fx2.out -> eq.in`

must resolve to actual DSP nodes and bus indices.

That means the DSP side needs a mapping table like:

```lua
{
  fx2 = {
    out = { node = fx2Slot.output, outputIndex = 0 }
  },
  eq = {
    in = { node = eq8, inputIndex = 0 },
    out = { node = eq8, outputIndex = 0 }
  },
  output = {
    in = { node = out, inputIndex = 0 }
  }
}
```

The exact structure can differ, but the concept is required.

## 16.1 Why this mapping layer matters

Without it, the rack is just named ports and pretty wires.
With it, the rack ports become concrete graph mutation targets.

## 16.2 Where it should live

Recommended:
- DSP side, near the maintained chain wiring
- likely as a dedicated routing helper/module rather than inline in the already-large integration file

Potential module names:
- `lib/rack_audio_router.lua`
- `lib/rack_patch_runtime.lua`
- `lib/project_audio_routes.lua`

---

## 17. First Real Routing Policy

The routing rules should be constrained and explicit at first.

## 17.1 First-pass assumptions

For audio routing in the current chain:

- one upstream audio source per node input
- one primary downstream continuation for chain nodes
- no arbitrary feedback cycles
- no arbitrary multi-destination fan-out yet
- no arbitrary summing network yet
- no cross-domain audio/control routing yet

## 17.2 First-pass fallback behavior

If a chain node is removed/disconnected, the route model should reconnect around it.

Example:

### Normal
- `fx2 -> eq -> out`

### EQ removed
- `fx2 -> out`

### FX2 removed too
- `fx1 -> out`

### FX1 removed too
- `filter -> out`

This is not the final generalized graph system, but it is a very strong first practical milestone.

## 17.3 Why fallback routing is important

Without fallback routing, disconnecting a node just gives silence or a broken graph.
The goal is a patchable signal path, not a trapdoor.

---

## 18. Persistence and State Ownership

This is currently a gap.

### Important current limitation
`ctx._rackConnections` appears to be runtime UI state and is not yet clearly serialized/restored like `rackNodes` and other rack state.

That means audio patching cannot be considered real until connection state is persisted.

## 18.1 What needs to be persisted

At minimum:
- rack connection descriptors
- version/format marker if needed

## 18.2 Possible persistence strategies

### Option A: store in UI runtime state blob
Pros:
- easy to add next to current rack state save/load
Cons:
- still UI-owned unless forwarded to DSP authoritatively

### Option B: expose as DSP param/state path
Pros:
- cleaner source of truth for audio graph state
- easier to reason about DSP restore/reload
Cons:
- requires designing path/payload format

### Recommendation
Use a canonical shared representation and make DSP authoritative for applied audio routes.
UI can still persist/edit, but DSP should not be a passive afterthought.

---

## 19. UI ↔ DSP Synchronization Options

## 19.1 Serialized connection state param/path (recommended)

Example conceptually:
- `/midi/synth/rack/audioConnections`

Payload could be:
- JSON string
- Lua table serialization string
- compact custom format

### Pros
- simple
- explicit
- replayable
- easy to diff/debug

### Cons
- needs parsing/validation

## 19.2 Incremental operation queue

Example conceptually:
- connect op
- disconnect op
- reorder op

### Pros
- efficient
- event-like

### Cons
- harder to recover state from
- harder to persist cleanly
- easier to drift if a command is missed

### Recommendation
Start with canonical serialized state, not only incremental ops.

---

## 20. Detailed First Milestone Plan: EQ Proof of Concept

## 20.1 Functional objective

Demonstrate that the rack can mutate the actual audio path for EQ.

## 20.2 Required behavior

### Initial state
- `fx2 -> eq -> out`
- UI shows that connection
- DSP graph reflects that connection

### After disconnecting EQ from output chain
- `fx2 -> out`
- UI updates wire state
- DSP disconnects `fx2 -> eq` and/or `eq -> out` as needed
- DSP reconnects upstream fallback to `out`
- audible output remains alive

### After reconnecting EQ
- `fx2 -> eq -> out`
- DSP restores canonical path through EQ

## 20.3 Implementation steps

### Step 1
Add canonical rack audio connection serialization/persistence.

### Step 2
Add DSP-side route mapping for current chain nodes:
- `filter`
- `fx1`
- `fx2`
- `eq`
- `out`

### Step 3
Implement a DSP route application helper that:
- clears relevant chain connections
- computes desired final chain
- reconnects deterministically

### Step 4
Drive that helper from connection state changes.

### Step 5
Verify audibly and with diagnostics.

---

## 21. Possible Implementation Styles for Route Application

## 21.1 Style A — Tear down and rebuild the relevant chain section each time

### Model
When routing changes:
- disconnect all relevant chain links
- rebuild from desired connection graph

### Pros
- simplest to reason about
- fewer stale-connection edge cases
- good for the constrained first pass

### Cons
- potentially blunt
- may be less efficient than incremental updates
- can produce temporary glitches if not handled carefully

### Recommendation
This is probably the best first-pass style.

## 21.2 Style B — Incremental graph edits only

### Model
Compute exact delta:
- disconnect only removed edges
- connect only new edges

### Pros
- elegant
- potentially lower churn

### Cons
- more bookkeeping
- easier to get wrong
- stale route bugs become more likely early on

### Recommendation
Good later, not necessary first.

---

## 22. Testing Strategy

## 22.1 Manual audible tests

For the first milestone, manual audible tests are essential.

Test cases:
- disconnect EQ and confirm signal still passes
- reconnect EQ and confirm EQ is back in path
- change EQ params and confirm they matter only when EQ is in path
- save/reload and verify connection state persists
- switch view modes and ensure UI does not drift from DSP state

## 22.2 Diagnostic tests

Use existing observability where possible:
- IPC/EVAL
- graph/node diagnostics if exposed
- runtime state inspection
- wire state inspection

## 22.3 Failure cases to test

- duplicate connects
- disconnecting an already disconnected edge
- reconnecting after repeated drag/delete actions
- reconnect after DSP reload
- reconnect after UI reload/state restore

## 22.4 Important safety rule

The first implementation should fail **deterministically**, not mysteriously.

If an unsupported route is requested, it should:
- reject it clearly, or
- coerce it into a known supported fallback

Do not allow silent half-broken graph states.

---

## 23. Risks and Pitfalls

## 23.1 UI and DSP state drift

If UI thinks a connection exists but DSP did not apply it, the rack becomes a liar.
This is one of the biggest risks.

Mitigation:
- canonical route state
- explicit route apply/rebuild step
- route validation and logging

## 23.2 Hidden chain assumptions in existing DSP

Even after refactors, some chain assumptions may still be implicit.
Disconnecting nodes may expose these.

Mitigation:
- start at the end of chain with EQ
- expand outward incrementally

## 23.3 Persistence bugs

If connection state is not saved/restored, the feature will feel fake.

Mitigation:
- persistence is part of the milestone, not “later polish”.

## 23.4 Over-generalizing too soon

Trying to solve palette + arbitrary instancing + modulation + audio all at once is how this turns into a swamp.

Mitigation:
- constrain first pass to current known chain modules
- audio first
- modulation later

## 23.5 Clicks/glitches during reconnect

Runtime graph changes may cause audible discontinuities.

Mitigation:
- constrain first implementation
- understand when graph `prepared_` invalidation/prepare behavior is triggered
- test reconnect behavior under live signal

---

## 24. Recommended Milestones Beyond EQ

## Milestone 1
**EQ bypass/reroute proof**

## Milestone 2
**Support FX2 bypass/reroute**

Examples:
- `fx1 -> fx2 -> eq -> out`
- `fx1 -> eq -> out`

## Milestone 3
**Support FX1 bypass/reroute**

Examples:
- `filter -> fx1 -> fx2 -> eq -> out`
- `filter -> fx2 -> eq -> out`

## Milestone 4
**Support filter bypass/reroute**

Examples:
- synth output directly into FX1 / FX2 / EQ / out depending on current chain

## Milestone 5
**Persist full audio connection state robustly**

## Milestone 6
**Refactor routing logic into a dedicated module**

At this point it likely deserves a proper module rather than living inside large behavior/integration files.

## Milestone 7
**Only then begin modulation engine design**

---

## 25. Relationship to the Larger Hosted-Project Vision

This work is compatible with the larger architecture direction where:

- MidiSynth becomes a first-class project
- Main hosts MidiSynth rather than owning it
- modules/projects expose ports/surfaces/contracts

In fact, making current rack audio patching real is a strong intermediate step toward that future.

Why:
- it forces explicit port thinking
- it forces authoritative route state
- it forces better module contracts
- it surfaces what is currently instrument logic vs host composition logic

But do not wait for the full hosted-project system before proving audio patching in the current rack.

This task can and should move sooner.

---

## 26. What Not to Do

These are bad ideas for the first pass.

## 26.1 Do not block on modulation engine design
That is a separate system.

## 26.2 Do not try to make the first version fully arbitrary
Constrained, existing-chain audio patching is the right target.

## 26.3 Do not keep wires as UI-only state once this work begins
Once audio patching starts, the DSP route state must become authoritative and real.

## 26.4 Do not solve this by making ten more fake visual flags
The whole point is that wires must stop being decorative.

## 26.5 Do not overbuild a generalized runtime before proving one real route mutation slice
EQ proof first.

---

## 27. Recommended Deliverables for the First Implementation Pass

A good first pass should produce at least:

- a canonical serializable rack audio connection representation
- DSP-side route mapping for current chain nodes
- route application/rebuild helper
- EQ reroute proof working from rack UI
- persistence of audio connection state
- logging/diagnostics for route application
- documentation of supported first-pass routing rules

Bonus if practical:
- tests or scripts demonstrating reconnect behavior
- ability to inspect current applied route state via IPC/EVAL

---

## 28. Proposed Acceptance Criteria

The first milestone should be considered done only if all of these are true:

### Functional
- disconnecting EQ from chain audibly bypasses it
- reconnecting EQ audibly restores it
- no silence unless the graph actually implies silence

### State correctness
- UI wire state matches DSP-applied route state
- save/reload preserves the route
- reloading UI or DSP does not desync the rack silently

### Code quality
- route logic is explicit and inspectable
- unsupported routes are rejected or normalized deterministically
- no dependency on modulation engine work

### User-facing proof
- a person can drag/delete/connect around EQ and hear the result

That is the first real proof that the rack is functionally alive.

---

## 29. Final Recommendation

If you are picking this task up fresh, the right move is:

1. accept that core graph mutation already exists
2. stop treating the problem as an engine problem
3. treat it as a **rack-to-DSP binding problem**
4. implement **audio-first constrained route mutation** for the existing rack chain
5. begin with **EQ bypass/reroute**
6. make the DSP side authoritative for actual applied audio route state
7. persist connection state properly
8. expand chain node by node
9. only after audio patching is real, design the modulation engine

That is the shortest path from “cool rack UI” to “real modular behavior” in this codebase.

---

## 30. Short Version

- Manifold already supports dynamic DSP graph mutation in core.
- The rack UI already has real patchbay scaffolding.
- The missing step is binding rack connections to actual DSP route changes.
- Start with constrained audio routing for the existing known chain.
- First proof: disconnect/reconnect EQ and reroute around it.
- Once that works, continue down the chain.
- Do modulation later.

That is the right next move.

---

## 31. Proposed Next Vertical Slice — Full Fixed-Chain Audio Patching

With Slice 1 complete, the next slice should not jump to full freeform modularity, modulation, or module instancing.
That would be premature and would make debugging much harder.

The right next slice is:

## make the entire current fixed audio chain patchable and persistent, not just the EQ tail

That means extending the now-proven rack-to-DSP binding model across the existing rack audio nodes:

- oscillator
- filter
- fx1
- fx2
- eq
- row glue / placeholders / output

The purpose of this slice is to prove that the current rack is a genuinely patchable audio system across the whole built-in chain.

### 31.1 Slice 2 goal

A user should be able to:

- bypass `filter`, `fx1`, `fx2`, or `eq`
- reinsert those modules later
- route through placeholders and row glue without losing audio
- save and reload those routes
- inspect the currently applied route state when debugging

This slice should turn the proof from:

- “EQ bypass works”

into:

- “the current fixed rack chain is functionally alive as a patchable audio path”

### 31.2 What Slice 2 should include

#### A. Generalize splice / bypass semantics to all interior audio nodes

Shift-click splice / bypass behavior should work consistently for:

- filter
- fx1
- fx2
- eq

Expected behavior:

- removing one module should reconnect upstream to downstream when possible
- re-inserting the module should restore its place in the chain
- no silence should occur unless the resulting graph truly has no valid path to output

This should use the same authoritative route derivation path already proven in Slice 1 rather than introducing new per-module hacks.

#### B. Make the edge-mask path the authoritative fixed-chain route model

The fixed-chain router should now be treated as the official constrained audio-routing model for the current rack.

The expected flow is:

1. UI rack connections are normalized
2. normalized audio connectivity derives the fixed-chain edge mask
3. DSP applies that edge mask by mutating the graph
4. unsupported or invalid route shapes are rejected or normalized deterministically

This slice should remove the remaining mental model of “EQ special case” and make the routing layer clearly about the whole current chain.

#### C. Persist rack audio connections and restore them correctly

Persistence is no longer optional once more than one interior node can be bypassed.

This slice should save and restore:

- rack audio connection descriptors
- enough normalized route state to rebuild audio routing deterministically on load
- UI and DSP route agreement after reload

The system should survive:

- UI reload
- DSP reload
- project save/load

without silently desynchronizing the visible wires from the actual audio path.

#### D. Add route introspection for debugging

The route state should be inspectable over IPC / EVAL.

At minimum it should be easy to inspect:

- current rack audio connections
- normalized audio connections
- derived edge mask
- applied DSP route state, if available

This is important because once multiple interior bypass states are allowed, debugging by visual inspection alone becomes too fragile.

### 31.3 Suggested implementation breakdown

#### Slice 2A — interior bypass generalization

Implement audible bypass / reinsert for:

- filter
- fx1
- fx2

EQ remains part of the verified set, but the new proof should focus on making all current interior modules behave consistently.

Acceptance criteria:

- each module can be spliced out without breaking unrelated routing
- each module can be reinserted audibly
- placeholder and rail-glue paths still resolve correctly
- unsupported routes fail deterministically rather than corrupting state

#### Slice 2B — persistence

Implement:

- save / restore of rack audio connections
- deterministic route rebuild on load
- no silent UI/DSP desync after reload

Acceptance criteria:

- save a non-default but valid route
- reload the project
- the same wires appear
- the same audio path is applied

#### Slice 2C — introspection

Implement:

- a debug dump of the current route state
- edge-mask visibility
- enough route reporting to explain why a path is or is not audible

Acceptance criteria:

- a single IPC / EVAL query can show the currently applied route model clearly enough to debug routing problems quickly

### 31.4 Explicitly out of scope for Slice 2

Do not mix these into this slice:

- modulation routing engine work
- arbitrary multi-instance module hosting
- module palette / spawning
- generalized unconstrained audio graph semantics outside the current chain contract
- future-facing hosted-project abstractions

Those are valid later tasks, but mixing them in now would make it much harder to prove whether the current audio patching foundation is actually solid.

### 31.5 Slice 2 acceptance criteria

#### Functional
- bypass / reinsert works audibly for `filter`, `fx1`, `fx2`, and `eq`
- row glue and placeholder passthrough still produce expected audible routing
- no bogus disconnects prevent legitimate user wiring in the current constrained model

#### State correctness
- UI wire state matches DSP-applied route state
- saving and reloading preserves the route
- moving modules between rows does not change audio unless connectivity changes

#### Debuggability
- current route state can be inspected over IPC / EVAL
- route normalization and applied edge-mask state are explicit and inspectable

### 31.6 Why this is the right next slice

This is the smallest next step that materially upgrades the system from:

- one proven reroute case

to:

- a real patchable fixed-chain audio rack

That is the right milestone to hit before attempting module palette work, freeform graph expansion, or modulation routing.
