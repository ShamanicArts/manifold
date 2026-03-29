# MIDI Synth Wave Tab Distortion Bug Investigation

---

**Document Attribution:**
- **Author:** KIMI (Agent)
- **Document Type:** Agent Documented Investigation Report
- **Date:** 2026-03-31
- **Written For:** TODO_TRACKER.md entry - "MIDI synth sample synth object: distortion parameters in the wave tab do not seem to work"
- **Purpose:** Investigate root cause of non-functional distortion parameters in MIDI synth wave tab

---

## Executive Summary

**Root Cause Identified:** The distortion parameters (`driveShape`, `driveBias`) in the MIDI synth wave tab are **registered as parameters but never bound to any DSP nodes**. The UI preview correctly applies these values for visualization, but the actual audio path lacks the parameter bindings, causing the distortion to have no audible effect.

**Secondary Issue:** The `drive` parameter is bound to a post-mix `DistortionNode` rather than the per-voice oscillators, affecting the mixed signal rather than individual voices.

---

## Parameter Flow Analysis

### 1. UI Layer (Parameter Sources)

**File:** `UserScripts/projects/Main/ui/components/oscillator.ui.lua` (lines 47-53)

```lua
{ id = "drive_curve", type = "CurveWidget", ... }
{ id = "drive_mode_dropdown", type = "Dropdown", ... }  -- Maps to driveShape
{ id = "drive_bias_knob", type = "Slider", ... }        -- Maps to driveBias
{ id = "drive_knob", type = "Slider", ... }             -- Maps to drive
```

### 2. Behavior Layer (Parameter Reading)

**File:** `UserScripts/projects/Main/ui/behaviors/midisynth.lua` (lines 2138-2140)

```lua
driveShape = round(readParam(PATHS.driveShape, 0)),
driveBias = readParam(PATHS.driveBias, 0.0),
```

These values are passed to the oscillator behavior context for UI preview rendering.

### 3. UI Preview (Works Correctly)

**File:** `UserScripts/projects/Main/ui/behaviors/oscillator.lua` (lines 1306-1367)

```lua
local driveShape = ctx.driveShape or 0
local driveBias = ctx.driveBias or 0.0
-- Used in applyDriveShape() for waveform preview
local wave = applyDriveShape(renderWaveSample(...), drive, driveShape, driveBias, driveMix)
```

✅ **UI preview correctly shows distorted waveform**

### 4. DSP Layer (BROKEN - Missing Bindings)

**File:** `UserScripts/projects/Main/dsp/midisynth.lua`

**Parameter Registration (lines 664-671):**
```lua
addParam(PATHS.drive, {
  type = "f",
  min = 0.0,
  max = 20.0,
  default = 1.8,
  description = "Drive amount",
})
ctx.params.bind(PATHS.drive, dist, "setDrive")  -- ✅ Bound to DistortionNode
```

**MISSING (lines ~670-680 expected but not present):**
```lua
-- These parameters are NOT bound to anything!
-- addParam(PATHS.driveShape, ...)  -- Defined in parameter_binder.lua but not bound
-- addParam(PATHS.driveBias, ...)   -- Defined in parameter_binder.lua but not bound
```

**Voice Setup (lines 480-495):**
```lua
voices[i] = { osc = osc, noiseGain = noiseGain, gate = 0.0, ... }
-- Only frequency and amplitude are bound:
ctx.params.bind(freqPath, voices[i].osc, "setFrequency")
ctx.params.bind(ampPath, voices[i].osc, "setAmplitude")
-- MISSING: driveShape, driveBias, driveMix bindings
```

---

## Technical Root Cause

### The OscillatorNode Has Drive Methods

**File:** `manifold/primitives/scripting/DSPPluginScriptHost.cpp` (lines 639-642)

```cpp
"setDrive", &dsp_primitives::OscillatorNode::setDrive,
"setDriveShape", &dsp_primitives::OscillatorNode::setDriveShape,
"setDriveBias", &dsp_primitives::OscillatorNode::setDriveBias,
"setDriveMix", &dsp_primitives::OscillatorNode::setDriveMix,
```

✅ **The OscillatorNode supports drive shape and bias at the C++ level**

### But They're Not Used in the DSP Script

**File:** `UserScripts/projects/Main/dsp/midisynth.lua`

The per-voice oscillators are created but the drive parameters are never bound:

```lua
for i = 1, VOICE_COUNT do
  local osc = ctx.primitives.OscillatorNode.new()
  -- ... default settings ...
  
  -- MISSING: Parameter bindings for drive, driveShape, driveBias, driveMix
  -- These should be bound similar to frequency and amplitude
end
```

---

## Secondary Issue: Parameter Routing Confusion

### Current Implementation

| Parameter | Bound To | Effect |
|-----------|----------|--------|
| `drive` | `DistortionNode` (post-mix) | Distorts mixed output only |
| `driveShape` | ❌ **NOT BOUND** | No audible effect |
| `driveBias` | ❌ **NOT BOUND** | No audible effect |
| `driveMix` | ❌ **NOT BOUND** | No audible effect |

