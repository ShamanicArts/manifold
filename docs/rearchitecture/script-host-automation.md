# Accepted host parameters and authored graph edits

Status: implemented scalar parameter synchronization slice, 30 September 2026.
Source change: `uvsskzwl`, parent `ustlsomw` (`f675dd13`).
This does not complete Main, all project behavior, live resources, or the host
performance gate.

## Ownership

The prepared Rust processor remains the sole owner of DSP targets and history.
Authoring sessions adopt its accepted targets before composing another edit.
Synchronization updates the existing session, preserving authored controls,
instance paths, routes, and script-local state. It submits no DSP command and
never recreates the controller.

- JS/TS `LiveGraphSession.adoptPublishedParameters(edits)` validates the complete
  supplied parameter batch on a fork and queues adoption with other edits.
  An optional sixth `readPublishedParameters` adapter makes every queued edit
  adopt the host's accepted targets first. The two packaged controller examples
  expose adoption and `synchronizeParameters()` for explicit snapshot/save reads.
- `BrowserGraphHost.readPublishedParameters()` returns a copy of acknowledged
  targets. Parameter and batch requests update it only after Rust accepts them.
  Host preflight enforces authored endpoint ranges before touching DSP, and
  captures batch arguments so caller mutation cannot change the committed values.
  Worker and direct AudioWorklet modes both support readback; rejection retains
  the last accepted document. Worker mode rejects overlapping structural and
  numeric commands while preparation/publication is pending.
- VST3 and CLAP synchronize their existing `ProjectScriptWorker` from the
  published value bank before calling an authored method. The worker checks
  topology identity and verifies that adoption changed only the supplied
  parameters. A script issuing a host command or changing unrelated state during
  adoption faults this controller. Older controllers without adoption still run
  unchanged; changed host targets require this method before another scripted edit.
- The importable native control/audio pair copies accepted processor targets to
  a prepared atomic readback table after each block. This is a read-only snapshot,
  not another DSP runtime or a separately editable parameter model. The control
  handle reads one coherent block before authoring, after acknowledging an edit,
  and in `save_project()`. The table is prepared and retired with its graph;
  callback writes use no allocation or locking. Control reads have a bounded
  retry count and return `Busy` if a coherent snapshot remains unavailable. `current_project()` remains the
  last authored snapshot; use `save_project()` to refresh it before a file save.
- The Rust authoring session offers `adopt_published_parameters(&processor)`
  when the caller has synchronized exclusive processor access on a control
  thread. Its prepared transactions also use the shared inheritance plan below.

## Automation during graph preparation

`PreparedNativeProject::plan_parameter_inheritance(baseline)` prepares an index
mapping for surviving compatible instances, using stable instance paths and
node kind, with numeric ID fallback for unnamed nodes. It selects parameters
whose candidate target equals the authoring baseline at f32 precision. A changed
candidate target is an explicit script edit and remains candidate-owned.

At publication, `inherit_live_parameters_from(previous)` reads the latest actual
processor targets into those untouched candidate parameters before transferring
eligible Gain/Widener history. It performs no allocation or locking. A source
index must still identify the expected node/local parameter. New nodes and
incompatible types are excluded. VST3 and CLAP also inherit these targets if the
host stops with a structural publication pending; saves and reopen retain them.
An explicit reset to the same baseline value should use a parameter command,
which conveys intent independently of a full graph snapshot.

## Review and evidence

