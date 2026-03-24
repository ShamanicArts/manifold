# Sampler Pitch Map Workplan

## Status: COMPLETE

This workplan is complete. See `IMPLEMENTATION_STATUS.md` for current implementation state and `260328_blend_modes_future_work.md` for next-phase planning.

**Key completion notes:**
- Pitch detection runs on every capture
- `Pitch Map` toggle controls auto-write to `sampleRootNote`
- Note-name display is live
- Detection uses YIN + NSDF + stability analysis with percussive rejection

---

Implement **capture-time pitch detection for the live sampler** so that the existing sample root note can be updated automatically when the user enables `Pitch Map`.

This workplan is intentionally narrow.

It is not the additive synthesis plan.
It is not the real-time pitch modulation plan.
It is not full multisample keymapping.

It is the first foundation slice.

---

## Product Decision Summary

### Required user-facing behavior
- sample pitch is always detected when a new sample is captured
- if `Pitch Map` is enabled and the detected result is acceptable, the system writes the detected note into the existing `sampleRootNote`
- if `Pitch Map` is disabled, the root note remains manual
- the user does **not** need to see separate analysis readouts for the first version
- the Root UI should display note names as well as MIDI values

### Explicitly separate from other systems
- this is **not** the same thing as blend/sample keytracking mode
- this is **not** the real-time pitch detector for future modulation sources
- this is **not** a region-selection workflow

### Non-goals for this slice
- exposing confidence in UI
- exposing detected frequency in UI
- multi-zone keymapping
- formant or additive analysis
- streaming pitch-tracker integration

---

## Constraints

- must not block or contaminate the audio callback
- must fit live capture workflow
- must not require manual region selection
- must preserve existing sample playback and root-note transposition semantics
- must be robust enough not to randomly remap junk audio

---

## Current Implementation Reality

The current project already has:
- `sampleRootNote` parameter in `midisynth_integration.lua`
- sample playback speed derived from note frequency relative to root note
- sample tab Root slider in the UI
- sample capture via `RetrospectiveCaptureNode` → `SampleRegionPlaybackNode`
- YIN-based pitch detector code/prototype work available for reuse or review

That means the feature is fundamentally:
- **derive root better**
- **conditionally write the existing root parameter**

not:
- reinventing sample pitch mapping from scratch

---

## High-Level Execution Strategy

Do this in layers:

1. define the pitch-map parameter and UX behavior
2. create a reviewed offline sample-analysis entrypoint
3. hook analysis into capture completion
4. conditionally apply root updates
5. update UI root display to show note names
6. verify in the live capture workflow

Do not start with UI decoration or extra analysis plumbing.

---

## Phase 0 — Lock Behavior and Naming

### Deliverables
- final toggle name and path
- final behavior when toggle changes
- final behavior when detection fails or confidence is poor

### Proposed decisions

#### Toggle name
Preferred user-facing label:
- `Pitch Map`

Possible parameter path:
- `/midi/synth/sample/pitchMapEnabled`

#### Root update behavior
- detection always runs on capture
- auto-write `sampleRootNote` only when `pitchMapEnabled == true`
- if detection is unreliable, do nothing

#### Toggle changed after sample already exists
Recommended behavior:
- if turned on and current sample exists, re-run or reuse current analysis and apply if reliable
- if turned off, do not auto-revert root note; just stop future auto-application

### Tasks
- [x] choose final label and path
- [x] choose whether toggle-on re-analyzes current sample or reuses cached result
- [x] choose internal confidence threshold policy

### Status
Done.

Implemented behavior:
- parameter path is `/midi/synth/sample/pitchMapEnabled`
- user-facing label is `Pitch Map`
- detection always runs on capture
- `sampleRootNote` is only auto-written when Pitch Map is enabled and the result is reliable
- turning the toggle on can immediately attempt to apply the most recent valid analysis
- turning the toggle off does not revert the root; it only stops future auto-application

---

## Phase 1 — Review / Adopt Pitch Analysis Core

