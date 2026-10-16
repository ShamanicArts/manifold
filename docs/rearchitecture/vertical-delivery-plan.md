# Manifold vertical delivery plan

## Current sequencing: primitives visible in DspLiveScripting first

Lucas explicitly changed the delivery order on 1 October 2026: transcribe the DSP primitives and reusable modules into the live scripting creator first, so their source, graph, controls and sound can be inspected and changed. Then assemble the individual projects and instruments from those public modules. This supersedes older next-product instructions below.

Each transcription is a vertical slice: authored source, live retained and egui controls, prepared Rust audio, save/reopen, public import and native package, plus actual interactive/audio evidence. A catalog entry or backend fixture alone does not close a row. Preserve the full 28-project/19-rack-module scope, arbitrary I/O, Main single graph ownership, agent authoring, native/DAW delivery and performance comparisons. See [primitive transcription ledger](primitive-transcription.md).

1 October 2026. Requested by Lucas after the [delivery drift audit](delivery-drift-audit.md).
This is an accepted delivery plan, not an implementation checkpoint. Lucas
approved the refined goal; implementation has resumed. The backend already present is
implementation material to integrate, not credit for completed product slices.
The [proposed delivery goal](proposed-delivery-goal.md) defines the objective,
completion conditions and execution rules accepted by Lucas. Current work and
remaining acceptance are recorded in the [active delivery](active-delivery.md).

