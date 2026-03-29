# 260329
 MidiSynth Phrase / Speech Resynthesis Gap Analysis

**Status:** Active analysis  
**Audience:** DSP implementers, UI implementers, product/design collaborators, future agents  
**Scope:** `UserScripts/projects/Main` sample-derived Add / Morph behavior  
**Primary question:** Why does Add/Morph now analyze more samples correctly, but still fail to make the resynthesized result clearly preserve phrase identity / speech intelligibility?  
**Reference research:** `prototypesandreseearch/Deep Spectral Transformation_ Low-Latency DSP Algorithms for Real-Time Sample Resynthesis and Morphing.pdf`

---

## 1. Executive Summary

The current Add / Morph engine is now in a much better place than before:

- pitch failure no longer kills analysis outright
- non-pitched and noisy material can now still produce spectral data
- Add / Morph now have a usable fallback path for samples that do not map cleanly to a stable musical pitch

That is a major improvement.

However, the user expectation has moved from:

> “make Add / Morph not break on non-pitched material”

to the deeper product question:

> “if I say a phrase like `fuck` or `fuck and bollocks`, why does the resynth not clearly preserve that phrase shape and articulation?”

### Short answer

Because the current engine is still fundamentally a **sample-derived spectral / additive timbre engine**, not a **phrase-preserving speech / articulation resynthesis engine**.

It currently does some of the following well enough:

- capture spectral color
- track broad timbral motion
- interpolate across evolving spectra
- impose sample-derived harmonic or peak structure onto a synth carrier

It does **not** yet do the following in a strong enough way:

- follow the sample’s loudness contour as a phrase envelope
- preserve transient articulations
- preserve fricatives, plosives, breath, and consonant noise
- preserve formant trajectories strongly enough for intelligibility
- separate voiced and unvoiced content
- align phrase structure in a way that makes words come through clearly

### Bottom line

If the goal is:

> “make the synth say the phrase, even if it sounds transformed”

then the current system is missing entire classes of analysis and resynthesis data.

This is **not just a small bug**. Some smaller implementation improvements are still appropriate, but the larger issue is architectural:

- we currently resynthesize mostly from **partials / peaks**
- speech intelligibility requires at least some combination of:
  - **envelope following**
  - **formant / spectral-envelope following**
  - **transient preservation**
  - **noise / residual resynthesis**
  - **voiced / unvoiced separation**

Without those, the result will remain:

- recognizably influenced by the sample
- often musically interesting
- but not reliably intelligible as the original phrase

---

## 2. What the User Expected vs What the Current Engine Actually Does

## 2.1 User expectation

The user expectation is not unreasonable. It is specifically this:

- record spoken or semi-spoken material
- switch to Add or Morph
- hear a transformed synthetic output
- but still perceive the phrase content and articulation
- e.g. a transformed carrier that still clearly “says” the phrase

Important nuance:

The user is **not** asking for literal sample playback.
They are asking for:

- different tone
- different carrier
- different character
- but recognizable preservation of the **phrase structure / articulation / wording**

That implies a kind of **speech-aware or phrase-aware resynthesis**.

## 2.2 What the current engine actually does

The current engine is closer to:

- partial-bank or peak-bank resynthesis
- plus temporal frame interpolation
- plus morphing between sample-derived and wave-derived spectral states

That means it preserves:

- some harmonic structure
- some broad spectral distribution
- some time-varying spectral motion

But it does **not** strongly preserve:

- syllable edges
- consonant identity
- noisy mouth sounds
- transient mouth bursts
- exact phrase envelope
- speech-specific formant motion

So the current result is usually:

- “the synth clearly took timbre/material from the sample”

not:

- “the synth clearly said the phrase”

---

## 3. Why This Happens In DSP Terms

## 3.1 Speech is not just a harmonic object

A word like `fuck` is not a single pitched tone with a stable overtone series.
It contains multiple perceptual regimes:

- **fricative noise** (`f`)
- **voiced vowel / resonant body** (`u`)
- **stop / plosive / release structure** (`ck`)

Those parts are not all well represented by a plain sinusoidal bank.

