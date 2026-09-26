# Checkpoint 115 — linked Main voice amplitude

The [playable Main study](http://127.0.0.1:4173/?primitive=main-sample-blend) now has **Link voice amplitude** and **Voice amplitude**. Linking maps one value to oscillator level `amp`, sample stage gain `2 × amp`, and both prepared Sine bank levels `2 × amp`. The banks clamp at 1, as the original SineBankNode does. Unlinking restores the separately saved audition values. The [HTML review](http://127.0.0.1:4173/main-sample-blend-review.html) shows the new wave and Add cases beside the earlier C++ sample-only gain-stage comparison; the [sitrep](http://127.0.0.1:4173/manifold-sitrep.html) covers the wider project.

The browser host resolves the authored macro to at most four node updates and sends them as one AudioWorklet message. The worklet applies those updates to Rust/Wasm before its next render block. Audio synthesis and smoothing remain in the Rust graph. This also keeps manual source levels saved while the link is active.

## Evidence

- Five new 16,384-frame native Rust ↔ direct Wasm Main cases at 48 kHz cover wave at amp 0.25/0.75, source Add at amp 0.25/0.75, and a base/Add mix at amp 0.5. All five match sample for sample. Native RMS values are 0.0511/0.1532, 0.1120/0.2241, and 0.0953.
- The AudioWorklet check changes the linked amplitude live and confirms audible level changes separately on sample, oscillator, and prepared Add paths. It also checks that an overridden manual gain stays saved and returns on unlinking.
- The 20 earlier cases continue to pass, including the three exact compiled C++ sample gain-stage captures. The three wet vocoder cases differ from native Rust by no more than 2.6e−6. All 119 Rust workspace tests pass.
- Version-8 Main state roundtrips 23 controls plus source and target, and migrates saved versions 1–7 with amplitude linking off.

## Boundary

The linked amplitude follows old Main source level assignments. The authored Add branch uses two prepared Sine banks, while the old Add voice combines a waveform oscillator and a spectral bank. Native Rust/Wasm agreement for the new wave and Add cases does not establish full old C++ voice parity. FM/Sync direction, per-voice allocation, and old presets remain. The [routing note](../../docs/main-voice-routing.md) tracks those paths.
