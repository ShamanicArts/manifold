# Spectrogram Widget for GranularLab

**Date:** 2026-04-24
**Source:** User discussion + analysis of existing FFT/analysis infrastructure
**Author:** Agent
**Status:** BACKLOG — researched, planned, not started

**Layers identified:**
1. C++ / DSP — STFT magnitude analysis, spectrogram data generation
2. Node API — `SampleRegionPlaybackNode` extension or new node
3. Lua Bindings — Expose spectrogram data to UI scripts
4. UI Widget — Heatmap renderer with color mapping
5. GranularLab Integration — Replace/amend waveform view with spectrogram

---

## Context

GranularLab currently displays sample audio as a **peak-based waveform** (amplitude over time). The user requested a **spectrogram** (frequency over time, magnitude as color) because it better represents the spectral content that granular synthesis operates on — seeing formants, harmonics, and transient regions makes grain-position decisions more informed.

We have substantial FFT infrastructure already. This doc assesses what exists, what's missing, and what a full implementation would take.

---

## What We Already Have

### 1. FFT Primitives

**`juce::dsp::FFT`** — JUCE's FFT is already linked and used in:
- `dsp/core/nodes/PartialsExtractor.h` — Extracts sinusoidal partials from mono samples using FFT
- `dsp/core/nodes/PhaseVocoderNode.cpp` — Real-time pitch shifting using FFT/IFFT

### 2. Temporal Analysis on Samples

**`SampleRegionPlaybackNode`** already performs **multi-frame STFT-style analysis** via `extractTemporalFrames()`:
- Uses `PartialsExtractor::extractTemporalFrames()`
- Configurable: `windowSize` (default 2048), `hopSize` (default 1024), `maxFrames` (default 128)
- Returns `TemporalPartialData` — a sparse representation tracking individual sinusoidal peaks per frame
- Stored as atomic snapshots: `lastTemporalPartialsSnapshot_`
- Accessible from Lua via:
  - `getTemporalPartials()` / `getLastTemporalPartials()`
  - `hasTemporalPartials()` / `getTemporalFrameCount()`
  - `getTemporalFrameAtPosition(normalizedPos, smooth, contrast)` — interpolates partials at a position

### 3. Real-time Spectrum Analyzer

**`SpectrumAnalyzerNode`** — A lock-free audio DSP node:
- 8-band frequency splitter (60Hz, 120Hz, 250Hz, 500Hz, 1kHz, 2.5kHz, 6kHz, high)
- Per-sample smoothing with configurable sensitivity/floor
- Outputs normalized band magnitudes via atomics
- Used in the Main project and test scripts (`test_spectrum.lua`)
- **NOT a spectrogram** — it's a real-time bar-graph spectrum, not a time-frequency heatmap

### 4. Existing Lua Spectrum UI

**`UserScripts/projects/Main/ui/components/spectrum.ui.lua`** — A minimal spectrum panel UI (just a title + canvas placeholder). Not a functional spectrogram renderer.

---

## What We Need (The Gap)

A **spectrogram** is fundamentally different from what we have:

| Feature | What We Have | What a Spectrogram Needs |
|---------|-------------|--------------------------|
| Representation | Sparse partials (peaks only) | Dense magnitude bins (all bins) |
| Dimensions | Time → list of peaks | Time × Frequency → magnitude |
| Data density | ~10-50 peaks per frame | ~128-512 bins per frame |
| Storage | `TemporalPartialData` (sparse vectors) | 2D float array (dense matrix) |
| Visualization | None suitable | Heatmap with color gradient |
| Access pattern | `getTemporalFrameAtPosition()` | `getSpectrogramColumnAtTime()` |

### Key Differences Explained

**Temporal Partials** (what we have):
- Tracks ~20 strongest sinusoidal peaks per frame
- Each peak has: frequency, magnitude, phase
- Used for **additive resynthesis** (reconstructing sound from sine waves)
- Sparse = efficient, but loses noise, transients, and spectral "texture"

