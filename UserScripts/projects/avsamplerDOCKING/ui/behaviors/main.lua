local M = {}
local AVSD = {
  Mapping = require("behaviors.core.mapping"),
  Midi = require("behaviors.core.midi"),
  State = require("behaviors.core.state"),
  Prof = require("behaviors.core.profiler"),
  ML = require("behaviors.core.ml"),
  Sampler = require("behaviors.core.sampler"),
  Sources = require("behaviors.core.sources"),
  Shaders = require("behaviors.core.shaders"),
  Embeds = require("behaviors.core.embeds"),
  Params = require("behaviors.core.params"),
  Initflow = require("behaviors.core.initflow"),
  Runtime = require("behaviors.core.runtime"),
  Testhooks = require("behaviors.core.testhooks"),
  Grid = require("behaviors.core.grid"),
  Layout = require("behaviors.core.layout"),
  Compositor = require("behaviors.core.compositor"),
}
local C = require("behaviors.core.constants")
local U = require("behaviors.core.util")

local SHADER_DEPS = nil
local EMBED_DEPS = nil
local GRID_DEPS = nil
local LAYOUT_DEPS = nil
local COMPO_DEPS = nil

local NS = C.NS
local MAX = C.MAX
local MAX_MAPPINGS = C.MAX_MAPPINGS
local MAX_CAPTURE_SECONDS = C.MAX_CAPTURE_SECONDS
local TOOLBAR_H = C.TOOLBAR_H
local VIDEO_CAPTURE_ID = C.VIDEO_CAPTURE_ID
local VIDEO_SAMPLER_ID = C.VIDEO_SAMPLER_ID
local PARAM_SYNC_INTERVAL = C.PARAM_SYNC_INTERVAL
local SEGMENT_INGEST_INTERVAL = C.SEGMENT_INGEST_INTERVAL
local POSE_INTERVAL = C.POSE_INTERVAL
local PLAYBACK_UI_INTERVAL = C.PLAYBACK_UI_INTERVAL
local STATUS_INTERVAL = C.STATUS_INTERVAL
local ML_SOURCE_PARAM_SPECS = C.ML_SOURCE_PARAM_SPECS

local bor = U.bor
local clamp = U.clamp
local round = U.round
local fitBox = U.fitBox
local function rackFxBasePath(slot) return "/midi/synth/rack/fx/" .. math.max(1, round(slot or 1)) end
local function rackFxTypePath(slot) return rackFxBasePath(slot) .. "/type" end
local function rackFxMixPath(slot) return rackFxBasePath(slot) .. "/mix" end
local function rackFxParamPath(slot, paramIndex) return rackFxBasePath(slot) .. "/p/" .. math.max(0, round(paramIndex or 0)) end

local refreshWaveform
local updatePreviewSurface
local ensureGridCells
local refreshGridCells
local updateGridThumbnails
local resetPanelDocks
local syncShaderSourceParams
local layoutOutputRow
local buildTapPipeline
local syncCol1FromShader
local addColumn
local removeColumn
local colAddFx
local colRemoveFx
local colSourceDescriptor
local colBuildCellPipeline
local colSourceLabel
local colFxLabel
local currentCol1SourceSpec
local sourceSpecForColumn
local setSourceSpecForColumn
local applySourceSpecToHiddenNode
local buildPoseSourcePayload
local pathForSlice = AVSD.Sampler.pathForSlice
local triggerPathForSlice = AVSD.Sampler.triggerPathForSlice
local velocityPathForSlice = AVSD.Sampler.velocityPathForSlice
local applyCaptureWindow = AVSD.Sampler.applyCaptureWindow
local applyVideoWindow = AVSD.Sampler.applyVideoWindow
local doRetroCapture = AVSD.Sampler.doRetroCapture
local setCaptureButtonAppearance = AVSD.Sampler.setCaptureButtonAppearance
local onCaptureButton = AVSD.Sampler.onCaptureButton
local samplePosition = AVSD.Sampler.samplePosition
local nearestSlice = AVSD.Sampler.nearestSlice
local POLY_PATHS = AVSD.Sampler.POLY_PATHS
local SLICE_PATHS = AVSD.Sampler.SLICE_PATHS
refreshWaveform = AVSD.Sampler.refreshWaveform
updatePreviewSurface = AVSD.Sampler.updatePreviewSurface
layoutOutputRow = AVSD.Sampler.layoutOutputRow

