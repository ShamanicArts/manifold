# Blend Modes and Modulation Analysis

## Context

This document analyzes the design space for blend modes in the additive synthesis paradigm, clearly distinguishing between:

1. **DSP Modes** — Require actual signal routing changes, new nodes, or graph topology modifications
2. **Modulation Routings** — Same DSP graph, different parameter connections via the modulation engine

This distinction is critical because DSP modes require code changes, while modulation routings can be expressed through the existing `ctx.params` system once analysis data is exposed as modulation sources.

---

## Modulation System Architecture

### Current Implementation

The project has a **frontend modulation system** where LFOs and other modulators run in UI behavior loops and update DSP parameters:

```lua
-- Parameter registration
ctx.params.register("/mod/lfo1/rate", { type = "f", min = 0.05, max = 10, default = 0.5 })
ctx.params.register("/mod/lfo1/depth", { type = "f", min = 0, max = 1, default = 0.5 })

-- Parameter binding
ctx.params.bind("/mod/filter/cutoff", filt, "setCutoff")
ctx.params.bind("/mod/delay/feedback", delay, "setFeedback")

-- Modulation callback updates DSP
onParamChange = function(path, value)
  if path == "/mod/filter/cutoff" then
    filt:setCutoff(value)
  elseif path == "/mod/osc/freq" then
    osc:setFrequency(value)
  end
end
```

**Key insight:** Parameters can be modulated at runtime without DSP changes. The modulation engine (when complete) will handle routing sources → destinations.

### Signal Domain Architecture

The project separates **Input Domain** (capture/analysis) from **Output Domain** (production):

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUT DOMAIN                                                    │
│  - Host input stream                                             │
│  - Available for capture, analysis, sidechain                    │
│  - Does NOT reach output directly                                │
│                                                                  │
│  Nodes: PassthroughNode,PitchDetector, RMSMeter, Recorder        │
│  Mark: ctx.graph.markInput(node)                                │
└─────────────────────────────────────────────────────────────────┘
         │ (via Monitor bridge only)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  OUTPUT DOMAIN                                                   │
│  - Audible synthesis and playback                                │
│  - What the user hears                                           │
│                                                                  │
│  Nodes: OscillatorNode,Filter, SineBankNode (future), FX, etc.   │
│  Mark: ctx.graph.markOutput(node)                               │
└─────────────────────────────────────────────────────────────────┘
```

**For additive synthesis:** Analysis of captured samples lives in Input Domain (analysis node), SineBank synthesis lives in Output Domain.

---

## The Three Sources

After additive integration, we have three primary synthesis sources:

```
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│   Oscillator    │   │    Sample      │   │   Additive      │
│   (waveforms)   │   │   (captured)   │   │   (partials)    │
│                 │   │                 │   │                 │
│  - Scalar waves │   │  - Loop playback│   │  - Extracted    │
│  - Unison/detune│   │  - Pitch-stretch│   │  - Resynthesized│
│  - Blend modes  │   │  - Multi-source │   │  - Morphable    │
└────────┬────────┘   └────────┬────────┘   └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                               │
                        BLEND MATRIX
                               │
                               ▼
                         Voice Output
