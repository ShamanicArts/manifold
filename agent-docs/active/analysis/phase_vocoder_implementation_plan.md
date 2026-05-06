# Phase Vocoder Pitch Mode Implementation Plan

## Intended Goal

Add a "Phase Vocoder" pitch mode to the Sample tab that allows pitch transposition **independent of playback duration**. Unlike the current "Classic" mode (which changes playback speed to change pitch, altering duration), the Phase Vocoder uses FFT-based analysis-resynthesis to shift pitch while keeping the sample's length constant.

This is the first of multiple planned pitch engines (Granular, Formant-Preserving, etc.) that will give users choice over how transposition behaves.

---

## Files to Create

### 1. `dsp/core/nodes/PhaseVocoderNode.h`
**Purpose**: New node class implementing the phase vocoder algorithm  
**Base class**: `IPrimitiveNode` (following existing pattern)  
**Key components**:
- FFT/IFFT using `juce::dsp::FFT`
- Circular input buffer for overlapping windows
- Phase tracking arrays for "phase vocoder identity"
- Output overlap-add buffer
- Pitch ratio parameter (atomic, like existing nodes)

### 2. `dsp/core/nodes/PhaseVocoderNode.cpp`
**Purpose**: Implementation of the phase vocoder pipeline  
**Core algorithm**:
- Windowed FFT analysis (Hann window, 75% overlap typical)
- Phase difference calculation per bin
- True frequency estimation via phase vocoder identity
- Bin scaling by pitch ratio
- IFFT resynthesis
- Overlap-add reconstruction

---

## Files to Modify

### 1. `dsp/core/nodes/SampleRegionPlaybackNode.h`
**Changes**:
```cpp
enum class PitchMode {
    Classic = 0,        // Current speed-based transposition
    PhaseVocoder = 1,   // New FFT-based
    Granular = 2        // Future grain-based
};

// Add atomic pitch mode parameter
std::atomic<int> pitchMode_{0};

// Add phase vocoder pitch parameter (semitones, -24 to +24)
std::atomic<float> pitchSemitones_{0.0f};

// Add setter/getter
void setPitchMode(int mode);
int getPitchMode() const;
void setPitchSemitones(float semitones);
float getPitchSemitones() const;
```

### 2. `dsp/core/nodes/SampleRegionPlaybackNode.cpp`
**Changes**:
- In `process()`: Branch based on `pitchMode_`
  - `Classic`: Current behavior (speed-based)
  - `PhaseVocoder`: Route through internal PhaseVocoderNode instance
- Maintain PhaseVocoderNode instance as member (lazy init)
- Feed sample buffer to PhaseVocoderNode when in that mode
- Handle mode switching (fade/crossfade to avoid clicks)

### 3. `UserScripts/projects/Main/ui/behaviors/oscillator.lua`
**Changes**:
- Add pitch mode state tracking to oscillator context
- Expose getter/setter for pitch mode to DSP
- Handle pitch mode in sample waveform display (visual feedback)

### 4. `UserScripts/projects/Main/ui/components/oscillator.ui.lua`
**Changes**:
- Add segmented control for pitch mode selection
- Position: Above the waveform display, below existing controls
- Options: ["Classic", "Phase Vocoder"]
- Bind to oscillator state
- Adjust layout: bars section moves down to accommodate

---

## UI Layout Changes (Sample Tab)

```
┌─────────────────────────────────────┐
│ [Capture] [Clear] [Analyze]         │  <- Existing buttons
├─────────────────────────────────────┤
│  Mode: [Classic] [Phase Vocoder]    │  <- NEW: Segmented control
├─────────────────────────────────────┤
│                                     │
│    ~ WAVEFORM DISPLAY ~             │  <- Existing waveform
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │  PLAY START (yellow)        │    │  <- Bar 1
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │  LOOP START | LOOP END      │    │  <- Bar 2 (moved down)
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

---

## Best Practices to Follow

### 1. Parameter Thread Safety (from existing nodes)
All parameters exposed to UI must be atomic:
```cpp
std::atomic<float> pitchSemitones_{0.0f};
std::atomic<int> pitchMode_{0};
```

Use `std::memory_order_acquire` for reads, `std::memory_order_release` for writes.

### 2. Smoothing Coefficients (from SampleRegionPlaybackNode)
Smooth parameter changes to avoid clicks:
```cpp
// In prepare()
pitchSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sampleRate_)));

// In process()
currentPitch_ += (targetPitch - currentPitch_) * pitchSmoothingCoeff_;
```

### 3. Ring Buffer Pattern (from GranulatorNode)
Use circular buffer for input history:
```cpp
float readRing(int channel, float pos) const;
void writeToRing(const float* input, int numSamples);
```

### 4. Buffer Management (from existing nodes)
Use double-buffering for thread-safe sample updates:
```cpp
juce::AudioBuffer<float> loopBufferA_;
juce::AudioBuffer<float> loopBufferB_;
std::atomic<int> activeLoopBufferIndex_{0};
```

### 5. FFT Size Constants
Match or exceed GranulatorNode's quality expectations:
```cpp
static constexpr int kFFTOrder = 11;  // 2048 samples
static constexpr int kFFTSize = 1 << kFFTOrder;
static constexpr int kHopSize = kFFTSize / 4;  // 75% overlap
```

### 6. Latency Handling
Phase vocoder introduces algorithmic latency (`kFFTSize` samples). Document this and consider:
- Reporting latency to host if applicable
- Compensating in playhead display

### 7. Mode Switching
When switching pitch modes, use brief crossfade (5-10ms) to avoid discontinuities:
```cpp
// Pseudo-code
if (modeTransitionInProgress) {
    output = classicOutput * (1.0f - fade) + pvOutput * fade;
}
```

---

## Architecture Goals

1. **Encapsulation**: PhaseVocoderNode is self-contained, testable independently
2. **Composability**: SampleRegionPlaybackNode owns/uses PhaseVocoderNode, doesn't inherit from it
3. **Consistency**: Same API patterns as GranulatorNode, SineBankNode
4. **Performance**: Real-time safe (no allocations in process block, lock-free)
5. **Extensibility**: Easy to add Granular mode later using same pattern

---

## Testing Strategy

1. **Unit tests**: PhaseVocoderNode in isolation with sine wave input
2. **Integration**: Mode switching, parameter smoothing
3. **Quality**: A/B test against speed-based transposition on vocals
4. **Performance**: CPU profiling at maximum polyphony

---

## Future Considerations

- **Granular mode**: Will follow same pattern (new node, same UI integration)
- **Formant preservation**: Requires LPC analysis, significantly more complex
- **Time stretching**: Phase vocoder can do this (pitchRatio=1.0, timeScale≠1.0)
- **Real-time analysis**: Currently assumes pre-captured sample; live input would need different buffering

---

## Open Questions

1. Should pitch mode be per-voice or global for the sample?
2. How to handle polyphony with PhaseVocoder (one instance per voice vs. shared)?
3. Should we expose FFT size / overlap as advanced parameters?
4. Visual feedback: show pitch shift amount on waveform display?
