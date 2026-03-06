# Editor Project Format & Authoring System — Implementation Spec

**Status:** Approved strategic direction, ready for implementation planning  
**Revision:** v2 — incorporates external review feedback (robustness tiers, loading safety, behavior API, component merge semantics, override risk classification, philosophical stance on monolith permanence)  
**Audience:** Worker agent implementing the system  
**Prerequisites:** Read `EDITOR_SYSTEM_OVERVIEW.md` and `EDITOR_AUTHORING_AND_SOURCE_OF_TRUTH_DISCUSSION.md` first  

---

## 1. Goal

Build a project format and authoring system that:

1. Gives the editor structured, saveable, round-trippable authority over UI layout, composition, bindings, and assets.
2. Keeps handwritten monolithic Lua scripts as first-class editable citizens — never rewritten by the editor.
3. Provides a clear migration path from monolith → structured composable project, without forcing it.
4. Supports user assets (images, fonts, HTML, samples) as part of the project.
5. Uses a directory-based project format — the project IS a directory with files in known locations.

---

## 2. Architecture Overview

The system has five layers under a shared project spine:

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1: Project Directory & Manifest                       │
│    manifold.project.json5 — the index                        │
│    Conventional directory structure — the format              │
└──────────────────────────┬───────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │  UI Layer   │  │  DSP Layer  │  │   Assets    │
  │             │  │             │  │             │
  │ L2: .ui.lua │  │ L5: DSP     │  │ L4: images  │
  │ (structured)│  │  scripts    │  │  fonts, html│
  │             │  │ (behavior + │  │  samples    │
  │ L3: monolith│  │  FX chains) │  │             │
  │ + overrides │  │             │  │             │
  └─────────────┘  └─────────────┘  └─────────────┘
```

UI and DSP layers can both reference assets. The manifest ties everything together.

### Key Principle

**The editor never rewrites monolithic Lua source files.** Instead, it composes structured overrides on top. Users who want full round-trip start with (or migrate to) editor-owned structured assets.

### Philosophical Stance: Monolith + Override Is a Permanent Mode, Not Just a Bridge

This needs to be stated explicitly because the answer shapes implementation decisions.

**Monolith + override is a permanent, first-class authoring mode.** It is not a temporary shim that gets deprecated once structured assets exist.

This means:
- The override system must be robust enough for long-term production use, not just "good enough to get by until they export"
- Orphan detection, override review, and conflict resolution are **permanent product concerns**, not migration annoyances
- UX around override management (review panel, revert individual overrides, clean orphans) is not optional polish — it's core functionality
- The editor should encourage structured assets for new work and provide clear migration paths, but it must never treat monolith users as second-class or broken

**Why permanent?** Because the moment you tell power users "your way of working is a legacy mode we tolerate," you've lost them. Some users will always prefer writing code-first and using the editor as a visual manipulation layer on top. That workflow needs to be genuinely good, not grudgingly supported.

**The practical implication:** Override-related code, UX, and testing get the same quality bar as structured asset code. Not "we'll improve it later."

### Code-First Remains Valid At Every Stage

A critical clarification: **exporting to structured assets does not lock users into an editor-only workflow.**

Structured `.ui.lua` files are Lua files on disk. Users can edit them in their terminal, IDE, or any text editor. The editor writes them; the user can also write them. Same goes for behavior modules, bindings, themes, DSP scripts — they're all files.

The authoring spectrum is:
- **Pure code-first:** Write everything in a text editor. Load in Manifold. Use the visual editor for inspection only.
- **Code-first + visual tweaks:** Write structure in a text editor, use the visual editor for layout fine-tuning (overrides or direct `.ui.lua` edits).
- **Visual-first + code behaviors:** Use the visual editor for layout, write behavior modules and DSP scripts in a text editor.
- **Full visual:** Everything through the editor UI.

All of these are valid. Exporting a monolith to structured assets just gives the files a cleaner shape — the user never loses the ability to edit those files however they want. The structured format is designed to be human-readable and human-writable precisely so that code-first users aren't punished for using the export.

### Supported Code-First Script Contract

A major correction to the earlier framing:

**We are defining the user script model at the same time as the app.** That means we should NOT treat today's giant freeform monoliths as sacred canonical blobs the system must passively tolerate forever.

Instead, Manifold should define a **supported code-first script contract** for both UI and DSP scripts. In this document, when we say "monolith," we mean **a single-file code-first script that follows Manifold's supported conventions**, not arbitrary ad hoc Lua.

That distinction matters because it changes what export can do:
- For **supported code-first scripts**, export can preserve and relocate user-written code mechanically with high confidence.
- For **legacy/off-convention scripts**, export falls back to best-effort structure extraction plus override mode.

### Script phases: UI

Supported code-first UI scripts should be shaped into explicit phases:

```lua
local Script = require("editor_script")

local ui = {}
local state = {}

local function build(ui, root, ctx)
  -- Create widgets only. No inline callbacks.
end

local function wire(ui, ctx)
  -- Attach callbacks and event handlers.
end

local function layout(ui, w, h, ctx)
  -- Layout math. Equivalent of ui_resized.
end

local function update(ui, state, ctx)
  -- State-driven visual updates. Equivalent of ui_update.
end

local function cleanup(ui, ctx)
end

return Script.define {
  build = build,
  wire = wire,
  layout = layout,
  update = update,
  cleanup = cleanup,
}
```

### Script phases: DSP

Supported code-first DSP scripts should also be phased:

```lua
local DspScript = require("editor_dsp_script")

local function build_graph(ctx, dsp)
  -- Create nodes / layers / graph topology
end

local function register_params(ctx, dsp)
  -- Register params and simple binds
end

local function wire_handlers(ctx, dsp)
  -- Complex param routing / handlers
end

local function cleanup(ctx, dsp)
end

return DspScript.define {
  build_graph = build_graph,
  register_params = register_params,
  wire_handlers = wire_handlers,
  cleanup = cleanup,
}
```

### Why the contract matters

If scripts follow these conventions:
- structure can be extracted mechanically from runtime data,
- behavior can be **relocated**, not regenerated,
- layout code can be preserved,
- update logic can be preserved,
- helpers and local state can remain intact,
- and export becomes a high-confidence split/refactor, not a lossy scaffold generator.

### Robustness Tiers

The system has explicitly different reliability guarantees depending on asset type. This is honesty, not a limitation:

| Asset Type | Identity Guarantee | Export / Split Guarantee | Save Reliability |
|---|---|---|---|
| **Structured `.ui.lua` / future `.dsp.lua`** | Strong (IDs in file, editor-enforced uniqueness) | Full (editor reads/writes canonical files directly) | Strong |
| **Supported code-first scripts + overrides** | Strong if naming conventions are followed | Strong split/export via code relocation and runtime extraction | Strong, with manageable orphan risk if script intentionally changes IDs |
| **Legacy/off-convention scripts + overrides** | Best-effort | Best-effort extraction only | Good, with higher orphan/drift risk |
| **Behavior modules** | N/A (not visually edited structurally) | N/A (text editing only) | N/A |

This table should be internalized by the worker. Do not treat all handwritten scripts as equally unknowable. Supported code-first scripts are part of the product contract and should be designed to split cleanly.

---

## 3. Layer 1: Project Directory Convention

### 3.1 Directory Structure

The project format is a directory. The directory layout IS the format.

```
my-instrument/
  manifold.project.json5          ← project index (required)
  ui/
    main.ui.lua                   ← root UI scene (structured, editor-owned)
    components/                   ← reusable UI components
      transport.ui.lua
      layer_strip.ui.lua
    behaviors/                    ← Lua behavior modules (hand-authored logic)
      transport.lua
      layer_controls.lua
    monoliths/                    ← code-first single-file scripts / archived originals
      looper_ui.lua               ← original code-first script (never editor-modified)
      looper_ui.overrides.lua     ← editor override layer
  dsp/
    main.lua
    fx/
      shimmer.lua
      crusher.lua
  bindings/
    controls.lua                  ← UI→parameter bindings
    midi.lua                      ← MIDI mappings
  themes/
    dark.lua
  assets/
    images/
      logo.png
      knob_skin.png
    html/
      help.html
    fonts/
      custom_mono.ttf
    samples/
      click.wav
  editor/
    workspace.json5               ← editor-internal state (not user-facing)