### The problem

A sine-bank engine is naturally suited to:

- harmonic tones
- slowly varying pitched content
- evolving additive timbre

It is **not** naturally suited to:

- broadband fricatives
- breath noise
- plosives
- noisy transients
- the stochastic components that make speech intelligible

So even if the analysis now succeeds on a non-pitched utterance, the resynth backend still throws away or weakens the exact parts that make the utterance read as language.

---

## 3.2 Intelligibility lives heavily in transient + residual + formant behavior

For speech-like material, intelligibility is strongly tied to:

1. **Amplitude envelope / phrase contour**
2. **Transient placement**
3. **Voiced/unvoiced alternation**
4. **Formant structure and formant motion**
5. **Residual/noise content**

The current system has only weak or absent versions of these.

### What we do have now

- frame RMS values
- spectral peak/partial data
- temporal frame interpolation
- keytracked target frequency for the bank

### What we do not yet have in a strong, resynth-driving way

- a dedicated sample amplitude envelope that drives the resynth output
- onset/transient strength tracking with resynth consequences
- noise residual modeling
- explicit formant envelope extraction
- voiced/unvoiced classification
- phoneme-like or state-like phrase segmentation

That is the gap.

---

## 4. Current Project State: What Was Fixed vs What Is Still Missing

## 4.1 What was recently fixed

Recent work already fixed a real and important failure mode:

- pitch failure used to effectively kill analysis
- Add / Morph then had no usable spectral source for many real-world samples

This has now been improved by introducing a fallback path where pitch reliability does **not** gate analysis.

### Practical outcome

Now the engine can still produce:

- static partial/peak sets
- temporal frame data

for non-pitched or noisy samples.

That was necessary.

## 4.2 Why the result still does not “say the words”

Because analysis success alone is not enough.

Even with the new fallback:

- the engine still mostly drives a **pitched additive bank**
- the bank still renders from **partials**, not a mixed voiced/noise articulation model
- the bank still lacks explicit phrase envelope coupling
- the bank still lacks a residual/noise branch
- the bank still lacks transient-specific resynthesis behavior

So the fix addressed:

- **analysis availability**

but not yet:

- **phrase intelligibility**
- **articulation fidelity**

---

## 5. Concrete Inventory of the Current Engine

This section maps the high-level behavior to concrete project files.

## 5.1 Analysis layer

### `dsp/core/nodes/SampleAnalyzer.h`
Current role:

- folds to mono
- computes pitch/root analysis
- computes RMS, peak, attack time estimate, spectral centroid, brightness

Important limitation:

- pitch analysis is only one part of speech-relevant analysis
- no explicit voiced/unvoiced classification
- no formant extraction
- no residual/noise envelope extraction
- no transient strength model beyond broad attack-related metrics

### `dsp/core/nodes/PartialsExtractor.h`
Current role:

- harmonic projection when F0 is available
- spectral-peaks fallback when F0 is unavailable
- temporal per-frame peak/partial extraction

Important limitation:

- partials/peaks alone are not enough to preserve speech identity
- peak fallback improves timbral availability, but does not create a noise or transient model
- temporal frames still describe mostly spectral snapshots, not articulation classes or stochastic structure

### `dsp/core/nodes/TemporalPartialData.h`
Current role:

- stores evolving spectral frames
- interpolates between frames
- applies smoothing / contrast shaping

Important limitation:

- frame interpolation is good for spectral motion
- but it is not a substitute for phrase segmentation or transient preservation
- interpolation alone can easily produce “mush” when the source has very different sound classes across time

---

## 5.2 Resynthesis layer

### `dsp/core/nodes/SineBankNode.cpp`
Current role:

- additive/spectral bank
- reads sample-derived partials or temporal frame data
- can operate in Add or Morph spectral modes
- shapes output through pitch-scaled partial playback

Important limitation:

- this is still basically a **pitched partial bank**
- no explicit residual/noise lane
- no transient lane
- no true formant filter stage driven by extracted speech envelope
- no dedicated sample-envelope-follow gain stage beyond general synth amplitude logic

