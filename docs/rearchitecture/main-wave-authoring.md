# Main Wave authoring checkpoint — 30 September 2026

Change `ssxrkzvu`, parent `wnmuzvyt`. This is a portion of M2, not a completed
Main port. The public JS/TS graph API builds eight inspectable Wave voices,
voice mixing, dry/monitor/capture-send/master branches and four layer-input taps.
There is one authored execution plan. This package uses neither `MainInstrument`
nor `main-voice-bank` as its synth implementation.

## Behavior and API

`packages/manifold-author/examples/main-wave-graph.mjs` translates the old
Wave-only oscillator/crossfader/mixer branch. `main-voice-control.mjs` translates
the old voice manager and ADSR controller: allocation, release/stealing, velocity
mapping and bounded amplitude emissions. JavaScript owns orchestration; Rust owns
DSP. A caller supplies the control clock.

The public `mixer` takes an authored positive input count. The former 32-input
restriction was removed on 13 October 2026; 32 remains its catalog default. Configured queries, parameters,
import validation, grow/shrink and stale-port rejection agree in Rust and JS/TS.
Direct parameter batches need no synthetic controls. Publication preserves
retained mixer gains/pans and crossfader smoothing. Actual C++ comparison exposed
a pre-first-block oscillator amplitude snap; graph reset now distinguishes
preparation from subsequent live commands.

Prepared capture export reserves staging on the compiler worker, freezes a ring
without allocation, copies bounded chunks between blocks and releases staging.
Seconds windows use the authored ring capacity; the former 30-second quota was removed on 13 October 2026. Bars/free services remain open.
These taps are not the historical LoopLayer playback/transport.

## Review and proof

- [Live creator](https://wubulon.tailfac9f9.ts.net:4174/main-wave-author.html):
  notes, controls, user JS transactions, live unity insert, capture taps, package
  download, saved graph inspection and stop/restart recall.
- [V3 recordings, screenshot and reports](https://wubulon.tailfac9f9.ts.net:4174/main-wave-author/2026-09-30-main-wave-author-v3/).
- Actual old C++ Wave route versus public graph: four cases at 48 kHz, block sizes
  17/128/511; maximum PCM error **2.98e-8**, unchanged 2e-5 threshold. This is signal
  agreement for that branch, not a performance or full-project comparison.
- Actual old Lua allocator/ADSR modules versus new controller: allocation,
  release/stealing and emitted frequency/amplitude traces agree. Host routing and
  publication are mocked in the harness; old UI parity is not claimed.
- Native package: eight voices survive 16 live insert/remove edits with exact
  reference PCM and guarded callback heap. Explicit note/ADSR calls run without
  an editor. No-op calls can finish synchronously; `is_pending()` exposes this.
- Actual AudioWorklet: **88,448 stereo frames match exactly** through 15 topology
  edits (five mixer resizes, ten inserts/removals). Four suspended capture windows
  each contain 12,000 matching frames. Capture continues with monitor gain zero.
  Callback allocation/deallocation/failure counters are zero.
- Rejected shrink leaves the graph unchanged; stop/restart retains the accepted
  13-input mixer and can sound a new note. Workspace, web/TS and package checks pass.

Failed v1 C++ startup and v2 browser startup-alignment cases remain visible. V2
started one graph while the other prepared; v3 suspends the shared context before
preparing either. Browser reports have an explicit `accepted` flag.

## Required next work

The [arbitrary I/O requirement](arbitrary-io-contract.md) applies to host buses,
channels and module boundaries. Configurable stereo mixers do not close it.
Explicit bus/channel declarations, planar routes and distinct-channel proofs
are now implemented for the library, native scripting and prepared browser host;
see [the checkpoint and remaining host gaps](explicit-audio-buses.md).
CLAP/VST3 negotiation and arbitrary module port widths remain open. Never silently
truncate buses.

Main Sample/Ring/FM/Sync/additive/morph, true looper, quantized transport, remaining
rack behavior, native automatic MIDI/clock/services, active-note cold recall,
egui, full legacy parity and matched C++/Rust/Wasm performance remain open. The
fixed Main route remains a comparison fixture until M2–M5 pass. No Main gate is
marked complete here.

## Direct review after the evidence-delivery complaint

On 2026-09-30 at 21:10 UTC, a fresh headless browser opened the live creator,
started a C4 note, accepted the user-authored mixer resize to 13 inputs and
inserted a unity node while the note continued. The screenshot shows the accepted
topology edit and sustained voice. The analyser peak was 0.02248; callback
allocation, deallocation and processing-failure counters were all zero. A
48,000-frame stereo layer-input capture is provided for listening. This capture
is a tap of the playing Wave branch, not a full Main composition or looper proof.

- [Screenshot](https://wubulon.tailfac9f9.ts.net:4174/main-wave-review/2026-09-30-2110/playing.png)
- [Capture](https://wubulon.tailfac9f9.ts.net:4174/main-wave-review/2026-09-30-2110/sounding-graph.wav)
- [Observed state and diagnostics](https://wubulon.tailfac9f9.ts.net:4174/main-wave-review/2026-09-30-2110/report.json)

Recipe: `MANIFOLD_REVIEW_LABEL=<fresh-label> python scripts/with-private-null-audio.py node scripts/review-main-wave-browser.mjs`.
The helper verifies a private null sink before launching headless Chromium.
Review output belongs under `web/public/main-wave-review/<fresh-label>` and is
included by the normal production web build. The 21:10 assets were also copied
into the already-running preview's `web/dist` directory.
