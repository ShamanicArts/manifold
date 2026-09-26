# Review checkpoint 06: patchable ADSR envelope

Date: 2026-09-26. Open the [live ADSR workbench](http://127.0.0.1:4173/?primitive=adsr). The [desktop](checkpoint-06-adsr.png) and [mobile](checkpoint-06-mobile.png) captures show a stereo oscillator feeding a patchable envelope, four compact parameter controls, a gate button, live spectrum, and a full-curve C++ versus Rust/Wasm comparison.

The Rust graph now has an `ADSREnvelope` node with one stereo audio input and attack, decay, sustain, release, and gate parameters. Its normal scalar stage curves reproduce the old `ADSREnvelopeNode.cpp`. Gate off during attack or decay is an intentional correction: Rust releases from the current level immediately, while the old scalar code can wait until sustain. The dedicated Rust tests cover early release and retrigger during release. Browser gate changes currently arrive at the next worklet block.

| C++ scalar gate cycle | Maximum sample difference |
| --- | ---: |
| Default curve | 0 |
| Pluck | 0 |
| Soft onset | 0 |
| 64-frame blocks | 0 |
| 512-frame blocks | 0 |

Verification: `python3 scripts/check-adsr-parity.py` passes all five checked-in C++ cases. `cargo test --workspace` passes 17 tests. Headless Chromium passes all 32 workbench comparisons across six views with no page errors; the live ADSR graph starts at 48 kHz and responds to its gate; the 390 px page has no horizontal overflow.

The workbench uses its own gate button and keyboard for manual input. It does not request browser MIDI permission or connect external MIDI devices. Next: NoiseGenerator, then patch the oscillator, noise, envelope, filter, and mixer into a more representative authored synth slice.
