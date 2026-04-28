# AVSampler — ImGui Infrastructure Deep Dive

**Date:** 2026-04-28
**Source:** Research into existing `ImGuiDirectHost`, `LuaControlBindings`, `RuntimeNodeRenderer`, `CustomSurfaceProvider` architecture
**Author:** Agent
**Status:** RESEARCH — companion to `260427_avsampler_clip_grid_compositor_plan.md`

---

## 1. Verified Findings

These supersede any assumptions in the parent plan document:

- **`setOnImGuiFrame` exists and works.** It's registered on `RuntimeNode` in `LuaRuntimeNodeBindings.cpp` (line 745). The callback fires inside `invokeOnImGuiFrameRecursive` (`ImGuiDirectHost.cpp:343`), which is called **after** the Canvas runtime overlay renders but **before** `ImGui::Render()`. This means Lua code in the callback can call any ImGui API and it gets added to the same frame's draw data.

- **ImGui Docking is compiled in, but not enabled.** The vendored imgui is the docking branch — `ImGui::DockSpace()`, `DockSpaceOverViewport()`, `DockBuilder*()` are fully implemented. The `ImGuiDirectHost` never sets `io.ConfigFlags |= ImGuiConfigFlags_DockingEnable`. This is a one-line addition.

- **Surface-to-texture resolution is already a working pipeline.** `ImGuiDirectHost::prepareCustomSurfaceTexture()` iterates through registered `CustomSurfaceProvider` instances, calls `provider->prepareTexture(node, w, h, time)`, and returns a `uintptr_t` that is a valid OpenGL texture ID. `ImGui::Image(ImTextureID(handle), size)` works directly.

- **Each `defineSurface({backend = "imgui"})` creates an independent ImGui context.** The `ImGuiDirectHost` creates its own context at construction. Two surfaces cannot share a DockSpace. The plan's single-surface approach is correct.

- **The runtime overlay and onImGuiFrame share the same frame.** The Canvas tree is rendered first into the background "##RuntimeNodeOverlay" window, then `invokeOnImGuiFrameRecursive` runs. So ImGui windows opened from Lua render **on top of** the canvas background, not instead of it.

---

## 2. ImGui Render Loop Architecture

### Frame Sequence (ImGuiDirectHost::renderFrameWithCurrentContext)

```
ImGui::NewFrame()
    │
    ├─ renderLiveTree(overlayDrawList)      ← Canvas background rendering
    │   └─ For each RuntimeNode in tree:
    │       ├─ Draw background/border rects
    │       ├─ Render compiled display lists (widgets)
    │       ├─ Draw surface textures (video, shader, composite)
    │       └─ Recurse into children
    │
    ├─ copyIdMode overlay                    ← Debug overlay
    │
    └─ invokeOnImGuiFrameRecursive(liveRoot) ← LUA HOOK
        └─ For each RuntimeNode in tree:
            ├─ Call slots.onImGuiFrame(lua function)
            └─ Recurse into children

ImGui::Render()
ImGui_ImplOpenGL3_RenderDrawData()
```

**Key insight:** The `onImGuiFrame` callback fires recursively through the entire Canvas tree. Any node in the tree can have a callback. In practice, a single hidden runtime node (e.g., `ctx._imguiHost`) should own the callback to avoid confusion.

### Where the Callback Lives

```cpp
// ImGuiDirectHost.cpp:343-362
void invokeOnImGuiFrameRecursive(RuntimeNode& node) {
    if (!node.isVisible()) return;
    auto& callbacks = node.getCallbacks();
    if (callbacks.onImGuiFrame.valid()) {
        sol::protected_function fn = callbacks.onImGuiFrame;
        auto result = fn(node);
        if (!result.valid()) {
            sol::error err = result;
            fprintf(stderr, "[ImGuiDirectHost] onImGuiFrame error for %s: %s\n",
                    node.getNodeId().c_str(), err.what());
        }
    }
    for (auto* child : node.getChildren()) {
        if (child) invokeOnImGuiFrameRecursive(*child);
    }
}
```

The node's `onImGuiFrame` is called with the node itself as the first argument. This means `self` in Lua refers to the RuntimeNode, not a behavior context. State must be accessed via closure captures or globals.

---

