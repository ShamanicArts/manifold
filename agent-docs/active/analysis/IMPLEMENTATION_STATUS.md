# Implementation Status — Sample Synthesis Roadmap

## Current Architecture (Verified)

### Blend Mode Taxonomy

| Value | Mode | Status | Notes |
|-------|------|--------|-------|
| 0 | Mix | ✅ Live | Crossfade wave↔sample |
| 1 | Ring | ✅ Live | Bidirectional ring mod |
| 2 | FM | ✅ Live | Sample modulates wave frequency |
| 3 | Sync | ✅ Live | Sample resets oscillator phase |
| ~~4~~ | ~~XOR~~ | ❌ Deprecated | Param retained for preset compat |
| 4 | **Add** | ✅ Live | Additive blend family |

### Add Mode Architecture

Add is implemented as a proper Blend family with:

**Two endpoints:**
- **Bus A (blend=0)**: `blendAddOsc` — wave-centric additive (OscillatorNode in Add render mode)
- **Bus B (blend=1)**: `sampleAdditive` — sample-derived additive (SineBankNode from extracted partials)

**Controls:**
- **blendAmount**: Crossfades between wave-centric and sample-derived endpoints
- **blendModAmount (depth)**: Dry/wet mix against the base/canonical branch
- **addFlavor**: Determines how sample partials are processed:
  - **Self (0)**: Raw captured partials feed `sampleAdditive`
  - **Driven (1)**: Partials transformed by waveform harmonic weights before feeding `sampleAdditive`

### Voice Signal Flow (Add Mode)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                      ADD BRANCH                         │
                    │                                                        │
                    │  ┌──────────────┐         ┌─────────────────────┐     │
                    │  │ blendAddOsc  │         │   sampleAdditive    │     │
                    │  │ (wave-centric│         │  (sample-derived)   │     │
                    │  │   additive)  │         │   SineBankNode      │     │
                    │  └──────┬───────┘         └──────────┬──────────┘     │
                    │         │                            │                 │
                    │         │    blendAmount             │                 │
                    │         │ ◄────────────────────────► │                 │
                    │         │                            │                 │
                    │         └──────┬─────────────────────┘                 │
                    │                │                                        │
                    │                ▼ addCrossfade                           │
                    │                │                                        │
                    │         ┌──────┴──────┐                                  │
                    │         │ addCrossfade│◄── depth (blendModAmount)     │
                    │         └──────┬──────┘                                  │
                    │                │                                        │
                    └────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │               CANONICAL MIX BRANCH                      │
                    │                                                        │
                    │   oscillator ──┬── mixCrossfade ──┬── branchMixer     │
                    │   samplePlayback┘                  │                    │
                    │                                    │                    │
                    │                     addBranchGain ◄┘                    │
                    │                     (depth=1 in Add mode)              │
                    └─────────────────────────────────────────────────────────┘
```

---

## Stage Completion Summary

### Stage 1 — Pitch Map Foundation ✅ COMPLETE

| Deliverable | Status |
|-------------|--------|
| Capture-time pitch detection | ✅ Working |
| `pitchMapEnabled` toggle | ✅ UI + param |
| Auto-write `sampleRootNote` | ✅ Working when reliable |
| Note-name display for Root | ✅ Working |

### Stage 2 — Analysis Metadata ✅ FIRST SLICE

| Deliverable | Status |
|-------------|--------|
| `SampleAnalysis` result type | ✅ Implemented |
| Offline sample analyzer | ✅ Implemented |
| Runtime introspection | ✅ `getLatestSampleAnalysis()` |
| Metadata: frequency, note, confidence, stability, RMS, peak, attack, brightness, percussive, reliability | ✅ Live |

### Stage 3 — Partial Extraction ✅ FIRST SLICE

| Deliverable | Status |
|-------------|--------|
| `PartialData` result type | ✅ Implemented |
| `PartialsExtractor` helper | ✅ Implemented |
| Cached on `SampleRegionPlaybackNode` | ✅ Working |
| Runtime introspection | ✅ `getLatestSamplePartials()` |
| DSP integration | ✅ Feeds `SineBankNode` |

### Stage 4 — Additive Synthesis ✅ FIRST SLICE

| Deliverable | Status |
|-------------|--------|
| `SineBankNode` primitive | ✅ Implemented (scalar) |
| Wave-tab procedural Add | ✅ Live (`Standard \| Add`) |
| Add as Blend mode 4 | ✅ Live |
| Two endpoints (Self/Driven) | ✅ Live |
| All additive waveform recipes | ✅ Sine/Saw/Square/Triangle/Blend/Noise/Pulse/SuperSaw |
| `setPartials()` from extracted data | ✅ Working |
| Smooth partial updates | ✅ Working (no hard phase resets) |

---

## Current Guardrails (Temporary)

These are defensive stability measures, not architectural constraints:

| Guardrail | Rationale |
|-----------|-----------|
| Unison/Detune/Spread forced to 1/0/0 in Add mode | DSP stability with additive + voice stacking |
| Drive/Bias/Shape not applied to `sampleAdditive` | Prevents instability in sample-derived additive path |

**Resolution path:** These should be removed once the underlying issues are diagnosed and fixed.

---

## NOT Implemented (Explicitly Deferred)

### SIMD Optimization for SineBankNode
Spec documented SIMD path; intentionally scalar-first. Optimize if profiling shows need.

### Keymapping (Stage 6)
User decision: not currently necessary. Single-sample workflow is sufficient.

### Hybrid Mode
Deferred. Concept was sample + additive layer, but unclear what this contributes beyond Add mode. Table until use case is clearer.

---

## Future Work

**Phase 5A — Morph Mode (NEXT)**
- New blend mode: timbral interpolation between sample partials and wave partials
- Single position parameter: 0=sample, 1=wave
- Harmonics shift, not crossfade
- ~6 days estimated effort

**Phase 5B — Sample Analysis Parameters (DEFERRED)**
- Just expose brightness, inharmonicity, etc. as readable parameters
- No mode needed — just parameter exposure
- ~1 day estimated effort

**Phase 5C — Hybrid Mode**
- Deferred indefinitely — unclear utility

See: `260328_blend_modes_future_work.md`