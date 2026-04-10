# Export Wrapper Follow-ups: Filter + EQ8

**Date:** 2026-04-10  
**Scope:** Follow-up fixes and reusable scaffolding identified while bringing `Standalone_Filter` and `Standalone_Eq` to parity.

---

## 1. Immediate fixes requested

### 1.1 EQ settings/perf overlay parity

`Standalone_Eq` had the overlay files present, but the wrapper was incomplete.

#### Problems found
- `UserScripts/projects/Standalone_Eq/ui/main.ui.lua` mounted only `eq_component`
- it did **not** mount:
  - `settings_overlay`
  - `perf_overlay`
- `UserScripts/projects/Standalone_Eq/ui/behaviors/main.lua` still referenced `filter_component`
  - obvious copy/paste bug from the Filter wrapper

#### Fixes applied
- mounted `settings_overlay` in `Standalone_Eq/ui/main.ui.lua`
- mounted `perf_overlay` in `Standalone_Eq/ui/main.ui.lua`
- changed wrapper behavior lookup from `filter_component` to `eq_component`

Result:
- EQ now has the same settings/perf overlay plumbing as Filter

---

### 1.2 Header toggle label

The header toggle was labeled `DEV`, but it actually toggled `/plugin/ui/settingsVisible`.

#### Why this was wrong
- the label described the wrong action
- it implied a dev/perf toggle, but the control opened the settings page

#### Fix applied
Changed the header toggle label in both wrappers from:
- `DEV`

to:
- `SET`

Files updated:
- `UserScripts/projects/Standalone_Filter/ui/main.ui.lua`
- `UserScripts/projects/Standalone_Eq/ui/main.ui.lua`

---

### 1.3 Rounded corners in exported plugins

The exported Filter and EQ8 plugins were rendering with rounded module corners, which does not match the rack-module presentation and clashes with the square header treatment.

#### Actual source of the problem
The rounding was not coming from the wrapper shell. It was coming from the shared Main module component roots:
- `UserScripts/projects/Main/ui/components/filter.ui.lua`
- `UserScripts/projects/Main/ui/components/eq.ui.lua`

#### Fixes applied
Set the following radii to `0`:
- Filter root panel
- Filter graph panel
- EQ root panel
- EQ graph panel

Result:
- both exports now render square instead of rounded

---

## 2. What specifically tripped us up

### 2.1 Filter export patterns do **not** directly generalize to EQ

Filter uses a flat public parameter surface:
- `/plugin/params/type`
- `/plugin/params/cutoff`
- `/plugin/params/resonance`

EQ does not. EQ UI behavior expects nested band paths:
- `/plugin/params/band/1/enabled`
- `/plugin/params/band/1/type`
- `/plugin/params/band/1/freq`
- `/plugin/params/band/1/gain`
- `/plugin/params/band/1/q`
- ...through band 8

#### Failure mode
A flat manifest was initially used for EQ. That caused click-created bands to disappear because:
- the behavior wrote nested band paths
- the manifest exposed only flat aliases
- the next UI sync read back “nothing” from the expected nested paths

#### Conclusion
Before creating an export manifest, the **exact path expectations of the reused UI behavior** must be checked first.

---

### 2.2 Public export params and internal rack params are different layers

The export wrapper must correctly map:
- public plugin-facing paths under `/plugin/params/...`

to:
- internal engine/module paths under `/midi/synth/rack/...`

For EQ8, the working internal mapping is:
- `/plugin/params/band/N/...` → `/midi/synth/rack/eq/1/band/N/...`
- `/plugin/params/output` → `/midi/synth/rack/eq/1/output`
- `/plugin/params/mix` → `/midi/synth/rack/eq/1/mix`

If that mapping is wrong, the wrapper appears partially alive while silently dropping state.

---

### 2.3 Wrapper copy/paste drift is a real recurring problem

Concrete example:
- EQ wrapper behavior still referenced `filter_component`

This kind of error is easy to miss because the project still builds and large parts of the wrapper still function.

#### Conclusion
Wrapper projects are too copy/paste-heavy and need shared scaffolding.

---

### 2.4 Having overlay files is not enough

A wrapper can contain:
- `settings_panel.lua`
- `perf_overlay.lua`
- `settings_panel.ui.lua`
- `perf_overlay.ui.lua`