```

### 3.2 Conventions

- Files in `ui/components/` are structured UI components (`.ui.lua` extension)
- Files in `ui/behaviors/` are hand-authored Lua behavior modules
- Files in `ui/monoliths/` are code-first single-file UI scripts or archived originals
- Files in `assets/` are user-importable resources, enumerable by the editor
- The `editor/` directory is editor-internal state, not intended for manual editing
- Monolithic scripts that live outside of `ui/monoliths/` (e.g. at `manifold/ui/looper_ui.lua` in the current codebase) are also valid — the manifest declares what they are

### 3.3 Manifest: `manifold.project.json5`

The manifest is the project index. It is JSON5 (non-executable) for external tool interop.

It is deliberately **thin** — it declares entry points, asset types, and ownership. It does not duplicate information that the directory structure already conveys.

```json5
{
  // Project metadata
  name: "My Looper Instrument",
  version: 1,
  
  // UI entry point — what loads when the project opens
  // Can point to a structured scene OR a monolith
  ui: {
    root: "ui/main.ui.lua",
    // OR for monolith-based projects:
    // root: "ui/monoliths/looper_ui.lua",
  },
  
  // DSP entry — primary script + named FX slots
  dsp: {
    default: "dsp/main.lua",
    slots: {
      fx1: { path: "dsp/fx/shimmer.lua" },
      fx2: { path: "dsp/fx/crusher.lua" },
    },
  },
  
  // Explicit asset declarations (only needed for non-obvious cases)
  // Assets in assets/ are auto-discovered by convention
  // This section is for overrides, ordering, or assets outside convention
  assets: {
    // optional
  },
  
  // Theme
  theme: "themes/dark.lua",
}
```

**Why JSON5 for the manifest:**
- External tools (git diff, CI, linters, package managers) can read it without a Lua runtime
- Clear separation: the manifest is metadata ABOUT the project, not part of the runtime
- JSON5 supports comments and trailing commas, so it's not painful to hand-edit

**Why NOT Lua for the manifest:**
- The manifest should never be executable — it's pure data
- External tooling shouldn't need a Lua parser

### 3.4 Manifest Discovery

The runtime looks for `manifold.project.json5` in:
1. The script directory itself
2. Parent directories up to a reasonable limit (3 levels)
3. If not found, the system operates in "legacy mode" — no project, just bare scripts (backward compatible)

### 3.5 First-Pass DSP Entry Rule

For the project-backed path, the manifest should normally point to a **project-local DSP entry**:

```json5
{
  dsp: {
    default: "dsp/main.lua",
  },
}
```

That file may absolutely:
- wrap system-global built-ins,
- import user-global DSP helpers,
- compose reusable project/user/system modules,
- and extend or override behavior for the specific project.

What should be avoided is a fake project DSP story where:
- the manifest points straight at a hidden system script,
- `dsp/main.lua` is only a placeholder,
- and the real dependency chain is not visible from the project itself.

**Rule of thumb:** the project should always have a real DSP file a user can open and understand as the project's authoritative entry, even if that file is thin.

---

## 4. Layer 2: Structured UI Assets (Editor-Owned)

### 4.1 Format: Pure-Data Lua Tables

Structured UI assets use `.ui.lua` extension and contain **pure-data Lua tables only**.

Rules:
- The file MUST be a single `return { ... }` statement
- No `require()`, no computation, no side effects, no function definitions
- The editor reads and writes these mechanically
- Users CAN hand-edit them (they're readable Lua), but the editor may overwrite on save

```lua
-- ui/components/transport.ui.lua
-- Editor-managed component. Manual edits may be overwritten.
return {
  id = "transport_panel",
  type = "Panel",
  x = 0, y = 0, w = 400, h = 48,
  style = {
    bg = {0.08, 0.10, 0.14, 1},
    radius = 8,
  },
  children = {
    {
      id = "rec_btn",
      type = "Button",
      x = 6, y = 6, w = 80, h = 36,
      props = {
        label = "● REC",
        fontSize = 13,
      },
      style = {
        bg = {0.50, 0.11, 0.11, 1},
      },
      bind = {
        action = "trigger",
        target = "/core/behavior/rec",
      },
    },
    {
      id = "play_btn",
      type = "Button",
      x = 92, y = 6, w = 80, h = 36,
      props = {
        label = "▶ PLAY",
        fontSize = 13,
      },
      style = {
        bg = {0.12, 0.48, 0.23, 1},
      },
      bind = {
        action = "trigger",
        target = "/core/behavior/play",
      },
    },
    {
      id = "tempo_knob",
      type = "Knob",
      x = 300, y = 2, w = 44, h = 44,
      props = {
        min = 40, max = 240, step = 1, value = 120,
        label = "BPM",
        suffix = "",
      },
      style = {
        colour = {0.22, 0.74, 0.96, 1},
      },
      bind = {
        action = "set",
        target = "/core/behavior/tempo",
      },
    },
  },
  -- Optional: attach a behavior module for complex logic
  behavior = "behaviors/transport.lua",
}
```

### 4.2 Root Scene File

The root UI scene (`main.ui.lua`) can compose components:

```lua
-- ui/main.ui.lua
return {
  id = "root",
  type = "Panel",
  x = 0, y = 0, w = 800, h = 600,
  style = {
    bg = {0.04, 0.06, 0.10, 1},
  },
  children = {
    -- Inline children
    {
      id = "title",
      type = "Label",
      x = 10, y = 580, w = 200, h = 20,
      props = { text = "My Instrument v1", fontSize = 10 },
      style = { colour = {0.58, 0.64, 0.72, 1} },
    },
  },
  -- Component references — loaded from separate files
  components = {
    { ref = "components/transport.ui.lua", x = 0, y = 0 },
    { ref = "components/layer_strip.ui.lua", x = 0, y = 54, props = { layerIndex = 0 } },
    { ref = "components/layer_strip.ui.lua", x = 0, y = 124, props = { layerIndex = 1 } },
    { ref = "components/layer_strip.ui.lua", x = 0, y = 194, props = { layerIndex = 2 } },
    { ref = "components/layer_strip.ui.lua", x = 0, y = 264, props = { layerIndex = 3 } },
  },
}
```

### 4.3 Behavior Modules

Structured UI assets can reference behavior modules for logic that can't be expressed as pure data:

```lua
-- ui/behaviors/transport.lua
-- Hand-authored behavior. Editor does not modify this file.

local M = {}

function M.init(ctx)
  local widgets = ctx.widgets

  widgets.play_btn.onPress = function()
    local anyPlaying = false
    -- ... check layer state or plugin state ...
    if anyPlaying then
      command("TRIGGER", "/core/behavior/pause")
    else
      command("TRIGGER", "/core/behavior/play")
    end
  end
end

function M.resized(ctx, w, h)
  local widgets = ctx.widgets
  widgets.play_btn:setBounds(92, 6, 80, math.max(24, h - 12))
end

function M.update(ctx, state)
  local widgets = ctx.widgets
  if state.isRecording then
    widgets.rec_btn:setBg(0xffdc2626)
    widgets.rec_btn:setLabel("● REC*")
  else
    widgets.rec_btn:setBg(0xff7f1d1d)
    widgets.rec_btn:setLabel("● REC")
  end
end

function M.cleanup(ctx)
end

return M
```

### 4.4 Behavior Module API Contract (v1 Runtime)

Behavior modules need a constrained, well-defined API. Without this, they'll devolve into callback soup.

#### Module shape

Every behavior module returns a table with optional well-known lifecycle functions:

```lua
local M = {}

-- Called once after the structured scene tree is instantiated.
function M.init(ctx)
end

-- Called whenever the behavior root's local bounds change.
-- `w` and `h` are LOCAL to `ctx.root`, not global window size.
function M.resized(ctx, w, h)
end

-- Called every UI update with normalized plugin state.
function M.update(ctx, state)
end

-- Called on teardown / script switch.
function M.cleanup(ctx)
end

