# Checkpoint 60 · FormantFilter and Standalone FX type 13

[Open Formant filter](http://127.0.0.1:4173/?primitive=formant) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [Formant screenshot](checkpoint-60-formant.png) · [FX slot screenshot](checkpoint-60-standalone-fx.png) · [Browser metrics](checkpoint-60-metrics.json) · [Migration boundary](../../docs/formant-migration.md)

The original FormantFilter now runs as Rust graph kind 46. It preserves the three parallel vowel bands per channel, fractional vowel interpolation, drive and output saturation, dry bypass, smoothing, and coefficient update thresholds. Standalone FX type 13 adds the original normalized vowel/shift/resonance/drive mapping and 1.5× wet gain, bringing the slot to sixteen supported type IDs.

All eight C++ Formant captures show **Match** against Rust/Wasm; the largest maximum sample difference is `4.53e-6`. Four new native Rust slot cases cover controls and switching; all 59 slot cases show **Match**, with a largest maximum difference of `1.25e-4` in EQ-to-Formant switching. The full browser sweep passes **310 cases across 38 views** with zero page errors. Live checks started test audio, morphed the Formant vowel to U, and switched the running slot to Formant. All 79 Rust workspace tests and Wasm and web builds pass.

The Rust core uses no JUCE dependency. C++ captures establish processor parity, while slot cases establish native Rust/Wasm parity. Old project-level routing and preset compatibility remain unverified.
