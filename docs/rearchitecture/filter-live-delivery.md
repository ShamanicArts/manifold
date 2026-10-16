# Live Filter creator: first accepted-goal increment

1 October 2026. **V01 remains open.** This delivers the integrated browser and
native standalone and native DAW creator increment; it does not establish the whole
legacy port or complete V01 acceptance.

## Review the actual product

- [Live Filter creator](https://wubulon.tailfac9f9.ts.net:4174/filter.html).
  Start audio, choose retained or egui, drag the response/compact sliders,
  edit the highlighted source, and apply while processing. Recording captures
  the actual output. Save/Open and authored undo operate the accepted project.
- [Independent importing application](https://wubulon.tailfac9f9.ts.net:4174/examples/filter-import/).
  Its own package/build imports only the public authoring/runtime and kit APIs.
  Add its gain while audio runs and export the edited project.
- [Actual agent/human interaction with live audio](https://wubulon.tailfac9f9.ts.net:4174/filter-delivery/2026-10-01/live-agent-performance.mp4).
  A real agent applies a source/UI edit over HTTP; the review then performs
  with egui and switches to retained controls. This is an external agent adapter,
  not an embedded model/provider. The video is a short real capture, not an
  offline DSP render. An earlier longer [egui sweep](https://wubulon.tailfac9f9.ts.net:4174/filter-delivery/2026-10-01/live-egui-sweep.mp4)
  accompanies the browser recordings.
- Native executable: `target/debug/manifold-app`; build/run with
  `cargo run -p manifold-app`. The native egui creator includes highlighted JS,
  controls, source apply, action history, agent endpoint/task/enable controls,
  Save/Open and undo. Its CPAL output callback continuously owns one graph;
  **Listen** enables monitoring. It currently supplies saw/noise input; native
  file/device input integration remains open. It currently requires float32
  output-device support.

Recorded evidence is in `web/public/filter-delivery/2026-10-01`:
browser/egui/importer and native screenshots; actual agent replies; portable
browser/native saves and the packaged `Filter.manifold.json`; live output audio;
rejection/recall and compatible-edit target readback.

## What changed and why

`LiveProjectRuntime` is a public control-side creator session, shared by the
source editor, retained kit, JS immediate painting, egui inputs and agent requests.
It serializes edits, checks base revisions, prepares a candidate, waits for its
audio host, then changes accepted source/graph/view and reads actual DSP targets.
Invalid graph/view/source edits preserve accepted state. Unchanged source defaults
retain live parameter values by stable instance identity; explicitly changed
defaults become the new intent. The cached previous authored description is only
used to distinguish those cases. It owns no DSP kernel or independent audio state.

The original browser Filter and compact slider implementations now live in the
importable `@manifold/ui-web` package. Existing product imports re-export them.
The Rust `manifold-ui::ProjectView` renders the same component/endpoint descriptions
and emits the same parameter commands. Browser JS can declare representative
immediate controls through `paint(ui, snapshot)`. The kit is still a partial port:
buttons, tabs, broader layout/gesture semantics and custom-surface contracts are
not complete.

The public native JS host drives `manifold-app`. It executes the same creator
model/source on the control thread; the separate native audio handle applies
prepared changes at block boundaries. The native source/editor is a client of
that accepted state. Agent writes go through the same session and require a base
revision; the application exposes their attributed accepted history. The browser
preview broker forwards requests to the actual open application and owns no DSP.

Prepared browser execution now admits the SVF primitive, publishes its actual
mode/cutoff/resonance targets, and transfers compatible smoothing/integrator state.
The legacy resonance display range remains 0.1–2; DSP clamps to 1, and this creator
displays the accepted target after readback. This differs from a legacy UI that
can retain a requested value above its effective DSP target; it is recorded rather
than presented as complete UI parity.

## Portable authoring metadata

The existing `manifold.project` v1 graph may carry optional `liveAuthoring`:

```json
{"format":"manifold.live-project","version":1,"source":"…","view":[]}
```

Native parsing bounds its source/view and keeps it with the graph save. It is
presentation/controller intent, never DSP callback work. The creator also accepts
its local `manifold.live-project` envelope containing `graph`, `source` and `view`.
`project.save` exports the portable graph form; existing `manifold.package` tooling
can wrap that graph with the public controller bundle. Raw GraphWorkspace export
contains graph data; the creator/native controller supplies its authoring metadata.
The standalone GUI now opens creator packages through the existing native audio
handoff. Package saves retain the controller, hash and identity with the accepted
graph and authoring metadata. Raw portable creator saves are demonstrated in both
directions; packaged browser creator Open remains a separate integration gate.

## Exercised delivery and limits

- Browser playback with original retained controls and actual Rust/Wasm SVF.
- JS-authored egui controls and native Rust egui using that same model.
- External agent inserted gain and added a UI control in both browser and native.
- Browser invalid syntax left source/revision unchanged while processing advanced.
- Compatible live edit retained a 700 Hz target; readback reported zero callback
  allocations/deallocations and processing failures in that exercise.
- Native saved 0.35 output gain reopened in the browser, matching actual DSP targets;
  the browser save reopened natively with the same source and value.
- Separate importing application processed the Filter and added gain live; its
  prepared runtime reported zero callback allocations/deallocations/failures.
- Focused native creator test covers explicit new cutoff, unchanged live resonance,
  source/UI recall and invalid-source rejection. Core Filter test covers exact next
  samples after compatible state transfer and refusal across sample rates.
- UI Wasm, native application, importer and product web builds succeeded.

Observed browser source publications in these small scenarios were about 6–22 ms;
the measurements exclude agent reasoning and HTTP poll delay. They are **not** the
required C++/native/Wasm performance comparison or sustained-load deadline proof.

GUI review ran on a separate headless Weston compositor; browser and native audio
were verified on `manifold_v01_review`, leaving physical outputs unchanged. A
scratch-directory quota initially broke browser GPU captures; moving owned review
scratch into the project enabled successful captures. Earlier failure evidence is
not counted as a successful agent operation.

## Next work in V01

Finish actual pointer/egui interaction in the CLAP and VST3 editors. Add native
file/device inputs, broader device formats and the remaining live
script lifecycle/graph inspection interactions. Complete component/parameter
semantic parity and document host capabilities. Exercise legacy Filter/DspLiveScripting
behavior and matching C++/native/Wasm timings alongside those usable builds.
Browser source evaluation currently runs on its control/UI thread; interruptible
evaluation and complete TS editing remain open. Do not move to another backend-only
checkpoint or mark V01 closed from the current tests/screenshots.

## Review correction: retained drag and matching layout

Lucas reported earlier accepted targets pulling the retained control backward
while dragging (rather than a tab crash). The public `parameter-gesture` UI
binding now holds only pending pointer intent, coalesces intermediate targets,
and submits one atomic `parameter.batch` at a time. Accepted graph state, save
and agent revision checks still come from `LiveProjectRuntime` and DSP readback.
Filter XY moves publish cutoff and resonance in the same batch. Both retained
and egui browser controls use this binding. Native controllers support that same
batch protocol. Native standalone now uses the same latest-intent and atomic-batch
semantics through `manifold_ui::gesture::ParameterGesture`.

A live increasing retained sweep with 70 ms acknowledgement delay recorded 107
UI samples with zero backward steps, then matched the final sounding target.
`retained-gesture.json` records the samples, actual targets and callback counters.
This supports the pointer/readback fix, not a full performance or listening gate.
The egui renderer now uses the same response-left, controls-right geometry as
retained, without duplicated product headings. `aligned-egui.png` and
`aligned-retained.png` show the running product. Custom authored paint can still
choose a different control order from the retained declaration.

Native review archive: `Manifold-review-linux-x86_64.tgz` contains a stripped
**development-profile** standalone executable, the exact CLAP v6 reviewed bundle,
and its actual edited REAPER project. `native-build.json` records its hash.
Actual CLAP source/UI/cutoff recall passed; only the recalled audio was non-silent
in that run, so editor-close audio continuity is not accepted from v6. Newer
CLAP/VST3 working binaries add host gesture reporting. Review update 2,
`Manifold-review-linux-x86_64-r2.tgz`, includes the exact `clap-creator-v9` and
`vst3-creator-v3` bundles and updated development-profile standalone. Its adjacent
JSON contains archive and per-file hashes; `scripts/package-filter-review.py`
reproduces the package from those reviewed bundles.

Both latest actual DAW runs verified retained keyboard events, atomic cutoff plus
resonance batches reported into host automation parameters, incoming automation,
live source/UI edits, editor close/reopen, and actual project source/cutoff recall.
Four live recordings per format were non-silent, with RMS about 0.040–0.041.
These establish continued processing in those stages, not glitch-free continuity.
Physical pointer gestures and interactive egui controls in native DAW editors
remain unverified. egui screenshot capture alone is not interaction evidence.

## Native standalone delivery: update 3

`native-creator-v5/report.json` records the actual egui application review:
pointer dragging, final release matching a click at the same position, live
package Open/Save, retained controller/hash/identity, actual process restart from
the saved package, corrupt-package rejection and stale prior-project rejection.
Five private-sink recordings were non-silent, RMS about 0.013–0.037. This does
not establish glitch-free continuity. The review runs on its own X server; no
desktop window or physical output is used. `live-native.mp4` captures actual
screen movement plus live processed audio.

`NativeScriptControl::begin_load_runtime` publishes an already validated JS
controller and prepared graph through the existing callback handoff. The old
controller stays accepted until publication. Invalid preparation or changed
bus shape leaves the old host running. The UI overlays transient gesture intent
on accepted DSP target readback and coalesces only UI movements; agent commands
keep their revision checks. Host-session revision offsets preserve monotonically
increasing public revisions across new controllers that start at local revision
zero. Queued requests from the old package are rejected after a successful Open.

The shared egui response and slider now consume `drag_stopped()` as well as drag
events, so a release between frames commits the final pointer position. The
updated UI Wasm is deployed in the browser build as well.

Review [native update 3](https://wubulon.tailfac9f9.ts.net:4174/filter-delivery/2026-10-01/Manifold-review-linux-x86_64-r3.tgz)
and [actual native interaction](https://wubulon.tailfac9f9.ts.net:4174/filter-delivery/2026-10-01/native-creator-v5/live-native.mp4).
The archive is 31,967,445 bytes, SHA256
`61c3349fff10f98a30ddff9a92ecb13c7913ec2896f2960c70e9c6a8959495c1`.
Its native executable remains a stripped development build; CLAP/VST3 bundles
remain the exact previous DAW reviews. Their physical pointer interaction is not
claimed from the standalone review.

Reproduce with an available Xvfb and private audio:

```sh
CARGO_BUILD_JOBS=2 cargo build -p manifold-app
TMPDIR=/home/shamanic/.cache/manifold-review python3 scripts/with-private-null-audio.py python3 scripts/with-headless-x11.py -- python3 scripts/review-native-creator.py --output web/public/filter-delivery/2026-10-01/native-creator-review
```

The review supports `--xvfb PATH` on the isolated X11 wrapper. This machine used
an extracted Arch package in ignored review scratch; no system package or desktop
configuration was changed. The focused native creator tests also cover package
publication into an existing audio handle, fresh-controller recall and rejected
invalid controller preparation.
