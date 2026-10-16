# Studio workspace: project browser, composition and presenter

11 October 2026. Aster's design study following Lucas's direction after
[product separation](studio-product-separation.md). The requirements below are
accepted user direction; the concrete layout and proposed contracts are for
review. This document does not declare the redesigned production UI delivered.

Open the [interactive study](../../web/public/studio/2026-10-11-workspace/index.html)
through the running development server at
`/studio/2026-10-11-workspace/index.html`. It is a self-contained HTML mock of a
future shared egui workspace, not a replacement DOM application. The Nacre
presenter uses a static crop of our existing application screenshot; no new
instrument artwork, audio processing or live graph implementation is implied.
Lucas liked study 02's revised Explorer proposal and requested an application
bar next. Study 03 adds that bar and its menu interactions for review; package
installation is simulated with example entries.

## User direction

- Consolidate script and file navigation into one project browser. Lucas's
  review correction specifies a VS Code-style Explorer bar: one toggle opens
  the tree beside the asset, with a resizable vertical divider. Closing the
  tree retains the open asset. The earlier three-mode selector and stacked
  tree/editor mock were an incorrect interpretation and are superseded.
  A script is one kind of asset, not a prerequisite for using Studio.
- Show the project's semantic structure as well as its files: compositions,
  node instances, definitions, custom scripts, automation and presentation
  objects. Selecting from the tree must work without finding an object on the
  spatial graph first.
- Link selection to the inspector and other relevant surfaces. Preserve the
  simple Perform/Arrange workflow while allowing inspection and editing inside
  deeper compositions.
- Support movable, resizable, docked and floating panels with recoverable user
  workspace layouts. Put audition input/noise/monitor controls in their own
  host surface.
- Give the plug-in presentation an explicit sizing and interaction contract,
  including fixed aspect ratios and distinct locking rules.
- Prefer loading another project inside the existing workspace. This is useful
  follow-up work, not a reason to hold the design study back.
- Provide a standard application bar for Start, new/open project, settings,
  editor/view controls, deeper contextual menus and external packages.

## What the current project actually stores

[LiveProjectRuntime.save](../../packages/manifold-author/live-project.js) returns
a JSON-serializable `manifold.live-project` envelope: source, files, graph, view,
event state and optional networking configuration. The graph is a versioned
`manifold.project` JSON contract containing the DSP signal graph, exposed
endpoints and instance paths. JS/TS authoring builds this graph using public
APIs; Rust consumes the portable graph contract.

The authored presentation currently comes from source (`webView` and its
layout), not a persisted graph of independently wireable visual objects.
Studio's `studioGraph` literal inside JS records its supported source-backed
graph edits, placements and module definitions. This is not yet a single
semantic JSON graph spanning all audio, visual and mathematical components.

Composition exists, but has limits. [Studio modules](../../packages/manifold-author/studio-graph.js)
currently expand 1–32 primitive nodes with named ports and exposed parameters.
Prism Bend is such a module. Its definition is stored inside the saved project's
source. The code does not recursively instantiate arbitrary module definitions;
general nesting is a runtime/document feature to implement, not just a hidden
tree to reveal. Existing JS factories can compose processing without supplying
all the retained ownership/source metadata a navigable editor would need.

[Project files](../../web/src/authoring/project-files-panel.js) already include
virtual root source files and imported scripts/assets. Additional script files
are stored, but arbitrary imports from those files are not enabled. The mock's
separate `prism-bend.mjs`, automation source and full semantic `project.json`
are proposals, not newly enabled execution paths.

Start the document browser with a read-only semantic JSON view of accepted
state. Editable JSON must go through the same validation and revision-guarded
commands as visual/source edits. Before enabling structural JSON edits, specify
which declaration owns each composition and how edits reconcile with authored
source. A second independently editable graph copy is not acceptable.

## One browser with a collapsible Explorer

The **Project** dock contains a slim Explorer bar, the expandable project tree,
and an asset editor or preview. The bar's single toggle opens and closes the
tree to the left of the asset. A vertical divider resizes them side by side;
they do not stack. Closing the tree preserves the editor instance, open asset
and draft. Opening a file does not change Explorer visibility; **Reveal in
Explorer** explicitly opens it. The divider supports pointer and keyboard
resizing. Narrow layouts retain this orientation.

Study 02 opens with the Explorer and an illustrative source asset visible so
this interaction can be reviewed. This is not a requirement to show scripts
when opening a real project. Source remains an intentional authoring action.

The tree is an ownership and instance hierarchy. It is not a traversal of
signal connections, which may fan out, join or contain supported feedback.
Logical groups such as Engine, Presentation, Definitions and Files are views
over stable project IDs and references. They do not dictate physical folders.

