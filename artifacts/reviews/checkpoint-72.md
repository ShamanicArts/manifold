# Checkpoint 72 · old FX routing gain probe

Review the [gain envelope plot](checkpoint-72-routing.png), [measurements](checkpoint-72-routing.json), [routing boundary](../../docs/standalone-fx-routing.md), [C++ probe](../../tools/legacy-fx-routing-probe.cpp), and [native Rust module](../../crates/manifold-core/src/fx_routing.rs).

The probe reproduces the old `fx_slot.lua` dry Gain, two effect gates, wet Mixer, wet trim, and output Mixer with the original C++ scalar nodes. Both effect outputs are identity signals so that routing gain can be measured without effect-kernel differences. At 48 kHz, the probe moves from dry to a 1.4× wet trim, switches to a 1.1× wet trim, then switches back. The old internal slot settles near **0.707 dry**, **0.700 wet A**, and **0.550 wet B** relative to input. The two centered Mixer passes on wet audio explain the `0.5` factor before trim. All Gain transitions use 10 ms smoothing.

`LegacyFxRouting` is a separate allocation-free Rust routing component. Its native example matches the old C++ probe **exactly across 8,192 stereo frames**; the analytical model differs from C++ by at most `9.46e-7`. `cargo test --workspace -q` passed 86 tests. The probe script compiles the old read-only source, runs both captures, checks maximum difference, and exports the metrics and plot.

This establishes routing gain only. The browser still runs the cheaper selected-only `EffectSlot`; it does not yet process old effect tails through the new routing component. A complete C++ plug-in path capture, real effect-kernel lifetime, Wasm integration, and CPU budget remain before claiming legacy project parity. The old project may add gain outside this slot boundary.
