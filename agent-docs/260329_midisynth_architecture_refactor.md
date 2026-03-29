# MidiSynth Architecture Refactoring Plan

## Document Context

**Status:** Active implementation  
**Scope:** Decomposition of the MidiSynth God Object into reusable DSP/UI modules  
**Target Architecture:** Module-centric, incrementally extracted, testable in isolation  
**Last Updated:** 2026-03-30  

**Primary files (current):**
- `UserScripts/projects/Main/dsp/midisynth_integration.lua` (**2,093** lines) — primary DSP source of truth
- `UserScripts/projects/Main/dsp/midisynth.lua` (**882** lines) — standalone/deprecated, not the main refactor target
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua` (**2,732** lines) — primary UI behavior, still too large

**Key reality check:** we are no longer in planning. The refactor is underway and several real subsystems have already been extracted. But there is still too much God-mode code in both the DSP and UI layers.

---

## 1. Why We Are Doing This

This refactor is not just cleanup. It is the foundation for the larger Manifold direction:

- **Modules must become reusable units** rather than logic trapped inside one giant synth file
- **UI systems must become composable** instead of one behavior owning everything forever
- **DSP subsystems must become testable** without booting the full Main project
- **Rack, palette, patchbay, presets, and plugin export** all depend on having stable module boundaries

### The strategic goal

We are moving from:

> “A big synth bolted into a looper tab”

to:

> “A modular audio environment where instruments, effects, routing systems, and views can be composed, tested, and eventually exported.”

If code stays trapped in God objects, none of the bigger platform vision is real. We just have a fancy pile of Lua.

---

## 2. The Problem Statement

### Current pain

Even after substantial progress, MidiSynth still has oversized orchestration files with too many responsibilities mixed together.

### DSP pain

`midisynth_integration.lua` still mixes:
- project-specific wiring
- sample source registration
- per-voice graph construction
- blend-mode routing
- parameter registration and dispatch
- SampleSynth-specific logic
- FX slot orchestration
- control-path glue

### UI pain

`ui/behaviors/midisynth.lua` still mixes:
- widget construction
- widget lookup/scoping
- runtime sync
- patchbay pagination/runtime
- MIDI device handling
- rack layout orchestration
- graph/oscillator/filter/env visualization wiring
- mode/tab visibility logic
- status and keyboard display logic

### Why this still hurts

1. **Cognitive load** stays too high
2. **Extraction risk** gets worse the longer the files remain huge
3. **Testing** is still broader than it should be
4. **Reuse** is limited because logic is still glued to MidiSynth
5. **Future module export** is blocked by hidden assumptions and cross-file coupling

---

## 3. Progress Snapshot

## 3.1 Main file size reduction

| File | Before | Current | Delta |
|------|--------|---------|-------|
| `dsp/midisynth_integration.lua` | 3,351 | 2,093 | -1,258 |
| `ui/behaviors/midisynth.lua` | 5,211 | 2,732 | -2,479 |

### What this means

- DSP has had meaningful structural extraction, but still needs another serious pass
- UI has seen the biggest improvement so far, especially after extracting the update/sync layer
- The main UI file is still too large, but it is no longer carrying everything

## 3.2 Extracted modules

### DSP/shared modules
- `UserScripts/projects/Main/lib/fx_definitions.lua` — shared FX definitions and factories
- `UserScripts/projects/Main/lib/fx_slot.lua` — swappable FX slot with dry/wet handling
- `UserScripts/projects/Main/lib/voice_pool.lua` — 8-voice polyphony management
- `UserScripts/projects/Main/lib/utils.lua` — shared math helpers (`clamp`, `lerp`, etc.)
- `UserScripts/projects/Main/lib/parameter_binder.lua` — shared parameter paths, schema metadata, registration helpers, and dispatch utilities
- `UserScripts/projects/Main/lib/sample_synth.lua` — sample capture/analysis/partials/morph/voice-graph subsystem

### UI modules
- `UserScripts/projects/Main/lib/ui/scoped_widget.lua` — widget lookup/scoping helpers
- `UserScripts/projects/Main/lib/ui/widget_sync.lua` — sync primitives (`syncValue`, `syncText`, etc.)
- `UserScripts/projects/Main/lib/ui/fx_slot_panel.lua` — MidiSynth-side FX slot UI wiring and pad refresh helpers
- `UserScripts/projects/Main/lib/ui/init_bindings.lua` — component bootstrap and init-time DSP/UI callback wiring
- `UserScripts/projects/Main/lib/ui/init_controls.lua` — non-component init control wiring and startup state restoration
- `UserScripts/projects/Main/lib/ui/midi_devices.lua` — MIDI device enumeration/selection
- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua` — patchbay widget generation and pagination
- `UserScripts/projects/Main/lib/ui/patchbay_runtime.lua` — patchbay lifecycle/runtime coordination
- `UserScripts/projects/Main/lib/ui/rack_controller.lua` — dock/rack/view bootstrap and controller behavior
- `UserScripts/projects/Main/lib/ui/rack_layout_manager.lua` — rack layout utilities
- `UserScripts/projects/Main/lib/ui/update_sync.lua` — per-frame DSP→UI sync/update loop

