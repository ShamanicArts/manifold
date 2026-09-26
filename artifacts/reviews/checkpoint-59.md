# Checkpoint 59 · EQNode and Standalone FX type 14

[Open three-band EQ](http://127.0.0.1:4173/?primitive=eq-node) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [EQ screenshot](checkpoint-59-eq-node.png) · [FX slot screenshot](checkpoint-59-standalone-fx.png) · [Browser metrics](checkpoint-59-metrics.json) · [Migration boundary](../../docs/eq-node-migration.md)

The original three-band EQNode now runs as Rust graph kind 45, with independent stereo state, nine physical controls, 10 ms smoothing, and the original coefficient update thresholds. It is distinct from the earlier EQ8 port. Standalone FX type 14 uses the old normalized low/high/mid gain mapping with fixed band frequencies, bringing the slot to fifteen supported type IDs.

All eight C++ EQNode captures show **Match** against Rust/Wasm. The largest observed maximum sample difference is `6.22e-5`. Four new native Rust slot cases cover EQ gain changes and switches; all 55 slot cases show **Match**. The largest slot maximum difference is `1.25e-4` in the EQ-to-Reverb case. The full browser sweep passes **298 cases across 37 views** with zero page errors. Live checks started test audio, adjusted the EQ, and switched the running slot to EQ. Rust workspace tests, Wasm, and web builds pass.

A stronger combined 64-frame EQ sweep measured `3.51e-4` maximum difference and exceeded the comparison threshold; it remains a documented numerical limit. C++ captures establish node behavior, while slot cases establish native Rust/Wasm parity. Project-level routing and preset compatibility are still unverified.
