# Checkpoint 93 · FilterNode host switch

The [FX host switch workbench](http://127.0.0.1:4173/?primitive=standalone-fx-host) now offers the old two-pole FilterNode as its eleventh audited effect type, including Delay → Filter → Delay → Filter. The [return-visit waveform](checkpoint-93-filter-return.png) overlays the old C++ graph and Rust output; the lower panel shows the absolute sample difference.

The first C++ capture matched Rust on the initial Filter visit but differed by **0.096** at the return. Old `FilterNode::prepare()` clears both integrators when the host graph recompiles. Rust host-switch mode now does the same while preserving the Delay tail. [Native metrics](checkpoint-93-filter-switch-metrics.json) and [Rust/Wasm metrics](checkpoint-93-filter-wasm-metrics.json) differ from the old C++ output by at most **2.24e-8** over 32,768 stereo frames. The C++ capture uses the FilterNode's default Highway path; the Rust core has no Highway dependency.

Verification: `python3 scripts/probe-fx-filter-switch.py`, `node scripts/verify-fx-filter-wasm.mjs`, the Wasm and Vite builds, Rust workspace tests, formatting, and the focused browser MIDI request-state test. Live browser interaction was not confirmed this checkpoint: the in-app browser automation backend was unavailable and the headless page became unresponsive after its initial title rendered. The local server serves the rebuilt page. Workbench totals: 45 views, **384 offline cases** (240 C++ and 144 native Rust references).

This probe reconstructs the old Lua slot layout with the old C++ graph runtime and nodes. It does not run the Lua binding, deferred graph worker, or full plug-in state path.
