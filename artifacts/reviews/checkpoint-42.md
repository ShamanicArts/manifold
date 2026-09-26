# Checkpoint 42 · Legacy stereo Chorus

Open the [Stereo chorus workbench](http://127.0.0.1:4173/?primitive=chorus). Start audio, choose the LFO waveform, and move the voices, depth, spread, feedback, and mix controls while the test signal plays. In **Offline comparison**, select **One to four voices**. The [stereo output overlay](checkpoint-42-chorus-wave.png) and [sample difference](checkpoint-42-chorus-difference.png) show that C++ capture beside Rust/Wasm.

## Implemented

- Ported the original C++ `ChorusNode` to a Rust graph kernel with a delay ring allocated at preparation, four persistent voice phases per channel, linearly interpolated delay reads, 10 ms smoothing, and live voice and waveform changes.
- Added Wasm node kind and controls, a stereo browser project, seven C++ captures, a native Rust parity runner, and the browser comparison view.
- Recorded the physical parameter contract and effect-slot boundary in the [migration notes](../../docs/chorus-migration.md).

## Verification

- `cargo test --workspace`: 60 core tests passed. Rust/Wasm and production web builds passed.
- `python3 scripts/check-chorus-parity.py`: seven C++/native Rust cases passed with zero recorded per-sample difference at float32 precision, under the 0.00001 gate.
- Browser: seven Chorus cases reported **Match**. Live AudioWorklet playback continued through an LFO waveform switch and feedback edit; no page errors. The **One to four voices** capture had maximum C++/Wasm difference **4.54e-7**.
- Full browser sweep: **170 Match** results across 27 views, no page errors.

## Boundary

This checkpoint ports the standalone C++ Chorus node. Adding it to the historical Standalone FX slot and converting project presets remain separate slices. The seven fixture scenarios cover the key parameter and state changes, not every sample rate or automation sequence.
