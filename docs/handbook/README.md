# Maintaining the handbook

Author lessons as Markdown in this directory. `web/handbook/catalog.js` supplies
their route, title, description, related topics and agent task. The Vite handbook
integration generates readable HTML, raw Markdown, `/learn/manifest.json` and
`/llms.txt` from those sources. Generated HTML under `web/learn` is ignored;
`npm --prefix web run build` recreates it and packages the production site.

The Studio authoring guide is included from
`docs/rearchitecture/studio-agent-quickstart.md`, the same text served by MCP.
Edit that authority for shared authoring instructions. Keep host/version limits
beside the operations they qualify. Explain library use separately from Studio
use and keep downstream products distinct from both.

An executable example owns a real public-API source file. The gain example's
importable factory, downloadable source and displayed declaration all come from
`web/handbook/examples/gain.mjs`. The shared host/control component is
`web/src/handbook/audio-example.js`; the registry in `web/handbook/examples.js`
also defines instrument, reusable-Device, ring, spectral and field experiments. The field embed reads the
existing portable Studio project, including its exact node scripts. All six
use the library without mounting Studio.
Studio's existing draft storage is imported only for the optional handoff.

Follow the existing [creative authoring style](../rearchitecture/creative-authoring-style.md).
Import every processor definition used by an example explicitly, alongside its
graph tools, from the public root or named entry points. Distinguish the imported
definition from its project-local instances. Keep numerical graph-contract IDs in
expert material; they are not the introductory authoring language. Namespace
imports remain a supported convenience. Teach the API that actually ships and
label unsupported or proposed capabilities separately. The agreed Device API is
the default for new creative examples; keep the expert graph contract separate.

Introductory local variable names should mirror the concept being introduced:
`device` for `createDevice`, `effect` for `createEffect`, and `instrument` for
`createInstrument`. Explicitly explain that these names are chosen by the author,
not Manifold keywords or required identifiers. Introduce JavaScript `const`,
local variable names, quoted stable authored IDs, imported definitions and
Manifold API members as distinct concepts beside the first example. A reader
should be able to trace `device.input(...)` to the earlier declaration without
already knowing JavaScript. Explain how to rename a local variable consistently
without changing its stable authored ID. Later lessons can use more expressive
names. The [detailed naming rule](../rearchitecture/creative-authoring-style.md#names-carry-meaning)
includes a worked breakdown. This applies to agent-generated exemplars too.

For a lesson, provide a concrete outcome, expected observations, explanation of
the model, lifecycle/recovery where relevant, and related reading. State the
current implementation's boundaries. Topic prompts link to fetchable Markdown,
the architecture and agent workflow, and include the documentation edition.
That content hash identifies the served documentation; it is not a product
release number or guarantee of API stability.

`npm --prefix web test` checks internal links and headings, agent prompt sources,
guide inclusion and the executable example's graph/save contract. The existing
browser suite also checks library behavior. With a leased BB browser connection,
`MANIFOLD_REVIEW_CONNECTION=... node web/review-handbook.mjs` reviews the static
build, real silent-sink audio, lifecycle, raw-document fetching, mobile navigation
and Studio draft handoff. It reuses the leased tab and opens no desktop windows.

Public hosting still needs production routing/headers and service decisions.
The Vite development server and private export/agent services are not the public
deployment recipe. `/studio/` and the legacy root currently serve the same
Studio entry; a distinct landing page remains separate design work.

Code fences must name a supported language. Shiki highlights them at build time
for both appearances; missing/unknown grammars fail the build. Embedded source
passes through the same highlighter. Copy controls copy text content, preserving
code characters rather than HTML. Intentionally plain output uses `text`; do not
mark source as plain text to bypass highlighting. See [Shiki dual themes](https://shiki.style/guide/dual-themes).

Typography is self-hosted: IBM Plex Sans for reading, Space Grotesk for headings,
and IBM Plex Mono for code, supplied by pinned Fontsource packages. Their license
texts ship in `web/public/fonts`. This handbook trial does not change Studio's UI
font or decide the final Manifold wordmark/logo.

The lessons cover Studio’s workspace, first session, layouts, reuse and saving,
plus six embedded sound/visual examples. Keep procedural labels checked
against `studio/workspace.rs` and current host capabilities. Do not copy old
release-ledger “remaining” lists into present-tense public documentation.
