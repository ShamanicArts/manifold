# Modulation Engine Architecture Worksheet

## Status

**Status:** Working architecture / handoff worksheet  
**Date:** 2026-03-30  
**Audience:** Someone new to this codebase who needs enough context to understand the current system, the intended direction, the missing pieces, and how to implement the next vertical slices without breaking the project  
**Primary proving ground:** `UserScripts/projects/Main` (especially the maintained MidiSynth path)  
**Long-term target:** A broader Manifold modulation system, not a MidiSynth-only dead end

---

## 1. Purpose of This Document

This worksheet exists because the project has now crossed an important threshold.

We have already proven that the rack/patchbay UI can stop being decorative fiction and start driving real DSP behavior:

- rack wires now drive real **audio routing** mutations in the Main project
- EQ insert/bypass has been proven as an audible vertical slice
- the rack patchbay has enough structure now that it is reasonable to move on to the next subsystem

That next subsystem is **modulation**.

This document is not just a vague idea dump. It is meant to hand someone enough context to:

1. understand the current system as it exists today
2. understand why modulation is the next logical subsystem
3. understand the intended big-picture architecture
4. see what already exists and what is missing
5. implement the work in sensible vertical slices rather than building an elegant fucking disaster

---

## 2. Very Short Project Orientation

If you know absolutely nothing about this project, start here.

### 2.1 What project are we talking about?

The relevant target is the **Main** project under:

- `UserScripts/projects/Main`

This project contains a MIDI synth / sample synth / FX rack environment with:

- a Lua DSP script
- a Lua UI
- a patch/rack view
- an increasingly modular architecture

### 2.2 Which DSP file is the real one?

The maintained DSP source of truth is:

- `UserScripts/projects/Main/dsp/midisynth_integration.lua`

There is also:

- `UserScripts/projects/Main/dsp/midisynth.lua`

but that standalone path is not the main maintained refactor target.

### 2.3 What has already been refactored?

A lot of the original MidiSynth “God object” has already been extracted into reusable/shared modules. Important ones include:

- `UserScripts/projects/Main/lib/parameter_binder.lua`
- `UserScripts/projects/Main/lib/rack_audio_router.lua`
- `UserScripts/projects/Main/lib/fx_definitions.lua`
- `UserScripts/projects/Main/lib/fx_slot.lua`
- `UserScripts/projects/Main/lib/voice_pool.lua`
- `UserScripts/projects/Main/lib/sample_synth.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua`
- `UserScripts/projects/Main/lib/ui/rack_controller.lua`
- `UserScripts/projects/Main/lib/ui/rack_layout_manager.lua`
- `UserScripts/projects/Main/lib/ui/update_sync.lua`

### 2.4 What has already been proven in the modular rack work?

The current working rack/patchbay system already supports:

- node specs and declared interfaces
- dynamic patchbay UI generation
- wire drawing and drag interactions
- rack pagination and row semantics
- real audio route mutation for the fixed chain
- splice/bypass semantics
- shift-drag insertion semantics

This matters because the modulation engine is **not** being designed into a vacuum.

---

## 3. Why Modulation Is the Next Logical Vertical Slice

The rack audio patching document intentionally argued for an **audio-first** milestone.
That was the right call.

We needed to prove:

- patch view is capable of driving real DSP behavior
- wires are not just visual theater
- graph mutation can be used incrementally in the maintained Main path

That proof now exists.

The next subsystem is naturally:

## modulation

because the current rack language already contains modulation-adjacent concepts:

- control ports
- parameter ports
- source/target hints
- declared interfaces
- patchbay wires
- a UI language that strongly suggests future modulation

But right now those concepts do not yet correspond to a real general runtime.

So the next step is to stop lying.

If the rack shows:
- `ADSR ENV`
- `FM`
- `PW CV`
- `blend_cv`
- `env`
- parameter ports marked `input = true`, `output = true`

then the system needs a real answer to:

> what is a modulation source, what is a modulation target, how are routes represented, how are they evaluated, and how are type/domain mismatches handled?

---

## 4. Current System: What Already Exists Today

This section is critical. The modulation architecture should be built on top of the real current system, not on fantasy assumptions.

---

## 4.1 Canonical parameter registration and binding already exist

The DSP side already uses a canonical parameter system based around:

- `ctx.params.register(...)`
- `ctx.params.bind(...)`
- `onParamChange(...)`

In Main, parameter metadata has been centralized in:

- `UserScripts/projects/Main/lib/parameter_binder.lua`

That file already defines a large canonical path set for MidiSynth, including things like:

- waveform
- filter type / cutoff / resonance
- FX types / mixes / per-slot params
- EQ output / mix / band params
- ADSR params
- sample engine params
- blend mode params
- rack audio edge mask

This is already valuable because it gives us a canonical address space.

### Important implication

We do **not** need to invent a fresh parameter naming universe for modulation.

The modulation system should piggyback on the existing canonical endpoint/path world where appropriate.

---

## 4.2 Script parameters are already exposed through OSC/OSCQuery infrastructure

This is a major architectural asset.

Relevant engine-side files include:

- `manifold/primitives/scripting/DSPPluginScriptHost.cpp`
- `manifold/primitives/control/OSCEndpointRegistry.cpp`
- `manifold/primitives/control/OSCQuery.cpp`
- `manifold/primitives/scripting/LuaEngine.cpp`
- `manifold/primitives/scripting/bindings/LuaControlBindings.cpp`

In `DSPPluginScriptHost.cpp`, script parameters are registered as custom OSCQuery endpoints unless a backend endpoint already owns the same path. The engine comment explicitly says this exists so behavior scripts can expose newly added parameters without waiting for static template updates.

That means the project already has:

- canonical parameter paths
- endpoint registry integration
- OSCQuery discovery and tree rebuild
- custom endpoint value publishing

### Important implication

We already have **part of the infrastructure for a general control fabric**.

But that is **not yet the same thing** as an internal modulation runtime.

The missing piece is the system in the middle that defines:

- sources
- targets
- routes
- coercion
- scope
- evaluation

We should use the same endpoint/addressing model, but **not** build the modulation runtime by literally bouncing OSC into ourselves.

