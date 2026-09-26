# Checkpoint 58 · BitCrusher and Standalone FX type 17

[Open BitCrusher](http://127.0.0.1:4173/?primitive=bitcrusher) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [BitCrusher screenshot](checkpoint-58-bitcrusher.png) · [FX slot screenshot](checkpoint-58-standalone-fx.png) · [Browser metrics](checkpoint-58-metrics.json) · [Migration boundary](../../docs/bitcrusher-migration.md)

The original stereo BitCrusher now runs in a Rust kernel with an optional second stereo bus for XOR and gate modes, graph kind 44, an interactive workbench, and Standalone FX type 17. The slot preserves its original normalized bit depth, hold interval, and output gain mapping. Fourteen original type IDs now work in the slot.

Nine C++ captures show **Match** against Rust/Wasm, including default Highway and explicit scalar paths; the largest maximum sample difference is `1.19e-7`. Four new native Rust slot cases cover controls and switching; all 51 slot cases show **Match**, with a largest maximum difference of `9.69e-7`. The full browser sweep passes **286 cases across 36 views** with zero page errors. All 77 Rust workspace tests and the Wasm and web builds pass. A live browser check started test audio, raised bit depth, and switched the running slot to BitCrusher.

The Rust core has no JUCE or Highway dependency. The C++ captures establish processor parity. The slot cases establish native Rust/Wasm parity; old project-level routing and preset compatibility are still unverified.