### Approximate extracted volume

The extracted module layer is now roughly **6.0k** lines of code that no longer lives directly inside the main MidiSynth God files.

---

## 4. What Has Been Successfully Decomposed

## 4.1 FX definitions

**Status:** Complete

Done:
- `FX_OPTIONS` and `buildFxDefs()` were extracted into a shared module
- DSP and UI both consume the shared definitions
- duplication across standalone/integration/UI was eliminated

Why it matters:
- single source of truth for available effects
- future palette/module browser can consume the same metadata
- effect creation is no longer trapped in one synth blob

## 4.2 FX slot pattern

**Status:** Complete

Done:
- extracted as `lib/fx_slot.lua`
- includes dry/wet handling and swappable slot behavior

Why it matters:
- establishes a reusable container pattern
- this is a precursor to more general container/module abstractions

## 4.3 Voice pool

**Status:** Complete

Done:
- extracted polyphony management into `lib/voice_pool.lua`
- voice allocation logic is no longer trapped inside the synth monolith

Why it matters:
- reusable across future instruments
- separates “how voices are allocated” from “what each voice contains”

## 4.4 Utility helpers

**Status:** Complete

Done:
- extracted common math helpers into `lib/utils.lua`

Why it matters:
- stops low-level helpers from being duplicated in giant files
- gives shared modules a clean common dependency

## 4.5 SampleSynth subsystem extraction

**Status:** Strong progress

Done:
- extracted sample capture infrastructure
- extracted analysis/partials/morph-related logic
- extracted per-voice graph creation and wiring helpers
- extracted canonical voice-graph default/reset helpers
- moved this deeper ownership into `lib/sample_synth.lua`

Not yet done:
- some project-local host wiring and standalone divergence still remain outside the shared module boundary

Why it matters:
- the SampleSynth is the real instrument core
- voice construction, blend/morph behavior, and capture-source configuration now belong to modules instead of top-level project wiring
- the next remaining DSP chunk is now clearly standalone/wrapper cleanup

## 4.6 UI support systems

**Status:** Strong progress

Done:
- extracted widget scoping helpers
- extracted generic widget sync helpers
- extracted init-time component bootstrap
- extracted non-component init controls
- extracted first-pass FX slot panel wiring
- extracted first-pass patchbay runtime lifecycle
- extracted first-pass rack/view controller logic
- extracted MIDI device logic
- extracted patchbay generation support
- extracted rack layout calculations
- extracted the full `M.update()` sync layer into `lib/ui/update_sync.lua`

Why it matters:
- separates per-frame sync from construction and event wiring
- creates reusable UI primitives for other modules/behaviors
- gets us closer to real module panels instead of one mega behavior

---

## 5. Critical Fixes Achieved During Refactor

