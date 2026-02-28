# Manifold naming / branding cleanup notes (legacy “Looper” leaks)

Date: 2026-03-03

This doc inventories places where **Manifold** still identifies itself (to the host, UI system, OSC/IPC, filesystem paths, etc.) as **Looper / LooperPrimitives / BehaviorCore**.

The goal is to make naming **more consistent and generic** over time (prefer **Manifold** or a neutral “core/primitives” name), without accidentally breaking:

- existing DAW sessions (plugin IDs / parameter IDs / AU ordering)
- external OSC / OSCQuery / CLI tooling
- user Lua scripts that `require(...)` existing module names
- realtime safety (audio thread constraints)

> Note: parameter exposure work (APVTS/host automation/state) was intentionally deferred to a separate effort.

---

## 1) Host/DAW-facing naming issues (highest priority)

### 1.1 `AudioProcessor::getName()` returns the legacy name

File: `looper_primitives/BehaviorCoreProcessor.h`

- `BehaviorCoreProcessor::getName()` is hardcoded to **"LooperPrimitives"**.
- CMake defines the plugin target as `Manifold` with `PRODUCT_NAME "Manifold"`.

Impact:
- Hosts may display the processor name as “LooperPrimitives” instead of “Manifold”.
- This is analogous to the earlier Tempus “Termus” mismatch (fixed by returning `JucePlugin_Name`).

Recommended fix:
- Return `JucePlugin_Name` (or `JucePlugin_Name`-equivalent) to keep the runtime name aligned with the build system.

---

## 2) UI scripts + widget library naming

### 2.1 Widget library is still named `looper_widgets.lua`

Primary file:
- `looper/ui/looper_widgets.lua`

Observed usage:
- `looper/ui/looper_ui.lua`, `looper/ui/looper_settings_ui.lua`, `looper/ui/looper_donut_demo_ui.lua`, `looper/ui/dsp_live_scripting.lua`, `looper/ui/ui_shell.lua`
- `test_plugins/Tempus/firstloop_ui.lua`

All of these use:

```lua
local W = require("looper_widgets")
```

#### Recommended approach (non-breaking rename)

Rename towards something generic (e.g. `ui_widgets.lua`) without breaking existing scripts:

1) Introduce new canonical module:
   - `looper/ui/ui_widgets.lua` (new)

2) Keep `looper/ui/looper_widgets.lua` as a compatibility shim:

```lua
-- looper_widgets.lua (compat)
return require("ui_widgets")
```

3) Gradually update shipped scripts to `require("ui_widgets")`.

Why this works:
- `LuaEngine` sets Lua `package.path` to include the currently loaded script directory (and an optional shared UI dir), so module lookup remains local to the UI folder.
- A shim preserves backwards compatibility for:
  - user custom scripts
  - old shipped scripts
  - documentation snippets

### 2.2 Duplicate widget library copies exist in Tempus

File(s):
- `test_plugins/Tempus/looper_widgets.lua`

This appears to be a copy of `looper/ui/looper_widgets.lua`.

Decision pending:
- Either keep Tempus self-contained (duplicate copy), or share the canonical widget library across plugins.
- If we introduce `ui_widgets.lua`, Tempus can either:
  - keep shipping its own `looper_widgets.lua` shim + `ui_widgets.lua`, or
  - load from a shared location.

---

## 3) Hardcoded absolute paths (portable build / installed plugin problems)

### 3.1 Manifold editor loads UI script via hardcoded repo path

File: `looper_primitives/BehaviorCoreEditor.cpp`

- Searches for `looper_ui.lua` next to the executable (good), **but also** includes:
  - `/home/shamanic/dev/my-plugin/looper/ui/looper_ui.lua` (hardcoded)

Impact:
- Works on dev machine, breaks for installed artifacts / other machines.

Recommended fix:
- Replace absolute path with a more portable candidate (e.g. CWD-based path like Tempus now uses), or remove it entirely.

### 3.2 Manifold processor loads default DSP script via hardcoded repo path

File: `looper_primitives/BehaviorCoreProcessor.cpp`

