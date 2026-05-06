# Hosted Project Architecture: MidiSynth as a First-Class Project

## Status

**Status:** Draft architecture proposal  
**Date:** 2026-03-30  
**Scope:** Main ↔ MidiSynth project boundary, project hosting/imports, UI/DSP composition, shared-library policy

---

## 1. Why This Doc Exists

MidiSynth currently lives inside `UserScripts/projects/Main/` because it has been easier to work on there while the instrument, UI, and looper integration were all moving quickly.

That convenience came with a real architectural cost:

- Main is acting like the owner of MidiSynth
- MidiSynth still carries Main-specific assumptions
- UI asset resolution assumes a single active project root
- the old standalone MidiSynth is deprecated and not the source of truth
- proving reusability via wrappers is harder than it should be

The right move is **not** to keep pulling files out of Main in a piecemeal way forever.

The right move is to make **MidiSynth a first-class standalone project again**, while also making it possible for **Main to host MidiSynth** as a child project.

That gives us the real win:

- work on MidiSynth inside Main when that is the fastest environment
- boot MidiSynth standalone with the real UI and DSP
- eventually host or wrap MidiSynth elsewhere without forking its implementation

---

## 2. Core Thesis

### Main should be the best host for MidiSynth, not the owner of MidiSynth.

That implies the following target model:

- **MidiSynth** becomes a standalone Manifold project with its own manifest, DSP entry, UI root, and local modules
- **Main** imports/hosts MidiSynth as a child project
- **System/runtime** gains proper support for project hosting, child project asset resolution, and DSP/UI bridging
- anything genuinely shared between Main and MidiSynth becomes a shared library or shared system facility over time

This is the clean ownership boundary:

- **MidiSynth owns instrument behavior**
- **Main owns composition, routing, and looper integration**
- **Manifold owns runtime/project hosting semantics**

---

## 3. Goals

### Primary goals
- Make MidiSynth runnable as a standalone project using the real maintained DSP/UI code path
- Allow Main to host MidiSynth rather than embedding its internals as if they were Main-owned
- Define a clean contract for project-to-project hosting
- Make future wrapper/export work possible without duplicate implementations

### Secondary goals
- Make hidden Main dependencies visible
- clarify which code belongs in MidiSynth, Main, or a shared library
- create a reusable pattern for other hostable projects/modules later

---

## 4. Non-Goals

This proposal is **not** trying to:

- fully redesign the entire Manifold runtime in one shot
- solve generalized modular synth graph hosting for every future use case immediately
- prematurely move every reusable-looking thing into a shared library
- replace all current project-local paths before a hosted-project model exists
- force MidiSynth to become a tiny “module only” thing with no standalone identity

MidiSynth should remain a **real project**, not just a bag of reusable fragments.

---

## 5. Architectural Principles

## 5.1 Standalone does not mean isolated

A standalone MidiSynth project should still have access to normal Manifold facilities:

- DSP primitives
- UI runtime/loader
- MIDI input
- host sample rate / tempo / transport access
- IPC / EVAL / diagnostics
- whatever system-level services Manifold exposes to projects

So “standalone” means:

- **not structurally dependent on Main**

It does **not** mean:

- cut off from the rest of Manifold

## 5.2 Main-specific integration must stay in Main

Examples of Main-owned concerns:

- looper layer capture source mapping
- looper audio routing
- Main tab/surface composition
- Main-specific policy for transport/capture coordination
- any host-specific visual composition around MidiSynth

## 5.3 MidiSynth-specific behavior must stay in MidiSynth

Examples of MidiSynth-owned concerns:

- synthesis DSP
- MidiSynth UI
- MidiSynth parameter schema
- sample/blend/additive logic
- capture semantics from the synth’s point of view

## 5.4 Shared code should be promoted deliberately

If code is used by:

- MidiSynth standalone
- MidiSynth hosted inside Main
- and potentially future hosts/projects

then it becomes a candidate for a shared library or system facility.

But the rule is not “share everything now.”
The rule is:

- keep ownership local until a real shared use case exists
- then promote with intention

---

## 6. Target Layering

## 6.1 System layer (Manifold runtime)

Should own:

- project loading
- child project hosting/imports
- UI document loading and mounting
- DSP graph hosting/bridging support
- asset resolution semantics
- namespacing / instance identity support
- optional shared libraries exposed to all projects

## 6.2 MidiSynth layer

Should own:

- `manifold.project.json5`
- `dsp/main.lua`
- `ui/main.ui.lua`
- `lib/*`
- its DSP/UI behavior and internal module graph
- its exported ports/surfaces/capabilities contract

## 6.3 Main layer

Should own:

- looper baseline
- host composition
- child project instantiation of MidiSynth
- wiring host ports into MidiSynth ports
- placement of MidiSynth UI in Main’s shell/tabs/layout