These are not just code moves. Real bugs and infrastructure issues were fixed while extracting systems.

### Runtime/module-loading fixes
- Added project lib path resolution via C++ `package.path` updates so shared Lua modules resolve correctly in both DSP and UI contexts
- This was implemented in:
  - `manifold/primitives/scripting/LuaEngine.cpp`
  - `manifold/primitives/scripting/DSPPluginScriptHost.cpp`

### DSP fixes
- **FFT order changes now work correctly** by exposing and calling `prepare()` after relevant parameter changes
- **Phase vocoder time stretch bug fixed**: user time stretch was being ignored; calculation now respects user stretch amount

These fixes matter because a decomposition effort that preserves broken behavior is still broken.

---

## 6. Remaining God-Mode Areas To Extract

This is the important section. These are the major systems still trapped in the big files.

## 6.1 Remaining DSP extraction targets

### A. Voice graph construction

**Where it lives now:** primarily `lib/sample_synth.lua`  
**Status:** Extracted

What moved:
- oscillator/sample/pvoc node creation
- crossfaders and mixers
- additive banks
- ring mod / blend signal wiring scaffolding
- envelope-followed voice-specific state setup
- canonical voice-graph reset/default initialization

**What still remains outside:**
- project-local host integration and wrapper concerns still live in `dsp/midisynth_integration.lua`

**Why it matters:**
- this is the actual synthesis core
- `midisynth_integration.lua` is now much closer to project wiring instead of acting like the whole instrument

---

### B. Blend-mode routing and mode-specific DSP glue

**Where it lives now:** primarily `lib/sample_synth.lua`
**Status:** Extracted

What moved:
- Mix / Ring / FM / Sync / Add / Morph routing logic
- mode-specific graph glue
- additive/morph spectral parameter application
- blend pitch routing and pitch-mode helpers
- per-block blend runtime updates for FM/Sync/Add/Morph behavior

**What still remains outside:**
- top-level parameter dispatch and project wiring still call into the SampleSynth-owned helpers

**Why it matters:**
- these modes are a defining feature of the instrument
- they now belong to the instrument module instead of top-level DSP integration

---

### C. Parameter schema / binder / dispatcher

**Where it lives now:** shared between `lib/parameter_binder.lua` and `dsp/midisynth_integration.lua`

**Extracted now:**
- `lib/parameter_binder.lua`
- shared path definitions
- reusable schema metadata (`buildSchema()`)
- reusable registration/binding helpers (`registerSchema()` / `registerAll()`)
- shared dispatcher helpers (`createDispatcher()`, FX pattern handlers, EQ ignore helpers)
- shared defaults/ranges/type declarations for the MidiSynth parameter surface

**What still remains local on purpose:**
- synth-specific side-effect handlers still live in the integration file as closures
- runtime behavior is not fully declarative, because a lot of it is genuinely instrument-specific

**Why it matters:**
- parameter metadata is now reusable for presets/automation/palette/export work
- the integration file no longer owns the registration swamp or the raw path-matching ladder
- dispatch structure is now modular even where the synth-specific actions are still local

---

### D. Capture-source registry and project integration glue

**Where it lives now:** `lib/sample_capture_sources.lua` + `dsp/midisynth_integration.lua`
**Status:** Extracted (first proper pass)

What moved:
- live source registration config
- looper layer source registration config
- project-specific capture source mapping
- source ID / naming policy for Main project capture sources
- SampleSynth now consumes generic `sourceSpecs` instead of hardcoded Main assumptions

**What still remains outside:**
- project-specific host/looper wiring still lives in the integration layer, which is correct

**Why it matters:**
- separates instrument behavior from project-specific Main/Looper integration
- makes SampleSynth instantiation cleaner in other projects or future export surfaces

---

### E. Standalone divergence cleanup

**Where it still lives:** `dsp/midisynth.lua` and general architecture assumptions

Current reality:
- standalone file is deprecated
- integration file is the source of truth
- some architecture docs still assume parity that does not exist yet

