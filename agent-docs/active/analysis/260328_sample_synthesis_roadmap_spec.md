# Sample Synthesis Roadmap Spec

## Purpose

This document consolidates the current thinking around the sample-synthesis roadmap for MidiSynth now that UI space has been freed in the sample surface.

It is meant to replace hand-wavy discussion with a staged, non-stupid plan.

Historically the immediate next step was **capture-time pitch detection for sampler root mapping**. That foundation work is now done, along with the first implemented slices of Stages 2–4.

This document therefore needs to be read as a staged roadmap with updated status, not as a "do pitch-map next" instruction.

This doc intentionally separates:
- **capture-time analysis**
- **real-time pitch tracking**
- **additive resynthesis DSP**
- **analysis-driven modulation**
- **future multisample/keymapping work**

These are related, but they are not the same problem.

## Status Reference

**See `IMPLEMENTATION_STATUS.md`** for current completion state and guardrails.

**See `260328_blend_modes_future_work.md`** for Stage 5 planning (Hybrid, Morph, Analysis-Driven).

---

## Executive Summary

### What we have now

MidiSynth already has:
- live sample capture into `SampleRegionPlaybackNode`
- sample playback with root-note-based pitch tracking
- a `sampleRootNote` parameter that already affects playback speed/keytracking
- a blend architecture where oscillator and sample playback are always present on the canonical path
- prototype and analysis work showing YIN-based pitch detection is a viable basis for root-note detection
- early unsolicited pitch detector code in C++ that must be treated as **reference material**, not as approved architecture

### What we want

Over time, we want MidiSynth to evolve from:
- oscillator + sample playback + blend modes

into:
- oscillator + sample playback + analysis-derived metadata + additive resynthesis + modulation derived from analysis

### What was done first

The first implementation slice was:
- **always detect pitch on sample capture**
- **only auto-write the existing `sampleRootNote` when a user toggle is enabled**
- **show the root note with note names, not just MIDI numbers**

That foundation is now complete.

### Current roadmap reality

As of the current implementation state:
- Stage 1 is done
- the first Stage 2 slice is done
- the first Stage 3 slice is done
- the first Stage 4 slice is done
- live procedural additive in the Wave tab is already implemented via **`Standard | Add`** inside `OscillatorNode`

So the next meaningful work is no longer "build Pitch Map" or "add Wave-tab Add".
The next meaningful work is:
- stabilize/polish the live Wave/Add slice
- keep sample-derived additive aligned with the actual Blend architecture
- implement additive as a **Blend-family relationship mode** rather than as a post-mix sidecar or separate sample-render selector

---

## Product Principles

### 1. Live workflow first

This sampler is used in a live recording context.

That means:
- sample capture must remain immediate
- analysis must never block the audio thread
- analysis must happen automatically after capture without requiring manual region selection
- results must become available quickly enough to feel live

### 2. Automatic internal analysis is allowed; manual analysis choreography is not

The user should not need to:
- choose an analysis region
- trim analysis windows manually
- inspect detector internals
- babysit the algorithm every capture

However, the implementation still needs internal heuristics such as:
- multi-window analysis
- attack/transient rejection where useful
- confidence gating
- percussive/unpitched rejection

The correct model is:
- **no user-facing analysis region workflow**
- **yes internal automatic analysis strategy**

### 3. Keep user-facing pitch mapping simple

For the first version, we do **not** need visible analysis metadata UI.

The intended user-facing behavior is:
- pitch is always detected on capture
- if `Pitch Map` is enabled, detection can update the existing root parameter
- if `Pitch Map` is disabled, root stays where the user left it
- root note display should include note names, not just numeric MIDI values

### 4. Capture-time detection and real-time detection are separate products

They may share math, but they should not be forced into the same architectural wrapper.

#### Capture-time pitch detection
Used for:
- root-note derivation for recorded samples
- metadata generation after capture/import

Constraints:
- non-audio-thread
- can be more computationally expensive
- works on a completed buffer

#### Real-time pitch detection
Used for:
- future modulation sources
- live pitch-following behaviors
- pitch-reactive visualizations or mappings

