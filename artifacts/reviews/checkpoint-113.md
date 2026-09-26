# Checkpoint 113 — linked Main branch depth

The [playable Main study](http://127.0.0.1:4173/?primitive=main-sample-blend) now has **Link branch depth** and **Branch depth**. Turn linking on to move the base and Add gains together; turn it off to use the two independent audition gains. The [HTML review](http://127.0.0.1:4173/main-sample-blend-review.html) shows the 17 offline comparisons and the [sitrep](http://127.0.0.1:4173/manifold-sitrep.html) shows wider project status.

The old Main `sample_synth.lua` sets `branchMixer` base gain to `1 − depth` and Add gain to `depth` in Add/Morph modes. The v2 two-bus Rust mixer now accepts linked depth as parameter 65 and link enable as parameter 66. One depth update sets both target gains within the mixer; the existing 10 ms gain smoothing applies on the audio callback. Independent gains remain stored and return when the link is disabled. The Main UI dims controls that do not apply in the current mode.

## Evidence

- Three new 16,384-frame native Rust ↔ direct Wasm Main captures at 48 kHz cover linked depth 0 (0.1729 RMS), 0.5 (0.1178 RMS), and 1 (0.1579 RMS). All three match sample for sample. Fourteen previous Main cases still pass, with three wet vocoder cases within 3.68e−6 maximum sample difference.
- The Rust graph test checks both depth endpoints, independent gain restoration, and updating saved independent gains while linked. All 119 workspace Rust tests pass. The AudioWorklet test switches linked depth live and gets audible, distinct base and Add endpoints before returning to independent mode.
- Version-6 Main state roundtrips 20 controls plus source and target, and migrates saved versions 1–5. Older files open with linking off. The production web build and served review page pass.

## Boundary

The old branch mixer gain law is represented, but the authored study's source amplitudes are not yet calibrated to full old Main voice output. In the old integration, oscillator amplitude is `amp`, sample blend gain is `amp × 2`, and sample-derived additive amplitude is `amp × 2`; the old branch and voice mixers also apply center pan. The C++ follower fixture and Rust native/Wasm composition comparisons are separate evidence. Next is a compiled old Main voice comparison for amplitude staging, followed by FM/Sync modes and polyphonic voice behavior. The [routing note](../../docs/main-voice-routing.md) tracks these remaining paths.
