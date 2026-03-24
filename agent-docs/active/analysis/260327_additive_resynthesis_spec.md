# Additive Resynthesis for Sample-Driven Synthesis

## Status Update (2026-03-24)

This spec describes the full vision for additive resynthesis. The currently implemented state is documented in `IMPLEMENTATION_STATUS.md`.

**What's implemented:**
- Add blend mode (mode 4) with two endpoints: wave-centric (`blendAddOsc`) and sample-derived (`sampleAdditive`)
- `blendAmount` crossfades between endpoints
- `blendModAmount` (depth) controls dry/wet mix against base branch
- `addFlavor`: Self (raw partials) vs Driven (waveform-weighted partials)
- Wave-tab procedural Add via `Standard | Add` render mode
- All additive waveform recipes (Sine/Saw/Square/Triangle/Blend/Noise/Pulse/SuperSaw)

**What's NOT implemented:**
- Morph mode (timbral interpolation) — **next to implement**, see future work doc
- Sample analysis parameters (brightness, etc.) — deferred, just parameter exposure
- Hybrid mode — deferred indefinitely, unclear utility beyond Add mode

**See `260328_blend_modes_future_work.md` for Stage 5 planning.**

---

## Executive Summary

**Goal:** Transform MidiSynth from a subtractive synthesizer with sample playback into a unified sample-synthesis engine where:
1. Captured samples can be analyzed and resynthesized through additive synthesis
2. Analysis data can modulate synthesis parameters
3. Synthesis can modulate sample playback behavior
4. All three sources (oscillator, sample, additive) interweave through the existing blend matrix

**Why Additive Over Subtractive:**
- Subtractive synthesis shapes a harmonically rich source with filters — not ideal for arbitrary timbral content
- Additive synthesis constructs timbre from harmonic partials — can recreate any captured sound
- Enables independent pitch/time manipulation (impossible with samples)
- Enables timbral morphing between sound snapshots
- Enables formant shifting, harmonic stretching, and spectral manipulation

**Key Innovation:** Sample → Analysis → Partials becomes a shared resource for multiple synthesis paths, not just playback.

---

## Current Architecture Analysis

### Existing Voice Architecture

**File:** `UserScripts/projects/Main/dsp/midisynth_integration.lua`

Each voice (8 total) contains:

```
┌────────────────────────────────────────────────────────────────────┐
│                         SINGLE VOICE                                │
│                                                                     │
│  ┌──────────────┐    ┌────────────────────────────────────────┐   │
│  │ Oscillator   │    │           BLEND MATRIX                  │   │
│  │ - waveforms  │    │                                        │   │
│  │ - unison     │    │  ┌──────────┐  ┌──────────┐           │   │
│  │ - detune     │───▶│  │   Mix    │  │  Ring    │           │   │
│  │ - spread     │    │  │ crossfade│  │ Mod A↔B │           │   │
│  │ - sync      │    │  └────┬─────┘  └────┬─────┘           │   │
│  └──────────────┘    │       │             │                  │   │
│                      │  ┌────▼─────┐  ┌────▼─────┐           │   │
│  ┌──────────────┐    │  │   FM     │  │  Sync    │           │   │
│  │ SampleRegion │    │  │ mod/car  │  │ hard sync│           │   │
│  │ Playback     │───▶│  └────┬─────┘  └────┬─────┘           │   │
│  │ - captured   │    │       │             │                  │   │
│  │ - looped     │    │  ┌────▼─────┐  ┌────▼─────┐           │   │
│  │ - stretched  │    │  │   XOR    │  │          │           │   │
│  └──────────────┘    │  │ logic ops│  │          │           │   │
│                      │  └────┬─────┘  └────┬─────┘           │   │
│  ┌──────────────┐    │       │             │                  │   │
│  │ Noise        │    │       └──────┬──────┘                  │   │
│  │ Generator    │───▶│              │                         │   │
│  └──────────────┘    │       ┌──────▼──────┐                  │   │
│                      │       │ Branch Mixer│                  │   │
│                      │       │ (mode select)│                 │   │
│                      │       └──────┬──────┘                  │   │
│                      └──────────────┼──────────────────────────┘   │
│                                     │                              │
│                                     ▼                              │
│                              Voice Output                          │
│                                    │                                │
└────────────────────────────────────┼────────────────────────────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │   8-Voice Mixer       │
                         │ (mix × 8 voices)      │
                         └───────────┬───────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │   SVF → Dist → FX1    │
                         │    → FX2 → EQ8 → Out  │
                         └───────────────────────┘
```

### Blend Modes (Current)

| Mode | Value | Description | Signal Flow |
|------|-------|-------------|-------------|
| Mix | 0 | Crossfade between wave and sample | `wave ─┬─ crossfade ─┬─ out` |
|     |       |                              | `sample─┘             └─` |
| Ring | 1 | Bidirectional ring modulation | `wave modulates sample, sample modulates wave, crossfade between` |
| FM | 2 | Frequency modulation directional | `sample modulates wave frequency (carrier/modulator)` |
| Sync | 3 | Hard sync | `sample output resets oscillator phase` |
| XOR | 4 | Logic operations | `XOR/crush between wave and sample` |

### Oscillator Modes (Current)

| Mode | Value | Description |
|------|-------|-------------|
| Classic | 0 | Standard oscillator with waveforms |
| SampleLoop | 1 | SampleRegionPlayback node |
| Blend | 2 | The blend matrix described above |

**Current DSP is always on the blend path** — UI tabs are view-only, not separate modes. The oscillator is always present, sample is always present, they just feed into different parts of the blend matrix based on `blendMode`.

### Sample Capture System

**Capture Sources:**
- Live input (from audio interface)
- Looper Layer 1-4 (from recorded loops)

**Capture Path:**
```
Source → +12dB Gain → RetrospectiveCapture → Copy to SampleRegionPlayback
```

**Playback Parameters:**
- `playStart` (yellow flag) — where playback begins
- `loopStart` (green flag) — where loop jumps to after loop end
- `loopLen` — determines loop end position
- `crossfade` — boundary crossfade window
- `rootNote` — for pitch tracking
- `retrigger` — restart on note-on

### Existing Infrastructure We Can Use

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| **JUCE SIMDRegister** | `external/JUCE/modules/juce_dsp/containers/juce_SIMDRegister.h` | ✅ Available | SSE/NEON SIMD primitives |
| **PitchDetector (YIN)** | `dsp/core/nodes/PitchDetector.h` | ✅ Solid | Full YIN implementation |
| **SpectrumAnalyzerNode** | `dsp/core/nodes/SpectrumAnalyzerNode.h` | ⚠️ Limited | 8-band split, not full FFT |
| **SampleRegionPlayback** | `dsp/core/nodes/SampleRegionPlaybackNode.h` | ✅ Exists | Captures and plays loops |
| **OscillatorNode** | `dsp/core/nodes/OscillatorNode.h` | ✅ Extended | Live oscillator now supports `Standard | Add` render inside the canonical voice path |
| **FFT (JUCE dsp)** | JUCE modules | ✅ Available | `juce::dsp::FFT` class |

---

## Vision: Unified Sample-Synthesis Engine

### Core Concept

**Analysis is a one-time event, synthesis is real-time.**

When a sample is captured, we extract:
- Harmonic partials (frequencies, amplitudes, phases)
- Temporal envelope (attack, decay, sustain)
- Spectral characteristics (brightness, inharmonicity)

This **partials data** becomes a shared resource that multiple synthesis paths consume.

