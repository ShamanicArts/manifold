# Editor First Pass Work Plan

**Status:** Active working doc  
**Purpose:** turn the first-pass charter into concrete implementation phases, tasks, and microtasks so work can start immediately.  
**Use this doc as the execution plan.** The other docs are context; this is the one to work from.

Related context docs:
- `EDITOR_SYSTEM_OVERVIEW.md`
- `EDITOR_AUTHORING_AND_SOURCE_OF_TRUTH_DISCUSSION.md`
- `EDITOR_PROJECT_FORMAT_AND_AUTHORING_SPEC.md`
- `EDITOR_FIRST_PASS_IMPLEMENTATION_CHARTER.md`

---

# 0. What This Pass Actually Is

This pass is:

> **Manual recreation of the current default UI + default DSP entry into the new project model, plus the minimum runtime/editor support required to load, edit, save, and run it alongside the legacy system.**

This pass is **not**:
- generic codegen/export
- full monolith override support
- full asset browser
- full mapping editor
- full migration of every script
- all editor polish

If a task does not directly help us prove the manually recreated project works, it is probably scope creep.

---

# 1. Final Deliverable For This Pass

At the end of this pass, we should have a real project under the configured `UserScriptsDir` that:

1. contains `manifold.project.json5`
2. contains a structured root UI (`main.ui.lua`)
3. contains structured components for the main default UI
4. contains handwritten behavior modules for dynamic logic
5. contains a project-scoped DSP entry
6. loads in the runtime/editor as a real project
7. can be edited and saved through the editor for structured UI assets
8. works alongside the existing legacy monolithic scripts

---

# 2. Execution Rules

## 2.1 One working doc
This file is the active work plan. Do not create more planning docs unless absolutely necessary.

## 2.2 Prefer proof over abstraction
Every phase must produce something real and testable.

## 2.3 Manual first, automation later
If a decision can be clarified by manually recreating current work, do that before inventing generalized automation.

## 2.4 Keep legacy working
Do not break the ability to load current legacy scripts while building the new path.

## 2.5 New complexity must earn its place
If a task adds complexity but does not unblock the first-pass proof, defer it.

---

# 3. Reference Target Project

## 3.1 Project name
Use this as the first-pass reference target unless there is a strong reason to rename it:

```text
<UserScriptsDir>/projects/ManifoldDefault/
```

## 3.2 Target layout

```text
<UserScriptsDir>/
  ui/          # user-global UI assets / loose scripts / reusable pieces
  dsp/         # user-global DSP assets / loose scripts / reusable pieces
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
```

## 3.2.1 Asset scopes for first pass
We need to keep three different asset scopes distinct:

- **project-local**: assets inside `projects/<ProjectName>/...`
- **user-global**: assets inside `<UserScriptsDir>/ui` and `<UserScriptsDir>/dsp`
- **system-global**: built-in/manifold-shipped assets from the app/repo itself

For first pass, project-local assets are the main target.
User-global and system-global assets should be treated as separate concepts even if the first loader implementation only partially supports them.

## 3.3 Legacy references during migration
We will use the existing legacy files as behavioral/visual references during migration, but they are not the source of truth for the new project.

Primary reference files:
- `manifold/ui/looper_ui.lua`
- current default DSP entry path used by existing settings/runtime

## 3.4 Current phase-1 findings (2026-03-06)
These are the concrete findings from the initial audit and should be treated as the current working assumptions unless replaced by implementation reality.

### Actual target project path for this repo
```text
/home/shamanic/dev/my-plugin/UserScripts/projects/ManifoldDefault/
```

### Current settings reality
- This repo now has a repo-local `.manifold.settings.json`.
- It points at this repo for active first-pass work:
  - `defaultUiScript = /home/shamanic/dev/my-plugin/manifold/ui/looper_ui.lua`
  - `devScriptsDir = /home/shamanic/dev/my-plugin/manifold/ui/`
  - `dspScriptsDir = /home/shamanic/dev/my-plugin/manifold/dsp/`
  - `userScriptsDir = /home/shamanic/dev/my-plugin/UserScripts`
- There is still a fallback user config at `~/.config/Manifold/settings.json` pointing at `/home/shamanic/dev/my-plugin-experiment/...`, but the repo-local config should now override that when running from this repo.

