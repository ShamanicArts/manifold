# FX Definitions Extraction Plan

## Status

**Status:** Completed  
**Completed On:** 2026-03-30  
**Risk Level:** Low  

This document is now a historical record of the extraction, plus notes on what actually shipped.

---

## 1. What Was Extracted

The following FX metadata and factory logic were extracted from the MidiSynth God files into a shared module:

- `FX_OPTIONS`
- shared FX definition/factory logic (`buildFxDefs()`)
- shared UI/DSP consumption of the same FX list

### Final shared location

```text
UserScripts/projects/Main/lib/fx_definitions.lua
```

This differs from the earlier draft plan that proposed `manifold/dsp/lib/fx_definitions.lua`. The final project-local location is the correct one for the current Main project architecture.

---

## 2. What Actually Shipped

### Shared module
- `UserScripts/projects/Main/lib/fx_definitions.lua`

### Consumers updated
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `UserScripts/projects/Main/dsp/midisynth.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`

### Runtime support added
To make shared project-local modules work cleanly in both DSP and UI contexts, project library paths were added to Lua module resolution in:
- `manifold/primitives/scripting/LuaEngine.cpp`
- `manifold/primitives/scripting/DSPPluginScriptHost.cpp`

That package-path work was essential. Without it, the extraction would have been a half-assed file move.

---

## 3. Outcome

### Duplication removed
The extraction eliminated duplicated FX definition logic across the main DSP/UI files.

### Practical benefits
- one source of truth for FX options
- easier future effect additions
- cleaner path toward reusable effect metadata for rack/palette/module systems
- DSP and UI now refer to the same effect naming universe

### Follow-on work that also landed
The FX definitions extraction turned into the first step of a bigger decomposition pass. Since then, the following related systems were also extracted:
- `lib/fx_slot.lua`
- `lib/voice_pool.lua`
- `lib/utils.lua`
- `lib/sample_synth.lua`
- multiple UI support modules under `lib/ui/`

---

## 4. Validation Summary

Validated during implementation:
- shared FX definitions load correctly
- DSP integration uses shared definitions
- UI behavior uses shared FX names
- project-local `require()` works in both DSP and UI runtimes after package-path changes

---

## 5. Notes / Deviations From Original Plan

### A. Final path changed
Original draft path:
- `manifold/dsp/lib/fx_definitions.lua`

Actual final path:
- `UserScripts/projects/Main/lib/fx_definitions.lua`

This was the right call because the extraction is currently scoped to the Main project module layer, not yet a global Manifold system library.

### B. Extraction scope expanded
Originally this was a narrow “move FX defs” plan.
In practice it became the opening move in a larger refactor that now includes shared DSP and UI subsystems.

### C. Standalone parity is not the current source of truth
The older plan assumed the standalone and integration files were peers. Current reality is:
- `midisynth_integration.lua` is the maintained source of truth
- standalone code is secondary/deprecated until rebuilt on top of shared modules

---

## 6. Conclusion

The FX definitions extraction is complete and successful.

More importantly, it proved the core pattern we needed:
- extract shared logic into project-local modules
- support those modules cleanly in both DSP and UI runtimes
- reduce god-object responsibility without breaking behavior

That pattern is now being used for the rest of the MidiSynth decomposition.