local toNum = U.toNum
local setText = U.setText
local setLabel = U.setLabel
local setOptions = U.setOptions
local setVisible = U.setVisible
local setBounds = U.setBounds
local setValueSilently = U.setValueSilently
local setSelectedSilently = U.setSelectedSilently
local readParam = U.readParam
local writeParam = U.writeParam
local bump = U.bump
local writeParamIfChanged = U.writeParamIfChanged
local nowSeconds = U.nowSeconds
local shouldRunInterval = U.shouldRunInterval

local profileStart = AVSD.Prof.start
local profileEnd = AVSD.Prof.finish

local dirname = U.dirname
local join = U.join
local parentDir = U.parentDir
local currentScriptDir = U.currentScriptDir
local projectRootDir = U.projectRootDir
local clockInfo = U.clockInfo

local function bindParamWidget(w)
  local path = w and w.config and w.config.paramPath or nil
  if type(path) ~= "string" or path == "" or not w.setValue then return end
  w._onChange = function(v)
    writeParam(path, v)
  end
end

local function relayoutManagedSubtree(widget, width, height)
  local runtime = widget and widget._structuredRuntime or nil
  local record = widget and widget._structuredRecord or nil
  if type(runtime) ~= "table" or type(runtime.notifyRecordHostedResized) ~= "function" or type(record) ~= "table" then
    return false
  end
  local ok = pcall(function()
    runtime:notifyRecordHostedResized(record, width, height)
  end)
  return ok == true
end

local function selectedDeviceIndex(ctx)
  return AVSD.Sources.selectedDeviceIndex(ctx)
end

local function refreshDevices(ctx)
  return AVSD.Sources.refreshDevices(ctx)
end

canonicalAspectSizeForSpec = function(ctx, spec, depth)
  return AVSD.Shaders.canonicalAspectSizeForSpec(ctx, spec, SHADER_DEPS, depth)
end

canonicalAspectSize = function(ctx)
  return AVSD.Shaders.canonicalAspectSize(ctx, SHADER_DEPS)
end

syncCanonicalSurfaceBounds = function(ctx)
  return AVSD.Shaders.syncCanonicalSurfaceBounds(ctx, SHADER_DEPS)
end

local function updateOutputAspect(ctx)
  return AVSD.Shaders.updateOutputAspect(ctx, SHADER_DEPS)
end

local function openWebcam(ctx)
  return AVSD.Sources.openWebcam(ctx, { updateOutputAspect = updateOutputAspect })
end

local function closeWebcam(ctx)
  return AVSD.Sources.closeWebcam(ctx)
end

local letterbox = U.letterbox

local function applyMapping(ctx)
  return AVSD.Mapping.apply(ctx, { profileStart = profileStart, profileEnd = profileEnd })
end

local cloneTable = U.cloneTable

local defaultMLSourceSpec = AVSD.Sources.defaultMLSourceSpec
materializeGeneratorParams = AVSD.Sources.materializeGeneratorParams
currentCol1SourceSpec = AVSD.Sources.currentCol1SourceSpec
sourceSpecForColumn = AVSD.Sources.sourceSpecForColumn
setSourceSpecForColumn = function(ctx, col, spec)
  return AVSD.Sources.setSourceSpecForColumn(ctx, col, spec, {
    writeParam = writeParam,
    setSelectedSilently = setSelectedSilently,
    syncShaderSourceParams = syncShaderSourceParams,
    updateOutputAspect = updateOutputAspect,
    updateShader = updateShader,
    colInit = AVSD.State.colInit,
    updateGridThumbnails = updateGridThumbnails,
  })
end
buildPoseSourcePayload = AVSD.Sources.buildPoseSourcePayload
applySourceSpecToHiddenNode = function(ctx, spec, key)
  return AVSD.Sources.applySourceSpecToHiddenNode(ctx, spec, key, {
    canonicalAspectSize = canonicalAspectSize,
    stackNodeIdForTap = stackNodeIdForTap,
  })
end

function updateShader(ctx)
  return AVSD.Shaders.updateShader(ctx, SHADER_DEPS)
end

local refreshShaderLists = AVSD.Sources.refreshShaderLists

local function syncModePanels(ctx)
  return AVSD.Runtime.syncModePanels(ctx)
end

local function syncShaderEditor(ctx)
  return AVSD.Shaders.syncShaderEditor(ctx)
end

