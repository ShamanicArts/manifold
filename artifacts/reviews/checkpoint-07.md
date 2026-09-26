# Review checkpoint 07: deterministic stereo noise

Date: 2026-09-26. Open the [live Noise generator workbench](http://127.0.0.1:4173/?primitive=noise). The [desktop](checkpoint-07-noise.png) and [mobile](checkpoint-07-mobile.png) captures show level and color controls, a live spectrum, and C++ versus Rust/Wasm samples.

The Rust graph now has a zero-input `NoiseGenerator` with fixed independent stereo seeds, the original xorshift32 conversion, a color-controlled lowpass, and 10 ms smoothing for level and color. Initial values enter at graph preparation, so the generator starts at the authored setting. The browser can run it directly as an instrument.

| C++ reference case | Maximum sample difference |
| --- | ---: |
| Bright noise | 0 |
| Dark noise | 0 |
| Color sweep | 0 |
| Level sweep | 0 |
| 64-frame blocks | 0 |
| 512-frame blocks | 0 |

Verification: `python3 scripts/check-noise-parity.py` passes all six checked-in C++ cases. `cargo test --workspace` passes 18 tests. Headless Chromium passes all 38 workbench comparisons across seven views with no page errors. The live noise graph starts at 48 kHz, and the 390 px page has no horizontal overflow.

The noise source can now be combined with Oscillator, ADSR, SVF, and Mixer in authored graphs. That synth composition and modulation routing are next. External MIDI devices remain disconnected in the browser workbench; no MIDI permission is requested.