### Three-Level Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CAPTURE TIME                                     │
│                                                                         │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │   Capture    │    │ PartialsExtractor │    │   Stored Partials   │  │
│  │   Buffer     │───▶│ (FFT + peaks +    │───▶│   .frequencies[1..N]│  │
│  │              │    │  envelope track)   │    │   .amplitudes[1..N] │  │
│  └──────────────┘    └──────────────────┘    │   .phases[1..N]     │  │
│                                               │   .decayRates[1..N] │  │
│                                               │   .fundamental      │  │
│                                               │   .brightness       │  │
│                                               │   .inharmonicity    │  │
│                                               └──────────┬──────────┘  │
│                                                          │              │
└──────────────────────────────────────────────────────────┼──────────────┘
                                                           │
                   ┌───────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        PLAYBACK TIME                                    │
│                                                                         │
│                    ┌─────────────────────────┐                          │
│                    │    Stored Partials      │                          │
│                    │    (per captured sample)│                          │
│                    └────────┬────────────────┘                          │
│                             │                                           │
│         ┌───────────────────┼───────────────────┐                       │
│         │                   │                   │                        │
│         ▼                   ▼                   ▼                        │
│  ┌─────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │   Path A:   │    │    Path B:      │    │    Path C:      │         │
│  │   Additive  │    │    Hybrid       │    │    Analysis-    │         │
│  │   Resynth   │    │    Sample+Add    │    │    Modulated    │         │
│  │             │    │                 │    │                 │         │
│  │ Partials →  │    │ Sample plays   │    │ Analysis data   │         │
│  │ SineBank   │    │ + additive     │    │ modulates:      │         │
│  │             │    │ layer blended  │    │ - osc params   │         │
│  │ Can:        │    │                 │    │ - filter cutoff│         │
│  │ - pitch-    │    │ Can:            │    │ - FX params    │         │
│  │   shift     │    │ - layer partials│    │ - sample regions│        │
│  │ - time-     │    │   under/over    │    │                 │         │
│  │   stretch   │    │   sample        │    │ Sample plays   │         │
│  │ - formant   │    │ - morph between │    │normally, params│         │
│  │   shift     │    │   partial sets  │    │follow analysis │         │
│  │ - morph     │    │ - fill in      │    │                 │         │
│  │   between   │    │   missing lows  │    │                 │         │
│  │   timbres   │    │                 │    │                 │         │
│  └──────┬──────┘    └────────┬────────┘    └────────┬────────┘         │
│         │                    │                      │                   │
│         └────────────────────┼──────────────────────┘                   │
│                              │                                           │
│                              ▼                                           │
│                    ┌─────────────────┐                                  │
│                    │  Extended Blend  │                                  │
│                    │     Matrix       │                                  │
│                    │  (Mix/Ring/FM/  │                                  │
│                    │   Sync/XOR/     │                                  │
│                    │   Additive/     │                                  │
│                    │   Hybrid/Cross) │                                  │
│                    └────────┬────────┘                                  │
│                             │                                            │
│                             ▼                                            │
│                    Voice → Filter → FX → EQ → Out                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### What Each Path Enables

**Path A: Additive Resynthesis**
- Play captured sound as pure sines
- Independent pitch and time (no artifacts)
- Formant shifting (move harmonic ratios)
- Spectral mangling (stretch/compress harmonics)
- Morph between different captured timbres
- No aliasing, perfect time-stretch

**Path B: Hybrid Layering**
- Sample provides core, additive fills in
- Add partials above sample bandwidth
- Smooth out sample discontinuities
- Resonance enhancement
- Layer sampled attack with additive sustain

**Path C: Analysis-Driven Modulation**
- Analysis brightness → filter cutoff
- Analysis inharmonicity → osc detune
- Analysis fundamental → auto-tune osc
- Spectral centroid → sample region selection
- Envelope shape → FX parameters

---

## Current UI Representation Decision

After reviewing the current oscillator UI, additive should be represented in two different places depending on what kind of additive synthesis we mean.

### Procedural additive oscillator = Wave tab
Use the existing Wave tab and keep the waveform dropdown as the spectral recipe selector.

Decision:
- add a compact segmented control to the right of the waveform dropdown: **`Standard | Add`**
- `Standard` = current oscillator render path
- `Add` = render the selected waveform recipe with the additive engine

Why this is better than putting `Additive` into the waveform dropdown:
- the dropdown should keep meaning “which shape / harmonic recipe?”
- the segmented control answers a separate question: “which rendering paradigm?”
- this leaves room for waveform shapes that exist in Add mode but not Standard mode, and vice versa

### Sample-derived additive / resynthesis = Blend tab
This belongs to Blend, not Sample.

Reason:
- Sample tab is capture/admin/root-note management
- sample-derived additive changes how the sample branch participates in synthesis, so it is a Blend concern

Critical correction:
- sample-derived additive should **not** be modeled as a separate post-mix sidecar layer
- it should also **not** be modeled as a second "sample render" selector bolted beside the existing Blend relationship controls
- the correct abstraction is that **Blend modes are relationship families**, and the Blend amount remains the **direction/polarity** control inside each family
- therefore additive belongs as an **`Add` Blend family**, with a wave-centric endpoint on one side and a sample-centric endpoint on the other

### Wave-shape support decision (updated)
The earlier plan assumed some shapes might need to be greyed out in `Add` mode.
That is no longer the current product direction.

Current implemented decision:
- keep all existing Wave-tab shapes available in `Add`
- provide honest first-pass additive recipes for: Sine, Saw, Square, Triangle, Blend, Noise, Pulse, and SuperSaw
- if any individual recipe later proves dishonest or too expensive, explicitly disable that one rather than pretending the mode is broader than it really is

### Product implication
There is one shared additive renderer in DSP, but two UI paradigms:
- procedural additive in Wave
- sample-derived additive / hybrid in Blend

### Current implemented status (live Wave/Add slice)
The following work is now complete in the live product path.

#### DSP / voice architecture
- the failed "second live branch" additive experiment was removed from the production voice graph
- the canonical oscillator branch was restored so startup no longer produces loud full-scale noise
- live procedural additive now runs **inside `OscillatorNode`** as an alternate render mode, not as a separate graph source
- `OscillatorNode` now supports `Standard | Add` rendering while preserving the shared oscillator control path:
  - drive
  - drive shape
  - bias
  - pulse width
  - unison
  - detune
  - spread
  - sync
- render-mode transitions are smoothed so switching `Standard ↔ Add` does not hard-step the output

#### Additive recipe coverage
- all existing Wave-tab waveform families have a first-pass additive implementation:
  - Sine
  - Saw
  - Square
  - Triangle
  - Blend
  - Noise
  - Pulse
  - SuperSaw
- additive spectral shaping controls are implemented in DSP:
  - `Parts`
  - `Tilt`
  - `Drift`
- those controls are exposed as real parameters and persist with runtime state

#### UI / product slice
- the Wave tab now exposes a compact **`Std | Add`** segmented control next to the waveform dropdown
- Add-specific controls are now present in the Wave tab:
  - non-pulse Add: `Parts` full-width row, then `Tilt | Drift`
  - pulse Add: `Width | Parts` on the first row, `Tilt | Drift` on the second row
- the drive curve, drive dropdown, Drive slider, and Bias slider remain directly grouped as the distortion cluster to the right of the curve view
- the graph preview reflects Add mode without hiding the rest of the oscillator UI

#### Stability / performance / retained rendering fixes
- Add-mode preview churn in Lua was reduced by caching additive preview recipes and detune ratios
- Add-mode preview point density is capped so the UI stays responsive during interaction
- Wave-tab retained widgets now get explicit refresh + repaint + deferred-flush handling when waveform/render-mode layout changes occur
- this fixes the visible "wrong until hover" bug on initial load and on Saw/Pulse or Std/Add layout swaps