### Current in-repo directory state
- `UserScripts/`
- `UserScripts/projects/`
- `UserScripts/ui/`
- `UserScripts/dsp/`
- legacy transitional dirs currently also exist:
  - `UserScripts/UI/`
  - `UserScripts/DSP/`
- `UserScripts/projects/` is now the canonical first-pass staging root for actual projects in this repo.
- `UserScripts/ui/` and `UserScripts/dsp/` are reserved for user-global assets.

### Current default DSP entry used by runtime
- `manifold/core/BehaviorCoreProcessor.cpp` currently auto-loads:
  - `juce::File(dspScriptsDir).getChildFile("looper_primitives_dsp.lua")`
- So the effective current default DSP target for first pass is:
  - `manifold/dsp/looper_primitives_dsp.lua`
- `manifold/dsp/default_dsp.lua` exists, but it is **not** the runtime default path for the looper behavior stack.

### Current `looper_ui.lua` structure summary
The current UI monolith breaks down cleanly into these first-pass regions:

1. **Helpers/state normalization**
   - command helpers
   - path helpers
   - speed/scrub helpers
   - mode formatting
   - state normalization
   - layer state label/colour helpers

2. **Transport panel**
   - `transport` panel
   - `tempo` number box
   - `targetBpm` number box
   - `linkIndicator` label
   - `mode` dropdown
   - `rec` button
   - `playpause` button
   - `stop` button
   - `overdub` toggle
   - `clearall` button

3. **Capture plane**
   - `capture` panel
   - `captureTitle` label
   - 9 visual strip panels (`strip_1` ... `strip_9`)
   - 9 interactive hit regions (`segment_hit_1` ... `segment_hit_9`)
   - custom draw logic for strip waveform peaks / hover / armed state
   - commit-vs-forward click behavior depending on mode

4. **Layer strip rows**
   - 4 repeated layer panels (`layer0` ... `layer3`)
   - per-layer labels/state/bars labels
   - per-layer waveform view with scrub behavior
   - per-layer speed knob
   - per-layer volume knob
   - per-layer mute/play/clear buttons
   - panel click selects active layer

5. **Layout/update responsibilities**
   - `ui_resized` owns all geometry/layout math
   - `ui_update` owns transport state reflection, layer visual state reflection, scrub restoration handling, mute/play label changes, waveform playhead/colour updates

### First-pass old → new mapping baseline
- transport structure → `ui/components/transport.ui.lua`
- transport behavior/state reflection → `ui/behaviors/transport.lua`
- capture structure → `ui/components/capture_plane.ui.lua`
- capture drawing/interaction behavior → `ui/behaviors/capture_plane.lua`
- repeated layer row structure → `ui/components/layer_strip.ui.lua`
- per-layer dynamic behavior/scrub logic → `ui/behaviors/layer_strip.lua`
- shared helper/state normalization logic → `ui/behaviors/shared_state.lua`
- project DSP entry → `dsp/main.lua` wrapping or recreating current `looper_primitives_dsp.lua` path

---

# 4. Scope Lock

## 4.1 In scope

### UI
- default performance UI equivalent to current `looper_ui.lua`
- transport area
- capture plane
- layer strip component reused across layers
- enough state-driven behavior to make it genuinely usable

### DSP
- one real project-backed DSP entry
- enough wiring so the project-backed UI works with that DSP entry

### Editor/runtime
- project discovery under `UserScriptsDir/projects`
- awareness of user-global asset roots under `UserScriptsDir/ui` and `UserScriptsDir/dsp`
- manifest loading
- structured `.ui.lua` loading
- component references
- behavior module attachment
- editor save/load for structured UI assets
- coexistence with legacy scripts

## 4.2 Out of scope
- generic monolith override system
- monolith-to-structured export/codegen
- full mapping editor
- full asset browser
- full theme architecture
- every widget type in the system
- migration of all scripts/UI modes
- complete DSP project architecture for every case

---

# 5. Phase Plan Overview

This pass is divided into **7 implementation phases**:

1. **Freeze target + audit current work**
2. **Create the reference project skeleton**
3. **Lock the first-pass structured UI and behavior contracts**
4. **Manually recreate the default UI into structured assets**
5. **Add runtime support for project-backed loading**
6. **Add editor support for structured asset editing/saving**
7. **Validate against legacy behavior and switch active development path**