That would be janky and wrong for real-time work.

---

## 4.3 The rack already exposes modulation-adjacent interfaces

The rack node interfaces live in:

- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`

Current node set:

- `adsr`
- `oscillator`
- `filter`
- `fx1`
- `fx2`
- `eq`
- `placeholder1`
- `placeholder2`
- `placeholder3`

Some important current ports:

### ADSR
Inputs:
- `gate`
- `retrig`

Outputs:
- `env`
- `inv`
- `eoc`

### Oscillator
Inputs:
- `gate`
- `v_oct`
- `fm`
- `pw_cv`
- `blend_cv`

Outputs:
- `out`
- `sub`

### Filter
Inputs:
- `in` (audio)
- `env` (control)

Outputs:
- `out`
- `send`

### FX / EQ
These already expose many param endpoints via `ports.params` with canonical paths.

### Important implication

The **UI language for modulation already exists**.

What does not exist yet is the runtime that makes those control and param relations real.

---

## 4.4 Patchbay and wire infrastructure already exist

Relevant files:

- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_wire_layer.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`

What already exists here:

- dynamic patchbay panel generation
- per-node/page patch panels
- registered port runtime registry
- wire drag and snap
- rail/row terminal behavior
- connection descriptors in UI state
- control/audio/param port display conventions

Again, this is not empty scaffolding. The UI is already speaking a language that modulation can use.

---

## 4.5 Real audio route mutation is already proven

Relevant files:

- `UserScripts/projects/Main/lib/rack_audio_router.lua`
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `manifold/primitives/scripting/PrimitiveGraph.h`
- `manifold/primitives/scripting/PrimitiveGraph.cpp`

The current audio routing slice uses:

- a fixed-chain audio edge mask
- UI-side route normalization and edge resolution
- DSP-side connect/disconnect mutation via `ctx.graph`

This already proves:

- patchbay connections can drive real DSP behavior
- the Main project path can mutate graph routing at runtime
- the rack is not just visual fiction anymore

### Important implication

The next modulation architecture should follow the same spirit:

- use real current infrastructure
- make one honest slice real
- do not overbuild a general control graph before proving the basics

---

## 4.6 There is already a precedent for “frontend modulation”

Relevant file:

- `manifold/dsp/scripts/test_param_modulation.lua`

This file demonstrates a simple parameter modulation approach where:

- LFOs are computed in the UI/update loop
- parameter values are pushed into DSP parameters
- sliders visually move as modulation updates them

This is useful because it proves a point:

## runtime parameter modulation is possible without changing DSP graph topology

That distinction matters a lot.

However, it is also a cautionary example.

This approach is:
- useful as a demo
- useful as a historical precedent
- **not** the final architecture we want for a broader Manifold modulation system

Why not?
Because it keeps the modulation logic in a UI/update loop rather than in a canonical modulation runtime with explicit source/target routing semantics.

So it should be treated as:

- evidence that modulation is feasible
- not the architecture to copy wholesale

---

## 5. What Is Missing Today

This section is the real gap analysis.

We already have:

- parameters
- endpoint exposure
- patchbay visuals
- audio-route reality
- port language

We do **not** yet have a modulation engine that answers all of these questions:

### 5.1 What are the canonical modulation sources?
Examples:
- ADSR env
- inverse env
- end-of-cycle trigger
- velocity
- note number
- macros
- LFOs
- sample analysis outputs
- external control inputs

### 5.2 What are the canonical modulation targets?
Examples:
- param paths
- semantic control inputs like `v_oct`, `gate`, `fm`
- future non-param control endpoints

### 5.3 How are routes represented?
We need a canonical route model independent of the UI view.

### 5.4 How are routes scoped?
We need a real answer for:
- global routes
- per-instance routes
- per-voice routes
- maybe later per-note/per-channel routes

### 5.5 How are source/target type mismatches handled?
This is the coercion / conversion problem.

### 5.6 How are route values combined and applied?
We need rules for:
- additive
- replace
- multiply
- trigger/event semantics
- target mapping

### 5.7 How are routes visualized and edited?
Patchbay is one view. It is not the only view.

### 5.8 How does this remain broader than MidiSynth?
We need to make sure the implementation shape does not become impossible to generalize.

---

## 6. Big-Picture Vision

The goal is **not** “build a cute mod matrix for one synth.”

The larger target is:

## a broader Manifold modulation fabric

where:

- endpoints are addressable and typed
- routes between endpoints are canonical data
- runtime evaluation is internal and efficient
- patchbay wires are one projection of the routes
- matrix view is another
- hidden inspector/list views are another
- external mapping systems can interoperate with the same endpoint model

This broad system should eventually support:

- modular rack patching
- modulation without visible wires where appropriate
- macros / assignment panels
- analysis features as sources
- external control mappings
- future converter modules and control processors

The key idea is:

## wires are a visualization and authoring projection, not the ontology

That means the modulation engine should not be designed as “the patchbay runtime and nothing else.”

---

## 7. Core Architectural Proposal

The recommended architecture has four conceptual layers.

---

## 7.1 Layer A — Endpoint Fabric

This is the canonical answer to:

> what can be addressed in the control/modulation world?

Endpoints may include:

### Target endpoints
- canonical param paths
- semantic control inputs
- future non-param targets

### Source endpoints
- ADSR outputs
- macros
- LFO outputs
- note / velocity / mod wheel / aftertouch
- sample analysis features
- external control sources
- **auto-exposed MIDI hardware/device endpoints advertised by the connected controller**
- future converter outputs

### Important MIDI hardware requirement

A tracked product requirement already exists for the MIDI synth keyboard panel to expose the MIDI parameters advertised by the connected hardware device in a scrollable UI surface for direct access.

That means the modulation architecture must account for this now, even before the full front end exists.

In practical terms, the endpoint fabric must be able to represent:

- discovered MIDI device parameters/endpoints
- stable identifiers for those device-exposed controls
- metadata such as range, type, label, and channel/controller identity where available
- their availability as modulation sources and/or mappable control endpoints