return M
```

#### The `ctx` table

The runtime passes one context table per behavior instance:

```lua
ctx = {
  root = <root widget for this behavior scope>,
  widgets = {
    root = <same widget as ctx.root>,
    rec_btn = <local widget>,
    play_btn = <local widget>,
    -- flat component-local widget map
  },
  allWidgets = {
    ["root.transport.rec_btn"] = <global widget>,
    ["root.layer0.waveform"] = <global widget>,
    -- global widget map for advanced cases
  },
  instanceId = "transport",
  instanceProps = { layerIndex = 0 },
  spec = <instantiated structured spec table>,
  project = {
    root = "/path/to/project",
    manifest = "/path/to/manifold.project.json5",
    uiRoot = "/path/to/ui/main.ui.lua",
    userScriptsRoot = "/path/to/UserScripts",
    systemUiRoot = "/path/to/system/ui",
    systemDspRoot = "/path/to/system/dsp",
    displayName = "My Instrument",
  },
}
```

#### Scoping rules

| Can a behavior module... | Answer |
|---|---|
| Access its own component's widgets? | **Yes** — via `ctx.widgets` |
| Access its own root widget? | **Yes** — via `ctx.root` |
| Access other components' widgets? | **Yes, but only deliberately** — via `ctx.allWidgets`; this is an escape hatch, not the default pattern |
| Access instance props from the component site? | **Yes** — via `ctx.instanceProps` |
| Depend on top-level plugin window size directly? | **No** — use local `w, h` from `resized()` |
| Register multiple behavior modules on one component? | **No** — one behavior per scene root/component instance |

#### Ordering contract

Current runtime ordering is:

1. Structured scene tree is instantiated
2. Component behaviors are discovered during instantiation
3. Root scene behavior is prepended so it runs first
4. `init()` runs in final behavior order
5. `resized()` runs in final behavior order
6. `update()` runs in final behavior order
7. `cleanup()` runs in reverse order

This is intentional: the root behavior lays out major regions first, then component behaviors lay out within their own local roots.

#### Shell hosting / resize contract

For project-backed views, the shell is part of the runtime contract:
- the shell hosts the loaded project view in design space,
- the shell may scale/align that hosted view for performance and edit modes,
- the structured runtime receives `resized()` for the hosted design viewport, not arbitrary editor chrome dimensions.

A critical practical rule: **editor-only shell churn must not spam project `resized()` calls when the hosted viewport rect has not actually changed.**

That distinction matters because legacy and project-backed paths are not hosted identically. If the shell replays redundant resize events during hierarchy/inspector refreshes, project-backed editor edits can be stomped even though legacy editing appears fine.

#### Layout ownership contract

This is the important part for responsive UIs.

- `x/y/w/h` in `.ui.lua` are **design-time defaults / fallback bounds**
- They are **not** a promise that runtime layout is permanently absolute
- A behavior with `resized(ctx, w, h)` may reposition and resize its descendants however it wants
- For responsive/project-backed UIs, layout should usually be **behavior-owned** at container/component boundaries
- Child behaviors must treat `w, h` as the size of their own local root, not the shell window and not the project root unless they *are* the root

In practice that gives us this layering:
- **Root behavior**: lays out major regions against the live viewport
- **Component behavior**: lays out internal controls relative to its own root bounds
- **Leaf widgets**: can stay on simple fixed bounds if they do not need responsive behavior

#### Future declarative layout modes

The runtime we have now already supports responsive behavior-owned layout. To support editor-authored layout modes cleanly later, structured nodes will reserve an optional `layout` table.

Planned modes:

```lua
layout = { mode = "absolute", x = 12, y = 8, w = 80, h = 24 }
layout = { mode = "relative", x = 0.0, y = 0.0, w = 1.0, h = 0.25 }
layout = { mode = "hybrid", left = 0, right = 0, top = 54, height = 130, minH = 96 }
```

Semantics:
- **absolute** — pixel-local placement
- **relative** — fractional placement/sizing against parent local bounds
- **hybrid** — mix fixed insets/sizes with relative fill, plus optional min/max clamps

Rules:
- All layout values are interpreted in **parent-local space**
- Top-level `x/y/w/h` remain valid fallback/design fields for backward compatibility
- Declarative layout, when present, should run **before** behavior `resized()`
- Behavior `resized()` remains the escape hatch for anything non-trivial or custom

That gives us the long-term model we actually want:
- **absolute** for simple/static widgets
- **relative** for responsive proportional widgets
- **hybrid** for real instrument layouts (fixed bars, fill regions, clamped rows)
- **behavior-owned** layout for complex/custom cases the schema should not try to fake

#### Where declarative bindings end and behavior begins

Simple bindings (one widget → one parameter) should use declarative `bind = { ... }` in the `.ui.lua` file. The instantiation layer wires these automatically — no behavior module needed.

Behavior modules are for logic that can't be expressed declaratively:
- Conditional actions (play vs pause depending on state)
- Latch/toggle patterns (rec button)
- Multi-widget coordination (all layers → play/pause)
- State-derived visual changes (dynamic labels, colors based on state)
- Complex input handling (scrub gestures)
- Responsive/custom layout math in `resized()`

**Rule of thumb:** If you can describe it as "when this widget changes, set this parameter to the widget's value," use a declarative bind. If you need layout math, gesture logic, or an `if` statement, use a behavior module.

### 4.5 Editor Read/Write Mechanics

#### Loading: Sandboxed, Not Raw dofile()

**Do NOT use raw `dofile()` for structured assets.** The contract is "pure-data only" but `dofile()` will happily execute arbitrary code. That's a contract mismatch that will bite someone eventually.

Instead, use a sandboxed loader:

```lua
function loadStructuredAsset(path)
  -- 1. Read file as string
  local source = readFileContents(path)
  if not source then
    return nil, "file not found: " .. path
  end
  
  -- 2. Compile in a sandbox with no globals
  local chunk, err = load(source, "@" .. path, "t", {})
  if not chunk then
    return nil, "parse error in " .. path .. ": " .. err
  end
  
  -- 3. Execute (the empty env table means no require, no io, no os, no globals)
  local ok, result = pcall(chunk)
  if not ok then
    return nil, "runtime error in " .. path .. ": " .. result
  end
  
  -- 4. Validate: must return a table
  if type(result) ~= "table" then
    return nil, path .. " must return a table, got " .. type(result)
  end
  
  -- 5. Validate: no functions, userdata, or threads in the returned tree
  local function validatePureData(t, keyPath)
    for k, v in pairs(t) do
      local vType = type(v)
      if vType == "function" or vType == "userdata" or vType == "thread" then
        return false, keyPath .. "." .. tostring(k) .. " contains " .. vType .. " (not pure data)"
      end
      if vType == "table" then
        local ok, err = validatePureData(v, keyPath .. "." .. tostring(k))
        if not ok then return false, err end
      end
    end
    return true
  end
  
  local valid, validErr = validatePureData(result, "root")
  if not valid then
    return nil, path .. " is not pure data: " .. validErr
  end
  
  return result
end
```

**Why this matters:**
- `load()` with an empty environment table (`{}`) prevents access to ALL globals — no `require`, no `io`, no `os`, no `print`, nothing
- The mode `"t"` restricts to text chunks only (no bytecode)
- Post-load validation catches cases where someone accidentally left a function in the table
- Errors are clear and point to the file and problem

**The editor should surface loader errors clearly**, not silently fail. If a `.ui.lua` file fails validation, show the error in the editor with the file path and the specific violation.

#### Writing: Serializer

The editor writes `.ui.lua` files by serializing the table back to formatted Lua source:
```lua
local source = serializeToLua(scene)
writeFile("ui/components/transport.ui.lua", source)
```

**The serializer must:**
- Produce clean, human-readable, properly indented Lua
- Include the header comment ("Editor-managed component. Manual edits may be overwritten.")
- Use consistent key ordering (id, type, x, y, w, h, props, style, bind, children, components, behavior)
- Handle color values as `{r, g, b, a}` tuples (0-1 range)
- Escape string values properly
- Never emit functions, metatables, or non-data values
- Round-trip cleanly: `loadStructuredAsset(path)` after `serializeToLua()` + `writeFile()` must produce an identical table

### 4.6 Instantiation

A scene loader reads the pure-data table and instantiates real widgets:

```lua
function instantiateScene(parentNode, sceneData, projectRoot)
  -- Create widget from type
  local WidgetClass = widgetRegistry[sceneData.type]
  local widget = WidgetClass.new(parentNode, sceneData.id, {
    -- merge props, style, bind into widget config
  })
  widget:setBounds(sceneData.x, sceneData.y, sceneData.w, sceneData.h)
  
  -- Recurse for children
  for _, child in ipairs(sceneData.children or {}) do
    instantiateScene(widget.node, child, projectRoot)
  end
  
  -- Load component references
  for _, comp in ipairs(sceneData.components or {}) do
    local compData = dofile(projectRoot .. "/" .. comp.ref)
    instantiateScene(widget.node, compData, projectRoot)
  end
  
  -- Attach behavior module if specified
  if sceneData.behavior then
    local behavior = require(sceneData.behavior)
    -- wire up behavior.init, behavior.update
  end
  
  return widget
end
```

### 4.7 Component Instance Merge Semantics

When a root scene references a component:

```lua
components = {
  { ref = "components/layer_strip.ui.lua", x = 0, y = 54, props = { layerIndex = 0 } },
}
```

The instance site can override specific properties of the component. This needs a precise contract, not ad hoc behavior.

#### What the instance site can override:

| Property | Overridable? | Merge behavior |
|---|---|---|
| `x`, `y` | **Yes** | Instance value replaces component default |
| `w`, `h` | **Yes** | Instance value replaces component default. If omitted, use component's value. |
| `props` | **Yes, shallow merge** | Instance props merge into component props. Instance wins on conflict. |
| `style` | **Yes, shallow merge** | Instance style merges into component style. Instance wins on conflict. |
| `bind` | **Yes, full replace** | If instance specifies `bind`, it replaces the component's bind entirely. |
| `behavior` | **Yes, full replace** | Instance can attach a different behavior module. |
| `id` | **Yes** | Instance can override the root widget's ID (required for multiple instances of same component). Auto-prefixed if not specified: `{componentId}_{instanceIndex}`. |
| `children` | **No** | Children come from the component file. Instance sites cannot inject/remove children. |
| `components` | **No** | Nested component refs come from the component file, not the instance site. |
| `visible` | **Yes** | Instance can set `visible = false` to conditionally hide. |

#### Prop template substitution

Components can reference props in their own structure using `$prop` syntax:

```lua
-- components/layer_strip.ui.lua
return {
  id = "layer_strip",
  type = "Panel",
  x = 0, y = 0, w = 300, h = 60,
  children = {
    {
      id = "vol_knob",
      type = "Knob",
      x = 10, y = 10, w = 40, h = 40,
      props = { min = 0, max = 1, label = "Vol" },
      bind = {
        action = "set",
        target = "/layers/$layerIndex/volume",  -- substituted from instance props
      },
    },
  },
}
```

When instantiated with `props = { layerIndex = 2 }`, the bind target becomes `/layers/2/volume`.

**Substitution rules:**
- `$propName` in string values is replaced with the instance prop value
- Only string values are substituted (not table keys, not numeric values)
- If a referenced prop is missing, substitution fails with a clear error (not silent empty string)
- Substitution happens at instantiation time, not at save time — the `.ui.lua` file always contains the template form

#### ID scoping for multiple instances

When the same component is instantiated multiple times, each instance's widget IDs must be unique. The instantiation layer auto-prefixes child IDs:

```
Instance: { ref = "components/layer_strip.ui.lua", props = { layerIndex = 0 } }
  → Widget IDs: layer_strip_0.vol_knob, layer_strip_0.speed_knob, ...

