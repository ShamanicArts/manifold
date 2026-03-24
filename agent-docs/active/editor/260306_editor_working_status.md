# Editor Working Status

**Last updated:** 2026-03-06  
**Purpose:** Ground-truth snapshot of what's implemented, what's working, what's broken, and what's next. Read this before the spec.

---

## Current State Summary

The structured project system is **substantially implemented and shipping in 4 real projects.** The gap between the spec and reality is smaller than the spec implies — most of Phase 1 (foundation) and Phase 3 (structured assets) are done.

The biggest immediate problem is a **visual editing bug** that blocks move/resize in structured projects.

---

## What's Built and Working

### Structured Project Runtime (`manifold/ui/project_loader.lua` — ~1520 lines)

A full `Runtime` class that handles the entire structured project lifecycle:

| Feature | Status | Key Functions |
|---|---|---|
| Manifest discovery + parsing | ✅ | `Runtime.new()`, JSON5 manifest → `projectRoot`, `uiRoot` |
| Sandboxed `.ui.lua` loading | ✅ | `loadStructuredTable()` — `load()` with empty env, table validation |
| Scene instantiation | ✅ | `instantiateSpec()` — recursive tree from pure-data tables |
| Component composition | ✅ | `instantiateComponent()` — `ref` resolution, prop merge, ID prefix scoping |
| Behavior module lifecycle | ✅ | `init(ctx)`, `update(ctx, state)`, `resized(ctx, w, h)`, `cleanup(ctx)` |
| Declarative layout | ✅ | `resolveLayoutBounds()`, `applyLayoutSubtree()` — percentage/fill/fixed |
| TabHost/TabPage support | ✅ | Active page tracking, visibility toggling, content rect delegation |
| Document management | ✅ | `loadDocument()`, `getDocument()`, `listDocuments()` — tracks loaded files with dirty state |
| Data round-trip | ✅ | `getNodeValue()`, `setNodeValue()`, `removeNodeValue()` — path-based model access |
| Save to disk | ✅ | `saveDocument()`, `saveAllDocuments()` — serialize model → write `.ui.lua` file |
| Project file browser | ✅ | `listProjectFiles()` — recursive enumeration with kind/group classification |
| Global introspection API | ✅ | `getStructuredUiDocuments`, `getStructuredUiProjectStatus`, `setStructuredUiNodeValue`, `saveStructuredUiDocument`, `reloadStructuredUiProject` etc. exposed as globals |
| Shell integration | ✅ | `registerPerformanceView()` — structured projects plug into shell's performance mode |
| Record/source tracking | ✅ | `_structuredSource` / `_structuredInstanceSource` userData on Canvas nodes, `recordsBySourceKey` |
| Reload | ✅ | `reloadStructuredUiProject()` — full teardown + re-init |

### Widget Support

All standard widgets are supported in structured mode:

Panel, Button, Label, Slider, VSlider, Dropdown, Toggle, NumberBox, Knob, WaveformView, Meter, SegmentedControl, DonutWidget, XYPadWidget, TabHost, TabPage

### Editor Core (`manifold/ui/editor_core.lua` — ~150 lines)

Basic editor mode layout:
- Tree panel (left) — hierarchy placeholder
- Preview panel (center) — canvas for live UI preview
- Inspector panel (right) — property editor placeholder
- Layout logic for three-pane split
- Wired into shell edit mode

### Shipping Structured Projects (4)

| Project | Components | Behaviors | DSP Scripts | Complexity |
|---|---|---|---|---|
| **Looper_uiproject** | transport, capture_plane, layer_strip (×4) | transport, capture_plane, layer_strip, shared_state, main | 1 | Medium — parameterized layer strips |
| **SuperDonut** | transport, capture_plane, layer_card, vocal_fx | transport, capture_plane, layer_card, super_shared_state, main | 3 (baseline + extension) | Medium-high — extended DSP |
| **LooperTabs** | 12 components, 2 views, shared components | 15 behavior modules | 4 DSP scripts | High — tabbed multi-view, shared transport/capture |
| **MidiSynth_uiproject** | header, oscillator, filter, envelope, effects, keyboard, midi_monitor, presets, spectrum | oscillator, envelope, keyboard, midi_monitor, main | 1 | High — full synth UI |

