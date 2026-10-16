# Public Studio and the interactive handbook

11 October 2026. Lucas approved a capable public Studio release and interactive
documentation, targeting the next 24 hours. The hostname is awaiting spelling
confirmation between `manifold.shamanicarts.dev` and `manifold.shamanicats.dev`.
This is a delivery plan; unchecked items are not claims of shipped support.

## Accepted product direction

- Manifold Studio remains the primary authoring product; Manifold is also a
  library/framework usable directly by a website through Web Audio.
- Embeds can contain a project **or only the parts needed**: an audio graph,
  reusable subgraph, control surface, visual component or inspector/source view.
  The surrounding site decides which capabilities it presents.
- Audio plug-in authoring remains central. Embedded audio does not require
  plug-in export and does not introduce a separate visual-only project model.
- Documentation has persistent sidebar navigation, substantial explanation,
  runnable examples and source, using actual public framework facilities.
- A modified example can open in Studio with its state retained. A partial
  example needs explicit audio I/O/default wrapper when becoming a full project.
- The handbook layout is approved: plain Manifold wordmark, header/sidebar
  alignment, separate Manifold Studio destination and optional graph/source.
  The landing page and logo will be designed separately.
- Explain three distinct identities: Manifold is the importable Rust/web
  library, Studio is its live agentic authoring product, and instruments,
  plug-ins and packs are downstream products. Public naming excludes the
  internal “v2” label. Release numbering and merging the development line into
  main remain explicit release tasks.
- Human lessons and fetchable agent references use the same text. Topic-specific
  prompts link to the exact reading, rationale and verification workflow.
- Preserve capable authoring in the public build. Unavailable host features are
  visibly disabled with a useful reason; private services are not exposed as-is.

## Proposed routes

`/` introduces Manifold; `/studio` opens the authoring workspace; `/learn/...`
contains guided lessons; `/reference/...` contains API/contracts; `/examples/...`
provides editable examples. Existing saved projects and direct example links
need migration/compatibility checks. These route names are proposals.

## Work sequence and acceptance

1. **Repair the baseline.** Resolve the recorded Gain-contract expectation
   mismatches; reproduce/classify native startup/save timeouts. Exercise source
   switching and returning, edit/apply/error repair, source/graph reconciliation,
   undo, save/reopen, and retained drafts. Record host support separately.
2. **Handbook review and embed proof.** Show a sidebar lesson with a small live
   component, optional graph/source, reset and Open in Studio. Keep one accepted
   model and public operations. Prove initialization, deliberate audio start,
   parameter edits, disposal and reload. Load examples on demand; preserve the
   embedding site's ownership of AudioContext and output.
3. **First useful learning path.** Audio effect; graph/source navigation; audio
   analysis driving a visual; reusable graphs; agent editing/recovery. Include
   framework-first embedding and reference links. Version runnable fixtures
   with the implementation and use them in regression checks.
4. **Public deployment.** Confirm hostname/hosting, install production routes,
   verify Wasm/worker delivery and required headers, test persistence/recovery
   in a clean browser, and establish repeatable deployment/rollback. Inventory
   every network service the production build calls.
5. **Public service readiness.** The build queue and remote-agent bridge were
   proven privately. Project authorization, job ownership and bounded resource
   handling must be established before public exposure. Select the first
   release's enabled services from demonstrated readiness.

## Handbook design constraints

Use restrained Studio colors, readable prose and system-aware light/dark mode.
Lesson navigation is distinct from an embedded graph's Explorer. Show how a
control, its declaration and its result relate. A whole editor is optional.
Do not create a second independently editable graph model for documentation.
Label simulated controls in layout mocks; real embeds use the framework runtime
and link to the exact source executed by the example.

## Wider roadmap retained

- Human/agent conflict and pause/recovery acceptance; filesystem-linked reload;
  packaged native MCP and wider client/platform/DAW coverage.
- Interface/binding editor, forks, unwrapping and cross-project reusable graphs.
- Rich objects, resources, transforms, materials and attached behaviour.
- Nacre as an authoring coverage check, with product artwork work separate.
- The intended dimensional plug-in and validated research examples.
- Audit library/Studio package boundaries and independent Rust/web consumer
  installation; a consumer must not need the Studio application to import Manifold.

Existing Studio, nested audio/presentation graphs, typed field/rule examples,
source navigation and native MCP evidence are the starting point. This adds
public delivery and teaching through the same framework and project authority.

## First checkpoint — 11 October

The [handbook study](../../web/public/studio/2026-10-11-handbook-study/index.html)
demonstrates the sidebar, an embedded gain control, optional graph/source and
node-to-declaration navigation. It has been reviewed in the BB browser at desktop
and phone widths, in light and dark modes. Audio and Studio handoff are disabled;
this is a layout proposal awaiting review, not the runnable embed proof.

