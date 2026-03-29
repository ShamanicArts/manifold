# Effects Audit: DSP Live Scripting vs MIDI Synth Effects Slot

---

**Document Attribution:**
- **Author:** KIMI (Agent)
- **Document Type:** Agent Documented Investigation Report
- **Date:** 2026-03-31
- **Written For:** TODO_TRACKER.md entry - "Investigate and report on what effects and modulation sources are still in DSP live scripting and/or looper/donut super effects slots that have not made their way into the MIDI synth effects slot"
- **Purpose:** Comprehensive audit comparing available effects across DSP Live Scripting, Super Slot, and MIDI Synth FX systems to identify gaps and porting candidates

---

## Executive Summary

**DSP Live Scripting** contains **34 effect scripts** in `manifold/dsp/scripts/`.  
**MIDI Synth FX Slot** contains **17 effects** in `UserScripts/projects/Main/lib/fx_definitions.lua`.  
**Super Slot (Looper/Donut)** contains **21 effects** including bypass.

### Key Finding
**11 effects** in DSP Live Scripting have **NO equivalent** in the MIDI Synth FX slot.  
**3 modulation/analysis tools** exist only in DSP Live Scripting.

---

## 1. MIDI Synth Effects Slot (Current - 17 Effects)

**Source:** `UserScripts/projects/Main/lib/fx_definitions.lua`

| Index | Effect | Available Node |
|-------|--------|----------------|
| 0 | Chorus | `ChorusNode` |
| 1 | Phaser | `PhaserNode` |
| 2 | WaveShaper | `WaveShaperNode` |
| 3 | Compressor | `CompressorNode` |
| 4 | StereoWidener | `StereoWidenerNode` |
| 5 | Filter | `FilterNode` |
| 6 | SVF Filter | `SVFNode` |
| 7 | Reverb | `ReverbNode` |
| 8 | Stereo Delay | `StereoDelayNode` |
| 9 | Multitap | `MultitapDelayNode` |
| 10 | Pitch Shift | `PitchShifterNode` |
| 11 | Granulator | `GranulatorNode` |
| 12 | Ring Mod | `RingModulatorNode` |
| 13 | Formant | `FormantFilterNode` |
| 14 | EQ | `EQNode` |
| 15 | Limiter | `LimiterNode` |
| 16 | Transient | `TransientShaperNode` |

---

## 2. Super Slot Effects (Looper/Donut - 21 Effects)

**Source:** `UserScripts/projects/Main/ui/behaviors/donut_shared_state.lua` (lines 6-26)

| Index | Effect ID | Label | In MIDI Synth? |
|-------|-----------|-------|----------------|
| 0 | bypass | Bypass | N/A |
| 1 | chorus | Chorus | ✅ Yes (0) |
| 2 | phaser | Phaser | ✅ Yes (1) |
| 3 | bitcrusher | Bitcrusher | ❌ **NO** |
| 4 | waveshaper | Waveshaper | ✅ Yes (2) |
| 5 | filter | Filter | ✅ Yes (5) |
| 6 | svf | SVF Filter | ✅ Yes (6) |
| 7 | reverb | Reverb | ✅ Yes (7) |
| 8 | shimmer | Shimmer | ❌ **NO** |
| 9 | stereodelay | Stereo Delay | ✅ Yes (8) |
| 10 | reversedelay | Reverse Delay | ❌ **NO** |
| 11 | multitap | Multitap | ✅ Yes (9) |
| 12 | pitchshift | Pitch Shift | ✅ Yes (10) |
| 13 | granulator | Granulator | ✅ Yes (11) |
| 14 | ringmod | Ring Mod | ✅ Yes (12) |
| 15 | formant | Formant | ✅ Yes (13) |
| 16 | eq | EQ | ✅ Yes (14) |
| 17 | compressor | Compressor | ✅ Yes (3) |
| 18 | limiter | Limiter | ✅ Yes (15) |
| 19 | transient | Transient | ✅ Yes (16) |
| 20 | widener | Widener | ✅ Yes (4) |

### Super Slot Effects NOT in MIDI Synth FX
1. **Bitcrusher** - Digital degradation effect
2. **Shimmer** - Pitch-shifted reverb effect
3. **Reverse Delay** - Backwards delay effect

---

## 3. DSP Live Scripting Effects (34 Scripts)

**Source:** `manifold/dsp/scripts/`

### 3.1 Effects with MIDI Synth Equivalents (17)