**Live agent refinement, 1 October:** humans and agents are first-class clients
of the same running project. Sentinel is the reference for integrated AI controls;
its live interaction review remains open. The goal's
[human/agent acceptance](proposed-delivery-goal.md#live-human-and-agent-authoring-acceptance)
applies from V01 and extends with every capability. Each slice includes structured
agent discovery/edit/observation and product-native task/action controls, shared
accepted state, conflict handling and authored-edit undo. Real agent use while
the human operates the instrument is part of delivery evidence.

## Delivery rule

A slice is a complete usable behavior of an actual Manifold project: authored
source → public graph API → Rust DSP/services → live egui and JS/TS presentation
→ browser/native host → saved project and reopen. Project-specific behavior stays
in inspectable authored modules. Shared primitives, host adapters and UI bindings
are developed as the selected product behavior needs them.

The first slice includes working egui in browser and native, original widget
behavior, a JS-authored view through a typed presentation binding, a real code
editor, and actual live controls. The remaining rows extend that working product.
They do not create a backend phase followed by a future frontend phase.

Every row's acceptance is the conjunction of its feature, UI, scripting, host,
state, legacy behavior and evidence. A row cannot be called complete based on a
DSP fixture, a static imported graph, a screenshot of controls with no live
connection, or a successful exported-ABI probe.

## UI choice: shared kit, immediate and retained presentation

Lucas clarified on 1 October that users must be able to choose immediate or
retained presentation, and internal products should choose per interaction.
Language and presentation mode are independent: Rust custom egui and JS/TS
immediate bindings are supported directions, alongside retained web components
and custom HTML/Three.js or framework views. egui remains a supported primary
native/browser path; it is not mandatory for every product surface.

Share stable control IDs, parameter mappings/units, gesture and host-automation
commands, theme tokens, component metadata, saved view state and graph/analysis
access. The UI kit has egui and retained web implementations of common controls
such as sliders, buttons, knobs and tab controllers. Some specialized components
can declare a specific renderer requirement. Renderers may require different
painting and layout implementations; one public control contract does not imply
one universal renderer or identical framework APIs.

A persistent component/layout description can be presented through an immediate
egui traversal or retained DOM layout. Direct custom egui code and arbitrary web
views remain available through the same project/control bindings. An independent
web importer can supply its own UI without loading Manifold's editor or UI kit.
Native DOM/JS views require an actual webview host; arbitrary web framework code
does not become a native egui view automatically.

For V01, demonstrate the actual Filter in egui and retained JS/TS controls, plus
a representative JS-authored immediate egui control. Operate the same project
from either view and show automation, gestures and recall agreeing. Later product
slices select or combine modes according to their original interaction and measured
cost; they need not reproduce every custom surface in both renderers. Both kit
paths remain usable and their representative compatibility is demonstrated.

Bridge frame input/snapshots and drawing in batches; avoid individual cross-language
calls for every drawing primitive. UI execution and repaint are independent of
audio scheduling. Frame/layout traversal must not repeat project mutations.
Measure layout, drawing, bridge and idle cost in the delivered interaction;
neither Wasm nor a UI mode alone establishes a performance advantage.

## Evidence supplied with every slice

| Deliverable | What the user can do or see | Why it is required |
| --- | --- | --- |
| Live product build | Tailscale link to the running instrument/editor. Edit graph/source and use actual controls while it runs; no application rebuild for ordinary script, parameter or compatible topology edits. | Establishes the actual creator workflow and makes progress independently reviewable. |
| Native product build | Downloadable standalone build and the relevant CLAP/VST3 export using the same authored project. Operate its real editor in a DAW, automate controls, close/reopen the editor, save/reopen the project. | Establishes the native scope and editor-independent project life; browser-only delivery does not satisfy it. |
| Recording of the interaction | Video with audio for sounding projects: actual pointer/keyboard edits, visible graph/UI response, audible result and recall. UI-only/media projects use a corresponding interactive recording. | Makes the live behavior visible without requiring the user to discover the controls or trust a prose report. A static screenshot is supplementary. |
| Authored source and portable project | Small independent consumer importing the public library; readable graph/controller/view source, TS types/example, a Rust authoring equivalent for the representative behavior, resources and reopenable state. | Demonstrates library use and user/agent authoring without internal Main APIs or a copied DSP processor. |
| Supporting engineering evidence | A bounded legacy interaction/audio/state comparison, targeted callback/publication checks, and measured edit latency/performance for the delivered scenario. | Explains fidelity and limitations of the usable product. These support the delivery; they do not replace it. |

Each handoff states what changed in the product, where to open it, how to exercise
the delivered behavior, the measured result, the remaining behavior and the next
slice. Evidence records the exact source/build and actual host. Repeated test
expansion stops once it answers the slice's concrete remaining risks.

Automated playback uses a verified private audio sink and isolated display, with
no physical-speaker/H6 routing or user-focus interruption. Permission-dependent
camera/mic workflows use captured fixtures for automation and expose the actual
device workflow in the user build. Fixture runs are labelled as such.

## Ordered product slices

Order is a delivery sequence. Smaller updates within a row must still expose a
usable product behavior. Each completed row remains accessible while the next is
developed. Shared defects are fixed through the affected product and shown there.

### V01 — Author and operate the existing Filter in DspLiveScripting

**Projects:** `Standalone_Filter`, the initial `DspLiveScripting` workflow.

**Integrate:** importable graph/controller/view; original Filter defaults,
mode/cutoff/resonance and response/XY interaction; actual external/file input;
syntax-highlighted JS editor with indentation, undo/redo, API completion and
useful errors; source selection, Run, Stop and reload; actual graph inspection;
runtime widgets from endpoint metadata. Port the corresponding kit behavior to
egui and retained web controls, and expose a representative JS/TS immediate
egui widget binding. Both views edit the same parameter and graph model,
including host automation feedback.

**Reuse:** existing SVF, port/parameter catalog, authoring sessions, prepared
browser runtime, native JS/package runtime and graph plug-in hosts. Fill native
device/editor gaps as part of operating this Filter.

**Specific evidence:** move the original Filter controls during uninterrupted
audio; insert/bypass an authored node from the code editor; show the same change
in the graph and sound; reject a broken script while preserving the previous
instrument; close the editor while processing, reopen, save and recall. Show
egui and the JS-authored view, the independent importer, and actual native editors.
Connect a real agent through the product's structured interface: inspect the
running graph, insert/bypass a node and add/rebind a kit control while the human
edits the same Filter. Show task/action feedback, accepted shared state, a stale
revision conflict, invalid-edit recovery and authored-edit undo, with tool trace
and live audio/video. Extend that workflow through subsequent products.

**Why first:** the DSP and graph machinery already exist, and this is the
smallest real product that exposes the exact missing author → UI → sound loop.

### V02 — Play the existing oscillator instrument and Main Wave voice module

**Projects:** `StandaloneOsc`, Main's Wave/voice behavior, Rack oscillator.

**Integrate:** keyboard/hardware MIDI, voice allocation, ADSR, waveform, pitch,
unison/detune/spread, drive and existing additive controls; original Source and
ADSR faces; inspectable eight-voice and rack oscillator compositions. Changes
use public graph/control interfaces in both authoring languages and UI clients.

**Specific evidence:** play a musical phrase/chord; hold notes while editing the
graph and controls; release without stuck notes; show keyboard/envelope/meter
feedback; switch views and recall the patch in browser/native/DAW. Compare the
actual old note/allocation/envelope scenario and audio.

**Why:** supplies a sounding instrument early and exposes whether the framework
works for instruments as well as input effects. The existing authored Wave and
nine-source rack graph can be integrated rather than replaced by another demo.

### V03 — Operate and script the original effect slot

**Projects:** `Standalone_FX`, Main FX1/FX2, the `DspLiveScripting` swap harness.

**Integrate:** original effect selection, live XY pad, mix and per-effect
parameters/memory, relevant existing effect algorithms, bypass and tail behavior;
editable effect composition and lazy instance creation/removal; source list,
runtime endpoint widgets and script lifecycle for the old swap harness. Carry
legacy OSC/endpoint behavior through the actual effect where present.

**Specific evidence:** process music through several contrasting effects,
change parameters live, switch away/back and retain controls, audition tail and
bypass behavior, edit the graph from source, and save/reopen each actual host.
The effect-list audit records every shipped choice rather than assuming the
legacy rack slot and the larger standalone effect catalog are identical.

**Why:** demonstrates practical musical effect behavior and dynamic graph
composition, including state the Filter cannot exercise.

### V04 — Operate the original eight-band EQ

**Projects:** `Standalone_Eq`, Main EQ8, Rack EQ8.

**Integrate:** enabled bands, draggable response points, type/frequency/gain/Q,
output/mix, selected-band feedback, graph lookup and stable automation bindings.
The displayed response reads the actual accepted DSP targets.

**Specific evidence:** shape a real track using the original point interactions;
automate a band and watch both UI clients update; script a band/route change;
save/reopen and compare response plus output against the legacy scenario.

**Why:** proves custom painting and richer UI interactions tied to actual DSP.

### V05 — Build and edit a real rack in RackModuleHost and Main

**Projects:** `RackModuleHost`, Main Rack/Patch.

**Integrate:** module palette/factories, multiple instances, add/remove, selection,
move/resize, cables, source lookup and per-instance controls. Start with the
delivered oscillator/Filter/FX/EQ; extend with each following Sample/CV/MIDI slice.
Rack and Patch project the same graph and layout. Arbitrary buses/channels and
typed ports appear in the actual authoring and routing UI, with explicit maps,
optional disconnection and concrete host negotiation errors.
The shared creator workspace is the default editor in website, standalone and
plug-in hosts, with host-specific file/device panes and explicit capabilities.
Human and agent clients use the same structural commands. Users can save an
authored composite of primitives with typed ports and parameters into a versioned
user library; the palette can then discover and instantiate it. Graph placement
persists as editor metadata while authored source remains the graph authority.

**Specific evidence:** assemble and play an oscillator → Filter → FX → EQ rack;
rewire while sounding, delete/reinsert a module, export a subgraph, reopen the
layout, and show UI/source/automation agreement. Route distinct inputs to
independent outputs in browser, standalone and a real DAW; add generator-only,
mono and asymmetric layouts. Device/host shape changes use their supported stop,
negotiate and restart lifecycle, distinguished from live parameter/route edits.
Also author and save a composite module through both human and agent workflows,
load two instances from the user library, and verify the same graph/inspector/
source operations in each host. A rendered but non-editable graph does not pass.

**Why:** turns existing bus/publication work into the creator capability requested.
V05 stays open until the 19-module registry is covered by V02–V08:

`rack_oscillator`, `rack_sample`, `blend_simple`, `filter`, `fx`, `eq`, `adsr`,
`arp`, `transpose`, `velocity_mapper`, `scale_quantizer`, `note_filter`, `lfo`,
`slew`, `sample_hold`, `compare`, `cv_mix`, `attenuverter_bias`, `range_mapper`.

Main's additional Source/FX instances and legacy placeholder behavior are tracked
separately; they cannot silently disappear because RackModuleHost has 19 entries.

### V06 — Capture and play the original Sample instrument

**Projects:** `Standalone_Sample`, Rack Sample, Main Sample/source controls.

**Integrate:** file/live/retrospective capture, source selection, waveform,
regions/slots, root/pitch, gate/ADSR, loop/stretch/crossfade and vocoder modes
actually present in each old project, shared PCM and polyphonic playback. The
same authored Sample module is hosted standalone and in Main/RackModuleHost.

**Specific evidence:** capture/import a phrase, edit its region on the waveform,
play it polyphonically, change playback modes, edit compatible topology under
held notes, and reopen with actual PCM and source choices intact across hosts.

**Why:** integrates the existing resource and Sample publication machinery into
the musical workflow it was supposed to enable.

### V07 — Patch the original modulation and control modules

**Projects:** Main and RackModuleHost control modules.

**Integrate:** LFO OUT/INV/UNI/EOC, reset/sync, ATV/Bias, Slew, Sample Hold,
Compare, CV Mix and Range; original knobs/sliders/graphs/meters; typed
CV/gate/trigger cables; dynamic instances and target registration.

**Specific evidence:** patch an LFO through control utilities to a sounding
Filter/oscillator; visibly change scale, polarity, slew and trigger behavior;
add/remove a second independent modulator while running; recall routing and
phase/state under the documented continuity policy. Compare original traces.

**Why:** proves real modular control/data flow instead of a fixed parameter panel.

### V08 — Play and export the original MIDI processors

**Projects:** `Standalone_Transpose`, `Standalone_NoteFilter`,
`Standalone_ScaleQuantizer`, `Standalone_VelocityMapper`, `Standalone_Arp`;
corresponding Main/RackModuleHost modules and ADSR voice outputs.

**Integrate:** each original module face and controller, device input, typed
MIDI/voice/gate ports and native MIDI output; transpose ownership, note filtering,
scales/direction, velocity curves, arp mode/rate/octaves/gate/hold and transport.
Deliver each processor as a usable slice before the combined chain.

**Specific evidence:** play the keyboard/device through each processor and a
real instrument; observe transformed notes/velocities and matching audible
result; edit under held notes; exercise sustain, release and transport; reopen
the exported MIDI effect and chain in a DAW without stuck notes.

**Why:** establishes event behavior and MIDI-effect exports, which audio-only
channel recordings cannot demonstrate.

### V09 — Use Main's actual four-layer looper and transport

**Project:** Main Looper.

**Integrate:** original LoopLayer composition, dry input/trim/monitor and synth
capture/send branches, First Loop/Free/Traditional modes, quantized capture and
retrospective selection, play/stop/overdub/clear, volume/mute/speed/seek/scrub,
tempo/target/bar controls and original capture-plane/layer UI. Integrate host
transport and Ableton Link behavior as required by the legacy project.

**Specific evidence:** perform a four-layer loop from input and the delivered
synth, overdub, scrub and change tempo; edit a real capture/monitor connection;
show the layer waveforms/positions and hear the corresponding routing; save,
restart the native host/DAW and resume with takes and control state restored.

**Why:** restores a central product workflow. The existing independent capture
tests are material to reuse; they do not establish Main's quantized LoopLayer.

### V10 — Play Main's remaining synthesis and blend branches

**Project:** Main MidiSynth and Rack Blend/Source.

**Integrate:** Sample/Wave blend, Ring, FM, Sync, additive and morph branches,
direction/keytracking/depth controls and the original Source tabs, per-voice
controllers and actual legacy graph factories. Finish each branch as a sounding
UI/script slice; preserve the appropriate voice/resource state while editing.

**Specific evidence:** play a musical patch in each mode, manipulate its original
controls live, inspect the authored graph, hold/release notes through mode and
topology changes, record into the real looper and save/reopen the whole patch.

**Why:** completes the original instrument rather than treating its partial Wave
branch or a replacement monolithic kernel as Main.

### V11 — Create, save and perform with the complete authored Main project

**Project:** Main as one product.

**Integrate:** complete Rack/Patch, synth, looper, controls, presets, layout,
resource/state import, MIDI, endpoint discovery/OSC and transport services;
complete author/view/host linkage. Remove remaining bespoke Main DSP ownership
only when the authored product carries its corresponding behavior.

**Specific evidence:** author a Main patch from primitives/modules, edit source
and UI, play and loop a performance, automate it in a DAW, reopen its editor and
saved session, and reopen the portable project in the browser. Demonstrate chosen
legacy/v2 session migration and explicit failures for unsupported old state.

**Why:** closes the combined product gate; completing modules separately does
not establish their original interaction in Main.

### V12–V15 — Play the other synthesis instruments

Every row includes its original interaction intent, the selected immediate or
retained presentation through public view bindings, public graph composition,
live edits, resources, native/browser/DAW hosting and recall. An absent kernel is
implemented inside that instrument slice.

| Slice / project | Features integrated | Distinct live evidence | Why |
| --- | --- | --- | --- |
| V12 `VectorSynth` | Polyphony, vector control/mixing and per-note vector envelopes from the old project. | Play and move the vector surface; inspect per-voice motion; edit and recall a musical patch. | Exercises authored per-note control and custom performance painting. |
| V13 `GranularLab` | Live/file capture, freeze, grain controls and original cloud UI. | Capture audio, freeze and sculpt a cloud, edit while it plays, reopen the sample and patch. | Exercises dynamic granular resources through a real instrument. |
| V14 `KarplusStrongLab` | Original polyphonic string graph/excitation and performance controls; missing reusable DSP as needed. | Play overlapping plucks, change the string controls, inspect decay/voice behavior and reopen. | Closes a genuinely missing synthesis family through a playable product. |
| V15 `ModalLab` | Original polyphonic resonator instrument, excitation and mode controls. | Play a resonant phrase, manipulate modes, edit the graph and recall it across hosts. | Establishes a complete modal instrument rather than isolated resonator parity. |

### V16–V17 — Author the original UI/layout projects

| Slice / project | Features integrated | Distinct live evidence | Why |
| --- | --- | --- | --- |
| V16 `ExperimentalUI` | Remaining original widget behavior, script-authored interactions, themes, focus and custom painting in the shared egui/JS model. | Rewrite a displayed component, operate it against a real delivered instrument, switch/reopen views and retain the declared state. | Completes the reusable user-facing UI kit beyond the widgets needed by earlier instruments. |
| V17 `LayoutModeDemo` | Original stack/grid/overlay behavior, sizing, nested layout and persisted view placement. | Rearrange/resize a functioning instrument view from code and pointer, change layout modes and reopen it. | Establishes project-authorable layout instead of instrument-specific coordinates. |

Kit coverage includes Slider, Knob, XY pad, Dropdown, NumberBox, Toggle, Button,
Radio/Segmented controls, Meter, Waveform, Curve, Donut, Panel, Label,
TabHost/TabPage/ProjectTabHost and GL/custom surfaces. Widget behavior is traced
from `manifold/ui/widgets`; surface/shader behavior is carried into the relevant
media products. A widget's identity, interaction mapping and saved semantics must
work through public view bindings; visual imitation alone is insufficient.

### V18–V26 — Operate the original media and A/V projects

Each row is a project with its UI, scripting, media/data ports, resources, clock
mapping, host capabilities and recall. Device/GPU/ML services are added through
the product that needs them. Capture and drawing never enter the audio callback.

| Slice / project | Features integrated | Distinct live evidence | Why |
| --- | --- | --- | --- |
| V18 `WebcamViewer` | Device selection/capture binding, live frame surface and device lifecycle. | Select/open/close a camera in the actual view; exercise fixture playback, device loss and reopen. | Restores the first-party camera project and the usable media binding. |
| V19 `MLLab` | Original `.tflite` loading and inference over webcam frames; script-visible outputs and inference UI. | Load a real model, show frame-to-output updates, use an output to control an instrument and recall the configuration. | Delivers structured data/control authoring and the original ML workflow. |
| V20 `VideoSamplerLab` | Commit captured A/V; SampleRegionPlayback position drives video. | Scrub/play a committed clip, change pitch/speed and compare visible frames with audible position; reopen. | Establishes the audio/video clock relationship in a real sampler. |
| V21 `VideoPolySamplerLab` | Up to eight independent audio-timed sample/video voices and grid presentation. | Play overlapping notes at distinct positions/rates, inspect independent video voices, release and recall. | Extends actual sampler ownership/timing to polyphony. |
| V22 `VideoSliceRackLab` | Committed capture, waveform markers, eight MIDI slice one-shots and active-note auto-split rendering. | Edit slice markers, trigger multiple slices, change the rack live and reopen its A/V assets. | Integrates graph mutation, markers and timed media into the original performance workflow. |
| V23 `AVSampler` | Segmented capture, pose publishing/mapping, poly/slice playback, shader background, docking and post-mix FX. | Capture and perform with pose-driven controls, rearrange panes, change FX and recall the complete performance project. | Restores the larger A/V product and demonstrates browser-specific view integration. |
| V24 `AVSamplerLab` | Its actual lab behavior and horizontal active-video row using shared capture/playback/controller modules. | Perform overlapping clips and show the active row responding correctly; reopen its own state. | Preserves this distinct project instead of assuming AVSampler completes it. |
| V25 `avsamplerDOCKING` | Decomposed docking modules, pane layout and the original module architecture. | Author/rearrange the working media panes, preserve playback, save and restore the layout. | Demonstrates reusable project/view modules and the separate docking behavior. |

**V26 — Author a custom A/V performance view.** Use the delivered `AVSampler`
project to write a JS/TS view with a Three.js or HTML surface alongside egui,
through public frame/resource and control bindings. Integrate positioning,
focus/input, view lifecycle and persistent layout while the same project keeps
processing. Evidence is a user-authored view displaying actual playback frames
and analysis, controlling the sounding sampler, edited live and reopened from
its portable package. This delivers the explicitly requested ability to build
browser-specific presentation around Manifold without owning its audio timing.

Native/browser service availability, editor detach, file/device lifecycle,
imported assets and frame resources are acceptance requirements of each affected
media project above. They are not deferred to V26. Each delivered package declares
its required capabilities; unavailable services produce useful errors. Browser
HTML/Three.js views need an explicit native presentation choice. Missing legacy
support keeps its affected project open rather than being renamed a limitation.

### V27 — Use RuntimeBenchmark against the delivered products

**Project:** `RuntimeBenchmark`.

**Integrate:** original interactive node spawning/stress controls, graph
inspection, live counters and errors through the public authoring and UI APIs.
Benchmark actual delivered Filter, FX, Sample, Main and media scenarios against
matching original C++ behavior and native Rust/Wasm workloads.

**Specific evidence:** an interactive benchmark project the user can run and
change while processing; reproducible topology/workload selection; measured
callback p50/p95/p99/max, edit-to-audible latency, CPU and memory, and any glitches
in actual captured output across relevant real hosts.

**Why:** restores an actual legacy project and evaluates delivered behavior.
Performance regressions encountered earlier are resolved in the affected slice;
performance is not an excuse to defer its usable interface until V27.

## Cross-cutting features have product homes

| Feature | Product delivery that introduces or extends it | Required visible result |
| --- | --- | --- |
| Library, Rust/JS/TS API, discovery and agent access | V01, extended by every instrument | Independent consumer builds the instrument, queries its nodes/ports/parameters and submits the same edits as UI; useful errors and generated types. |
| Integrated live human/agent authoring | V01, extended with every delivered capability; Sentinel interaction reference | Real agent and human edit the same sounding project, graph and UI; visible task/action controls, accepted state, conflict/failure recovery, undo and measured publication latency. |
| egui, JS/TS UI, original kit, painting and layout | V01; Filter/Source/FX/EQ/Rack interactions; V16–V17 complete the remaining kit | Same accepted model drives real views and host automation feedback; a user can author a component. |
| Script editor, Run/Stop/reload and failure recovery | V01 and V03 | Proper code editor, runtime parameter widgets and graph inspection; rejected source keeps the previous sound; editor closure preserves project execution. |
| Arbitrary I/O, primitive/module widths and typed data ports | V05, V07–V08 and media samplers | Actual patchable ports, explicit conversion/channel maps, independent buses and visible native/browser/DAW negotiation. Existing stereo kernels declare their supported widths. |
| Standalone devices, CLAP/VST3 and packaging/export | V01, extended per instrument | Actual installed/importable product with working editor, automation, device/channel routing and recall. Native exports load the authored project. |
| Resources and continuity | V02, V03, V06, V09 and media products | Held notes, FX tails, takes/PCM and A/V positions behave according to each original project and its explicit improvement policy during edits. |
| Transport, MIDI, Link, OSC/OSCQuery and endpoint services | V03/V08/V09/V11 where the legacy project uses them | External device/DAW/service interaction drives the same sounding project and visible state. |
| State, presets and compatibility | Every row; V11 completes Main import | Actual edited project reopens with declared graph, controls, assets and layout; stable automation IDs; explicit migration or failure. |
| Performance, callback safety and regression fixes | Measured within each sounding row; V27 broader comparison | Demonstrated live behavior meets its measured timing/resource limits; no repeated validation detached from a product delivery. |

## Complete legacy project coverage

| Legacy manifest | Delivery slices |
| --- | --- |
| Main | V02–V11 |
| DspLiveScripting | V01, V03 |
| RackModuleHost | V02–V08 |
| RuntimeBenchmark | V27 |
| Standalone_Filter | V01 |
| Standalone_FX | V03 |
| Standalone_Eq | V04 |
| Standalone_Sample | V06 |
| StandaloneOsc | V02 |
| Standalone_Arp | V08 |
| Standalone_NoteFilter | V08 |
| Standalone_ScaleQuantizer | V08 |
| Standalone_Transpose | V08 |
| Standalone_VelocityMapper | V08 |
| VectorSynth | V12 |
| GranularLab | V13 |
| KarplusStrongLab | V14 |
| ModalLab | V15 |
| ExperimentalUI | V16 |
| LayoutModeDemo | V17 |
| MLLab | V19 |
| WebcamViewer | V18 |
| AVSampler | V23, V26 |
| AVSamplerLab | V24 |
| avsamplerDOCKING | V25 |
| VideoPolySamplerLab | V21 |
| VideoSamplerLab | V20 |
| VideoSliceRackLab | V22 |

The [legacy inventory](legacy-projects.md) is the minimum project set, not a
license to omit other shipped primitive/export behavior. The current v2
project descriptors are reusable implementations/fixtures; their distinct
behaviors are attached to the corresponding instrument/module product. Unmapped
legacy kernels, services or UI behaviors discovered while tracing a row remain
explicit work on that row or a new named product slice. No row is closed by its
name appearing in this table. No legacy behavior is removed without the user's
explicit decision.

## Governing acceptance

The user can import Manifold, author a graph and its UI, interact with the result
while it runs, package the same instrument for browser and native use, and
save/reopen it. Every shipped instrument is built through that public path.
Completion requires the actual legacy projects and shared UI/host contracts;
supporting tests and reports are evidence attached to usable deliveries.
