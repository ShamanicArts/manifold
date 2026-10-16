# Nacre Device source and continuous Inspector readouts

13 October 2026. The Nacre example now imports named processors and `createEffect`
from `manifold`. Its audio source is independent of Studio and its presentation
scripts. Prism Bend is an ordinary reusable Device, with an enterable graph,
named filter/exciter instances, controls and source navigation.

## What changed

[`ui-nacre.mjs`](../../packages/manifold-author/examples/ui-nacre.mjs) declares
initial sound, public controls, connections and canvas positions. Authors no
longer allocate processor numbers, pass `.type` strings, or patch a second
`studioGraph` declaration over the audio graph. `effect` and `prismBend` are
ordinary JavaScript names; their quoted IDs identify the authored Devices.

The source retains all 14 musical controls and their existing colours, ranges
and defaults. Device controls now accept the existing shared component `style`
metadata: `accent`, `background` and `text`. These colours survive source edits,
reopening, and nested Device controls.

The catalog example uses Device-relative control paths: `/nacre/focus` becomes
`/focus`, and `/studio/prism-bend/12/edge` becomes `/prism-bend/edge`; the other
controls follow those same mappings. `projects/nacre/controls.mjs` and the visual
parameter references use those declarations. This rebuilds the bundled example;
it does not rewrite users' existing saves or their automation contracts. Existing
saved sources continue to run through the compatibility API. Open **Project →
Open example → Nacre** to load the updated source.

The scene, field, energy and modes remain separate scripts under
[`projects/nacre`](../../projects/nacre). All 13 embedded artwork assets are
unchanged byte for byte. The generator reads the Device source directly and
assembles the 19 presentation connections; it no longer embeds the old renderer
in the audio file. `ui-nacre-view.mjs` remains a historical reference only.

## Inspector flicker

Presentation observations arrive every 100 ms. Both the browser projection and
native bridge previously discarded a sample whenever the document revision
advanced. Dragging a parameter or moving a node repeatedly removed the Inspector's
value and status rows before the next observation arrived.

The live runtime now records the revision at which presentation objects, wiring
or source last changed. The Inspector retains compatible samples through value,
position and grouping edits, rejects samples from earlier structures or future
revisions, and reserves space for unavailable readouts. The native WebView uses
the same validity window and rejects out-of-order samples. Presenter capture
still requires the exact current revision.

This removes disappearing rows and their layout changes. It is not an FPS or
CPU benchmark. Audio timing remains independent of presentation observations.

## Native authoring cost

The full Nacre test also exposed redundant work and a bounded-heap failure:

- Module validation parsed each renderer up to three times. Compilation and
  default-export discovery now reuse the validated syntax tree.
- Saving file records no longer serializes and parses immutable image strings
  just to detach the records. Saved objects remain independently mutable.
- QuickJS reserves three bytes per UTF-16 code unit when converting a wide
  string to UTF-8. Large documents containing artwork and Unicode could exceed
  the 32 MiB heap during undo. The native transport emits lossless ASCII JSON,
  avoiding that conversion spike. Unicode, including surrogate pairs, survives
  native edits, saving and recall.

The native memory limit and 2-second authoring / 250-ms interactive budgets are
unchanged. No audio callback work or new DSP path was introduced.

## Verification

- 208 JavaScript tests and 578 release Rust workspace tests passed. The app/UI
  tests and live native check were repeated after the WebView validity fix.
- A committed pre-migration audio fixture is compared with the new Device for
  128,000 stereo frames. Every sample matches, including live changes to all
  exposed controls, memory hold, dry/wet, bypass and Prism Bend.
- The browser pointer test records continuous field response, Inspector values,
  and stable readout height through gestures and repeated node moves.
- The standalone test uses real pointer input on an owned Xvfb display and a
  verified private audio sink. Ten Inspector samples during the drag stay live
  with a constant 69-point readout height. Source edit, undo and save pass.
- Browser audio, source edits, resource disconnect/reconnect and saved-project
  reopen are exercised through the real Studio host with a private Web Audio
  sink. Wasm UI/DSP and production web/native builds pass.

Evidence: [`2026-10-13-nacre-device`](../../web/public/studio/2026-10-13-nacre-device).
The test drivers are `web/review-inspector-continuity.mjs`,
`web/review-nacre-visual-graph.mjs` and `web/review-nacre-visual-graph-native.py`.
