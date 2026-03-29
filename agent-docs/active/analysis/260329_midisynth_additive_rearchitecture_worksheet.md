# 290326 MidiSynth Additive / Morph Re-architecture Worksheet

**Status:** Active analysis / implementation worksheet  
**Audience:** Agents, collaborators, DSP implementers, UI collaborators  
**Scope:** MIDI synth project only (`UserScripts/projects/Main`)  
**Primary goal:** Make the synth's deep sample/wave transmogrification architecture stable, performant, and intuitive enough to be a core product feature rather than a CPU trap.

---

## 1. Executive Summary

The MIDI synth's core idea is **deep spectral transformation**:

- wave -> sample
- sample -> wave
- sample -> sample
- sample-derived additive resynthesis
- temporal morphing across evolving sample spectra

That idea is worth keeping.

What is **not** worth keeping is the current split of responsibilities:

- too much real DSP logic in Lua
- too much per-voice/per-block heavy work in hot paths
- a Wave-tab Add implementation that is algorithmically too expensive for what it does
- additive-mode control semantics (`unison / detune / spread`) that do not map cleanly across all modes

### Bottom line

This does **not** need a tiny patch.
It needs a **deliberate architectural split**:

1. **Wave-tab Add** should become a **precomputed/cached spectral wavetable engine**
2. **Sample Add / Morph** should become a **C++ spectral resynthesis engine**
3. **Lua should orchestrate / modulate / read state**, not do the expensive spectral math
4. **Mode-specific controls should be relabeled and/or disabled** where semantics do not make sense

---

## 2. Critical Clarification: What the User Actually Meant

One source of confusion during debugging was conflating different meanings of "Add".

### The important distinction

#### A. Wave-tab Add
This is the **oscillator additive recipe path**.
It is controlled from the Wave tab and currently goes through:

- `PATHS.oscRenderMode`
- `voices[i].osc:setRenderMode(...)`
- `dsp/core/nodes/OscillatorNode.cpp`

This is **not** the same as Blend-tab Add.

#### B. Blend Add / Morph
This is the **sample-derived additive / spectral morph** path.
It currently involves:

- `SampleRegionPlaybackNode`
- temporal sample partial data
- `SineBankNode`
- a large amount of Lua logic in `midisynth_integration.lua`

### Rule for collaborators

When the user says:

> switching to Add in the Wave tab makes the global project DSP crackle and stutter

that means exactly:

> the **Wave-tab additive oscillator path** is too expensive / unstable

Do **not** reinterpret that as Blend Add unless the user explicitly says so.

---

## 3. Current State of the Project

## 3.1 What has already improved

The following issues were already addressed during this debugging cycle:

- second-switch Add/Morph state-loss bug was fixed
- temporal partial ownership was clarified and moved toward C++
- temporal frame interpolation logic was ported into C++ while preserving the original Lua behaviour (`smooth`, `contrast`, `RMS`, neighbour smear)
- major clicks in Add/Morph interaction were removed
- overall Add/Morph stability is better than before

## 3.2 What is still broken / unsolved

### A. Wave-tab Add can still crackle/stutter the whole project DSP
This is the clearest remaining issue.

### B. Additive modes can still destabilize the project at higher load
Especially when stacking:

- many synth voices
- additive partial counts
- unison / detune / spread
- ongoing morph / resynthesis work

### C. Control semantics are inconsistent across modes
`unison`, `detune`, and `spread` mean something sensible in normal oscillator modes, but not necessarily in:

- Wave Add
- Sample Add
- Morph

### D. Too much logic still lives in Lua
Even after some heavy work moved to C++, the DSP is still doing too much of the following in Lua:

- deciding spectral source combinations
- doing morph orchestration
- managing additive refresh timing
- shuttling large tables
- mode-specific spectral branching

This is exactly the kind of thing that should be in C++ if performance and stability matter.

---

## 4. Core Product / DSP Vision

The MIDI synth should be treated as a **spectral instrument**, not merely a subtractive oscillator with sample playback bolted on.

### Product-level principles

1. **Sample-derived spectra are core, not optional garnish**
2. **Wave and sample should be treated as compatible spectral sources**
3. **Morphing and transmogrification should feel deep but remain cheap enough to play live**
4. **The engine should pick the cheapest valid backend for the job**
5. **Lua should steer the engine, not be the engine**
6. **UI labels and semantics may change per mode if that makes the instrument clearer and safer**

---

## 5. Research Summary

The research and practical implementation discussion consistently point to a split approach rather than one universal additive algorithm.

## 5.1 Julius O. Smith / Spectral Audio Signal Processing
Reference consulted:
- *Additive Synthesis*, Julius O. Smith / DSPRelated