#### Validation status
- standalone launches cleanly with the live additive path enabled
- `Standard | Add` switching works in the running app
- startup-noise regression from the earlier branch-swapped approach is gone
- user validation confirmed:
  - Add mode produces distinct tones
  - the UI remains usable after the performance/retained-layout fixes

#### Important boundary
- `SineBankNode` still matters as the Stage 4 offline / deterministic / sample-derived additive path
- but the currently shipped **Wave-tab Add mode is not powered by `SineBankNode`**
- it is powered by the in-node procedural additive renderer inside `OscillatorNode`

### Immediate next steps
1. freeze the live Wave/Add slice except for bugfixes and final voicing tweaks
   - keep `Standard | Add` stable
   - only touch layout/perf/voicing when a concrete regression is found
2. treat sample-derived additive as a **true Blend family**, not as an extra layer bolted on top of Mix
   - the Blend mode dropdown should include **`Add`**
   - the Blend amount must remain the directional/polarity control inside that family
3. implement the first honest Add-family semantics
   - one endpoint is more wave-centric additive behavior
   - the other endpoint is more sample-centric additive behavior driven by extracted partials
   - waveform choice should continue to matter on the wave-centric side
4. keep validating `SineBankNode` and partial-driven rendering against the canonical Blend semantics rather than against a sidecar layering hack

---

## Technical Requirements

### 1. PartialsExtractor (Analysis)

**Location:** `dsp/core/nodes/PartialsExtractor.h`

**Purpose:** Analyze captured sample buffer to extract harmonic partials.

**Current implementation status (2026-03-28):**
- first Stage 3 slice is now implemented
- `PartialData` exists as a project-owned cached result type
- `PartialsExtractor` exists as an offline helper
- `SampleRegionPlaybackNode` can extract/cache current-sample partials
- control/DSP runtime introspection can query the latest partials
- this is a sane first pass, not the final quality bar for additive resynthesis yet

```cpp
#pragma once

#include <cmath>
#include <vector>
#include <array>
#include <algorithm>
#include <juce_dsp/juce_dsp.h>

namespace dsp_primitives {

/**
 * Represents extracted partials from a sample analysis.
 * This data is used for additive resynthesis and cross-modulation.
 */
struct PartialData {
    static constexpr int MAX_PARTIALS = 32;
    
    // Per-partial data
    float frequencies[MAX_PARTIALS] = {0};   // Hz
    float amplitudes[MAX_PARTIALS] = {0};    // Linear 0-1
    float phases[MAX_PARTIALS] = {0};        // Radians
    float decayRates[MAX_PARTIALS] = {0};    // Seconds to -60dB
    
    // Derived metrics
    int activeCount = 0;                     // How many partials are valid
    float fundamental = 0.0f;                // Detected fundamental frequency
    float inharmonicity = 0.0f;              // How much deviation from harmonic series (0-1)
    float brightness = 0.0f;                 // Spectral centroid normalized (0-1)
    float rmsLevel = 0.0f;                   // Overall RMS of analyzed region
    
    // Envelope characteristics
    float attackTime_ms = 0.0f;              // Attack duration
    float decayTime_ms = 0.0f;              // Decay duration
    float sustainLevel = 0.0f;              // Sustain level (0-1)
    float releaseTime_ms = 0.0f;            // Release duration
    
    // Metadata
    double sampleRate = 44100.0;
    int analysisStartSample = 0;
    int analysisEndSample = 0;
    bool isPercussive = false;
};

/**
 * Extracts harmonic partials from audio samples using FFT analysis.
 * Designed for offline analysis of captured samples (not real-time).
 */
class PartialsExtractor {
public:
    PartialsExtractor();
    ~PartialsExtractor() = default;
    
    // Configuration
    void setSampleRate(double sampleRate);
    void setMaxPartials(int count);           // 1-32, default 8
    void setMinAmplitudeDb(float thresholdDb); // Ignore partials below this, default -60
    void setAnalysisWindowMs(float ms);       // FFT window size, default 50ms
    void setHopRatio(float ratio);            // Hop size as ratio of window, default 0.25
    
    /**
     * Analyze a mono sample buffer and extract partials.
     * Call this when a sample is captured.
     * 
     * @param samples Interleaved or mono audio samples
     * @param numSamples Number of samples in buffer
     * @param channel Channel to analyze (for interleaved), default 0
     * @param stride Sample stride (1 for mono, numChannels for interleaved)
     * @return PartialData with extracted partials and metadata
     */
    PartialData analyze(const float* samples, int numSamples, 
                        int channel = 0, int stride = 1);
    
    /**
     * Analyze from juce::AudioBuffer.
     */
    PartialData analyze(const juce::AudioBuffer<float>& buffer, int channel = 0);
    
    /**
     * Transient analysis - find attack region boundaries.
     * @return Sample index where steady-state begins
     */
    int findAttackEnd(const float* samples, int numSamples);
    
    /**
     * Decay analysis - measure how partials decay over time.
     * Fills in decayRates[] in PartialData.
     */
    void analyzeDecay(PartialData& data, const float* samples, int numSamples);
    
private:
    // Internal analysis stages
    void computeFFT(const float* windowedSamples, int numSamples);
    void findPeaks(int numBins);
    void trackPartialsOverTime(const float* samples, int numSamples);
    float estimateFundamental(const float* samples, int numSamples);
    void computeDerivedMetrics(PartialData& data);
    
    // YIN pitch detection (reuse existing PitchDetector)
    std::unique_ptr<class PitchDetector> pitchDetector_;
    
    // FFT configuration
    std::unique_ptr<juce::dsp::FFT> fft_;
    int fftSize_ = 4096;
    int hopSize_ = 1024;
    
    // Analysis parameters
    double sampleRate_ = 44100.0;
    int maxPartials_ = 8;
    float minAmplitudeDb_ = -60.0f;
    
    // Working buffers
    std::vector<float> fftInput_;
    std::vector<std::complex<float>> fftOutput_;
    std::vector<float> magnitudeBuffer_;
    std::vector<float> phaseBuffer_;
};

} // namespace dsp_primitives
```

**Implementation Sketch:**

