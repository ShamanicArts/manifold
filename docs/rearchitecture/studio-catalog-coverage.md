# Catalog coverage and optional viewers

13 October 2026. Follow-up to Lucas's catalog and nested visual composition review.

## Delivered

The shared authoring catalog now exposes 71 entries, up from 43. Studio hides
its two fixed input/output boundary entries from ordinary insertion. Nacre's
picker therefore shows 78 results: 69 Manifold primitives, its Prism Bend audio
graph, seven project visual definitions, and the custom-script starter.
These counts describe this project and this release, not an exhaustive inventory
of everything in historical Manifold.

The 28 additions expose existing engine kernels through the common Rust/JS
contract and named public `manifold` imports. Native, Wasm, source authoring,
Studio insertion, portable save/recall and agent inspection use that contract.

| Family | Additions |
| --- | --- |
| Dynamics | Compressor, limiter, transient shaper |
| Delays and spectral effects | Stereo delay, eight-tap delay, reverse delay, stutter, pitch shifter, shimmer, reverb |
| Modulation and tone | Phaser, chorus, bitcrusher, three-band EQ, formant filter, resonator |
| Signal and control | Constant audio signal, linear audio blend, audio slew, phrase gain, audio envelope, envelope follower |
| Analysis | Eight-band spectrum analyzer, FFT spectrum |
| MIDI | Note filter, scale quantizer, velocity mapper, arpeggiator |

For example, `import { createEffect, phaser, stereoDelay } from 'manifold'`
imports the actual definitions. Parameters have readable names such as
`rateHz`, `leftTimeMs`, `pitchSemitones` and `thresholdDb`. They do not require
knowledge of kernel IDs. The catalog shares purpose/category metadata with
Studio and agents; node faces show the functional category, and Inspector and
picker show the purpose and typed ports.

Choice controls retain their parameter values: Phaser stages are 6/12, MIDI
scale choices start at 1, and ordinary zero-based choices continue to work.
Device controls, graph/Inspector controls and the web control panel share the
mapping. Old hand-authored views that copy a catalog's labels inherit that
parameter's mapping; explicit mappings and custom label sets remain authored.
Wrapping a graph preserves those mappings.

The graph toolbar's **Viewers** switch disables graph and Inspector previews.
It unsubscribes preview requests, releases preview history/textures, and removes
the thumbnail area. Switching on resumes current observations. Positions, wires
and graph contents remain authored. The audio engine keeps its independent clock.
A visible Presenter can still require presentation work; disabling thumbnails is
not a pause command for the project.

## Coverage limits that remain real work

- `SineBank` needs an authored partial-set resource contract before insertion can
  produce a useful node. Its default kernel has no partials. It is not offered as
  a silent placeholder.
- `InputMonitor`, `EffectSlot`, and `EffectSlotHostSwitch` remain internal/host
  variants. Public Device input boundaries, the existing Main FX slot and
  individual effect processors cover related uses, but do not imply that those
  variants have a complete public authoring contract.
- The compressor's legacy kernel fixes attack/release coefficients at prepare
  time. Only its working threshold, ratio, makeup and mix controls are exposed;
  its description states the fixed 10 ms attack / 100 ms release. Restoring
  complete timing controls needs a deliberate DSP/state change and signal tests.
- Stereo delay uses the existing nonresonant feedback lowpass. Its unused
  resonance slot is not exposed; time controls cover the kernel's full 1–5000 ms
  range. The original stereo-delay workbench remains the behavior reference.
- Spectrum and envelope analysis kernels are available, but Studio still needs
  per-node audio observations to display their measurements on each node. The
  Audio envelope node already provides a connectable control output. Do not draw
  the device's final output meter on every analyzer and pretend it is local.
- A first historical binding audit found 53 active `new_usertype` registrations
  in the Core, FX and Synth DSPHost binding files. That is **not** the whole
  historical library: module factories, MIDI/CV helpers, transport/capture and
  project-level compositions still need reconciliation. Examples absent from
  this catalog include Comb, Allpass, Frequency Shift and mid/side encode/decode.
  The existing [legacy project inventory](legacy-projects.md) remains open.
- The shared visual primitive library, portable image/layer contract, renderer
  object thumbnails and per-node audio taps remain separate unfinished work.
  This catalog expansion does not claim to deliver them.

## Agreed next visual slice

Reuse double-click/Enter, the graph toolbar and breadcrumbs. Do not invent
another navigation interaction. A wrapped creature can show its animated output
on the outer node. Entering it should reveal its image sources, frame-selection
rule, transforms and parameter/analysis references; each script stays editable.

Nacre's current oracle creature uses three separate rest/step/sing image assets
in the Oracle poses definition, not a sprite sheet. Its animation now lives in
`projects/nacre/creature-motion.mjs`, with the scene object in `creature.mjs`. Its rule chooses a pose from
held/hover state, heat, energy and time, with a minimum 180 ms between frames;
edge controls its smoothed tilt. Model that actual implementation first. An
image sequence and a sprite sheet can share a frame-selection interface without
pretending that Nacre currently uses a different asset representation.

First establish owned image/frame/layer resources and save/recall. Then provide
useful named source, frame selection, mapping/smoothing and transform definitions,
compose them into an inspectable node, and feed its actual output to a bounded
viewer. Keep Nacre's artwork and artistic choices in Nacre. General capabilities
belong in Manifold and Studio. Reference links expose the actual dependencies;
a separate reference node is useful when it transforms or reuses a value, not
mandatory for every parameter dependency.

## Validation

- 219 web tests, including all 28 named imports, source evaluation, typed wiring,
  controls, portable recall, sparse-choice graph wrapping and real Wasm rendering.
- 581 Rust workspace tests in release mode. New native coverage prepares and
  renders all 28 processors, changes their parameters, and verifies MIDI panic
  releases held voices. DSP algorithms were not changed by this work.
- Normal audio Wasm, prepared audio Wasm, shared egui Wasm, production web and
  native Studio builds pass. The existing Vite bundle-size advisory remains.
- Actual browser picker: 78 entries, Dynamics/MIDI browsing, arpeggiator insertion,
  and phaser choice changing from 6 to 12.
- Actual standalone picker: the same counts and categories, stable pointer and
  keyboard browsing. Native tests use isolated Xvfb and a private null audio sink.
- Actual browser and standalone field viewers: changing numerical output,
  viewers off/on, released hidden observations and retained graph positions.

[Captures and review reports](../../web/public/studio/2026-10-13-catalog/README.md).

The following [image-composition slice](studio-image-composition.md) adds four Manifold visual primitives (Image frames, Select image frame, Transform image and Image layer). That slice brought Nacre’s combined picker to 82 entries. The subsequent real
Nacre creature extraction adds its configured pose list, two Prism references,
motion script, scene object and reusable graph: 88 picker entries. The 71-entry
audio catalog is unchanged. See the linked delivery for current integration evidence.

13 October, eye extraction: Nacre now offers 93 picker definitions, including
its eye images, gaze rule, eye artwork, nested eye graph and Hold reference.
The shared audio catalog remains 71. Project artwork definitions are not counted
as additional generic DSP primitives.
