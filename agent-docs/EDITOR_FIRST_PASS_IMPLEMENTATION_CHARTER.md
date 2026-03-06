# Editor First Pass Implementation Charter

**Status:** Approved starting point for implementation planning  
**Audience:** Worker agent(s) doing the first pass  
**Related docs:**
- `EDITOR_SYSTEM_OVERVIEW.md`
- `EDITOR_AUTHORING_AND_SOURCE_OF_TRUTH_DISCUSSION.md`
- `EDITOR_PROJECT_FORMAT_AND_AUTHORING_SPEC.md`

---

# 1. Purpose

This document defines the **first pass** of the new editor/project-format work.

This first pass is **not** the full authoring system.
It is a **controlled proving pass** whose job is to:

1. establish the first real canonical project layout,
2. establish the first real canonical structured UI/DSP authoring pattern,
3. manually recreate selected existing UI and DSP scripts in that new model,
4. prove the runtime/editor can load the new model **alongside** the existing legacy work,
5. and expose the real missing infrastructure/features before we attempt broader migration, override systems, or codegen/export.

This pass is intentionally practical.
We are not trying to solve every future problem at once.
We are trying to create the first real end-to-end path that proves the direction is viable.

---

# 2. Core Thesis of First Pass

## First pass is not generic infrastructure-first work.

It is:

> **A manual recreation of selected existing UI and DSP work into the new project model, plus only the minimum runtime/editor support needed to make that recreated project real and usable.**

That means:

- we will **manually** recreate some of our current scripts/UI/DSP into the new model,
- we will define the **canonical first-pass way** to do that,
- and we will prove that the new project-based work can load and run **alongside** the current legacy system.

This is important.
If we skip the manual recreation step and just build abstract infrastructure, we will likely design the wrong abstractions.

Manual recreation is not wasted effort.
It is the design validation step.

---

# 3. First Pass Goals

The first pass must achieve all of the following:

## 3.1 Define the first canonical project shape
We need one concrete project layout that becomes the reference example for the new model.

## 3.2 Define the first canonical structured authoring pattern
We need one concrete answer for:
- how UI structure is written,
- how behavior logic is separated,
- how DSP is organized,
- how project files are discovered,
- and what the editor/runtime actually load.

## 3.3 Recreate real existing functionality
We must not prove this on a fake toy demo.
We must prove it on real current work.

## 3.4 Prove coexistence with the legacy system
The new model must not require ripping out the current world first.
The new project-backed work must load while the current monolith/legacy flows still exist.

## 3.5 Expose missing editor/runtime features honestly
The first pass should deliberately reveal:
- what editor support is still missing,
- what runtime support is still missing,
- what schema/format choices are wrong or incomplete,
- and what additional phases are actually needed.

---

# 4. What First Pass Is Explicitly NOT

To keep scope sane, first pass is **not** any of these:

## 4.1 Not a full migration of all current scripts
We are not converting every UI and DSP script in the project.

## 4.2 Not generic codegen/export
We are not building monolith → structured export in first pass.
That comes later, after we prove both ends manually.

## 4.3 Not the full monolith override system
The project-format spec includes a monolith override layer, but first pass is **not** primarily about implementing the generic override system.
That is later.

## 4.4 Not the full editor feature set
We are not trying to complete every planned editor feature during this pass.
The first pass only needs enough editor support to make the new structured assets real and editable.

## 4.5 Not the final DSP project authoring architecture
DSP must be included in first pass, but we are not trying to solve the entire future DSP authoring ecosystem in one shot.
We are defining the first canonical pattern that works for selected existing DSP.

## 4.6 Not a final polished product UX
This is a proving pass, not the final user-facing polished workflow.
The UX must be honest and usable, but polish is not the main goal.

---

# 5. The Concrete First Pass Strategy

## 5.1 Main approach
We will create one **real project directory** in the new model and use it to manually recreate selected existing UI and DSP work.

That means:
- manually splitting/rewriting current monolithic work into the new shape,
- not waiting for codegen,
- not pretending automation exists yet,
- and using that manual work to define the canonical first-pass pattern.

## 5.2 Why manual recreation comes first
Manual recreation forces us to make explicit decisions about:
- structure vs behavior,
- UI components vs root scene,
- project directory conventions,
- IDs,
- behavior module API,
- DSP module shape,
- and what the runtime/editor actually need to support.

If we cannot manually express the current real UI and DSP sanely in the new model, then the model is not ready.

---

# 6. Canonical Location for First Pass Projects