```cpp
PartialData PartialsExtractor::analyze(const float* samples, int numSamples,
                                        int channel, int stride) {
    PartialData result;
    result.sampleRate = sampleRate_;
    
    if (numSamples < fftSize_) {
        return result; // Not enough samples
    }
    
    // 1. Estimate fundamental frequency using YIN
    result.fundamental = estimateFundamental(samples, numSamples);
    
    // 2. Find attack region (for envelope analysis)
    result.analysisStartSample = findAttackEnd(samples, numSamples);
    result.isPercussive = (result.analysisStartSample < sampleRate_ * 0.01f);
    
    // 3. Window and FFT for initial spectrum
    int analysisStart = result.analysisStartSample;
    int analysisLength = std::min(fftSize_, numSamples - analysisStart);
    
    // Apply Hann window
    fftInput_.resize(fftSize_);
    for (int i = 0; i < fftSize_; ++i) {
        int srcIdx = (i < analysisLength) ? (analysisStart + i) * stride + channel : 0;
        float sample = (i < analysisLength) ? samples[srcIdx] : 0.0f;
        float window = 0.5f * (1.0f - cosf(2.0f * M_PI * i / (fftSize_ - 1)));
        fftInput_[i] = sample * window;
    }
    
    // Real FFT
    fft_->performRealForwardTransform(fftInput_.data());
    
    // Convert to magnitude/phase
    magnitudeBuffer_.resize(fftSize_ / 2 + 1);
    phaseBuffer_.resize(fftSize_ / 2 + 1);
    for (int i = 0; i <= fftSize_ / 2; ++i) {
        float re = fftInput_[i * 2];
        float im = (i < fftSize_ / 2) ? fftInput_[i * 2 + 1] : 0.0f;
        magnitudeBuffer_[i] = sqrtf(re * re + im * im) / fftSize_;
        phaseBuffer_[i] = atan2f(im, re);
    }
    
    // 4. Find peaks (local maxima above threshold)
    findPeaks(fftSize_ / 2 + 1);
    
    // 5. Convert peaks to partials
    float thresholdLin = powf(10.0f, minAmplitudeDb_ / 20.0f);
    float maxMag = *std::max_element(magnitudeBuffer_.begin(), magnitudeBuffer_.end());
    
    int partialIdx = 0;
    for (int i = 1; i < (int)magnitudeBuffer_.size() && partialIdx < maxPartials_; ++i) {
        if (magnitudeBuffer_[i] > thresholdLin * maxMag &&
            magnitudeBuffer_[i] > magnitudeBuffer_[i-1] &&
            (i == (int)magnitudeBuffer_.size() - 1 || magnitudeBuffer_[i] > magnitudeBuffer_[i+1])) {
            
            // Parabolic interpolation for sub-bin frequency
            float alpha = magnitudeBuffer_[i - 1];
            float beta = magnitudeBuffer_[i];
            float gamma = magnitudeBuffer_[i + 1];
            float p = 0.5f * (alpha - gamma) / (alpha - 2.0f * beta + gamma + 1e-10f);
            float peakBin = i + p;
            
            // Convert to frequency
            result.frequencies[partialIdx] = peakBin * sampleRate_ / fftSize_;
            
            // Amplitude
            result.amplitudes[partialIdx] = magnitudeBuffer_[i];
            
            // Phase (linear interpolation)
            result.phases[partialIdx] = phaseBuffer_[i] + p * (phaseBuffer_[i+1] - phaseBuffer_[i]);
            
            partialIdx++;
        }
    }
    
    result.activeCount = partialIdx;
    
    // 6. Analyze decay rates (multi-window)
    analyzeDecay(result, samples, numSamples);
    
    // 7. Compute derived metrics
    computeDerivedMetrics(result);
    
    return result;
}

void PartialsExtractor::computeDerivedMetrics(PartialData& data) {
    if (data.activeCount == 0) return;
    
    // Brightness: spectral centroid normalized 0-1
    float weightedSum = 0.0f;
    float weightSum = 0.0f;
    for (int i = 0; i < data.activeCount; ++i) {
        weightedSum += data.frequencies[i] * data.amplitudes[i];
        weightSum += data.amplitudes[i];
    }
    float centroid = (weightSum > 0) ? weightedSum / weightSum : 0.0f;
    // Normalize: map 100Hz-5000Hz to 0-1
    data.brightness = std::clamp((centroid - 100.0f) / 4900.0f, 0.0f, 1.0f);
    
    // Inharmonicity: deviation from harmonic series
    if (data.fundamental > 0) {
        float totalDeviation = 0.0f;
        for (int i = 0; i < data.activeCount; ++i) {
            int harmonic = std::round(data.frequencies[i] / data.fundamental);
            float expected = data.fundamental * harmonic;
            float deviation = std::abs(data.frequencies[i] - expected) / data.fundamental;
            totalDeviation += deviation * data.amplitudes[i];
        }
        data.inharmonicity = std::clamp(totalDeviation / weightSum, 0.0f, 1.0f);
    }
}
```

### 2. SineBankNode (SIMD-Optimized Additive Synthesis)

**Location:** `dsp/core/nodes/SineBankNode.h`

**Purpose:** Efficiently generate multiple sine waves in parallel for additive synthesis.

**Current implementation status (2026-03-28):**
- first Stage 4 slice is now implemented
- `SineBankNode` exists as a real additive renderer
- the first pass is intentionally scalar/simple, not SIMD-optimized yet
- it is already proven in a deterministic IPC round-trip test:
  - inject known harmonic sample
  - extract partials
  - render them back through `SineBankNode`
  - re-analyze the rendered result
- this proves the analysis→partials→additive-render path is real before product/UI integration

```cpp
#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include "PartialData.h"
#include <array>
#include <atomic>
#include <juce_dsp/juce_dsp.h>

namespace dsp_primitives {

/**
 * SIMD-optimized additive synthesis node.
 * Generates multiple sine partials from a PartialData specification.
 * 
 * Design goals:
 * - Efficient for 8-32 partials
 * - SIMD-optimized (SSE/NEON)
 * - Real-time partial updates
 * - Morphing between partial states
 */
class SineBankNode : public IPrimitiveNode,
                     public std::enable_shared_from_this<SineBankNode> {
public:
    static constexpr int MAX_PARTIALS = 32;
    static constexpr int SIMD_WIDTH = 4;  // SSE processes 4 floats at once
    
    SineBankNode();
    
    const char* getNodeType() const override { return "SineBank"; }
    int getNumInputs() const override { return 1; }  // Optional mod input
    int getNumOutputs() const override { return 1; } // Stereo out (bus 0/1)
    
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    
    // ========================================
    // Configuration
    // ========================================
    
    void setMaxPartials(int count);
    int getMaxPartials() const { return maxPartials_.load(); }
    
    void setFrequency(float freq);  // Fundamental frequency
    float getFrequency() const { return targetFrequency_.load(); }
    
    void setAmplitude(float amp);
    float getAmplitude() const { return targetAmplitude_.load(); }
    
    // ========================================
    // Per-Partial Control
    // ========================================
    
    void setPartialFrequency(int index, float freq);
    void setPartialAmplitude(int index, float amp);
    void setPartialPhase(int index, float phaseRadians);
    void setPartialDecay(int index, float decaySeconds);
    
    float getPartialFrequency(int index) const;
    float getPartialAmplitude(int index) const;
    
    // ========================================
    // Bulk Operations (efficient)
    // ========================================
    
    /**
     * Set all partials from a PartialData struct.
     * Most efficient way to update the entire bank.
     */
    void setFromPartials(const PartialData& data);
    
    /**
     * Set frequencies relative to a fundamental.
     * frequencies[0..n-1] should be multipliers (e.g., 1, 2, 3, 4...).
     */
    void setHarmonicSeries(float fundamental, const float* multipliers, 
                           const float* amplitudes, int count);
    
    /**
     * Morph from current state toward a target state over time.
     * Useful for smooth transitions between timbres.
     */
    void morphTo(const PartialData& target, float durationMs);
    
    /**
     * Apply pitch shift to all partials (semitones).
     * Maintains harmonic relationships.
     */
    void setPitchShift(float semitones);
    
    /**
     * Apply formant shift (stretches harmonic ratios).
     * Changes timbre without changing fundamental.
     */
    void setFormantShift(float shift);
    
private:
    // SIMD processing routines
    void processBlockScalar(float* left, float* right, int numSamples);
    void processBlockSIMD(float* left, float* right, int numSamples);
    
    // Fast sine approximation (polynomial, SIMD-friendly)
    static juce::SIMDRegister<float> fastSinSIMD(juce::SIMDRegister<float> x);
    static float fastSinScalar(float x);
    
    // Phase accumulation
    void advancePhases(int numSamples);
    
    // Per-partial state
    struct alignas(16) PartialState {
        float frequency;      // Target frequency (Hz)
        float amplitude;      // Target amplitude (0-1)
        float phase;          // Current phase (radians)
        float phaseIncrement; // Per-sample increment
        float currentFreq;    // Smoothed frequency
        float currentAmp;     // Smoothed amplitude
        float decayRate;      // Decay time constant
    };
    
    std::array<PartialState, MAX_PARTIALS> partials_;
    std::atomic<int> activePartials_{8};
    std::atomic<int> maxPartials_{32};
    
    // Global state
    std::atomic<float> targetFrequency_{220.0f};
    std::atomic<float> targetAmplitude_{0.5f};
    std::atomic<float> pitchShift_{0.0f};    // Semitones
    std::atomic<float> formantShift_{1.0f};  // Ratio
    
    // Morphing state
    std::atomic<bool> isMorphing_{false};
    std::array<PartialState, MAX_PARTIALS> morphTarget_;
    std::atomic<int> morphRemaining_{0};
    float morphRate_ = 0.0f;
    
    // Smoothing coefficients
    float freqSmoothCoeff_ = 0.0f;
    float ampSmoothCoeff_ = 0.0f;
    
    double sampleRate_ = 44100.0;
    bool simdEnabled_ = true;
};

} // namespace dsp_primitives
```

