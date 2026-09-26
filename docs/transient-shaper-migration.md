# Transient Shaper migration boundary

The original `dsp/core/nodes/TransientShaperNode.cpp` runs independent fast and slow envelope followers on each stereo channel. Rust graph kind 43 ports that scalar processing path and exposes its block-mean transient meter. The [workbench](../projects/transient-shaper/project.json) shows attack, sustain, sensitivity, and wet mix alongside a live meter and offline C++ comparison.

Parameters 0–3 are attack (`−1…1`), sustain (`−1…1`), sensitivity (`0.1…4`), and wet mix (`0…1`). These smooth per sample over 10 ms. Fast envelope attack/release are 1/20 ms; slow envelope attack/release are 20/300 ms. The difference between the followers drives attack and body gains, each bounded to `0…4`, then their product is bounded again. The meter reports the average absolute transient value across both channels for each block. The Rust implementation needs no JUCE and allocates nothing during processing.

Standalone FX type 16 maps normalized `p/0` and `p/1` to attack and sustain `−1…1`, and `p/2` to sensitivity `0.2…4`. It keeps internal mix fully wet. The other two normalized controls are unused by the old Lua definition.

Seven checked-in C++ captures cover attack, sustain, sensitivity, mix, stereo detector independence, and 32-frame meter blocks. Audio and meter output show **Match** against Rust/Wasm with zero observed sample difference on this machine. Four slot cases compare native Rust with Rust/Wasm for normalized controls and type switches. These establish node output parity and v2 slot consistency; old project routing and preset roundtrips remain separate work.
