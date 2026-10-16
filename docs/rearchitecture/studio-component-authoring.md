# Studio component authoring

The later [field/rule slice](studio-field-rules.md) extends this initial surface-only
contract with typed outputs, presentation-script execution and live inspection.
The remaining-scope descriptions below record the first slice's boundary.

Delivered first web-surface slice, 11 October 2026. This extends the accepted
[Studio workspace](studio-workspace-delivery.md); it does not complete the broader
[multidomain proposal](manifold-studio.md). Nacre artwork remains deferred.

The subsequent [node source-navigation slice](studio-node-source-navigation.md)
connects selection to definition/declaration source, imported helpers and retained
drafts. It does not yet add visual-to-visual execution or arbitrary script attachments.

## Example clarity follow-up

Lucas accepted the tooling but found the two circles uninformative. The
[Output probe](../../projects/studio-output-probe/README.md) now demonstrates a
real Gain control feeding an output level meter and measured level history.
Each custom node has a clear role, named input and separate source; the shared
graph labels distinguish display nodes from audio processing and the inspector
shows actual connections. The original circle project below remains the
initial plumbing/recall evidence, not the recommended explanatory example.

This follow-up also corrects standalone telemetry: the first implementation
passed peak amplitude under the RMS field name. Native presentations now receive
actual stereo RMS, with peak published separately. Browser and native analysis
still have different observation windows; frequency-band parity remains open.

## Usable workflow

1. Open an audio plug-in project. In **Add node → Visuals**, choose **New custom
   visual**. Studio creates an editable definition, its source file and an instance.
2. Connect **Output → analysis** to the visual's **signal** input. The starter
   Canvas 2D circle responds to output RMS. It requires no Three.js dependency.
3. Select the node in the graph or project tree. With Project visible, its source
   opens; Explorer and the inspector's **Code** section link to the definition
   and helpers. The inspector also offers **Add another instance**, Size and Hue. Changing a local
   value affects that instance; saving definition source updates every instance.
4. The definition appears in the palette for reuse. Save/reopen preserves its
   files, stable instance IDs, local values, graph positions and analysis cables.
   Undo and unrelated root-script edits preserve the same document relationships.

The review project has one definition and two instances with different hues.
It retains the default audio path: this is still an audio plug-in project.
The existing Classic/docking layout, Explorer beside the asset, single root
Perform/Arrange presentation and project-specific artwork remain supported.
Visual bounds can currently be edited as percentages in `/composition.json`;
there is no new graphical bounds editor in this slice.

## State and ownership

The optional version-1 `composition` in `manifold.live-project` owns visual
**definitions**, **nodes** and **connections**. It is saved under `liveAuthoring`
with the existing graph in exported documents. Old projects without it load an
empty composition. It uses the existing `LiveProjectRuntime` revision, command
queue, history, files, save/restore and host metadata publication. It introduces
no second DSP processor or renderer-controlled audio clock.

Definitions carry an ID/version, label, implementation kind, source entry, exact
dependency versions, supported host targets, named inputs and parameter ranges.
The core starter creates a project definition using that same contract. Instances
carry distinct numeric IDs, definition references, local values, graph positions
and Presenter bounds. Validation rejects collisions with audio IDs, dangling
references, invalid ranges, incompatible ports and oversized documents. Removing
an instance removes its cables but retains its reusable definition and files.

`/composition.json` is a virtual editable view of the accepted composition, not a
second saved file. The project tree's `/project.json` view shows both `audio` and
`composition`. The source entry and helper modules are ordinary project files.
A file write checks the accepted content as well as the revision, so an agent
edit cannot silently overwrite a human draft. Native JSON object ordering does
not produce false composition-file conflicts.

The public `component.create`, `define`, `add`, `update`, `remove`, `connect` and
`disconnect` commands are available through the same agent tool registry as
other authoring commands. The canvas translates visual movement, removal and
wiring to those commands. Audio output analysis is an explicit typed adapter;
visual connections never enter the DSP graph compiler. Metadata publication
still follows the host's existing acknowledgement boundary.

## Presentation contract

The implemented kind is `web-surface`, with `browser` and/or `webview` targets.
The same surface host runs in the browser and the Linux standalone's embedded
webview. It is not a conversion from JavaScript graphics to native GPU code.

The module's default factory returns `mount(element, api)`. Mounting returns a
synchronous `{ dispose() }` instance. `api.input(name)` returns a detached bounded
analysis observation or null; `api.parameter(name)` reads local instance values;
`api.assetUrl(path)` resolves a saved project asset. These local visual values are
not DAW automation parameters. Browser analysis supplies RMS and frequency bands;
the existing native face bridge currently supplies RMS without frequency bands.

