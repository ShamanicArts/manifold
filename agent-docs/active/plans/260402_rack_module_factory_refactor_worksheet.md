# Rack Module Factory Refactor Worksheet

## Goal

Turn the existing proto-factory for rack modules into a proper, enforceable factory.

This is **not** a greenfield redesign.
We already have the bones:
- spec registry in `ui/behaviors/rack_midisynth_specs.lua`
- shared shell in `ui/components/rack_module_shell.lua`
- dynamic module instancing in `ui/behaviors/midisynth.lua`
- patchbay derivation in `lib/ui/patchbay_generator.lua`
- modulation endpoint derivation in `lib/modulation/providers/rack_sources.lua` and `parameter_targets.lua`

The job is to:
1. extract the real factory seams,
2. remove central per-module special-casing where possible,
3. define one canonical spec/materialization path,
4. make perf/patch behavior obey the same factory contract,
5. get the codebase into a state where later workflow/docs/delegation are actually grounded in reality.

---

## Non-goals

Do **not**:
- redesign the rack UI from scratch;
- replace the current shell system;
- replace the current rack spec registry with a whole new architecture;
- attempt to fully parallelize module work yet;
- write delegation/workflow docs first;
- introduce more module-specific hacks into `midisynth.lua` unless strictly needed as temporary compatibility shims.

---

## Current Problem Statement

The current rack module system is factory-**ish**, but not a proper factory because:
- the contract is implicit and spread across several files;
- per-instance spec materialization is partly done by central module-specific patchers;
- signal semantics are split between spec files and modulation providers;
- palette metadata is not clearly canonicalized from module specs;
- performance-view control sync is not guaranteed by factory contract;
- module lifecycle/cleanup requirements are not normalized.

---

## Success Criteria

The factory refactor is successful when all of the following are true:

1. A rack module can be defined by one canonical spec shape.
2. Dynamic instance materialization is generic enough that adding a new module does not require another module-specific patch branch in `midisynth.lua`.
3. Patchbay generation derives from canonical module spec + instance metadata, not parallel ad-hoc structures.
4. Modulation endpoint generation derives from canonical port/param semantics, not duplicated special-case truth.
5. Performance-view control sync follows the same base/effective modulation contract as patch view.
6. Palette/browser metadata can be derived from spec identity/meta, not hand-curated UI-only data.
7. Module lifecycle hooks and cleanup responsibilities are explicit in code structure.
8. First new utility modules can be added against the hardened factory with minimal central-file edits.

---

## Workstream Overview

### Workstream A — Canonicalize the module spec shape
### Workstream B — Extract a generic instance materializer/factory
### Workstream C — Normalize signal and param semantics
### Workstream D — Unify patch/perf UI behavior under the factory contract
### Workstream E — Normalize palette/browser derivation
### Workstream F — Normalize module lifecycle + cleanup
### Workstream G — Prove the factory with one simple utility module after refactor

---

# Workstream A — Canonicalize the module spec shape

## Objective
Promote `rack_midisynth_specs.lua` from “registry of mostly-useful info” into the canonical source of truth for rack module identity, ports, params, UI metadata, and instancing behavior.

## Primary files
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- likely new helper: `UserScripts/projects/Main/lib/ui/rack_module_spec_utils.lua`

## Current pain
Specs currently contain useful information, but they do not clearly encode:
- category/grouping;
- canonical port signal semantics;
- palette/browser metadata;
- instance policy;
- runtime/view contract hints;
- param templating/materialization behavior in a generic way.

## Required code work

### A1. Inventory current spec fields
For each existing module spec, inventory current fields used by:
- shell creation
- dynamic instancing
- patchbay generation
- modulation providers
- palette browser
- runtime lookup

### A2. Define a canonical spec table shape in code
Add/normalize fields such as:
- `id`
- `name`
- `category`
- `description`
- `accentColor`
- `validSizes`
- `defaultSize`
- `ports`
- `params` (if kept nested under `ports.params`, make that official)
- `meta.componentId`
- `meta.behavior`
- `meta.componentRef`
- `meta.palette`
- `meta.instancePolicy`
- `meta.paramTemplateMode`
- `meta.runtimeKind`

### A3. Validate shape centrally
Add helper(s) to normalize and validate specs at load time so broken modules fail loudly instead of half-working.

### A4. Stop mixing UI-only palette metadata into unrelated UI files
Move palette identity facts toward module specs.

## Acceptance
- existing modules still load;
- spec structure is explicit and consistent;
- other systems can read one shape instead of relying on field folklore.

---

# Workstream B — Extract a generic instance materializer/factory

## Objective
Move dynamic instance materialization out of ad-hoc branches in `midisynth.lua` into a reusable factory/materializer.

## Primary files
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- new file: `UserScripts/projects/Main/lib/ui/rack_module_factory.lua`
- maybe: `UserScripts/projects/Main/lib/ui/rack_module_spec_utils.lua`

## Current pain
`midisynth.lua` currently contains too much dynamic-module logic and too many module-specific patchers:
- `_patchAdsrSpecForInstance`
- `_patchArpSpecForInstance`
- `_patchEqSpecForInstance`
- `_patchFxSpecForInstance`
- `_patchFilterSpecForInstance`
- `_patchOscillatorSpecForInstance`

