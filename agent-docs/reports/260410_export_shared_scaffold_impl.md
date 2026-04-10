# Export Shared Scaffold Implementation

**Date:** 2026-04-10  
**Scope:** Shared scaffold extracted for processor-style export wrappers, then applied to `Standalone_Filter` and `Standalone_Eq`.

---

## Implemented shared scaffold

### 1. Shared DSP helper
Added:
- `UserScripts/projects/Main/lib/export_plugin_scaffold.lua`

Purpose:
- build a single-slot processor export from a rack module
- create input/output passthrough nodes
- instantiate one module slot
- connect input → module → output
- register dynamic module schema
- forward `onParamChange`

Used by:
- `Standalone_Filter/dsp/main.lua`
- `Standalone_Eq/dsp/main.lua`

---

### 2. Shared UI shell builder
Added:
- `UserScripts/projects/Main/lib/export_plugin_shell.lua`

Purpose:
- build the standard export plugin wrapper UI
- shared header strip
- shared settings toggle
- shared content background
- shared mounting of:
  - module component
  - settings overlay
  - perf overlay

Used by:
- `Standalone_Filter/ui/main.ui.lua`
- `Standalone_Eq/ui/main.ui.lua`

---

### 3. Shared shell behavior
Added:
- `UserScripts/projects/Main/ui/behaviors/export_shell.lua`

Purpose:
- shared export wrapper layout logic
- shared settings toggle behavior
- shared overlay visibility logic
- shared content scaling
- module component id is supplied via root props

---

### 4. Shared overlay UI + behavior
Added:
- `UserScripts/projects/Main/ui/components/export_settings_panel.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/export_settings_panel.lua`
- `UserScripts/projects/Main/ui/components/export_perf_overlay.ui.lua`
- `UserScripts/projects/Main/ui/behaviors/export_perf_overlay.lua`

Purpose:
- remove duplicate settings/perf overlay definitions from export wrappers
- give processor-style exports one common overlay implementation

---

## Wrapper refactors applied

### Filter
Refactored:
- `UserScripts/projects/Standalone_Filter/dsp/main.lua`
- `UserScripts/projects/Standalone_Filter/ui/main.ui.lua`

### EQ8
Refactored:
- `UserScripts/projects/Standalone_Eq/dsp/main.lua`
- `UserScripts/projects/Standalone_Eq/ui/main.ui.lua`

Result:
- both wrappers now mostly provide only module-specific config:
  - title
  - accent color
  - module behavior/ref
  - module defaults
  - schema kind

---

## What is still not shared yet

The following still remain outside this implementation scope:

1. export manifest parameter generation  
   - `plugin.params` is still hand-authored
   - especially important for EQ-style nested schemas

2. CMake export target macro  
   - target creation is still explicit in `CMakeLists.txt`

3. deploy/install helper  
   - VST3 copy to `~/.vst3/` is still manual

4. bootstrap path setup snippet  
   - `dirname/join/appendPackageRoot` still appears in each wrapper entry file
   - not worth overengineering until a cleaner loader strategy is chosen

---

## Why this scaffold is worth keeping

This reduces the most error-prone duplicate wrapper code in exactly the places that already caused breakage:
- stale component ids
- forgotten overlay mounting
- inconsistent header controls
- repeated DSP wrapper connection code

It gives a cleaner next path for processor-style exports such as:
- Filter
- EQ
- FX

---

## Recommended next follow-up

If this scaffold proves stable, the next highest-value extraction is:

1. shared export manifest/schema generation helpers  
2. shared CMake export macro  
3. shared deploy/install target/script
