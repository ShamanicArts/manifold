# Checkpoint 34 · FFT spectrum

Open the [FFT workbench](http://127.0.0.1:4173/?primitive=fft-spectrum) to test the new live analyzer. The page has a 32-band plot, peak frequency, smoothing and floor controls, and four selectable offline cases. The [comparison plot](checkpoint-34-fft-comparison.png) captures the 440 Hz to 1 kHz case: native Rust and Rust/Wasm bands overlap.

## Implemented

- Added a separate `FftSpectrum` graph node. It passes stereo audio through unchanged and computes a 2048-point Hann FFT every 1024 samples from the stereo average. It exposes 32 logarithmic band values and the strongest peak in hertz.
- Prepared FFT storage, twiddles, and bin mapping when the graph compiles. The process path uses fixed arrays and no heap allocation or trigonometric setup.
- Added a worklet meter request for 33 values and a compact browser plot. Existing eight-band `SpectrumAnalyzer` behavior and C++ parity remain separate.
- Added four native Rust fixtures with per-block meter captures, including a control change and 64-frame blocks.

## Verification

- `cargo test --workspace`: 51 core tests passed.
- `node scripts/verify-fft-spectrum-worklet.mjs`: stereo passthrough, 32 bounded bands, and 440 Hz peak passed.
- `npm --prefix web run build`: passed.
- Headless browser: all 139 offline cases across 22 workbench views showed **Match** with no page errors. The FFT view loaded four cases and rendered both canvases.

## Decisions and limits

The FFT view is an authored v2 analyzer, so its source comparison is native Rust ↔ Rust/Wasm; it does not claim C++ parity. Band levels use peak bin magnitude in each logarithmic band normalized against the chosen dB floor. A full first window takes 42.7 ms at 48 kHz; subsequent analyses are 21.3 ms apart. The 10 Hz browser polling rate only changes display updates. The strongest peak readout is a single spectral peak, not polyphonic pitch detection.

Hardware MIDI remains separate from this checkpoint. The Voice and Sample instrument views have an explicit **Request MIDI access** button that calls `navigator.requestMIDIAccess()` where the browser allows it. The in-app browser's hardware permission route remains unverified and may block that request before a prompt appears.