Single-clicking an object selects it. Double-clicking an actual composition
enters its graph, with a breadcrumb and a reliable route back. **Open source**
opens its definition or owning source location; it must not replace a dirty
editor draft. Selecting another object alone does not replace the open document.
Single-clicking a file previews that file. Selection and open-editor identity
are related but separate pieces of workspace state.

The same object ID is used by the tree, graph, presenter selection and inspector.
When a selected descendant is inside a collapsed composition, highlight the
containing node and offer **Reveal in graph**. Do not unexpectedly navigate the
graph or steal text focus because an agent selected something.

An instance inspector distinguishes instance parameters from the shared
definition. **Open source** and **Edit definition** address the definition;
**Make local copy** is a future deliberate operation when edits should affect
only this instance. Built-in compiled implementations expose their descriptors
and source provenance; Studio must not imply that editing a Rust file live in
the browser replaces its DSP kernel.

The inspector normally follows selection. **Pin** retains the inspected object
while another node or preview receives interaction. Opening or pinning a view
does not create a second state authority.

## Docking and interaction modes

Project, Graph, Presenter, Inspector, Activity and Audition are panel types with
stable identities. The mock demonstrates four primary panels, a host audition
strip, panel swaps, in-app floating panels and maximization. It is not a
production docking implementation or proof of cross-window native docking.

The proposed default places the project browser left, graph and presenter beside
one another, and inspector right. Its browser dock is wider in study 02 to show
the tree and asset beside each other. Source inspection and performance presets
change the emphasis. These are review candidates, not approved final geometry.

Workspace layout belongs to user preferences: dock tree, split sizes, tabs,
visibility and pinned targets. Project content owns node positions, composition
hierarchy and plug-in presentation layout. Export does not include the author's
Studio window arrangement. Reset restores a usable layout without changing the
project. Project loading retains mounted panel instances and the user's layout.

## Application bar and command context

Study 03 proposes two rows above the separate Audition strip. The application
row contains **Start, File, Edit, View, Project, Packages, Help**, the project
name and a Settings button. The editor row contains a contextual **Editor**
menu and existing workspace controls. The application row remains available
over Start and the settings/packages panels. Narrow layouts wrap the menu row
instead of hiding its commands.

| Surface | Responsibility |
| --- | --- |
| Start / File | Start screen, new audio plug-in, open/recent projects, save and export. New/open reuse the mounted workspace in this mock. Save/export are disabled placeholders. |
| Edit | Document edit commands and find. Undo/redo remain disabled in the mock, which has no document edit history. |
| View | Nested workspace/editor choices, Explorer and Activity visibility, settings. These are workspace preferences. |
| Project | Project properties, semantic document, selection actions and project dependencies. |
| Editor | Commands for the pane last clicked or focused. Project offers Explorer/source navigation; Graph offers inspect/source/composition navigation; Presenter offers perform/arrange/zoom; Inspector offers pin/source. Maximize/float operate on that pane. |
| Settings | A side panel for Studio preferences. Changes preserve the document and honor workspace locking. |
| Packages | A side panel distinguishing dependencies owned by the current project from extensions installed in Studio. |

Editor focus and object selection are separate: using a menu does not silently
select a different object or change a pinned inspector. Keyboard users can
navigate menu items, enter/leave nested groups, dismiss with Escape and return
focus to the invoking control. The mock uses one menu container with a back
item for deeper levels; cascading desktop menus remain a presentation option.

For implementation, menu actions should resolve through the shared command
descriptors discussed below, with editor/document/selection context and the
same enabled state as other command surfaces. The mock routes its actions to
existing prototype handlers; it does not deliver a production command service.

The package panel demonstrates search, install/remove and installed filtering
using two explicitly fictional packages. Project installs stay with their
project when switching documents; Studio extensions persist across projects.
No package resolution, download, execution or persistent installation occurs.
Production package sources, version pinning, target compatibility and load/
unload behavior need their own contract. Do not infer a particular registry or
package format from these examples. Preparation belongs outside audio processing.

## Performing and arranging

Perform and Arrange describe interaction, not the depth of a project. Perform
routes gestures to authored controls; Arrange enables object selection and
layout editing in the active composition. Nested compositions can have their
own authored presentation without requiring a new application mode. The
exported plug-in still has an explicitly chosen root presentation; inspecting
a child does not silently change the export entry point.

The **Audition** strip holds Studio's test source, device/file selection, input
gain, monitor level and host status. Those controls are not project DSP nodes or
properties of the current script. Where relevant, a separate project transport
binds to the host clock; a native plug-in host may supply those facilities
instead of a browser device picker.

## Presenter contract to specify before implementation

