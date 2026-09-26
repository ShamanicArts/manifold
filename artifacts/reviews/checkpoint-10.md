# Review checkpoint 10: filter cutoff CV in the synth patch

Date: 2026-09-26. Open the [live Synth patch](http://127.0.0.1:4173/?primitive=patch). The [desktop](checkpoint-10-filter-modulation.png) and [mobile](checkpoint-10-mobile.png) captures show the LFO rate and cutoff-depth controls, a bounded cutoff target range, and the native Rust versus Rust/Wasm comparison with the filter LFO case selected.

`ModulatedSvf` adds a typed control input to the existing stereo SVF path. The target cutoff is `base cutoff + bipolar CV × depth`, clamped to 20–20,000 Hz and passed through the existing 20 ms cutoff smoother. The synth graph now has a separate LFO → filter control edge. Audio continues through oscillator/noise → ADSR → SVF → output. The control loop runs at sample rate in Rust, independent of browser UI timing.

The four authored synth fixtures were regenerated with the new graph. Three include nonzero LFO cutoff depth; all four show **Match** against native Rust in Chromium. The original six C++ SVF cases still pass after the shared filter processing change. A Rust test confirms that zero-depth CV is sample-identical to the old unmodulated path and that nonzero CV changes output.

Verification: `cargo test --workspace` passes 21 tests; `python3 scripts/check-svf-parity.py` passes all six C++ cases; headless Chromium passes all 47 workbench comparisons across nine views with no page errors. The live eight-node patch starts at 48 kHz, its gate responds, and the 390 px layout has no horizontal overflow.

The range shown beside the cutoff controls is the target span implied by base and depth, before smoothing; it is not a sampled value from the audio thread. External MIDI is still disconnected in this browser workbench, and no MIDI permission is requested.