Key takeaways:

- A raw oscillator bank is fine for smaller / more dynamic sinusoidal models
- When the number of partials becomes large, **IFFT synthesis** can be more efficient
- For **harmonic, periodic sounds**, **wavetable synthesis** is often the right answer
- **Group-additive synthesis** is a useful middle ground between straight wavetable and full oscillator-bank additive

### Practical implication for this project

**Wave-tab Add** behaves like a harmonic periodic recipe, so a wavetable/group-additive approach is the right fit.

**Sample Add / Morph** is closer to sinusoidal modeling / resynthesis, so a partial-bank or hybrid spectral engine still makes sense.

## 5.2 JUCE community discussion on additive synthesis performance
Reference consulted:
- JUCE forum: *Any tips for additive synthesis?*

Notable implementation guidance from that discussion:

- commercial synths often avoid naive `std::sin`-per-partial-per-sample designs
- many effective designs blur the line between additive and wavetable synthesis
- if a harmonic structure is mostly stable, it is often cheaper to **precompute the waveform** than repeatedly calculate it
- lower-level optimizations (vectorized sin, CORDIC, recurrence, Chebyshev, SIMD) can help, but are not the main architectural win

### Practical implication for this project

Low-level math tricks may help the sample-resynthesis backend later, but they are **not** the primary fix for Wave-tab Add.
The main win there is **algorithmic replacement**: stop live-summing a harmonic recipe if a cached wavetable will do.

---

## 6. High-Level Recommendation

Use **different backends for different additive jobs**.

### 6.1 Wave-tab Add -> cached spectral wavetable backend
Use a precomputed, bandlimited wavetable or grouped spectral table built from Fourier coefficients / harmonic recipe parameters.

### 6.2 Sample Add / Morph -> C++ spectral resynthesis backend
Use a C++ engine that can:

- read temporal sample spectra
- interpolate frames
- morph between wave and sample spectra
- smooth targets over time
- prune or compress partial work
- optionally choose a cheaper harmonic backend when appropriate

### 6.3 Lua -> orchestration only
Lua should mainly do:

- parameter routing
- mode selection
- high-level modulation / host interaction
- UI readback / inspection

Lua should **not** remain responsible for the expensive spectral inner loop.

---

## 7. Architecture Split By Mode

## 7.1 Wave-tab Add

### Current behaviour
The Wave tab Add path currently renders an additive recipe directly in `OscillatorNode` during audio processing.

That means the audio thread is effectively doing:

- waveform additive recipe evaluation
- harmonic summation
- per sample
- per unison voice
- per synth voice

That is the exact reason it can make the whole project DSP crackle/stutter.

### Recommended replacement
Replace the live harmonic summation with a **cached wavetable backend**.

#### Proposed model
- Build a harmonic recipe from:
  - waveform
  - additive partial count
  - additive tilt
  - additive drift (or a drift-compatible approximation)
  - pulse width
- Convert that recipe into one or more **bandlimited wavetable sets**
- Cache by recipe key
- Audio thread performs only:
  - table lookup
  - interpolation
  - phase increment
  - optional lightweight ensemble/width behaviour

### Important design note about drift
`drift` may not belong entirely inside the shared table cache if it is supposed to feel alive/per-voice.

Possible split:

- bake **static spectral shape** into the table
- apply **light per-voice decorrelation** separately

This avoids rebuilding tables too aggressively while keeping the sound animated.

### Expected result
Wave-tab Add becomes cheap enough to behave like a normal oscillator mode instead of a global-DSP hazard.

---

## 7.2 Sample Add / Morph

### Current behaviour
The existing sample-derived additive system is a hybrid of:

- `SampleRegionPlaybackNode` analysis state
- `TemporalPartialData`
- `SineBankNode`
- Lua-side orchestration and morphing logic

This is already closer to the right conceptual model than Wave-tab Add, but it is still too distributed and too Lua-heavy.

### Recommended replacement
Create a **C++ spectral resynthesis engine** for Add/Morph.

This engine should own:

- temporal frame interpolation
- wave<->sample spectral morphing
- sample<->sample spectral morphing (future)
- smooth/contrast/RMS/temporal smear behaviour
- tilt/stretch / higher-level spectral shaping
- partial smoothing / pruning / density reduction
- note-on / note-off cleanup semantics
- safe CPU budgeting

### Suggested architectural options

#### Option A: Extend existing nodes
Extend:
- `SineBankNode`
- `SampleRegionPlaybackNode`
- associated binding surface

Pros:
- smaller change footprint
- reuses existing code

