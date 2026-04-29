# MidiSynth → ImGui Migration Analysis

## Executive Summary

The avsamplerDOCKING project proved that **ImGui docking as outer shell + retained widgets inside** provides superior flexibility, free layout management, and proper scaling compared to Manifold's native `stack-y/x` layout engine. This document analyzes everything needed to convert the Main project's MidiSynth tab to this pattern.

---

## Architecture: The Hybrid Model

```
                         ┌─────────────────────────────────────┐
                         │  ImGui Dockspace (outer shell)      │
                         │  - Free splitter bars               │
                         │  - User-resizable/rearrangeable      │
                         │  - Auto-persisted layout             │
                         └──────────────────┬──────────────────┘
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              │                             │                             │
     ┌────────▼────────┐          ┌────────▼────────┐          ┌────────▼────────┐
     │ ImGui Dock Win 1 │          │ ImGui Dock Win 2 │          │ ImGui Dock Win 3 │
     │  (Rack)          │          │  (Keyboard)      │          │  (Modulation)     │
     └────────┬────────┘          └────────┬────────┘          └────────┬────────┘
              │                             │                             │
     ┌────────▼────────┐          ┌────────▼────────┐          ┌────────▼────────┐
     │ Retained Panel  │          │ Retained Panel  │          │ Retained Panel  │
     │ (RackModuleShell│          │ (keyboard +     │          │ (patchbay +      │
     │  children)      │          │  palette)       │          │  wires)          │
     └─────────────────┘          └─────────────────┘          └─────────────────┘
```

The core pattern from avsamplerDOCKING:

1. **Top-level Lua behavior** sets `ctx.root.node:setOnImGuiFrame(function() renderFrame(ctx) end)`
2. `renderFrame()` creates an ImGui **dockspace** that fills the content area
3. Inside the dockspace, **ImGui dock windows** are created via `imguiBegin("WindowName###unique_id", flags)`
4. Inside each dock window, the **rendering space is split**: ImGui code for controls (buttons, dropdowns, sliders), and `imguiRetainedPanel()` to embed retained widget trees
5. **Retained panels** (`transportEmbed`, `polyEmbed`, `sourceEmbed`, etc.) are zero-size invisible containers from the UI file that get resized and rendered inside ImGui windows

---

## What Stays, What Changes

### CAN STAY (no changes needed)

These components work identically under ImGui because they're called from behavior, not layout:

| Component | File | Why |
|-----------|------|-----|
| **VoiceManager** | `ui/behaviors/voice_manager.lua` | Pure logic, no layout |
| **ModulationRouter** | `ui/behaviors/modulation_router.lua` | Pure logic, no layout |
| **RackMutationRuntime** | `ui/behaviors/rack_mutation_runtime.lua` | Pure logic, no layout |
| **RackLayoutEngine** | `ui/behaviors/rack_layout_engine.lua` | Pure logic, module placement math |
| **StateManager** | `ui/behaviors/state_manager.lua` | Pure persistence, no layout |
| **PatchbayBinding** | `ui/behaviors/patchbay_binding.lua` | Wire connection logic, no layout |
| **MidiDevices** | `ui/midi_devices.lua` | MIDI device enumeration, no layout |
| **RackModuleFactory** | `ui/rack_module_factory.lua` | Module creation, no layout |
| **ModRuntime** | everything in `lib/modulation/` | Pure routing, no layout |
| **Dynamic modules** | ADSR, transpose, velocity mapper, arp, lfo, etc. in `lib/` | Pure state machine, no layout |
| **RackLayoutManager** | `ui/rack_layout_manager.lua` | Constants and math helpers, no layout |
| **ParameterBinder** | `lib/parameter_binder.lua` | Binds widgets to params, layout-neutral |

### NEEDS FULL REWRITE

These are tightly coupled to the native `stack-y/x` layout tree:

| Module | File | Coupling |
|--------|------|----------|
| **main.ui.lua** | `ui/main.ui.lua` | Entire tab layout (TabHost, stacks, absolute positioning) |
| **midisynth_view.ui.lua** | `ui/components/midisynth_view.ui.lua` | Entire midisynth layout tree, palette cards, keyboard header |
| **rack_container.lua** | `ui/components/rack_container.lua` | Fixed-position rack shells, rail sockets |
| **RackModuleShell** | `ui/components/rack_module_shell.lua` | Absolute layoutChild, fixed x/y, currently tightly coupled to declarative system |

