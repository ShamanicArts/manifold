# Limiter migration boundary

The scalar `dsp/core/nodes/LimiterNode.cpp` is the C++ reference for Rust graph type 25. It links stereo channels by taking the larger absolute sample each frame. Gain clamps immediately when the peak exceeds the threshold, then rises with a release coefficient. Threshold, release, makeup, soft clip, and wet mix each smooth over 10 ms. Soft clip applies `tanh(wet × drive) / drive` after makeup when enabled. The meter reports the **block average** of positive gain reduction in dB; it is not the final sample's reduction.

Seven C++ fixtures compare complete stereo audio and the meter after every block against Rust/Wasm. They cover default and hard limiting, dry mix with detector activity, changes to all controls, soft clip, and 64/256 frame blocks. The largest measured meter difference is around `1.01e-4 dB` in the multi-control sweep, below the workbench's `2e-4` threshold. The direct AudioWorklet smoke check in `scripts/verify-limiter-worklet.mjs` runs the prepared graph without a browser compositor.

The original Standalone FX type 15 also uses this Limiter, with a separate normalized parameter mapping. The individual node port does not imply that type 15's slot routing or project presets are complete. The v2 workbench uses a lower default threshold (`−18 dB`) than the C++ node (`−1 dB`) so the live test oscillator visibly exercises reduction.