**Needed extraction:**
- once the module boundary is cleaner, rebuild a minimal standalone wrapper around the shared modules rather than maintaining duplicate logic

**Why it matters:**
- the future standalone/export path should be a wrapper around shared modules, not a second implementation

---

## 6.2 Remaining UI extraction targets

### A. `M.init()` and widget bootstrap

**Where it still lives:** `ui/behaviors/midisynth.lua`

Still entangled:
- panel/widget creation
- section initialization
- initial layout wiring
- initial state sync glue
- boot-time behavior assumptions

**Needed extraction:**
- `lib/ui/init_layout.lua`
- or several panel/component builders under `lib/ui/components/`

**Why it matters:**
- a giant init function is just a God object with a different haircut
- reusable module panels need construction isolated from update logic

---

### B. Oscillator/sample/blend panel construction

**Where it still lives:** `ui/behaviors/midisynth.lua`

Still entangled:
- tab construction
- widget creation for wave/sample/blend modes
- mode-specific visibility/layout rules
- graph widget binding

**Needed extraction:**
- `lib/ui/components/oscillator_panel.lua`
- potentially separate internal builders for wave/sample/blend tabs

**Why it matters:**
- this panel is effectively a module view
- it should be able to exist as a standalone reusable component

---

### C. FX slot UI construction

**Where it still lives:** `ui/behaviors/midisynth.lua`

Still entangled:
- FX slot widget creation
- dropdown/pad/parameter control assembly
- slot-local UI state and bindings

**Needed extraction:**
- `lib/ui/components/fx_slot_panel.lua`

**Why it matters:**
- DSP has a reusable FX slot now; UI needs the same treatment
- future rack/module browser needs a reusable effect-slot panel

---

### D. Patchbay runtime orchestration

**Where it still lives:** split between extracted modules and the main behavior

Done already:
- patchbay generation moved out

Still left:
- runtime shell orchestration
- interaction glue with rack state/view state
- patch-view bootstrap and cleanup lifecycle

**Needed extraction:**
- `lib/ui/patchbay_runtime.lua`
- or a controller layer coordinating generated widgets + runtime state

**Why it matters:**
- generation and runtime behavior are different concerns
- keeping both in the main behavior defeats the purpose of the generator extraction

---

### E. Rack/page/view-mode controller logic

**Where it still lives:** `ui/behaviors/midisynth.lua`

Still entangled:
- perf vs patch view toggling
- page transitions
- bootstrapping patch-mode state
- coordination between layout manager, patchbay, and wire layer

**Needed extraction:**
- `lib/ui/rack_controller.lua` or `lib/ui/view_mode_controller.lua`

**Why it matters:**
- this logic will eventually be shared by more than one instrument/module view
- the rack system is bigger than MidiSynth and should not stay hardcoded here

---

### F. Status/keyboard/voice-display glue

**Where it still lives:** partially extracted, partially still in main behavior

Still entangled:
- keyboard dirty-state behavior
- voice note display/status strip wiring
- note/focus/summary display formatting

**Needed extraction:**
- only if it stays substantial after bigger chunks move out
- likely a lower priority extraction than init/panels/controllers

**Why it matters:**
- lower architectural leverage than panel/controller extraction
- still worth isolating once larger structural cuts are done

---

## 7. Updated Phase Status

## Phase 1 — Foundation

**Status:** Complete

Completed:
- shared FX definitions
- FX slot extraction
- VoicePool extraction
- utility helpers extraction
- Lua module path support in DSP/UI runtime

**Result:** the basic reusable DSP foundation exists.

---

## Phase 2 — Sample analysis / SampleSynth subsystem split

**Status:** Partially complete

Completed:
- sample capture/analysis/partials/morph logic extracted into `lib/sample_synth.lua`

Still needed:
- decide whether analysis remains inside SampleSynth or is split again into a dedicated analysis module later
- pull more synthesis/voice-routing logic into the SampleSynth boundary

