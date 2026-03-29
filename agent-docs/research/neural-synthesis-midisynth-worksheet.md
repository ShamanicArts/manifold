# Neural Synthesis in MidiSynth: Research Worksheet

> **Exploratory conversation summary** - capturing feasibility analysis, architecture options, and implementation pathways for adding neural audio synthesis capabilities to Manifold's MidiSynth module.
> 
> **Date**: March 29, 2026  
> **Context**: Greenfield research - ideas pad for future development

---

## 1. Initial Question & Context

**Original Query**: "Nerval sample recentre synthesis" (misheard as "mid-sent")  
**Actual Target**: MidiSynth neural resynthesis capabilities  
**Core Question**: Is real-time neural synthesis feasible within Manifold's existing architecture?

### Current MidiSynth Architecture (as reference)
- 8-voice polyphonic synthesizer
- Per-voice: Oscillator + Noise → VoiceMixer (4 sources)
- Master chain: Filter → Distortion → FX1 → FX2 → Delay → Reverb
- FX slots: 17 selectable effects (Chorus, Phaser, Granulator, etc.)
- Sample playback: `SampleRegionPlaybackNode` with partials extraction
- DSP graph: Lua-driven node system with lock-free runtime

---

## 2. Feasibility Analysis

### 2.1 The Hard Constraints

| Constraint | Limit | Implication |
|------------|-------|-------------|
| Audio thread blocking | **NONE** | Cannot run inference in `processBlock()` without glitching |
| Latency target | <10ms for live performance | Standard phase vocoders (~46ms) are too slow |
| CPU budget | Single-core, no GPU required | Must work on modest hardware |
| Per-voice overhead | Must be minimal | 8 voices × neural inference = CPU suicide |

### 2.2 What IS Possible

**✅ Master Bus FX (Neural Style Transfer)**
- Run on mixed output (1× inference, not 8×)
- Async inference with ring buffer acceptable
- ~10-20ms latency acceptable for FX

**✅ Sample Resynthesis (Offline Analysis)**
- Heavy encoder runs once on sample load (message thread)
- Real-time decoder with cached latents
- Pitch/timbre manipulation via latent interpolation

**✅ Hybrid Neural-LUT Architecture**
- Neural network at control/analysis rate
- LUT-based execution at audio rate
- Guaranteed real-time performance

**❌ Per-Voice Real-Time Neural Oscillator**
- Too CPU intensive for 8 voices
- Would require ~5ms inference × 8 = 40ms+ overhead
- Not feasible without dedicated GPU

---

## 3. Research Paper Findings

### Source
**"Deep Spectral Transformation: Low-Latency DSP Algorithms for Real-Time Sample Resynthesis and Morphing"**  
Located in: `/prototypesandreseearch/Deep Spectral Transformation_ Low-Latency DSP Algorithms for Real-Time Sample Resynthesis and Morphing.pdf`

### 3.1 Key Technical Findings

#### Latency Thresholds (Established Research)
| Category | Latency | Use Case |
|----------|---------|----------|
| **Ultra-low** | <10ms | Live performance, virtual instruments |
| Low | 10-20ms | Interactive synthesis, real-time effects |
| Moderate | 20-50ms | Studio production |
| High | >50ms | Offline rendering |

#### Algorithm Performance
- **Standard phase vocoder**: ~46ms (too slow for live)
- **RAVE**: ~4ms latency (achievable)
- **BRAVE** (RAVE variant): Even lower latency via architectural mods
- **DDSP**: Nearly **10× faster** than prior neural methods

#### The Hybrid Architecture (Recommended Approach)
```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Neural Network │────▶│  LUT Parameters  │────▶│  Bilinear Interp │
│  (Analysis/     │     │  (256×256, 64KB) │     │  (Real-time DSP) │
│   Control Rate) │     │                  │     │                  │
└─────────────────┘     └──────────────────┘     └──────────────────┘
        ↑                                                   ↓
   Sample analysis                                    Audio output
   (heavy, offline)                                  (guaranteed RT)
```

**Why this works:**
- Neural inference runs on message thread (no audio blocking)
- LUT is 64KB cache-friendly structure
- Bilinear interpolation: ~10 multiply-adds per bin
- O(1) lookup in audio thread

### 3.2 Frame Size Trade-offs (48kHz)

| Frame Size | Duration | Freq Resolution | Use Case |
|------------|----------|-----------------|----------|
| 256 | 5.3ms | 187.5 Hz | Transient analysis |
| **512** | **10.7ms** | **93.75 Hz** | **Percussion, plucked strings** ← Sweet spot |
| 1024 | 21.3ms | 46.875 Hz | General purpose |
| 2048 | 42.7ms | 23.44 Hz | Bass analysis |

