# Authored Three.js instrument in DSP live scripting

2 October 2026. First custom-code publishing slice. Native custom view export is
still open; see [export acceptance](web-plugin-export.md).

## Use the actual build

- [Live creator](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=ui-three-tone):
  Start audio and drag the object horizontally for pitch and vertically for cutoff.
  Use retained or egui controls alongside the scene. Edit the highlighted custom
  view module and Apply view live; colors, geometry and behavior are authored code.
- [Independent importer](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?program=ui-three-tone):
  ordinary public package imports mount the same graph, kit and custom module.
- [Interaction evidence](https://wubulon.tailfac9f9.ts.net:4174/three-view/2026-10-02/manifest.json):
  actual BB screenshots, browser report and a 76.5-second live output recording.

## Ownership and portable source

`packages/manifold-author/examples/ui-three-tone.mjs` defines the graph, controls,
kit presentation and a version 1 `webView` declaration. Its separate view source
explicitly imports Three.js, with `three: '0.184.0'` declared as a dependency.
`@manifold/ui-web/custom-view` loads explicitly supplied dependency modules and
mounts the factory with public parameter, transaction, snapshot and analysis
bindings. The creator and independent consumer bundle Three.js locally through
Vite. They do not request a CDN or execute Three.js in the audio/control runtime.

The creator routes pointer targets through its existing coalesced gesture adapter,
so the scene and kit present the newest intent while publication is pending.
Accepted Rust targets remain authoritative. The ring reads bounded RMS from the
actual output; the scene does not generate sound or drive audio scheduling.

The authored source is the saved definition of custom view code. There is no
second serialized source bank. Native QuickJS evaluates the graph factory but
does not execute its view module. Saved source, undo and restore reproduce the
view declaration. `replaceWebViewSource` is an editor helper for the example's
named declaration; it is not a mandatory coding convention for all custom views.

## Exercised behavior

- Actual pointer drag: accepted pitch 220 → 348.197 Hz and cutoff 2400 → 1515.038 Hz.
  Scene values match the accepted graph after the gesture settles.
- Actual CodeMirror input changed the ring to pink and the object's geometry,
  then Apply view live accepted revision 11. Pitch/cutoff stayed unchanged and
  the same audio track remained running with nonzero measured output.
- Actual retained slider input changed pitch to 715 Hz and moved the scene.
  Switching to the real Wasm egui view kept the Three.js scene and audio active.
- A structured request labelled `agent` changed cutoff to 3600 Hz through the
  same project API. This is a shared-operation proof, not a complete external
  agent collaboration workflow or a DAW automation proof.
- Reload restored the edited view and 715 Hz / 3600 Hz targets. Switching to Gain
  removed the custom canvas. Lifecycle code cancels animation, unsubscribes,
  disconnects resize handling and disposes geometry/material/renderer resources.
  This is not a measured GPU memory/leak audit.
- The independent importing page rendered the custom scene and changed its
  actual graph through a pointer interaction while audio ran.
- 106 web checks passed. Four native live-primitive checks passed, including
  native signal rendering, live source edits and cold recall for all 33 programs.
  Native signal tests do not establish native rendering of this Three.js view.

All browser playback used verified private `sinkId: {type:'none'}` contexts.
The unchanged track and nonzero observations establish continuing playback at
those observations; they do not establish sample-perfect or glitch-free editing.

## Remaining boundaries

This host resolves bundled Three.js only. General dependency installation, file
assets/models, native custom-view entrypoints, unique plug-in identity, VST3/CLAP
export assembly, native GPU/editor interaction and DAW recall remain open.
The native standalone can run the graph and kit; it does not display this custom
web view. The secondary editor has highlighting and color pickers; full Three.js
type information/completion is not supplied by this slice.

Rendering uses Three.js's [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html),
whose WebGL 2 support must also be exercised in the native webview.


Subsequent native delivery: [individually identified CLAP/VST3 exports on Linux,
ARM Mac and Windows/Proton](native-export-delivery.md), with actual native scene
gestures, egui controls, source edits, automation and DAW recall evidence.
