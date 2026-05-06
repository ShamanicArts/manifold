# Shader-Audio Bridge — Decomposition Worksheet

**Date:** 2026-05-03 (v1)
**Status:** DRAFT — Researched findings complete, solution space documented
**Audience:** Agents evaluating or implementing the Shader-Audio bridge
**Prior art:**
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` — Insight #6 (Shader-Audio Bridge Built but Not Connected, High confidence)
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim08.md` — DSP Algorithm Patterns (FFT, phase vocoder, spectrum analysis)
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim10.md` — Visual Feedback Systems (audio-to-texture, ISF, Shadertoy patterns)
- `agent-docs/Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` — Insight #8 (Systemic Testing) — the PitchDetectorNode warning
- `agent-docs/260503_graph_compiler_optimization_worksheet.md` — Prior worksheet methodology

---

## 1. Executive Summary

Manifold has two complete but disconnected subsystems:

1. **Spectral analysis pipeline** — `PhaseVocoderNode` computes a full FFT spectrum (512–4096 samples, Hann windowed, 75% overlap). `SpectrumAnalyzerNode` provides 8 frequency bands. Both run on the audio thread every block.

2. **GPU shader pipeline** — `ShaderEffectRegistry` manages **29 GLSL shaders** with JSON metadata. `ShaderSurfaceProvider` renders them to OpenGL textures, already has a multi-pass compositing pipeline with FBOs, and critically **already has an `InputResolver` callback** that dispatches input textures by `sourceType`/`sourceId`.

The two never talk to each other. The research flags this as **High confidence, Low effort** — the infrastructure exists, the seam exists, the data exists. The missing piece is one component that reads FFT data and uploads it as a GL texture, and optionally a reverse path that reads rendered output back and converts to audio.

### Bidirectional Architecture

```
                         FORWARD BRIDGE
  Audio Thread                             Message/GPU Thread
  PhaseVocoderNode    ───►   AudioTextureProvider
  FFT data (2048 bins)        glTexSubImage2D() every frame
                                │
                                ▼
                          GL_LUMINANCE texture (1D)
                          bound as iChannel0 to all 29 shaders
                          via existing InputResolver dispatch

                         REVERSE BRIDGE
  Audio Thread                             Message/GPU Thread
  ▲                            glReadPixels() / PBO async map
  │                            (on non-RT thread, non-blocking)
  │                                │
  │                                ▼
  │                           IFFT (if spectral output) or
  │                           direct float extraction
  │                                │
  SPSC ring buffer ◄────────────────┘
  (mirror AudioCaptureRing pattern)
        │
        ▼
  ShaderAudioInputNode (new IPrimitiveNode)
  reads ring buffer in process()
```

---

## 2. Researched Findings — Codebase Anatomy

### 2.1. The Shader Pipeline (Already Extensible)

**File:** `manifold/primitives/shaders/ShaderSurfaceProvider.h`

The critical existing seam is the `InputResolver` callback:

```cpp
using InputResolver = std::function<ResolvedInputTexture(
    const std::string& sourceType,    // e.g., "generator", "video", could be "audio"
    const std::string& sourceId,
    const RuntimeNode& node,
    int width, int height,
    double timeSeconds)>;

struct ResolvedInputTexture {
    std::uintptr_t textureHandle = 0;  // GL texture ID
    int width = 0;
    int height = 0;
    uint64_t sequence = 0;
};
```

This is called at line 747 in `ShaderSurfaceProvider.cpp`:
```cpp
if (!impl.inputResolver) {
    // ...
}
resolvedSource = impl.inputResolver(state->sourceType, state->sourceId,
                                     node, width, height, timeSeconds);