### Goal
Create or validate the pitch analysis core used for completed sample buffers.

### Design rule
This should be a **capture-time analysis API**, not “just use the streaming graph node because it exists.”

### Candidate source material
- `dsp/core/nodes/PitchDetector.h`
- `dsp/core/nodes/PitchDetectorNode.*`
- existing prototype work referenced in the analysis doc

### Required outputs
Internal result should include at least:
- detected MIDI note
- detected frequency
- confidence / reliability
- optional cents deviation
- optional percussive/unpitched flag

### Tasks
- [x] review `PitchDetector.h` math and thresholds against actual sampler needs
- [x] decide whether to reuse `SampleAnalysisResult` as-is or define a project-owned result struct/API
- [x] define the non-graph entrypoint for completed sample analysis
- [x] define fold-down policy for stereo captures
- [x] define acceptance threshold for auto-applying root

### Status
Done for the v1 sampler pitch-map slice.

Notes:
- `PitchDetector.h` was reworked to behave like the working prototype instead of the earlier useless half-port.
- The detector now uses prototype-style sampler heuristics: attack skip floor, fixed analysis window, YIN + NSDF backup, stability analysis, and percussive rejection.
- `SampleAnalysisResult` remains the current result carrier for v1. A project-owned broader metadata type can still happen later when Stage 2 analysis metadata work starts.
- The accepted auto-apply rule is effectively: only write root when the detector returns a reliable result under the sampler-tuned confidence/stability/percussive heuristics.

### Notes
Even if the user never sees confidence, the implementation still needs it.
Otherwise auto-map will eventually do something stupid.

---

## Phase 2 — Add Capture-Time Analysis Entry Point

### Goal
Expose a clean way to analyze the captured sample after it has been copied into sampler playback.

### Recommended approach
One of these:

#### Option A
Add a helper around `SampleRegionPlaybackNode` to analyze its current buffer.

#### Option B
Add a utility/API callable from Lua or control code that analyzes the captured loop data directly.

### Preferred architecture
- operate on a completed sample buffer
- callable outside the audio thread
- return a compact result struct/table
- do not require graph node routing

### Likely files
- `dsp/core/nodes/SampleRegionPlaybackNode.{h,cpp}`
- `manifold/primitives/scripting/DSPPluginScriptHost.cpp`
- maybe a new helper if cleaner than bloating the playback node itself

### Tasks
- [x] define where analysis logic lives
- [x] add method/helper to access current sample data safely
- [x] expose result to Lua/control integration
- [x] ensure no audio-thread work is introduced by this API

### Verification
- [x] helper can analyze an existing captured sample without crashing
- [x] helper returns sane note/frequency values on obvious pitched material

### Status
Done for v1.

Implementation shape:
- capture-time analysis is performed on a completed sample buffer after capture/copy, not by abusing the streaming graph node as the public product API
- the result is exposed to the Lua/control integration so the capture flow can inspect note/frequency/confidence/reliability and conditionally apply the root
- this work is intentionally narrow and capture-focused; a cleaner generalized sample-analysis abstraction can be introduced later if Stage 2 needs it

---

## Phase 3 — Hook Analysis Into Sample Capture Flow

### Goal
Run pitch detection automatically after each successful capture.

### Current likely integration point
`UserScripts/projects/Main/dsp/midisynth_integration.lua` already handles:
- copying recent capture into `samplePlayback`
- updating loop/play/crossfade state
- refreshing cached waveform peaks

Pitch detection should be attached to that same post-capture path.

### Required behavior
On successful capture:
1. copy buffer into `SampleRegionPlaybackNode`
2. invoke pitch analysis for the captured sample
3. if `pitchMapEnabled` and result is reliable, set `sampleRootNote`
4. leave root untouched otherwise

### Tasks
- [x] add the new parameter registration for `pitchMapEnabled`
- [x] load/save toggle state in runtime/project state
- [x] invoke capture-time pitch analysis after copy succeeds
- [x] write `sampleRootNote` only when toggle is enabled and result is good
- [x] ensure root changes propagate using existing sampler frequency logic