- [Live browser project](https://wubulon.tailfac9f9.ts.net:4174/package-project.html):
  load DspLiveScripting, apply host gain, insert/remove distortion, download and
  reopen. FX slot swap follows the same authoring API.
- [VST3 recordings and editable saved packages](https://wubulon.tailfac9f9.ts.net:4174/vst3-script-package-review.html):
  SDK input gain automation to 0.375 at block 187 / offset 64, then slot A at one
  second, save/reopen a fresh VST3 instance, and slot B. Both graphs retain 0.375.
  Every f32 audio sample agrees with the separate importable native library;
  both maximum errors are zero. That library now observes its own DSP readback
  automatically; the probe does not manually copy VST3 state into it.
- [Raw release VST3 report](evidence/2026-09-30-vst3-host-automation.json)
  includes library, package, and audio hashes. The probe loads the release shared
  library through its exported factory, uses actual SDK automation/state/process
  interfaces, and opens no audio device or editor.
- [Live browser report](evidence/2026-09-30-script-host-automation-browser.json)
  and [capture](evidence/script-host-automation-browser.png): gain 0.375 survives
  insertion; a raw host change to 0.625 bypasses the controller, then survives
  removal, download, reopen, and another insertion. FX selection retains 0.375
  and the other slot's control. The automated VST3 package also reopens and
  continues edits in the browser. Direct-worklet preflight rejects an invalid
  node and a value outside the authored endpoint range before changing DSP or
  its accepted snapshot. The final DSP run records 14 underruns across 380
  blocks; FX records zero across 104. Earlier short runs had zero, so the
  browser timing gate remains open and is the next measured follow-up. Tests run under a verified private null sink.
- SDK unit tests cover a newer target 0.625 finishing during graph preparation,
  publication versus stop, package save/reopen, and continued authoring in both
  CLAP and VST3. This race is modeled deterministically at the previous runtime;
  the offline release probe proves ordinary SDK automation before preparation.
- `native_audio_readback` uses the actual native control/audio pair, automates
  at offsets 64 and 12, edits, saves, and reopens without application parameter
  bookkeeping. A concurrent readback test never merges targets from different
  published blocks. A thread-local allocator probe observes **zero allocations and
  deallocations** for the exercised processing and structural publication blocks.
  This is a bounded fixture proof, not every project's callback performance.
- A shared native behavior test renumbers a surviving Gain by stable path,
  retains a newer automated target, and preserves an explicitly changed Widener
  target. Worker tests retain script-local state and reject illicit adoption.

Verification: all **481 Rust workspace tests** and **53 web tests** pass.
Production web, Linux VST3 and CLAP bundles build. This closes this scalar
state synchronization slice; the timing failures and remaining gates below
keep the complete port goal active.

## Reproduce

```sh
cargo test --workspace
npm --prefix web test
./scripts/build-vst3.sh
cargo build --release -p manifold-vst3 --example probe_packaged_vst3
MANIFOLD_PROBE_AUTOMATED_GAIN=0.375 target/release/examples/probe_packaged_vst3 \
  target/vst3/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so \
  web/public/packages/fx-slot-swap.manifold.json /tmp/manifold-automation-release-fx \
  '{"method":"set","args":["/test/fxslot/slotA/select",1]}' \
  '{"method":"set","args":["/test/fxslot/slotB/select",1]}'
python scripts/with-private-null-audio.py node scripts/verify-script-host-automation.mjs
```

## Remaining gates

1. Synchronize externally accepted route/topology edits with controller lifetime
   and conflict policy. Parameter adoption deliberately requires the same native
   topology. A raw graph import must install/clear the corresponding controller.
2. Generalize transaction intent and multiple-command publication acknowledgements;
   merge authored metadata into native saved state for compact parameter/route
   commands that also change controls. Current tests use structural control
   changes or parameter-only endpoints; they do not establish every control case.
3. Extend continuity to voices, modulation phase, Sample resources, capture/loops,
   delay/reverb tails, and reload. Parameter inheritance does not transfer these
   resources or establish stateful graph replacement correctness.
4. Finish CLAP package identity and stopped parameter/route acknowledgement cases,
   creator-facing package controls, egui, actual DAW editor reopen and device hosts.
5. Measure live compilation/publication latency and callback tails under sustained
   automation, load, and multiple instances against matching legacy C++/Wasm
   workloads. Zero error and the short allocator/browser probes are not this gate.
6. Continue Main and every remaining legacy project through the common public
   graph contract and migration acceptance register.
