# Checkpoint 61 · ReverseDelay and Standalone FX type 19

[Open Reverse Delay](http://127.0.0.1:4173/?primitive=reverse-delay) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [Reverse Delay screenshot](checkpoint-61-reverse-delay.png) · [FX slot screenshot](checkpoint-61-standalone-fx.png) · [Browser metrics](checkpoint-61-metrics.json) · [Migration boundary](../../docs/reverse-delay-migration.md)

The original ReverseDelayNode now runs as Rust graph kind 47, with prepared stereo ring memory, reverse window playback, triangular envelope, feedback, wet mix, and the original dormant bypass. Generation stamps clear the audible ring state in constant time when the effect is selected or dormant. Standalone FX type 19 adds the old normalized time/window/feedback mapping and 1.2× wet gain, bringing the slot to seventeen supported type IDs.

All eight C++ ReverseDelay captures show **Match** against Rust/Wasm with zero maximum sample difference in these cases. Four new native Rust slot cases cover controls and switching; all 63 slot cases show **Match**, with a largest maximum difference of `1.25e-4` in EQ-to-Formant switching. The full browser sweep passes **322 cases across 39 views** with zero page errors. Live checks started test audio, changed delay time to 245 ms, and switched the running slot to Reverse Delay at 80% wet. All 80 Rust workspace tests and Wasm and web builds pass.

The Rust core uses no JUCE dependency. C++ captures establish processor parity, while slot cases establish native Rust/Wasm parity. Old project routing and preset compatibility remain unverified.