Each phase has explicit tasks and microtasks below.

---

# 6. Phase 1 — Freeze Target + Audit Current Work

## Goal
Stop hand-waving. Precisely identify what is being recreated and how current code maps to the new structure.

## Exit criteria
- exact current UI scope is mapped
- exact current DSP scope is chosen
- target files for the new project are named
- unresolved decisions are minimized before coding begins

## Tasks

### Task 1.1 — Freeze the first-pass project target
**Output:** final project root path + final target directory shape

#### Microtasks
- [ ] Confirm actual configured `UserScriptsDir` root to use for development/testing
- [ ] Confirm canonical subdirs under it: `projects/`, `ui/`, `dsp/`
- [ ] Choose the exact project root directory name under `projects/` (`ManifoldDefault` unless changed)
- [ ] Confirm the exact initial project directory layout to create
- [ ] Confirm whether `assets/` is included now or deferred until needed

### Task 1.2 — Audit `manifold/ui/looper_ui.lua`
**Output:** section-by-section migration map

#### Microtasks
- [ ] Identify root layout sections
- [ ] Identify transport controls and all contained widgets
- [ ] Identify capture-plane widgets and interactions
- [ ] Identify repeated layer-strip structure
- [ ] Identify helper/state normalization functions
- [ ] Identify dynamic update logic in `ui_update`
- [ ] Identify widget-specific callbacks that belong in behavior modules
- [ ] Identify anything tightly coupled to shell assumptions

### Task 1.3 — Audit current default DSP entry
**Output:** concrete DSP entry path and migration plan

#### Microtasks
- [ ] Identify the current default DSP script/path used in runtime/settings
- [ ] Decide what `dsp/main.lua` should point to in the new project
- [ ] Identify any path assumptions in current DSP loading that must become project-relative
- [ ] Write down what “DSP works” means for this pass

### Task 1.4 — Produce old→new mapping table
**Output:** one table mapping current code regions to new files

#### Microtasks
- [ ] Map transport code → `ui/components/transport.ui.lua` + `ui/behaviors/transport.lua`
- [ ] Map capture-plane code → `ui/components/capture_plane.ui.lua` + `ui/behaviors/capture_plane.lua`
- [ ] Map layer-strip code → `ui/components/layer_strip.ui.lua` + `ui/behaviors/layer_strip.lua`
- [ ] Map shared helpers/state normalization → `ui/behaviors/shared_state.lua`
- [ ] Map current DSP entry → `dsp/main.lua`

---

# 7. Phase 2 — Create the Reference Project Skeleton

## Goal
Create the real project directory and minimal placeholder files so the new world exists concretely on disk.

## Exit criteria
- project directory exists under `UserScriptsDir/projects`
- top-level user roots (`projects/`, `ui/`, `dsp/`) exist
- all project top-level files/folders exist
- placeholder files are syntactically valid

## Tasks

### Task 2.1 — Create the directory tree
**Output:** actual project folders on disk

#### Microtasks
- [ ] Create/confirm top-level user roots under `UserScriptsDir`:
  - [ ] `projects/`
  - [ ] `ui/`
  - [ ] `dsp/`
- [ ] Create project root under `UserScriptsDir/projects`
- [ ] Create project `ui/`
- [ ] Create project `ui/components/`
- [ ] Create project `ui/behaviors/`
- [ ] Create project `dsp/`
- [ ] Create project `themes/`
- [ ] Create project `editor/`
- [ ] Optionally create project `assets/` if needed immediately

### Task 2.2 — Create the manifest
**Output:** minimal valid `manifold.project.json5`

#### Microtasks
- [ ] Add project name
- [ ] Add version
- [ ] Set `ui.root` to `ui/main.ui.lua`
- [ ] Set `dsp.default` to `dsp/main.lua`
- [ ] Set `theme` to `themes/dark.lua` if used immediately
- [ ] Keep manifest thin; do not add speculative fields

### Task 2.3 — Create syntactically valid placeholders
**Output:** every referenced file exists and loads in principle