local function syncParamsFromHost(ctx)
  return AVSD.Runtime.syncParamsFromHost(ctx, {
    profileStart = profileStart,
    profileEnd = profileEnd,
    setCaptureButtonAppearance = setCaptureButtonAppearance,
    currentCol1SourceSpec = currentCol1SourceSpec,
    syncShaderSourceParams = syncShaderSourceParams,
    syncShaderEditor = syncShaderEditor,
    updateShader = updateShader,
  })
end

local viewportSize = function()
  return AVSD.Layout.viewportSize({ toNum = toNum })
end
local projectContentBounds = function(ctx)
  return AVSD.Layout.projectContentBounds(ctx, { toNum = toNum })
end
local windowName = AVSD.Layout.windowName
local split = AVSD.Layout.split
local buildDeckLayout = AVSD.Layout.buildDeckLayout
local buildStageLayout = AVSD.Layout.buildStageLayout
local buildInspectorLayout = AVSD.Layout.buildInspectorLayout
local syncToolbarButtons = function(ctx)
  return AVSD.Layout.syncToolbarButtons(ctx, { setValueSilently = setValueSilently, setVisible = setVisible })
end
local defaultGridAlignment = AVSD.Layout.defaultGridAlignment
local setLayoutPreset = function(ctx, preset)
  return AVSD.Layout.setLayoutPreset(ctx, preset, { setValueSilently = setValueSilently, setVisible = setVisible })
end
local layoutToolbar = function(ctx)
  return AVSD.Layout.layoutToolbar(ctx, { setBounds = setBounds, setValueSilently = setValueSilently, setVisible = setVisible })
end

local function layoutTransportEmbed(ctx, w, h)
  return AVSD.Embeds.layoutTransportEmbed(ctx, w, h, EMBED_DEPS)
end

local function layoutPolyEmbed(ctx, w, h)
  return AVSD.Embeds.layoutPolyEmbed(ctx, w, h, EMBED_DEPS)
end

local function layoutSliceEmbed(ctx, w, h)
  return AVSD.Embeds.layoutSliceEmbed(ctx, w, h, EMBED_DEPS)
end

syncShaderSourceParams = function(ctx)
  return AVSD.Sources.syncShaderSourceParams(ctx, { sourceSpecForColumn = sourceSpecForColumn })
end

colSourceLabel = function(ctx, col)
  return AVSD.Sources.colSourceLabel(ctx, col)
end

colFxLabel = function(ctx, col, fxSlot)
  return AVSD.Sources.colFxLabel(ctx, col, fxSlot)
end

local function layoutSourceEmbed(ctx, w, h)
  return AVSD.Embeds.layoutSourceEmbed(ctx, w, h, EMBED_DEPS)
end

local function layoutEffectEmbed(ctx, w, h)
  return AVSD.Shaders.layoutEffectEmbed(ctx, w, h)
end

local function layoutMappingEmbed(ctx, w, h)
  return AVSD.Embeds.layoutMappingEmbed(ctx, w, h, EMBED_DEPS)
end

local function setDropdownOverlayRoot(dropdown, rootWidget)
  return AVSD.Embeds.setDropdownOverlayRoot(dropdown, rootWidget)
end

local function anchorFxComponentDropdowns(ctx)
  return AVSD.Embeds.anchorFxComponentDropdowns(ctx)
end

local function layoutFxEmbed(ctx, w, h)
  return AVSD.Embeds.layoutFxEmbed(ctx, w, h, EMBED_DEPS)
end

local function layoutInputsEmbed(ctx, w, h)
  return AVSD.Embeds.layoutInputsEmbed(ctx, w, h, EMBED_DEPS)
end

local function layoutWaveformEmbed(ctx, w, h)
  return AVSD.Embeds.layoutWaveformEmbed(ctx, w, h, EMBED_DEPS)
end

local function layoutStageEmbed(ctx, w, h)
  return AVSD.Embeds.layoutStageEmbed(ctx, w, h, EMBED_DEPS)
end

-- Grid Phase 3: selection bridge on top of the Phase 2 clip grid

local GRID_COLS = 4

local function selectedGridClip(ctx)
  return AVSD.Grid.selectedGridClip(ctx)
end

local function selectionSummary(ctx)
  return AVSD.Grid.selectionSummary(ctx)
end

local function selectGridCell(ctx, col, row)
  return AVSD.Grid.selectGridCell(ctx, col, row, {
    writeParam = writeParam,
    setSelectedSilently = setSelectedSilently,
    syncShaderEditor = syncShaderEditor,
  })
end

