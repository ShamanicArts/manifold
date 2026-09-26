# Checkpoint 44 · Phaser in the Standalone FX slot

Open the [Standalone FX slice](http://127.0.0.1:4173/?primitive=standalone-fx). Start audio, select **Phaser**, raise **Wet mix**, and adjust rate, depth, feedback, spread, and stages. The visible spread label and help text show the old slot's narrow degree mapping. In **Offline comparison**, choose **Phaser feedback and stages**; the [stereo overlay](checkpoint-44-phaser-slot-wave.png) and [sample difference](checkpoint-44-phaser-slot-difference.png) compare native Rust with Rust/Wasm.

## Implemented

- Added historical effect type **1** to the prepared FX slot. Its five normalized controls map to the original Phaser rate, depth, feedback, spread, and six/twelve-stage behavior.
- Preserved the old wrapper's spread-unit quirk: it passes `0…1` to a setter measured in degrees. The standalone Phaser view still offers the physical `0…180°` range.
- A type switch resets Phaser state without heap allocation. Three new slot cases cover parameter changes and switches to or from Chorus and Delay. The slice now offers six types and 19 native Rust/Wasm cases.

## Verification

- `cargo test --workspace`: 63 core tests passed, including the slot's normalized Phaser mapping and spread-unit test.
- Rust/Wasm and production web builds passed. All **176** offline cases in 27 views reported **Match** with no browser page errors. The Phaser slot capture differed by at most **2.98e-7**.
- Live AudioWorklet playback continued after selecting type 1. At 390 px the six type buttons and Phaser controls produced no horizontal overflow or page errors.

## Boundary

The standalone Phaser primitive has seven C++ comparison cases. Slot cases compare native Rust with Wasm; they do not establish full legacy project routing or preset parity. A future preset importer must decide whether to retain the old narrow spread or offer an explicit corrected mapping.