Cons:
- risks continuing the current architecture sprawl
- responsibilities stay scattered

#### Option B: Introduce a dedicated spectral voice node (**recommended**)
Add something like:
- `SpectralVoiceNode`
- or `SpectralMorphVoiceNode`

This node would own the full Add/Morph resynthesis path for a single synth voice.

Pros:
- clear responsibilities
- easier to reason about CPU
- easier to test
- easier to relabel UI because the mode semantics are explicit

Cons:
- bigger rewrite

### Recommended direction
**Option B** is cleaner if this feature is considered core.

---

## 8. Hybrid Backend Strategy (Recommended)

Not every spectral frame needs the same rendering backend.

### Idea
At runtime, or when preparing a voice/frame, decide which backend is cheapest and good enough:

### Backend 1: Harmonic / stable -> wavetable backend
Use when:
- frame is sufficiently harmonic
- inharmonicity is low
- pitch is stable enough
- the spectral envelope can be represented compactly

Good for:
- many wave-derived shapes
- many stable sample-derived frames
- low CPU live playback

### Backend 2: Sparse explicit partial bank
Use when:
- only a limited number of important partials matter
- strong per-partial modulation is needed
- frame is not dense enough to justify FFT methods

Good for:
- moderate-count evolving spectra
- expressive morphing where partial identity matters

### Backend 3: Dense / rich / noisy -> IFFT or grouped spectral backend
Use when:
- there are many partials
- spectral density is high
- explicit oscillator-bank rendering becomes too expensive

Good for:
- dense sample spectra
- complex resynthesis states
- future sample->sample transmogrification

### Why this matters
It lets the engine stay true to the synth's spectral vision without forcing every case through the most expensive possible method.

---

## 9. Unison / Detune / Spread Semantics

This needs to be treated as a **UI + DSP semantics problem**, not just a raw parameter problem.

## 9.1 Normal oscillator modes
These can keep their normal meaning:

- Unison = extra voices
- Detune = pitch spread between voices
- Spread = stereo spread between voices

## 9.2 Wave-tab Add
These semantics are dangerous if interpreted literally.

### Acceptable solutions

#### Safe option
Disable / gray out these controls in Wave Add until the wavetable rewrite lands.

#### Better option
Relabel them to cheaper-but-musical meanings, e.g.:

- `Unison` -> `Ensemble`
- `Detune` -> `Width`
- `Spread` -> `Stereo`

But the internal implementation should **not** necessarily be literal multi-engine unison.
It can be:

- phase decorrelation
- micro-chorus behaviour
- table variant blending
- stereo decorrelation

## 9.3 Sample Add / Morph
Again, literal raw unison may not be the right meaning.

### Candidate semantics
- `Density`
- `Divergence`
- `Stereo`

or

- `Texture`
- `Width`
- `Spread`

The point is that the UI should expose a musically meaningful control surface without forcing the DSP to duplicate an expensive spectral engine N times.

## 9.4 Non-negotiable rule
Do **not** expose controls that can still obviously crash or destabilize the project.
If semantics are not solved for a mode yet, gray them out.

---

## 10. Proposed UI Behaviour

## 10.1 Dynamic label / meaning system
The same three control positions can remain in the UI, but labels and implementation can change by mode.

### Example matrix

| Mode | Control 1 | Control 2 | Control 3 | Implementation note |
|------|-----------|-----------|-----------|---------------------|
| Standard Wave | Unison | Detune | Spread | Literal unison |
| Wave Add | Ensemble | Width | Stereo | Cheap decorrelation / wavetable ensemble |
| Sample Add | Density | Divergence | Stereo | Spectral clustering / dephase / width |
| Morph | Texture | Divergence | Stereo | Morph-aware spectral spread semantics |

This is only a proposed matrix, not final nomenclature.

### Acceptable temporary fallback
If a mode has no good semantics yet:
- gray out the controls
- show a tooltip / mode note
- do not fake support

---

## 11. Implementation Plan

## Phase 0 - Stabilize the existing system

### Goals
- stop global-DSP failure cases
- stop zombie-note behaviour
- stop the worst crackle/stutter paths

### Tasks
- keep expensive operations off immediate param-change hot paths where possible
- explicitly shut down additive note state on note-off
- keep sample playback stacking disabled where it is unsafe
- if necessary, gray out additive-mode controls until proper semantics exist

### Acceptance criteria
- no global DSP death from ordinary interaction in current additive modes
- no obvious zombie-note sustain bug
- Wave Add still may be imperfect, but must not be able to trivially nuke the project

---

## Phase 1 - Rewrite Wave-tab Add as cached wavetable synthesis

