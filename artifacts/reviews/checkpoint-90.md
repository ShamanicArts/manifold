# Checkpoint 90 · BitCrusher host switch

The [FX host switch workbench](http://127.0.0.1:4173/?primitive=standalone-fx-host) now offers BitCrusher as its eighth audited effect. The [browser capture](checkpoint-90-browser.png) shows live BitCrusher controls and the Delay → BitCrusher → Delay → BitCrusher C++ comparison reporting **Match**. Its default Normal mode ignores the unused second input bus; this differs from Ring Mod, whose old graph reads that bus as silent modulation.

The [old C++ graph-runtime capture versus native Rust](checkpoint-90-bitcrusher-switch-metrics.json) exposed a `0.341` maximum difference after BitCrusher was selected again. The original `prepare()` clears both held samples and hold counters on each graph switch. Rust host-switch mode now resets those values when a visited BitCrusher is prepared again. The final native Rust and [Rust/Wasm capture](checkpoint-90-bitcrusher-wasm-metrics.json) each differ from C++ by at most **2.98e-8** over 32,768 stereo frames. The returning BitCrusher segment differs by at most **2.24e-8**.

The capture uses the old default Highway BitCrusher in a reconstructed Lua slot graph. It exercises graph preparation and Delay continuity, while the nine separate BitCrusher cases cover its normal, XOR, and gate signal paths. It does not execute the Lua binding or deferred graph worker. Thirteen of the 21 effect types still need host graph preparation audits.

Verification: `python3 scripts/probe-fx-bitcrusher-switch.py`, `node scripts/verify-fx-bitcrusher-wasm.mjs`, Rust workspace tests, formatting check, Wasm and web builds, and local Chromium live and comparison smoke test. Workbench totals: 45 views, 381 offline cases (237 C++ and 144 native Rust references).