**SIMD Implementation:**

```cpp
void SineBankNode::processBlockSIMD(float* left, float* right, int numSamples) {
    using SIMD = juce::SIMDRegister<float>;
    
    // Clear output
    std::fill(left, left + numSamples, 0.0f);
    std::fill(right, right + numSamples, 0.0f);
    
    const int active = activePartials_.load();
    const float fundamental = targetFrequency_.load();
    const float masterAmp = targetAmplitude_.load();
    const float pitchMult = powf(2.0f, pitchShift_.load() / 12.0f);
    const float formantShift = formantShift_.load();
    
    // Process partials in groups of 4 (SIMD_WIDTH)
    for (int p = 0; p < active; p += SIMD_WIDTH) {
        // Load 4 partials' state
        alignas(16) float freqs[SIMD_WIDTH];
        alignas(16) float amps[SIMD_WIDTH];
        alignas(16) float phases[SIMD_WIDTH];
        alignas(16) float incrs[SIMD_WIDTH];
        
        for (int j = 0; j < SIMD_WIDTH && (p + j) < active; ++j) {
            auto& partial = partials_[p + j];
            
            // Apply formant shift to frequency ratio
            float harmonic = partial.frequency / 220.0f;  // Assume base freq
            harmonic = powf(harmonic, formantShift);
            freqs[j] = partial.currentFreq * pitchMult;
            amps[j] = partial.currentAmp;
            phases[j] = partial.phase;
            incrs[j] = partial.phaseIncrement * pitchMult;
        }
        
        auto vPhases = SIMD::fromFloatArray(phases);
        auto vIncrs = SIMD::fromFloatArray(incrs);
        auto vAmps = SIMD::fromFloatArray(amps);
        
        // Process samples
        for (int i = 0; i < numSamples; ++i) {
            // Compute 4 sines simultaneously using polynomial approximation
            auto vSines = fastSinSIMD(vPhases);
            auto vSamples = vAmps * vSines;
            
            // Sum into output (horizontal sum of SIMD register)
            float samples[SIMD_WIDTH];
            vSamples.copyTo(samples);
            for (int j = 0; j < SIMD_WIDTH && (p + j) < active; ++j) {
                left[i] += samples[j];
                right[i] += samples[j];  // Mono for now, could do stereo spread
            }
            
            // Advance phases
            vPhases = vPhases + vIncrs;
        }
        
        // Store back phases
        vPhases.copyTo(phases);
        for (int j = 0; j < SIMD_WIDTH && (p + j) < active; ++j) {
            partials_[p + j].phase = phases[j];
            // Wrap phase
            while (partials_[p + j].phase > 2.0f * M_PI) {
                partials_[p + j].phase -= 2.0f * M_PI;
            }
        }
    }
    
    // Apply master amplitude
    for (int i = 0; i < numSamples; ++i) {
        left[i] *= masterAmp;
        right[i] *= masterAmp;
    }
}

// Fast polynomial sine approximation for SIMD
// Maximum error ~0.0005, much faster than std::sin
juce::SIMDRegister<float> SineBankNode::fastSinSIMD(juce::SIMDRegister<float> x) {
    using SIMD = juce::SIMDRegister<float>;
    
    // Wrap to 0-2π
    auto twoPi = SIMD::expand(2.0f * M_PI);
    x = x - (x / twoPi) * twoPi;
    
    // Fold to 0-π
    auto pi = SIMD::expand(M_PI);
    auto negOne = SIMD::expand(-1.0f);
    auto mask = x > pi;
    x = SIMD::select(mask, twoPi - x, x);
    
    // Polynomial approximation sin(x) ≈ x - x³/6 + x⁵/120
    // For better accuracy, use more terms or different polynomial
    auto x2 = x * x;
    auto x3 = x2 * x;
    auto x5 = x3 * x2;
    
    return x - x3 * SIMD::expand(1.0f/6.0f) + x5 * SIMD::expand(1.0f/120.0f);
}

void SineBankNode::setFromPartials(const PartialData& data) {
    const int count = std::min((int)data.activeCount, maxPartials_.load());
    activePartials_.store(count);
    
    const float pitchMult = powf(2.0f, pitchShift_.load() / 12.0f);
    
    for (int i = 0; i < count; ++i) {
        partials_[i].frequency = data.frequencies[i];
        partials_[i].amplitude = data.amplitudes[i];
        partials_[i].phase = data.phases[i];
        partials_[i].decayRate = data.decayRates[i];
        partials_[i].currentFreq = data.frequencies[i] * pitchMult;
        partials_[i].currentAmp = data.amplitudes[i];
        partials_[i].phaseIncrement = 2.0f * M_PI * partials_[i].currentFreq / sampleRate_;
    }
    
    // Clear unused partials
    for (int i = count; i < MAX_PARTIALS; ++i) {
        partials_[i].amplitude = 0.0f;
        partials_[i].currentAmp = 0.0f;
    }
}
```

### 3. Voice Architecture Extension

**File:** `UserScripts/projects/Main/dsp/midisynth_integration.lua`

Add SineBankNode to each voice, alongside oscillator:

```lua
-- New mode constant
local OSC_MODE_ADDITIVE = 3  -- After CLASSIC(0), SAMPLE_LOOP(1), BLEND(2)

-- In voice construction
for i = 1, VOICE_COUNT do
    -- Existing oscillator
    local osc = ctx.primitives.OscillatorNode.new()
    
    -- NEW: Additive sine bank
    local sinebank = ctx.primitives.SineBankNode.new()
    sinebank:setMaxPartials(8)
    sinebank:setAmplitude(0.0)  -- Start silent
    
    -- NEW: Analysis storage
    local storedPartials = nil
    
    -- ... noise, sample playback, etc ...
    
    voices[i] = {
        osc = osc,
        sinebank = sinebank,           -- NEW
        storedPartials = storedPartials, -- NEW
        -- ... rest of voice
    }
end
```

### 4. Analysis Integration

**When sample captured, analyze immediately:**

```lua
-- In sample capture logic
function onSampleCaptured(sourceId, captureBuffer, numSamples)
    -- Existing: copy to SampleRegionPlayback
    for i, voice in ipairs(voices) do
        voice.samplePlayback:setBuffer(captureBuffer, numSamples)
    end
    
    -- NEW: Extract partials
    local extractor = ctx.primitives.PartialsExtractor.new()
    extractor:setMaxPartials(8)
    extractor:setSampleRate(sampleRate)
    
    local partials = extractor:analyze(captureBuffer, numSamples)
    
    -- Store for later use
    storedPartials = {
        frequencies = {},
        amplitudes = {},
        phases = {},
        activeCount = partials.activeCount,
        fundamental = partials.fundamental,
        brightness = partials.brightness,
        inharmonicity = partials.inharmonicity,
    }
    
    for j = 1, partials.activeCount do
        storedPartials.frequencies[j] = partials.frequencies[j-1]  -- Lua is 1-indexed
        storedPartials.amplitudes[j] = partials.amplitudes[j-1]
        storedPartials.phases[j] = partials.phases[j-1]
    end
end
```

