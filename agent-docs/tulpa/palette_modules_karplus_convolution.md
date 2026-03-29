# Palette Module Suggestions: Karplus-Strong & Convolution

## Overview

Extend the MIDI synth rack palette with physical modeling and spatialization modules. These fit the existing drag-and-drop paradigm while adding entirely new synthesis capabilities.

## Two-Tier Architecture

### Tier 1: Generic Primitives
Low-level building blocks for custom signal chains. Maximum flexibility, requires patching.

### Tier 2: Bundled Instruments/Effects
Complete solutions combining primitives. Drag-and-play, optimized presets.

---

## Tier 1: Generic Primitives

### 1. RESONATOR (Physical Modeling Resonator)

**Type:** Primitive  
**Accent Color:** `#fffb923c` (warm orange)  
**Category:** Sound Source / Processor

**Description:**  
Karplus-Strong delay-line resonator. Creates pitched, sustained tones from any excitation signal.

**Ports:**
```
EXCITE (Audio In) ──► [RESONATOR] ──► OUT (Audio)
PITCH (CV In)       ──►
DAMPING (CV In)     ──►
```

**Parameters:**
| Param | Range | Default | Description |
|-------|-------|---------|-------------|
| `pitch` | 20-2000 Hz | 440 Hz | Resonant frequency |
| `damping` | 0-1 | 0.3 | Brightness decay (0=dark, 1=bright) |
| `feedback` | 0-1.2 | 0.95 | Sustain time (0=short, >1=self-oscillating) |
| `stiffness` | 0-1 | 0.0 | Inharmonicity (0=pure, 1=metallic) |
| `excitationMix` | 0-1 | 0.1 | How much dry exciter passes through |

**Use Cases:**
- Plucked strings (guitar, bass, harp)
- Percussion (marimba, xylophone via stiffness)
- Drones (high feedback, noise excitation)
- Resonant filtering (low damping, short feedback)

**Lua DSP Binding:**
```lua
{
  type = "ResonatorNode",
  id = "myResonator",
  params = {
    pitch = "/rack/resonator/1/pitch",
    damping = "/rack/resonator/1/damping",
    feedback = "/rack/resonator/1/feedback"
  }
}
```

---

### 2. CONVOLVER (Convolution Processor)

**Type:** Primitive  
**Accent Color:** `#ff818cf8` (soft purple)  
**Category:** Effect / Spatial

**Description:**  
Real-time convolution with IR capture and manipulation. Applies the "character" of one sound to another.

**Ports:**
```
IN (Audio) ──► [CONVOLVER] ──► OUT (Audio)
              ▲
IR IN (Audio, optional) ──┘
```

**Parameters:**
| Param | Range | Default | Description |
|-------|-------|---------|-------------|
| `irPosition` | 0-1 | 0.0 | Scan position through IR (wavetable-style) |
| `irSpeed` | -2x to +2x | 1.0 | Playback speed of IR (pitch shift) |
| `mix` | 0-1 | 0.5 | Wet/dry balance |
| `predelay` | 0-100ms | 0 | Delay before convolution starts |
| `size` | 0.1-2.0x | 1.0 | Stretch/compress IR length |
| `captureTrigger` | Trigger | - | Capture new IR from IR IN port |
| `irSelect` | 0-N | 0 | Select from preset IRs or captured |

**IR Modes:**
- **Live Capture:** Record IR from IR IN port (room clap, impulse)
- **Preset:** Load from factory IR library (springs, halls, cabs)
- **Sample:** Use loaded sample as IR

**Use Cases:**
- Reverb (room/hall IRs)
- Speaker cabinet simulation
- Creative: Apply drum transient to pad
- "Infinite" sustain via freeze mode

---

### 3. EXCITER (Excitation Source)

**Type:** Primitive  
**Accent Color:** `#fff472b6` (pink)  
**Category:** Sound Source

**Description:**  
Generates excitation signals for physical models. The "pluck" or "strike" that starts resonance.

**Ports:**
```
TRIGGER (Gate In) ──► [EXCITER] ──► OUT (Audio)
PITCH (CV In)     ──►
```

**Parameters:**
| Param | Range | Default | Description |
|-------|-------|---------|-------------|
| `type` | 0-4 | 0 | 0=noise burst, 1=impulse, 2=sine sweep, 3=sample snippet, 4=input pass-through |
| `decay` | 1-100ms | 10ms | How long excitation lasts |
| `tone` | 0-1 | 0.5 | Brightness of excitation |
| `amplitude` | 0-1 | 0.8 | How hard the "pluck" |
| `sampleStart` | 0-1 | 0.0 | If type=3, where in sample to grab |
| `sampleLength` | 1-100ms | 20ms | If type=3, how much to play |

**Use Cases:**
- Noise burst → RESONATOR = classic Karplus-Strong
- Impulse → CONVOLVER = IR testing
- Sample snippet → RESONATOR = "infinite guitar"
- Pass-through → filter external input for excitation

