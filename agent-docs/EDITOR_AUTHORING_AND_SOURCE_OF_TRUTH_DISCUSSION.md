# Editor Authoring, Source-of-Truth, and Format Strategy Discussion

**Status:** This discussion doc has been **largely resolved by implementation.** The structured project system is built and shipping in 4 projects. The strategic questions raised here were answered in `EDITOR_PROJECT_FORMAT_AND_AUTHORING_SPEC.md`. For current implementation state, see `EDITOR_WORKING_STATUS.md`.

**Purpose (historical):** capture the full breadth of the current thinking around the Manifold editor system, its current maturity, the long-term vision, the gaps, and—most importantly—the unresolved source-of-truth / authoring-format problem.

This doc is intentionally detailed and opinionated. It is meant as a handoff artifact for a second opinion, not a polished final spec.

---

# 1. Executive Summary

The editor is already far beyond a toy script loader. The current system has a serious architecture:

- a JUCE/C++ host editor,
- a Canvas scene graph,
- a Lua runtime,
- a persistent shell,
- swappable UI scripts,
- visual editing affordances,
- script surfaces,
- control bindings,
- and a growing introspection model.

That part is real.

However, the hardest unsolved problem is **not** basic UI editing anymore.
It is the deeper problem of:

> **How do we support highly freeform user-authored Lua/UI/DSP workflows while also supporting a structured, diffable, composable, extensible, editor-friendly representation?**

This doc argues that:

1. The editor platform is architecturally strong.
2. The product vision is still significantly incomplete.
3. The missing center of gravity is a **source-of-truth / composition / authoring strategy**.
4. The system should probably support **multiple authoring representations**, not one rigid format.
5. **Monolithic handwritten scripts must remain first-class editable assets** in the editor.
6. The system likely needs a structured **manifest / composition / contract layer**, even if internal authored assets remain heterogeneous.

---

# 2. High-Level Context

The current editor vision is much bigger than “a plugin UI.”

The intended direction is something closer to:

- Chataigne,
- TouchOSC,
- Open Stage Control,
- or a self-hosted visual/scriptable authoring environment,

but embedded directly in the plugin/editor runtime.

The editor is meant to eventually support:

- performance-facing UI,
- visual UI authoring,
- script editing,
- script composition,
- DSP authoring,
- mappings between UI and DSP,
- project/session structure,
- runtime inspection and diagnostics,
- and eventually a meaningful round-trip workflow.

That means the editor is not just a view layer.
It is trying to become a **product-level authoring environment**.

---

# 3. Current Architecture: What Exists Already

At a high level, the current editor stack looks like this:

```text
BehaviorCoreProcessor
    ↓
BehaviorCoreEditor (JUCE)
    ↓
LuaEngine + Canvas root
    ↓
persistent ui_shell.lua
    ↓
current UI script (looper_ui.lua etc.)
    ↓
widgets / Canvas nodes / editor metadata
```

The important structural properties already in place:

## 3.1 C++ host responsibilities are clear

The C++ side owns:

- editor lifetime,
- root Canvas creation,
- Lua initialization,
- script loading,
- resize/update scheduling,
- processor integration,
- state serialization,
- control server plumbing,
- IPC/eval integration,
- threading boundaries,
- and hot-reload/safe switching mechanics.

That is a good split.

## 3.2 Lua is not a gimmick layer

Lua is not just skinning.
It defines the actual UI structure and significant UI behavior.

Lua receives:

- Canvas bindings,
- drawing APIs,
- OpenGL hooks,
- commands and parameter setters/getters,
- DSP script helpers,
- endpoint discovery,
- OSC hooks,
- file IO helpers,
- clipboard helpers,
- runtime state,
- and shell integration.

So Lua is the UI/application surface, not just decoration.

## 3.3 The persistent shell is the right architectural move

The shell (`ui_shell.lua`) sits above the current UI script and remains mounted while the child content changes.

That means:

- the shell can own editor chrome,
- mode switching does not destroy all editor state,
- performance mode and edit mode can wrap the same user UI,
- UI scripts can be swapped more safely,
- and the editor can accumulate durable authoring behavior.

This is a big architectural win.

## 3.4 Visual editing v1 is already real

The editor already has substantial v1-level features:

- hierarchy tree,
- preview selection,
- multi-select,
- marquee select,
- drag/move/resize in preview,
- inspector property editing,
- schema-driven typed rows,
- zoom/pan,
- workspace framing,
- and basic undo/redo core.

That means it is already much more than “edit Lua in a text box.”

## 3.5 Script/dev surfaces are already meaningful

The editor also already has:

- script browsing surfaces,
- a script editor,
- a dev console,
- Lua eval support,
- DSP script tooling,
- parameter exposure support,
- runtime-oriented shell surfaces.

This matters because the system is already serving both visual and script-first workflows.

## 3.6 The metadata/introspection model is one of the strongest parts

Widgets store metadata on Canvas nodes (`_editorMeta`, schema, exposed params).

That gives the shell a runtime model of:

- what widget this is,
- what type it is,
- what config it has,
- what parameters are visible/editable,
- what callbacks/schema it exposes.

That is a strong basis for visual tooling.

---

# 4. How Close Is the Editor to the Full Vision?

A blunt earlier assessment was:

- **architecture/platform maturity:** much farther along,
- **finished authoring product maturity:** much less far along.

A rough numerical framing:

- **platform shape:** maybe ~80% of the right architectural direction,
- **full product promise:** maybe ~40–45% there,
- and once the source-of-truth / composability problem is included, maybe effectively even less complete than that sounds.

## 4.1 Why the platform feels “far along”

Because the big top-level moves are already right:

- persistent shell,
- state-driven update loop,
- swappable scripts,
- metadata-aware widgets,
- preview/editor dual-mode behavior,
- Lua/C++ binding structure,
- real edit affordances.

This is not concept-stage architecture.

## 4.2 Why the full product still feels far away

Because the hardest product layers are still missing or partial:

- visual mapping UI,
- persistent save/load model,
- durable project/session model,
- robust round-trip strategy,
- stronger runtime safety/polish,
- role/mode tiering,
- and critically, a clear source-of-truth/asset-format strategy.

The editor is currently closer to:

> a strong editor platform and serious internal tool

than to:

> a finished, authoritative, user-facing visual authoring product.

That distinction matters.

---

# 5. The Central Unsolved Problem: Source of Truth

This is the real meat.

At the moment, much of the UI and scripting world is still fundamentally based on handwritten Lua scripts, often monolithic.

That raises the unavoidable question:

> If the editor edits a UI and then saves it… what exactly is it saving *to*?

This is not a minor implementation detail.
This is the actual hard architectural problem.

Because current monolithic Lua often contains, all mixed together:

- structure,
- layout,
- styling,
- control behavior,
- runtime logic,
- binding logic,
- composition,
- and editor-irrelevant glue.

That is great for fast hacking.
It is terrible as the only long-term authoritative representation for an editor trying to do visual authoring, persistence, composition, and round-trip.

---

# 6. The Tension We Are Trying to Resolve

The system wants all of the following at once:

## 6.1 Maximum freedom for users

Users should be able to:

- write a monolithic script if they want,
- split scripts however they want,
- create custom widgets,
- define their own UI composition style,
- write UI and DSP in arbitrary Lua patterns,
- and generally not be forced into a tiny locked-down editor box.

## 6.2 A structured, diffable, extensible, portable system

The system also wants:

- stable IDs,
- explicit composition,
- reusable components,
- durable mappings,
- project/session structure,
- save/load,
- meaningful collaboration diffs,
- portability,
- and potentially editor-owned round-trip.

## 6.3 A good user/editor experience

The editor should not effectively say:

> “sorry, if you wrote a real script yourself, you’re now second-class.”

That would be a bad product shape.

This is why the problem is hard.
It is not just “do we like JSON or Lua more?”
It is:

> **How do we support freeform authored systems without the editor becoming a liar, and without forcing all users into a rigid format?**

---

# 7. A Critical Correction: Monolithic Handwritten Scripts Must Remain First-Class

An earlier claim was too rigid:

> “Handwritten scripts are first-class citizens, but not automatically rewritable.”

That phrasing was challenged, and rightly so.

## 7.1 Why that phrasing was problematic

It could easily imply:

- handwritten monoliths are effectively read-only to the editor,
- editor support is “real” only for structured/editor-owned assets,
- script-first users are tolerated but demoted,
- the editor is fundamentally designed around non-script-first assets.

