# Importing Manifold into an ordinary web application

This application imports `@manifold/author/browser`, `/live-project`, the authored
Filter example, and `@manifold/ui-web` controls. It has its own npm manifest and
Vite build. It imports no Manifold product frontend or private DSP implementation.

```sh
npm --prefix examples/filter-consumer ci --ignore-scripts
npm --prefix examples/filter-consumer run build
```

Serve the output with `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`: prepared execution uses shared Wasm
memory and a compiler Worker. Change the Vite base flag for your deployment path.

Start audio, operate the original Filter kit, add the output-level primitive
while processing, and export the edited portable project. The Manifold creator
can open that export. `src.js` is the complete consumer implementation.

The public `@manifold/ui-web/parameter-gesture` binding coalesces drag targets
and holds the latest pointer intent while an earlier atomic parameter batch is
acknowledged. Its transient view does not replace accepted graph/save state.
