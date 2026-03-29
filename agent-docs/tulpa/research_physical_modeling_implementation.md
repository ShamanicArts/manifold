# Physical Modeling & Convolution: Implementation Research

## Executive Summary

Research into state-of-the-art techniques for implementing Karplus-Strong, modal synthesis, and real-time convolution for the Manifold palette system. Focus on practical DSP implementation details.

---

## 1. Karplus-Strong & Digital Waveguide Synthesis

### 1.1 Core Algorithm

The classic Karplus-Strong (KS) algorithm consists of:

```
Excitation ──► [Delay Line] ──► [Damping Filter] ──► [Feedback] ──► Output
                    ▲                                       │
                    └───────────────────────────────────────┘
```

**Delay Line:**
- Length L = sampleRate / pitchFrequency
- Integer delay causes quantization to semitones at high pitches
- **Solution:** Fractional delay using Lagrange interpolation or allpass filter

**Fractional Delay Implementation:**
```cpp
// Lagrange interpolation (4-point, 3rd order)
float lagrangeDelay(float* buffer, int readPos, float frac, int bufferSize) {
    float x0 = buffer[(readPos - 1) & (bufferSize - 1)];
    float x1 = buffer[readPos];
    float x2 = buffer[(readPos + 1) & (bufferSize - 1)];
    float x3 = buffer[(readPos + 2) & (bufferSize - 1)];
    
    float c0 = x1;
    float c1 = -0.5f*x0 + 0.5f*x2;
    float c2 = x0 - 2.5f*x1 + 2.0f*x2 - 0.5f*x3;
    float c3 = -0.5f*x0 + 1.5f*x1 - 1.5f*x2 + 0.5f*x3;
    
    return ((c3 * frac + c2) * frac + c1) * frac + c0;
}
```

**Damping Filter:**
- One-pole lowpass: `y[n] = (1-d)*x[n] + d*y[n-1]`
- Dynamic damping based on frequency (higher notes = less damping)
- Shelf filter for brightness control without pitch shift

**Excitation Strategies:**

| Type | Implementation | Use Case |
|------|---------------|----------|
| Noise burst | White/pink noise, short envelope | Classic plucked string |
| Sample snippet | Start of recorded pluck | Authentic instrument attack |
| Impulse | Single sample spike | Testing, impulse response |
| Sine sweep | Chirp 20Hz-20kHz | Rich harmonic excitation |
| Input pass-through | External audio | Processing live input |

### 1.2 Extended KS (EKS) Improvements

**Problem:** Classic KS sounds "plasticky"

**Solutions:**

1. **Allpass Filter for Inharmonicity:**
```cpp
// First-order allpass for stiffness
float allpass(float input, float& state, float coeff) {
    float output = coeff * (input - state) + input;
    state = input;
    return output;
}
```

2. **Dynamic Damping:**
- Higher frequencies lose energy faster
- `damping = baseDamping + frequency * stiffnessFactor`

3. **Multiple Excitation Points:**
- Simulates plucking at different positions
- `excitationPos = 0.1` (near bridge) = brighter
- `excitationPos = 0.5` (middle) = warmer

### 1.3 Digital Waveguide Mesh

For 2D/3D instruments (drums, plates, gongs):

- Bidirectional delay lines in grid topology
- Scattering junctions at intersections
- Memory-intensive but physically accurate
- **Simplification:** Modal synthesis (resonator bank) for complex 2D objects

---

## 2. Modal Synthesis (Resonator Bank)

### 2.1 Theory

Any vibrating object can be modeled as sum of damped sinusoids:

```
output[n] = Σ (amplitude[i] * exp(-decay[i] * n) * sin(2π * frequency[i] * n + phase[i]))
            i=0..N-1
```

**Parameters per mode:**
- Frequency (Hz)
- Amplitude (gain)
- Decay time (seconds)
- Initial phase

### 2.2 Efficient Implementation

**Parallel Second-Order Sections:**
```cpp
struct Resonator {
    float b0, b1, b2;  // Numerator
    float a1, a2;      // Denominator (a0 = 1)
    float x1, x2;      // Input history
    float y1, y2;      // Output history
    
    float process(float input) {
        float output = b0*input + b1*x1 + b2*x2 - a1*y1 - a2*y2;
        x2 = x1; x1 = input;
        y2 = y1; y1 = output;
        return output;
    }
};
```

**Parameter Calculation:**
```cpp
void setResonatorParams(Resonator& r, float freq, float amplitude, float decay, float sampleRate) {
    float omega = 2.0f * M_PI * freq / sampleRate;
    float r_decay = exp(-1.0f / (decay * sampleRate));
    
    r.b0 = amplitude;
    r.b1 = 0.0f;
    r.b2 = -amplitude * r_decay;
    r.a1 = -2.0f * r_decay * cos(omega);
    r.a2 = r_decay * r_decay;
}
```

### 2.3 Physical Parameter Mapping

