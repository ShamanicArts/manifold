# Browser graph publication and deadline evidence

Status: exact-block publication fixed; Worker scheduling gate remains open. 30 September 2026.

Later correction: the [Worker ownership investigation](browser-worker-ownership.md) proved that old Workers continued writing reused slots in this measured build. The recordings below remain captured data, but cannot prove which graph version produced the output. The exact-tag guard is retained, now with exclusive producer lifetime. Use the new investigation for current recordings, ownership proofs and the remaining recorded miss.

Source change: `xrvlqwnl`, parent `uvsskzwl` (`1196df28`). Web tests: 56 passed; production build and live package reimport probes passed. No Rust DSP code changed in this slice.

## Fault and change

The browser host previously accepted a prepared candidate when its processing cursor reached the warmup target. The AudioWorklet then switched to that candidate without checking the output block it was about to play. Restoring recent history can start a candidate after that required block, and a main-thread readiness observation can become stale before the callback. A candidate with newer output could therefore replace an old graph with valid output and play zeros.

`shared-graph-processor.js` now calculates the next audible sequence before publication and checks the candidate's **exact output tag and frame count**. An unready candidate leaves the old slot active and the publication request pending. A ready candidate is claimed and acknowledged at that boundary. The control thread also warms against the exact output tag. The fixed four-block output latency is unchanged.

The first two cases in [worker-publication.test.js](../../web/tests/worker-publication.test.js) failed against the previous processor: both played zeros where the old graph had valid audio. They pass with the guard. The third case checks late-Worker versus missing-output diagnosis and fixed trace wraparound. This proves the publication fault; it does not establish that all 14 missed blocks in the [previous browser report](evidence/2026-09-30-script-host-automation-browser.json) had that cause.

The callback writes bounded integer counters and a 64-row shared trace. No graph preparation, logging, messages, new views or objects were added to `process`. Each miss records audio sequence, target, slot, observed output tag, Worker progress, pending publication and reason. `BrowserGraphHost.diagnostics` decodes the trace on the control thread. The trace may overwrite older rows; counters retain totals. Classifications reflect the values sampled at the miss, not a scheduler or GC root-cause attribution. `maxRenderLagBlocks` includes initial startup, and startup mute blocks are exposed separately from post-start underruns.

## Live, importable review

Open the [runtime graph review](https://wubulon.tailfac9f9.ts.net:4174/graph-runtime-review.html). It uses only public `@manifold/author/browser` and `@manifold/author/package` imports. The caller owns the AudioContext, source, recorder and presentation. `window.manifoldRuntimeReview.run()` also provides the bounded recipe to a console or agent. No project DSP was added to the page.

Each run loads the shipped DspLiveScripting or FX slot package and a second independent, unchanged graph. A quiet 220 Hz source feeds both. After a one-second warmup, the edited graph accepts host gain 0.375. Its package controller makes 24 edits with a 100 ms pause between edits and 12 ms of bounded main-thread work per edit. DspLiveScripting inserts/removes distortion (4 ↔ 5 nodes). FX alternates both authored slots; inactive Width instances remain part of the historical controller's graph (10 → 12 → 14 nodes). Every edit must preserve the accepted gain. The final graph and controller are downloadable as the same portable package.

A setup-allocated, 45-second shared tape records **only the edited graph**, so the second graph cannot conceal gaps in that recording. A separate recorder worklet copies samples into the bounded tape. The exports are stereo float32 WAV at 48 kHz. All-zero runs of at least 128 frames are measured after recording; this detects whole-block silence in this continuously sounding fixture, but does not measure clicks, exact expected samples, or effect tails. The second graph has deadline counters but was not recorded in this run. Players use manual playback, with only one player active.

## Retained measured result

Chromium 152.0.7977.82, production build through Tailscale, verified disposable PipeWire null sink. [Raw summary and source hashes](evidence/2026-09-30-runtime-graph-review.json), [DSP capture](evidence/runtime-graph-dsp-live-scripting.png), [FX capture](evidence/runtime-graph-fx-slot-swap.png), [retained review capture](evidence/runtime-graph-retained-review.png).

| Edited package | Recording | Edited / second misses during recording interval | Script edit p50 / p95 / max |
| --- | --- | --- | --- |
| DspLiveScripting | 4.117 s, 1,544 blocks | 0 / 0 | 38.3 / 49.3 / 52.3 ms |
| FX slot swap | 4.427 s, 1,660 blocks | 0 / **12** | 48.0 / 78.9 / 99.5 ms |

Both edited graphs acknowledged all 24 publications. Neither exported recording contains an all-zero run of 128 frames or more. The unchanged second DSP graph in the FX run missed 12 blocks: eight at sequences 1117–1124 and four at 1141–1144. Its Worker progress remained 1112 and 1136 respectively; every trace row has `pendingPublication: 0` and reason `worker-late`. These are real remaining deadline failures. The evidence does not identify whether wakeup scheduling, rendering bursts, process contention or another cause stalled that Worker. Its audio is not part of the exported FX WAV.

Individual edit reports include preparation, host replacement, Worker Wasm timings, node counts and miss traces. **Host replacement time includes Worker launch, preparation, warmup and acknowledgement**; total script latency also includes orchestration and the caller workload. Neither measures callback switch duration. Worker profile percentiles cover the active Worker's Wasm processing call only, exclude copying/scheduling, and reset on each candidate. The last active profiles were 15 µs p95 for DSP and 40 µs for FX; the short per-edit windows are not sustained callback distributions. There is no matched historical C++ benchmark here.

The source hashes in the measured summary identify the recipe at measurement time. The [exact measured harness](../../web/public/runtime-graph-proof/measured-source/graph-runtime-review.js) is retained because later display changes put both miss counts together, clarify timing labels and add the captured recordings. The DSP Worker and publication guard were unchanged after the measurement. The [deliverable probe](evidence/2026-09-30-runtime-review-deliverables.json) checks retained WAV metadata without autoplay and reimports both final packages into a fresh browser host, matching the complete saved graph and gain 0.375.

## Reproduce

```sh
npm --prefix web test
npm --prefix web run build
# Preview must reload after changes to Vite isolation headers.
npm --prefix web run preview -- --port 4174
# Use a fresh label: the probe refuses to overwrite an existing summary.
MANIFOLD_RUNTIME_PROOF_LABEL=your-fresh-run-label \
  python scripts/with-private-null-audio.py node scripts/verify-browser-runtime-review.mjs
python scripts/with-private-null-audio.py node scripts/verify-runtime-review-deliverables.mjs
```

The recorded files are also served at `/runtime-graph-proof/`; the live review offers both original recordings and raw reports without requiring another playback run.

## Next gates

1. Reproduce and measure the unchanged Worker's misses with callback cadence, Worker service timing and independent recordings of both instances. Keep failed runs. Do not increase latency merely to hide this result.
2. Measure callback p50/p95/p99/max, longer multi-instance operation, publication/retirement costs and discontinuities. Small Wasm DSP times alone do not establish timely Worker wakeup.
3. Extend bounded state continuity to authored voices, loops, captures and effect tails, then run the same authored edits in native device, VST3 and CLAP hosts.
4. Continue the [Main recovery ledger](main-recovery-ledger.md) and full legacy inventory through the shared authoring contract. This browser publication slice closes neither Main M1–M5 nor the complete port.