Constraints:
- real-time safe
- streaming/stateful
- lower latency and lower compute budget

---

## Current System Reality

### Existing sampler behavior

The current Lua integration already contains an effective sample pitch mapping path:
- `sampleRootNote` exists
- playback speed is derived from incoming note frequency relative to that root
- the sample tab already exposes a Root control

So the first feature is **not** “invent keymapping from scratch.”

It is:
- automatically derive the root note better
- conditionally apply that to the existing mapping parameter

### Existing sample capture path

Current capture path is effectively:
- input source or looper layer source
- retrospective capture node
- copy into `SampleRegionPlaybackNode`
- update sample playback region state in Lua

This is where capture-time analysis belongs.

### Existing pitch detection code status

The project already contains:
- `dsp/core/nodes/PitchDetector.h`
- `dsp/core/nodes/PitchDetectorNode.*`

Important: these were created under an unsolicited implementation and must not be treated as settled architecture.

What we can reuse:
- YIN math
- result structures if appropriate
- utility functions such as frequency↔MIDI conversion

What we should not blindly accept:
- the current class boundaries
- the assumption that the graph node is the right API for capture-time analysis
- any unreviewed performance or reliability claims

---

## Roadmap Structure

The work breaks into six stages.

1. **Stage 1 — Sampler Pitch Map Foundation**
2. **Stage 2 — Analysis Metadata Expansion**
3. **Stage 3 — Additive Analysis Extraction**
4. **Stage 4 — Additive Synthesis Path**
5. **Stage 5 — Hybrid / Morph / Analysis-Driven Modes**
6. **Stage 6 — Full Keymapping / Zone Architecture**

This ordering is intentional.

Do not jump to morphing and multisample fantasies before the first detection path is clean.

---

# Stage 1 — Sampler Pitch Map Foundation

## Goal

Make live-captured samples optionally self-map their root note through the existing `sampleRootNote` parameter.

## User-facing behavior

- pitch is always analyzed on capture
- if `Pitch Map` is enabled and the result is reliable enough, the system updates `sampleRootNote`
- if `Pitch Map` is disabled, the system does not update `sampleRootNote`
- the Root control displays note names as well as MIDI values
- no separate analysis result panel is required for the first version

## What this stage includes

### DSP / analysis
- reviewed offline pitch analysis helper for completed sample buffers
- confidence/reliability gating
- percussive/unpitched rejection
- asynchronous or otherwise non-audio-thread invocation after capture

### Lua / integration
- new `pitchMapEnabled` parameter
- hook pitch analysis into sample capture completion
- update `sampleRootNote` when enabled and result is acceptable
- preserve existing keytracking semantics in blend/sample playback

### UI
- pitch map toggle in sample tab / rack params
- root display uses note names

## What this stage does **not** include

- user-visible analysis readouts
- full multisample keymaps
- zone editing
- real-time pitch follower modulation
- additive synthesis

## Success criteria

- user records a live pitched sample
- with `Pitch Map` off, Root stays manual
- with `Pitch Map` on, Root updates to the detected note if reliable
- playback transposes correctly using existing sample root logic
- no audio-thread stalls or capture regressions

---

# Stage 2 — Analysis Metadata Expansion

## Goal

Once the pitch-map path is working, broaden the analysis layer so captured samples produce more useful metadata than just root pitch.

## Status

Started.

Implemented in the first Stage 2 slice:
- project-owned sample metadata struct (`dsp/core/nodes/SampleAnalysis.h`)
- offline sample analyzer helper (`dsp/core/nodes/SampleAnalyzer.h`)
- expanded capture-time outputs beyond pitch-map-only data
- playback-node analysis access and caching hooks
- control/EVAL runtime introspection via `getLatestSampleAnalysis()`
- live IPC verification that the analysis table is queryable from the control namespace

Current live/queryable outputs include:
- detected frequency
- MIDI note / note name
- confidence
- pitch stability
- RMS level
- peak level
- attack time estimate
- brightness / spectral centroid
- percussive classification
- reliability flag
- algorithm label

