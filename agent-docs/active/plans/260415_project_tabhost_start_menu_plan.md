# Project TabHost + Start Menu — Implementation Plan

## Status

**Status:** Planning / Architecture Definition  
**Date:** 2026-04-15  
**Risk Level:** Medium-High  
**Dependencies:** None (self-contained within UI shell, widget library, and ImGui rendering layer)

This document captures the architectural direction for moving the Manifold shell away from an implicit "all-discovered-projects-loaded" tab bar model toward an explicit "open projects" tab model, backed by a Start Menu-style project launcher in the shared shell header.

---

## 1. Core Purpose

The current shell behavior unconditionally populates the project tab bar with every discoverable project found by `listUiScripts()`. This happens in `shell:refreshMainUiTabs()`, which rebuilds the tab list directly from the filesystem scan on every layout pass and state update. When many projects exist in the user scripts directory, system projects directory, or development directory, the tab bar becomes unwieldy. There is no mechanism to close tabs, no concept of an "open but not currently focused" project set, and no dedicated UI for discovering or loading projects contextually.

The rework introduces four architectural changes:

1. **Explicit open-project list** — the tab host only shows projects the user has explicitly opened.
2. **Closeable tabs** — each tab gains an X affordance that removes the project from the open set.
3. **Start Menu** — a main menu bar in `sharedShell` provides project loading, recent projects, default projects, and file browsing.
4. **Decoupled discovery from open state** — `listUiScripts()` remains the catalog API, but it no longer directly drives the tab bar.

---

## 2. What Was Discussed

### 2.1 The Tab Host Problem

`ProjectTabHost` (defined in `manifold/ui/widgets/project_tabhost.lua`) extends `TabHost` (`manifold/ui/widgets/tabhost.lua`). Unlike a normal `TabHost`, which stores widget pages and toggles visibility, `ProjectTabHost` stores metadata pages:

```lua
{
    id = "ui:/path/to/project.lua",
    title = "Project",
    path = "/path/to/project.lua",
    isSystem = false,
    isOverlay = false,
}
```

When a tab is selected, `ProjectTabHost:setActiveIndex()` calls `switchUiScript(targetPath)` to load the project. It does not toggle widget visibility because projects are not widgets — they are standalone UI scripts loaded by the C++ engine.

The tab bar is populated by `shell:refreshMainUiTabs()` in `manifold/ui/shell/methods_core.lua`:

```lua
function shell:refreshMainUiTabs(force)
    local currentUiPath = getCurrentScriptPath and getCurrentScriptPath() or ""
    local cache = self._projectTabsCache
    local projectTabs = nil

    if not force and type(cache) == "table" and cache.currentUiPath == currentUiPath and type(cache.projectTabs) == "table" then
        projectTabs = cache.projectTabs
    else
        local uiScripts = listUiScripts and listUiScripts() or {}
        projectTabs = {}
        local seenUiIds = {}
        for i = 1, #uiScripts do
            local s = uiScripts[i]
            if type(s) == "table" and type(s.path) == "string" and s.path ~= "" then
                local name = (s.name and s.name ~= "") and s.name or fileStem(s.path)
                if not scriptLooksSettings(name, s.path) then
                    local tabId = "ui:" .. s.path
                    if not seenUiIds[tabId] then
                        seenUiIds[tabId] = true
                        projectTabs[#projectTabs + 1] = {
                            id = tabId,
                            title = name,
                            kind = "ui-script",
                            path = s.path,
                            isSystem = false,
                        }
                    end
                end
            end
        end
        -- fallback current project insertion ...
        self._projectTabsCache = { currentUiPath = currentUiPath, projectTabs = projectTabs }
    end

    if self.projectTabHost then
        self.projectTabHost:setProjectTabs(projectTabs)
        if currentUiPath ~= "" then
            self.projectTabHost:setActiveByPath(currentUiPath)
        end
    end
end
```

Because `refreshMainUiTabs()` rebuilds from `listUiScripts()` every time, there is no durable "open projects" concept. If a user were to remove a tab, it would simply reappear on the next `refreshMainUiTabs()` call, which is triggered from `shell:onStateChanged()` and `shell:layout()`.

