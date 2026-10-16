# Studio product separation — step 1

11 October 2026. Implemented from parent revision `02e98f47` in Jujutsu change
`ktossqrn`. This delivers the first slice of the
[Studio product and architecture review](manifold-studio.md).

## Delivered behavior

Studio opens an **Untitled plug-in** with a valid audio input-to-output path.
Authors can add processing, wire it, expose parameters and save/reopen through
the existing public graph contract. The template has no example instrument or
custom presentation. The existing viewer shows an empty presentation message.

The header keeps **Manifold Studio** separate from the opened project's name.
Nacre, Orbit and the other examples are explicit catalogue choices. Live
Scripting retains its simpler authoring surface and in-place example switching.
The old Filter, oscillator and Main standalone pages still use the shared host.

Opening a project file in Studio gives it an independent browser draft address,
display name and export identity. It no longer overwrites the example that was
open. Navigation through the header or examples selector protects unapplied
source/presentation drafts and saves accepted edits before leaving.

## Ownership

| Owner | Code and responsibility |
| --- | --- |
| Authoring host | [workspace-host.js](../../web/src/authoring/workspace-host.js) mounts the existing runtime, editors, host services, persistence and export. The old `filter.js` entry is a compatibility import. |
| Launch policy | [project-launch.js](../../web/src/authoring/project-launch.js) resolves routes and stable persistence keys independently of display labels. |
| Example catalogue | [project-catalog.js](../../web/src/authoring/project-catalog.js) owns example names, source selection, preferred workspace, standalone input capability and linked project locations. Nacre's dated URL is here. |
| New-project template | [basic-plugin.js](../../web/src/authoring/templates/basic-plugin.js) uses public authoring APIs and the existing source-backed Studio graph/edit contract. |
| Web presentation capabilities | [presentation-modules.js](../../web/src/authoring/presentation-modules.js) supplies the same supported module versions/loaders to browser authoring and embedded native web presentations. |
| Authored products | Nacre's source, routing, assets, face and Prism Bend composition remain project-owned. No Nacre-specific device was promoted to core. |

DSP ownership, audio scheduling and the accepted project schema are unchanged.
Browser display names live beside snapshots as host metadata; they do not
become DSP state. Existing arbitrary-import limits still apply. A shared module
map is not the proposed graphics-backend/component contract.

## Compatibility and persistence

Existing explicit example URLs and their literal IndexedDB keys are preserved.
Linked files remain canonical on normal entry; `resume=1` requests the saved
draft. The old Live Scripting Nacre link redirects with its project and resume
arguments intact. Links with a project URL but no program can recover their
old implicit Orbit draft key. Orbit's old root draft remains accessible through
`?program=ui-orbit`; the new Studio root has its own template slot.

Imported projects use `?draft=<id>` and a separate autosave/export slot. Their
addresses refer to this browser's local storage, not a shareable project file.
Missing or unreadable drafts pause autosave and report the problem. Native
editors retain the host-owned project rather than loading a browser example.

A compatibility check also found and fixed an existing shared keyboard mount
bug: its help/panic controls needed a parent before mounting. The component
wrapper now owns those controls, and both instrument standalone pages load.

## Validation

| Check | Result |
| --- | --- |
| Focused authoring, launch, graph mutation, presentation and gesture tests | 20 passed, including six new launch/template regression cases. |
| Browser integration in a separate BB automation profile | 11 checks passed; no captured runtime exceptions. Draft protection, independent example recall, Nacre links, file import/reopen, export identity, legacy draft recovery, Live Scripting and three standalone routes. A narrow viewport also initialized successfully. |
| Core and UI Wasm builds | `./scripts/build-wasm.sh` and `bash scripts/build-ui-wasm.sh` passed. |
| Production web build and authoring TypeScript declarations | `npm --prefix web run build` and the authoring `tsc` project passed. |
| Native package preparation | Both the basic template and an edited/exposed gain version passed `manifold-project-js`'s `validate_package` example using packages produced by `scripts/package-live-export.mjs`. |
| Remaining Rust workspace tests | 550 passed when excluding the three independently reproduced baseline failures below. |

Browser evidence: [checks](../../web/public/studio/2026-10-11-separation/browser-checks.json),
[default project](../../web/public/studio/2026-10-11-separation/default-project.jpg),
[Nacre in Studio](../../web/public/studio/2026-10-11-separation/nacre-project.jpg).
Browser checks kept audio stopped. Native validation prepared packages offline;
this slice did not perform a new DAW playback or native desktop UI run.

The full suites are **not green**. Each following failure was reproduced in a
separate workspace at unchanged parent `02e98f47`:

- `npm test` stops at the stale generated
  `projects/main-wave/live-controller.bundle.js` check.
- Running the Node tests directly gives 131 passes and one failure:
  `creative-example-migration.test.js` expects the older gain endpoint maximum
  of 2, while the current source produces 8.
- `cargo test --workspace` encounters the two native project tests
  `host_ids_and_normalization_are_stable_across_parameter_order` and
  `saved_host_state_reopens_edited_controls_and_keeps_project_content`, whose
  gain-range expectations are stale. Continuing beyond those also encounters
  `every_visible_program_runs_its_saved_source_and_public_native_graph`, which
  rejects the stale bundled endpoint contract.

Those existing bundle/range inconsistencies need a separate repair. They were
not hidden by weakening assertions or regenerating unrelated artifacts here.

## Next design boundary

Lucas approved the separation work and requested collaborative Studio redesign:
**show concrete visual mocks before implementing a redesigned layout**. The
existing panel arrangement remains, apart from product identity, the examples
selector, generic help and empty-state copy.

The mixed-domain component document, graphics adapters, custom visual nodes and
4D plug-in remain subsequent slices. The shared canvas is now labeled Graph,
but its persisted/runtime input is still the existing audio graph; a label is
not evidence of mixed-domain composition support.
