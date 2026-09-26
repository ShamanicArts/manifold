# Checkpoint 37 · Main rack scalar CV chain

Open the [CV rack slice](http://127.0.0.1:4173/?primitive=cv-rack), click **Start instrument**, and change the source rate, trigger rate, sample/track/quantize mode, amount, bias, mix levels, and gain depth. The four live stage readouts show the held value, transformed CV, mixed CV, and effective gain. In the reference section, choose **CV stages** to inspect four aligned native Rust and Rust/Wasm traces. [Captured comparison plot](checkpoint-37-cv-stages.png).

## Implemented

- Added sample-and-hold, attenuverter/bias, and a four-input CV mixer as typed, sample-rate Rust graph nodes. Their formulas follow the legacy Main rack scalar modules, with the timing moved from the Lua control loop to the audio graph.
- Authored a self-playing oscillator → modulated gain project controlled by a three-stage CV chain. Stage meters are read-only snapshots; browser polling cannot affect DSP timing.
- Added six native Rust ↔ Rust/Wasm cases covering trigger capture, track mode, twelve-step quantization, mode changes, negative amount and bias, mix polarity, and different block sizes. Each case compares stereo audio and all four stage snapshots.
- Added a four-lane comparison plot and a taller stage view. Switching to another primitive resets the plot selector.

## Verification

- `cargo test --workspace`: 57 core tests passed.
- `node scripts/verify-cv-rack-worklet.mjs`: live worklet graph, audible output, and bounded stage meters passed.
- Vite production build and Rust/Wasm build passed.
- Browser comparison runner: **Match** for all 156 cases in 25 views, with no page errors. All six CV rack cases matched.
- Browser stage view displayed four traces at 746 × 236 pixels and stayed on **Match**. Switching to SVF hid the stage option and restored the standard plot selector.

## Decisions and limits

The legacy Lua formulas are behavior references; no Lua runtime is included. Sample-rate capture intentionally improves timing precision. This is native Rust ↔ Rust/Wasm composition evidence, not full C++/JUCE project parity. Graph connections are still authored in the project JSON and fixed during playback. Editable connections, prepared graph replacement, base/effective slider overlays, and state continuity rules are the next patching work. See the [migration boundary](../../docs/cv-rack-migration.md).