That means the current factory is not generic.

## Required code work

### B1. Isolate all dynamic spec patch/materialization logic
Pull together all code paths that:
- allocate dynamic slot/index;
- build `paramBase`;
- clone specs;
- patch per-instance paths;
- register dynamic module info;
- attach shell/component metadata.

### B2. Introduce a generic materialization API
Something along the lines of:
- `materializeSpec(baseSpec, instanceMeta)`
- `registerDynamicInstance(ctx, specId, instanceMeta)`
- `buildModuleShellConfig(spec, instanceMeta)`

Not necessarily those exact names, but one clean API.

### B3. Replace module-specific patch branches with declarative rules
Possible mechanisms:
- template paths containing `__template`
- per-spec `meta.paramBase`
- per-param path suffix rules
- generic remapper over paths and IDs

The target is that the materializer can turn:
- base spec
- `nodeId`
- `slotIndex`
- `paramBase`

into an instance-ready spec without hardcoding module IDs in central control flow.

### B4. Leave compatibility shims only if unavoidable
If one or two modules are too weird to normalize immediately, isolate those exceptions inside the factory layer, not in `midisynth.lua` app flow.

## Acceptance
- `midisynth.lua` no longer grows a new `elseif specId == ...` for each module;
- one generic instance-materialization path exists;
- dynamic modules still spawn and restore correctly.

---

# Workstream C — Normalize signal and param semantics

## Objective
Make signal kind / domain / param modulation semantics canonical and derivable from the module spec contract.

## Primary files
- `UserScripts/projects/Main/lib/modulation/providers/rack_sources.lua`
- `UserScripts/projects/Main/lib/modulation/providers/parameter_targets.lua`
- `UserScripts/projects/Main/lib/modulation/rack_control_router.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- maybe new helper: `UserScripts/projects/Main/lib/modulation/signal_contract.lua`

## Current pain
Spec ports currently expose `type = "control"` / `audio`, but the real routing/modulation semantics live elsewhere too:
- `voice_bundle`
- `gate`
- `trigger`
- `scalar_unipolar`
- `scalar_bipolar`
- `stepped`

That duplication is drift bait.

## Required code work

### C1. Define canonical signal kinds used by rack modules
At minimum:
- `audio`
- `voice_bundle`
- `gate`
- `trigger`
- `scalar`
- `scalar_unipolar`
- `scalar_bipolar`
- `stepped`

### C2. Define canonical domain values
At minimum:
- `audio`
- `voice`
- `event`
- `normalized`
- `midi_note`
- `time`
- `percent`
- `enum`

### C3. Move semantic truth toward the spec layer
Port definitions in module specs should carry the signal semantics needed by:
- route compiler
- endpoint registry
- popovers
- patchbay labeling

### C4. Normalize param semantics too
Params should declare enough to derive:
- target signal kind
- domain
- stepped/continuous behavior
- modulation compatibility

### C5. Make providers map, not invent
`rack_sources.lua` and `parameter_targets.lua` should mostly translate canonical spec info into endpoints, not be the primary source of semantic truth.

## Acceptance
- module ports/params have one authoritative semantic description;
- providers and compiler consume that description;
- adding a new module does not require re-explaining its signal semantics in three places.

---

# Workstream D — Unify patch/perf UI behavior under factory rules

## Objective
Make patch view and performance view obey the same control-display contract, especially for modulatable params.

## Primary files
- `UserScripts/projects/Main/lib/ui/modulation_widget_sync.lua`
- `UserScripts/projects/Main/lib/ui/update_sync.lua`
- `UserScripts/projects/Main/lib/ui/patchbay_generator.lua`
- module behaviors:
  - `ui/behaviors/envelope.lua`
  - `ui/behaviors/filter.lua`
  - `ui/behaviors/rack_oscillator.lua`
  - `ui/behaviors/arp.lua`
  - `ui/behaviors/fx_slot.lua`
  - `ui/behaviors/eq.lua`

## Current pain
Patch view and performance view were allowed to diverge semantically. That caused the modulation regression where performance view showed the effective value as if the base value had changed.

## Required code work

### D1. Make modulation-aware base/effective display the factory rule
Any modulatable widget must use:
- base/authored value as widget value
- effective value as overlay

### D2. Audit remaining raw `readParam() -> widget:setValue()` paths
Any remaining perf-view control sync that bypasses shared modulation-aware helpers should be brought under the contract.

### D3. Decide where the rule lives
Likely in shared UI sync helpers, not per-module folklore.

### D4. Make patchbay and perf use compatible display mapping rules
Enums/stepped/percent-scaled params should not drift between perf and patch displays.

## Acceptance
- perf and patch views show the same authored/modulated truth;
- no module is allowed to regress by bypassing the shared sync path;
- modulation overlays remain correct across dynamic rack modules.

---

# Workstream E — Normalize palette/browser derivation

## Objective
Make the module palette/browser derive from factory-owned module metadata rather than curated UI-only tables.

## Primary files
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`