## 6.1 UserScriptsDir is the canonical root, not a flat project bucket
The configured **UserScriptsDir** should be treated as the top-level user asset root.

Inside it, first pass should distinguish:

```text
<UserScriptsDir>/
  ui/        # user-global UI assets / loose scripts / reusable widgets/components
  dsp/       # user-global DSP assets / loose scripts / reusable modules
  projects/  # actual projects
    ManifoldDefault/
      manifold.project.json5
      ui/
      dsp/
      themes/
      assets/
      editor/
```

This is important because it keeps three different things separate instead of muddling them together:
- user-global UI assets,
- user-global DSP assets,
- and actual project directories.

## 6.2 Asset scopes
The intended model is:

### Project-local
Assets inside `projects/<ProjectName>/...`.
These are the default/primary assets for a given project.

### User-global
Assets inside `<UserScriptsDir>/ui` and `<UserScriptsDir>/dsp`.
These are reusable user-authored assets that may be shared across projects.

### System-global
Built-in/manifold-shipped assets from the application/repo itself.
These are distinct from user-global assets and should not be conflated with them.

## 6.3 Discovery behavior
The runtime/editor should scan the configured UserScriptsDir with these categories in mind:

### Projects
Directories under `<UserScriptsDir>/projects/` containing `manifold.project.json5` are **projects**.

### User-global loose assets
Loose `.lua` scripts and future reusable assets under `<UserScriptsDir>/ui/` and `<UserScriptsDir>/dsp/` are **user-global assets**.

### Legacy coexistence
Existing loose scripts should still be supportable during the transition.

## 6.4 Dev usage
During development, the configured UserScriptsDir may point at a dev/testing directory. That is fine.
The important thing is that projects live under `projects/` and not mixed directly into the same bucket as global UI/DSP assets.

---

# 7. First Pass Project: The Reference Project

We need one real reference project that becomes the first-pass proving target.

## 7.1 Proposed reference project name
For planning purposes:

```text
<UserScriptsDir>/projects/ManifoldDefault/
```

The exact name can change, but there should be one explicit reference project that the first pass targets.

## 7.2 Role of this reference project
This project is the first canonical example of:
- project manifest,
- structured UI scene,
- reusable UI components,
- behavior modules,
- project-scoped DSP entry,
- and editor save/load support for the new model.

It is not a throwaway demo.
It is the first real project-backed implementation of the default Manifold work.

---

# 8. Exact First Pass Scope

The first pass needs a **named scope**, not vague “some stuff.”

## 8.1 UI scope
We will manually recreate the current default performance UI, using the existing `looper_ui.lua` as the behavioral/visual reference.

This includes:
- transport controls,
- capture plane,
- layer strips,
- relevant live state-driven visuals,
- and enough behavior to make the UI genuinely usable.

## 8.2 DSP scope
We will also recreate selected existing DSP entry/configuration in a project-backed shape so that the new project proves UI + DSP coexistence, not UI alone.

This does **not** mean solving every DSP authoring problem.
It means:
- selecting the current default/representative DSP entry,
- placing it into the new project structure,
- and proving that the project-backed UI can drive/load it correctly.

## 8.3 Editor scope
The editor must support enough functionality to:
- load the project,
- render the structured UI,
- select/edit widgets from the structured UI,
- save `.ui.lua` changes back to source,
- and clearly indicate that this asset is editor-owned structured content.

## 8.4 Legacy coexistence scope
The existing legacy scripts must still be loadable during this pass.
We are proving coexistence, not replacing everything in one shot.

---

# 9. Explicit First Pass Deliverables

First pass is complete only when the following concrete deliverables exist.

## Deliverable 1 — A real project-backed directory under `UserScriptsDir/projects`
There must be one actual project directory containing:
- `manifold.project.json5`
- `ui/`
- `dsp/`
- `themes/`
- `editor/`
- optionally `assets/`

## Deliverable 2 — A manually recreated structured root UI
The project must contain a real root structured UI scene, not a placeholder.

## Deliverable 3 — Reusable structured UI components
At least the repeated/practically reusable portions of the current UI must be split into component files where that makes sense.

## Deliverable 4 — Handwritten behavior modules
The dynamic logic that should not live in pure-data `.ui.lua` must be separated into behavior modules.

## Deliverable 5 — Project-scoped DSP entry
The project must contain a real DSP entry/configuration path in the new directory model and it must load/work with the recreated UI.

## Deliverable 6 — Runtime support for project-backed loading
The runtime must be able to discover the project under `UserScriptsDir/projects`, load the manifest, resolve the project root, and instantiate the project-backed UI.

