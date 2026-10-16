# Output probe

An audio plug-in example with two custom analysis displays:

- **Live input → Gain → Output** is the audio path. Select Gain and change
  **Output gain** in the inspector.
- **Output.analysis → Level meter** shows the current output RMS in dBFS.
- **Output.analysis → Level history** plots measured output RMS over the last
  eight seconds. It is a level history, not a waveform or a generated animation.

Start audio, then change Output gain from `0.5` to `0.125`. Both displays should
fall by about 12 dB. Disconnecting one analysis cable stops only that display;
the audio path and the other display continue. Undo reconnects it.

The display floor and history duration are local visual settings. They change
the view, not the sound. Each visual has its own definition and source module;
`levels.mjs` is an ordinary shared project helper. All three source files appear
under `Files/nodes` in Studio. The example uses the existing web-surface contract
on browser and Linux standalone hosts, without adding an example-specific host.

Generate the loadable document with:

```sh
node scripts/generate-studio-output-probe.mjs
node scripts/generate-studio-output-probe.mjs --check
```

The result is `web/public/studio/output-probe.manifold.json`. Open it in Studio
or pass it to `target/release/manifold-app`. The root source remains editable;
new Studio graph edits use the normal `studioGraph` declaration.

The graph identifies custom definitions and their analysis role, and the
inspector names actual connected sources. Fit now uses the same node bounds as
the graph renderer instead of assuming every node is 240 world units tall.

Review scripts: `web/review-output-probe.mjs` and
`web/review-output-probe-native.py`. The browser script checks the dB response,
independent disconnection/undo, node bounds after Fit and renderer errors. The
native script checks the actual standalone app and verifies its RMS response
through published host telemetry. Automated playback uses private/null sinks.

This example exposed a native telemetry defect: the standalone had been sending
its peak value as `rms` to presentations. It now calculates actual stereo RMS
before monitor volume and publishes peak separately. A signal test distinguishes
RMS from peak and covers one silent stereo channel. This does not add native
frequency-band analysis or claim identical analysis-window lengths across hosts.

Review results (11 October 2026): Gain /4 measured 11.95 dB lower in the browser
and 11.80 dB lower over sampled standalone observations (ideal: 12.04 dB).
Browser disconnection/undo checks pass; all five nodes remain in bounds after
Fit. The meter's native RMS was below peak for the saw input, as expected.
Six affected app/UI Rust tests, release standalone, UI Wasm and web builds pass.
The generated example's freshness check passes. Earlier unrelated gain-range
suite failures remain recorded in the component delivery notes.

[Browser view](../../web/public/studio/2026-10-11-output-probe/browser.jpg) ·
[Standalone view](../../web/public/studio/2026-10-11-output-probe/native-low.jpg) ·
[Browser checks](../../web/public/studio/2026-10-11-output-probe/results.json) ·
[Standalone checks](../../web/public/studio/2026-10-11-output-probe/native-results.json)