### Recommended implementation shape

#### A. Add a recipe key
Something like:

```cpp
struct WaveAddRecipeKey {
    int waveform;
    int additivePartials;
    float additiveTilt;
    float additiveDrift;
    float pulseWidth;
};
```

#### B. Add a cached table set
Something like:

```cpp
struct WaveAddTableSet {
    // multiple mip levels / bandlimited variants
    // one-cycle tables
};
```

#### C. Add a cache / builder
- keyed by recipe
- can build on control thread or worker thread
- atomic swap into the oscillator when ready
- last-good table remains active during rebuild

#### D. `OscillatorNode` Add path
Replace live harmonic summation with:
- choose appropriate table band
- read table
- interpolate
- apply amplitude/unison/stereo as lightweight operations

### Optional enhancement
Use **group-additive tables** rather than one monolithic table if that gives better control over tilt/shape/ensemble without rebuilding too much.

### Acceptance criteria
- switching Wave tab into Add does not globally stutter the project
- Wave Add does not explode with ordinary polyphonic use
- Wave Add with modest width/ensemble remains stable and musically useful

---

## Phase 2 - Build the C++ spectral Add/Morph engine

### Status update (current branch)
Phase 2 has now been landed as a **C++ spectral engine implemented on top of `SineBankNode`** rather than as a brand-new `SpectralVoiceNode` class.

What shipped:
- `SineBankNode` now owns the Add/Morph spectral target generation path
- per-voice Lua hot-path morphing / temporal-frame table churn was removed from `midisynth_integration.lua`
- `SineBankNode` now accepts compact scalar control for:
  - spectral mode (manual / Add / Morph)
  - sample playback source reference
  - wave recipe params
  - morph amount / depth / curve
  - temporal speed / smooth / contrast
  - stretch / tilt mode / Add flavor
- `SampleRegionPlaybackNode` now publishes lock-free partial / temporal snapshots so the spectral engine can read frame state without taking the analysis mutex in the rendering path

This is the **Phase 2 architecture win** even though the concrete class name is still `SineBankNode`.
The dedicated-node split can still happen later if the responsibility boundary needs to be cleaned up further.

### Recommended implementation shape
Introduce a dedicated node/class responsible for spectral resynthesis per voice.

### Responsibilities
- hold current target spectral state
- read temporal sample frames
- morph wave/sample states
- smooth transitions internally
- prune / compress work based on audibility and budget
- own note-on / note-off semantics
- expose a compact Lua control surface

### Lua should provide only
- mode
- morph amount
- depth
- curve
- smooth
- contrast
- stretch / tilt / speed
- capture / source selection

### C++ should provide
- frame query
- frame smoothing
- frame morphing
- partial-set target updates
- audio rendering backend selection

### Acceptance criteria
- Add/Morph logic no longer relies on large Lua table churn in the audio path
- changing Add/Morph params does not destabilize the whole project
- sample-derived spectral morphing remains expressive and obviously central to the instrument

---

## Phase 3 - Optional hybridization of sample frames into wavetables

This is a high-value future direction if sample-derived spectra turn out to be mostly harmonic in many musical cases.

### Idea
For harmonic-enough sample frames:
- project the frame onto a harmonic coefficient representation
- build a wavetable (or grouped wavetable set)
- render cheaply as a wavetable voice

For inharmonic or unstable frames:
- keep partial-bank / spectral backend

### Why it matters
This would let the engine do exactly what the user wants:

> build a wavetable from a sample where that is appropriate

without giving up deeper spectral transformation when the sound needs it.

---

## 12. Candidate File Touchpoints

## Current files already involved

### Wave-tab Add path
- `dsp/core/nodes/OscillatorNode.h`
- `dsp/core/nodes/OscillatorNode.cpp`