```

The resolver is already wired into the render loop. Adding `sourceType == "audio"` support is registering one new handler.

**Render pipeline** (ShaderSurfaceProvider.cpp, lines 880-920):
- Uses `GL_TEXTURE0`, `GL_TEXTURE1`, `GL_TEXTURE2` for binding up to 3 input textures per pass
- Binds `pass.colorTex` as the current pass's render target
- Calls `applySurfaceUniformBlock()` to set uniforms from JSON descriptors
- Has a composite FBO pipeline (lines 936-984) for blend operations between passes

### 2.2. The Shader Registry

**File:** `manifold/primitives/shaders/ShaderEffectRegistry.h`

```cpp
struct ParamSpec {
    std::string id;
    std::string name;
    std::string unit;
    float min, max, defaultValue, step;
};

struct EffectSpec {
    std::string id, name, category, description;
    EffectCategory effectCategory;
    std::vector<ParamSpec> params;
};

struct ShaderDefinition {
    EffectSpec spec;
    std::string fragmentPreamble;
    std::string fragmentBody;
};
```

**29 GLSL shaders** live in `manifold/shaders/*.glsl`:

| Category | Shaders |
|----------|---------|
| Visual effects | chromatic, datamosh, edge-glow, edge-trails, fluid-smoke, fractal-echo, glitch, kaleidoscope, luma-feedback, neon-edge, none, optical-flow, pixel-sort, pixelate, posterize, psychedelic, rgb-split, ripple, time-smear, trail, trail-dissolve, vhs, wave |
| Blend ops | normal, add, multiply, difference, overlay, screen |
| Generators | checker, fbm, noise, plasma |
| User | invert (UserScripts/shaders/) |

Each `.glsl` file has a paired `.json` manifest. The existing `applySurfaceUniformBlock()` (line 86 of ShaderSurfaceProvider.cpp) handles setting GLSL uniforms from JSON — this is where audio-derived uniforms would be injected.

### 2.3. The Spectral Data Sources

**Full FFT spectrum — PhaseVocoderNode:**

**File:** `dsp/core/nodes/PhaseVocoderNode.h`

```cpp
class PhaseVocoderNode : public IPrimitiveNode {
    int fftOrder_ = 11;           // 2^11 = 2048 samples
    int fftSize_ = 2048;
    int hopSize_ = 512;          // fftSize / 4 = 75% overlap
    std::unique_ptr<juce::dsp::FFT> fft_;
    std::vector<float> fftWorkBuffer_;
    // ... phase unwrapping state, overlap-add buffers, resampling state
};
```

- FFT order configurable from 9 (512 samples) to 12 (4096 samples)
- Hann windowing
- 75% overlap (hop = fftSize/4)
- Two modes: bin-mapping pitch shift and time-stretch with resampling
- `getLatencySamples()` returns `fftSize_` (11-93ms at 44.1kHz)
- **No public accessor for the FFT work buffer** — would need to be added
- Phase vocoder latency (fftSize_) means audio→texture sync has inherent delay

**Coarse spectrum — SpectrumAnalyzerNode:**

**File:** `dsp/core/nodes/SpectrumAnalyzerNode.h`

```cpp
class SpectrumAnalyzerNode : public IPrimitiveNode {
    static constexpr int kNumBands = 8;
    std::array<std::atomic<float>, kNumBands> bandsOut_;
    // 8-band filterbank with configurable sensitivity, smoothing, floor
};
```

- 8 frequency bands via fixed filterbank (not FFT-based)
- Band values exposed as atomic floats via `getBand1()` through `getBand8()`
- Works at sample rate with per-sample IIR smoothing
- **Lower latency than PhaseVocoderNode** (no FFT block delay)
- **Coarse resolution** — 8 bands is insufficient for full-spectrum shader texturing

**Implication:** For the forward bridge, `PhaseVocoderNode` is the right full-spectrum source but would need a public FFT accessor added. `SpectrumAnalyzerNode` is good for derived features (bass/mid/treble level) as scalar uniforms.

### 2.4. The Audio Injection Infrastructure (Reverse Bridge)

**File:** `manifold/primitives/control/ControlServer.h` (lines 288-330)

The `AudioCaptureRing` class implements a lock-free SPSC ring buffer:

```cpp
class AudioCaptureRing {
    static constexpr std::size_t CAPACITY = 1 << 20; // ~1M floats
    std::array<float, CAPACITY> buffer{};
    std::atomic<std::size_t> writeIdx{0};
    std::atomic<std::size_t> readIdx{0};
    
    bool write(const float* left, const float* right, int numSamples);
    std::size_t read(float* out, std::size_t maxSamples);
};
```

The `InjectionBuffer` mechanism (ControlServer.h, line 380) already injects pre-recorded audio from a non-RT thread into the audio thread's `CaptureBuffer`:

```cpp
struct InjectionBuffer {
    std::vector<float> samplesL;
    std::vector<float> samplesR;
    int totalSamples = 0;
};
```

Used by `drainInjection()` (ControlServer.cpp, line 698). This is the exact pattern the reverse bridge would follow — a GPU readback thread writes to a ring buffer, the audio thread reads from it in `processBlock()`.

**The `drainInjection()` function** (ControlServer.cpp, line 698-715):
```cpp
int ControlServer::drainInjection(CaptureBuffer& capture, int maxSamples, float gain) {
    bool active = injectionActive.load(std::memory_order_acquire);
    int pos = injectionReadPos.load(std::memory_order_relaxed);
    // ... reads from injectionBuffer, writes to capture ...
}
```

### 2.5. GL Readback Infrastructure

**File:** `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` (lines 936-1001)

The composite FBO already exists:
```cpp
// Line 936-948
if (state->compositeFbo == 0 || state->compositeTex == 0) {
    glGenTextures(1, &state->compositeTex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, targetWidth, targetHeight, ...);
    glGenFramebuffers(1, &state->compositeFbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, state->compositeTex, 0);
}
```

A single-pixel `glReadPixels()` already exists at line 1001 for debug purposes:
```cpp
glReadPixels(0, 0, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, pixel);
```

**Implication:** The FBO and glReadPixels infrastructure is present. Scaling from 1-pixel to full-buffer readback is a parameter change. Adding a PBO for async DMA would be the production-quality approach.

---

## 3. Solution Space

### 3.1. Forward Bridge: AudioTextureProvider

**What it is:** A component that reads FFT data from the audio thread and uploads it as a GL texture on the message/GPU thread.

**Research references:**
- Dim10 — Shadertoy passes FFT data as `iChannel0` texture
- Dim10 — Audio Shader Studio extracts features (bass, treble, centroid, beat) and maps to GLSL uniforms
- Dim10 — ISF standard for shader metadata format
- Dim10 — Deezer mobile GPU visualizer: Accelerate FFT → GL_LUMINANCE texture upload

**Implementation approach:**

A new class `AudioTextureProvider` that:

1. Registers itself in the `ShaderSurfaceProvider`'s `InputResolver` for `sourceType == "audio"`
2. Maintains a 1D `GL_LUMINANCE` texture (width = FFT size / 2 = 1024 for 2048-bin FFT)
3. On each frame, reads the latest FFT magnitude data from `PhaseVocoderNode` (or `SpectrumAnalyzerNode` for coarse data)
4. Uploads via `glTexSubImage2D()` — no reallocation, just data update
5. Returns the texture handle via `ResolvedInputTexture`

```cpp
// Pseudocode for the resolver handler:
ResolvedInputTexture resolveAudioTexture(const std::string& sourceId, ...) {
    // Read FFT magnitude from the shared atomic buffer
    // (PhaseVocoderNode writes to a ring buffer, this reads latest frame)
    for (int i = 0; i < fftSize_ / 2; ++i) {
        luminanceData[i] = magnitudeTodB(magnitudes[i]);
    }
    // Upload to GL texture
    glBindTexture(GL_TEXTURE_2D, audioTex_);
    glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, fftSize_ / 2, 1,
                    GL_LUMINANCE, GL_FLOAT, luminanceData);
    return { audioTex_, fftSize_ / 2, 1, ++sequence_ };
}
```

**Uniform injection (complementary approach):**
Instead of (or in addition to) a full texture, inject derived audio features as scalar uniforms:
- `u_audioLevel` — RMS level (0-1)
- `u_bassLevel` — low frequency energy
- `u_midLevel` — mid frequency energy
- `u_trebleLevel` — high frequency energy
- `u_spectralCentroid` — brightness
- `u_beatDetected` — beat presence (0 or 1)
- `u_bpm` — detected tempo

These would be set in `applySurfaceUniformBlock()` (ShaderSurfaceProvider.cpp, line 86) alongside the existing JSON-defined uniforms.

**Thread safety:**
- `PhaseVocoderNode` writes FFT data on the audio thread
- `AudioTextureProvider` reads it on the message/GPU thread
- A small SPSC ring buffer or double-buffered atomic pointer handles the cross-thread transfer
- Same pattern as `AudioCaptureRing` but for FFT magnitude arrays

**Files touched:**

| File | Change |
|------|--------|
| `manifold/primitives/audio/AudioTextureProvider.h/.cpp` | **New** — manages GL texture, reads FFT data, uploads |
| `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` | Wire AudioTextureProvider into InputResolver at line 747 |
| `manifold/primitives/shaders/ShaderEffectRegistry.h` | Add `audio_reactive` metadata field to EffectSpec |
| `manifold/primitives/shaders/UniformContract.h` | Define audio uniform names |
| `dsp/core/nodes/PhaseVocoderNode.h` | Add public accessor for FFT magnitude data |
| `manifold/shaders/*.json` | Add audio-reactive uniform bindings to shader manifests |

### 3.2. Reverse Bridge: ShaderAudioOutput

**What it is:** A component that reads the final rendered frame back from the GPU, converts pixel data to audio samples, and feeds them into the audio graph.

**Research references:**
- Dim10 — Audio Shader Studio: GPU→CPU readback → audio output
- Dim10 — ISF/Shadertoy model for audio-generating shaders
- Dim08 — `juce::dsp::FFT::performRealOnlyInverseTransform()` for spectral→time conversion

**Two approaches:**

**Approach A — Waveform output (simpler):**
The shader writes raw audio sample values directly as pixel data. One pixel's red channel = one float sample. No FFT/IFFT needed.

```glsl
// Audio-generating shader (waveform mode)
void main() {
    float t = time + gl_FragCoord.x / u_audioTextureWidth;
    float sample = sin(freq * t) * 0.25 + noise(t) * 0.1;
    gl_FragColor = vec4(sample, 0.0, 0.0, 1.0);
}
```

CPU side: read back RGBA pixels, extract red channel as float array, push to ring buffer.

**Approach B — Spectral output (more flexible):**
The shader writes FFT bins. CPU reads back, runs IFFT to convert to time-domain audio.

```glsl
// Audio-generating shader (spectral mode)
void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float bin = texture(iChannel0, uv).r;  // read input spectrum
    float processed = spectralProcess(bin); // filter/morph/distort
    gl_FragColor = vec4(processed, 0.0, 0.0, 1.0);
}
```

CPU side: readback → `juce::dsp::FFT::performRealOnlyInverseTransform()` → ring buffer.

**Implementation architecture:**

```
GPU Thread (message/UI thread):
  ShaderSurfaceProvider renders final frame to composite FBO
    │
    ▼
  PBO (Pixel Buffer Object) for async DMA readback
  glBindBuffer(GL_PIXEL_PACK_BUFFER, pbo);
  glReadPixels(0, 0, width, height, GL_RED, GL_FLOAT, 0);  // non-blocking
    │
    ▼  (later, after glFinish or fence sync)
  glMapBuffer(GL_PIXEL_PACK_BUFFER, GL_READ_ONLY);
  // data is now in CPU-accessible memory without stalling the GL pipeline
    │
    ▼
  if (spectral mode):
      juce::dsp::FFT::performRealOnlyInverseTransform(fftData, fftSize);
  // Convert float array to interleaved stereo
    │
    ▼  (via SPSC queue, non-RT thread → audio thread)
  ShaderAudioInputNode reads from ring buffer
```

**Ring buffer design:**

Follow the existing `AudioCaptureRing` pattern (ControlServer.h, lines 288-330) with a new `ShaderAudioRing`:

```cpp
class ShaderAudioRing {
    static constexpr std::size_t CAPACITY = 1 << 18; // ~262k floats
    std::array<float, CAPACITY> buffer_{};
    std::atomic<std::size_t> writeIdx_{0};
    std::atomic<std::size_t> readIdx_{0};
    
    bool write(const float* samples, int count);
    int read(float* out, int maxSamples);
};
```

**The node interface — ShaderAudioInputNode:**

A new `IPrimitiveNode` that reads from the shader audio ring buffer in `process()`:

```cpp
class ShaderAudioInputNode : public IPrimitiveNode {
    ShaderAudioRing* ring_;  // shared ring buffer with GPU readback thread
    bool hasAudio_{false};
    
    void process(inputs, outputs, numSamples) override {
        if (ring_->read(outputPtr, numSamples) > 0) {
            hasAudio_ = true;
        } else if (!hasAudio_) {
            // No data yet — silence or passthrough
            outputs[0].clear();
        }
        // If partial read, pad with zeros
    }
};
```

**Thread safety:**
- GPU readback runs on message/UI thread (can block for glReadPixels/PBO sync)
- `ShaderAudioRing::write()` called from message thread, uses `memory_order_release`
- `ShaderAudioRing::read()` called from audio thread, uses `memory_order_acquire`
- Identical pattern to `AudioCaptureRing` — proven correct

**Files touched:**

| File | Change |
|------|--------|
| `manifold/primitives/audio/ShaderAudioRing.h/.cpp` | **New** — SPSC ring buffer for GPU→audio data |
| `manifold/primitives/audio/ShaderAudioOutput.h/.cpp` | **New** — manages PBO readback, IFFT, ring buffer write |
| `manifold/dsp/core/nodes/ShaderAudioInputNode.h/.cpp` | **New** — IPrimitiveNode that reads from ring buffer |
| `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` | Add PBO readback of composite FBO after render completes |
| `manifold/primitives/control/ControlServer.h` | Optionally add ShaderAudioRing reference |
| `manifold/primitives/scripting/GraphRuntime.h` | ShaderAudioInputNode is a normal node — no changes needed |

### 3.3. Shader Metadata for Audio Reactivity

The JSON shader manifests need an `audio` field. Reference formats from the research:

**Audio Shader Studio pattern** (uniform-based):
```json
{
    "id": "audio-reactive-glitch",
    "name": "Audio Reactive Glitch",
    "audio": {
        "uniforms": ["u_audioLevel", "u_bassLevel", "u_trebleLevel", "u_beatDetected"],
        "textures": ["iChannel0"]
    }
}
```

**ISF/Shadertoy pattern** (texture-based):
```json
{
    "id": "spectrum-visualizer",
    "name": "Spectrum Visualizer",
    "inputs": [
        {
            "name": "fftAudio",
            "type": "audio",
            "channel": 0
        }
    ]
}
```

---

## 4. Implementation Phases

### Phase 0 — Audio Texture Seam (Forward Bridge, Minimal)
- Add public FFT magnitude accessor to `PhaseVocoderNode`
- Create `AudioTextureProvider` that uploads FFT data to 1D GL_LUMINANCE texture
- Register it in `ShaderSurfaceProvider::InputResolver` for `sourceType == "audio"`
- Add `u_audioLevel`, `u_bassLevel` etc. as standard uniforms in `UniformContract.h`
- Enable one existing shader to react to audio (e.g., modify `kaleidoscope.glsl` to read `u_bassLevel`)

**Deliverable:** Load a project with an audio-reactive visual effect.

### Phase 1 — Shader Audio Output (Reverse Bridge, Proof)
- Create `ShaderAudioRing` (SPSC ring buffer, mirror of `AudioCaptureRing`)
- Create `ShaderAudioOutput` that reads composite FBO via PBO + async readback
- Create `ShaderAudioInputNode` as a new `IPrimitiveNode`
- Wire into a test graph: shader → readback → ring → ShaderAudioInputNode → output

**Deliverable:** A shader that generates a sine tone, read back and played through the audio graph.

### Phase 2 — Full Integration
- IFFT conversion path for spectral-mode shaders
- Shader manifest audio metadata (`audio.uniforms`, `audio.inputs` arrays)
- Automatic uniform injection in `applySurfaceUniformBlock()`
- Performance tuning: PBO double-buffering, texture resolution vs quality tradeoffs
- Add audio-reactive uniform presets to all 29 shader .json manifests

**Deliverable:** Any shader can opt into audio reactivity via its JSON manifest. Any shader can generate audio via its GLSL code.

---

## 5. Risk Register

| # | Risk | Severity | Notes |
|---|------|----------|-------|
| 1 | FFT→texture readback adds latency (PhaseVocoderNode latency + frame sync delay) | Medium | PhaseVocoder latency is fftSize_ samples (~11-93ms). Acceptable for visuals but synchronous path needs compensation. |
| 2 | GPU→CPU readback blocks the message/UI thread | Medium | Mitigated by PBO async DMA. If PBO not available, fall back to glReadPixels on a dedicated readback thread. |
| 3 | Shader evaluates at display refresh rate (60fps), not audio rate (48000fps) | High | A 60fps shader produces 60 samples/second. Audio needs 48000. The shader must output one complete audio block per frame, not one sample per pixel. Shader output texture width = samples per frame. |
| 4 | GL context lifetime conflicts with plugin instance management | Medium | Multiple plugin instances = multiple GL contexts. The AudioTextureProvider must be per-context or shared with synchronization. |
| 5 | IFFT quality: shader writes FFT bins with arbitrary phase relationships, IFFT may produce unexpected results | Medium | Spectral approach requires phase coherence. Waveform approach avoids this entirely. |
| 6 | ShaderAudioInputNode needs to handle underflow (GPU not producing fast enough) | Low | Ring buffer gracefully handles empty reads. Output silence or last valid sample. |

---

## 6. Files Touched (Complete Inventory)

### New Files

| File | Purpose | Bridge Direction |
|------|---------|-----------------|
| `manifold/primitives/audio/AudioTextureProvider.h` | Forward: 1D luminance texture, FFT→GL upload | Forward |
| `manifold/primitives/audio/AudioTextureProvider.cpp` | Implementation | Forward |
| `manifold/primitives/audio/ShaderAudioRing.h` | Reverse: SPSC ring buffer for GPU→audio transport | Reverse |
| `manifold/primitives/audio/ShaderAudioRing.cpp` | Implementation | Reverse |
| `manifold/primitives/audio/ShaderAudioOutput.h` | Reverse: PBO readback, IFFT, ring buffer write | Reverse |
| `manifold/primitives/audio/ShaderAudioOutput.cpp` | Implementation | Reverse |
| `manifold/dsp/core/nodes/ShaderAudioInputNode.h` | Reverse: IPrimitiveNode reading from ring buffer | Reverse |
| `manifold/dsp/core/nodes/ShaderAudioInputNode.cpp` | Implementation | Reverse |

### Modified Files

| File | Change | Bridge Direction |
|------|--------|-----------------|
| `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` | Wire AudioTextureProvider into InputResolver (line 747) | Forward |
| `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` | Add PBO readback of composite FBO after render | Reverse |
| `manifold/primitives/shaders/ShaderSurfaceProvider.h` | Expose composite FBO or render completion callback | Reverse |
| `manifold/primitives/shaders/ShaderEffectRegistry.h` | Add audio metadata to EffectSpec | Both |
| `manifold/primitives/shaders/ShaderEffectRegistry.cpp` | Parse audio metadata from JSON manifests | Both |
| `manifold/primitives/shaders/UniformContract.h` | Add audio uniform constant definitions | Forward |
| `dsp/core/nodes/PhaseVocoderNode.h` | Add public FFT magnitude accessor | Forward |
| `dsp/core/nodes/PhaseVocoderNode.cpp` | Implement FFT magnitude accessor | Forward |
| `manifold/primitives/control/ControlServer.h` | Optionally add ShaderAudioRing reference | Reverse |
| `manifold/core/BehaviorCoreProcessor.cpp` | Instantiate ShaderAudioInputNode in audio graph | Reverse |
| `manifold/shaders/*.json` (29 files) | Add audio-reactive uniform/input declarations | Both |

---

## 7. Research References

### Primary Sources (Kimi Research)

| Document | Section | Relevance |
|----------|---------|-----------|
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_insight.md` | Insight #6 | Shader-Audio bridge gap (High confidence, Low effort) |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim10.md` | Key Findings #1-5 | Audio-to-texture patterns, Shadertoy iChannel0, Audio Shader Studio uniforms, ISF format |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim10.md` | Patterns & Best Practices | Audio-to-Shader Data Path, Composite Texture Rendering |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim10.md` | Relation to Manifold Codebase | ShaderSurfaceProvider, CompositeSurfaceProvider, Canvas/RuntimeNode |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim08.md` | §2 Phase Vocoder | PhaseVocoderNode FFT implementation details |
| `Kimi_Agent_Deep_Repo_Analysis_and_DSP/research/manifold_dim08.md` | §3 Pitch Detection | PitchDetectorNode warning (unreviewed AI-generated code) |
| `agent-docs/260503_graph_compiler_optimization_worksheet.md` | State continuity | PhaseVocoderNode FFT state lost on graph recompilation |

### External Authorities (via Kimi Research)

| Authority | Source | Claim |
|-----------|--------|-------|
| Shadertoy | Dim10 | FFT data passed as `iChannel0` texture, sampled per pixel |
| Audio Shader Studio (sandner-art) | Dim10 | MIT reference: audio features mapped to GLSL uniforms |
| ISF (Interactive Shader Format) | Dim10 | Standardized shader metadata for audio-visual tools |
| OSSIA score | Dim10 | Production ISF integration, Spout/Syphon/NDI video pipeline |
| Deezer mobile GPU visualizer | Dim10 | Accelerate FFT → GL_LUMINANCE texture upload |
| JUCE dsp::FFT | Dim08 | `performRealOnlyInverseTransform()` for spectral→time conversion |
| sndpeek (Princeton, ICMC 2005) | Dim10 | Foundational: real-time audio viz with OpenGL |

---

## 8. Success Criteria

### Forward Bridge
- [ ] `AudioTextureProvider` creates a 1D `GL_LUMINANCE` texture and updates it each frame with FFT magnitude data
- [ ] `ShaderSurfaceProvider::InputResolver` dispatches `sourceType == "audio"` to the audio texture provider
- [ ] At least one existing shader (`kaleidoscope.glsl`) reads `u_bassLevel` or `iChannel0` and reacts to audio
- [ ] Audio-derived uniforms (`u_audioLevel`, `u_bassLevel`, `u_midLevel`, `u_trebleLevel`, `u_spectralCentroid`) are set automatically per frame
- [ ] Thread safety: FFT data is transferred from audio thread to GPU thread via lock-free mechanism with no data tearing

### Reverse Bridge
- [ ] `ShaderAudioRing` passes audio from GPU readback thread to audio thread without data loss or tearing
- [ ] `ShaderAudioOutput` reads the composite FBO via PBO and extracts float data
- [ ] `ShaderAudioInputNode` reads from the ring buffer in `process()` and outputs audio
- [ ] A test shader generating a known waveform (sine at 440Hz) produces the expected output through the audio graph
- [ ] Spectral output mode: IFFT conversion produces coherent time-domain audio from shader-generated FFT bins
- [ ] Underflow (shader producing slower than audio consuming) is handled gracefully with silence or hold

---

## 9. Change Log

| Date | Change |
|------|--------|
| 2026-05-03 | Initial worksheet created. Bidirectional bridge architecture documented from Kimi research and source reading. Forward path (FFT→texture) and reverse path (texture→audio) scoped with file inventories. Existing InputResolver seam identified as the key integration point. |
