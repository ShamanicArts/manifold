# Project Ownership and Reload Vision

## Why This Exists

Manifold is no longer just a runtime that loads one Lua UI script.

It is becoming a framework/runtime for live DSP tools and plugin creation, while also incubating real projects inside itself. `Main` is one of those projects. `MidiSynth` currently lives as a tab inside `Main`, but it is already growing beyond “just a tab”. It is becoming a domain with its own UI language, behaviors, routing concepts, and likely its own future project/package identity.

That changes the hot-reload problem.

The problem is not merely:

- "why doesn't `midisynth.lua` hot reload?"

The real problem is:

- how does Manifold handle code that starts life as project-local experimentation,
- then becomes reusable project/domain/package code,
- and later may become framework/runtime capability?

If we do not answer that cleanly, projects become dumping grounds for half-promoted framework code, and hot reload remains brittle because the runtime has no coherent ownership model.

---

## The Key Reframe

We need to stop thinking in a flat binary:

- local project code
- runtime code

That model is too dumb for where the system is going.

Instead, Manifold needs explicit ownership layers.

---

## Ownership Layers

### Layer 0 — Core runtime

This is Manifold itself.

Examples:

- Lua VM lifecycle
- structured UI loader
- dependency graph + file watching
- reload invalidation infrastructure
- generic widget plumbing
- layout engine primitives
- state/update push model
- DSP/UI runtime boundary code

This is C++ core and system-level Lua runtime behavior.

### Layer 1 — System UI / framework libraries

These are reusable Lua-side capabilities that are broader than any single project, but not necessarily C++ core.

Examples:

- generic rack container primitives
- generic node shell primitives
- generic patch wire overlay behavior
- generic patchbay/paging/docking helpers
- reusable structured UI behaviors that are product-agnostic

These should live as first-party system libraries and be usable across projects.

### Layer 2 — Domain packages

These are not universally part of Manifold, but are clearly larger than one project.

Examples:

- a `midisynth` package
- synth rack specs
- synth keyboard behavior
- synth routing semantics
- synth modulation UI helpers
- a reusable `ui-rack` package if that language becomes stable

These should be reusable across projects without being forced into core runtime.

### Layer 3 — Project composition

This is the actual project using the above pieces.

Examples:

- Main’s tab layout
- Main-specific glue between Looper, MidiSynth, Donut, Sandbox
- Main-specific theme/style choices
- project-specific routing, defaults, and composition decisions

This stays local to the project.

---

## The Promotion Path

New capabilities should generally move upward like this:

1. **Incubate in a project**
2. **Prove reusable and conceptually stable**
3. **Extract into a package or system library**
4. **Promote to core runtime only when it is truly foundational**

This avoids two bad outcomes:

### Bad outcome A — Premature promotion

Experimental project code gets baked into runtime/system APIs before its shape is understood.

### Bad outcome B — Permanent project landfill

Reusable framework/domain ideas stay trapped inside one project forever, and project-local code becomes a junk drawer of pseudo-framework logic.

---

## What This Means for MidiSynth

`MidiSynth` should no longer be treated only as a tab.

It is turning into one or both of:

- a first-class standalone project
- a reusable domain package used by `Main` and future projects

The likely long-term direction is a split such as:

- **generic rack UI primitives** → system/package layer
- **synth-specific rack semantics** → `midisynth` package layer
- **Main tab composition and glue** → stays in `Main`

This lets `Main` host MidiSynth without owning every implementation detail forever.

---

## Hot Reload Implications

Hot reload must stop thinking in terms of a single current script path.

The runtime needs to understand:

- entrypoints
- transitive project-local Lua modules
- package modules
- system modules
- ownership and invalidation boundaries

### Architectural rule

**The manifest defines the project entrypoint.**

**The runtime owns the dependency graph.**

**Hot reload operates on the dependency graph, not just the entrypoint.**

That means the runtime should know:

- what belongs to the current project
- what belongs to a mounted package
- what belongs to system/runtime libraries
- what reload policy applies to each ownership zone

---

## Ownership-Aware Reload Model

Each loaded asset/module should conceptually carry metadata like:

- path
- module name
- owner: `project | package | system`
- package id/version if applicable
- reloadability: `hot | warm | stable`
- state policy: `stateless | serialize | preserve`

Then reload can become:

- invalidate changed nodes within the allowed ownership boundary
- reload affected surfaces
- preserve or restore approved state
- leave stable layers alone unless explicitly running in framework authoring mode

---

## Near-Term Direction

Before the full ownership-aware graph exists, we need a first practical fix:

### First reload fix

For structured UI projects, Manifold should:

1. track project-local dependencies used by the project
2. watch those dependency files for changes
3. invalidate project-local Lua module cache entries on reload
4. rebuild from the project entrypoint without relaunching the app

This is the minimum viable step that restores productive hot reload for modular project code.

---

## Longer-Term Direction

### Phase 1 — Make project-local reload real

- dependency tracking for structured UI project files
- project-local module invalidation via `package.loaded`
- file watching across the loaded dependency set
- reload-safe lifecycle boundaries

### Phase 2 — Introduce explicit ownership zones

Add runtime/package/system distinctions in module resolution and dependency tracking.

Examples of future namespace shapes:

- `project:`
- `package:`
- `system:`

The exact syntax is less important than the ownership distinction.

### Phase 3 — Extract reusable MidiSynth pieces

Move clearly reusable capabilities upward:

- generic rack container
- generic rack node shell
- generic wire overlay
- pagination/paging primitives
- patchbay substrate if it proves reusable

### Phase 4 — Split MidiSynth into package/domain + project composition

Potential shape:

- `packages/midisynth/...`
- `packages/ui-rack/...`
- `projects/Main/...`
- later possibly `projects/MidiSynth/...`

### Phase 5 — Ownership-aware reload policies

- project reload invalidates project modules
- package reload invalidates mounted dev packages
- system modules stay stable by default unless authoring mode says otherwise

---

## Promotion Criteria

A local helper should move upward only if it is:

- reusable across projects
- conceptually stable
- part of Manifold’s vocabulary rather than one product’s quirks
- beneficial to share without dragging project-specific assumptions into runtime

A helper should **not** be promoted just because current reload behavior is bad.

Reload must work for project-local code too.

---

## Summary

The correct long-term answer is not:

- force everything back into flat manifest-defined project code
- or shove everything into runtime because it became important

The correct answer is:

1. **Manifold gains graph-based reload infrastructure**
2. **ownership layers become explicit**
3. **project code can be promoted upward cleanly over time**
4. **MidiSynth evolves from tab → package/project without fighting the runtime**

This gives Manifold a real architecture for growth:

- projects remain fast to iterate
- reusable capabilities can graduate upward
- hot reload works across modular code
- the framework stops pretending every serious subsystem is just one file loaded from a manifest