Instance: { ref = "components/layer_strip.ui.lua", props = { layerIndex = 1 } }
  → Widget IDs: layer_strip_1.vol_knob, layer_strip_1.speed_knob, ...
```

The prefix is derived from the instance's `id` override or auto-generated from `{componentId}_{instanceIndex}`.

---

## 5. Layer 3: Monolith Override System

### 5.1 Concept

Monolithic Lua scripts run exactly as they do today. The editor never modifies the source file. Instead, visual edits made in the editor are captured as a structured **override file** that composes on top of the monolith's runtime output.

```
monolith.lua  →  executes  →  runtime widget tree
                                      ↓
                              override layer applied
                                      ↓
                              final visible tree
```

### 5.2 Override File Format

Override files use `.overrides.lua` extension and are pure-data Lua tables:

```lua
-- looper_ui.overrides.lua
-- Editor-managed overrides for looper_ui.lua
-- These are applied on top of the monolith's runtime widget tree.
return {
  -- Source script this overrides (for validation)
  source = "looper_ui.lua",
  
  -- Timestamp of last edit (ISO 8601)
  lastModified = "2026-03-06T00:30:00Z",
  
  -- Property overrides keyed by widget stable ID
  overrides = {
    ["tempo"] = {
      -- Only the properties that differ from the monolith's output
      x = 150, y = 200, w = 60, h = 60,
    },
    ["rec"] = {
      x = 50,
      style = {
        bg = {0.85, 0.12, 0.12, 1},
      },
    },
    ["layer0"] = {
      -- Can override nested properties
      style = {
        bg = {0.12, 0.18, 0.28, 1},
        radius = 12,
      },
    },
  },
  
  -- Widgets added by the editor (not present in monolith)
  additions = {
    {
      id = "editor_label_1",
      type = "Label",
      parent = "rootPanel",  -- must reference existing widget ID as parent
      x = 10, y = 580, w = 200, h = 20,
      props = {
        text = "Added in editor",
        fontSize = 10,
      },
      style = {
        colour = {0.58, 0.64, 0.72, 1},
      },
    },
  },
  
  -- Widgets hidden by the editor (still exist in monolith, just not shown)
  hidden = {
    "captureTitle",  -- hide by widget ID
  },
  
  -- Stable ID assignments for widgets that were unnamed in the monolith
  -- (auto-assigned when user first interacts with them in editor)
  idAssignments = {
    -- { fingerprint = "Knob:rootPanel:3", assignedId = "auto_knob_3" },
  },
}
```

### 5.3 Override Risk Classification

Not all override operations are equally safe. The spec explicitly classifies them:

| Operation | Risk Level | Failure Mode | UX Treatment |
|---|---|---|---|
| **Property overrides** (move, resize, restyle) | **Low** | Orphan if widget removed/renamed | Normal visual editing, no warnings |
| **Hidden widgets** | **Medium** | Script may depend on hidden widget for layout or behavior; hiding it may cause visual glitches or broken callbacks | Show "hidden by editor" indicator, easy revert |
| **Additions** (new widgets attached to monolith parents) | **High** | Parent may disappear, change role, change layout assumptions; z-order conflicts; behavior/update interactions with script-owned siblings | Explicit UX: "Attach editor widget to [parentId]" — not just silently placed. Editor shows these as visually distinct (dashed border or badge). Stronger orphan detection. |

**Why additions are riskier:**
Property overrides modify existing structure — the widget already exists and the override just tweaks its state. Additions compose NEW structure into a script-owned tree. The monolith's layout code (`ui_resized`) doesn't know about editor-added widgets. The monolith's update code (`ui_update`) doesn't update them. They exist in a different ownership domain grafted onto the monolith's tree.

**Practical implication for the worker:**
- Property overrides: implement first, test thoroughly, this is the bread and butter
- Hidden: implement second, straightforward but needs revert UX
- Additions: implement last, needs distinct visual treatment in editor, needs clear "this is an editor-only widget" indication, needs more robust orphan handling

### 5.4 Override Application

After the monolith runs and produces its widget tree, the override layer is applied:

```lua
function applyOverrides(rootNode, overrides)
  -- 1. Apply property overrides
  for widgetId, props in pairs(overrides.overrides or {}) do
    local widget = findWidgetById(rootNode, widgetId)
    if widget then
      applyPropertyOverrides(widget, props)
    else
      -- Orphaned override — widget no longer exists in monolith
      reportOrphanedOverride(widgetId, props)
    end
  end
  
  -- 2. Hide widgets
  for _, widgetId in ipairs(overrides.hidden or {}) do
    local widget = findWidgetById(rootNode, widgetId)
    if widget then
      widget.node:setVisible(false)
    end
  end
  
  -- 3. Add editor-created widgets
  for _, addition in ipairs(overrides.additions or {}) do
    local parentWidget = findWidgetById(rootNode, addition.parent)
    if parentWidget then
      instantiateWidget(parentWidget.node, addition)
    else
      reportOrphanedAddition(addition.id, addition.parent)
    end
  end
end
```

### 5.5 Override Capture

When the user makes a visual edit in the editor while viewing a monolith-based UI:

1. The editor detects the edit (move, resize, property change via inspector)
2. The editor compares the new value against the monolith's original runtime value
3. If different, the delta is stored in the override table keyed by widget ID
4. If the user reverts to the original value, the override entry is removed (keep it clean)
5. The override file is written to disk

```lua
function captureOverride(widgetId, property, newValue, originalValue)
  if valuesEqual(newValue, originalValue) then
    -- Reverted to original — remove override
    removeOverride(widgetId, property)
  else
    -- Store delta
    setOverride(widgetId, property, newValue)
  end
  saveOverrideFile()
end
```

### 5.6 Stable ID Strategy for Monoliths

Overrides reference widgets by ID. For monoliths, IDs come from the `name` argument passed to widget constructors (e.g. `Knob.new(parent, "tempo", {...})`).

Current `looper_ui.lua` already names all widgets — this is the common case.

**For unnamed widgets** (no `name` argument, or generic names):
1. On first editor interaction with an unnamed widget, auto-assign a stable ID
2. The assignment is based on a fingerprint: `{type}:{parentId}:{childIndex}`
3. The assignment is stored in `idAssignments` in the override file
4. Future loads match by fingerprint and apply the assigned ID

**For dynamic/loop-generated widgets** (e.g. layer panels created in a `for` loop):
- These already have indexed names in `looper_ui.lua` (e.g. `"layer0"`, `"layer1"`)
- If names include the index, they're stable
- If not, the fingerprint includes child index which is stable as long as loop count doesn't change

**Limitation to be honest about:** If a monolith's structure changes dramatically (widgets reordered, renamed, loop count changed), some overrides may become orphaned. This is detected at load time and surfaced to the user.

### 5.7 Orphan Detection and Cleanup

On project load, after applying overrides:

```lua
function detectOrphans(overrides, rootNode)
  local orphans = {}
  for widgetId, _ in pairs(overrides.overrides or {}) do
    if not findWidgetById(rootNode, widgetId) then
      table.insert(orphans, { id = widgetId, kind = "override" })
    end
  end
  for _, addition in ipairs(overrides.additions or {}) do
    if not findWidgetById(rootNode, addition.parent) then
      table.insert(orphans, { id = addition.id, kind = "addition", parent = addition.parent })
    end
  end
  return orphans
end
```

If orphans are found, the editor surfaces a non-blocking notification:

> **"3 editor overrides reference widgets that no longer exist in looper_ui.lua."**  
> The script may have changed since these overrides were created.  
> [Review] [Clean Up] [Ignore]

---

## 6. Layer 4: User Assets

### 6.1 Asset Directory Convention

Everything in `assets/` is a user-importable resource:

| Subdirectory | Contents | Use |
|---|---|---|
| `assets/images/` | PNG, JPG, GIF, WebP, SVG | Widget skins, backgrounds, icons |
| `assets/fonts/` | TTF, OTF | Custom typography |
| `assets/html/` | HTML, CSS | Embedded web panels, help pages |
| `assets/samples/` | WAV, AIFF, FLAC | Audio assets for DSP scripts |

### 6.2 Asset Resolution API

Lua scripts resolve assets relative to the project root:

```lua
-- Asset loading API (registered by C++ bindings)
local img = assets.loadImage("images/knob_skin.png")
local font = assets.loadFont("fonts/custom_mono.ttf", 14)
local path = assets.resolve("samples/click.wav")  -- returns absolute path

