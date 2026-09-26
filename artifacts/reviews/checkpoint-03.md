# Review checkpoint 03: Mixer and variable-port graph

Date: 2026-09-26. Open the [Mixer workbench](http://127.0.0.1:4173/?primitive=mixer). The [desktop](checkpoint-03-mixer.png) and [mobile](checkpoint-03-mobile.png) captures show the third interactive primitive in the library.

The graph compiler now sizes prepared input tables per node, up to 32 ports for Mixer, while preserving its existing cycle, duplicate-port, unreachable-node, and disconnected-output behavior. The audio callback still owns no graph edits or allocations. The Mixer node ports the original scalar C++ processing path: stereo bus summing, independent gain and equal-power pan, master gain, and 10 ms smoothing. The browser demo mixes raw input with a filtered branch. Offline fixtures use deterministic raw and constant bus inputs.

| C++ scalar case | Native Rust maximum error | Browser Wasm maximum error |
| --- | ---: | ---: |
| Two buses at centre | 0 | 0 |
| Gain, pan, and master sweep | 0 | 2.98e-8 |
| Four buses | 0 | 1.49e-8 |
| 32 buses, 64-frame blocks | 0 | 1.49e-8 |

The Mixer fixture runner explicitly selects the legacy scalar path (`MixerNode(-1)`). The legacy SIMD path has a separate implementation and has not yet been compared. This checkpoint establishes scalar behavior and port capacity; it does not claim a 32-bus CPU budget or SIMD equivalence.

Verification: `cargo test --workspace` passes 11 tests, including first and last Mixer ports and invalid port 32. The native parity script passes all four Mixer cases. Headless Chromium passed all 14 C++/Wasm cases across SVF, Crossfader, and Mixer, started the live Mixer at 48 kHz, stopped audio when changing primitives, reported no page errors, and had no horizontal overflow at 390 px. Mixer project defaults are applied before preparation through the graph's initial parameter contract, so they begin at authored values.

Decisions for review: Mixer parameter IDs are 0 for master, 1–32 for bus gains, and 33–64 for bus pans. The browser library remains the entry point for each primitive as it becomes interactive. Voice and MIDI primitives are next in the roadmap. No Lua runtime or Lua source is imported.