## Candidate outputs

- detected frequency
- MIDI note
- confidence
- pitch stability
- RMS level
- attack time estimate
- brightness / spectral centroid
- percussive or unpitched classification

## Why this matters

This metadata becomes the bridge between:
- the sample as raw audio
- the sample as a synthesis/analyzable object
- future modulation sources
- additive resynthesis control inputs

## Deliverables

- [x] stable analysis result struct owned by the project
- [ ] persistence strategy for sample-derived metadata
- [x] internal routing APIs or Lua access where useful
- [x] runtime/control introspection path for inspecting current sample metadata

## Explicit non-goals

- exposing every metric in the UI immediately
- building modulation presets before the sources are trustworthy

---

# Stage 3 — Additive Analysis Extraction

## Goal

Analyze captured samples into reusable harmonic partial data.

## Status

Started.

Implemented in the first Stage 3 slice:
- project-owned partial cache struct (`dsp/core/nodes/PartialData.h`)
- offline partial extractor helper (`dsp/core/nodes/PartialsExtractor.h`)
- playback-node partial extraction + caching in `SampleRegionPlaybackNode`
- Lua/DSP helper exposure (`extractSampleRegionPlaybackPartials`, `getSampleRegionPlaybackPartials`)
- control/EVAL runtime introspection via `getLatestSamplePartials()`
- live IPC verification that the partials table is queryable and reports honest zeroed fundamentals when no reliable sample is present

What this slice currently provides:
- fundamental
- active partial count
- per-partial frequency
- per-partial normalized amplitude
- per-partial phase
- basic decay-rate estimate
- inharmonicity
- brightness / centroid / level metadata mirrored onto the partial result

## Core work

### PartialsExtractor
A new offline analysis component should extract:
- fundamental
- partial frequencies
- partial amplitudes
- optional phases
- optional decay rates
- brightness
- inharmonicity
- envelope descriptors

### Design rules
- offline / post-capture analysis, not graph-time synthesis routing
- mono fold-down or chosen-channel policy must be explicit
- start with sane upper limits (for example 8 partials) rather than overengineering 32-partial complexity immediately
- cache analysis results instead of recomputing gratuitously

## Deliverables

- [x] project-owned partial cache/result type
- [x] first-pass offline partial extractor
- [x] cached partial extraction on the captured sample playback node
- [x] runtime/control introspection path for current sample partials
- [ ] tune extraction quality on real captured material
- [ ] finalize which partial fields are stable enough for long-term persistence/public consumption
- [x] wire the first DSP consumer (`SineBankNode` / additive render path)

## Why this stage is separate from Stage 1

Pitch detection is useful immediately.

Partial extraction is broader, more expensive, and only worth doing once we know where the data will be consumed.

---

# Stage 4 — Additive Synthesis Path

## Goal

Introduce a real additive synthesis engine driven by extracted partials.

## Status

Started.

Implemented in the first Stage 4 slice:
- project-owned additive renderer node (`dsp/core/nodes/SineBankNode.{h,cpp}`)
- Lua primitive/userdata exposure for `SineBankNode`
- deterministic control/EVAL round-trip helper to render latest extracted sample partials through `SineBankNode`
- live IPC verification of the full path: sample injection -> partial extraction -> `SineBankNode` render -> re-analysis

What is proven so far:
- `SineBankNode` consumes `PartialData`
- rendered output tracks requested pitch against the extracted reference fundamental
- a known harmonic sample can survive the round-trip with the expected partial count, harmonic spacing, and near-zero inharmonicity

What is not done yet:
- additive Blend semantics still need to be made faithful to the actual Blend architecture
- the product path must avoid the wrong abstraction of "normal Blend plus additive sidecar"
- no full hybrid/richer Blend routing is exposed yet beyond the first additive-family slice
- no performance optimization beyond the simple scalar first pass for `SineBankNode`

## Core DSP component

### SineBankNode
Needed capabilities:
- render a configurable number of sine partials
- smooth changes to avoid clicks
- pitch-shift relative to detected or note-driven fundamental
- support future formant or harmonic manipulation
- start scalar/simple if necessary; optimize later if profiling shows the need