#### Microtasks
- [ ] Create stub `ui/main.ui.lua`
- [ ] Create stub component files
- [ ] Create stub behavior files returning modules
- [ ] Create stub `dsp/main.lua`
- [ ] Create minimal `themes/dark.lua`
- [ ] Create minimal `editor/workspace.json5`

---

# 8. Phase 3 — Lock First-Pass Contracts

## Goal
Define the exact minimum contracts that runtime/editor code will support in this pass.

## Exit criteria
- `.ui.lua` schema for pass 1 is fixed
- behavior module API for pass 1 is fixed
- component reference semantics for pass 1 are fixed
- project-relative path semantics are fixed

## Tasks

### Task 3.1 — Lock the structured `.ui.lua` schema subset
**Output:** explicit v1 structured asset shape

#### Required fields for first pass
- `id`
- `type`
- `x`, `y`, `w`, `h`
- `props`
- `style`
- `children`
- `components`
- `behavior`

#### Microtasks
- [ ] Decide required vs optional fields
- [ ] Decide allowed widget subset for pass 1
- [ ] Decide color representation for pass 1 (`{r,g,b,a}` tuples per spec)
- [ ] Decide whether visibility is in scope now
- [ ] Decide whether direct declarative `bind` is needed in pass 1 or deferred

### Task 3.2 — Lock component reference semantics
**Output:** exact first-pass `components = { ... }` contract

#### Microtasks
- [ ] Decide how `ref` is resolved relative to project root
- [ ] Decide what per-instance overrides are supported in pass 1
- [ ] Decide whether `props` injection at instance sites is supported in pass 1
- [ ] Decide how IDs are prefixed/scoped for instantiated components
- [ ] Decide whether nested component refs are allowed in pass 1

### Task 3.3 — Lock behavior module API
**Output:** explicit `ctx` contract

#### Proposed baseline
```lua
local M = {}
function M.init(ctx) end
function M.update(ctx, state) end
function M.cleanup(ctx) end
return M
```

#### Microtasks
- [ ] Decide final function names/signatures
- [ ] Decide `ctx.widgets` shape (flat ID map vs tree)
- [ ] Decide whether `ctx.project` exists now
- [ ] Decide whether `ctx.instanceProps` exists now
- [ ] Decide whether `ctx.command`/helpers are provided directly or via globals
- [ ] Decide update ordering if multiple behavior modules exist

### Task 3.4 — Lock project-relative path semantics
**Output:** explicit resolution rules

#### Microtasks
- [ ] UI refs resolve from project root
- [ ] behavior refs resolve from project root or `ui/`
- [ ] DSP entry resolves from project root
- [ ] theme path resolves from project root
- [ ] document fallback behavior for legacy mode

---

# 9. Phase 4 — Manually Recreate the Default UI

## Goal
By hand, recreate the default UI in the new structured model so we have a real canonical example.

## Exit criteria
- `main.ui.lua` exists and reflects real root structure
- components exist and are meaningful
- behavior modules contain real migrated logic
- this is no longer placeholder scaffolding

## Tasks

### Task 4.1 — Write `ui/main.ui.lua`
**Output:** real root structured scene

#### Microtasks
- [ ] Define root panel
- [ ] Define root bounds/design size
- [ ] Add root-level style
- [ ] Add component refs for transport/capture/layers
- [ ] Add any root-only children that are not part of reusable components
- [ ] Keep file pure-data only

### Task 4.2 — Write `ui/components/transport.ui.lua`
**Output:** structured transport component

#### Microtasks
- [ ] Create container panel
- [ ] Add mode control widget(s)
- [ ] Add rec/play/stop controls
- [ ] Add overdub/clear controls
- [ ] Add tempo/target BPM controls
- [ ] Add link indicator if represented structurally
- [ ] Ensure IDs are stable and explicit

### Task 4.3 — Write `ui/components/capture_plane.ui.lua`
**Output:** structured capture-plane component

#### Microtasks
- [ ] Create container panel
- [ ] Represent segment strips
- [ ] Represent segment hit regions if needed structurally
- [ ] Represent any static labels/containers
- [ ] Keep dynamic behavior out of the pure-data file

### Task 4.4 — Write `ui/components/layer_strip.ui.lua`
**Output:** reusable structured layer component

