# Rack UI Framework Phase 0 Inventory

## Purpose

This document inventories the current MidiSynth implementation so the rack framework can be built against actual code rather than prototype assumptions.

It focuses on:
- current UI composition
- current runtime behavior/state
- current connector implementation
- current DSP top-level flow vs richer internal node structure
- per-node current contract inventory
- gaps between current code and the intended rack/patch model

---

## Executive Summary

The current MidiSynth implementation is a **fixed authored 2-row layout** with a **fixed top-level DSP chain** and **decorative routing visualization**.

What already exists and is useful:
- reusable component UIs for ADSR / Oscillator / Filter / FX / EQ
- per-component `ports` declarations in the `.ui.lua` files
- a decorative connector renderer with line and relay styles
- persisted runtime UI state including keyboard collapse and input selection
- a richer DSP internals model than the current top-level UI exposes

What does **not** yet exist as a finished real system:
- a reusable generic rack container component
- a reusable generic node-shell component
- graph-aware routing descriptors driving the visible UI
- a wire renderer that consumes declared ports
- keyboard promoted to a true docked utility-panel UI rather than the current footer-derived presentation
- patch/performance dual projection as a finished first-class framework

The current code is already rich enough to seed the rack model, but several current "interface" concepts are only decorative or partially connected.

---

## Current UI Composition

Primary file:
- `UserScripts/projects/Main/ui/components/midisynth_view.ui.lua`

Current authored structure:

- `midisynth_root`
  - `mainStack`
    - `content_rows`
      - `top_row`
        - `adsrShell`
          - `envelopeComponent`
        - `oscillatorShell`
          - `oscillatorComponent`
        - `filterShell`
          - `filterComponent`
        - decorative connectors:
          - `adsrToSampleConnector`
          - `sampleToFilterConnector`
      - `bottom_row`
        - `fx1Shell`
          - `fx1Component`
        - `fx2Shell`
          - `fx2Component`
        - `eqShell`
          - `eqComponent`
        - decorative connectors:
          - `fx1ToFx2Connector`
          - `fx2ToEqConnector`
      - cross-row decorative relay:
        - `filterToFxRelay`
    - `keyboardPanel`
      - inline keyboard body/header
      - octave controls
      - MIDI input dropdown
      - refresh / panic / collapse buttons
      - voice note labels
      - keyboard canvas

### Observations

- layout is currently still **hardcoded** as top row + bottom row + keyboard footer
- the six main nodes are now wrapped in authored shell panels, but those shells are still handwritten in the view rather than provided by a reusable generic rack-node component
- shell order and size badge state are partially driven from seeded rack state, but row membership is still authored rather than dynamically rendered from rack occupancy
- shell accent bars are currently temporary debug visuals to make shell boundaries obvious, not agreed final styling
- component sizes are still constrained through authored row layout plus shell `layoutChild` updates
- keyboard is still presented as an inline footer-derived panel rather than a true utility-dock UI
- no finished generic patch/perf framework exists yet
- **important event-layering constraint discovered during shell drag work:** structured UI instantiates shell `children` before hosted `components`, so a shell child hit-strip sits underneath the hosted component root unless the component root stops intercepting mouse
- this is why placeholder nodes responded to shell drag affordances while the real ADSR/Osc/Filter/FX/EQ nodes initially did not: `placeholder.ui.lua` already had `interceptsMouse = false` at the root, while the real module roots did not

---

## Current Runtime Behavior / State

Primary file:
- `UserScripts/projects/Main/ui/behaviors/midisynth.lua`

### What this file currently does

`midisynth.lua` is effectively a very large coordination layer (~2499 lines) and currently owns or coordinates:
- scoped widget lookup for embedded tab usage
- MIDI device selection and refresh
- keyboard rendering and interaction
- voice display/status updates
- UI-to-DSP parameter synchronization
- sample mode / blend mode UI behavior
- background tick / repaint scheduling
- saved runtime state load/save
- panic behavior
- some preset-style save/load behavior for current state

### Persisted runtime state currently observed