### 2.2 The Shared Shell vs. Tab Bar Relationship

A critical architectural observation is that `sharedShell` (`shell.panel`) is **not** the parent of the project tab bar. In `manifold/ui/ui_shell.lua`, `Shell.create()` creates both as siblings under the same `parentNode`:

```lua
shell.panel = W.Panel.new(parentNode, "sharedShell", { ... })
-- ... knobs, buttons, labels inside panel ...
shell.projectTabHost = W.ProjectTabHost.new(parentNode, "projectTabHost", {
    tabBarHeight = 26,
    tabGap = 4,
    tabPadding = 12,
    tabSizing = "fill",
    -- ...
})
```

This means the Start Menu must live inside `shell.panel` (the header bar), while the tab bar remains a separate widget below it. The two are spatially adjacent but structurally independent.

### 2.3 The Start Menu Vision

The `sharedShell` header will gain an ImGui main menu bar rendered via a new `onImGuiFrame` callback on its root `RuntimeNode`. The menu structure is:

```
Projects
├── Default Projects
│   ├── [System Project A]
│   ├── [System Project B]
│   └── ...
├── Recent Projects
│   ├── [Recently Opened A]
│   └── ...
├── ────────────────
├── Browse Projects...
└── Open from File...
```

**Default Projects:** A quick-access subset of `listUiScripts()`, typically system projects and any curated featured projects. This gives immediate access to the projects that would previously have been "always visible" in the tab bar.

**Recent Projects:** Dynamically tracked as the user opens projects via the menu or tab bar. Persisted across sessions.

**Browse Projects:** Opens an ImGui modal popup containing a scrollable list of all projects returned by `listUiScripts()`. Selecting one adds it to the open set.

**Open from File:** Launches a native async file chooser (to be added) for selecting a `.lua` file or a `manifold.project.json5` manifest.

### 2.4 The Close Button Design

Close buttons belong in the base `TabHost` class, not just `ProjectTabHost`. This keeps the widget library consistent and allows any future tab host to opt into closeable tabs.

In `TabHost`, the tab rect computation (`_computeTabRects`) produces an array of `{x, y, w, h}` for each visible tab. The retained-mode display list (`setStyleAndDisplay`) and the canvas `onDraw` path both draw the tab background and label. A close affordance will be added as a small sub-rectangle on the right side of each tab (approximately 14–16 px wide), with the label shortened to avoid overlap.

Mouse handling in `TabHost:onMouseDown()` currently iterates `_tabRects` and activates any tab under the cursor. It will be extended to detect clicks inside the close sub-region and fire a configurable `onTabClose` callback instead of activating the tab.

`ProjectTabHost` will pass `showCloseButton = true` in its constructor and wire `onTabClose` to `shell:closeProject(path)`.

### 2.5 The Open Projects State Model

The fundamental shift is making `shell.openProjects` the source of truth for what appears in the tab bar.

**Current model:**
- Source of truth: `listUiScripts()` (filesystem scan)
- Tab bar: implicit reflection of the filesystem
- User control: none (cannot close, cannot keep empty)

**New model:**
- Source of truth: `shell.openProjects` (Lua table of explicitly opened projects)
- Catalog: `listUiScripts()` (used only by the Start Menu)
- Tab bar: explicit reflection of `shell.openProjects`
- User control: open via Start Menu, close via X, switch via tab click

On startup, `shell.openProjects` is seeded with exactly one entry: the current project (from `getCurrentScriptPath()`). If no current project exists, it starts empty.

### 2.6 The ImGui Frame Hook Gap

Manifold already renders its entire UI through ImGui in `imgui-direct` mode (`ImGuiDirectHost`). However, there is currently **no** Lua-accessible callback that runs inside the ImGui frame loop. Lua widgets can only:

1. Compile retained display lists (`node:setOnDraw()`, `node:setDisplayList()`)
2. Use raw OpenGL callbacks (`node:setOnGLRender()`) — only valid when the node has an OpenGL surface