The future keyboard-panel UI for those controls should be treated as a **projection over the endpoint fabric**, not as the thing that defines the architecture.

### Key point

This layer should be broader than MidiSynth.

For the first implementation, we can prove it inside Main/MidiSynth, but the data model should not assume it only ever works there.

---

## 7.2 Layer B — Canonical Route Graph

A modulation route should be represented canonically as a typed directed relationship between endpoints.

Conceptually:

- source endpoint
- target endpoint
- route amount / mode / transform metadata
- resolved coercion or adapter behavior
- scope

The important part is that this route model is **independent of presentation**.

That means the same route can be viewed as:

- a wire in patchbay
- a cell in a mod matrix
- a row in an inspector list
- a macro assignment entry

---

## 7.3 Layer C — Compiled Runtime Evaluator

The canonical route graph is not necessarily the most efficient execution form.

So the runtime should compile routes into a sparse, efficient evaluation structure.

That compiled form may look more like:

- adjacency lists
- sparse route arrays
- grouped target evaluators
- grouped per-scope route sets

This is where the “graph vs matrix” confusion gets resolved.

### Useful mental model

- **graph** = the conceptual route topology / canonical relationship model
- **matrix** = one possible projection or a compiled view of part of the graph
- **sparse route table** = a likely efficient execution form

These are not contradictory.

---

## 7.4 Layer D — Presentation / Authoring Views

Multiple views should be able to project and edit the same route model.

Likely views include:

### Patchbay view
Best for:
- local visible relationships
- modular intuition
- wiring-oriented users
- source/target authoring and cable-level route inspection

### Matrix view
Best for:
- dense overview
- many-source / many-target editing
- quick amount edits

### Inspector / list view
Best for:
- “what modulates this control?”
- compact editing without cable clutter
- hidden or implicit modulation
- explicit display of base / modulation / effective values

### External mapping view
Best for:
- MIDI/OSC assignment
- macro routing
- system-wide control mapping
- discovered hardware-controller parameter exposure and mapping

This is critical because the intended modulation system is **wider than visible rack wires**.

### Visibility requirement across views

Modulation must not be a patch-view-only concept.

At minimum, the system must be able to show modulation state in both:

- **patch view**
- **performance view**

That means route existence, modulation activity, and effective target displacement cannot live only in cable rendering.
A user should be able to see that a control is being modulated even when they are not staring at the patchbay.

---

## 8. Matrix vs Graph: Clarification

This needs to be said explicitly because it is easy to get lost in vocabulary here.

## A matrix and a graph can represent the same route information.

Example:

- source = `adsr.env`
- target = `filter.cutoff`
- amount = `0.45`

This can be represented as:

### Graph edge
`adsr.env -> filter.cutoff`

### Matrix cell
Row = `adsr.env`  
Column = `filter.cutoff`  
Cell = `0.45`

### Route record
```lua
{ source = "adsr.env", target = "filter.cutoff", amount = 0.45 }
```

So the real distinction is not “truth vs falsehood.”

The real distinction is:

### A graph-oriented model is better when:
- endpoints are typed
- there are semantic inputs, not only flat scalar params
- routes may involve adapters or converter nodes
- multiple visualizations need to coexist
- modular topology matters

### A matrix-oriented view is better when:
- you want a compact overview
- routes are mostly source→target assignments with amounts
- you want fast editing of lots of assignments

Therefore:

## Recommended position

Use a **graph-like canonical route model**, and allow matrix/list/patchbay projections over it.

---

## 9. Endpoint Model: Recommended Metadata Shape

The current system already has parameter metadata in `parameter_binder.lua` and node interface metadata in `rack_midisynth_specs.lua`.

The modulation system needs to extend that world with richer endpoint typing.

### Minimum endpoint metadata categories

Each endpoint should be describable along dimensions like:

- `id`
- `scope`
- `direction` (`source`, `target`, maybe `bidirectional`)
- `signalKind`
- `domain`
- `targetApplyModes`
- `implicitCoercionsAllowed`
- maybe `uiHints`

### Example: target endpoint
```lua
{
  id = "/midi/synth/cutoff",
  direction = "target",
  scope = "voice",
  signalKind = "scalar",
  domain = "freq",
  targetApplyModes = { "add", "replace" },
  implicitCoercionsAllowed = { "scalar_unipolar", "scalar_bipolar", "audio_env" },
}
```

### Example: source endpoint
```lua
{
  id = "adsr.env",
  direction = "source",
  scope = "voice",
  signalKind = "scalar_unipolar",
  domain = "normalized",
}
```

### Example: audio source endpoint
```lua
{
  id = "oscillator.out",
  direction = "source",
  scope = "voice",
  signalKind = "audio",
  domain = "audio",
}
```

---

## 10. Scope Model

This is one of the most important architectural decisions.

A modulation route is not just a source and a target.
It also lives in a **scope**.

### Recommended initial scopes

#### 10.1 Global
Same modulation value applies everywhere in the instance.

Examples:
- macro1 -> eq.mix
- macro1 -> fx1.mix
- global LFO -> output trim

#### 10.2 Voice
Each voice evaluates its own source and target application independently.

Examples:
- ADSR env -> filter cutoff
- velocity -> oscillator output
- gate -> retrig

#### 10.3 Instance
A useful middle layer if needed later, but initially “global” may cover most of this.

#### 10.4 Later possibilities
- channel / MPE voice groups
- project-global shared sources
- cross-instance routing

### Why this matters

Without a real scope model, polyphonic modulation turns to soup immediately.

`ADSR env -> filter cutoff` in a poly synth is not a global knob wiggle.
It is typically a **per-voice route**.

---

## 11. Signal Kinds and Domains

The modulation system should not treat everything as a generic float with vibes.

At minimum, define a typed family of signal/value kinds.

### 11.1 Scalar families
- `scalar_unipolar` (`0..1`)
- `scalar_bipolar` (`-1..1`)
- `scalar_unbounded`

### 11.2 Discrete families
- `int`
- `enum`
- `bool`

### 11.3 Event-ish families
- `gate`
- `trigger`