## Initial additive mode scope

The first additive path should be minimal and honest:
- one new additive synthesis mode
- additive signal built from stored partials
- reuse existing per-voice envelope / gain path where possible
- no giant mode explosion on day one

## Current UI/product decision for additive

The current UI supports two distinct additive paradigms and they should not be collapsed into one confused control.

### 1. Procedural additive oscillator
This belongs to the **Wave** tab.

Implemented user-facing representation:
- keep the existing waveform dropdown as the **shape / harmonic recipe** selector
- expose a compact segmented control to the right of it: **`Standard | Add`**
- `Standard` means the current oscillator rendering path
- `Add` means the selected waveform is rendered by the in-node additive engine instead of the standard oscillator path

This keeps two separate decisions separate:
- waveform / harmonic recipe
- rendering paradigm

That is cleaner than shoving `Additive` into the waveform dropdown itself.

Implemented Wave-tab additive controls:
- shared oscillator controls stay shared
- Add mode exposes compact additive shaping controls:
  - `Parts`
  - `Tilt`
  - `Drift`
- Pulse Add uses the denser 2x2 control grid with `Width`

Implemented shape policy:
- the live Wave/Add slice now has first-pass additive recipes for all current waveform families:
  - Sine
  - Saw
  - Square
  - Triangle
  - Blend
  - Noise
  - Pulse
  - SuperSaw
- if any one of these later proves dishonest or too expensive, it should be explicitly disabled rather than silently faked

### 2. Sample-derived additive / resynthesis
This belongs to the **Blend** side of the instrument, not the Sample tab.

Reason:
- the Sample tab is currently capture/admin/root/crossfade management
- sample-derived additive is about how the sample branch participates in synthesis, which is a Blend concern

Critical correction:
- sample-derived additive should not be exposed as a separate sample-render selector bolted beside Blend
- Blend already has a semantic role: it chooses the relationship family and uses the Blend amount as the directional/polarity control
- so additive belongs as an **`Add` Blend family** with directional endpoints, not as a sidecar layer outside the Blend model

### UI behavior rule
The Wave UI now swaps relevant controls depending on `Standard | Add` while keeping the same overall Wave-tab shell.

That means:
- keep the same Wave tab / graph / shared layout
- show additive-specific controls only when `Add` is selected
- keep the distortion cluster honest and grouped beside the drive curve
- additive-specific controls reuse the existing compact-control language instead of inventing a giant new editor immediately

## Important restraint

Do not conflate:
- “we can render partials”
with:
- “we need a huge new blend UI immediately”

That rule still applies even though the first live Wave/Add slice now exists.
The next additive step should be a **hidden / gated** sample-derived consumer, not an immediate explosion of new Blend UI.

---

# Stage 5 — Morph Mode

## Goal

Enable timbral interpolation between sample partials and wave partials.

## Status

**Next to implement.** Architecture and implementation tasks documented in `260328_blend_modes_future_work.md`.

## Phase 5A — Morph Mode

**Concept:** Timbral interpolation between sample partials and wave partials. The harmonics themselves shift — not crossfading sources.

```
Morph position 0: sample partials (from capture)
Morph position 1: wave partials (from oscillator additive recipe)
```

**New blend mode:** `MORPH = 5`

**Effort:** ~6 days

## Phase 5B — Sample Analysis Parameters (Deferred)

**Concept:** Expose sample analysis values (brightness, inharmonicity, attack, etc.) as readable parameters. When a modulation engine exists, users can route them. No blend mode needed — just parameters.

**Effort:** ~1 day

## Phase 5C — Hybrid Mode (Deferred Indefinitely)

**Concept:** Sample playback + additive layer simultaneously.

**Why deferred:** Unclear what this contributes beyond Add mode. Sample already contains the partials that would be layered.

## Architectural Principle

Sample analysis values (brightness, etc.) are just parameters. They don't need a special mode — they become available for future modulation routing.

---

# Stage 6 — Full Keymapping / Zone Architecture

## Goal

