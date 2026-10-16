# Creative authoring: review before migration

**Review outcome:** Lucas selected A with Device as the common model. See the [working Device prototype and evidence](device-prototype.md) and [real source comparison](prototype.html). The original alternatives below remain the pre-implementation design record.

**Status: proposals, not implemented APIs.** Review requested by [scratchpad issue 2](https://github.com/ShamanicArts/gpt-scratchpad/issues/2). Inspected runtime revision: `836f58e4c889e5814a66e21338e55a88a7f22cdb`, 12 October 2026. No runtime, package or handbook migration is part of this change.

Read the [interactive comparison](index.html). It shows the same three patches in each candidate, with highlighted JavaScript and a separate TypeScript discovery sketch. `manifold` is the proposed public import spelling; package registry availability has not been established. Nothing here is an installation instruction.

## Recommendation

Start with **A: named objects**, subject to Lucas's review. It reads in the order someone makes a patch: create the effect or instrument, add imported processors with meaningful names, declare controls, connect audio. It extends existing processor and parameter references without exposing the graph workspace as the creative entry point.

B and C explore legitimate alternatives. They should not become three implemented frameworks. A common semantic declaration model could support other writing styles later without imposing one style on advanced authors.

| Candidate | What carries the composition | Strength | Cost |
| --- | --- | --- | --- |
| A: named objects | An effect/instrument builder containing named references | Linear reading and immediate member discovery | Clearly separate declaration mutation from live DSP state |
| B: declarative recipe | A description with named processor/control keys | Easy to inspect as one structured recipe | Callback scopes and nesting obscure a small patch's reading order |
| C: composable values | Processor/control descriptions assembled at the end | Ordinary functions can return reusable pieces | Assembly lists and assignment values add ceremony |

| Patch | A | B | C |
| --- | --- | --- | --- |
| Audio input → gain → output | [JavaScript](candidates/a-gain.js) | [JavaScript](candidates/b-gain.js) | [JavaScript](candidates/c-gain.js) |
| Oscillator → low-pass filter → output | [JavaScript](candidates/a-tone.js) | [JavaScript](candidates/b-tone.js) | [JavaScript](candidates/c-tone.js) |
| Audio input → phase vocoder → output; pitch/mix controls | [JavaScript](candidates/a-spectral.js) | [JavaScript](candidates/b-spectral.js) | [JavaScript](candidates/c-spectral.js) |
| TypeScript/editor discovery | [Sketch](candidates/a-discovery.ts) | [Sketch](candidates/b-discovery.ts) | [Sketch](candidates/c-discovery.ts) |

These are source design probes, not playable examples. Syntax parsing does not establish that the proposed types or methods exist.

## What each example means

Effects have host audio input and output references. Instruments generate their own signal and have an output. Neither factory opens an audio device or starts playback. A browser embed, native host or Studio chooses how and when to run the resulting project.

`phaseVocoder`, `gain` and `oscillator` are explicit imported processor definitions. The proposed `lowPassFilter` definition is a readable preset over the existing state-variable filter in low-pass mode; it does not imply a second filter implementation. Definition imports describe capabilities. Instances describe occurrences. Neither owns live DSP state; each host instantiation gets its own state.

Each control declaration creates one reference carrying identity, target, range, default, label and unit. A basic interface can be derived automatically. A custom presenter references that same control and adds presentation properties such as placement or widget style. Automation, network and agent addressing consume the same identity. They do not require another copy of its range/default/path. The examples name control references to make that later reuse visible even when the automatic interface is sufficient.

A/B parameter `.set(...)` records an initial declaration. C's `.value(...)` produces an immutable assignment description for assembly. Neither writes to a running processor. Live changes still go through accepted host commands and revisions.

## Audit of the current surface

The [reproducible inventory](inventory.mjs) writes [line-level findings](inventory.json). Run `node docs/rearchitecture/authoring-review/inventory.mjs` from the checkout. It covers package example source/declaration files, every handbook lesson and executable example, the portable field example, the handbook control registry, the repository/package READMEs, the starter template, generated live source, graph-edit generators and agent guidance.

Search signals are not semantic verdicts. Generated source and its source generator intentionally overlap; totals are not counts of distinct designs. Host setup is appropriate in an embedding lesson. The problem is exposing it as the compulsory way to express a musical patch.

| Surface | Finding | Treatment after review |
| --- | --- | --- |
| 73 package example/declaration files | 63 mention GraphWorkspace; 40 match numeric identity; 41 match `.type`/type-selector construction; 33 register semantic identity separately | Separate creative examples from explicit contract fixtures; retain legacy fixtures for compatibility |
| 38 delivered live source strings | All 38 expose GraphWorkspace, numerical identity and type selectors; 37 separately register instances | Migrate the generator and representative standalone programs, then inspect actual displayed source |
| Four handbook executable projects | All four expose GraphWorkspace, numeric IDs and type selectors | Replace beginner examples only after facade and host checks pass |
| 15 handbook Markdown files | Raw authoring and numerical identity are taught in lessons and agent guidance | Teach the approved facade; keep contract material under a clear expert route |
| New plug-in template | Begins with `studioGraph`, `studioParameters` and reconciliation machinery | Creative blank page with editable graph integration preserved |
| Studio graph editing and module generators | Source rewriting and composition currently depend on explicit graph conventions | Support semantic declarations and source locations before removing template bookkeeping |

Manual findings with implementation anchors:

- [Primitive library generator](../../../packages/manifold-author/examples/primitive-library.mjs): imported definitions become numeric graph nodes, followed by semantic registration. The generator already reuses some control descriptors for its view; preserve that useful reuse instead of claiming every example duplicates everything.
- [Handbook example registry](../../../web/handbook/examples.js) and [executable examples](../../../web/handbook/examples): host sliders repeat ranges/defaults/labels already declared in authored controls. Consume the resulting control references/interface when the facade lands.
- [Studio starter](../../../web/src/authoring/templates/basic-plugin.js), [graph edits](../../../packages/manifold-author/studio-graph.js) and [Studio source](../../../packages/manifold-author/studio-source.js): the current editor relies on recognizable declarations and literal graph-edit state. Deleting that ceremony from the visible template without replacing its editing contract would break graph authoring.
- [Audio composition helpers](../../../packages/manifold-author/audio-graphs.js): reuse must namespace each occurrence's semantic identity while keeping one shared graph contract. Instantiating a reusable graph twice must produce independent processor state.
- [Node source navigation](../../../packages/manifold-author/node-sources.js): current discovery understands explicit graph additions/registrations. The facade should supply semantic source locations for Inspector/Explorer navigation, including imported module definitions and local occurrences. Unrecognized dynamic source gets an honest containing-file fallback.
- [Editor intelligence](../../../web/src/authoring/insight-worker.js): the existing package types already offer completion for many string arguments. The proposal improves discovery through actual processor members; it does not invent typing from nothing. Member types must come from the same generated processor catalog.
- [Agent handbook](../../handbook/agents.md) and [native agent quickstart](../studio-agent-quickstart.md): retain revision checks, focused inspection and inspect-after-edit. Replace numerical-ID teaching with the approved human-facing style. Agents should produce the same source a person is expected to read.

## Discovery in JavaScript and TypeScript

All nine JS examples should also be valid TypeScript without annotations. Package declarations provide JavaScript hover/completion as well as TypeScript checking. The three `.ts` sketches describe expected completions; they are not backed by a prototype type implementation.

| Candidate | Where type information originates | What the editor should offer |
| --- | --- | --- |
| A | `effect.add('spectral', phaseVocoder)` preserves the imported definition's type | `spectral.parameters.pitchSemitones`, `wetMix`, `fftOrder`; actual input/output names |
| B | The `processors` object determines the types of each callback argument | The same processor members inside `controls`, configuration and connection callbacks; keys remain inferred |
| C | `instantiate('spectral', phaseVocoder)` retains definition information before project assembly | The same members in ordinary helper functions; control and connection values preserve target types |

Unknown parameter names and incompatible port domains must fail type checking and runtime validation. Plain JS still receives useful errors. Types cannot prove all dynamic graph relationships; canonical graph validation remains authoritative. Required TypeScript proof after review: infer actual parameter/port names without `any`, reject invalid members/wires, and verify Studio's real completion/hover service against the public module exports.

## One lowering path, with preserved identity

All candidates collect semantic declarations on the control side, then lower to the existing GraphWorkspace, project interface, view and graph contract. They do not introduce another DSP graph or change callback ownership. Parsing, allocation and validation remain off the audio thread.

1. Collect imported definitions, named occurrences, parameters, controls and connections. A collects them through builder calls; B resolves named recipe entries before its callbacks; C validates assembled values and their membership.
2. Resolve occurrence names in their composition namespace. Explicit names in A/C and object keys in B determine identity. Local JavaScript variable names and declaration order do not.
3. Reuse the accepted or saved semantic-to-numeric node mapping. For a new project, allocate from canonical semantic-path order; when adding to an existing project, preserve existing assignments and allocate only the additions. Reject duplicate names before publishing anything. Do not use a global counter or a collision-prone name hash as identity.
4. Preserve control paths and the saved host automation-slot mapping. Stable names alone do not establish stable DAW slots: the current fallback slot allocator depends on snapshot enumeration. The facade needs explicit persisted mappings at that boundary.
5. Create the existing graph nodes and register semantic instances. Lower the single control declaration to existing exposed parameter records, deriving the default interface from those records. Carry source locations and Studio metadata separately from musical intent.
6. Validate and atomically publish through existing project/revision handling. Hosts instantiate runtime state from the accepted graph; a shared ESM declaration object must never share live processor state between hosts.

Reordering declarations or renaming a local variable must preserve identity. Changing an actual occurrence/control key is an identity change, handled by explicit migration if continuity is intended. New module occurrences get their own namespace. Existing named projects retain their paths; legacy anonymous numerical exports remain supported without guessing names from source order. Migrating such a project requires a verified explicit mapping.

[Live project retention](../../../packages/manifold-author/live-project.js), [browser hosting](../../../packages/manifold-author/browser.js) and [native authored state](../../../crates/manifold-native/src/author.rs) already use semantic identity in parts of their continuity logic. Support differs by processor/host. Do not claim every DSP history survives a reload merely because the new declarations have names.

## Studio, host and expert boundaries

Proposed public entry points: `manifold` for creative definitions/composition, `manifold/browser` for an explicitly requested browser host, and `manifold/graph` for expert graph contracts. Exact packaging is part of the review. The existing implementation directory does not need a cosmetic rename to establish those boundaries, and old imports must keep working for existing exports.

Studio consumes the same authored project as an independent host. Its layout, Explorer, source locations and graph editing metadata belong to Studio. The default source can become small only when graph edits still map to the declarations the user sees. Recognized declarations can support targeted edits; arbitrary JavaScript should retain an explicit inspect/source route rather than pretend all code can be reversibly edited as nodes.

The expert escape hatch is common to A/B/C: an explicit lowering operation from `manifold/graph` returns a **detached GraphWorkspace draft** plus identity/interface/source metadata. It is a copy, not a second live owner. Experts can inspect or transform it using today's low-level methods, then validate/publish a complete result. Unsupported surgery must be reported rather than silently corrupting source or control mappings. An author can also deliberately write the existing raw graph format from the start. No expert calls are required in the three introductory patches.

## Bounded API study

[Effect's current importing guide](https://effect.website/docs/v4/getting-started/importing-effect) offers explicit capabilities from a small core entry point and focused module imports. Its [pipeline guide](https://effect.website/docs/v4/getting-started/building-pipelines) supports multiple ways to compose typed operations. My inference for Manifold: keep the imported definition rich, preserve typed references, and let several writing styles share one semantic model. This does not require adopting Effect's runtime, services or error model.

[Tone.js](https://tonejs.github.io/) uses musical vocabulary such as synths, notes and durations to make small examples immediately purposeful. My inference: names such as effect, voice, filter and pitch should explain the patch. Manifold still needs explicit host ownership rather than an implicit global destination or audio clock.

The local [creative style decision](../creative-authoring-style.md) and [authoring contract proposal](../authoring-contract-proposal.md) remain the primary design constraints.

## Implementation and acceptance after review

1. Implement one minimum facade, generated member references, semantic allocator and reusable control references. Preserve the existing graph/runtime contract and import compatibility.
2. Prove equivalent canonical graph semantics for all three patches, including parameter defaults, port connections and declared controls. Differences limited to deliberately specified identity/interface metadata must be explicit.
3. Verify repeated compilation, declaration reordering, local renaming, save/recall, additions/removals, duplicate rejection and nested graph instances. Exercise saved host slots as well as node identity.
4. Verify accepted live values and source locations through actual Studio source edits and visual graph edits. Test native and browser state continuity where each host supports it; keep failures visible.
5. Open existing portable exports unchanged, then verify any explicit migration separately. Test supported legacy imports and script loaders.
6. Migrate the handbook, default template, primitive generator, representative examples and agent guidance together. Use actual compiled control metadata in embeds. Keep expert contract documentation accessible.
7. Run a cold-read check: someone should be able to identify the product, imported capabilities, meaningful instances, controls and audio flow without learning reserved node numbers.

The review artifact proves only that the alternatives are concrete and comparable. Runtime compatibility, type inference and audio behavior remain acceptance work for the chosen implementation.

## Review artifact checks

Run `node docs/rearchitecture/authoring-review/build.mjs` after installing the existing web dependencies to regenerate the highlighted standalone comparison. The generator highlights the actual candidate files; it does not execute their proposed imports.

Checked on 12 October 2026:

- All nine JavaScript candidates and the comparison's inline script parse successfully. Local report links resolve.
- In the BB browser, all nine candidate/patch combinations display the exact source file and multiple syntax-token colours. No JavaScript exceptions occurred.
- Light, dark and system appearance controls work. At a 390px viewport the document has no horizontal overflow; long code remains scrollable within its pane.
- The TypeScript discovery section expands and shows its explicitly proposed example. This is a presentation check, not a type-inference test.
- The existing spectral handbook page renders after restoring the baseline dependency state. The review used an automation tab and returned it to that page afterwards.

No runtime or DSP changes were made, so no new audio/native compatibility result is claimed by this review.