**STFT Spectrogram** (what we need):
- Computes FFT for every hop-sized window across the sample
- Stores magnitude of EVERY frequency bin
- Creates a dense 2D image: X = time, Y = frequency, color = magnitude
- Shows the full spectral envelope — formants, noise, transients, everything

---

## Implementation Plan

### Option A: Extend `SampleRegionPlaybackNode` (Recommended)

Add a spectrogram generation path alongside the existing temporal partials path.

**Pros:**
- Reuses the async analysis thread pool (`sampleAnalysisPool()`)
- Reuses the mono sample extraction logic
- Single node handles both playback and analysis
- Analysis already triggers on `loadFile()` and `copyFromCaptureBuffer()`

**Cons:**
- Bloats an already large node class (~600 lines)
- Spectrogram data is much larger than partials (128×256 = 32K floats vs. ~1K partials)

**Implementation:**

```cpp
// In SampleRegionPlaybackNode.h
struct SpectrogramData {
    static constexpr int kMaxTimeFrames = 512;
    static constexpr int kFreqBins = 256;  // e.g., FFT 512, bins = 256
    int frameCount = 0;
    int binCount = 0;
    std::array<std::array<float, kFreqBins>, kMaxTimeFrames> magnitudes;
    float sampleRate = 44100.0f;
};

// New methods
void requestAsyncSpectrogram(int fftOrder = 9, int hopDivisor = 4);  // 512 FFT, 128 hop
bool hasSpectrogram() const;
SpectrogramData getLastSpectrogram() const;
std::vector<float> getSpectrogramColumn(float normalizedTime, int numBins) const;
```

The async job (`SamplePlaybackAnalysisJob`) would compute both partials AND spectrogram in one pass, reusing the mono buffer.

### Option B: New `SpectrogramAnalyzerNode`

A standalone DSP node that takes audio input and continuously computes a rolling spectrogram.

**Pros:**
- Could show spectrogram of **live input** (not just loaded samples)
- Cleaner separation of concerns
- Could be used in any DSP graph

**Cons:**
- More work — new node class, new bindings, new Lua API
- Live spectrogram needs circular buffer management
- For GranularLab specifically, we care about the **sample buffer**, not the live input

**Verdict:** Option A is the right fit for GranularLab. Option B is more general-purpose but overkill for this specific use case.

---

## Vertical Slices

### Slice 1: STFT Spectrogram Generation in C++

**Goal:** `SampleRegionPlaybackNode` can generate and cache a dense spectrogram.

**Layers:** C++ DSP, async thread pool, atomic snapshots

**Checklist:**
- [ ] Add `SpectrogramData` struct to `SampleRegionPlaybackNode.h`
- [ ] Add `requestAsyncSpectrogram(fftOrder, hopDivisor)` method
- [ ] In `SamplePlaybackAnalysisJob::runJob()`, after partials extraction, compute STFT:
  - Hanning window of size `fftSize = 1 << fftOrder`
  - Hop size = `fftSize / hopDivisor` (e.g., 512/4 = 128)
  - JUCE FFT forward transform per frame
  - Store magnitude = `sqrt(re*re + im*im)` for bins 0..fftSize/2
  - Limit to `SpectrogramData::kMaxTimeFrames` — downsample time if sample is long
- [ ] Store result in atomic `lastSpectrogramSnapshot_`
- [ ] Add `hasSpectrogram()`, `getLastSpectrogram()`, `getSpectrogramColumn()` accessors
- [ ] Trigger spectrogram analysis automatically on `loadFile()` and `copyFromCaptureBuffer()`

**Done when:** Load a sample into GranularLab, C++ node has spectrogram data accessible.

**Effort:** Medium (half day)

---

### Slice 2: Lua Bindings for Spectrogram Data

**Goal:** Lua UI scripts can query spectrogram columns for rendering.

