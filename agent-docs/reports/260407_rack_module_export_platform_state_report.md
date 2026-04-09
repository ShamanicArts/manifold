# Rack Module Export Platform State Report

**Date:** 2026-04-07  
**Status:** Current-state architecture report  
**Scope:** Manifold export architecture, MidiSynth/rack/module relationships, Filter vertical slice, RackModuleHost status, missing infrastructure, next-step recommendations, and resize viability

---

## 1. Executive Summary

The current export system is **real and working**, but it is not yet a fully generalized “export any rack module with one command” platform.

The exported **Filter** plugin proves the architecture works end-to-end:
- separate CMake target
- compile-time boot into a different project
- thin DSP wrapper around an existing rack module
- thin UI wrapper around an existing Main component/behavior
- curated VST parameter alias surface
- export-mode editor/runtime behavior
- plugin-local OSC/OSCQuery + deep perf/debug introspection

That said, the current state is best understood as:

> **Filter is a successful vertical slice, not the finished generalized export platform.**

That is not a failure. It is the correct shape for this stage.

The immediate opportunity is to:
1. document the real architecture clearly,
2. factor the one-off Filter path into reusable export scaffolding,
3. add the next low-risk module exports (`EQ`, `FX`),
4. then move into a more complex export (`rack_sample`) once the shared harness is cleaned up.

The ideal long-term workflow is still sound:

> **Design module in Main → use it directly in the rack → test it in RackModuleHost → export it as a standalone plugin using the same Lua DSP/UI code.**

That is already partially true today. The remaining work is about making that path clean, repeatable, and less manually wired.

---

## 2. What Was Verified Live

A running Manifold socket was available at:
- `/tmp/manifold_2928351.sock`

That instance is currently booted into:
- `UserScripts/projects/Standalone_Filter/manifold.project.json5`

The export plugin’s OSCQuery server was reachable at:
- `http://127.0.0.1:9011/info`

Live checks confirmed:
- `/plugin/params/cutoff` exists and reports `3200`
- `/plugin/ui/perf/pluginDeltaPrivateDirtyMB` exists and reports about `45.4`

So the export path is not hypothetical or just build-time scaffolding. It is live and serving the expected plugin-facing namespace.

---

## 3. High-Level Architecture

## 3.1 Manifold is a runtime platform, not a single hardcoded plugin

At the top level, Manifold is a **JUCE + Lua runtime platform** with:
- a JUCE `AudioProcessor` and editor host,
- Lua UI loading,
- Lua DSP script loading,
- a library of DSP primitives,
- MIDI handling,
- IPC / OSC / OSCQuery control surfaces,
- settings and project loading.

The C++ runtime is generic enough that different plugin “products” can be created by booting into different Lua projects.

Examples already in-tree:
- `Main` → looper + MidiSynth integrated project
- `Standalone_Filter` → filter export wrapper project
- `RackModuleHost` → standalone module sandbox project
- `Settings` → system overlay/settings project

That is the correct mental model:

> **The C++ binary is the host runtime. The Lua project defines the plugin personality.**

---

## 3.2 There are three configuration layers

A lot of confusion disappears once the three config layers are separated.

### A. Repo/user settings
From:
- `.manifold.settings.json`
- or user fallback config

These control:
- `defaultUiScript`
- `devScriptsDir`
- `userScriptsDir`
- `dspScriptsDir`
- default OSC/OSCQuery settings

In normal development, this points at:
- `UserScripts/projects/Main/manifold.project.json5`

### B. Compile-time project override
For export builds, `Settings::getDefaultUiScript()` is overridden by:
- `MANIFOLD_DEFAULT_PROJECT`

This is already implemented in `manifold/primitives/core/Settings.h`.

That means each JUCE plugin target can boot a different project without changing the repo-local settings file.

Examples:
- `Manifold` boots Main
- `Manifold_Filter` boots Standalone_Filter

This is the key enabling infrastructure for export.

### C. Project manifest export config
Inside a project manifest, the `plugin` section defines export-mode behavior:
- view sizes / modes
- OSC defaults
- host-facing parameter aliases

This is parsed in `BehaviorCoreProcessor` via:
- `ExportPluginConfig`
- `ExportParamAlias`

So the actual layering is:
- **settings choose the project**,
- **the project manifest defines the export surface**.

That separation is good and should be preserved.

---

## 3.3 Project loading and asset resolution