### Sample Add / Morph path
- `dsp/core/nodes/SineBankNode.h`
- `dsp/core/nodes/SineBankNode.cpp`
- `dsp/core/nodes/SampleRegionPlaybackNode.h`
- `dsp/core/nodes/SampleRegionPlaybackNode.cpp`
- `dsp/core/nodes/TemporalPartialData.h`
- `manifold/primitives/scripting/DSPPluginScriptHost.cpp`
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`

## Likely new files if rewrite proceeds cleanly

### For Wave Add
- `dsp/core/nodes/WaveAddTableCache.h`
- `dsp/core/nodes/WaveAddTableCache.cpp`

### For sample spectral engine
- `dsp/core/nodes/SpectralVoiceNode.h`
- `dsp/core/nodes/SpectralVoiceNode.cpp`

These names are suggestions, not mandates.

---

## 13. Performance / Safety Requirements

Any acceptable rewrite should meet these constraints:

### Hard requirements
- no project-wide crackle/stutter merely from switching into Wave Add
- no project-wide audio death from ordinary additive-mode interaction
- no note that keeps sounding indefinitely until retriggered
- no expensive spectral recalculation on the audio thread that could have been precomputed

### Strong requirements
- Lua does not allocate / rebuild large spectral structures in the hot path
- mode switches are cheap and deterministic
- interactive parameter changes remain responsive
- UI responsiveness does not collapse when additive modes are active

### Nice-to-have
- backend selection based on spectral content
- background cache rebuild with atomic swap
- profiling hooks / debug counters to show which backend is active per voice

---

## 14. Testing Plan

## 14.1 Functional tests

### Wave-tab Add
- switch Standard -> Add while audio is playing
- play chords in Add
- move additive partial count / tilt / drift / pulse width
- verify no global project crackle/stutter

### Sample Add
- capture sample
- enable Add
- hold/release notes repeatedly
- move parameters while sustaining
- verify no zombie notes / no DSP death

### Morph
- capture sample
- move morph amount/depth/smooth/contrast/speed
- sustain chords
- verify no runaway notes / no project-wide failure

## 14.2 Stress tests
- 8 synth voices active
- additive mode enabled
- repeated parameter movement
- UI interaction while notes sustain
- rapid note-on/note-off sequences

## 14.3 Profiling goals
Measure separately:
- Wave-tab Add CPU
- Sample Add CPU
- Morph CPU
- Lua process cost
- UI frame timing while additive modes are active

---

## 15. Open Questions

1. Should Wave-tab Add `drift` be table-baked, runtime-decorrelated, or split between both?
2. Should sample-derived harmonic frames be down-projected into a wavetable backend automatically?
3. Is a dedicated `SpectralVoiceNode` cleaner than extending `SineBankNode` and related helpers further?
4. Should Morph use the same backend as Sample Add, or should it have a specialized hybrid engine?
5. Do we want literal unison anywhere in additive modes, or should additive modes always reinterpret those controls?
6. Do we want an IFFT backend now, or only after the wavetable + spectral-engine rewrite lands?

---

## 16. Recommended Immediate Next Steps

### Highest value sequence

1. **Temporary safety:** gray out or hard-disable unsafe additive-mode control semantics where needed
2. **Wave Add rewrite:** replace live additive recipe rendering with cached bandlimited spectral wavetable synthesis
3. **Sample spectral engine:** move Add/Morph hot path fully into C++
4. **UI semantics:** relabel per-mode controls so they match what the DSP actually does
5. **Optional hybridization:** investigate converting harmonic-enough sample frames into wavetable playback

### Do not do this
- do not keep papering over the current architecture with more Lua hot-path patches
- do not expose literal raw unison in modes where it remains unsafe or musically misleading
- do not keep one algorithm for all additive use cases if mode-specific backends are clearly better

---

## 17. Working Thesis

The synth should evolve toward this model:

> **Wave Add = cheap cached spectral oscillator**  
> **Sample Add / Morph = expressive C++ spectral resynthesis engine**  
> **Lua = orchestration and modulation layer, not the spectral execution engine**

That preserves the core artistic idea of the instrument:

- deep sample-derived transformation
- morphing between waves and samples
- rich spectral modulation

while making it practical enough to play and stable enough to trust.

---

## 18. Reference Notes

### Research references consulted
- Julius O. Smith / DSPRelated: *Additive Synthesis*  
  Notes used: oscillator bank vs IFFT vs wavetable vs group-additive distinctions
- JUCE forum thread: *Any tips for additive synthesis?*  
  Notes used: practical industry-style advice about caching, wavetable/additive blur, and architectural rather than purely micro-optimization wins

### Internal repo references
- `docs/midisynth_dsp_chain.md`
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `dsp/core/nodes/OscillatorNode.cpp`
- `dsp/core/nodes/SampleRegionPlaybackNode.cpp`
- `dsp/core/nodes/TemporalPartialData.h`

---

## 19. Final Recommendation for Collaborators

If you are picking this work up fresh, assume the following:

- The **vision is correct**: deep sample/wave spectral transformation is core
- The **current implementation split is not**
- **Wave Add** should be rewritten first because it is the most obviously wrong algorithmically
- **Sample Add / Morph** should then be re-centered into C++ with Lua thinned down aggressively
- **Mode-specific UI relabeling is explicitly allowed and recommended** where it improves semantics and safety

This is not a minor cleanup task. It is a justified DSP re-architecture.
