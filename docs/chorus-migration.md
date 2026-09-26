# Stereo Chorus migration boundary

`Chorus` ports the scalar stereo processing path of the original `dsp/core/nodes/ChorusNode.cpp`. JUCE supplies the old buffer and math helpers; the Rust node uses a prepared planar delay ring and standard math, with no JUCE dependency at runtime. The graph allocates the ring during preparation using the host sample rate and maximum block size; processing reuses it.

Parameter IDs are 0 rate (0.05–10 Hz), 1 depth (0–1), 2 voices (1–4), 3 stereo spread (0–1), 4 feedback (0–0.95), 5 LFO waveform (sine or triangle), and 6 dry/wet mix (0–1). Rate, depth, spread, feedback, and mix use the old 10 ms smoothing. Voice count and waveform change at the next sample without resetting delay or phase state. Each active voice reads a linearly interpolated delay around 12 ms with up to 20 ms modulation, then the voices are averaged. The result feeds the output mix and positive feedback path.

Seven checked-in C++ captures cover voice count, LFO waveform, fast/deep modulation, feedback, spread, wet mix, and 64-frame blocks. Native Rust agrees with these captures sample for sample on this machine; the parity gate is 0.00001 maximum absolute sample error. Browser Rust/Wasm compares to the same captures. The standalone browser project exposes the physical node parameters. The old rack effect-slot mapping and full preset behavior remain separate work.
