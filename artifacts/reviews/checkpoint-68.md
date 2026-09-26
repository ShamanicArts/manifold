# Checkpoint 68 · Standalone FX export defaults and routing audit

Review the [Standalone FX workbench](http://127.0.0.1:4173/?primitive=standalone-fx), [startup screenshot](checkpoint-68-standalone-fx.png), [browser metrics](checkpoint-68-metrics.json), and [routing notes](../../docs/standalone-fx-migration.md).

The v2 project descriptor now starts with the original `Standalone_FX` public values: type `0` (Chorus), mix `0` (dry), and normalized `p/0…p/4` values `[0.5, 0.5, 0.2, 0.6, 0.4]`. The local comparison checked those defaults directly against the old project manifest. The workbench explains why startup is dry and lets the user raise Wet mix to hear Chorus. A live browser check started audio, raised mix to `0.80`, and showed no page errors. All 79 slot comparisons still show **Match** against native Rust. The web build passes.

The old Lua slot keeps instantiated effects processing behind smoothed output gates, even when another type is selected. The v2 slot processes only the selected effect and resets it on selection. This is an explicit CPU and state tradeoff, documented in the migration boundary; it means an old tail may return after switching back, while the v2 tail will not. The legacy dry/wet routing also uses multiple Gain and Mixer nodes, so exact switch-envelope parity and preset import still require a full-project reference and a state-format decision.