#### Microtasks
- [ ] Create container panel
- [ ] Add labels/state labels/bars labels
- [ ] Add waveform widget placeholder/structure
- [ ] Add volume/speed controls
- [ ] Add mute/play/clear buttons
- [ ] Parameterize by `layerIndex` if that is in scope for pass 1
- [ ] Ensure IDs are stable and instance-safe

### Task 4.5 — Write `ui/behaviors/shared_state.lua`
**Output:** shared helper module for migrated behavior

#### Microtasks
- [ ] Move reusable state normalization/helpers here if needed
- [ ] Avoid hiding too much in this module; keep responsibilities clear
- [ ] Keep it handwritten, not editor-owned

### Task 4.6 — Write `ui/behaviors/transport.lua`
**Output:** migrated transport logic

#### Microtasks
- [ ] Move rec latch logic
- [ ] Move play/pause toggle logic
- [ ] Move dynamic label/color updates
- [ ] Wire any mode interactions needed
- [ ] Confirm transport behavior works against the new structured IDs

### Task 4.7 — Write `ui/behaviors/capture_plane.lua`
**Output:** migrated capture-plane behavior

#### Microtasks
- [ ] Move capture-plane state/update logic
- [ ] Move segment trigger behavior
- [ ] Move dynamic visual behavior that belongs here
- [ ] Keep project-relative assumptions clean

### Task 4.8 — Write `ui/behaviors/layer_strip.lua`
**Output:** migrated layer behavior

#### Microtasks
- [ ] Move mute/play/clear logic
- [ ] Move waveform/playhead state updates
- [ ] Move scrub behavior if included in this pass
- [ ] Move dynamic label/state coloring logic
- [ ] Confirm per-layer behavior scopes correctly by `layerIndex`

---

# 10. Phase 5 — Add Runtime Support

## Goal
Make the runtime/editor capable of discovering and loading the new project-backed assets.

## Exit criteria
- project is discoverable under `UserScriptsDir/projects`
- user-global roots under `UserScriptsDir/ui` and `UserScriptsDir/dsp` are recognized as distinct asset scopes
- manifest is parsed
- `main.ui.lua` loads
- components instantiate
- behavior modules attach
- project-backed DSP entry resolves and loads
- legacy loading still works

## Tasks

### Task 5.1 — Project discovery under `UserScriptsDir/projects`
**Likely touch points:** settings/project bootstrap/script listing code

#### Microtasks
- [ ] Enumerate directories under configured `UserScriptsDir/projects`
- [ ] Detect directories containing `manifold.project.json5`
- [ ] Classify these as projects
- [ ] Recognize `UserScriptsDir/ui` as user-global UI root
- [ ] Recognize `UserScriptsDir/dsp` as user-global DSP root
- [ ] Continue to classify loose `.lua` files in supported legacy roots as legacy scripts/assets
- [ ] Surface projects in discovery/listing APIs without conflating them with global assets

### Task 5.2 — Manifest loader
**Likely touch points:** C++ runtime + Lua helper exposure

#### Microtasks
- [ ] Implement JSON5/JSON-ish manifest parsing strategy
- [ ] Load project metadata
- [ ] Resolve project root
- [ ] Expose project metadata/path info where needed
- [ ] Handle malformed manifests cleanly

### Task 5.3 — Structured `.ui.lua` loader
**Likely touch points:** LuaEngine and/or new scene loader module

#### Microtasks
- [ ] Load `.ui.lua` as table
- [ ] Validate returned structure for pass-1 schema
- [ ] Reject unsupported values cleanly
- [ ] Instantiate supported widget subset
- [ ] Set bounds/styles/props correctly
- [ ] Preserve `_editorMeta` and runtime editor introspection

### Task 5.4 — Component loader
**Likely touch points:** scene instantiation layer

#### Microtasks
- [ ] Resolve component refs relative to project root
- [ ] Load referenced `.ui.lua` component files
- [ ] Instantiate component contents into parent scene
- [ ] Apply instance offsets/props according to pass-1 contract
- [ ] Handle bad refs clearly

### Task 5.5 — Behavior module attachment
**Likely touch points:** scene instantiation/update pipeline

