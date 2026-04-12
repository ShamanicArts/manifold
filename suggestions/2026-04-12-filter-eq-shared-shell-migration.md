# Migration Proposal: Filter + EQ to Shared Export Shell

**Date:** 2026-04-12  
**Scope:** Migrate Standalone_Filter and Standalone_Eq to use `export_plugin_shell.lua` (like FX already does)

---

## Current State

| Export | Pattern | Shell Type |
|--------|---------|------------|
| FX | `export_plugin_shell.build({...})` | ✅ Shared declarative builder |
| Filter | Manual inline UI definition | ❌ Copy/paste (legacy) |
| EQ | Manual inline UI definition | ❌ Copy/paste (legacy) |

---

## Problem with Current Approach

The follow-ups document (2026-04-10) identified these issues with copy/paste wrappers:

1. **Component ID drift** — EQ wrapper still referenced `filter_component` (fixed, but risk remains)
2. **Overlay mounting bugs** — files present but not wired correctly (fixed, but pattern is fragile)
3. **Header toggle mislabel** — `DEV` vs `SET` (fixed)
4. **Rounding inconsistencies** — required shared component changes instead of shell change

**Root cause:** Three copies of nearly identical shell code means three places for bugs.

---

## Proposed Migration

### Target Architecture

Both Filter and EQ should adopt the FX pattern:

```lua
-- ui/main.ui.lua becomes:
local ExportPluginShell = require("export_plugin_shell")

return ExportPluginShell.build({
  rootId = "standalone_filter_root",  -- or "standalone_eq_root"
  title = "Filter",                    -- or "EQ"
  accent = 0xff22d3ee,                -- or 0xffa78bfa for EQ
  width = 472,
  height = 220,
  headerHeight = 12,
  contentWidth = 472,
  contentHeight = 208,
  moduleId = "filter_component",       -- or "eq_component"
  moduleBehavior = "../Main/ui/behaviors/filter.lua",
  moduleRef = "../Main/ui/components/filter.ui.lua",
  moduleProps = {
    -- Filter-specific props
    paramBase = "/plugin/params",
  },
})
```

### Files to Modify

#### Standalone_Filter
- `UserScripts/projects/Standalone_Filter/ui/main.ui.lua` — replace with builder
- `UserScripts/projects/Standalone_Filter/ui/behaviors/main.lua` — potentially removable (shell handles it)

#### Standalone_Eq
- `UserScripts/projects/Standalone_Eq/ui/main.ui.lua` — replace with builder
- `UserScripts/projects/Standalone_Eq/ui/behaviors/main.lua` — potentially removable

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Filter/EQ behaviors expect specific widget hierarchy | Verify `export_shell.lua` provides compatible runtime widget lookup |
| Different param path structures | Filter = flat, EQ = nested bands — both work, just different manifest specs |
| Content scaling differences | Builder accepts `contentWidth/contentHeight` params |
| Settings/perf overlay integration | Already standardized in `export_plugin_shell.build()` |

---

## Verification Checklist

Post-migration, verify:

- [ ] Plugin builds without errors
- [ ] UI renders with square corners (no rounding)
- [ ] Header shows correct title ("Filter" / "EQ")
- [ ] Header toggle labeled "SET" (not "DEV")
- [ ] Settings overlay opens/closes correctly
- [ ] Module UI scales correctly on resize
- [ ] All parameters map correctly (check DAW automation)
- [ ] State recall works in DAW (save/restore project)

---

## Future-Proofing Benefits

After migration:

1. **Single source of truth** — shell improvements benefit all exports
2. **Easier new exports** — copy FX/Filter/EQ pattern for future modules
3. **Consistent behavior** — overlays, settings, scaling all work the same
4. **Simpler testing** — validate shell once, all exports benefit

---

## Recommended Next Steps

1. **Migrate Filter first** (simpler param structure)
2. **Verify thoroughly** in a DAW
3. **Migrate EQ** using same pattern
4. **Delete legacy wrapper boilerplate** once both are stable
5. **Document the pattern** for future exports (compressor? saturator?)

---

## Reference: FX Working Example

See `UserScripts/projects/Standalone_FX/ui/main.ui.lua` for the reference implementation.

Key differences for Filter/EQ:
- Different `moduleBehavior` path
- Different `moduleRef` path  
- Different `moduleProps` (if needed)
- Different `accent` color

The builder handles everything else.
