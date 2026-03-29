# Manifold Output Volume - Deep Investigation

---

**Document Attribution:**
- **Author:** KIMI (Agent)
- **Document Type:** Deep Technical Investigation
- **Date:** 2026-03-31
- **Purpose:** Exhaustive investigation of all volume/gain stages in Manifold

---

## Investigation Scope

Examined:
- C++ DSP primitives (GainNode, MixerNode)
- Layer playback processing
- BehaviorCoreProcessor audio callback
- MIDI synth voice mixing
- FX slot dry/wet mixing
- Super extension mixing

---

## 1. C++ DSP Primitives

### GainNode (`dsp/core/nodes/GainNode.cpp`)
- Simple gain with smoothing (10ms time constant)
- No hidden compensation
- `setGain()` range: 0.0 to unlimited (clamped at 0 minimum)

### MixerNode (`dsp/core/nodes/MixerNode.cpp`)
- Sums up to 32 stereo buses
- Per-bus: gain (0-2), pan (equal-power)
- Master gain applied to final output
- Default: all gains = 1.0, master = 1.0
- **No automatic gain compensation** - if you mix 8 voices at full gain, you get 8x level

---

## 2. Layer Playback (`manifold/engine/ManifoldLayer.h`)

```cpp
outputL[i] = left * volume;
outputR[i] = right * volume;
```

- Per-sample volume applied during loop playback
- Volume range: 0-2
- Default: 1.0
- Controlled via `layer:setVolume()` in Lua

**Layer Chain:**
```
Input → Capture → Playback → Gate → **Gain (volume)** → Output
```

---

## 3. BehaviorCoreProcessor Output Stages

### Input Volume (`/core/behavior/inputVolume`)
**Applied at:** `BehaviorCoreProcessor.cpp:296-311`

```cpp
const float inputVolume = state.inputVolume.load(std::memory_order_relaxed);
// Applied to:
// 1. Capture buffer (what gets recorded)
// 2. Graph input wet buffer
// 3. Monitor input (when passthrough enabled)
```

**Key insight:** Input volume does NOT affect the output mix directly - it only controls what goes **into** the system.

### Master Volume (`/core/behavior/volume`)
**Applied at:** `BehaviorCoreProcessor.cpp:317-361`

```cpp
const float wetGain = state.masterVolume.load(std::memory_order_relaxed);
// Applied to final graph output:
outL[i] = wetL[i] * wetGain;
outR[i] = wetR[i] * wetGain;
```

**This is the final gain stage** before audio leaves the processor.

### Passthrough/Monitor Path
When graph is disabled:
```cpp
const float passthroughGain = passthroughEnabled ? inputVolume : 0.0f;
```

---

## 4. MIDI Synth Voice Mixing

### Voice Architecture (8 voices)
**File:** `UserScripts/projects/Main/dsp/midisynth_integration.lua`

```lua
mix:setInputCount(VOICE_COUNT)  -- 8 voices

-- Each voice connected to mixer bus i:
ctx.graph.connect(voiceMix, mix, 0, (i - 1) * 2)
```

**Voice Mixing Chain:**
```
Oscillator ──┐
             ├──→ VoiceMixer ──→ MainMix ──→ Filter ──→ FX ──→ Output
Noise ───────┘         ↑
                    (gain=1.0)
```

### Critical Finding: NO Voice Count Normalization

Each voice feeds into the mixer at **full gain (1.0)**. With 8 voices playing:
- Expected peak level: 8x single voice (assuming correlated signals)
- No automatic 1/VOICE_COUNT scaling
- This could explain volume issues with high voice counts

### FX Slot Dry/Wet Mixing

**File:** `UserScripts/projects/Main/lib/fx_slot.lua`

```lua
function slot.applyMix(value)
  slot.mix = Utils.clamp01(tonumber(value) or slot.mix)
  slot.dry:setGain(1.0 - slot.mix)
  slot.wetTrim:setGain(slot.mix)
end
```

**Standard crossfade:** At 50% mix, both dry and wet are at 0.5 gain.
**Potential issue:** When mix is 50%, total energy is reduced compared to 0% or 100% (depending on correlation).

### Synth Output Gain