---

## 7. Proposed Project Hosting Model

## 7.1 Basic idea

A project should be able to **host another project**.

That means:

- loading another project’s manifest
- instantiating its DSP entry
- mounting one or more of its UI surfaces
- mapping host ports/hooks into child ports/hooks
- remapping or namespacing params as needed

Conceptually:

```text
Main Project
├── own DSP / UI / transport / looper
└── child project instance: MidiSynth
    ├── child DSP runtime
    ├── child UI surface(s)
    ├── child params
    └── declared inputs/outputs/hooks
```

## 7.2 Child project identity

A hosted project needs an **instance identity**.

Example conceptually:

- project: `MidiSynth`
- instance id: `midisynth1`

This identity should be used for:

- namespacing params
- resolving child UI state
- diagnostic output
- hot reload / dependency tracking

## 7.3 Hosting contract

A hostable project should declare a contract with at least:

- UI surface(s)
- DSP entry
- parameter schema
- exposed ports/hooks
- capabilities

Not all of this needs to exist in final polished form immediately, but that is the target.

---

## 8. UI Architecture Implications

## 8.1 Current systemic problem

Today, UI documents and behavior/component refs are effectively resolved relative to the **active project root**.

That is fine for a single-project world.
It breaks down for hosted projects.

If a child project document is loaded, then nested refs like:

- `behavior = "ui/behaviors/midisynth.lua"`
- `ref = "ui/components/midisynth_view.ui.lua"`

must resolve relative to the **project/document they came from**, not the host project that loaded them.

### This is the critical loader rule:

> Nested UI asset refs must resolve relative to the source document/project, not globally against the active host project root.

Without that, hosted-project UI is always going to devolve into brittle wrapper files and path hacks.

## 8.2 Desired UI mounting model

A child project should be able to export one or more UI surfaces.

Examples:

- `default`
- `compact`
- `rack`
- `patchbay`

A host project should be able to mount a child surface into a region/tab/container.

Conceptually:

```json5
{
  imports: {
    midisynth: "../MidiSynth/manifold.project.json5"
  },
  instances: [
    {
      id: "midisynth1",
      project: "midisynth",
      surface: "default",
      mount: "midisynth_tab"
    }
  ]
}
```

The exact manifest syntax is open, but the model is sound.

## 8.3 UI behavior isolation

A hosted project’s UI behavior state should remain isolated to that project instance.

That means:

- no accidental global widget ID collisions
- no global behavior assumptions tied to host project internals
- dependency tracking/reload should understand child project files separately

---

## 9. DSP Architecture Implications

## 9.1 Child DSP should be instantiable as a project unit

A child project’s DSP should be loadable without assuming the host project’s graph topology.

For MidiSynth, that means its DSP should consume a defined set of inputs/hooks rather than assuming:

- Main looper layer source ownership
- Main routing ownership
- Main-specific capture source IDs as internal truth

## 9.2 Ports/hooks model

A child project should expose declared DSP connection points.

Conceptually these may include:

- audio inputs
- audio outputs
- MIDI input
- control inputs
- optional host hooks

For MidiSynth, likely examples are:

- `capture_live`
- `capture_layer_1`
- `capture_layer_2`
- `capture_layer_3`
- `capture_layer_4`
- `main_out`
- `midi_in`

The exact representation can evolve, but the point is:

- Main should connect into **declared child ports**
- MidiSynth should not internally know it is being fed by “Main layer 1..4” unless explicitly configured that way by a host mapping layer

## 9.3 Host wiring belongs to the host

Main should own the mapping from looper internals to MidiSynth ports.

For example:

```text
Main layer gate/playback nodes -> MidiSynth capture source ports
MidiSynth main output -> Main monitoring / layer input send / output bus
```

That mapping is composition logic and should remain outside MidiSynth proper.

---

## 10. Parameter Namespacing

A hosted project needs a coherent parameter namespace strategy.

## 10.1 Standalone case

MidiSynth standalone can keep simple canonical paths like:

- `/midi/synth/waveform`
- `/midi/synth/blend/mode`

## 10.2 Hosted case

When hosted, there are two broad options:

### Option A: Prefix child params by instance path
Example:
- `/projects/main/instances/midisynth1/midi/synth/waveform`

### Option B: Host-level aliasing/remapping
Example:
- Main exposes a mounted namespace that forwards into child params

The exact choice is open, but we need:

- unambiguous instance identity
- a way to automate schema/preset/automation discovery
- compatibility with child standalone paths where possible

## 10.3 Recommended direction

Prefer a model where:

- MidiSynth owns canonical internal paths
- host runtime provides namespaced external exposure for child instances

That avoids forcing the child project to rename itself just because it is hosted.

---