-- Usage in widgets
local knob = Knob.new(parent, "myKnob", {
  skin = assets.loadImage("images/knob_skin.png"),
  -- ...
})
```

### 6.3 Asset Resolution Rules

1. Paths are relative to `assets/` within the project directory
2. If no project directory exists (legacy mode), fall back to script-relative paths
3. The runtime caches loaded assets (images, fonts) and reloads on file change for hot-reload support
4. Invalid/missing assets produce a clear error, not a silent failure

### 6.4 Asset References: On-Disk vs In-Memory

**On disk** (in `.ui.lua` files, override files, manifests), asset references are always **paths**:

```lua
props = {
  skin = "images/knob_skin.png",   -- path, not a loaded object
  font = "fonts/custom_mono.ttf",  -- path, not a loaded object
}
```

**In memory** (at runtime after instantiation), the loader resolves these paths into loaded objects:

```lua
-- The instantiation layer converts path strings to loaded objects
if type(props.skin) == "string" then
  props.skin = assets.loadImage(props.skin)
end
```

**Why this matters:** Serialization. When the editor saves a `.ui.lua` file, it must write asset paths (strings), not opaque runtime objects. The round-trip is: path on disk → loaded object at runtime → path written back on save. If the serializer encounters a non-serializable asset object, that's a bug.

### 6.5 Editor Asset Browser

The editor should provide an asset browser panel that:
- Enumerates `assets/` recursively
- Shows thumbnails for images
- Shows previews for fonts (sample text rendered)
- Allows drag-and-drop onto widget properties (e.g. drag an image onto a Panel background)
- Allows importing new assets (copy into the appropriate `assets/` subdirectory)

---

## 7. Layer 5: DSP Scripts

DSP scripts are as integral to the project as UI scripts. They are not a deferred concern.

### 7.1 Current DSP Landscape

The codebase has two distinct DSP script patterns:

#### Pattern A: Behavior DSP (complex stateful logic)

Example: `looper_primitives_dsp.lua` (~350 lines)

- Uses `ctx.bundles.LoopLayer` for high-level audio primitives
- Manages internal state (active layer, tempo, transport, recording flow)
- Registers params via `ctx.params.register()`
- Routes param changes through `onParamChange()` with complex conditional logic
- Infers tempo, manages commit/forward mechanics, coordinates multi-layer state

This is analogous to a UI monolith — deeply interleaved state, behavior, and param wiring.

#### Pattern B: FX Chain DSP (graph-based, declarative-ish)

Example: `test_shimmer.lua` (~60 lines)

- Creates primitive nodes (`OscillatorNode`, `ShimmerNode`, `GainNode`, etc.)
- Connects them via `ctx.graph.connect()`
- Registers params and binds them directly: `ctx.params.bind(path, node, setter)`
- Returns a description and param list
- Minimal logic — the graph topology IS the DSP

This pattern is much more amenable to structured representation.

### 7.2 DSP in the Project Directory

```
my-instrument/
  dsp/
    main.lua                      ← primary DSP script (behavior or FX chain)
    fx/                           ← modular FX scripts (slottable)
      shimmer.lua
      crusher.lua
      stereo_delay.lua
    scripts/                      ← experimental/test DSP scripts
      test_granulator.lua
```

### 7.3 DSP Ownership Model

DSP scripts follow the same ownership model as UI scripts:

| Type | Ownership | Editor Role |
|---|---|---|
| **Behavior DSP** (looper_primitives_dsp.lua) | `handwritten` | Inspect params, browse registered endpoints. Text editing. No structural rewriting. |
| **FX Chain DSP** (test_shimmer.lua) | `handwritten` or potentially `editor-managed` | Inspect graph topology, param bindings. Future: visual graph editor for FX chains. |
| **FX slot scripts** (modular effects) | `handwritten` | Slotted into the DSP graph. Inspectable, swappable, but not editor-rewritten. |

### 7.4 DSP Script Manifest Integration

The manifest declares DSP entry points:

```json5
{
  dsp: {
    // Primary DSP script — loaded on plugin init
    default: "dsp/main.lua",
    
    // Named FX slots that can be swapped at runtime
    slots: {
      fx1: { path: "dsp/fx/shimmer.lua", ownership: "handwritten" },
      fx2: { path: "dsp/fx/crusher.lua", ownership: "handwritten" },
    },
  },
}
```

For the first real project-backed workflow, `dsp/main.lua` should be treated as the visible project DSP authority, not disposable scaffolding. It may be:
- a thin wrapper over a system-global built-in,
- a composition root that imports project/user/system DSP helpers,
- or a project-specific extension of a reusable looper baseline.

This is the practical middle ground between two bad extremes:
- **bad extreme 1:** duplicate the entire built-in DSP stack into every project immediately,
- **bad extreme 2:** hide the real DSP behind a direct manifest pointer to a system script and pretend the project owns it.

The acceptable first-pass middle is: **project owns the entry, shared code lives in reusable libraries, and the dependency chain is explicit.**

### 7.5 DSP↔UI Binding Contract

The critical seam between UI and DSP is **parameter paths**. Both sides already speak the same language:

- DSP registers: `ctx.params.register("/core/behavior/tempo", { type = "f", ... })`
- UI sends: `command("SET", "/core/behavior/tempo", value)`

This is the binding contract. It's already working and already path-based.

For structured UI assets, the `bind` field references these paths:

```lua
bind = {
  action = "set",
  target = "/core/behavior/tempo",  -- same path the DSP script registered
}
```

**The project-level view is:**

```
DSP script registers params at paths
    ↕ (path-based contract)
UI widgets bind to those paths
    ↕ (manifest declares both)
Editor can inspect: which params exist, which widgets bind to them, whether any are unbound
```

### 7.6 DSP Introspection for the Editor

The editor should be able to introspect DSP scripts at runtime:

- **Registered params** — list all paths, types, ranges, defaults (already exposed via `ctx.params`)
- **Graph topology** — which nodes exist, how they're connected (for FX chain scripts)
- **Slot status** — which FX slots are filled, what scripts are loaded

This enables the editor to:
- Show a param browser for any loaded DSP script
- Auto-suggest bindings when creating UI controls ("bind to which param?")
- Validate that UI bindings reference params that actually exist
- Show unbound params as candidates for new UI controls

### 7.7 Future: Structured FX Chain Format

FX chain scripts (Pattern B) are close to pure-data already. They're essentially:
- A list of nodes
- A list of connections
- A list of param registrations + bindings

A future structured representation could be:

```lua
-- dsp/fx/shimmer.dsp.lua (hypothetical structured DSP)
return {
  id = "shimmer_fx",
  nodes = {
    { id = "shimmer", type = "ShimmerNode" },
    { id = "gain", type = "GainNode", args = { 2 } },
  },
  connections = {
    { from = "input", to = "shimmer" },
    { from = "shimmer", to = "gain" },
  },
  params = {
    { path = "/fx/shimmer/size", bind = { node = "shimmer", setter = "setSize" },
      type = "f", min = 0, max = 1, default = 0.65 },
    { path = "/fx/shimmer/pitch", bind = { node = "shimmer", setter = "setPitch" },
      type = "f", min = -12, max = 12, default = 12 },
  },
}
```

**This is NOT required for the initial implementation.** But the directory structure and manifest should be designed so that `.dsp.lua` structured files can exist alongside handwritten DSP scripts, using the same ownership model as UI assets. When the visual graph editor becomes real, this format is the save target.

### 7.8 Reusable DSP Libraries and Extension Model

The system should explicitly support reusable DSP code at three scopes, mirroring the UI asset story:

1. **project-local DSP** — `projects/<Name>/dsp/...`
2. **user-global DSP** — `<UserScriptsDir>/dsp/...`
3. **system-global DSP** — built-in/manifold-shipped DSP libraries

That means first-pass DSP files should be allowed to do things like:
- import a built-in looper baseline,
- pull shared helper modules from user-global DSP libraries,
- extend a provided layer/transport/quantizer helper,
- and override project-specific behavior locally.

Conceptually, this is the intended shape:

```lua
-- dsp/main.lua
local looper = require("system:dsp/lib/looper_primitives")
local layers = require("user:dsp/lib/layers")

return looper.createProjectGraph {
  layerFactory = layers.defaultFactory,
  projectName = "My Looper Instrument",
}
```

The exact module API can evolve, but the architectural point should be stable:
- built-ins and globals are reusable libraries,
- the project owns the top-level entry,
- and users can visibly extend/modify the baseline instead of being trapped in a hidden system-script dependency.

### 7.9 DSP and Split Export

The earlier framing here was too weak. DSP should follow the same strategic direction as UI:

- **Supported code-first DSP scripts should be split/exportable**, not treated as permanently opaque.
- The goal is not to "generate replacement DSP code" from thin air; the goal is to **relocate user-written DSP code** into cleaner files while preserving it.
- The same distinction applies as with UI:
  - **supported code-first DSP scripts** → high-confidence split/export,
  - **legacy/off-convention DSP scripts** → manifest registration + introspection + manual migration.

#### What split/export means for DSP

For DSP scripts that follow the supported script contract:
- graph/node/layer setup can be separated from handler logic,
- param registrations can be surfaced as structured data,
- simple param→setter binds can be made declarative,
- complex routing/handler logic can be preserved verbatim in a behavior module,
- helper functions and local DSP state can remain intact.

So the output shape is conceptually:

```text
before:
  dsp/main.lua           -- single code-first DSP script