Live source edits now retain an unchanged parameter's current value when its
declared range widens. Previously the Gain example's expansion from 0–2 to 0–8
reset the edited value. Narrower ranges and changed authored defaults retain
their existing replacement behavior. Generated controllers/packages share the
fix. Historical migration fixtures remain intact; tests explicitly account for
the supported Gain range.

Passed: 161 browser tests (including authoring TypeScript and generated-package
checks), 136 native library tests, the Wasm build and the production web build.
The full Rust workspace run still fails at Main Wave's native controller startup
timeout. A focused run after package regeneration also reproduces the oscillator
held-note save timeout; its ordinary control/recall test passes. These failures
remain open and the native workspace is not claimed green. The web build reports
large chunks, which also need attention before public delivery.

## Wiki implementation checkpoint — 11 October

The accepted layout now has six real lessons under `/learn/`: start here,
architecture, embedded gain, browser host lifetime, graph/source navigation and
agent work. The header/sidebar alignment and plain wordmark follow Lucas's
review. Human HTML and agent Markdown are generated from the same authored
documents; `/learn/manifest.json` and `/llms.txt` index them. Each lesson supplies
an editable topic prompt with exact fetch locations and a documentation edition.
The native authoring guide is included from the same source served over MCP.

The gain example uses public library imports, a website-owned oscillator and
AudioContext, and actual Wasm processing. Optional graph/source views inspect
the same accepted project. Its Studio handoff uses the existing draft store and
opens `/studio/` with source and live value retained. Both `/studio/` and the
legacy root serve the same Studio entry; a public landing page remains separate.

The [static-build acceptance](../../web/public/studio/2026-10-11-wiki/README.md)
records real audio gain/silence, stop/restart cleanup, source navigation,
fetchable agent references, responsive layout and a Studio draft at gain 0.25
with audio stopped. 164 browser tests and the production build pass. Fresh npm
installation reports no audit vulnerabilities after a transitive source-map
dependency patch. The existing native timeout failures remain open.

This is the first working learning path. Full reference coverage, deeper
interactive lessons, independent package distribution, the broader library/
Studio separation audit, public service isolation, hostname/hosting setup,
release numbering and merge into main are still required release work.

## Human documentation and richer embeds — 12 October

Lucas retained the wiki's page shape but requested proper human teaching, more
ambitious examples, Studio coverage and syntax highlighting as a golden rule.
The handbook now has **14 topics**: five Studio chapters, three sound/visual
experiments and the earlier six lessons. Ring modulation and spectral pitch use
real public DSP nodes; the field lesson mounts the existing portable field/rule
composition through `@manifold/ui-web/composition-view`, without Studio chrome.
All examples share one page host, accepted controls, source/graph navigation,
portable download and optional Studio handoff. Studio's source-location metadata
also drives declaration highlighting in the lesson's graph.

Shiki highlights all fenced code and embedded files at build time, for light and
dark appearance. Missing grammars fail generation rather than shipping plain
source. Copy controls retain text, with a keyboard fallback when clipboard
access is denied. Self-hosted Plex Sans/Mono and Space Grotesk improve reading;
these are a handbook typography trial, not a final logo or a Studio redesign.
The API syntax itself is unchanged, reserved for the separate discussion Lucas
requested. The repository README now starts with Manifold/Studio and useful
entry paths; its historical primitive notes remain available separately.

The [actual browser acceptance](../../web/public/studio/2026-10-12-wiki/README.md)
checks measured audio, silent output, cleanup, source tokens/navigation, mobile
layout, portable download payloads and edited values/composition reaching stopped Studio.
166 browser tests, package/TypeScript checks, fresh installation and production
web build pass. Known native timeouts and the large-chunk warning remain.

The [scratchpad product-model review](product-model-review.md) answers the nine
handoff questions with current/partial/missing distinctions and proposes a bounded
Max/Pd capability study. No pricing, account, DRM or licensing restriction follows
from that strategy issue. Public deployment/service hardening, native MCP release
packaging, current full-Studio DAW acceptance and portable dependency contracts
remain the next release priorities.

### Authoring-style correction — 12 October

The new gain, ring and spectral examples now import their processor definitions
explicitly from the existing public package, following the earlier
[creative authoring style](creative-authoring-style.md). Human lessons and agent
guidance distinguish imported definitions, individual instances and stable
numerical IDs. The package spelling is explained as the current JavaScript scope
and package name; it is not a Rust convention or a final public naming decision.
Friendlier instance construction remains API work, not a completed documentation
feature.

The five handbook tests and production build pass. Against `0c07a473`, the three
corrected examples produce identical graph contracts and controls through both
ordinary imports and the live evaluator. An edited value survives source apply
and cold recall. A focused BB browser review confirms each graph still selects
its exact updated declaration, with syntax highlighting and audio stopped. This
correction did not repeat DSP, native or full browser audio acceptance.
