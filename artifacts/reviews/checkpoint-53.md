# Checkpoint 53 · FilterNode and Standalone FX type 5

[Open FilterNode](http://127.0.0.1:4173/?primitive=legacy-filter) · [Open Standalone FX](http://127.0.0.1:4173/?primitive=standalone-fx) · [FilterNode screenshot](checkpoint-53-legacy-filter.png) · [FX slot screenshot](checkpoint-53-standalone-fx.png) · [Browser metrics](checkpoint-53-metrics.json) · [Migration boundary](../../docs/filter-node-migration.md)

The original Standalone FX type 5 is the two-pole `FilterNode`, separate from the `SVFNode` in type 6 and Standalone Filter. This checkpoint adds its scalar equations as an allocation-free Rust kernel, graph kind 39, a standalone browser view, and the slot's original exponential cutoff and resonance mapping. Nine original type IDs now work in the slot.

Seven C++ captures use the legacy default Highway path; one uses its scalar path. All eight show **Match** against Rust/Wasm, with largest maximum sample difference `1.19e-7`. A direct C++ scalar/Highway probe differed by at most `5.96e-8` for a stereo parameter step on this machine. Four new native Rust slot cases exercise normalized controls and type switches; the expanded slot's largest difference is `9.69e-7` across 31 cases. The full browser sweep passes **228 cases across 31 views** with zero page errors. All 72 Rust workspace tests and the Wasm and web builds pass. A live browser check started test audio, adjusted cutoff and resonance, and switched the running slot to Filter.

The Rust core does not depend on Highway or JUCE. The C++ node fixtures establish processor output parity. The slot cases establish native Rust/Wasm parity; old project-level routing and preset compatibility are still unverified.