### `UserScripts/projects/Main/dsp/midisynth_integration.lua`
Current role:

- orchestrates spectral mode selection
- handles temporal position mapping
- manages refresh and binding of sample-derived spectral data
- still decides many of the mode semantics and modulation relationships

Important limitation:

- the control layer currently thinks in terms of:
  - blend amount
  - speed
  - smooth
  - contrast
  - convergence
  - additive flavor
- those are useful for spectral texture work
- they are **not** the right top-level semantic controls for phrase intelligibility

---

## 6. Why `Speed` Is the Wrong Primary Control For This Goal

## 6.1 What `Speed` currently means

`Speed` currently acts as a temporal traversal parameter:

- how fast the engine advances through analyzed spectral frames
- how quickly the temporal spectral state changes
- how the evolving sample spectrum is scrubbed or scaled over time

That is a valid parameter for:

- freeze
- abstract morphing
- texture design
- spectral animation

## 6.2 Why it is not the right primary phrase control

If the real goal is:

> “make the transformed output still articulate the phrase”

then the more important dimension is not arbitrary spectral motion rate.
It is:

- how tightly the resynth follows the sample’s envelope and articulation structure

That suggests controls like:

- **Envelope Follow**
- **Phrase Follow**
- **Phrase Warp**
- **Intelligibility**
- **Consonant / Noise**
- **Transient Preserve**
- **Formant Follow**

In other words:

- `Speed` is still useful
- but it should be treated as an **advanced temporal transform** parameter
- not as the main answer to “make the synth say the phrase”

---

## 7. What Is Missing, Exactly?

This is the central section.

## 7.1 Missing Piece A: Phrase amplitude envelope follow

### Current problem

The sample-derived spectral bank does not strongly and explicitly follow the sample’s phrase envelope in a way that shapes the additive output as a spoken phrase.

Consequences:

- syllables flatten out
- attacks soften
- phrase contour weakens
- sustained carrier behavior dominates

### Needed data

At minimum, for each frame or analysis region:

- RMS / loudness envelope
- optionally attack slope / onset strength
- optionally multi-band envelope rather than single scalar

### Needed synthesis behavior

The sample-derived bank output should be scaled by a controllable extracted envelope:

- low amount = more synth-like / stable
- high amount = follows phrase dynamics tightly

### Candidate parameter

#### `Envelope Follow`
Controls how strongly the resynth amplitude follows the recorded phrase envelope.

Suggested semantics:

- `0.0` = synth envelope only
- `0.5` = partial phrase shaping
- `1.0` = strong phrase-contour preservation

### Where it belongs

- Blend tab, visible in Add/Morph sample-derived modes
- likely in an “Articulation” or “Phrase” subpanel

---

## 7.2 Missing Piece B: Residual / noise resynthesis

### Current problem

Speech intelligibility depends heavily on noisy components:

- `f`
- `s`
- `sh`
- breath
- plosive releases
- mouth noise

A partial bank alone cannot convincingly resynthesize these.

### Needed data

Analysis should estimate a residual or stochastic component:

- per-frame noise energy
- optionally per-band noise distribution
- optionally voiced/unvoiced ratio per frame

### Needed synthesis behavior

A separate synthesis lane should generate:

- filtered noise
- optionally band-shaped noise
- mixed according to per-frame unvoiced content

### Candidate parameters

#### `Consonant / Noise`
Amount of unvoiced/noise lane in the output.

#### `Noise Color Follow`
How strongly the sample’s noise coloration shapes the residual lane.

#### `Voiced ↔ Unvoiced Balance`
Biases the output toward stable tonal vs speech-like articulation.

### Where it belongs

- Blend Add/Morph advanced section
- or a dedicated “Speech” / “Articulation” section

---

## 7.3 Missing Piece C: Transient preservation

### Current problem

Plosives and sharp articulation events are not preserved strongly enough.

Speech and phrase identity depend heavily on:

- onset timing
- burst timing
- stop-release timing
- transitions between articulation classes

Frame interpolation and partial smoothing tend to blur these.

### Needed data

At minimum:

