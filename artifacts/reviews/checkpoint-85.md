# Checkpoint 85 · Reverb tail reset on host graph switches

The old C++ graph probe switches Delay → Reverb → Delay → Reverb at frames 8192, 16384, and 24576. Before the fix, Rust retained Reverb's hidden tail on the final selection: maximum output difference **0.10336**. The old `ReverbNode::prepare()` calls JUCE Reverb `reset()`, clearing its comb and all-pass buffers whenever the branch graph recompiles.

Rust now invalidates prepared Reverb ring entries with generation stamps and resets its smoothing state when an already visited Reverb is prepared again. The reset is constant time except on a generation wrap; it allocates no memory on a switch. At 48 kHz the stamps use about **111 KB** per Reverb instance. The [native comparison](checkpoint-85-reverb-switch-metrics.json) and [Wasm comparison](checkpoint-85-reverb-wasm-metrics.json) both report maximum difference **3.00e-7** across 32,768 stereo frames, with **exact silence** throughout the returned Reverb segment. Existing Rust tests pass.

The [FX host switch browser view](checkpoint-85-browser.png) now offers Reverb alongside Chorus, Phaser, and Delay. Clicking Reverb selects its old C++ graph case, shows **Match** at **3.00e-7**, and labels the flat return plot as a cleared tail. Live oscillator switching Delay → Reverb stays running without a page error.

The Node/Wasm 128-frame Reverb callback median rose from about **9.2 µs** to **12.6 µs** in the local probe; the median type-switch call remained below **0.5 µs**. These numbers are local Node measurements, not a browser real-time guarantee. The capture reconstructs the old Lua branch layout with C++ graph/runtime nodes; it does not execute Lua or the old deferred worker. Seventeen other FX types still need graph preparation audits.

Verification: `python scripts/probe-fx-reverb-switch.py`, `node scripts/verify-fx-reverb-wasm.mjs`, `cargo test --workspace -q` (87 tests), `cargo fmt --all --check`, `bash scripts/build-wasm.sh`, `npm run build --prefix web`, `node scripts/bench-fx-reverb-wasm.mjs`, and Chromium browser comparison. Workbench totals: 45 views, 377 offline cases (233 C++ and 144 native Rust references).