- Default DSP script path is hardcoded:
  - `/home/shamanic/dev/my-plugin/looper/dsp/looper_primitives_dsp.lua`

Impact:
- Same portability issue.

Recommended fix:
- Same strategy as UI scripts: check near executable / known install locations / configurable path.

---

## 4) OSC/OSCQuery/IPC naming leaks (public API surface)

These are “shared primitives” but they expose “Looper” naming externally. Changing these is **more invasive** because it can break external tooling.

### 4.1 Unix socket path uses `looper_*.sock`

File: `looper/primitives/control/ControlServer.cpp`

- Socket path: `/tmp/looper_<pid>.sock`
- Also prunes stale sockets matching `looper_*.sock`

Potential directions:
- Keep as-is for compatibility, or
- Make it configurable / include plugin name / provide alias.

### 4.2 OSCQuery server advertises itself as “Looper OSCQuery Server”

File: `looper/primitives/control/OSCQuery.cpp`

- `buildHostInfo()` includes:
  - `"NAME": "Looper OSCQuery Server"`

Potential directions:
- Change to a generic name (“OSCQuery Server”) or plugin-specific (“Manifold OSCQuery Server”), ideally derived from `AudioProcessor::getName()`.

### 4.3 Settings file path uses `~/.config/looper/settings.json`

File: `looper/primitives/control/OSCSettingsPersistence.h`

- Comment documents settings location under `looper/`.

Potential directions:
- Migration logic: read old location if new doesn’t exist; write new location.

### 4.4 State schema / endpoint paths still include `/looper/...`

File: `looper_primitives/BehaviorCoreProcessor.cpp`

- Serialization includes keys like:
  - `/looper...`
  - `/dsp/looper...`

Potential directions:
- Provide aliases:
  - accept both `/looper/...` and `/manifold/...` (or `/core/behavior/...` which is already used heavily)
- Avoid breaking existing OSC clients.

---

## 5) Existing “legacy names” that are probably fine to keep (internal)

These are internal class names / folder names that don’t directly leak to end users (unless logged) and can be renamed later if desired:

- `looper_primitives/BehaviorCoreProcessor.*`
- `looper_primitives/BehaviorCoreEditor.*`
- comments like “formerly LooperPrimitives” in `CMakeLists.txt`

Renaming these is mostly code hygiene; it’s not urgent compared to host-visible names and external API stability.

---

## 6) Suggested staged cleanup plan

### Stage A (safe / low risk)
- Fix Manifold `getName()` to match `PRODUCT_NAME` (use `JucePlugin_Name`).
- Remove/replace hardcoded absolute paths for:
  - `looper_ui.lua`
  - `looper_primitives_dsp.lua`
- Introduce `ui_widgets.lua` + `looper_widgets.lua` shim (keep compatibility).

### Stage B (medium risk; affects user scripts + docs)
- Update shipped UI scripts to `require("ui_widgets")`.
- Update docs (`AGENTS.md`, `README.md`) to mention `ui_widgets.lua` as canonical.

### Stage C (higher risk; affects external tooling)
- Make OSCQuery server name configurable or plugin-derived.
- Introduce configurable socket prefix and/or compatibility handling.
- Add OSC path aliases (old `/looper/*` + new `/manifold/*` or `/core/*`).
- Settings file migration to a generic/plugin-specific path.

---

## Appendix: quick references (files mentioned)

- Manifold plugin target: `CMakeLists.txt` (`juce_add_plugin(Manifold ...)`)
- Processor/editor:
  - `looper_primitives/BehaviorCoreProcessor.h/.cpp`
  - `looper_primitives/BehaviorCoreEditor.h/.cpp`
- UI:
  - `looper/ui/looper_ui.lua`
  - `looper/ui/looper_widgets.lua`
- Lua module loading behavior:
  - `looper/primitives/scripting/LuaEngine.cpp` (sets `package.path`)
- OSC/IPC:
  - `looper/primitives/control/ControlServer.cpp` (socket path)
  - `looper/primitives/control/OSCQuery.cpp` (host info name)
  - `looper/primitives/control/OSCSettingsPersistence.h` (settings path)
