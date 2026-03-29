# Karplus-Strong × Convolution × Live Samples: Novel Fusion Techniques

## Core Concept

Combine three paradigms:
- **Karplus-Strong**: Physical modeling (delay-line resonance)
- **Convolution**: Impulse response characterization  
- **Live Sampling**: Real-time capture and manipulation

Create hybrid instruments that blur the line between "played sample" and "synthesized physical model."

---

## 1. Excitation-Resonance Separation

### Architecture
```
Live Input / Sample
    ↓
[Excitation Extractor]  ← captures transient/attack characteristics
    ↓
[Karplus Resonator]     ← delay-line with controllable feedback/damping
    ↓
[Convolution Body]      ← IR shapes the resonant characteristics
    ↓
Output
```

### Implementation Concepts

**Excitation Extractor**:
- Use transient detection (from your `TransientShaperNode`) to isolate attack
- OR: Use spectral analysis to separate noisy (excitation) from tonal (resonance)
- The "pluck" or "strike" becomes the excitation signal

**Karplus as Resonator**:
- Delay line tuned to desired pitch
- Feedback coefficient controls "sustain"
- Damping filter (lowpass) controls brightness decay

**Convolution as Body**:
- Real-time IR capture from live input
- OR: Use sample segments as IRs
- Position control: move through the IR (like wavetable scanning)

**Crossfade Morphing**:
- Morph between "dry sample" → "physical model" → "convolved body"
- Per-grain or per-note control

---

## 2. Live IR Karplus ("Resonance Sampling")

### Concept
Capture the resonant response of real objects and use them as Karplus-Strong feedback filters.

### How It Works

1. **IR Capture Mode**:
   - Excite a space/object (clap, click, sweep)
   - Record the impulse response
   - OR: Use loop recording to continuously capture IRs

2. **Karplus Integration**:
   ```cpp
   // Instead of simple lowpass in feedback loop:
   feedbackSignal = delayLine.read();
   shapedFeedback = convolve(feedbackSignal, liveIR);
   delayLine.write(input + shapedFeedback * feedbackGain);
   ```

3. **Results**:
   - Pluck a string → sounds like it's inside the captured space
   - Real-time IR morphing (crossfade between captured IRs)
   - "Impossible" instruments: guitar body + bell IR + spring reverb IR

### Novel Parameters
- `irCaptureTrigger` — capture new IR from input
- `irMorphPosition` — scan through multiple IRs
- `irFreeze` — lock current IR, continue processing
- `feedbackPosition` — where in delay line to apply IR shaping

---

## 3. Sample-Guided Physical Model

### Concept
Use sample characteristics to drive Karplus-Strong parameters.

### Implementation

**Pitch Tracking → Karplus Tuning**:
- `PitchDetectorNode` analyzes sample
- Automatically tune Karplus delay line to match
- Sample plays, physical model sustains

**Amplitude Envelope → Feedback Control**:
- `EnvelopeFollowerNode` tracks sample dynamics
- Map to Karplus feedback (loud sample = more resonance)

**Spectral Centroid → Damping Control**:
- Bright samples → less damping (brighter sustain)
- Dark samples → more damping (warmer sustain)

### Live Sampling Integration

**"Infinite Sustain" Mode**:
1. Play note → sample plays normally
2. Note release → sample freezes, crossfades to Karplus model
3. Karplus sustains indefinitely using sample's characteristics
4. New note → new sample capture, new model parameters

**Granular + Physical Model Hybrid**:
- Sample triggers Karplus excitation
- Karplus provides "glue" between grains
- Convolution provides spatialization

---

## 4. Convolution as Excitation Source

### Reverse Architecture
```
Impulse Response (captured live or loaded)
    ↓
[IR Scanner]            ← scan through IR like wavetable
    ↓
[Karplus Resonator]     ← use IR sample as excitation
    ↓
Output
```

### Use Cases

**"Reverse Karplus"**:
- Instead of noise burst → use IR as excitation
- Play IR at different speeds/pitches
- Karplus adds resonance

**Sample Mangling**:
- Capture 1-second of live audio
- Use as excitation for tuned resonator
- Results in "pitched" versions of chaotic input

**Feedback Loop**:
- Output fed back into IR capture
- System becomes self-resonant
- Create drones from any input

---

## 5. Multi-Layer Crossfade System

### Concept
Your crossfade live sampling + physical model + convolution in one unified node.

### Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    Sample Layer                          │
│  [Live Capture] ──crossfade──► [Playback]                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│               Physical Model Layer                       │
│  [Karplus Resonator] ◄──excitation── [Sample Analysis]  │
│         │                                               │
│         └──► [Convolution Body]                         │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Morph Controller                        │
│  Sample ──morph──► Model ──morph──► Convolved           │
│  (attack)         (sustain)        (space)              │
└─────────────────────────────────────────────────────────┘
```

### Novel Parameters

**Time-Based Morphing**:
- `attackTime`: How long to stay in sample mode
- `decayTime`: Transition to physical model
- `sustainTime`: Hold physical model
- `releaseTime`: Fade to convolved tail

**Interactive Morphing**:
- `morphPosition`: Manual crossfade (0=sample, 0.5=model, 1=convolved)
- `velocityToMorph`: Harder playing → faster transition to model
- `pitchToMorph`: Higher notes → more convolution "sparkle"

**Live IR Capture**:
- `captureIROnNote`: Capture IR every time note plays
- `irBlend`: Mix between captured IR and preset IRs
- `irFeedback`: How much output feeds back into IR (evolving spaces)

---

## 6. Feedback Delay Network + Convolution

### Advanced Architecture

Instead of single Karplus delay line, use Feedback Delay Network (FDN):

```
Input
  ↓
