# Field interaction, graph selection and references

13 October 2026. This extends [Nacre’s visual objects](studio-nacre-visual-objects.md).

## Working in the graph

- Choose **Box select**, then drag empty space around nodes. **Shift-drag** works
  while the normal pan tool is active and adds to the existing selection.
  Shift-click toggles individual nodes.
- Drag a selected node to move the selection, retaining the relative positions.
  Positions are saved on release. Each node position is currently a separate
  undo entry.
- Choose **Group…**, enter a name and press **Group selected nodes**. This draws
  a named box without changing any connections. Click its heading to select its
  members. **Frame selection** brings those nodes into view. The Inspector also
  offers grouping and ungrouping.
- **Wrap as node** is a different operation: it creates a reusable nested graph
  with a named interface. Groups inside the selected graph travel with it.
- Groups can contain audio nodes or visual nodes in the same graph. Mixed-domain
  groups are not currently supported. Nested visual groups belong to the shared
  graph definition, just like its nodes and connections.

The bundled Nacre example has saved audio/visual positions and a **Visuals** box.
Opening the example picks up these authored positions; saved user projects retain
what their author placed. Ordinary edits and parameter updates do not run a
layout algorithm. **Fit** and **Frame selection** are explicit viewport actions.

## References

Solid coloured wires carry values between ports. Dashed links show parameter
references, output-analysis dependencies and shared renderer resources. Selecting
an endpoint emphasises its connections. The **References** toggle controls the
visibility of dashed links.

This follows the useful distinction between processing wires and dependency
links described in TouchDesigner’s [Reference](https://docs.derivative.ca/Reference)
and [Link](https://docs.derivative.ca/Link) documentation.

Right-click an audio node and choose **Reference parameter**, then the parameter.
Studio creates a parameter-reference node with a `value` output. Connect that
output to a matching visual input. Select the reference and use the Inspector’s
**Referenced parameter** chooser to change its target. Existing wires keep their
identity when retargeting. A reference reads the existing parameter; it does not
create another parameter bank or change the audio path.

Agents use the same operation:

```javascript
await studio.request({
  operation: 'component.reference',
  path: '/nacre/focus',
  x: 0,
  y: 700,
  expectedRevision: project.revision,
});
```

`project.inspect` includes `componentGroups` and `componentReferences` in its
composition section. Focused node inspection includes its declared references.
These descriptions come from the shared authoring runtime and feed both native
and browser Studio. Internal audio endpoints inside a reusable node resolve to
that containing node when viewing the outer graph.

The analysis source is still the existing output-analysis tap; this work changes
its visual dependency representation, not the analysis contract. Arbitrary reads
hidden inside JavaScript are not inferred. Nacre’s remaining hand, eye, creature
and gesture logic still needs the declared-object extraction recorded in the
original migration note.

## Field regression

A field gesture publishes optimistic parameter values synchronously from the
scene update. Previously that publication reconfigured the presentation graph
mid-frame, clearing already-evaluated energy and mode outputs. The field then
read missing inputs and briefly rendered its default pattern. The canvas and
particles had not been recreated.

The executor now queues reconfiguration during a frame and accepts the newest
snapshot at the next frame boundary. The mounted view does the same for source
and instance lifecycle changes. A gesture cannot clear upstream outputs or
retire scene objects halfway through the frame. External source edits and
resource disconnections still take effect on the next frame.

A real browser pointer drag reproduced 40 fallback frames out of 42 held frames
before the fix. The acceptance run recorded **45 held frames, zero fallbacks,
zero particle restarts, continuous mode changes and the same canvas**. The test
also verifies that a queued disconnection takes effect on the following frame.

Graph edits now share immutable file content and history retains accepted file
tables. Moving/grouping nodes no longer deep-copies every embedded Nacre image.
Native keeps the existing memory and execution limits.

## Reproducible checks

- `web/review-nacre-interaction.mjs`: real field pointer gesture and per-frame
  mode continuity, without starting audio.
- `web/review-graph-selection.mjs`: actual group-heading selection, framing,
  marquee selection, moving two nodes together, toolbar grouping and undo.
- `web/review-nacre-visual-graph.mjs`: gesture plus live rule edit, scene
  continuity, resource disconnect/reconnect, private-sink audio and save/reopen.
- `web/review-nacre-visual-graph-native.py`: standalone pointer drag recorded on
  an owned Xvfb with a private audio server, live rule edit, undo and save.
- `web/tests/studio-scene-objects.test.js`: frame consistency, next-frame
  disconnection, reference authoring/retargeting, atomic rejection, nested group
  wrapping, removal, undo and recall.
- `crates/manifold-project-js/tests/studio_components.rs`: real native
  publication and save/reopen of groups and references, comparing audio samples
  with an untouched instance throughout metadata publication.

Captures, the native gesture video and machine-readable results are in
[`2026-10-13-graph-interaction`](../../web/public/studio/2026-10-13-graph-interaction).

Validation: 206 web tests and 576 release Rust workspace tests pass. Audio Wasm,
UI Wasm, production web and standalone builds pass. Browser and native GUI
acceptance completed, including the recorded native pointer drag. A real browser
context-menu click also created the expected parameter reference without
changing the audio graph.