The static module resolver admits local JavaScript helpers and explicitly
declared dependencies. It validates source syntax and the module closure without
executing presentation code in the control runtime. This initial synchronous
subset rejects cycles, re-exports, dynamic imports, `import.meta`, top-level await
and destructuring export declarations. Imported bindings are resolved at mount;
use exported functions for mutable state. It is a trusted-code loader, not a
sandbox. Exact dependencies must already be provided by the presentation host;
there is no automatic package installation.

A replacement surface is mounted before the old surface is retired. Pending
candidates stay hidden. A failed candidate leaves the last rendered surface
visible, reports the affected instance, and clears that issue when repaired or
removed. A syntactically valid source that throws while mounting **is already
accepted project source**; preserving the previous rendering is not a document
rollback. A fresh open of that broken source reports the failure.

## Verification

The committed review scripts operate actual Studio interfaces:

- [`web/review-studio-components.mjs`](../../web/review-studio-components.mjs):
  shared egui palette insertion twice, actual port clicks for both cables,
  browser/Wasm audio observations, source repair after a renderer failure,
  unrelated source apply, save/reopen and screenshot. AudioContext routing is
  asserted as the browser's private `none` sink before playback.
- [`web/review-studio-components-native.py`](../../web/review-studio-components-native.py):
  opens that browser-saved project in the release standalone, selects a visual,
  opens its definition, types into the actual file editor, saves, switches to
  Silent and captures the result. The test runs on a verified isolated Xvfb
  display and checks the owned audio stream is on `manifold_review_null`.
  A final native-to-browser recall also preserves the typed source edit and both
  live instances. The final browser image was captured through `bb browser capture`
  to refresh the hidden tab's compositor without focusing it.
- [`studio-components.test.js`](../../web/tests/studio-components.test.js):
  shared state/recall/undo, invalid files and wires, module helpers, deferred
  execution, real agent tools and stale-file conflicts. Four tests pass.
- [`studio_components.rs`](../../crates/manifold-project-js/tests/studio_components.rs):
  native QuickJS creation, wiring, additional instance, source edit, cold recall,
  rejection and undo. Every acknowledgement block is compared sample-for-sample
  against an untouched audio instance; another twenty blocks match afterward.

The broader affected QuickJS/UI suites pass all 52 tests. The native library
passes 134/136, with the same two gain-range expectations already recorded in the
[preceding workspace delivery](studio-workspace-delivery.md). The browser Node
suite passes 137/138; its existing creative-example gain-range fixture still
expects the earlier maximum. These suites are **not fully green**.

Release standalone, UI Wasm and web production builds pass. Authoring TypeScript
checks and generated-package freshness checks pass. The exported package retains
composition and source files exactly; export validation checks each visual's
native-webview target and declared dependencies. This is package/state evidence,
not a new CLAP/VST3 editor or DAW certification run.

See [browser evidence](../../web/public/studio/2026-10-11-components/browser.jpg),
[native source edit and Silent input](../../web/public/studio/2026-10-11-components/native-edited-silent.jpg),
[browser results](../../web/public/studio/2026-10-11-components/results.json),
[native results](../../web/public/studio/2026-10-11-components/native-results.json)
and the [loadable project](../../web/public/studio/2026-10-11-components/visual-authoring.manifold.json).
The [check record](../../web/public/studio/2026-10-11-components/checks.json) keeps
the passing results and known failures together.

## Remaining work

Nested compositions and navigation, field/math/transform nodes, visual-to-visual
and resource ports, arbitrary internal audio analysis taps, automation exposure,
package installation and additional renderer backends remain later slices.
The saved contract and supported ports must expand deliberately with those
capabilities; the canvas must not imply routes the runtime cannot execute.

Lucas's subsequent [object/rule direction](manifold-studio.md#authored-objects-and-inspectable-rules)
sharpens the next slice: a script-declared object visible in the same tree and
graph, connected to editable downstream rules and a compatible renderer. Its
inputs, applied operations, values/bindings and source must explain the actual
result. This requires real object/resource outputs and rule execution; nesting
the current opaque web surfaces alone does not satisfy it. Reusable nested
composition should preserve those interfaces and allow inspection of exposed
internal objects. The agreed field/transform nodes can build on that contract
for the new plug-in. Any substantial UI change still needs joint mock review.
The [selected-node source workflow](manifold-studio.md#from-a-selected-node-to-its-authored-code)
is part of this tooling milestone: expose declarations, definitions and attached
behaviour clearly, then use Nacre's actual composition to check the coverage.
Native New/Export commands remain disabled, and the previously observed native
QuickJS memory limit for asset-heavy Nacre projects is still open. The overall
legacy behavior inventory, complete native/Wasm parity and Nacre design repairs
are not closed by this delivery.
