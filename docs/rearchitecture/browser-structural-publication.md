# Browser structural graph publication

Status: a working project-package slice with bounded scalar state continuity, 29 September 2026. The full runtime gate remains open.

30 September update: publication now checks the exact audible output tag and frame count at the AudioWorklet boundary. See [deadline evidence and live runtime review](browser-publication-deadlines.md): 48 edits recorded with no edited-graph misses, but 12 late-Worker misses in the unchanged second instance. This supersedes progress-only readiness; it does not close the scheduling or stateful continuity gates.

The subsequent [ownership correction](browser-worker-ownership.md) adds cooperative retirement acknowledgement before any slot reuse. Prior recordings/profiles had competing obsolete producers and cannot prove graph/output ownership. Fresh two-instance recordings and a termination-withheld signal test verify exclusive ownership; one late-Worker block remains in the fresh profiling-off recording.

## Implemented path

`BrowserGraphHost(context, { execution: 'worker' })` now runs the same Rust/Wasm graph module in a dedicated Worker. A fixed SharedArrayBuffer bridge carries four input channels and two output channels between that Worker and a small AudioWorklet. The worklet copies audio, publishes block counters, and switches between two prepared Worker slots at a block boundary. It never constructs or compiles a graph. The old Worker continues rendering while a candidate is compiled, then is terminated on the control thread after publication. The bridge adds four 128-frame blocks of output latency in the measured browser run.

`replaceGraph(project)` validates the portable graph, prepares a candidate off callback, waits for it to render against current input, publishes the slot, and resolves only after the worklet acknowledges the switch. `LiveGraphSession.transaction(edit)` and the packaged DspLiveScripting and FX slot controllers use that host call. Rejected candidates leave the controller document and old graph in place. The JS package controller is the same bundle used by native rendering and CLAP; this browser path does not introduce a bespoke project model.

During replacement, the active Worker exports fixed-size Rust `LiveStateRecord` entries for Gain smoothing and Stereo Widener smoothing/filter/correlation history after each processed block. A double-buffered shared snapshot uses sequence tags so the candidate imports a complete record set from one old block, maps surviving nodes by stable instance path (or an unambiguous unnamed numeric ID), and renders subsequent input blocks before publication. The candidate keeps newly authored parameter targets. If any expected compatible record fails to import, publication rejects and the old Worker remains active. The core signal test confirms exact next-block output after renaming both node IDs; the browser proof renames an authored Gain ID and reports two transferred histories in both directions with no missed blocks.

Worker mode now prepares the public graph catalog, embedded PCM, and shared Sample bindings off the audio callback. It accepts bounded note events starting at the next block, single parameter edits, parameter batches, and prepared route edits. The [authored Sample voice](https://wubulon.tailfac9f9.ts.net:4174/sample-voice-chain.html) and [eight-voice Rack Sample](https://wubulon.tailfac9f9.ts.net:4174/rack-sample-eight-voice.html) pages run through that path. The [browser proof](evidence/web-worker-sample-voice.json) checks that a rejected two-parameter batch leaves the voice silent, then loads the 28-node Rack Sample graph with seven bindings to one PCM asset; both graphs sounded on the private null sink after accepted controls and events. See the [voice capture](evidence/web-worker-sample-voice.png) and [Rack capture](evidence/web-worker-rack-sample.png). Capture, live sample replacement, and timed note offsets remain unavailable in Worker mode. The older `execution: 'worklet'` mode still supports its existing prepared route, parameter, sample, and capture behavior; it does not publish structural changes. Cross-origin isolation is required for Worker mode.

Live structural replacement remains limited to `input.raw`, `input.sidechain`, `output`, `gain`, `fixed-gain`, `sum2`, `stereo-widener`, and `distortion`. A replacement containing Sample Region, Phase Vocoder, or another unsupported stateful node is rejected because the two Wasm instances cannot yet transfer its compatible processing history. Initial load of those graphs is supported.

## Reproduce and review

```sh
npm --prefix web test
npm --prefix web run build
npm --prefix web run preview -- --port 4174
python scripts/with-private-null-audio.py node scripts/verify-browser-structural-package.mjs
python scripts/with-private-null-audio.py node scripts/verify-browser-worker-sample.mjs
```

The [live package page](https://wubulon.tailfac9f9.ts.net:4174/package-project.html) serves the production build through Tailscale with COOP/COEP headers. Select DspLiveScripting and use **Insert distortion** while it plays; save/reopen the package, or select FX slot swap and change slot A. `window.manifoldProject` exposes the public controller and host for console or agent edits. The [browser capture](evidence/web-live-structural-package.png) and [machine evidence](evidence/web-live-structural-package.json) come from the automated run through that same Tailscale URL on a verified private null audio sink.

The automated proof inserted and removed distortion (4 → 5 → 4 nodes), downloaded the inserted package, reopened it, rejected an invalid candidate, and selected/reselected FX slot A (10 → 12 → 12 nodes). The latest [machine evidence](evidence/web-live-structural-package.json) records RMS, both instance counters, and Worker timing percentiles; both instances had zero missed output blocks in that short run. These are Worker DSP samples, not callback timings or an old C++ comparison. Browser scheduling and this short run do not establish production deadline safety.

## Remaining gate

- Extend the verified scalar record bridge to compatible voices, loops, captures, and effect tails. Large rings and PCM need an explicit bounded snapshot/delta or shared-resource policy; copying them in the AudioWorklet callback is excluded. The current two-Worker swap starts those unsupported kernels fresh and therefore rejects their live replacement.
- Extend the off-callback path to live sample replacement, capture, timed MIDI offsets, and compatible structural edits involving the prepared primitive catalog. Align control commands with a bounded unified host contract.
- Measure actual AudioWorklet callback p50/p95/p99/max, discontinuities, memory and allocations during preparation, publication, and retirement under several active graphs and longer stress runs. Zero missed blocks in one short run is narrower evidence.
- Replay the same authored structural transaction in standalone native audio, VST3, and CLAP, with save/reopen and state continuity. CLAP and [VST3](native-vst3-project-package.md) have separate packaged controller API proofs; shared real-device/DAW continuity and callback measurements remain open.
