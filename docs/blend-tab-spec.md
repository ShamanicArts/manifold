# Blend Tab Specification

## Overview

A third oscillator mode that enables hybrid synthesis between Wave and Sample sources. The Blend tab provides real-time modulation and cross-synthesis between the mathematical waveform generator and the captured sample playback.

**Tab Position:** Between "Wave" and "Sample" tabs (index 2)  
**Mode Value:** `oscMode = 2`  
**Container Size:** 260×106px

---

## UI Layout

```
┌─────────────────────────────────────────┐
│  [Blend Mode ▼]     [Blend ▓▓▓▓░]      │  Row 1 (y=6)
│   Mix|Ring|FM|Sync|XOR     0-100%      │
├─────────────────────────────────────────┤
│  [Wave→Smp ▓▓▓░░]  [Smp→Wave ▓▓▓░░]   │  Row 2 (y=38)
│   0-100%            0-100%             │
├─────────────────────────────────────────┤
│  [KeyTrk ✓]  [Pitch ▓▓▓░░]  [Amt ░░░] │  Row 3 (y=70)
│              -24-+24st        0-100%   │
└─────────────────────────────────────────┘
```

### Component Specifications

| Component | Type | Position | Size | Range | Default |
|-----------|------|----------|------|-------|---------|
| blend_mode_dropdown | Dropdown | x=10, y=6 | w=110, h=20 | 5 options | "Mix" (index 1) |
| blend_amount_knob | Knob | x=140, y=4 | w=52, h=48 | 0.0 - 1.0 | 0.5 |
| wave_to_sample_knob | Knob | x=20, y=36 | w=44, h=44 | 0.0 - 1.0 | 0.5 |
| sample_to_wave_knob | Knob | x=90, y=36 | w=44, h=44 | 0.0 - 1.0 | 0.0 |
| key_track_toggle | Toggle | x=10, y=74 | w=50, h=18 | on/off | on |
| sample_pitch_knob | Knob | x=70, y=70 | w=44, h=44 | -24 to +24 semitones | 0 |
| modulation_amount_knob | Knob | x=140, y=70 | w=44, h=44 | 0.0 - 1.0 | 0.5 |

---

## Blend Modes

### 1. MIX
**Description:** Simple crossfade between Wave and Sample sources.

**Algorithm:**
```
output = (wave * (1 - blend)) + (sample * blend)
```

**Parameters:**
- `blend_amount` (0.0 - 1.0): Crossfade position
  - 0.0 = 100% Wave
  - 0.5 = Equal mix
  - 1.0 = 100% Sample

**Visualization:** Show both waveforms overlaid with opacity based on blend amount.

---

### 2. RING MOD
**Description:** Amplitude modulation of Wave by Sample (classic ring modulation).

**Algorithm:**
```
output = wave * (1 - blend) + (wave * sample * blend)
```

**Parameters:**
- `blend_amount` (0.0 - 1.0): How much ring modulation vs dry wave
- `wave_to_sample` (0.0 - 1.0): Pre-gain on sample before multiplication

**Characteristics:** 
- Creates sum and difference frequencies
- If Wave is sine at freq f₁ and Sample at f₂, output contains f₁+f₂ and |f₁-f₂|
- Classic "metallic" or "bell-like" timbres

**Visualization:** Show product waveform with frequency spectrum sidebands.

---

### 3. FM (Frequency Modulation)
**Description:** Wave modulates Sample playback speed/rate.

**Algorithm:**
```
modulator = wave * wave_to_sample * FM_DEPTH
sample_rate = base_rate * (1 + modulator)
output = sample_playback_at(sample_rate) * blend + wave * (1 - blend)
```

**Parameters:**
- `blend_amount` (0.0 - 1.0): Balance between FM'd sample and dry wave
- `wave_to_sample` (0.0 - 1.0): FM depth/index (how much Wave affects Sample pitch)
- `sample_pitch` (-24 to +24 st): Base sample transposition

**Characteristics:**
- High wave_to_sample values create complex spectra
- Sample acts as carrier, Wave as modulator
- Through-zero FM possible with bipolar waveforms

**Visualization:** Show instantaneous playback position deviation as vertical offset on sample waveform.

---

