# Checkpoint 63 · PitchShifter and Standalone FX type 10

[Open Pitch Shifter](http://127.0.0.1:4173/?primitive=pitch-shifter) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [Pitch Shifter screenshot](checkpoint-63-pitch-shifter.png) · [FX slot screenshot](checkpoint-63-standalone-fx.png) · [Browser metrics](checkpoint-63-metrics.json) · [Migration boundary](../../docs/pitch-shifter-migration.md)

The original PitchShifterNode now runs as Rust graph kind 49, with two overlapping read heads per channel, triangular windows, linear interpolation, feedback, and dormant bypass. Generation stamps clear the prepared ring in constant time. Standalone FX type 10 adds the old normalized pitch/window/feedback mapping, bringing the slot to nineteen supported type IDs.

All eight C++ PitchShifter captures show **Match** against Rust/Wasm with zero maximum sample difference in these cases. Four new native Rust slot cases cover controls and switching; all 71 slot cases show **Match**, with a largest maximum difference of `1.25e-4` in EQ-to-Formant switching. The full browser sweep passes **346 cases across 41 views** with zero page errors. Live checks started test audio, shifted the standalone node by +12 semitones, and switched the running slot to Pitch Shift at 80% wet. All 82 Rust workspace tests and Wasm and web builds pass.

C++ captures establish processor parity, while slot cases establish native Rust/Wasm parity. Old project routing and preset compatibility remain unverified.