These are not toy demos. They're real, functional, multi-component structured projects with behavior modules, shared state, and DSP integration.

### Behavior Module API (as implemented)

The actual behavior API that's shipping:

```lua
local M = {}

function M.init(ctx)
  local widgets = ctx.widgets  -- flat table keyed by local widget ID
  local root = ctx.root        -- root widget of this component
  local props = ctx.props      -- instance props from parent
  -- Wire callbacks, initialize state
end

function M.update(ctx, state)
  -- Frame-by-frame state-driven updates
end

function M.resized(ctx, w, h)
  -- Custom layout logic (supplements declarative layout)
end

function M.cleanup(ctx)
  -- Teardown
end

return M
```

`ctx` contains: `widgets`, `root`, `props`, `spec`, `runtime`, `command()`, and other services.

---

## What's Broken

### 🐛 BUG: Visual move/resize not working for structured projects

**Severity:** Blocking for visual editing promise  
**Symptom:** In edit mode, elements from structured project UIs cannot be dragged to move or resize. Selection may work but the drag interaction does not apply position/size changes.  
**Likely cause:** The shell's edit-mode drag/resize handlers were built for old-style code-first scripts where widgets have `_editorMeta` directly. Structured project widgets have `_structuredSource` and `_structuredInstanceSource` userData instead, and the editor's move/resize code may not be reading/writing through the structured runtime's model.  

**What needs to happen:** The editor's drag/resize logic needs to:
1. Detect that the widget belongs to a structured project (check `_structuredSource` userData)
2. Resolve the document path + node ID from the source metadata
3. Write the new position/size back through `setNodeValue(documentPath, nodeId, "x", newX)` etc.
4. Optionally trigger `saveDocument()` or mark dirty

**Key files to investigate:**
- `manifold/ui/shell/methods_core.lua` — likely contains the drag/resize handlers
- `manifold/ui/shell/inspector_utils.lua` — may contain property-write logic
- `manifold/ui/project_loader.lua` — `setNodeValue()` is the write path
- Check how the shell currently reads `_editorMeta` during edit interactions and compare with `_structuredSource`

---

## What's Not Built Yet

### High Priority (blocks editor usefulness)

| Feature | Spec Section | Notes |
|---|---|---|
| **Fix visual move/resize bug** | Phase 3.4b | Blocking. Must bridge shell edit affordances → structured runtime model. |
| **Inspector for structured projects** | Phase 3 | `editor_core.lua` has placeholder. Needs to read spec/props from structured records and write via `setNodeValue`. |
| **Hierarchy tree for structured projects** | Phase 3 | Placeholder exists. Needs to walk `Runtime.layoutTree` and display the record tree. |

### Medium Priority (extends capability)

| Feature | Spec Section | Notes |
|---|---|---|
| DSP param introspection | Phase 4.2-4.3 | Params are registered but no editor panel to browse them |
| Binding validation | Phase 4.5 | UI binds reference paths; no check that DSP actually registered them |
| New Component from editor | Phase 3.5 | Save works, but no "create new" UX flow |
| FX slot management | Phase 4.6 | Manifest supports it structurally but no editor UI |

### Lower Priority (future capability)

| Feature | Spec Section | Notes |
|---|---|---|
| Override system for code-first scripts | Phase 2 | Entire phase not started. Less urgent now. |
| Code-first script contract (`Script.define`) | Phase 1.6-1.8 | Not started. Needed for split export. |
| Split export (code-first → structured) | Phase 6 | Not started. Depends on script contract. |
| Asset system (images, fonts) | Phase 5 | Not started. |
| First-party script refactoring | Phase 7 | `looper_ui.lua` etc still in old monolith form. |

---

## Architecture Notes for Workers

