# Checkpoint 87 · Compressor timing on host graph reprepare

The old C++ `CompressorNode::prepare()` recalculates attack and release coefficients from current targets and preserves its detector envelope. The new graph probe starts with Delay, visits Compressor at frame 8192, changes its attack/release targets at 10880, selects Delay at 11008, and returns to Compressor during an active tone at 11520. Before the fix, Rust still used the earlier timing coefficients and differed by **0.04534** maximum on return.

Rust `Compressor::reprepare()` now refreshes the two coefficients without clearing the envelope or allocating. The [native comparison](checkpoint-87-compressor-switch-metrics.json) reports maximum difference **2.24e-8**, RMS **9.43e-10** across 32,768 stereo frames. The [Wasm comparison](checkpoint-87-compressor-wasm-metrics.json) reaches the same maximum difference. The timing change is applied through public normalized controls in both runners.

The [browser view](checkpoint-87-browser.png) offers Compressor as the sixth audited host-switch type. Selecting it chooses the old C++ graph case and zooms the return window, where the C++ and Wasm stereo traces overlap. The offline result is **Match** at **2.24e-8**. Live Delay/Compressor switches keep audio running without page errors. Fifteen other effect types still need graph preparation audits.

This is a reconstructed old Lua branch layout running through old C++ graph/runtime nodes; it does not execute Lua or the deferred graph worker. The host-switch view still has no all-type JSON state export.

Verification: `python scripts/probe-fx-compressor-switch.py`, `node scripts/verify-fx-compressor-wasm.mjs`, `cargo test --workspace -q` (87 tests), `cargo fmt --all --check`, `bash scripts/build-wasm.sh`, `npm run build --prefix web`, browser comparison and live audio smoke test. Workbench totals: 45 views, 379 offline cases (235 C++ and 144 native Rust references).