There is no `node:setOnImGuiFrame()` that would allow Lua to call `ImGui::BeginMainMenuBar()`, `ImGui::BeginMenu()`, etc. during the frame.

This means the Start Menu requires:
- Adding `onImGuiFrame` to `RuntimeNode::CallbackSlots`
- Binding `node:setOnImGuiFrame(fn)` in `LuaRuntimeNodeBindings`
- Invoking the callback inside `ImGuiDirectHost::renderOpenGL()` between `ImGui::NewFrame()` and `ImGui::Render()`
- Exposing a minimal Dear ImGui API to Lua (menu bar, menus, menu items, popups, selectables, buttons, text)

### 2.7 The File Chooser Gap

The C++ side currently has `showDirectoryChooser()` in `ILuaControlState` and `LuaEngine`, but there is **no** file chooser for selecting individual files. The Start Menu's "Open from File..." option needs an async file picker that can filter for `.lua` and `.json5` files.

This requires:
- Adding `showFileChooser()` to `ILuaControlState`
- Implementing it in `LuaEngine` with `juce::FileChooser`
- Exposing it to Lua via `LuaControlBindings`

### 2.8 Recent Projects Persistence

`Settings` (`manifold/primitives/core/Settings.h`) is not the right home for recent projects. It currently persists only core configuration: OSC ports, default UI script, and script directories.

Recent projects will be stored separately. The implementing agent may choose either:
- A dedicated C++ singleton (e.g., `RecentProjects`) that reads/writes a JSON file in the config directory
- A Lua-managed JSON file written via existing `writeTextFile` / `readTextFile` bindings

Either way, the runtime source of truth is `shell.recentProjects`, and it must survive application restarts.

---

## 3. Core Files to Touch

### UI Widget / Shell Files
- `manifold/ui/widgets/tabhost.lua` — add optional close-button rendering in retained and canvas paths; add close-hit detection in `onMouseDown`; add `onTabClose` hook
- `manifold/ui/widgets/project_tabhost.lua` — enable `showCloseButton` in config; wire `onTabClose` to shell close method
- `manifold/ui/ui_shell.lua` — initialize `shell.openProjects`, `shell.recentProjects`, `shell.defaultProjects`; attach `onImGuiFrame` to `shell.panel.node`
- `manifold/ui/shell/methods_core.lua` — rewrite `refreshMainUiTabs()` to sync from `shell.openProjects`; add `shell:openProject()`, `shell:closeProject()`, `shell:loadProjectFromFile()`
- `manifold/ui/shell/methods_layout.lua` — verify layout math still accounts correctly for tab bar height when tab count changes

### C++ Engine / Binding Files
- `manifold/primitives/ui/RuntimeNode.h` — add `sol::function onImGuiFrame` to `CallbackSlots`
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp` — bind `setOnImGuiFrame()` for RuntimeNode
- `manifold/ui/imgui/ImGuiDirectHost.cpp` — invoke `onImGuiFrame` callbacks during the ImGui frame loop (between `NewFrame()` and `Render()`)
- `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` — add ImGui API bindings (`imguiBeginMainMenuBar`, `imguiBeginMenu`, `imguiMenuItem`, `imguiBeginPopupModal`, etc.)
- `manifold/primitives/scripting/ILuaControlState.h` — add `showFileChooser()` pure virtual
- `manifold/primitives/scripting/LuaEngine.h` — declare `showFileChooser()`
- `manifold/primitives/scripting/LuaEngine.cpp` — implement `showFileChooser()` using `juce::FileChooser`

### Persistence (TBD by implementer)
- Either a new C++ class (e.g., `manifold/primitives/core/RecentProjects.h/.cpp`) or a Lua-side file in `manifold/ui/shell/` for reading/writing recent projects

---

## 4. Descriptive Outline of Work

### 4.1 Close Buttons in `TabHost`

**Current constructor:**
```lua
function TabHost.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), TabHost)
    self._activeIndex = math.floor(tonumber(config.activeIndex or config.selected or 1) or 1)
    self._tabBarHeight = math.max(18, math.floor(tonumber(config.tabBarHeight or 26) or 26))
    -- ... no close button concept
    return self
