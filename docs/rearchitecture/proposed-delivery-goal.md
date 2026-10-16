# Proposed Manifold delivery goal

## Current sequencing: primitives visible in DspLiveScripting first

Lucas explicitly changed the delivery order on 1 October 2026: transcribe the DSP primitives and reusable modules into the live scripting creator first, so their source, graph, controls and sound can be inspected and changed. Then assemble the individual projects and instruments from those public modules. This supersedes older next-product instructions below.

Each transcription is a vertical slice: authored source, live retained and egui controls, prepared Rust audio, save/reopen, public import and native package, plus actual interactive/audio evidence. A catalog entry or backend fixture alone does not close a row. Preserve the full 28-project/19-rack-module scope, arbitrary I/O, Main single graph ownership, agent authoring, native/DAW delivery and performance comparisons. See [primitive transcription ledger](primitive-transcription.md).

1 October 2026. **Accepted by Lucas, including the live human/agent refinement.**
Implementation work has resumed under this objective and these execution rules.
The [active delivery record](active-delivery.md) tracks the working product,
remaining acceptance and next visible interaction.

## Goal text

Deliver Manifold v2 as a usable, continuously running, human- and agent-authorable
audio and media creation environment and importable library, porting the actual
legacy projects and their interaction behavior through one public graph/project
contract. Use Sentinel as the reference for AI-native application integration.
Humans and agents are first-class clients of the same live runtime: both must be
able to discover, compose and inspect primitives, script and change the running
graph, author its UI using Manifold's immediate egui and retained JS/TS component
kit or custom views, perform with it, and package/save/reopen the same project in
browser/Wasm, native standalone, VST3 and CLAP hosts. Shipped instruments must use
the same public authoring and presentation interfaces as external projects, with
Rust owning DSP and one canonical graph/state model. Deliver the port as successive
usable vertical slices of existing projects, starting with the real Filter in
DspLiveScripting. Keep each working delivery accessible and prove it with live
builds, recorded interaction and authored source; attach bounded legacy, host and
performance evidence to that delivery. Continue through the complete inventory
without substituting backend checkpoints or isolated demonstrations for products.
The integrated agent authoring workflow is a product requirement from the first
slice, extending with every migrated capability.

## Completion means these things are usable together

### Publishing refinement: custom code and Three.js, 2 October 2026

Lucas requires extra authored JS/TS and a Three.js interface to travel with the
instrument alongside Manifold controls. First prove an editable sounding example
in DSP live scripting, then export that project as independently identified VST3
and CLAP bundles and demonstrate native webview interaction, automation and DAW
save/reopen. Required dependencies/assets must be packaged. Acceptance and current
gaps are in [web-authored plug-in export](web-plugin-export.md); export remains open.

### Scope addition: basic networking, 2 October 2026