## 3. Existing ImGui Bindings Catalog

All registered in `LuaControlBindings.cpp` starting at line 3703.

### Menu / Menu Bar

| Binding | ImGui Call | Notes |
|---------|-----------|-------|
| `imguiBeginMainMenuBar()` | `ImGui::BeginMainMenuBar()` | Returns bool |
| `imguiEndMainMenuBar()` | `ImGui::EndMainMenuBar()` | — |
| `imguiBeginMenuBar()` | `ImGui::BeginMenuBar()` | Returns bool |
| `imguiEndMenuBar()` | `ImGui::EndMenuBar()` | — |
| `imguiBeginMenu(label, enabled?)` | `ImGui::BeginMenu()` | enabled defaults true |
| `imguiEndMenu()` | `ImGui::EndMenu()` | — |
| `imguiMenuItem(label, shortcut?, selected?, enabled?)` | `ImGui::MenuItem()` | Returns bool (click) |

### Popups

| Binding | ImGui Call | Notes |
|---------|-----------|-------|
| `imguiOpenPopup(id)` | `ImGui::OpenPopup()` | String ID |
| `imguiBeginPopup(id)` | `ImGui::BeginPopup()` | Returns bool |
| `imguiBeginPopupModal(id, flags?)` | `ImGui::BeginPopupModal()` | Returns bool |
| `imguiEndPopup()` | `ImGui::EndPopup()` | — |
| `imguiCloseCurrentPopup()` | `ImGui::CloseCurrentPopup()` | — |

### Widgets

| Binding | ImGui Call | Notes |
|---------|-----------|-------|
| `imguiSelectable(label, selected?, flags?, w?, h?)` | `ImGui::Selectable()` | Returns bool |
| `imguiButton(label, w?, h?)` | `ImGui::Button()` | Returns bool |
| `imguiText(text)` | `ImGui::TextUnformatted()` | No formatting |
| `imguiSeparator()` | `ImGui::Separator()` | — |

### Layout

| Binding | ImGui Call | Notes |
|---------|-----------|-------|
| `imguiSameLine(offset?, spacing?)` | `ImGui::SameLine()` | Both optional |
| `imguiGetContentRegionAvail()` | Returns `{x, y}` table | Lua table |
| `imguiSetNextWindowSize(w, h, cond?)` | `ImGui::SetNextWindowSize()` | cond defaults Appearing |
| `imguiSetNextWindowPos(x, y, cond?)` | `ImGui::SetNextWindowPos()` | — |

### Style

| Binding | ImGui Call | Notes |
|---------|-----------|-------|
| `imguiPushStyleColor(idx, r, g?, b?, a?)` | `ImGui::PushStyleColor()` | Accepts float4 or uint32 ARGB |
| `imguiPopStyleColor(count?)` | `ImGui::PopStyleColor()` | count defaults 1 |

### Constants

| Binding | Value |
|---------|-------|
| `imguiCond_None` | `ImGuiCond_None` |
| `imguiCond_Always` | `ImGuiCond_Always` |
| `imguiCond_Appearing` | `ImGuiCond_Appearing` |
| `imguiWindowFlags_NoResize` | `ImGuiWindowFlags_NoResize` |
| `imguiWindowFlags_NoMove` | `ImGuiWindowFlags_NoMove` |
| `imguiWindowFlags_NoCollapse` | `ImGuiWindowFlags_NoCollapse` |
| `imguiWindowFlags_NoScrollbar` | `ImGuiWindowFlags_NoScrollbar` |
| `imguiColorFlags_None` | `ImGuiColorEditFlags_None` |

---

## 4. ImGui Bindings Gap Analysis

These are the bindings needed for the AVSampler clip grid + compositor + param viewer. Listed by priority.

### Tier 1 — Foundation (required for any ImGui windowing)

#### `imguiBegin(title, flags?)` / `imguiEnd()`

```cpp
lua["imguiBegin"] = [](const char* title, sol::optional<int> flags) -> bool {
    return ImGui::Begin(title, nullptr, static_cast<ImGuiWindowFlags>(flags.value_or(0)));
};
lua["imguiEnd"] = []() { ImGui::End(); };
```

**Why:** Can't open an ImGui window without Begin/End. Every window in the clip grid, compositor, and param viewer starts with this.