### How structured projects load

```
1. Shell or script switch targets a manifold.project.json5 path
   (or a .ui.lua file — project_loader discovers the manifest)
2. project_loader.lua M.install(opts) is called
3. Runtime.new(opts) creates runtime with projectRoot, uiRoot, etc.
4. ui_init(root) → runtime:init(rootNode)
5. Runtime loads scene document (main.ui.lua)
6. instantiateSpec() recursively creates widgets from the scene tree
7. For each component ref, instantiateComponent() loads the .ui.lua,
   merges props, instantiates subtree, loads behavior module
8. All behavior init() functions run (depth-first, children before parents)
9. ui_resized(w,h) → runtime:resized(w,h) → declarative layout + behavior resized()
10. ui_update(state) → runtime:update(state) → all behavior update() calls
```

### How the data round-trip works

```
Read:  getStructuredUiNodeValue(documentPath, nodeId, "x")
       → Runtime:getNodeValue() → findNodeById() → getValueByPath()

Write: setStructuredUiNodeValue(documentPath, nodeId, "x", 100)
       → Runtime:setNodeValue() → findNodeById() → setValueByPath()
       → doc.dirty = true

Save:  saveStructuredUiDocument(documentPath)
       → Runtime:saveDocument() → serializeStructuredDocument() → writeTextFile()
```

### How structured widgets identify themselves

Each instantiated widget gets userData on its Canvas node:

```lua
-- On the widget's Canvas node:
node:setUserData("_structuredSource", {
  documentPath = "/path/to/component.ui.lua",
  nodeId = "tempo_knob",          -- local ID in the document
  globalId = "transport.tempo_knob",  -- prefixed global ID
  kind = "node" | "component_node" | "scene_node",
})

-- For component root widgets, also:
node:setUserData("_structuredInstanceSource", {
  documentPath = "/path/to/main.ui.lua",  -- the PARENT document
  nodeId = "transport",                    -- instance ID in parent
  globalId = "transport",
  kind = "component_instance",
})
```

This is the key metadata the editor needs to bridge visual interactions → model writes.

### Relationship to old _editorMeta system

Old code-first scripts store `_editorMeta` on Canvas nodes (type, config, schema, callbacks).

Structured project widgets also store `_editorMeta` (because they go through the same widget constructors), PLUS the `_structuredSource` metadata.

The editor needs to handle both: `_editorMeta` for widget type/schema info, `_structuredSource` for document identity and write-back path.

---

## File Reference

| File | Lines | Role |
|---|---|---|
| `manifold/ui/project_loader.lua` | ~1520 | Structured project Runtime — the core engine |
| `manifold/ui/editor_core.lua` | ~150 | Editor mode three-pane layout (placeholder content) |
| `manifold/ui/ui_shell.lua` | ~800+ | Persistent shell — performance/edit mode, chrome |
| `manifold/ui/shell/methods_core.lua` | large | Shell methods — drag/resize/selection/inspector logic |
| `manifold/ui/shell/inspector_utils.lua` | | Inspector property rows |
| `manifold/ui/shell/bindings.lua` | | Shell keyboard/command bindings |
| `manifold/ui/ui_widgets.lua` | | Widget re-export module |
| `manifold/ui/widgets/*.lua` | | Individual widget implementations |
| `manifold/ui/looper_ui.lua` | ~700 | Code-first monolith UI (old style) |

---

## Recommended Next Steps (priority order)

1. **Fix the visual move/resize bug** — this is the #1 blocker. Without it, structured projects can't be visually edited, which defeats the purpose.

2. **Wire inspector panel for structured projects** — read props/style from `_structuredSource` records, display in inspector, write back via `setNodeValue`.

3. **Wire hierarchy tree for structured projects** — walk `Runtime.layoutTree`, display component/widget tree with selection.

4. **DSP param introspection panel** — surface registered params so the editor can show what's available for binding.

5. **Then** consider override system, script contracts, split export, assets — all of which are lower urgency now that structured projects are the primary authoring path.