end
```

**New constructor addition:**
```lua
    self._showCloseButton = config.showCloseButton == true
    self._closeButtonWidth = math.max(14, math.floor(tonumber(config.closeButtonWidth or 16) or 16))
    self._onTabClose = config.on_tab_close or config.onTabClose
```

**Current rendering (retained path, `setStyleAndDisplay`):**
```lua
        display[#display + 1] = {
            cmd = "drawText",
            x = r.x + 6,
            y = r.y,
            w = math.max(0, r.w - 12),
            h = r.h,
            color = active and host._activeTextColour or host._textColour,
            text = label,
            fontSize = 12.0,
            align = "center",
            valign = "middle",
        }
```

**New rendering:**
- If `showCloseButton` is true, reduce label width by `_closeButtonWidth`.
- Add a second `drawText` command for the "×" glyph inside the close region.
- The close region occupies `r.x + r.w - closeW` to `r.x + r.w`.

**Current mouse handling (`onMouseDown`):**
```lua
function TabHost:onMouseDown(mx, my)
    if my < 0 or my > self._tabBarHeight then return end
    for visualIndex = 1, #self._tabRects do
        local r = self._tabRects[visualIndex]
        if mx >= r.x and mx <= (r.x + r.w) and my >= r.y and my <= (r.y + r.h) then
            local actualIndex = self._visibleTabOrder[visualIndex] or visualIndex
            self:setActiveIndex(actualIndex)
            return
        end
    end
end
```

**New mouse handling:**
- After confirming the hit tab, check if `mx >= (r.x + r.w - self._closeButtonWidth)`.
- If so, and `self._onTabClose` exists, call `self._onTabClose(actualIndex, page.id)` and return.
- Otherwise proceed to `setActiveIndex` as before.

### 4.2 `ProjectTabHost` Integration

In `manifold/ui/ui_shell.lua`, the `ProjectTabHost` is created with:

```lua
shell.projectTabHost = W.ProjectTabHost.new(parentNode, "projectTabHost", {
    tabBarHeight = 26,
    tabGap = 4,
    tabPadding = 12,
    tabSizing = "fill",
    -- ... colours ...
    on_before_switch = function(targetPath, currentPath, isSystem)
        -- hook called before project switch
    end,
})
```

**Addition:**
```lua
    showCloseButton = true,
    onTabClose = function(index, tabId)
        local page = shell.projectTabHost:getProjectInfo(index)
        if page and page.path then
            shell:closeProject(page.path)
        end
    end,
```

### 4.3 Open Projects as Source of Truth

**Current `refreshMainUiTabs` logic:**
```lua
function shell:refreshMainUiTabs(force)
    local currentUiPath = getCurrentScriptPath and getCurrentScriptPath() or ""
    local projectTabs = nil
    -- ... cache check ...
    local uiScripts = listUiScripts and listUiScripts() or {}
    projectTabs = {}
    -- ... iterate all uiScripts, append to projectTabs ...
    self._projectTabsCache = { currentUiPath = currentUiPath, projectTabs = projectTabs }
    if self.projectTabHost then
        self.projectTabHost:setProjectTabs(projectTabs)
        self.projectTabHost:setActiveByPath(currentUiPath)
    end
end
```

**New `refreshMainUiTabs` logic:**
- The function still computes `currentUiPath`.
- Instead of building `projectTabs` from `listUiScripts()`, it builds from `self.openProjects`.
- If `self.openProjects` is empty and `currentUiPath ~= ""`, it seeds with exactly one entry for the current project (this is a safety net for first load before the Start Menu is used).
- `listUiScripts()` is no longer called here.

**Initialization in `Shell.create`:**
```lua
shell.openProjects = {}
shell.recentProjects = {}
shell.defaultProjects = {}
shell.projectBrowserOpen = false
```

**Startup seeding (after `Shell.create` returns, or inside `publishUiStateToGlobals`):**
```lua
local currentPath = getCurrentScriptPath and getCurrentScriptPath() or ""
if currentPath ~= "" then
    shell.openProjects = {
        {
            id = "ui:" .. currentPath,
            title = fileStem(currentPath),
            kind = "ui-script",
            path = currentPath,
            isSystem = false,
        }
    }