- onset strength per frame
- transient markers or flags
- optionally transient class / attack window boundaries

### Needed synthesis behavior

Options include:

- boosting residual/noise lane during transients
- temporarily increasing envelope sharpness
- reducing smoothing near transients
- preserving time-domain attacks separately from the spectral body

### Candidate parameter

#### `Transient Preserve`
How strongly the engine preserves / emphasizes onset definition.

Suggested semantics:

- `0.0` = smooth, creamy, smear-friendly
- `1.0` = sharper, phrase-articulate, attack-preserving

---

## 7.4 Missing Piece D: Formant / spectral-envelope tracking

### Current problem

The current engine captures spectral content, but not yet in the specific form needed to strongly preserve vowel identity and speech articulation.

Speech identity depends strongly on evolving **spectral envelopes / formants**.

A sine bank driven from peaks/partials does not necessarily preserve that envelope strongly enough.

### Needed data

Analysis should estimate:

- coarse spectral envelope per frame
- ideally perceptually organized bands (Bark / Mel / critical bands)
- optional explicit formant peaks and bandwidths

### Needed synthesis behavior

The carrier should be filtered or weighted by the extracted formant/spectral-envelope trajectory.

That can be done via:

- direct formant filter bank
- band-envelope modulation of harmonic and noise lanes
- warped spectral envelope mapping

### Candidate parameters

#### `Formant Follow`
How strongly the sample’s spectral envelope is imposed on the carrier.

#### `Formant Shift`
Shifts the extracted formant structure up or down independently of pitch.

#### `Intelligibility`
A higher-level control that raises analysis/resynthesis resolution and favors preservation of speech-relevant structure.

---

## 7.5 Missing Piece E: Better temporal organization than raw frame scan

### Current problem

The system currently moves through spectral frames, but “moving through frames” is not the same as preserving phrase organization.

For speech or phrase-like material, we often need:

- phrase-aligned progression
- non-linear time alignment
- stronger distinction between attack/sustain/release or phoneme-like states

### What is missing

Some form of temporal organization beyond raw linear frame traversal:

- envelope-aligned traversal
- state-based traversal
- DTW-like alignment for morphing between trajectories
- phrase warp that preserves important transitions rather than uniformly scaling everything

### Candidate parameters

#### `Phrase Follow`
How strongly the output follows the original temporal articulation map.

#### `Phrase Warp`
Non-destructive scaling of the original phrase timing.

#### `Freeze / Position`
Advanced temporal scrub/freeze controls for sound design.

### Recommendation

Keep `Speed`, but demote it.
Treat it as:

- an experimental temporal traversal control
- not the primary “make the phrase come through” control

---

## 8. Research Findings From `Deep Spectral Transformation...` That Directly Support This Conclusion

This section maps the research PDF to the specific project problem.

## 8.1 ATS / sinusoidal + noise decomposition is relevant

The PDF explicitly calls out ATS-style thinking:

- time-frequency decomposition
- sinusoidal tracking
- **critical-band noise decomposition**

### Why that matters here

That is exactly the missing split in the current engine.
We currently have a partial-centric path, but not a proper noise/residual lane.

### Project implication

For phrase / speech preservation, the system should not stop at “partials found.”
It should also estimate and resynthesize a noise residual or band-noise model.

---

## 8.2 RPVOC three-way decomposition is highly relevant

The PDF describes Robust Phase Vocoder style decomposition into:

- sinusoids
- transients
- noise

with different processing strategies for each.

### Why that matters here

This maps almost perfectly to the user’s complaint.

The user wants articulation to survive.
That means we cannot treat everything as a single smoothed spectral object.

The research says plainly:

- sinusoids are good for pitch / primary timbre
- transients are needed for attack definition / temporal precision
- noise is needed for texture / breathiness / stochastic components

### Project implication

A future “phrase-preserving Add/Morph” path should likely become a **three-lane engine**:

1. harmonic / voiced lane
2. transient lane
3. residual / noise lane

---

## 8.3 SMS deterministic + stochastic decomposition is directly relevant

The PDF’s SMS discussion is particularly useful because it frames the exact missing split:

