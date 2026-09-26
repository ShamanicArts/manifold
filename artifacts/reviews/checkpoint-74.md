# Checkpoint 74 · prepared persistent FX slot in Rust/Wasm

Review the [native slot metrics](checkpoint-74-native-metrics.json), [Wasm switch metrics](checkpoint-74-wasm-metrics.json), [real-kernel tail plot](checkpoint-73-tail.png), [routing boundary](../../docs/standalone-fx-routing.md), and [Wasm verifier](../../scripts/verify-fx-tail-wasm.mjs).

The Rust `EffectSlot` now has an opt-in legacy routing mode. It keeps all 21 effect kernels prepared, allocates their stereo scratch before audio starts, and processes each type after its first selection even while its output gate is closed. Reselecting an effect preserves its state. The existing selected-only slot remains graph code `19`; new graph code `52` uses persistent routing with the same seven public parameter IDs. The browser AudioWorklet kind map recognizes code `52`, but the workbench has not yet exposed a view for it.

The full Rust slot matches the old isolated C++ Chorus/Delay capture to `4.47e-8` maximum sample difference. The prepared Wasm graph matches that C++ capture to **`4.32e-7` maximum** and `2.95e-9` RMS over 32,768 stereo frames; after Delay is reselected, maximum difference is `1.86e-8`. A new Rust test visits every effect type in the persistent mode with finite output, and all **87 workspace tests** pass. The Wasm and web builds pass.

This mode pays CPU for every visited effect. The old Lua wrapper creates kernels lazily and may give a new effect gate a different first-block envelope; the isolated reference prepared both gates ahead of time. The actual plug-in graph, host state, worst-case CPU, and browser interaction remain to verify before claiming full legacy parity.