### 11.4 Semantic numeric domains
These may still be scalar underneath, but they are useful as meaningful target/source domains:
- `freq`
- `note`
- `time`
- `db`
- `percent`
- `phase`

### 11.5 Richer domains
- `audio`
- later maybe `spectrum`, `feature`, `midi`

### Why this matters

Type/domain metadata lets the route compiler determine whether a route is:

- directly compatible
- compatible via implicit coercion
- requires explicit conversion
- invalid

---

## 12. Route Model: What a Canonical Route Should Contain

A route should not just be “source path, target path, amount.”
That is too dumb for the intended system.

### Recommended conceptual route fields
```lua
{
  id = "route_001",
  source = "adsr.env",
  target = "/midi/synth/cutoff",
  scope = "voice",
  amount = 0.45,
  bias = 0.0,
  mode = "add",
  resolvedCoercion = "identity", -- after route compilation
  resolvedMapping = "freq_exp",  -- after route compilation
  enabled = true,
  meta = {
    sourceView = "patchbay",
  }
}
```

The exact shape can vary, but the system needs to represent:

- what is connected
- how it applies
- what scope it lives in
- what coercion/mapping semantics were resolved

---

## 13. Coercion and Conversion: Core Design Decision

This is a major part of the intended architecture.

The modulation system needs to support **type/domain coercion**.

### Core idea
A route is conceptually:

## source -> coercion/conversion -> target

Not every source and target live in the same domain.

Examples:
- `0..1` scalar to `0..9` enum
- bipolar scalar to unipolar scalar
- audio signal to a normalized control value
- trigger to a short gate pulse

### Important distinction

#### Coercion
Cheap and obvious adaptation at the route boundary.
Examples:
- clamp
- normalize
- scale
- offset
- quantize to int
- quantize to enum
- threshold to bool
- bipolar/unipolar remap

#### Conversion
A more meaningful derived transformation.
Examples:
- audio -> envelope follower
- audio -> pitch detection
- audio -> transient detection
- scalar -> sample-and-hold
- scalar -> slew/lag
- note -> frequency mapping

This distinction matters because the system should not hide every meaningful signal derivation under the word “coercion.”

---

## 14. Recommended Policy on Implicit vs Explicit Conversion

The intended direction is:

## implicit conversion should be allowed when it is safe, stable, deterministic, inspectable, and not semantically insane

That means the system should support a library of **standard resolved coercion profiles**.

Not random guesses. Not context-sensitive magic. Not “whatever feels sensible in the moment.”

### 14.1 Good candidates for implicit coercion

#### Scalar family
- `scalar_unipolar -> int`
- `scalar_unipolar -> enum`
- `scalar_bipolar -> scalar_unipolar`
- `scalar_unipolar -> bool`
- `gate -> bool`
- `trigger -> short gate pulse`

#### Domain remaps
- scalar -> percent-like target
- scalar -> freq-like target via target mapping
- scalar -> time-like target via target mapping

#### Audio family
A key design decision from discussion:

- `audio -> scalar_unipolar` **may be allowed implicitly**

but not as raw sample values. The sensible default is a standardized, explicit internal profile like:

- rectify / abs or equivalent level extraction
- envelope/level smoothing
- normalized output to a control scalar

In plain English:

### connecting audio to a non-audio scalar target should resolve to a well-defined default feature extraction profile, not random behavior

This is a reasonable convenience layer as long as the system explains what happened.

### 14.2 Cases that should remain explicit

These are too semantically ambiguous to guess automatically:

- audio -> trigger detection
- audio -> pitch / note
- audio -> bool
- audio -> stepped enum event selection
- spectrum/feature extraction beyond the standard default envelope-style profile
- anything that could reasonably mean several very different things

Examples:

#### audio -> trigger
Could mean:
- threshold crossing
- onset detection
- transient detection
- Schmitt trigger
- zero-crossing pulse

Those are not the same thing. That should be explicit.

#### audio -> pitch
Could mean:
- fundamental estimator
- dominant FFT bin
- note-quantized pitch tracker

Again, too ambiguous for an implicit default.

### 14.3 No hidden “authoring mode” requirement is necessary

One discussion point was whether routes need explicit auto/manual authoring states.

Current recommendation:

- **do not require a separate authoring mode model at first**
- if the user wants explicit conversion semantics, they can express that by inserting converter/processor nodes into the rack later
- the route compiler can still resolve implicit coercion profiles under the hood

This matches the intended rack UX better:

- direct connection uses safe defaults
- explicit conversion is expressed by explicit inserted modules when needed

### 14.4 Explainability is non-negotiable

If the system applies implicit coercion, the user must be able to inspect it.

For example, hovering a route or inspecting it should be able to say something like:

- Source: `oscillator.out`
- Source kind: `audio`
- Resolved coercion: `audio_env_default`
- Attack: `10 ms`
- Release: `80 ms`
- Output kind: `scalar_unipolar`
- Target mapping: `freq_exp`
- Apply mode: `add`

This keeps the system understandable instead of magical bullshit.

---

## 15. Recommended Runtime Resolution Model

When a route is created or changed, it should go through a **route compilation / resolution step**.

That step should decide:

1. source endpoint kind/domain/scope
2. target endpoint kind/domain/scope
3. direct compatibility or not
4. implicit coercion availability or not
5. explicit conversion required or not
6. target apply mode and mapping
7. compiled evaluation domain

### Example compiled route record
```lua
{
  sourceHandle = ..., 
  targetHandle = ..., 
  evalScope = "voice",
  coercionKind = "audio_env_default",
  mappingKind = "freq_exp",
  applyKind = "add",
  amount = 0.45,
}
```

This matters because it separates:

- user-facing route model
from
- runtime execution model

---

## 16. Target Application Rules

Not every target should be modulated the same way.

### Common target application modes

#### Additive
`effective = base + contribution`

Good default for many scalar targets.

This is especially important because additive application naturally supports **negative modulation** when the contribution is bipolar or signed.
That requires the system to preserve the authored base value rather than overwriting it with the modulated value.

#### Replace
`effective = contribution`

Useful in specific semantic input cases.

#### Multiplicative
`effective = base * f(contribution)`

Useful for gain-like or scaling targets.