```

**Plus a fourth "meta-source":**
```
┌─────────────────┐
│ Analysis Data   │  ← Not audio, but modulation source
│                 │
│  - Brightness   │
│  - Fundamental  │
│  - Inharmonicity│
│  - Envelope     │
│  - Formants     │
└─────────────────┘
```

---

## Existing Blend Modes (DSP-Level)

From `docs/blend-tab-spec.md`, current blend modes are DSP-level graph changes:

| Mode | DSP Operation | Graph Change |
|------|---------------|--------------|
| **Mix** | `output = wave * (1-blend) + sample * blend` | Crossfader node |
| **Ring** | `output = wave * (1-blend) + wave * sample * blend` | Ring modulator node |
| **FM** | `sample_rate = base * (1 + wave * depth)` | Sample playback rate modulated by wave |
| **Sync** | `if wave_crossing_up then sample_phase = 0` | Sample phase reset on wave trigger |
| **XOR** | `output = (int(wave*127) ^ int(sample*127)) / 127` | Bitwise XOR between quantized signals |

Each of these is a **fundamentally different signal operation** requiring different DSP nodes or routing.

---

## Proposed Modes Taxonomy

### DSP-Level Modes (Require Code)

These modes change the signal routing or add new DSP capabilities.

| Mode | Description | What Changes |
|------|-------------|--------------|
| **Additive** | Pure sine bank from partials | `OscillatorNode` → `SineBankNode` |
| **Hybrid** | Sample layer + Additive layer | Both paths active, summed via mixer |
| **Transient Replace** | Additive attack, Sample sustain | Time-domain source switching |
| **Spectral Morph** | Morph between partial sets A→B | Partial interpolation DSP |
| **Cross-Synthesis** | Sample spectrum shapes Osc | Vocoder-style spectral filtering |
| **Complement** | Additive fills sample's gaps | Partial injection based on spectral analysis |

### Modulation Routings (No Code Change)

These connect existing analysis data to existing parameters via the modulation engine.

| Routing | Source | Destination | Effect |
|---------|--------|--------------|--------|
| **Brightness Follow** | `analysis.brightness` | `filter.cutoff` | Darker sample → lower cutoff |
| **Pitch Track** | `analysis.fundamental` | `oscillator.frequency` | Auto-tune to sample pitch |
| **Envelope Duck** | `analysis.envelope` | `sample.gain` (inverse) | Sample ducking based on its own envelope |
| **Inharmonicity Spread** | `analysis.inharmonicity` | `oscillator.detune` | More inharmonic = wider unison spread |
| **Attack Track** | `analysis.attackTime` | `adsr.attack` | Match envelope to sample |
| **Dynamic Formants** | `analysis.formants` | `formant.filter` | Vocal tract emulation |
| **Velocity Map** | `analysis.brightness` | `filter.velocityMod` | Brighter = more filter open |
| **Release Track** | `analysis.decayTime` | `adsr.release` | Match release to sample decay |

### Gray Area (Could Be Either)

Some proposals could be implemented as DSP mode or modulation routing, depending on desired quality.

#### Transient Replace

**DSP Mode Approach:**
```
Time 0ms ──── N ms ────→∞
      │         │
      │         └── Sample plays
      └─────────── Additive plays
      
Hard handoff at time N.
```
Requires: Split source routing with timing control.

**Modulation Approach:**
```
Both sources play always:
- Additive has fast attack, fast decay
- Sample has delayed attack

Their amplitude envelopes sum / crossfade.
```
Requires: Both sources layered with carefully designed envelopes.

**Trade-off:** DSP mode gives tighter control but more code. Modulation approach is "good enough" for many use cases.

---

## Current UI/Product Direction

After reviewing the current oscillator UI implementation, the additive roadmap should respect the existing tab split instead of forcing a new additive tab.

### Wave tab = procedural additive oscillator
Decision:
- keep the waveform dropdown as the shape / harmonic-recipe selector
- add a compact segmented control beside it: **`Standard | Add`**
- `Add` means the selected waveform recipe is rendered by the additive engine instead of the standard oscillator path

This is better than adding `Additive` as just another waveform entry because it keeps two separate choices separate:
- waveform recipe
- rendering paradigm

### Blend tab = sample-derived additive / hybrid
Decision:
- sample-derived additive and later hybrid/sample+additive modes belong conceptually in Blend
- they do **not** belong in the Sample tab, because Sample is currently capture/admin/root/crossfade management

### Unsupported shapes in early Add mode
The Wave tab should grey out unsupported shapes in `Add` mode rather than pretending they work.
That gives us room to:
- defer shapes like Noise / SuperSaw if needed
- add additive-specific recipes later without corrupting the Standard oscillator model

This matters because the UI already has a strong separation between:
- Wave = oscillator identity
- Sample = sample management
- Blend = source relationship / interaction

---

## DSP Mode Detailed Analysis

### 1. Additive Mode (Pure)

**Priority: High** — Core capability for additive synthesis.

```
Signal Flow:
┌──────────────┐
│ Partials     │  (from captured sample analysis)
│ Extractor    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  SineBank    │  (8-32 sine oscillators)
│  Node        │
└──────┬───────┘
       │
       ▼
    Voice Mix → Filter → FX → Out