[Excitation] ─────────────────────────────┐
  ↓                                         │
[Delay Line 1] ──► [Convolution IR 1] ────┤
[Delay Line 2] ──► [Convolution IR 2] ────┼──► Mix ──► Output
[Delay Line 3] ──► [Convolution IR 3] ────┤
[Delay Line 4] ──► [Convolution IR 4] ────┘
  ↑_________________________________________│
            Feedback Matrix
```

### Why This Matters

- **Multiple resonances**: Each delay+convolution pair = different "mode"
- **Complex decay**: Matrix feedback creates natural decay characteristics
- **Live IR per voice**: Each delay line can have different captured IR
- **Impossible spaces**: Mix spring reverb + cathedral + metallic pipe

### Novel Features

**Per-Note IR**:
- Each note captures its own IR from room ambience
- Play → space is "sampled" → note sustains in that space
- Chords = multiple spaces simultaneously

**IR Granulation**:
- Granular processing on IR before convolution
- Chop IR into grains, reorder, reverse
- "Shimmer" effect on reverb tails

---

## 7. Live Input as Modulation Source

### Concept
Use live input characteristics to modulate all three systems continuously.

### Implementation

**Amplitude Follower**:
- Live input loudness → Karplus feedback amount
- Whisper = dry sample, Shout = full resonance

**Spectral Flux**:
- Rate of spectral change → convolution IR morph speed
- Static input = static IR, Moving input = evolving space

**Zero-Crossing Rate**:
- Noisiness detection → blend between sample (noisy) and model (tonal)
- Speech → sample, Singing → model

**Onset Detection**:
- Every transient triggers new IR capture
- Rhythmic playing = rhythmically evolving resonances

---

## 8. Preset Architectures

### "Infinite Guitar"
- Sample plays attack
- Crossfades to Karplus tuned to sample pitch
- Convolution adds "amp in room" resonance
- Result: Guitar note that sustains forever

### "Liquid Piano"
- MIDI triggers sample (piano note)
- Karplus adds sympathetic string resonance
- Convolution adds hall reverb
- Morph: Dry piano → sympathetically resonant → underwater hall

### "Granular Physicality"
- Live input granulated
- Each grain triggers Karplus "pluck"
- Convolution smears grains together
- Result: Granular cloud with physical cohesion

### "Space Sculpture"
- Capture IR from hand claps in different locations
- Karplus tuned to drum pitch
- Morph through captured spaces
- Result: Drum kit played in morphing architecture

---

## Integration with Manifold

### New Node: `HybridResonatorNode`

```cpp
class HybridResonatorNode : public IPrimitiveNode {
    // Input: Audio (live or sampled)
    // Output: Processed audio with morphing layers
    
    // Modes:
    enum Mode {
        SAMPLE_ONLY,           // Pass-through with capture
        KARPLUS_ONLY,          // Pure physical model
        CONVOLUTION_ONLY,      // Pure convolution
        SAMPLE_TO_KARPLUS,     // Crossfade over time
        KARPLUS_TO_CONV,       // Crossfade over time
        FULL_HYBRID            // All three blended
    };
    
    // Key parameters:
    void setMode(Mode mode);
    void setMorphPosition(float pos);  // 0-1 across layers
    void triggerIRCapture();           // Capture new IR from input
    void setKarplusPitch(float midiNote);
    void setFeedback(float amount);    // Karplus feedback
    void setIRBlend(float dryWet);     // Convolution mix
};
```

### Lua Interface

```lua
-- In DSP script
{
    type = "hybrid_resonator",
    id = "live_instrument",
    params = {
        mode = "sample_to_karplus",
        morph_position = 0.5,
        karplus_pitch = "auto",  -- from pitch detection
        ir_capture_trigger = "note_on",
        feedback = 0.85,
        ir_blend = 0.4
    }
}
```

---

## Research Questions

1. **Real-time IR capture latency**: How quickly can we capture and apply IRs without glitching?

2. **Pitch detection accuracy**: Fast enough to tune Karplus per-note in real-time?

3. **Memory usage**: Multiple IRs + delay lines per voice = ?

4. **Crossfade curves**: Linear? Equal power? Perceptually smooth?

5. **Feedback stability**: Live IRs might create unstable feedback loops—how to prevent?

---

## Next Steps

1. **Prototype**: Build simple Sample→Karplus crossfader first
2. **Test**: Pitch tracking accuracy with your `PitchDetectorNode`
3. **Expand**: Add convolution layer
4. **Optimize**: Profile memory and CPU with multiple voices
5. **Design**: Lua API for intuitive control

---

*This fusion could be Manifold's signature sound: the boundaries between "sampled" and "synthesized" completely dissolved.*