**Open question:** `imguiBegin` with a `p_open` pointer. The C API takes `bool* p_open` for closeable windows. The plan's overlay icons (close button on cells) might want this. If we need closeable windows, we need a `p_open` variant:

```lua
-- Option A: Simple (no close button)
imguiBegin("ClipGrid", imguiWindowFlags_None)

-- Option B: With close button (needs a bool reference)
local open = true
if imguiBegin("ClipGrid", open, 0) then ... end
```

Option B requires a sol wrapper that maintains a bool. Use a Lua-value-pinned approach or just skip close buttons for MVP and add `imguiBeginEx(title, p_open, flags)` later.

**Lines of C++:** ~8

---

#### `imguiBeginChild(id, w?, h?, border?, flags?)` / `imguiEndChild()`

```cpp
lua["imguiBeginChild"] = [](const char* id, sol::optional<float> w,
                            sol::optional<float> h, sol::optional<bool> border,
                            sol::optional<int> flags) -> bool {
    return ImGui::BeginChild(id, ImVec2(w.value_or(0), h.value_or(0)),
                             border.value_or(false),
                             static_cast<ImGuiWindowFlags>(flags.value_or(0)));
};
lua["imguiEndChild"] = []() { ImGui::EndChild(); };
```

**Why:** Scrollable regions inside windows. The clip grid needs to scroll when there are more columns than visible space. The compositor layer list needs to scroll. The param viewer needs per-section scroll.

**Lines of C++:** ~10

---

### Tier 2 — Data Display (the clip grid itself)

#### `imguiBeginTable(id, columns, flags?)` / `imguiEndTable()`

```cpp
lua["imguiBeginTable"] = [](const char* id, int columns,
                            sol::optional<int> flags) -> bool {
    return ImGui::BeginTable(id, columns,
                             static_cast<ImGuiTableFlags>(flags.value_or(0)));
};
lua["imguiEndTable"] = []() { ImGui::EndTable(); };
```

**Why:** The clip grid is a table. Sources in the first row, FX above. ImGui tables support column sizing, row striping, and cell padding natively.

**Lines of C++:** ~8

---

#### `imguiTableNextRow(flags?, minHeight?)` / `imguiTableNextColumn()`

```cpp
lua["imguiTableNextRow"] = [](sol::optional<int> flags,
                               sol::optional<float> minHeight) {
    ImGui::TableNextRow(static_cast<ImGuiTableRowFlags>(flags.value_or(0)),
                        minHeight.value_or(0));
};
lua["imguiTableNextColumn"] = []() -> bool {
    return ImGui::TableNextColumn();
};
```

**Why:** Iterate grid rows and columns. These are the loop body calls.

**Lines of C++:** ~12

---

#### `imguiTableSetupColumn(label, flags?, width?)`

```cpp
lua["imguiTableSetupColumn"] = [](const char* label,
                                   sol::optional<int> flags,
                                   sol::optional<float> width) {
    ImGui::TableSetupColumn(label,
                            static_cast<ImGuiTableColumnFlags>(flags.value_or(0)),
                            width.value_or(0));
};
```

**Why:** Configure column widths before the data loop. Essential for making the grid look right.

**Lines of C++:** ~8

---

#### `imguiTableSetColumnIndex(index)` / `imguiTableGetColumnIndex()`

**Optional** — can use `imguiTableNextColumn()` instead for sequential access. Only needed if we want random-access column selection.

---

### Tier 3 — Widgets (param editing)

#### `imguiSliderFloat(label, value, min, max, format?, flags?)`

```cpp
lua["imguiSliderFloat"] = [](const char* label, float value,
                              float min, float max,
                              sol::optional<const char*> fmt,
                              sol::optional<int> flags) -> sol::object {
    bool changed = ImGui::SliderFloat(label, &value, min, max,
                                       fmt.value_or("%.3f"),
                                       static_cast<ImGuiSliderFlags>(flags.value_or(0)));
    if (changed) return sol::make_object(lua, value);
    return sol::lua_nil;
};
```

**Pattern:** The value is passed by value, modified in place, and returned as a new value if changed. Lua idiomatic:

```lua
local newVal = imguiSliderFloat("Threshold", currentVal, 0, 1)
if newVal ~= nil then currentVal = newVal end
```

