# Manifold DSP Effects Roadmap

Comprehensive implementation plan for expanding the DSP node library. All effects implement `IPrimitiveNode` interface with full Lua scripting support.

## Core Principles

1. **Every node is scriptable** - Full parameter binding via `ctx.params.register/bind()`
2. **Lock-free real-time safety** - All processing in `process()` is allocation-free
3. **Consistent API** - All nodes support `prepare()`, `process()`, `reset()` patterns
4. **Lua introspection** - Nodes expose parameter metadata for UI generation
5. **Testable** - Each effect has a corresponding `test_effect_*.lua` script

---

## Phase 1: Foundation (Essential Utility)

**Goal:** Replace/enhance current basic effects. These are the bread-and-butter tools for loop processing.

---

### 1.1 State Variable Filter (SVFNode)
**Replaces/Enhances:** Current basic FilterNode

**Features:**
- Simultaneous LP/BP/HP outputs
- Resonance with self-oscillation control
- Drive/saturation into filter
- Smooth coefficient interpolation (dezippering)

**Microtasks:**
- [ ] Create `dsp/core/nodes/SVFNode.h` - Interface with mode enum
- [ ] Create `dsp/core/nodes/SVFNode.cpp` - SVF algorithm with tanh saturation
- [ ] Add to `PrimitiveNodes.h` aggregation header
- [ ] Lua bindings in `LuaControlBindings.cpp` - expose setMode, setCutoff, setResonance, setDrive
- [ ] Parameter schema: cutoff (20-20k), resonance (0-1), mode (0=LP,1=BP,2=HP), drive (0-10)
- [ ] Create `manifold/dsp/scripts/test_svf.lua` - Sweep filter with oscillator input
- [ ] Migration: Update `default_dsp.lua` to use SVF instead of basic Filter

---

### 1.2 Stereo Delay (StereoDelayNode)
**Replaces/Enhances:** None (new capability)

**Features:**
- Independent L/R delay times
- Beat-synced divisions (1/4, 1/8, dotted, triplet)
- Ping-pong mode
- Feedback with filter damping (tone control)
- Ducking (sidechain from dry signal)
- Freeze mode (infinite feedback)

**Microtasks:**
- [ ] Create `dsp/core/nodes/StereoDelayNode.h` - Circular buffer management
- [ ] Create `dsp/core/nodes/StereoDelayNode.cpp` - Stereo processing with cross-feedback
- [ ] Time conversion: bars/division → samples using QuantizerNode logic
- [ ] Lua bindings: setTimeL, setTimeR, setFeedback, setPingPong, setFilter, setFreeze
- [ ] Parameter schema: timeL/timeR (0-2000ms or synced), feedback (0-1.2), mix (0-1), filter (200-10k), pingPong (bool)
- [ ] Create `manifold/dsp/scripts/test_stereo_delay.lua` - Rhythmic delay patterns
- [ ] Add tempo-sync helper methods

---

### 1.3 Compressor/Limiter (CompressorNode)
**Replaces/Enhances:** None (new capability)

**Features:**
- Peak and RMS detection modes
- Adjustable knee
- Sidechain HPF (reduce bass pumping)
- Auto makeup gain option
- Limiter mode (infinity:1 ratio, fast attack)

**Microtasks:**
- [ ] Create `dsp/core/nodes/CompressorNode.h` - Envelope detector, gain computer
- [ ] Create `dsp/core/nodes/CompressorNode.cpp` - Feedforward/feedback topology
- [ ] Implement smooth gain reduction (dezippering)
- [ ] Lua bindings: setThreshold, setRatio, setAttack, setRelease, setKnee, setMakeup, setMode
- [ ] Parameter schema: threshold (-60-0dB), ratio (1:1 to 20:1), attack (0.1-100ms), release (10-1000ms), knee (0-12dB)
- [ ] Create `manifold/dsp/scripts/test_compressor.lua` - Drum transient control
- [ ] Visual output: gain reduction meter for UI binding

---

