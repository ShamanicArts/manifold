# Native JavaScript project control runtime

Status: first editor-independent native execution slice, 29 September 2026. Change `vyrynxtx` builds on the authored browser loop checkpoint `wytrmumz` (`55c8e5bd`). This proves two historical DspLiveScripting behaviors through the public JS graph authoring API. It does not complete the portable project package or all legacy projects.

## What runs

The [native JS Sample follow-up](native-js-sample-authoring.md) adds bounded
parameter batches and timed events to the native library handoff, with the actual
public Rack Sample controller, Instrument PCM continuity and a browser review
using the same project entries. CLAP/VST3 script event/batch dispatch remains open.

`scripts/build-js-project.mjs` bundles an `@manifold/author` entry into an IIFE. `manifold-project-js` loads that bundle into one isolated QuickJS context per project instance on a control thread. The JS module creates the same versioned project document consumed by `manifold-native`; the script remains usable without an editor, DOM, or Node runtime. The native host adapter receives typed commands for parameter changes, route changes, and full graph replacement. It validates a replacement before publishing it, then acknowledges or rejects the command. The JS `LiveGraphSession` commits its document only after acceptance.

The tests use actual authored source files:

| Source | Authored behavior | Proof |
| --- | --- | --- |
| `packages/manifold-author/examples/dsp-live-scripting.mjs` | Build the original input trim and widener graph; set a named parameter; look up an instance and rewire the output | Native JS document matches `authored-dsp-live-scripting.json`; native audio changes after the queued command; rejected edits leave the authored state alone; two runtimes remain isolated. |
| `packages/manifold-author/examples/fx-slot-swap.mjs` | Build the original two-slot FX graph; set an effect amount; select a width effect by adding normal graph instances and connections | Native JS document matches `authored-fx-slot-swap.json`; the selected graph matches `authored-fx-slot-swap-width.json`; Rust prepares and publishes it at a block boundary; rendered signal changes; rejected swaps can be retried. |

Reproduce with `cargo test -p manifold-project-js`. The `native_host` module now exposes `prepare_native_script`, which returns separate control and audio handles. An integration test moves the audio handle to a separate thread, applies authored parameter and route commands at block boundaries, saves the resulting document, and reopens it into both the JS controller and native processor. Another test prepares and publishes an FX graph swap through the same handoff. Dropping the audio handle rejects a queued edit. This is an importable native rendering boundary. The [package slice](project-package-v1.md) now connects the same controller to CLAP and [VST3](native-vst3-project-package.md); standalone native device application support remains open. Plain graph imports remain separate from running a packaged controller.

The runnable `native_script` example loads a bundled author module, renders deterministic stereo input, applies one authored path edit, writes the accepted graph document, and reports the energy around publication. It can reopen that document for the next edit:

```sh
cargo run -q -p manifold-project-js --example native_script -- projects/graph-workspace/dsp-live-project.bundle.js /dsp/live/input_gain 0.4 /tmp/manifold-native-script-dsp.json
cargo run -q -p manifold-project-js --example native_script -- projects/graph-workspace/fx-slot-project.bundle.js /test/fxslot/slotA/select 1 /tmp/manifold-native-script-fx.json
cargo run -q -p manifold-project-js --example native_script -- projects/graph-workspace/fx-slot-project.bundle.js /test/fxslot/slotB/select 1 /tmp/manifold-native-script-fx-two.json /tmp/manifold-native-script-fx.json
```

On the current 48 kHz/128-frame deterministic input, the gain run changed left-channel absolute block sum from 12.7305 to 5.0932 after smoothing. The FX runs changed the graph from 10 to 12 and then 14 nodes; the corresponding settled sums were 13.1274, 21.8368, and 38.5226. These are functional native render observations, not callback latency or C++ performance measurements.

## Boundary and next gates

- The runtime is single-threaded and must stay off the audio callback. The queue is bounded; graph validation and preparation happen before publication. Hosts must retire old plans off the callback and acknowledge only after acceptance.
- The native handoff rejects a script that returns a changed project document without an acknowledged host command. A dropped audio handle rejects its queued edit, leaving the previously saved graph unchanged.
- The current bundle format is a self-contained JavaScript IIFE. The two authored modules now implement `restoreProject(host, savedDocument)` and continue live edits after recall. TypeScript can use the existing package build pipeline, but package manifests, resource loading, version negotiation, live script reload, and user-facing error recovery remain open.
- The compatibility shim covers `structuredClone`; the public PCM encoder/decoder
  also runs without browser base64 APIs. The native library now proves the bounded
  Sample authoring follow-up above. Full Sample capture/analysis, release host
  script services and Main project parity remain open.
- The browser now has an off-callback Worker structural subset with Gain/Widener state transfer; stateful resources and the complete publication gate remain open in `browser-structural-publication.md`.
- [Accepted host target readback](script-host-automation.md) now keeps native
  control saves and edits synchronized with its audio handle automatically; use
  `save_project()` for a current snapshot. The callback copies targets into a
  prepared atomic table and retires it with the graph outside processing.
- Add a native device adapter to the control/audio pair, then broaden the packaged CLAP/VST3 controller proofs to creator-facing controls, real DAWs, external topology synchronization and matched callback timing. Replay the same authored actions and saved state against browser and the legacy project.
- Main, Rack/Patch, egui presentation, the remaining legacy inventory, and matched old C++/native/Wasm callback performance remain open.