| Script | Effect | MIDI Synth Index |
|--------|--------|------------------|
| `test_chorus.lua` | Chorus | 0 |
| `test_phaser.lua` | Phaser | 1 |
| `test_waveshaper.lua` | WaveShaper | 2 |
| `test_compressor.lua` | Compressor | 3 |
| `test_widener.lua` | Stereo Widener | 4 |
| `test_eq.lua` | EQ | 14 |
| `test_svf.lua` | SVF Filter | 6 |
| `input_reverb_tone.lua` / `tone_input_chain.lua` | Reverb | 7 |
| `test_stereo_delay.lua` | Stereo Delay | 8 |
| `test_multitap.lua` | Multitap | 9 |
| `test_pitch_shifter.lua` | Pitch Shift | 10 |
| `test_granulator.lua` | Granulator | 11 |
| `test_ringmod.lua` | Ring Mod | 12 |
| `test_formant_filter.lua` | Formant | 13 |
| `test_limiter.lua` | Limiter | 15 |
| `test_transient_shaper.lua` | Transient | 16 |
| `test_bitcrusher.lua` | Bitcrusher | ❌ **Missing from MIDI** |

### 3.2 Effects in DSP Live Scripting with NO MIDI Synth Equivalent (11)

| Script | Effect | Description | Node Type |
|--------|--------|-------------|-----------|
| `test_bitcrusher.lua` | **Bitcrusher** | Bit depth + sample rate reduction | `BitCrusherNode` |
| `test_shimmer.lua` | **Shimmer** | Pitch-shifted reverb | `ShimmerNode` |
| `test_reverse_delay.lua` | **Reverse Delay** | Backwards delay buffer | `ReverseDelayNode` |
| `test_stutter.lua` | **Stutter** | Glitch/beat repeat effect | `StutterNode` |
| `test_crossfader.lua` | **Crossfader** | 2-channel crossfade mixer | `CrossfaderNode` |
| `test_envelope_follower.lua` | **Envelope Follower** | Amplitude tracking | `EnvelopeFollowerNode` |
| `test_noise.lua` | **Noise** | Noise generator (white/pink) | `NoiseNode` |
| `test_ms.lua` | **M/S Processor** | Mid/Side encode/decode | `MSNode` |
| `test_mixer.lua` | **Mixer** | Multi-channel mixer | `MixerNode` |
| `input_filter.lua` | **Input Filter** | Input processing filter | Custom |
| `test_spectrum.lua` | **Spectrum** | FFT analysis display | `SpectrumNode` |

### 3.3 Modulation & Analysis Tools (3)

| Script | Tool | Purpose |
|--------|------|---------|
| `test_param_modulation.lua` | **LFO Modulation** | 3 LFOs for parameter modulation |
| `test_midi_arp.lua` | **MIDI Arpeggiator** | Note pattern generation |
| `test_pitch_detector.lua` | **Pitch Detector** | Real-time pitch tracking |

### 3.4 Test/Utility Scripts (3)

| Script | Purpose |
|--------|---------|
| `test_midi_synth.lua` | Early MIDI synth prototype |
| `tone_test_osc_only.lua` | Oscillator test |
| `test_stereo_delay_debug.lua` | Debug variant |

---

## 4. Gap Analysis: What's Missing from MIDI Synth

### 4.1 High-Priority Porting Candidates

These effects exist in DSP Live Scripting and Super Slot but are **NOT** in MIDI Synth FX:

| Priority | Effect | Node | Why Add It |
|----------|--------|------|------------|
| **P0** | **Bitcrusher** | `BitCrusherNode` | In Super Slot, commonly used for sound design |
| **P0** | **Shimmer** | `ShimmerNode` | In Super Slot, popular ambient effect |
| **P0** | **Reverse Delay** | `ReverseDelayNode` | In Super Slot, creative delay effect |
| **P1** | **Stutter** | `StutterNode` | Unique performance effect |
| **P1** | **Envelope Follower** | `EnvelopeFollowerNode` | Modulation source for dynamic FX |
| **P2** | **Noise** | `NoiseNode` | Sound design layer |
| **P2** | **Crossfader** | `CrossfaderNode` | DJ-style transitions |

### 4.2 Modulation System Gap

**DSP Live Scripting has:** `test_param_modulation.lua` with 3 LFOs  
**MIDI Synth has:** NO modulation sources for FX parameters

**Recommendation:** Add LFO/Envelope modulation to MIDI Synth FX slots similar to the Super Slot's modulation system.

---

## 5. Implementation Notes

### 5.1 Node Availability Check

All missing effects have available C++ nodes:

```lua
-- Verified available in primitives:
P.BitCrusherNode.new()        -- Missing from MIDI Synth
P.ShimmerNode.new()           -- Missing from MIDI Synth  
P.ReverseDelayNode.new()      -- Missing from MIDI Synth
P.StutterNode.new()           -- Missing from MIDI Synth
P.EnvelopeFollowerNode.new()  -- Missing from MIDI Synth
P.NoiseNode.new()             -- Missing from MIDI Synth
P.CrossfaderNode.new()        -- Missing from MIDI Synth
```

### 5.2 Port Path

To add missing effects to MIDI Synth:

1. **Add to `fx_definitions.lua`:**
   - Add name to `FX_OPTIONS` array
   - Add entry to `buildFxDefs()` return table
   - Define `create()` function and `params` table

