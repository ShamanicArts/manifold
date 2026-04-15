# Midisynth Behavior Decomposition Proposal

## Goal

Decompose `ui/behaviors/midisynth.lua` into multiple focused module files to improve code organization, navigability, and maintainability.

This is **not** a greenfield redesign.
The functionality is sound — the issue is organizational: 159 functions doing 8+ different jobs lives in a single 6,329-line file.

---

## Non-goals

Do **not**:
- reduce the total lines of code;
- change any functionality or behavior;
- rewrite the DSP logic;
- introduce new features;
- alter the public API surface (M.* exports should remain available).

---

## Current Problem Statement

`midisynth.lua` is a 6,329-line file containing:

- **159 functions** (116 local + 43 exported M.* functions)
- **19 external module dependencies**
- **8+ distinct functional domains** all interleaved:
  - Voice allocation and triggering
  - ADSR envelope processing
  - Modulation routing (voice + control)
  - On-screen keyboard handling
  - Rack layout and widget positioning
  - Palette/browser management
  - State persistence
  - Patchbay wiring

### Why This Is Problematic

1. **Navigability**: To work on voice logic, you must scan 6,329 lines mixed with UI, layout, and state code.

2. **Onboarding**: New developers face "where do I even start?" — the file has no clear entry points for specific domains.

3. **Testability**: Cannot unit test voice management in isolation — entire behavior must be loaded.

4. **Parallel development**: Two developers working on different domains inevitably conflict in the same file.

5. **Single responsibility violation**: The file violates the single responsibility principle — it has 8 reasons to change.

---

## Success Criteria

The decomposition is successful when all of the following are true:

1. Each functional domain lives in its own file with a descriptive name.
2. The new files are < 900 lines each (down from 6,329 in one file).
3. Developers can reason about their domain without reading unrelated code.
4. Unit tests can be written for individual modules (voice_manager, modulation_router, etc.).
5. `midisynth.lua` becomes an orchestrator that delegates to specialized modules.
6. No public API changes — existing M.* exports remain available (possibly re-exported).
7. Adding a new domain doesn't require adding to a growing monolith.

---

## Proposed Module Structure

### 1. voice_manager.lua 

**Responsibility**: Voice allocation, triggering, envelope processing

**Functions to extract**:
- `chooseVoice()` — Voice stealing algorithm (128 lines)
- `triggerVoice()` — Note on handling
- `releaseVoice()` — Note off handling
- `panicVoices()` — All notes off
- `updateEnvelopes()` — ADSR processing
- `calculateEnvelope()` — Envelope calculation
- `activeVoiceCount()`, `voiceSummary()` — Debug/info
- `noteToFreq()`, `freqToNote()` — MIDI note conversion
- `velocityToAmp()` — Velocity scaling

**External dependencies**: adsr_runtime.lua, voice_pool.lua

**Exports**: Voice allocation, triggering, envelope update functions

---

### 2. modulation_router.lua 

**Responsibility**: Modulation routing for voices and controls

**Functions to extract**:
- `applyVoiceModulationTarget()` — Voice modulation routing (152 lines)
- `resolveDynamicVoiceModulationSource()` — Voice mod source resolution
- `applyControlModulationTarget()` — Control modulation routing
- `resolveControlModulationSource()` — Control mod source resolution
- `applyImplicitRackOscillatorKeyboardPitch()` — Keyboard pitch
- `getCombinedModTargetState()` — Combined state lookup

**External dependencies**: ModEndpointRegistry, ModRouteCompiler, ModRuntime

**Exports**: Modulation application and resolution functions

---

### 3. rack_layout_engine.lua 

**Responsibility**: Rack layout, drag-drop reordering, widget positioning

