# Studio workspace implementation — 11 October 2026

Lucas approved implementation of the reviewed application bar and Explorer,
with unfinished operations disabled. He then rejected the rigid four-column
arrangement and hiding embedded content whenever a menu opens. The delivered
workspace restores the earlier arrangement and makes pane topology editable.

## Delivered behavior

- A persistent egui application bar: Start, File, Edit, View, Project, Packages,
  Help and Settings. Contextual Editor actions follow the active pane. Audition
  input/monitor controls are a separate strip; browser audio Start/Stop remains
  available there. Browser examples are explicit Project menu choices.
- Classic is the default: Project and Presenter above Graph, Inspector at the
  right. Columns, Inspect source and Presenter-only are additional presets.
- Drag pane titles onto another pane's edges to split left/right/above/below;
  dropping in the centre swaps panes. The pane menu offers the same relative
  docking operations. Every split resizes. View → Panels hides/shows panes;
  Lock workspace prevents rearrangement without preventing ordinary editing.
- View → Saved layouts saves named split arrangements, pane visibility,
  Explorer width/visibility and focused/floating pane choice. Names are unique;
  deleting/resetting the current arrangement does not erase other saved layouts.
  Browser preferences live in localStorage; native preferences live in
  `$XDG_CONFIG_HOME/manifold/studio-workspace.json` (usual `~/.config` fallback).
  These preferences belong to the authoring host, not the exported plug-in.
- Explorer is one collapsible sidebar **beside** the asset, with its own vertical
  divider. It exposes current engine nodes/groups, presentation controls, the
  accepted graph JSON and nested project file paths. Selecting an engine or
  presentation object updates selection. The subsequent
  [node source-navigation slice](studio-node-source-navigation.md) follows a node's
  code while Project is visible and exposes explicit declaration/definition links.
- The file header's **−** button hides the file view and lets Explorer fill the
  Project pane. Selecting graph/Explorer objects keeps the file hidden; clicking
  a file or explicit source link reopens it. **Show file** restores the current
  asset, and **View → File view** provides the same visibility control. Drafts,
  editor instances and the previous tree/file split width survive. Visibility
  belongs to workspace preferences and named layouts; older layouts still open
  with the file visible. Hiding Explorer restores the file if needed, so Project
  never becomes an empty pane.
- Project and presentation source use the existing editors. Browser imported
  files retain their editor/preview. Native text files are editable, and file
  drafts survive source navigation. `project.json` shows the accepted audio graph
  and the implemented custom-surface composition; it does not imply the broader
  proposed multidomain execution contract has shipped.
- Presenter maximizes into the workspace, floats as an independently movable /
  resizable panel, and docks again. Its optional fixed aspect has explicit preview
  dimensions. Responsive/free sizing is the default; exported window rules remain
  a separate, unfinished capability. One pane may float at a time. Floating window
  coordinates themselves are not part of named layouts yet.
- The fixed-aspect default is 1160 × 670 (about 1.73:1), matching Lucas's
  subsequent screenshot of the plugin content without Studio's toolbars. Old
  saved 960 × 640 defaults migrate once; custom dimensions and saved layouts
  remain intact. Native and Wasm share this preference migration.
- Menus, tooltips and floating panels cover only their own rectangles. Embedded
  source and presentation remain mounted and visible elsewhere, and remain live
  through workspace changes. Starting a chrome drag keeps pointer ownership in
  Studio while crossing an embedded surface, without hiding that surface.
- Browser New and Open reuse the mounted workspace. `project.restore` accepts an
  explicit `newDocument` flag to clear undo history **after** successful host
  acceptance; ordinary undoable restores retain their previous semantics. Failed
  adoption preserves the accepted document and history. Native Open also requests
  a new document history.

## Ownership and host implementation

`studio/workspace.rs` owns chrome, preferences, selection navigation and pane
content. `studio/docking.rs` owns validated binary split trees, pane relocation,
dividers and rectangular occlusion. Both compile into native and Wasm Studio.
Neither holds DSP state or requires a particular presentation library.