That is not acceptable if the product is meant to genuinely support script-first power users.

## 7.2 Corrected understanding

The corrected understanding is:

> **Monolithic handwritten Lua scripts must remain first-class editable assets in the editor.**

That means:

- they must be loadable,
- inspectable,
- manipulable,
- text-editable,
- and ideally visually editable in meaningful ways,
- even if their save/round-trip mechanics are harder or differ from structured assets.

This is a very important distinction.

## 7.3 The real distinction is not “editable or not”

The real distinction is:

### A. Editor-editable
Meaning the editor can:

- inspect the asset,
- surface it in the editor,
- allow text edits,
- allow visual edits,
- manipulate runtime objects,
- and potentially save changes back somehow.

### B. Round-trip-safe / mechanically rewritable / structure-preserving
Meaning the system can reliably:

- preserve formatting,
- preserve comments,
- preserve arbitrary manual composition,
- preserve source-level intent,
- and rewrite the file with high confidence.

Those are not the same thing.

The second one is much harder.
The first one is a product requirement.

So the corrected stance is:

> **Handwritten scripts must remain first-class editable assets. The hard problem is not whether they are editable, but how to make editing/saving/round-trip honest and robust.**

That correction should be preserved in all future framing.

---

# 8. Why “Just Rewrite the Lua” Is Not a Real Answer

If the editor saves back to arbitrary monolithic Lua, the naïve answer is:

> just rewrite the Lua file.

That sounds simple and is actually a total minefield.

## 8.1 Problems with arbitrary source rewriting

To rewrite arbitrary handwritten Lua safely, the system would need to deal with:

- comments,
- formatting,
- variable naming,
- manual refactors,
- user-defined abstractions,
- custom control creation patterns,
- local helper functions,
- indirect composition,
- metaprogramming,
- cross-file `require()` patterns,
- and arbitrary code structure.

That is brutal.

## 8.2 Why brute overwrite is also bad

Another possible approach is:

> overwrite the source with generated Lua.

That is only reasonable if the file is explicitly editor-owned/generated.
Otherwise it destroys trust.

If users hand-author scripts, they cannot feel like pressing save might flatten their work into autogenerated sludge.

## 8.3 Why sidecar deltas alone are not a satisfying final answer

A sidecar/delta approach can be useful as a transition, but if it becomes the permanent model, it can create split truth:

- source Lua over here,
- editor deltas over there,
- runtime merging somewhere else,
- unclear ownership,
- unclear diffs,
- unclear persistence semantics.

That may still be useful as an intermediate step, but not likely as the long-term whole story.

---

# 9. Why the Current Monolithic Lua Model Is Insufficient as the Sole Long-Term Source of Truth

Monolithic Lua is useful and should remain supported.
But as the only authoritative representation for everything, it has serious problems.

## 9.1 Mixed concerns

A monolith often mixes:

- structure,
- layout,
- visuals,
- event wiring,
- runtime logic,
- helper functions,
- project composition,
- and experimental hacks.

That makes precise editor authority difficult.

## 9.2 Weak composability

It is harder to make reusable pieces, instances, overrides, and explicit project structure when everything lives in a single script blob.

## 9.3 Weak portability and collaboration

Structured, explicit assets tend to diff and merge better than giant executable scripts with ad hoc composition patterns.

## 9.4 Weak editor ownership boundaries

The editor does not have a clean answer to:

- what it owns,
- what the user owns,
- what can be safely regenerated,
- what can be visually edited,
- what mappings belong to which elements,
- what stable identities persist across save/load.

This is the real issue.

---

# 10. Likely Direction: Multiple Authoring Representations

A major conclusion from the discussion is:

> The system probably should **not** standardize on a single authoring style.

Instead, it should likely become a **multi-representation system**.

Meaning the platform can support multiple asset kinds:

- handwritten monolithic Lua,
- modular handwritten Lua,
- declarative UI scene/component files,
- declarative binding/mapping files,
- theme/style files,
- DSP scripts,
- project manifests,
- generated artifacts,
- imported legacy assets,
- maybe editor sidecars/transitional metadata.

The thing that gets standardized is not necessarily one implementation language.

Instead, what gets standardized is:

- how pieces compose,
- how they identify themselves,
- how they expose capabilities,
- how the editor understands ownership,
- how project-level structure is declared,
- and how save/load semantics are defined.

This feels much more realistic than trying to force every possible authored thing into one rigid format.

---

# 11. A Very Important Reframe: Standardize Assembly, Not Necessarily Implementation

A strong framing from the discussion is:

> **Standardize the assembly/composition layer, not necessarily every internal implementation style.**

This is one of the most important ideas in the whole discussion.

## 11.1 What that means

A project might include:

- declarative UI components,
- handwritten Lua modules,
- generated pieces,
- handwritten DSP scripts,
- declarative mappings,
- themes,
- editor state,
- assets.

The platform does not need to force all of them to be authored the same way.

It does need a structured, explicit way to say:

- what is included,
- where it lives,
- what kind of asset it is,
- what role it plays,
- how it composes with others,
- and what its ownership mode is.

This suggests that the most important canonical structured layer may not be “the UI itself” in one representation.
It may be the **project composition/manifest layer**.

---

# 12. Proposed Canonical Structured Layer: The Project Manifest / Composition Graph

One proposed direction is:

> The primary canonical structured layer should be the **manifest / composition graph**, not necessarily the full internal implementation of every asset.

## 12.1 Why this is attractive

Because it lets the system stay honest.

A manifest can tell the truth about:

- what the project includes,
- which file is the root UI,
- which UI pieces are declarative,
- which UI pieces are Lua,
- which behavior modules are attached,
- which DSP scripts exist,
- which mappings are active,
- which assets are editor-owned vs handwritten,
- and which pieces are generated.

This gives the system a structured spine without demanding that all content be expressed the same way.

## 12.2 What such a manifest might describe

Potential contents:

- project version,
- active root UI,
- UI asset/module list,
- DSP asset/module list,
- mappings/binding files,
- themes,
- editor state files,
- entrypoints,
- dependencies,
- ownership metadata,
- import/export status,
- maybe build/runtime options.

## 12.3 Example rough shape

This is illustrative, not a final proposal:

```json5
{
  version: 1,
  ui: {
    root: "ui/main.ui.json5",
    modules: [
      { id: "transportLogic", kind: "lua", path: "ui/transport.lua", ownership: "handwritten" },
      { id: "scopeOverlay", kind: "lua", path: "ui/custom_scope.lua", ownership: "handwritten" },
      { id: "layerStrip", kind: "ui-model", path: "ui/components/layer_strip.ui.json5", ownership: "editor" }
    ]
  },
  dsp: {
    default: "dsp/main_dsp.lua",
    slots: {
      shimmer: { path: "dsp/fx/shimmer.lua", ownership: "handwritten" }
    }
  },
  bindings: [
    { path: "bindings/ui-bindings.json5", ownership: "editor" }
  ],
  themes: [
    { path: "themes/default.theme.json5", ownership: "editor" }
  ]
}
```

The exact syntax is unimportant here.
The point is the role.

---

# 13. Ownership Modes Are Probably Necessary

A very strong idea from the discussion is that every asset/component/file should have an explicit ownership mode.

This is likely essential if the editor is going to stay honest.

## 13.1 Why ownership matters

Without ownership, the system cannot answer:

- may the editor rewrite this file?
- is this file generated?
- is this file user-authored?
- is this file imported legacy source?
- is this asset fully round-trippable?
- is visual editing authoritative here or not?

Without that, everything becomes ambiguous and fragile.

## 13.2 Candidate ownership modes

### A. Handwritten
Meaning:

- user-authored source,
- editor may inspect/edit/attach metadata,
- editor may text-edit it,
- editor may visually manipulate live objects derived from it,
- but source rewriting semantics may be more complex or constrained.

### B. Editor-owned declarative
Meaning:

- full visual ownership,
- editor reads/writes it directly,
- full save/load/round-trip target,
- structure is explicit.

### C. Generated
Meaning:

- emitted by the editor/model/compiler,
- rewritable by generation,
- not intended for freeform manual editing unless user accepts regeneration semantics.

### D. Imported / legacy
Meaning:

- partially understood,
- maybe inspectable,
- maybe partially editable,
- but not fully authoritative.

These exact names are less important than the concept.

## 13.3 Important nuance after the monolith correction

Ownership mode must **not** imply “editable or not editable.”

