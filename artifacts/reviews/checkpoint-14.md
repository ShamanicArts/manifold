# Review checkpoint 14: authored FX chain

Date: 2026-09-26. Open the [live FX chain workbench](http://127.0.0.1:4173/?primitive=fx-chain) and inspect the [desktop](checkpoint-14-1365.png) and [mobile](checkpoint-14-390.png) captures. This authored v2 graph routes stereo input through Distortion, StereoDelay, and SVF, then blends the filtered branch with the delay output. Drive, both effect mixes, delay time/feedback, filter mode/cutoff/resonance, and filter blend are live controls.

Four offline project cases cover a gentle chain, drive/feedback sweep, filter mode and cutoff change, and dry-to-wet transition. Native Rust output is the reference for the same Rust/Wasm graph. All four show **Match**, with maximum browser difference under `0.0002`. The workbench now has 65 passing cases across twelve views. Live processing starts at 48 kHz in Chromium with no page errors or horizontal overflow at 1365 px and 390 px.

The old Standalone FX project is a **single swappable slot** with 21 effect type IDs, normalized context-sensitive parameters, and a dry initial mix. This chain is a composition study, not a preset-compatible port. In particular, its old WaveShaper differs from v2 Distortion. The [migration boundary](../../docs/standalone-fx-migration.md) records the public type and parameter contract and the need for block-boundary graph replacement with an explicit tail policy.

Next: port the old slot behavior for the first supported types without paying to process unselected effects, then continue remaining effect primitives. The current chain verifies that separately ported kernels can participate in one playable project before that dynamic selection contract is implemented.