- deterministic partials capture pitch / harmonic structure / articulation envelopes
- stochastic component captures residual noise through time-varying spectral envelope

### Why that matters here

This is almost a direct description of what the current engine does not yet have.

Current engine:

- deterministic-ish partials: yes
- stochastic component: basically no
- explicit articulation envelope handling: weak

### Project implication

A more complete system should add:

- harmonic amplitude/frequency trajectories
- residual/noise envelope trajectories
- optionally simplified stochastic envelope bands for real-time use

---

## 8.4 DDSP-style harmonic + filtered noise residual is extremely relevant

The PDF explicitly recommends, for sample-derived additive resynthesis, a DDSP-like direction:

- F0 tracking when possible
- 64–128 harmonics
- **filtered noise residual**
- 10–20 ms latency target

### Why that matters here

This is a near-perfect fit for the product target:

- preserve playable parametric control
- stay CPU-viable
- keep synthesis interpretable
- restore stochastic speech components

### Project implication

A practical next-generation path for this project is not “replace everything with a huge neural model.”
It is more likely:

- a DDSP-inspired hybrid
- but with fallback when F0 is uncertain
- plus filtered noise residual
- plus stronger temporal envelope follow

That is likely the best quality/performance compromise.

---

## 8.5 The research explicitly acknowledges the F0 dependency problem

The PDF notes that F0 estimator quality directly affects downstream partial tracking quality.
That matches exactly what was already observed in the project.

### Why that matters now

We already fixed the pathological version of this, where pitch failure killed everything.

But the research reinforces that the next step should not be:

- “try even harder to force a pitch estimate for all samples”

It should be:

- use F0 when available
- degrade gracefully when not
- preserve useful spectral/noise/transient structure either way

This is the correct direction.

---

## 8.6 Temporal envelope morphing, DTW, and HMM concepts matter for phrase preservation

The PDF highlights:

- temporal envelope morphing
- online DTW approximations
- HMM/state-based spectral evolution modeling

### Why that matters here

The current system linearly scans temporal frames.
That is fine for evolving textures, but it is weak for preserving phrase identity.

Speech and phrase-like material have non-linear temporal structure.
A better system may need:

- state-aware phrase evolution
- onset / sustain / release or phoneme-like state segmentation
- temporal alignment rules that avoid frame-wise mush

### Project implication

Even if we do not go full DTW/HMM immediately, we should at least design the next phase around:

- phrase envelope maps
- transient/state markers
- non-uniform temporal traversal

---

## 8.7 Formant preservation and noise/transient separation are explicitly backed by the paper

The RPVOC and SMS sections both support:

- formant-preserving treatment of sinusoids
- separate transient preservation
- separate noise modeling

### Why that matters here

This is exactly what is required if the user wants:

> transformed output that still reads as the spoken phrase

Without those separate treatments, the output remains “spectrally influenced” rather than “phrase-preserving.”

---

## 9. So: Is The Current Engine Supposed To Do This, But Failing? Or Is It Missing The Feature?

## 9.1 Honest answer

It is **mostly missing the feature**, not merely failing a finished one.

There are two layers here:

### Layer 1: bugs and undercooked implementation
These did exist:

- mode-switch breakage
- stale/empty analysis state
- pitch failure incorrectly killing analysis

Those were real bugs.

### Layer 2: deeper product capability gap
This is the more important one now:

- the engine never actually had the full data model needed to preserve phrase intelligibility
- it was not yet a full speech / phrase resynthesis design

That means the current shortfall is not just a regression or bad wiring.
It is a gap between:

- **current engine goal**: spectral / additive timbre transformation
- **user goal**: phrase-preserving transformed resynthesis

---

## 10. What Parameters Should Exist?

This section is the concrete parameter proposal.

## 10.1 Core articulation controls

### `Envelope Follow`
How much the additive/resynth output follows the sample’s loudness envelope.

Use:

- preserves phrase shape
- preserves syllable contour
- makes resynth breathe like the sample

### `Transient Preserve`
How strongly attacks and articulation edges are maintained.

Use:

