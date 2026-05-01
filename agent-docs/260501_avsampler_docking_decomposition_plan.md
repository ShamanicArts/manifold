# avsamplerDOCKING — God Object Decomposition Plan

**Date:** 2026-04-29
**Status:** Planned — no extraction work started
**Target file:** `UserScripts/projects/avsamplerDOCKING/ui/behaviors/main.lua` (4,457 lines)
**Goal:** Split into 14 focused modules, eliminate 38 global-function workarounds, free up local-variable budget per module. No behavior changes.

---

## 1. Why This Exists

`main.lua` is a single-file god object with tightly interleaved concerns:

- Grid rendering lives next to compositor graph building lives next to MIDI polling lives next to ML model loading lives next to sampler capture lives next to param inspector layout lives next to dock setup lives next to source descriptor management lives next to profiling lives next to pipeline building lives next to mapping logic lives next to waveform rendering lives next to callback wiring

**The concrete signals that say "this file is broken":**

| Signal | Value |
|--------|-------|
| Total lines | **4,457** |
| `local` declarations | **197 / 200** — right at Lua's limit |
| Functions forced to be **globals** (not `local`) to work around limit | **38** |
| Functions that ARE `local` | **140** |
| Module-level constants (`local` vars) | **31** |
| Lines of pure callback wiring in `M.init` | **~250** |

The 38 global functions are the clearest sign of pathology. They exist solely because the file exhausted its 200-local budget. Every one of them (`updateGridThumbnails`, `buildCompositorGraph`, `colBuildCellPipeline`, `syncClipModel`, etc.) is a function that would be `local` in a properly decomposed project.

When all 14 modules are extracted, each file gets its own 200-local budget and the 38 globals all become `local` where they belong.

---

## 2. No Behavior Changes

This decomposition is purely mechanical:

- Move function definitions to new files
- Add `require()` in main.lua
- Call module functions via their table (e.g., `Shaders.updateGridThumbnails(ctx)`) instead of bare globals
- No logic changes, no refactoring
- Every module uses the same pattern: takes `ctx` as first arg, accesses shared state from there

---

## 3. The Dependency Graph

No circular dependencies. Everything flows one direction.

```
util.lua          → nothing
constants.lua     → nothing
state.lua         → util, constants
sources.lua       → util, state
midi.lua          → util
ml.lua            → util, sources
mapping.lua       → util, ml
shaders.lua       → util, state, sources
sampler.lua       → util, state
grid.lua          → util, state, sources, shaders
compositor.lua    → util, state, sources, shaders
params.lua        → util, state, sources, shaders, grid
layout.lua        → all rendered modules above
main.lua          → ALL (orchestrator)
```

---

## 4. Module-by-Module Breakdown

### constants.lua (~20 lines)
Module-level constants pulled from the top of main.lua. Zero function deps — pure data.

```
NS, MAX, MAX_MAPPINGS, MAX_CAPTURE_SECONDS, TOOLBAR_H
VIDEO_CAPTURE_ID, VIDEO_SAMPLER_ID
PARAM_SYNC_INTERVAL, SEGMENT_INGEST_INTERVAL, POSE_INTERVAL
PLAYBACK_UI_INTERVAL, STATUS_INTERVAL
DEFAULT_CAPTURE_W, DEFAULT_CAPTURE_H
ML_SOURCE_PARAM_SPECS table
KEYPOINTS table
MAJOR_OFFSETS table
DOCK_WINDOWS table
```

---

### util.lua (~30 functions, ~200 lines)
Pure stateless helpers. No avsampler-specific state. Every module depends on these.

```
bor(), clamp(), round(), fitBox()
toNum(), setText(), setLabel(), setOptions()
setVisible(), setBounds(), setValueSilently(), setSelectedSilently()
readParam(), writeParam(), bump(), writeParamIfChanged()
nowSeconds(), shouldRunInterval()
dirname(), join(), parentDir(), currentScriptDir(), projectRootDir()
clockInfo(), bindParamWidget(), relayoutManagedSubtree()
selectedDeviceIndex(), letterbox()
cloneTable()
clearNodeSurface(), buildNodePassthroughPayload()
compositorBlendParams()
```

---

### state.lua (~15 functions, ~300 lines)
The data model: ctx initialization, column operations, compositor state, canonical aspect.