```

**Implementation:**
- New `SineBankNode` in DSP layer
- Analysis happens at capture time (Input Domain)
- Partials stored, passed to SineBank at voice allocation
- Same envelope as oscillator (ADSR)
- Pitch follows MIDI notes (partial frequencies × semitone ratio)

**Why it's DSP:** Requires a fundamentally different synthesis engine (sine bank vs scalar oscillator).

### 2. Hybrid Mode

**Priority: High** — Natural extension of existing layering.

```
Signal Flow:
                                     ┌──────────────┐
                            ┌───────│   Sample     │
                            │       │  Playback   │
                            │       └──────┬───────┘
                            │              │
┌──────────────┐            │              ▼
│  Partials    │            │       ┌──────────────┐
│  Extractor   │            │       │ Sample Gain  │
└──────┬───────┘            │       └──────┬───────┘
       │                    │              │
       ▼                    │              │
┌──────────────┐            │       ┌──────▼───────┐
│  SineBank    │            │       │              │
│  Node        │────────────┼──────▶│   Additive   │──┐
└──────────────┘            │       │    Gain      │  │
                            │       └──────────────┘  │
                            │                         │
                            └─────────────────────────┤
                                                      │
                                                      ▼
                                                ┌──────────┐
                                                │   Mix    │
                                                └────┬─────┘
                                                     │
                                                     ▼
                                                  Filter...
```

**Implementation:**
- Both paths exist in `buildPlugin()`
- Blend parameter controls `sampleGain` and `additiveGain` (inverse)
- Both through same filter/FX chain (or separate? design decision)

**Why it's DSP:** Requires both synthesis paths to exist simultaneously.

### 3. Spectral Morph Mode

**Priority: High** — The "killer feature" for timbral exploration.

```
Signal Flow:
┌──────────────┐     ┌──────────────┐
│  PartialSet A │     │  PartialSet B │
│  (Sample 1)   │     │  (Sample 2)   │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │    morphPosition   │
       │         ◄──────────┘
       │              │
       ▼              ▼
┌──────────────────────────┐
│   Morph Interpolation    │
│   freqA × (1-pos) +      │
│   freqB × pos            │
│   ampA × (1-pos) +       │
│   ampB × pos              │
└───────────┬──────────────┘
            │
            ▼
      ┌──────────────┐
      │  SineBank     │
      │  Node         │
      └──────┬───────┘
             │
             ▼
          Filter...
```

**Implementation:**
- Two `PartialData` structures stored (from two captured samples)
- Morph position (0-1) parameter
- Interpolates frequencies and amplitudes per partial
- SineBank renders morphed partials

**Why it's DSP:** The morphing DSP is specific to partial representation. Impossible with sample playback alone.

**What this enables:**
- Morph between piano and bells
- Smooth transition from drum to flute
- Explore "impossible" timbral spaces

### 4. Cross-Synthesis Mode

**Priority: Medium** — Powerful but more complex.

```
Signal Flow:
┌──────────────┐
│  Sample A    │
│  (captured)  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Spectral     │  ← FFT analysis
│ Envelope     │     (form resonances, not just harmonics)
│ Extractor    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Oscillator  │  ← Carrier signal
│  (any wave)  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Spectral    │  ← Apply envelope to carrier
│  Filter Bank │     (like vocoder but continuous)
│  (N bands)   │
└──────┬───────┘
       │
       ▼
    Voice Output
```

**Implementation:**
- FFT analysis extracts spectral envelope (not just partials)
- Band-pass filter bank or FFT convolution
- Apply envelope to oscillator in real-time

**Why it's DSP:** Requires filter bank or FFT convolution that doesn't exist yet. Different from partial extraction.

### 5. Transient Replace Mode

**Priority: Lower** — Can be approximated via modulation.

**DSP Implementation:**
```
                    ┌──────────────┐
                    │   Timer       │
                    │   (attack ms) │
                    └───────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   │                   ▼
