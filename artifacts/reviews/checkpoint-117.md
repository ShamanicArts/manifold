# Checkpoint 117 — Main FM and Sync motion in Rust

The [playable Main study](http://127.0.0.1:4173/?primitive=main-sample-blend) now exposes Normal, FM, and Sync direction controls. A prepared Rust graph controller updates oscillator pitch and sample speed once per audio block, chooses sample replay or retrigger on Sync wraps, and enables raw-sample hard sync only on the wave-facing side. The [HTML review](http://127.0.0.1:4173/main-sample-blend-review.html) shows the audio cases and original-control trace; the [sitrep](http://127.0.0.1:4173/manifold-sitrep.html) tracks the wider port.

## Evidence

- Thirteen bounded scenarios call the original `sample_synth.lua:updateBlendVoiceFrame` in a separate reference harness and the new Rust scheduler. Maximum frequency difference is **0.00001172 Hz**, maximum speed difference **0.00000002186**, and sample trigger/play counts agree. The trace covers mode changes, blend phase, directional strengths, retrigger policy, and gate changes. Run `python3 scripts/check-main-directional-trace.py` to regenerate it. Lua remains a test reference and is absent from the v2 runtime.
- Seven new Main graph captures cover a Normal baseline, three FM settings, Sync retrigger, Sync play, and Sync wave-facing hard sync. Each contains 16,384 stereo frames at 48 kHz and matches native Rust to direct Wasm exactly. FM both ways differs from its Normal baseline by up to **0.1705** per sample; Sync retrigger differs from Sync play by up to **0.4091**. Main now has **34** audio cases; the library has **452**.
- The AudioWorklet check exercises live FM oscillator-frequency and sample-cursor changes, Sync replay/retrigger, and restoration of independent hard sync after returning to Normal. Version-10 Main state saves **28** controls and opens versions 1–9 with Normal direction defaults. All **124** workspace Rust tests pass.
- Fixed-speed old C++ sample gain-stage and follower comparisons continue to pass. The seven moving-speed cases are compared against native Rust and Wasm; the C++ follower fixture has fixed-speed input and is not evidence for their full voice output.

## Boundary and next work

The original Lua trace validates selected control decisions, while the compiled C++ capture validates the isolated oscillator hard-sync kernel. Neither establishes full old Main audio parity. The study currently controls one authored voice. Old keytrack and sample-pitch mappings, per-note gate and allocation, Ring mode, Add oscillator routing, Morph selection, and preset migration remain. Next, port the old parameter mappings and compare an assembled old Main voice against a bounded Rust/Wasm render. The old Main code checks an optional ADSR field but never constructs it; an ADSR gate would be an explicit v2 design choice.