## Deliverable 7 — Editor support for structured asset save/load
The editor must be able to load/edit/save the new `.ui.lua` assets directly.

## Deliverable 8 — Legacy coexistence proof
The existing legacy/monolithic system must still work while this project-backed path also works.

## Deliverable 9 — Canonical authoring example
The result must serve as the first canonical reference for “how to author UI and project-backed DSP in the new model.”

---

# 10. Proposed First Pass Project Layout

This is the first-pass target layout. Exact filenames can be adjusted, but the shape should remain close.

```text
<UserScriptsDir>/
  ui/
  dsp/
  projects/
    ManifoldDefault/
      manifold.project.json5
      ui/
        main.ui.lua
        components/
          transport.ui.lua
          capture_plane.ui.lua
          layer_strip.ui.lua
        behaviors/
          transport.lua
          capture_plane.lua
          layer_strip.lua
          shared_state.lua
      dsp/
        main.lua
      themes/
        dark.lua
      editor/
        workspace.json5
      assets/
        (optional in first pass; can be mostly empty)
```

## Notes
- `main.ui.lua` is the root structured scene.
- `components/` contains structured reusable UI pieces.
- `behaviors/` contains handwritten logic modules.
- `dsp/main.lua` is the project-scoped DSP entry for first pass.
- `themes/dark.lua` can be minimal but should exist if the project references a theme.
- `editor/workspace.json5` can be minimal scaffolding; it does not need to be feature-complete in first pass.

---

# 11. Canonical First Pass Authoring Pattern

The first pass must define a canonical answer for how to author the new model.

## 11.1 Structure lives in `.ui.lua`
Structured UI files:
- are editor-owned,
- are pure-data Lua tables,
- define layout/hierarchy/components/basic properties,
- and are mechanically loadable and saveable by the editor.

## 11.2 Dynamic logic lives in behavior modules
Handwritten logic that is not appropriate for the pure-data layer belongs in `ui/behaviors/*.lua`.

Examples:
- rec latch logic,
- play/pause toggling logic,
- state-driven visual updates,
- dynamic text/color changes,
- other behavior requiring procedural logic.

## 11.3 DSP is project-scoped, not ad hoc
The project must have an explicit DSP entry under `dsp/`.
The first pass should define the canonical way the project references/loads DSP.

## 11.4 Theme is explicit if used
If theme support is involved in the recreated project, it should come through an explicit project theme path and not hidden runtime magic.

---

# 12. First Pass Means Manual Recreation, Not Automatic Conversion

This needs to be said explicitly.

## 12.1 We are not codegen-exporting the current UI in first pass
We are manually recreating it in the new structure.

## 12.2 We are not trying to preserve every source-level pattern from the monolith
The current monolith is the **reference behavior**, not the source format we are preserving in place.

## 12.3 We are using manual recreation to define the canonical model
The point is to learn:
- what belongs in structure,
- what belongs in behavior,
- what should become reusable,
- what the schema needs,
- and what editor/runtime support is still missing.

---

# 13. The Exact UI Work We Will Do

This section should be treated as a checklist, not vague intent.

## 13.1 Audit current `looper_ui.lua`
We must first break it down into categories:

### A. Root structure
Top-level panels/containers/layout groupings.

### B. Reusable structures
Repeated pieces that should become components.

### C. State normalization/helpers
Utility logic that supports the UI but is not direct widget behavior.

### D. Dynamic widget behavior
Callbacks and update-time behavior.

### E. Visual/runtime interactions
Waveforms, scrub interactions, dynamic colors/labels, etc.

This audit should produce a mapping from old monolith regions to new structured/behavior files.

## 13.2 Manually create `main.ui.lua`
This file should:
- define the root scene,
- define root layout structure,
- reference components,
- and act as the top-level structured entry.

## 13.3 Manually create `transport.ui.lua`
This should capture the transport row structure and static widget setup.

## 13.4 Manually create `capture_plane.ui.lua`
This should capture the capture-plane structure and static composition.

## 13.5 Manually create `layer_strip.ui.lua`
This should be a reusable structured component representing one layer strip.
The first pass should prove that repeated structures can be represented this way.

## 13.6 Manually create corresponding behavior modules
At minimum likely:
- `transport.lua`
- `capture_plane.lua`
- `layer_strip.lua`
- possibly `shared_state.lua` or equivalent helper module if state normalization/shared helpers need a shared home