#### Trigger/event
For event-style targets like retriggering.

### Important rule

The runtime must distinguish between:

- **base value** — authored knob/slider/parameter state
- **modulation contribution** — transient routed influence
- **effective value** — what is actually applied right now

This is not optional.
If the system writes the modulated/effective value back into the authored base value, negative modulation, release behavior, UI explainability, and preset correctness all become bullshit.

So the intended model is:

```lua
{
  baseValue = ...,
  modulationValue = ...,
  effectiveValue = ...,
}
```

### Important rule

Target-specific semantics should be owned by the target side where practical.

Examples:
- filter cutoff should own its own target-domain mapping and smoothing behavior
- stepped targets should own or at least explicitly declare quantization policy
- event targets should not be treated as continuous accumulators

### Smoothing
The modulation engine should **not** become one giant generic smoother.

Better rule:

- modulation runtime computes effective control values
- target node / target binding owns the appropriate smoothing or edge policy

### UI implication: show base vs effective

For modulatable controls, the UI should eventually be able to display both:

- the **base/authored position**
- the **effective/modulated position**

One concrete UI direction is to keep the normal thumb/marker at the base position and render the modulated/effective position as a shadow/ghost overlay between the background and active control color.

That applies to both:

- performance view controls
- patch view parameter widgets

This is the right visual model because it shows modulation displacement without lying about the authored parameter value.

---

## 16.1 Modulation vs binding/mapping

This distinction needs to be explicit.

### Modulation
A modulation route means:

- source influences target through an amount/mode/coercion/mapping path
- target keeps a base value
- effective value is computed from base + contribution (or other declared apply rule)
- one source does **not** necessarily force the target to exactly mirror it

### Binding / mapping
Binding or mapping is a different concept.

A binding is closer to:

- one-to-one relationship
- source value directly drives another parameter/control
- semantically closer to assignment/linking than modulation accumulation

The system should not collapse these into one concept just because both involve dragging one thing onto another.

### Authoring implication
A plausible future UI idea is:

- normal interaction edits the parameter itself
- **shift-clicking** a parameter enters a mapping/binding authoring mode
- while in that mode, dragging from one parameter to another creates a direct bind/map relationship rather than a modulation route

This is **not** the same interaction as ordinary modulation authoring and should remain conceptually separate in the architecture.

---

## 17. Relationship to OSC / OSCQuery / External Control

This section matters because the project already has OSC infrastructure.

### 17.1 What already exists
We already have:
- canonical parameter paths
- endpoint registry integration
- OSCQuery auto-discovery for script-defined params
- external control visibility

### 17.2 What the modulation engine should reuse
The modulation engine should reuse:
- canonical endpoint addressing conventions
- endpoint metadata where possible
- discoverability concepts
- perhaps future shared endpoint registry extensions

### 17.3 What it should **not** do
The internal modulation runtime should **not** be implemented as self-OSC message bouncing.

Why not?
Because that would:
- push internal real-time control through an external protocol layer
- complicate performance and timing semantics
- make per-voice routes awkward and stupid

So the right architecture is:

## same endpoint/addressing model, different runtime layer

---

## 18. Recommended Initial File Ownership / Code Shape

The long-term target is broader than Main, but the proving ground is Main.

So the implementation should start in a way that is:
- practical now
- not obviously trapped forever

### Recommended initial ownership for the first proving slices

#### Main project side
New modules likely belong under something like:

- `UserScripts/projects/Main/lib/modulation/...`

Possible early files:
- `lib/modulation/endpoint_registry.lua`
- `lib/modulation/route_model.lua`
- `lib/modulation/route_compiler.lua`
- `lib/modulation/runtime.lua`
- `lib/modulation/coercions.lua`
- `lib/modulation/source_bindings.lua`
- `lib/modulation/target_bindings.lua`

#### Existing files that will need integration work
- `UserScripts/projects/Main/lib/parameter_binder.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`

### Why start in Main first?
Because we need to prove the route model, scope model, and coercion policy in a real project before lifting it more broadly.

### Why keep the data model broader than Main?
Because the long-term target is a Manifold-wide modulation fabric, not a one-off synth hack.

---

## 19. Non-Goals for the First Modulation Implementation

To avoid disappearing up our own ass, these should be treated as explicit non-goals for the first slices.

### Do **not** do these first
- full graph-native audio-rate CV engine
- arbitrary modulator-chaining for everything
- complete system-wide UI for all possible views at once
- every conversion module under the sun
- every source type under the sun
- broad persistence and export semantics before the route model is proven
- “every parameter can modulate every other parameter” with no policy

### Why not?
Because the first job is to prove a clean, honest modulation substrate in a real project.

---

## 20. Recommended First Proving Targets

The first vertical slices should prove two different scope classes.

### 20.1 First voice-local proof
- `ADSR.env -> filter.cutoff`

Why this is a good first proof:
- source already exists conceptually in the rack
- target is obvious and audible
- it forces real per-voice modulation semantics
- it tests target mapping and accumulation

### 20.2 First global proof
- `macro1 -> eq.mix`
or
- `macro1 -> fx1.mix`

Why this matters:
- proves a non-voice scope
- forces the engine to distinguish global vs per-voice routes
- gives a broad-system hint beyond MidiSynth-only envelope routing

### 20.3 Optional early coercion proof
- `macro1 (0..1 scalar) -> waveform enum`

Why this is useful:
- tests scalar→enum coercion
- tests explainability and stepped targets
- forces explicit policy for quantization / hysteresis / route inspection

---

## 21. Vertical Slice Plan

This section is deliberately chunked into implementable slices.

### Reality check / current status

The original plan here is now partially superseded by the code that already landed.

Current rough reality:

- **Slice 1** endpoint registry — done
- **Slice 2** route compiler — done
- **Slice 3** global evaluator — done
- **Slice 4** first voice-local proof — functionally proven enough to move forward

So the next real vertical slice is no longer “first voice-local proof exists at all.”
The next slice is to make target-state handling and UI presentation honest before piling on more authoring UX.

---

## Slice 0 — Freeze terminology and route principles

### Goal
Lock down the conceptual model before coding ourselves into a corner.