**Layers:** C++ Lua bindings (`LuaRuntimeNodeBindings`, `DSPHostBindingsFx`)

**Checklist:**
- [ ] Add `getSpectrogramDataAtPath(path)` → returns table of `{frameCount, binCount, columns}`
- [ ] Add `getSpectrogramColumnAtPath(path, normalizedTime, numBins)` → returns array of magnitudes
- [ ] Or add direct methods on the `SampleRegionPlaybackNode` Lua wrapper:
  - `node:getSpectrogramFrame(normalizedTime)` → array of 256 magnitudes
- [ ] Verify data is returned normalized 0..1 (apply dB scaling with floor)

**Done when:** Lua can call `getSpectrogramColumnAtPath("/granular/voice/1/sample", 0.5, 64)` and get 64 floats.

**Effort:** Small (2-3 hours)

---

### Slice 3: Spectrogram Heatmap Widget

**Goal:** New or extended widget that renders a 2D spectrogram heatmap.

**Layers:** Lua widget (`waveform.lua` or new `spectrogram.lua`), display list commands

**Two approaches:**

**Approach A: Extend `WaveformView`**
- Add `mode = "spectrogram"` alongside existing `"samplePath"` / `"capturePath"`
- When in spectrogram mode, draw filled rectangles instead of vertical bars
- X axis = time (same as waveform), Y axis = frequency (0 = bottom, 1 = top)
- Color = magnitude mapped through a gradient

**Approach B: New `SpectrogramView` widget**
- Cleaner, doesn't pollute waveform logic
- Can have spectrogram-specific props: `fftSize`, `colorMap`, `minFreq`, `maxFreq`

**Verdict:** Approach A is simpler for GranularLab — just toggle the waveform into spectrogram mode. But Approach B is cleaner long-term.

**Rendering details:**
- Use `gfx.fillRect()` for each time-frequency cell
- Or build a display list of `fillRect` commands for retained mode
- Color mapping options:
  - **Monochrome:** black → dark blue → blue → cyan → white (classic)
  - **Viridis-like:** purple → blue → green → yellow (perceptually uniform)
  - **Inferno:** black → red → orange → yellow (high contrast)
- For performance, downsample to ~64-128 time columns × 64-128 frequency rows

**Checklist:**
- [ ] Add `setSpectrogramMode(enabled)` to widget
- [ ] Add `setSpectrogramData(columns)` — 2D array of normalized magnitudes
- [ ] Implement color gradient function (`magnitude → ARGB`)
- [ ] Render as grid of filled rectangles
- [ ] Overlay existing grain positions / playheads on top (same as waveform)
- [ ] Support both `onDraw` (canvas) and `_syncRetained` (display list) paths

**Done when:** GranularLab waveform area shows a colored heatmap instead of vertical bars.

**Effort:** Medium (half day)

---

### Slice 4: GranularLab Integration

**Goal:** Wire everything together in GranularLab's UI.

**Layers:** `main.ui.lua`, `behaviors/main.lua`

**Checklist:**
- [ ] In `behaviors/main.lua` `refreshWaveform()`:
  - If spectrogram mode active, call `getSpectrogramColumnAtPath()` for N time positions
  - Build 2D data array and pass to widget
- [ ] Add a toggle button: "Waveform / Spectrogram" (or just use the existing mode toggles)
- [ ] Ensure grain positions, playheads, loop region still overlay correctly on spectrogram
- [ ] Test with various samples: pure tones, speech, drums, noise

**Done when:** User can toggle between waveform and spectrogram view in GranularLab.

**Effort:** Small (1-2 hours)

---

## Dependency Graph

```
Slice 1 (C++ STFT generation) ──→ Slice 2 (Lua bindings)
                                       │
                                       ↓
                               Slice 3 (Heatmap widget)
                                       │
                                       ↓
                               Slice 4 (GranularLab integration)
```

---

## Design Notes