## Current pain
The dock browser/palette has improved, but module browse metadata is still not clearly canonicalized off the spec layer.

## Required code work

### E1. Identify all palette-entry facts currently encoded outside module specs
For example:
- category
- display title
- subtitle/description
- card port summary
- search/filter terms
- order

### E2. Move those facts toward module spec metadata
### E3. Add a palette-entry builder that consumes canonical module specs
### E4. Ensure dynamic and static modules use the same metadata derivation path

## Acceptance
- adding a module to the factory gives it a predictable palette presence without bespoke UI edits beyond shared browser layout code;
- category/order/summary are not duplicated in disconnected places.

---

# Workstream F — Normalize lifecycle and cleanup

## Objective
Make module lifecycle obligations explicit in code structure so stateful modules don’t leak globals/view state and delete/recreate works predictably.

## Primary files
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- stateful modules/runtimes:
  - `lib/adsr_runtime.lua`
  - `lib/arp_runtime.lua`
  - future utility runtimes

## Current pain
Some modules export view/runtime state globally or depend on implicit cleanup paths. This is manageable now but will become a mess as more MIDI/mod utilities land.

## Required code work

### F1. Inventory current exported globals/state namespaces
Examples already present:
- `__midiSynthAdsrViewState`
- `__midiSynthArpViewState`
- dynamic module info/spec globals

### F2. Define what the factory owns vs what a module runtime owns
Examples:
- instance registration/unregistration = factory
- per-module exported view state = module/runtime
- cleanup call site = factory/integrator

### F3. Add explicit cleanup hooks/paths where missing
Deleting a module should clear:
- exported per-instance view state
- slot registration
- any temporary cached UI/runtime state

### F4. Make delete/recreate and project reload part of acceptance

## Acceptance
- stateful modules clean themselves up properly;
- delete/recreate does not leave stale globals or stale shell mappings;
- future stateful utilities have a clear lifecycle hook pattern.

---

# Workstream G — Prove the factory after refactor

## Objective
After the factory is hardened, prove it by implementing one small module against it.

## Candidate proof modules
Best low-risk proofs:
- `transpose`
- `velocity_mapper`
- `attenuverter`

Not yet:
- full sequencer
- heavy stateful timing monster
- giant modulation kitchen sink

## Why this matters
A factory refactor that cannot cleanly absorb one simple new module is fake.

## Acceptance
- one simple module lands using the hardened path;
- central-file edits are minimal and expected;
- module behavior is patch/perf consistent;
- palette/patchbay/modulation metadata all derive through the new factory path.

---

## Proposed Implementation Order

### Phase 1 — Spec + factory seam extraction
1. inventory current factory surfaces
2. normalize spec shape
3. extract factory/materializer layer
4. reduce central per-module patching

### Phase 2 — Semantic normalization
5. normalize signal kinds/domains/param semantics
6. make modulation/endpoint derivation consume canonical semantics

### Phase 3 — UI contract hardening
7. unify perf/patch modulation-aware display behavior
8. normalize palette/browser derivation from module specs

### Phase 4 — Lifecycle hardening
9. inventory and normalize cleanup hooks/state namespaces
10. verify delete/recreate/reload behavior

### Phase 5 — Proof slice
11. implement one trivial module against the hardened factory
12. use that to expose any remaining contract holes before writing workflow/delegation docs

---

## Risk Register

### Risk 1 — Over-refactor `midisynth.lua`
If we try to clean every unrelated behavior at once, we’ll create chaos.

**Mitigation:** only extract factory-related responsibilities; don’t “tidy everything.”

### Risk 2 — Semantic duplication survives under new names
We could create a shiny helper while still duplicating signal truth across specs/providers.

**Mitigation:** explicitly centralize signal/domain semantics.

### Risk 3 — Patch/perf parity drifts again
If modules keep their own ad-hoc sync logic, the same regression class returns.

**Mitigation:** shared modulation-aware widget sync is mandatory for modulatable controls.

### Risk 4 — Palette remains partly hand-built
Then the factory still isn’t complete.

**Mitigation:** treat palette metadata as factory output, not UI trivia.

### Risk 5 — Lifecycle/cleanup remains folklore
This will bite as soon as more stateful modules exist.

**Mitigation:** inventory existing globals now and normalize cleanup paths before expanding module count.

---

## Concrete Deliverables From This Worksheet

### Code deliverables
- normalized module spec shape
- extracted rack module factory/materializer layer
- reduced per-module instance patch special-casing
- canonical signal/param semantic path
- unified perf/patch modulation display behavior
- palette/browser metadata derived from specs
- explicit lifecycle/cleanup handling

### Follow-on docs that should be written **after** this refactor exists
- rack module factory contract doc
- rack module UI spec doc
- gotchas doc
- implementation workflow/delegation doc
- module brief template

Those docs should describe the factory **we actually have after refactor**, not aspirational nonsense.

---

## Exit Condition For This Worksheet

This worksheet is complete when the codebase is at the point where we can honestly say:

> “A new rack module can be added through one stable factory path, with one canonical spec contract, without inventing new central hacks.”
