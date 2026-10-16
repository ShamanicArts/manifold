# Native owned loop publication

30 September 2026, change `tuyprmmv`, parent `wywppltq` (`a02c2812`).

The task was to carry the existing core's audio-owned loop resources through
native Rust, native JavaScript, CLAP and VST3 graph publication. Project scripts
still compose the graph; the shared Rust core remains the sole DSP owner.
This advances reusable M1/M3 infrastructure. Main M2 and the complete port remain open.

## Review the actual deliverables

- [Live four-layer browser graph editor](https://wubulon.tailfac9f9.ts.net:4174/prepared-loops.html).
  Load the recorded project, start, edit an insert or the layer controls, then save.
- [Native audio proof page](https://wubulon.tailfac9f9.ts.net:4174/native-loop-publication/2026-09-30-native-owned-loops-final/).
  Manual players expose edited/reference recordings for each host, saved PCM and
  source/command hashes. Only one player runs at a time. No autoplay.
- [Native review screenshot](evidence/2026-09-30-native-loop-review.png) and
  [served-file/player verification](evidence/2026-09-30-native-loop-review.json)
  check all 21 measured source hashes, all 12 artifacts and actual manual playback.
- [Browser build screenshot and verification](evidence/2026-09-30-native-loop-browser-deliverables.json),
  [screenshot](evidence/2026-09-30-native-loop-browser-deliverables.png).
- The Linux release bundles are `target/clap/ManifoldFX.clap` and
  `target/vst3/ManifoldFX.vst3`. Building them does not establish actual DAW/device
  equivalence for this new resource protocol; that verification remains open.
  [Current release binary hashes](evidence/2026-09-30-native-loop-release-builds.json).

## Shared resource protocol

`PreparedNativeProject.plan_parameter_inheritance` prepares compatible loop
identity and resource intent off the audio thread. Named instance path plus kind
matches across numeric renumbering; unnamed nodes use ID. Compatible storage
requires the same constructor capacity in prepared frames and the same authored
asset presence, rate, frame count and canonical PCM. Asset labels/IDs do not define
audio identity. An explicitly changed clip or capacity keeps its candidate
controls: late old recording/overdub must not erase the new asset.

At publication, `live_history_ready_from` refuses to move storage while compatible
capture staging owns it. The host keeps processing the old runtime and retains
the candidate for retry. CLAP/VST3 return a claimed candidate only if control has
not installed a newer one; superseded candidates go to existing bounded retirement
storage. This keeps disposal off the callback.

`adopt_live_replacement_from` reads inherited controls from the old core's actual
targets, swaps the whole existing LoopCapture storage through the core transfer
operation, refreshes parameter readback, and adopts eligible scalar/voice history.
Transferred loops skip generic inheritance so it cannot read their now-swapped
old kernel. Recording, playback, overdub, cursors and smoothing move together.
The legacy retrospective-only fallback is suppressed when an authored transfer
table already owns the mapping. No PCM copy, allocation, free, compilation or JS
execution was added to processing.

CLAP, VST3, Rust `LiveGraphSession` and `NativeScriptAudio` now use this operation.
Rust transactions return `CaptureBusy` with their still-owned candidate for retry.
After processing has stopped, plug-in deactivation cancels staging, adopts any
accepted pending graph, stops recording/overdub and saves actual PCM before
releasing its old owner. Generation checks prevent attaching that state to a
different later edit.

Loading a loop asset now reapplies all declared controls after loading PCM,
including overdub. Native readback captures side effects such as recording
disabling play/overdub and an empty loop refusing play. Normal Wasm direct/Worker
loaders follow the same restoration rule. This does **not** establish RAM-take
continuity through default browser structural replacement; the prepared browser
owner path is the verified continuity implementation.

## Actual public author module on native JavaScript

`@manifold/author/examples/loop-authoring` is the same public four-layer composition
used by the browser. Its controller supports individual native host controls;
batch/readback hooks are optional capabilities. Top-level record/play/overdub/
speed/reverse and `restoreProject` expose it to the native module host. The
checked `loop-authoring-project.bundle.js` is generated from this module.

The portable PCM codec now also works in QuickJS without DOM `atob`, `btoa` or
`TextEncoder`: strict base64 fallback, UTF-8 label counting, canonical payload
validation and fresh decode buffers retain the existing contract. Browser built-ins
remain the fast path. The bounded validation cache policy is unchanged. Its older
23.55 ms profile describes the prior checkpoint; this turn does not claim a new
performance result for the codec changes.

`NativeScriptControl.save_project()` now explicitly returns `LoopSnapshotRequired`
for graphs containing ordinary loops. Parameter-only serialization cannot save a
live audio-owned take. `NativeScriptAudio.stop_and_snapshot()` is an allocating
control-thread operation **after processing has stopped and the audio handle has
returned to control**. It adopts accepted pending edits and saves actual graph/PCM;
control still polls the command acknowledgement. It does not serialize JS local
state. Native JS asynchronous snapshots while audio plays remain open; browser
`project.snapshot()` already has a separate verified stable-take service.

## Signal and lifecycle proofs

| Path | Actual test workload | Retained exact stereo frames |
| --- | --- | ---: |
| CLAP | Actual `clap_plugin.process` ABI entry; record, staging defer/cancel, named renumber, racing speed/reverse, explicit mix, overdub, stop with pending edit, save/reopen | 57,344 |
| VST3 | Actual `GraphProcessor.process` entry with the same one-loop workload | 57,344 |
| Native JS | Actual public four-layer module in QuickJS; record, transparent insert/remove, speed/reverse, overdub, pending insert at stop, PCM snapshot, fresh module restore and another edit | 57,472 |

Each path matches its own untouched Rust reference in every recorded sample.
Every measured callback asserts zero allocator calls and zero deallocations via
the counting allocator. Native JS and plug-in cases use different graphs; this is
not a matched cross-host performance comparison. Plug-in controls are applied
between blocks, not through real DAW automation queues. Tests use debug binaries,
real callback entry points and no audio device. This is not legacy C++ parity or
hardware jitter evidence.

Four additional direct/Rust-author tests probe exact resource transfer, explicit
PCM/control replacement, empty-loop readback, active/ready staging cancellation,
transaction rejection/retry and zero callback heap work. The normal Wasm test
checks all four successive overdub passes on an authored 32-frame clip.

The [browser resource-intent race](evidence/2026-09-30-prepared-loop-resource-intent.json)
records **134,656 identical stereo frames** and four exact 49,152-frame takes.
A real recording command arrives on the old owner while an explicit 32-frame
replacement prepares; the new take survives and record remains off. The rejected
oversized candidate and fresh four-take reopen still pass. Its thirteen source/Wasm
files retain recording-time hashes; its capsule precedes the later portable codec
and native-compatible controller changes. The run overlapped release compilation,
so its longer paced recording and timing outliers are retained, not a benchmark.

The final current browser build loads all four older 20,992-frame review takes,
edits twice, saves exact PCM, rejects a snapshot interrupted by actual overdub,
plays both review WAVs through the UI, and closes without Workers or page errors.
All automated browser audio goes to the verified disposable private null sink.

Final checks: **492 Rust tests**, **65 web tests**, strict TypeScript, generated
catalog/project package reproducibility, production web and Linux native release
builds. Two earlier test setup failures exposed unsupported constructor overrides;
the fixture uses the actual 30-second retrospective default. A new overdub test
initially expected write-before-read; the core reads the old sample first. The
corrected test checks every pass. Full web checks exposed a stale distributed
AudioWorklet copy; the package now carries the current adapter.
The [workspace log](evidence/2026-09-30-native-loop-workspace-tests.log),
[web/TS/package log](evidence/2026-09-30-native-loop-web-tests.log) and
[release log](evidence/2026-09-30-native-loop-release.log) are retained.

The final native evidence directory preserves the actual source files, toolchain,
test logs, hashes, WAVs, saved states and explicit scope. Earlier exports are kept
as historical artifacts.

```sh
python scripts/verify-native-loop-publication.py YOUR-NEW-LABEL
MANIFOLD_LOOP_DELIVERABLE_LABEL=your-new-browser-review \
  python scripts/with-private-null-audio.py node scripts/verify-prepared-loop-deliverables.mjs
python scripts/with-private-null-audio.py node scripts/verify-native-loop-review.mjs
```

## Remaining work in order

1. Define and expose bounded constructor configuration in the shared graph
   contract. Native currently rejects noncatalog constructor arguments except
   the historical FixedGain override. Capture capacity needs a public resource
   budget, not a host-specific workaround.
2. Import portable assets through Rust `GraphWorkspace` (currently rejects even
   `assets: []`); extend prepared resource publication to Sample Region,
   Sample Instrument, vocoder/directional/capture-window paths. Retain live
   Sample voices and capture resources under explicit compatible intent.
3. Exercise public project packages and new loop publication in exported
   plug-in binaries and actual DAW/native audio lifecycles, including controller
   synchronization, fixed host parameter IDs, staging save service and racing
   accepted edits. Add native JS snapshots while playback continues.
4. Recover Main's quantized transport, complete voice/capture/looper composition
   as authored reusable graphs and project script behavior. No second Main DSP
   path is permitted. Extend actual legacy project oracles beyond the existing
   earlier Lua MIDI comparison.
5. Prove failure recovery, coalescing/retirement concurrency, resource churn,
   long runs and constructor/payload budgets. Measure matched C++/Rust/Wasm
   workloads and real callback/compilation costs separately.
6. Continue egui-first presentation, creator controls and complete legacy
   inventory gates. The live browser UI is still the existing presentation.

None of these gates is waived by the signal matches above.
