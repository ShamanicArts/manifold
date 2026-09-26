# Manifold v2

The new Manifold core: portable Rust DSP, a browser AudioWorklet host, and a JavaScript interface. The primitive library currently has interactive **SVF filter**, **Crossfader**, **Mixer**, **Voice synth**, and **Oscillator** views. SVF, Crossfader, Mixer, and Oscillator have checked-in C++ ↔ Rust/Wasm comparisons; Voice synth has native Rust ↔ Wasm timing cases. It is an independent jj history on the `manifold-v2` branch of the existing [Manifold repository](https://github.com/ShamanicArts/manifold). Legacy Lua supplies behavior and visual references only; no Lua is loaded into v2.

## Try the primitive workbench

Requirements: Rust with `wasm32-unknown-unknown`, Node.js, and a modern browser.

```sh
cargo test --workspace
./scripts/build-wasm.sh
npm --prefix web ci
npm --prefix web run dev
```

Open the Vite URL and choose a primitive from the library. Each view has working controls and a direct link such as `?primitive=oscillator`. For the filter, Crossfader, and Mixer, click **Start audio** to hear the test oscillator or microphone through the selected Rust/Wasm graph. For Voice synth, click **Start instrument** and play its keyboard or A–K shortcuts. Oscillator also starts directly as an instrument. The workbench shows a live output spectrum and offline comparisons. All 27 cases should show **Match**; five voice cases compare native Rust with Wasm, while 22 audio primitive cases compare C++ with Wasm. The browser view does not request external MIDI device permission.

The browser page works without an external audio interface; microphone mode requests browser permission. The workbench uses Canvas 2D for measurements. The Three.js/WebGPU module remains available for later spatial and media project views.

To check native Rust against the original C++ samples, run `python3 scripts/check-svf-parity.py`, `python3 scripts/check-crossfader-parity.py`, `python3 scripts/check-mixer-parity.py`, and `python3 scripts/check-oscillator-parity.py`. The fixtures are checked in, so this does not need the old checkout. To regenerate them from an old checkout, run the matching `scripts/generate-*-reference.py`; set `MANIFOLD_LEGACY_DIR` if that checkout is not at `../my-plugin`. Regeneration compiles the original C++ node into a standalone runner and does not edit the old repository. Mixer and Oscillator fixture generation also need `pkg-config` and Highway (`libhwy`). Voice timing fixtures come from `python3 scripts/generate-voice-reference.py` and need only the Rust workspace.

The first slices include the original filter modes, cutoff, resonance, Crossfader position/curve/mix, Mixer gain/pan/master for up to 32 buses, five standard Oscillator waveforms, a new timed note contract and eight voice instrument, parameter smoothing, and executable project graph descriptors. External MIDI input, host automation, preset conversion, OSC, looper capture, and native plug-in packaging are subsequent slices. See [architecture](docs/architecture.md), [graph contract](docs/graph-contract.md), [event contract](docs/event-contract.md), [migration map](docs/migration.md), [primitive workbench roadmap](docs/primitive-workbench-roadmap.md), and [latest review checkpoint](artifacts/reviews/checkpoint-05.md).
