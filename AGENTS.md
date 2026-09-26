# Manifold v2 agent notes

Manifold v2 is a new Rust audio engine and JavaScript browser environment. The historical JUCE/Lua implementation is the behavior reference at `/home/shamanic/dev/my-plugin`; do not edit it as part of this project.

## Version control

Use Jujutsu (`jj`) for status, diffs, descriptions, bookmarks, and pushes. This repository has an independent root and the `manifold-v2` bookmark on `https://github.com/ShamanicArts/manifold.git`. Do not use Git to stage or create commits. Describe completed changes with `jj describe`, then use `jj new` for the next change.

## Boundaries

- `crates/manifold-core` owns DSP and audio state. It must compile for native and `wasm32-unknown-unknown`.
- `crates/manifold-web` is a thin Wasm memory/host adapter. Do not put DSP rules here.
- `web/src/audio` owns browser device setup and the AudioWorklet. No renderer, DOM, or GPU work belongs in the audio callback.
- `web/src/visual` owns Three.js/WebGPU presentation. It reads analysis data, never drives audio timing.
- `projects` contains versioned product and parameter contracts. Host adapters should consume the same stable IDs.
- Prepare resources before processing. No heap allocation, locking, filesystem, logging, or graph compilation in the audio callback.

Read `docs/architecture.md` and `docs/migration.md` before changing an architectural boundary. Prefer tests that probe signal behavior, block boundaries, and native/Wasm agreement over tests that mirror implementation.

## Checks

```sh
cargo test --workspace
./scripts/build-wasm.sh
npm --prefix web ci
npm --prefix web run build
```

Run `npm --prefix web run dev` for the browser filter prototype. The mic source needs browser permission; the oscillator source works without it.