**Why:** Param sliders for FX params, compositor opacity, mapping min/max, shader params. This is the most-used param editing widget.

**Lines of C++:** ~15

---

#### `imguiDragFloat(label, value, speed?, min?, max?, format?, flags?)`

Same pattern as SliderFloat but with drag speed instead of min/max range.

**Why:** Fine-grained param editing where exact values matter (e.g., loop start/end positions).

**Lines of C++:** ~12

---

#### `imguiCheckbox(label, value)`

```cpp
lua["imguiCheckbox"] = [](const char* label, bool value) -> sol::object {
    bool changed = ImGui::Checkbox(label, &value);
    if (changed) return sol::make_object(lua, value);
    return sol::lua_nil;
};
```

**Why:** Toggle params (enabled, invert, show skeleton, eye/pin icons).

**Lines of C++:** ~8

---

#### `imguiInputText(label, text, maxLength?)`

```cpp
lua["imguiInputText"] = [](const char* label, const char* text,
                            sol::optional<int> maxLength) -> sol::object {
    std::string buf = text ? text : "";
    buf.resize(maxLength.value_or(256));
    if (ImGui::InputText(label, buf.data(), buf.capacity())) {
        buf.resize(std::strlen(buf.data()));
        return sol::make_object(lua, buf);
    }
    return sol::lua_nil;
};
```

**Why:** Rename clips, enter file paths, sampler names. Less critical for MVP but needed.

**Lines of C++:** ~15

---

### Tier 4 — Dropdowns / Selection

#### `imguiBeginCombo(label, previewValue, flags?)` / `imguiEndCombo()`

```cpp
lua["imguiBeginCombo"] = [](const char* label, const char* previewValue,
                              sol::optional<int> flags) -> bool {
    return ImGui::BeginCombo(label, previewValue,
                              static_cast<ImGuiComboFlags>(flags.value_or(0)));
};
lua["imguiEndCombo"] = []() { ImGui::EndCombo(); };
```

**Why:** Source selection, blend mode selection, FX type selection, compositor tap picker. Used with `imguiSelectable()` inside:

```lua
if imguiBeginCombo("Blend Mode", blendModes[current]) then
    for i, name in ipairs(blendModes) do
        if imguiSelectable(name, i == current) then
            current = i
        end
    end
    imguiEndCombo()
end
```

**Lines of C++:** ~10

---

### Tier 5 — Interaction / Hit Testing

#### `imguiIsItemClicked(button?)` / `imguiIsItemHovered(flags?)`

```cpp
lua["imguiIsItemClicked"] = [](sol::optional<int> button) -> bool {
    return ImGui::IsItemClicked(button.value_or(0));
};
lua["imguiIsItemHovered"] = [](sol::optional<int> flags) -> bool {
    return ImGui::IsItemHovered(static_cast<ImGuiHoveredFlags>(flags.value_or(0)));
};
```

**Why:** Detect clicks on grid cells and compositor layers. `imguiSelectable` has its own click detection, but for custom cell rendering (colored rects with images), we need `IsItemClicked`.

**Note:** These work on the *last* submitted widget. They must be called immediately after the item, before any other ImGui call. This is the standard ImGui pattern and Lua code must respect it.

**Lines of C++:** ~10

---

#### `imguiGetMousePos()` / `imguiGetWindowPos()` / `imguiGetWindowSize()`

```cpp
lua["imguiGetMousePos"] = [&lua]() -> sol::table {
    auto pos = ImGui::GetMousePos();
    auto t = sol::table(lua, sol::create);
    t["x"] = pos.x;
    t["y"] = pos.y;
    return t;
};
```

**Why:** Positioning popup overlays near cells, spawning preview windows at cursor position.

**Lines of C++:** ~25 total for all three

---

### Tier 6 — ID Scoping

#### `imguiPushID(id)` / `imguiPopID()`

```cpp
lua["imguiPushID"] = [](const char* id) { ImGui::PushID(id); };
lua["imguiPopID"] = []() { ImGui::PopID(); };
```

**Why:** When rendering multiple identical widgets in a loop (grid cells, layer rows), ImGui needs unique IDs to distinguish them. `PushID("cell_1_3")` before the cell's widgets, `PopID()` after.