### Verification
- [x] with Pitch Map off, capture does not change root
- [x] with Pitch Map on, pitched capture updates root when reliable
- [x] with unreliable capture, root stays unchanged

### Status
Done.

Important implementation note:
- there was a real bug in the apply path where the DSP script logged that it was applying the root but wrote through the wrong route
- this was fixed by using the correct host param write path (`ctx.host.setParam(...)`) and then refreshing local sampler pitch mapping state
- live verification now shows the detected note being applied and the sampler following the updated root correctly

---

## Phase 4 — UI Integration

### Goal
Make the feature controllable and understandable without exposing unnecessary detector internals.

### Required UI changes
- add `Pitch Map` toggle to the sample tab / rack-exposed sample params
- improve Root value display to show note names

### Root display requirement
Current numeric-only root display should become note-aware.

Preferred display forms:
- `C4 (60)`
- `F#3 (54)`

If compact space is tight:
- show note name in the value field and keep numeric precision in underlying parameter logic

### Likely files
- `UserScripts/projects/Main/ui/components/oscillator.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua`
- possibly widget formatting helpers if current slider rendering is too dumb

### Tasks
- [x] add Pitch Map toggle widget to sample UI
- [x] bind toggle to new param path
- [x] expose Pitch Map in rack param specs if appropriate
- [x] add note-name formatting helper for Root display
- [x] verify note-name display still behaves in compact and expanded layouts

### Verification
- [x] toggle updates backing param
- [x] Root control shows note names correctly across the valid MIDI range
- [x] capture with Pitch Map on visibly updates the Root control

### Status
Done.

Implemented UX:
- the sample surface now exposes the `Pitch Map` toggle
- the Root control displays note names alongside MIDI values
- the mapped root visibly updates in the UI after a successful reliable capture when Pitch Map is enabled

---

## Phase 5 — Runtime / Persistence Cleanup

### Goal
Make sure the feature survives normal project use instead of only working for one session.

### Required state
Persist at least:
- `sampleRootNote`
- `pitchMapEnabled`

No visible analysis metadata persistence is required for the first version.

