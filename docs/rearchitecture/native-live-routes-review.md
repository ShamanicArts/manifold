# Native live route review

29 September 2026. Fixture: [`authored-inverted-lfo.json`](../../projects/graph-workspace/authored-inverted-lfo.json), authored by the public `@manifold/author` JavaScript example. This is a bounded R03 route transaction through the Graph CLAP and VST3 products, not the full structural transaction or native project scripting gate.

## Live browser review

Open the [Graph workspace over Tailscale](https://wubulon.tailfac9f9.ts.net:4173/?primitive=graph-workspace). Click **Load JS-authored live route demo**, then **Start instrument**. In node 6, change the **CV** input from **5 · LFO inv** to **5 · LFO uni** while it runs. The route is applied through the prepared Rust/Wasm graph and the status reports the accepted edit. Download the graph project to inspect the saved `outputPort: 2` connection.

[Before start](evidence/web-graph-route-demo.png) · [Running after live route change](evidence/web-graph-route-live.png). Headless Chromium loaded this exact Tailscale URL, started the instrument at 48 kHz, and switched the visible route from `5:1` to `5:2`. Its audio stream was routed to a private PipeWire null sink; the physical H6 and speakers were untouched.

The same browser run stopped audio, downloaded the graph project, checked its edge `{from:5, outputPort:2, to:6, inputPort:1}`, reloaded the page, and opened the downloaded file. The route selector returned as `5:2`.

## Reproduce

```sh
./scripts/build-wasm.sh
npm --prefix web test
cargo test --workspace
npm --prefix web run build
./scripts/build-vst3.sh
./scripts/build-clap.sh
```

Build the two plug-in packages sequentially: both scripts rebuild the same `web/dist` directory. The packaged Graph editor displays **Live routes** for supported graphs. Import the fixture, start the host audio engine, then change node 6's `cv` input from node 5 `inv` to `uni`. The editor sends named ports and shows the committed route after the next audio block. A host save before that block contains the old route; a save after it contains `from:5, outputPort:2, to:6, inputPort:1`. Reopening the saved project prepares that route. The host's audio callback continues with the existing processor state during a route switch.

## Contract and observed evidence

| Boundary | Implementation | Check |
| --- | --- | --- |
| Portable route | `NativeProject::stage_live_route` resolves names from the Rust node catalog, validates the proposed topology, and writes one edge into the project document. | Native project test checks output port 2 and rejects invalid type/cycle. |
| Callback | A bounded `RouteMailbox` carries numeric ports to `NativeProcessor::set_route_from` at the start of a block. No JSON parsing, graph compilation, heap allocation or lock occurs in this path. | CLAP and VST3 callback tests render the JS-authored fixture before/after a live edit. VST3 compares every output sample with direct Rust rendering. |
| Host save | The callback publishes a generation only after it accepts the route. A control-thread save reads the committed document and one value bank. | Both host tests check old save before the block and new save after it. |
| Lifecycle | Deactivation drains an unconsumed command and promotes its validated target for the next activation. | CLAP and VST3 deactivation/reactivation tests save the new route. |
| Editor | Graph presentation includes connections and a `liveRoutes` capability. CLAP IPC and VST3 `IMessage` carry a named route; VST3 status polling supplies the published document. | VST3 message test checks request generation and pending status. Both editor bundles build into their plug-in packages. |

`cargo test --workspace`, `npm --prefix web test`, `./scripts/build-wasm.sh`, and both package builds passed. No physical audio device was opened for these checks. The packages have not been tested by clicking the route control inside a running DAW in this review; callback tests and the VST3 message test cover the engine and IPC portions separately.

## Boundary still open

This review preceded support for assets and backward routes. Current Graph CLAP/VST3 live routes accept up to 16 prepared nodes from the supported node subset, including authored LoopCapture assets. A backward edge is cycle checked and the prepared kernels are reordered with scratch allocated during graph preparation. The [allocation test](../../crates/manifold-core/tests/realtime_route_allocation.rs) measures 32 backward/forward edits, audio blocks, and rejected cycles with zero thread-local allocations. It does not measure callback duration under a loaded host. Add/remove, wider node sets, and general continuity transfer still require off-thread structural transactions. A native plug-in still loads a portable document; it does not execute a JS/TS project module with the editor closed. Main remains an interim behavior oracle until the shared graph expresses its full topology. This review does not claim the R01–R04 or Main migration gates.