### Output
A small finalized design note or extension to this worksheet that confirms:
- endpoint vocabulary
- route vocabulary
- scope vocabulary
- coercion policy
- first supported signal kinds

### Why this slice exists
Because if naming and route semantics drift while code is landing, the implementation will become inconsistent fast.

### Done when
- team agrees on the route model shape
- team agrees on scope names
- team agrees on implicit coercion allowlist for v1

---

## Slice 1 — Build a minimal endpoint registry for modulation use

### Goal
Create a modulation-facing endpoint inventory inside Main.

### Output
A registry that can answer:
- what are the available modulation sources?
- what are the available modulation targets?
- what scope/type/domain metadata do they expose?

### Initial sources to support
- `adsr.env`
- `adsr.inv`
- `adsr.eoc`
- `macro1`
- a placeholder/discovery-backed class for **hardware MIDI device endpoints** so the registry shape already accounts for them even if the first UI does not expose them yet

### Initial targets to support
- `filter.cutoff`
- `eq.mix`
- maybe `waveform` as a stepped target

### Integration points
- `parameter_binder.lua`
- `rack_midisynth_specs.lua`
- existing MIDI device plumbing / keyboard-side device discovery code in Main
- new modulation endpoint registry module

### Validation
- dump endpoint registry over IPC/EVAL
- verify expected source/target metadata exists
- verify the registry shape can represent discovered MIDI hardware controls/endpoints even before the final keyboard UI projection is implemented

### Done when
- sources and targets can be introspected and identified with stable metadata
- the endpoint fabric already has a place for discovered MIDI hardware controls so that feature can land later without redoing the route model

### Recommended implementation outline

This should be a **registry slice**, not a stealth route-runtime slice.
Do not start evaluating modulation yet.
Do not start inventing patchbay authoring semantics yet.
Just make the endpoint world real and inspectable.

#### 21.1 Slice 1 deliverables

Create a small modulation registry layer in Main that can rebuild a canonical endpoint inventory from multiple providers.

Suggested new files:

- `UserScripts/projects/Main/lib/modulation/endpoint_registry.lua`
- `UserScripts/projects/Main/lib/modulation/endpoint_providers.lua`
- optionally `UserScripts/projects/Main/lib/modulation/debug_dump.lua`

It is fine if this starts as one file and gets split once the shape is proven.

#### 21.2 Registry responsibilities

The registry should answer these questions deterministically:

- what endpoints exist right now?
- which are sources vs targets?
- what scope does each endpoint live in?
- what signal kind/domain does each endpoint expose?
- where did the endpoint come from? (`parameter-schema`, `rack-spec`, `midi-device`, etc.)
- is the endpoint currently available or only logically known?

Suggested minimal API:

```lua
registry.rebuild(ctx)
registry.getAll()
registry.getSources()
registry.getTargets()
registry.findById(id)
registry.debugSnapshot()
```

Keep this pure-data and introspection-focused.
No DSP mutation in this slice.

#### 21.3 Endpoint metadata to require in v1

The worksheet already defines the conceptual metadata shape.
For Slice 1, require a practical subset:

```lua
{
  id = "/midi/synth/cutoff",
  direction = "target",
  scope = "voice",
  signalKind = "scalar",
  domain = "freq",
  provider = "parameter-schema",
  owner = "filter",
  displayName = "Filter Cutoff",
  available = true,
}
```

For sources, the same shape should work:

```lua
{
  id = "adsr.env",
  direction = "source",
  scope = "voice",
  signalKind = "scalar_unipolar",
  domain = "normalized",
  provider = "rack-spec",
  owner = "adsr",
  displayName = "ADSR Env",
  available = true,
}
```

Do not overdesign this into a giant schema yet.
But do not omit `scope`, `signalKind`, `domain`, or `provider`, because that would be fucking stupid and we would just have to add them again in Slice 2.

#### 21.4 First provider set

Build the registry from three provider classes.

##### Provider A — parameter target provider
Use `parameter_binder.lua` as the canonical source of modulation targets.

What this provider should emit:
- canonical parameter paths as endpoint ids
- target metadata from parameter schema/ranges/descriptions
- initial scope guesses (`voice` vs `global`) where known
- target-domain hints (`freq`, `gain_db`, `normalized`, `enum_index`, etc.)

##### Provider B — rack semantic source provider
Use `rack_midisynth_specs.lua` as the canonical source of semantic modulation sources already implied by the rack.

Initial source endpoints to emit:
- `adsr.env`
- `adsr.inv`
- `adsr.eoc`
- `macro1` if it already exists as a control concept, otherwise a reserved placeholder endpoint
- any other obvious control outputs already declared in the rack spec

This provider is what stops the patchbay from pretending those source ports are real while the engine still has no canonical source inventory.

##### Provider C — MIDI hardware endpoint provider
Use existing MIDI device plumbing in Main as the discovery source.

Relevant current files:
- `UserScripts/projects/Main/lib/ui/midi_devices.lua`
- `UserScripts/projects/Main/ui/behaviors/keyboard.lua`
- any existing device refresh/update hooks in `init_controls.lua` and `update_sync.lua`

This provider does **not** need the final UI yet.
It does need the data model now.

What it should support in Slice 1:
- a registry namespace for hardware-exposed controls/endpoints
- metadata for discovered controls where available (`label`, `range`, `type`, `channel`, `cc`, etc.)
- empty/no-op behavior when the current device exposes nothing beyond basic MIDI
- a clean placeholder shape when discovery data is partial

#### 21.5 MIDI hardware endpoint identity rules

This bit matters.
If we get endpoint identity wrong now, the later mapping layer will be a pile of bullshit.

Requirements:

- endpoint ids for hardware controls must be stable across registry rebuilds
- display labels are **not** sufficient as ids
- device disconnect should not force the architecture to forget that an endpoint exists conceptually
- availability should be tracked separately from identity

Recommended approach:
- use a namespaced id like `midi.device.<deviceKey>.<endpointKey>`
- make `deviceKey` a normalized persistent identifier if available, otherwise a normalized device name as a temporary fallback
- make `endpointKey` come from the discovered control identity, not the visible label text
- add `available = true/false` so future route persistence can survive unplug/replug events

