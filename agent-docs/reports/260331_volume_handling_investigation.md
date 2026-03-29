# Manifold Output Volume Handling Investigation

---

**Document Attribution:**
- **Author:** KIMI (Agent)
- **Document Type:** Agent Investigation Report
- **Date:** 2026-03-31
- **Purpose:** Document how and where final output volume is handled at different areas of Manifold

---

## Executive Summary

Final output volume in Manifold is handled at multiple stages:

1. **Layer Volume** - Per-layer gain during playback
2. **Master Volume** - Global output gain applied to wet signal
3. **Input Volume** - Controls level going into looper capture + graph
4. **Synth Output Gain** - Fixed 0.8 gain on MIDI synth final output

---

## 1. Layer Volume (`/core/behavior/layer/{n}/volume`)

**Range:** 0.0 to 2.0 (default: 1.0)

**Location:** Applied in `ManifoldLayer::process()` 
- **File:** `manifold/engine/ManifoldLayer.h` (lines 87-88)

```cpp
outputL[i] = left * volume;
outputR[i] = right * volume;
```

**Control Path:**
- Parameter registered in: `UserScripts/projects/Main/dsp/looper_baseline.lua` (line 209)
- Applied via: `layer:setVolume(value)` (line 333)
- UI Control: Knob on layer cards (`donut_layer_card.ui.lua`, line 20)

**DSP Node:** The volume is applied via a `GainNode` in the layer chain:
- Input → Capture → Playback → Gate → **Gain (volume)** → Output
- **File:** `manifold/primitives/scripting/DSPPluginScriptHost.cpp` (lines 4220-4222)

---

## 2. Master Volume (`/core/behavior/volume`)

**Range:** 0.0 to 2.0 (default: 1.0)

**Location:** Applied in `BehaviorCoreProcessor::processBlock()`
- **File:** `manifold/core/BehaviorCoreProcessor.cpp` (line 317, 721, 919)

```cpp
const float wetGain = state.masterVolume.load(std::memory_order_relaxed);
// ... later applied to output buffer:
outL[i] = wetL[i] * wetGain;
outR[i] = wetR[i] * wetGain;
```

**Control Path:**
- Stored as atomic float in processor state
- Set via `setParamByPath("/core/behavior/volume", value)`
- UI: Header volume slider (label: "Master")
- **File:** `UserScripts/projects/Main/ui/components/header.ui.lua` (lines 79-104)

**Scope:** This is the **final** gain stage applied to the wet output before it leaves the processor.

---

## 3. Input Volume (`/core/behavior/inputVolume`)

**Range:** 0.0 to 2.0 (default: 1.0)

**Location:** Applied at multiple points in `BehaviorCoreProcessor::processBlock()`
- **File:** `manifold/core/BehaviorCoreProcessor.cpp` (lines 296-384)

**Applied to:**
1. **Capture buffer** - What gets recorded into looper layers
2. **Graph wet buffer** - Input to the DSP graph
3. **Monitor input** - Direct input monitoring when passthrough enabled

```cpp
const float inputVolume = state.inputVolume.load(std::memory_order_relaxed);
// Applied to capture:
captureBuffer.writeBlock(captureL, numSamples, 0, inputVolume);
// Applied to graph input:
graphWetBuffer.applyGain(ch, 0, numSamples, inputVolume);
// Applied to monitoring:
const float monitorInputGain = passthroughEnabled ? inputVolume : 0.0f;
```

**Note:** Input volume does NOT affect the final output mix directly - it only controls what goes **into** the system.

---

## 4. MIDI Synth Output Gain

**Value:** Fixed 0.8

**Location:** Applied in `midisynth_integration.lua`
- **File:** `UserScripts/projects/Main/dsp/midisynth_integration.lua` (line 225)

```lua
out:setGain(0.8)
```

**Signal Chain:**
```
Oscillator → Filter → FX1 → FX2 → EQ8 → SpectrumAnalyzer → **Gain(0.8)** → Output
```

**Additional Routing:** The synth output is also sent to looper layer 0 via a send node:
```lua
local send = ctx.primitives.GainNode.new(2)
send:setGain(1.0)
ctx.graph.connect(spec, send)
ctx.graph.connect(send, targetLayerInput)  -- Layer 0 input for recording
```

---

## 5. Volume Parameter Registration

### Looper Baseline
**File:** `UserScripts/projects/Main/dsp/looper_baseline.lua`
```lua
registerBehaviorAliases(suffix .. "/volume", { type = "f", min = 0.0, max = 2.0, default = 1.0 })
```

### DSP Live Scripting (Template)
**File:** `UserScripts/projects/DspLiveScripting/dsp/default_dsp.lua`
```lua
ctx.params.register("/dsp/live/input_gain", { type = "f", min = 0.0, max = 2.0, default = 1.0 })
ctx.params.bind("/dsp/live/input_gain", gain, "setGain")
```

---

## 6. UI Volume Controls

| Control | Location | Parameter Path | Range |
|---------|----------|----------------|-------|
| Master Volume | Header (`header.ui.lua:92`) | `/core/behavior/volume` | 0-100 (UI) → 0-2.0 (DSP) |
| Layer Volume | Layer Card (`donut_layer_card.ui.lua:20`) | `/core/behavior/layer/{n}/volume` | 0-2.0 |

---

## 7. Volume Flow Diagram

```
INPUT STAGE:
  Audio Input → [Input Volume] → Capture Buffer (for recording)
                        ↓
                   [Input Volume] → DSP Graph
                        ↓
                   [Monitor Toggle] → [Input Volume] → Monitor Mix

PROCESSING STAGE:
  DSP Graph → ... → Output

LAYER PLAYBACK:
  Layer Buffer → [Layer Volume] → Mix

SYNTH OUTPUT:
  Synth Chain → [Fixed 0.8 Gain] → Output
              → [Send Gain 1.0] → Layer 0 Input

FINAL OUTPUT STAGE:
  Wet Signal → [Master Volume] → Hardware Output
```

---

## Files Referenced

| File | Purpose |
|------|---------|
| `manifold/core/BehaviorCoreProcessor.cpp` | Master volume, input volume application |
| `manifold/engine/ManifoldLayer.h` | Layer volume per-sample processing |
| `manifold/primitives/scripting/DSPPluginScriptHost.cpp` | Layer gain node setup |
| `UserScripts/projects/Main/dsp/looper_baseline.lua` | Layer volume parameter registration |
| `UserScripts/projects/Main/dsp/midisynth_integration.lua` | Synth output gain (0.8) |
| `UserScripts/projects/Main/ui/components/header.ui.lua` | Master volume UI |
| `UserScripts/projects/Main/ui/components/donut_layer_card.ui.lua` | Layer volume UI |

---

*End of Report*

**Report Generated By:** KIMI (Agent)  
**Completion Date:** 2026-03-31