end
```

### 4.4 Shell Methods: Open / Close / Browse

**`shell:openProject(path)`**
- Iterate `self.openProjects`. If a matching `path` is found, activate it via `self.projectTabHost:setActiveByPath(path)` and return.
- Resolve display name: if `path` ends with `manifold.project.json5`, attempt to read the manifest (or just use `fileStem(path)` as fallback).
- Append new entry to `self.openProjects`.
- Add to recent list (deduplicate, move to front, trim to max length).
- Call `switchUiScript(path)`.
- Call `self:refreshMainUiTabs(true)`.
- Persist recent projects.

**`shell:closeProject(path)`**
- Find and remove the entry from `self.openProjects`.
- If the removed project was the active one:
  - If another project remains in `self.openProjects`, switch to it via `switchUiScript()`.
  - If none remain, the tab bar becomes empty. The currently loaded UI script continues to run until the user opens another project (this avoids a jarring blank screen).
- Call `self:refreshMainUiTabs(true)`.

**`shell:loadProjectFromFile()`**
- Call the new `showFileChooser()` global with filters `"*.lua;*.json5;manifold.project.json5"`.
- In the callback, if a path is selected, call `self:openProject(selectedPath)`.

### 4.5 ImGui Frame Hook (`onImGuiFrame`)

**C++ side — `RuntimeNode.h`:**
```cpp
struct CallbackSlots {
    // ... existing callbacks ...
    sol::function onImGuiFrame;
};
```

**C++ side — `LuaRuntimeNodeBindings.cpp`:**
```cpp
"setOnImGuiFrame",
[&engine](RuntimeNode& node, sol::function fn) {
    setCallbackSlot(node, fn,
        [](RuntimeNode::CallbackSlots& slots, sol::function value) { slots.onImGuiFrame = value; },
        [](RuntimeNode::CallbackSlots& slots) { slots.onImGuiFrame = sol::lua_nil; });
}
```

**C++ side — `ImGuiDirectHost.cpp`:**
Inside `renderOpenGL()`, after `ImGui::NewFrame()` and during the live tree traversal, each visible node with a valid `onImGuiFrame` callback must have it invoked. The safest place is inside `renderLiveNodeRecursive`, after pushing any clip rect and drawing the background, but before drawing children. Alternatively, it can be invoked immediately after `NewFrame()` by walking the live root separately. The key constraint is that it must run between `NewFrame()` and `Render()`.

Because the callback is immediate-mode, it should probably be called with the node's screen bounds available, but Lua can query `node:getBounds()` if needed. For the Start Menu, `shell.panel` fills the top header, so the menu bar will naturally appear at the top of the viewport.

### 4.6 ImGui Menu API Bindings

A minimal subset of Dear ImGui must be exposed to Lua. These should be registered in `LuaControlBindings::registerUtilityBindings` (or a new dedicated function called from it).

Proposed flat global names (matching the existing pattern of flat globals like `switchUiScript`, `listUiScripts`, etc.):

```cpp
lua["imguiBeginMainMenuBar"] = []() -> bool { return ImGui::BeginMainMenuBar(); };
lua["imguiEndMainMenuBar"]   = []() { ImGui::EndMainMenuBar(); };
lua["imguiBeginMenuBar"]     = []() -> bool { return ImGui::BeginMenuBar(); };
lua["imguiEndMenuBar"]       = []() { ImGui::EndMenuBar(); };
lua["imguiBeginMenu"]        = [](const char* label, bool enabled) -> bool { return ImGui::BeginMenu(label, enabled); };
lua["imguiEndMenu"]          = []() { ImGui::EndMenu(); };
lua["imguiMenuItem"]         = [](const char* label, sol::optional<const char*> shortcut, sol::optional<bool> selected, sol::optional<bool> enabled) -> bool {
    return ImGui::MenuItem(label, shortcut.value_or(nullptr), selected.value_or(false), enabled.value_or(true));
};
lua["imguiSeparator"]        = []() { ImGui::Separator(); };
lua["imguiOpenPopup"]        = [](const char* id) { ImGui::OpenPopup(id); };
lua["imguiBeginPopup"]       = [](const char* id) -> bool { return ImGui::BeginPopup(id); };
lua["imguiBeginPopupModal"]  = [](const char* id, sol::optional<int> flags) -> bool { return ImGui::BeginPopupModal(id, nullptr, flags.value_or(0)); };
lua["imguiEndPopup"]         = []() { ImGui::EndPopup(); };
lua["imguiCloseCurrentPopup"]= []() { ImGui::CloseCurrentPopup(); };
lua["imguiSelectable"]       = [](const char* label, sol::optional<bool> selected, sol::optional<int> flags, sol::optional<float> w, sol::optional<float> h) -> bool {
    return ImGui::Selectable(label, selected.value_or(false), flags.value_or(0), ImVec2(w.value_or(0), h.value_or(0)));
};
lua["imguiButton"]           = [](const char* label, sol::optional<float> w, sol::optional<float> h) -> bool {
    return ImGui::Button(label, ImVec2(w.value_or(0), h.value_or(0)));
};
lua["imguiText"]             = [](const char* text) { ImGui::TextUnformatted(text); };
```

These are thin passthroughs. They must only be called inside an active `onImGuiFrame` callback; otherwise ImGui will assert. This is acceptable because the only caller will be the Start Menu callback.

### 4.7 Start Menu UI in `sharedShell`

In `manifold/ui/ui_shell.lua`, after `shell.panel` is created:

```lua
shell.panel.node:setOnImGuiFrame(function(node)
    if type(imguiBeginMainMenuBar) ~= "function" then return end

    if imguiBeginMainMenuBar() then
        if imguiBeginMenu("Projects", true) then
            -- Default Projects
            if imguiBeginMenu("Default Projects", true) then
                for _, p in ipairs(shell.defaultProjects or {}) do
                    if imguiMenuItem(p.title) then
                        shell:openProject(p.path)
                    end
                end
                imguiEndMenu()
            end

            -- Recent Projects
            local recentEnabled = type(shell.recentProjects) == "table" and #shell.recentProjects > 0
            if imguiBeginMenu("Recent Projects", recentEnabled) then
                for _, p in ipairs(shell.recentProjects or {}) do
                    if imguiMenuItem(p.title) then
                        shell:openProject(p.path)
                    end
                end
                imguiEndMenu()
            end

            imguiSeparator()

            if imguiMenuItem("Browse Projects...") then
                shell.projectBrowserOpen = true
                imguiOpenPopup("ProjectBrowser")
            end

            if imguiMenuItem("Open from File...") then
                shell:loadProjectFromFile()
            end

            imguiEndMenu()
        end
        imguiEndMainMenuBar()
    end

    -- Browse Projects Modal
    if shell.projectBrowserOpen then
        imguiOpenPopup("ProjectBrowser")
    end
    if type(imguiBeginPopupModal) == "function" and imguiBeginPopupModal("ProjectBrowser", 0) then
        local catalog = (type(listUiScripts) == "function" and listUiScripts()) or {}
        for _, s in ipairs(catalog) do
            if type(s) == "table" and s.name then
                if imguiSelectable(s.name, false, 0, 0, 0) then
                    shell:openProject(s.path)
                    shell.projectBrowserOpen = false
                    imguiCloseCurrentPopup()
                end
            end
        end
        if imguiButton("Close", 120, 0) then
            shell.projectBrowserOpen = false
            imguiCloseCurrentPopup()
        end
        imguiEndPopup()
    end
end)
```

**Default Projects population:**
- After shell creation, populate `shell.defaultProjects` from a filtered slice of `listUiScripts()`. A reasonable default filter is all entries where `scope == "system"` or `scope == "project"`, giving quick access to built-in and installed projects without requiring manual curation.

### 4.8 File Chooser Binding

**`ILuaControlState.h` addition:**
```cpp
virtual void showFileChooser(const std::string& title,
                              const std::string& initialPath,
                              const std::string& filePatterns,
                              sol::function callback) = 0;