That last point is important because otherwise any future saved mapping to a hardware control will explode the moment the controller disappears.

#### 21.6 Scope rules for Slice 1

Do not try to solve every scope problem yet.
Just be explicit.

Initial scope assignments:
- ADSR outputs: `voice`
- note/velocity/aftertouch/pitch-wheel style performance sources: likely `voice` or `channel`, but document the choice explicitly
- hardware device knobs/sliders advertised as controller params: start as `global` unless we have a better per-note semantic
- filter cutoff: `voice`
- eq mix / output trim / rack edge mask: likely `global`

If a scope is uncertain, mark it intentionally rather than hand-waving it.
A temporary `scope = "global"` with a TODO note is better than pretending scope does not matter.

#### 21.7 Non-goals for this slice

Do **not** do these yet:
- route compilation
- route evaluation
- patchbay wire authoring for modulation
- MIDI learn UI
- keyboard-panel hardware control UI
- persistence of modulation routes

That is all later.
This slice is purely about making endpoint inventory real.

#### 21.8 Validation plan

Validation should be dirt simple and hard to fake.

1. Build registry in Main startup/debug path.
2. Expose a debug dump over IPC/EVAL.
3. Verify these show up with expected metadata:
   - `adsr.env`
   - `adsr.inv`
   - `/midi/synth/cutoff`
   - `/midi/synth/eq8/mix`
4. Verify source vs target classification is correct.
5. Verify at least one stepped/enum-ish target is represented sanely.
6. Verify the registry can represent MIDI hardware endpoints even if no current device advertises any extra controls.
7. If device metadata is available, verify unplug/replug changes `available` state rather than changing endpoint identity.

#### 21.9 Concrete success criteria

Slice 1 is successful when:

- there is one canonical modulation endpoint registry in Main
- it can be rebuilt from parameter, rack, and MIDI-device providers
- it can be inspected over IPC/EVAL without digging through random tables
- the registry shape already supports future hardware-controller exposure
- Slice 2 can consume it directly without redefining endpoint metadata

---

## Slice 2 — Canonical route model and route compiler

### Goal
Define the canonical route object and compile it into a resolved runtime form.

### Output
A route compiler that can:
- validate source/target compatibility
- assign scope
- resolve coercion profile
- assign target mapping/apply mode
- reject invalid routes cleanly

### Initial supported coercions
- identity scalar
- scalar_unipolar -> enum/int
- scalar_bipolar -> scalar_unipolar
- maybe macro scalar -> stepped enum

### Validation
- unit-ish Lua tests for route compilation
- IPC dump of compiled route state
- explicit validation errors for illegal routes

### Done when
- a route can be authored and compiled deterministically

---

## Slice 3 — Global route evaluator

### Goal
Implement the first internal modulation evaluator for global routes.

### First proof
- `macro1 -> eq.mix`

### Output
A runtime that can:
- store a base value
- evaluate route contribution
- compute effective value
- apply it to a target path/node binding

### Why start with global?
Because it is simpler than per-voice and will help prove the route compiler/evaluator split.

### Validation
- turn macro up and down
- verify effective target changes audibly
- inspect base vs modulation vs effective values over IPC

### Done when
- one global modulation route works end-to-end without UI-side hacks

---

## Slice 4 — Voice-local route evaluator

### Goal
Add true per-voice modulation evaluation.

### First proof
- `ADSR.env -> filter.cutoff`

### Output
A runtime that can evaluate per-voice sources against per-voice targets and apply effective values correctly while preserving stable base/authored target values.

### Critical design requirement
This must not collapse into a global control path.

### Likely integration points
- `midisynth_integration.lua`
- voice pool / voice graph binding points
- modulation runtime source and target binding helpers

### Validation
- audible envelope-driven filter response per note
- polyphonic overlap does not smear into one global modulation value
- IPC/debug output can show per-voice effective values

### Done when
- voice-local modulation is clearly real and not faked by a global parameter loop

---

## Slice 5 — Target state separation + modulation visualization

### Goal
Make target-state handling explicit and honest.

The system must represent:

- **base/authored value**
- **modulation contribution**
- **effective value**

and expose that clearly in both UI views.

### Why this slice is next
Because otherwise we keep writing effective/modulated values back into the same conceptual bucket as the authored value, which breaks:

- negative modulation
- stable release/restore behavior
- preset correctness
- UI explainability

and generally turns the system into a pile of bullshit.

### Output
A target-state model that can explicitly track:

```lua
{
  target = "/midi/synth/cutoff",
  baseValue = 500,
  modulationValue = -0.18,
  effectiveValue = 312,
}
```

### Backend requirements
- runtime must preserve stable base/authored values
- modulation contribution must be represented separately from base
- effective target value must be computed from that state, not treated as authored truth
- signed/negative modulation must be supported by the model
- IPC/debug output must expose base / modulation / effective explicitly

### UI requirements
Modulation must be visible in **both**:

- performance view
- patch view

At minimum, modulatable controls should be able to show:

- base position
- effective/modulated position
- route activity / displacement

One practical visual direction is:

- normal thumb/marker shows the authored/base value
- a shadow/ghost overlay shows the effective/modulated value

### First proof
Use an already-real route such as:
- `ADSR.env -> filter.cutoff`

Then verify the same target-state model also supports:
- positive modulation
- negative modulation

### Validation
- set a base value and verify it remains stable while modulation moves the effective value
- note release restores the effective value back to the authored base
- negative modulation can push a target below the base value without changing the base marker
- performance view shows base vs effective distinctly
- patch view shows base vs effective distinctly
- IPC/debug inspection shows base / modulation / effective values explicitly

### Done when
- target-state separation is real in the runtime
- modulation no longer overwrites authored value conceptually
- both views can display modulation honestly

---

## Slice 6 — Patchbay projection for modulation routes

### Goal
Make the patchbay able to author/view real modulation routes against the canonical route model.

### Output
- control/param connections become actual modulation routes
- route creation updates the canonical route set
- wire rendering reflects canonical modulation routes