**Result:** the instrument core is less monolithic, but not fully modular yet.

---

## Phase 3 — Full SampleSynth module boundary

**Status:** In progress

Still needed:
- move voice graph construction into the module boundary
- move blend routing and mode logic into the module boundary
- reduce `midisynth_integration.lua` toward project wiring only

**Target end-state:**
- `midisynth_integration.lua` becomes composition/wiring
- `lib/sample_synth.lua` becomes the actual instrument implementation

---

## Phase 4 — UI decomposition

**Status:** In progress, strong progress already

Completed:
- widget scoping
- widget sync primitives
- init-time component bootstrap extraction
- MIDI device logic
- patchbay generation
- rack layout helpers
- update loop extraction

Still needed:
- init/bootstrap extraction
- oscillator/fx/component panel extraction
- patchbay runtime/controller extraction
- rack/view-mode controller extraction

**Target end-state:**
- behavior file becomes orchestration and event wiring
- reusable panel/controller modules own the rest

---

## Phase 5 — Parameter schema and module readiness

**Status:** Not started in earnest

Still needed:
- parameter binder/schema system
- module metadata for future palette/rack/discovery
- improved standalone wrapper strategy around shared modules

**Why this matters:**
This is what turns “a refactored synth” into “a reusable module system.”

---

## 8. Numbered Execution Plan

This is the ordered implementation plan from here. The goal is not random line-count reduction; the goal is to convert MidiSynth from a giant special-case implementation into a set of reusable module and panel/controller systems.

### 8.1 Task 1 — UI component bootstrap extraction

**Status:** In progress (substantial first pass complete)  
**Primary target:** `ui/behaviors/midisynth.lua`  
**Likely code touched:** ~700–1,200 lines  
**Likely extracted:** ~500–1,000 lines

**What gets extracted:**
- component behavior lookup and context wiring
- oscillator/sample/blend widget bootstrap
- filter/env/FX component bootstrap
- init-time control callbacks and graph refresh glue
- port-spec setup associated with component shells

**Likely outputs:**
- `lib/ui/init_bindings.lua` ✅
- `lib/ui/init_controls.lua` ✅
- optionally `lib/ui/components/oscillator_panel.lua`
- optionally `lib/ui/components/fx_slot_panel.lua`

**Definition of done:**
- `M.init()` no longer directly owns the bulk of component callback wiring
- oscillator/filter/env/FX bindings live behind reusable bootstrap modules ✅
- the remaining non-component init control wiring also lives behind a reusable init module ✅
- existing behavior is preserved
- syntax and runtime loading verified

**Why this matters:**
This is the next biggest remaining UI God chunk after `update_sync`.

---

### 8.2 Task 2 — Oscillator panel extraction

**Status:** Planned  
**Primary target:** `ui/behaviors/midisynth.lua`  
**Likely code touched:** ~300–700 lines  
**Likely extracted:** ~250–600 lines

**What gets extracted:**
- wave/sample/blend tab widget creation and organization
- oscillator-specific layout/visibility rules
- panel-local helper logic
- graph-related panel wiring that belongs to the oscillator view rather than global behavior orchestration

**Likely outputs:**
- `lib/ui/components/oscillator_panel.lua`
- optional sub-builders for wave/sample/blend tabs

**Definition of done:**
- oscillator panel can be built/bound through a single module interface
- main behavior orchestrates it instead of implementing it directly

**Why this matters:**
This panel is effectively a module view and should be reusable as one.

---

### 8.3 Task 3 — FX slot panel extraction

**Status:** In progress (first pass complete)  
**Primary target:** `ui/behaviors/midisynth.lua`  
**Likely code touched:** ~200–400 lines  
**Likely extracted:** ~180–350 lines

**What gets extracted:**
- FX dropdown/XY/param control widget wiring
- slot-local UI state
- reusable FX slot panel bootstrap/binding

**Likely outputs:**
- `lib/ui/fx_slot_panel.lua` ✅
- `lib/ui/components/fx_slot_panel.lua` (optional future split if panel construction moves out of the component behavior)

