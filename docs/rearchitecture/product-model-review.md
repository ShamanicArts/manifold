# Product model pressure-test — 12 October 2026

Aster's repository assessment of [scratchpad issue #1](https://github.com/ShamanicArts/gpt-scratchpad/issues/1), against parent checkpoint `e197bbefd202` plus this handbook expansion. This is a review, not a pricing, licensing or account-system decision. No commercial restrictions were implemented. Earlier host proofs are identified as earlier proofs; this pass did not rerun the DAW/platform matrix.

## 1. Demonstrably true today

- **Manifold is usable without Studio.** `packages/manifold-author/browser.js` accepts a caller-owned AudioContext; Rust consumers use the native/core crates. The handbook now embeds gain, ring modulation, a phase vocoder and a presentation composition using public package entries. Studio is optional. Existing independent-consumer package checks are recorded in [web authoring delivery](webmcp-delivery.md).
- **Live accepted editing exists.** Source, graph, files, parameters and compositions use `LiveProjectRuntime` and host publication. The native prepared graph/command boundary keeps compilation and allocation out of the audio callback. Parameter changes, supported route changes and prepared replacements have real signal/host evidence. See [audio graphs](studio-audio-graphs.md) and [package contract](project-package-v1.md).
- **Studio has shared browser/Linux authoring.** Docking, Explorer/file views, graph navigation, inspector, Presenter, nested audio/presentation graphs and node-to-source links have actual browser and standalone reviews. See [workspace](studio-workspace-delivery.md), [source navigation](studio-node-source-navigation.md), and [nested presentation](studio-nested-compositions.md).
- **A real agent has edited a running native project.** The [native MCP ledger](studio-native-mcp.md) records Luna's live renderer edit, recording, portable save, reconnect and guide discovery. Discovery, multiple-window refusal, new-session inspection and PNG capture have follow-up acceptance.
- **Real plug-in exports exist.** The earlier [native export](native-export-delivery.md) and [browser export](browser-export-delivery.md) milestones produced CLAP/VST3 packages and actual DAW proofs, with captured source/values and hashes. These are much more than nonfunctional export buttons.

## 2. True only with qualifications

| Assumption in the issue | Exact current boundary |
| --- | --- |
| “Windows, macOS and Linux” | Earlier exported custom-view plug-ins passed Linux and ARM Mac DAW tests; Windows was tested under Proton/WebView2. Current shared native Studio, new composition tooling and MCP capture are accepted on Linux. Physical Windows and full current Studio parity are separate gates. |
| “Live reconfiguration” | Accepted edits publish without refreshing the editor. It does not guarantee sample-perfect continuity for all structural edits, voice state, delay tails or resource replacements. Audio wrapping rejects unsupported resource-bound nodes. |
| “Studio in a DAW with agents” | Exported Graph plug-ins already carry live authored source/control paths. That is not acceptance of the entire current Studio shell, nested editing, native discovery/capture and concurrent agent workflow in each DAW. |
| “Integrated web agent” | Shared tools, optional browser WebMCP and a private project-token remote MCP bridge exist. They are integration facilities, not a deployed first-party hosted inference/chat product. Native WebMCP support is browser-dependent. |
| “Cross-platform export” | Configured native build machines compile supported packages. Browser Rust compilation is not implemented. Signing, notarization, installers, public job ownership and general dependency packaging are unfinished. |
| “Native MCP” | A stdio Node adapter fronts Studio's live loopback endpoint. Discovery/configuration work, but the adapter/dependencies are not yet delivered in a self-contained Studio installer. Embedded-file edits reload live; filesystem watching does not. |
| “Reusable package ecosystem” | Definitions can be wrapped, entered and instantiated within projects. Cross-project installation, dependency resolution, package updates, marketplace and commercial content distribution are not implemented. |

The old root README still described several delivered capabilities as future work. This change replaces its introduction/navigation with current product boundaries and entry points, retaining the historical primitive workbench material separately. Delivery ledgers still contain chronological “next” sections; use their date and subsequent records rather than treating an old list as the current contract.