### Probable Intended Behavior

Based on the UI placement (wave tab), the parameters were likely intended for **per-voice oscillator drive**, not post-mix distortion:

| Parameter | Should Be Bound To | Effect |
|-----------|-------------------|--------|
| `drive` | Each `OscillatorNode` | Per-voice drive amount |
| `driveShape` | Each `OscillatorNode` | Drive curve (soft/hard/clip/fold) |
| `driveBias` | Each `OscillatorNode` | Asymmetric distortion bias |
| `driveMix` | Each `OscillatorNode` | Wet/dry mix |

---

## Fix Strategy (Not Implemented)

### Option 1: Bind to Oscillators (Recommended - Matches UI Intent)

Add to `UserScripts/projects/Main/dsp/midisynth.lua` after voice creation:

```lua
for i = 1, VOICE_COUNT do
  -- ... existing setup ...
  
  -- Add these bindings:
  ctx.params.bind("/midi/synth/drive", voices[i].osc, "setDrive")
  ctx.params.bind("/midi/synth/driveShape", voices[i].osc, "setDriveShape")
  ctx.params.bind("/midi/synth/driveBias", voices[i].osc, "setDriveBias")
  ctx.params.bind("/midi/synth/driveMix", voices[i].osc, "setDriveMix")
end
```

### Option 2: Remove DistortionNode Binding

If `drive` should control oscillators instead of the DistortionNode:

```lua
-- Remove this line:
ctx.params.bind(PATHS.drive, dist, "setDrive")

-- Add per-voice bindings as shown in Option 1
```

### Option 3: Keep Both (Separate Parameters)

If both oscillator drive AND post-mix distortion are desired:

```lua
-- Rename existing:
ctx.params.bind(PATHS.mixDrive, dist, "setDrive")

-- Add per-voice oscillator drive:
ctx.params.bind(PATHS.oscDrive, voices[i].osc, "setDrive")
ctx.params.bind(PATHS.oscDriveShape, voices[i].osc, "setDriveShape")
ctx.params.bind(PATHS.oscDriveBias, voices[i].osc, "setDriveBias")
```

---

## Files Affected

| File | Role | Issue |
|------|------|-------|
| `UserScripts/projects/Main/dsp/midisynth.lua` | DSP Script | Missing parameter bindings for oscillators |
| `UserScripts/projects/Main/lib/parameter_binder.lua` | Schema | Defines paths but doesn't ensure binding |
| `UserScripts/projects/Main/ui/behaviors/oscillator.lua` | UI Preview | Works correctly (deceptive) |
| `UserScripts/projects/Main/ui/behaviors/midisynth.lua` | Parameter Reading | Reads values but doesn't affect audio |

---

## Verification Steps (To Confirm Fix)

1. **Add bindings** to `dsp/midisynth.lua` as shown in Option 1
2. **Play a note** with waveform visible in oscilloscope
3. **Adjust drive knob** - waveform should visibly compress/clip
4. **Adjust drive shape** - waveform should change character (soft vs hard clipping)
5. **Adjust drive bias** - waveform should become asymmetric

---

## Related Code References

### UI Preview (Working)
```lua
-- File: UserScripts/projects/Main/ui/behaviors/oscillator.lua
-- Lines: 1306-1367

local driveShape = ctx.driveShape or 0
local driveBias = ctx.driveBias or 0.0
local wave = applyDriveShape(renderWaveSample(...), drive, driveShape, driveBias, driveMix)
```

### OscillatorNode Methods (Available)
```cpp
// File: manifold/primitives/scripting/DSPPluginScriptHost.cpp
// Lines: 639-642

"setDrive", &dsp_primitives::OscillatorNode::setDrive,
"setDriveShape", &dsp_primitives::OscillatorNode::setDriveShape,
"setDriveBias", &dsp_primitives::OscillatorNode::setDriveBias,
"setDriveMix", &dsp_primitives::OscillatorNode::setDriveMix,
```

### Missing Bindings (Root Cause)
```lua
-- File: UserScripts/projects/Main/dsp/midisynth.lua
-- Should be around line 500-550 (voice setup)

-- MISSING:
ctx.params.bind(PATHS.drive, voices[i].osc, "setDrive")
ctx.params.bind(PATHS.driveShape, voices[i].osc, "setDriveShape")
ctx.params.bind(PATHS.driveBias, voices[i].osc, "setDriveBias")
```

---

*End of Report*

**Report Generated By:** KIMI (Agent)  
**Completion Date:** 2026-03-31  
**Task Source:** TODO_TRACKER.md - @bug @midi @wave @distortion entry  
**Deliverable:** Root cause identified - distortion parameters (`driveShape`, `driveBias`) are registered in schema but never bound to OscillatorNode instances in DSP. UI preview works; audio path broken.