Lucas requested basic networking support, including TCP/UDP bindings or a demo
integrating those transports. Deliver a small public host networking service for
Rust and JS/TS authoring, backed by existing networking libraries, and an editable
live creator example using it. Include native TCP client/listener and UDP
send/receive, explicit browser capabilities and a bridge for native sockets,
connection lifecycle/status and external two-way interaction with a sounding
graph. Networking remains outside audio processing and uses the same accepted
project/control contract. The [networking delivery row](primitive-transcription.md#basic-networking-added-scope)
records concrete acceptance. This is additional scope, not a claim of delivered
socket bindings or network audio streaming.

1. **An independent application imports Manifold.** It builds an instrument or
   effect through documented public interfaces without editing Manifold internals,
   importing Main-specific implementation or loading our editor. Rust and JS/TS
   authoring share graph identities, port/parameter semantics and packaging rules.
   Types, catalog, discovery, examples and errors make that workflow practical
   for humans and agents. Ordinary JS/TS development/reload is available in the
   running product; compiled Rust authoring has an explicit build/load workflow.
2. **Graphs are authorable while the product runs.** Create/query/add/remove/rewire
   primitives and modules, change parameters and resources, and handle events.
   Compatible edits publish while processing. Invalid edits preserve the accepted
   project. Voices, FX tails, captures, loops and media follow demonstrated
   continuity policies. Structural compilation and resource preparation occur
   outside audio callbacks; request-to-publication latency is measured.
3. **The original UI kit is a delivered authoring tool.** Common controls and
   component/layout bindings work in immediate egui and retained JS/TS presentation,
   with shared control semantics, automation gestures, themes and stable IDs.
   JS/TS can author representative immediate egui UI. Rust custom egui and
   framework/HTML/Three.js views can use public project bindings. Products select
   or combine modes per interaction; renderer-specific features declare their
   capabilities. Native web views have a functioning webview host.
4. **The creator workflow is present in the actual products.** A proper script
   editor, graph inspection, palette/cables, live original controls and meaningful
   failure feedback work against the accepted sounding graph. Project execution
   continues when an editor closes; reopening shows accepted state. Rendering
   never owns audio scheduling or secretly reconstructs a second DSP graph.
5. **Hosting and arbitrary I/O work in actual use.** Audio bus/channel layouts,
   module port widths and MIDI/control/media ports are explicit and patchable.
   Browser, native devices, VST3 and CLAP operate applicable projects with actual
   editors, automation, MIDI, transport and recall. Dynamic host-layout changes
   follow real host negotiation; compatible graph edits and live parameters remain
   distinct. Unsupported capabilities and width limits are surfaced and remain
   tracked against the behavior they prevent.
6. **The legacy products and services are ported.** All 28 project manifests, all
   19 RackModuleHost module types and additional Main behavior are covered by the
   [vertical delivery plan](vertical-delivery-plan.md). Include their original
   musical, UI, capture, layout, state, endpoint, transport and media interactions.
   Main is composed from reusable primitives/modules through the public API with
   one audio truth. New discoveries extend the coverage record. Omitting a legacy
   behavior requires Lucas's explicit decision; an unavailable feature stays open.
7. **Projects really reopen and move between applicable hosts.** Graph/controller
   state, parameter identities, assets, presets and layout persist. Demonstrate
   cross-host packages, editor-close execution and actual DAW session reopen.
   Implement and document the legacy/v2 state import policy, including explicit
   errors for state that needs a converter or unavailable host capability.
8. **Fidelity and performance accompany working delivery.** Compare actual old
   and new interaction/audio/MIDI/state scenarios. Report matching C++ legacy,
   Rust native and Wasm workloads, callback/edit latency, resource use and captured
   discontinuities. Fix regressions through the affected product. Completion
   records the exercised hardware, hosts and workloads and explains deliberate
   behavior changes; narrow primitive or SDK results cannot establish project parity.
9. **Humans and agents author the same live runtime.** Application-native agent
   controls and an external structured tool adapter expose the public discovery,
   inspection, source/UI editing, parameter/event and graph transaction interfaces.
   A real agent performs meaningful edits while the human uses the instrument;
   both see accepted revisions, outcomes and failures. Session changes are
   attributable and undoable at the authored-project level, with documented DSP
   and resource continuity. Concurrent/stale edits are handled explicitly. Agent
   reasoning, tool preparation and UI lifetimes never determine audio timing.

## Live human and agent authoring acceptance

**Sentinel is the interaction reference.** Inspect its actual integrated agent
workflow and record the useful observed behaviors, then map them into Manifold's
public contract. Do not infer Sentinel internals from its executable or claim
unobserved feature parity. At this refinement, desktop launchers were found at
`/home/shamanic/.local/share/applications/sentinel-linux.desktop` and the Wine
Sentinel launcher, but their recorded workspace installation path no longer
exists. Live reference inspection remains open; drafting these requirements does
not depend on inventing its behavior.

The required Manifold workflow is:

- **Discover and understand:** catalog and examples, stable IDs, authored/expanded
  graph and source mapping, UI bindings, parameters, assets, capabilities, active
  revision and runtime health are available through structured public interfaces.
- **Act on the running instance:** a human or agent can edit source, compose or
  mutate the graph, author/rebind UI components, change resources and parameters,
  and schedule events through the same accepted project transaction/control model.
  An independent library consumer can expose this workflow in its own application.
- **Observe the result:** both clients receive accepted values/revisions,
  publication status, diagnostics and bounded meters/analysis. An agent can obtain
  a bounded audio/render capture for audition or analysis. The actual UI and sound
  demonstrate the accepted edit, with source and UI bindings kept consistent.
- **Collaborate:** edits carry a base revision and origin; stale writes report a
  conflict, and unrelated compatible changes can be reconciled explicitly.
  Visible change history and undo/revert cover authored source/graph/view edits;
  restoring an old graph does not silently rewind recordings or live performance
  state. A human can keep performing, take over an edited control and stop agent
  work without stopping the instrument.
- **Choose interaction policy:** the application exposes agent connection/task
  controls, current action/progress and edit outcomes within the product. The
  human can choose preview or live application of edits at session/task scope.
  Ordinary permitted live edits do not require a new approval dialog each time.
  The tool adapter supports external agents through the same contract, and keeps
  the core independent of a particular model/provider or chat frontend.
- **Measure live behavior:** audio callbacks remain bounded and continuous;
  parameters/events have explicit timing and smoothing; compatible structural
  edits prepare off callback and publish atomically. Record command receipt,
  acceptance/publication and first audible effect separately from agent reasoning
  time. Demonstrate failed edits preserving the last accepted instrument, human
  responsiveness during agent work and repeated edits while notes/audio continue.

For each new product capability, its structured agent operation and its visible
human operation are integrated into that slice. A tool schema alone does not
complete the agent workflow; a real agent's visible live use is required.

## First reviewable delivery

Deliver the existing **Standalone_Filter inside DspLiveScripting**, extending the
public library and existing DSP rather than creating another lab product:

- Real input/playback and original mode/cutoff/resonance controls, XY/response
  interaction and live host-automation feedback.
- A syntax-highlighted JS editor with completion, useful errors and Run/Stop/reload,
  connected to graph inspection and live parameter/compatible topology edits.
- Working egui and retained JS/TS versions of those controls bound to the same
  running project, plus a representative JS-authored immediate egui control.
- An independent importing application and readable graph/controller/view source.
- Integrated agent task/action controls and a structured tool connection. A real
  agent inspects the running Filter, inserts/bypasses a node and adds/rebinds a
  kit control while a human manipulates the same project. Show accepted changes,
  deliberate stale-edit conflict, failure recovery and authored-edit undo.
- Browser, standalone and applicable VST3/CLAP use with save/reopen and actual
  editor lifecycle. Deliver working browser increments while native integration
  proceeds; the complete slice remains open until its host requirements work.

The review interaction is: process audio, change cutoff from either view, edit
source to insert/bypass a node while sound continues, see graph and sound agree,
submit an invalid edit without losing the instrument, save/reopen and reproduce
the edited behavior. A native DAW interaction adds automation and editor-close
execution. The original Filter behavior is the comparison reference.
Record the agent's actual tool requests/results alongside the visible source,
graph, controls and audible change; replaying a canned transaction is supporting
evidence rather than completion of this agent acceptance.

## Execution rules that prevent the previous drift

1. **One active product slice.** Before work, state the actual user behavior being
   delivered, its benefit, its evidence and its completion conditions. Keep one
   clearly named next visible action. Requirements may span layers; task selection
   follows the selected product rather than the next tempting subsystem.
2. **Backend changes have an immediate product destination.** Each backend task
   must enable a named behavior in the active slice and be connected to its real
   UI/host before being reported as delivered. Preserve reusable boundaries while
   implementing the smallest sufficient contract for that behavior.
3. **UI and integration start with the slice.** Work across source, graph, DSP,
   controls and hosts together. Expose partial working interactions early through
   the product build, label remaining gaps and keep earlier deliveries usable.
   The next feature does not displace unfinished integration in the active slice.
4. **Validation is bounded by a concrete delivery risk.** Use meaningful checks
   for signal, live-edit, lifecycle and recall behavior. Once a risk is sufficiently
   answered, proceed to integration/delivery. Additional coverage, benchmark cases,
   framework generalization and documentation expansion need a demonstrated reason
   in the active product or a required acceptance gate.
5. **Evidence precedes completion claims.** A backend test, offline render, static
   graph import, SDK probe or isolated lab page remains supporting work. Product
   delivery requires the connected usable interaction and its artifacts below.
6. **Continue between slices after approval.** A normal completed-slice report
   does not end the overall goal or ask for permission to do already-authorized
   work. Continue with the next product slice until completion, an explicit pause,
   or a genuine blocker requiring user input.
7. **Maintain an honest durable handoff.** Record current slice, latest working
   links/build revision, observed behavior, remaining failures and next visible
   action in the delivery record. Read it after restart/compaction. A provisional
   backend checkpoint never changes a product row to complete. If progress stalls,
   report the actual blocked interaction and redirect work to resolving it.

## Evidence and reporting

For each usable increment, update the accessible product build and identify the
new interaction and remaining gaps. For each completed slice supply:

- A live Tailscale link and short steps to exercise the feature.
- Native standalone and applicable plug-in artifacts with actual-host results.
- Video with audio of source/UI interaction, live operation and recall; UI/media
  projects use the corresponding recording. Label captured-fixture/device runs.
- A real human/agent live collaboration recording and relevant structured tool
  trace for the new capability, including shared state and edit recovery.
- Readable public-API graph/controller/view source, independent consumer and
  reopenable portable package, linked to the exact source/build.
- A bounded legacy comparison and relevant timing/performance/failure evidence.

Report: **what became usable, where to use it, how to reproduce it, what is still
missing, and the next product interaction being integrated.** Routine commentary
continues during work; test counts and generated artifact volume are not progress
metrics. The progress record measures completed, usable behavior against inventory.

The final handoff includes the complete coverage record, working product links,
native artifacts, library/API/UI-kit documentation, independent examples,
compatibility decisions and matched performance results. Mark the goal complete
only when its product requirements are delivered, or its scope has been explicitly
changed by Lucas. Lucas approved this goal and the live human/agent refinement.
