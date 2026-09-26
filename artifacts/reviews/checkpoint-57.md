# Checkpoint 57 · Transient Shaper and Standalone FX type 16

[Open Transient Shaper](http://127.0.0.1:4173/?primitive=transient-shaper) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [Transient screenshot](checkpoint-57-transient-shaper.png) · [FX slot screenshot](checkpoint-57-standalone-fx.png) · [Browser metrics](checkpoint-57-metrics.json) · [Migration boundary](../../docs/transient-shaper-migration.md)

The original stereo TransientShaper now runs in a Rust kernel with fast and slow envelope followers, a block transient meter, graph kind 43, an interactive workbench, and Standalone FX type 16. The slot preserves the normalized attack, sustain, and sensitivity mapping. Thirteen original type IDs now work in the slot.

Seven C++ captures show **Match** against Rust/Wasm for both audio and meter output, with zero observed sample difference on this machine. Four new native Rust slot cases cover controls and switching; all 47 slot cases show **Match**, with a largest maximum difference of `9.69e-7`. The full browser sweep passes **273 cases across 35 views** with zero page errors. All 76 Rust workspace tests and the Wasm and web builds pass. A live browser check started test audio, raised attack, showed a nonzero transient meter, and switched the running slot to Transient.

The Rust core has no JUCE dependency. The C++ captures establish processor parity. The slot cases establish native Rust/Wasm parity; old project-level routing and preset compatibility are still unverified.
