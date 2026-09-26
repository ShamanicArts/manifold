# Checkpoint 49 · Standalone EQ8

[Open the live EQ8 workbench](http://127.0.0.1:4173/?primitive=eq8) · [Visual review](checkpoint-49-eq8.png) · [Migration boundary](../../docs/eq8-migration.md)

The old Standalone EQ project exports `EQ8Node`. This checkpoint ports its actual eight-band C++ processing path to Rust, wires it as graph kind 36, and adds a compact web workbench with band tabs. Each band exposes enable, seven filter types, frequency, gain, and Q; output gain and dry/wet mix remain global. The C++ node is run by a separate local capture tool; the legacy checkout is unchanged. JavaScript renders controls and the comparison, while the audio callback runs the Rust/Wasm graph.

Nine C++ reference cases cover all seven filter types, stereo impulses and tones, band enable/type changes, all eight bands, short blocks, and mix/output changes. All nine show **Match** in the browser; the largest maximum difference is `1.90e-4` in the enable case, close to the shared `2e-4` threshold and worth monitoring when the DSP changes. The full workbench sweep passed **189 cases across 28 views**, with zero browser page errors. Rust workspace tests passed (68), and the Wasm and web builds passed. A live browser check enabled band 4, changed its gain, started the test oscillator, and confirmed one band panel visible at a time.

The original exported project has all bands disabled at start. Band 1's exported Q default is 0.8; the other bands default to 1.0. These values are loaded before the first audio frame. Full preset/OSC roundtrips and a response-curve readout remain beyond this checkpoint. The smaller rack `EQNode` is a separate future port.