**Functions to extract**:
- `syncRackShellLayout()` — Layout synchronization (453 lines — **needs further internal decomposition**)
- `computeRackFlowTargetPlacement()` — Drag placement calculation
- `previewRackDragReorder()` — Drag preview
- `finalizeRackDragReorder()` — Commit drag reordering
- `spawnPaletteNodeAt()` — Module spawning
- `deleteRackNode()` — Module deletion
- `getRackNodeRowById()`, `getRackTotalRows()` — Row queries
- `setRackViewport()` — Pagination viewport
- `toggleRackNodeWidth()` — Module width toggle
- `ensureRackPaginationState()`, `syncRackPaginationModel()` — Pagination
- `updateRackPaginationDots()`, `onRackDotClick()` — Pagination UI

**External dependencies**: RackLayout, RackLayoutManager

**Exports**: Layout sync, node spawn/delete, drag handling

---

### 4. palette_browser.lua 
**Responsibility**: Module palette, spawning, selection

**Functions to extract**:
- `_buildPaletteNodeFromEntry()` — Palette node creation (244 lines)
- `_setupUtilityPaletteBrowserHandlers()` — Browser event handling (198 lines)
- `makePaletteEntry()` — Palette entry factory (163 lines)
- `_syncPaletteCardState()` — Card state sync (310 lines)
- `_selectPaletteEntry()`, `_ensurePaletteSelection()` — Selection
- `_togglePaletteBrowseSection()` — Section toggle
- `_getFilteredPaletteEntries()` — Filtering
- `_buildPaletteNode()` — Node construction
- `_clearPaletteDragPreview()` — Preview cleanup

**External dependencies**: RackModuleFactory

**Exports**: Palette building, selection, filtering functions

---

### 5. keyboard_input.lua 

**Responsibility**: On-screen MIDI keyboard handling

**Functions to extract**:
- `buildKeyboardDisplayList()` — Keyboard rendering list (88 lines)
- `handleKeyboardClick()` — Key click handling
- `isKeyboardNoteActive()` — Note state query
- `generateKeyboardKeys()` — Key generation
- `computeKeyboardPanelHeight()` — Panel sizing
- `syncKeyboardCollapsedFromUtilityDock()`, `syncUtilityDockFromKeyboardCollapsed()` — Dock sync
- `syncKeyboardCollapseButton()` — Collapse button sync
- `setKeyboardCollapsed()` — Collapse state

**Exports**: Keyboard building, click handling, collapse functions

---

### 6. state_manager.lua 

**Responsibility**: State persistence, defaults, runtime path management

**Functions to extract**:
- `loadSavedState()` — State loading (218 lines)
- `runtimeStatePath()` — Path resolution (201 lines)
- `persistDockUiState()` — UI state persistence
- `resetToDefaults()` — Reset to defaults
- `getUtilityDockState()`, `setUtilityDockMode()` — Dock state
- `ensureUtilityDockState()` — Dock initialization

**Exports**: State load/save, reset, path functions

---

### 7. patchbay_binding.lua 

**Responsibility**: Patchbay port binding, wiring

**Functions to extract**:
- `bindWirePortWidget()` — Port widget binding
- `findRegisteredPatchbayPort()` — Port lookup
- `syncAuxAudioRouteParams()` — Audio route sync (109 lines)
- `syncPatchbayValues()` — Value sync
- `ensurePatchbayWidgets()` — Widget creation
- `cleanupPatchbayFromRuntime()`, `invalidatePatchbay()` — Cleanup

**External dependencies**: PatchbayRuntime

**Exports**: Port binding, patchbay sync, cleanup functions

---

### 8. dynamic_module_binding.lua 
**Responsibility**: Dynamic module slots, audio staging

**Functions to extract**:
- `_rackAudioStagePath()`, `_rackAudioSourcePath()` — Path helpers
- `_rackAudioSourceCodeForNodeId()`, `_rackAudioStageCodeForNodeId()` — Code generation
- `_requestDynamicModuleSlot()` — Slot request (40 lines)
- `_syncRackAudioStageParams()` — Param sync
- `_rackTopologySignature()`, `_rackTopologyChanged()` — Topology handling
- `_ensureDynamicShellForNode()` — Shell creation (124 lines)

**External dependencies**: RackAudioRouter, RackModuleFactory

