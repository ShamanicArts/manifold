# Checkpoint 86 · SVF state across host graph switches

The new Delay → SVF → Delay → SVF C++ graph probe checks another preparation rule. Old `SVFNode::prepare()` snaps its smoothed controls but retains the filter integrator state. It receives an input pulse while hidden behind a closed gate and is selected again at frame 20096. Its left output at that boundary is **7.24e-5**, proving that the state is still present. Rust already retained the state in the host-switch path. The [native comparison](checkpoint-86-svf-switch-metrics.json) and [Wasm comparison](checkpoint-86-svf-wasm-metrics.json) both have maximum difference **2.98e-8** over 32,768 stereo frames.

The [browser view](checkpoint-86-browser.png) offers SVF as a fifth audited type, selects its matching C++ case when clicked, and zooms the return plot to make the small filter tail visible. The offline result is **Match**; switching the live oscillator to SVF keeps audio running without page errors. Sixteen other effect types still need graph preparation audits.

This checkpoint also corrected the Reverb probe's stereo mixer destination from bus 2 to the old Lua slot's bus 8. The C++ capture and Rust/Wasm parity metrics did not change; the source hash and checked-in reference were refreshed. The probes reconstruct Lua routing with old C++ graph/runtime nodes and do not execute the Lua binding or deferred worker.

Verification: `python scripts/probe-fx-svf-switch.py`, `node scripts/verify-fx-svf-wasm.mjs`, `python scripts/probe-fx-reverb-switch.py`, browser comparison and live audio smoke tests, `npm run build --prefix web`. Workbench totals: 45 views, 378 offline cases (234 C++ and 144 native Rust references).