From `midisynth.lua`, current runtime persistence now includes at least:
- `keyboardCollapsed`
- `utilityDockVisible`
- `utilityDockMode`
- `utilityDockHeightMode`
- `rackViewMode`
- `rackDensityMode`
- `rackNodes`
- selected MIDI input device
- parameter save/load behavior through runtime state helpers

### Important observation

The current system now has **seeded generic rack layout state under the hood** for:
- node position
- node size
- row occupancy intent
- utility-dock mode/height
- alternate rack density/view projections

What it still does **not** yet have is a finished user-facing rack system where those state contracts fully drive rendered row membership, interaction, and routing.

### Architectural implication

A full breakup of `midisynth.lua` is still probably not justified for this pass.
The pragmatic path remains:
- keep existing module internals and behaviors intact
- finish extracting reusable rack-specific shell/container/dock orchestration around them
- only split more of `midisynth.lua` when the rack boundary is concrete enough to justify it

---

## Current Connector Implementation

Files:
- `UserScripts/projects/Main/ui/components/patch_connector.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/patch_connector.lua`

### What the connector system actually is

`patch_connector.ui.lua` is just a panel shell with behavior attached.
The real logic is in `patch_connector.lua`.

### How it works today

The current connector behavior:
- finds source and target widgets via `fromSuffix` / `toSuffix`
- currently targets the new shell panel IDs rather than the inner module component IDs
- calculates relative sibling widget bounds
- renders either:
  - a simple line connector
  - a relay/wireless sender/receiver style connector
- draws decorative ports/sockets and optional labels

### What it does **not** do

- it does not consume component `ports` declarations
- it does not resolve node-level interface truth
- it does not render from a graph descriptor model
- it does not know anything about rack occupancy or node placement state
- it is tied to current concrete widget IDs and layout suffixes

### Why this matters

The current port declarations in component `.ui.lua` files are **not yet driving routing display**.
So today the ports are effectively decorative metadata unless another layer starts consuming them.

This is a critical gap the rack framework must close.

---

## Existing Component Port Declaration Audit

Current component files with `ports = {}` blocks:
- `envelope.ui.lua`
- `oscillator.ui.lua`
- `filter.ui.lua`
- `fx_slot.ui.lua`
- `eq.ui.lua`

### Current state of these declarations

They are present, but minimal.

Examples:
- Envelope declares only one CV output (`ENV`)
- Oscillator declares one CV input and one audio output
- Filter declares one audio input and one audio output
- FX declares one audio input and one audio output
- EQ declares one audio input and no output

### Assessment

These `ports` declarations are useful as seeds, but they are currently:
- too sparse for the intended patch view
- not consumed by the current connector system
- not yet aligned with the full real declared node interface implied by DSP + UI behavior

So the future node/interface model should not blindly trust current `ports` blocks as complete truth.
They are a starting point, not the final contract.

---

## Current DSP Structure

