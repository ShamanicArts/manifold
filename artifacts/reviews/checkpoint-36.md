# Checkpoint 36 · Audio and CV slew

Try [Slew limiter](http://127.0.0.1:4173/?primitive=slew-audio) with the test oscillator or microphone, then [Slew modulation](http://127.0.0.1:4173/?primitive=slew-modulation) as a self-playing patch. The [asymmetric CV comparison plot](checkpoint-36-slew-modulation.png) shows the fast rise and slower fall; native Rust and Rust/Wasm traces overlap.

## Implemented

- Ported the original C++ SlewLimiter rise/fall divisor rule, including its per-block parameter interpolation and independent stereo channel state.
- Added `SlewAudio` and a typed `SlewControl` form of the same kernel. The graph rejects audio routed to the control form. The authored patch routes LFO → control slew → modulated gain entirely at sample rate.
- Added compact workbench controls and eleven offline cases: six C++ stereo cases and five native Rust CV patch cases. The original C++ checkout remains read-only.

## Verification

- `cargo test --workspace`: 53 core tests passed, including CV typing and changed modulation shape.
- `python3 scripts/check-slew-audio-parity.py`: all six C++/native Rust cases have zero maximum sample difference.
- `node scripts/verify-slew-worklet.mjs`: live worklet stereo slide and typed CV graph passed.
- The browser comparison runner reported **Match** for all 150 cases across 24 workbench views, with no page errors. Both new views loaded and their eleven cases matched.
- The Wasm and Vite production builds completed; the local server returned HTTP 200 for the new view.

## Decisions and limits

The audio node retains legacy sample-divisor semantics, including block-dependent interpolation after a parameter change. The control node uses that same rule with a typed CV port; its five cases are native Rust ↔ Rust/Wasm composition checks, not a claim of legacy project parity. The view uses the existing compact slider style. Base/effective slider overlays, CV mixing, sample-and-hold, and live graph editing remain open roadmap work.