---

### 4. RESONATOR BANK (Multi-Modal Resonator)

**Type:** Primitive  
**Accent Color:** `#fffbbf24` (amber)  
**Category:** Sound Source / Processor

**Description:**  
Multiple tuned resonators for complex modal synthesis (marimba, bells, drums).

**Ports:**
```
EXCITE (Audio In) ──► [RESONATOR BANK] ──► OUT (Audio)
PITCH (CV In)       ──►
SELECT (CV In)      ──► (modulate which resonators active)
```

**Parameters:**
| Param | Range | Default | Description |
|-------|-------|---------|-------------|
| `numModes` | 1-8 | 3 | How many resonant frequencies |
| `fundamental` | 20-2000 Hz | 200 Hz | Base frequency |
| `stretch` | 0.5-2.0 | 1.0 | Inharmonicity (1.0=harmonic, >1=metallic) |
| `damping` | 0-1 | 0.4 | Overall decay |
| `modesMix` | 0-1 | 0.5 | Balance between modes |
| `modeGains[8]` | 0-1 | varies | Individual level for each mode |

**Use Cases:**
- Marimba/vibraphone (specific stretch ratios)
- Bell tones (inharmonic)
- Drum synthesis (filtered noise + modal resonators)
- Vocal formants (tuned resonator bank)

---

## Tier 2: Bundled Instruments/Effects

### 5. PLUCK (Complete Physical Modeling Instrument)

**Type:** Bundled Instrument  
**Accent Color:** `#ff4ade80` (green)  
**Category:** Instrument

**Description:**  
Complete plucked string instrument. Combines EXCITER + RESONATOR + CONVOLVER internally.

**Ports:**
```
GATE (Gate In)   ──► [PLUCK] ──► OUT (Audio)
PITCH (V-OCT In) ──►
```

**Parameters:**
| Param | Range | Default | Description |
|-------|-------|---------|-------------|
| `tension` | 0-1 | 0.5 | String tightness (pitch stability) |
| `brightness` | 0-1 | 0.5 | Initial pluck brightness |
| `decay` | 0-1 | 0.7 | How long it sustains |
| `bodySize` | 0-1 | 0.5 | Convolver mix (simulated body) |
| `pluckPosition` | 0-1 | 0.3 | Where along string plucked (timbre) |
| `bodyType` | 0-N | 0 | Select body IR: 0=acoustic, 1=strat, 2=les paul, etc. |

**Internal Architecture:**
```
Gate ──► EXCITER ──► RESONATOR ──► CONVOLVER ──► OUT
Pitch ──►┘           ▲              ▲
                     └──────────────┘
              (feedback for sustain)
```

**Use Cases:**
- Realistic guitar/bass
- Harpsichord (different excitation)
- Clavinet (different damping)
- Ethnic plucked instruments (sitar via stiffness)

---

### 6. INFINITE (Infinite Sustain Processor)

**Type:** Bundled Effect  
**Accent Color:** `#ff22d3ee` (cyan)  
**Category:** Effect

**Description:**  
Sample sustains forever via crossfade to physical model. The "freeze" effect from your crossfade live sampling extended to physical modeling.

**Ports:**
```
IN (Audio)       ──► [INFINITE] ──► OUT (Audio)
GATE (Gate In)   ──►
PITCH (CV In)    ──►
```

**Parameters:**
| Param | Range | Default | Description |
|-------|-------|---------|-------------|
| `threshold` | -60 to 0 dB | -30 | When to trigger sustain (from input) |
| `crossfadeTime` | 10-500ms | 100ms | How fast to switch to sustain |
| `resonanceType` | 0-2 | 0 | 0=string, 1=bowed, 2=blown |
| `feedback` | 0-1.1 | 0.98 | How long sustain lasts |
| `pitchTrack` | On/Off | On | Auto-tune resonance to detected pitch |

**Modes:**
- **Auto:** Detects pitch, sustains automatically when input drops
- **Manual:** Gate controls when sustain kicks in
- **Freeze:** One-shot freeze (like reverb freeze)

**Use Cases:**
- Guitar sustain pedal effect
- Piano string resonance after note release
- Vocal "infinite" notes
- Sound design: freeze any input

---

### 7. SPACE PLUCK (Spatial Physical Modeling)

**Type:** Bundled Instrument  
**Accent Color:** `#ffc084fc` (lavender)  
**Category:** Instrument / Spatial

**Description:**  
PLUCK that captures the room IR every time you play. Every note resonates in the space you're in.

**Ports:**
```
GATE (Gate In)    ──► [SPACE PLUCK] ──► OUT (Audio)
PITCH (V-OCT In)  ──►
MIC (Audio In)    ──► (captures room IR)
```

**Parameters:**
| Param | Range | Default | Description |
|-------|-------|---------|-------------|
| `captureMode` | 0-2 | 1 | 0=manual trigger, 1=on every note, 2=continuous |
| `captureDuration` | 10-200ms | 50ms | How long to capture IR |
| `roomMix` | 0-1 | 0.4 | How much room character |
| `decay` | 0-1 | 0.6 | Resonance sustain |
| `damping` | 0-1 | 0.3 | Room brightness |