### 1.4 Multi-Mode Wave Shaper (WaveShaperNode)
**Replaces/Enhances:** Current DistortionNode

**Features:**
- Multiple curve types: tanh, tube, tape, hardclip, foldback, sigmoid
- Pre-filter (tone control before distortion)
- Post-filter (tone after)
- Mix control (parallel processing)
- Bias control (asymmetric distortion)

**Microtasks:**
- [ ] Create `dsp/core/nodes/WaveShaperNode.h` - Transfer function lookup or direct computation
- [ ] Create `dsp/core/nodes/WaveShaperNode.cpp` - Anti-aliased distortion (oversampling x2 or x4)
- [ ] Implement curve LUT generation for efficiency
- [ ] Lua bindings: setCurve, setDrive, setTone, setPostTone, setMix, setBias
- [ ] Parameter schema: curveType (enum), drive (0-20dB), tone (200-10k), mix (0-1), bias (-1 to 1)
- [ ] Create `manifold/dsp/scripts/test_waveshaper.lua` - Compare distortion types
- [ ] Oversampling with AA filter (7th order FIR)

---

### 1.5 Chorus/Ensemble (ChorusNode)
**Replaces/Enhances:** None (new capability)

**Features:**
- 3-4 modulated delay lines (voices)
- LFO with triangle/sine waveforms
- Stereo spread per voice
- Depth and rate controls
- Optional feedback for flanging edge

**Microtasks:**
- [ ] Create `dsp/core/nodes/ChorusNode.h` - Multiple delay lines with LFOs
- [ ] Create `dsp/core/nodes/ChorusNode.cpp` - Modulated allpass/comb structure
- [ ] Implement quadrature LFOs (90° phase offset per voice)
- [ ] Lua bindings: setRate, setDepth, setVoices, setSpread, setFeedback, setWaveform
- [ ] Parameter schema: rate (0.1-10Hz), depth (0-100%), voices (1-4), spread (0-100%), feedback (0-0.9)
- [ ] Create `manifold/dsp/scripts/test_chorus.lua` - Thick pad sounds

---

## Phase 2: Creative Core (Differentiating Effects)

**Goal:** Effects that make Manifold unique. Granular, stutter, shimmer - these are the "wow" factors.

---

### 2.1 Granulator (GranulatorNode)
**Replaces/Enhances:** None (flagship feature)

**Features:**
- Real-time granular synthesis from input buffer
- Cloud of grains (10-100 overlapping)
- Grain parameters: size (ms), position, pitch, density, spread
- Freeze mode (loop current buffer, stop capturing)
- Reverse grains option
- Envelope per grain (Hanning, Gaussian, custom)

**Microtasks:**
- [ ] Create `dsp/core/nodes/GranulatorNode.h` - Grain pool, scheduler, buffer management
- [ ] Create `dsp/core/nodes/GranulatorNode.cpp` - Grain spawning, overlap-add
- [ ] Implement grain envelope LUTs
- [ ] Lua bindings: setGrainSize, setDensity, setPosition, setPitch, setSpray, setFreeze, setEnvelope
- [ ] Parameter schema: grainSize (1-500ms), density (1-100 grains/sec), position (0-1), pitch (-24 to +24 semitones), spray (0-1), freeze (bool)
- [ ] Create `manifold/dsp/scripts/test_granulator.lua` - Freeze and scrub through loop
- [ ] Performance: Limit concurrent grains, use ring buffer for grain pool

---

### 2.2 Stutter/Beat Repeat (StutterNode)
**Replaces/Enhances:** None (performance effect)

**Features:**
- Tempo-synced buffer repeats (1/32 to 2 bars)
- Gate control (truncate repeats)
- Filter decay (each repeat gets darker)
- Pitch shift down (tape stop effect)
- Random probability mode
- Pattern sequencer (8-step grid)

