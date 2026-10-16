# Editable UI and styling examples

2 October 2026. Two additional programs in DspLiveScripting demonstrate the
presentation half of an authored instrument. Each contains the complete Rust DSP
graph definition and its JS presentation, explicit imports and the namespace
alternative. They are ordinary importable modules as well as editable live source.

| Program | What to try | What it teaches |
| --- | --- | --- |
| [Styled instrument](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=ui-styled-tone) | Change pitch/cutoff, switch retained/egui; edit `palette` or the titles and Apply live | Named controls, choices, groups, typography and portable colors; a retained `view` declaration |
| [Reactive drawing](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=ui-reactive-tone) | Drag Level above 0.2, change Pitch; edit `windowSeconds`, `height` or colors | Immediate `paint(ui, accepted)`, custom normalized curves, live text and conditional composition driven by accepted DSP targets |

The curve is explicitly a sine illustration over a 10 ms window. The host's
separate scope displays actual audio. JavaScript draws the illustration; Rust
processes the sound. Presentation functions never run in an audio callback.

## Portable presentation contract

`Component.style` accepts optional `accent`, `background` and `text` six-digit hex
colors for parameters, controls, labels and curves. Other styles are rejected
before publishing a candidate. Existing components retain their default styling.
`curve.height` accepts 64–320 pixels; `label.fontSize` accepts 10–32 pixels.
`ui.label(text, id, options)` accepts these fields and a group; its old two-argument
form remains valid. `PaintUI`, `ComponentStyle` and `Component` are exported types
from `@manifold/author/live-project`.

The JS retained kit and Rust egui renderer consume the same presentation model.
Unchanged retained components stay mounted across conditional layout changes,
preserving slider pointer capture and focus. Labels and colors update without
remounting their control. A single curve fills its group in both renderers.

This is a portable component styling surface. Browser consumers can additionally
use their own CSS, DOM and framework around `mountProjectView`; the existing
[independent importer](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?program=ui-styled-tone)
uses the public packages. Arbitrary DOM/CSS is not passed into egui.

## Modules and native packages

- `@manifold/author/examples/ui-styled-tone`: default `createProject()` factory.
- `@manifold/author/examples/ui-reactive-tone`: default factory with paint function.
- The original `.mjs` files under `packages/manifold-author/examples` are the
  canonical editable source; `generate-live-primitive-sources.mjs` publishes exact
  source copies. They are not reconstructed from minified functions.
- Each program's **Download native project** link supplies a self-contained
  `.manifold.json` package with the same graph, controller, source and presentation.
  Open it with `target/release/manifold-app <file>`.

## Evidence and boundaries

Evidence lives under [`web/public/ui-examples/2026-10-02`](https://wubulon.tailfac9f9.ts.net:4174/ui-examples/2026-10-02/manifest.json): actual BB retained/Wasm
egui screenshots, a code-editor palette/title edit while the audio track stays
running, native egui screenshots and process-specific verified private routing,
and machine-readable review reports. Native tests include both new programs in
actual DSP rendering, live source edits and cold recall. Three new web checks
exercise normal imports, target preservation/style rejection and accepted-state
painting/recall. The earlier 33-example migration fixture remains unchanged.

These are teaching instruments built from existing primitives, not additional
legacy product ports. The wider Manifold port and DAW/performance gates remain
open. There are now 32 library programs and 35 displayed sketches in total.

Verification: **101 web checks passed**, **4 native live-primitive checks passed**
(including all 32 programs), and native/Wasm egui plus both web consumers built.
The BB gesture report records five successive accepted level values from 0.15
through 0.27 while the same slider node and audio stream stay alive.