```

**`LuaEngine.cpp` implementation:**
Mirror the existing `showDirectoryChooser` implementation, but use:
```cpp
auto chooser = std::make_unique<juce::FileChooser>(
    juce::String(title),
    initialDir,
    juce::String(filePatterns),
    true,
    false
);
chooser->launchAsync(
    juce::FileBrowserComponent::canSelectFiles | juce::FileBrowserComponent::openMode,
    [cb, chooserPtr = chooser.get()](const juce::FileChooser& fc) mutable {
        // ... callback with selected file path ...
    }
);
chooser.release();
```

**`LuaControlBindings.cpp` exposure:**
```cpp
lua["showFileChooser"] = [&state](const std::string& title,
                                   const std::string& initialPath,
                                   const std::string& filePatterns,
                                   sol::function callback) {
    state.showFileChooser(title, initialPath, filePatterns, callback);
};
```

### 4.9 Recent Projects Persistence

**Approach A (C++ singleton):**
- New files: `manifold/primitives/core/RecentProjects.h` and `.cpp`
- Reads/writes `~/.config/Manifold/recent_projects.json` (or repo-local equivalent `.manifold.recent.json`)
- Methods: `getRecentProjects()`, `addRecentProject(path)`, `clearRecentProjects()`
- Exposed to Lua as globals: `getRecentProjects()`, `addRecentProject(path)`, `clearRecentProjects()`

**Approach B (Lua-managed file):**
- New file: `manifold/ui/shell/recent_projects.lua`
- Uses `readTextFile()` and `writeTextFile()` (or JSON helpers if available)
- Path resolved via `getSpecialLocation` equivalent, or hardcoded relative to user home

**Decision:** The implementer may choose either approach. Approach B is faster to iterate on because it avoids C++ compilation. Approach A is more robust for cross-platform path handling.

Regardless of approach, `shell:openProject()` must call the add function, and `shell` initialization must call the load function.

---

## 5. Integration with Existing Systems

### 5.1 Project Discovery (`listUiScripts`)

`listUiScripts()` in `LuaControlBindings.cpp` scans:
1. `devScriptsDir` for loose `.lua` files
2. `systemProjectsDir` for directories containing `manifold.project.json5`
3. `userScriptsDir` for loose `.lua` files and project directories

It returns `{name, path, kind, scope}` entries. This function remains unchanged. The Start Menu uses it for:
- **Default Projects:** filtered subset (e.g., `scope == "system"` or `scope == "project"`)
- **Browse Projects modal:** full unfiltered list

It is no longer the direct input to `projectTabHost:setProjectTabs()`.

### 5.2 Script Switching (`switchUiScript`)

The existing `switchUiScript(path)` binding (registered in `LuaControlBindings::registerUtilityBindings`) calls `state.setPendingSwitchPath(path)`. The C++ engine (`LuaEngine::setPendingSwitchPath`) picks this up and triggers a script reload on the next frame.

`ProjectTabHost:setActiveIndex()` already calls `switchUiScript(targetPath)` when the user clicks a tab. `shell:openProject()` will also call it when opening a project from the Start Menu. No changes to the underlying switch mechanism are required.

### 5.3 ImGuiDirectHost Render Loop

`ImGuiDirectHost::renderOpenGL()` in `manifold/ui/imgui/ImGuiDirectHost.cpp` currently performs:
1. `ImGui_ImplOpenGL3_NewFrame()`
2. `ImGui::NewFrame()`
3. `renderLiveTree(...)` (draws the RuntimeNode tree)
4. `ImGui::Render()`
5. `ImGui_ImplOpenGL3_RenderDrawData()`

The `onImGuiFrame` callback must be invoked inside step 3 (or between step 2 and step 4) while the ImGui context is active. Because `renderLiveTree` traverses the tree recursively, the most natural integration is to add the invocation inside `renderLiveNodeRecursive` after drawing the node's background and compiled display list, but before drawing children. This ensures that a parent node's menu bar renders before its children, and that clip rects pushed for the node also affect ImGui content if desired.

### 5.4 Overlay System

Manifold supports overlay scripts (e.g., Settings) via `closeOverlay()` and `isOverlayActive()`. Overlays are loaded as additional RuntimeNode trees on top of the base project. The `sharedShell` (`shell.panel`) is part of the base tree, not the overlay tree.

Because the Start Menu lives in `shell.panel`, it will remain visible and interactive even when an overlay is active. This is desirable — the user should still be able to switch projects or browse projects while a settings overlay is open. The overlay's own ImGui windows (if any) will stack on top naturally due to ImGui's z-order handling.

### 5.5 Existing Retained-Mode Sync

`shell/bindings.lua` contains legacy retained-mode sync code for `mainTabBar` and `mainTabContent`. When `shell.projectTabHost` exists, this code explicitly skips manual tab bar mouse handling and rendering:

```lua
if shell.projectTabHost then
    -- ProjectTabHost is a widget that handles its own display
    -- Just sync legacy mainTabRects for compatibility
    -- ...
    return