**Microtasks:**
- [ ] Create `dsp/core/nodes/StutterNode.h` - Buffer capture, playback with jumps
- [ ] Create `dsp/core/nodes/StutterNode.cpp` - Beat detection or external trigger
- [ ] Implement trigger quantize (wait for next beat)
- [ ] Lua bindings: setLength, setGate, setFilterDecay, setPitchDecay, setProbability, setPattern
- [ ] Parameter schema: length (division), gate (0-1), filterDecay (0-1), pitchDecay (0-1), probability (0-1), pattern (8-bit or table)
- [ ] Create `manifold/dsp/scripts/test_stutter.lua` - Rhythmic stutter patterns
- [ ] Trigger modes: manual, probability, pattern, transient-detect

---

### 2.3 Shimmer Reverb (ShimmerNode)
**Replaces/Enhances:** Current ReverbNode

**Features:**
- Algorithmic reverb base (plate/room)
- Pitch-shifted feedback path (+12 or +7 semitones typical)
- Feedback control for infinite sustain
- Pre/post filter
- Modulated reverb for warmth

**Microtasks:**
- [ ] Create `dsp/core/nodes/ShimmerNode.h` - Reverb + pitch shifter in feedback loop
- [ ] Create `dsp/core/nodes/ShimmerNode.cpp` - Allpass diffuser + pitch shift + decay
- [ ] Integrate existing pitch shift algorithm or new lightweight version
- [ ] Lua bindings: setSize, setPitch, setFeedback, setMix, setModulation, setFilter
- [ ] Parameter schema: size (0-1), pitch (0, 7, 12, -12 semitones), feedback (0-1), mix (0-1), modulation (0-1)
- [ ] Create `manifold/dsp/scripts/test_shimmer.lua` - Ethereal pad transformation

---

### 2.4 Stereo Widener (StereoWidenerNode)
**Replaces/Enhances:** None (utility)

**Features:**
- Mid-Side processing
- Width control (0-200%)
- Mono low-freq (keep bass centered, stereoize highs)
- Mono check button (for mixing)
- Correlation meter output

**Microtasks:**
- [ ] Create `dsp/core/nodes/StereoWidenerNode.h` - M/S encode/decode
- [ ] Create `dsp/core/nodes/StereoWidenerNode.cpp` - LR to MS to LR with gains
- [ ] Implement crossover for mono low
- [ ] Lua bindings: setWidth, setMonoLowFreq, setMonoLowEnable, getCorrelation
- [ ] Parameter schema: width (0-200%), monoLowFreq (20-500Hz), monoLowEnable (bool)
- [ ] Create `manifold/dsp/scripts/test_widener.lua` - Width automation
- [ ] Output parameter: correlation (-1 to 1) for UI metering

---

### 2.5 Phaser (PhaserNode)
**Replaces/Enhances:** None (new)

**Features:**
- 6 or 12 stage allpass filters
- LFO modulation (sine/triangle)
- Feedback (positive and negative for different textures)
- Stereo phase offset (sweep L and R differently)
- Peak spread control

**Microtasks:**
- [ ] Create `dsp/core/nodes/PhaserNode.h` - Allpass cascade, LFO
- [ ] Create `dsp/core/nodes/PhaserNode.cpp` - Modulated allpass chain
- [ ] Implement 1-pole allpass sections
- [ ] Lua bindings: setRate, setDepth, setStages, setFeedback, setSpread
- [ ] Parameter schema: rate (0.1-10Hz), depth (0-100%), stages (6 or 12), feedback (-0.9 to 0.9), spread (0-180°)
- [ ] Create `manifold/dsp/scripts/test_phaser.lua` - Slow sweep texture

---

## Phase 3: Advanced & Experimental

**Goal:** Professional-grade tools and experimental sound design.

---

### 3.1 Multitap Delay (MultitapDelayNode)
**Replaces/Enhances:** StereoDelayNode (extension)

**Features:**
- 4-8 tap read heads
- Per-tap: time, gain, pan, filter
- Rhythmic patterns (dotted, triplet grid)
- Tap freeze (hold current taps, stop writing)
- Diffusion (taps feed into each other)