### NEEDS SIGNIFICANT REWRITE

These provide complex widget trees that must be embedded inside ImGui dock windows:

| Module | File | Approach |
|--------|------|----------|
| **palette_browser.lua** | `ui/behaviors/palette_browser.lua` | Currently manages nested stack layout for cards; needs to become an ImGui child window with `imguiRetainedPanel` for the card grid |
| **rack_layout.lua** | `ui/behaviors/rack_layout.lua` | Currently manages shell positions; with ImGui docking, each rack row becomes a dock window |
| **rack_wire_layer.lua** | `ui/behaviors/rack_wire_layer.lua` | Display list drawing works fine, but coordinate calculation changes |
| **midi_param_rack.lua** | `ui/midi_param_rack.lua` | Needs to render into an ImGui child instead of a retained panel |
| **keyboard_input.lua** | `ui/behaviors/keyboard_input.lua` | Piano keyboard display list rendering works, but positioning changes |
| **patchbay_runtime.lua** | `ui/patchbay_runtime.lua` | Wire/modal overlay positioning changes |
| **rack_mod_popover.lua** | `ui/rack_mod_popover.lua` | Popover positioning changes |
| **dynamic_module_graphs.lua** | `ui/dynamic_module_graphs.lua` | Graph rendering, no structural change needed |

---

## Proposed Dock Window Layout

Based on the avsamplerDOCKING 5-window model, adapted for MidiSynth's needs:

```
┌─────────────────────────────────────────────────────────────┐
│  Toolbar (ImGui main menu bar or ImGui window, toggled)     │
├──────────────────────┬───────────────────┬──────────────────┤
│                      │                   │                  │
│  Rack (rows 1-3)     │  Oscillator       │  Modulation      │
│  Dock window         │  Dock window      │  Popover         │
│  - ADSR, Filter, FX  │  - Waveform type  │  Dock window     │
│  - Dynamic slots     │  - Sample control  │  (when active)   │
│                      │  - Blend control   │                  │
├──────────────────────┼───────────────────┼──────────────────┤
│                      │                   │                  │
│  Keyboard / Palette  │  MIDI Param Rack  │  Waveform View   │
│  Dock window         │  Dock window      │  Dock window     │
│  - Piano keys        │  - CC mappings    │  - Sample vis    │
│  - Module cards      │                   │  - Loop regions  │
│  - Tag filter        │                   │  - Playheads     │
│                      │                   │                  │
├──────────────────────┴───────────────────┴──────────────────┤
│  Status bar / voice display (floating ImGui overlay)         │
└─────────────────────────────────────────────────────────────┘
```

### Dock Tree Construction

Following the avsamplerDOCKING `split()` pattern:

```lua
local function buildMidiSynthLayout(ctx, dockId)
  -- Split: left (rack+keyboard) 60% | right (osc+mod+wave) 40%
  local leftCol, rightCol = split{ node = dockId, dir = imguiDir_Right, ratio = 0.40 }

  -- Left column: rack (top) 55% | keyboard+palette (bottom) 45%
  local rack, keyboardArea = split{ node = leftCol, dir = imguiDir_Down, ratio = 0.55 }
  local palette, midiRack = split{ node = keyboardArea, dir = imguiDir_Down, ratio = 0.55 }
  local paramRack, pianoKeys = split{ node = midiRack, dir = imguiDir_Down, ratio = 0.30 }

  -- Right column: oscillator (top) 35% | modulation (middle) 35% | waveform (bottom) 30%
  local oscArea, rightBottom = split{ node = rightCol, dir = imguiDir_Down, ratio = 0.35 }
  local modArea, waveArea = split{ node = rightBottom, dir = imguiDir_Down, ratio = 0.50 }

  -- Dock windows into nodes
  imguiDockBuilderDockWindow("Rack###MS_rack", rack)
  imguiDockBuilderDockWindow("Keyboard###MS_keyboard", pianoKeys)
  imguiDockBuilderDockWindow("Palette###MS_palette", palette)
  imguiDockBuilderDockWindow("Midi Param Rack###MS_midiRack", paramRack)
  imguiDockBuilderDockWindow("Oscillator###MS_osc", oscArea)
  imguiDockBuilderDockWindow("Modulation###MS_mod", modArea)
  imguiDockBuilderDockWindow("Waveform###MS_wave", waveArea)
end
```

