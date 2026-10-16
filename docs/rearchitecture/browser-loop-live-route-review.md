# Authored loop routes in the browser

29 September 2026. The [Graph workspace](https://wubulon.tailfac9f9.ts.net:4173/?primitive=graph-workspace) now has **Load authored loop route demo**. It loads the same four-node `authored-live-loop-route.json` topology used in the CLAP/VST3 REAPER probes, with a half-second 220 Hz take as a browser review source. Start the instrument, then change node 4 **A · Audio** from **2 · Loop capture out** to **Unconnected** and back. Sound follows the edge while the Rust/Wasm graph keeps running. **Download graph project** includes the PCM and edited route; **Open graph project** restores them.

[Browser screenshot](evidence/web-loop-live-route.png) · [Measured browser result](evidence/web-loop-live-route.json) · [Worklet/save test](../../web/tests/live-authoring.test.js)

The headless Chromium probe accessed the Tailscale URL at 48 kHz. Its private PipeWire server exposed only `manifold_null`, and Chromium's sink input was linked to that sink. The analyser measured 0.1434 RMS before unplugging, 0 while unplugged, 0.0990 after reconnecting, and 0.1406 after opening the exported project in a fresh audio graph. The exported project had 24,000 stereo frames on LoopCapture node 2, the restored edge, and no page errors. The separate Wasm test checks exact PCM and also connects a previously parked loop. Reproduce with:

```sh
./scripts/build-wasm.sh
npm --prefix web test
npm --prefix web run build
MANIFOLD_SITE_URL=https://wubulon.tailfac9f9.ts.net:4173 \
  python3 scripts/with-private-null-audio.py node scripts/verify-graph-loop-live-browser.mjs
```

This is a route-only transaction over prepared nodes. The browser still needs off-callback structural publication for add/remove or resource replacement while sounding. The live route session currently owns the signal slice while the Graph workspace owns the PCM asset; the full project transaction must unify those before concurrent asset and route edits can be claimed. Longer takes, simultaneous capture and routing, and callback timing under load remain open gates. This demo does not establish legacy Main parity.