**Lines of C++:** ~4

---

#### `imguiPushStyleVar(idx, value)` / `imguiPopStyleVar(count?)`

```cpp
lua["imguiPushStyleVar_Float"] = [](int idx, float value) {
    ImGui::PushStyleVar(static_cast<ImGuiStyleVar>(idx), value);
};
lua["imguiPushStyleVar_Vec2"] = [](int idx, float x, float y) {
    ImGui::PushStyleVar(static_cast<ImGuiStyleVar>(idx), ImVec2(x, y));
};
lua["imguiPopStyleVar"] = [](sol::optional<int> count) {
    ImGui::PopStyleVar(count.value_or(1));
};
```

**Why:** Per-cell styling (border width, item spacing, frame padding) without global style changes.

**Lines of C++:** ~15

---

### Tier 7 — Surface Image (the critical one)

#### `imguiSurfaceImage(surfaceType, payload, w, h)`

This is the most complex binding because it requires resolving a surface type + payload to a GPU texture handle without having a RuntimeNode to attach it to. The existing pipeline (`prepareCustomSurfaceTexture`) takes a RuntimeNode reference.

**Approach:** Create a temporary surface node, feed it the payload, resolve the texture, draw it, and clean up. Or better: expose a standalone `resolveSurfaceTexture(type, payload, w, h)` that returns a texture ID, plus `imguiImage(textureId, w, h)` that calls `ImGui::Image()`.

```cpp
// Standalone resolver — no RuntimeNode needed
lua["imguiSurfaceImage"] = [this](const char* surfaceType,
                                    sol::table payloadTable,
                                    int width, int height) -> bool {
    // Create a temporary payload descriptor
    CustomRenderPayload payload;
    // <serialize payloadTable into payload>
    
    for (auto& provider : surfaceProviders_) {
        if (provider && provider->handlesType(surfaceType)) {
            // Use a fake stableId (e.g., hash of payload)
            uint64_t fakeId = hashPayload(payload);
            // Create temporary surface data
            SurfaceData data{surfaceType, payload, width, height};
            auto textureId = provider->prepareTexture(data, width, height, currentTime);
            if (textureId != 0) {
                ImGui::Image(ImTextureID(textureId),
                             ImVec2(static_cast<float>(width),
                                    static_cast<float>(height)));
                return true;
            }
        }
    }
    return false;
};
```

**Simpler alternative:** Attach the surface to a hidden RuntimeNode during init, then just update its payload and call `imguiImage(textureId, w, h)` where `textureId` is retrieved from the existing `prepareCustomSurfaceTexture` path.

```lua
-- Alternative: Use a hidden node as texture provider
ctx._surfaceNode:setCustomSurface("video_input", { source = "sampler", samplerId = id })
ctx._surfaceNode:setBounds(0, 0, thumbW, thumbH)

-- Then in onImGuiFrame:
local texId = ctx._surfaceNode:getSurfaceTextureId()  -- new binding
if texId then imguiImage(texId, thumbW, thumbH) end
```

**Lines of C++:** ~30-50 depending on approach

---

#### `imguiImage(textureId, w, h, u0?, v0?, u1?, v1?)`

```cpp
lua["imguiImage"] = [](uint64_t textureId, float w, float h,
                        sol::optional<float> u0, sol::optional<float> v0,
                        sol::optional<float> u1, sol::optional<float> v1) {
    ImGui::Image(ImTextureID(textureId), ImVec2(w, h),
                 ImVec2(u0.value_or(0), v0.value_or(0)),
                 ImVec2(u1.value_or(1), v1.value_or(1)));
};
```

**Lines of C++:** ~10

---

### Tier 8 — Docking

#### `imguiDockSpace(id, size?, flags?)`

```cpp
lua["imguiDockSpace"] = [](uint32_t id, sol::optional<float> w,
                            sol::optional<float> h,
                            sol::optional<int> flags) -> uint32_t {
    return ImGui::DockSpace(static_cast<ImGuiID>(id),
                            ImVec2(w.value_or(0), h.value_or(0)),
                            static_cast<ImGuiDockNodeFlags>(flags.value_or(0)));
};
```

**Why:** The shared dock space that clip grid and param viewer windows snap to.

**Lines of C++:** ~8