**Exports**: Module slot requests, audio staging, topology functions

---

### 9. midisynth.lua 

**Responsibility**: Lifecycle orchestration only — delegates to specialized modules

**Functions to keep**:
- `init()` — Delegates to state_manager.loadSavedState, layout_engine.syncRackShellLayout, etc.
- `update()` — Delegates to domain modules
- `cleanup()` — Cleanup all modules

**Requires** (instead of current 19):
- `VoiceManager = require("voice_manager")`
- `ModRouter = require("modulation_router")`
- `LayoutEngine = require("rack_layout_engine")`
- `PaletteBrowser = require("palette_browser")`
- `KeyboardInput = require("keyboard_input")`
- `StateManager = require("state_manager")`
- `PatchbayBinding = require("patchbay_binding")`
- `DynamicModules = require("dynamic_module_binding")`

**Exports**: M.init, M.update, M.cleanup, M.backgroundTick (delegated)

---

## Implementation Approach

### Phase 1: Create specialized modules

Create new files one at a time, starting with smallest/most isolated:

1. `keyboard_input.lua` — ~200 lines, minimal deps
2. `state_manager.lua` — ~300 lines, minimal deps
3. `patchbay_binding.lua` — ~150 lines
4. `dynamic_module_binding.lua` — ~150 lines
5. `voice_manager.lua` — ~450 lines
6. `modulation_router.lua` — ~350 lines
7. `palette_browser.lua` — ~500 lines
8. `rack_layout_engine.lua` — ~850 lines (note: syncRackShellLayout internally needs decomposition)

### Phase 2: Refactor orchestrator

Rewrite `midisynth.lua` to:
1. Replace inline functions with imports
2. Delegate lifecycle to specialized modules
3. Re-export public API for backwards compatibility

### Phase 3: Integration testing

- Verify all existing functionality works unchanged
- Test module interactions
- Ensure no regressions

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Re-export all M.* functions from new orchestrator |
| Circular dependencies | Design modules with clear dependency direction (libs → domain) |
| Internal function coupling | Some local functions may need to move together; group by domain |
| syncRackShellLayout complexity | This 453-line function may need internal sub-decomposition |
| Testing complexity | Write tests after decomposition, not during |

---

## Why Decomposition (Not Reduction)

The total lines of code will **not significantly decrease**:
- Before: 6,329 lines
- After: ~6,500 lines (some wrapper overhead)

The value is **organization**, not reduction:

| Before | After |
|--------|-------|
| 1 file, 159 mixed functions | 9 files, ~18 functions each, clearly separated |
| "Where's the voice stuff?" | File is called `voice_manager.lua` |
| Entire file is a monolith | Each module has one clear responsibility |
| Hard to onboard | Read one small file relevant to your task |

**Benefits**:
- Navigability: "I need to fix voice stealing" → open `voice_manager.lua`
- Testability: Unit test each module independently
- Parallel dev: Someone works on modulation, someone else on layout, no conflicts
- Onboarding: New devs read the one file relevant to their task

---

## Estimated Effort

| Module | Effort |
|--------|--------|
| keyboard_input.lua | 0.5 day |
| state_manager.lua | 0.5 day |
| patchbay_binding.lua | 1 day |
| dynamic_module_binding.lua | 1 day |
| voice_manager.lua | 1 day |
| modulation_router.lua | 1 day |
| palette_browser.lua | 1.5 days |
| rack_layout_engine.lua | 2 days |
| midisynth.lua rewrite | 1 day |
| Testing/integration | 2 days |
| **Total** | **~11 days** |

---

## Open Questions

1. Should `syncRackShellLayout()` be further decomposed internally before extraction?
2. Should the new modules live in `lib/` or stay in `behaviors/`?
3. Should we maintain backwards compatibility by re-exporting all M.* functions, or is breaking the API acceptable?
4. How do we handle `backgroundTick` — does it live in a module, or in the orchestrator?
5. Should we add tests before or after decomposition?