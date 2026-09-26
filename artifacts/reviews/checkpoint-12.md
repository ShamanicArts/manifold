# Review checkpoint 12: scalar Distortion port

Date: 2026-09-26. Open the [live Distortion workbench](http://127.0.0.1:4173/?primitive=distortion). The [desktop](checkpoint-12-distortion.png) and [mobile](checkpoint-12-mobile.png) captures show drive, wet mix, output gain, a transfer curve, live spectrum, and C++ versus Rust/Wasm output.

The Rust graph now has a stereo `Distortion` node. It ports the legacy scalar tanh shaper, 10 ms smoothing for all three parameters, dry/wet blend, and final ±1 clamp. The transfer curve is a lightweight Canvas view of the current settings; it does not affect audio processing.

| C++ scalar case | Native Rust maximum sample difference |
| --- | ---: |
| Default drive | 0 |
| Dry path | 0 |
| Hard drive | 0 |
| Drive and mix sweep | 0 |
| Output sweep | 0 |
| 512-frame blocks | 0 |

Verification: `python3 scripts/check-distortion-parity.py` passes all six checked-in C++ cases. `cargo test --workspace` passes 21 tests. Headless Chromium passes all 53 workbench comparisons across ten views with no page errors; the default Distortion browser case has maximum difference 0.000000119. Live processing starts at 48 kHz, and the 390 px layout has no horizontal overflow.

This is the original scalar behavior, including its lack of oversampling. Additional effects and dynamics, and an authored effects chain, remain in the roadmap.