### 5. OSC Parameter Paths

```lua
-- New OSC paths for additive control
PATHS.additivePartialCount = "/midi/synth/additive/partialCount"
PATHS.additiveFundamental = "/midi/synth/additive/fundamental"

-- Per-partial paths
PATHS.additivePartialFreq = "/midi/synth/additive/partial/%d/freq"
PATHS.additivePartialAmp = "/midi/synth/additive/partial/%d/amp"
PATHS.additivePartialPhase = "/midi/synth/additive/partial/%d/phase"
PATHS.additivePartialDecay = "/midi/synth/additive/partial/%d/decay"

-- Morphing
PATHS.additiveMorphPosition = "/midi/synth/additive/morphPosition"
PATHS.additiveMorphTime = "/midi/synth/additive/morphTime"

-- Formant/pitch shift
PATHS.additivePitchShift = "/midi/synth/additive/pitchShift"
PATHS.additiveFormantShift = "/midi/synth/additive/formantShift"
```

---

## Integration Points with Blend Modes

### Extended Blend Mode Matrix

| Mode | Value | Sources | Modulation |
|------|-------|---------|------------|
| Mix | 0 | wave ↔ sample | Crossfade |
| Ring | 1 | wave ↔ sample | Bidirectional ring mod |
| FM | 2 | sample modulates wave | Frequency modulation |
| Sync | 3 | sample → osc | Hard sync |
| XOR | 4 | wave XOR sample | Logic operations |
| **Additive** | 5 | partials → sines | Pure resynthesis |
| **Hybrid** | 6 | sample + additive | Layer with blend |
| **CrossSynth** | 7 | analysis → osc | Analysis modulates osc |
| **Morph** | 8 | partials₁ ↔ partials₂ | Timbral morphing |

### Additive Mode (5)

Pure additive resynthesis. Sample playback stops, SineBank plays partials.

```lua
if oscMode == OSC_MODE_ADDITIVE then
    -- Mute sample and osc
    voice.sampleGain:setGain(0.0)
    voice.osc:setAmplitude(0.0)
    voice.noiseGain:setGain(0.0)
    
    -- SineBank active
    voice.sinebank:setFromPartials(storedPartials)
    voice.sinebank:setAmplitude(voice.targetAmp)
    voice.sinebank:setFrequency(voice.freq)
    
    -- Output directly to voice mixer
    ctx.graph.connect(voice.sinebank, voice.voiceMix, 0, 6)
end
```

### Hybrid Mode (6)

Sample plays normally, additive layer fills in/enhances.

```lua
if oscMode == OSC_MODE_HYBRID then
    -- Sample plays
    voice.sampleGain:setGain(blendAmount)
    
    -- Additive adds partials (can fill in missing harmonics)
    voice.sinebank:setFromPartials(storedPartials)
    voice.sinebank:setAmplitude(voice.targetAmp * (1.0 - blendAmount))
    
    -- Mix through blend crossfade
    ctx.graph.connect(voice.sinebank, voice.mixCrossfade, 0, 2)
end
```

### CrossSynth Mode (7)

Analysis data modulates synthesis parameters. Sample drives synthesis behavior.

```lua
if oscMode == OSC_MODE_CROSSSYNTH then
    -- Use analysis data to modulate osc
    if storedPartials then
        -- Brightness affects filter
        local cutoff = lerp(200, 8000, storedPartials.brightness)
        filt:setCutoff(cutoff)
        
        -- Inharmonicity affects detune
        voice.osc:setDetune(storedPartials.inharmonicity * 50)  -- cents
        
        -- Fundamental can tune the oscillator
        voice.osc:setFrequency(storedPartials.fundamental)
        
        -- Amplitudes could affect unison spread
        voice.osc:setSpread(storedPartials.brightness)  -- Bright = wider
    end
    
    -- Sample still plays
    voice.sampleGain:setGain(0.5)
end
```

### Morph Mode (8)

Timbral morphing between two captured samples.

```lua
-- Capture two samples
sample1 = capture()
partials1 = analyze(sample1)

-- Later, capture second sample
sample2 = capture()
partials2 = analyze(sample2)

-- Morph between them
function setMorphPosition(pos)
    -- pos = 0 → partials1, pos = 1 → partials2, pos = 0.5 → blend
    for i = 1, activePartials do
        local freq = lerp(partials1.frequencies[i], partials2.frequencies[i], pos)
        local amp = lerp(partials1.amplitudes[i], partials2.amplitudes[i], pos)
        voice.sinebank:setPartial(i-1, freq, amp)
    end
end
```

---

## Cross-Modulation Capabilities

### Sample Analysis Modulating Synthesis

| Analysis Metric | Can Modulate | Effect |
|-----------------|--------------|--------|
| `fundamental` | Oscillator frequency | Auto-tune to sample pitch |
| `brightness` | Filter cutoff | Dark samples → lowpass, bright → open |
| `inharmonicity` | Osc detune/spread | Inharmonic samples → wider unison |
| `attackTime_ms` | Amp envelope attack | Match envelope to sample |
| `decayRates[]` | Per-partial envelope | Shape osc filter envelope |
| `rmsLevel` | Master gain | Normalize to sample level |

Implementation:

```lua
-- In analysis modulation code
function applyAnalysisToSynth(partials, osc, filter, voice)
    -- Auto-tune oscillator to captured fundamental
    local midiNote = frequencyToMidi(partials.fundamental)
    voice.targetFreq = partials.fundamental
    
    -- Brightness → filter cutoff
    local cutoffMin = 200
    local cutoffMax = 12000
    local cutoff = lerp(cutoffMin, cutoffMax, partials.brightness)
    filter:setCutoff(cutoff)
    
    -- Inharmonicity → unison detune
    local detune = partials.inharmonicity * 50  -- 0-50 cents
    osc:setDetune(detune)
    
    -- Attack time → envelope attack
    local attackMs = partials.attackTime_ms
    voice.envelope:setAttack(attackMs / 1000.0)
end
```

### Synthesis Modulating Sample Playback

| Synthesis Parameter | Can Affect | Effect |
|---------------------|-----------|--------|
| Additive envelope | Sample amplitude envelope | Sample follows additive shape |
| Partial brightness | Sample playback region | Bright → attack region, dark → sustain |
| Fundamental frequency | Sample playback speed | Pitch tracking |
| Amplitude sum | Sample level ducking | Dynamic ducking |

```lua
-- Synthesis affects sample playback
function applySynthToSample(sinebank, samplePlayback, partials)
    -- Use additive amplitude envelope to duck sample
    -- (e.g., during attacks, sample is quieter)
    local attackGain = 1.0 - sinebank:getAttackEnvelope()
    samplePlayback:setGain(attackGain)
    
    -- Use brightest partial position to select sample region
    local brightestPartial = findBrightest(partials)
    local freq = partials.frequencies[brightestPartial]
    -- Higher freq → earlier in sample (attack region)
    local position = 1.0 - (freq / partials.fundamental / 8.0)
    position = clamp(position, 0, 1)
    samplePlayback:setPlayStart(position * totalSamples)
end
```

---

## Implementation Phases

### Phase 1: Infrastructure (Week 1-2)

**Goal:** Core DSP nodes without full integration.