**How It Works:**
1. Note triggers
2. Captures 50ms from MIC input (room ambience)
3. Uses that as convolution IR
4. Plays note through resonator + captured room

**Use Cases:**
- Play differently in every room
- React to room acoustics live
- Performance art: clap to change timbre
- Virtual "prepared piano" with room as resonator

---

## Rack Integration Patterns

### Pattern 1: Basic Plucked String
```
MIDI Voice → PLUCK → FILTER → OUT
```
Simple monophonic physical modeling synth.

### Pattern 2: Layered Physical Model
```
MIDI Voice → EXCITER ──┬──► RESONATOR (low damping) ──┐
                       └──► RESONATOR (high damping)  ├──► MIXER → OUT
```
Layer two resonators for complex decay characteristics.

### Pattern 3: Processed External Input
```
AUDIO IN → EXCITER (type=4, pass-through) → RESONATOR → CONVOLVER → OUT
```
Process live input through physical model + space.

### Pattern 4: Modal Drum Synthesis
```
NOISE GEN → FILTER (short burst) → RESONATOR BANK → CONVOLVER → OUT
```
Create tuned percussion.

### Pattern 5: Infinite Pad
```
SAMPLE → INFINITE → CHORUS → OUT
```
Any sample becomes infinite drone.

---

## Modulation Integration

All parameters should be routable via the modulation system:

```lua
-- Example: Modulate resonator pitch with LFO
{
  source = "lfo/1/output",
  target = "rack/resonator/1/pitch",
  amount = 0.5,  -- +/- 50% pitch modulation
  bipolar = true
}
```

Key modulation destinations:
- `RESONATOR.pitch` → Vibrato, pitch bends
- `RESONATOR.feedback` → Dynamics (more feedback = louder/sustained)
- `CONVOLVER.irPosition` → Wavetable-style scanning
- `RESONATOR_BANK.stretch` → Morph between harmonic/metallic

---

## Implementation Notes

### DSP Node Requirements

**New C++ Nodes Needed:**
1. `ResonatorNode` — Karplus-Strong with damping/stiffness
2. `ResonatorBankNode` — Multi-modal resonator
3. `ConvolverNode` — FFT-based convolution with IR management
4. `ExciterNode` — Multi-mode excitation generator

**Existing Nodes Used:**
- `MixerNode` — For PLUCK/INFINITE internal mixing
- `GainNode` — Level control
- `FilterNode` — Damping filters

### UI Requirements

**Palette Cards:**
- Visual distinctiveness (accent colors above)
- Port labeling (can be minimal like "IN → OUT")
- Drag-and-drop into rack slots
- Parameter panel when selected in rack

**Parameter Panels:**
- Sliders/knobs for continuous params
- Dropdowns for mode selections
- "Capture" button for IR modes
- Visual feedback (waveform preview for IRs)

---

## Open Questions

1. **IR Storage:** Where do captured IRs live? Per-project? Global? Exportable?

2. **CPU Budget:** Convolution is expensive. Max concurrent instances? Quality modes?

3. **MIDI Polyphony:** How do multiple voices share IRs? (Probably per-voice IR capture)

4. **Feedback Stability:** Self-oscillating resonators can explode. Hard limiter? Soft clip?

5. **Exciter Timing:** Should EXCITER be triggered by GATE or audio transient detection?

---

## Priority Ranking

1. **PLUCK** — Most musically useful, complete instrument
2. **RESONATOR** — Foundation for everything else
3. **CONVOLVER** — Enables spatial effects
4. **INFINITE** — Unique feature leveraging your crossfade expertise
5. **SPACE PLUCK** — Novel performance instrument
6. **RESONATOR BANK** — Advanced modal synthesis
7. **EXCITER** — Only needed for advanced patching

---

## Files to Create

When implementing, these files need creation/modification:

**DSP Layer:**
- `dsp/core/nodes/ResonatorNode.h/cpp`
- `dsp/core/nodes/ResonatorBankNode.h/cpp`
- `dsp/core/nodes/ConvolverNode.h/cpp`
- `dsp/core/nodes/ExciterNode.h/cpp`

**Lua/UI Layer:**
- `UserScripts/projects/Main/ui/components/palette_resonator.lua`
- `UserScripts/projects/Main/ui/components/palette_pluck.lua`
- `UserScripts/projects/Main/lib/rack_modules/resonator.lua`
- `UserScripts/projects/Main/lib/rack_modules/pluck.lua`

**Integration:**
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua` — Add palette cards
- `UserScripts/projects/Main/dsp/midisynth_integration.lua` — Node instantiation

---

*These modules extend Manifold's palette from subtractive/additive synthesis into physical modeling and spatial audio, while maintaining the drag-and-drop, modular rack paradigm.*