| Physical Property | Modal Parameter | Effect |
|-------------------|-----------------|--------|
| Mass | Amplitude | Louder modes |
| Stiffness | Frequency | Higher pitch |
| Damping | Decay | Shorter sustain |
| Material | Inharmonicity ratio | Metallic vs wooden |

**Inharmonicity:**
- Strings: `f_n = n * f0 * sqrt(1 + B * n^2)`
- `B` = inharmonicity coefficient (stiffness)
- Piano bass strings have high B
- Steel drums have complex inharmonic relationships

---

## 3. Real-Time Convolution

### 3.1 Convolution Methods

| Method | Latency | CPU | Best For |
|--------|---------|-----|----------|
| Direct (time-domain) | 0 | O(N^2) | IR < 64 samples |
| FFT (block) | High | O(N log N) | Offline, long IRs |
| Uniformly Partitioned | Low | Medium | Real-time, medium IRs |
| Non-uniformly Partitioned | Very low | Medium-High | Real-time, variable IRs |

### 3.2 Uniformly Partitioned Convolution

Divide IR into blocks of size B:

```
IR:     [Block 0][Block 1][Block 2]...[Block N]
Input:  [Block 0][Block 1][Block 2]...

Output += FFT_convolve(Input_Block_i, IR_Block_i) delayed appropriately
```

**Algorithm:**
```cpp
class PartitionedConvolver {
    static constexpr int BLOCK_SIZE = 128;  // Adjust for latency vs CPU
    
    std::vector<std::vector<std::complex<float>>> irPartitions;
    std::vector<std::complex<float>> fftBuffer;
    std::vector<std::complex<float>> outputAccum;
    
public:
    void setIR(const float* ir, int length) {
        int numPartitions = (length + BLOCK_SIZE - 1) / BLOCK_SIZE;
        irPartitions.resize(numPartitions);
        
        for (int p = 0; p < numPartitions; p++) {
            // Zero-pad to 2*BLOCK_SIZE, FFT
            irPartitions[p] = fftBlock(ir + p*BLOCK_SIZE, BLOCK_SIZE);
        }
    }
    
    void process(const float* input, float* output, int samples) {
        // Collect input into blocks
        // FFT each input block
        // Complex multiply with IR partitions
        // Accumulate with appropriate delay
        // IFFT and output
    }
};
```

**Latency:** Minimum 2 * BLOCK_SIZE samples

### 3.3 Real-Time IR Capture

**Challenges:**
1. IR capture must not glitch audio
2. Switching IRs smoothly (crossfade)
3. Memory management for multiple IRs

**Implementation:**
```cpp
class LiveIRCapture {
    std::vector<float> irBuffer;
    std::atomic<bool> capturing{false};
    std::atomic<int> capturePosition{0};
    
public:
    void startCapture(int length) {
        irBuffer.resize(length);
        capturePosition = 0;
        capturing = true;
    }
    
    void processSample(float sample) {
        if (capturing.load()) {
            int pos = capturePosition.fetch_add(1);
            if (pos < irBuffer.size()) {
                irBuffer[pos] = sample;
            } else {
                capturing = false;
                notifyIRReady();
            }
        }
    }
};
```

**Smooth IR Switching:**
- Keep two convolvers (A/B)
- Crossfade over 10-50ms when switching
- Pre-compute FFT of new IR in background thread

### 3.4 Convolution Optimization for Manifold

**Given constraints:**
- Real-time, low latency required
- Multiple voices/instances
- Live IR capture

**Recommendations:**

1. **Fixed IR Size:** Limit to 1-2 seconds (48000-96000 samples @ 48k)
2. **Block Size:** 64-128 samples for low latency
3. **Voice Sharing:** Polyphonic voices share same IR (convolver per voice, same IR)
4. **Quality Modes:**
   - Draft: 256-pt FFT (lower quality, less CPU)
   - Normal: 1024-pt FFT
   - High: 2048-pt FFT (better for long IRs)

---

## 4. Feedback Delay Networks (FDN)

### 4.1 Architecture

```
        ┌────[Delay 1]────┐
        │         ↓       │
Input ──┼────[Delay 2]────┼──[Matrix]──┬──► Output
        │         ↓       │            │
        ├────[Delay 3]────┤            │
        │         ↓       │            │
        └────[Delay 4]────┘            │
                                      ─┘
```

**Key components:**
- N delay lines (typically 4-16)
- Feedback matrix (N×N)
- Absorption filters per delay line

### 4.2 Delay Line Lengths

- Prime or coprime numbers (in samples)
- Prevents periodicity in impulse response
- Typical: 1000-3000 samples @ 48kHz

### 4.3 Feedback Matrix

**Hadamard Matrix (orthogonal, energy preserving):**
```cpp
// 4x4 Hadamard (unnormalized)
float H[4][4] = {
    {1,  1,  1,  1},
    {1, -1,  1, -1},
    {1,  1, -1, -1},
    {1, -1, -1,  1}
};
// Normalize by 1/2
```

