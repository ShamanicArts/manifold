# Web-authored native plug-in export

2 October 2026. Lucas requires export to carry extra authored JS/TS code and a
Three.js interface alongside Manifold's own UI. He selected a sounding Three.js
program in DSP live scripting as the first proof, followed by native export.
The native development export slice is implemented; production publishing and
broader dependency/assets support remain open. See [actual build and host evidence](native-export-delivery.md).

The follow-up [browser export delivery](browser-export-delivery.md) now implements
the actual creator form → captured build job → downloadable CLAP/VST3 archive.
Compilation runs on configured native build machines. The creator exposes
identity, target, progress, errors, job recall and source/build receipts.

## First slice: custom view in the creator

Deliver a sounding authored instrument with a Three.js scene and Manifold kit
controls sharing pitch, cutoff and level. Make graph and custom view code
inspectable/editable. Dragging the scene changes actual DSP; kit or agent changes
move the scene; bounded output analysis drives visualization. Source changes,
save/restore and undo preserve view code with accepted project state. A separate
importing web project must mount it through public bindings.

The view module imports Three.js explicitly and declares its dependency version.
The browser host supplies its bundled module. DOM/GPU code executes only in the
view host; orchestration does not execute it and Rust retains DSP ownership.
This first dependency resolver does not promise arbitrary npm installation or
Node.js APIs. Loading broader dependencies/assets extends this contract.

## Native publishing acceptance

Export the exact web-authored project as independently identified Linux VST3 and
CLAP bundles first. Package view JS, dependencies, CSS, shaders and required
images/models with controller, graph and project assets. Load without the
development server or a CDN. Record dependencies, asset identities and required
host capabilities. Custom Rust code requires its own compilation/loading path.

In a real DAW, operate the custom scene and kit controls, automate their shared
parameters, close/reopen the editor and save/reopen the DAW session. Processing
continues without the view. Define mounting, resize, focus and disposal; retire
subscriptions and GPU resources on close. Demonstrate a working WebGL path in
the actual native webview rather than assuming browser WebGPU proves it.

Deliver live web build, downloadable plug-ins, readable source and a DAW
interaction recording with audio. Windows/macOS are now part of the active milestone: Lucas authorized Proton and
the network Mac mini for actual platform testing. See [the active delivery record](native-export-delivery.md).
This does not close or replace the remaining legacy port.

## Existing implementation to extend

- Native Graph CLAP/VST3 adapters load portable controllers and graph state.
  Export manifests now provide permanent product identities and default packages.
- `crates/manifold-editor/src/linux.rs` embeds Wry, serves packaged assets and
  bridges messages. It selects fixed Manifold pages rather than custom project
  entrypoints. Custom-view loading and actual WebGL2 interaction are now proven in Linux, Mac and Proton reviews.
- `scripts/build-clap.sh` and `scripts/build-vst3.sh` package Linux bundles and
  fixed assets. `scripts/export-plugin.py` now assembles a product from an explicit manifest,
  portable package and local view assets.
- The current live source evaluator has a built-in authoring import allowlist;
  the separate public custom-view loader resolves explicitly supplied modules.
  The wider package format needs a versioned asset/dependency contract.

See the [approved goal](proposed-delivery-goal.md),
[vertical plan](vertical-delivery-plan.md) and
[package contract](project-package-v1.md).