### Layout Presets

```
┌─────────────────────────────┬──────────────────────────┐
│  PRESET                    │  TREE STRUCTURE           │
├─────────────────────────────┼──────────────────────────┤
│  "full"                    │  7 dock windows (above)   │
│  "compact"                 │  4 dock windows:          │
│                            │  Rack | Keyboard |        │
│                            │  Osc+Mod combined         │
│  "keyboard-minimal"        │  3 dock windows:          │
│                            │  Rack full width          │
│                            │  Keyboard full width      │
│                            │  Osc (floating)           │
└─────────────────────────────┴──────────────────────────┘
```

---

## How to Render Each Major Section

### 1. Rack (module shells)

The avsamplerDOCKING `fxShell()` embedding pattern shows the way. Instead of declaring rack shells at fixed x/y in a UI file, each shell becomes an **ImGui child window** inside the "Rack" dock window, with its retained panel content rendered via `imguiRetainedPanel()`.

```lua
-- Inside renderRackPanel(ctx)
local avail = imguiGetContentRegionAvail()

-- Render ADSR as ImGui child with embedded retained panel
imguiBeginChild("##rack_adsr", avail.x * 0.2, avail.y * 0.5)
  local ca = imguiGetContentRegionAvail()
  setBounds(ctx.widgets.adsrShell, 0, 0, math.floor(ca.x), math.floor(ca.y))
  imguiRetainedPanel(ctx.widgets.adsrShell.node, ca.x, ca.y, true)
imguiEndChild()
imguiSameLine()

-- Render Oscillator as ImGui child (larger = 2x width)
imguiBeginChild("##rack_osc", avail.x * 0.4, avail.y * 0.5)
  local ca = imguiGetContentRegionAvail()
  setBounds(ctx.widgets.oscillatorShell, 0, 0, math.floor(ca.x), math.floor(ca.y))
  imguiRetainedPanel(ctx.widgets.oscillatorShell.node, ca.x, ca.y, true)
imguiEndChild()
-- etc.
```

**Alternative** — even simpler: each shell is its own **ImGui dock window**. The user can resize/rearrange them at will, and the dock builder handles the grid. The rack row structure can be enforced at the dock tree level:

```lua
-- Row 1: ADSR (1x1) | Oscillator (1x2) | Filter (1x2)
local row1_1, row1_rest = split{node = dockId, dir = imguiDir_Right, ratio = 0.20}
local row1_2, row1_3 = split{node = row1_rest, dir = imguiDir_Left, ratio = 0.50}

imguiDockBuilderDockWindow("ADSR###MS_adsr", row1_1)
imguiDockBuilderDockWindow("OSC###MS_osc", row1_2)
imguiDockBuilderDockWindow("Filter###MS_filter", row1_3)
```

### 2. Palette Browser

The palette cards currently use `layoutChild` with fixed basisW/basisH in a `stack-x` row. Under ImGui:

- The "palette strip" becomes an ImGui **child window** inside the Palette dock window
- Card rendering uses **native ImGui widgets or `imguiRetainedPanel`** for each card
- The tag filter row, search bar, and detail panel are ImGui-native (no need for retained panels)
- Pagination works via ImGui buttons + tracking `ctx._palettePage`

```lua
-- Inside renderPalettePanel(ctx):
local avail = imguiGetContentRegionAvail()

-- Tag filter row (ImGui buttons)
for _, tag in ipairs({"All", "Voice", "Audio", "FX", "Mod"}) do
  if imguiButton(tag) then applyTagFilter(ctx, tag) end
  imguiSameLine()
end

imguiSeparator()

-- Palette card grid (ImGui children or retained panels)
imguiBeginChild("##paletteCardGrid")
  local ca = imguiGetContentRegionAvail()
  local perRow = math.max(1, math.floor(ca.x / 112))  -- 102px + gap
  local idx = 1
  for _, card in ipairs(ctx._visiblePaletteCards) do
    local col = (idx - 1) % perRow
    local row = math.floor((idx - 1) / perRow)
    local cx = col * 112 + 6
    local cy = row * 66 + 6
    setBounds(ctx.widgets[card.widgetId], cx, cy, 102, 56)
    imguiRetainedPanel(ctx.widgets[card.widgetId].node, 102, 56, false)
    idx = idx + 1
  end
imguiEndChild()
```

