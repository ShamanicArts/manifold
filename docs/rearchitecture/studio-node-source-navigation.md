# Studio node source navigation

Delivered 11 October 2026, following Lucas's clarification that selecting a thing
must lead to its own authored logic. This completes a source-navigation slice of
the [object/rule direction](manifold-studio.md#from-a-selected-node-to-its-authored-code),
not the deeper visual execution or arbitrary script-attachment contract.

## Working behaviour

- With the Project pane visible, clicking a graph or Explorer node follows its
  source. Level history opens `/nodes/history.mjs`; Level meter opens
  `/nodes/meter.mjs`. Hiding Project or maximising another pane keeps source
  viewing optional. Agent selection alone does not steal the browser editor.
- Expand a node in Explorer, or use its inspector's **Code** section, for named
  definition, imported-helper and instance-settings links. Shared source reports
  how many instances an edit affects. Helpers come from the validated module
  closure, including transitive imports; unrelated files are not guessed to be
  attached behaviour.
- Gain opens and selects its authored declaration inside `/project.mjs`. Built-in
  nodes identify their compiled implementation separately. Supported static
  declarations have exact locations; dynamic or ambiguous authoring opens the
  project source without inventing a location. Navigation never rewrites code.
- Script/file drafts survive switching in both hosts. Saving still checks the
  accepted file content, so a parked human draft cannot overwrite a newer agent
  edit. Reload is explicit. Browser files keep separate editor/undo states;
  native files keep their contents, conflict bases and per-file editor identity.
- Successfully opening another native document clears old file views. Unsaved
  source drafts block document replacement. Rejected replacement does not clear
  them. The existing audio graph and publication boundary are unchanged.

## Ownership and limitations

`@manifold/author/node-sources` derives `nodeSources` for the public runtime
snapshot from accepted source, graph identity and prepared visual definitions.
It is navigation metadata, not a second saved graph or authoritative source map.
The runtime caches the index across parameter changes. Static lookup recognises
explicit graph construction/registration and literal `studioGraph` declarations;
it does not execute code to infer locations. Browser navigation can resolve a
changed draft again; native selection only uses offsets whose source excerpt
still matches, avoiding a misleading jump in a modified draft.

Shared egui owns the links and selection commands. Browser and native host
adapters open their existing editors. Older native controller bundles fall back
to their known definition entry or project source until rebuilt. The current
Linux standalone uses its embedded CodeMirror for project/presentation source
and egui for project text files.

The native review caught a blank CodeMirror view after unmapping and remapping
its GTK/WebKit child. Source now remains mounted at its last size; empty X Shape
regions remove its pixels and input while another asset is shown. This retains
the existing pane/menu occlusion contract. Editor navigation acknowledgements
are available through native workspace inspection, and captures verify painted
code rather than treating those acknowledgements alone as rendering evidence.

This slice does not add arbitrary behaviour attachments, custom JS audio kernels,
visual object outputs, nested execution or Nacre scene decomposition. Existing
root project source, custom definition source, imported helpers and instance
settings remain distinct. Next capabilities should be checked against the
[Nacre authoring map](studio-nacre-authoring-map.md).

## Evidence

The [browser review](../../web/review-node-sources.mjs) clicks actual graph nodes,
edits a meter's source, leaves and returns to its draft, saves a visible label
change, verifies a human/agent file conflict, and opens Gain's declaration and a
shared helper. No browser audio is started for this source test.

The [standalone review](../../web/review-node-sources-native.py) runs the release
application on the existing isolated Xvfb display with its process verified on
`manifold_review_null`. It types into a node's file, switches away/back, saves,
tests a parked draft against an agent edit, reloads, checks the selected Gain
source and painted editor, and opens a fresh document. It terminates its own
application after review; no desktop window is launched or focus changed.

Evidence: [browser result](../../web/public/studio/2026-10-11-node-sources/browser-results.json),
[native result](../../web/public/studio/2026-10-11-node-sources/native-results.json),
[browser node and script](../../web/public/studio/2026-10-11-node-sources/browser-history-source.jpg),
[native Gain declaration](../../web/public/studio/2026-10-11-node-sources/native-gain-source.jpg).

Affected JavaScript tests pass (7), shared UI/application tests pass (6), and the
native QuickJS component signal/recall test passes with source-link assertions.
TypeScript, generated packages, release standalone, UI Wasm, audio Wasm and web
production builds pass. The full Node suite passes 140/141; its pre-existing
creative-example gain-range mismatch remains. The workspace Rust run reaches
134/136 in `manifold-native`, failing the same pre-existing host normalisation
and saved-control gain-range expectations; it stops there. This is not a claim
that the whole workspace suite passes.