| Task | Description | Effort |
|------|-------------|--------|
| PartialsExtractor.h | Header + basic FFT analysis | 2 days |
| PartialsExtractor.cpp | Peak detection, partial extraction | 2 days |
| SineBankNode.h | Header + scalar implementation | 1 day |
| SineBankNode.cpp | SIMD optimization | 2 days |
| Unit tests | Analysis accuracy, synthesis quality | 1 day |

**Deliverables:**
- `PartialsExtractor` can analyze a buffer and return `PartialData`
- `SineBankNode` can play partials with SIMD optimization
- Basic tests pass

### Phase 2: Lua Binding (Week 3)

**Goal:** Expose to scripting layer.

| Task | Description | Effort |
|------|-------------|--------|
| PartialsExtractor bindings | Lua wrapper in DSPPluginScriptHost | 1 day |
| SineBankNode bindings | Lua wrapper + parameter OSC paths | 1 day |
| Integration test | Lua-side analysis → synthesis | 2 days |
| OSC paths | Register all new paths | 1 day |

**Deliverables:**
- Can call `ctx.primitives.PartialsExtractor.new()` from Lua
- Can call `ctx.primitives.SineBankNode.new()` from Lua
- New OSC paths respond to queries

### Phase 3: Mode Integration (Week 4)

**Goal:** Additive mode works as new oscMode.

| Task | Description | Effort |
|------|-------------|--------|
| Voice construction | Add SineBank to each voice | 1 day |
| Mode switching | Handle OSC_MODE_ADDITIVE | 1 day |
| Sample capture hook | Analyze on capture | 1 day |
| Partials storage | Persist partials per capture | 1 day |
| Playability | Test polyphony, CPU usage | 1 day |

**Deliverables:**
- `oscMode = 3` engages additive synthesis
- Capturing a sample triggers analysis
- Playing notes resynthesizes from partials

### Phase 4: Cross-Modulation (Week 5)

**Goal:** Analysis-modulates-synthesis works.

| Task | Description | Effort |
|------|-------------|--------|
| Analysis → Osc | fundamental/brightness → osc/filter | 1 day |
| Analysis → Sample | metrics → playback params | 1 day |
| New mode `CrossSynth` | Wire up analysis-driven modulation | 2 days |
| Testing | Verify audible effect | 1 day |

**Deliverables:**
- Capturing a sample affects oscillator behavior
- `oscMode = 7` engages cross-synthesis

### Phase 5: Hybrid & Morphing (Week 6)

**Goal:** Sample + additive blending and timbral morphing.

| Task | Description | Effort |
|------|-------------|--------|
| Hybrid mode `oscMode = 6` | Sample + additive layer | 1 day |
| Morph mode `oscMode = 8` | Morph between partials1/2 | 2 days |
| Smooth morphing | Crossfade over time | 1 day |
| UI consideration | Morph position parameter | 1 day |

**Deliverables:**
- Can blend sample and additive
- Can morph between two captured timbres

### Phase 6: Polish & Optimization (Week 7)

**Goal:** Production-ready.

| Task | Description | Effort |
|------|-------------|--------|
| CPU optimization | Profile and optimize hot paths | 2 days |
| Memory management | Reduce allocations | 1 day |
| Latency testing | Measure analysis→synthesis latency | 1 day |
| Edge cases | Percussive, transient, noisy samples | 1 day |

---

## Innovation Opportunities

### 1. Independent Pitch and Time

The killer feature of additive resynthesis:

```lua
-- Sample: A🎵—————B (pitch A→B, time fixed)
-- Additive: Can shift pitch independently from time

-- Shift pitch up 12 semitones, time unchanged
sinebank:setPitchShift(12)  -- All partials ×2
-- Time stays the same because it's synthesized, not played back

-- Shift time independently
notesustain = 2.0  -- Sustain for 2 seconds, no pitch change
-- Only amplitude envelope changes, not frequencies
```

**What this enables:**
- Sampler that doesn't chipmunk when pitched
- Time-stretch without artifacts
- Formant-preserving pitch shift

### 2. Formant Shifting

```lua
-- Normal harmonics: 1×, 2×, 3×, 4×...
-- Formant shifted: 1×, 1.5×, 2×, 2.5×... (stretched)

-- This changes perceived vowel/timbre without changing pitch
sinebank:setFormantShift(1.5)  -- Stretch ratios by 1.5×

-- Can make a male voice sound female, or vice versa
-- Can morph between vowel sounds
```

### 3. Timbral Morphing

```lua
-- Capture two different sounds
partial1 = analyze(kick_sample)
partial2 = analyze(bell_sample)

-- Morph between them
-- This creates sounds that can't exist in nature
-- Smooth transition through impossible timbral spaces
for pos = 0, 1, 0.01 do
    morphPartials(partials1, partials2, pos)
    sinebank:setFromPartials(merged)
    render()
end
```

### 4. Spectral Freeze

```lua
-- Capture a moment in time
freeze_position = 0.5  -- Middle of sample
partials = analyze(sample, freeze_position)

-- Hold that spectrum indefinitely
-- Like a spectral freeze pedal
loop do
    sinebank:setFromPartials(partials)
    -- Amplitude envelope might decay, but partial stays
    render()
end
```

### 5. Inharmonic Content

```lua
-- Bells, gongs, metal have inharmonic partials
-- Extracted partials preserve this
-- Can then manipulate independently

-- Make a bell sound more harmonic
for i, partial in ipairs(partials) do
    -- Force to nearest harmonic
    local harmonic = round(partial.freq / fundamental)
    partial.freq = fundamental * harmonic
end
sinebank:setFromPartials(partials)

-- Or make a harmonic sound inharmonic
for i, partial in ipairs(partials) do
    -- Add randomness to ratios
    partial.freq = partial.freq * (1.0 + random(-0.1, 0.1))
end
```

### 6. Partial-Specific Processing

```lua
-- Apply different processing to different partials
for i = 1, partials.activeCount do
    if i == 1 then
        -- Fundamental gets full amplitude
        partials.amplitudes[i] = 1.0
    elseif i <= 4 then
        -- Lower harmonics get slight decay
        partials.amplitudes[i] = 0.8 / i
    else
        -- Upper harmonics fade faster
        partials.amplitudes[i] = 0.5 / i
    end
end

-- This is impossible with subtractive synthesis
-- You can't filter individual harmonics separately
-- But with additive, each partial is independent
```

---

## Technical Considerations

### CPU Budget

**Per-voice estimate:**

| Operation | Scalar | SIMD (4-wide) | Notes |
|-----------|--------|---------------|-------|
| 8 partials × 128 samples | ~0.5ms | ~0.15ms | Scalar is OK |
| 16 partials × 128 samples | ~1.0ms | ~0.3ms | SIMD helpful |
| 32 partials × 128 samples | ~2.0ms | ~0.6ms | SIMD essential |

**At 8 voices polyphony:**
- 8 partials/voice × 8 voices = 64 sine generators
- SIMD: ~1.2ms total per 128-sample block
- At 44100Hz, 128 samples = ~2.9ms
- 1.2ms / 2.9ms = ~41% CPU per block
- Margin for other processing

**Recommendation:** Start with 8 partials, expand to 16 if SIMD profiling shows headroom.

### Memory Footprint

**Per capture:**
- `PartialData` struct: ~500 bytes
- FFT working buffers: ~32KB (4096 samples)
- Analysis is one-time, then freed

**Per voice:**
- `SineBankNode` state: ~512 bytes (32 partials × 16 bytes)

**Total:** Negligible compared to sample buffers.

### Latency