Handwritten assets still need to be editable.
Ownership mode should instead describe:

- authority semantics,
- rewriting guarantees,
- round-trip guarantees,
- and editor/user responsibility boundaries.

That distinction is crucial.

---

# 14. What “Save” Might Mean in Different Worlds

The meaning of save is currently underspecified because the source-of-truth model is underspecified.

This section captures the likely modes of “save.”

## 14.1 Save in a structured/editor-owned world

For editor-owned declarative assets, save is conceptually straightforward:

```text
editor modifies canonical model
    -> writes declarative files / mappings / themes / manifest
    -> runtime reloads
    -> Canvas tree rebuilt from model
```

This is the clean world.

## 14.2 Save in a handwritten monolithic world

For handwritten Lua, save might mean one or more of:

- text-editor save of the script source,
- script-aware structural rewrite,
- save to an editor-managed region,
- save to a sidecar describing editor overlays/metadata,
- or a more advanced source-projection strategy.

This is much harder.

## 14.3 Transitional possibility: sidecars

A transitional model could use sidecars for handwritten assets:

- source Lua stays handwritten,
- editor saves additional metadata, mappings, or visual edits in sidecars,
- runtime composes them.

Pros:

- does not destroy source,
- easier to implement than full source rewriting,
- lets monoliths remain editable in-editor.

Cons:

- split truth,
- can get messy,
- may not be a satisfying long-term canonical story.

## 14.4 Another possibility: editor-generated structural regions

A Lua source file could contain clearly marked editor-owned regions.
For example:

- structural metadata block,
- generated widget definitions,
- or embedded declarative data region.

Then arbitrary code around it remains handwritten.

This could preserve script-first workflows while giving the editor a safer patch target.

This is not necessarily the final answer, but it is worth keeping on the table.

## 14.5 Important conclusion

The save question cannot be answered cleanly until the system decides:

- what the canonical structured layers are,
- what ownership means,
- and how composition works.

---

# 15. Likely Need for a Hybrid System

The strongest product direction emerging from the discussion is likely a **hybrid model**.

Not:

- pure monolithic freeform scripting only,
- and not pure rigid declarative-only editing only.

But something like:

## 15.1 Declarative where structure matters

Use structured assets for:

- scene/component hierarchy,
- mappings,
- themes,
- project manifests,
- reusable components,
- editor state,
- explicit composition metadata.

## 15.2 Scripted where freedom matters

Use Lua for:

- custom behavior,
- custom widgets,
- advanced draw logic,
- nonstandard control logic,
- procedural composition,
- experimental DSP/behavior systems,
- monolithic script-first workflows if desired.

## 15.3 Why hybrid seems attractive

Because it gives:

- freedom,
- structure,
- composability,
- portability,
- diffability,
- and a more honest editor/user contract.

This may be the least stupid long-term path.

---

# 16. Authoring Modes: Script-First, Model-First, Hybrid

One useful framing is to think in terms of supported authoring modes.

## 16.1 Script-first mode

Characteristics:

- user writes Lua directly,
- monoliths or arbitrary modular structure are allowed,
- maximum freedom,
- editor acts as a strong runtime/inspection/editing environment,
- save/round-trip semantics are harder and may rely on source-aware logic, sidecars, or explicit ownership conventions.

This mode must remain valid.

## 16.2 Model-first mode

Characteristics:

- editor-owned structured assets,
- declarative hierarchy/components,
- explicit mappings/themes/manifests,
- strong save/load/round-trip semantics,
- better diffs,
- better portability,
- stronger composition guarantees.

This mode likely gives the cleanest editor authority.

## 16.3 Hybrid mode

Characteristics:

- declarative structure and composition where useful,
- Lua modules attached for behavior/extensions,
- monolithic or modular Lua still allowed,
- the editor understands some parts structurally and others by reference.

This seems like the likely sweet spot.

---

# 17. The Need for Composability and Portability

Another major theme from the discussion is that long-term the system needs to support not just “saving edits” but also:

- composability,
- portability,
- reusable UI pieces,
- reusable behaviors,
- reusable DSP pieces,
- and a sane project structure.

This is a major reason monolithic Lua cannot remain the sole strategic answer.

## 17.1 Why composability matters

Without composability:

- every UI becomes a one-off blob,
- reuse is painful,
- team collaboration is harder,
- editor tooling cannot reason about reusable pieces,
- projects become harder to scale.

## 17.2 Why portability matters

If users are going to build real interfaces and projects, they need assets that can move cleanly between projects and environments.

That suggests the need for:

- reusable components,
- explicit dependencies,
- clear manifests,
- explicit references,
- and stable contracts.

## 17.3 Example future project shape

Something like:

```text
project/
  manifold.project.json5
  ui/
    main.ui.json5
    components/
      transport.ui.json5
      layer_strip.ui.json5
      waveform_panel.ui.json5
    behaviors/
      transport.lua
      layers.lua
    custom/
      everything.lua
  dsp/
    main_dsp.lua
    fx/
      shimmer.lua
      crusher.lua
  bindings/
    ui-bindings.json5
    midi-bindings.json5
  themes/
    dark.theme.json5
  editor/
    workspace.json5
```

This is illustrative, but captures the kind of project-level assembly the discussion is pointing toward.

---

# 18. Stable Contracts That Likely Need Standardization

Even if the platform supports multiple authoring styles, certain seams likely need strong standardization.

This may be the most important implementation takeaway.

## 18.1 Stable IDs

The system likely needs stable IDs for:

- UI nodes,
- components,
- mappings,
- behaviors,
- bindings,
- maybe DSP graph entities.

Without stable IDs, save/load, composition, mapping persistence, and editor selection all become much weaker.

## 18.2 Component contract

Regardless of how a component is authored, the editor/runtime likely needs to know:

- what it is,
- its stable identity,
- its type,
- its editable props,
- its child slots (if any),
- its exposed events,
- its schema,
- its ownership.

## 18.3 Binding/mapping contract

Mappings probably need a structured representation, not just random callback logic.

A mapping likely needs to describe:

- source widget/property,
- target endpoint/parameter,
- transform mode,
- range,
- curve,
- trigger/toggle semantics,
- conditions,
- maybe conflict policies.

## 18.4 Lifecycle contract

Whether authored declaratively or script-first, UI modules probably need a common host contract:

- init,
- update,
- resized,
- cleanup,
- maybe capabilities metadata.

## 18.5 Exposed schema contract

For visual tools to work, widgets/components need clear schema/exposure information:

- path,
- type,
- range,
- enum choices,
- labels,
- defaults,
- maybe grouping.

That is how the editor can stay useful across mixed authoring styles.

---

# 19. Why Universal Round-Trip Is Probably the Wrong Mental Model

A key emerging insight is:

> The system may need **tiered round-trip semantics**, not universal round-trip for every possible asset.

This is likely the honest answer.

## 19.1 Full round-trip may be realistic for:

- editor-owned declarative assets,
- mapping files,
- themes,
- manifests,
- generated sources,
- explicitly structured components.

## 19.2 Partial/integrated round-trip may be more realistic for:

- monolithic Lua scripts,
- arbitrary handwritten Lua modules,
- custom composition logic,
- advanced DSP scripts,
- imported legacy assets.

And again, partial round-trip does **not** mean “not editable.”
It means the projection/save semantics are more difficult, conditional, or less guaranteed.

## 19.3 Why this is a healthier framing

Because pretending arbitrary code is fully round-trippable is how the editor becomes dishonest.

A tiered model is more realistic and still allows script-first users to remain first-class.

---

# 20. Risks of Getting This Wrong

This discussion surfaced two opposite failure modes.

## 20.1 Failure mode A: over-rigid structure

If the system forces everything into one rigid declarative format:

- script-first users feel punished,
- powerful custom workflows become awkward,
- experimentation slows down,
- the system becomes less expressive,
- users may bypass the editor entirely.

## 20.2 Failure mode B: over-freeform ambiguity

If the system keeps everything as arbitrary freeform Lua forever with no stronger composition/ownership model:

- save/load remains murky,
- round-trip remains weak,
- portability suffers,
- editor authority stays fragile,
- composability remains limited,
- the product never becomes a durable authoring environment.

## 20.3 The real target

The target is a system that allows a **spectrum** of authored assets:

- from fully structured to fully freeform,
- with explicit contracts and ownership,
- without lying about what the editor can reliably own.

That is the balancing act.

---

