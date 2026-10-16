# Reusable presentation graphs and instance navigation

11 October 2026. Extends [fields and downstream rules](studio-field-rules.md).
This is implemented presentation composition inside an audio plug-in project.
[Audio/DSP selection wrapping](studio-audio-graphs.md) is now implemented through
the existing audio graph contract; this presentation executor does not own audio.

## Workflow

Open **Project → Open example → Reusable fields · graphs inside nodes**.
The two Reactive field instances share a definition, with different local mode
and fold values. Both read the normal audio Output's analysis. Their field and
relief results feed separate comparisons.

- Shift-click presentation nodes and choose **Wrap as reusable node** in the
  Inspector. Boundary wires become named ports and child controls become exposed
  parameters. The existing scripts travel with the definition.
- Select the new node and choose **Enter graph** in the graph toolbar, or
  double-click it. The toolbar offers **Up one level** inside a graph, and
  breadcrumbs return directly to containing graphs. The Inspector and Explorer
  retain their **Enter graph** controls. The Explorer exposes the same nested objects,
  definitions, imported helpers and instance settings, and reveals the selected
  branch. It is possible to wrap inside a wrapped graph.
- Graph input/output boundary nodes show the actual interface wiring. Their
  connections can be changed using the same cables and public graph operations.
- Exposed controls affect the selected outer instance. An inner wire, structure
  or default edit affects the shared definition; the Inspector says so. A bound
  child control displays its effective value and the parent control driving it.
  Edit that control on the parent. There are no hidden per-instance graph copies.
- Source selection follows the previously accepted pattern: an inner script node
  opens its implementation, and audio declarations still link to their source.
  A composition node links to `/composition.json` and its navigable inner graph.

Nodes are an optional authored interface and a way to understand composition.
Arbitrary algorithms may stay in source; Studio does not reconstruct imperative
code into an automatically editable graph.

## Saved contract and execution

Composition version **3** adds a definition implementation:

```js
implementation: {
  kind: 'composition',
  graph: {
    nodes: [/* instances of project definitions, including compositions */],
    connections: [
      { from: 0, output: 'field', to: 7, input: 'field' },
      { from: 7, output: 'relief', to: 0, input: 'relief' },
    ],
    bindings: [{ name: 'folds', to: 7, parameter: 'folds' }],
  },
}
```

The containing definition declares its inputs, outputs and parameters using the
existing interface format. Within its graph, source **0** means the named input
interface and destination **0** means the named output interface. IDs on actual
children are local to the definition. Parameter ranges must fit their targets.
Input fan-out and shared outputs are allowed; every input accepts one source.
Analysis may pass through a composition, but scripts still cannot manufacture
audio analysis outputs. Disconnecting an outer input or an inner output binding
supplies null downstream, so authors can edit a graph incrementally.

`component.wrap` takes `ids`, optional `definitionId` and `label`, and optional
`scope` (the containing definition ID). Component add/update/connect/remove
operations also accept this scope. Root edits omit it. `component.define` and
file/JSON edits can author the same nested contract directly. Canvas paths resolve
through the same accepted model and revisions, with no independent edit store.

`expandComposition` derives qualified occurrence paths, typed leaf connections,
effective parameters, canvas boundary objects and live output aliases. It does
not evaluate scripts or own audio. Browser and standalone webview mount one
factory per leaf occurrence. Definition/source edits rebuild the affected
implementations; local parameter and wire edits retain compatible factory state.
Wrapping changes qualified occurrence identity, so transient child state may
restart. Audio DSP and audio IDs remain unchanged during presentation wrapping.

Saved identity is the root instance plus definition-local child path. Derived
32-bit canvas handles are deterministic hashes of qualified paths, with collisions
rejected rather than conflating instances. They are not persisted in the graph.
There is no authored count, document-size or nesting-depth quota. Recursive
definitions and connection cycles are rejected atomically; valid finite graphs
may nest and reuse definitions without an imposed project-size limit. Validation
memoizes visited definitions.

Graph viewing is workspace state. Opening a new document resets the current
graph path while preserving the docking layout and mounted Studio shell.

## Acceptance and remaining scope

- Model tests compare the actual field, relief and energy values before wrapping,
  after two nesting levels and after recall. They cover independent controls and
  follower state, inner rewiring, scope resolution, undo and atomic rejection.
- Native QuickJS tests edit/recall the same document. Acknowledgement and later
  audio blocks match an untouched reference sample-for-sample.
- Browser GUI review performs the actual selection/wrap/enter workflow, navigates
  two levels, follows the inner script and edits it live. Both renderers update
  while their DOM identities and page remain unchanged, then save/reopen succeeds.
- Standalone GUI review opens the browser save, enters the same hierarchy, then
  an official SDK MCP client changes the inner script. Both native observations
  and captured Presenter pixels change in the same process, while audio blocks
  continue. Native audio is routed to the verified private null sink.

Reviews: `web/review-nested-fields.mjs`, `web/review-nested-fields-native.py` and
`web/review-native-mcp.mjs`. Compact receipts and actual screenshots are under
`web/public/studio/2026-10-11-nested-fields/`. These are browser/Linux standalone
checks, not a new CLAP/VST3/DAW acceptance claim.

The graph-toolbar follow-up adds contextual **Enter graph** and **Up one level**
actions to the shared Studio graph panel. Actual browser and standalone clicks
enter and leave both nesting levels; ordinary nodes have no entry action and
the project root has no up action. Browser navigation also passes with the graph
maximized and the Inspector hidden. Inspector entry and breadcrumbs still work.
UI Wasm, production web and release standalone builds pass. Screenshots and
interaction receipts: `web/public/studio/2026-10-11-graph-navigation/`.

Affected JavaScript tests pass 15/15, native QuickJS component tests 3/3 and shared
UI/app tests 6/6. TypeScript, generated packages/examples, release standalone,
audio/UI Wasm and production web builds pass. The broad suites retain the same
three earlier Gain-range failures: JavaScript 148/149, and native Rust 134/136
before the workspace run stops. Detailed receipts are in `checks.json`.

The browser review also exposed an existing generation race: truncating and
rewriting an unchanged generated module could leave Vite caching an empty module.
The source generators now skip unchanged text and atomically rename completed
files. The observed bad module cache was invalidated and the final GUI run passed.

Audio wrap/expose/navigation is delivered in [reusable audio graphs](studio-audio-graphs.md).
Remaining: a friendlier interface/binding editor; per-instance inner overrides or
explicit definition forks; unwrapping; richer objects and attached behaviours;
Nacre coverage and the intended dimensional plug-in. Interfaces can already be
authored through JSON and public commands. The [native MCP adapter](studio-native-mcp.md)
is a development integration, with packaged installation, configured agent-client
acceptance and filesystem-linked reload still to finish.
