# Checkpoint 56 · Ring Modulator and Standalone FX type 12

[Open Ring Modulator](http://127.0.0.1:4173/?primitive=ring-modulator) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [Ring screenshot](checkpoint-56-ring-modulator.png) · [FX slot screenshot](checkpoint-56-standalone-fx.png) · [Browser metrics](checkpoint-56-metrics.json) · [Migration boundary](../../docs/ring-modulator-migration.md)

The original stereo RingModulator now runs in a Rust kernel with an optional second stereo input, graph kind 42, an interactive internal-oscillator workbench, and Standalone FX type 12. The slot preserves the original normalized frequency, depth, and spread mapping. Twelve original type IDs now work in the slot.

Seven C++ captures show **Match** against Rust/Wasm, including external-bus routing and enable gating; the largest maximum sample difference is `2.98e-8`. Four new native Rust slot cases cover controls and switching; all 43 slot cases show **Match**, with a largest maximum difference of `9.69e-7`. The full browser sweep passes **262 cases across 34 views** with zero page errors. All 75 Rust workspace tests and the Wasm and web builds pass. A live browser check started test audio, changed frequency, and switched the running slot to Ring Mod.

The Rust core has no JUCE dependency. The C++ captures establish processor parity. The slot cases establish native Rust/Wasm parity; old project-level routing and preset compatibility are still unverified.
