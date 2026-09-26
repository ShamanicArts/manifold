# Checkpoint 40 · Live typed CV routing

Open the [CV rack](http://127.0.0.1:4173/?primitive=cv-rack) and start the instrument. In **Control patch**, set **Mix · input 1** and **Mix · input 2** to **Unconnected** while it plays. The mixed CV settles at the 0.10 offset and effective gain at 0.65. Reconnect **Source LFO** to a mix input and watch the mixed CV move without restarting. Unused stage rows dim while parked. [Browser run values](checkpoint-40-live-route.json).

## Implemented

- Added a patchable Rust execution plan for this fixed CV rack. It prepares all nine nodes once, including initially disconnected branches. A live route request replaces one control source index and recomputes reachability in a reverse pass without allocation.
- Rust rejects missing nodes, invalid ports, audio-to-CV routes, edits to audio inputs, and routes that would require a new topological order. Inactive kernels are skipped during processing and retain their state; reconnecting resumes them. A full stop/start still resets graph state.
- Added worklet route acknowledgements, browser rollback on rejection or timeout, and dimmed stage meters for parked nodes. The editor remains usable during audio playback.

## Verification

- `cargo test --workspace`: 58 core tests passed, including route validation, parking, meter retention, and reactivation.
- `node scripts/verify-cv-rack-worklet.mjs`: audible output, all 29 offered source choices, disconnected offset/gain values, parked stage status, and rejected invalid routes passed.
- Live Chromium AudioWorklet: audio remained running during edits; disconnecting both mix inputs gave mixed CV **0.10** and effective gain **0.65**; reconnecting Source LFO changed mixed CV. No page errors.
- Rust/Wasm and Vite production builds passed. All 156 offline cases in 25 views still reported **Match**. Native Rust fixture manifests were regenerated after the graph implementation changed.

## Boundary

This edits routes among already prepared nodes. Adding nodes, changing kinds, or changing the prepared topological order still needs a new plan. That future replacement must prepare away from the callback and define state migration. The [Web Audio specification](https://www.w3.org/TR/webaudio/) places AudioWorklet code on the rendering thread, which is why this checkpoint keeps the live operation bounded. See the [patch editing contract](../../docs/patch-editing-contract.md).
