# Manifold

Manifold is an audio plug-in and instrument library: a Rust DSP engine, a shared graph contract, and Rust/JavaScript/TypeScript authoring with native and Wasm hosts. Embed the parts you need in a website or application, or build a downstream plug-in with its own identity and interface.

**Manifold Studio** is the first-party product built on it: a live, agentic workspace for creating and playing with music plug-ins and instruments. Explore a project's files and graph, inspect a node, edit its source, see its presentation change, and work with an agent against the same accepted project. Using Manifold does not require Studio.

## Try Studio and the handbook

From this checkout, with Rust, the `wasm32-unknown-unknown` target and Node installed:

```sh
./scripts/build-wasm.sh
npm --prefix web ci
npm --prefix web run dev
```

Open `/learn/` on the displayed local URL for the interactive handbook, or `/studio/` for Studio. Browser audio starts on an explicit click. Effects need a host input: choose a test source such as Saw before starting when the current input is Silent.

The handbook includes a playable MIDI instrument, reusable filter Devices, ring modulation, spectral pitch shifting, Nacre-derived standing fields and a minimal gain integration. Each has real controls, graph/source inspection, portable project save and **Open in Manifold Studio**. The website uses the library directly; it does not embed the whole Studio shell into each lesson.

## Learn Manifold Studio

- [Workspace tour](docs/handbook/studio.md): application bar, audition, Explorer/files, Graph, Inspector and Presenter.
- [First session](docs/handbook/studio-first-project.md): change a field, follow audio into its relief, find the script and save your version.
- [Layouts and Presenter](docs/handbook/studio-layout.md): dock panels, use Explorer alone, save layouts and set the preview aspect.
- [Reusable graphs](docs/handbook/studio-graphs.md): wrap a patch, enter it, add instances and distinguish shared structure from local controls.
- [Source navigation](docs/handbook/graphs-and-source.md): declarations, implementations, imported helpers and retained drafts.
- [Save and export](docs/handbook/studio-save-export.md): portable files, local drafts, supported native builds and present limitations.
- [Agent workflow](docs/handbook/agents.md) and [native setup](docs/rearchitecture/studio-native-mcp.md): discover the intended session, inspect before editing, preserve human drafts and verify the accepted result.

The rendered site serves the same lessons as raw Markdown, indexed by `/learn/manifest.json` and `/llms.txt`. **Ask your agent** supplies a focused prompt with exact reading links.

## Use the library independently

Start with [the gain embed](docs/handbook/embed-a-gain-stage.md), [browser host lifetime](docs/handbook/browser-host.md) and [the architecture overview](docs/handbook/concepts.md). `manifold` supplies Device factories and processor definitions; `manifold/browser` accepts your AudioContext and Device; `@manifold/ui-web/composition-view` mounts a presentation without Studio. Rust graph and host preparation live in `crates/manifold-native`; DSP and audio state live in `crates/manifold-core`.

Current packages are developed in this repository. Independent consumer proofs exist, but registry publication and stable distribution are still release work. Public versioning has not been finalized; the repository's older “v2” terminology is internal.

## Current scope

Browser and Linux standalone Studio have shared workspace, node/source navigation, reusable audio/presentation graphs and live agent-edit evidence. Earlier authored CLAP/VST3 exports passed Linux and ARM Mac DAW tests and Windows REAPER under Proton. Those proofs do not establish every current Studio capability on every platform or a publicly hardened build service.

Native MCP uses a Node adapter and supports discovery and live project edits. Packaged adapter installation, filesystem-linked reload, broader DAW/platform acceptance, public hosted service isolation and general third-party dependency packaging remain open. No account is needed for the demonstrated local audio path.

See the [current public-release plan](docs/rearchitecture/studio-public-release.md), [product-model assessment](docs/rearchitecture/product-model-review.md), [browser export delivery](docs/rearchitecture/browser-export-delivery.md) and [native export evidence](docs/rearchitecture/native-export-delivery.md). Nacre, Orbit and other authored instruments remain separate downstream projects.

## Development checks

```sh
cargo test --workspace
./scripts/build-wasm.sh
npm --prefix web ci
npm --prefix web test
npm --prefix web run build
```

See [architecture](docs/architecture.md), [migration](docs/migration.md) and the [rearchitecture register](docs/rearchitecture/README.md) before changing boundaries. The [native interruption repair](docs/rearchitecture/native-interruption-diagnosis.md) records a passing default Rust workspace run (570 tests), including Main Wave startup, editing and recall. Each delivery record states its tested scope.

The earlier DSP demonstrations and migration references are preserved in [historical workbench notes](docs/primitive-workbench-history.md). The legacy checkout is a read-only behavior reference.

## Licence

Manifold, the library in this repository, is released under the [MIT licence](LICENSE).
Ableton Link support uses [`ablink`](https://crates.io/crates/ablink), an independent
MIT implementation of the protocol; the official GPL SDK is linked only by an
interoperability test and is never distributed. Manifold Studio is a separate
product with its own licence.
