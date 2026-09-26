# Review checkpoint 05: standalone oscillator

Date: 2026-09-26. Open the [Oscillator workbench](http://127.0.0.1:4173/?primitive=oscillator). The [desktop](checkpoint-05-oscillator.png) and [mobile](checkpoint-05-mobile.png) captures show waveform selection, frequency and amplitude controls, live audio and spectrum, and the C++ versus Rust/Wasm comparison.

The Rust graph now has a standalone, patchable oscillator with no input port. It ports the legacy scalar phase and smoothing behavior for five standard waveforms: sine, saw, square, triangle, and sine/saw blend. The browser can run it as an instrument and change its parameters while playing.

| C++ scalar reference case | Maximum sample difference |
| --- | ---: |
| Five static waveforms | 0 each |
| Frequency sweep | 0.00000006 |
| Saw, 64-frame blocks | 0.00000003 |
| Triangle, 512-frame blocks | 0.00000003 |

The eight oscillator cases plus the previous fourteen C++ cases and five native Rust voice cases all show **Match** in headless Chromium. `cargo test --workspace` passes 15 tests. The live oscillator starts at 48 kHz, the browser reports no page errors, and the 390 px layout has no horizontal overflow.

Scope for review: this ports the scalar standard waveforms only. Legacy additive, unison, pulse, noise, drive, sync, and SIMD paths are still to be considered separately. The playable voice baseline remains a separate implementation. The browser keyboard is available for the voice view; external MIDI devices are **not connected**, and the workbench does not request MIDI permission.

Next: port the patchable ADSR envelope and noise generator, then use them in authored graph examples.
