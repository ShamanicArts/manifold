# Checkpoint 73 · persistent Chorus and Delay tails

Review the [switch and tail plot](checkpoint-73-tail.png), [metrics](checkpoint-73-tail-metrics.json), [persistent-route audition](checkpoint-73-persistent.wav), [reset-route audition](checkpoint-73-reset.wav), and [routing boundary](../../docs/standalone-fx-routing.md). The audition WAVs are both raised 3× for listening, below clipping.

The repeatable [probe script](../../scripts/probe-fx-tail.py) compiles the old read-only C++ Gain, Mixer, Chorus, and StereoDelay nodes, runs a deterministic 32,768-frame switch fixture, and compares it with native Rust kernels and `LegacyFxRouting`. Delay starts selected. Chorus starts processing on its first selection at frame 8,192; Delay continues processing behind a closing gate. Delay is reselected at frame 16,384. The Rust persistent route matches C++ with **maximum `4.47e-8`** and RMS `1.01e-9` sample difference. The script fails if maximum difference exceeds `2e-6`.

A diagnostic Rust run pauses Delay while Chorus is selected and resets it on return. Relative to the old persistent route, its output after reselecting Delay differs by up to **`0.184`**, RMS `0.00654`. At frame 17,180, the old and persistent Rust left sample is `0.027742`; the reset run is near zero. This includes an impulse sent to Delay while its output gate was closed.

The fixture prepares both kernels and gates at start, unlike the old Lua wrapper's lazy first creation. It covers two effect types at native rate and an isolated slot boundary. Browser/Wasm routing, all 21 kernels, actual project scaffolding, and a CPU budget remain. The live Standalone FX workbench still uses the selected-only slot. No existing DSP behavior changed in this checkpoint.