### 3. Keyboard (Piano + Voice Display)

The keyboard uses display lists (`setDisplayList(...)`) for white/black key rendering. This works inside ImGui by embedding the keyboard canvas as a retained panel:

```lua
-- Inside renderKeyboardPanel(ctx):
local avail = imguiGetContentRegionAvail()
local keyW = math.floor(avail.x / ctx._keyboardKeyCount)

-- Octave controls section (ImGui-native)
if imguiButton("Oct -") then keyboardOctaveDown(ctx) end
imguiSameLine()
imguiText(string.format("C%d-C%d", ctx._keyboardOctave, ctx._keyboardOctave + 1))

-- Voice note labels (ImGui-native)
for i = 1, ctx._voiceCount do
  local voice = ctx._voices[i]
  local noteStr = voice.active and noteName(voice.note) or "--"
  imguiTextColored(VOICE_COLORS[i], noteStr)
  imguiSameLine()
end

imguiSeparator()

-- Piano canvas (retained panel with display list)
setBounds(ctx.widgets.keyboardCanvas, 0, 0, math.floor(avail.x), math.floor(avail.y - 60))
ctx._keyboardDirty = true
imguiRetainedPanel(ctx.widgets.keyboardCanvas.node, avail.x, avail.y - 60, true)
```

### 4. Waveform View

The `WaveformView` widget is a retained widget that embeds natively. Same pattern:

```lua
-- Inside renderWaveformPanel(ctx):
local avail = imguiGetContentRegionAvail()
setBounds(ctx.widgets.waveform, 8, 8, math.floor(avail.x) - 16, math.floor(avail.y) - 16)
imguiRetainedPanel(ctx.widgets.waveform.node, avail.x - 16, avail.y - 16, true)
```

### 5. MIDI Param Rack

This can be rendered **entirely in ImGui** — no retained panels needed. `imguiSliderFloat`, `imguiCombo`, etc. for each CC mapping:

```lua
-- Inside renderMidiParamRack(ctx):
local avail = imguiGetContentRegionAvail()
local rows = ctx._midiParamMappings or {}

for i = 1, math.min(#rows, 6) do
  local r = rows[i]
  imguiText(tostring(r.cc) .. ":")
  imguiSameLine()
  imguiSetNextItemWidth(avail.x * 0.6)
  local val = r.value
  if imguiSliderFloat("##cc" .. i, val, 0, 1, "%.3f") then
    MidiParamRack.setMapping(ctx, i, val)
  end
end
```

---

## The Docking Surface Registry

The existing shell surface system (`shell:defineSurface()`, `shell:syncHostSurfaceFromCanvas()`, `shell:syncHostSurfaceFromPanelInsets()`) already supports the ImGui backend via `backend = "imgui"` and `docking = "docked-left" | "docked-right" | "fill" | "floating"`. However, the MidiSynth tab currently **doesn't use this system at all** — it renders entirely through the retained node tree.

For the ImGui migration, the shell surface registry is **not needed** for the main content. The ImGui dockspace + dock windows handle layout directly via the `setOnImGuiFrame` callback. The surface registry is only relevant if you want to embed the MidiSynth UI into the **editor shell** (hierarchy/inspector tools), which isn't the use case here — the Main project uses the "performance" mode shell.

However, the **perf overlay** and any floating dialogs should continue to use the surface registry for consistency with the editor mode.

---

## What Changes in the DSP Binding

### Param Path Mapping

The MidiSynth behavior uses `/midi/synth/...` OSC paths. The avsamplerDOCKING uses `/avsampler/...`. These are DSP-level paths and don't change with the UI architecture — the behavior continues to call `readParam(path)` and `setParam(path, value)` the same way.

### MIDI Polling

`Midi.pollInputEvent()` is called in the background tick. This doesn't change. However, with ImGui, you may want to **also** add `io.SetKeyEvent()` / `io.AddInputCharacter()` for live keyboard input when the ImGui window has focus, similar to what the `ImGuiHost` C++ code does. Currently the MidiSynth behavior handles key events through the retained node's focus system; under ImGui, keyboard focus goes through ImGui's io system.