**File:** `UserScripts/projects/Main/dsp/midisynth_integration.lua:225`
```lua
out:setGain(0.8)  -- Fixed 0.8 output gain
```

---

## 5. Super Extension Mixing

**File:** `UserScripts/projects/Main/dsp/super_extension.lua`

### Effect Slot Mixing
```lua
effectMixer:setInputCount(#gatedOutputs)
effectMixer:setMaster(1.0)
for i = 1, #gatedOutputs do
  effectMixer:setGain(i, 1.0)  -- Each effect at full gain
  effectMixer:setPan(i, 0.0)
end
```

### Layer Mixing (4 layers)
```lua
layerMixer:setGain1(1.0)
layerMixer:setGain2(1.0)
layerMixer:setGain3(1.0)
layerMixer:setGain4(1.0)
layerMixer:setMaster(1.0)
```

### Main Mixer
```lua
mainMixer:setGain1(1.0)  -- Layer FX
mainMixer:setGain2(1.0)  -- Vocal/monitor
mainMixer:setGain3(0.0)  -- Unused
mainMixer:setGain4(0.0)  -- Unused
mainMixer:setMaster(1.0)
```

---

## 6. Potential "Hidden" Volume Issues Found

### A. No Polyphony Compensation
With 8 voices at full amplitude, the mixer sums them without scaling:
```
Output = sum(voice1, voice2, ..., voice8)  -- Up to 8x single voice
```

**Mitigation:** The synth sets amplitude per-voice to 0.5 max:
```lua
addParam(ampPath, { type = "f", min = 0.0, max = 0.5, ... })
```

But this only helps if the amplitude is actually set properly.

### B. Dry/Wet Mix Energy Loss
When FX mix is at 50%:
```lua
dry:setGain(0.5)
wet:setGain(0.5)
```
If dry and wet are correlated (e.g., compressor with low ratio), output is 0.5x.

### C. Multiple Gain Stages in Series
Signal chain can accumulate gain/loss:
```
Voice (amp) → VoiceMixer → MainMix → Filter → FX1 → FX2 → EQ → Out(0.8)
   0-0.5          1.0         1.0      1.0   mix   mix   1.0   0.8
```

### D. Layer Recording vs Playback Gain
Layer playback has volume control, but **capture uses inputVolume**:
```cpp
// Capture (recording):
captureBuffer.writeBlock(captureL, numSamples, 0, inputVolume);

// Playback:
outputL[i] = left * volume;  // Different parameter!
```

If inputVolume ≠ layer volume, recorded loops play back at different level than they were captured.

---

## 7. Files Where Volume Is Applied

| Stage | File | Line | Description |
|-------|------|------|-------------|
| Layer playback | `manifold/engine/ManifoldLayer.h` | 87-88 | Per-sample volume |
| Layer output | `manifold/primitives/scripting/DSPPluginScriptHost.cpp` | 4220 | GainNode per layer |
| Input to system | `manifold/core/BehaviorCoreProcessor.cpp` | 307, 309, 334 | inputVolume |
| Final output | `manifold/core/BehaviorCoreProcessor.cpp` | 317, 355-361 | masterVolume (wetGain) |
| Voice mixing | `UserScripts/projects/Main/dsp/midisynth_integration.lua` | 43, 160 | MixerNode |
| FX dry/wet | `UserScripts/projects/Main/lib/fx_slot.lua` | 85-88 | GainNode pair |
| Synth output | `UserScripts/projects/Main/dsp/midisynth_integration.lua` | 225 | Fixed 0.8 |
| Super FX | `UserScripts/projects/Main/dsp/super_extension.lua` | 568-576 | Effect mixer |
| Super layers | `UserScripts/projects/Main/dsp/super_extension.lua` | 625-656 | Layer + main mixer |

---

## Questions for Clarification

1. **Are you seeing volume issues with:**
   - High voice count (polyphony)?
   - Specific FX mix settings?
   - Layer recording vs playback?
   - Super FX slots?

2. **Is the issue:**
   - Overall too quiet/loud?
   - Inconsistent between voices?
   - Different between recording and playback?
   - Affected by number of active layers?

---

*End of Deep Investigation*

**Report Generated By:** KIMI (Agent)  
**Completion Date:** 2026-03-31
