# Project package v1: one authored controller and graph

Status: implemented vertical slice, 29 September 2026. The package format remains versioned and experimental. It carries the same JavaScript controller bundle and saved graph to the browser and native renderer. DspLiveScripting and its FX slot harness are the first packaged behaviors.

## Contract

A `.manifold.json` file contains `format: "manifold.package"`, `schemaVersion: 1`, a package ID and version, a JavaScript IIFE controller with a SHA-256 digest, and one `manifold.project` state document. The controller exports `restoreProject(host, savedDocument)` and `createProject(host)`; the former reconstructs orchestration from the graph that audio opens. The bundle is self-contained after `scripts/build-js-project.mjs` compiles the author's module. Package readers validate the format, graph, size, and controller digest before running code. The browser wraps the IIFE as a Blob ES module; native QuickJS evaluates that same bundle on the control thread. The audio kernels remain in Rust and Wasm.

Controller construction restores state without sending host commands. Live host edits begin after the prepared graph is active; the native loader rejects a controller that submits a command during construction.

The distributable examples are [DspLiveScripting](../../web/public/packages/dsp-live-scripting.manifold.json) and [FX slot swap](../../web/public/packages/fx-slot-swap.manifold.json). The public browser entrypoint is `@manifold/author/package`; the native entrypoint is `manifold_project_js::package::ProjectPackage`. `scripts/check-project-packages.sh` checks that the checked-in bundles and packages exactly match their authored sources and graph fixtures.

## Reproduce

```sh
node scripts/build-js-project.mjs packages/manifold-author/examples/dsp-live-scripting.mjs projects/graph-workspace/dsp-live-project.bundle.js
node scripts/build-project-package.mjs manifold.dsp-live-scripting 0.1.0 projects/graph-workspace/dsp-live-project.bundle.js projects/graph-workspace/authored-dsp-live-scripting.json web/public/packages/dsp-live-scripting.manifold.json
cargo run -q -p manifold-project-js --example native_script -- web/public/packages/dsp-live-scripting.manifold.json /dsp/live/input_gain 0.4 /tmp/manifold-dsp-saved.manifold.json
cargo run -q -p manifold-project-js --example native_script -- web/public/packages/fx-slot-swap.manifold.json /test/fxslot/slotA/select 1 /tmp/manifold-fx-saved.manifold.json
cargo run -q -p manifold-project-js --example native_script -- web/public/packages/fx-slot-swap.manifold.json /test/fxslot/slotB/select 1 /tmp/manifold-fx-two.manifold.json /tmp/manifold-fx-saved.manifold.json
python scripts/with-private-null-audio.py node scripts/verify-project-package-browser.mjs
```

The native example rendered deterministic 48 kHz/128-frame stereo input. DspLiveScripting gain 0.4 changed settled left-channel absolute block energy from 12.7305 to 5.0932. The FX package selected slot A and, after package reopen, slot B: 10 → 12 → 14 graph nodes, with 13.1274 → 21.8368 → 38.5226 settled block energy. The native package tests verify that restored JS logic and native audio use the same accepted graph and that modified controller bytes fail hash validation.

The [current browser review page](https://wubulon.tailfac9f9.ts.net:4174/package-project.html) loads these same files and now publishes stateless topology edits through a dedicated Wasm Worker and a shared audio bridge. A headless Chromium run on a verified private null sink inserted and removed DspLiveScripting distortion, saved and reopened the package, and changed FX slot A while audio ran. See the [structural publication proof](browser-structural-publication.md), [capture](evidence/web-live-structural-package.png), and [machine evidence](evidence/web-live-structural-package.json). The earlier browser/native package interchange remains in the [previous capture](evidence/web-packaged-dsp-live.png) and [previous machine evidence](evidence/web-project-package-browser.json).

The Graph CLAP class now loads the same package through `CLAP_EXT_STATE`, starts one dedicated JS control worker per instance, and exposes the project methods through [`manifold.project.script.v1`](../../crates/manifold-clap/include/manifold_project_script.h). Parameter and route commands use bounded control-to-audio mailboxes; structural graph changes prepare a replacement off the callback. Each command is acknowledged only after the CLAP audio block publishes it, and `CLAP_EXT_STATE.save` wraps the published graph with the same controller bundle. `call_json` can invoke an authored method such as `routeOutput`, so a host integration can use the script with its editor closed. The two CLAP integration tests in `crates/manifold-clap/src/graph.rs` load the actual packages through the CLAP state ABI, render audio, edit parameter/route and FX topology, save before and after publication, and reopen the saved packages. `cargo test -p manifold-clap` passes all 34 tests. This is an adapter/API proof; the Graph editor and ordinary DAW controls do not yet provide an import and script-action UI for packaged projects.

The [Graph VST3 package proof](native-vst3-project-package.md) now loads the same package through VST3 state, runs the controller with no editor, and dispatches parameter, route and structural edits through the native publisher. Its exported-factory probe renders both actual packages, saves and reopens their controllers, and reports exact f32 agreement with native rendering for these cases. The [live review](https://wubulon.tailfac9f9.ts.net:4174/vst3-script-package-review.html) includes audio traces and VST3 saves that can be opened and edited in the browser. Package identity is attached to the published VST3 graph snapshot, including saves during import and deactivation.

## Remaining host and product gates

- This v1 package carries JS project logic and graph state. Native Rust project module artifacts, view modules, exact dependency locks, declared capabilities, external resources, and script reload policy need their own versioned contract. Embedded graph assets use the current `manifold.project` schema; resource-bearing authored scripts are not yet supported by the native QuickJS compatibility shim.
- CLAP and VST3 have working package/script host interfaces. They still need product-facing import and script controls, real DAW use, external automation/controller synchronization, and measured control latency. Align CLAP with the VST3 package snapshot and pending-command stop cases; a standalone native device adapter also remains open.
- The browser now publishes a stateless structural subset off callback; stateful continuity, resource preparation, the full primitive set, and callback performance evidence remain open.
- Main, Rack/Patch, egui presentation, all other legacy project behaviors, and matched callback performance remain open. The C++/native/Wasm Rack Sample comparison is a separate single-workload proof.