---

#### `imguiDockSpaceOverViewport(id?, flags?)`

```cpp
lua["imguiDockSpaceOverViewport"] = [](sol::optional<uint32_t> id,
                                        sol::optional<int> flags) -> uint32_t {
    return ImGui::DockSpaceOverViewport(
        static_cast<ImGuiID>(id.value_or(0)),
        nullptr,
        static_cast<ImGuiDockNodeFlags>(flags.value_or(0)));
};
```

**Why:** Full-viewport dockspace — fill the entire ImGui host window with dockable space.

**Lines of C++:** ~8

---

### Additional Constants to Export

```cpp
// Table flags (for clip grid)
lua["imguiTableFlags_None"] = ImGuiTableFlags_None;
lua["imguiTableFlags_Borders"] = ImGuiTableFlags_Borders;
lua["imguiTableFlags_RowBg"] = ImGuiTableFlags_RowBg;
lua["imguiTableFlags_ScrollX"] = ImGuiTableFlags_ScrollX;
lua["imguiTableFlags_ScrollY"] = ImGuiTableFlags_ScrollY;
lua["imguiTableFlags_SizingFixedFit"] = ImGuiTableFlags_SizingFixedFit;

// Combo flags
lua["imguiComboFlags_None"] = ImGuiComboFlags_None;

// DockNode flags
lua["imguiDockNodeFlags_PassthruCentralNode"] = ImGuiDockNodeFlags_PassthruCentralNode;

// Slider flags
lua["imguiSliderFlags_None"] = ImGuiSliderFlags_None;
lua["imguiSliderFlags_AlwaysClamp"] = ImGuiSliderFlags_AlwaysClamp;

// Hovered flags
lua["imguiHoveredFlags_None"] = ImGuiHoveredFlags_None;
```

---

## 5. Surface Provider Reference

These are the surface types that exist and can be rendered via `imguiSurfaceImage` or the RuntimeNode pipeline.

### `video_input`

| Field | Type | Description |
|-------|------|-------------|
| `version` | int | Payload version (2) |
| `fitMode` | string | `"contain"` or `"cover"` |
| `source` | string | `"live"` for webcam, `"sampler"` for playback |
| `samplerId` | string | Required for `source = "sampler"` |
| `position` | float | Seek position for sampler playback |

**Provider:** `VideoSurfaceProvider`
**Use:** Webcam feed, sampler playback, grid cell thumbnails

---

### `gpu_shader`

| Field | Type | Description |
|-------|------|-------------|
| `layers` | table[] | Array of shader layer configs |
| `layers[].enabled` | bool | Active |
| `layers[].effectId` | string | Effect identifier from `shaders.listEffects()` |
| `layers[].params` | table | Effect param overrides `{ paramId = value }` |
| `fitMode` | string | `"cover"` or `"contain"` |
| `source` | table | Input source config `{ type, sourceId, params }` |

**Provider:** `ShaderSurfaceProvider`
**Use:** FX clip thumbnails (renders source + all previous FX + current FX)

---

### `gpu_composite`

| Field | Type | Description |
|-------|------|-------------|
| `layers` | table[] | Array of compositor layer configs |
| `layers[].sourceType` | string | Surface type for this layer's input |
| `layers[].sourcePayload` | table | Surface payload for this layer's input |
| `layers[].blendMode` | string | Blend mode: `"normal"`, `"add"`, `"screen"`, `"multiply"`, `"overlay"`, `"difference"` |
| `layers[].opacity` | float | 0.0–1.0 |

**Provider:** `CompositeSurfaceProvider`
**Use:** Main composited output, layer previews

---

### `ml_composite`

| Field | Type | Description |
|-------|------|-------------|
| `version` | int | Payload version (1) |
| `fitMode` | string | `"contain"` |
| `modelPath` | string | ONNX model path |
| `gain` | float | Image gain |
| `useSigmoid` | bool | Sigmoid activation |
| `threshold` | float | Segmentation threshold |
| `feather` | float | Edge feather amount |
| `invert` | bool | Invert mask |
| `background` | float | Background fill value |

**Provider:** `MLMaskSurfaceProvider`
**Use:** Segmentation preview, FX clip thumbnails for ML models

---

### `custom_` (generated sources)

