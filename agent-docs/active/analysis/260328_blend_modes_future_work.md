# Blend Modes Future Work: Morph

## Executive Summary

This document maps out the next phase of blend-mode development.

**Priority:**
1. **Morph Mode** — Next to implement. Timbral interpolation between sample partials and wave partials.
2. **Sample Analysis Parameters** — Deferred. Just expose brightness, inharmonicity, etc. as readable parameters.
3. **Hybrid Mode** — Deferred indefinitely. Unclear what it contributes.

**Explicitly out of scope:**
- **Keymapping/Zones** — Single-sample workflow is sufficient.

---

## Current State Reference

### What We Have Now

| Component | Status | Notes |
|-----------|--------|-------|
| `SineBankNode` | ✅ Scalar impl | Renders partials in real-time |
| `OscillatorNode` Add mode | ✅ Live | Procedural additive in voice path |
| `PartialsExtractor` | ✅ Working | Extracts partials from captured sample |
| `SampleAnalysis` | ✅ Working | Produces metadata on capture |
| `sampleAdditive` voice node | ✅ Live | Receives sample partials |
| `blendAddOsc` voice node | ✅ Live | Wave-centric additive |
| Add mode (blendMode=4) | ✅ Live | Crossfades between wave-additive and sample-additive |

---

## 1. Morph Mode — NEXT TO IMPLEMENT

### Concept

Timbral interpolation between two partial sets. Not crossfading — the harmonics themselves shift.

```
Morph position 0: sample partials (from captured sample)
Morph position 1: wave partials (from oscillator additive recipe)
```

The difference from blendAmount crossfade:
- **Crossfade**: amp A goes down, amp B goes up — two sources mixing
- **Morph**: each partial's frequency/amplitude interpolates — one source transforming

Morph sounds like the timbre itself is changing, not like two sounds mixing.

### Use Cases

1. **Timbral transition** — Smooth shift from sample character to wave character
2. **Sweet spot hunting** — Find intermediate timbres between captured sound and oscillator shape
3. **Performance expression** — Morph position on mod wheel, velocity, aftertouch
4. **Sound design** — Start from sample, morph toward saw/square/etc to find unique hybrids

### Architecture

**Partial Sources:**
- **Slot A (position=0)**: Captured sample partials (from PartialsExtractor)
- **Slot B (position=1)**: Procedural wave partials (from OscillatorNode additive recipe for current waveform)

**What matters for each partial:**
```lua
{
    frequency = lerp(freqA, freqB, morphPosition),
    amplitude = lerp(ampA, ampB, morphPosition),
    phase = ...-- tricky, see below
}
```

**Phase handling:**
- Phase interpolation is tricky — naive lerp can cause cancellation
- Options:
  1. Use phase from A (sample) only
  2. Use phase from B (wave) only
  3. Jump to B phase when amplitude shifts sufficiently
- Recommendation: Use phase from the higher-amplitude source at each position

### Signal Flow

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    MORPH BRANCH                        │
                    │                                                        │
                    │  ┌─────────────────────┐    ┌─────────────────────┐   │
                    │  │ Slot A: Sample      │    │ Slot B: Wave        │   │
                    │  │ Partials            │    │ Partials            │   │
                    │  │ (from capture)      │    │ (from waveform)     │   │
                    │  └──────────┬──────────┘    └──────────┬─────────┘   │
                    │             │                          │              │
                    │             └────────────┬─────────────┘              │
                    │                          │                            │
                    │                          ▼                            │
                    │                 ┌────────────────┐                   │
                    │                 │ morphPartials  │◄── morphPosition  │
                    │                 │ (interpolate)  │    (0-1)         │
                    │                 └───────┬────────┘                   │
                    │                         │                            │
                    │                         ▼                            │
                    │                 ┌────────────────┐                   │
                    │                 │ SineBankNode   │                   │
                    │                 │ (single bank)  │                   │
                    │                 └───────┬────────┘                   │
                    │                         │                            │
                    └─────────────────────────┼────────────────────────────┘
                                             │
                                             ▼
                                      voiceMix → filter → FX → out
