# Browser DSP Worker ownership and remaining deadlines

30 September 2026. Source change `wplztvuu`, parent `xrvlqwnl` (`f05d35bd`). Worker retirement is fixed and verified; the full deadline and port gates remain open.

## Confirmed fault

The previous adapter called `Worker.terminate()` after publication, then immediately reused that Worker's slot on the next edit. In the installed Chromium 152.0.7977.82, Workers inside the synchronous Wasm/`Atomics.wait` render loop continued executing. The [before probe](evidence/2026-09-30-worker-retirement-before.json) found 2, 3, 4 and 5 live DSP Worker targets after four edits, and all five remained after host close. During the final observation window the audio sequence advanced 284 blocks, but the active slot's processing count advanced 852. Multiple obsolete graph versions were writing the same shared output, command and history tables.

This invalidates using the earlier browser recordings/profiles as proof that audio followed the accepted graph. Their samples and miss counters remain actual captured data, but output/version ownership was not guaranteed. The [earlier publication report](browser-publication-deadlines.md), its 14/12-miss predecessors and all raw files remain retained. The exact-tag publication guard is still necessary; its meaning now rests on exclusive slot ownership.

The initial cadence probe exposed the inflated processing count and then failed to complete the FX run. Its [log](evidence/2026-09-30-cadence-probe-incomplete.txt) and partial DSP capture at `/runtime-graph-proof/2026-09-30-cadence-profile-on/` are retained. The timeout log did not capture the FX page's underlying error, so it does not prove the specific cause of that timeout.

## Lifetime protocol

The internal shared transport now has a desired generation and a finished generation for each slot. A Worker checks its generation before rendering each block. After publication the host clears the old Worker's desired generation and wakes it. The Worker finishes its current block, leaves its loop, acknowledges **after its final shared audio/history/timing write**, and closes itself. The host waits for that acknowledgement before clearing or reusing the slot. A finite 25 ms idle wait covers a stop notification racing the wait call.

The acknowledgement wait is bounded on the control thread. If a Worker does not finish within two seconds, its slot remains quarantined; the accepted graph keeps playing, and a subsequent edit must observe retirement before reusing the slot. `diagnostics.pendingRetirements` exposes this condition. Host close signals all owned Workers, including candidates and quarantined workers, before releasing their handles. Forced termination is cleanup in addition to the cooperative protocol. No stop wait, graph preparation or new allocation was added to the AudioWorklet callback. Rust DSP code and the portable project/package schemas are unchanged.

The [after probe](evidence/2026-09-30-worker-retirement-after.json) found one Worker after every edit, one processing call per advanced audio block, and zero Workers after close. Its cold/preparation workload differs from the earlier observation window, so it is a lifetime/ownership comparison, not a matched speed benchmark.

## Audible ownership regression

[verify-browser-worker-ownership.mjs](../../scripts/verify-browser-worker-ownership.mjs) deliberately replaces the browser's `Worker.terminate()` method with a no-op. It drives the public `BrowserGraphHost` through eight different authored graphs using ordinary Input, Gain, Fixed Gain and Output primitives. A constant source makes stale output versions distinguishable. Every settled mean matches its new graph's expected gain within 1e-4; the maximum sample spread is below 1e-4. The surviving Gain retains its smoothing history. After draining the input queue, **288 audio blocks correspond to exactly 288 DSP calls**. Each edit leaves one Worker, and close leaves none despite nine withheld forced termination calls. See [raw signal and lifetime evidence](evidence/2026-09-30-worker-owned-audio.json).

This checks actual Wasm signal behavior and real browser Worker lifetime. It is an analytic Gain fixture, not a legacy C++ project comparison.

## Live review and measured results