**Definition of done:**
- FX slot UI is reusable the same way DSP FX slot behavior already is ✅ (first pass)
- both FX slots use the same extracted UI module ✅

**Why this matters:**
Reusable DSP without reusable UI is only half a module.

---

### 8.4 Task 4 — Patchbay runtime/controller extraction

**Status:** In progress (first pass complete)  
**Primary target:** `ui/behaviors/midisynth.lua`  
**Likely code touched:** ~250–500 lines  
**Likely extracted:** ~200–450 lines

**What gets extracted:**
- patch-view bootstrap lifecycle
- patchbay page-switch orchestration
- runtime cleanup/rebuild logic
- coordination between generated patchbay widgets and live runtime state

**Likely outputs:**
- `lib/ui/patchbay_runtime.lua` ✅

**Definition of done:**
- patchbay generation and patchbay runtime lifecycle are separate concerns ✅ (first pass)
- main behavior only coordinates high-level state transitions ✅ (first pass)

**Why this matters:**
We already extracted generation; this finishes the job.

---

### 8.5 Task 5 — Rack/view-mode controller extraction

**Status:** In progress (first pass complete)  
**Primary target:** `ui/behaviors/midisynth.lua`  
**Likely code touched:** ~200–450 lines  
**Likely extracted:** ~180–350 lines

**What gets extracted:**
- perf/patch mode toggling
- rack page/view coordination
- wire refresh policy hooks
- controller-style view-state transitions

**Likely outputs:**
- `lib/ui/rack_controller.lua` ✅
- or `lib/ui/view_mode_controller.lua`

**Definition of done:**
- behavior file stops acting as the global rack/view traffic cop ✅ (first pass)
- rack/view state transitions are reusable outside one synth screen ✅ (first pass)

**Why this matters:**
Rack infrastructure is broader than MidiSynth and should not stay hardcoded here.

---

### 8.6 Task 6 — DSP parameter schema / binder extraction

**Status:** Complete  
**Primary target:** `dsp/midisynth_integration.lua`  
**Likely code touched:** ~300–700 lines  
**Likely extracted:** ~250–450 lines

**What gets extracted:**
- param schema metadata
- registration helpers
- path→setter dispatch helpers
- shared defaults/ranges/type declarations

**Likely outputs:**
- `lib/parameter_binder.lua` ✅
- or `lib/param_schema.lua` + binder helpers

**Definition of done:**
- main DSP file does not manually own the full parameter-registration swamp ✅
- parameter metadata is reusable for presets/automation/palette/export ✅
- raw path→handler dispatch is routed through shared binder helpers instead of one monolithic `elseif` chain ✅

**Why this matters:**
This is one of the key bridges from “refactored synth” to “module platform.”

---

### 8.7 Task 7 — SampleSynth voice-graph extraction

**Status:** Complete  
**Primary target:** `dsp/midisynth_integration.lua` and `lib/sample_synth.lua`  
**Likely code touched:** ~600–1,000 lines  
**Likely extracted:** ~500–900 lines

**What gets extracted:**
- per-voice node creation
- per-voice graph wiring
- subordinate voice helpers/state that actually belong to SampleSynth

**Likely outputs:**
- deeper `lib/sample_synth.lua` ownership ✅
- or `lib/sample_synth/voice_graph.lua`

**Definition of done:**
- `midisynth_integration.lua` becomes project wiring rather than instrument implementation ✅ (substantial move)
- SampleSynth owns the majority of its own voice graph ✅

**Why this matters:**
This is the real DSP God chunk still left in the integration file.

---

### 8.8 Task 8 — Blend/morph routing extraction

**Status:** Complete  
**Primary target:** `dsp/midisynth_integration.lua` and `lib/sample_synth.lua`  
**Likely code touched:** ~300–700 lines  
**Likely extracted:** ~250–600 lines

**What gets extracted:**
- Mix/Ring/FM/Sync/Add/Morph routing logic
- mode-specific graph glue
- morph/add-specific parameter behavior