### Likely files
- `UserScripts/projects/Main/editor/runtime_state.lua`
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`
- any project state serialization already used for sample settings

### Tasks
- [x] add `pitchMapEnabled` to runtime state defaults
- [x] save/load toggle state with the project
- [x] confirm root persistence still works as expected
- [x] verify reset/default behavior is sensible

### Status
Done for the current feature scope.

Notes:
- `pitchMapEnabled` is persisted in runtime/project state
- existing root-note persistence remains in place
- reset/default behavior is now aligned with the new toggle instead of pretending the feature does not exist

---

## Phase 6 — Live Workflow Verification

### Goal
Verify this in the actual use case: live recorded audio into the sampler.

### Test conditions
Use live or near-live captured material such as:
- sung sustained note
- synth tone
- bass/guitar note
- noisy or transient-heavy input
- spoken or unpitched material

### Required checks
- [x] capture remains responsive
- [x] no obvious UI freeze or audio glitch when analysis runs
- [x] reliable pitched material maps root sensibly
- [ ] obviously unpitched material does not constantly remap root
- [x] turning Pitch Map off keeps manual root behavior intact
- [x] captured sample transposes correctly after root has been auto-set

### Status
Partially done.

What is already verified:
- live capture still works without obvious responsiveness regressions
- reliable pitched captures now produce sensible root mapping
- Pitch Map off preserves manual-root behavior
- transposition sounds correct after auto-set

What still needs a proper pass:
- deliberately noisy / transient-heavy / obviously unpitched capture cases
- a few cheap deterministic guardrails (pure sine, octave-edge sanity checks)

### Nice-to-have deterministic sanity checks
Even though the real workflow is live capture, a couple of basic checks are still useful:
- pure sine note
- octave edge cases

These are not the product workflow; they are just cheap guardrails against dumb mistakes.

---

## Open Technical Questions

### 1. Where should analysis live?
Options:
- in `SampleRegionPlaybackNode`
- in a separate sample-analysis helper
- in scripting host wrapper code calling shared detector logic

Recommendation:
- keep the public API capture-focused and non-graph-oriented
- avoid forcing the graph node abstraction onto a completed-buffer analysis task

### 2. Should toggle-on reapply immediately?
Recommendation:
- yes, if current sample exists and a valid analysis is available or cheap to recompute

### 3. Should root auto-revert when toggle is turned off?
Recommendation:
- no
- just stop future auto-updates

### 4. Should we persist hidden analysis result now?
Recommendation:
- no need for v1 unless it meaningfully simplifies re-apply behavior
- keep it internal or recomputable

---

## Risks

### Risk 1 — using the wrong wrapper
If we force the real-time graph node into this problem, the architecture gets unnecessarily stupid.

### Risk 2 — confidence gate too weak
Then live junk input will remap root constantly and make the feature feel broken.

### Risk 3 — confidence gate too strict
Then the feature never fires and looks fake.

### Risk 4 — UI formatting hackery
If note-name display is bolted on badly, the root control becomes harder to read instead of better.

### Risk 5 — hidden coupling with blend keytracking
Pitch Map must not get entangled with the existing `blendKeyTrack` logic.
These are separate behaviors.

---

## Recommended Execution Order

### First slice
1. add `pitchMapEnabled` param/state
2. add note-name formatting for Root
3. implement reviewed offline sample-analysis entrypoint
4. invoke analysis after capture
5. conditionally write `sampleRootNote`

### Second slice
6. make toggle-on reapply to current sample
7. harden reliability thresholds against bad live material
8. verify persistence and reset behavior

That gets the useful feature in without dragging in the whole future roadmap.

---

## Progress Tracker

### Phase 0 — Behavior lock
- [x] final parameter/path chosen
- [x] final toggle semantics chosen
- [x] confidence application rule chosen

### Phase 1 — Analysis core review
- [x] detector math reviewed against live sampler use
- [x] capture-time analysis API selected
- [x] result struct/API finalized for v1

### Phase 2 — Capture analysis entrypoint
- [x] sample analysis helper implemented
- [x] helper exposed to Lua/control layer
- [x] helper verified on existing captured sample

### Phase 3 — Capture integration
- [x] `pitchMapEnabled` param registered
- [x] capture completion triggers analysis
- [x] reliable result updates `sampleRootNote` when toggle is enabled
- [x] unreliable result leaves root unchanged

### Phase 4 — UI
- [x] Pitch Map toggle added
- [x] Root shows note names
- [x] root visually updates after mapped capture

### Phase 5 — Persistence
- [x] toggle persisted
- [x] root persistence verified
- [x] reset/default behavior verified

### Phase 6 — Live verification
- [ ] sung note capture verified
- [x] synth tone capture verified
- [ ] unpitched/noisy capture does not randomly remap root
- [x] playback keymapping sounds correct after auto-set

### Overall workplan status
The core sampler pitch-map feature is done.

What remains in this workplan is the last bit of hardening, mainly:
- deliberately bad/unpitched capture verification
- a couple of deterministic sanity checks
- optional cleanup if we want to formalize the v1 analysis API before Stage 2 work

---

## Follow-on phases beyond this workplan

This document is the execution plan for the first sampler-facing slice only. The broader roadmap continues after this.

### Follow-on Phase A — Analysis Metadata Expansion
Status: started, first slice implemented.

Completed in the first Stage 2 slice:
- project-owned `SampleAnalysis` result type
- offline sample analyzer helper
- expanded metadata generation beyond root detection
- control/EVAL runtime access through `getLatestSampleAnalysis()`
- IPC verification that the current sample analysis is queryable from the runtime namespace

Current live outputs beyond root detection:
- detected frequency
- note name / MIDI note
- confidence
- pitch stability
- RMS / level
- peak
- attack estimate
- brightness / spectral centroid
- percussive classification
- reliability flag
- algorithm label

Still to do in this phase:
- decide whether any of this metadata should be persisted with project/sample state
- decide which fields are stable enough to treat as long-term public analysis outputs
- choose the first actual consumer beyond pitch-map (debug surface, modulation routing, or partial-extraction prep)

Why it matters:
- this turns capture analysis from a one-off root detector into reusable sample metadata for later synthesis and modulation work

### Follow-on Phase B — Additive Analysis Extraction
Status: started, first slice implemented.

Completed in the first slice:
- project-owned `PartialData` cache/result type
- offline `PartialsExtractor` helper
- cached partial extraction on `SampleRegionPlaybackNode`
- Lua/DSP helper exposure for extracting/reading current sample partials
- control/EVAL runtime access through `getLatestSamplePartials()`
- live IPC verification that the partials table is queryable from the runtime namespace

Current first-pass outputs:
- fundamental
- active partial count
- per-partial frequency
- per-partial normalized amplitude
- per-partial phase
- basic decay-rate estimate
- inharmonicity
- brightness / centroid / level metadata copied onto the partial result

Still to do in this phase:
- tune extraction quality on real captured material instead of only structural verification
- decide which partial fields are stable enough to treat as long-term public/cached analysis outputs
- choose how much of the partial result should persist versus remain ephemeral analysis cache
- hand the extracted partials to the first real DSP consumer

Why it matters:
- this is the real bridge from sample playback into additive resynthesis
- it feeds both sample-derived additive in Blend and later richer hybrid modes

### Follow-on Phase C — Additive Synthesis Path
Status: started, first DSP slice implemented.

Completed in the first slice:
- initial `SineBankNode` additive renderer
- Lua primitive/userdata exposure for `SineBankNode`
- deterministic control/EVAL helper to render latest extracted sample partials through the additive renderer
- live IPC verification of the round-trip path:
  - inject harmonic sample
  - extract partials
  - render through `SineBankNode`
  - re-analyze the rendered result

Current proof points:
- `SineBankNode` does consume `PartialData`
- rendered output follows requested target pitch relative to the extracted reference fundamental
- a known harmonic source survives the round-trip with the expected partial count and near-zero inharmonicity

Still to do in this phase:
- keep the offline/sample-derived additive lineage moving without destabilizing the live product path
- implement sample-derived additive as a **true Blend family** rather than as a post-mix sidecar
- harden smoothing / gain / stereo behavior for the additive Blend family under musical note changes
- optimize the first scalar implementation if profiling says it is worth it

Implemented UI/product reality:
- the **Wave tab** procedural additive path is already live via **`Standard | Add`** render selection
- the live Wave/Add slice uses the in-node additive renderer inside `OscillatorNode`
- Add mode already exposes compact shaping controls (`Parts`, `Tilt`, `Drift`) and keeps the shared oscillator controls honest
- the remaining additive UI/product work belongs to the later **Blend/sample-derived** lineage, and it must respect Blend's existing relationship/polarity semantics

### Follow-on Phase D — Hybrid / Morph / Analysis-Driven Features
Status: not started.

Core work:
- hybrid sample + additive layering
- timbral morphing between partial sets
- analysis-driven modulation routings such as brightness → cutoff or inharmonicity → detune/spread

Important architectural rule:
- keep distinguishing DSP modes from modulation routings so we do not create unnecessary graph churn

### Follow-on Phase E — Full Keymapping / Zones
Status: **EXPLICITLY OUT OF SCOPE**

User decision: keymapping is not currently necessary. Single-sample workflow is sufficient for the intended use case. This phase is deferred indefinitely.

---

---

## References

Related docs:
- `agent-docs/active/analysis/260326_pitch_detection_analysis.md`
- `agent-docs/active/analysis/260328_sample_synthesis_roadmap_spec.md`
- `agent-docs/active/analysis/260327_additive_resynthesis_spec.md`
- `agent-docs/active/rack-ui/260328_blend_modes_and_modulation_analysis.md`

This workplan is the execution document for the first sampler-facing slice of that broader roadmap.