## 13.7 Preserve the old monolith as reference during development
The current `looper_ui.lua` remains the comparison baseline while the new project-backed version is built and tested.

---

# 14. The Exact DSP Work We Will Do

DSP must be included in first pass, but the scope must be pragmatic.

## 14.1 Pick the project-backed DSP entry
We must explicitly decide what `dsp/main.lua` is in first pass.
This should point at the default/representative current DSP path rather than inventing a fake one.

## 14.2 Define project-level DSP loading convention
The first pass must define the canonical way the project references its DSP entry.
This includes:
- where the DSP file lives,
- how the manifest points to it,
- and how the runtime resolves and loads it.

## 14.3 Prove UI ↔ DSP coexistence
The recreated UI must actually work with the project-backed DSP entry.
This is not a pass if the UI loads but the DSP side is still effectively outside the project model.

## 14.4 Keep DSP scope limited to proving the model
We are not trying to solve all project-scoped DSP composition or slot management in first pass.
We are proving one canonical path that works with real existing DSP.

---

# 15. Minimum Runtime Support Required for First Pass

First pass should only build the runtime support needed to make the manually recreated project work.

## 15.1 Project discovery under `UserScriptsDir/projects`
The runtime must:
- scan `UserScriptsDir/projects`,
- detect project directories containing `manifold.project.json5`,
- recognize `UserScriptsDir/ui` and `UserScriptsDir/dsp` as user-global asset roots,
- and still support loose legacy scripts/assets during the transition.

## 15.2 Manifest loading
The runtime must load the thin manifest and resolve:
- project root,
- UI root,
- DSP entry,
- theme path if present.

## 15.3 Structured `.ui.lua` loading
The runtime must load the structured root scene and instantiate it.

## 15.4 Component loading
The runtime must support component references from the root scene.

## 15.5 Behavior module loading
The runtime must attach behavior modules to the structured scene/components.

## 15.6 Project-relative path resolution
The runtime must resolve all project-relative references from the project root.

## 15.7 Legacy coexistence
The runtime must still load old scripts directly when operating on loose legacy files.

---

# 16. Minimum Editor Support Required for First Pass

Again: minimum needed, not the full future editor.

## 16.1 Open the project-backed UI as a real editable asset
The editor must understand that `.ui.lua` assets in this first-pass project are editor-owned structured assets.

## 16.2 Selection and inspector must work on structured widgets
The editor must still be able to select and inspect widgets from the recreated structured UI.

## 16.3 Save must write `.ui.lua` files directly
This is the first real round-trip proof for structured assets.

## 16.4 Behavior files remain handwritten/text-edited
The editor may expose behavior modules in the script editor, but it should not attempt to visually own them in first pass.

## 16.5 The editor must clearly communicate asset mode
At least minimally, the editor should make it clear that these structured assets are editor-owned and directly saveable.

---

# 17. What We Intentionally Leave for Later

To keep first pass achievable, the following are not required before we proceed.

## 17.1 Generic monolith override system
That is later.

## 17.2 Codegen export from monoliths
That is later, after this manual recreation proves the target model.

## 17.3 Full asset browser
Not needed for the first pass proving path.

## 17.4 Full binding editor
Not needed yet if simple binding conventions are sufficient for the manually recreated project.

## 17.5 Full theme system
Only minimal theme support required if the first-pass project references a theme.

## 17.6 Every current widget type
Only the widgets actually needed by the manually recreated project need to be supported in first pass.

## 17.7 Full project-scoped DSP composition/migration system
Only the project-backed DSP entry path required for this project needs to work.

---

# 18. Feature Shipping Policy During First Pass

This part is important operationally.
We are still shipping work while doing this refactor.

## 18.1 New feature work touching migrated UI should land in the new project-backed path
Once a portion of the UI has been recreated in the first-pass project, feature work in that area should go to the new structure, not the old monolith.

## 18.2 Unmigrated areas may still use the legacy path
If some area has not yet been recreated, it can still receive feature work in the old path — but that must be treated as known migration debt.

## 18.3 We must not indefinitely keep landing everything in the monolith
If we do that, the migration never converges.
So once the new project-backed version is viable, it becomes the active home for that scope.

This policy should be made explicit to avoid confusion.

---

# 19. Concrete Workstreams

## Workstream A — Freeze first-pass target and scope
Tasks:
- choose exact project name/location under `UserScriptsDir/projects`,
- confirm top-level user roots under `UserScriptsDir` (`projects/`, `ui/`, `dsp/`),
- list exact scripts/DSP in scope,
- list exact features that must still work,
- list exact out-of-scope items.

