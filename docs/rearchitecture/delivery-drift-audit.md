# Delivery drift audit — 1 October 2026

Status: implementation paused at Lucas's request. This audit is a record of
requirements and execution failure, not a product checkpoint or resumed work.

## Sources inspected

BB thread `thr_miqzrpytak`: prompt history, completed user/assistant messages
from the original discussion through 29 September 04:30 UTC, and subsequent
user corrections. The earlier source thread is `thr_ucfk35vywb`.
Jujutsu change `yvsnokvl` / commit `d33606de493f318f876209440dab3739165943f6`
contains the original egui plan. The subsequent change history, current recovery
handoffs, and editor dependencies were also inspected.

Times below are Europe/London (BST, UTC+1). Event sequence numbers refer to the
recorded BB thread, rather than provider context or recollection.

## Explicit commitments

| Time | Record | Requirement or commitment |
| --- | --- | --- |
| 29 September 01:26 | User, event 1240 | Rust/JS/TS graph authoring; immediate-mode egui UI in native and Wasm; browser HTML where useful; painting calls with JS and typed TS bindings. |
| 29 September 01:29 | Assistant, event 1401 | Acknowledged one graph contract and egui as the preferred immediate-mode UI across native and browser/Wasm; saved the requirement in `yvsnokvl`. |
| 29 September 02:33 | User, event 4014 | Import Manifold, author an instrument and export the same project to the web or a DAW; shipped graphs/presets must use the author-facing primitive composition. |
| 29 September 02:45 | User, event 4415 | Enough preparation; implement tasks and provide actual deliverables, then continue. |
| 29 September 04:31 | User, event 10667 | Stop substituting tiny pieces and status reports for something reviewable; see the task through. |
| 29 September 05:06 | User, event 12199 | Evidence means live usable builds; otherwise video/pictures plus code. |
| 29 September 06:29 | User prompt history | Pursue the complete Manifold port, preserving modularity, library use and scripting throughout. This did not remove the frontend commitments. |

Exact excerpts from the original discussion:

> And then for the UI, for the front end this is where I think I actually land.

> Because we can provide the painting API that can be called from whatever if we supported JS bindings, those are also typescript bindings if they're typed.

The assistant explicitly responded:

> I’ve updated [the work register](/home/shamanic/dev/Manifold-v2/docs/rearchitecture/README.md) to require **one graph contract with Rust and JS/TS authoring bindings**, and to make **egui the preferred immediate-mode UI** across native and browser/Wasm.

The original plan's R08 explicitly required a Rust egui renderer for browser/Wasm
and native plug-in editors, reused original widget behavior, JS/TS frame/widget
bindings, and a shared model for Main and another project. Its handoff explicitly
said to probe egui in browser and native. These requirements were recorded before
the long-running goal; they were not recent additions.

## Where execution departed

At 29 September 01:52 (assistant event 2524), the proposed order put graph
contracts first, execution second, benchmarking/publication third, Main graph
migration fourth, and Rack/Patch/egui presentation fifth. This made UI delivery
depend on a broad backend sequence instead of demonstrating those capabilities
together in one existing instrument.

The subsequent checkpoints kept extending that sequence: project packages and
native JS, structural publication, Worker ownership/deadlines, continuity and
resources, MIDI, loop storage, Sample, partial Main Wave and declared host buses.
Their handoffs repeatedly named another backend task while leaving egui and the
full project workflow open. The prepared-runtime handoff again placed shared
egui presentation fifth after integration, identity, continuity and measurements.

Some backend defects genuinely needed correction. The arbitrary-I/O requirement
was also explicitly requested. Neither explains omitting all egui implementation
or continuing without an integrated instrument/editor delivery gate. A primitive,
adapter, isolated HTML study or passing host probe did not satisfy that gate.

Current `manifold-editor` dependencies implement a GTK/Wry webview host; the
workspace has no egui dependency. Installing CodeMirror dependencies in the last
turn did not implement a coding editor. DspLiveScripting's migration record still
lists its script editor, lifecycle, retained graph interaction and widget runtime
parameters as open. Main's authored Wave graph is a partial branch, not the full
authored Main product with its UI.

## Explanation and responsibility

The history supports a planning and task-selection failure: an expanding backend
prerequisite chain repeatedly displaced the required product slice. Requirements
were available, acknowledged and preserved in repository instructions. They were
not absent, withdrawn or implicitly replaced by later requests. The exact private
motivation cannot be established from a transcript; the observable decisions can.

The assistant selected and continued those tasks and failed to make the user's
delivery criteria govern the sequence. Tests and reports were allowed to stand in
for progress the user could actually review. Recording UI work as "open" did not
justify continually deferring it.

## Governing role and acceptance criteria

The role is to port the actual Manifold product and authoring environment. Use an
existing instrument/project as the connected implementation: import the library,
author its graph, edit it while audio runs, author and display UI through the
agreed egui and JS/TS interfaces and original widget behavior, interact with live
controls and graph views, then save/reopen and run the project in browser and
native hosts. Shipped products must exercise the same public interfaces offered
to users and agents.

Backend changes count toward delivery when integrated into that workflow and
shown in a usable build. Validation supports that delivery. It does not substitute
for it. No backend-only completion claim closes the UI or project gates.

Implementation remains paused. This audit neither authorizes resumption nor
counts as delivery of an instrument, editor or frontend.