---

## Data Flow: Behavior Update Loop

The critical difference is **when** rendering happens:

**Current (native layout engine):**
```
Manifold render loop
  → project_loader resolves UI tree
  → layout engine positions children
  → M.update(ctx) called per frame
  → backgroundTick() polls MIDI, updates envelopes
  → WidgetSync syncs widget values from OSC params
  → Retained node tree renders naturally
```

**New (ImGui hybrid):**
```
Manifold render loop
  → setOnImGuiFrame callback fires
  → renderFrame(ctx) called
    → imguiDockSpace(...) creates/restores dock layout
    → Each renderXXXPanel() function:
      1. imguiBegin() for dock window
      2. ImGui widgets directly (no MIDI routing needed here)
      3. imguiRetainedPanel() for custom widget trees
      4. imguiEnd()
  → M.update(ctx) still called per frame (background tick)
    → backgroundTick() polls MIDI, updates envelopes
    → WidgetSync still works for retained widgets
```

The **background tick remains in `M.update()`**, not inside the ImGui frame callback. This keeps MIDI polling and envelope processing decoupled from rendering, which is correct.

---

## New Project Structure

Following the avsamplerDOCKING pattern, this should be a **new project** (e.g., `MainImGui` or simply refactored `Main`):

```
UserScripts/projects/MainImGui/
├── manifold.project.json5
├── dsp/
│   ├── default_dsp.lua        (reuses Main's DSP)
│   └── main.lua
├── ui/
│   ├── main.ui.lua            (minimal: root panel + embed containers)
│   └── behaviors/
│       ├── main.lua           (the big one: init + renderFrame + all renderXXXPanel functions)
│       ├── rack_imui.lua      (rack module rendering)
│       ├── palette_imui.lua   (palette browser rendering)
│       ├── keyboard_imui.lua  (piano keyboard rendering)
│       └── ... (MIDI param rack, patchbay, etc)
├── lib/
│   └── ... (reuse from Main via package.path)
└── themes/
    └── dark.lua               (reuse from Main)
```

### manifold.project.json5

```json5
{
  name: "MainImGui",
  version: 1,
  description: "Main project rebuilt with ImGui docking shell",
  dsp: {
    default: "dsp/default_dsp.lua"
  },
  ui: {
    root: "ui/main.ui.lua",
    sharedShell: true
  },
  theme: "../Main/themes/dark.lua",
  features: ["midi_input"]
}
```

### minimal main.ui.lua

```lua
return {
  id = "root",
  type = "Panel",
  x = 0, y = 0, w = 1280, h = 720,
  behavior = "ui/behaviors/main.lua",
  shellLayout = { mode = "fill", designW = 1280, designH = 720 },
  style = { bg = 0xff08111f },

  -- Hidden embed containers for retained widget trees
  -- Each gets re-parented into an ImGui dock window
  children = {
    { id = "embedHost", type = "Panel", x = 0, y = 0, w = 1, h = 1,
      props = { visible = false },
      style = { bg = 0x00000000 },
      children = {
        { id = "rackEmbed", type = "Panel", x = 0, y = 0, w = 1, h = 1,
          style = { bg = 0x00000000 } },
        { id = "paletteEmbed", type = "Panel", x = 0, y = 0, w = 1, h = 1,
          style = { bg = 0x00000000 } },
        { id = "keyboardEmbed", type = "Panel", x = 0, y = 0, w = 1, h = 1,
          style = { bg = 0x00000000 } },
        { id = "oscEmbed", type = "Panel", x = 0, y = 0, w = 1, h = 1,
          style = { bg = 0x00000000 } },
        { id = "waveformEmbed", type = "Panel", x = 0, y = 0, w = 1, h = 1,
          style = { bg = 0x00000000 } },
        { id = "midiParamEmbed", type = "Panel", x = 0, y = 0, w = 1, h = 1,
          style = { bg = 0x00000000 } },
        { id = "modulationEmbed", type = "Panel", x = 0, y = 0, w = 1, h = 1,
          style = { bg = 0x00000000 } },

        -- Per-module shells for rack modules
        { id = "adsrShell", type = "Panel", x = 0, y = 0, w = 1, h = 1,
          style = { bg = 0x00000000 },
          components = {{ id = "adsrComponent", ref = "../Main/ui/components/envelope.ui.lua",
                          behavior = "../Main/ui/behaviors/envelope.lua" }} },
        -- ... (oscillatorShell, filterShell, fx1Shell, etc.)
      }
    }
  }
}
```

