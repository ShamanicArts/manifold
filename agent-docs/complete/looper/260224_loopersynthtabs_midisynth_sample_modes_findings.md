# LooperSynthTabs MidiSynth Sample Modes — Findings

## Request (as clarified)
Add new MidiSynth oscillator modes in **LooperSynthTabs** using only:
1. **Live capture**
2. **Looper layer audio as source**

No file import/browser workflow.

---

## Executive Summary
This is feasible with the current architecture.

- **Crossfade-loop sample mode** is buildable now with mostly Lua DSP/UI work.
- **Looper layer sourcing** is buildable now by passing layer playback nodes from looper into MidiSynth integration.
- **Live capture sourcing** is buildable now via `RetrospectiveCaptureNode`.
- No hard requirement for a major C++ DSP rewrite for v1.
- Main risk is performance/polphony cost and interaction smoothness while voices are active.

---

## What exists today (confirmed)

## 1) Integration topology already in place
**File:** `UserScripts/projects/LooperSynthTabs/dsp/main.lua`

Current behavior:
- Builds looper baseline + MidiSynth integration.
- Already routes synth output into looper layer 0 input (`targetLayerInput`).
- Looper layer objects are available in `looper.layers` and expose `parts` nodes.

Implication:
- We can extend this same handoff to also pass layer playback nodes as sample sources.

## 2) Current MidiSynth voice engine is oscillator-based
**File:** `UserScripts/projects/LooperSynthTabs/dsp/midisynth_integration.lua`

Current per-voice source:
- `OscillatorNode` (+ optional noise path)
- voice frequency/amp/gate controlled by params
- ADSR + filter + FX chain already working

Implication:
- Sample mode should be introduced as **alternate voice source mode**, keeping downstream chain unchanged.

## 3) Relevant primitives are already available
From bindings/runtime inspection:

- `LoopPlaybackNode` exposed with:
  - `setLoopLength`, `setSpeed`, `setReversed`, `play/pause/stop`, `seek`, `getNormalizedPosition`, `clearLoop`
- `RetrospectiveCaptureNode` exposed (capture buffer)
- `RetrospectiveCaptureNode::copyRecentToLoop(...)` exists in C++ usertype binding
- `GranulatorNode` exists (possible later mode)

Implication:
- v1 sample loop mode can be built on existing nodes.

---

## Required work to add requested modes

## A) DSP plumbing updates
### Files:
- `UserScripts/projects/LooperSynthTabs/dsp/main.lua`
- `UserScripts/projects/LooperSynthTabs/dsp/midisynth_integration.lua`

### Required changes:
1. In `dsp/main.lua`, pass looper layer playback node refs into `midisynthModule.buildSynth(...)` options.
2. In `midisynth_integration.lua`, add sample mode engine + mode switching.
3. Add sample source selection routing:
   - Live capture source
   - Layer 1/2/3/4 playback source
4. Add capture trigger flow to snapshot from source capture buffer to voice playback loops.
5. On note-on in sample mode, set per-voice playback speed ratio from note vs root note.

---

## B) New params required
Add at least:
- `/midi/synth/osc/mode` (classic/sample-loop)
- `/midi/synth/sample/source` (live/layer1/layer2/layer3/layer4)
- `/midi/synth/sample/captureTrigger`
- `/midi/synth/sample/captureBars` (or capture seconds)
- `/midi/synth/sample/rootNote`
- `/midi/synth/sample/loopStart`
- `/midi/synth/sample/loopLen`
- optional: `/midi/synth/sample/retrigger`

---

## C) UI updates required
### Files:
- `UserScripts/projects/LooperSynthTabs/ui/components/oscillator.ui.lua`
- `UserScripts/projects/LooperSynthTabs/ui/behaviors/midisynth.lua`
- optional display updates in `.../ui/behaviors/oscillator.lua`

### Required controls:
- Mode dropdown (`Classic`, `Sample Loop`)
- Source dropdown (`Live`, `Layer1..4`)
- Capture trigger button
- Capture length selector (bars)
- Root note / tune
- Loop start / loop length

Also required:
- Add these to save/load/reset runtime state handling in `midisynth.lua`.

---

## Key technical caveat
There is a small API cleanliness gap:

- The high-level Lua table wrapper for `RetrospectiveCaptureNode` does not expose all advanced methods directly.
- `copyRecentToLoop(...)` exists at bound usertype level, so there are two options:
  1. call through underlying node object (`__node`) from Lua,
  2. add clean wrapper method in bindings (preferred).

This is not a blocker; it is implementation hygiene.

---

## Performance findings relevant to sample mode
Sample voices will cost more than plain oscillators.

Known constraints:
- Poly sample playback can increase UI/DSP pressure when multiple voices are active.
- Must avoid per-frame allocations in UI sync paths.
- Must keep interaction smooth while 2–3+ voices are sounding.

Required guardrails:
- Throttle heavy visual repaints during interaction.
- Reuse tables/state in per-frame UI updates.
- Verify no regression in knob/dropdown/XY responsiveness under poly load.

---

## Recommended v1 scope (tight and shippable)
1. Add **Sample Loop** mode only (plus existing Classic).
2. Support source = **Live** and **Layer1..4** only.
3. No file import, no wavetable extraction, no additive mode yet.
4. Keep existing filter/FX/ADSR pipeline untouched.

Why:
- Highest value with lowest architecture risk.
- Matches requested scope exactly.

---

## Out of scope for this request
- Disk file sample import/browser
- True wavetable extraction pipeline
- Additive/sine-bank resynthesis mode

---

## Validation checklist
After implementation, verify:

1. Mode switching
- Classic works unchanged.
- Sample Loop mode engages/disengages correctly.

2. Source handling
- Live source capture triggers and updates playable sample loop.
- Layer 1/2/3/4 source capture works from looper playback.

3. Pitch behavior
- Root note playback is in tune.
- Other notes transpose correctly via speed ratio.

4. Poly behavior
- 1, 2, 3+ note chords stable.
- No stuck voices after note-off/panic.

5. Interaction performance
- XY, knobs, dropdowns remain responsive while 3 voices are active.

6. Persistence
- mode/source/loop settings survive save/load/reset flow.

---

## Bottom line
For the requested feature set (live capture + looper layer source), the current system is capable.
The work is mostly in:
- `midisynth_integration.lua` DSP mode/routing,
- `main.lua` source node handoff,
- MidiSynth UI controls + state wiring.

No major engine rewrite is required for v1.