# 21. Near-Term Strategic Implications

Some concrete implications for near-term planning emerged.

## 21.1 Do not keep making the monolith situation worse

Even before a full canonical model exists, it is probably wise to:

- split giant UI scripts into modules where sensible,
- isolate behavior from layout where possible,
- name reusable pieces more explicitly,
- avoid deepening the “one blob does everything” pattern.

This does not mean killing monolith support.
It means not making future migration harder than it already is.

## 21.2 Do not fake save/load before source-of-truth strategy is thought through

A save button without a coherent ownership/composition story could lock the system into a bad path.

## 21.3 Define contracts before overbuilding visual editing features

More visual editing affordances are great, but the deeper value will depend on:

- what they are editing,
- where that edit is persisted,
- who owns the representation,
- and what save/reload means.

## 21.4 Keep script-first workflows respected during design

Any future strategy should explicitly test against this constraint:

> Can a user still write a monolithic handwritten Lua UI/DSP script and remain a first-class citizen in the editor?

If the answer becomes “not really,” the design is probably drifting in a bad direction.

---

# 22. Candidate Strategic Principles

This section captures a likely principle set that emerged from the discussion.

## Principle 1: Manifest/composition should likely be canonical

The project’s assembly/composition graph should probably live in a structured, diffable format.

## Principle 2: Ownership must be explicit

Every meaningful asset should declare/editor-understand whether it is handwritten, editor-owned, generated, imported, etc.

## Principle 3: Monolithic handwritten scripts remain first-class editable assets

They must not be demoted into second-class “legacy only” status.

## Principle 4: Editable does not automatically mean trivially rewritable

The system must distinguish:

- editor usability,
- source-projection difficulty,
- and round-trip guarantees.

## Principle 5: Structure should exist where it creates leverage

Structure is especially valuable for:

- manifests,
- mappings,
- themes,
- reusable scene/components,
- stable IDs,
- editor-owned assets.

## Principle 6: Freedom should exist where users need expressive power

Freedom is especially valuable for:

- custom behavior,
- nonstandard widgets,
- procedural logic,
- experimental UIs,
- advanced DSP scripting,
- and monolithic/hybrid workflows.

## Principle 7: Hybrid is probably the real product path

A hybrid declarative + scripted world likely gives the best balance of power and durability.

## Principle 8: The editor must remain honest

It should not pretend universal round-trip if the underlying semantics do not support it.

---

# 23. Open Questions Requiring Deep Consideration

This section is likely the most useful for second-opinion review.

## 23.1 What should the canonical structured layers be?

Candidates include:

- project manifest,
- declarative scene/components,
- mappings,
- themes,
- editor state,
- maybe generated source artifacts.

Which of these are required, and in what order?

## 23.2 What should the save strategy be for handwritten monoliths?

Possibilities include:

- direct text editing only,
- source-aware structural rewrites,
- generated regions,
- sidecars,
- import/export workflows,
- mixed source + metadata projections.

This remains unresolved.

## 23.3 Should declarative UI models be pure data, Lua-table data, JSON5, TOML, something custom?

Each choice has tradeoffs in:

- portability,
- tooling,
- schema validation,
- runtime simplicity,
- user ergonomics,
- and boundary clarity.

## 23.4 How should composition work across mixed asset kinds?

How does a declarative component reference Lua behavior?
How does a monolithic Lua script participate in a structured project?
How do mappings attach to mixed-origin objects?

## 23.5 How should IDs be generated/maintained?

Stable identity is going to matter a lot.
How does the system preserve IDs across imports, refactors, generated assets, and monolith edits?

## 23.6 What are the round-trip tiers and guarantees?

The system likely needs explicit guarantees per asset kind. What are they?

## 23.7 How much editor authority should exist over handwritten assets?

Should visual edits on a monolithic script:

- directly rewrite source,
- stage changes for explicit accept/apply,
- store sidecars,
- or use some mixed projection model?

This is not settled.

## 23.8 Is the long-term goal one representation or a federation of representations?

The current discussion leans toward multiple representations under one structured composition system, but this should be tested carefully.

---

# 24. Things This Discussion Explicitly Does **Not** Conclude Yet

To be clear, this discussion does **not** yet settle:

- the final file format(s),
- the final manifest schema,
- the exact save strategy for handwritten monoliths,
- the exact round-trip mechanism,
- the exact ownership model names/behavior,
- the exact project layout,
- or the exact migration plan.

This is a strategy/problem-framing discussion, not a finalized architecture spec.

---

# 25. Provisional Synthesis

The broad synthesis from the discussion is:

1. The editor architecture is on a strong path.
2. The product is not complete until it solves source-of-truth, composition, persistence, and mixed authoring semantics.
3. The editor should not force everyone into one rigid authoring mode.
4. It should likely support a spectrum of assets from structured to freeform.
5. Monolithic handwritten scripts must remain first-class editable citizens.
6. The system likely needs a structured manifest/composition spine.
7. It also likely needs stronger standardized contracts:
   - IDs,
   - component schemas,
   - mappings,
   - lifecycle,
   - ownership.
8. A hybrid declarative + scripted ecosystem is currently the strongest-seeming direction.
9. Save/load/round-trip should probably be thought of as tiered capabilities, not universally identical behavior.
10. The central question is not “what one format should everything use?” but:

> **Which layers need structure, which layers need freedom, and how do we compose them honestly?**

That is probably the best one-sentence summary of the strategic problem.

---

# 26. Suggested Next-Step Questions for a Second Opinion

If this doc is being handed to another model/reviewer, useful questions to ask include:

## A. Architecture / source of truth
- What should be the canonical structured layers?
- Is manifest-first the right spine?
- Should there be one canonical UI representation or multiple?

## B. Mixed authoring support
- How should monolithic handwritten Lua remain first-class while still supporting structured editor workflows?
- What save/rewrite strategies are realistic for handwritten code?
- How should ownership and authority be expressed?

## C. Composition / portability
- What project structure best supports mixed declarative/scripted assets?
- How should reusable components and behavior modules compose?
- What should stable IDs look like?

## D. Editor semantics
- What are the right round-trip tiers?
- What is the right user-facing language for “editable,” “rewritable,” and “editor-owned”?
- How should the editor expose save/apply semantics for handwritten vs editor-owned assets?

## E. Migration strategy
- How should the system transition from today’s monolithic Lua world toward a more composable future without invalidating script-first workflows?

---

# 27. Final Bottom Line

The discussion repeatedly comes back to this:

> The editor is already a strong platform, but the hardest unsolved problem is not the shell or the widgets. It is building a system where **freeform authored code and structured editable assets can coexist without either crippling the editor or betraying script-first users**.

That is the real design problem.

And the most important correction to preserve is:

> **Handwritten monolithic scripts must remain first-class editable assets in the editor.**

The challenge is not whether they are allowed.
The challenge is how to give them honest, powerful, durable save/composition semantics alongside structured, diffable, extensible assets.

That is the thing requiring deep consideration.

---

# 28. Addendum: Condensed Thesis Statements

For convenience, here are the most compact “thesis statements” from the discussion.

1. The editor is already more of a platform than a simple plugin UI.
2. The platform architecture is ahead of the product-completeness curve.
3. The main missing piece is a robust source-of-truth / composition strategy.
4. Monolithic handwritten Lua should remain valid and first-class.
5. Editable is not the same as trivially rewritable.
6. One rigid authoring format is probably the wrong answer.
7. A structured manifest/composition layer is probably necessary.
8. A hybrid declarative + scripted ecosystem is currently the strongest candidate direction.
9. Round-trip likely needs to be tiered rather than universally identical.
10. The core question is how to support both freedom and structure without the editor becoming dishonest.

---

# 29. Potential Follow-On Docs

If this discussion is accepted as useful, likely follow-on docs would be:

- `EDITOR_MANIFEST_AND_OWNERSHIP_MODEL.md`
- `EDITOR_SAVE_AND_ROUND_TRIP_SEMANTICS.md`
- `EDITOR_MIXED_AUTHORING_MODES.md`
- `EDITOR_MONOLITH_SCRIPT_SUPPORT_STRATEGY.md`
- `EDITOR_COMPONENT_AND_BINDING_CONTRACTS.md`
- `EDITOR_FORMAT_OPTIONS_EVALUATION.md`
- `EDITOR_MIGRATION_FROM_MONOLITHIC_LUA.md`

Those should come **after** more explicit review of the strategic framing in this doc.