---

## The `imguiRetainedPanel` Function

This is the critical bridge function, bound in `LuaControlBindings.cpp`:

```cpp
lua["imguiRetainedPanel"] = [](RuntimeNode& node, float width, float height,
                                sol::optional<bool> fitToView) -> bool {
  auto* host = ImGuiDirectHost::getActiveInstance();
  if (host == nullptr) return false;
  ImGuiDirectHost::EmbeddedPanelOptions options;
  options.fitToView = fitToView.value_or(false);
  return host->renderEmbeddedRuntimePanel(node, width, height, options);
};
```

This takes a `RuntimeNode` (a retained widget tree node) and renders it as an embedded panel inside the current ImGui context. The key behavior:

- Creates an offscreen OpenGL surface (EGL pbuffer on Linux)
- Renders the retained node tree into it
- Blits the result into the current ImGui window as an image
- Handles mouse events by transforming ImGui coordinates to retained node coordinates
- Returns `true` if successful

**Important constraints:**
1. Must be called between `imguiBegin()` / `imguiEnd()` for the dock window
2. Width/height should match the available content region (from `imguiGetContentRegionAvail()`)
3. The embed container must exist in the retained node tree and its `node` property must be valid
4. `fitToView` when `true` renders the node to fill the available space; when `false`, the node is placed at (0,0) with the given size

---

## Key Migration Steps (ordered)

### Phase 1: Skeleton

1. **Create new project** `MainImGui` with `manifold.project.json5` + minimal `main.ui.lua`
2. **Set up behavior skeleton** in `ui/behaviors/main.lua`:
   - `M.init(ctx)` — create embed containers, call `setOnImGuiFrame`, set up MIDI/VoiceManager etc.
   - `M.update(ctx)` — background tick, MIDI polling, envelope processing
   - `renderFrame(ctx)` — ImGui dockspace + dock window rendering
3. **Port `M.init` logic** from existing `midisynth.lua` — most of it is pure setup

### Phase 2: Rack

4. **Build dock tree** for the rack area: ADSR, Oscillator, Filter, FX1, FX2, EQ, dynamic slots
5. **Create embed containers** for each shell in `main.ui.lua`
6. **Write `renderRackPanel()`** — ImGui child windows per shell, `imguiRetainedPanel()` for each
7. **Port rack drag-and-drop** — needs to handle ImGui coordinates for hit testing

### Phase 3: Palette + Keyboard

8. **Write `renderPalettePanel()`** — ImGui tag filter buttons, card grid, detail panel
9. **Write `renderKeyboardPanel()`** — ImGui octave controls, voice labels, retained piano canvas
10. **Write `renderMidiParamRack()`** — pure ImGui sliders for CC mappings

### Phase 4: Remaining Sections

11. **Write `renderWaveformPanel()`** — embed the WaveformView inside a dock window
12. **Write `renderModulationPanel()`** — modulation popover/wire display
13. **Write `renderStatusBar()`** — floating ImGui overlay for voice status/pitch info

### Phase 5: Polish