Primary file:
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`

### Top-level DSP chain

The current top-level signal chain is fixed:

`mix -> dist -> filt -> fx1 -> fx2 -> eq8 -> spec -> out`

This is established directly in the DSP builder through explicit graph connections.

### Important top-level nodes currently implied by DSP

- voice mix / mixer
- distortion stage
- filter stage
- FX1 slot
- FX2 slot
- EQ8
- spectrum analyzer
- output gain
- optional send to looper layer input

### Internal voice graph is richer than top-level UI suggests

Per-voice internals include:
- oscillator source
- sample playback source
- noise source
- sample blend path
- crossfades
- directional blend path
- ring blend path
- XOR blend path
- branch mixer
- voice mix
- hard sync from sample playback to oscillator sync input

### Important nuance: Osc mode UI vs DSP truth

`PATHS.oscMode` exists and is exposed to UI, but current DSP comments/behavior indicate:
- osc mode selection is currently treated as a **UI tab/view state**
- DSP remains on the canonical blend path rather than swapping top-level architecture per mode

This matters because the oscillator node already represents more internal complexity than the performance UI suggests.

### Important graph/UI gap

The DSP graph is built imperatively inside `midisynth_integration.lua`, but there is **no clean UI-consumable exported graph description**.

That means the future routing layer cannot simply introspect a ready-made graph descriptor today.
For first-pass rack routing, the project will likely need an explicitly authored or lightly exposed connection-descriptor source.

---

## Current Top-Level DSP / UI Mapping

### Visible top-level UI modules

| UI Module | Current UI Component | Current Behavior | Current DSP Relationship |
|---|---|---|---|
| ADSR | `ui/components/envelope.ui.lua` | `ui/behaviors/envelope.lua` | drives per-voice amp envelope state via ADSR params and voice amp updates |
| Oscillator | `ui/components/oscillator.ui.lua` | `ui/behaviors/oscillator.lua` | controls oscillator/sample/blend source configuration |
| Filter | `ui/components/filter.ui.lua` | `ui/behaviors/filter.lua` | controls `filt` and top-level `dist` drive |
| FX1 | `ui/components/fx_slot.ui.lua` | `ui/behaviors/fx_slot.lua` | controls first FX slot selection/mix/params |
| FX2 | `ui/components/fx_slot.ui.lua` | `ui/behaviors/fx_slot.lua` | controls second FX slot selection/mix/params |
| EQ | `ui/components/eq.ui.lua` | `ui/behaviors/eq.lua` | controls EQ8 band config/output/mix |
| Keyboard | inline keyboard panel in `midisynth_view.ui.lua` | handled inside `ui/behaviors/midisynth.lua` | controls MIDI input, note events, octave shift, voice status |

### Decorative connector mapping currently authored in UI

| Connector | Visual Meaning |
|---|---|
| ADSR -> Oscillator | compressed relationship hint |
| Oscillator -> Filter | main signal-flow hint |
| Filter -> FX1 relay | cross-row transition / send-recv visual language |
| FX1 -> FX2 | serial FX hint |
| FX2 -> EQ | final processing hint |

Important: these are **current presentation hints**, not graph-derived truth objects. They now visually attach to the shell panels, but they are still suffix-matched decorative hints rather than descriptor-driven routing.

---

## Per-Node Inventory

## 1. ADSR Node

### Current component
- `UserScripts/projects/Main/ui/components/envelope.ui.lua`

### Current behavior
- `ui/behaviors/envelope.lua`

### Current visible controls
- ADSR graph panel
- Attack knob
- Decay knob
- Sustain knob
- Release knob

### Current declared ports in component file
- outputs:
  - `cv_out` (`ENV`)

### Current DSP paths / state
- `/midi/synth/adsr/attack`
- `/midi/synth/adsr/decay`
- `/midi/synth/adsr/sustain`
- `/midi/synth/adsr/release`
- also participates indirectly in per-voice amp behavior through voice amp/gate logic in `midisynth.lua` and DSP integration

### Likely patch-view port candidates
Conservative current-truth candidates:
- gate input
- envelope output
- attack / decay / sustain / release parameter points

### Inventory assessment
Current component port declaration is incomplete relative to likely intended node interface.
It only exposes `ENV`, while the actual conceptual node already implies more interface truth than that.

---

## 2. Oscillator / Sample / Blend Node

### Current component
- `UserScripts/projects/Main/ui/components/oscillator.ui.lua`

### Current behavior
- `ui/behaviors/oscillator.lua`

### Current visible controls
Shared / always visible:
- oscillator graph panel
- Blend knob
- Output knob

Wave tab:
- waveform dropdown
- Drive knob
- Pulse Width knob
- Unison knob
- Detune knob
- Spread knob

Sample tab:
- sample source dropdown
- capture button
- bars number box
- root number box
- start percent box
- length percent box
- crossfade box

Blend tab:
- blend mode dropdown
- key track radio
- XOR behavior toggle
- wave-to-sample knob
- sample-to-wave knob
- blend sample pitch knob
- blend mod amount knob

### Current declared ports in component file
- inputs:
  - `cv_in`
- outputs:
  - `audio_out`

### Current DSP paths / state
- `/midi/synth/waveform`
- `/midi/synth/pulseWidth`
- `/midi/synth/unison`
- `/midi/synth/detune`
- `/midi/synth/spread`
- `/midi/synth/osc/mode`
- `/midi/synth/sample/source`
- `/midi/synth/sample/captureTrigger`
- `/midi/synth/sample/captureBars`
- `/midi/synth/sample/rootNote`
- `/midi/synth/sample/playStart`
- `/midi/synth/sample/loopStart`
- `/midi/synth/sample/loopLen`
- `/midi/synth/sample/crossfade`
- `/midi/synth/sample/retrigger`
- `/midi/synth/blend/mode`
- `/midi/synth/blend/amount`
- `/midi/synth/blend/waveToSample`
- `/midi/synth/blend/sampleToWave`
- `/midi/synth/blend/keyTrack`
- `/midi/synth/blend/samplePitch`
- `/midi/synth/blend/modAmount`
- `/midi/synth/blend/xorBehavior`
- note also: osc mode currently behaves more like UI-mode selection while DSP remains on canonical blend path

### Likely patch-view port candidates
Conservative current-truth candidates:
- note / pitch / gate style control inputs
- audio output
- sample/blend-related parameter points
- waveform / pulse width / unison / detune / spread parameter points
- sample capture/source parameter points

### Inventory assessment
Current declared ports are dramatically sparser than the real node contract implied by UI + DSP paths.
This node is one of the clearest examples of why patch view must be driven by a richer node interface model, not the current minimalist component `ports` block alone.

---

## 3. Filter Node

### Current component
- `UserScripts/projects/Main/ui/components/filter.ui.lua`

### Current behavior
- `ui/behaviors/filter.lua`

### Current visible controls
- filter graph panel
- filter type dropdown
- cutoff knob
- resonance knob

### Current declared ports in component file
- inputs:
  - `audio_in`
- outputs:
  - `audio_out`

### Current DSP paths / state
- `/midi/synth/filterType`
- `/midi/synth/cutoff`
- `/midi/synth/resonance`
- `/midi/synth/drive`

Important nuance:
- `drive` is grouped visually under oscillator/wave UI in places conceptually, but at DSP level it is bound to the top-level distortion stage preceding filter

### Likely patch-view port candidates
Conservative current-truth candidates:
- audio input
- audio output
- cutoff parameter point
- resonance parameter point
- filter type parameter point
- drive parameter point if treated as part of this top-level processing region

### Inventory assessment
Current component declares only audio in/out, but actual user-facing and DSP-facing parameter surface is richer.

---

## 4. FX1 Node

### Current component
- `UserScripts/projects/Main/ui/components/fx_slot.ui.lua`

### Current behavior
- `ui/behaviors/fx_slot.lua`

### Current visible controls
- effect type dropdown
- XY pad
- X parameter dropdown
- Y parameter dropdown
- knob 1 parameter dropdown
- knob 2 parameter dropdown
- knob 1
- knob 2
- mix knob

### Current declared ports in component file
- inputs:
  - `audio_in`
- outputs:
  - `audio_out`

### Current DSP paths / state
- `/midi/synth/fx1/type`
- `/midi/synth/fx1/mix`
- `/midi/synth/fx1/p/0..4` (through generated param paths)

### Likely patch-view port candidates
Conservative current-truth candidates:
- audio input
- audio output
- mix parameter point
- effect type parameter point
- multiple effect parameter points mapped from the active effect contract
- potentially XY-related parameter surfaces as declared control points

### Inventory assessment
Current port declaration only captures basic audio flow. The actual parameter surface is much richer and effect-dependent.

---

## 5. FX2 Node

### Current component
- `UserScripts/projects/Main/ui/components/fx_slot.ui.lua`

### Current behavior
- `ui/behaviors/fx_slot.lua`

### Current visible controls
Same component contract as FX1.

### Current declared ports in component file
- inputs:
  - `audio_in`
- outputs:
  - `audio_out`

### Current DSP paths / state
- `/midi/synth/fx2/type`
- `/midi/synth/fx2/mix`
- `/midi/synth/fx2/p/0..4`

### Likely patch-view port candidates
Same shape as FX1:
- audio input
- audio output
- mix parameter point
- effect type parameter point
- active effect parameter points

### Inventory assessment
Same conclusion as FX1.

---

## 6. EQ Node

### Current component
- `UserScripts/projects/Main/ui/components/eq.ui.lua`

### Current behavior
- `ui/behaviors/eq.lua`

### Current visible controls
Visible compact editing controls for a selected band:
- EQ graph panel
- curve/type dropdown
- frequency number box
- gain number box
- Q number box

### Current declared ports in component file
- inputs:
  - `audio_in`
- outputs:
  - none declared in current component file

### Current DSP paths / state
- `/midi/synth/eq8/output`
- `/midi/synth/eq8/mix`
- `/midi/synth/eq8/band/{1..8}/enabled`
- `/midi/synth/eq8/band/{1..8}/type`
- `/midi/synth/eq8/band/{1..8}/freq`
- `/midi/synth/eq8/band/{1..8}/gain`
- `/midi/synth/eq8/band/{1..8}/q`

### Likely patch-view port candidates
Conservative current-truth candidates:
- audio input
- audio output or final-stage out point depending on how final output node is modeled
- output trim parameter point
- mix parameter point
- per-band frequency/gain/Q/type points
- per-band enable points

### Inventory assessment
Current component port declaration is again much sparser than the actual node contract. Also, the lack of an output declaration in the current UI file is probably insufficient for patch view if EQ remains part of the displayed chain.

---

## 7. Keyboard Node / Rack

### Current component
No dedicated node component exists yet.
Keyboard is authored inline inside `midisynth_view.ui.lua` as `keyboardPanel`.

### Current behavior owner
- primarily handled inside `ui/behaviors/midisynth.lua`

### Current visible controls
- octave down button
- octave up button
- octave range label
- MIDI waiting/input status label
- 8 voice note labels
- MIDI input dropdown
- refresh button
- panic button
- collapse button
- keyboard canvas/body
- secondary keyboard status text

### Current persisted state
- keyboard collapsed/expanded
- MIDI input device selection / restoration behavior

### Current declared ports
- none as a formal component/node contract yet

### Likely future patch-view contract candidates
These are not yet formally declared in code, so treat as future node-contract work rather than present truth:
- MIDI input source
- note/gate emission into synth voice system
- voice allocation/status display points

### Inventory assessment
Keyboard is currently the least rack-ready part of the system conceptually.
It has real UI/state, but it does not yet exist as a node or interface contract.

---

## Gaps Between Current Code and Rack Framework Needs

### 1. Layout model gap
Current code has fixed authored rows; future system needs explicit node placement and occupancy.

### 2. Event-layering gap
Current shell interaction experiments proved that shell-level drag surfaces cannot be designed naively: hosted component roots sit above shell child hit regions in the current structured UI instantiation order, so root interception must be managed intentionally.

### 3. Port truth gap
Current component `ports` blocks are real-but-minimal, and current wire rendering ignores them completely.

### 4. Routing descriptor gap
Current UI routing is hardcoded by widget suffix; future system needs connection descriptors tied to node identities and declared ports.

### 5. Keyboard model gap
Current keyboard is a special footer, not a rack/container with node contract.

### 6. Monolithic coordination gap
`midisynth.lua` currently centralizes too much behavior for a perfectly clean architecture, so first-pass migration should wrap and delegate instead of forcing a full breakup.

### 7. Patch truth gap
Patch view wants to show honest interface truth, but current components only expose fragments of that interface explicitly.
A richer node registry/schema layer will be needed.

---

## Recommended Immediate Next Step After Phase 0

Define the **Phase 1 data model** concretely:
- `rackState`
- `nodeSpec`
- `nodeInstance`
- `portSpec`
- `connectionDescriptor`
- occupancy helper contract

But when doing so, keep these Phase 0 realities in mind:
- same-row reorder must preserve sizes
- patch and perf should generally share placement
- wire layer must replace suffix matching
- current `ports` blocks are seeds, not full truth
- first pass should delegate to the existing behavior monolith where needed
- keyboard needs explicit promotion into its own rack model

---

## Bottom Line

The current system is not a blank slate. It already contains:
- module UIs
- module behaviors
- minimal port metadata
- decorative routing language
- fixed DSP truth
- runtime state persistence

But the core abstractions needed for the rack framework do not yet exist as first-class concepts.

So the job is not "invent everything from scratch."
The job is:
- extract the real contracts already implied by the code
- stop relying on decorative/hardcoded wiring assumptions
- introduce node/rack/layout truth cleanly enough that the existing fixed instrument can live inside it now and future modulation/modular systems can grow into it later.
