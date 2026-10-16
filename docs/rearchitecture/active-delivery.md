# Active Manifold delivery

## Browser export delivery, 2 October 2026

The [running creator](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=ui-three-tone#plugin-export)
now exports its captured revision through a native build service and returns
CLAP/VST3 downloads for Linux, Windows and ARM Mac. Actual browser-button jobs,
source/value/hash checks, reload reconnection and downloaded Linux DAW recall
are in the [live evidence](https://wubulon.tailfac9f9.ts.net:4174/browser-export/2026-10-02/)
and [delivery record](browser-export-delivery.md). Later live edits leave an
in-flight snapshot unchanged. Production/public hosting and the remaining port
remain open.

Publishing scope refinement: [custom Three.js code and web-to-native export](web-plugin-export.md).
First deliver the editable Three.js instrument in DSP live scripting, then prove
that same custom view in independently identified native plug-ins. Native development exports now have a dedicated [delivery record](native-export-delivery.md)
and [download/review page](https://wubulon.tailfac9f9.ts.net:4174/native-export/2026-10-02/). Linux and ARM Mac CLAP/VST3 passed actual host editing, automation and recall;
Windows/Proton passed with WebView2 and its own bundled loader; all six format/platform
combinations now have usable development builds and actual host evidence.
Production publishing remains open.

First browser slice delivered: [authored Three.js instrument](three-view-delivery.md),
with a live view editor, shared scene/retained/egui controls, saved source, an
independent importing consumer and real browser interaction/audio evidence.
There are now 33 library programs and 36 displayed sketches; this adds a custom
presentation example, not another completed legacy project or native export.

Latest editor increment: [semantic hover, completion and source color pickers](editor-code-insight.md).

Latest UI increment: [editable styling and UI examples](ui-authoring-examples.md),
with two complete sounding sketches in retained JS and native/Wasm egui.

Latest readability delivery: [explicit authoring across current examples](creative-examples-delivery.md).
All 33 displayed sketches have named imports and comments showing the optional
namespace import; the public root supplies the advertised sketch APIs. All 277
parameters have names over existing numerical contracts. All 30 library programs
were played and live-edited in BB, alongside native source/recall checks. A real
CodeMirror/retained edit and actual Wasm egui view are recorded. The scoped
[storage cleanup](project-storage.md) recovered 9.33 GiB of disposable output.

## Current sequencing: primitives visible in DspLiveScripting first

Lucas explicitly changed the delivery order on 1 October 2026: transcribe the DSP primitives and reusable modules into the live scripting creator first, so their source, graph, controls and sound can be inspected and changed. Then assemble the individual projects and instruments from those public modules. This supersedes older next-product instructions below.

Each transcription is a vertical slice: authored source, live retained and egui controls, prepared Rust audio, save/reopen, public import and native package, plus actual interactive/audio evidence. A catalog entry or backend fixture alone does not close a row. Preserve the full 28-project/19-rack-module scope, arbitrary I/O, Main single graph ownership, agent authoring, native/DAW delivery and performance comparisons. See [primitive transcription ledger](primitive-transcription.md).

Delivered 2 October: **30 inspectable live programs covering 30 of the 43 current
public graph kinds**, actual BB browser/audio review for all 29, native egui FX
review/video, independent importing and the exact Linux native library archive.
The [transcription ledger](primitive-transcription.md) records evidence, explicit
coverage, all remaining legacy bindings and the next FX/resource/module work.
This is the current increment; the older product progress below remains history.

Networking increment: [usable web/native service delivery](network-services-delivery.md)
adds real TCP/UDP/OSC control, OSCQuery tree/value streaming and actual Link
peer tempo/play-state. It includes editable source, retained/egui, saved settings,
independent importing and recordings. Full DAW/quantized clock and broader legacy
service gates remain open. Lucas requested JS example readability discussion next.

Readability increment: [the first cleaned module](creative-authoring-delivery.md)
delivers actual imports, named parameter references and shared control declarations
in Networking and Link, with real retained/Wasm egui/native source and audio review.
The tutorial, broader proposed property interfaces and richer editor assistance
remain open; parameter names are extended by the latest delivery linked above.
The full port scope and primitive-first sequencing continue.

Goal accepted by Lucas on 1 October 2026: [delivery goal](proposed-delivery-goal.md).
Sequence: [vertical product slices](vertical-delivery-plan.md).

Initial service audit, 2 October (superseded by the increment above): **Ableton Link and OSC/OSCQuery are not yet implemented
in v2**. Existing DAW tempo/meter capture support and HTTP agent control do not
close these gates. Legacy API references and external-peer/controller acceptance
are recorded in the [host-service transcription ledger](primitive-transcription.md#host-services-ableton-link-and-oscoscquery-remain-open), alongside transport,
loop and live endpoint delivery.

Lucas also added **basic TCP/UDP networking** on 2 October: small public host
bindings plus an editable creator example where actual external peers control
and receive accepted values from the sounding graph. Browser bridging, lifecycle
and concrete evidence remain open in the [networking row](primitive-transcription.md#basic-networking-added-scope).

## Active slice: V01 Filter in DspLiveScripting

Deliver the real Filter with live retained/egui kit controls, script editing,
graph inspection, human/agent edits, independent importing, browser/native hosting
and recall. This slice is **open**. Existing backend/SDK proofs are supporting
material. The [live Filter increment](filter-live-delivery.md) now includes browser
retained/egui presentation, native egui/audio, real agent edits, an independent
package consumer and browser/native raw creator save interoperability. Full creator
lifecycle and the V01 fidelity/performance gates remain open.

Actual CLAP and VST3 creator editing, incoming host automation, outgoing atomic
parameter batches, editor close/reopen and DAW source/UI/cutoff recall now passed
in REAPER (`clap-creator-v9`, `vst3-creator-v3`). All four live recordings in each
review were non-silent. This does not prove glitch-free audio continuity. Retained
keyboard events exercised the actual component handler; physical pointer dragging
and interactive egui in the DAW editor remain unverified. Review update 2 packages
those exact tested plug-in bundles, alongside the updated native standalone.

Lucas reviewed the browser and reported old targets pulling the retained control
back during a drag. The retained/egui frontends now share a latest-target gesture
bridge with one atomic parameter batch in flight; intermediate targets coalesce,
and pending pointer intent is separate from accepted graph state. A live sweep
with 70 ms delayed acknowledgements measured 107 samples and zero backward steps.
The egui Filter now uses the same response-left/controls-right layout.
See `retained-gesture.json`, `aligned-egui.png` and `aligned-retained.png`.
The independent importing example uses the same public gesture binding; its
actual keyboard cutoff change and running Rust callback counters are recorded in
`consumer-gesture.json`. Native review update 2 is live at
`filter-delivery/2026-10-01/Manifold-review-linux-x86_64-r2.tgz`; adjacent JSON
records archive SHA256 `6a46f2ce9e08272e2ea7e46e5e49ef63f5fc4b34374f549c1ad85771947880b8`.

Native standalone gestures and packaged-controller delivery now passed in the
actual application (`native-creator-v5`): pointer dragging and final release
position, Open/Save buttons, packaged-controller retention, startup recall,
corrupt-package rejection and rejection of a prior project's stale request.
Five actual live recordings were non-silent. `live-native.mp4` is a real X11
screen plus private-sink audio capture. Update 3 packages the exact reviewed
standalone binary with the previously reviewed CLAP/VST3 bundles. Native file/device
input, broader device formats, DAW pointer/egui interaction and the V01
fidelity/performance gates remain open.

Next instrument: V02 **StandaloneOsc / reusable Rack oscillator and Main Wave
voice**, as specified in the vertical plan. The legacy standalone wraps
RackModuleHost's `rack_oscillator`. Recover its actual eight voices plus manual
voice, oscillator face, global and voice controls; integrate the Main Wave/ADSR
and keyboard/MIDI workflow in the same slice. Use the existing public authored
graphs as starting points. Deliver source, controls, sound, agent edits and recall
together in retained and egui, then native/DAW hosts. Filter remains open until
its remaining gates have evidence.

V02 now has an actual [live oscillator creator increment](oscillator-live-delivery.md),
using the original 47-control/nine-oscillator factory and mapping in retained,
egui and native QuickJS. Human/agent control edits, source edits and recall share
the existing prepared host. Keyboard/MIDI/ADSR, full original face fidelity, DAW
oscillator review and performance comparisons remain open.

Current implementation: `LiveProjectRuntime` supplies the accepted source, graph,
retained view and immediate `presentation()` model. `@manifold/ui-web/project-view`
and `manifold-ui::ProjectView` project that model and emit shared commands. Browser
GraphHost prepares the Rust SVF off callback; native ScriptControl does the same
for CPAL. The source editor is CodeMirror in the browser and highlighted egui text
in native. Compatible source edits preserve unchanged live targets; native/browser
raw saves retain authored source/view. Preserve the current Filter/importer links.

Recorded interaction and source: `web/public/filter-delivery/2026-10-01`,
`examples/filter-consumer`, `crates/manifold-app`, and the public packages. Native
review used an isolated Weston compositor and verified private Pulse sink. Do not
count successful builds as actual DAW creator/editor acceptance.

## Required evidence before V01 closes

- Actual working Tailscale product, independent importer and authored source.
- Live retained and egui controls, representative JS immediate binding, proper
  code editor, graph/source/parameter agreement, rejection and undo.
- Real agent edits and human interaction against the same sounding runtime.
- Actual native standalone and CLAP/VST3 editor/automation/save/reopen behavior.
- Portable edited state and source/UI recall; bounded legacy/timing comparison.

## Runtime goal control

The provider goal tool still reports the older objective as paused. The supported
BB clear-goal command reports HTTP 409 "No active Goal to clear". User approval
authorizes resumed implementation; do not divert product work into BB recovery
or falsely claim the durable provider status has changed.

## Latest V02 delivery: playable authored oscillator

The [keyboard increment](oscillator-live-delivery.md#playable-keyboard-increment-020)
now delivers eight authored voices with reusable core ADSRs, pointer/computer
keyboard playing, velocity/sustain event mapping and live shared envelope controls
in retained JS, browser egui and native egui. The original nine-oscillator factory
and Main allocation helper remain public source. Event state, graph targets, source
and both views share the same acknowledged runtime and portable controller.

Review `/instrument.html` and the separate `/examples/instrument-import/` package
consumer on the existing Tailscale server. Native update 2 includes the exact
reviewed development executable, real 20-second native UI/audio recording,
original/edited packages and Save/Open/startup recall proof. Browser evidence uses
the actual BB in-app browser; the separate consumer evidence uses isolated headless
Chromium. Hardware MIDI is not proven. No full V02 or full-port completion claim.

Optimized native update 3 passed the actual UI/audio review and is live; source
preparation measured 90.8 ms and GUI preparation plus publication 210.9 ms. See
the oscillator delivery record for the exact archive and evidence. Matched
C++/Rust/Wasm comparison and native authoring latency remain open.

Next: MIDI through the authored event contract, scoped device/channel
release, original preview and Main Wave voice composition with real UI/audio review.
Do not substitute a fixed synth kernel for user-authored oscillator/envelope graphs.

## Latest V02 delivery: MIDI through the authored controller

Native update 5 is live with the actual egui MIDI selector, notes/pedal, scoped
channel/device release, held notes through source edits and global Release all
notes. `midi-v1/native-r5/live-native-midi.mp4` is the real screen/audio recording;
the exact build, report and portable package are linked in the oscillator record.
Owned virtual ALSA input passed; physical keyboard/DAW and sample timestamp
scheduling remain open. The browser/importer use the public MIDI adapter, with
actual BB UI/command evidence and visible browser permission failures recorded.
Actual independent browser Web MIDI selection, two-channel notes, pedal, live
edit and disconnect now passed in isolated headless Chromium with captured output.
Earlier test permission/ALSA initialization failures remain recorded. Next visible UI interaction is the original oscillator preview/face in
retained and egui, followed by authored Main Wave composition.

## Current increment: original static oscillator preview

Public curve binding and legacy static waveform/additive/drive math are now
connected in retained and egui, with actual BB screenshots and a computer-keyboard
note surviving the preview control edit. Native egui and independent importing consumer both passed actual MIDI/audio/UI
review, including held source edits and release to recorded silence. Native update
7 packages that exact reviewed optimized executable and controller. The old Lua helper agrees in all 9,472 segments across 64 cases;
this does not establish animated voice overlays, full face or audio parity.
After native/importer evidence, continue the original face interactions and
Main Wave authored voice composition through the same public contracts.

Latest review links: `/instrument.html`, `/examples/instrument-import/`, and
`oscillator-delivery/2026-10-01/Manifold-oscillator-linux-x86_64-r7.tgz`.
Actual native recording: `preview-v1/native-r7/live-native-midi.mp4`.
Next product work: original face tabs/conditional controls and animated voice
preview, then Main Wave authored composition; full V02/Filter/inventory gates
remain open.

## Main Wave product integration

The [Main Wave live delivery](main-wave-live-delivery.md) now connects the public
eight-voice Main graph and dry/monitor/master branches to the shared creator,
retained and egui, public importing consumer, and native egui/audio. Keyboard,
MIDI, live controls, held source edits, agent work and recall have actual evidence.
Native update 1 includes its exact reviewed executable and real screen/audio video.
The first native review found the app's default Saw feeding Main's dry input;
instruments now default to No input. New envelopes run in the graph rather than
the legacy control clock; broader envelope trace comparison remains open.

Lucas reaffirmed the complete port scope: all remaining instruments/effects,
larger instruments, looper, MidiSynth, rack data/mutation and graph connections.
Keep the 28-project/19-module mapping in the vertical plan as the work queue.
Do not keep selecting tiny oscillator refinements while these product slices
remain undelivered. Continue shared Main processing and V03 actual effect slots,
then the ordered rack, Sample, modulation/MIDI and quantized Main slices.

The current Main Wave package also includes the original shared synth Filter,
with actual retained drag and egui click changing a held note's recorded output.
Native update 2 carries that exact reviewed controller; update 1 remains immutable.
Main's saved voice gates now follow release while the core ADSR continues its tail.
Current deliverables and remaining scope are in `main-wave-live-delivery.md`.

Next substantive product slice: V03 Standalone FX/Main effect slots, recovering
the original 21 factories and lazy graph/gate composition, normalized mappings,
per-effect memory, dry/wet gains, tails/reset rules and original XY/parameter face.
Existing individual effect kernels and legacy slot studies are starting points.
The prepared host currently excludes most effect kinds and lacks their complete
history transfer; deliver those capabilities with the sounding effect UI. Preserve
the same public creator, native/imported packages, source editing and agent API.

## 2 October: authored instrument face and studio placement

[Orbit delivery](authored-plugin-face.md) now separates the automatically ordered
live inspector from an authored plugin face, keeps retained/egui inspector and
CodeMirror source available, and saves dragged control positions in source.
The website-created Linux CLAP/VST3 archive was opened in actual REAPER with
real face pointer edits, optional panel clicks, audio and DAW state recall.
General composition/style editing and an egui studio shell remain open; this
checkpoint does not complete the legacy port or the full delivery goal.

## 3 October: connected egui creator and export

[Orbit Studio](sentinel-studio-delivery.md) delivers the first browser egui creator
workspace after reviewing the restored Sentinel. Source, sounding Three.js face,
connected graph, inspector and activity are visible together. Human and agent
commands expose named primitive parameters and insert/style bound face controls.
The website exports the authored instrument, with actual Linux REAPER CLAP/VST3
and DAW recall evidence. This is one complete creator example; it does not close
the legacy instrument/effect inventory or the remaining general editor scope.