2. **Update `parameter_binder.lua`:**
   - Increment `fxOptionCount` default if needed
   - Add any new parameter paths

3. **Update UI behaviors:**
   - `midisynth.lua` behavior may need FX name mappings

---

## 6. Summary Table

| Effect | DSP Live | Super Slot | MIDI Synth | Action Needed |
|--------|----------|------------|------------|---------------|
| Chorus | ✅ | ✅ | ✅ | None |
| Phaser | ✅ | ✅ | ✅ | None |
| WaveShaper | ✅ | ✅ | ✅ | None |
| Compressor | ✅ | ✅ | ✅ | None |
| Widener | ✅ | ✅ | ✅ | None |
| Filter | ✅ | ✅ | ✅ | None |
| SVF Filter | ✅ | ✅ | ✅ | None |
| Reverb | ✅ | ✅ | ✅ | None |
| Stereo Delay | ✅ | ✅ | ✅ | None |
| Multitap | ✅ | ✅ | ✅ | None |
| Pitch Shift | ✅ | ✅ | ✅ | None |
| Granulator | ✅ | ✅ | ✅ | None |
| Ring Mod | ✅ | ✅ | ✅ | None |
| Formant | ✅ | ✅ | ✅ | None |
| EQ | ✅ | ✅ | ✅ | None |
| Limiter | ✅ | ✅ | ✅ | None |
| Transient | ✅ | ✅ | ✅ | None |
| **Bitcrusher** | ✅ | ✅ | ❌ | **PORT** |
| **Shimmer** | ✅ | ✅ | ❌ | **PORT** |
| **Reverse Delay** | ✅ | ✅ | ❌ | **PORT** |
| **Stutter** | ✅ | ❌ | ❌ | Optional |
| **Envelope Follower** | ✅ | ❌ | ❌ | Optional |
| **Noise** | ✅ | ❌ | ❌ | Optional |
| LFO Modulation | ✅ | ❌ | ❌ | **Consider** |

---

## 7. Recommendations

### Immediate (P0)
1. **Port Bitcrusher** to MIDI Synth FX
2. **Port Shimmer** to MIDI Synth FX  
3. **Port Reverse Delay** to MIDI Synth FX

### Short-term (P1)
4. Add **LFO modulation** system for FX parameters
5. Port **Stutter** effect

### Nice-to-have (P2)
6. Port **Envelope Follower** as modulation source
7. Port **Noise** generator for layering

---

## Appendices

### Appendix A: File References

**DSP Live Scripting Effects:**
- Location: `manifold/dsp/scripts/`
- Count: 34 Lua scripts
- Function: `buildPlugin(ctx)`

**MIDI Synth FX:**
- Location: `UserScripts/projects/Main/lib/fx_definitions.lua`
- Count: 17 effects
- Function: `buildFxDefs(primitives, graph)`

**Super Slot FX:**
- Location: `UserScripts/projects/Main/ui/behaviors/donut_shared_state.lua` (lines 6-26)
- Count: 21 effect IDs (including bypass)
- Full implementation: `UserScripts/projects/Main/dsp/super_extension.lua`

### Appendix B: Node Primitives Reference

All primitives available in `ctx.primitives`:
- `BitCrusherNode` - **Not in MIDI Synth**
- `ChorusNode` - In MIDI Synth
- `CompressorNode` - In MIDI Synth
- `CrossfaderNode` - **Not in MIDI Synth**
- `EnvelopeFollowerNode` - **Not in MIDI Synth**
- `EQNode` - In MIDI Synth
- `FilterNode` - In MIDI Synth
- `FormantFilterNode` - In MIDI Synth
- `GainNode` - Utility
- `GranulatorNode` - In MIDI Synth
- `LimiterNode` - In MIDI Synth
- `MixerNode` - **Not in MIDI Synth**
- `MultitapDelayNode` - In MIDI Synth
- `NoiseNode` - **Not in MIDI Synth**
- `PassthroughNode` - Utility
- `PhaserNode` - In MIDI Synth
- `PitchShifterNode` - In MIDI Synth
- `ReverbNode` - In MIDI Synth
- `ReverseDelayNode` - **Not in MIDI Synth**
- `RingModulatorNode` - In MIDI Synth
- `ShimmerNode` - **Not in MIDI Synth**
- `StereoDelayNode` - In MIDI Synth
- `StereoWidenerNode` - In MIDI Synth
- `StutterNode` - **Not in MIDI Synth**
- `SVFNode` - In MIDI Synth
- `TransientShaperNode` - In MIDI Synth
- `WaveShaperNode` - In MIDI Synth

---

*End of Report*

**Report Generated By:** KIMI (Agent)  
**Completion Date:** 2026-03-31  
**Task Source:** TODO_TRACKER.md - @agent @investigate @dsp @effects @audit entry  
**Deliverable:** Comprehensive audit identifying 3 P0 effects (Bitcrusher, Shimmer, Reverse Delay) ready for porting to MIDI Synth FX slot