```

### Implementation Tasks

| Task | Description | Effort |
|------|-------------|------|
| **New blend mode** | `MORPH = 5` constant, routing | 0.5 day |
| **Morph position param** | `/midi/synth/blend/morphPosition` (0-1) | 0.5 day |
| **Partial interpolation** | `morphPartials(setA, setB, pos)` function | 1 day |
| **Wave partials generation** | Extract additive recipe from current waveform/shaping | 1 day |
| **Phase handling** | Decide phase strategy for morphed partials | 0.5 day |
| **Voice routing** | SineBankNode receives morphed partials | 1 day |
| **UI: Morph position** | Knob/slider for morph position | 0.5 day |
| **Testing** | Smooth morphing, phase coherence | 1 day |

**Total: ~6 days**

### Open Questions

1. **What happens when no sample captured?** — Fall back to wave additive only? Disable morph?
2. **Wave shape changes during morph?** — Recalculate Slot B partials live, or cache on morph start?
3. **Morph depth param?** — Or is morphPosition sufficient?

---

## 2. Sample Analysis Parameters — DEFERRED

### Concept

Sample analysis produces values (brightness, inharmonicity, attack time, etc.). These should simply be exposed as parameters, not a special mode.

```
/midi/synth/sample/brightness
/midi/synth/sample/inharmonicity
/midi/synth/sample/attackTime
/midi/synth/sample/fundamental
/midi/synth/sample/rmsLevel
...
```

These become readable parameters. When a modulation engine exists, users can route them to destinations. Until then, they're just available values.

**No blend mode needed. No hardcoded behavior. Just parameters.**

### Implementation Tasks

| Task | Description | Effort |
|------|-------------|------|
| **Expose analysis params** | Register paths for brightness, inharmonicity, etc. | 0.5 day |
| **Update on capture** | Write values when sample is analyzed | 0.5 day |

**Total: ~1 day**

### Why Deferred

Not urgent. These are just parameter exposure. No signal path changes. Can be done anytime. Morph is more interesting and gets us a new sonic capability.

---

## 3. Hybrid Mode — DEFERRED INDEFINITELY

### Concept

Sample playback + additive layer on top. Both play simultaneously.

### Why Deferred

Not obvious what this contributes:
- Add mode already crossfades wave-additive ↔ sample-additive
- Hybrid would layer sample + sample-additive, but the sample ALREADY contains those partials
- Might be useful for bandwidth extension (additive fills upper harmonics), but unclear

**Decision:** Tabled indefinitely. No clear use case.

---

## Implementation Priority

| Order | Feature | Status |
|-------|---------|--------|
| **1** | Morph Mode | Next to implement |
| **2** | Sample Analysis Parameters | Deferred — just parameter exposure |
| **3** | Hybrid Mode | Deferred indefinitely — unclear utility |

---

## Technical Notes

### Smoothing

Morph needs smoothing when partials change:
- Partial frequency/amplitude interpolation over time
- Phase coherence during morphs

Use existing exponential smoothing infrastructure.

### CPU Budget

| Feature | Expected Impact |
|---------|-----------------|
| Morph | Same as Add (one SineBankNode per voice) |
| Analysis Parameters | Negligible (just parameter reads) |

### Preset Compatibility

- Morph as new mode: extends blend enum — backward compatible
- Analysis parameters: optional, default to 0 — backward compatible

---

## File References

| File | Relevance |
|------|-----------|
| `dsp/core/nodes/SineBankNode.{h,cpp}` | Additive renderer |
| `dsp/core/nodes/OscillatorNode.{h,cpp}` | Additive recipes for wave partials |
| `dsp/core/nodes/SampleAnalysis.h` | Analysis metadata struct |
| `UserScripts/projects/Main/dsp/midisynth_integration.lua` | Voice routing, blend modes |
| `UserScripts/projects/Main/ui/behaviors/midisynth.lua` | UI parameter bindings |