- plosives
- syllable boundaries
- sharper temporal articulation

### `Phrase Follow`
High-level control for how much the output follows the sample’s temporal articulation pattern.

Use:

- stronger phrase identity
- less abstract spectral drifting

### `Phrase Warp`
Scales the phrase timing while preserving its internal articulation structure.

Use:

- stretched phrase
- compressed phrase
- more useful than raw “Speed” for this target

---

## 10.2 Speech / intelligibility controls

### `Formant Follow`
How much the sample’s spectral envelope / vowel identity is imposed on the carrier.

### `Formant Shift`
Shifts formant structure without retuning the carrier pitch.

### `Intelligibility`
Meta-control that could influence:

- temporal resolution
- partial/band count
- transient emphasis
- noise/residual amount
- smoothing reduction

This could be implemented as a macro over several lower-level parameters.

---

## 10.3 Noise / consonant controls

### `Consonant / Noise`
Amount of unvoiced/noise lane mixed into the output.

### `Noise Color Follow`
How strongly the sample’s residual spectral envelope shapes the noise lane.

### `Voiced ↔ Unvoiced Bias`
Balances tonal body against consonant/noise articulation.

---

## 10.4 Advanced spectral controls to keep

These are still useful and should remain available, but should not be presented as the main articulation controls:

- `Speed`
- `Smooth`
- `Contrast`
- `Convergence`
- `Add Flavor`
- `Phase / Tilt Mode`

Recommendation:

- move them into an advanced section
- or relabel them in a way that makes them feel secondary to phrase preservation

---

## 11. Where These Controls Should Live In The UI

## 11.1 Recommended UI structure for Add / Morph

When Blend mode is Add or Morph and a sample-derived path is active, the UI should probably split into:

### A. Phrase / Articulation
- Envelope Follow
- Phrase Follow
- Phrase Warp
- Freeze / Position
- Transient Preserve

### B. Speech / Timbre
- Formant Follow
- Formant Shift
- Intelligibility
- Consonant / Noise
- Voiced ↔ Unvoiced Bias

### C. Advanced Spectral
- Speed
- Smooth
- Contrast
- Convergence
- Add Flavor
- Tilt / Phase behavior

This is much clearer than expecting `Speed` and `Smooth` to somehow explain phrase preservation.

---

## 11.2 Alternate product framing: separate “Phrase” mode

An even cleaner option is to admit that the product target is distinct enough to deserve its own mode.

Current modes:

- Add
- Morph

Potential future additional mode:

- **Phrase**
- or **Speech**
- or **Articulate**

Reason:

- Add/Morph are currently understood as spectral/timbral modes
- phrase-preserving resynthesis is a different enough expectation that a separate mode may reduce confusion

This is a product decision, not a hard DSP requirement.

---

## 12. Practical Roadmap

## 12.1 Phase A — Make current Add / Morph follow phrase shape much better

This is the immediate, realistic next step.

### Goal
Improve phrase identity without redesigning the entire engine.

### Work items

1. Extract and store explicit sample amplitude envelope over time
2. Add `Envelope Follow`
3. Add stronger onset / transient metrics
4. Add `Transient Preserve`
5. Add `Phrase Warp` and demote raw `Speed`
6. Increase temporal resolution where needed for articulation
7. Reduce smoothing near strong transients

### Expected result

- more obvious syllable contour
- stronger phrase articulation
- still not fully speech-intelligible for consonant-heavy material
- but much closer than current behavior

---

## 12.2 Phase B — Add residual / consonant path

### Goal
Restore stochastic and unvoiced content that makes speech readable.

### Work items

1. Add residual/noise analysis per frame or per band
2. Add filtered noise synthesis lane
3. Add voiced/unvoiced mixing logic
4. Add `Consonant / Noise`
5. Add `Noise Color Follow`
6. Tie transient events into residual emphasis

### Expected result

- fricatives survive better
- plosives read better
- words become much more intelligible
- speech-like phrases become viable artistic material

---

## 12.3 Phase C — Add formant / speech-aware spectral envelope path

### Goal
Preserve vowel identity and phrase articulation even under heavy timbral transformation.