**512 samples = 10.7ms** - just under "imperceptible" threshold for live performance.

### 3.3 Five Transformation Modes

Per paper, these define the scope for spectral synthesis:

1. **Wave→Sample** (Analysis): STFT, RAVE encoder, DDSP analysis
2. **Sample→Wave** (Synthesis): ISTFT, RAVE decoder, neural vocoder
3. **Sample→Sample** (Direct): LUT-based spectral transformation ⭐
4. **Additive Resynthesis**: DDSP-style sinusoidal + noise
5. **Temporal Morphing**: Interpolate between spectral states

---

## 4. Implementation Approaches

### 4.1 Approach A: Neural FX (Master Bus)

**Concept**: Add "NeuralMorph" as FX slot option (index 17)

**Architecture**:
```lua
-- In midisynth.lua FX_OPTIONS:
{ -- 17: Neural Style Transfer
  label = "NeuralMorph",
  create = function()
    local node = P.NeuralResynthNode.new()
    node:setMode("style_transfer")
    node:loadModel("rave_timbre_morph.onnx")
    return { input = node, output = node, node = node }
  end,
  params = {
    { setter = function(n, v) n:setTimbre(v) end, default = 0.0, label = "Morph" },
    { setter = function(n, v) n:setChaos(v) end, default = 0.0, label = "Chaos" },
    { setter = function(n, v) n:setPreservePitch(v > 0.5) end, default = 1.0, label = "Preserve Pitch" },
  },
}
```

**Technical Strategy**:
- Async inference with ring buffer (~15ms latency acceptable for FX)
- Run decoder in background thread
- Audio thread reads from FIFO with extrapolation on miss

**Pros**:
- Single inference (not per-voice)
- Existing FX chain integration
- Can accept higher latency

**Cons**:
- FX only, not per-voice
- Requires async threading complexity

---

### 4.2 Approach B: Neural Resynth (Sample Mode Extension)

**Concept**: 4th oscillator mode: "Neural" alongside Classic/Sample/Blend

**Workflow**:
```
User loads sample ──▶ Message thread:
                      1. Load audio buffer
                      2. Run RAVE encoder (slow, ~100ms for 1 sec)
                      3. Store latent frames in NeuralResynthNode
                      4. Node ready for real-time playback

User plays MIDI ────▶ Audio thread:
                      1. Interpolate latent frames based on pitch/position
                      2. Queue latent vector to async decoder
                      3. Output decoded audio (~10ms latency)
```

**Lua Integration**:
```lua
local function createVoiceSource(mode)
  if mode == 0 then -- Classic
    return ctx.primitives.OscillatorNode.new()
  elseif mode == 1 then -- Sample
    return ctx.primitives.SampleRegionPlaybackNode.new()
  elseif mode == 2 then -- Blend
    -- existing crossfader setup
  elseif mode == 3 then -- Neural
    local neural = ctx.primitives.NeuralResynthNode.new()
    neural:setMode("synth_playback")
    -- Sample analyzed when user loads it (message thread)
    return neural
  end
end
```

**Key Parameters**:
- `/midi/synth/neural/pitch` - Pitch shift (semitones)
- `/midi/synth/neural/timbre` - 0=original, 1=fully morphed
- `/midi/synth/neural/speed` - Time stretch independent of pitch
- `/midi/synth/neural/chaos` - Random latent walks

**Pros**:
- Per-voice capability (with cached analysis)
- "Transmogrify" effect - sample becomes playable instrument
- Fits existing architecture

**Cons**:
- Sample load latency (~100ms analysis)
- Memory per sample (latent storage ~100KB/sec)

---

### 4.3 Approach C: Hybrid Neural-LUT (Paper's Recommendation)

**Concept**: Neural generates LUTs; DSP executes in real-time

**Implementation Sketch**:
```cpp
class NeuralLUTNode : public IPrimitiveNode {
public:
    // Message thread: heavy neural analysis
    void analyzeSample(const AudioBuffer& sample) {
        // Run RAVE encoder or DDSP analysis
        // Generate 256×256 LUT (64KB)
        // Store in cache-friendly structure
    }
    
    // Audio thread: fast LUT application
    void process(AudioBuffer& buffer) override {
        // Bilinear interpolation through LUT
        // ~10 multiply-adds per bin
        // Guaranteed real-time
    }
    
    // Control: morph between LUTs
    void setMorph(float position);  // Interpolate keyframe LUTs
    
private:
    struct LUT {
        static constexpr int Size = 256;
        float data[Size][Size];  // 64KB for 8-bit, 256KB for 32-bit
    };
    
    std::vector<LUT> keyframes;  // 8-16 keyframes for morphing
    float morphPosition = 0.0f;
};
```