`LuaEngine` can load a `manifold.project.json5` and resolve:
- `ui.root`
- `dsp.default`
- `sharedShell`
- project-relative asset refs
- system/user-prefixed refs

It also injects project context globals into Lua such as:
- `__manifoldProjectRoot`
- `__manifoldProjectManifest`
- `__manifoldStructuredUiRoot`

This matters because the export wrapper projects currently reach back into `../Main/...` for shared components/behaviors/modules.

That is how the current wrappers work without duplicating Main code.

---

## 4. Main, MidiSynth, Rack, Rack Modules, and RackModuleHost

## 4.1 Main

`UserScripts/projects/Main/` is still the main integrated product.

Its DSP entry (`dsp/main.lua`) attaches:
- `looper_baseline.lua`
- `midisynth_integration.lua`

So Main is not “just MidiSynth.” It is:
- looper baseline,
- plus MidiSynth,
- plus integration/routing between them.

Main is still the place where a lot of real-world composition and routing semantics live.

---

## 4.2 MidiSynth

MidiSynth is no longer a single isolated God blob, but it is also not yet a clean standalone first-class project boundary.

The real source of truth is still mostly:
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`

However, a large amount of logic has already been extracted into shared modules:
- `parameter_binder.lua`
- `sample_synth.lua`
- `voice_pool.lua`
- `fx_slot.lua`
- `fx_definitions.lua`
- `rack_modules/*.lua`
- `*_runtime.lua`
- rack audio routing/modulation helpers
- rack UI helpers

This extraction work is exactly what makes export viable now.

So the honest state is:

> **MidiSynth is still hosted inside Main, but enough of it has been modularized that export wrappers can now reuse real subsystems instead of fake copies.**

---

## 4.3 Rack

The rack is the **composition/runtime UI model** for module layout and connections.

The main spec surface lives in:
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`

This file defines:
- module IDs
- valid size modes
- ports
- parameter metadata
- UI component refs
- UI behavior refs
- canonical rack state
- default rack connections
- connection normalization rules

The rack is therefore the composition language, not the DSP implementation itself.

---

## 4.4 Rack modules

The actual reusable DSP modules for audio-producing / audio-processing rack units live in:
- `UserScripts/projects/Main/lib/rack_modules/`

Examples:
- `filter.lua`
- `fx.lua`
- `eq.lua`
- `oscillator.lua`
- `sample.lua`
- `blend_simple.lua`

These are not fake wrappers over a hidden monolith. They are real DSP descriptions that instantiate primitive nodes and expose:
- `createSlot(slotIndex)`
- `applyPath(path, value)`

This is the main reason the export architecture is credible.

---

## 4.5 Voice/mod/control modules

Modules like:
- ADSR
- Arp
- Transpose
- Velocity Mapper
n- Scale Quantizer
- Note Filter
- LFO
- Slew
- Sample Hold
- Compare
- CV Mix
- Attenuverter/Bias
- Range Mapper

primarily exist as runtime/control transforms rather than normal standalone audio-producing DSP blocks.

These currently live mostly as:
- `*_runtime.lua`

They are valid rack modules inside MidiSynth and RackModuleHost, but they do **not** automatically map to the same export story as audio modules.

That is a real product-design problem, not just missing code.

---

## 4.6 RackModuleHost

`UserScripts/projects/RackModuleHost/` is the standalone test/sandbox environment for loading one module at a time.

Important correction:

The older planning worksheet still describes RackModuleHost as badly broken and primitive.

That document is stale.

The **current code** shows RackModuleHost is much further along and already includes:
- module registry for all categories
- canonical size handling
- rack module shell usage
- host input generators
- MIDI device UI and polling support paths
- audition logic for non-audio modules
- graph/file workspace tooling
- module-specific UI mounting

So the current practical status is:

> **RackModuleHost is already a serious dev sandbox and should be treated as the proving ground for future exports.**

---

## 5. What the Filter Export Actually Is

## 5.1 DSP side

`UserScripts/projects/Standalone_Filter/dsp/main.lua` is a thin wrapper.

It does the following:
- appends `../Main/lib`, `../Main/ui`, and `../Main/dsp` to `package.path`
- requires shared Main modules:
  - `utils`
  - `parameter_binder`
  - `rack_modules.filter`
- creates a single filter slot
- wires:
  - plugin input → filter node
  - filter node → plugin output
- registers dynamic filter schema for slot 1

This means the exported filter is using the **same rack module DSP** as Main.

That is exactly the correct architecture.

---

## 5.2 UI side

`UserScripts/projects/Standalone_Filter/ui/main.ui.lua` is also a thin wrapper.

It:
- disables `sharedShell`
- creates a small plugin host panel/header
- loads the existing Main filter component and behavior:
  - `../Main/ui/components/filter.ui.lua`
  - `../Main/ui/behaviors/filter.lua`
- passes export-specific props:
  - `instanceNodeId = "standalone_filter_1"`
  - `paramBase = "/plugin/params"`

So the filter export UI is not a duplicate fork.
It is the real Main filter UI running inside a wrapper project.

---

## 5.3 Host-facing parameter surface

The filter plugin manifest defines a curated public plugin namespace:
- `/plugin/params/type`
- `/plugin/params/cutoff`
- `/plugin/params/resonance`

These are mapped internally to normal Manifold paths:
- `/midi/synth/rack/filter/1/type`
- `/midi/synth/rack/filter/1/cutoff`
- `/midi/synth/rack/filter/1/resonance`

This is handled in `BehaviorCoreProcessor` via:
- `resolveExportPluginConfig()`
- `syncPublicPathToHostParameter()`
- `parameterChanged()`
- `resolveExportInternalPath()`

This alias layer is one of the strongest pieces of existing infrastructure.

---

## 6. What Makes Filter Work

The Filter export works because several pieces now exist at once.

## 6.1 Compile-time project override

The plugin target defines:
- `MANIFOLD_DEFAULT_PROJECT=.../UserScripts/projects/Standalone_Filter/manifold.project.json5`

This lets the same runtime boot into a different project automatically.

## 6.2 Export-mode behavior in C++

`BehaviorCoreProcessor` and `BehaviorCoreEditor` already know about export mode.

Export-mode behavior includes:
- loading export plugin config from the project manifest
- creating JUCE host parameters from manifest aliases
- exposing export OSC/OSCQuery endpoints
- using export-sized editor dimensions
- skipping generic editor hosts/dev chrome in export mode

This is not just Lua wrapper behavior. There is now real export-runtime support in C++.

## 6.3 Curated `/plugin/*` namespace

Export plugins expose:
- `/plugin/params/*`
- `/plugin/ui/*`
- `/plugin/ui/perf/*`

That is a clean public plugin surface distinct from raw internal MidiSynth paths.

## 6.4 Shared Main module reuse

The filter export reuses:
- Main DSP module implementation
- Main UI component
- Main UI behavior
- Main theme

So there is no duplication of the actual module logic.

---

## 7. Current Hacks / Couplings / Sharp Edges

Some of the hacks are the right kind of hack. Some need generalization.

## 7.1 Good hack: `MANIFOLD_DEFAULT_PROJECT`

This is the foundational trick and should remain part of the architecture.

Without it, every target would still boot whatever `.manifold.settings.json` points at.

This is the correct hack.

## 7.2 Good hack: `sharedShell = false`

Export wrapper projects can opt out of the shared shell.
That prevents the generic shell/dev/editor UI from bleeding into export plugins.

That is not just aesthetic. It reduces unnecessary export-mode baggage.

## 7.3 Real coupling: wrappers depend on `../Main/...`

Current standalone projects are only “standalone” in the plugin target sense.
At the Lua project level they still depend on:
- `../Main/lib/...`
- `../Main/ui/...`
- `../Main/themes/...`

That is acceptable for now, but it means:
- exports are not yet package-separated,
- module ownership is still partially anchored in Main,
- moving modules into a truly independent package/project layer is still future work.

## 7.4 Manual manifest parameter alias lists

Filter only has three parameters, so hand-authoring the manifest alias list is fine.

It will become stupid and error-prone if repeated manually for many more modules.

This needs automation or at least helper generation soon.

## 7.5 UI param-base compatibility is not uniform

Filter’s Main UI behavior works well with `paramBase = "/plugin/params"` because its behavior logic mostly appends:
- `/type`
- `/cutoff`
- `/resonance`

More complex module UIs are not all this forgiving.

For example, some source-module UIs expect param-base patterns closer to internal dynamic rack paths like:
- `/midi/synth/rack/osc/<slot>`
- `/midi/synth/rack/sample/<slot>`

So the Filter export does **not** prove that every module UI can simply be rebound to `/plugin/params`.

The future-safe pattern is likely:
- keep UI bound to internal dynamic slot paths where necessary,
- expose curated DAW/public aliases separately,
- sync host params into those internal paths.

That distinction will matter for oscillator and sample exports.

---

## 8. Existing Export Infrastructure That Is Already Strong

These are the parts that already feel solid and reusable.

## 8.1 Project boot override
Implemented and correct.

## 8.2 Manifest-driven export config
`plugin.view`, `plugin.osc`, and `plugin.params` form a good export contract.

## 8.3 Host parameter aliasing
This is the cleanest generalized mechanism currently in place.

Benefits:
- public DAW-facing param names
- internal Manifold path preservation
- no need to rewrite DSP internals for each export

## 8.4 Export OSC / OSCQuery plumbing
Per-plugin export introspection is already live and useful.

## 8.5 Deep plugin-attributable perf/debug introspection
The Filter work added reusable instrumentation for:
- plugin memory deltas
- UI deltas
- DSP timing
- plugin-owned GPU accounting
- deep category accounting

This is valuable export-platform infrastructure, not just a one-off investigation.

## 8.6 RackModuleHost as a proving ground
The sandbox already contains enough module metadata and behavior to be the natural export incubation space.

---

## 9. Missing Infrastructure / Generalization Gaps

This is the real work still ahead.

## 9.1 No generalized export scaffolding yet

Filter is currently hardcoded across:
- project folder
- project manifest
- DSP wrapper
- UI wrapper
- CMake target

This is okay once.
It is not the final workflow.

## 9.2 No real shared export/runtime wrapper core

There is a file:
- `UserScripts/projects/Main/lib/rack_module_host_runtime.lua`

It claims to provide the same runtime future exports will use.

However, it does not appear to be used by the current export path, and parts of it look stale relative to current module naming.

That file should not be allowed to sit in an ambiguous state.

The system needs one of two outcomes:
- make it the real shared export wrapper core,
- or replace/remove it so the code stops lying about architecture.

## 9.3 No generic CMake export macro

`Manifold_Filter` is still hardcoded in `CMakeLists.txt`.

This needs a reusable helper like:
- `add_manifold_export_plugin(...)`

with shared target setup, asset copying, and compile definitions.

## 9.4 No automatic host-param generation from module metadata

The system already has reusable metadata in:
- `rack_midisynth_specs.lua`
- `parameter_binder.lua`
- `module_host_registry.lua`

That metadata should be leveraged to generate or assist generation of:
- host param IDs
- names
- min/max/default
- choice lists
- descriptions

Manual duplication into every export manifest will become a maintenance swamp.

## 9.5 Source-module standalone harness is not cleanly extracted yet

`rack_oscillator` and `rack_sample` exports need shared infrastructure for:
- MIDI input handling
- voice allocation
- note on/off management
- possibly retrigger/sample readback concerns

Pieces of this logic already exist in:
- Main/MidiSynth behavior/runtime
- RackModuleHost audition flow

But the export-ready shared harness is not yet factored cleanly.

## 9.6 Non-audio module export is still a product decision, not just code

Control/voice/scalar modules do not yet have a clean, obvious standalone plugin identity.

Possible identities include:
- standalone audition plugin,
- MIDI effect,
- developer tool,
- non-exported module category.

This should be decided intentionally rather than accidentally.

---

## 10. Module Export Readiness Matrix

## 10.1 Best immediate targets

### EQ
Why it is a good next target:
- same class as Filter: audio processor
- audio in → audio out
- existing DSP module
- existing UI behavior/component
- no new voice-allocation problem

### FX
Why it is a good next target:
- same class: processor plugin
- audio in → audio out
- existing slot UI/behavior
- more parameters than Filter, which is actually useful for testing alias/scaffolding quality

### Blend Simple
Why it is a good third target:
- real audio output
- existing DSP/UI
- slightly more wiring complexity than Filter/EQ
- still much easier than oscillator/sample/control modules

These three are the most practical next export targets.

---

## 10.2 More complex but desirable targets

### Rack Sample
This is one of the most strategically interesting exports.

Why it matters:
- it is musically meaningful on its own,
- it stresses the export architecture more honestly than another simple processor,
- it exercises source-module voice/input/capture behavior,
- it is the kind of plugin that is actually compelling outside Main.

Why it is harder:
- MIDI input + voice allocation
- sample capture/input routing
- phase vocoder / analysis readback
- more coupled UI semantics
- more likely need for internal-path UI binding + public alias exposure split

Recommendation:

> **`rack_sample` should be the first “complex export” target once EQ/FX prove the generalized scaffolding.**

This is a better strategic next-step than jumping straight into control-only modules.

### Rack Oscillator
Also a good candidate after EQ/FX.

Harder than Filter/EQ/FX because it needs:
- MIDI input
- voice allocation
- synth target semantics
- likely more careful param-base handling

---

## 10.3 Not yet clean standalone products

Modules like ADSR, LFO, Arp, Slew, Compare, CV Mix, etc. should not be treated as immediate export equivalents to Filter.

They need a product decision first:
- standalone audition wrappers,
- MIDI FX,
- developer/debug tools,
- or “rack-only for now”.

Recommendation:

> **Do not spend the next export cycle pretending non-audio modules are the same problem as Filter. They are not.**

---

## 11. Resizing: Current State, Risk, and Viability

The user raised a real concern here.

There was previous work where resizing had to be abandoned because it caused repeated crashes in the plugin and plugin host.

That concern is valid, and the correct stance is:

> **Treat resizing as an explicitly risky lifecycle/host integration area, not as a cosmetic afterthought.**

## 11.1 What exists right now

Current export plugin infrastructure already stores editor size in export mode:
- `BehaviorCoreProcessor::setExportEditorSize()` stores current width/height
- `BehaviorCoreEditor::resized()` pushes live width/height into export state
- editor size is serialized/deserialized in plugin state
- the manifest defines default export sizes and view modes

So export plugins already have:
- a concept of current editor size,
- a concept of default view size,
- a concept of compact vs split layout.

That means resizing is not starting from zero.

## 11.2 Important distinction: JUCE standalone vs plugin-hosted VST resizing

Resizing has two very different contexts.

### A. Standalone app resizing
In standalone builds, the app/window can often be made resizable more directly.
This is under more local control.

### B. Hosted plugin editor resizing
In VST hosts, the host owns the editor embedding lifecycle.
The plugin editor can request/advertise sizes, but host behavior varies a lot.

This matters because a resize crash is usually not about “the UI being bigger.”
It is about some combination of:
- host/editor lifetime ordering,
- runtime tree rebuild timing,
- GL/render backend state,
- stale layout/deferred refresh closures,
- content being resized during render/update transitions.

That is a lifecycle correctness problem.

## 11.3 Why resizing has been dangerous in this codebase historically

This repo already has plenty of evidence that UI lifecycle transitions are crash-sensitive:
- project switching
- overlay switching
- Lua teardown lifetime issues
- stale deferred closures
- retained tree/display-list timing issues
- runtime/root-mode differences

So if resizing previously crashed hosts, the safe assumption is:
- it was a real bug in lifecycle/render/update ordering,
- not “just host instability.”

That needs disciplined narrowing, not blind re-enabling.

## 11.4 Is controlled resizing viable?

Yes — **constrained resizing is viable**, if treated as a bounded feature and not a freeform anything-goes resize system.

The right model is:
- limited, explicit size modes first,
- optional continuous resize later only if the bounded model is stable.

### Recommended resize model

#### Phase R1 — Fixed size modes only
Support only named sizes / modes:
- compact
- split
- maybe large

These are already close to the existing architecture.

This is the lowest-risk path because:
- layouts remain known and testable,
- aspect-ratio assumptions stay bounded,
- host resize requests are discrete and predictable.

#### Phase R2 — Constrained bounded resizing
If R1 is stable, allow resizing only within a bounded rectangle:
- min width/height per plugin
- max width/height per plugin
- optional snap-to-grid or snap-to-aspect behavior

For example, processor plugins could expose:
- min = canonical compact size
- max = 1.5× or 2× canonical width/height

This allows some freedom without exploding every layout assumption.

#### Phase R3 — Only then consider freer resizable editors
Only after proving stability under:
- rapid open/close,
- project reload,
- host reopen,
- automation + resize,
- direct renderer + canvas renderer,
- multiple DAWs,
- multiple instances.

## 11.5 Resizing recommendation for export plugins

Recommendation:

> **Do not reintroduce arbitrary resize first. Reintroduce bounded resize as a controlled feature after EQ/FX export scaffolding lands.**

That means:
1. keep current named-size export model as the stable baseline,
2. implement bounded resize policy for standalone first,
3. then test bounded resize in hosted VSTs,
4. only ship it once it survives host lifecycle stress.

## 11.6 Practical testing requirements for resize work

Any resize reintroduction should be validated with a real matrix:
- standalone open/close + repeated resize
- plugin-host open/close in at least 2 hosts
- resize while audio is active
- resize while automation changes are arriving
- resize after UI view-mode switches
- resize after hiding/showing dev/perf overlays
- repeated editor reopen with persisted size state
- if OpenGL/direct rendering is enabled, test that separately from canvas mode

Without that, resize support will just become another crash farm.

---

## 12. Recommended Next Steps

These recommendations aim to make the export path easy and repeatable.

## 12.1 Immediate documentation/architecture actions

1. **Treat this report as the new current-state reference** for export work.
2. Mark older planning docs as partially stale where they still describe RackModuleHost as badly broken.
3. Keep future export work tied to the actual current code, not only the original worksheet assumptions.

## 12.2 Immediate implementation sequence

### Step 1 — Generalize the Filter path
Factor the one-off Filter vertical slice into reusable export scaffolding:
- shared CMake helper/macros,
- shared Lua DSP wrapper helpers,
- shared Lua UI wrapper helpers,
- shared param alias generation helpers.

This is the most important next engineering move.

### Step 2 — Add low-risk processor exports
Use the generalized scaffolding to add:
1. `Standalone_EQ`
2. `Standalone_FX`

These are the best next targets because they exercise the same product class as Filter while increasing parameter and UI complexity.

### Step 3 — Add the first complex export
After EQ/FX are working through the generalized path:
- target `rack_sample`

Reason:
- it is musically interesting,
- it proves source-module export,
- it exercises real complexity that simple processors do not.

### Step 4 — Clean up shared runtime ambiguity
Resolve the status of:
- `rack_module_host_runtime.lua`

It should either become:
- the real shared export/module-host runtime core,

or be replaced/retired.

### Step 5 — Extract shared source-module harness
Before oscillator/sample export is treated as routine:
- extract shared MIDI/voice allocation helpers,
- separate UI internal-path binding from host-public alias exposure where necessary.

### Step 6 — Reintroduce resizing as a bounded feature
Only after export scaffolding is stable:
- start with discrete size modes,
- then bounded resize,
- then broader support only if stable.

---

## 12.3 Explicit recommendation ordering

### Do next
- generalize Filter export scaffolding
- export EQ
- export FX
- plan/sample-proof `rack_sample`

### Do not do next
- jump immediately into ADSR/LFO/Arp standalone exports
- assume all module UIs can just swap to `/plugin/params`
- keep hand-authoring large manifest param alias lists forever
- re-enable unconstrained resize blindly

That would be a wasteful way to step on the same rakes again.

---

## 13. Ideal Long-Term Workflow

The target workflow should be:

1. **Design a module in Main**
   - DSP in `rack_modules/*.lua` or runtime helper
   - UI in Main component/behavior
   - spec registered in rack metadata

2. **Use it directly in the rack**
   - patch it with other modules
   - refine ports/params/UX

3. **Exercise it in RackModuleHost**
   - canonical size
   - standalone-ish interaction
   - audio/MIDI testing
   - graph/file/debug tools

4. **Export it as a standalone plugin**
   - same DSP module
   - same UI behavior/component
   - thin wrapper project only
   - curated host parameter aliases

5. **Optionally support bounded resize and richer standalone polish**
   - once lifecycle stability is proven

That is still the right architecture goal.

---

## 14. Bottom Line

The export architecture is no longer speculative.

The following are already real:
- compile-time per-plugin project boot override
- export-mode processor/editor behavior
- manifest-driven export config
- host param aliasing
- plugin-local OSC/OSCQuery/debug surface
- live Filter export
- a much stronger RackModuleHost sandbox than older docs imply

The remaining work is not “invent export from scratch.”
It is:
- factor one good vertical slice into reusable platform scaffolding,
- add the next easy exports,
- then tackle one honest complex export (`rack_sample`),
- and only reintroduce resize in a bounded, disciplined way.

The cleanest current statement of the platform is:

> **Design in Main. Prove in RackModuleHost. Export with thin wrapper projects. Keep DSP/UI code shared. Generalize the scaffolding. Bound the resize problem.**

That is the path forward.