### STFT Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| FFT size | 512 (order 9) | Good balance: ~11.6ms @ 44.1kHz, 256 frequency bins |
| Hop size | 128 (FFT/4) | 75% overlap, smooth time resolution |
| Max time frames | 512 | For a 30s sample: 1 frame per ~58ms, sufficient detail |
| Window | Hanning | Standard for spectrograms, good side-lobe rejection |
| Magnitude scaling | dB with -96dB floor | Matches audio perception, good dynamic range |
| Normalization | Per-column max | Each time slice scaled independently (standard) |

### Color Mapping

**Recommended: Monochrome cyan/blue (fits GranularLab's dark theme)**

```
magnitude 0.0  →  #0a0f1a  (near-black)
magnitude 0.25 →  #1a3a5c  (dark blue)
magnitude 0.5  →  #2a6b9a  (medium blue)
magnitude 0.75 →  #4aa8d4  (cyan)
magnitude 1.0  →  #a8e0f0  (bright cyan/white)
```

Alternative: Use a lookup table of 256 colors precomputed in Lua.

### Overlay Semantics

On a spectrogram, these elements mean the same thing but look different:

| Element | Waveform render | Spectrogram render |
|---------|----------------|-------------------|
| Loop region bounds | Vertical lines | Vertical lines (same) |
| Play start | Vertical line | Vertical line (same) |
| Grain position | Vertical line | Vertical line + horizontal line at grain freq (if known) |
| Voice playheads | Vertical line | Vertical line at current time |
| Grain ticks | Small vertical bars | Small filled rectangles at (time, freq) |

For grain ticks, we know the grain's **position** (time) but not its **frequency content**. We could:
- Draw ticks only at the time position (vertical, same as waveform)
- Or estimate frequency from grain pitch + sample analysis
- Or just keep it simple — grain ticks as vertical lines at their time position

### Performance Considerations

- Spectrogram data: 512 frames × 256 bins × 4 bytes = **512KB per sample** — trivial
- Display list: 128×64 rectangles = 8,192 fill commands — acceptable for 60fps
- For very long samples (>30s), downsample time frames proportionally
- Analysis is async (background thread) — no audio thread impact

---

## Acceptance Criteria

| Slice | Acceptance Test |
|-------|----------------|
| 1 | Load a sample, C++ `hasSpectrogram()` returns true, `getSpectrogramColumn()` returns 256 non-zero floats |
| 2 | Lua `getSpectrogramColumnAtPath("/granular/voice/1/sample", 0.5, 64)` returns 64 floats in 0..1 range |
| 3 | Widget renders a colored heatmap with visible frequency content; toggle back to waveform works |
| 4 | GranularLab shows spectrogram with grain positions / playheads overlaid; toggling modes works |

---

## Open Questions

1. **Should the spectrogram show the FULL sample or just the loop region?**
   - Full sample: more context, but loop region is what matters for grains
   - Loop region only: more relevant, but loses context
   - Suggestion: Full sample with loop region highlighted (same as waveform)

2. **Should grain ticks show estimated frequency?**
   - If yes: need to compute/grab grain frequency from `GranulatorNode` (not currently exposed)
   - If no: keep as time-only markers (simpler, still useful)

3. **Real-time spectrogram for live input?**
   - Deferred to Option B (new node). Not needed for GranularLab's sample-based workflow.

---

## Related Files

| File | Role |
|------|------|
| `dsp/core/nodes/SampleRegionPlaybackNode.h/cpp` | Extend with spectrogram analysis |
| `dsp/core/nodes/PartialsExtractor.h` | Reference for FFT usage pattern |
| `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp` | Add spectrogram Lua bindings |
| `manifold/ui/widgets/waveform.lua` | Extend or replace with heatmap rendering |
| `UserScripts/projects/GranularLab/ui/behaviors/main.lua` | Wire spectrogram data to widget |
| `UserScripts/projects/GranularLab/ui/main.ui.lua` | Add spectrogram toggle |