**Householder Matrix:**
- `H = I - 2 * v * v^T / (v^T * v)`
- More control over diffusion

### 4.4 Applications for Palette

**RESONATOR BANK + FDN:**
- Modal synthesis → FDN for complex decay
- Each resonator output feeds FDN input
- FDN output mixed with dry resonators

**PLUCK + FDN:**
- Simple Karplus resonator → FDN for "body"
- Simulates guitar body resonance without convolution
- Lower CPU than full convolution

---

## 5. Excitation-Resonance Interaction

### 5.1 Excitation Types

| Type | Model | Parameter |
|------|-------|-----------|
| Struck | Noise burst + envelope | Hardness (envelope attack) |
| Plucked | Noise burst (short) | Position (filter freq) |
| Bowed | Sustained noise/ramp | Pressure (noise amplitude) |
| Blown | Bandpass noise | Embouchure (filter Q) |

### 5.2 Interaction Modeling

**Hammer-String (Piano):**
- Non-linear interaction (harder hit = brighter)
- Multiple model parameters from velocity

**Bow-String (Violin):**
- Self-sustaining (no decay)
- Stick-slip friction model
- More complex than simple excitation

**For Palette Implementation:**
- Start with simple excitation (noise/sample)
- Add velocity → brightness mapping
- Advanced: physical interaction models as future enhancement

---

## 6. Hybrid Techniques for Manifold

### 6.1 Sample + Physical Model Crossfade

```
Sample Playback ──┐
                  ├──[Crossfade]──► Output
Resonator ────────┘

Crossfade triggered by:
- Time (attack → sustain)
- Amplitude threshold
- User control (modulation)
```

### 6.2 Spectral Modeling + Physical Model

Use existing partial analysis to tune resonators:

```cpp
// From SampleRegionPlaybackNode partials
PartialData partials = samplePlayback.getLastPartials();

// Tune resonator bank to match
for (int i = 0; i < numModes; i++) {
    resonator[i].setFrequency(partials.frequencies[i]);
    resonator[i].setDecay(partials.amplitudes[i] * globalDecay);
}
```

### 6.3 Live Input Processing Chain

```
Audio Input ──►[Transient Detect]──►[Exciter]──►[Resonator]──►[Convolver]──► Output
                │                      ▲            │              ▲
                └── Trigger ───────────┘            └──────────────┘
                                                    (IR from space capture)
```

---

## 7. Implementation Priorities

### Phase 1: Core Resonator
- Basic Karplus-Strong with fractional delay
- Simple one-pole damping
- Noise burst excitation
- **Result:** PLUCK palette module (basic)

### Phase 2: Extended Resonator
- Allpass filter for inharmonicity
- Multiple excitation types
- Dynamic damping
- **Result:** Full RESONATOR primitive

### Phase 3: Convolution
- Uniformly partitioned convolution
- IR loading from files
- Live IR capture
- **Result:** CONVOLVER primitive

### Phase 4: Bundled Instruments
- EXCITER primitive
- INFINITE effect (sample → resonator crossfade)
- SPACE PLUCK (auto IR capture)
- **Result:** Complete palette modules

### Phase 5: Advanced
- Resonator bank (modal synthesis)
- FDN integration
- Bowed/blowing models
- **Result:** Advanced palette modules

---

## 8. References & Further Reading

### Books
- "Physical Audio Signal Processing" by Julius O. Smith III (free online at ccrma.stanford.edu)
- "Real Sound Synthesis for Interactive Applications" by Perry Cook

### Papers
- Karplus & Strong (1983): "Digital Synthesis of Plucked-String and Drum Timbres"
- Jaffe & Smith (1983): "Extensions of the Karplus-Strong Plucked-String Algorithm"
- Smith (1992): "Physical Modeling Using Digital Waveguides"

### Code Resources
- STK (Synthesis ToolKit): C++ implementations of all these algorithms
- Soundpipe: C library with many physical models
- Guitarix: Open source guitar amp/simulation (convolution)
- Convolution in JUCE: juce::Convolution class (used by Manifold already?)

### Key Insights
1. Fractional delay is essential for accurate pitch
2. Inharmonicity separates "plastic" from "realistic"
3. Partitioned convolution is the standard for real-time
4. Modal synthesis is often preferred over waveguides for complex objects

---

## 9. CPU Budget Estimates

| Module | Estimated CPU (1 voice @ 48k) | Notes |
|--------|------------------------------|-------|
| Basic KS | ~0.5% | Very efficient |
| KS + Allpass | ~0.7% | Still efficient |
| Resonator Bank (8 modes) | ~1.5% | Parallel biquads |
| Convolver (1s IR, 128 block) | ~5-10% | FFT overhead |
| FDN (4 delays) | ~1% | Delay lines + matrix |
| Full PLUCK | ~2% | KS + simple conv |

**Recommendation:** Limit to 4-8 instances of convolver, unlimited resonators.

---

*This research informs the palette module specifications and DSP implementation priorities.*
