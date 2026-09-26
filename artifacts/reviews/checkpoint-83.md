# Checkpoint 83 · FX host switch in the browser

The new [FX host switch view](http://127.0.0.1:4173/?primitive=standalone-fx-host) exposes graph kind 53 with Chorus and Stereo Delay controls. Its offline case plays the same Delay → Chorus → Delay sequence as the reconstructed old C++ `PrimitiveGraph` / `GraphRuntime` branch graph. The reference fixture is checked in under `web/public/reference/standalone-fx-host/`; `scripts/make-fx-host-fixture.mjs` packages the capture from checkpoint 80.

The browser comparison reports **Match**, maximum sample difference **4.25e-7** and RMS difference **2.95e-9** across 32,768 stereo frames at 48 kHz. The [browser capture](checkpoint-83-browser.png) shows the returning-tail window and overlaid stereo output. A Chromium run also started the test oscillator, switched Chorus → Delay while audio was running, and found no page errors. The adjacent prepared-tail view still reports **Match** (maximum **4.32e-7**).

The C++ fixture reconstructs the old Lua FX slot branch layout with old C++ graph and scalar effect nodes; it does not execute Lua, the JUCE plug-in shell, or the old deferred graph worker. Kind 53 currently audits reprepare behavior for Chorus and Stereo Delay only. The new view does not offer the all-type JSON state format yet.

Verification: `npm run build --prefix web`, `git diff --check`, Chromium offline comparison and live-switch smoke test. Workbench totals: 45 views, 375 offline cases (231 C++ and 144 native Rust references).