local function applySourceSelection(ctx, idx)
  return AVSD.Sources.applySourceSelection(ctx, idx, { setSourceSpecForColumn = setSourceSpecForColumn })
end

local function applyAspectModeSelection(ctx, idx)
  return AVSD.Sources.applyAspectModeSelection(ctx, idx, { updateOutputAspect = updateOutputAspect })
end

local function applyActiveLayerSelection(ctx, idx)
  return AVSD.Shaders.applyActiveLayerSelection(ctx, idx, { writeParam = writeParam })
end

local function applyShaderEnabledSelection(ctx, enabled)
  return AVSD.Shaders.applyShaderEnabledSelection(ctx, enabled, {
    writeParam = writeParam,
    updateShader = updateShader,
    updateGridThumbnails = updateGridThumbnails,
  })
end

local function applyEffectSelection(ctx, idx)
  return AVSD.Shaders.applyEffectSelection(ctx, idx, {
    writeParam = writeParam,
    updateShader = updateShader,
    updateGridThumbnails = updateGridThumbnails,
    syncShaderSourceParams = syncShaderSourceParams,
  })
end

local function applyShaderParamDisplay(ctx, p, displayValue)
  return AVSD.Shaders.applyShaderParamDisplay(ctx, p, displayValue, {
    writeParam = writeParam,
    updateShader = updateShader,
    updateGridThumbnails = updateGridThumbnails,
  })
end

local function applySourceParamDisplay(ctx, pi, displayValue)
  return AVSD.Sources.applySourceParamDisplay(ctx, pi, displayValue, {
    sourceSpecForColumn = sourceSpecForColumn,
    setSourceSpecForColumn = setSourceSpecForColumn,
    updateShader = updateShader,
    updateGridThumbnails = updateGridThumbnails,
  })
end

-- Column data model for the clip grid lives in behaviors/avsd/state.lua.

colSourceDescriptor = function(ctx, col)
  return AVSD.Shaders.colSourceDescriptor(ctx, col, SHADER_DEPS)
end

colBuildCellPipeline = function(ctx, col, row)
  return AVSD.Shaders.colBuildCellPipeline(ctx, col, row, SHADER_DEPS)
end

stackNodeIdForRow = function(stack, row)
  return AVSD.Shaders.stackNodeIdForRow(stack, row)
end

stackNodeIdForTap = function(stack, tapIndex)
  return AVSD.Shaders.stackNodeIdForTap(stack, tapIndex)
end

sourceSpecSignature = function(ctx, col)
  return AVSD.Shaders.sourceSpecSignature(ctx, col, SHADER_DEPS)
end

stackTapSignature = function(ctx, col, row)
  return AVSD.Shaders.stackTapSignature(ctx, col, row, SHADER_DEPS)
end

clearNodeSurface = function(node)
  return AVSD.Shaders.clearNodeSurface(node)
end

buildNodePassthroughPayload = function(sourceId)
  return AVSD.Shaders.buildNodePassthroughPayload(sourceId)
end

updateStackRenderNodes = function(ctx)
  return AVSD.Shaders.updateStackRenderNodes(ctx, SHADER_DEPS)
end

buildCompositorGraph = function(ctx)
  return AVSD.Shaders.buildCompositorGraph(ctx, SHADER_DEPS)
end

syncClipModel = function(ctx)
  return AVSD.Shaders.syncClipModel(ctx, SHADER_DEPS)
end

local function buildTapPipeline(ctx, col, tapIndex)
  return AVSD.Shaders.buildTapPipeline(ctx, col, tapIndex, SHADER_DEPS)
end

local function ensureGridCells(ctx)
  return AVSD.Grid.ensureGridCells(ctx, GRID_DEPS)
end

updateGridThumbnails = function(ctx)
  return AVSD.Grid.updateGridThumbnails(ctx, GRID_DEPS)
end

local function layoutClipGrid(ctx, w, h)
  return AVSD.Grid.layoutClipGrid(ctx, w, h, GRID_DEPS)
end

resetPanelDocks = function(ctx)
  return AVSD.Layout.resetPanelDocks(ctx)
end

local function panelSplit(t)
  return AVSD.Layout.panelSplit(t)
end

local function renderSourcesPanel(ctx)
  return AVSD.Layout.renderSourcesPanel(ctx, LAYOUT_DEPS)
end

local function renderStagePanel(ctx)
  return AVSD.Layout.renderStagePanel(ctx, LAYOUT_DEPS)
end