┌──────────────┐            │            ┌──────────────┐
│  SineBank    │            │            │   Sample     │
│  (attack)    │◄────────────┘            │   (sustain)  │
└──────┬───────┘                         └──────┬───────┘
       │                                        │
       │               ┌──────────┐              │
       └───────────────│  Switch  │──────────────┘
                       │ (time N) │
                       └────┬─────┘
                            │
                            ▼
                         Filter...
```

**Why it's DSP:** Requires time-domain source switching with precise timing.

**Modulation Alternative:**
Both sources play always with overlapping envelopes:
- Additive: attack=5ms, decay=50ms, sustain=0
- Sample: attack=0 (delayed), sustain=1

Result: Smooth handoff without hard switch.

### 6. Complement Mode (Spectral Fill)

**Priority: Lower** — Specific use case.

```
Sample plays normally.
Additive fills in missing harmonics.

Analysis:
  Sample has harmonics at: [220, 440, 660] (weak at 880)
  
Additive plays:
  Strong harmonic at 880 (fills the gap)
  
Together:
  Fuller spectrum than sample alone.
```

**Implementation:**
- Analyze sample partials
- Analyze target spectrum (could be preset, or from another source)
- Additive plays the difference
- Layer with sample

**Why it's DSP (potentially):** Requires real-time spectral comparison and filling. Though implementation could use Hybrid mode with modulation controlling which partials to boost.

---

## Modulation Routings Detailed Analysis

Once the modulation engine exposes analysis data as sources and synthesizer parameters as destinations, these become configuration, not code.

### Exposure Requirements

**Analysis Sources (need to be exposed):**

```
/analysis/brightness      -- Spectral centroid normalized (0-1)
/analysis/fundamental     -- Detected pitch in Hz
/analysis/inharmonicity   -- Deviation from harmonic series (0-1)
/analysis/attackTime      -- Attack duration in ms
/analysis/decayTime       -- Decay duration in ms
/analysis/sustainLevel    -- Sustain level (0-1)
/analysis/releaseTime     -- Release duration in ms
/analysis/rmsLevel        -- Overall RMS level (0-1)
/analysis/partialCount    -- Number of active partials
/analysis/formants[1-4]   -- Formant frequencies
```

**Destination Parameters (already exist or planned):**

```
/filter/cutoff            -- Existing
/filter/resonance         -- Existing
/oscillator/detune        -- Existing
/oscillator/spread        -- Existing
/adsr/attack              -- Existing
/adsr/decay                -- Existing
/adsr/release              -- Existing
/sample/gain               -- Existing
/sample/pitchOffset        -- Existing
/additive/pitchShift       -- New (for Additive mode)
/additive/formantShift     -- New (for formant manipulation)
```

### Example Routings

#### Brightness → Filter

```lua
-- Modulation: Brighter sample = more filter open
ctx.params.register("/analysis/brightness", { type = "f", min = 0, max = 1 })

