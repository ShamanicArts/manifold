# Review checkpoint 02: primitive library and Crossfader

Date: 2026-09-26. Open the [Crossfader workbench](http://127.0.0.1:4173/?primitive=crossfader) or [SVF filter](http://127.0.0.1:4173/?primitive=svf). The library names the two interactive primitives and shows the planned waves. Selecting a primitive updates the module, live graph, reference cases, and URL without reloading. The two [desktop](checkpoint-02-crossfader.png) and [mobile](checkpoint-02-mobile.png) captures show the Crossfader view.

The Crossfader's Rust graph node ports the legacy C++ scalar behavior: stereo A/B inputs, position from A to B, continuous linear to equal-power curve, dry/wet mix, and 10 ms smoothing. The live demo crossfades the raw input with a lowpass copy so both sides can be heard. The deterministic fixture uses raw input A and constant 0.25 B. This distinction is shown in the graph contract.

| C++ case | Native Rust maximum error | Browser Wasm maximum error |
| --- | ---: | ---: |
| Equal power, centre | 0 | 0 |
| Equal power, sweep | 0 | 2.98e-8 |
| Linear, sweep | 0 | 0 |
| Blended curve, 75% wet | 0 | 2.98e-8 |

The six prior SVF cases still pass, with browser maximum error at or below 8.10e-7. Browser checks loaded both direct links, switched primitives, ran all ten cases, started live Crossfader audio at 48 kHz, found no page errors, and found no horizontal overflow at 390 px. `cargo test --workspace` passes 10 tests. `python3 scripts/check-svf-parity.py` and `python3 scripts/check-crossfader-parity.py` pass against the checked-in C++ fixtures.

The browser comparison caught an initial-state discrepancy in the 75% wet case. Setting mix after graph preparation applied an unintended smoothing ramp from 100%; `manifold_graph_initial_parameter` now sets the authored value before compilation. The Wasm comparison passes after that change.

Decisions for review: the library is the navigation surface for each new primitive; each view pairs interactive Rust/Wasm DSP with C++ fixture playback and differences. The live Crossfader's B input is a filtered copy of A for audible exploration, while fixture B is a fixed value for deterministic parity. No Lua runtime or Lua source is imported. Mixer remains next: its legacy pan/master behavior is not represented by `Sum2` or `LinearBlend`.
