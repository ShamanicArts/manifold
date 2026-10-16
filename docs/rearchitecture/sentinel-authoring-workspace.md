# Sentinel-informed Manifold creator workspace

3 October 2026. Lucas's direction: learn from the actual restored Sentinel
interface. Manifold's egui workspace must let humans and connected agents author
parameters and compose them into a finished plugin view, while the runtime stays
live. This refines the [accepted delivery goal](proposed-delivery-goal.md).
This document specifies the full workspace direction. The first browser example
is now delivered: [Orbit Studio and website export](sentinel-studio-delivery.md).
Its delivery record distinguishes implemented interactions from remaining scope.

## Reference actually reviewed

Sentinel 0.5.66 is restored and running with Lucas's recovered Depth, Camera Flow,
Flower Beard and Room Stage projects. Actual desktop captures, project loading,
live feeds and the structured agent connection were reviewed. Private provenance
and captures live under `/home/shamanic/Applications/Sentinel-Recovery/recovery`;
`sentinel-running-now.png` and `restored-room_stage.png` show the real application.
Some saved metadata was reconstructed; recovery is not byte-for-byte complete.

The observed arrangement keeps the live result, connected graph and property
controls in the same workspace, with terminal/log facilities alongside them.
The useful lesson is how those surfaces relate to one another. Sentinel's bundled
`knowledge/ui-authoring.md` also specifies stable bindings, host selection,
pointer capture, persistence and begin/preview/commit/cancel gestures. Its actual
MCP bridge exposes structured graph, module, state, UI and viewport tools.

For Manifold, apply that relationship to sound, graph, source and plugin
presentation. Source visibility and linked selection across all four are our
requirements; they are not claims that Sentinel already displays this exact
Manifold arrangement. Do not copy its shader implementation or instrument skin.

## Workspace and ownership

- **Live plugin preview:** the authored instrument, playable throughout edits.
- **Graph:** named primitives, ports, connections and exposed parameter bindings.
- **Inspector:** usable controls appear automatically when parameters are
  declared; selection reveals the relevant node or presentation component.
- **Source:** readable imports, interfaces, composition and presentation remain
  available beside their consequences, with navigation to the selected object.
- **Agent/activity:** connection, discoverable capabilities, requested changes,
  accepted revisions, errors and undo history. Accepted changes appear in the
  same graph, source, inspector and preview the human is using.

egui supplies the creator shell and shared immediate controls. Retained JS/TS
controls and custom web views, including Three.js, remain supported presentation
choices. Custom Rust egui views use the same project bindings. Embedded surfaces
need explicit bounds, focus, keyboard routing and pointer capture.

Pane resizing and independent scrolling respect the available screen. The
default arrangement keeps an edit and its live consequence visible together;
narrow layouts preserve that relationship with an intentional reduced layout.

Keep the following data distinct:

| Data | Owner and purpose |
| --- | --- |
| DSP graph and parameters | Canonical project contract; Rust compiles and processes it. |
| Plugin components, bindings, layout and style | Authored project content; saved and exported with the instrument. |
| Graph node screen positions | Editor presentation metadata; moving a node does not change its signal connections. |
| Creator pane arrangement | User workspace preferences; resizing the editor does not resize the exported instrument. |

The automatic inspector and authored face share stable parameter identities.
Authors decide which controls to place in their face and how to arrange them.
The studio exports that instrument and its required code/assets/dependencies.

## Shared default editor and node library (10 October 2026)

The creator workspace is Manifold's default editor in the website, standalone
application and native plug-in host. These hosts render the same graph, inspector,
source, live result and agent activity model and offer the same authoring operations.
The enclosing host may show or hide file navigation, device routing and host-specific
controls, but must not silently substitute a reduced graph editor. Expose host
capabilities and unsupported operations explicitly. The exported instrument face
remains a separately authored performance view that the creator can inspect and edit.

The graph must become an editing surface, not only a diagram of accepted source:

- Discover built-in node types and saved user modules in one searchable palette,
  including their named, typed ports, parameters, requirements and provenance.
- Add, duplicate, remove, select and move instances; connect and disconnect
  individual compatible ports; show incompatible connections and host bus limits
  before publication. Keep stable instance identity separate from node type and
  editor position. Save and reopen the arrangement without changing signal state.
