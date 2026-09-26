# Manifold v2

The new Manifold core: portable Rust DSP, a browser AudioWorklet host, and a JavaScript interface. The primitive library currently has interactive **SVF filter**, **Crossfader**, and **Mixer** views, with checked-in C++ ↔ Rust/Wasm comparisons. It is an independent jj history on the `manifold-v2` branch of the existing [Manifold repository](https://github.com/ShamanicArts/manifold). Legacy Lua supplies behavior and visual references only; no Lua is loaded into v2.

## Try the primitive workbench

Requirements: Rust with `wasm32-unknown-unknown`, Node.js, and a modern browser.

```sh
cargo test --workspace
./scripts/build-wasm.sh
npm --prefix web ci
npm --prefix web run dev
```

Open the Vite URL and choose a primitive from the library. Each view has working controls and a direct link such as `?primitive=mixer`. Click **Start audio** to hear the test oscillator or microphone through the selected Rust/Wasm graph. The workbench shows a live output spectrum and compares offline Wasm output with checked-in C++ samples. All fourteen cases should show **Match**.

The browser page works without an external audio interface; microphone mode requests browser permission. The workbench uses Canvas 2D for measurements. The Three.js/WebGPU module remains available for later spatial and media project views.

To check native Rust against the original C++ samples, run `python3 scripts/check-svf-parity.py`, `python3 scripts/check-crossfader-parity.py`, and `python3 scripts/check-mixer-parity.py`. The fixtures are checked in, so this does not need the old checkout. To regenerate them from an old checkout, run the matching `scripts/generate-*-reference.py`; set `MANIFOLD_LEGACY_DIR` if that checkout is not at `../my-plugin`. Regeneration compiles the original C++ node into a standalone runner and does not edit the old repository. Mixer fixture generation also needs `pkg-config` and Highway (`libhwy`).

The first slices include the original filter modes, cutoff, resonance, Crossfader position/curve/mix, Mixer gain/pan/master for up to 32 buses, parameter smoothing, and executable project graph descriptors. Host automation, preset conversion, OSC, MIDI, looper capture, and native plug-in packaging are subsequent slices. See [architecture](docs/architecture.md), [graph contract](docs/graph-contract.md), [migration map](docs/migration.md), [primitive workbench roadmap](docs/primitive-workbench-roadmap.md), and [latest review checkpoint](artifacts/reviews/checkpoint-03.md).
