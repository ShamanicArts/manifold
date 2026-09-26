# Checkpoint 91 · Transient Shaper host switch

The [FX host switch workbench](http://127.0.0.1:4173/?primitive=standalone-fx-host) now offers Transient Shaper as its ninth audited effect. The [browser capture](checkpoint-91-browser.png) shows a running graph and the Delay → Transient → Delay → Transient C++ comparison reporting **Match**. The offline case sets attack to `0.6` and sustain to `−0.6` on first selection so returning envelope state has an audible effect.

The [old C++ graph-runtime capture versus native Rust](checkpoint-91-transient-switch-metrics.json) initially differed by `0.146` on the return visit. The old `prepare()` clears both fast and slow envelope followers and its meter on each graph switch. Rust host-switch mode now mirrors that preparation reset without allocation in processing. The final native Rust and [Rust/Wasm comparison](checkpoint-91-transient-wasm-metrics.json) differ from C++ by at most **1.49e-7** over 32,768 stereo frames; the returning Transient segment differs by at most **5.96e-8**.

I also corrected the preceding BitCrusher capture's mixer route from Ring Mod's port to BitCrusher's own Lua slot port. The [updated BitCrusher metrics](checkpoint-90-bitcrusher-switch-metrics.json) retain the same `2.98e-8` maximum sample difference, and the audio fixture is byte-identical. Its source hash in the manifest now points to the corrected capture source.

The C++ reference is a reconstructed Lua slot graph using the original graph runtime and nodes. It does not execute the Lua binding or deferred graph worker. Twelve of 21 effect types still need host graph preparation audits. Native C++ probes now place compiler scratch in this repository's `target` directory so concurrent `/tmp` use cannot interrupt the capture.

Verification: `python3 scripts/probe-fx-transient-switch.py`, `node scripts/verify-fx-transient-wasm.mjs`, Rust workspace tests, formatting check, Wasm and web builds, and local Chromium live and comparison smoke test. Workbench totals: 45 views, 382 offline cases (238 C++ and 144 native Rust references).
