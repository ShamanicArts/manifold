# Envelope Follower migration boundary

The original `dsp/core/nodes/EnvelopeFollowerNode.cpp` copies stereo input to output and computes one envelope meter. It smooths attack, release, sensitivity, and highpass targets over 10 ms; removes DC/rumble from each detector channel; then tracks the average peak, stereo RMS, or a peak/RMS-like hybrid. The meter clamps to 0–1 after each block. The Rust node preserves these formulas and parameter ranges, including the legacy hybrid's use of the previous envelope as its smooth component.

The current graph exposes this as an **audio passthrough node with a read-only meter**. The worklet returns one bounded value when asked by the browser; the main thread plots a recent history. Seven C++ cases compare every block's meter and all stereo output samples. The readout is suitable for a UI meter or diagnostics. It is not a sample-rate control cable: a later typed `EnvelopeControl` or dual-output graph contract must route the detector internally to CV consumers without round-tripping through JavaScript. That distinction matters for ducking and envelope-driven modulation.

The legacy detector evaluates three exponentials per audio sample. It is faithful here, and it does not allocate or lock in `process()`. Before using many instances in an authored patch, profile CPU use and consider cached coefficient updates with a declared parity tolerance.
