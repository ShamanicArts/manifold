# Checkpoint 55 · Multitap delay and Standalone FX type 9

[Open Multitap delay](http://127.0.0.1:4173/?primitive=multitap) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [Multitap screenshot](checkpoint-55-multitap.png) · [FX slot screenshot](checkpoint-55-standalone-fx.png) · [Browser metrics](checkpoint-55-metrics.json) · [Migration boundary](../../docs/multitap-migration.md)

The original eight-tap stereo delay now runs in a prepared Rust kernel, graph kind 41, a standalone browser view, and Standalone FX type 9. The slot retains its original normalized tap count and feedback mapping, four authored tap placements, default remaining taps, and 1.4× wet gain. Eleven original type IDs now work in the slot. Generation stamps clear a previous tail in constant time on selection changes and dormant bypass.

Seven stereo captures from the original C++ node show **Match** against Rust/Wasm, with zero observed sample difference on this machine. Four new native Rust slot cases exercise controls and switches; all 39 slot cases show **Match**, with a largest maximum difference of `9.69e-7`. The full browser sweep passes **251 cases across 33 views** with zero page errors. All 74 Rust workspace tests and the Wasm and web builds pass. A live browser check started test audio, set the workbench to eight taps, and switched the running slot to Multitap.

The Rust core has no JUCE dependency. The C++ captures establish processor parity. The slot cases establish native Rust/Wasm parity; old project-level routing and preset compatibility are still unverified.