## Workstream B — Audit current default UI and DSP
Tasks:
- audit `looper_ui.lua`,
- identify structural boundaries,
- identify reusable component candidates,
- identify behavior/helper logic,
- identify DSP entry and current loading assumptions.

## Workstream C — Define the minimum structured schema and behavior API
Tasks:
- lock first-pass `.ui.lua` shape,
- lock first-pass behavior module API,
- lock project-relative loading conventions,
- lock root/component reference semantics for first pass.

## Workstream D — Manually recreate the default project
Tasks:
- write `main.ui.lua`,
- write component files,
- write behavior modules,
- create manifest,
- place DSP entry in project structure,
- create minimal theme/editor files as needed.

## Workstream E — Runtime support
Tasks:
- project discovery under `UserScriptsDir/projects`,
- awareness of user-global roots under `UserScriptsDir/ui` and `UserScriptsDir/dsp`,
- manifest loading,
- structured UI loading,
- component loading,
- behavior module loading,
- project-relative resolution,
- legacy coexistence.

## Workstream F — Editor support
Tasks:
- open structured assets,
- selection/inspector works,
- save back to `.ui.lua`,
- script editor for behavior files,
- minimal mode messaging if needed.

## Workstream G — Validation and comparison
Tasks:
- compare new project-backed UI behavior against legacy `looper_ui.lua`,
- compare DSP behavior/loading path,
- identify missing editor/runtime support,
- record problems and follow-on phases.

---

# 20. Proposed Sequence

## Step 1 — Freeze first-pass scope
No coding before scope is named.

## Step 2 — Audit current default UI and DSP
Understand what we are recreating.

## Step 3 — Lock first-pass structured conventions
Do not leave the minimum schema/behavior API vague.

## Step 4 — Manually author the first-pass project files
Create the new project-backed version by hand.

## Step 5 — Implement runtime support needed to load that project
No extra platform work beyond what the project actually needs.

## Step 6 — Implement editor save/load support for structured assets
Make the new project actually editable.

## Step 7 — Validate coexistence with the current legacy system
Both paths must still work.

## Step 8 — Continue feature work against the recreated project where applicable
This is where the new structure proves whether it is actually viable for ongoing development.

---

# 21. Acceptance Criteria

First pass is successful only if all of the following are true.

## 21.1 Project discovery works
A project directory under the configured `UserScriptsDir/projects` is detected and loaded correctly.

## 21.2 The recreated project loads as a real working UI
The structured replacement for the current default UI must render and function in practice, not just load partially.

## 21.3 Project-backed DSP loads and works with the recreated UI
The new project path must prove UI + DSP together.

## 21.4 The editor can edit and save structured `.ui.lua` assets
This is essential. Without this, we have only a new runtime format, not a new authoring path.

## 21.5 Legacy work still loads alongside it
The new model must coexist with the current legacy model during this phase.

## 21.6 The recreated project becomes the first canonical example
It should be possible to point to this project and say:

> “This is the first-pass canonical way to structure a Manifold project in the new model.”

## 21.7 Missing next-step needs are made explicit
The first pass should leave us with a concrete list of what phase 2 actually needs, based on reality rather than speculation.

---

# 22. Expected Outputs After First Pass

At the end of first pass, we should have:

1. one real project-backed default project under `UserScriptsDir/projects`,
2. one real structured recreation of current default UI,
3. one real project-backed DSP entry setup,
4. one real runtime path for project-backed loading,
5. one real editor path for direct `.ui.lua` save/load,
6. a validated first canonical authoring pattern,
7. and a grounded understanding of what the next pass actually needs.

---

# 23. Follow-On Work After First Pass

Once first pass succeeds, likely next work includes:

- generic monolith override system,
- codegen export from monolith → structured project,
- richer structured component semantics,
- better binding/mapping systems,
- asset browser and asset-driven widget support,
- broader DSP project authoring structure,
- better theme layering,
- and broader migration of additional current scripts.

But those come **after** the first-pass proving work in this document.

---

# 24. Final Summary

The first pass is a **manual proving pass**.
It is not trying to finish the whole architecture.

It is trying to do one very important thing correctly:

> **recreate selected existing UI and DSP work in the new project model, define the canonical first-pass way to do it, and prove that the runtime/editor can load and use that work alongside the legacy system.**

That is the right first milestone because it forces the design to become real.

If the new model cannot cleanly host a manually recreated version of our actual current work, then the model is not ready.

If it can, then we have the first real foundation to proceed with broader migration and tooling.