**Analysis latency:**
- FFT window: 4096 samples @ 44100Hz = ~93ms
- This is for capture-time analysis, not real-time
- Acceptable for offline analysis

**Synthesis latency:**
- Block processing: 128 samples = ~2.9ms
- No additional latency beyond existing signal chain

### Alias Management

Sine waves alias at high frequencies. Mitigation:

```cpp
// Clamp partial frequencies below Nyquist
for (int i = 0; i < activeCount; ++i) {
    partials_[i].frequency = std::min(partials_[i].frequency, sampleRate_ * 0.45f);
    partials_[i].amplitude *= aliasReductionGain(partials_[i].frequency);
}

// Or use band-limited sines for upper partials
if (frequency > sampleRate_ * 0.25f) {
    // Use approximation or wavetable instead of raw sine
}
```

### Smoothing and Clicks

Parameter changes must be smoothed to avoid clicks:

```cpp
// In process(), smooth frequency and amplitude changes
const float freqSmoothCoeff = 1.0f - exp(-2.0f * M_PI * 20.0f / sampleRate_);  // 20Hz smooth
const float ampSmoothCoeff = 1.0f - exp(-2.0f * M_PI * 10.0f / sampleRate_);   // 10Hz smooth

for (int i = 0; i < activeCount; ++i) {
    partials_[i].currentFreq += freqSmoothCoeff * (partials_[i].frequency - partials_[i].currentFreq);
    partials_[i].currentAmp += ampSmoothCoeff * (partials_[i].amplitude - partials_[i].currentAmp);
}
```

---

## Testing Strategy

### Unit Tests

```cpp
// Test: PartialsExtractor correctly identifies harmonics
TEST(PartialsExtractor, IdentifiesHarmonics) {
    // Generate a saw wave (contains all harmonics)
    std::vector<float> sawtooth(4096);
    for (int i = 0; i < 4096; ++i) {
        float phase = 2.0f * M_PI * 220.0f * i / 44100.0f;
        sawtooth[i] = 0.0f;
        for (int h = 1; h <= 10; ++h) {
            sawtooth[i] += sinf(phase * h) / h;
        }
    }
    
    PartialsExtractor extractor;
    extractor.setSampleRate(44100.0);
    extractor.setMaxPartials(10);
    
    PartialData partials = extractor.analyze(sawtooth.data(), sawtooth.size());
    
    // Should detect 220Hz fundamental
    EXPECT_NEAR(partials.fundamental, 220.0f, 5.0f);
    
    // Should detect harmonics at 2×, 3×, 4×...
    EXPECT_NEAR(partials.frequencies[1], 440.0f, 10.0f);
    EXPECT_NEAR(partials.frequencies[2], 660.0f, 15.0f);
    
    // Amplitude should follow 1/harmonic pattern for saw
    EXPECT_LT(partials.amplitudes[1], partials.amplitudes[0]);
    EXPECT_LT(partials.amplitudes[2], partials.amplitudes[1]);
}

// Test: SineBankNode produces correct frequencies
TEST(SineBankNode, ProducesCorrectFrequencies) {
    SineBankNode sinebank;
    sinebank.prepare(44100.0, 256);
    sinebank.setAmplitude(1.0f);
    sinebank.setPartialFrequency(0, 440.0f);
    sinebank.setPartialAmplitude(0, 1.0f);
    sinebank.setMaxPartials(1);
    sinebank.setPartialCount(1);
    
    // Process and FFT output
    // Verify peak at 440Hz
}
```

### Integration Tests

```lua
-- Test: Capture sample → analyze → resynthesize
function testCaptureAnalyzeResynth()
    -- Generate a test signal in Lua
    local testSample = {}
    for i = 1, 1024 do
        testSample[i] = math.sin(2 * math.pi * 440 * i / 44100)
    end
    
    -- Analyze
    local extractor = ctx.primitives.PartialsExtractor.new()
    local partials = extractor:analyze(testSample, 1024)
    
    -- Verify fundamental
    assert(math.abs(partials.fundamental - 440) < 5, "Fundamental should be near 440Hz")
    
    -- Resynthesize
    local sinebank = ctx.primitives.SineBankNode.new()
    sinebank:setFromPartials(partials)
    
    -- Play and verify
    -- ...
end
```

### Perceptual Tests

1. **Piano note → analyze → resynthesize**
   - Should sound like piano
   - Pitch-shifted should maintain piano character
   
2. **Drum hit → analyze → resynthesize**
   - Should capture transient-ish nature
   - Short decay for percussive sounds

3. **Vowel sound → analyze → formant shift**
   - AH → EE morph should be smooth
   - Shouldn't sound phasey

4. **Two samples → morph between**
   - Transition should be smooth
   - No clicking or artifacts

---

## Open Questions

1. **Partial count tradeoff:**
   - More partials = better fidelity, more CPU
   - Recommendation: Start at 8, make configurable

2. **Phase coherence:**
   - Preserve phases from analysis? Or randomize?
   - Preserved phases = more accurate reconstruction
   - Randomized = more natural evolution

3. **Decay envelope:**
   - How to handle partial decay over time?
   - Option A: Analyze decay rates from sample
   - Option B: Follow ADSR envelope like osc
   - Recommendation: Both, with blend

4. **Real-time analysis:**
   - Currently designed for offline (capture-time)
   - Could extend to streaming for live input?
   - Would require overlapping windows and partial tracking

5. **Sample storage of partials:**
   - Persist partials alongside waveform data?
   - Or re-analyze on each load?
   - Recommendation: Cache partials for captured samples

---

## References

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `dsp/core/nodes/PartialsExtractor.h` | **Create** | FFT analysis, peak detection |
| `dsp/core/nodes/PartialsExtractor.cpp` | **Create** | Implementation |
| `dsp/core/nodes/SineBankNode.h` | **Create** | SIMD additive synthesis |
| `dsp/core/nodes/SineBankNode.cpp` | **Create** | Implementation |
| `dsp/core/nodes/PrimitiveNodes.h` | **Modify** | Include new nodes |
| `manifold/primitives/scripting/DSPPluginScriptHost.cpp` | **Modify** | Lua bindings |
| `UserScripts/projects/Main/dsp/midisynth_integration.lua` | **Modify** | Integration |

### External Dependencies

- JUCE DSP module (for FFT): Already linked
- JUCE SIMDRegister: Already available
- Existing `PitchDetector.h`: For fundamental estimation

### Related Documentation

- `agent-docs/PITCH_DETECTION_ANALYSIS.md` — Existing pitch detection analysis
- `agent-docs/RACK_UI_FRAMEWORK_SPEC.md` — Where additive controls would live in UI
- `docs/midisynth_dsp_chain.md` — Current signal chain
- `docs/generated/midisynth-osc-endpoints.md` — OSC parameter reference

---

## Summary

Adding additive synthesis to MidiSynth enables sample-driven synthesis that goes far beyond what subtractive synthesis can achieve:

1. **Independent pitch and time** — No artifacts when pitch-shifting samples
2. **Formant manipulation** — Change timbre without changing pitch
3. **Timbral morphing** — Smooth transitions between captured sounds
4. **Spectral processing** — Edit individual harmonics
5. **Cross-modulation** — Analysis drives synthesis, synthesis drives sample

The implementation is straightforward:
- `PartialsExtractor` for analysis (FFT + peak detection)
- `SineBankNode` for synthesis (SIMD-optimized sine bank)
- Integration into existing blend matrix
- New modes: Additive, Hybrid, CrossSynth, Morph

**Start with 8 partials, SIMD-optimized, integrate into existing architecture.** The infrastructure is already there — this adds a powerful new synthesis path while leveraging everything else that exists.