**Supported Transformations via LUT**:

| Effect | LUT Implementation | Visual Pattern |
|--------|-------------------|----------------|
| Volume adjustment | Uniform brightness scaling | Global intensity |
| Dynamic range compression | Darkened upper amplitude | Vertical gradient |
| Equalization | Vertical brightness strips | Horizontal bands |
| Low-pass filtering | Darkened high-freq region | Right half attenuated |
| Frequency shifting | Horizontal LUT displacement | Pattern shifted |
| Pitch shifting | Non-linear horizontal stretch | Compressed/expanded |
| Custom morphing | Arbitrary painted patterns | Complex multi-region |

**Pros**:
- Guaranteed real-time (no inference in audio thread)
- Cache-friendly (64KB LUT in L2)
- Extensible to creative "painted LUT" paradigm
- Can interpolate between keyframes

**Cons**:
- Less flexible than full neural
- Requires LUT generation step

---

### 4.4 Approach D: DDSP-Style Additive Resynthesis

**Concept**: Explicit sinusoidal + noise decomposition (not black-box neural)

**Architecture**:
```
Input Audio ──▶ CREPE F0 estimation ──▶ Harmonic oscillator bank ──▶ Output
                      ↓                              ↑
               Partial amplitude/frequency    Filtered noise residual
               trajectory extraction
```

**Technical Specs**:
- **Primary**: DDSP with CREPE pitch tracking
- **Latency**: 10-20ms (real-time CPU viable)
- **Polyphony**: 64-128 harmonics per voice
- **Noise**: Filtered residual modeling

**Pros**:
- Interpretable parameters (explicit harmonics)
- Direct performer manipulation
- ~10× faster than prior neural methods
- Real-time CPU viable

**Cons**:
- Requires F0 estimation (CREPE adds latency)
- Simpler timbre manipulation than RAVE

---

## 5. Technical Implementation Pathways

### 5.1 CMake Integration

```cmake
option(MANIFOLD_ENABLE_NEURAL "Enable neural synthesis" ON)

if(MANIFOLD_ENABLE_NEURAL)
    # Option A: ONNX Runtime (recommended, ~50MB)
    FetchContent_Declare(
        onnxruntime
        URL https://github.com/microsoft/onnxruntime/releases/download/v1.17.0/onnxruntime-linux-x64-1.17.0.tgz
    )
    
    # Option B: LibTorch (heavier, ~200MB, more flexible)
    find_package(Torch REQUIRED)
    
    target_sources(Manifold PRIVATE
        dsp/core/nodes/NeuralResynthNode.cpp
        dsp/core/nodes/NeuralLUTNode.cpp
        dsp/core/nodes/DDSPResynthNode.cpp
    )
    
    target_compile_definitions(Manifold PRIVATE MANIFOLD_NEURAL_ENABLED=1)
endif()
```

### 5.2 Async Inference Pattern (Critical)

Don't block audio thread:

```cpp
class InferenceWorker {
    moodycamel::ConcurrentQueue<LatentFrame> inputQueue_;
    moodycamel::ConcurrentQueue<std::vector<float>> outputQueue_;
    std::vector<float> lastOutput_;
    
public:
    void run() {
        while (running_) {
            LatentFrame latent;
            if (inputQueue_.try_dequeue(latent)) {
                // Run ONNX decoder in background
                std::vector<float> audio = runDecoder(latent);
                outputQueue_.enqueue(audio);
            }
        }
    }
    
    void processBlock(float* output, int numSamples) {
        std::vector<float> audio;
        if (outputQueue_.try_dequeue(audio)) {
            // Success - copy decoded audio
            std::copy(audio.begin(), audio.end(), output);
            lastOutput_ = audio;
        } else {
            // Missed deadline - extrapolate or decay
            for (int i = 0; i < numSamples; ++i) {
                output[i] = lastOutput_[i] * 0.99f;  // Decay
            }
        }
    }
};
```

### 5.3 Model Export Workflow (Python)

