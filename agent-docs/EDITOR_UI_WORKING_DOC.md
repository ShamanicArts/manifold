# Editor UI Working Document

## Vision: Chataigne-Style Visual Authoring Environment

The Editor is a **self-hosted visual authoring environment** (comparable to Chataigne, TouchOSC, or Open Stage Control) that enables users to:

1. **Visually design UI layouts** - Drag/drop widgets, resize, arrange
2. **Wire widgets to DSP parameters** - Connect UI controls to audio processing
3. **Author Lua behavior** - Write scripts, define callbacks, create reusable components
4. **See live previews** - UI updates in real-time as you edit
5. **Manage projects** - Organize UI files, DSP scripts, assets, mappings

### Key Principle

The Editor is **not** just a code editor with a preview. It is a **visual control surface designer** where:
- Non-coders can build UIs by dragging widgets and setting properties
- Coders can dive into Lua for advanced behavior
- Both workflows coexist in the same environment

---

## Architecture

### The Hierarchy

```
SHELL (ui_shell.lua) - ALWAYS PRESENT, NEVER RELOADED
├── Top bar: [Performance] [Edit] toggle, Master/Input controls, Settings
├── Content Area (switches based on mode):
│   ├── PERFORMANCE MODE: User's full UI (looper_ui.lua, etc.)
│   └── EDIT MODE: Editor layout with Canvas Preview showing the same UI
└── State management, mode routing
```

**The Rule:** The Shell is the persistent parent. It NEVER gets swapped. User UIs are children that the Shell manages.

### Mode-Based Layout

**PERFORMANCE MODE:**
```
┌─────────────────────────────────────────────────────────────┐
│ MANIFOLD  [Performance] [Edit]  Master  Input  Settings     │  ← SHELL
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           USER'S UI (looper_ui.lua, etc.)                   │  ← FULL SIZE
│           Full control, no editor chrome                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**EDIT MODE:**
```
┌─────────────────────────────────────────────────────────────┐
│ MANIFOLD  [Performance] [Edit]  Master  Input  Settings     │  ← SHELL
├──────────┬────────────────────────────┬─────────────────────┤
│ PROJECT  │      CANVAS PREVIEW        │    INSPECTOR        │
│  TREE    │                            │                     │
│          │   ┌────────────────────┐   │  Type: Button       │
│ 📁 ui/   │   │  USER'S UI         │   │  Label: "REC"       │
│  📄 main │   │  (live preview)    │   │  BG: #ff7f1d1d      │
│ 📁 dsp/  │   │  - clickable       │   │  [on_click code]    │
│          │   │  - editable        │   │                     │
└──────────┴───┴────────────────────┴───┴─────────────────────┘
     ↑              ↑                        ↑
  File tree    The UI being edited      Properties + Script Editor
