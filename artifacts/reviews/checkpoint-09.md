# Review checkpoint 09: typed control modulation

Date: 2026-09-26. Open the [live LFO modulation workbench](http://127.0.0.1:4173/?primitive=modulation). The [desktop](checkpoint-09-modulation.png) and [mobile](checkpoint-09-mobile.png) captures show waveform, rate, base gain, depth, a live output spectrum, and a full amplitude-envelope comparison.

The Rust graph now distinguishes `Audio` and `Control` ports. An LFO emits bipolar CV at sample rate; `ModulatedGain` receives audio on port 0 and CV on port 1, applies smoothed base and depth, and clamps the effective gain to 0–2. Invalid audio/control connections fail graph compilation. This modulation is independent of browser animation timing. The original Lua UI-loop LFO provides context only; no Lua is imported or run.

Five **native Rust ↔ Rust/Wasm** cases cover sine, triangle, square, rate change, and depth/polarity change. All five show **Match**. These are new graph semantics, so they are not presented as C++ parity. The graph test checks both a rejected CV-to-audio connection and sample-by-sample gain values at three LFO phases.

Verification: `cargo test --workspace` passes 20 tests. Headless Chromium passes all 47 workbench cases across nine views with no page errors. The live modulated graph starts at 48 kHz, and the 390 px page has no horizontal overflow.

Next: add more CV routing utilities and an editable base/effective value display, then route modulation into the composed synth patch. External MIDI remains disconnected in this browser workbench; no MIDI permission is requested.
