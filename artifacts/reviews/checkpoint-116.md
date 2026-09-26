# Checkpoint 116 — sample-driven oscillator hard sync

The [playable Main study](http://127.0.0.1:4173/?primitive=main-sample-blend) now has **Sample → wave hard sync**. Raw sample playback feeds the oscillator's optional audio input; a rising zero crossing resets its phase before that sample is rendered. This follows the original C++ OscillatorNode behavior. The [HTML review](http://127.0.0.1:4173/main-sample-blend-review.html) shows the free and synced wave cases; the [sitrep](http://127.0.0.1:4173/manifold-sitrep.html) tracks the wider port.

## Evidence

- An extended original C++ oscillator reference runner and a native Rust graph renderer receive the same 16,384-frame 220/440 Hz mono sync signal at 48 kHz, with a 330 Hz saw wave. Their stereo outputs match sample for sample: maximum and RMS difference are both zero. Run `python3 scripts/check-oscillator-sync-parity.py` to regenerate and check the capture.
- Two new Main graph captures, free wave and sample-synced wave, match native Rust and direct Wasm exactly. Turning sync on changes 31,452 of 32,768 interleaved samples by more than 1e−5, with maximum difference 0.3524. The AudioWorklet toggle changes the audible wave output.
- The 25 earlier Main cases continue to pass, including exact old C++ sample gain-stage cases and the five linked-amplitude cases. Three wet vocoder cases remain within 2.6e−6 of native Rust. All 120 workspace Rust tests pass, including a new rising-edge phase-reset test.
- Version-9 Main state saves 24 controls and opens versions 1–8 with sync off by default.

## Boundary

This establishes the oscillator hard-sync kernel and a manually controllable Main graph route. The old Main mode 3 enables oscillator sync only when its blend position favors the wave, and separately updates sample playback/retriggering each control block. Those policies, FM speed/frequency movement, full old voice output, and polyphonic allocation remain. The [routing note](../../docs/main-voice-routing.md) records the old behavior.
