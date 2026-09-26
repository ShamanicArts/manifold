# Checkpoint 62 · Stutter and Standalone FX type 20

[Open Stutter](http://127.0.0.1:4173/?primitive=stutter) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [Stutter screenshot](checkpoint-62-stutter.png) · [FX slot screenshot](checkpoint-62-standalone-fx.png) · [Browser metrics](checkpoint-62-metrics.json) · [Migration boundary](../../docs/stutter-migration.md)

The original StutterNode now runs as Rust graph kind 48. It reproduces the seeded JUCE random stream, eight-step pattern, reverse fragment read, gate, filter and pitch decay, smoothing, and stereo state. Generation stamps reset the prepared eight-second ring in constant time. Standalone FX type 20 adds the old normalized length/gate/probability/filter mapping, bringing the slot to eighteen supported type IDs.

All eight checked-in C++ Stutter captures show **Match** against Rust/Wasm with zero maximum sample difference in these cases. Four new native Rust slot cases cover controls and switching; all 67 slot cases show **Match**, with a largest maximum difference of `1.25e-4` in EQ-to-Formant switching. The full browser sweep passes **334 cases across 40 views** with zero page errors. Live checks started test audio, selected the shortest beat length, and switched the running slot to Stutter at 80% wet. All 81 Rust workspace tests and Wasm and web builds pass.

A separate simultaneous length and mix sweep exceeded the comparison threshold by a one-sample maximum difference of `6.02e-4`; it remains a numerical edge to revisit. C++ captures establish processor parity, while slot cases establish native Rust/Wasm parity. Old project routing and preset compatibility remain unverified.