### 4. SYNC
**Description:** Sample playback retriggered on Wave zero-crossing (hard sync).

**Algorithm:**
```
if wave_zero_crossing_up:
    sample_phase = 0

output = sample_at(sample_phase) * blend + wave * (1 - blend)
sample_phase += sample_rate
```

**Parameters:**
- `blend_amount` (0.0 - 1.0): Balance between synced sample and wave
- `wave_to_sample` (0.0 - 1.0): Sync threshold sensitivity (0 = every cycle, 1 = every half cycle)
- `sample_pitch` (-24 to +24 st): Sample playback speed

**Characteristics:**
- Classic hard sync effect
- Sample timbre becomes "screaming" or "buzzing" when pitched higher than Wave
- Creates sharp discontinuities at sync points

**Visualization:** Show vertical lines at sync points, sample waveform segment colored by current playback position.

---

### 5. XOR (Bitwise)
**Description:** Bitwise XOR of quantized Wave and Sample signals (digital distortion).

**Algorithm:**
```
wave_quant = int(wave * 127) & 0xFF
sample_quant = int(sample * 127) & 0xFF
xor_result = (wave_quant ^ sample_quant) / 127.0
output = xor_result * blend + wave * (1 - blend)
```

**Parameters:**
- `blend_amount` (0.0 - 1.0): Wet/dry mix
- `wave_to_sample` (0.0 - 1.0): Bit depth reduction (0 = 8-bit, 1 = 2-bit)
- `modulation_amount` (0.0 - 1.0): Post-filtering (0 = raw, 1 = heavily smoothed)

**Characteristics:**
- Harsh digital artifacts
- Non-linear distortion
- Creates inharmonic sidebands
- Very "8-bit video game" or "glitch" aesthetic

**Visualization:** Show stepped/quantized waveform with XOR result highlighted.

---

## DSP Parameter Mapping

### New Parameters Required

| Parameter Path | Type | Range | Default | Description |
|----------------|------|-------|---------|-------------|
| `/midi/synth/osc/blend_mode` | int | 0-4 | 0 | Blend mode: 0=Mix, 1=Ring, 2=FM, 3=Sync, 4=XOR |
| `/midi/synth/osc/blend_amount` | float | 0.0-1.0 | 0.5 | Master blend amount |
| `/midi/synth/osc/wave_to_sample` | float | 0.0-1.0 | 0.5 | Wave influence on Sample |
| `/midi/synth/osc/sample_to_wave` | float | 0.0-1.0 | 0.0 | Sample influence on Wave |
| `/midi/synth/osc/blend_key_track` | bool | 0/1 | 1 | Sample pitch follows MIDI notes |
| `/midi/synth/osc/blend_sample_pitch` | float | -24.0-+24.0 | 0.0 | Sample transposition (semitones) |
| `/midi/synth/osc/blend_mod_amount` | float | 0.0-1.0 | 0.5 | Additional modulation depth |

### Existing Parameters Used in Blend Mode
- `waveformType` - Wave oscillator shape
- `driveAmount` - Pre-blend wave saturation
- `sampleLoopStart`, `sampleLoopLen` - Sample playback region
- `outputLevel`, `noiseLevel` - Post-blend mixing

---

## Graph Visualization

### Display Modes per Blend Mode

**MIX Mode:**
- Top half: Wave waveform (dimmed when blend > 0.5)
- Bottom half: Sample waveform (dimmed when blend < 0.5)
- Center overlay: Result waveform (full opacity)

**RING MOD Mode:**
- Background: Product of both waveforms (modulated amplitude shown as thickness)
- Foreground: Result waveform
- Optional: Real-time spectrum showing sidebands

**FM Mode:**
- Sample waveform shown with varying thickness (thick = faster playback, thin = slower)
- Vertical hash marks showing instantaneous frequency deviation
- Wave zero crossings highlighted

**SYNC Mode:**
- Sample waveform with playback position indicator
- Vertical sync trigger lines at Wave zero crossings
- Color gradient showing "age" since last sync

**XOR Mode:**
- Quantized/stepped waveform display
- Bit patterns shown as small binary text at sample points
- Distortion amount shown as "noise floor" shading

---

## Behavior Implementation