after split/export:
  dsp/main.lua           -- thin entry/wrapper or archived original
  dsp/graphs/main.dsp.lua    -- structured graph/param declaration (where applicable)
  dsp/behaviors/main.lua     -- preserved user handler logic
```

For heavily behavioral DSP like `looper_primitives_dsp.lua`, the first export may still keep most logic in `dsp/behaviors/main.lua` while only surfacing param metadata and manifest entries structurally. That's still valuable and still preserves code.

#### Important honesty clause

We should not pretend every current DSP script can be perfectly normalized immediately. But we also should not hardcode "DSP behavior scripts are never exportable" into the plan. That's too fucking weak and bakes in the wrong assumption.

The correct stance is:
- DSP is integral,
- supported DSP scripts should split cleanly,
- current off-convention DSP scripts may need refactoring into the supported contract first.

---

## 8. Structured Split Export: Code-First Script → Project

### 8.1 Concept

The earlier term "codegen export" was too loose and led to the wrong mental model.

The real goal is a **structured split export**:
- **extract structure mechanically** from runtime/editor metadata,
- **relocate user-written code mechanically** from supported code-first script phases,
- preserve user logic/layout/update/helpers as code,
- and emit a cleaner project shape without pretending the editor invented the behavior.

This is:
- **User-initiated** — never automatic
- **Non-destructive** — original script can be archived/preserved
- **Code-preserving** — user-written code is moved, not replaced with TODO soup
- **One-way as source-of-truth shift** — after export, the structured project layout is the primary assembly model, but users can still hand-edit every emitted file in their IDE/terminal

### 8.2 Export Flow

```text
User clicks "Export to Structured Project"
    ↓
Editor runs code-first UI script + overrides → final runtime widget tree
    ↓
Source splitter reads the script's declared phases / marked regions
    ↓
Exporter emits:
  - structured .ui.lua scene/component files
  - preserved behavior/layout/update Lua modules
  - manifest entries + binding files
  - archived original script (optional but recommended)
    ↓
If project has DSP scripts, the same flow applies:
  - preserve DSP behavior code
  - surface param metadata / graph declarations where possible
  - update manifest
```

### 8.3 What the Split Export Produces

#### A. Structure extraction (mechanical, reliable)

For each widget in the runtime tree, the exporter extracts:
- `id` (from `_editorMeta.name`)
- `type` (from `_editorMeta.type`)
- `x, y, w, h` (from Canvas node bounds)
- `props` (from `_editorMeta.config` — min, max, step, label, suffix, etc.)
- `style` (bg, colour, radius, etc.)
- `children` (recurse)

This produces `.ui.lua` files.

#### B. Behavior / layout / update relocation (mechanical for supported scripts)

For supported code-first scripts, the exporter does **not** generate placeholder behavior templates by default. Instead it preserves the user's real code.

If the source script follows the supported phases (`build`, `wire`, `layout`, `update`, etc.), the exporter:
- copies helper/local-state code into the emitted behavior module,
- preserves `wire()` logic as-is,
- preserves `layout()` logic as-is,
- preserves `update()` logic as-is,
- adapts only the assembly context (module wrapper / file location / imports),
- and performs minimal reference normalization only if needed.

Conceptually:

```lua
-- emitted ui/behaviors/transport.lua
local M = {}

-- preserved helper state/functions from original script
local recButtonLatched = false

local function commandSet(path, value)
  command("SET", path, tostring(value))
end

function M.init(ui, context)
  -- preserved wiring logic from original code-first script
  ui.rec:setOnPress(function()
    if recButtonLatched then
      command("TRIGGER", "/core/behavior/stoprec")
      recButtonLatched = false
    else
      command("TRIGGER", "/core/behavior/rec")
      recButtonLatched = true
    end
  end)
end

function M.layout(ui, w, h, context)
  -- preserved layout logic from original script
end

function M.update(ui, state, context)
  -- preserved update logic from original script
end

return M
```

The exported code should remain recognizably the user's code, not a synthesized approximation.

#### C. Binding extraction (explicit, not magic)

The old spec's idea of parsing arbitrary callback bodies for `command("SET", path, value)` is too mushy.

Instead, supported code-first scripts should expose simple bindings explicitly via helper APIs or metadata, for example:

```lua
bind.widget(ui.tempo, {
  action = "set",
  target = "/core/behavior/tempo",
})
```

or an equivalent metadata API the worker defines.

Then export can surface these as declarative `bind = { ... }` entries in `.ui.lua` files with high confidence.

If a parameter interaction lives inside complex custom logic, it simply stays in the preserved behavior module. That's fine. Not everything needs to become declarative.

#### D. DSP split export (same principle)

For supported code-first DSP scripts, export should:
- preserve handler logic/helpers/local state in behavior modules,
- surface param registrations structurally,
- surface simple graph topology structurally where possible,
- keep complex behavior as code.

This is not "convert DSP into fake data." It is the same split as UI: structure where structure matters, code where code matters.

### 8.4 How source preservation works

To make code preservation reliable, supported code-first scripts must be machine-splittable. The worker should implement one of the following and treat it as canonical for v1:

1. **Explicit phase functions with a real parser** — parse the script, find `build/wire/layout/update` function bodies, relocate them.
2. **Explicit region markers** — template-generated markers like `-- @manifold:wire begin` / `-- @manifold:wire end`, copied verbatim during export.

**Recommendation for v1:** use explicit region markers in the project templates and refactor first-party scripts to follow them. This is less magical than AST surgery and much easier to make reliable.

Example:

```lua
-- @manifold:helpers begin
local recButtonLatched = false
local function commandSet(path, value)
  command("SET", path, tostring(value))
end
-- @manifold:helpers end

-- @manifold:wire begin
local function wire(ui, ctx)
  ui.rec:setOnPress(function()
    ...
  end)
end
-- @manifold:wire end
```

With markers, export can preserve the user's code text exactly.

### 8.5 Component grouping heuristic

The exporter should split the runtime widget tree into components based on:
1. **Panel boundaries** — each top-level Panel becomes a candidate component
2. **Naming conventions** — widgets with a common prefix or indexed suffix suggest a component family
3. **User hints** — if the editor has a "group as component" action, respect it
4. **Code-first phase hints** — if the source script already groups creation/wiring/layout in named helper functions, use those boundaries too

For `looper_ui.lua`, the natural components remain:
- Transport panel (`transport`, `rec`, `playpause`, `stop`, `overdub`, `clearall`, `tempo`, `targetBpm`, `linkIndicator`, `mode`)
- Capture plane (`capture` panel + strips + segments)
- Layer strip × 4 (`layer0..3` panels + their children) — ideally as one parameterized component

### 8.6 Handling dynamic / loop-generated widgets

This is only hard if the script is arbitrary. Under the supported contract, repeated structures should already have stable IDs and consistent creation patterns.

When a code-first script creates widgets in a loop:

```lua
for i = 0, MAX_LAYERS - 1 do
  local panel = W.Panel.new(root, "layer" .. i, {...})
  -- ... many children per layer ...
