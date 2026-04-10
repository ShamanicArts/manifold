# Standalone FX Export Scaffold

**Date:** 2026-04-10  
**Scope:** Add a single-slot multi-effect export using the shared manifest/CMake/export scaffold, and handle the nasty part correctly: effect type switching with parameter recall.

---

## What was added

### New export project
Added:
- `UserScripts/projects/Standalone_FX/dsp/main.lua`
- `UserScripts/projects/Standalone_FX/ui/main.ui.lua`
- `UserScripts/projects/Standalone_FX/manifest.spec.json`
- generated `UserScripts/projects/Standalone_FX/manifold.project.json5`

### Shared export UI component
Added:
- `UserScripts/projects/Main/ui/components/export_fx_slot.ui.lua`

This reuses the existing FX slot layout but uses square export styling.

### Shared build wiring
Added new CMake target via shared macro:
- `Manifold_FX`

Product name:
- `Manifold Effect`

Build outputs:
- `Manifold_FX_Standalone`
- `Manifold_FX_VST3`

### Manifest generator support
Added new generator in:
- `tools/generate_export_manifest.py`

Generator name:
- `fx_single`

It emits:
- `/plugin/params/type`
- `/plugin/params/mix`
- `/plugin/params/p/0..4`

with internal mapping to:
- `/midi/synth/rack/fx/1/...`

### Deploy helper update
Updated:
- `scripts/deploy_export_vst3.sh`

New aliases:
- `FX`
- `Effect`
- `Manifold_FX`

---

## Shared scaffold changes

### `export_plugin_scaffold.lua`
Extended to accept:
- `extraDepsFactory(ctx, slots)`

Why:
- `rack_modules.fx` is not as simple as Filter/EQ
- it needs `FxSlot`, `fxDefs`, `fxCtx`, and `maxFxParams`

Without this, the shared scaffold only worked for the dumb/simple single-node cases.

This makes the scaffold usable for module types that need richer runtime dependency construction.

---

## Important FX-specific fixes

This was the actual interesting part.

### 1. Internal schema defaults now match the exported default effect
Problem:
- the manifest generator emitted Chorus-shaped defaults for params
- but `ParameterBinder.buildDynamicSlotSchema("fx", ...)` still defaulted every FX param to `0.5`
- so the runtime boot state did not actually match the exported manifest defaults

Fix:
- added `fxParamDefaults` support to dynamic FX schema generation in `parameter_binder.lua`
- `Standalone_FX/dsp/main.lua` now passes Chorus defaults:
  - `0.5, 0.5, 0.2, 0.6, 0.4`

Result:
- booted internal parameter state matches the exported manifest intent

### 2. Effect type switching now syncs public/internal param state
Problem:
- `FxSlot` keeps per-effect parameter values internally
- but switching type did not push the selected effect's stored values back onto the actual parameter paths
- that means UI / automation / exported host params could drift from the selected DSP state

Fix:
- `rack_modules.fx.lua` now writes the selected effect's parameter set back to:
  - `/midi/synth/rack/fx/<slot>/p/0..4`
  after type changes
- `rack_module_host_runtime.lua` now passes `ctx` into FX module deps so that host param writes are available in shared runtime usage too

Result:
- switching effect type updates the visible/current parameter set correctly
- per-effect parameter recall survives type swaps

This is the part that would have been fake-clean if left unfixed.

---

## Ports

Assigned FX export ports:
- OSC: `9030`
- OSCQuery: `9031`

This follows the same tens pattern used for other exports.

---

## Verification performed

### Build
Built successfully:
- `Manifold_FX_Standalone`
- `Manifold_FX_VST3`

### Deploy
Deployed successfully:
- `~/.vst3/Manifold Effect.vst3`

### IPC/runtime verification
Using the running Manifold standalone via IPC, switched to:
- `UserScripts/projects/Standalone_FX/manifold.project.json5`

Verified internal defaults after reload:
- type = `0`
- mix = `0`
- p0 = `0.5`
- p1 = `0.5`
- p2 = `0.2`
- p3 = `0.6`
- p4 = `0.4`

Verified type switching / recall behavior:
- switched to WaveShaper (`type = 2`)
- observed params update to WaveShaper defaults/state
- modified `p/0`
- switched back to Chorus
- switched again to WaveShaper
- confirmed the WaveShaper-specific parameter value was recalled correctly

### Export binary verification
Launched the real `Manifold Effect` standalone export binary and verified OSCQuery on:
- `http://127.0.0.1:9031/`

Observed exported parameter tree included:
- `type`
- `mix`
- `p/0..4`

---

## Result

The shared export infrastructure now handles a more complex module than Filter/EQ:
- generated manifest
- shared CMake target macro
- shared DSP scaffold with richer deps
- shared shell UI
- export-specific square FX component
- correct FX default boot state
- correct effect switching parameter recall

So yeah, this is no longer just "single hardwired node export" infrastructure.
It now handles a genuinely stateful swappable module.