## 11. Shared Library Policy

The rule for promotion should be:

## 11.1 Keep inside MidiSynth when:
- it is instrument-specific
- it is not yet reused elsewhere
- it would become vaguer if made “shared” too early

## 11.2 Keep inside Main when:
- it is composition-specific
- it is specific to looper integration
- it is host policy rather than instrument behavior

## 11.3 Promote to shared/system when:
- both standalone and hosted MidiSynth need it
- multiple projects need it
- it is really infrastructure rather than product logic

Likely shared/system candidates over time:

- project hosting/import support
- child UI mounting support
- cross-project asset resolution support
- shared parameter schema metadata helpers
- reusable rack/patchbay UI infrastructure
- perhaps reusable DSP host-bridge primitives

---

## 12. Recommended Migration Plan

## Phase 1 — Establish the architecture
- agree that MidiSynth is becoming a first-class project
- agree that Main will host it rather than own it
- agree on project-relative asset resolution semantics

## Phase 2 — Create a real `projects/MidiSynth/`
- add a standalone MidiSynth project manifest
- point it at the maintained DSP/UI source-of-truth
- stop treating deprecated `Main/dsp/midisynth.lua` as the future

## Phase 3 — Fix UI loader semantics
- make nested UI refs resolve relative to the source document/project
- make behavior/component loading work cleanly for child project documents
- ensure dependency tracking/reload respects child project file ownership

## Phase 4 — Boot MidiSynth standalone with the real UI
- no fake minimal proof-of-life UI
- use the actual maintained UI/DSP path
- identify any remaining hidden Main-owned assumptions

## Phase 5 — Host MidiSynth from Main
- instantiate child MidiSynth project from Main
- map looper/capture/monitor routes into child ports/hooks
- mount child UI surface into Main

## Phase 6 — Promote genuinely shared pieces
- move repeated host/runtime/project-boundary logic into shared libraries/system support
- keep MidiSynth and Main specific logic where it belongs

---

## 13. What This Means for Current Refactor Work

The refactor work done so far is still useful.

It has already moved large chunks of instrument logic into module boundaries, including:

- FX definitions
- VoicePool
- SampleSynth voice graph
- blend/morph routing
- capture source configuration
- parameter binder/schema
- major UI support modules

That work is not wasted.
It is the reason a first-class project boundary is now plausible.

But the next architectural leap is **not** “keep extracting forever inside Main.”

The next leap is:

- **promote MidiSynth to a real project**
- **teach Main to host it**
- **fix the loader/runtime to support that cleanly**

---

## 14. Risks and Failure Modes

## 14.1 Wrong move: wrapper hacks only

If we only add wrapper files and path hacks without changing ownership, then:

- Main will still effectively own MidiSynth
- UI loading will remain brittle
- standalone will be fake rather than real

## 14.2 Wrong move: over-sharing too early

If we aggressively move every dependency into a shared library now, then:

- boundaries get blurry
- shared code becomes vague junk
- actual project ownership stays unclear

## 14.3 Wrong move: treat standalone as a toy mode

If standalone MidiSynth is built with a fake minimal UI/DSP path just to prove “it boots,” then:

- we do not prove that the real maintained project boundary works
- hidden dependencies remain hidden

The real proof is:

- the maintained MidiSynth UI and DSP boot standalone
- Main hosts the same thing as a child project

---

## 15. Open Questions

These are real questions, but they do not block the architectural direction.

## 15.1 Manifest/import syntax
- How exactly should one project reference another?
- path import only?
- named import aliases?

## 15.2 Param namespace exposure
- should child params be prefixed automatically?
- or aliased by the host?
- or both?

## 15.3 UI mount API
- how should a host declare where a child surface mounts?
- tab/page/container ID?
- explicit host surface composition API?

## 15.4 DSP bridge representation
- simple named ports?
- typed buses?
- explicit hook tables?

## 15.5 Reload semantics
- when a child project file changes, what is reloaded?
- the child only?
- host composition too?
- how is state preserved?

---

## 16. Recommendation

The recommended direction is:

1. treat **MidiSynth as a standalone project again**
2. make **Main host MidiSynth** rather than own it
3. fix **project/document-relative UI asset resolution** in the runtime
4. define a lightweight but explicit **child project contract** for UI/DSP/params/ports
5. use this as the first real implementation of project-hosts-project architecture in Manifold

This is the right architectural move because it improves all three of these at once:

- standalone viability
- Main-integrated development workflow
- future wrapper/export/composition options

---

## 17. Short Version

If we want MidiSynth to be:

- easy to work on inside Main
- valid as a standalone project
- reusable in future wrappers/hosts

then Main cannot remain the de facto owner of MidiSynth.

**MidiSynth should become a first-class project. Main should host it. The runtime should support that cleanly.**