**Likely outputs:**
- deeper `lib/sample_synth.lua` ownership ✅
- `lib/sample_synth/blend_modes.lua`
- `lib/sample_synth/morph_engine.lua`
- or equivalent internal SampleSynth submodules

**Definition of done:**
- blend/morph behavior belongs to SampleSynth internals, not top-level DSP integration ✅

**Why this matters:**
These modes are the identity of the instrument and should be owned by the instrument.

---

### 8.9 Task 9 — Capture source registry extraction

**Status:** Complete  
**Primary target:** `dsp/midisynth_integration.lua`  
**Likely code touched:** ~100–250 lines  
**Likely extracted:** ~100–220 lines

**What gets extracted:**
- live source registration
- looper layer capture source registration
- project-specific capture source mapping/config

**Likely outputs:**
- `lib/sample_capture_sources.lua` ✅
- or equivalent SampleSynth-owned source registry config

**Definition of done:**
- SampleSynth can accept capture-source configuration without carrying Main-project assumptions internally ✅

**Why this matters:**
This cleanly separates reusable instrument logic from project-local wiring.

---

### 8.10 Task 10 — Standalone wrapper rebuild

**Status:** Planned  
**Primary target:** `dsp/midisynth.lua`  
**Likely code touched:** ~200–500 lines  
**Likely replacement wrapper:** ~150–300 lines

**What gets rebuilt:**
- standalone wrapper around shared modules instead of duplicate synth implementation

**Likely outputs:**
- simplified `dsp/midisynth.lua`
- thin standalone wrapper over `voice_pool`, `sample_synth`, `fx_slot`, and shared param systems

**Definition of done:**
- standalone is no longer a second implementation
- standalone becomes a wrapper/test/export surface around shared modules

**Why this matters:**
The long-term standalone/export path must be wrapper-based, not fork-based.

---

### 8.11 Execution order rationale

Recommended implementation order:
1. Task 1 — UI component bootstrap extraction *(in progress; core component wiring extracted to `lib/ui/init_bindings.lua`, remaining init control wiring extracted to `lib/ui/init_controls.lua`)*
2. Task 6 — DSP parameter schema / binder extraction *(completed in `lib/parameter_binder.lua`)*
3. Task 7 — SampleSynth voice-graph extraction *(completed in `lib/sample_synth.lua`)*
4. Task 8 — Blend/morph routing extraction *(completed in `lib/sample_synth.lua`)*
5. Task 3 — FX slot panel extraction *(first pass implemented in `lib/ui/fx_slot_panel.lua`)*
6. Task 4 — Patchbay runtime/controller extraction *(first pass implemented in `lib/ui/patchbay_runtime.lua`)*
7. Task 5 — Rack/view-mode controller extraction *(first pass implemented in `lib/ui/rack_controller.lua`)*
8. Task 9 — Capture source registry extraction *(completed in `lib/sample_capture_sources.lua`)*
9. Task 2 — Oscillator panel extraction (if still needed after bootstrap split)
10. Task 10 — Standalone wrapper rebuild

The ordering is based on leverage, not aesthetics. The biggest architectural wins come from shrinking the remaining orchestration blobs and forcing clean ownership boundaries first.

---

## 9. Updated Success Metrics

### Short-term
- [x] Shared FX definitions in one place
- [x] Reusable FX slot module exists
- [x] Reusable VoicePool exists
- [x] Update loop extracted from UI behavior
- [x] `midisynth_integration.lua` under 2,500 lines *(current: 2,093)*
- [x] `midisynth_integration.lua` under 2,100 lines *(current: 2,093)*
- [x] `ui/behaviors/midisynth.lua` under 3,000 lines *(current: 2,732)*

### Mid-term
- [x] SampleSynth owns the majority of synthesis/analysis logic
- [ ] UI behavior is primarily orchestration, not widget construction soup
- [ ] patchbay runtime and rack/view controllers are modularized
- [x] parameter schema/binder exists *(shared schema, registration, and dispatch helpers extracted)*