**Microtasks:**
- [ ] Create `dsp/core/nodes/MultitapDelayNode.h` - Multiple read indices, one write
- [ ] Create `dsp/core/nodes/MultitapDelayNode.cpp` - Tap summing with individual filters
- [ ] Lua bindings: setTapCount, setTapTime(n), setTapGain(n), setTapPan(n), setTapFilter(n)
- [ ] Parameter schema: Dynamic based on tap count, array support in Lua
- [ ] Create `manifold/dsp/scripts/test_multitap.lua` - Rhythmic echo patterns

---

### 3.2 Pitch Shifter (PitchShifterNode)
**Replaces/Enhances:** None (Granulator uses internal version, this is standalone)

**Features:**
- Formant-preserving pitch shift
- Dual voice (harmonies: +3rd, +5th, +octave)
- Time correction (preserve loop length)
- Detune for thickening (± cents)

**Microtasks:**
- [ ] Create `dsp/core/nodes/PitchShifterNode.h` - Phase vocoder or granular pitch shift
- [ ] Create `dsp/core/nodes/PitchShifterNode.cpp` - Overlap-add with windowing
- [ ] Formant shift option (preserve vocal character)
- [ ] Lua bindings: setSemitones, setFormantPreserve, setVoiceCount, setDetune
- [ ] Parameter schema: semitones (-24 to +24), formant (bool), voices (1-2), detune (0-50 cents)
- [ ] Create `manifold/dsp/scripts/test_pitchshift.lua` - Harmony generation

---

### 3.3 Transient Shaper (TransientShaperNode)
**Replaces/Enhances:** None (modern production tool)

**Features:**
- Attack enhancement/reduction
- Sustain enhancement/reduction
- Sensitivity threshold
- Soft/hard knee
- Analog modeling option (warmth)

**Microtasks:**
- [ ] Create `dsp/core/nodes/TransientShaperNode.h` - Envelope follower + gain stage
- [ ] Create `dsp/core/nodes/TransientShaperNode.cpp` - Slow attack envelope vs fast for transient detection
- [ ] Lua bindings: setAttack, setSustain, setSensitivity, setMode
- [ ] Parameter schema: attack (-100 to +100%), sustain (-100 to +100%), sensitivity (-60 to 0dB)
- [ ] Create `manifold/dsp/scripts/test_transient.lua` - Drum punch enhancement

---

### 3.4 Ring Modulator (RingModulatorNode)
**Replaces/Enhances:** None (classic effect)

**Features:**
- Carrier oscillator (sine/square/triangle)
- Carrier frequency tracking (option to follow input pitch)
- LFO modulation of carrier
- Dry/wet mix
- Output filter (remove harsh high harmonics)

**Microtasks:**
- [ ] Create `dsp/core/nodes/RingModulatorNode.h` - Oscillator + multiplier
- [ ] Create `dsp/core/nodes/RingModulatorNode.cpp` - Real-time multiplication
- [ ] Lua bindings: setFrequency, setWaveform, setLFORate, setLFOAmount, setMix
- [ ] Parameter schema: frequency (20-5000Hz), waveform (0-2), lfoRate (0-20Hz), lfoAmount (0-100%), mix (0-1)
- [ ] Create `manifold/dsp/scripts/test_ringmod.lua` - Bell/metallic textures

---

### 3.5 Bit Crusher (BitCrusherNode)
**Replaces/Enhances:** None (lo-fi)

**Features:**
- Bit depth reduction (1-16 bits)
- Sample rate reduction (decimation)
- Dithering option
- Pre-filter (reduce aliasing artifacts)
- Post-filter (smooth decimation)
- Noise injection (vinyl crackle, tape hiss)

**Microtasks:**
- [ ] Create `dsp/core/nodes/BitCrusherNode.h` - Quantizer + decimator
- [ ] Create `dsp/core/nodes/BitCrusherNode.cpp` - Sample-and-hold for rate reduction
- [ ] Lua bindings: setBits, setSampleRate, setDither, setNoise, setMix
- [ ] Parameter schema: bits (1-16), sampleRate (100-44100), dither (0-1), noise (0-1), mix (0-1)
- [ ] Create `manifold/dsp/scripts/test_bitcrusher.lua` - Degradation effects

