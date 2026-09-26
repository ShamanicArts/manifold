# Checkpoint 82 · Wasm host-switch graph kind

The Rust graph now has `EffectSlotHostSwitch`, exported as Wasm node kind `53`. It is additive to selected-only kind `19` and prepared persistent kind `52`. The browser AudioWorklet can construct kind `53` from `effect-slot-host-switch` project nodes.

The [Wasm verifier](../../scripts/verify-fx-runtime-wasm.mjs) processes the same 32,768-frame input and Delay → Chorus → Delay selection events as the reconstructed [old C++ graph](checkpoint-80.md). The [metrics](checkpoint-82-wasm-metrics.json) show maximum difference **`4.25e-7`** during Chorus, `2.24e-8` before Chorus, and `1.49e-8` after Delay returns. The first switch sample is zero in both; the return sample is `-0.02956056` left in both. All **87 Rust tests**, the Wasm build, and the web production build pass.

This verifies graph code `53` with the two audited effect types. The remaining 19 types still need old-node reprepare comparisons. A dedicated web view and C++ reference fixture are the next step; kind `53` is not yet selectable in the library.