The [runtime review](https://wubulon.tailfac9f9.ts.net:4174/graph-runtime-review.html) now records **both graphs separately**, exposes both recordings and their cadence, exports the current package, and shows retained successful and failed timing results. Earlier captures are labelled with the ownership fault. All listening is manual and only one player can run at a time.

The fixed recipe remains 48 kHz / 128 frames, four-block bridge latency, two active graph instances, one-second warmup, host gain 0.375, 24 authored edits, 100 ms between edits, 12 ms caller work per edit, and 750 ms final observation. Two runs use optional Worker service profiling; two repeat with it disabled. Each run was executed once on a verified private PipeWire null sink. All 96 edits published and preserved gain 0.375; all runs had zero pending retirements and zero Worker targets after close.

| Edited project | Service profiling | Recorded blocks per instance | Edited / second misses | Script latency p95 / max |
| --- | --- | ---: | ---: | ---: |
| DspLiveScripting | on | 1,624 | 0 / 0 | 51.4 / 51.9 ms |
| FX slot swap | on | 1,628 | 0 / 0 | 50.6 / 51.2 ms |
| DspLiveScripting | off | 1,632 | 0 / 0 | 52.0 / 55.8 ms |
| FX slot swap | off | 1,748 | 0 / **1** | 91.6 / 111.7 ms |

Raw [profiling-on summary](evidence/2026-09-30-retired-owned-workers.json) and [profiling-off summary](evidence/2026-09-30-retired-profiling-off.json) include source/Wasm hashes and links to reports, float32 WAVs and saved packages. These are four short measurements with different process/scheduling conditions. They do not isolate profiler overhead or establish a sustained production bound.

### Remaining miss is recorded

The profiling-off FX run's unchanged DSP graph missed exactly one block. Its trace reports audio sequence 1540, target 1536, completed Worker sequence 1535, `pendingPublication: 0`, and context frame **203136**. The independently recorded second graph contains exactly 128 all-zero frames at that same context frame (recording offset 147840). The [zoomed waveform](../../web/public/runtime-graph-proof/2026-09-30-retired-profiling-off/fx-secondary-gap.svg) exposes the 2.667 ms gap. Retirement is fixed; deadline reliability is not complete. Do not discard this failure or claim that the earlier 12 misses are all explained by retirement.

### Timing scope

`BrowserGraphHost(context, { execution: 'worker', profiling: true })` adds `workerProfile.service`: loop service wall time through output/progress publication, including commands, input/output copies, DSP and live history export, excluding idle waiting. It is disabled by default and is not AudioWorklet callback timing. Profiling table writes follow the measured interval. On the profiling-on runs the final active Worker service p95/max were 35/295 µs (DSP) and 40/250 µs (FX); the last candidate had 328 measured blocks. Unchanged second Workers retained their longer sample windows. Processing samples are rounded integer microseconds and inherit the browser clock's resolution; a zero sample is not proof of zero CPU cost.

An actual AudioWorklet capability probe found `performance` unavailable and `Date.now` available. The recorders therefore capture integer-millisecond cadence and copy durations without explicit callback array/object construction. This is not a JavaScript allocation measurement. The measured renderer batches four 128-frame callbacks within a millisecond, separated by roughly 10–11 ms; the profiling-off FX run's largest gap was 15 ms. The context reports 10.667 ms base latency. This does **not** measure callback p50/p95/p99/max in microseconds or identify scheduler/GC/CPU root cause. Miss traces now include the context frame for exact PCM alignment; the fixed trace retains only its latest 64 rows.

The [deliverable probe](evidence/2026-09-30-worker-owned-deliverables.json) loaded all eight retained WAVs without autoplay and reopened all four saved packages in fresh browser hosts. Complete graphs match their saves (4-node DSP, 14-node FX) and all retain gain 0.375. The [current page capture](evidence/worker-owned-retained-review.png) includes the recordings, raw reports, packages and waveform gap for human review.

## Reproduce

```sh
npm --prefix web test
npm --prefix web run build
python scripts/with-private-null-audio.py node scripts/verify-browser-worker-ownership.mjs
MANIFOLD_RUNTIME_PROOF_LABEL=your-fresh-profile-on \
  python scripts/with-private-null-audio.py node scripts/verify-browser-runtime-review.mjs
MANIFOLD_RUNTIME_PROOF_LABEL=your-fresh-profile-off MANIFOLD_RUNTIME_PROFILING=0 \
  python scripts/with-private-null-audio.py node scripts/verify-browser-runtime-review.mjs
python scripts/with-private-null-audio.py node scripts/verify-runtime-review-deliverables.mjs
```

The probe rejects a nonempty destination, including incomplete runs. Current retained summaries have immutable labels; a new run gets a new label. The page fetches the named retained jobs and lets the user run a new review independently. Web tests: 56 passed; production build and all browser probes above passed. No Rust DSP change required a new Rust workspace test run in this slice.

## Still required for the objective

- Resolve sustained browser deadline reliability with exclusive ownership established. Capture Worker service/wakeup timing around the actual miss and evaluate a prepared runtime rendered on the audio thread if the asynchronous Worker path cannot meet the required deadline. Graph compilation and resource preparation must remain outside the callback; increasing latency to hide this result is not completion.
- Cover idle/suspended authoring, scalar automation during preparation, and failure/cancellation/quarantine recovery as explicit host contract behavior.
- Extend state/resource continuity beyond Gain/Widener to held voices, loops, captures and effect tails; then replay authored behavior through native device, VST3 and CLAP hosts.
- Continue the complete legacy inventory and Main M1–M5 through the shared graph contract, egui-first presentation and inspectable author modules. Match complete C++ projects against native Rust and browser Wasm for behavior, state and performance. These gates remain open.