The browser adapter places its existing DOM children into the shared rectangles.
CSS paths apply the shared visible regions to both pixels and hit testing. Linux
Wry child windows use X Shape for the equivalent visual and input regions; GTK
allocation resets bounding shapes, so the adapter reapplies them after GTK event
processing. This is control/UI-thread work. The native audio callback is untouched.
The native embedding continues to require the existing Linux X11 Wry host;
this slice does not add macOS/Windows presentation embedding.

The JS controller change requires regenerating dependent native controller bundles
and project packages. This also resolves stale generated-bundle checks that were
reported by the preceding separation slice; it does not change gain-range test
expectations or DSP behavior.

## Disabled / later work

Package installation/dependency editing, external extensions, recent-project
history, redo, nested composition navigation, visual/math graph editing,
automation-tree editing, visual-object inspection, inspector pinning and separate
OS windows remain disabled. The native host also disables New and Export because
it does not yet implement those host commands. No mock installer or simulated
export was moved into production.

The broader renderer abstraction, deeper project composition and 4D plug-in nodes
remain subsequent work. The semantic tree exposes the composition already present
in the current project contract.

## Verification and limits

The Explorer-only follow-up passes actual browser and Linux standalone clicks:
collapse, select a node without reopening, click a file to restore, retain a
draft (and apply it in native), and restore a named layout. Browser reload
retains the choice; native uses the same saved preference contract. Six shared
UI/app tests, including older-layout compatibility, and UI Wasm, production web
and release standalone builds pass. Actual screenshots and receipts are in
`web/public/studio/2026-10-11-explorer-only/`; reproduction scripts are
`web/review-explorer-only.mjs` and `web/review-explorer-only-native.py`.

Shared Rust tests exercise arbitrary relative docking and non-overlapping bounds,
exact menu occlusion area, locked mutations, invalid preferences, Presenter
maximize/float/dock and named layout persistence without project commands.
Browser runtime tests cover successful and rejected document switches and undo
isolation. Native release, UI Wasm, audio Wasm and web production builds pass.

Actual browser interaction checks cover menu visibility/hit testing, pointer-driven
split resizing/docking, Presenter modes, saved layouts across reload, narrow
viewport geometry and unchanged project revision during layout edits. Actual Linux
standalone review covers settings occlusion, Presenter modes and saved split
arrangements, using Wry/CodeMirror and the Nacre example package on an isolated
X display. Native audio was verified on `manifold_review_null`; user desktop focus
and physical audio routing were preserved.

The complete suites are not green: the earlier Node creative-example-migration
fixture and two manifold-native gain-range expectations still fail. Two native
script integration tests hit their two-second deadline under concurrent machine
load; each passes when retried alone. Generated-package and TypeScript checks pass.
See the [check record](../../web/public/studio/2026-10-11-implementation/checks.json),
[Classic browser workspace](../../web/public/studio/2026-10-11-implementation/classic.jpg),
[browser menu layering](../../web/public/studio/2026-10-11-implementation/browser-settings.jpg),
and [native floating Presenter](../../web/public/studio/2026-10-11-implementation/native-floating.png).

Separate native project issues were found during review: opening the 4.7 MB
asset-rich Nacre Prism Bend document fails in QuickJS before Studio mounts. The
smaller Nacre package loads, but its artwork has white patches on the isolated
software-rendered WebKit display. These are not treated as full native Nacre
rendering parity. They need a dedicated load/resource and real-GPU presentation
check; the shared layout and native window clipping were verified independently.

The aspect correction was checked in the actual browser at 1400 × 1000,
900 × 700 and 640 × 900: the preview stays at 1.73134:1 and Nacre retains its
wide presentation. Saved-default migration survives reload, custom dimensions
survive migration, and a later explicit 3:2 choice remains intact. Shared UI
tests (5), native release, UI Wasm and web production builds pass. See the
[corrected fixed-aspect Presenter](../../web/public/studio/2026-10-11-implementation/presenter-fixed-aspect.jpg).