14. **Layout persistence** — ImGui `.ini` handles this automatically if `NoSavedSettings` flag is omitted
15. **Keyboard focus** — ensure ImGui `io.WantCaptureKeyboard` / `io.WantCaptureMouse` logic is correct
16. **Theme parity** — match the Main project's dark theme colors to ImGui style via `ImGui::StyleColorsCustom()`
17. **Test drop-down overlays** — retained widget dropdowns need `setDropdownOverlayRoot()` to point at the right embed container (see avsamplerDOCKING's approach)
18. **Module component reuse** — the UI component files (e.g., `envelope.ui.lua`, `filter.ui.lua`) are self-contained and can be loaded via `ref` in the embed containers. They work identically under the retained system.

---

## Risks and Gotchas

### Dropdown Overlays

The avsamplerDOCKING behavior explicitly calls `setDropdownOverlayRoot()` for every dropdown to ensure popups render inside the correct embed panel. This is **critical** because the embed container is invisible/fake-sized, and without overriding the root, dropdowns render at the root level (or inside the hidden embedHost), causing invisible popups.

**Mitigation:** Every dropdown used in a retained panel must have its overlay root set to the embed container. The avsamplerDOCKING approach:
```lua
setDropdownOverlayRoot(ctx.widgets.effectSelect, ctx.widgets.effectEmbed)
```

### Module Component Overrides

The existing `rack_container.lua` uses `componentOverrides` to inject style overrides into child components (e.g., forcing transparent backgrounds on the envelope component). Under ImGui, these overrides still work because they're part of the retained widget tree — but the overrides map keys by component ID, and those IDs must match.

### Performance

`imguiRetainedPanel()` renders into an offscreen surface and blits it to ImGui. For the rack area with 9+ module shells, you get 9+ offscreen renders per frame. The avsamplerDOCKERING approach mitigates this by grouping modules into fewer embed panels (e.g., one embed panel for the entire rack, with sub-layout done by ImGui child windows).

**Recommended approach:** One retained panel per dock window, not per module shell. Layout inside the dock window is handled by ImGui child windows or ImGui's own layout.

### Module Drag-and-Drop

The existing drag-and-drop in MidiSynth uses retained node mouse events. Under ImGui, you have two options:
1. **ImGui-native drag** — use `imguiButton`/`imguiSelectable` with drag-source/sink. Simpler but loses retained widget rendering.
2. **Hybrid drag** — detect drag start from retained node mouse events, then show an ImGui floating window for the drag ghost. The avsamplerDOCKERING shows context menus via ImGui but doesn't do drag-and-drop of modules.

**Recommendation:** Use ImGui-native drag-and-drop (option 1) for palette-to-rack placement. The drag source is an ImGui button in the palette, and the drop target is an ImGui child window in the rack. This avoids the complexity of translating coordinates between the two rendering systems.

### Coordinate System

Retained nodes use `math.floor()` based integer coordinates. ImGui uses floats. When calling `setBounds()` on embed containers, always `math.floor()` the ImGui `imguiGetContentRegionAvail()` values:

```lua
local avail = imguiGetContentRegionAvail()
setBounds(ctx.widgets.myEmbed, 0, 0,
          math.floor(avail.x), math.floor(avail.y))
```

---

## Reference: avsamplerDOCKING as Blueprint

The avsamplerDOCKING project provides the complete working pattern. Key reference points in `ui/behaviors/main.lua`:

| Line | Pattern | Use |
|------|---------|-----|
| `setOnImGuiFrame` | L3527-3528 | Entry point for ImGui rendering |
| `renderFrame()` | L3063-3112 | Creates dockspace + calls all renderPanel functions |
| `split()` helper | L2599-2602 | Splits dock nodes with hidden tab bars |
| `buildDeckLayout()` | L1454-1472 | Docks 5 windows into a tree |
| `renderSourcesPanel()` | L2616-2683 | Nested dock tree inside a dock window (sub-docking) |
| `renderEmbeddedPanel()` | L2832-2843 | Generic retained panel embedding |
| `setDropdownOverlayRoot()` | L3445+ | Fixes dropdown popup positioning |
| `imguiRetainedPanel()` | L2640, etc. | The core embedding call |
| `imguiBegin()` + `imguiEnd()` | L2655-2658 | Dock window wrapping |
| `DOCK_WINDOWS` array | L68-75 | Describes dock windows |
| `ctx._dockSuffix` | L3523-3525 | Unique ID per instance to avoid ImGui ID collisions |
| `ctx._rebuildDockTree` flag | L3100-3111 | Triggers dock tree rebuild on preset change |
| `imguiDockBuilderRemoveNode()` | L2594-2595 | Required before rebuild to avoid orphaned nodes |
| `imguiDockNodeFlags_HiddenTabBar` | L2600-2602 | Prevents tab bars from cluttering dock windows |

---

## Immediate Next Steps

1. Create `UserScripts/projects/MainImGui/` with the minimal project skeleton
2. Port `M.init()` — embed containers, MIDI setup, VoiceManager, modulation
3. Write `renderFrame()` — dockspace + dock tree
4. Write `renderRackPanel()` — the biggest section, needs all module shells as embed panels
5. Verify one complete section works (e.g., ADSR + oscillator)
6. Iterate: add palette, keyboard, waveform, MIDI param rack
7. Wire up drag-and-drop for the palette