- Keep source, graph, inspector and live face linked. A graph edit produces a
  readable accepted project revision; arbitrary source remains possible. Preserve
  dirty source drafts, comments and unrelated declarations when a visual edit is
  supported. Report an unsupported visual edit instead of creating a second graph
  truth or replacing the draft.
- Let a human or agent define a reusable composite node from authored graph
  primitives, with named typed inputs/outputs, exposed parameters, source, assets,
  version and stable library identity. Save it to a user library, discover it in
  the same palette, instantiate it repeatedly, and inspect or revise its source.
  Project packages record the exact module dependency and version needed to reopen
  or export it. A new Rust DSP kernel is a distinct cross-target build task, not a
  promise that JavaScript itself executes in the audio callback.
- Use the same revision-guarded semantic commands for human gestures and agent
  tools. Prepare structural changes off the audio callback, atomically publish
  accepted graphs, keep the previous sounding graph on rejection, and make each
  accepted edit undoable. Show the agent's proposed and accepted changes in place.

Sentinel supplies the reference for a navigable, typed graph with authored modules
and an inspector connected to the live result. Manifold's audio graph, readable
source and export contract remain Manifold-specific. A complete proof is a human
and an agent adding/removing a built-in node, authoring a composite module, saving
it to the user's library, loading a second instance, wiring both by typed ports,
hearing live edits, reopening the project, and opening the same creator workflow
in browser, standalone and a real DAW plug-in host.

## Existing foundation and missing delivery

Existing code already provides public JS/TS graph authoring, live source commands,
revision checks, native agent access, shared retained/egui control bindings and
project save/restore. Orbit provides an authored Three.js face, source-backed
placement of existing controls and website-to-Linux-CLAP/VST3 evidence.

The native egui app currently has two columns, a textual running-graph list,
controls and source. It lacks the connected spatial graph/workspace described
above. The browser presentation studio moves existing controls; it does not yet
provide general component insertion, binding, sizing, hierarchy or style editing.
These are product gaps, not completed features implied by the existing APIs.

Reuse `manifold-app`, `manifold-ui`, the public authoring contract and the existing
editor command path. Extend those through a usable product interaction. DSP and
audio publication stay with their current owners; UI and agents do not acquire
another graph engine or compile in the audio callback.

## Human and agent authoring contract

Both clients must be able to discover named nodes, ports, parameters and
components; define/expose parameters; insert and bind controls; edit placement
and style; inspect the accepted result; undo; and save/export. Agent operations
use stable identities and guarded project revisions, with useful readback.
Exact new operation spellings require implementation against the public API;
this document does not invent already-supported commands.

Source edits and visual/agent edits must describe the same authored project.
Presentation data lives in the project definition. Editing a supported declaration
updates source visibly; arbitrary custom code remains supported with clearly
stated limits on visual editing. Preserve unapplied source drafts and report
conflicts rather than silently overwriting them.

Continuous parameter gestures update the sounding runtime continuously. Structural
edits prepare and publish through live graph compilation. Invalid edits preserve
the last accepted sounding project. A drag has preview, commit and cancel
semantics and creates one undoable edit.

## Next complete vertical slice

Use the existing Orbit instrument as the integration vehicle. Deliver this whole
interaction before broadening the editor into general infrastructure:

1. Open it in an egui creator workspace with a real connected graph, live face,
   inspector and source. Selecting a graph node or face component reveals its
   relevant binding and definition.
2. A human creates a named **Brightness** control mapped to the existing filter
   cutoff, with explicit units/range. It immediately appears in the inspector.
3. Place that control into the authored face, change its size/position/style and
   hear its continuous edits. Source reflects the accepted presentation change.
4. A connected agent performs the same parameter/control/layout operations,
   using public structured access. The human sees each accepted result in place.
5. Show shared targets through egui and JS/TS controls, cancel/undo an edit,
   reject an invalid source edit and a stale mutation without losing sound or a
   draft, then save/reopen the project.
6. Export the authored instrument from the website and open the actual CLAP/VST3
   in a native host with the created control, appearance and saved state intact.

Delivery evidence: a usable live Tailscale build; actual browser/native egui
captures or video of these interactions; accepted agent command/readback records;
the exact exported package and native-host review. Screenshots of a mockup,
backend tests alone, or another control lab do not satisfy this slice.

Orbit remains a current integration example, not historical instrument parity.
Continue the primitive/project port ledger through the same vertical delivery
method after this workspace interaction is usable.