local function renderWaveformPanel(ctx)
  return AVSD.Layout.renderWaveformPanel(ctx, LAYOUT_DEPS)
end

local function renderEmbeddedPanel(ctx, widgetId, layoutFn, forcedHeight, fitToView)
  return AVSD.Embeds.renderEmbeddedPanel(ctx, widgetId, layoutFn, forcedHeight, fitToView)
end

local function renderSourceInspectorWindow(ctx)
  return AVSD.Params.renderSourceInspectorWindow(ctx, {
    colSourceLabel = colSourceLabel,
    colFxLabel = colFxLabel,
    setSourceSpecForColumn = setSourceSpecForColumn,
    defaultMLSourceSpec = defaultMLSourceSpec,
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutSourceEmbed = layoutSourceEmbed,
    clamp = clamp,
  })
end

layoutCompoLayerControls = function(ctx, w, h)
  return AVSD.Compositor.layoutCompoLayerControls(ctx, w, h, COMPO_DEPS)
end

renderCompositorLayerControls = function(ctx)
  return AVSD.Compositor.renderCompositorLayerControls(ctx, COMPO_DEPS)
end

local function renderEffectInspectorWindow(ctx)
  return AVSD.Params.renderEffectInspectorWindow(ctx, {
    colFxLabel = colFxLabel,
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutEffectEmbed = layoutEffectEmbed,
    renderCompositorLayerControls = renderCompositorLayerControls,
  })
end

local function renderParamTransportWindow(ctx)
  return AVSD.Params.renderParamTransportWindow(ctx, {
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutTransportEmbed = layoutTransportEmbed,
    layoutSliceEmbed = layoutSliceEmbed,
    layoutPolyEmbed = layoutPolyEmbed,
    round = round,
    readParam = readParam,
  })
end

local function renderParamMappingWindow(ctx)
  return AVSD.Params.renderParamMappingWindow(ctx, {
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutMappingEmbed = layoutMappingEmbed,
  })
end

local function renderParamFxWindow(ctx)
  return AVSD.Params.renderParamFxWindow(ctx, {
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutFxEmbed = layoutFxEmbed,
  })
end

local function renderParametersPanel(ctx)
  return AVSD.Params.renderParametersPanel(ctx, {
    panelSplit = panelSplit,
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutSourceEmbed = layoutSourceEmbed,
    layoutEffectEmbed = layoutEffectEmbed,
    layoutTransportEmbed = layoutTransportEmbed,
    layoutSliceEmbed = layoutSliceEmbed,
    layoutPolyEmbed = layoutPolyEmbed,
    layoutMappingEmbed = layoutMappingEmbed,
    layoutFxEmbed = layoutFxEmbed,
    colSourceLabel = colSourceLabel,
    colFxLabel = colFxLabel,
    setSourceSpecForColumn = setSourceSpecForColumn,
    defaultMLSourceSpec = defaultMLSourceSpec,
    renderCompositorLayerControls = renderCompositorLayerControls,
    clamp = clamp,
    round = round,
    readParam = readParam,
  })
end

local function renderGridToolbar(ctx, parentW)
  return AVSD.Grid.renderGridToolbar(ctx, parentW, GRID_DEPS)
end

local function renderDeckPanel(ctx)
  return AVSD.Grid.renderDeckPanel(ctx, GRID_DEPS)
end

ensureCompositorCells = function(ctx, parentNode)
  return AVSD.Compositor.ensureCompositorCells(ctx, parentNode)
end

compositorLayerCellPipeline = function(ctx, layer)
  return AVSD.Compositor.compositorLayerCellPipeline(ctx, layer, COMPO_DEPS)
end

updateCompositorThumbnails = function(ctx)
  return AVSD.Compositor.updateCompositorThumbnails(ctx, COMPO_DEPS)
end

updateCompositorOutput = function(ctx)
  return AVSD.Compositor.updateCompositorOutput(ctx, COMPO_DEPS)
end

renderCompositorPanel = function(ctx)
  return AVSD.Compositor.renderCompositorPanel(ctx, COMPO_DEPS)
end

local function renderPanel(ctx, win)
  return AVSD.Layout.renderPanel(ctx, win, LAYOUT_DEPS)
end

local function renderFrame(ctx)
  return AVSD.Layout.renderFrame(ctx, LAYOUT_DEPS)
end

