# Review checkpoint 08: composed synth patch

Date: 2026-09-26. Open the [live Synth patch](http://127.0.0.1:4173/?primitive=patch). The [desktop](checkpoint-08-patch.png) and [mobile](checkpoint-08-mobile.png) captures show a complete authored graph: Oscillator and NoiseGenerator mix into ADSREnvelope, then SVF, Gain, and Output. The browser exposes waveform, pitch, tone/noise levels, noise color, four envelope controls and gate, filter cutoff/resonance, and output level.

This is a **native Rust ↔ Rust/Wasm** comparison, because the composed patch is new. The C++ parity claims remain scoped to the individual legacy primitives. Four deterministic cases cover tone, mixed noise, simultaneous pitch/noise/filter changes, and a noise-only transient. The maximum difference in the default tone case is 0.0000000224; all four show **Match** in the browser.

Verification: `cargo test --workspace` passes 18 tests. Headless Chromium passes all 42 comparison cases across eight views with no page errors. The live seven-node AudioWorklet patch starts at 48 kHz and responds to its gate. The 390 px layout has no horizontal overflow.

The graph is authored in JavaScript-owned project JSON; no Lua is imported or run. This patch is gated manually and has a fixed oscillator frequency until its control moves. External MIDI devices are not connected in the browser workbench and no MIDI permission is requested. Next: modulation and note-controlled pitch/gate routing, then effects and sampling.
