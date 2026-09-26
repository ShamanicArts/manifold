# Ring Modulator migration boundary

The original `dsp/core/nodes/RingModulatorNode.cpp` accepts a stereo carrier on input 0 and an optional stereo audio modulator on input 1. When the second input is absent, its own oscillator drives both channels with an adjustable phase spread. Rust graph kind 42 preserves these two routes and does not require the second port to be connected. The [workbench](../projects/ring-modulator/project.json) exposes the internal oscillator; one C++ comparison case connects the same stereo input to both ports to exercise the external route.

Parameters 0–4 are frequency (`0.1…8000 Hz`), depth (`0…1`), internal wet mix (`0…1`), stereo spread (`0…180°`), and enabled (`0/1`). Frequency, depth, mix, and spread smooth per sample over 10 ms. An external modulator sample is clamped to `−1…1`; while that bus is connected, the internal oscillator phase does not advance. Disabling the node outputs silence and resets current depth and mix to zero, matching the old gate behavior. The Rust kernel has no JUCE dependency and uses no allocation in processing.

Standalone FX type 12 maps normalized `p/0` exponentially to `20…2000 Hz`, `p/1` to depth, and `p/2` to `0…180°` spread. It keeps internal mix fully wet and uses the built-in oscillator. The other two normalized controls are unused by the original Lua definition.

Seven checked-in C++ captures cover internal frequency, depth, spread, mix, enable gating, and the external bus. All show **Match** against Rust/Wasm; the largest observed maximum sample difference is `2.98e-8`. Four slot cases compare native Rust with Rust/Wasm for normalized controls and type switches. These establish node output parity and v2 slot consistency; old project routing and preset roundtrips remain separate work.