end
```

With the new close buttons in `ProjectTabHost`, no changes are needed in `bindings.lua` because `ProjectTabHost` continues to handle its own input and rendering.

---

## 6. Non-Goals for This Work

- Implementing project creation / new-project templates in the Start Menu
- Adding project search / filtering inside the Browse Projects modal (a simple scrollable list is sufficient for now)
- Changing the underlying `listUiScripts()` scanning logic or caching behavior
- Supporting drag-to-reorder tabs
- Adding tab grouping, workspaces, or session snapshots
- Converting the entire shell to an immediate-mode ImGui UI (only the Start Menu uses ImGui directly)
- Replacing `ProjectTabHost` with a different widget class

---

## 7. Success Criteria

- `ProjectTabHost` only shows projects that have been explicitly opened by the user.
- Each tab has a working close button that removes the project from the tab bar.
- Closing the active project switches to another open project if one exists; otherwise the tab bar becomes empty without crashing.
- `sharedShell` renders a main menu bar with a "Projects" dropdown.
- "Default Projects" submenu shows a filtered list of discoverable projects and opens them when clicked.
- "Recent Projects" submenu shows the last N opened projects and opens them when clicked.
- "Browse Projects…" opens a modal popup listing all discoverable projects.
- "Open from File…" opens a native file picker and loads the selected project.
- Recent projects persist across application restarts.
- No regression in existing tab switching behavior.
- No regression in overlay behavior.
- `listUiScripts()` continues to work as a catalog API for other consumers.

---

## 8. Notes on Adjacent Future Work

This architecture enables but does not implement:

- **Pinned tabs:** The `shell.openProjects` table could later support a `pinned` boolean so certain projects survive "Close All" or empty-state behavior.
- **Session restore:** The `openProjects` list could be persisted on exit and restored on launch, bringing the user back to their previous workspace.
- **Project previews / thumbnails:** The Browse Projects modal could display project descriptions, colors, or icons parsed from `manifold.project.json5` metadata.
- **Keyboard shortcuts:** `Ctrl+O` for Open from File, `Ctrl+W` for Close Tab, `Ctrl+Tab` for cycling open projects.
- **Tab drag-reordering:** Requires deeper changes to `TabHost`'s page array and `_visibleTabOrder` logic.
- **Quick switcher:** A fuzzy-search palette (e.g., `Ctrl+P`) that searches `listUiScripts()` and recent projects without opening the menu bar.

The core split — `openProjects` as explicit state, `listUiScripts()` as catalog, and the Start Menu as the primary launcher — supports all of these without requiring further architectural changes.
