# Checkpoint 69 · Standalone FX v2 state roundtrip

Review the [Standalone FX workbench](http://127.0.0.1:4173/?primitive=standalone-fx), [browser screenshot](checkpoint-69-fx-state.png), [roundtrip metrics](checkpoint-69-metrics.json), [exported state JSON](checkpoint-69-state.json), and [state contract](../../docs/standalone-fx-state.md).

The workbench can now download and reopen a versioned v2 JSON state. It stores all seven public host values and five remembered normalized controls for each of the 21 effect types. The importer checks project ID, version, type, array completeness, and finite normalized values before applying the state. Import is disabled while audio runs; starting afterward prepares the Rust/Wasm effect slot from the restored values. This format contains no Lua and does not claim to read old JUCE plug-in states.

A browser roundtrip changed Shimmer and Granulator controls, downloaded the state, changed the workbench, imported it, restored Shimmer at `0.70` wet, switched to Granulator and recovered a `119 ms` grain size, then switched back and started audio. A wrong project ID was rejected. The exported document contains all 21 effect settings; the import control disabled during playback and there were zero page errors. The Standalone FX view still passes **79 native Rust/Wasm comparison cases**. The web build passes. The broader workbench baseline remains **373 cases across 43 views** from checkpoint 66.

The old wrapper keeps instantiated effects processing behind smoothed gates. The v2 slot processes only the selected effect, so effect tails and transition envelopes are not legacy plug-in equivalent. A host-facing state adapter and legacy preset importer remain separate work.
