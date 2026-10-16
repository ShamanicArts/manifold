# Explicit authoring across the current examples

Delivered 2 October 2026. This extends the first cleaned Networking and Link
example across the current example library. The complete Manifold port remains
open; metadata coverage does not mean every primitive has a complete product port.

## Review the product

- [Live DSP library](https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=cv-slew)
  — choose any of the 30 programs, read its imports, modify its declaration and
  Apply live. **Reset program** adopts the new example when an old saved draft
  is restored; existing user drafts are preserved until that action.
- [Filter](https://wubulon.tailfac9f9.ts.net:4174/filter.html),
  [Oscillator](https://wubulon.tailfac9f9.ts.net:4174/instrument.html), and
  [Main Wave](https://wubulon.tailfac9f9.ts.net:4174/main-wave.html) have the same
  explicit import convention. Main Wave remains the scoped Wave instrument,
  rather than the complete historical Main product.
- [Independent importer](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?program=cv-slew)
  is rebuilt against the public package.
- [Source manifest and downloads](https://wubulon.tailfac9f9.ts.net:4174/creative-examples/2026-10-02/manifest.json)
  list all 33 displayed modules, their hashes and the current library files.
- [Actual egui and source screenshot](https://wubulon.tailfac9f9.ts.net:4174/creative-examples/2026-10-02/egui-source.jpg),
  [actual retained editor change](https://wubulon.tailfac9f9.ts.net:4174/creative-examples/2026-10-02/retained-live-edit.jpg),
  [live browser report](https://wubulon.tailfac9f9.ts.net:4174/creative-examples/2026-10-02/browser-report.json),
  and [recorded output excerpt](https://wubulon.tailfac9f9.ts.net:4174/creative-examples/2026-10-02/live-programs.ogg).

## What the examples expose

Every displayed sketch now has ordinary module imports and a default project
factory. Primitive auditions show named DSP instances, control descriptors,
named parameters and direct named-port connections, replacing numeric node and
connection tables in the displayed source. Stable instance IDs, endpoint paths,
defaults and routing retain their previously delivered behavior.

The imports explain the teaching convention and show the convenience option:

```js
// Examples name imports so you can trace each tool to its module.
// Alternative: import * as manifold from '@manifold/author';
// Then use manifold.createGraphWorkspace(), manifold.gain, etc.
```

The public root actually provides graph tools, all 43 primitive definitions,
`defineNetwork`, voice allocation and waveform-preview utilities. Browser/device
adapters retain their own entry points. Explicit imports remain the style for
examples. Saved legacy scripts using injected `manifold` remain supported.

All 277 public parameters have stable semantic names, generated TypeScript name
unions and catalog entries over the unchanged Rust numerical contract. This
extends typed discoverability; semantic CodeMirror member completion remains
open. CodeMirror still provides highlighting and its existing generic suggestions.

Filter defines its controls once in an ordinary importable module. Oscillator
and Main Wave explicitly import their voice-allocation and visual-preview
helpers; their authored graph factories remain visible in the source. Current
library modules and consumer examples use consistent formatting and explain
graph construction, live behavior, host integration or export where applicable.
Historical measured-source snapshots remain unchanged.

## Behavior and delivery checks

- Before editing, captured all 33 actual delivered sources, graphs and views.
  A regression check compares every updated graph/view and migrates an edited
  target through source replacement and cold recall. The fixed-gain instruction
  label is deliberately updated to name `config.gain`.
- All 98 web tests and TypeScript checks passed. The public namespace is checked
  in ordinary module loading and the shared live evaluator, including primitive
  definitions and network declaration. Generated names are checked against the
  Rust catalog for completeness and uniqueness.
- Native QuickJS/core `live_primitives` passed all four tests, covering sounding
  execution, source edits and recall for the 30-program library, compatible
  history and lazy FX memory. No new native pointer or DAW review is claimed.
- Production web and independent importer builds passed; portable controller
  bundles and public project packages were regenerated.
- In the actual BB browser, all 30 programs accepted live source edits, produced
  nonzero measured output and retained the same playing MediaStream track with
  a verified private sink. ADSR's gate was enabled through the live control API.
  The review displayed actual Wasm egui. The initial multi-key picker attempt
  raced asynchronous publication; acknowledged single-step selection completed
  the review. This is usable runtime evidence, not a new deadline benchmark or
  a claim of click-free transitions between different sounds.
- A real CodeMirror edit changed Legacy Filter's declared cutoff from 1400 to
  700 Hz. Apply live accepted the exact edited source and updated the retained
  control while the same privately routed audio track continued. The
  [human edit report](https://wubulon.tailfac9f9.ts.net:4174/creative-examples/2026-10-02/human-edit-report.json)
  records source and accepted target. Review playback was stopped afterward.
- The old preview process had stopped. The same localhost server and Tailscale
  route were restored and verified; the browser generation was rediscovered.

The old mixer audition supplied `a`/`b` fields that `GraphWorkspace.add` ignored.
Its actual configuration was 32 available inputs with two connected tones.
The new source explicitly uses that effective configuration to preserve behavior.
Changing input count is now possible through `config.inputs`; an actual reduction
should be a deliberate graph edit, rather than a hidden formatting change.

## Storage

See [storage audit and maintenance](project-storage.md). This cleanup recovered
approximately **9.33 GiB**, primarily obsolete debug executables and inactive
private review browser profiles. Published evidence, current named binaries,
release builds, source, project state and VCS history were retained.
