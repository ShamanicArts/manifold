# Reusable audio graphs in Studio

11 October 2026. Audio graphs now support the same wrap/enter/reuse workflow as
[presentation compositions](studio-nested-compositions.md), using the existing
audio graph compiler and prepared publication path. Containers are authoring
objects; they do not introduce another DSP kernel or audio execution model.

## Using it

Open **Project → Open example → Reusable audio graphs** (`?program=nested-audio`).
Low-pass stage and High-pass stage are two instances of one Color stage
definition, connected in series. Each contains a nested Filter stage and Gain.
Their filter settings and levels are independent. This example demonstrates
audio composition and deliberately has no authored Presenter.

- Select audio processing nodes (Shift-click for several), then **Wrap as node**
  in the graph toolbar. Existing external cables become named boundary ports;
  exposed controls remain available on the outer node.
- Select the container and choose **Enter graph**, or double-click it. **Up one
  level**, breadcrumbs and the Explorer navigate the same hierarchy. Wrapping
  inside a graph creates another reusable definition.
- **Add another instance** in the Inspector, or insert the definition from
  **My library**, then connect its inputs and outputs. Each occurrence has its
  own DSP nodes, state and parameter targets.
- Edit a cable or add/remove a child inside a definition to change every
  occurrence of that definition. The Inspector distinguishes shared structure
  from independent instance controls. Child knobs edit that occurrence's values.
- Select an original primitive to follow its declaration in `/project.mjs`.
  Select a container or boundary to inspect `/audio-graphs.json`. Cloned
  primitives are created from the reusable definition, rather than duplicated
  imperative source text.

## One source and one audio contract

`studioGraph.audioGraphs` is versioned authoring data in the existing literal
`studioGraph` declaration. `/audio-graphs.json` is a virtual view of that literal:
editing either updates the same source, revision, undo history and saved project.
There is no second saved graph authority. `applyStudioGraph` expands definitions
into ordinary `GraphWorkspace` primitives and connections. Rust/native and
browser/Wasm consume the same resulting language-neutral DSP contract.

Definitions contain keyed primitive or nested-definition children, typed named
inputs/outputs, connections and parameter bindings. Root instances reference a
definition and have stable paths. The saved `nodes` mapping preserves original
primitive IDs and paths when wrapping existing authored nodes; these nodes are
explicitly marked `adopt`. New occurrences receive distinct deterministic DSP
IDs and parameter paths. Identity collisions reject the candidate transaction.

Wrapping preserves existing parameter/host bindings, constructor settings and
accepted values. When the evaluated DSP project is unchanged and `studioGraph`
has no other behavioural readers, wrapping publishes metadata while retaining
the current DSP and script controller. Structural changes use the existing
prepared replacement path. This does not claim uninterrupted state transfer for
every possible DSP resource or kernel across arbitrary structural edits.

`graph.wrap` accepts `ids`, optional `definitionId` and `label`.
`graph.addInstance` accepts `definitionId`, optional root `path` and `label`, or
`scope` to insert inside another definition. Scoped `graph.add` adds a primitive.
Existing connect/disconnect/remove commands resolve occurrence paths to the
shared definition; callers must route across a container through its named
interface. File edits use normal revision/content checks. These operations are
also available through the shared agent tool schemas and native MCP adapter.

Definitions, instances, children, cables, interfaces and nesting have no
arbitrary authoring quota. Validation rejects recursive definitions and invalid
connections; preparation sizes runtime storage from the authored graph.

## Evidence and remaining work

- Seven JavaScript integration tests cover nesting, identity/host binding
  preservation, independent controls, shared structure and wiring, undo/recall,
  atomic rejection, constructor settings, configured mixer boundaries and
  script-local controller state.
- Two native QuickJS/audio tests compare sounding output sample-for-sample during
  wrapping, nesting and adding a disconnected instance, then verify that a
  connected second instance independently controls the output.
- Actual browser and standalone GUI reviews select nodes, wrap from the graph
  toolbar, enter two levels and return. Both connect a second occurrence and
  save/reopen. Browser capture verifies audible signal at the private analyser,
  silence from the second instance's zero gain, and unchanged audio host/page.
  Standalone opens the graph definition file and uses an actual SDK MCP client
  to create the second instance and reject a stale wrapping command. It runs in
  Xvfb on a verified private null sink. These are browser and
  Linux standalone proofs, not new CLAP/VST3/DAW acceptance claims.

Tests: `web/tests/studio-audio-graphs.test.js` and
`crates/manifold-project-js/tests/studio_audio_graphs.rs`. Reproduction scripts:
`web/review-audio-graphs.mjs`, `web/review-audio-graphs-native.py`,
`web/review-audio-graphs-mcp.mjs` and
`scripts/generate-studio-audio-graphs.mjs`. Compact screenshots, results and check
receipts: `web/public/studio/2026-10-11-audio-graphs/`.

Final targeted tests, TypeScript, generated-package checks, audio/UI Wasm,
production web and release standalone builds pass. The native save also reopens
in the browser with matching DSP nodes, wires and parameter paths. Full
JavaScript is 155/156, retaining the earlier Gain-range assertion. The full Rust
workspace stops at the two previously recorded native Gain-range assertions.
Continuing beyond those also exposes Main Wave startup and oscillator held-note
save timeouts; both reproduce with the previous checkpoint's bundles/packages
(`497c70f6`). The comparison logs and exact check scope are retained with the
receipts. This change does not increase native execution deadlines.

This slice does not clone arbitrary controller callbacks, sample/PCM bindings,
capture sources or host channel bindings. Wrapping nodes with those resource
bindings is rejected explicitly. Arbitrary behaviours remain authored source.
Removing source-owned nodes may require editing source references before the
candidate can validate. Named interfaces can be edited in JSON; a friendly
interface editor, input fan-out, direct input-to-output passthrough, unwrapping,
definition forks and cross-project library packaging remain future work.
Per-instance controls are supported; per-instance structural overrides are not.

The next separate native milestone remains packaged/discoverable MCP, real
agent-client lifecycle acceptance and filesystem-linked reload. Rich objects,
behaviour bindings, Nacre coverage and the intended plug-in remain on the wider
Studio roadmap.