## 3. Significant new architecture or product infrastructure

The highest-cost missing pieces are public service isolation/authorization, durable multi-user project ownership and synchronization, hosted agent orchestration/quotas, general portable dependency/build manifests, and a package ecosystem with version resolution and update semantics. A richer resource/geometry/material/behavior graph also needs contracts beyond the existing scalar and bounded field types.

Full DAW-hosted Studio is a dedicated integration/acceptance milestone, not automatically a new DSP engine. Reuse the existing publication path; establish host-thread rules, lifecycle, session discovery, dirty human drafts, restart/timeout recovery and closed-editor behavior for current Studio before deciding what additional architecture is necessary.

Cloud accounts must be an optional host/service concern. An auth outage must not enter the DSP callback, deny local project loading or change accepted local state. This follows the issue's product principle; no service or licensing layer was added here.

## 4. Where the framework/product split actually falls

| Keep usable as Manifold | First-party Studio/product responsibility |
| --- | --- |
| `manifold-core`: DSP, graph and audio state | `manifold-app`: standalone app lifecycle and first-party workspace host |
| `manifold-native`, `manifold-web`: host/preparation and Wasm boundary | `manifold-ui/src/studio*`: docking, workspace commands, Explorer, graph navigation and inspector chrome |
| `manifold-project-js`: authored controller/package execution | Studio entry, draft/session UI and authoring orchestration in `web/src/authoring` |
| `@manifold/author`: graph/source/files, live runtime, composition, host APIs and reusable semantic tool schemas | `web/native-mcp.mjs` discovery/transport and first-party agent connection UI |
| `@manifold/ui-web`: optional controls and custom/composition rendering, independent of Studio | Private export service, packaging/release UX, handbook site and future hosted services |
| CLAP/VST3 adapters and exportable runtime pieces usable by downstream products | First-party instrument artwork/devices remain in their own projects, not Studio chrome |

This is a responsibility map, not permission to rename entire crates blindly. `manifold-ui` includes shared rendering as well as Studio; `manifold-editor` and plug-in adapters contain host/editor integration. Audit by module/dependency before imposing package or legal boundaries.

`@manifold/author` currently exports Studio-named authoring helpers and example products alongside core authoring. Those names do not force Studio to mount, but they blur the public package. The next separation check should pack the library and import graph/audio/composition into an independent website and a Rust consumer, record transitive dependencies, then split optional authoring/example entry points while preserving the language-neutral contract. The repository package's `prepack` still depends on repository build scripts; a source checkout is not yet a polished registry install.

## 5. What portability still needs

The current portable source/graph/files model and locally bundled plug-in assets are a strong base. Native/browser reopen has been demonstrated for specific projects, including the field composition. Still needed before an indefinite portability promise:

1. Document the distinct graph, live-project and controller-package formats, their version rules and migrations. The `.manifold.json` suffix alone does not identify the inner contract.
2. Pin and distribute compatible Rust/web runtime packages and toolchains. Test a clean-machine rebuild without private infrastructure.
3. Specify dependencies and capabilities: renderer versions, custom Rust code, assets, PCM/sample-rate expectations, host I/O and supported execution targets.
4. Export provenance: exact accepted source/files/values, dependency locks, runtime revision, product identity, asset terms and deterministic integrity checks.
5. Keep offline load/edit/process acceptance for packaged artifacts separate from optional build/agent/cloud access. Test it with network unavailable.
6. Keep transient DSP state distinct from saved project state; state which tails/voices/controller state restart after each kind of edit or reopen.

Do not promise “the company can disappear and every future project remains rebuildable” from the current preview alone. No company service is inherently required for the demonstrated local audio path; comprehensive reproducible distribution is still unfinished.

## 6. Strongest honest demo