```
colInit()
syncCol1FromShader()
addColumn(), removeColumn()
colAddFx(), colRemoveFx()
colSourceDescriptor()
canonicalAspectSizeForSpec(), canonicalAspectSize() — currently globals
syncCanonicalSurfaceBounds() — currently global
updateOutputAspect()
defaultMLSourceSpec()
```

---

### sources.lua (~20 functions, ~400 lines)
Source descriptor management, webcam, generators, ML source pipeline nodes.

```
refreshDevices(), openWebcam(), closeWebcam()
applyCaptureWindow(), applyVideoWindow()
segPayload()
buildPoseSources()
currentCol1SourceSpec() — currently local function
sourceSpecForColumn(), setSourceSpecForColumn() — currently globals
ensureAuxSourceNode(), ensureShaderSourceNode()
buildShaderSourceDescriptor()
applySourceSpecToHiddenNode() — currently global
buildPoseSourcePayload()
materializeGeneratorParams() — currently global
colSourceLabel() — currently global
sourceSpecSignature() — currently global
appendSigKV(), appendSortedParamSig() — currently globals
```

---

### shaders.lua (~15 functions, ~400 lines)
Pipeline building, thumbnail updates, signature caching.

```
colBuildCellPipeline() — currently global
buildTapPipeline()
updateGridThumbnails() — currently global
syncClipModel() — currently global
syncShaderSourceParams() — currently global
updateStackRenderNodes() — currently global
stackNodeIdForRow(), stackNodeIdForTap() — currently globals
stackTapSignature() — currently global
```

---

### ml.lua (~8 functions, ~200 lines)
ML model loading, pose pipeline, segmentation.

```
loadModels(), tryLoad()
bindInputSurfaces()
runPose(), poseSourceValue()
ensurePoseOverlay()
buildPoseDisplay()
```

---

### sampler.lua (~12 functions, ~250 lines)
Capture, playback, waveform.

```
pathForSlice(), triggerPathForSlice(), velocityPathForSlice()
doRetroCapture()
onCaptureButton(), setCaptureButtonAppearance()
refreshWaveform() — currently global
updatePreviewSurface() — currently global
layoutOutputRow() — currently global
layoutPolyEmbed(), layoutSliceEmbed()
```

---

### mapping.lua (~8 functions, ~150 lines)
Mapping system.

```
buildMappingTargets()
mappingTargetSpec()
defaultMapping()
applyMapping()
applyMappingTrack()
```

---

### grid.lua (~10 functions, ~300 lines)
Grid rendering, cell management, selection, toolbar.

```
layoutClipGrid()
ensureGridCells()
renderGridToolbar()
renderDeckPanel()
selectedGridClip()
selectGridCell()
selectionSummary()
```

---

### compositor.lua (~10 functions, ~300 lines)
Compositor panel rendering, graph building, layer blending.

```
renderCompositorPanel() — currently global
compositorLayerCellPipeline() — currently global
updateCompositorThumbnails() — currently global
updateCompositorOutput() — currently global
buildCompositorGraph() — currently global
ensureCompositorCells() — currently global
layoutCompoLayerControls() — currently global
renderCompositorLayerControls() — currently global
```

---

### params.lua (~12 functions, ~400 lines)
Source inspector, effect inspector, transport/mapping/fx param sections.

```
renderSourceInspectorWindow()
renderEffectInspectorWindow()
renderParametersPanel()
renderParamTransportWindow()
renderParamMappingWindow()
renderParamFxWindow()
layoutSourceEmbed(), layoutEffectEmbed()
layoutMappingEmbed(), layoutFxEmbed()
```

---

### layout.lua (~12 functions, ~300 lines)
Dock setup, presets, panel rendering orchestration.

```
renderFrame()
renderPanel()
renderSourcesPanel()
renderStagePanel()
renderWaveformPanel()
renderDeckPanel()
buildDeckLayout(), buildStageLayout(), buildInspectorLayout()
resetPanelDocks() — currently global
panelSplit()
windowName()
renderEmbeddedPanel()
layoutDeckEmbed(), layoutInputsEmbed()
layoutWaveformEmbed(), layoutStageEmbed()
```

---

### midi.lua (~8 functions, ~100 lines)
MIDI handling and polling.