---

### 3.6 Formant Filter (FormantFilterNode)
**Replaces/Enhances:** None (vocal character)

**Features:**
- Vowel emulation: A, E, I, O, U (and blends)
- Gender control (formant shift up/down)
- Morph between vowels (X/Y pad style)
- Resonance/Q control

**Microtasks:**
- [ ] Create `dsp/core/nodes/FormantFilterNode.h` - Parallel bandpass filters
- [ ] Create `dsp/core/nodes/FormantFilterNode.cpp` - 5-band resonator with formant frequencies
- [ ] Research formant frequency tables (male/female/child)
- [ ] Lua bindings: setVowel, setGender, setMorphX, setMorphY, setResonance
- [ ] Parameter schema: vowel (0-4 or enum), gender (-1 to 1), morphX (0-1), morphY (0-1)
- [ ] Create `manifold/dsp/scripts/test_formant.lua` - Talking instrument effect

---

### 3.7 Reverse Delay (ReverseDelayNode)
**Replaces/Enhances:** None (creative delay)

**Features:**
- Segmented buffer (reads backwards in chunks)
- Smooth crossfade between segments
- Feedback with forward delay (cascaded)
- Trigger modes: auto, transient, manual

**Microtasks:**
- [ ] Create `dsp/core/nodes/ReverseDelayNode.h` - Segmented circular buffer
- [ ] Create `dsp/core/nodes/ReverseDelayNode.cpp` - Backward read with crossfade
- [ ] Lua bindings: setSegmentLength, setFeedback, setTriggerMode, setCrossfade
- [ ] Parameter schema: segmentLength (100-2000ms), feedback (0-1), triggerMode (enum), crossfade (1-100ms)
- [ ] Create `manifold/dsp/scripts/test_reverse_delay.lua` - Backward echoes

---

## Phase 4: Utilities & Infrastructure

**Goal:** Routing, analysis, and mixing tools that enable complex patches.

---

### 4.1 Envelope Follower (EnvelopeFollowerNode)
**Output:** Control signal (can modulate other params via Lua)

**Features:**
- Peak and RMS modes
- Attack/Release times
- Hold time
- Range output (0-1 or -1 to 1)
- Gate output (boolean when threshold crossed)

**Microtasks:**
- [ ] Create `dsp/core/nodes/EnvelopeFollowerNode.h` - Level detector
- [ ] Create `dsp/core/nodes/EnvelopeFollowerNode.cpp` - Attack/release smoothing
- [ ] Lua bindings: setAttack, setRelease, setMode, setRange, getValue (queryable)
- [ ] Parameter schema: attack (0.1-100ms), release (10-2000ms), mode (peak/rms), range (uni/bipolar)
- [ ] Create `manifold/dsp/scripts/test_envelope_follower.lua` - Ducking example

---

### 4.2 Pitch Detector (PitchDetectorNode)
**Output:** Frequency and note number

**Features:**
- Autocorrelation or YIN algorithm
- Frequency range constraint
- Confidence output
- MIDI note number output

**Microtasks:**
- [ ] Create `dsp/core/nodes/PitchDetectorNode.h` - Analysis buffer, algorithm
- [ ] Create `dsp/core/nodes/PitchDetectorNode.cpp` - YIN or autocorrelation
- [ ] Lua bindings: setMinFreq, setMaxFreq, getFrequency, getNote, getConfidence
- [ ] Parameter schema: minFreq (20-500), maxFreq (500-8000)
- [ ] Create `manifold/dsp/scripts/test_pitch_detect.lua` - Tune filter to input

---

### 4.3 Crossfader (CrossfaderNode)
**Utility:** 2-input, 1-output mixer

**Features:**
- Equal power or linear curve
- CV control (from EnvelopeFollower)
- Smoothing (dezippering on position changes)

