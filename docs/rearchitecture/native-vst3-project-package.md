# Packaged project controllers in Graph VST3

30 September 2026. Working change `ustlsomw`, following browser state-transfer
checkpoint `pqvvuzww` (`47474e0a`). This is a host API and signal proof for
DspLiveScripting and its FX slot harness. Main and the full migration remain open.

## Behavior and ownership

Graph VST3 accepts the same digest-checked `.manifold.json` controller and graph
as the browser, native render library, and Graph CLAP. `IComponent::setState`
validates the package and starts one `ProjectScriptWorker` per loaded instance.
QuickJS runs on its dedicated control thread. The existing Rust native project
preparer and VST3 runtime own audio; this adds no product-specific DSP processor.

Parameter and numeric-port route commands use the shared native bounded
mailboxes. Structural commands prepare a graph outside `process`, then use the
existing block-boundary runtime publisher and compatible-history transfer.
The controller receives acceptance only after that publisher or mailbox has
applied the command. Rejection keeps its accepted document. A host stop adopts
an already validated target as next-activation state and completes its pending
controller acknowledgement. A queued parameter's saved host bank carries the
target even if the stop happened before its audio application.

The controller bundle belongs to the same `StateSnapshot` as the graph. A save
during a pending package import retains the old graph **and** its old controller.
An accepted raw graph import clears the controller with the published graph.
`getState` returns the package for packaged projects and plain graph JSON for
plain projects. The VST3 edit controller reads a package's graph for presentation,
and the preset exporter keeps the exact package bytes in the `Comp` chunk.

## Host message contract

These versioned messages use `IConnectionPoint::notify` on a host control thread.
They remain callable with no plug-in editor. They require a host integration;
ordinary DAW controls do not expose arbitrary private VST3 messages.

| Message ID | Binary attributes | Result |
| --- | --- | --- |
| `manifold.graph.import.v1` | `project`: raw graph or complete package JSON | Prepare/import; host saves still follow audio publication. |
| `manifold.graph.script.call.v1` | `call`: UTF-8 JSON `{"method":"set","args":["/dsp/live/input_gain",0.4]}` | On success, `generation`: eight-byte little-endian u64. |
| `manifold.graph.script.status.v1` | `generation`: eight-byte little-endian u64 | `status`: one byte, 0 pending / 1 accepted / 2 rejected. Accepted replies include `project`: the saved package. |

Call payloads are bounded to 4,096 bytes and method names to 128 bytes. One
script command is in flight per instance. A package whose initial graph has not
published rejects controls until ready. Parameter and route calls currently
require an active prepared audio runtime; structural edits can also update an
inactive graph. These are control operations at block boundaries, not timed MIDI
or sample-offset host automation.

## Evidence

The dynamic probe loads `target/vst3/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so`
through its exported VST3 factory. It creates Graph processor instances and an
edit controller through the factory, loads packages with VST3 streams, invokes
the message interface, renders `IAudioProcessor` blocks, and saves and reopens a
fresh instance. It opens no GUI or audio device. Native comparison runs the same
package and script action through the importable native control/audio pair.

| Case, 48 kHz / 128 frames | Observed result |
| --- | --- |
| FX slot A, then reopen and slot B | 10 → 12 → 14 graph nodes; acknowledgements after one processed block; before-publication saves unchanged. |
| DspLiveScripting gain 0.4, then reopen and route output from input trim | Saved target and numeric-port route restored; both actions acknowledged after one processed block. |
| All four two-second VST3 renders | Maximum absolute VST3/native f32 sample error **0**. |
| VST3-saved FX package reopened in browser | 14 nodes; changed slot A while preserving slot B; 10 compatible histories transferred in the observed browser edit. |
| VST3-saved DSP package reopened in browser | Gain 0.4 and output route restored; inserted distortion while running, 4 → 5 nodes. |

[FX raw host results](evidence/2026-09-30-vst3-package-fx.json),
[DSP raw host results](evidence/2026-09-30-vst3-package-dsp.json), and
[browser readback](evidence/2026-09-30-vst3-package-browser.json) retain artifact
and package hashes, rendered audio hashes, graph counts, values and publication
observations. The browser ran against a verified private null sink, through the
production [Tailscale review](https://wubulon.tailfac9f9.ts.net:4174/vst3-script-package-review.html).
The [package browser capture](evidence/vst3-saved-package-browser.png) and
[audio review capture](evidence/vst3-script-package-review.png) are retained.
Review clips change the graph at one second and play only on user request.

`cargo test --workspace` passed, including all 41 VST3 tests; all 52 web tests
passed; the production web and Linux VST3 bundle builds passed. Tests additionally
cover package identity before/after publication, controller state acceptance,
digest rejection, raw-graph replacement, and a pending parameter/route at host
deactivation.

## Reproduce

```sh
./scripts/build-vst3.sh
cargo run --release -p manifold-vst3 --example probe_packaged_vst3 -- \
  target/vst3/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so \
  web/public/packages/fx-slot-swap.manifold.json /tmp/manifold-vst3-package-fx \
  '{"method":"set","args":["/test/fxslot/slotA/select",1]}' \
  '{"method":"set","args":["/test/fxslot/slotB/select",1]}'
target/release/examples/probe_packaged_vst3 \
  target/vst3/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so \
  web/public/packages/dsp-live-scripting.manifold.json /tmp/manifold-vst3-package-dsp \
  '{"method":"set","args":["/dsp/live/input_gain",0.4]}' \
  '{"method":"routeOutput","args":["/dsp/live/nodes/input_trim"]}'
python scripts/with-private-null-audio.py node scripts/verify-vst3-package-browser.mjs
```

The checked-in browser fixtures are copies of the VST3 saves under
`web/public/vst3-package-proof`. New probe runs write a fresh output directory;
copy their packages, reports, and WAVs there and rebuild the web to update review.

## Remaining work

- Give native project creators package import, script action and error surfaces
  through the shared model, then replay the same controls in a real DAW with
  editor close/reopen. The current Graph editor presents packaged component state,
  but its JSON import and ordinary widgets do not run arbitrary project methods.
- External scalar host automation is now synchronized through the existing
  controller, with latest unchanged targets inherited at structural publication
  and stop; see [mixed host/script proof](script-host-automation.md). Accepted
  external topology changes and complete compact-command author metadata remain open.
- Align CLAP package identity and stop acknowledgement with the same lifecycle
  cases. Its existing package tests do not cover all these VST3 stop/import cases.
- Add stateful/resource-bearing script projects, inactive parameter/route authoring,
  reload policy and resource/capability declarations to the portable package contract.
- Measure real callback tails, allocation, live-edit latency and continuity under
  load and multiple instances. Offline sample agreement does not prove deadlines.
- Continue Main through the public graph contract, egui creator surfaces, and
  every remaining legacy project in the recovery register.
