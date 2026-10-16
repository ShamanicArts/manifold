# Orbit Studio: creator to exported instrument

3 October 2026. First integrated example following the actual restored Sentinel
review; this does not complete the broader Manifold port.

## Review the delivered product

- [Live saved project](https://wubulon.tailfac9f9.ts.net:4174/studio.html?program=ui-orbit&project=/sentinel-studio/2026-10-03/example.manifold.json)
- [Actual captures, audio, source, receipts and download](https://wubulon.tailfac9f9.ts.net:4174/sentinel-studio/2026-10-03/)
- [Linux CLAP/VST3 archive](https://wubulon.tailfac9f9.ts.net:4174/sentinel-studio/2026-10-03/Manifold-Orbit-linux.tgz)

Start audio, play the face or inspector, select a graph node, switch Arrange to
move a face control, and edit/apply source beside the sounding instrument.
The Agent button exposes the live connection and the Export button builds the
accepted instrument. The supplied project already includes the human-created
Mode and agent-created Voices controls. The pristine `ui-orbit` example starts
with an empty `studioParameters` declaration for trying new exposures yourself.

## Architecture and ownership

`crates/manifold-app/src/studio.rs` is an actual eframe/egui creator, compiled to
Wasm. It owns pane splitters, connected graph drawing/hit testing, node positions,
selection, inspector and activity. It uses the shared ProjectView controls.
`web/src/authoring/creator-workspace.js` places mounted CodeMirror and Three.js
surfaces using egui's CSS-pixel rectangles and routes their input explicitly.
Source and preview are side by side; at 480 pixels they stack in the same viewport.
Resize updates both placement and graph picking; automatic nodes fit the viewport.

The existing LiveProjectRuntime owns the accepted graph, source and live values.
The shell consumes snapshots and emits commands; it has no audio state. The
existing Rust DSP and native/browser adapters process the same authored graph.
Orbit imports public primitives and UI bindings and remains ordinary editable
JS. Its exported player displays its authored Three.js/control-panel face.

`studio-source.js` plans bounded source edits: expose a named primitive parameter
in the literal `studioParameters` list, or insert/update a literal
`presentationLayout` entry. The complete candidate goes through `source.apply`
validation and revision checking. Code outside the edited declaration is preserved;
formatting/comments inside a rewritten literal declaration may be normalized.
Unsupported expressions remain source-editable rather than being guessed at.
These commands are discoverable through `workspace.inspect` and use the same
planner for egui humans and connected HTTP agents.

Face component IDs are distinct from parameter bindings; Brightness reuses the
existing cutoff endpoint. Exposing Mode and Voices creates new public bindings,
not separate copies of their values. Perform and Arrange have distinct input
ownership. A captured layout drag previews locally and commits one undo entry;
Escape cancels it. Label, accent, position and width edits preserve sounding state.
Draft text and its accepted base are tracked separately. External accepted source
preserves dirty drafts; stale Run and visual edits are blocked until reconciliation.
Both source editors have an explicit Reload accepted action; actual pointer and
keyboard presentation draft/reload was verified. Live parameter edits do not
rewrite authored defaults.

## Actual evidence

- Real BB in-app browser pointer interactions created and placed Mode through
  egui. A connected agent exposed Voices, placed it and styled Brightness.
- Held egui cutoff movement published 1315, 2068 and 3272 Hz before release.
- Browser audio was nonzero through the verified silent AudioContext sink.
- Dirty source survived an accepted external edit; stale/invalid edits were
  rejected. Cancel restored layout; one undo restored the committed drag.
- Saved-project cold reopen retained source, graph, bindings and layout. Voice
  count changes updated the authored scene/readout live.
- Final website export job `86856b88-8029-4b0e-9b00-7c156bccc815` captured revision
  2 of the cold-reopened project. Initial authoring evidence was revision 12 of
  the preceding session; these revision counters belong to separate runtimes.
- Exact final archive SHA256:
  `e2451a75f04387e2dc06f149f1ce93f0aaf0d30292a592287aa5ed95ffdb8021`.
- Both final formats opened in actual Linux REAPER with WebGL2, source, controls,
  saved pitch 100.3786 Hz and cutoff 1639.7640 Hz intact. Actual face pointer input
  changed cutoff to 4406 Hz. A live edit to 2345 Hz survived DAW save/reopen.
- Audio remained nonzero with the editor closed: CLAP RMS 0.03942, VST3 RMS
  0.03923. Automated DAW recordings used a verified private null sink/Xvfb.
- 108 web tests passed, including real exposure/layout/state transaction probes;
  package/type freshness gates, UI Wasm compilation and Vite build passed.

Published reports/captures are in `web/public/sentinel-studio/2026-10-03`.
The large downloadable archive is ignored by VCS and retained locally there.
The reusable native review is `scripts/review-authored-face-daw.py`.
A single authorized read-only GPT-6-Astra xhigh oracle reviewed the boundaries;
its findings informed draft, identity and input ownership corrections.

## Scope still open

Graph nodes select and move; there is no visual cable rewiring in this example.
Exposure requires the documented declaration and a named existing primitive
instance. Face editing supports one bound kit component per layout path, not a
complete arbitrary component tree, nesting, asset browser or WYSIWYG designer.
Graph placement and split fractions are editor-session data, not exported content.
The creator shell is running egui in the browser; native manifold-app integration
and broad accessibility/keyboard arrangement remain work. The exported native
face is retained/custom web UI, not a new native egui Orbit face.

This Orbit drone is a composed instrument example, not the complete historical
MIDI product or remaining instrument/effect/rack/looper port. Fresh Mac/Windows
host review of this exact final archive is not claimed. Those inventory and host
gates remain in the accepted broader delivery goal.