**Microtasks:**
- [ ] Create `dsp/core/nodes/CrossfaderNode.h` - 2 inputs, position control
- [ ] Create `dsp/core/nodes/CrossfaderNode.cpp` - Gain calculation + mix
- [ ] Lua bindings: setPosition, setCurve, setSmoothing
- [ ] Parameter schema: position (0-1), curve (linear/equal_power/dB), smoothing (0-100ms)
- [ ] Create `manifold/dsp/scripts/test_crossfader.lua` - Morph between two effects

---

### 4.4 Mixer (MixerNode)
**Utility:** N-input summing mixer

**Features:**
- 4-8 channels
- Per-channel: gain, pan, mute, solo
- Metering output per channel
- Master gain

**Microtasks:**
- [ ] Create `dsp/core/nodes/MixerNode.h` - Channel strip array
- [ ] Create `dsp/core/nodes/MixerNode.cpp` - Summing with pan law
- [ ] Lua bindings: setChannelGain(n), setChannelPan(n), setChannelMute(n), setMasterGain
- [ ] Parameter schema: Array/dynamic params for N channels
- [ ] Create `manifold/dsp/scripts/test_mixer.lua` - Multi-layer effect blending

---

### 4.5 Noise Generator (NoiseGeneratorNode)
**Utility:** Signal source for testing/textures

**Features:**
- Types: White, Pink, Brown
- Filtered output (resonant filter for wind/ocean textures)
- Amplitude envelope

**Microtasks:**
- [ ] Create `dsp/core/nodes/NoiseGeneratorNode.h` - RNG + filter
- [ ] Create `dsp/core/nodes/NoiseGeneratorNode.cpp` - Colored noise algorithms
- [ ] Lua bindings: setType, setFilterFreq, setFilterRes, setLevel
- [ ] Parameter schema: type (0=white,1=pink,2=brown), filterFreq (20-20k), resonance (0-1)
- [ ] Create `manifold/dsp/scripts/test_noise.lua` - Texture layer

---

### 4.6 Mid-Side Encoder/Decoder (MSEncoderNode/MSDecoderNode)
**Utility:** For M/S processing chains

**Features:**
- MS encode: LR → MS
- MS decode: MS → LR
- Gain controls on Mid and Side separately

**Microtasks:**
- [ ] Create `dsp/core/nodes/MSEncoderNode.h` and `MSDecoderNode.h`
- [ ] Create implementations - simple matrix math
- [ ] Lua bindings: setMidGain, setSideGain (on decoder)
- [ ] Create `manifold/dsp/scripts/test_ms_chain.lua` - Encode → process → Decode

---

## Phase 5: Master & Quality-of-Life

### 5.1 Parametric EQ (EQNode)
**Features:** 4-band parametric + high/low shelf

**Microtasks:**
- [ ] 4x Peak filters + 2x Shelf filters
- [ ] Frequency, Gain, Q per band
- [ ] Lua bindings for band access

### 5.2 Limiter (LimiterNode)
**Features:** Brickwall, true peak, ISP (inter-sample peaks)

**Microtasks:**
- [ ] Look-ahead limiter
- [ ] Ceiling control
- [ ] Release shaping

### 5.3 Spectrum Analyzer (SpectrumAnalyzerNode)
**Output:** FFT bin magnitudes for UI

**Microtasks:**
- [ ] FFT implementation (JUCE or KissFFT)
- [ ] Bin output array accessible from Lua
- [ ] Smoothing/falloff for visualization

---

## Implementation Notes

### Parameter Conventions
All nodes follow this schema:
```cpp
// In header
void setCutoff(float freq);     // 20-20000
void setResonance(float q);     // 0.0-1.0
void setMix(float wet);         // 0.0-1.0 (dry/wet)
void setEnabled(bool on);       // Bypass
void reset();                   // Clear buffers, reset state
```