| Field | Type | Description |
|-------|------|-------------|
| `sourceId` | string | Generator identifier |
| `params` | table | Generator-specific params |

**Provider:** `GeneratedSourceProvider`
**Use:** Test patterns, color bars, noise sources

---

## 6. Docking Architecture

### Current State

Docking is available but not enabled. The `ImGuiDirectHost.cpp` render loop never sets `ImGuiConfigFlags_DockingEnable`. Adding it:

```cpp
// In ImGuiDirectHost constructor or renderFrameWithCurrentContext init:
auto& io = ImGui::GetIO();
io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;
```

### Plan for AVSampler

The plan calls for one `defineSurface({ backend = "imgui", docking = "fill" })` containing:

```
surface: "avTools"
    ├─ ImGuiWindow: "ClipGrid"       (docks left/center)
    ├─ ImGuiWindow: "ParamViewer"    (docks right)
    └─ ImGuiWindow: "MainOutput"     (docks bottom? or separate surface?)
```

Implementation in the `onImGuiFrame` callback:

```lua
-- Inside onImGuiFrame:
-- Create the dockspace first (before any window using it)
imguiDockSpace(avDockSpaceId, size, imguiDockNodeFlags_PassthruCentralNode)

-- Then windows auto-dock to the space
imguiBegin("ClipGrid")
-- ...grid cells...
imguiEnd()

imguiBegin("ParamViewer")
-- ...param sections...
imguiEnd()
```

The windows dock by default. Users can rearrange them. This is the standard ImGui docking workflow.

### Multi-Surface Concern

The composited output viewport might want to be in its own surface (with `backend = "lua-canvas"`) so it can have its own compositor surface without being behind ImGui windows. But the plan says "main output viewport (composited result) is a Canvas Panel with a `gpu_composite` surface." This lives in the Canvas tree, rendered as the background behind the ImGui overlay. The `DockSpace` with `PassthruCentralNode` allows the central area to show through.

---

## 7. The Hybrid Model — Retained + Immediate

### How They Complement Each Other

The existing `renderLiveNodeRecursive` renders the Canvas tree as ImGui draw commands (rects, rounded corners, images, text) into a fullscreen background window. This is the **retained** part — the Canvas tree is stateful, with styles, children, and display lists that persist across frames.

The `onImGuiFrame` callback runs **after** the canvas render. This is the **immediate** part — every frame runs the same Lua code that opens windows, draws widgets, checks interactions, and updates state.

**They stack.** Canvas renders behind, ImGui windows render on top. Both use the same ImGui draw list and the same OpenGL context.

### What Canvas Still Handles Well

- **Component chrome:** Rounded corners, borders, background fills for individual widgets
- **Compiled display lists:** Complex widget drawing (waveforms, spectra, knob arcs) that benefits from caching
- **Stateful layout:** The retained tree with `setBounds()`, `setVisible()`, z-ordering
- **Surface rendering:** Video feeds, shader outputs, composited results — via `prepareCustomSurfaceTexture` → `AddImage`

### What ImGui Handles Better

- **Window management:** Dragging, docking, resizing, tabbing
- **Tables:** The clip grid with scrollable columns, row striping, sizing
- **Widgets out of the box:** Sliders, drag values, checkboxes, combo boxes, input text
- **Layout:** `SameLine`, `GetContentRegionAvail`, auto-sizing windows
- **Interactivity:** `IsItemClicked`, `IsItemHovered`, `BeginPopup` — all immediate-mode

### The Hybrid in AVSampler

```
ImGui window: "ClipGrid"
    ├─ imguiBeginTable() for the grid
    ├─ Each cell:
    │   ├─ imguiPushID("cell_1_3")
    │   ├─ Canvas surface thumbnail (via imguiSurfaceImage)
    │   ├─ Clip label text (via imguiText)
    │   ├─ Selected highlight border
    │   ├─ imguiIsItemClicked → selection
    │   └─ Right-click → imguiOpenPopup → nested submenu
    └─ imguiEndTable()

ImGui window: "ParamViewer"
    ├─ Current selection section
    ├─ Pinned sections (persistent)
    │   ├─ imguiSliderFloat for params
    │   ├─ imguiCheckbox for toggles
    │   └─ imguiBeginCombo for dropdowns
    └─ Eye-sections (show on selection)

Canvas background: main output viewport
    └─ Canvas Panel with gpu_composite surface
        (rendered behind the ImGui windows)
```