### Important rule
The patchbay should be a **projection**, not the sole source of truth.

### Validation
- create/remove route from patch view
- verify runtime route set updates
- verify DSP behavior follows

### Done when
- at least one route can be created from patchbay and becomes real in the evaluator

---

## Slice 7 — Route inspection / explainability

### Goal
Expose what each route actually resolves to.

### Output
At minimum, some inspection surface that can say:
- source kind
- target kind
- scope
- amount
- resolved coercion
- target mapping
- apply mode

### Why this matters
Because implicit conversion without inspection becomes inscrutable bullshit.

### Possible UI implementations
- hover tooltip on wire
- inspector panel
- debug console / IPC dump first, UI later

### Validation
- users can explain what a route is doing without reading source code

### Done when
- route resolution is visible and debuggable

---

## Slice 8 — Implicit coercion expansion: audio -> scalar profile

### Goal
Introduce the first nontrivial implicit domain crossing.

### First proof
Allow a route like:
- audio source -> scalar target

but resolve it through a standard implicit profile such as:
- `audio_env_default`

### Important rule
This must be one clear resolved profile, not context-sensitive mystery meat.

### Validation
- route inspection shows the resolved profile
- modulation behavior is stable and intelligible

### Done when
- the system can safely and predictably derive a scalar modulation source from an audio source via a standard profile

---

## Slice 9 — Explicit converter modules

### Goal
Add the first explicit inserted converter/control modules.

### Candidate first modules
- threshold trigger
- envelope follower with adjustable settings
- quantizer / stepped selector
- slew / lag processor

### Why this slice is later
Because the implicit route/compiler/runtime model should be proven before we start proliferating conversion modules.

### Validation
- user can insert explicit control conversion in the rack
- explicit conversion overrides the need for implicit resolution in that case

### Done when
- explicit conversion exists as a first-class modular option, not just a hidden compiler trick

---

## 22. Suggested Validation Strategy

Each slice should be validated in small ways, not by faith.

### 22.1 IPC/EVAL inspection
Use the existing runtime introspection approach to expose:
- endpoint registry contents
- canonical route state
- compiled route state
- effective values
- per-voice route outputs where relevant

### 22.2 Audible proofs
Do not stop at “the value changed.”
Prove audible behavior where applicable.

### 22.3 UI consistency checks
Patch view, performance view, and parameter readback should agree.

### 22.4 Do not rely on vague assumptions
If a route is supposed to be working, verify:
- source exists
- target exists
- route compiled
- coercion resolved
- effective value applied

---

## 23. Major Risks and Failure Modes

### 23.1 Building a MidiSynth-only hack
If route/source/target logic gets buried directly inside one behavior file, the system will not generalize.

### 23.2 Pretending all params are equivalent
They are not.
Some are scalar, some stepped, some event-like, some voice-local.

### 23.3 No scope model
This would destroy polyphonic correctness.

### 23.4 Magic coercion with no visibility
This would make the system impossible to reason about.

### 23.5 Turning the modulation engine into the universal smoothing layer
Bad idea. Let targets own their smoothing and edge policies where practical.

### 23.6 Trying to solve the final universal control graph immediately
That is too much for the next real slice.

---

## 24. Recommended Final Position

### 24.1 What should be built
A modulation system with:
- a broader endpoint fabric
- a canonical typed route model
- a compiled sparse runtime evaluator
- clear scope semantics
- support for safe implicit coercion
- support for explicit converter modules later
- patchbay as one projection, not the only truth

### 24.2 What should be proved first
- one global route
- one voice-local route
- one stepped/coerced route

### 24.3 What should be avoided
- internal self-OSC as the runtime
- pretending patchbay wires are the entire system
- building a fully generalized control graph before the substrate is proven

---

## 25. Immediate Next Recommendation

If implementation starts now, the next best move is:

1. freeze the endpoint + route + coercion vocabulary from this worksheet
2. implement a minimal modulation endpoint registry in Main
3. implement a route compiler with a tiny coercion table
4. prove:
   - `macro1 -> eq.mix` (global)
   - `adsr.env -> filter.cutoff` (voice)
5. only then project those routes through the patchbay UI

That sequence gives the project:
- a real internal modulation substrate
- a path to broader Manifold generalization
- a patchbay that is no longer lying about control semantics

---

## 26. Reference Files

### Current working docs
- `agent-docs/260329_midisynth_architecture_refactor.md`
- `agent-docs/260330_modular_rack_audio_patching_working_doc.md`
- `agent-docs/active/rack-ui/260326_rack_ui_framework_spec.md`
- `agent-docs/active/rack-ui/260328_blend_modes_and_modulation_analysis.md`
- `TODO_TRACKER.md` (see 2026-03-30 item: MIDI synth keyboard panel enhancements / hardware-advertised MIDI params UI)

### Main project implementation touchpoints
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `UserScripts/projects/Main/lib/parameter_binder.lua`
- `UserScripts/projects/Main/lib/rack_audio_router.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_wire_layer.lua`

### Engine/endpoint infrastructure touchpoints
- `manifold/primitives/scripting/DSPPluginScriptHost.cpp`
- `manifold/primitives/control/OSCEndpointRegistry.cpp`
- `manifold/primitives/control/OSCQuery.cpp`
- `manifold/primitives/scripting/PrimitiveGraph.h`
- `manifold/primitives/scripting/PrimitiveGraph.cpp`

### Historical modulation precedent
- `manifold/dsp/scripts/test_param_modulation.lua`

---

## 27. Closing Summary

The short version is:

- the project already has a strong parameter/addressing foundation
- the rack already speaks a modulation-flavored UI language
- audio patching is now real enough that modulation is the next honest slice
- the right architecture is broader than a MidiSynth-only matrix
- the right implementation path is still incremental, not maximalist

The recommended system is:

## endpoint fabric + canonical route graph + compiled evaluator + multiple views

with:
- global and voice-local scope
- safe implicit coercion
- explicit converter modules later
- patchbay as one projection among several

If we follow that plan in vertical slices, the result should be a modulation substrate that is actually worth building on instead of a one-off hack we regret later.