### Lua Registration Pattern
```cpp
// In LuaControlBindings.cpp
void registerSVFNode(sol::state& lua) {
    lua.new_usertype<dsp_primitives::SVFNode>("SVFNode",
        "new", sol::factories(&std::make_shared<dsp_primitives::SVFNode>),
        "setCutoff", &dsp_primitives::SVFNode::setCutoff,
        "setResonance", &dsp_primitives::SVFNode::setResonance,
        "setMode", &dsp_primitives::SVFNode::setMode,
        "setDrive", &dsp_primitives::SVFNode::setDrive
    );
}
```

### Testing Pattern
Each effect gets a script in `manifold/dsp/scripts/test_<effect>.lua`:
```lua
-- Standard test template
local ctx = ...
local osc = ctx.primitives.OscillatorNode.new()
local effect = ctx.primitives.NewEffect.new()

ctx.graph.connect(osc, effect)
ctx.graph.connect(effect, ctx.graph.getOutput())

ctx.params.register("/test/param", {type="f", min=0, max=1, default=0.5})
ctx.params.bind("/test/param", effect, "setParam")

return {
    description = "Test new effect",
    params = {"/test/param"}
}
```

### Real-Time Safety Checklist
- [ ] No `new`/`delete` in `process()`
- [ ] No locks in `process()`
- [ ] No file I/O in `process()`
- [ ] No dynamic memory (vectors resizing)
- [ ] All buffers preallocated in `prepare()`
- [ ] Parameter changes use atomics or lock-free queues

---

## Progress Tracking

| Phase | Effect | Status | Assigned |
|-------|--------|--------|----------|
| 1.1 | SVF Filter | ✅ Complete | 2025-03-04 |
| 1.2 | Stereo Delay | ✅ Complete | 2025-03-04 |
| 1.3 | Compressor | ✅ Complete | 2025-03-04 |
| 1.4 | Wave Shaper | 🔲 Not Started | |
| 1.5 | Chorus | 🔲 Not Started | |
| 2.1 | Granulator | 🔲 Not Started | |
| 2.2 | Stutter | 🔲 Not Started | |
| 2.3 | Shimmer | 🔲 Not Started | |
| 2.4 | Widener | 🔲 Not Started | |
| 2.5 | Phaser | 🔲 Not Started | |
| 3.1 | Multitap | 🔲 Not Started | |
| 3.2 | Pitch Shifter | 🔲 Not Started | |
| 3.3 | Transient | 🔲 Not Started | |
| 3.4 | Ring Mod | 🔲 Not Started | |
| 3.5 | Bit Crusher | 🔲 Not Started | |
| 3.6 | Formant | 🔲 Not Started | |
| 3.7 | Reverse Delay | 🔲 Not Started | |
| 4.1 | Envelope | 🔲 Not Started | |
| 4.2 | Pitch Detect | 🔲 Not Started | |
| 4.3 | Crossfader | 🔲 Not Started | |
| 4.4 | Mixer | 🔲 Not Started | |
| 4.5 | Noise | 🔲 Not Started | |
| 4.6 | M/S | 🔲 Not Started | |

---

## Notes

- **Oversampling:** Distortion and ring mod benefit from 2x or 4x oversampling with AA filtering
- **Wet/Dry:** All effects should have mix control for parallel processing
- **Presets:** Consider preset system for common settings ("Tape Saturation", "Vocal Plate", etc.)
- **CPU Monitoring:** Add CPU usage estimation per node for debugging

---

## Lessons Learned: SVFNode & StereoDelayNode Implementation (March 2025)

### What Went Wrong
After implementing SVFNode and StereoDelayNode (C++ classes, Lua `new_usertype`, factory functions), UI parameters appeared but **did nothing**. Sliders moved but audio didn't change. Only `setMix()` worked because it was accidentally bound through a different code path.

### Root Cause
**Missing parameter bindings in `paramsTable["bind"]` lambda** (`DSPPluginScriptHost.cpp`).

The binding system requires explicit C++ type checks for each node type:
```cpp
if (auto node = std::dynamic_pointer_cast<dsp_primitives::YourNode>(node)) {
  if (method == "setParam") {
    newParamBindings[path] = [node](float v) { node->setParam(v); };
    return true;
  }
}
```

