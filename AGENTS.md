# Manifold v2 agent notes

Manifold Studio is the primary product for Manifold v2: the files/assets, visual graph workspace, inspector, viewer and authoring environment for audio plug-ins. Manifold is the underlying audio plug-in library/framework; Nacre, Orbit and other authored products can use it through Studio or independently. General capabilities developed for a project belong to Studio/framework; project-specific devices and artwork remain separate. A project can retain a default audio path without custom processing; do not expand scope into a separate visual-only project model. Read `docs/rearchitecture/manifold-studio.md` for the product decision and the proposed multidomain extension; proposed APIs there are not implemented contracts.

The framework has a Rust audio engine, a language-neutral graph contract, Rust and JS/TS authoring bindings, and an egui-first Studio shell for native and browser/Wasm hosts. The historical JUCE/Lua implementation is the behavior reference at `/home/shamanic/dev/my-plugin`; do not edit it as part of this project.

## Version control

Use Jujutsu (`jj`) for status, diffs, descriptions, bookmarks, and pushes. This repository has an independent root and the `manifold-v2` bookmark on `https://github.com/ShamanicArts/manifold.git`. Do not use Git to stage or create commits. Describe completed changes with `jj describe`, then use `jj new` for the next change.

## Boundaries

### No arbitrary authoring limits

Manifold does not impose arbitrary limits on what users can build. Do not cap
project nodes, objects, visual definitions, connections, nesting depth, groups,
ports, exposed controls, files, assets, source length, or saved project size.
This applies across the library, Studio, validation, graph expansion, import and
export, agent tools, and every native and browser host.

Do not introduce a cap as a shortcut for performance, validation, testing, or
implementation convenience. Raising an existing cap is not a fix: remove the
quota and fix the implementation. Allocate and prepare storage from the actual
project off the audio callback; never make fixed internal storage a user-facing
project limit. Preserve real-time safety without restricting authored complexity.

Validate correctness: types, references, unique identities, cycles, resource
ownership, and actual protocol requirements. These checks must not become
arbitrary size or count restrictions. Test projects beyond former thresholds
through authoring, save/load, and execution; acceptance by one validator alone
does not establish that the limit has been removed.

Studio running as a plug-in exposes a fixed bank of 2,048 normalized DAW
automation slots. This is an explicitly chosen host interface, never a limit on
graph nodes, internal controls, modulation, or scripting. Preserve named slot
assignments through edits and save/load; never silently recycle a deleted
control's automation slot. Graph edits must not change this host parameter list.
Exported plug-ins expose their declared public controls with stable identities
and appropriate metadata, without Studio's unused slots. Rebuilding an exported
plug-in may require reloading it in the host.

- `crates/manifold-core` owns DSP and audio state. It must compile for native and `wasm32-unknown-unknown`.
- `crates/manifold-web` is a thin Wasm memory/host adapter. Do not put DSP rules here.
- `web/src/audio` owns browser device setup and the AudioWorklet. No renderer, DOM, or GPU work belongs in the audio callback.
- `crates/manifold-app/src/studio.rs` owns the native egui Studio workspace; the browser Studio workspace is `web/src/authoring`. Both are Studio product code, not library. `crates/manifold-ui` is the library's presentation-only egui client. Authored project presentations are distinct from Studio chrome. Three.js is an existing graphics implementation, not the required authoring language or backend for every project. Renderers read analysis data and never drive audio timing.
- `projects` contains versioned product and parameter contracts. Host adapters should consume the same stable IDs.
- Prepare resources before processing. No heap allocation, locking, filesystem, logging, or graph compilation in the audio callback.

Read `docs/architecture.md` and `docs/migration.md` before changing an architectural boundary. Prefer tests that probe signal behavior, block boundaries, and native/Wasm agreement over tests that mirror implementation.

Before work on project authoring, egui/UI migration, graph mutation, Main, rack/Patch, state, or host project loading, read `docs/rearchitecture/README.md` and its legacy inventory. Its acceptance gates require one graph contract for Rust and JS/TS project logic, egui-first presentation, and the old project's behavior rather than only Main's signal output or UI.

For Main implementation, also read `docs/rearchitecture/main-recovery-ledger.md`. Its M0–M5 sequence is active: remove duplicate Main DSP ownership, then recover authored graph composition and live creator workflows. A second Main-specific audio path or shadow kernel state is not a valid completion shortcut.

## Audio test output

Route automated browser, plug-in, and DAW audio tests to a verified private virtual/null sink. A disconnected audio server is sufficient for state and UI probes that do not need playback. Check the test process's audio routing before launch; keep the user's H6 and physical speakers untouched.

## Library and Studio boundary

Manifold (the library) is MIT; Manifold Studio is a separate product. Studio code lives in `crates/manifold-app`, `packages/manifold-studio`, `web/src/authoring`, `projects/studio` and the paths listed in `scripts/public-core.exclude`. The library must never import Studio. `scripts/check-library-independence.sh` proves it; `scripts/export-public-core.sh <dir> --gate` produces and verifies the public library export. Never add a Studio import to a library package or crate.

## Checks

```sh
cargo test --workspace
./scripts/build-wasm.sh
npm --prefix web ci
npm --prefix web run build
```

Run `npm --prefix web run dev` for the browser filter prototype. The mic source needs browser permission; the oscillator source works without it.

## BB browser review

A failed Codex IAB discovery is not evidence that BB's in-app browser is unavailable.
Use `bb browser instances --host <host-id> --json`, then the explicit instance,
generation and thread with `create`, `acquire`, `connection` and `capture`.
Retry discovery/connection before reporting availability. Prefer the working BB
browser for product review; identify a connector failure as a connector failure.
Release the lease after review and preserve the user's active browser state.
