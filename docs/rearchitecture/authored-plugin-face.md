# Authored plugin face and studio

2 October 2026. Lucas's direction: keep the automatically ordered live inspector
for quick human/agent authoring, and give the exported product its own beautiful,
playable face. Presentation is a distinct authored section, not a prerequisite
that forces authors to finish DSP before making UI.

## This vertical slice

- Add an instrument presentation role to the existing packaged web-view contract.
- Offer explicitly imported, bound Manifold kit controls inside custom views.
- Create a polished authored example with Three.js, named sound controls and
  editable layout data. DSP continues through the existing Rust graph primitives.
- Keep retained/egui inspector and CodeMirror source available in the studio.
- Native exported instrument opens on its face; Inspector/Script remain available.
- Position kit controls live in the studio, store positions in project source,
  export those same positions and bindings; no host-only second layout truth.
- Prove a browser-created archive in actual REAPER with audio and DAW recall.

## Remaining studio work

The [3 October Orbit Studio delivery](sentinel-studio-delivery.md) adds a real
browser egui shell, connected graph selection, bounded new parameter exposure,
control insertion and undoable position/width/label/accent changes. General
component trees, visual rewiring, snapping, asset management, native creator
integration, keyboard layout editing and broader accessibility remain work.

## Sentinel inspection, this checkout

Correction, 3 October: the earlier missing-installation conclusion was unsupported.
Missing launcher targets and BB environment metadata did not establish that the
application was gone or explain the cause. Subsequent recovery restored Sentinel
0.5.66 and the recorded authored Depth, Camera Flow, Flower Beard and Room Stage
work into `/home/shamanic/Applications/Sentinel-Recovery`, outside disposable BB
environments, with original compatibility fixes and repaired desktop/MCP paths.

Actual desktop UI was reviewed with those projects, connected camera feeds,
healthy compiled modules and the structured agent bridge. Captures and receipts
are private under its `recovery` directory. Some saved project metadata was
reconstructed from recorded work; this is not a byte-for-byte recovery claim.

Its connected graph, live viewport, Properties and terminal/log surfaces now
provide an observed interaction reference. Bundled UI-authoring documentation
also defines stable bindings, host selection, pointer capture and gesture
transactions. The [workspace direction](sentinel-authoring-workspace.md) records
how Manifold will apply those lessons, and which product capabilities remain open.

## Delivered evidence

Live studio: https://wubulon.tailfac9f9.ts.net:4174/primitives.html?program=ui-orbit

Review, actual captures, audio, saved DAW state, exact project and download:
https://wubulon.tailfac9f9.ts.net:4174/authored-face/2026-10-02/

- Website export job `060f0260-7891-4106-936d-584d5a6d62f5` captured revision 4.
  Archive SHA256 `9c107a680b8ba9ee62d6ffab6e24e4d4215f722f1912244f2c1057d4f93e5ece`.
  Every manifest member hash verified after downloading from the actual job.
- Actual BB pointer drag moved Pitch from `(27,12)` to `(28.6,18.1)`; accepted
  layout persisted in source and both native formats. Later GUI source edits
  preserve sounding targets through the existing compiler/publication path.
- Linux REAPER CLAP and VST3 opened the downloaded authored face at full width,
  using actual WebGL2. Real pointer clicks opened/closed Inspector and Script.
- Real face slider pointer clicks set cutoff to 4406 Hz in each format. A live
  agent edit then set 2345 Hz; DAW save/reopen retained source, layout and targets.
  Recorded RMS: CLAP 0.039523 before / 0.039731 recalled; VST3 0.039442 before /
  0.039752 recalled. Private null sink verified before launch and recording.
- Actual BB egui inspector rendered, then switching to the previous Three Tone
  program restored its ordinary custom-view position and returning restored Orbit.
- 107 browser/library tests passed, package freshness checks passed, author
  TypeScript checks passed, Vite and independent import-consumer builds passed.

The exact new Orbit export was host-reviewed on Linux only. This is a continuous
spectral drone built from existing public extended-oscillator and SVF primitives,
not a claim to have ported a historical MIDI instrument. Inspector egui exists;
a native creator shell and an immediate authored Orbit face remain further work.
The browser egui creator shell is delivered in the 3 October update.
This establishes authored-face export and existing-control placement. Full visual
UI composition and the complete legacy project port remain open.

## Public contract

`webView.role: 'instrument'` selects player-first native presentation; visual
views preserve their existing creator placement. Optional `webView.layout`
contains unique parameter/control paths and bounded percentage positions. These
fields are validated and travel in the author source/package/DAW state.
`@manifold/ui-web/control-panel` is a pinned explicit view dependency that binds
the ported compact slider and choices to that layout. The custom view API exposes
layout, subscriptions and named control reads/writes, including mapped controls.

The studio commits a single source.apply after a layout drag, protects unapplied
source drafts and rejects concurrent revision conflicts. Cancel restores the
original position. It edits a named presentationLayout declaration; this is a
convention for editable examples, not a requirement for all authored views.
