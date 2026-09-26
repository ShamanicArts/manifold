# Checkpoint 84 · Phaser host graph switch

The FX host switch view now offers Chorus, Phaser, and Delay. The new Delay → Phaser → Delay case reconstructs the old Lua FX slot's branch graph using the old C++ `PrimitiveGraph`, `GraphRuntime`, scalar Gain/Mixer nodes, Phaser, and StereoDelay. On type changes, the Rust host-switch path now resets Phaser phase and all-pass state as the old node's `prepare()` does. Delay retains its ring when the old graph reuses that node.

[Native comparison metrics](checkpoint-84-phaser-switch-metrics.json): maximum difference **6.71e-8**, RMS **3.29e-9** over 32,768 stereo frames. The C++ graph reported zero continuity transfers when Phaser was first added and one when Delay was reselected. The returned Delay samples at frames 16384 and 16385 matched exactly. This is a measured reconstruction, not an execution of the Lua binding or deferred graph worker.

The [browser capture](checkpoint-84-browser.png) shows the new case selected by clicking Phaser. Rust/Wasm reports **Match**, maximum **8.20e-8**; the earlier Chorus case remains **Match** at **4.25e-7**. A live oscillator switch Delay → Phaser ran without a page error. The browser now selects the matching offline host case as the effect type changes. Other eighteen effects still require their own graph preparation audit.

Verification: `python scripts/probe-fx-phaser-switch.py`, `cargo test --workspace -q` (87 tests), `cargo fmt --all --check`, `bash scripts/build-wasm.sh`, `npm run build --prefix web`, Chromium comparison and live audio smoke test. Workbench totals: 45 views and 376 offline cases (232 C++ and 144 native Rust references).
