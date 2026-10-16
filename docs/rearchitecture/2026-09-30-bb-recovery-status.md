# Manifold recovery status after the BB restart

30 September 2026. Verified directly from the checkout, retained test logs and
HTTP responses. The complete port remains an active, unfinished goal.

## Available for review now

- [Interactive Rack and Instrument Sample authors](https://wubulon.tailfac9f9.ts.net:4174/native-sample-authoring.html).
  Choose a project, Start, Play, replace PCM, edit Rack topology, save or restart.
- [Native recordings, saved graphs, screenshots and measured source](https://wubulon.tailfac9f9.ts.net:4174/native-samples/2026-09-30-native-samples-v3/).
- [Delivered checkpoint details](native-js-sample-authoring.md).

Both pages returned HTTP 200 during recovery. The independent tmux preview is
still running and serves `web/dist`. These pages represent checkpoint
`sxonzprr` / `3e8bba78`, not the newer plug-in working-copy changes.

## Newer source work that survived

Working-copy change `wnmuzvyt` contains CLAP/VST3 script event and bounded
parameter-batch handoffs, saved controller values, retained intermediate
accepted state and whole-call completion tracking. Event completion is separate
from persistent graph/parameter state. DSP still belongs to the shared core.

The exact public Rack and Instrument authors are now packaged as self-contained
projects. A new shared suite runs their commands through each plug-in's actual
Rust callback and compares the resulting PCM with the native JS library host.
It covers eight Rack gates, unison, wet FFT, twelve topology edits, PCM replacement,
fresh-controller saved-state recall, stop between gate and note, Instrument
offset events and subsequent source publications. Callback heap guards are used.

The interrupted-looking test run actually completed successfully:

- CLAP scripted Sample package comparison: passed.
- VST3 scripted Sample package comparison: passed.
- [Retained focused test log](evidence/2026-09-30-scripted-sample-host-callback-tests.txt).
- [Earlier host regression log](evidence/2026-09-30-scripted-sample-host-regressions.txt):
  36 CLAP tests and 43 VST3 tests passed before the new comparison tests.

These are debug tests invoking the Rust host callbacks. They do not establish
exported release SDK, actual DAW or device callback behavior. The new slice has
not yet passed a fresh complete workspace gate or been published as a live build.

## Next work and remaining scope

1. Finish lifecycle/adversarial coverage, run the workspace gates, and publish
   release plug-in recordings and SDK/DAW evidence for the exact packages.
2. Continue capture/source services, authored Main recovery M2–M5, the legacy
   project inventory and creator workflows, and egui presentation.
3. Extend actual legacy behavior oracles and matched performance coverage.
   [Rack Sample already has a scoped historical C++/Rust/Wasm offline workload comparison](rack-sample-cpp-native-wasm-benchmark.md);
   this is not a complete-product comparison or signal parity proof.

## What is known about BB

The checkout, Jujutsu history, recordings and independent preview survived.
BB currently reports this thread active. Retained logs contain slow database
queries and event-loop stalls, but recovery inspection has not established why
the user-visible BB session crashed. Do not attribute it to a particular build,
agent action or resource condition without further evidence.
