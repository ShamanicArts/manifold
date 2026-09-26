# Review checkpoint 21: legacy Compressor

Date: 2026-09-26. Open the [Compressor workbench](http://127.0.0.1:4173/?primitive=compressor) and compare the [desktop](checkpoint-21-1365.png) and [390 px mobile](checkpoint-21-390.png) captures. The live test oscillator produced about 2 dB of gain reduction in both viewport tests. Attack set before starting audio was locked while running and editable again after stopping.

The Rust graph now includes Compressor type 24 and exposes its signed gain-reduction meter. Eight fixtures run the original C++ scalar node against Rust/Wasm, comparing stereo audio and one meter snapshot per block. The default case's maximum audio difference was `5.96e-8` and maximum meter difference was `4.77e-7`; all eight passed the `2e-4` comparison threshold. The full workbench has **103 matching browser cases** (69 C++, 34 native Rust) with no page errors, and all 18 views load through the mobile picker without horizontal overflow. All 31 Rust tests passed.

The old node shares one detector envelope between stereo channels, captures attack/release coefficients only at preparation, and ignores knee, auto makeup, mode, detector mode, and sidechain highpass in processing. The live panel shows effective controls and explains the timing limitation. See the [migration boundary](../../docs/compressor-migration.md). The next effects slice is Standalone FX type 3, whose normalized parameter mapping and slot routing need a separate comparison.

MIDI input is optional. The Connect button calls the browser Web MIDI API where available, but this checkpoint has **not** verified that the in-app browser grants hardware MIDI permission. The on-screen keyboard remains usable without it.
