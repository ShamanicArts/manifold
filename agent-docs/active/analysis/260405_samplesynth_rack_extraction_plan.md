# SampleSynth Rack Module Extraction Plan

**Date:** 2026-04-05  
**Status:** Ready for Implementation  
**Scope:** Extract Sample mode and Blend modes as rack modules

---

## Overview

Extract the remaining SampleSynth modes as rack modules following the factory pattern established by the OSC (oscillator) extraction.

---

## 1. Sample Module

### Description
Sample playback module with phase vocoder, regions, partials analysis, and capture.

### Inputs
- **Audio input** (optional): Generic audio input for external sources
- **Capture source** (dropdown): Live input, Looper Layer 0-3, Retrospective

### Outputs
- **Audio out**: Sample playback audio
- **Analysis out**: Partials analysis data (auto-generated on capture/request)

### Params
- `sampleId` / source selection
- `rootNote` (0-127)
- `tuneCents` (-100 to +100)
- `regionStart` (0-1)
- `regionLoop` (0-1)
- `regionEnd` (0-1)
- `timeStretch` (0.25x - 4x)
- `pitchShift` (-24 to +24 semitones)
- `captureTrigger` (command)

### Files
- `UserScripts/projects/Main/ui/behaviors/rack_sample.lua`
- `UserScripts/projects/Main/ui/components/rack_sample.ui.lua`

### UI Features
- Dropdown for capture source selection
- Capture button
- Waveform display with draggable region markers
- Playhead position indicator
- Param knobs organized in sections (Tuning, Regions, Processing)

---

## 2. Simple Blend Modules (Mix, Ring, FM, Sync)

### Description
Audio-only blend operators that combine two inputs without analysis.

### Pattern
**Option A:** Single module with type selector dropdown
**Option B:** Individual modules per blend type

*Decision: TBD during implementation - start with Option A (single module), split if UI becomes cluttered*

### Inputs
- **Audio in A**
- **Audio in B**

### Outputs
- **Audio out**

### Blend Types & Params

| Type | Description | Params |
|------|-------------|--------|
| Mix | Crossfade between A and B | `mix` (0-1) |
| Ring | Ring modulation (A × B) | `mix` (0-1, dry/wet) |
| FM | Frequency modulation (B modulates A) | `fmAmount` (0-100), `mix` |
| Sync | Hard sync (B resets A phase) | `syncHardness` (0-1), `mix` |

### Files
- `UserScripts/projects/Main/ui/behaviors/rack_blend_simple.lua`
- `UserScripts/projects/Main/ui/components/rack_blend_simple.ui.lua`

---

## 3. Complex Blend Modules (Add, Morph)

### Description
Spectral blend operators that require partials analysis from both inputs.

### Critical Design Decision
**TWO analysis input ports required** - one for Input A, one for Input B. The module blends the spectral data from both sources.

### Inputs
- **Audio in A**
- **Analysis in A** (partials from Source A)
- **Audio in B**
- **Analysis in B** (partials from Source B)

### Outputs
- **Audio out**

### Blend Types & Params

| Type | Description | Params |
|------|-------------|--------|
| Add | Additive synthesis combination | `additivePartials` (1-64), `mix` |
| Morph | Spectral morph between sources | `morphQuality` (0-1), `mix` |

### Files
- `UserScripts/projects/Main/ui/behaviors/rack_blend_add.lua`
- `UserScripts/projects/Main/ui/components/rack_blend_add.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_blend_morph.lua`
- `UserScripts/projects/Main/ui/components/rack_blend_morph.ui.lua`

*Note: Could be combined into `rack_blend_complex.lua` with type selector if preferred*

---

## 4. Oscillator Module Update

### Change Required
Add **Analysis output port** to existing `rack_oscillator` module.

### Implementation
The oscillator already generates partials data (additive mode). Wire this to a new output port.

### Files to Modify
- `UserScripts/projects/Main/ui/behaviors/rack_oscillator.lua`
- Update spec in `rack_midisynth_specs.lua` to add analysis output port

---

## Integration Points

### Spec Registry
Add entries to `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`:

```lua
sample = {
  category = "source",
  instancePolicy = "dynamic",
  runtimeKind = "stateful_source",
  paramTemplateMode = "dynamic_param_base",
  ports = {
    inputs = { audio = { type = "audio" } },
    outputs = { 
      audio = { type = "audio" },
      analysis = { type = "analysis" }
    }
  },
  -- ... rest of spec
}

blend_simple = {
  category = "operator",
  ports = {
    inputs = { a = { type = "audio" }, b = { type = "audio" } },
    outputs = { out = { type = "audio" } }
  }
}

blend_add = {
  category = "operator", 
  ports = {
    inputs = { 
      a = { type = "audio" },
      analysisA = { type = "analysis" },
      b = { type = "audio" },
      analysisB = { type = "analysis" }
    },
    outputs = { out = { type = "audio" } }
  }
}
```

### Palette
Add entries to `_PALETTE_ENTRIES` in `midisynth.lua`:
- `{ id = "sample", category = "source", order = 15 }`
- `{ id = "blend_simple", category = "operator", order = 20 }`
- `{ id = "blend_add", category = "operator", order = 21 }`
- `{ id = "blend_morph", category = "operator", order = 22 }`

### Param Binder
Add paths to `parameter_binder.lua`:
- `/midi/synth/rack/sample/<slot>/...`
- `/midi/synth/rack/blend_simple/<slot>/...`
- `/midi/synth/rack/blend_add/<slot>/...`
- `/midi/synth/rack/blend_morph/<slot>/...`

---

## Future Work (Documented, Not Implemented Now)

### Analysis Module
Generic module that takes any audio input and outputs analysis data.

**Use case:** Wire mixer output or arbitrary audio → Analysis module → Blend Add/Morph analysis input

**Deferred:** Not needed for initial extraction since Sample and Oscillator have built-in analysis.

---

## Key Architectural Decisions

1. **Dual audio inputs for Sample:** Both dropdown (capture sources) AND generic audio input jack

2. **Explicit analysis ports:** No introspection magic. Modules explicitly output analysis, blend modules explicitly wire to it.

3. **Two analysis ports for complex blends:** Must have separate analysis inputs for Source A and Source B.

4. **Oscillator analysis output:** Add analysis port to existing rack_oscillator (already built, just wire it).

5. **Deferred:** Generic Analysis module for arbitrary audio sources.

---

## Implementation Order

1. Sample module (foundational, most complex UI)
2. Simple blend module(s) (straightforward audio-only)
3. Update rack_oscillator with analysis output
4. Complex blend modules (Add, Morph with dual analysis inputs)

---

## Files Summary

### New Files
```
ui/behaviors/rack_sample.lua
ui/components/rack_sample.ui.lua
ui/behaviors/rack_blend_simple.lua
ui/components/rack_blend_simple.ui.lua
ui/behaviors/rack_blend_add.lua
ui/components/rack_blend_add.ui.lua
ui/behaviors/rack_blend_morph.lua
ui/components/rack_blend_morph.ui.lua
```

### Modified Files
```
ui/behaviors/rack_midisynth_specs.lua
ui/behaviors/midisynth.lua
lib/parameter_binder.lua
ui/behaviors/rack_oscillator.lua (add analysis output)
```

---

*Document captures decisions from collaborative discussion. Ready for implementation.*
