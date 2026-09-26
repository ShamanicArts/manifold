# Checkpoint 54 · Reverb and Standalone FX type 7

[Open Reverb](http://127.0.0.1:4173/?primitive=reverb) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [Reverb screenshot](checkpoint-54-reverb.png) · [FX slot screenshot](checkpoint-54-standalone-fx.png) · [Browser metrics](checkpoint-54-metrics.json) · [Migration boundary](../../docs/reverb-migration.md)

The original ReverbNode's FreeVerb-style comb and all-pass network now runs in an independently written Rust kernel, exposed as graph kind 40 and an interactive workbench view. The Standalone FX slot also supports original type ID 7, using its normalized room and damping mapping. Ten original type IDs now work in the slot. Prepared delay lines are reused through audio blocks and cleared without allocation on a type switch.

Eight stereo captures from the original C++ node show **Match** against Rust/Wasm; the largest maximum sample difference is `1.28e-6`. Four new native Rust slot cases cover controls and switches; all 35 slot cases show **Match**, with a largest maximum difference of `9.69e-7`. The full browser sweep passes **240 cases across 32 views** with zero page errors. All 73 Rust workspace tests and the Wasm and web builds pass. A live browser check started test audio, adjusted room size, and switched the running slot to Reverb.

The Rust core has no JUCE dependency. The C++ captures establish processor parity. The slot comparison establishes native Rust/Wasm parity; old project-level routing and preset compatibility are still unverified.