-- Routing (frontend/preset)
modulation.addRouting({
  source = "/analysis/brightness",
  dest = "/filter/cutoff",
  scale = { fromMin = 0, fromMax = 1, toMin = 200, toMax = 8000 },
  curve = "exponential"
})
```

No DSP change. Filter cutoff range already supports this.

#### Pitch Track → Oscillator

```lua
-- Modulation: Oscillator follows sample's fundamental
modulation.addRouting({
  source = "/analysis/fundamental",
  dest = "/oscillator/frequency",
  scale = { fromMin = 20, fromMax = 2000, toMin = 20, toMax = 2000 },
  curve = "linear",
  enable = true  -- Can be toggled
})
```

Again, no DSP change. Just parameter routing.

#### Envelope Duck → Sample

```lua
-- Modulation: Sample ducks during its own transient
modulation.addRouting({
  source = "/analysis/envelope",
  dest = "/sample/gain",
  scale = { fromMin = 0, fromMax = 1, toMin = 1, toMax = 0 },  -- Inverse
  curve = "linear"
})
```

---

## Value Assessment

### High Value DSP Modes

| Mode | Why High Value |
|------|----------------|
| **Additive** | Core capability. Enables everything else. |
| **Hybrid** | Natural evolution of existing blend. Low risk. |
| **Morph** | Killer feature. Unique timbral exploration. |

### Medium Value DSP Modes

| Mode | Why Medium Value |
|------|------------------|
| **Cross-Synthesis** | Powerful but complex. Further down the roadmap. |
| **Complement** | Specific use case. Could be approximated via Hybrid. |

### Lower Value DSP Modes

| Mode | Why Lower Value |
|------|-----------------|
| **Transient Replace** | Can be approximated via modulation. Hard to get right. |

### High Value Modulation Routings

These cost almost nothing (once the modulation engine is complete) and add significant expressiveness:

| Routing | Value |
|---------|-------|
| Brightness → Filter | High (automatic tonal matching) |
| Pitch Track → Oscillator | High (auto-tune to sample) |
| Inharmonicity → Detune/Spread | Medium (more natural synthesis) |
| Attack Time → ADSR | Medium (envelope matching) |

---

## Design Decisions

### 1. DSP Mode Count

**Recommendation:** Implement 3-4 DSP modes initially:
- Additive (pure)
- Hybrid (layered)
- Morph (killer feature)
- (Maybe) Transient Replace via modulation approach

Don't implement all proposed modes — many are better served by modulation.

### 2. Modulation Engine Priorities

Expose analysis data soon, even before full modulation engine:
- `/analysis/brightness` — Most useful for filter following
- `/analysis/fundamental` — Useful for pitch tracking
- `/analysis/envelope` — Useful for envelope matching

### 3. Hybrid vs. Complement

**Hybrid is sufficient for most use cases.** Complement (filling spectral gaps) is a specific behavior that could be a Hybrid preset with modulation controlling additive amplitude per-partial.

### 4. Transient Replace Approach

**Start with modulation approach:**
- Both sources play
- Additive: fast attack, fast decay, sustain=0
- Sample: delayed attack, sustain=1
- Crossfade via envelopes, not hard switch

If this doesn't sound right, implement DSP mode with time-domain switching.

---

## Implementation Phases

### Phase 1: Core Additive (DSP)

- `PartialsExtractor` component
- `SineBankNode` component
- Additive mode (pure resynthesis)
- Analysis exposure as parameters

### Phase 2: Hybrid and Modulation (DSP + FE)

- Hybrid mode (both paths layered)
- Analysis → parameter routings
- Preset system for common routings

### Phase 3: Morph (DSP)

- Two-partial-set storage
- Morph position parameter
- Interpolation DSP

### Phase 4: Cross-Synthesis (DSP, if valuable)

- Filter bank or FFT convolution
- Spectral envelope extraction
- Dynamic application to carrier

### Phase 5: Advanced Modulation (FE)

- LFO modulating analysis destinations
- Envelope followers
- Per-partial amplitude control

---

## Preset System Design

Once modulation routings are parameterized, presets become dicts:

```lua
-- Preset: "Match Sample Brightness"
{
  name = "Match Sample Brightness",
  mode = "hybrid",  -- or "additive", "mix", etc.
  modulations = {
    { source = "/analysis/brightness", dest = "/filter/cutoff", scale = {0,1,200,8000} },
    { source = "/analysis/fundamental", dest = "/oscillator/frequency", enable = false },
  },
  params = {
    ["hybrid/blend"] = 0.5,
    ["filter/resonance"] = 0.7,
  }
}

-- Preset: "Auto-Tune to Sample"
{
  name = "Auto-Tune to Sample",
  mode = "additive",
  modulations = {
    { source = "/analysis/fundamental", dest = "/additive/baseFrequency", enable = true },
  }
}