### Work items

1. Extract coarse band envelope or formant-like peaks per frame
2. Add formant-following filter/modulation stage
3. Add `Formant Follow`
4. Add `Formant Shift`
5. Add `Intelligibility`

### Expected result

- transformed carrier still sounds like it is saying the phrase
- vocal-like behavior becomes much more controllable

---

## 12.4 Phase D — Temporal alignment / state-aware morphing

### Goal
Avoid mush in phrase morphing and preserve structure across more complex source material.

### Work items

1. Add state markers or phrase segmentation
2. Add online DTW-like or constrained alignment heuristics where feasible
3. Optionally model envelope phases or phoneme-like states
4. Improve morph behavior between very different temporal organizations

### Expected result

- more coherent phrase morphing
- less blur during time-varying cross-synthesis
- more controlled speech-like articulation under morph

---

## 13. Concrete Code-Level Next Targets

If implementing Phase A next, the main likely touch points are:

### Analysis / data model
- `dsp/core/nodes/SampleAnalyzer.h`
- `dsp/core/nodes/PartialsExtractor.h`
- `dsp/core/nodes/TemporalPartialData.h`
- possibly a new temporal envelope / transient data structure

### Resynthesis
- `dsp/core/nodes/SineBankNode.h`
- `dsp/core/nodes/SineBankNode.cpp`
- possibly a dedicated new node if the current sine-bank abstraction becomes too stretched

### Lua orchestration / parameter plumbing
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`

### UI
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/components/oscillator.ui.lua`

---

## 14. Recommended Product/Engineering Decision

### Recommendation
Do **not** treat the remaining gap as:

> “just tune Speed/Smooth/Contrast a bit more”

That would be the wrong response.

Instead, treat the current state as:

1. **analysis availability problem** — mostly addressed
2. **phrase/articulation preservation problem** — still open
3. **speech/intelligibility-capable resynthesis design** — not fully implemented yet

### Immediate next move
Implement **Phase A**:

- envelope follow
- transient preserve
- phrase warp
- stronger articulation-aware temporal behavior

### After that
Implement **Phase B**:

- residual/noise lane
- voiced/unvoiced behavior

That is the path most likely to turn “sample-colored synth” into “phrase-preserving transformed synth.”

---

## 15. Final Bottom Line

The user’s expectation is valid.

The current engine is now much less broken than before, because non-pitched samples no longer collapse analysis.
But that only gets the project to:

- **usable spectral transformation**

It does **not** yet get the project to:

- **phrase-preserving resynthesis**
- **speech-like intelligibility under transformation**

What is missing is not one tiny knob.
It is a set of structural capabilities:

- explicit envelope following
- transient handling
- residual/noise modeling
- formant / spectral-envelope following
- better temporal organization than raw frame scan

That is why the current Add / Morph output can feel clearly influenced by the sample, while still failing to make the transformed carrier convincingly “say the words.”

---

## 16. Reference Notes From `Deep Spectral Transformation...` Most Useful For This Project

The following points from the research document are especially actionable for this project:

1. **ATS / sinusoidal + noise decomposition** is relevant to speech-like and expressive resynthesis
2. **RPVOC three-way split** (sinusoids / transients / noise) maps directly to the phrase-intelligibility problem
3. **SMS deterministic + stochastic decomposition** explains why partials alone are not enough
4. **DDSP with filtered noise residual** is likely a strong real-time implementation direction
5. **F0 uncertainty should trigger graceful degradation**, not complete analysis failure
6. **Temporal envelope morphing / DTW / HMM-style state modeling** explain why simple linear frame traversal is too weak for phrase-preserving morphing
7. **Formant-preserving and transient/noise-explicit models** are necessary for convincing speech-like results

---

## 17. Suggested Follow-Up Document

If implementation proceeds, the next doc should likely be something like:

- `260328_midisynth_phrase_resynthesis_phase_a_spec.md`

covering:

- exact new data structures
- exact new parameters
- UI layout
- acceptance criteria
- CPU budget constraints
- migration path from the current Add / Morph engine