### Tab Switching
```lua
-- In OscBehavior.resized, extend tab handler
if not ctx._tabHandlerSet then
  ctx._tabHandlerSet = true
  tabHost:setOnSelect(function(idx, id, title)
    local newMode = (idx == 2) and 1 or (idx == 3) and 2 or 0
    ctx.oscMode = newMode
    setParam("/midi/synth/osc/mode", newMode)
    refreshGraph(ctx)
  end)
end
```

### Blend Mode Change Handler
```lua
-- In midisynth.lua, add blend mode handler
if blendModeDrop then blendModeDrop._onSelect = function(idx)
  setParam("/midi/synth/osc/blend_mode", idx - 1)
  if oscCtx then
    oscCtx.blendMode = idx - 1
    refreshOscGraph()
  end
end end
```

### Graph Rendering
```lua
-- In OscBehavior, modify buildOscDisplay
if oscMode == 2 then
  return buildBlendDisplay(ctx, w, h, display)
end

-- New function for blend visualization
local function buildBlendDisplay(ctx, w, h, display)
  local blendMode = ctx.blendMode or 0
  -- Route to specific renderer based on mode
  local renderers = {
    buildBlendMixDisplay,
    buildBlendRingDisplay, 
    buildBlendFMDisplay,
    buildBlendSyncDisplay,
    buildBlendXORDisplay,
  }
  return renderers[blendMode + 1](ctx, w, h, display)
end
```

---

## State Management

### Context Variables
```lua
ctx.blendMode = 0        -- Current blend mode (0-4)
ctx.blendAmount = 0.5    -- Master blend
ctx.waveToSample = 0.5   -- Modulation depth Wave→Sample
ctx.sampleToWave = 0.0   -- Modulation depth Sample→Wave
ctx.blendKeyTrack = true -- Pitch tracking state
ctx.blendSamplePitch = 0 -- Transposition in semitones
ctx.blendModAmount = 0.5 -- Additional modulation
```

### Sync Requirements
On parameter sync from DSP:
1. Read `/midi/synth/osc/blend_mode` → update dropdown
2. Read all blend parameters → update knobs
3. Call `refreshOscGraph()` to update visualization
4. Update mode-specific display elements

---

## Color Scheme

| Element | Color | Hex |
|---------|-------|-----|
| Blend Mode active tab | Cyan | 0xff22d3ee |
| Blend Amount knob | Amber | 0xfff59e0b |
| Wave→Sample knob | Purple | 0xffc084fc |
| Sample→Wave knob | Green | 0xff4ade80 |
| Key Track toggle (on) | Blue | 0xff3b82f6 |
| Sample Pitch knob | Pink | 0xfff472b6 |
| Mod Amount knob | Orange | 0xfffb923c |

---

## Open Questions

1. **Sample availability:** Should Blend mode be disabled if no sample captured? Or show "No Sample" placeholder?

2. **FM implementation:** Should FM use raw wave values or normalized? Through-zero or positive-only?

3. **XOR bit depth:** Should bit depth be adjustable (8-bit, 4-bit, 2-bit) or fixed at 8-bit?

4. **Performance:** Ring Mod and FM may be CPU intensive. Should there be a "low quality" mode?

5. **Preset behavior:** Should blend settings persist when switching between Wave/Sample/Blend tabs?

---

## Implementation Checklist

### Phase 1: UI
- [ ] Add Blend tab to TabHost (index 2)
- [ ] Create all 7 UI components with proper positioning
- [ ] Style components with color scheme
- [ ] Add visibility/layout update function

### Phase 2: Behavior
- [ ] Add blend context variables
- [ ] Implement `updateBlendLayout()` for visibility
- [ ] Add `buildBlendDisplay()` dispatcher
- [ ] Implement 5 mode-specific renderers

### Phase 3: DSP Integration
- [ ] Add 7 new parameter paths to DSP
- [ ] Implement blend algorithms in audio thread
- [ ] Add parameter sync in midisynth.lua
- [ ] Test all 5 modes with various waveforms/samples

### Phase 4: Polish
- [ ] Add tooltips explaining each blend mode
- [ ] Optimize graph rendering performance
- [ ] Add mode-specific help text
- [ ] Test edge cases (no sample, extreme modulation)

---

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-03-22 | Agent | Initial specification |