and still be broken if:
- the overlays are not mounted in `components`
- the wrapper behavior does not look them up by the correct ids

#### Conclusion
Overlay parity must be treated as part of wrapper assembly, not as a side file copy.

---

### 2.5 Build output != installed VST3

Even once the VST3 target is built, the installed bundle still has to be updated in:
- `~/.vst3/`

That deployment step is currently manual and easy to forget.

---

## 3. Boilerplate that is duplicated across Filter + EQ and should become shared

### 3.1 Shared export UI shell

Current duplicated wrapper structure includes:
- square outer root panel
- header strip
- accent block
- title label
- settings toggle
- content background
- mounted module component
- settings overlay
- perf overlay

This should become a shared wrapper shell instead of per-project copy/paste.

Suggested responsibility:
- accept title/accent/component metadata as config
- mount the actual module UI inside a standard export shell

---

### 3.2 Shared export shell behavior

Current duplicated behavior logic includes:
- header layout
- content scaling
- settings/perf overlay visibility handling
- settings toggle sync
- runtime widget lookup

This should become one shared behavior with configuration for:
- mounted component id
- content reference width/height
- possibly optional overlay support flags

---

### 3.3 Shared single-module DSP export wrapper

Filter and EQ both do the same basic DSP wrapper work:
- create passthrough input
- create passthrough output
- instantiate one rack module slot
- connect input → module → output
- register schema
- forward `onParamChange`

This should be expressed through a reusable helper rather than rewritten in each export project.

---

### 3.4 Shared export param/schema generation

Hand-authoring large `plugin.params` blocks is already annoying for EQ and will get worse for more complex exports.

The system already has reusable metadata in:
- `UserScripts/projects/Main/lib/parameter_binder.lua`
- rack/module metadata files

That should be used to generate or assist generation of export manifests.

At minimum, generation should cover:
- path
- type
- min/max/default
- choice lists
- description
- internal path

---

### 3.5 Shared CMake export helper

Current export targets still require per-module target wiring.

A shared CMake helper should own:
- target creation
- compile-time default project override
- Lua asset copy rules
- VST3 bundle naming
- possibly deploy hooks

---

### 3.6 Shared deploy/install step

A reusable deployment step should copy built VST3 bundles into:
- `~/.vst3/`

This should stop being a manual memory test.

---

### 3.7 Shared naming conventions

The following should be explicitly standardized:
- project dir name
- target name
- product name
- VST3 bundle name
- install destination path

This matters because executable/bundle names with spaces are already a source of friction.

---

## 4. Working rules we should document and follow next time

1. **Do not assume Filter’s parameter shape applies to another module.**  
   Check the actual reused UI behavior path construction first.

2. **Treat public export params and internal module params as separate layers.**  
   The manifest is the bridge and must be correct.

3. **When copying a wrapper, audit all component ids immediately.**  
   Especially runtime widget lookup ids.

4. **Overlay support is not complete until it is mounted and referenced correctly.**

5. **Build is not deploy.**  
   Installed VST3 state must be updated explicitly unless automated.

---

## 5. Recommended next sharedization order

### Step 1
Extract a shared export shell for processor-style exports:
- Filter
- EQ
- FX

### Step 2
Extract a shared single-module DSP export helper.

### Step 3
Add generated or assisted export manifest/schema generation.

### Step 4
Add a shared VST3 deploy/install helper.

Only after that should more complex exports be pushed through the same path.

---

## 6. Files changed in this follow-up

### Wrapper / export fixes
- `UserScripts/projects/Standalone_Eq/ui/main.ui.lua`
- `UserScripts/projects/Standalone_Eq/ui/behaviors/main.lua`
- `UserScripts/projects/Standalone_Filter/ui/main.ui.lua`
- `UserScripts/projects/Standalone_Eq/manifold.project.json5`

### Shared component presentation fixes
- `UserScripts/projects/Main/ui/components/filter.ui.lua`
- `UserScripts/projects/Main/ui/components/eq.ui.lua`

---

## 7. Current outcome

After these changes:
- EQ settings page plumbing matches Filter
- both exports use square module corners instead of rounded ones
- the header toggle label better matches its actual purpose
- EQ export params are using the correct nested band structure
- both VST3 bundles can be rebuilt and copied into `~/.vst3/`