#### Microtasks
- [ ] Load referenced behavior modules
- [ ] Build `ctx.widgets`
- [ ] Call `init(ctx)` after instantiation
- [ ] Call `update(ctx, state)` on tick/update
- [ ] Call `cleanup(ctx)` if scene unloads/switches
- [ ] Handle behavior errors clearly

### Task 5.6 — Project-backed DSP resolution
**Likely touch points:** DSP script loading path

#### Microtasks
- [ ] Resolve `dsp/main.lua` relative to project root
- [ ] Ensure runtime can load it as the project DSP entry
- [ ] Confirm the project-backed UI can interact with it
- [ ] Preserve existing legacy DSP loading path for non-project cases

### Task 5.7 — Legacy coexistence validation in runtime

#### Microtasks
- [ ] Confirm loose legacy script loading still works
- [ ] Confirm project-backed and legacy discovery coexist cleanly
- [ ] Confirm switching between legacy and project-backed UIs does not explode

---

# 11. Phase 6 — Add Editor Support For Structured Assets

## Goal
Make the new structured project actually editable and saveable through the editor.

## Exit criteria
- structured widgets can be selected/edited
- `.ui.lua` assets save back to source
- behavior modules remain separately editable as handwritten text files

## Tasks

### Task 6.1 — Structured asset detection in editor

#### Microtasks
- [ ] Distinguish project-backed structured assets from legacy scripts
- [ ] Mark `.ui.lua` files as editor-owned in shell/editor surfaces
- [ ] Route save behavior accordingly

### Task 6.2 — Ensure selection/inspector works on structured widgets

#### Microtasks
- [ ] Confirm structured widgets still populate `_editorMeta`
- [ ] Confirm tree/hierarchy reflects structured UI correctly
- [ ] Confirm inspector shows/edit props for structured widgets
- [ ] Fix any metadata gaps introduced by structured loading

### Task 6.3 — Implement `.ui.lua` serializer
**Critical deliverable**

#### Microtasks
- [ ] Serialize valid pure-data Lua table to source
- [ ] Use deterministic key ordering
- [ ] Format arrays/tables cleanly
- [ ] Serialize colors as `{r, g, b, a}` tuples
- [ ] Keep formatting human-readable
- [ ] Ensure serializer does not emit executable junk

### Task 6.4 — Save structured asset edits back to source

#### Microtasks
- [ ] On visual edit, mutate in-memory scene model
- [ ] Save scene model back to correct `.ui.lua` file
- [ ] Confirm reload preserves the edit
- [ ] Ensure behavior modules are not touched during UI save

### Task 6.5 — Script-editor support for behavior modules

#### Microtasks
- [ ] Expose behavior files in editor script surfaces
- [ ] Confirm text editing + save works
- [ ] Confirm manual behavior edits reload correctly

---

# 12. Phase 7 — Validation, Comparison, and Handoff To Ongoing Development

## Goal
Prove the recreated project is real enough to become the canonical first-pass example and active home for further work in-scope.

## Exit criteria
- recreated project behaves sufficiently like legacy reference
- known gaps are recorded
- active feature work can move to new structure for migrated areas

## Tasks

### Task 7.1 — Legacy comparison pass

#### Microtasks
- [ ] Compare transport behavior against legacy `looper_ui.lua`
- [ ] Compare capture-plane behavior against legacy
- [ ] Compare layer-strip behavior against legacy
- [ ] Compare visual/state update correctness
- [ ] Compare project-backed DSP behavior against current default path

### Task 7.2 — Record pass-1 gaps

#### Microtasks
- [ ] List missing editor features discovered during manual recreation
- [ ] List missing runtime features discovered during manual recreation
- [ ] List schema pain points
- [ ] List behavior API pain points
- [ ] List DSP project-model pain points

### Task 7.3 — Define what becomes the active development path

#### Microtasks
- [ ] For migrated UI areas, declare the new project-backed path the primary editing target
- [ ] Identify any remaining legacy-only areas still pending migration
- [ ] Explicitly note where new features should land going forward

---

# 13. File Touchpoints (Probable)

This is not exhaustive, but these are likely areas to touch.