Without this, `ctx.params.bind("/path", node, "setParam")` fails **silently** (returns `false`, unchecked).

### The Full Stack (4 Layers Required)
When adding a new node, you MUST touch:

1. **Node Implementation** - `dsp/core/nodes/YourNode.h/cpp`
2. **Lua Type Registration** - `new_usertype<YourNode>` in `DSPPluginScriptHost.cpp`
3. **Factory Function** - `primitives["YourNode"] = ...` table with `new` lambda
4. **Parameter Bindings** - `dynamic_pointer_cast` checks in `paramsTable["bind"]`

### Debugging That Failed
- **GDB/Printfs**: Node processed audio correctly; no crash to catch
- **IPC/Socket testing**: Confirmed audio flow but not binding failure
- **Algorithm tweaks**: Delay math was correct; issue was wiring, not DSP

### What Actually Worked
**Reading the fucking code.**
1. Found working example (`FilterNode`) in `params.bind` implementation
2. Noticed explicit pattern: every node has its own `dynamic_pointer_cast` block
3. Realized new nodes had **no entries** in this function
4. Added missing blocks → immediate fix

### Key Insight
> When UI shows controls but they don't affect audio, suspect **missing parameter bindings**, not DSP logic errors.

The `params.bind()` failure is silent. The Lua script runs without errors. UI generates sliders. But no C++ lambda connects the slider value to the node method.

### Prevention
Add this checklist to every new node PR:
- [ ] Node class implements `IPrimitiveNode`
- [ ] `new_usertype` registered with all public methods
- [ ] Factory function added to `primitives` table
- [ ] **Parameter bindings added for each settable parameter**
- [ ] `toPrimitiveNode` updated for `graph.connect()` support
- [ ] Test script verifies parameter changes affect audio output

---

## Parameter Smoothing Pattern

All DSP nodes must implement parameter smoothing to prevent zipper noise. This is a **required pattern** for all new nodes.

### The Pattern

**Header (.h):**
```cpp
#include <atomic>

class MyNode : public IPrimitiveNode {
public:
    void setParam(float value) { 
        targetParam_.store(juce::jlimit(min, max, value), std::memory_order_release); 
    }
    float getParam() const { 
        return targetParam_.load(std::memory_order_acquire); 
    }

private:
    std::atomic<float> targetParam_{defaultValue};  // Thread-safe target
    float currentParam_ = defaultValue;              // Smoothed value for DSP
    float smoothingCoeff_ = 1.0f;                    // Calculated in prepare
};
```

**Implementation (.cpp):**
```cpp
void MyNode::prepare(double sampleRate, int maxBlockSize) {
    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
    // 20ms for critical params (cutoff, pitch, time), 10ms for others
    const double smoothingTime = 0.02;  // or 0.01
    smoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTime * sr)));
    smoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, smoothingCoeff_);
    
    currentParam_ = targetParam_.load(std::memory_order_acquire);
}

void MyNode::process(...) {
    const float target = targetParam_.load(std::memory_order_acquire);
    
    for (int i = 0; i < numSamples; ++i) {
        currentParam_ += (target - currentParam_) * smoothingCoeff_;
        // Use currentParam_ in DSP
    }
}
```

### Time Constants
- **20ms**: Critical params (cutoff, pitch, delay time) - prevents audible artifacts
- **10ms**: Standard params (gain, mix, feedback) - responsive but smooth

### Checklist
- [ ] `#include <atomic>` in header
- [ ] `std::atomic<float> targetXxx_{default}` for each parameter
- [ ] `float currentXxx_ = default` for DSP values  
- [ ] Setters write to `targetXxx_.store(value, std::memory_order_release)`
- [ ] Getters read from `targetXxx_.load(std::memory_order_acquire)`
- [ ] `prepare()` calculates coefficients and initializes current values
- [ ] `process()` interpolates: `current += (target - current) * coeff`