function M.init(ctx)
  _G.__avsdCtx = ctx
  ctx.video = videoSampler and videoSampler.new and videoSampler.new({ id = VIDEO_SAMPLER_ID }) or nil
  ctx.videoCap = videoSampler and videoSampler.capture and videoSampler.capture({ id = VIDEO_CAPTURE_ID, maxSeconds = MAX_CAPTURE_SECONDS }) or nil
  ctx.seg = { gain = 1.0, useSigmoid = true, threshold = 0.5, feather = 0.15, invert = false }
  ctx.poseConf = 0.3
  ctx.showSkeleton = true
  ctx._polyPlaying, ctx._polyPos, ctx._slicePlaying, ctx._slicePos = {}, {}, {}, {}
  ctx._panelDocks = {}
  ctx._selectedSlice = math.max(1, math.min(MAX, round(readParam(NS .. "/selected_slice", 1))))
  ctx.shader = { sourceIndex = 1, activeLayer = 1, layers = {} }
  for i = 1, 8 do ctx.shader.layers[i] = { enabled = i == 1, effectIndex = 1, params = {0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5} } end
  ctx.captureMode = round(readParam(NS .. "/capture_mode", 0))
  ctx.captureRecording = false
  ctx.mappings = {}
  for i = 1, MAX_MAPPINGS do ctx.mappings[i] = AVSD.Mapping.defaultMapping(i) end
  ctx.fxSlot = 1
  ctx._layoutPreset = "deck"
  ctx.gridAlignment = "bottom-up"
  ctx.selection = { col = 1, row = 1 + ctx.shader.activeLayer }
  ctx.sourceSelectionCol = 1
  ctx._resizeMode = false
  ctx._dockTreeBuilt = false
  ctx._rebuildDockTree = false
  ctx.outputW = 1920
  ctx.outputH = 1080
  ctx.aspectMode = "16:9"
  ctx._colData = {}  -- column data model, populated by syncCol1FromShader on first grid render
  ctx.selectedView = "grid"  -- "grid" | "compositor"
  ctx.compositor = { orientation = "bottom-up", layers = {} }
  for i = 1, 4 do
    ctx.compositor.layers[i] = {
      sourceColumn = 1,
      tapIndex = nil,
      blendMode = "normal",
      opacity = i == 1 and 1.0 or 0.0,
      visible = i == 1,
      name = "Layer " .. i,
    }
  end
  ctx.compositorSelection = { layerIndex = 1 }
  AVSD.State.syncCol1FromShader(ctx, { cloneTable = cloneTable, currentCol1SourceSpec = currentCol1SourceSpec })
  SHADER_DEPS = {
    currentCol1SourceSpec = currentCol1SourceSpec,
    sourceSpecForColumn = sourceSpecForColumn,
    applySourceSpecToHiddenNode = applySourceSpecToHiddenNode,
    updateGridThumbnails = function(innerCtx) return updateGridThumbnails(innerCtx) end,
    colSourceLabel = colSourceLabel,
    syncCol1FromShader = function(innerCtx)
      return AVSD.State.syncCol1FromShader(innerCtx, { cloneTable = cloneTable, currentCol1SourceSpec = currentCol1SourceSpec })
    end,
    profileStart = profileStart,
    profileEnd = profileEnd,
    gridCols = GRID_COLS,
  }
  EMBED_DEPS = {
    setBounds = setBounds,
    setVisible = setVisible,
    relayoutManagedSubtree = relayoutManagedSubtree,
    layoutOutputRow = layoutOutputRow,
    updatePreviewSurface = updatePreviewSurface,
    syncShaderSourceParams = syncShaderSourceParams,
    currentCol1SourceSpec = currentCol1SourceSpec,
  }
  GRID_DEPS = {
    writeParam = writeParam,
    setSelectedSilently = setSelectedSilently,
    syncShaderEditor = syncShaderEditor,
    profileStart = profileStart,
    profileEnd = profileEnd,
    syncClipModel = syncClipModel,
    sourceSpecSignature = sourceSpecSignature,
    buildNodePassthroughPayload = buildNodePassthroughPayload,
    stackNodeIdForRow = stackNodeIdForRow,
    stackTapSignature = stackTapSignature,
    clearNodeSurface = clearNodeSurface,
    canonicalAspectSize = canonicalAspectSize,
    fitBox = fitBox,
    clamp = clamp,
    setBounds = setBounds,
    colSourceLabel = colSourceLabel,
    colFxLabel = colFxLabel,
    addColumn = AVSD.State.addColumn,
    removeColumn = AVSD.State.removeColumn,
    colAddFx = function(innerCtx, col, fxIndex)
      return AVSD.State.colAddFx(innerCtx, col, fxIndex, { NS = NS, writeParam = writeParam, updateShader = updateShader })
    end,
    colRemoveFx = function(innerCtx, col, row)
      return AVSD.State.colRemoveFx(innerCtx, col, row, { NS = NS, writeParam = writeParam, updateShader = updateShader })
    end,
  }
  LAYOUT_DEPS = {
    toNum = toNum,
    setBounds = setBounds,
    setValueSilently = setValueSilently,
    setVisible = setVisible,
    layoutInputsEmbed = layoutInputsEmbed,
    canonicalAspectSize = canonicalAspectSize,
    fitBox = fitBox,
    layoutOutputRow = layoutOutputRow,
    renderParametersPanel = renderParametersPanel,
    renderDeckPanel = renderDeckPanel,
    renderCompositorPanel = renderCompositorPanel,
    windowName = windowName,
    bor = bor,
  }
  COMPO_DEPS = {
    setBounds = setBounds,
    setVisible = setVisible,
    setOptions = setOptions,
    setSelectedSilently = setSelectedSilently,
    setValueSilently = setValueSilently,
    clamp = clamp,
    round = round,
    colSourceLabel = colSourceLabel,
    renderEmbeddedPanel = renderEmbeddedPanel,
    canonicalAspectSize = canonicalAspectSize,
    fitBox = fitBox,
    profileStart = profileStart,
    profileEnd = profileEnd,
    buildCompositorGraph = buildCompositorGraph,
    buildNodePassthroughPayload = buildNodePassthroughPayload,
    clearNodeSurface = clearNodeSurface,
    colBuildCellPipeline = colBuildCellPipeline,
    colSourceDescriptor = colSourceDescriptor,
  }

  AVSD.Initflow.run(ctx, {
    bindParamWidget = bindParamWidget,
    setVisible = setVisible,
    setDropdownOverlayRoot = setDropdownOverlayRoot,
    anchorFxComponentDropdowns = anchorFxComponentDropdowns,
    refreshShaderLists = refreshShaderLists,
    syncShaderEditor = syncShaderEditor,
    syncShaderSourceParams = syncShaderSourceParams,
    updateOutputAspect = updateOutputAspect,
    setSelectedSilently = setSelectedSilently,
    updateShader = updateShader,
    refreshDevices = refreshDevices,
    layoutToolbar = layoutToolbar,
    syncParamsFromHost = syncParamsFromHost,
    syncClipModel = syncClipModel,
    round = round,
    clamp = clamp,
    writeParam = writeParam,
    bump = bump,
    onCaptureButton = onCaptureButton,
    refreshWaveform = refreshWaveform,
    updatePreviewSurface = updatePreviewSurface,
    layoutOutputRow = layoutOutputRow,
    setLayoutPreset = setLayoutPreset,
    resetPanelDocks = resetPanelDocks,
    syncToolbarButtons = syncToolbarButtons,
    openWebcam = openWebcam,
    closeWebcam = closeWebcam,
    setCaptureButtonAppearance = setCaptureButtonAppearance,
    applySourceSelection = applySourceSelection,
    applyAspectModeSelection = applyAspectModeSelection,
    applyActiveLayerSelection = applyActiveLayerSelection,
    applyShaderEnabledSelection = applyShaderEnabledSelection,
    applyEffectSelection = applyEffectSelection,
    applyShaderParamDisplay = applyShaderParamDisplay,
    applySourceParamDisplay = applySourceParamDisplay,
    pathForSlice = pathForSlice,
    triggerPathForSlice = triggerPathForSlice,
    velocityPathForSlice = velocityPathForSlice,
    nearestSlice = nearestSlice,
  })

  AVSD.Testhooks.register(ctx, {
    syncParamsFromHost = syncParamsFromHost,
    applyVideoWindow = applyVideoWindow,
    updateOutputAspect = updateOutputAspect,
    refreshWaveform = refreshWaveform,
    updatePreviewSurface = updatePreviewSurface,
    layoutOutputRow = layoutOutputRow,
    ensureGridCells = ensureGridCells,
    syncShaderSourceParams = syncShaderSourceParams,
    updateGridThumbnails = updateGridThumbnails,
    updateCompositorThumbnails = updateCompositorThumbnails,
    updateCompositorOutput = updateCompositorOutput,
    setLayoutPreset = setLayoutPreset,
    sourceSpecForColumn = sourceSpecForColumn,
    buildCompositorGraph = buildCompositorGraph,
    selectedGridClip = selectedGridClip,
    selectionSummary = selectionSummary,
    selectedDeviceIndex = selectedDeviceIndex,
    rackFxTypePath = rackFxTypePath,
    rackFxMixPath = rackFxMixPath,
    rackFxParamPath = rackFxParamPath,
    pathForSlice = pathForSlice,
    polyPaths = POLY_PATHS,
    slicePaths = SLICE_PATHS,
    stackTapSignature = stackTapSignature,
    sourceSpecSignature = sourceSpecSignature,
    colSourceLabel = colSourceLabel,
    compositorLayerCellPipeline = compositorLayerCellPipeline,
    addColumn = AVSD.State.addColumn,
    removeColumn = AVSD.State.removeColumn,
    colAddFx = function(innerCtx, col, fxIndex)
      return AVSD.State.colAddFx(innerCtx, col, fxIndex, { NS = NS, writeParam = writeParam, updateShader = updateShader })
    end,
    colRemoveFx = function(innerCtx, col, row)
      return AVSD.State.colRemoveFx(innerCtx, col, row, { NS = NS, writeParam = writeParam, updateShader = updateShader })
    end,
    setSourceSpecForColumn = setSourceSpecForColumn,
    selectGridCell = selectGridCell,
    doRetroCapture = doRetroCapture,
  })

  _G.__avsdDockInstanceCounter = (type(_G.__avsdDockInstanceCounter) == "number" and _G.__avsdDockInstanceCounter or 0) + 1
  local t = (type(getTime) == "function" and getTime()) or 0
  ctx._dockSuffix = tostring(math.floor(t * 1000000)) .. "_" .. tostring(_G.__avsdDockInstanceCounter)

  refreshWaveform(ctx)
  updatePreviewSurface(ctx)
  layoutOutputRow(ctx)

  if ctx.root and ctx.root.node and ctx.root.node.setOnImGuiFrame then
    ctx.root.node:setOnImGuiFrame(function() renderFrame(ctx) end)
  end

  -- Expose profiling data for IPC EVAL queries (globals, no locals consumed)
  _G.__avsdProfile = function()
    local out = {}
    local p = ctx._profile
    if not p then return "no profile data" end
    local keys = {"updateShader","updateGridThumbnails","syncParamsFromHost","runPose","applyMapping","syncClipModel","ensureGridCells","pollMidi","bindInputSurfaces","colBuildCellPipeline","buildTapPipeline","applyCaptureWindow","segmentIngest","playbackUi","statusInterval"}
    for _, k in ipairs(keys) do
      local t = p[k]
      if t and t.count > 0 then
        table.insert(out, string.format("%-24s last=%8.0fus avg=%8.0fus max=%8.0fus count=%d",
          k, t.last, t.avg, t.max, t.count))
      end
    end
    return table.concat(out, "\n")
  end

  -- Init grid
  ensureGridCells(ctx)
  updateGridThumbnails(ctx)
