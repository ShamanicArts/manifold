# Checkpoint 111 — Main wave/sample base route

The [playable Main study](http://127.0.0.1:4173/?primitive=main-sample-blend) now exposes **Base wave pitch**, **Base wave level**, **Base wave shape**, and **Base wave ↔ sample**. The [HTML review](http://127.0.0.1:4173/main-sample-blend-review.html) shows the route and twelve comparison cases; the [project sitrep](http://127.0.0.1:4173/manifold-sitrep.html) gives the broader status.

## Legacy reading and design choice

The old `UserScripts/projects/Main/lib/sample_synth.lua` connects an oscillator and processed sample to both `mixCrossfade` and `directionCrossfade`. Both use curve 1 and the same mapped blend position. `basePathSelect` chooses the direction path for FM/Sync; the normal path uses `mixCrossfade`. The authored v2 graph now builds **one normal base crossfade**, oscillator on port 0 and phase vocoder on port 1, before the existing two-bus base/Add-Morph mixer. The oscillator starts at level zero and the crossfade at +1, so earlier Main study outputs remain the same.

The base oscillator uses the existing Rust standard-waveform kernel; it is not yet the full old Main oscillator with all its modulation. The old sample path includes `sampleBlendGain` and the old additive path includes a separate `addCrossfade`; this study still uses independent mixer gains for those branches. That is a visible simplification, not an old-project parity claim.

## Measured evidence

- Twelve 16,384-frame native Rust ↔ direct Wasm Main graph comparisons pass. The new saw-only (0.1011 RMS), equal-power centre (0.0724 RMS), and triangle/sample plus Morph (0.1176 RMS) cases have **zero maximum sample difference**. The nine earlier cases retain their measured outputs; the three wet vocoder cases remain within 3.68e−6.
- The compiled old C++ envelope follower's 128 block meters still match the follower inside the Wasm Main graph exactly on the fixture. This checks the detector independently of the new base route.
- The AudioWorklet test changes wave level and base position while running and observes distinct, audible sample-only, wave-only, and centre outputs. Web production build and all 118 Rust workspace tests pass.
- Version-4 project state roundtrips 17 controls plus source/target and migrates v1 six-control, v2 11-control, and v3 13-control files. Old states receive silent wave level and full sample base position.

## Next reconstruction boundary

Trace and implement the old Add branch crossfade and gain staging first, then the FM/Sync directional path and per-voice behavior. The old Main `applyVoiceGate` checks `voice.adsr`, but `createVoiceGraph` never constructs or returns one. A note ADSR for v2 would therefore be an explicit redesign, not a port of a connected old Main envelope. Polyphony, full oscillator modulation, and old preset migration remain open.
