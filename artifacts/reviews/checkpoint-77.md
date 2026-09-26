# Checkpoint 77 · persistent FX control state

Open the [persistent FX workbench](http://127.0.0.1:4173/?primitive=standalone-fx-routing), inspect its [browser capture](checkpoint-77-browser.png), or download the [example state](checkpoint-77-state.json).

The persistent view now remembers its selected effect, wet mix, and five controls for all 21 types when another primitive is opened. Its export/import uses `schemaVersion: 2`, project ID `manifold.standalone-fx-routing`, and `routingMode: "persistent"`. The original selected-only view keeps its version 1 document and separate session state. Both importers reject the other format before changing controls.

Local Chromium verified a Chorus selection survived a round trip through the original view, exported a version 2 JSON file, restored Chorus from that file after selecting Delay, and rejected version 1 in the persistent view and version 2 in the original view. No page errors appeared. The Vite production build passes. The [state contract](../../docs/standalone-fx-state.md) records the two formats.

These documents save public controls and remembered per-type controls. They do not serialize internal effect buffers or tails: starting a new audio graph resets that DSP memory. Preserving a playing tail through graph replacement would need a separate audio-state contract.
