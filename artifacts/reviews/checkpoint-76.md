# Checkpoint 76 · persistent FX callback cost

Review the [callback chart](checkpoint-76-callback-budget.png), [native timings](checkpoint-76-native.csv), [Wasm timings](checkpoint-76-wasm.csv), and reproducible [native](../../crates/manifold-core/examples/bench_fx_slot.rs) and [Wasm](../../scripts/bench-fx-slot-wasm.mjs) runners.

On this AMD Ryzen 9 3900X, with 128-frame callbacks at 48 kHz, each runner warmed 128 callbacks and measured three batches of 512. Median of batch medians and median of batch p95s:

| Route | Native median / p95 | Wasm median / p95 |
| --- | ---: | ---: |
| Selected-only Delay | 3.5 / 4.9 µs | 4.1 / 6.0 µs |
| Persistent, Delay visited | 7.4 / 10.6 µs | 8.2 / 12.3 µs |
| Persistent, Delay + Chorus visited | 23.5 / 34.2 µs | 22.3 / 35.1 µs |
| Persistent, all 21 visited | 107.4 / 149.8 µs | 172.9 / 227.9 µs |

The all-visited Wasm median is **6.5% of a 2,667 µs audio block**; its measured p95 is 8.5%. This is one DSP graph on one desktop CPU. The runs use a fixed stereo sine block, include the graph call in Wasm, and exclude the AudioWorklet, browser scheduling, host scaffolding, and other concurrent audio work. Some individual maxima exceed the p95 by a large margin, consistent with ordinary OS/Node interruptions; this is not a deadline guarantee.

Decision: keep the persistent route opt-in and keep visited kernels alive. We have no evidence yet for a safe automatic tail expiry that would preserve old behavior. Next performance check should measure the whole AudioWorklet on a modest device and include graph complexity and simultaneous voices.
