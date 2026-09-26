# Manifold v2

The new Manifold core: portable Rust DSP, a browser AudioWorklet host, and a JavaScript/Three.js WebGPU interface. This repository starts with a mostly functional port of the historical **Standalone Filter** project. It is an independent jj history on the `manifold-v2` branch of the existing [Manifold repository](https://github.com/ShamanicArts/manifold).

## Try the first project

Requirements: Rust with `wasm32-unknown-unknown`, Node.js, and a modern browser.

```sh
cargo test --workspace
./scripts/build-wasm.sh
npm --prefix web ci
npm --prefix web run dev
```

Open the Vite URL, click **Start audio**, and choose the test oscillator or microphone. The audio filter executes in Rust/Wasm inside an AudioWorklet. Three.js renders a frequency display on its own animation loop. If WebGPU is unavailable, Three.js can use its WebGL2 backend.

For a GPU-less browser test, add `?webgl=1` to force the WebGL2 backend. The browser page works without an external audio interface; microphone mode requests browser permission.

The first slice includes the original filter modes, cutoff, resonance, parameter smoothing, and a project descriptor. Host automation, preset conversion, OSC, MIDI, looper capture, and native plug-in packaging are subsequent slices. See [architecture](docs/architecture.md) and [migration map](docs/migration.md).