-- Preset: "Spectral Morph Preparation"
{
  name = "Capture for Morph",
  mode = "morph",
  captures = 2,  -- Trigger two sample captures
  params = {
    ["morph/position"] = 0.5,
    ["morph/time"] = 2000,  -- 2 second morph
  }
}
```

---

## Open Questions

1. **How many partials is enough?**
   - 8 is computationally easy
   - 16 gives better fidelity
   - 32+ for complex spectra (bells, piano)
   - Make configurable with CPU warning?

2. **Should Hybrid have independent FX paths?**
   - Sample → FX1, Filter
   - Additive → FX2, Filter
   - Or both through same chain?
   - Recommendation: Same chain for simplicity, users can adjust blend.

3. **Morph interpolation: Linear or spectral?**
   - Linear (freqs and amps): Simple, can sound artificial
   - Spectral (formant-aware): Better results, more complex
   - Recommendation: Start with linear, add spectral as option.

4. **Analysis: Real-time or cached?**
   - Cached at capture time (current design)
   - Real-time would allow live input analysis
   - Recommendation: Cached for now, real-time as future enhancement.

5. **Where does formant manipulation live?**
   - Formant shift is parameter on Additive mode
   - Could also be modulation destination
   - Recommendation: Expose as `/additive/formantShift`, allow modulation.

---

## Summary Table

| Fraction | Category | DSP Change? | Implementation Path |
|----------|----------|-------------|---------------------|
| Additive | DSP Mode | Yes | New node (SineBank) |
| Hybrid | DSP Mode | Yes | Both paths in buildPlugin |
| Spectral Morph | DSP Mode | Yes | Two-partial storage + interpolation |
| Cross-Synthesis | DSP Mode | Yes | Filter bank or FFT convolution |
| Transient Replace | Grey | Maybe | Start with modulation approach |
| Complement | DSP Mode | Maybe | Could use Hybrid + modulation |
| Brightness → Filter | Modulation | No | Expose analysis + route |
| Pitch Track → Osc | Modulation | No | Expose analysis + route |
| Envelope Track → ADSR | Modulation | No | Expose analysis + route |
| Formant Shift | Modulation | No | Parameter on Additive mode |
| Inharmonicity → Spread | Modulation | No | Expose analysis + route |

**Implementation Priority:**
1. Additive mode (core DSP)
2. Hybrid mode (DSP + blend parameter)
3. Analysis exposure as modulation sources
4. Modulation routing presets
5. Spectral Morph (DSP)
6. Cross-Synthesis (DSP, optional)

---

## Appendix: Existing Blend Modes Reference

From the current implementation:

```lua
-- oscMode values
OSC_MODE_CLASSIC = 0    -- Standard oscillator
OSC_MODE_SAMPLE = 1     -- Sample playback only
OSC_MODE_BLEND = 2      -- Osc + Sample blend

-- blendMode values (when oscMode = BLEND)
BLEND_MIX = 0           -- Crossfade
BLEND_RING = 1          -- Ring modulation (wave × sample)
BLEND_FM = 2            -- FM (wave modulates sample rate)
BLEND_SYNC = 3          -- Hard sync (wave resets sample phase)
BLEND_XOR = 4           -- Bitwise XOR
```

Proposed extension:

```lua
-- oscMode values (extended)
OSC_MODE_CLASSIC = 0    -- Standard oscillator
OSC_MODE_SAMPLE = 1     -- Sample playback only
OSC_MODE_BLEND = 2      -- Osc + Sample blend (existing)
OSC_MODE_ADDITIVE = 3   -- Pure additive resynthesis
OSC_MODE_HYBRID = 4     -- Sample + Additive layer
OSC_MODE_MORPH = 5      -- Interpolate between partial sets

-- blendMode for HYBRID mode
HYBRID_LAYER = 0        -- Simple amplitude blend
HYBRID_SPECTRAL_FILL = 1 -- Additive fills missing harmonics
```

---

## File References

- `agent-docs/ADDITIVE_RESYNTHESIS_SPEC.md` — Technical specification for Additive implementation
- `docs/blend-tab-spec.md` — Current blend mode specification
- `docs/signal-domains-architecture.md` — Input/Output domain separation
- `UserScripts/projects/Main/dsp/midisynth_integration.lua` — Current voice construction
- `manifold/dsp/scripts/test_param_modulation.lua` — Modulation system example