The Canvas tree doesn't disappear. It just gets smaller — the output viewport and any retained-mode widgets live in the Canvas tree, while the clip grid, compositor panel, and param viewer are pure ImGui windows.

---

## 8. Implementation Strategy

### Phase 0: Enable Docking (one line)

Add `io.ConfigFlags |= ImGuiConfigFlags_DockingEnable;` to `ImGuiDirectHost` constructor or the initialization block in `renderFrameWithCurrentContext`.

### Phase 1: Bind Tier 1-4 (all skeleton bindings)

Add all ~20 bindings plus constants in one pass to `LuaControlBindings.cpp`. Test with a throwaway AVSampler surface that opens a dockable window with a table, sliders, and combos.

### Phase 2: Surface Image Resolution

Implement `imguiSurfaceImage` or the `getSurfaceTextureId` approach. This is the only binding that requires integration with the surface provider pipeline — all others are pure ImGui API wrappers.

### Phase 3: Lua Data Model + ImGui Rendering

Build `ctx.clips[][]`, `ctx.layers[]`, selection state. Add `onImGuiFrame` callback on a hidden runtime node. First pass: just the clip grid with hardcoded cells. Second pass: compositor layer stack. Third pass: param viewer with eye/pin.

### Phase 4: Wire Real Data

Connect the clip grid cells to actual surface providers. Shader pipeline for FX cells. Video source for webcam cells. Composite for the output viewport. Sampler integration.

---

## 9. Open Questions

1. **`imguiSurfaceImage` approach:** Does the standalone resolver (create a temporary surface descriptor) work, or do we need a hidden RuntimeNode as texture provider? The hidden-node approach is simpler to implement initially but requires more boilerplate in Lua. The standalone resolver is cleaner for Lua but requires more C++ plumbing.

2. **Docking persistence:** ImGui docking layout is saved/restored via `.ini` files. Each ImGui context has its own `.ini`. For AVSampler, we'd want per-project docking layouts. This means either:
   - Letting ImGui manage its own `.ini` (simplest, but global)
   - Using `ImGui::LoadIniSettingsFromMemory` / `SaveIniSettingsToMemory` to persist per-project state

3. **Composite output as ImGui window vs Canvas background:** The plan says the composited output is a Canvas Panel behind the ImGui overlay. But if we're going pure ImGui, the output could be an ImGui window with an `imguiSurfaceImage` drawing the composited result. This would allow the output to dock alongside the clip grid. **Tradeoff:** Canvas background means output is always visible. ImGui window means output can be docked, hidden, or rearranged. The plan's current stance is Canvas background.

4. **Multiple surfaces vs single surface:** The plan says one surface with DockSpace. The composited output as Canvas background doesn't need its own surface. But if users want preview windows to be movable/resizable independently of the tool windows, preview windows would need to be their own ImGui surfaces. The plan's position is "user-defined preview windows spawn via clip overlay" — these could be additional ImGui surfaces or floating ImGui windows in the same surface.

5. **Canvas interaction and ImGui hit testing:** When ImGui captures mouse/keyboard (`io.WantCaptureMouse`), Canvas doesn't get input. This is already handled by `ImGuiDirectHost`. The hidden runtime node with `onImGuiFrame` needs to be set up so it doesn't interfere with Canvas input handling.

---

## 10. File Change Summary

| File | Change | Lines |
|------|--------|-------|
| `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | Add ~20 ImGui bindings + constants | ~250 |
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | Enable `ImGuiConfigFlags_DockingEnable` | ~1 |
| `manifold/ui/imgui/ImGuiDirectHost.cpp` | Add `imguiSurfaceImage` / `getSurfaceTextureId` resolution hook | ~50 |
| `UserScripts/projects/AVSampler/ui/behaviors/main.lua` | Add `onImGuiFrame` callback, clip grid rendering, compositor layers, param viewer | ~500-800 new |
| `UserScripts/projects/AVSampler/ui/main.ui.lua` | Add hidden runtime node with `setOnImGuiFrame`, simplify Canvas tree | ~50 |