Start in the new **Sound into surface** lesson, alter standing modes and audio-driven relief, open the same project in Studio, follow the relief node to its implementation, then enter the reusable-field example. In native Linux Studio, connect an agent, ask it to change one renderer/rule, observe the Presenter update without refresh, save and reopen.

For the export demonstration, use the known supported authored custom-view fixture and private build path. Show the real CLAP/VST3 in the DAW and its saved state. Until current composition/MCP coverage is verified through that exact export, present this as a second tested path rather than stitching two proofs into one unsupported seamless claim.

## 7. Smallest useful funnel improvements

Delivered in this pass: three substantive embedded experiments, common live controls/graph/source, portable download, Studio handoff retaining edits, proper Studio walkthroughs, universally highlighted fenced code, copy controls and readable typography.

Next, in order:

1. Public static Studio/wiki deployment with a declared host-capability profile. Disable unavailable private build/agent routes with clear reasons; verify Wasm/worklet headers and persistence on the real origin.
2. One current end-to-end “example → accepted edit → project save → supported export → DAW recall” release fixture. Make its scope visible in the export UI.
3. Package native Studio plus MCP adapter and runtime dependencies; test first-time setup with an ordinary client and no developer checkout.
4. Add explicit missing-dependency/exportability diagnostics and a portable dependency receipt. This improves both user trust and supportability.
5. Choose public hosted services only after their ownership/isolation model is reviewed. Accounts, payments and inference are not prerequisites for excellent local authoring or useful embedded docs.

## 8. Licensing/business interactions requiring a decision

Historical note: the workspace declared **MPL-2.0** in `Cargo.toml` from the first v2 commit without a licence file or rationale. On 16 October 2026 Lucas set Manifold to **MIT** (workspace field, `LICENSE`, JS package manifests) and Manifold Studio to all rights reserved, decided formally at release. The GPL Link SDK was replaced by the MIT `ablink` crate. A clean packaging split that enforces this boundary is still open.

This review makes no legal conclusion about changing those terms. Before choosing a model, audit existing file licenses, contributions, third-party code, fonts, renderer/SDK dependencies and artwork rights. The proposed restriction on rebranding/resale is a separate legal/product question; do not describe a license as allowing unrestricted open-source use while quietly adding a contradictory runtime gate. Paid official builds/support and optional services should be assessed independently of source permissions.

No pricing number, subscription entitlement or DRM requirement has been adopted. A service token can authorize hosted work without becoming permission to play an instrument. The public copy should explain that distinction once release terms are actually decided.

## 9. Scoped Max/Pd capability archaeology handoff

Propose a read-only research slice first. Use the official [Max guide](https://docs.cycling74.com/userguide/) and [Pure Data manual](https://msp.ucsd.edu/Pd_documentation/index.htm), plus their linked object/help examples. Record the exact versions consulted. Those indexes explicitly separate messages/timing, DSP, reuse, state and presentation; object counts would erase the semantics we need to compare.

Produce a capability matrix covering **all** requested categories: DSP; messages/control; scheduling; buffers/samples; FFT; MIDI; OSC/networking; file/media I/O; polyphony; dynamic patching; abstractions; externals/packages; state; controls; video/graphics; host/plugin integration; scripting; debugging. Each row must include an official source, a concrete user task, a minimal reference patch, the corresponding Manifold source/test, and one classification from the issue. “Already stronger” requires a comparative proof; unknown evidence stays unknown.

First investigate six representative workflows deeply: timed events under load; reusable patch interfaces/shared versus local state; sample replacement during sounding voices; polyphony/voice stealing; dynamic graph edits with feedback/state; trace-and-repair of a scripted node. Survey the remaining categories before prioritizing, rather than inventing missing primitives from names alone.

Classify each gap as UX/documentation, a primitive on an existing contract, a new contract, or deliberately different semantics. Rank only three follow-up implementation slices by musician benefit, safety/testability, portability and cost. Return a matrix, six small task descriptions, evidence links and those three proposals. No giant object library, compatibility layer or default adoption of Pd's message ordering is authorized by this research brief.