### Long-term
- [ ] modules expose enough metadata for palette/rack integration
- [ ] standalone/export path is wrapper-based, not duplicate-implementation-based
- [ ] module boundaries support future plugin export and third-party composition

---

## 10. Open Architecture Questions

These are still live, but we now know more than we did at planning time.

### 10.1 Parameter discovery

Still open:
- static schema only?
- runtime introspection only?
- hybrid?

Current leaning:
- **hybrid**
- explicit schema for UI/presets/automation/export
- runtime bindings for DSP convenience

### 10.2 Analysis as a separate module vs part of SampleSynth

Current state:
- analysis currently lives inside extracted `sample_synth.lua`

Question:
- should it stay there until more DSP logic moves over?
- or be split again later into `sample_analysis.lua`?

Current answer:
- keep it inside SampleSynth for now unless a second real consumer appears

### 10.3 Modulation architecture

Still open:
- should modulation stay internal for now?
- when do we introduce a matrix/bus?

Current answer:
- do **not** overbuild modulation routing yet
- cleanly separate current synth/internal modulation first

### 10.4 What should be exported as first-class modules?

Most likely first wave:
- SampleSynth
- FX Slot
- patchbay/rack UI building blocks
- eventually individual effects with shared metadata

---

## 11. Current Codebase Snapshot

### Current shared library structure

```text
UserScripts/projects/Main/lib/
├── fx_definitions.lua
├── fx_slot.lua
├── parameter_binder.lua
├── sample_capture_sources.lua
├── sample_synth.lua
├── utils.lua
├── voice_pool.lua
└── ui/
    ├── fx_slot_panel.lua
    ├── init_bindings.lua
    ├── init_controls.lua
    ├── midi_devices.lua
    ├── patchbay_generator.lua
    ├── patchbay_runtime.lua
    ├── rack_controller.lua
    ├── rack_layout_manager.lua
    ├── scoped_widget.lua
    ├── update_sync.lua
    └── widget_sync.lua
```

### What the main files should become

#### Target shape for DSP
- `midisynth_integration.lua` → project wiring and integration only
- `sample_synth.lua` → actual instrument implementation
- shared libs → reusable DSP primitives and parameter systems

#### Target shape for UI
- `behaviors/midisynth.lua` → orchestration/event glue only
- panel/component builders → create widgets
- sync/controller modules → runtime behavior
- rack/patchbay helpers → reusable infrastructure, not MidiSynth-only hacks

---

## 12. Wider Architecture Vision: Why This Matters Beyond MidiSynth

MidiSynth is the proving ground for the bigger Manifold architecture.

### The long-term platform direction

We want:
- **module palette** for discovering/building with modules
- **rack system** for layout and composition
- **patchbay** for routing and inspection
- **macro/container modules** that can nest other modules
- **standalone/exportable modules** built from the same runtime

### Why extraction quality matters

Bad extraction gives us:
- files that are smaller but still conceptually tangled
- “helpers” that are just dependency dumpsters
- modules that cannot actually be reused outside MidiSynth

Good extraction gives us:
- stable ownership boundaries
- testable subsystems
- clear parameter/state contracts
- a real path to rack/palette/export

That is the point of this work. Not line-count golf for its own sake.

---

## 13. Summary

### What is done
- Phase 1 foundation is in place
- the FX extraction plan is complete
- multiple real DSP/UI modules exist
- the parameter schema/binder layer is now in place
- the UI update loop has been successfully amputated from the main behavior

### What is not done
- DSP still has project-local host wiring and standalone divergence to clean up
- UI still has major widget/bootstrap/controller logic in the behavior file
- standalone wrapper rebuild is still outstanding

### Overall state

The refactor is real and already delivering value, but we are still in the middle of it.  
The god object has been cut up, but not yet fully disarmed.

The next work should keep focusing on **coherent system boundaries**, not tiny random extractions.