```

---

## Current State (2026-03-04)

### Completed: Shell Mode Switching with Scaled Preview

**What Works:**
- Shell owns all main elements: header, content, tree panel, inspector panel
- Mode toggle (Performance | Edit) switches layout correctly
- **Edit mode**: Content is scaled to fit preview area using transforms
- **Performance mode**: Content is full size
- C++ defers to Shell for content positioning when Shell is active

**Key Architecture Decision:**
- Content bounds at (0, 0) with design size
- Transform handles BOTH scale AND position: `setTransform(scale, scale, previewX, contentY)`
- C++ `LuaEngine::notifyResized` no longer calls `setBounds` on scriptContentRoot when Shell is active

### Completed: Canvas API Extensions

| Method | Purpose |
|--------|---------|
| `toFront(grabFocus)` | Bring canvas to front of z-order |
| `toBack()` | Send canvas to back of z-order |
| `setTransform(sx, sy, tx, ty)` | Apply scale + translate transform |
| `clearTransform()` | Remove transform |
| `adoptChild(canvas)` | Reparent a canvas from another parent |

### Completed: Widget Metadata Storage

- `Canvas::setUserData(key, value)` - Store arbitrary Lua data
- `Canvas::getUserData(key)` - Retrieve or return nil
- All widgets store `_editorMeta` with type, config, callbacks

---

## Current Shell Architecture

```
parentNode (rootCanvas from C++)
├── scriptContentRoot (child 0) - Shell references as shell.content
├── shell.panel (header bar with mode toggle, knobs, settings)
├── shell.treePanel (visible in Edit mode)
└── shell.inspectorPanel (visible in Edit mode)
```

**Performance Mode:**
- treePanel/inspectorPanel hidden (bounds 0,0,0,0)
- content at full size, no transform

**Edit Mode:**
- treePanel on left (180px)
- inspectorPanel on right (220px)  
- content scaled to fit center preview area
- Transform: `setTransform(scale, scale, previewX, contentY)`

### Key Code Locations

| File | Purpose |
|------|---------|
| `manifold/ui/ui_shell.lua` | Shell implementation, mode switching, layout |
| `manifold/primitives/scripting/LuaEngine.cpp` | C++ side, defers to Shell when active |
| `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` | Canvas Lua bindings |
| `manifold/ui/looper_ui.lua` | Example user UI (unchanged, works in both modes) |

### Structured Project Layout Contract (v1)

This is now the working rule for project-backed UIs:

- Structured `.ui.lua` files may contain `x/y/w/h`, but those are **design defaults**, not a guarantee of fixed runtime size
- Responsive layout is currently **behavior-owned** via `resized(ctx, w, h)`
- `w, h` are the **local bounds of that behavior root widget**
- Root behavior lays out major regions against the live viewport
- Component behaviors lay out their internals against their own local root bounds
- This is the foundation for future declarative layout modes:
  - `absolute`
  - `relative`
  - `hybrid`
- When declarative layout lands, it should run before behavior `resized()`, with behavior remaining the escape hatch for complex/custom layout

This avoids the exact bug we just tripped over: confusing design-time absolute defaults with runtime responsive layout.

### First-Pass Structured Project Progress (2026-03-06)

The original working doc was heavily shell/editor-centric. First-pass project-format work has now advanced the runtime well beyond that earlier snapshot.

#### What now exists
- Project discovery under `UserScripts/projects/`
- First-pass reference project under `UserScripts/projects/Looper_uiproject/`
- Structured scene loading for `.ui.lua`
- Component instancing with scoped IDs and per-instance props
- Behavior lifecycle for structured UI:
  - `init(ctx)`
  - `resized(ctx, w, h)`
  - `update(ctx, state)`
  - `cleanup(ctx)`
- Project-backed DSP manifest resolution and load
- A/B switching between legacy monolithic UI and project-backed UI
- Shell-level hosted layout contract for performance views
- Declarative per-node layout infrastructure in the structured loader:
  - absolute
  - relative
  - hybrid

#### Current first-pass reality
- The project-backed default UI is real, loadable, and resizes correctly through the shell
- Transport / capture plane / layer strips / scrub path have been manually recreated in the project model
- Legacy and project-backed UIs both remain first-class and switchable
- The shell now owns top-level hosting/layout policy; the project loader owns internal node layout resolution

### Runtime/View Topology Reset (Important)

The current project/runtime model is too flat if it treats every project switch as a full backend swap.
That is already wrong for the legacy Looper ↔ SuperDonut relationship.

We need to distinguish three separate concerns:

1. **Foundation runtime**
   - shared looper transport/state
   - loop buffers/capture/playback state
   - selected layer / active layer
   - base input path / any intentionally shared core DSP

2. **Overlay DSP/UI layers**
   - optional effect layers such as the SuperDonut FX layer
   - may be activated/deactivated by a view/tab
   - may be persistent, transient, exclusive, or shared depending on policy

3. **Views**
   - looper view
   - donut view
   - future alternate layouts/edit surfaces
   - these are presentation layers over a foundation, not necessarily separate instruments

#### Legacy parity rule for Looper + SuperDonut

For the legacy behavior we are trying to preserve:
- `Looper_uiproject` and `SuperDonut` should share the same **looper foundation state**
- switching between those two should preserve:
  - loop state
  - transport state
  - selected/active layer state
- the SuperDonut-specific FX layer may be torn down when leaving the donut view
- the base looper/input foundation should remain alive

This means the correct model is not:
- "project = one UI + one exclusive DSP graph"

It is closer to:
- "project/view = one presentation over a runtime foundation, optionally with overlay DSP layers"

#### Tabs are not just shell chrome

A **Tab widget / tab host** is now an important architectural primitive, not just cosmetic navigation.

We need to distinguish three related but separate concepts:

- **Shell tabs**
  - the current shell-level tab implementation for top-level UI/editor surfaces

- **User-authored Tab widgets**
  - widgets users place inside their own structured projects
  - these should be able to host normal child content/components/pages
  - they should fit naturally into the directory model (`ui/main.ui.lua`, `ui/components/...`, per-tab content docs/components, behaviors)
  - users should be able to build tabbed performance/control layouts directly inside their projects

- **Project/view tabs**
  - tabs inside a runtime family/project that switch between views over the same shared foundation
  - e.g. Looper view, Donut view, future mixer/advanced views
  - these may share implementation lineage with a Tab widget, but they are not identical in semantics because view switches may also affect runtime/overlay activation policy

This suggests that a first-class **Tab widget/base widget** is important in its own right, and that the current shell tab implementation may eventually need to be reworked/aligned with that widget rather than remaining a separate one-off implementation.

#### Design direction

The architecture should support all of these topologies explicitly:
- fully exclusive projects with independent DSP/runtime state
- shared-foundation projects with multiple views
- shared-foundation + transient overlay DSP layers
- combined/nested tabbed layouts inside a project

The immediate practical use-case is Looper + SuperDonut legacy parity, but the model should be general enough for future instruments/layouts instead of hardcoding a donut special case.

### Sanity Check Against `EDITOR_FIRST_PASS_WORK_PLAN.md`

The first-pass plan, not this older working doc, is the authoritative execution plan for the project-format track.

Current status against that plan is:
- **Phase 1 — Freeze target + audit current work:** effectively complete
- **Phase 2 — Create the reference project skeleton:** complete
- **Phase 3 — Lock first-pass structured UI / behavior / path contracts:** substantially complete for v1 runtime
- **Phase 4 — Manually recreate the default UI:** substantially complete for first-pass transport/capture/layers/scrub behavior
- **Phase 5 — Add runtime support:** substantially complete for discovery, manifest loading, structured scene loading, behaviors, project DSP, legacy coexistence
- **Phase 6 — Add editor support for structured assets:** partial
  - structured assets load into the hierarchy/inspector path
  - full structured save/load round-trip still needs explicit completion/verification
- **Phase 7 — Validation / parity / handoff:** in progress

Practical implication:
- the older "current priority" list below is still useful for general editor work,
- but it must not override the first-pass plan for the project-backed UI/DSP track.

---

## SuperDonut / Project DSP Debugging Postmortem (2026-03-06)

This section records the mistakes, the actual causes, and the debugging discipline that should have been used.

### What went wrong

1. **Wrong ownership model in manifest/UI entry**
   - `UserScripts/projects/SuperDonut/manifold.project.json5` was still pointing at `system:ui/donut_looper_super_ui.lua`.
   - That was the wrong architectural example and it hid what the project actually owned.
   - Result: the project looked project-backed on paper while still relying on a system UI root that generated and managed its own DSP slot path.

2. **Wrong DSP composition model**
   - A bad intermediate attempt treated two full DSP builders as if they were safely composable:
     - base looper `buildPlugin(ctx)`
     - super extension `buildPlugin(ctx)`
   - That was incorrect. Two whole plugin builders on the same `ctx` is not a valid extension seam unless the API explicitly supports that shape.
   - The correct shape is:
     - project `dsp/main.lua` owns the single real `buildPlugin(ctx)`
     - project helper/module attaches or composes extra graph/state within that build
     - extension module exposes a narrower helper seam (`attach(...)`, etc.), not a second independent plugin build

3. **Invalid project-local DSP code**
   - The first project-local Super extension copied effect definitions that passed numeric defaults directly into setters with stricter integer/bool expectations.
   - Concrete failure observed through direct DSP loading:
     - `setVoices(3.0)` path failed because the binding expected an exact integer-compatible value.
   - This made the project DSP invalid even before any higher-level UI/runtime claims.

4. **Wrong narrative about crashes**
   - Saying "the app is unstable" was backwards.
   - If the host crashes after a project DSP/UI change, that change must be treated as the regression until proven otherwise.
   - The correct stance is: new crash after new change = assume our bug, isolate it, fix or remove it.

### Why the issues were encountered

The failures were not mysterious. They came from a bad debugging/process sequence:

- too much confidence in architectural reasoning before direct load validation
- switching full project/UI paths before proving the DSP file itself loads cleanly
- not using the available direct DSP loading path early enough (`loadDspScript(...)` + `getDspScriptLastError()`)
- not immediately dropping to proper crash debugging discipline once host crashes appeared
- not treating the system-UI manifest pointer as a first-order smell early enough

### What actually fixed it

1. **Make the project own the UI root**
   - `SuperDonut` manifest now points to `ui/main.ui.lua`, not the system donut UI.

2. **Make the project own the DSP composition root**
   - `UserScripts/projects/SuperDonut/dsp/main.lua` now owns the single real `buildPlugin(ctx)`.
   - The project-local super module is attached from there instead of pretending a finished system donut script is the project story.

3. **Turn the project-local super module into an extension helper, not a second plugin**
   - `UserScripts/projects/SuperDonut/dsp/super_extension.lua` now exposes an attach-style seam used by `main.lua`.

4. **Directly validate DSP load before broader UI/runtime claims**
   - Using `loadDspScript('/home/shamanic/dev/my-plugin/UserScripts/projects/SuperDonut/dsp/main.lua')`
   - Then checking `getDspScriptLastError()`
   - This exposed the real invalid setter/type issue immediately.

5. **Coerce effect param application safely for strict bindings**
   - Project-local Super extension now retries param application using rounded integer / boolean-compatible values where needed.
   - After this, direct DSP load succeeded and `/core/super/...` endpoints became available.

### Required debugging protocol going forward

This is the minimum acceptable process for project DSP/UI debugging in this repo:

1. **Use the dev build / repo-local runtime first**
   - use `build-dev`
   - use the tmux workflow already defined for the project

2. **Validate DSP files directly before switching whole projects**
   - `loadDspScript(...)`
   - `isDspScriptLoaded()`
   - `getDspScriptLastError()`
   - `listEndpoints(...)`
   - direct `getParam(...)` probes

3. **Use IPC as first-line observability, not vague inference**
   - verify current script path
   - verify endpoint presence
   - verify actual param values after widget callbacks

4. **If the host crashes, stop calling it ambient instability**
   - assume the regression is ours
   - isolate the last bad step
   - remove or minimize the change
   - only proceed once the smaller step is proven

5. **Use debugger/backtrace tooling for real crashes**
   - if a change causes repeatable host death, run under `gdb` and capture the backtrace
   - do not keep iterating blind while normalizing the crash as background noise

### Current resolved state from this incident

- `SuperDonut` now demonstrates the intended architecture more honestly:
  - project-owned UI root
  - project-owned DSP entry/composition root
  - project-local Super FX extension
  - system behavior used as reusable foundation, not as the hidden final project authority
- direct DSP load now succeeds
- `/core/super/...` endpoints are present
- project UI behaviors can drive real Super parameters through the integrated project path

---

## Priority Reset (Agreed)

This is the active ordering going forward:

1. **Dev console now (moved earlier)**
   - `~` inline console for fast testing/debug authoring
   - command shortcuts for endpoint inspection (`get/set/trigger`), undo/redo, selection inspection
   - copy/paste workflows for identifiers into console and external chat/docs

2. **Runtime/view topology + tabs foundation (new architecture checkpoint)**
   - stop treating every project switch as an automatic full backend swap
   - define foundation runtime vs overlay DSP layer vs view ownership
   - preserve legacy Looper ↔ SuperDonut shared-state semantics intentionally
   - design first-class project/view tabs over shared foundations
   - align current shell tabs with a future reusable Tab widget / Tab host

3. **Parameter exposure framework (new foundation phase)**
   - unify what is editable across:
     - widget style params
     - custom canvas-draw style params (e.g. donut ring colours)
     - behavior params (e.g. XY friction/spring/damping)
   - remove "random" inspector feel by making exposure explicit instead of inferred only

4. **Then map/design-heavy work**
   - Widget ↔ DSP mapping UI
   - Lua behavior authoring linkages

5. **Deeper model work stays later**
   - persistence/save-load
   - codegen/round-trip

## Task List

### Phase 1: Shell Foundation ✅ COMPLETE

**Task 1.1: Canvas UserData API**
- [x] Implement `setUserData(key, value)` in C++
- [x] Implement `getUserData(key)` in C++
- [x] Implement `hasUserData(key)` in C++
- [x] Implement `clearUserData(key)` in C++
- [x] Expose all methods to Lua bindings
- [x] Test via LuaEngineMockHarness

**Task 1.2: Widget Metadata Storage**
- [x] Add `_storeEditorMeta()` to BaseWidget
- [x] Store type name in `_editorMeta`
- [x] Store config table in `_editorMeta`
- [x] Store callback references in `_editorMeta`
- [x] Add schema metadata for inspector-driven editing

**Task 1.3: Shell Ownership & Mode Routing**
- [x] Shell owns top-level layout and mode switching
- [x] C++ defers `scriptContentRoot` positioning when shared Shell is active
- [x] Settings overlay remains usable in both modes and forced top-most

---

### Phase 2: Visual Editing Core ✅ COMPLETE (v1)

**Task 2.1: Hierarchy Tree**
- [x] Build hierarchy walker (`walkHierarchy`)
- [x] Render tree rows with depth indentation
- [x] Highlight selected rows and keep tree in sync
- [x] Debounce refresh during rapid edits

**Task 2.2: Preview Selection**
- [x] Click-to-select in preview with design-space hit test
- [x] Selection outlines rendered in overlay
- [x] Multi-select model (`selectedWidgets` + active selection)
- [x] Ctrl-drag marquee selection
- [x] Ctrl-click toggle add/remove
- [x] Marquee requires full containment (prevents accidental background grabs)

**Task 2.3: Transform Interactions**
- [x] Shift-drag move for selected widget/group
- [x] Resize handles in preview
- [x] Group bounding box + per-widget preview outlines
- [x] Inspector X/Y/W/H edits apply live

**Task 2.4: Inspector Editing**
- [x] Schema-driven property rows (fallback to inferred rows)
- [x] Typed editors: number/color/bool/enum/text
- [x] Live apply to widget config and runtime setters
- [x] Multi-select shared/mixed row semantics (`<mixed>`)

---

### Phase 3: Navigation & Workspace 🔄 IN PROGRESS

**Task 3.1: Zoom/Pan Controls**
- [x] Header zoom controls and Fit action
- [x] Alt+wheel zoom, +/-/0 keyboard zoom
- [x] Pan mode drag
- [x] Preview grid overlay (dot grid)

**Task 3.2: Workspace/Viewport Separation**
- [x] Initial workspace extension + runtime viewport frame rendering
- [x] Pan clamping scaffold
- [ ] Final symmetric workspace model (clean coordinate origin)
- [ ] Frame Viewport / Frame Selection commands
- [ ] Stabilize placement semantics to avoid layout regressions

---

### Phase 4: Editing Safety ✅ PARTIAL

**Task 4.1: Undo/Redo Core**
- [x] Add undo/redo stacks in Shell
- [x] Snapshot scene/selection history capture
- [x] Record history for move/resize/bounds/config/selection edits
- [x] Bind Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z
- [ ] Add visible history feedback in UI
- [ ] Add coalescing/merge policy for rapid numeric edits

---

### Phase 5: Dev Console + Exposure Foundation (Current Priority)

**Task 5.0: Shell Tab Host + Scripts Surface (carried forward)**
- [x] Add first-class UI-script tab model in `ui_shell.lua`
- [x] In Performance mode: tabs consume full content area
- [x] In Edit mode: tabs are visible in preview workflow, but hidden while script editor surface is open
- [x] Script/DSP entries open dedicated edit surfaces on double-click
- [ ] Introduce a first-class reusable **Tab widget / Tab host** instead of keeping shell tabs as a special-case implementation forever
- [ ] Support user-authored Tab widgets inside structured projects, with tab pages backed by normal child nodes/components/docs in the directory model
- [ ] Decide how shell tabs and project/view tabs relate so both can align on the same underlying widget model
- [ ] Support project-native view tabs over shared foundations (e.g. Looper view / Donut view over one looper family runtime)

**Task 5.1: Left Panel Expansion (keep current widget tree intact)**
- [x] Widget hierarchy tree remains the primary edit tree
- [x] Left area streamlined to `Hierarchy` | `Scripts`
- [x] Single-click selects and populates inspector; double-click opens editor surface
- [x] Script list filtering to loaded/current/global scope (settings excluded)

**Task 5.2: Inline Dev Console (`~`) — moved earlier**
- [x] `~` toggles inline console overlay in dev-enabled shell
- [x] Console command MVP: `help`, `clear`, `get/set/trigger`, `undo/redo`, `sel`, `copyid`, `ui`, `lua`
- [x] Dev copy/paste shortcuts: Ctrl+Shift+C copies active identifier; Ctrl+Shift+V pastes clipboard into console input
- [ ] Add command palette aliases + richer diagnostics panes

**Task 5.3: Parameter Exposure Framework (new)**
- [x] Define unified exposure API for non-standard UI style/behavior params
- [x] `BaseWidget:exposeParams(specs)` - Declare custom editable params
- [x] `BaseWidget:getExposedParams()` - Retrieve declared params
- [x] `BaseWidget:_getExposed(path)` / `_setExposed(path, value)` - Getter/setter contract
- [x] `BaseWidget:_mergeExposedIntoSchema()` - Merge into editor metadata
- [x] `isPathExposed()` / `getInspectorValue()` helpers in ui_shell.lua
- [x] Inspector reads exposed params via `_getExposed` when available
- [x] Inspector writes exposed params via `_setExposed` when available
- [x] Added `DonutWidget` with exposed ringColour, playheadColour, bgColour, thickness
- [x] Added `XYPadWidget` with exposed handleColour, trailColour, bgColour, gridColour, showTrails
- [x] Added `MatrixRainWidget` (experimental) with exposed cols, charSize, speed, spawnRate, color
- [x] Added `GLSLWidget` base class for OpenGL shader rendering
- [x] Added `PostFXWidget` (extends GLSLWidget) with exposed intensity, aberration, scanlines, waveSpeed, ringSpeed
- [x] `exposeParams` now appends to existing params instead of replacing
- [x] Fixed GL constant naming (GL.COLOR_BUFFER_BIT vs gl.COLOR_BUFFER_BIT)
- [x] Fixed shader compile status checks (getShaderCompileStatus vs getShaderiv)

**Task 5.4: Project-backed structured UI runtime (first-pass)**
- [x] Discover project manifests under `UserScripts/projects/`
- [x] Surface project-backed UI entries alongside legacy scripts
- [x] Load `manifold.project.json5` via runtime bootstrap path
- [x] Instantiate structured `.ui.lua` scenes and component refs
- [x] Attach structured behavior modules with `init/resized/update/cleanup`
- [x] Pass local-root bounds into component `resized(ctx, w, h)`
- [x] Resolve project/user/system UI and DSP refs
- [x] Load project-backed DSP from the manifest-resolved entry
- [x] Keep legacy monolithic UI loading working for A/B switching

**Task 5.5: Shell/layout infrastructure for hosted structured UIs**
- [x] Shell performance-view registration now supports top-level layout metadata
- [x] Shell hosting contract distinguishes fill/dynamic vs fixed/design-space views
- [x] Project loader exposes shell layout info upward (`getLayoutInfo`)
- [x] Declarative node layout support added to structured loader:
  - [x] absolute
  - [x] relative
  - [x] hybrid
- [x] Declarative node layout resolves before behavior `resized()`
- [x] Behavior layout remains the escape hatch for complex/custom cases

---

### Phase 6: Mapping + Behavior Authoring (Design-heavy)

**Task 6.1: Widget ↔ DSP Mapping UI**
- [ ] Visual mapping workflow from selected widget property to DSP endpoint
- [ ] Mapping inspector/editor (min/max, curve, mode)
- [ ] Live mapping preview and conflict handling

**Task 6.2: Lua Behavior Authoring Integration**
- [x] Script editing surface (double-click Scripts row → center editor surface)
- [x] Syntax highlighting style derived from `dsp_live_scripting.lua`
- [x] Basic file workflow: load, edit, save, reload, close (Esc/Ctrl+W)
- [ ] Link selected widget to script snippets
- [ ] Safe apply/reload workflow with runtime error reporting

---

### Phase 7: Persistence & Round-Trip (Deep model)

**Task 7.1: Save/Load Project State**
- [ ] Serialize editable UI scene (hierarchy, bounds, config, metadata)
- [ ] Persist mappings + editor camera/workspace state
- [ ] Load and reconstruct reliably

**Task 7.2: Code Generation / Round Trip**
- [ ] Generate Lua from visual edits
- [ ] Import existing Lua back into editable representation
- [ ] Round-trip validation tests

---

### Phase 8: Runtime Tiering (Normal / Dev / Super Dev)

**Task 8.1: Runtime Modes**
- [ ] Define `Normal`, `Dev`, `Super Dev` shell modes
- [ ] Gate editor chrome/advanced controls by mode
- [ ] Move advanced/settings surfaces into tabs in Dev modes

**Task 8.2: Editable Scope by Mode**
- [ ] Normal: only user-facing edit surfaces
- [ ] Dev: editable active UI + loaded DSP + runtime diagnostics
- [ ] Super Dev: editable system Lua (`ui_shell.lua`, core UI modules, infra scripts)

---

## Summary Checklist

| Phase | Status | Key Deliverable |
|-------|--------|-----------------|
| 1. Shell Foundation | ✅ Complete | Persistent shell + mode routing |
| 2. Visual Editing Core | ✅ Complete (v1) | Tree, selection, inspector, multi-select editing |
| 3. Navigation & Workspace | 🔄 In Progress | Zoom/pan working; workspace model needs final pass |
| 4. Editing Safety | ✅ Partial | Undo/redo core implemented |
| 5. Dev Console + Exposure Foundation | ✅ Complete + Expanded | `~` console + parameter exposure + project-backed runtime/layout infrastructure |
| 6. Mapping + Behavior Authoring | ⏳ Next (general editor track) | Widget↔DSP mapping + behavior-linked authoring |
| 7. Persistence & Round-Trip | ⏳ Later | Save/load + codegen/round-trip |
| 8. Runtime Tiering | ⏳ Later | Normal/Dev/Super-Dev gating |

---

## Technical Notes

### Transform Math

Content uses bounds at origin with transform for positioning:
```lua
self.content:setBounds(0, 0, designW, designH)
self.content:setTransform(scale, scale, previewX, contentY)
```

The transform is `scale(sx, sy).translated(tx, ty)`:
- Point (0,0) → (0*sx + tx, 0*sy + ty) = (tx, ty)
- So content top-left appears at (previewX, contentY)
- Content is scaled by `scale` factor

### C++ Deference to Shell

In `LuaEngine.cpp`, when Shell is active:
```cpp
// Only position scriptContentRoot if Shell is NOT managing it
if (pImpl->scriptContentRoot != nullptr && !pImpl->hasSharedShell) {
    pImpl->scriptContentRoot->setBounds(...);
}
```

This ensures Shell has full control over content positioning in both modes.

---

## References

- Chataigne: https://benjamin.kuperberg.fr/chataigne/
- TouchOSC: https://hexler.net/touchosc
- Open Stage Control: https://openstagecontrol.ammd.net/
