# Checkpoint 41 · Legacy stereo Phaser

Open the [Stereo phaser workbench](http://127.0.0.1:4173/?primitive=phaser). Start audio, switch between six and twelve stages, and adjust feedback and stereo spread while the test signal plays. In **Offline comparison**, select **Stage switch** to compare the same change against the original C++ node. The [output overlay](checkpoint-41-phaser-wave.png) and [sample difference](checkpoint-41-phaser-difference.png) show that capture.

## Implemented

- Ported the original stereo `PhaserNode` all-pass cascade to a Rust graph kernel with twelve fixed stage slots, rate/depth/feedback/spread smoothing, immediate stage selection, and physical-degree stereo spread.
- Added Wasm graph construction and parameter updates, an authored browser project, seven checked-in C++ captures, a native Rust render/parity check, and a browser comparison view with stereo peak and spectrum output.
- Documented the original Main rack wrapper's spread-unit mismatch: it sends a normalized 0–1 value to a setter measured in degrees. This primitive exposes degrees; preset migration will need an explicit compatibility choice.

## Verification

- `cargo fmt --all --check` and `cargo test --workspace`: 59 core tests passed.
- `python3 scripts/check-phaser-parity.py`: all seven C++/native Rust cases passed; worst per-sample absolute error **0.00000054**, under the **0.00001** gate.
- Browser Rust/Wasm: all seven Phaser cases reported **Match**. Live AudioWorklet playback continued while stage and feedback controls changed; no page errors.
- The production build passed. The full browser sweep reported **163 Match** results across 26 views, with no page errors.

## Boundary

This ports the standalone C++ scalar Phaser behavior. The Main rack effect slot and its preset mapping are still separate work; [migration notes](../../docs/phaser-migration.md) record the spread decision they require. The comparison runs at the fixture's sample rate and captures seven chosen parameter scenarios, rather than claiming every possible host rate or automation sequence.