```
currentMidiLabel()
refreshMidi()
openPreferredMidi()
pollMidi()
encodedMidi()
noteToSlice()
triggerNote(), releaseNote()
```

---

### profiler.lua (~3 functions, ~50 lines)
Profiling instrumentation.

```
__avsdProfileInit()
profileStart(), profileEnd()
```

---

### main.lua (~200 lines, orchestrator only)

The monolithic `M.init` (~300 lines), `M.update` (~80 lines), `M.resized`, and `M.cleanup` become a thin layer that:

1. **Requires all modules**
2. **Calls State.init(ctx)** to set up initial ctx state
3. **Wires all callbacks** — the ~250 lines of `ctx.widgets.xxx._onClick = function()... end` — inline
4. **Implements M.init / M.update / M.resized / M.cleanup** by calling into modules

```lua
local Util = require("behaviors.avsd.util")
local State = require("behaviors.avsd.state")
local Sources = require("behaviors.avsd.sources")
local Shaders = require("behaviors.avsd.shaders")
local Grid = require("behaviors.avsd.grid")
local Compositor = require("behaviors.avsd.compositor")
local Params = require("behaviors.avsd.params")
local ML = require("behaviors.avsd.ml")
local Sampler = require("behaviors.avsd.sampler")
local Mapping = require("behaviors.avsd.mapping")
local Layout = require("behaviors.avsd.layout")
local Midi = require("behaviors.avsd.midi")
-- ... etc

local M = {}

function M.init(ctx)
  State.init(ctx)
  Sources.refreshDevices(ctx)
  Shaders.updateShader(ctx)
  ML.loadModels(ctx)
  -- ~250 lines of callback wiring...
end

function M.update(ctx)
  Sources.applyCaptureWindow(ctx)
  Shaders.syncParamsFromHost(ctx)
  Midi.pollMidi(ctx)
  -- etc
end

return M
```

---

## 5. Migration Strategy

Do not touch main.lua until all module files are written and tested individually. Each module file is written side-by-side with main.lua, not extracted from it.

### Step 1: Write module files
Create all 14 files in `ui/behaviors/avsd/` directory. Each file:
- Starts with `local M = {}`
- Contains ONLY the function definitions for that module
- Ends with `return M`
- Functions use `M.funcName = function(...)` syntax, not `local function funcName(...)`

### Step 2: Add requires to main.lua
At the top of main.lua, add `local Xxx = require("behaviors.avsd.xxx")` for each module.

### Step 3: Replace function calls
Everywhere a function was called as a global (e.g., `updateGridThumbnails(ctx)`), replace with module call (`Shaders.updateGridThumbnails(ctx)`).

### Step 4: Delete old function definitions
Once ALL call sites use the module syntax, delete the function bodies from main.lua and the `local function` / `global = function` declarations.

### Step 5: Verify
- Remove the forward-declaration block at line ~260 (`for _, k in ipairs{...} do ... end`)
- Verify no more bare global function calls remain
- Verify the 38 globals no longer exist in main.lua
- Verify app loads and behaves identically

### Step 6: Hot-swap
Delete old functions from main.lua → reload project → nothing should change functionally

---

## 6. Summary

| File | Lines | Local budget freed | Globals eliminated |
|------|-------|--------------------|--------------------|
| main.lua (before) | 4,457 | 0/200 | 38 |
| main.lua (after) | ~200 | 190/200 free | 0 |
| constants.lua | ~20 | — | — |
| util.lua | ~200 | 200/200 | — |
| state.lua | ~300 | 200/200 | 3 |
| sources.lua | ~400 | 200/200 | 7 |
| shaders.lua | ~400 | 200/200 | 7 |
| ml.lua | ~200 | 200/200 | — |
| sampler.lua | ~250 | 200/200 | 3 |
| mapping.lua | ~150 | 200/200 | — |
| grid.lua | ~300 | 200/200 | — |
| compositor.lua | ~300 | 200/200 | 8 |
| params.lua | ~400 | 200/200 | — |
| layout.lua | ~300 | 200/200 | 1 |
| midi.lua | ~100 | 200/200 | — |
| profiler.lua | ~50 | 200/200 | — |
| **Total** | **~3,500** | — | **29 globals eliminated** |

(The remaining 9 "globals" are the M.x functions — M.init, M.update, M.resized, M.cleanup — which belong on the module return table, not as globals.)