```python
# Export RAVE to ONNX for Manifold
import torch
from rave import RAVE

model = RAVE.load("drums.ckpt")
model.eval()

# Export encoder (runs on message thread)
dummy_audio = torch.randn(1, 1, 65536)  # 1.5s at 44.1k
torch.onnx.export(
    model.encoder,
    dummy_audio,
    "drums_encoder.onnx",
    input_names=["audio"],
    output_names=["latents"],
    dynamic_axes={"audio": {2: "length"}}
)

# Export decoder (runs in async worker)
dummy_latent = torch.randn(1, 16, 1)  # 16-dim latent
torch.onnx.export(
    model.decoder,
    dummy_latent,
    "drums_decoder.onnx",
    input_names=["latent"],
    output_names=["audio"]
)
```

---

## 6. Recommended Roadmap

### Phase 1: Neural FX (Weekend Hack)
- [ ] Add ONNX Runtime to CMake
- [ ] Create `NeuralResynthNode` with FX mode only
- [ ] Hardcode a test model
- [ ] Async inference with ring buffer
- [ ] Add to FX slot 17

### Phase 2: Sample Resynthesis
- [ ] Synth mode with latent playback
- [ ] Sample analysis pipeline (message thread)
- [ ] Latent interpolation (pitch/timbre)
- [ ] Lua integration for params

### Phase 3: Hybrid LUT System (Paper's Approach)
- [ ] Implement `NeuralLUTNode`
- [ ] LUT generation from neural analysis
- [ ] Keyframe system for temporal morphing
- [ ] "Painted LUT" creative interface

### Phase 4: Optimization
- [ ] Model quantization (4-10× size reduction)
- [ ] GPU inference option
- [ ] Multiple model support
- [ ] Latency tuning per platform

---

## 7. Open Questions & Risks

### Technical Risks
1. **Model Size**: RAVE = 17.6M params (~100MB). Need quantization/pruning for embedded.
2. **First Inference Hitch**: ONNX Runtime warmup causes glitch. Need dummy inference on load.
3. **Pitch Shifting**: RAVE doesn't do pitch naturally. Need DDSP or harmonic model for that.
4. **Memory Pressure**: Latent storage is ~100KB/sec of audio. 30-second sample = 3MB.

### Design Questions
1. Should neural FX be per-slot or dedicated module?
2. How to handle model loading in Lua? (path resolution, bundling)
3. GUI for "painted LUT" design? (image-based spectral editing)
4. Real-time vs offline quality trade-off configuration?

### Dependencies
- ONNX Runtime vs LibTorch vs custom inference
- Model distribution (user-provided vs bundled)
- GPU requirement (optional vs required)

---

## 8. Related Work & References

### Models Mentioned
- **RAVE**: Real-time Audio Variational autoEncoder (IRCAM) - ~4ms latency
- **BRAVE**: RAVE variant with architectural mods for lower latency
- **DDSP**: Differentiable Digital Signal Processing (Google) - 10× faster inference
- **CREPE**: Convolutional Representation for Pitch Estimation

### Papers/Documents
- This worksheet: `/agent-docs/research/neural-synthesis-midisynth-worksheet.md`
- Deep Spectral Transformation: `/prototypesandreseearch/Deep Spectral Transformation_ Low-Latency DSP Algorithms for Real-Time Sample Resynthesis and Morphing.pdf`

### Existing Manifold Components
- `SampleRegionPlaybackNode` - Sample playback with partials extraction
- `GranulatorNode` - Granular synthesis (similar latency constraints)
- `PartialsExtractor` - Harmonic analysis (existing analysis pipeline)
- `SineBankNode` - Additive resynthesis (for DDSP approach)

---

## 9. Quick Decision Matrix

| Goal | Recommended Approach | Latency | Complexity |
|------|---------------------|---------|------------|
| Master bus FX | NeuralResynthNode (async) | ~15ms | Medium |
| Sample playback | RAVE encoder/decoder | ~10ms | High |
| Guaranteed RT | NeuralLUTNode (hybrid) | ~5ms | Medium |
| Explicit control | DDSP additive | ~15ms | Medium |
| Minimal memory | LUT-based only | ~5ms | Low |

---

## 10. Next Steps (When This Gets Picked Up)

1. **Proof of Concept**: Implement simplest approach (Neural FX with hardcoded model)
2. **Latency Testing**: Measure actual end-to-end latency with test signals
3. **CPU Profiling**: Check load with 8 voices + neural FX
4. **User Testing**: Evaluate <10ms vs <20ms perceptual difference
5. **Model Training**: Export RAVE/DDSP models for test sounds

---

**Status**: Greenfield research - ready for prototyping when prioritized  
**Last Updated**: March 29, 2026  
**Owner**: TBD