end
```

The exporter should:
1. detect repeated isomorphic subtrees with indexed IDs,
2. extract ONE component template,
3. instantiate it N times with props like `layerIndex = i`,
4. preserve any loop-related behavior/layout code in the emitted behavior module.

If pattern detection fails, fall back to separate components — but this should be uncommon for supported scripts.

### 8.7 User-facing export UX

#### Pre-export preview

> **Export to Structured Project**
>
> This will split your code-first script into a structured project:
>
> **Will be created:**
> - `ui/main.ui.lua` — root scene
> - `ui/components/transport.ui.lua` — transport structure
> - `ui/components/capture_plane.ui.lua` — capture structure
> - `ui/components/layer_strip.ui.lua` — layer strip structure
> - `ui/behaviors/transport.lua` — preserved transport behavior/layout/update code
> - `ui/behaviors/layers.lua` — preserved layer behavior/layout/update code
>
> **Will be preserved:**
> - `ui/monoliths/looper_ui.lua` — original code-first script (archive/reference)
> - `ui/monoliths/looper_ui.overrides.lua` — existing editor overrides (archive)
>
> **Important:** You can keep editing the emitted files directly in your terminal or IDE. Export changes the project shape, not your right to work code-first.
>
> [Export] [Cancel]

#### Post-export guidance

> **Export complete!**
>
> Your project is now split into structured assets + preserved code modules.
>
> **Next steps:**
> - Open `ui/behaviors/` to review your preserved logic
> - Open `ui/components/` to tweak structure declaratively
> - Keep editing any of these files in your editor/IDE if you want — nothing is editor-only
>
> [Open Files] [Got It]

### 8.8 Current first-party scripts must be refactored to the supported contract

This is a project-level requirement, not optional cleanup.

Because we are defining the app and the script model together, the current first-party scripts (`looper_ui.lua`, `looper_primitives_dsp.lua`, etc.) should be refactored toward the supported code-first contract.

That means:
- move inline widget callbacks into an explicit `wire()` phase,
- keep layout logic in an explicit `layout()` phase,
- keep state-driven visual changes in an explicit `update()` phase,
- add stable naming everywhere,
- add explicit binding metadata/helper calls for simple binds,
- add source markers or other canonical split metadata.

Do not design the product around today's messiest script shapes. Clean them up and make them the reference implementation.

---

## 9. Stable ID System

### 9.1 Requirements

Stable IDs are required for:
- Override layer referencing
- Binding persistence
- Editor selection persistence
- Component references
- Codegen extraction

### 9.2 ID Sources (priority order)

1. **Explicit `name` argument** — `Widget.new(parent, "my_knob", {...})` → ID is `"my_knob"`
2. **Explicit `id` field in config** — `Widget.new(parent, "name", { id = "my_knob" })` → ID is `"my_knob"`
3. **Auto-assigned by editor** — fingerprint-based, stored in override file's `idAssignments`

### 9.3 ID Uniqueness

IDs must be unique within a project scope. The runtime should warn on duplicate IDs at load time.

For structured assets, IDs are in the file — uniqueness is enforced by the editor on save.

For monoliths, IDs come from the script. If duplicates exist, the system uses the first match and logs a warning.

### 9.4 ID Format

- Lowercase alphanumeric + underscores: `[a-z0-9_]+`
- No dots, slashes, or spaces
- Component-scoped IDs are prefixed automatically: `transport.rec_btn`, `layer_0.speed_knob`

---

## 10. Ownership Model

### 10.1 Two Axes: Ownership and Origin

Ownership is not a single flat enum. There are two separate axes:

**Ownership axis** — who has write authority:

| Mode | Meaning | Editor Authority |
|---|---|---|
| `editor-managed` | Editor reads/writes this file directly | Full round-trip. Editor is source of truth for structure and properties. |
| `handwritten` | User-authored, editor does not modify the file itself | Editor can inspect and manipulate live widgets. Edits saved to override file. |
| `behavior` | Hand-authored logic module | Editor does not modify. Referenced by structured assets. |

**Origin axis** — where it came from (metadata, not behavioral):

| Origin | Meaning |
|---|---|
| `created` | Hand-created (by user or in editor) |
| `exported` | Emitted by structured split export from a code-first script |

Origin is tracked as metadata (e.g. a header comment or manifest annotation) but **does not change behavior**. A file that was `exported` and then hand-edited is still `editor-managed` — it doesn't stay in a separate behavioral class forever. Origin is informational, ownership is operational.

**Why this matters:** A split-exported `.ui.lua` file should behave identically to a hand-created `.ui.lua` file. The "generated" header comment is a courtesy note, not a permission boundary. If the user hand-edits it, those edits are respected like any other `editor-managed` file. Re-export would overwrite, but that's an explicit user action with a confirmation dialog — not a background assumption.

### 10.2 How Ownership Is Determined

1. `.ui.lua` files → `editor-managed`
2. `.overrides.lua` files → `editor-managed` (always)
3. `.lua` files in `behaviors/` → `behavior` (always)
4. `.lua` files in `monoliths/` → `handwritten` (always)
5. Other `.lua` files referenced as root UI → `handwritten` (default for non-structured scripts)
6. Manifest can override ownership explicitly if needed

### 10.3 Editor Behavior Per Ownership Mode

**editor-managed:**
- Visual edits write directly to the `.ui.lua` file
- Full undo/redo
- Inspector changes are authoritative
- File is regenerated on save (clean formatting)

**handwritten:**
- Visual edits write to the companion `.overrides.lua` file
- Text editing of the source is supported in the embedded editor
- Inspector shows current runtime values (original + overrides)
- Inspector changes go to override layer
- "Revert to original" clears the specific override

**behavior:**
- Shown in script editor
- Not visually editable (no widget tree)
- Changes require text editing + script reload

---

## 11. Color Representation

### 11.1 Problem

The current codebase uses hex integers for colors (`0xff22d3ee`). Structured assets need a format that's:
- Human-readable
- Editable in the inspector
- Serializable to pure-data Lua tables

### 11.2 Solution

Structured assets use `{r, g, b, a}` tuples with values 0.0–1.0:

```lua
style = {
  bg = {0.08, 0.10, 0.14, 1.0},
  colour = {0.13, 0.83, 0.93, 1.0},
}
```

The widget instantiation layer converts these to the hex integers the runtime expects:

```lua
function colorToHex(c)
  if type(c) == "number" then return c end  -- already hex, pass through
  if type(c) == "table" and #c >= 3 then
    local r = math.floor(c[1] * 255 + 0.5)
    local g = math.floor(c[2] * 255 + 0.5)
    local b = math.floor(c[3] * 255 + 0.5)
    local a = math.floor((c[4] or 1.0) * 255 + 0.5)
    return (a << 24) | (r << 16) | (g << 8) | b
  end
  return 0xffffffff