| Setting | Owner and behavior |
| --- | --- |
| Authored dimensions | Project presentation: logical width and height, independent of editor dock dimensions. |
| Fixed aspect | Fit scales uniformly and letterboxes unused dock area; it neither stretches nor crops controls. Pointer coordinates map through the same transform. |
| Responsive sizing | The presentation receives the available logical rectangle and lays out within it. Individual images may still preserve their own aspect ratio. The mock changes bounds around a static image; it does not demonstrate real content reflow. |
| Fit / 100% | Viewer preference. Actual-size viewing scrolls or pans when necessary; it does not rewrite authored dimensions. |
| Host window resizing | Exported target capability plus project min/max/ratio constraints. Resizing a Studio dock is not a request to resize a DAW editor window. |
| Object lock | Project editing policy: prevents the specified layout/transform edits. It does not disable a performance control's parameter gestures. |
| Workspace lock | User layout preference: prevents dragging/docking panels. It does not freeze the project or its controls. |
| Inspector pin | Workspace selection policy. It neither locks the object nor changes presentation aspect. |

The adapter contract must also cover logical versus backing-pixel dimensions,
device pixel ratio, resize notifications, pointer capture/cancel, keyboard
focus, hidden-panel behavior, resource disposal and a useful unavailable/error
surface. Selection/gizmos are Studio overlays and stay out of the exported
performance face. Browser/webview and native renderers obey equivalent semantic
rules even when their implementation APIs differ.

## Reference findings

**Sentinel 0.5.66, local restored installation.** Revisited the saved actual
[application capture](/home/shamanic/Applications/Sentinel-Recovery/sentinel-amd-touchdesigner-layout.png)
and its bundled
[UI interactions](/home/shamanic/Applications/Sentinel-Recovery/sentinel-proton/pfx/drive_c/Sentinel/workspace-template/knowledge/ui-interactions.md)
and [module contract](/home/shamanic/Applications/Sentinel-Recovery/sentinel-proton/pfx/drive_c/Sentinel/workspace-template/knowledge/module-pipeline.md).
Dock tabs can move and float; panel selection and preview interaction have
different effects on the Properties selection. Modules expose their project
directory and reload operation. Viewport APIs expose objects, selection and
edit transactions. Panel presentation and render resolution are distinct
policies. This evidence does not establish an integrated source editor for
every node: do not claim Sentinel already provides the proposed file/source
workflow. No live Sentinel project was changed for this review.