Move from single-sample root detection to real keymapping.

## Important distinction

Auto-detecting a root note for one captured sample is **not** full keymapping.

Real keymapping requires:
- multiple samples or zones
- per-zone root note
- per-zone note range
- optional velocity ranges
- zone selection on note-on
- persistence for the sample map
- editing UI for zones and assignments

## Why this is later

Doing multisample zone architecture before the single-sample path is solid would be stupid.

The correct order is:
1. make one sample map well
2. then make several samples map well

---

## Cross-Cutting Architecture Decisions

### A. Keep capture-time analysis off the audio thread

This is non-negotiable.

The system may feel live, but heavy analysis still belongs outside the audio callback.

### B. Share math where sensible, not wrappers where they do not fit

Possible shared core:
- YIN pitch math
- frequency utilities
- maybe partial-analysis helper code

Separate wrappers:
- capture-time analyzer API
- real-time pitch detector node/API

### C. Start with one visible root parameter

For the pitch-map-first path, the simplest user model is:
- existing root parameter remains the only visible root control
- if Pitch Map is enabled and detection is good, it writes into that parameter

No second visible “detected root” control is required initially.

### D. Hidden confidence gating is still required

Even if the user never sees confidence values, the system still needs them internally so it does not auto-map garbage.

### E. Note-name display is worth doing early

Displaying only MIDI note numbers is clumsy.

The Root control should display note names such as:
- `C4 (60)`
- `F#3 (54)`

That improves the sampler workflow immediately, even before additive work lands.

---

## Risks and Failure Modes

### 1. Octave mistakes
YIN-style detectors can still produce octave errors.
This needs thresholding and sanity checks.

### 2. False confidence on noisy or transient-rich captures
If the reliability gate is weak, pitch mapping becomes actively harmful.

### 3. Audio-thread contamination
If analysis accidentally ends up in the hot path, the live sampler will feel broken.

### 4. Premature additive complexity
Jumping into partial morphing or deep new modes before Stage 1 and Stage 2 are stable will create incoherent architecture.

### 5. UI clutter
Exposing too much analysis metadata too early would bloat the sample workflow instead of improving it.

---

## Implementation Priorities

### Priority 1
- capture-time pitch detection
- pitch map toggle
- root note note-name display

### Priority 2
- internal metadata expansion
- clean analysis result ownership and persistence strategy

### Priority 3
- partial extraction infrastructure
- additive synthesis path

### Priority 4
- hybrid / morph / analysis-driven modulation

### Priority 5
- true multisample zone mapping

---

## File Areas Likely To Be Involved Over Time

### Current pitch-map-first stage
- `dsp/core/nodes/PitchDetector.h`
- `dsp/core/nodes/PitchDetectorNode.*` (reference only unless explicitly adopted)
- `dsp/core/nodes/SampleRegionPlaybackNode.{h,cpp}`
- `dsp/core/nodes/RetrospectiveCaptureNode.{h,cpp}`
- `manifold/primitives/scripting/DSPPluginScriptHost.cpp`
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/components/oscillator.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- `UserScripts/projects/Main/editor/runtime_state.lua`

### Later additive stages
- `dsp/core/nodes/PartialsExtractor.*` (new)
- `dsp/core/nodes/SineBankNode.*` (new)
- `dsp/core/nodes/PrimitiveNodes.h`
- Lua bindings and project integration files above

---

## References

Related current docs:
- `agent-docs/active/analysis/260326_pitch_detection_analysis.md`
- `agent-docs/active/analysis/260327_additive_resynthesis_spec.md`
- `agent-docs/active/rack-ui/260328_blend_modes_and_modulation_analysis.md`

This roadmap supersedes none of them; it consolidates them into an implementation sequence that matches the actual live sampler workflow.

---

## Final Direction

The next sensible move is not “build the whole future.”

The next sensible move is:
- use pitch detection to make the current live sample workflow smarter
- keep the user-facing model simple
- preserve live responsiveness
- treat that analysis path as the first brick of a broader sample-synthesis system

That gives us a real feature now and a sane foundation for everything after it.