end

function M.resized(ctx)
  return AVSD.Runtime.resized(ctx, {
    layoutToolbar = layoutToolbar,
    refreshWaveform = refreshWaveform,
    updatePreviewSurface = updatePreviewSurface,
    layoutOutputRow = layoutOutputRow,
  })
end

function M.update(ctx)
  return AVSD.Runtime.update(ctx, {
    profileStart = profileStart,
    profileEnd = profileEnd,
    applyCaptureWindow = applyCaptureWindow,
    syncParamsFromHost = syncParamsFromHost,
    applyMapping = applyMapping,
    samplePosition = samplePosition,
    polyPaths = POLY_PATHS,
    slicePaths = SLICE_PATHS,
    pathForSlice = pathForSlice,
    layoutOutputRow = layoutOutputRow,
    updatePreviewSurface = updatePreviewSurface,
    refreshWaveform = refreshWaveform,
    rackFxTypePath = rackFxTypePath,
    rackFxMixPath = rackFxMixPath,
    updateCompositorThumbnails = updateCompositorThumbnails,
    updateCompositorOutput = updateCompositorOutput,
  })
end

function M.cleanup(ctx)
  AVSD.Testhooks.unregister(ctx)
  return AVSD.Runtime.cleanup(ctx, {
    videoSamplerId = VIDEO_SAMPLER_ID,
    videoCaptureId = VIDEO_CAPTURE_ID,
  })
end

return M