**TouchOSC.** Its [document tree](https://hexler.net/touchosc/manual/editor-document)
selects controls, expands containers and exposes visibility/locking. Document
dimensions determine proportional presentation scaling. Its
[script editor](https://hexler.net/touchosc/manual/editor-script) can expand for
longer source, with separate error feedback and execution controls. Take the
linked object tree and intentional source access; preserve Manifold's explicit
accepted-revision model rather than adopting focus-loss compilation.

**Open Stage Control.** The accessible official
[v0 editor documentation](https://v0.openstagecontrol.ammd.net/docs/editing-sessions/)
shows selected-widget property editing, parent/child/sibling navigation,
container operations and JSON/JSON5 property input. This is historical evidence,
not a review of its current release. Its current site could not be retrieved
through the research browser; the GitHub repository now points to Framagit.
The transferable lesson is that selecting and navigating an object need not
depend on finding it visually on the canvas.

**PhotoCraft.** Reviewed official architecture/development docs and source tree
`97136485f0743251ab330d096ca6c9d0f0f6f54c` (11 October 2026). It is an independent
Photoshop-style reimplementation, not Adobe software. Its
[command registry](https://github.com/storytold/photocraft/blob/97136485f0743251ab330d096ca6c9d0f0f6f54c/docs/architecture.md)
serves UI, CLI and automation. Actual
[menus](https://github.com/storytold/photocraft/blob/97136485f0743251ab330d096ca6c9d0f0f6f54c/crates/ui-egui/src/menus.rs)
combine engine commands with shell operations. Its
[workspace code](https://github.com/storytold/photocraft/blob/97136485f0743251ab330d096ca6c9d0f0f6f54c/crates/ui-egui/src/workspace_ui.rs)
persists named layouts and a workspace lock in preferences; its
[docking implementation](https://github.com/storytold/photocraft/blob/97136485f0743251ab330d096ca6c9d0f0f6f54c/crates/ui-egui/src/panel_docking.rs)
supports grouped/floating panels. The
[Home control](https://github.com/storytold/photocraft/blob/97136485f0743251ab330d096ca6c9d0f0f6f54c/crates/ui-egui/src/chrome_ui.rs)
shows a start surface over still-open documents. Take consistent discoverable
commands, durable workspace preferences and a start surface that does not
destroy the session; avoid copying photo-specific tools or menu breadth.

For Manifold, extend existing semantic commands with discoverable metadata,
scope, parameter schemas and capability checks for menus, palette and agents.
Keep project mutation commands distinct from workspace navigation. Agent
readback should identify affected objects, definitions, files and revisions;
the UI can then offer Inspect, Open source and Reveal in graph for the same IDs.

## Project loading without rebuilding the page

This is feasible with the existing runtime, and file import already performs an
in-place `project.restore`. Example selection currently takes the full-page
navigation path. Simply replacing `location.assign` would leave inconsistent
draft, identity and history handling.

Introduce one document-loading boundary under the stable Studio workspace:

1. Resolve and validate the requested document/assets privately. Track the
   pending operation so a stale asynchronous load cannot win a newer selection.
2. Account for **all** drafts, including imported file editors. The current host
   guard checks root/presentation source; the files panel has its own dirty
   editor behavior, which needs to join the common draft lifecycle.
3. Settle gestures, persist accepted work and prepare the replacement through
   the existing host. Invalid or rejected preparation keeps the old document.
4. Adopt the accepted document in the existing panel subscriptions; reset or
   restore document-specific selection, graph view and undo history. Do not
   carry an old object's selection merely because a new node reuses its ID.
5. Change URL, autosave slot, project/export identity and linked-file reload
   target only after adoption. Retain Studio's layout and agent connection;
   retain project/revision identity on pending exports and agent commands.
6. Retire the old presentation, asset URLs and document services explicitly.
   Renderer refresh is expected; replacing the whole application shell is not.

Do this for browser project switching first, with equivalent native behavior
only where the enclosing host permits replacement. It is a separate follow-up
from choosing the dock layout. The mock demonstrates the desired stable-shell
interaction only; production example switching remains unchanged in this study.

## Review and implementation sequence

1. Review the mock with Lucas. Decide default panel emphasis and browser/editor
   interaction before implementing production geometry. The revised Explorer
   received positive review; the application bar is the current addition.
2. Specify project object identities, ownership, source locations and the
   document-loading/draft lifecycle. Make current modules and virtual source
   files navigable without claiming arbitrary nesting already works.
3. Deliver the unified Project browser, shared selection and aspect-correct
   presenter through the shared egui/browser/native contract, with a coherent
   undo and focus model. Then make the workspace dockable and persistent.
4. Extend the semantic document and composition APIs for genuine nested and
   visual/math components. Prove custom definitions, child navigation and
   source/graph reconciliation before the 4D plug-in depends on them.

Study 02 verification: eleven browser checks passed, including actual pointer
and keyboard divider resizing, Explorer collapse/reopen with the same mounted
asset and retained sidebar width, scroll retention, and explicit source/reveal
behavior. Shared selection, nested graph navigation, inspector pinning, JSON
viewing, sizing, docking/floating/maximizing and stable-shell mock loading still
pass. The tree remains beside the asset without page-width overflow at
1121/1000/900/720/640/420 px. No captured runtime exceptions. See
[check record](../../web/public/studio/2026-10-11-workspace/mock-checks.json) and
[default layout capture](../../web/public/studio/2026-10-11-workspace/compose.jpg).
The [collapsed Explorer](../../web/public/studio/2026-10-11-workspace/explorer-collapsed.jpg)
and [source-focused layout](../../web/public/studio/2026-10-11-workspace/inspect-source.jpg)
are also captured. Study 01 additionally verified an actual pointer drag of
the Graph header into the left dock; study 02 repeats panel move menu checks.

Study 03 repeats those eleven checks and adds eight checks for keyboard menus,
deeper workspace navigation, active-editor context, settings, the start-screen
application bar, stable-shell New, package ownership and search/removal/filtering,
and reachable menus/panels at 1362/1000/720/420 px. No captured runtime exceptions.
See the [application-bar checks](../../web/public/studio/2026-10-11-workspace/appbar-checks.json),
[current layout](../../web/public/studio/2026-10-11-workspace/application-bar.jpg),
[File menu](../../web/public/studio/2026-10-11-workspace/file-menu.jpg) and
[package panel](../../web/public/studio/2026-10-11-workspace/packages.jpg).
These checks validate the review artifact, not the proposed production features.

## Implementation and subsequent correction — 11 October

Lucas approved building the application bar / Explorer proposal, with unfinished
operations grayed out, in standalone and Wasm Studio. His subsequent review
rejected a rigid four-column implementation and whole-surface hiding for menus.
The implementation now uses editable horizontal/vertical split trees, restores the
original Graph-below layout as Classic/default, supports saved named arrangements,
and clips embedded surfaces only where an actual overlay covers them. The mock
above remains historical design evidence; the [delivery record](studio-workspace-delivery.md)
describes the actual functionality, disabled features and host validation limits.