end
```

This means:
- Structured assets always use `{r, g, b, a}` tuples
- Monolith overrides can use either (hex or tuple, converted on read)
- The inspector always shows the color picker with 0–1 float values

---

## 12. Implementation Priority

### Phase 1: Foundation (do first)

| Task | Description | Dependencies |
|---|---|---|
| **1.1 Project directory detection** | Runtime scans for `manifold.project.json5`, sets project root | None |
| **1.2 Manifest loader** | Parse JSON5 manifest, expose project metadata to Lua | 1.1 |
| **1.3 Lua table serializer** | Write clean `return { ... }` from Lua tables (for saving structured assets and overrides) | None |
| **1.4 Lua table scene loader** | Read `.ui.lua` → instantiate widget tree from pure-data tables | None |
| **1.5 Stable ID registry** | Track all widget IDs at runtime, detect duplicates, support lookup | None |
| **1.6 Supported UI script contract** | Introduce `Script.define{ build, wire, layout, update, cleanup }` or equivalent canonical contract | None |
| **1.7 Supported DSP script contract** | Introduce `DspScript.define{ build_graph, register_params, wire_handlers, cleanup }` or equivalent canonical contract | None |
| **1.8 First-party template files** | Add canonical script templates with explicit phase functions and/or region markers | 1.6, 1.7 |

### Phase 2: Override System (unblocks monolith editing → save)

Implement in risk order — property overrides first (low risk, high value), additions last (high risk, lower priority).

| Task | Description | Risk | Dependencies |
|---|---|---|---|
| **2.1 Override file reader** | Load `.overrides.lua`, parse structure via sandboxed loader | — | 1.3 |
| **2.2 Property override application** | Apply position/size/style overrides on top of monolith runtime tree | Low | 2.1, 1.5 |
| **2.3 Override capture** | Detect visual edits in editor, compute delta vs original, store | Low | 2.2 |
| **2.4 Override save** | Write override table to `.overrides.lua` on disk | Low | 1.3, 2.3 |
| **2.5 Orphan detection** | Detect stale overrides, surface to user | Low | 2.2 |
| **2.6 Auto-ID assignment** | Assign stable IDs to unnamed widgets on first editor interaction | Low | 1.5 |
| **2.7 Hidden widget support** | Apply visibility overrides, show "hidden by editor" in tree, easy revert | Medium | 2.2 |
| **2.8 Widget additions** | Attach editor-created widgets to monolith parents, distinct visual treatment, stronger orphan handling | High | 2.2, Phase 3 scene instantiation |

### Phase 3: Structured Assets (proves full round-trip)

| Task | Description | Dependencies |
|---|---|---|
| **3.1 Scene instantiation** | Full widget tree from `.ui.lua` including nested children | 1.4 |
| **3.2 Component loading** | Support `components = { { ref = "..." } }` references | 3.1 |
| **3.3 Behavior module attachment** | Load and wire `behavior = "..."` modules to instantiated widgets | 3.1 |
| **3.4 Editor round-trip** | Visual edits on structured assets → save back to `.ui.lua` | 1.3, 3.1 |
| **3.5 Create from editor** | "New Component" action in editor creates blank `.ui.lua` file | 3.1 |

### Phase 4: DSP Integration

| Task | Description | Dependencies |
|---|---|---|
| **4.1 DSP manifest entries** | Manifest declares default DSP script + named FX slots | 1.2 |
| **4.2 DSP param introspection** | Editor can query registered params from loaded DSP scripts (paths, types, ranges) | 4.1 |
| **4.3 DSP param browser panel** | Editor panel listing all registered DSP params with current values | 4.2 |
| **4.4 Binding suggestion** | When creating/editing a widget bind, show available DSP params as candidates | 4.2, Phase 3 |
| **4.5 Binding validation** | On project load, warn if UI bindings reference params that don't exist in DSP | 4.2, Phase 3 |
| **4.6 FX slot management** | Editor can browse, assign, and swap FX slot scripts | 4.1 |

### Phase 5: Asset System

| Task | Description | Dependencies |
|---|---|---|
| **5.1 Asset resolution API** | `assets.loadImage()`, `assets.loadFont()`, `assets.resolve()` | 1.1 |
| **5.2 Image asset support** | Load PNG/JPG, expose to Canvas/gfx for widget skins | 5.1, C++ work |
| **5.3 Font asset support** | Load TTF/OTF, make available to gfx.setFont() | 5.1, C++ work |
| **5.4 Asset browser panel** | Editor panel: enumerate, preview, drag-drop assets | 5.1 |

### Phase 6: Structured Split Export

| Task | Description | Dependencies |
|---|---|---|
| **6.1 Tree walker** | Walk runtime widget tree, extract structure as data tables | 1.5 |
| **6.2 Component grouper** | Detect repeated structures, extract as parameterized components | 6.1 |
| **6.3 Source region reader** | Read code-first script phase regions/functions from source file | 1.6, 1.8 |
| **6.4 UI behavior relocation** | Emit preserved `helpers/wire/layout/update` code into behavior modules | 6.3 |
| **6.5 Explicit binding extraction** | Surface declared simple binds as declarative `bind = { ... }` data | 6.3 |
| **6.6 Structure emitter** | Generate `.ui.lua` files from extracted runtime structure | 1.3, 6.1, 6.2 |
| **6.7 DSP split export** | Preserve DSP handler code, surface param metadata, emit manifest updates | 1.7, 4.2 |
| **6.8 Export orchestrator** | Full export flow: run → extract → relocate → emit → archive original → update manifest | 6.4, 6.5, 6.6, 6.7 |
| **6.9 Export UX** | Pre-export preview, post-export guidance, file listing | 6.8 |

### Phase 7: Script Contract Adoption & Migration UX

| Task | Description | Dependencies |
|---|---|---|
| **7.1 First-party UI refactor** | Refactor `looper_ui.lua` and other first-party UIs to explicit `build/wire/layout/update` phases | 1.6 |
| **7.2 First-party DSP refactor** | Refactor `looper_primitives_dsp.lua` and representative DSP scripts to the supported DSP contract | 1.7 |
| **7.3 New project wizard** | Choice: blank structured / import code-first script / template | Phase 3 |
| **7.4 Complexity nudges** | Detect when override files grow large or scripts are off-contract, suggest cleanup/export | Phase 2 |
| **7.5 Override review panel** | View all overrides, revert individual ones, clean orphans | 2.5 |
| **7.6 Binding editor** | Visual binding/mapping editor for structured assets | Phase 3 |
| **7.7 Legacy script warning** | If a script is off-contract (inline callbacks, missing stable names, etc.), show clear export limitations | 1.6, 6.3 |

---

## 13. Reference: Current Widget Types and Their Schemas

From the existing `schema.lua`, the widget types and their editable properties:

| Widget | Props | Style |
|---|---|---|
| Button | label | bg, textColour, fontSize, radius |
| Label | text | colour, fontSize, fontStyle, justification |
| Panel | interceptsMouse | bg, border, borderWidth, radius, opacity |
| Slider | value, min, max, step, label, suffix, showValue | colour, bg |
| VSlider | value, min, max, step, label, suffix | colour, bg |
| Knob | value, min, max, step, label, suffix | colour, bg |
| Toggle | value, label | onColour, offColour |
| Dropdown | selected | bg, colour |
| WaveformView | mode, layerIndex | colour, bg, playheadColour |
| Meter | orientation, showPeak, decay | colour, bg |
| SegmentedControl | selected | bg, selectedBg, textColour, selectedTextColour |
| NumberBox | value, min, max, step, label, suffix, format | colour, bg |

All of these already store `_editorMeta` on their Canvas nodes including type, config, schema, and callbacks. The structured asset format maps directly to this existing infrastructure.

---

## 14. Reference: Current Monolith Structures

### 14.1 UI Monolith: looper_ui.lua

The existing `looper_ui.lua` serves as the primary test case for the override system and structured split export. Its structure:

- **~700 lines** of mixed structure + layout + behavior
- **Global functions:** `ui_init(root)`, `ui_resized(w, h)`, `ui_update(state)`
- **Widget tree:** rootPanel → transportPanel (9 controls), capturePanel (strips + segments), 4× layerPanels (each with 7+ controls)
- **All widgets named** — stable IDs already exist
- **Complex behavior:** rec button latch, play/pause toggle logic, vinyl scrub with speed restoration, state normalization, mute state tracking, dynamic label/color changes
- **Helper functions:** ~15 local helpers for state normalization, formatting, path construction

This monolith is a realistic, non-trivial test case. The override system must work cleanly against it. It should also be refactored into the supported code-first contract so that split export can preserve its real layout/update/behavior code rather than generating placeholders.

### 14.2 DSP Monolith: looper_primitives_dsp.lua

The core DSP script. Its structure:

- **~350 lines** of stateful DSP behavior logic
- **Entry point:** `buildPlugin(ctx)` returns `{ onParamChange = function(path, value) ... }`
- **State management:** Internal state table tracking active layer, tempo, transport, recording flow, forward/commit mechanics
- **Primitive usage:** `ctx.bundles.LoopLayer` for loop layers with tempo/mode/capture management
- **Param registration:** ~30+ params registered via `ctx.params.register()` including per-layer params in a loop
- **Complex behaviors:** tempo inference from recording duration, quantize-to-nearest-legal, multi-layer overdub, recording start/stop flow, forward/armed commit mechanics

This is a **behavior DSP**. It is complex and stateful, but that should not automatically exempt it from the supported script contract. In practice, the first split/export may preserve most of its logic in a DSP behavior module while surfacing param metadata and manifest entries structurally. The editor should introspect its registered params, and UI bindings should continue to reference its param paths.

### 14.3 DSP FX Scripts: test_shimmer.lua et al

The `dsp/scripts/` directory contains ~30 FX chain scripts. Their structure:

- **40-80 lines** each, graph-based
- **Pattern:** create nodes → connect graph → register params → bind params to node setters
- **Declarative-ish:** the graph topology and param bindings are essentially data, wrapped in minimal Lua
- **Returns:** `{ description = "...", params = { ... } }`

These are the candidates for future structured `.dsp.lua` format (§7.7) but work fine as handwritten scripts now.

---

## 15. Open Decisions (For Worker to Flag, Not Block On)

These are known unknowns. The worker should implement the system as specced and flag these for review.

### Resolved in v2:

- ~~Component prop passing~~ → **Resolved.** See §4.6 Component Instance Merge Semantics. Shallow merge for props/style, full replace for bind/behavior, `$prop` template substitution.
- ~~Behavior module lifecycle~~ → **Resolved.** See §4.4 Behavior Module API Contract. Flat widgets table keyed by ID, component-scoped, `init/update/cleanup` lifecycle.
- ~~Is monolith+override a bridge or permanent?~~ → **Resolved.** Permanent first-class mode. See Philosophical Stance in §2.

### Still open:

1. **JSON5 parser in C++**: The manifest is JSON5. We need a parser. Options: bundle a small JSON5 lib, use a Lua JSON5 parser, or fall back to strict JSON with comments stripped. Recommendation: start with a Lua-side JSON5 parser (simpler to iterate on), move to C++ if performance matters.

2. **Theme integration**: How do themes compose with structured assets? Does the theme override style values? Is it a separate pass? This can be deferred — the style system works without them and they can land after the core split/export work.

3. **Hot reload for structured assets**: When a `.ui.lua` file changes on disk, should the editor auto-reload? Recommendation: yes for files the editor is NOT currently saving (external edits), no during active editor save operations (avoid feedback loops).

4. **Conflict between override and structured**: What if a user somehow has both a `.ui.lua` and a `.overrides.lua` for the same component? Recommendation: `.overrides.lua` only applies to `handwritten` ownership mode. If a file is `editor-managed`, any companion `.overrides.lua` is ignored with a warning.

5. **Structured DSP format**: The FX chain pattern (§7.7) could become a structured `.dsp.lua` format with visual graph editing, but this is future work. For now, DSP scripts are primarily handwritten, but the supported DSP contract and split export should preserve/relocate DSP code rather than treating it as permanently opaque.

6. **Reusable DSP module API**: What should the first-party reusable DSP helpers actually look like (`system:dsp/lib/...`, layer factories, transport helpers, quantizer helpers, etc.)? Recommendation: keep the architectural rule stable now — project owns `dsp/main.lua`, shared code lives in reusable modules — and iterate on exact helper APIs from the looper port.

7. **Source preservation mechanism**: Use explicit region markers, a real Lua parser, or both? Recommendation: region markers for v1 in first-party templates and supported scripts, parser later if needed.

---

## 16. Success Criteria

The system is working when:

1. **A code-first script user** can open their script in the editor, make visual edits, close the editor, reopen it, and see their edits preserved — without their source file being modified.

2. **A structured-asset user** can create a UI entirely in the visual editor, save it, reload it, and have full round-trip fidelity.

3. **A code-first structured user** can hand-edit `.ui.lua` files in their terminal/IDE, reload in Manifold, and see their changes. The structured format is human-readable and human-writable, not editor-only.

4. **A migrating user** can export their code-first script to a structured project, get clean component files plus preserved behavior/layout/update code, and continue working from the structured version — in the editor OR in a text editor.

5. **A project DSP user** can open `dsp/main.lua` and see the real project DSP entry there — whether it is fully local or a thin explicit wrapper around reusable project/user/system DSP libraries — without having to reverse-engineer a hidden manifest pointer to a system script.

5. **A supported DSP script user** can split/export their DSP project shape without losing their handler logic; registered params are inspectable in the editor, and UI widgets can bind to DSP params with the editor validating that the paths exist.

6. **An asset-using user** can drop images/fonts into the project directory and reference them from their UI.

7. **The editor never lies** — it doesn't pretend to own what it doesn't own, doesn't silently overwrite user code, and surfaces conflicts honestly.
