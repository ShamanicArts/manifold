# Manifold v2

The new Manifold core: portable Rust DSP, a browser AudioWorklet host, and a JavaScript interface. This repository starts with a mostly functional port of the historical **Standalone Filter** project and an offline C++ ↔ Rust/Wasm comparison workbench. It is an independent jj history on the `manifold-v2` branch of the existing [Manifold repository](https://github.com/ShamanicArts/manifold).

## Try the first project

Requirements: Rust with `wasm32-unknown-unknown`, Node.js, and a modern browser.

```sh
cargo test --workspace
./scripts/build-wasm.sh
npm --prefix web ci
npm --prefix web run dev
```

Open the Vite URL, click **Start audio**, and choose the test oscillator or microphone. The filter executes in Rust/Wasm inside an AudioWorklet. The workbench shows a live output spectrum and compares offline Wasm output with checked-in C++ reference samples. All six reference cases should show **Match**.

The browser page works without an external audio interface; microphone mode requests browser permission. The workbench uses Canvas 2D for measurements. The Three.js/WebGPU module remains available for later spatial and media project views.

To check native Rust against the original C++ samples, run `python3 scripts/check-svf-parity.py`. The fixtures are checked in, so this does not need the old checkout. To regenerate them from an old checkout, run `python3 scripts/generate-svf-reference.py`; set `MANIFOLD_LEGACY_DIR` if that checkout is not at `../my-plugin`. Regeneration compiles the original `SVFNode.cpp` into a standalone runner and does not edit the old repository.

The first slice includes the original filter modes, cutoff, resonance, parameter smoothing, and a project descriptor. Host automation, preset conversion, OSC, MIDI, looper capture, and native plug-in packaging are subsequent slices. See [architecture](docs/architecture.md), [migration map](docs/migration.md), [primitive workbench roadmap](docs/primitive-workbench-roadmap.md), and the [first review checkpoint](artifacts/reviews/checkpoint-00.md).