## Existing code likely involved
- `manifold/primitives/scripting/LuaEngine.cpp`
- `manifold/primitives/scripting/LuaEngine.h`
- `manifold/primitives/scripting/bindings/LuaControlBindings.cpp`
- `manifold/primitives/core/Settings.*`
- `manifold/ui/ui_shell.lua`
- `manifold/ui/shell/methods_core.lua`
- `manifold/ui/shell/methods_layout.lua`
- `manifold/ui/widgets/base.lua`
- relevant widget files if structured loading needs config-path adjustments

## New code/modules likely needed
- project discovery / manifest helper
- structured scene loader
- structured scene validator
- structured scene serializer
- structured component instantiation helper
- behavior attachment helper

## New project files
- the full `ManifoldDefault/` project tree under `UserScriptsDir/projects`

---

# 14. Daily/Operational Task Ordering

If starting immediately, the order of attack should be:

## Day/Block A
- [ ] Phase 1 scope freeze
- [ ] Phase 1 audit
- [ ] old→new mapping table

## Day/Block B
- [ ] Create project skeleton
- [ ] Create manifest + placeholders
- [ ] Lock first-pass contracts

## Day/Block C
- [ ] Manually write `main.ui.lua`
- [ ] Manually write `transport.ui.lua`
- [ ] Manually write `capture_plane.ui.lua`
- [ ] Manually write `layer_strip.ui.lua`

## Day/Block D
- [ ] Write behavior modules
- [ ] Set up project-backed DSP entry

## Day/Block E
- [ ] Implement project discovery + manifest loading
- [ ] Implement structured scene loading + component refs
- [ ] Implement behavior attachment

## Day/Block F
- [ ] Implement editor save/load for `.ui.lua`
- [ ] Validate selection/inspector on structured assets

## Day/Block G
- [ ] Compare against legacy behavior
- [ ] Declare active path for migrated areas
- [ ] Record phase-2 gaps

---

# 15. Stop/Review Gates

These are explicit points where we stop and check reality before plowing ahead.

## Gate 1 — After Phase 1
Question:
- Do we actually understand how current default UI/DSP map into the new files?

If no, do not start generic implementation.

## Gate 2 — After Phase 3
Question:
- Are the first-pass schema/behavior/component contracts concrete enough to implement, or are they still mush?

If mush, fix them now.

## Gate 3 — After Phase 4
Question:
- Can the current default UI actually be expressed sanely in the new structure by hand?

If no, the model is wrong or incomplete.

## Gate 4 — After Phase 5
Question:
- Can the runtime actually load the recreated project alongside legacy scripts?

If no, do not move on to polish.

## Gate 5 — After Phase 6
Question:
- Can the editor save `.ui.lua` changes cleanly enough for the project-backed path to be real?

If no, the pass is not complete.

---

# 16. Acceptance Checklist

Use this checklist to decide if first pass is done.

## Project shape
- [ ] A real project directory exists under `UserScriptsDir/projects`
- [ ] top-level user roots exist under `UserScriptsDir` (`projects/`, `ui/`, `dsp/`)
- [ ] `manifold.project.json5` exists and resolves correctly
- [ ] project-backed UI and DSP entry are both present

## UI recreation
- [ ] default UI is manually recreated in structured form
- [ ] transport component works
- [ ] capture-plane component works
- [ ] reusable layer strip works
- [ ] dynamic behavior modules work

## Runtime
- [ ] project discovery works
- [ ] manifest loading works
- [ ] structured scene loading works
- [ ] component refs work
- [ ] behavior modules attach and update
- [ ] project-backed DSP entry works
- [ ] legacy scripts still load

## Editor
- [ ] structured widgets are selectable/editable
- [ ] `.ui.lua` assets save back to source
- [ ] behavior modules remain text-editable handwritten files
- [ ] reloading preserves saved structure edits

## Validation
- [ ] recreated project behavior is close enough to legacy baseline
- [ ] known gaps are documented
- [ ] migrated areas have a declared active development path

---

# 17. Final Instruction To Workers

Do not get cute.
Do not disappear into architecture astronaut bullshit.
Do not spend a week building generic systems before proving the manually recreated project.

The first-pass mission is simple:

> **Build one real project-backed recreation of the current default UI + DSP, make it load, make it editable, make it save, and keep legacy working beside it.**

If a task does not serve that mission directly, it is probably not first-pass work.
